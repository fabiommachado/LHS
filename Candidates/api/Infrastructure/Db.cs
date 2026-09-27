using System.Data;
using System.Text.RegularExpressions;
using Dapper;
using Microsoft.Data.SqlClient;

namespace Lhs.Candidates.Api.Infrastructure;

public sealed class DatabaseOptions
{
    public string ConnectionString { get; set; } = "";
    /// <summary>
    /// Database user to run as (EXECUTE AS USER). Lets the API connect with a privileged Windows identity in development
    /// while every statement is still limited to the candidates_app role. Leave empty when the login itself is least-privileged.
    /// </summary>
    public string? ImpersonateUser { get; set; }
}

/// <summary>Acting user for the request. Simulated sign-in until Module 10 (SSO/MFA) exists: taken from the X-LHS-User header.</summary>
public sealed class CurrentUser(IHttpContextAccessor accessor)
{
    public string Name
    {
        get
        {
            var raw = accessor.HttpContext?.Request.Headers["X-LHS-User"].ToString();
            var name = string.IsNullOrWhiteSpace(raw) ? "Anonymous" : Uri.UnescapeDataString(raw).Trim();
            return name.Length > 150 ? name[..150] : name;
        }
    }
}

/// <summary>
/// Opens connections for a request: sets SESSION_CONTEXT('UserName') for the database triggers, then switches to the
/// least-privileged database user. Dispose to switch back before the connection returns to the pool.
/// </summary>
public sealed partial class Db(DatabaseOptions options, CurrentUser user)
{
    public async Task<DbLease> OpenAsync(CancellationToken ct = default)
    {
        var cn = new SqlConnection(options.ConnectionString);
        await cn.OpenAsync(ct);
        try
        {
            await cn.ExecuteAsync("EXEC sp_set_session_context @key = N'UserName', @value = @User;", new { User = user.Name });
            byte[]? cookie = null;
            if (!string.IsNullOrWhiteSpace(options.ImpersonateUser))
            {
                if (!Identifier().IsMatch(options.ImpersonateUser)) throw new InvalidOperationException("Database:ImpersonateUser is not a valid user name.");
                // Parameterless batch on purpose: EXECUTE AS inside sp_executesql would revert when that scope ends.
                cookie = await cn.ExecuteScalarAsync<byte[]>(
                    $"DECLARE @cookie VARBINARY(8000); EXECUTE AS USER = N'{options.ImpersonateUser}' WITH COOKIE INTO @cookie; SELECT @cookie;");
            }
            return new DbLease(cn, cookie, user.Name);
        }
        catch
        {
            await cn.DisposeAsync();
            throw;
        }
    }

    [GeneratedRegex("^[A-Za-z_][A-Za-z0-9_]{0,127}$")]
    private static partial Regex Identifier();
}

public sealed class DbLease(SqlConnection connection, byte[]? cookie, string userName) : IAsyncDisposable
{
    public SqlConnection Connection { get; } = connection;
    public string UserName { get; } = userName;

    public async Task<T> InTransactionAsync<T>(Func<IDbTransaction, Task<T>> work)
    {
        await using var tx = await Connection.BeginTransactionAsync(IsolationLevel.ReadCommitted);
        try
        {
            var result = await work((IDbTransaction)tx);
            await tx.CommitAsync();
            return result;
        }
        catch
        {
            if (tx.Connection is not null) await tx.RollbackAsync();
            throw;
        }
    }

    public Task InTransactionAsync(Func<IDbTransaction, Task> work) =>
        InTransactionAsync<bool>(async tx => { await work(tx); return true; });

    public async ValueTask DisposeAsync()
    {
        try
        {
            if (cookie is not null && Connection.State == ConnectionState.Open)
                await Connection.ExecuteAsync($"REVERT WITH COOKIE = 0x{Convert.ToHexString(cookie)};");
        }
        catch
        {
            // Never hand an impersonated connection back to the pool.
            SqlConnection.ClearPool(Connection);
        }
        await Connection.DisposeAsync();
    }
}
