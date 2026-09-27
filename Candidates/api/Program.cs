using System.Text.RegularExpressions;
using Lhs.Candidates.Api.Data;
using Lhs.Candidates.Api.Infrastructure;
using Lhs.Candidates.Api.Models;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

var dbOptions = builder.Configuration.GetSection("Database").Get<DatabaseOptions>() ?? new DatabaseOptions();
if (string.IsNullOrWhiteSpace(dbOptions.ConnectionString))
    throw new InvalidOperationException("Database:ConnectionString is not configured.");

builder.Services.ConfigureHttpJsonOptions(o => JsonSetup.Configure(o.SerializerOptions));
builder.Services.AddHttpContextAccessor();
builder.Services.AddProblemDetails();
builder.Services.AddSingleton(dbOptions);
builder.Services.AddSingleton<BankCrypto>();
builder.Services.AddScoped<CurrentUser>();
builder.Services.AddScoped<Db>();
builder.Services.AddScoped<CandidateRepository>();
builder.Services.AddScoped<QuestionnaireRepository>();

var app = builder.Build();
_ = app.Services.GetRequiredService<BankCrypto>(); // fail at startup, not on first use, if the key is missing

app.UseMiddleware<ErrorHandlingMiddleware>();
app.Use(async (ctx, next) =>
{
    ctx.Response.Headers.XContentTypeOptions = "nosniff";
    ctx.Response.Headers["Referrer-Policy"] = "no-referrer";
    await next();
});

// ---------- SPA: serve only index.html, css/ and js/ from the Candidates folder (never api/ or database/) ----------
var spaRoot = Path.GetFullPath(Path.Combine(builder.Environment.ContentRootPath, builder.Configuration["Spa:Root"] ?? ".."));
var spaFiles = new PhysicalFileProvider(spaRoot);
static bool IsSpaPath(PathString p) =>
    p.Value is "/" or "/index.html" || p.StartsWithSegments("/css") || p.StartsWithSegments("/js");

// Static files are only ever served for SPA paths, so /api/... can never fall through to files in the api folder.
app.UseWhen(ctx => IsSpaPath(ctx.Request.Path), spa =>
{
    spa.Use(async (ctx, next) => { ctx.Response.Headers.CacheControl = "no-cache"; await next(); });
    spa.UseDefaultFiles(new DefaultFilesOptions { FileProvider = spaFiles });
    spa.UseStaticFiles(new StaticFileOptions { FileProvider = spaFiles });
});
app.Use(async (ctx, next) =>
{
    if (!IsSpaPath(ctx.Request.Path) && !ctx.Request.Path.StartsWithSegments("/api")) { ctx.Response.StatusCode = 404; return; }
    await next();
});

// ---------- API ----------
var api = app.MapGroup("/api");

api.MapGet("/health", async (Db db) =>
{
    await using var lease = await db.OpenAsync();
    return Results.Ok(new { status = "ok", database = lease.Connection.Database });
});

// Candidates (req 3.1.1 – 3.1.5)
api.MapGet("/candidates", async (Db db, CandidateRepository repo) =>
{
    await using var lease = await db.OpenAsync();
    return Results.Ok(await repo.ListAsync(lease));
});

api.MapGet("/candidates/{id:guid}", async (Guid id, Db db, CandidateRepository repo) =>
{
    await using var lease = await db.OpenAsync();
    return Results.Ok(await repo.GetRequiredAsync(lease, id));
});

api.MapPost("/candidates", async (SaveCandidateRequest req, Db db, CandidateRepository repo) =>
{
    await using var lease = await db.OpenAsync();
    var saved = await repo.CreateAsync(lease, req.Candidate ?? throw ApiException.BadRequest("Candidate is required."), req.Audit);
    return Results.Created($"/api/candidates/{saved.Id}", saved);
});

api.MapPut("/candidates/{id:guid}", async (Guid id, SaveCandidateRequest req, Db db, CandidateRepository repo) =>
{
    await using var lease = await db.OpenAsync();
    return Results.Ok(await repo.UpdateAsync(lease, id, req.Candidate ?? throw ApiException.BadRequest("Candidate is required."), req.Audit));
});

