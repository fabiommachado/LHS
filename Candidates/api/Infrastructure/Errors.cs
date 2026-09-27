using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;

namespace Lhs.Candidates.Api.Infrastructure;

public sealed class ApiException(int status, string message) : Exception(message)
{
    public int Status { get; } = status;
    public static ApiException NotFound(string what = "Candidate") => new(StatusCodes.Status404NotFound, $"{what} not found.");
    public static ApiException BadRequest(string message) => new(StatusCodes.Status400BadRequest, message);
    public static ApiException Conflict(string message) => new(StatusCodes.Status409Conflict, message);
}

/// <summary>Turns known failures into RFC 7807 problem responses with messages the SPA can show as-is.</summary>
public sealed partial class ErrorHandlingMiddleware(RequestDelegate next, ILogger<ErrorHandlingMiddleware> logger)
{
    // Database rule → message for the user. Keep in step with the CHECK constraints in database/02_tables.sql.
    private static readonly Dictionary<string, string> ConstraintMessages = new(StringComparer.OrdinalIgnoreCase)
    {
        ["CK_Candidate_Name"] = "First and last name are required.",
        ["CK_Candidate_Contact"] = "Provide at least one contact method: email, phone or LinkedIn URL.",
        ["CK_Candidate_Email"] = "Email address is not valid.",
        ["CK_Candidate_Abn"] = "ABN fails the ATO checksum. Check the 11 digits.",
        ["CK_Candidate_ClearanceExpiry"] = "Enter the clearance revalidation/expiry date.",
        ["CK_Candidate_VisaExpiry"] = "Visa expiry is required for visa holders.",
        ["CK_Candidate_LinkedInUrl"] = "LinkedIn URL should be a linkedin.com profile link.",
        ["CK_Candidate_Consent"] = "Record the date and method of consent.",
        ["CK_Candidate_SalaryAmount"] = "Rate or salary can't be negative.",
        ["CK_CandidateReference_Response"] = "Enter the referee's response before marking a reference as received.",
        ["CK_CandidateOnboarding_Signed"] = "A signed agreement needs a signed date.",
        ["FK_Candidate_SourceChannel"] = "Unknown candidate source.",
        ["FK_CandidateDocument_Type"] = "Unknown document type.",
        ["FK_CandidateInduction_Type"] = "Unknown induction type.",
        ["FK_Screening_Questionnaire"] = "The screening refers to a questionnaire that no longer exists.",
    };

    public async Task InvokeAsync(HttpContext ctx)
    {
        try
        {
            await next(ctx);
        }
        catch (ApiException ex)
        {
            await WriteProblem(ctx, ex.Status, ex.Message);
        }
        catch (SqlException ex) when (ex.Number == 50001)
        {
            await WriteProblem(ctx, StatusCodes.Status404NotFound, ex.Message);
        }
        catch (SqlException ex) when (ex.Number is > 50001 and < 51000)
        {
            // Business rules raised by the stored procedures (workflow gates, missing reasons, ...).
            await WriteProblem(ctx, StatusCodes.Status422UnprocessableEntity, ex.Message);
        }
        catch (SqlException ex) when (ex.Number == 547)
        {
            var name = ConstraintName().Match(ex.Message).Groups[1].Value;
            var message = ConstraintMessages.TryGetValue(name, out var m) ? m : $"The data breaks a database rule ({name}).";
            await WriteProblem(ctx, StatusCodes.Status400BadRequest, message);
        }
        catch (SqlException ex) when (ex.Number is 2627 or 2601)
        {
            await WriteProblem(ctx, StatusCodes.Status409Conflict, "A record with the same key already exists (for example a duplicate skill or role type).");
        }
        catch (SqlException ex) when (ex.Number is 229 or 230)
        {
            logger.LogError(ex, "Permission denied in database");
            await WriteProblem(ctx, StatusCodes.Status403Forbidden, "The API isn't permitted to do that in the database.");
        }
        catch (JsonException ex)
        {
            await WriteProblem(ctx, StatusCodes.Status400BadRequest, $"Invalid request body: {ex.Message}");
        }
        catch (BadHttpRequestException ex)
        {
            await WriteProblem(ctx, ex.StatusCode, ex.InnerException is JsonException je ? $"Invalid request body: {je.Message}" : ex.Message);
        }
    }

    private static Task WriteProblem(HttpContext ctx, int status, string detail)
    {
        if (ctx.Response.HasStarted) return Task.CompletedTask;
        ctx.Response.Clear();
        ctx.Response.StatusCode = status;
        return Results.Problem(detail: detail, statusCode: status).ExecuteAsync(ctx);
    }

    [GeneratedRegex("constraint \"([^\"]+)\"")]
    private static partial Regex ConstraintName();
}