api.MapPost("/candidates/{id:guid}/status", async (Guid id, StatusChangeRequest req, Db db, CandidateRepository repo) =>
{
    await using var lease = await db.OpenAsync();
    return Results.Ok(await repo.ChangeStatusAsync(lease, id, req));
});

api.MapGet("/candidates/{id:guid}/gate-issues", async (Guid id, string to, Db db, CandidateRepository repo) =>
{
    await using var lease = await db.OpenAsync();
    return Results.Ok(await repo.GateIssuesAsync(lease, id, to));
});

api.MapPost("/candidates/{id:guid}/erase", async (Guid id, EraseRequest req, Db db, CandidateRepository repo) =>
{
    await using var lease = await db.OpenAsync();
    await repo.EraseAsync(lease, id, req.Reason);
    return Results.NoContent();
});

api.MapPost("/candidates/{id:guid}/merge", async (Guid id, MergeRequest req, Db db, CandidateRepository repo) =>
{
    await using var lease = await db.OpenAsync();
    return Results.Ok(await repo.MergeAsync(lease, id, req.SecondaryId));
});

// Bank details: encrypted here, never returned except through the audited reveal endpoint.
var bsbPattern = new Regex(@"^\d{3}-?\d{3}$");
var accountPattern = new Regex(@"^\d{5,10}$");

api.MapPut("/candidates/{id:guid}/bank", async (Guid id, BankDetails req, Db db, CandidateRepository repo, BankCrypto crypto) =>
{
    var (name, bsb, account) = (req.AccountName?.Trim() ?? "", req.Bsb?.Trim() ?? "", req.Account?.Trim() ?? "");
    if (name.Length == 0) throw ApiException.BadRequest("Account name is required.");
    if (!bsbPattern.IsMatch(bsb)) throw ApiException.BadRequest("BSB must be 6 digits.");
    if (!accountPattern.IsMatch(account)) throw ApiException.BadRequest("Account number must be 5–10 digits.");
    var details = new BankDetails(name, bsb.Replace("-", ""), account);
    var (nonce, cipher) = crypto.Encrypt(details);
    await using var lease = await db.OpenAsync();
    return Results.Ok(await repo.SaveBankAsync(lease, id, nonce, cipher, details.Account[^4..]));
});

api.MapGet("/candidates/{id:guid}/bank", async (Guid id, Db db, CandidateRepository repo, BankCrypto crypto) =>
{
    await using var lease = await db.OpenAsync();
    var stored = await repo.GetBankCipherAsync(lease, id) ?? throw ApiException.NotFound("Bank details");
    await CandidateRepository.WriteAuditAsync(lease, "Revealed bank details", id, null);
    return Results.Ok(crypto.Decrypt(stored.Nonce, stored.Cipher));
});

// Audit log (req 3.10.2)
api.MapGet("/audit", async (Guid? candidateId, int? take, Db db, CandidateRepository repo) =>
{
    await using var lease = await db.OpenAsync();
    return Results.Ok(await repo.AuditAsync(lease, candidateId, Math.Clamp(take ?? 500, 1, 5000)));
});

api.MapPost("/audit", async (AuditRequest req, Db db) =>
{
    if (string.IsNullOrWhiteSpace(req.Action)) throw ApiException.BadRequest("Action is required.");
    await using var lease = await db.OpenAsync();
    await CandidateRepository.WriteAuditAsync(lease, req.Action.Trim(), req.CandidateId, req.Details);
    return Results.NoContent();
});

// Screening questionnaires (req 3.1.2)
api.MapGet("/questionnaires", async (Db db, QuestionnaireRepository repo) =>
{
    await using var lease = await db.OpenAsync();
    return Results.Ok(await repo.ListAsync(lease));
});

api.MapPut("/questionnaires/{id:guid}", async (Guid id, QuestionnaireDoc q, Db db, QuestionnaireRepository repo) =>
{
    await using var lease = await db.OpenAsync();
    return Results.Ok(await repo.SaveAsync(lease, id, q));
});

api.MapDelete("/questionnaires/{id:guid}", async (Guid id, Db db, QuestionnaireRepository repo) =>
{
    await using var lease = await db.OpenAsync();
    await repo.DeleteAsync(lease, id);
    return Results.NoContent();
});

app.Run();
