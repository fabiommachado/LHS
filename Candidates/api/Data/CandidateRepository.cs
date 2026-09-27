using System.Data;
using Dapper;
using Lhs.Candidates.Api.Infrastructure;
using Lhs.Candidates.Api.Models;

namespace Lhs.Candidates.Api.Data;

/// <summary>
/// Maps the SPA's candidate document to the normalised candidates.* tables.
/// Scalar fields are updated in place with a rowversion check; child collections are replaced as a whole inside one transaction.
/// Status, status history, erasure and merge are owned by the database procedures and are never written here directly.
/// </summary>
public sealed class CandidateRepository
{
    // ---------- Reads ----------

    private const string LoadSql = """
        DECLARE @ids TABLE (CandidateId UNIQUEIDENTIFIER PRIMARY KEY);
        INSERT @ids SELECT CandidateId FROM candidates.Candidate WHERE IsErased = 0 AND (@Id IS NULL OR CandidateId = @Id);

        SELECT c.CandidateId, c.StatusCode, c.FirstName, c.LastName, c.Email, c.Phone, c.Location, c.CurrentEmployer, c.CurrentTitle,
               c.Abn, c.AvailabilityDate, c.SalaryBasis, c.SalaryAmount, c.ClearanceLevel, c.ClearanceExpiry, c.ClearanceIssuingAgency,
               c.ClearanceVerification, c.WorkRights, c.VisaType, c.VisaExpiry, c.VisaRestrictions, c.SourceChannelCode, c.SourceDetail,
               c.LinkedInUrl, c.LinkedInOutreachStatus, c.ConsentGiven, c.ConsentDate, c.ConsentMethod, c.CollectionNoticeProvided,
               c.Notes, c.CreatedAt, c.UpdatedAt, c.RowVer
        FROM candidates.Candidate c JOIN @ids i ON i.CandidateId = c.CandidateId;

        SELECT x.CandidateId, x.SkillName, x.YearsExperience FROM candidates.CandidateSkill x JOIN @ids i ON i.CandidateId = x.CandidateId;
        SELECT x.CandidateId, x.CertificationId, x.CertificationName, x.Issuer, x.ExpiryDate FROM candidates.CandidateCertification x JOIN @ids i ON i.CandidateId = x.CandidateId;
        SELECT x.CandidateId, x.OutreachId, x.OutreachDate, x.Channel, x.OutreachStatus, x.Note FROM candidates.OutreachLog x JOIN @ids i ON i.CandidateId = x.CandidateId ORDER BY x.OutreachDate;
        SELECT x.CandidateId, x.ScreeningId, x.QuestionnaireId, x.ScreeningDate, x.RoleType, x.CallNotes, x.Outcome, x.RecordedBy FROM candidates.Screening x JOIN @ids i ON i.CandidateId = x.CandidateId ORDER BY x.ScreeningDate, x.CreatedAt;
        SELECT a.ScreeningId, a.Sequence, a.QuestionText, a.AnswerText FROM candidates.ScreeningAnswer a JOIN candidates.Screening s ON s.ScreeningId = a.ScreeningId JOIN @ids i ON i.CandidateId = s.CandidateId ORDER BY a.Sequence;
        SELECT r.ScreeningId, r.SkillName, r.Weight, r.Rating FROM candidates.ScreeningSkillRating r JOIN candidates.Screening s ON s.ScreeningId = r.ScreeningId JOIN @ids i ON i.CandidateId = s.CandidateId;
        SELECT x.CandidateId, x.ReferenceId, x.RefereeName, x.Organisation, x.Relationship, x.Email, x.Phone, x.RequestedDate, x.ReferenceStatus, x.ResponseText FROM candidates.CandidateReference x JOIN @ids i ON i.CandidateId = x.CandidateId;
        SELECT x.CandidateId, x.CheckType, x.IsApplicable, x.CheckStatus, x.CheckDate, x.ExpiryDate, x.RegistrationNumber FROM candidates.BackgroundCheck x JOIN @ids i ON i.CandidateId = x.CandidateId;
        SELECT x.CandidateId, x.DocumentId, x.DocumentTypeCode, x.Description, x.FileName, x.FileSizeBytes, x.ExpiryDate, x.UploadedAt, x.UploadedBy FROM candidates.CandidateDocument x JOIN @ids i ON i.CandidateId = x.CandidateId ORDER BY x.UploadedAt;
        SELECT x.CandidateId, x.InductionTypeCode, x.CompletedDate, x.Notes FROM candidates.CandidateInduction x JOIN @ids i ON i.CandidateId = x.CandidateId;
        SELECT x.CandidateId, x.SuperFundName, x.SuperMemberNumber, x.SuperUsi, x.AgreementStatus, x.AgreementGeneratedOn, x.AgreementSentOn, x.AgreementSignedOn FROM candidates.CandidateOnboarding x JOIN @ids i ON i.CandidateId = x.CandidateId;
        SELECT x.CandidateId, x.AccountLast4, x.UpdatedAt FROM candidates.CandidateBankDetail x JOIN @ids i ON i.CandidateId = x.CandidateId;
        SELECT x.CandidateId, x.StatusHistoryId, x.FromStatus, x.ToStatus, x.ChangedAt, x.ChangedBy, x.Reason FROM candidates.StatusHistory x JOIN @ids i ON i.CandidateId = x.CandidateId ORDER BY x.ChangedAt;
        """;

    public async Task<List<CandidateDoc>> ListAsync(DbLease lease, IDbTransaction? tx = null) => await LoadAsync(lease, null, tx);

    public async Task<CandidateDoc?> GetAsync(DbLease lease, Guid id, IDbTransaction? tx = null) =>
        (await LoadAsync(lease, id, tx)).FirstOrDefault();

    public async Task<CandidateDoc> GetRequiredAsync(DbLease lease, Guid id) =>
        await GetAsync(lease, id) ?? throw ApiException.NotFound();

    private static async Task<List<CandidateDoc>> LoadAsync(DbLease lease, Guid? id, IDbTransaction? tx)
    {
        using var grid = await lease.Connection.QueryMultipleAsync(LoadSql, new { Id = id }, tx);
        var rows = (await grid.ReadAsync<CandidateRow>()).ToList();
        var skills = (await grid.ReadAsync<SkillRow>()).ToLookup(x => x.CandidateId);
        var certs = (await grid.ReadAsync<CertificationRow>()).ToLookup(x => x.CandidateId);
        var outreach = (await grid.ReadAsync<OutreachRow>()).ToLookup(x => x.CandidateId);
        var screenings = (await grid.ReadAsync<ScreeningRow>()).ToLookup(x => x.CandidateId);
        var answers = (await grid.ReadAsync<AnswerRow>()).ToLookup(x => x.ScreeningId);
        var ratings = (await grid.ReadAsync<RatingRow>()).ToLookup(x => x.ScreeningId);
        var references = (await grid.ReadAsync<ReferenceRow>()).ToLookup(x => x.CandidateId);
        var checks = (await grid.ReadAsync<CheckRow>()).ToLookup(x => x.CandidateId);
        var documents = (await grid.ReadAsync<DocumentRow>()).ToLookup(x => x.CandidateId);
        var inductions = (await grid.ReadAsync<InductionRow>()).ToLookup(x => x.CandidateId);
        var onboarding = (await grid.ReadAsync<OnboardingRow>()).ToDictionary(x => x.CandidateId);
        var banks = (await grid.ReadAsync<BankRow>()).ToDictionary(x => x.CandidateId);
        var history = (await grid.ReadAsync<HistoryRow>()).ToLookup(x => x.CandidateId);

        return rows.Select(r =>
        {
            var police = checks[r.CandidateId].FirstOrDefault(x => x.CheckType == "Police");
            var wwvp = checks[r.CandidateId].FirstOrDefault(x => x.CheckType == "WWVP");
            onboarding.TryGetValue(r.CandidateId, out var ob);
            banks.TryGetValue(r.CandidateId, out var bank);
            return new CandidateDoc
            {
                Id = r.CandidateId,
                Version = Convert.ToBase64String(r.RowVer),
                CreatedAt = r.CreatedAt,
                UpdatedAt = r.UpdatedAt,
                Status = r.StatusCode,
                FirstName = r.FirstName, LastName = r.LastName, Email = r.Email, Phone = r.Phone, Location = r.Location,
                CurrentEmployer = r.CurrentEmployer, CurrentTitle = r.CurrentTitle, Abn = r.Abn, Notes = r.Notes,
                AvailabilityDate = D(r.AvailabilityDate),
                Salary = new SalaryDoc { Basis = r.SalaryBasis, Amount = r.SalaryAmount },
                Clearance = new ClearanceDoc { Level = r.ClearanceLevel, Expiry = D(r.ClearanceExpiry), IssuingAgency = r.ClearanceIssuingAgency, Verification = r.ClearanceVerification },
                Visa = new VisaDoc { WorkRights = r.WorkRights, Type = r.VisaType, Expiry = D(r.VisaExpiry), Restrictions = r.VisaRestrictions },
                Source = new SourceDoc { Channel = r.SourceChannelCode, Detail = r.SourceDetail },
                Linkedin = new LinkedInDoc { Url = r.LinkedInUrl, OutreachStatus = r.LinkedInOutreachStatus },
                Consent = new ConsentDoc { Given = r.ConsentGiven, Date = D(r.ConsentDate), Method = r.ConsentMethod, CollectionNoticeProvided = r.CollectionNoticeProvided },
                Skills = skills[r.CandidateId].OrderByDescending(s => s.YearsExperience ?? 0).Select(s => new SkillDoc { Name = s.SkillName, Years = s.YearsExperience }).ToList(),
                Certifications = certs[r.CandidateId].Select(x => new CertificationDoc { Id = x.CertificationId, Name = x.CertificationName, Issuer = x.Issuer, Expiry = D(x.ExpiryDate) }).ToList(),
                OutreachLog = outreach[r.CandidateId].Select(x => new OutreachDoc { Id = x.OutreachId, Date = D(x.OutreachDate), Channel = x.Channel, Status = x.OutreachStatus, Note = x.Note }).ToList(),
                Screenings = screenings[r.CandidateId].Select(s => new ScreeningDoc
                {
                    Id = s.ScreeningId, Date = D(s.ScreeningDate), QuestionnaireId = s.QuestionnaireId, RoleType = s.RoleType,
                    Notes = s.CallNotes, Outcome = s.Outcome, RecordedBy = s.RecordedBy,
                    Answers = answers[s.ScreeningId].Select(a => new AnswerDoc { Question = a.QuestionText, Answer = a.AnswerText }).ToList(),
                    Ratings = ratings[s.ScreeningId].Select(x => new RatingDoc { Skill = x.SkillName, Weight = x.Weight, Rating = x.Rating }).ToList(),
                }).ToList(),
                References = references[r.CandidateId].Select(x => new ReferenceDoc
                {
                    Id = x.ReferenceId, Name = x.RefereeName, Company = x.Organisation, Relationship = x.Relationship, Email = x.Email, Phone = x.Phone,
                    RequestedDate = D(x.RequestedDate), Status = x.ReferenceStatus, Response = x.ResponseText,
                }).ToList(),
                Checks = new ChecksDoc
                {
                    Police = new PoliceCheckDoc { Status = police?.CheckStatus ?? "Not started", Date = D(police?.CheckDate), Expiry = D(police?.ExpiryDate) },
                    Wwvp = new WwvpCheckDoc { Applicable = wwvp?.IsApplicable ?? false, Status = wwvp?.CheckStatus ?? "Not started", Number = wwvp?.RegistrationNumber, Expiry = D(wwvp?.ExpiryDate) },
                },
                Documents = documents[r.CandidateId].Select(x => new DocumentDoc
                {
                    Id = x.DocumentId, Type = x.DocumentTypeCode, Name = x.Description, FileName = x.FileName, Size = x.FileSizeBytes,
                    Expiry = D(x.ExpiryDate), UploadedAt = x.UploadedAt, UploadedBy = x.UploadedBy,
                }).ToList(),
                Inductions = inductions[r.CandidateId].Select(x => new InductionDoc { Type = x.InductionTypeCode, CompletedDate = D(x.CompletedDate), Notes = x.Notes }).ToList(),
                Onboarding = new OnboardingDoc
                {
                    Bank = bank is null ? null : new BankSummaryDoc { Last4 = bank.AccountLast4, UpdatedAt = bank.UpdatedAt },
                    Super = new SuperDoc { FundName = ob?.SuperFundName, MemberNumber = ob?.SuperMemberNumber, Usi = ob?.SuperUsi },
                    Agreement = new AgreementDoc
                    {
                        Status = ob?.AgreementStatus ?? "Not generated",
                        GeneratedAt = D(ob?.AgreementGeneratedOn), SentAt = D(ob?.AgreementSentOn), SignedAt = D(ob?.AgreementSignedOn),
                    },
                },
                StatusHistory = history[r.CandidateId].Select(h => new StatusHistoryDoc
                {
                    Id = h.StatusHistoryId, From = h.FromStatus, To = h.ToStatus, At = h.ChangedAt, By = h.ChangedBy, Reason = h.Reason,
                }).ToList(),
            };
        }).ToList();
    }

    // ---------- Writes ----------

    public async Task<CandidateDoc> CreateAsync(DbLease lease, CandidateDoc doc, AuditNote? audit)
    {
        if (doc.Id == Guid.Empty) doc.Id = Guid.NewGuid();
        await lease.InTransactionAsync(async tx =>
        {
            // StatusCode is left to its default (Prospect); the insert trigger records history and the "Created" audit entry.
            await lease.Connection.ExecuteAsync("""
                INSERT candidates.Candidate (CandidateId, FirstName, LastName, Email, Phone, Location, CurrentEmployer, CurrentTitle, Abn,
                    AvailabilityDate, SalaryBasis, SalaryAmount, ClearanceLevel, ClearanceExpiry, ClearanceIssuingAgency, ClearanceVerification,
                    WorkRights, VisaType, VisaExpiry, VisaRestrictions, SourceChannelCode, SourceDetail, LinkedInUrl, LinkedInOutreachStatus,
                    ConsentGiven, ConsentDate, ConsentMethod, CollectionNoticeProvided, Notes)
                VALUES (@CandidateId, @FirstName, @LastName, @Email, @Phone, @Location, @CurrentEmployer, @CurrentTitle, @Abn,
                    @AvailabilityDate, @SalaryBasis, @SalaryAmount, @ClearanceLevel, @ClearanceExpiry, @ClearanceIssuingAgency, @ClearanceVerification,
                    @WorkRights, @VisaType, @VisaExpiry, @VisaRestrictions, @SourceChannelCode, @SourceDetail, @LinkedInUrl, @LinkedInOutreachStatus,
                    @ConsentGiven, @ConsentDate, @ConsentMethod, @CollectionNoticeProvided, @Notes);
                """, ScalarParams(doc), tx);
            await ReplaceChildrenAsync(lease, doc, tx);
            if (audit?.Action is { Length: > 0 } action && action != "Created candidate")
                await WriteAuditAsync(lease, action, doc.Id, audit.Details, tx);
        });
        return await GetRequiredAsync(lease, doc.Id);
    }

    public async Task<CandidateDoc> UpdateAsync(DbLease lease, Guid id, CandidateDoc doc, AuditNote? audit)
    {
        doc.Id = id;
        if (string.IsNullOrEmpty(doc.Version)) throw ApiException.BadRequest("The candidate's version is required to save changes.");
        var p = ScalarParams(doc);
        p.Add("RowVer", Convert.FromBase64String(doc.Version));

        await lease.InTransactionAsync(async tx =>
        {
            var updated = await lease.Connection.ExecuteAsync("""
                UPDATE candidates.Candidate SET
                    FirstName = @FirstName, LastName = @LastName, Email = @Email, Phone = @Phone, Location = @Location,
                    CurrentEmployer = @CurrentEmployer, CurrentTitle = @CurrentTitle, Abn = @Abn, AvailabilityDate = @AvailabilityDate,
                    SalaryBasis = @SalaryBasis, SalaryAmount = @SalaryAmount,
                    ClearanceLevel = @ClearanceLevel, ClearanceExpiry = @ClearanceExpiry, ClearanceIssuingAgency = @ClearanceIssuingAgency,
                    ClearanceVerification = @ClearanceVerification,
                    WorkRights = @WorkRights, VisaType = @VisaType, VisaExpiry = @VisaExpiry, VisaRestrictions = @VisaRestrictions,
                    SourceChannelCode = @SourceChannelCode, SourceDetail = @SourceDetail, LinkedInUrl = @LinkedInUrl,
                    LinkedInOutreachStatus = @LinkedInOutreachStatus,
                    ConsentGiven = @ConsentGiven, ConsentDate = @ConsentDate, ConsentMethod = @ConsentMethod,
                    CollectionNoticeProvided = @CollectionNoticeProvided, Notes = @Notes,
                    UpdatedAt = SYSUTCDATETIME()
                WHERE CandidateId = @CandidateId AND IsErased = 0 AND RowVer = @RowVer;
                """, p, tx);

            if (updated == 0)
            {
                var exists = await lease.Connection.ExecuteScalarAsync<int>(
                    "SELECT COUNT(*) FROM candidates.Candidate WHERE CandidateId = @id AND IsErased = 0", new { id }, tx);
                throw exists == 0
                    ? ApiException.NotFound()
                    : ApiException.Conflict("Someone else changed this candidate since you loaded it. Reload to see the latest version.");
            }

            await ReplaceChildrenAsync(lease, doc, tx);
            await WriteAuditAsync(lease, audit?.Action is { Length: > 0 } a ? a : "Updated candidate", id,
                audit?.Details ?? string.Join(' ', new[] { doc.FirstName, doc.LastName }.Where(s => !string.IsNullOrWhiteSpace(s))), tx);
        });
        return await GetRequiredAsync(lease, id);
    }

    private static DynamicParameters ScalarParams(CandidateDoc c)
    {
        var consentDate = c.Consent.Given ? c.Consent.Date ?? DateOnly.FromDateTime(DateTime.Now) : c.Consent.Date;
        var p = new DynamicParameters();
        p.AddDynamicParams(new
        {
            CandidateId = c.Id,
            FirstName = N(c.FirstName), LastName = N(c.LastName), Email = N(c.Email), Phone = N(c.Phone), Location = N(c.Location),
            CurrentEmployer = N(c.CurrentEmployer), CurrentTitle = N(c.CurrentTitle),
            Abn = N(c.Abn?.Replace(" ", "")),
            AvailabilityDate = T(c.AvailabilityDate),
            SalaryBasis = N((c.Salary ?? new()).Basis) ?? "Daily rate", SalaryAmount = (c.Salary ?? new()).Amount,
            ClearanceLevel = N((c.Clearance ?? new()).Level) ?? "None", ClearanceExpiry = T(c.Clearance?.Expiry),
            ClearanceIssuingAgency = N(c.Clearance?.IssuingAgency), ClearanceVerification = N(c.Clearance?.Verification) ?? "Unverified",
            WorkRights = N(c.Visa?.WorkRights), VisaType = N(c.Visa?.Type), VisaExpiry = T(c.Visa?.Expiry), VisaRestrictions = N(c.Visa?.Restrictions),
            SourceChannelCode = N(c.Source?.Channel), SourceDetail = N(c.Source?.Detail),
            LinkedInUrl = N(c.Linkedin?.Url), LinkedInOutreachStatus = N(c.Linkedin?.OutreachStatus) ?? "Not contacted",
            ConsentGiven = c.Consent.Given, ConsentDate = T(consentDate), ConsentMethod = N(c.Consent.Method),
            CollectionNoticeProvided = c.Consent.CollectionNoticeProvided,
            Notes = N(c.Notes),
        });
        return p;
    }

    private static async Task ReplaceChildrenAsync(DbLease lease, CandidateDoc c, IDbTransaction tx)
    {
        var cn = lease.Connection;
        var id = c.Id;
        var today = DateOnly.FromDateTime(DateTime.Now);

        await cn.ExecuteAsync("""
            DELETE candidates.CandidateSkill         WHERE CandidateId = @id;
            DELETE candidates.CandidateCertification WHERE CandidateId = @id;
            DELETE candidates.OutreachLog            WHERE CandidateId = @id;
            DELETE candidates.Screening              WHERE CandidateId = @id;
            DELETE candidates.CandidateReference     WHERE CandidateId = @id;
            DELETE candidates.BackgroundCheck        WHERE CandidateId = @id;
            DELETE candidates.CandidateDocument      WHERE CandidateId = @id;
            DELETE candidates.CandidateInduction     WHERE CandidateId = @id;
            DELETE candidates.CandidateOnboarding    WHERE CandidateId = @id;
            """, new { id }, tx);

        var skills = (c.Skills ?? []).Where(s => !string.IsNullOrWhiteSpace(s.Name))
            .GroupBy(s => s.Name.Trim(), StringComparer.OrdinalIgnoreCase).Select(g => g.First())
            .Select(s => new { CandidateId = id, SkillName = s.Name.Trim(), YearsExperience = s.Years });
        await cn.ExecuteAsync("INSERT candidates.CandidateSkill (CandidateId, SkillName, YearsExperience) VALUES (@CandidateId, @SkillName, @YearsExperience);", skills, tx);

        var certs = (c.Certifications ?? []).Where(x => !string.IsNullOrWhiteSpace(x.Name))
            .Select(x => new { CertificationId = x.Id ?? Guid.NewGuid(), CandidateId = id, CertificationName = x.Name.Trim(), Issuer = N(x.Issuer), ExpiryDate = T(x.Expiry) });
        await cn.ExecuteAsync("INSERT candidates.CandidateCertification (CertificationId, CandidateId, CertificationName, Issuer, ExpiryDate) VALUES (@CertificationId, @CandidateId, @CertificationName, @Issuer, @ExpiryDate);", certs, tx);

        var outreach = (c.OutreachLog ?? []).Select(x => new { OutreachId = x.Id ?? Guid.NewGuid(), CandidateId = id, OutreachDate = T(x.Date ?? today), x.Channel, OutreachStatus = x.Status, Note = N(x.Note) });
        await cn.ExecuteAsync("INSERT candidates.OutreachLog (OutreachId, CandidateId, OutreachDate, Channel, OutreachStatus, Note) VALUES (@OutreachId, @CandidateId, @OutreachDate, @Channel, @OutreachStatus, @Note);", outreach, tx);

        foreach (var s in c.Screenings ?? [])
        {
            var sid = s.Id ?? Guid.NewGuid();
            await cn.ExecuteAsync("""
                INSERT candidates.Screening (ScreeningId, CandidateId, QuestionnaireId, ScreeningDate, RoleType, CallNotes, Outcome, RecordedBy)
                VALUES (@ScreeningId, @CandidateId, @QuestionnaireId, @ScreeningDate, @RoleType, @CallNotes, @Outcome, @RecordedBy);
                """, new { ScreeningId = sid, CandidateId = id, s.QuestionnaireId, ScreeningDate = T(s.Date ?? today), RoleType = s.RoleType.Trim(),
                          CallNotes = s.Notes ?? "", s.Outcome, RecordedBy = N(s.RecordedBy) ?? lease.UserName }, tx);
            await cn.ExecuteAsync("INSERT candidates.ScreeningAnswer (ScreeningId, Sequence, QuestionText, AnswerText) VALUES (@ScreeningId, @Sequence, @QuestionText, @AnswerText);",
                (s.Answers ?? []).Select((a, i) => new { ScreeningId = sid, Sequence = (short)(i + 1), QuestionText = a.Question, AnswerText = N(a.Answer) }), tx);
            await cn.ExecuteAsync("INSERT candidates.ScreeningSkillRating (ScreeningId, SkillName, Weight, Rating) VALUES (@ScreeningId, @SkillName, @Weight, @Rating);",
                (s.Ratings ?? []).GroupBy(r => r.Skill, StringComparer.OrdinalIgnoreCase).Select(g => g.First())
                    .Select(r => new { ScreeningId = sid, SkillName = r.Skill, Weight = (byte)r.Weight, Rating = (byte)r.Rating }), tx);
        }

        var refs = (c.References ?? []).Select(r => new
        {
            ReferenceId = r.Id ?? Guid.NewGuid(), CandidateId = id, RefereeName = r.Name.Trim(), Organisation = N(r.Company), Relationship = N(r.Relationship),
            Email = N(r.Email), Phone = N(r.Phone), RequestedDate = T(r.RequestedDate), ReferenceStatus = N(r.Status) ?? "Requested", ResponseText = N(r.Response),
        });
        await cn.ExecuteAsync("""
            INSERT candidates.CandidateReference (ReferenceId, CandidateId, RefereeName, Organisation, Relationship, Email, Phone, RequestedDate, ReferenceStatus, ResponseText)
            VALUES (@ReferenceId, @CandidateId, @RefereeName, @Organisation, @Relationship, @Email, @Phone, @RequestedDate, @ReferenceStatus, @ResponseText);
            """, refs, tx);

        var checks = c.Checks ?? new();
        await cn.ExecuteAsync("""
            INSERT candidates.BackgroundCheck (CandidateId, CheckType, IsApplicable, CheckStatus, CheckDate, ExpiryDate, RegistrationNumber)
            VALUES (@CandidateId, @CheckType, @IsApplicable, @CheckStatus, @CheckDate, @ExpiryDate, @RegistrationNumber);
            """, new[]
            {
                new { CandidateId = id, CheckType = "Police", IsApplicable = true, CheckStatus = checks.Police.Status, CheckDate = T(checks.Police.Date), ExpiryDate = T(checks.Police.Expiry), RegistrationNumber = (string?)null },
                new { CandidateId = id, CheckType = "WWVP", IsApplicable = checks.Wwvp.Applicable, CheckStatus = checks.Wwvp.Status, CheckDate = (DateTime?)null, ExpiryDate = T(checks.Wwvp.Expiry), RegistrationNumber = N(checks.Wwvp.Number) },
            }, tx);

        var docs = (c.Documents ?? []).Select(d => new
        {
            DocumentId = d.Id ?? Guid.NewGuid(), CandidateId = id, DocumentTypeCode = d.Type, Description = N(d.Name) ?? d.Type,
            FileName = N(d.FileName), FileSizeBytes = d.Size is > 0 ? d.Size : null, ExpiryDate = T(d.Expiry),
            UploadedAt = d.UploadedAt ?? DateTime.UtcNow, UploadedBy = N(d.UploadedBy) ?? lease.UserName,
        });
        await cn.ExecuteAsync("""
            INSERT candidates.CandidateDocument (DocumentId, CandidateId, DocumentTypeCode, Description, FileName, FileSizeBytes, ExpiryDate, UploadedAt, UploadedBy)
            VALUES (@DocumentId, @CandidateId, @DocumentTypeCode, @Description, @FileName, @FileSizeBytes, @ExpiryDate, @UploadedAt, @UploadedBy);
            """, docs, tx);

        var inductions = (c.Inductions ?? []).Where(i => i.CompletedDate is not null)
            .GroupBy(i => i.Type).Select(g => g.First())
            .Select(i => new { CandidateId = id, InductionTypeCode = i.Type, CompletedDate = T(i.CompletedDate), Notes = N(i.Notes) });
        await cn.ExecuteAsync("INSERT candidates.CandidateInduction (CandidateId, InductionTypeCode, CompletedDate, Notes) VALUES (@CandidateId, @InductionTypeCode, @CompletedDate, @Notes);", inductions, tx);

        var ob = c.Onboarding ?? new();
        await cn.ExecuteAsync("""
            INSERT candidates.CandidateOnboarding (CandidateId, SuperFundName, SuperMemberNumber, SuperUsi, AgreementStatus, AgreementGeneratedOn, AgreementSentOn, AgreementSignedOn)
            VALUES (@CandidateId, @SuperFundName, @SuperMemberNumber, @SuperUsi, @AgreementStatus, @AgreementGeneratedOn, @AgreementSentOn, @AgreementSignedOn);
            """, new
            {
                CandidateId = id, SuperFundName = N(ob.Super?.FundName), SuperMemberNumber = N(ob.Super?.MemberNumber), SuperUsi = N(ob.Super?.Usi),
                AgreementStatus = N(ob.Agreement?.Status) ?? "Not generated", AgreementGeneratedOn = T(ob.Agreement?.GeneratedAt),
                AgreementSentOn = T(ob.Agreement?.SentAt), AgreementSignedOn = T(ob.Agreement?.SignedAt),
            }, tx);
    }

    // ---------- Workflow, erasure, merge (database procedures) ----------

    public async Task<CandidateDoc> ChangeStatusAsync(DbLease lease, Guid id, StatusChangeRequest req)
    {
        await lease.Connection.ExecuteAsync("candidates.usp_ChangeCandidateStatus",
            new { CandidateId = id, ToStatus = req.To, ChangedBy = lease.UserName, Reason = N(req.Reason) }, commandType: CommandType.StoredProcedure);
        return await GetRequiredAsync(lease, id);
    }

    public async Task<IReadOnlyList<string>> GateIssuesAsync(DbLease lease, Guid id, string toStatus) =>
        (await lease.Connection.QueryAsync<string>("SELECT Issue FROM candidates.fn_StatusGateIssues(@id, @toStatus);", new { id, toStatus })).ToList();

    public Task EraseAsync(DbLease lease, Guid id, string reason) =>
        lease.Connection.ExecuteAsync("candidates.usp_EraseCandidate",
            new { CandidateId = id, Reason = reason, ErasedBy = lease.UserName }, commandType: CommandType.StoredProcedure);

    public async Task<CandidateDoc> MergeAsync(DbLease lease, Guid primaryId, Guid secondaryId)
    {
        await lease.Connection.ExecuteAsync("candidates.usp_MergeCandidates",
            new { PrimaryId = primaryId, SecondaryId = secondaryId, MergedBy = lease.UserName }, commandType: CommandType.StoredProcedure);
        return await GetRequiredAsync(lease, primaryId);
    }

    // ---------- Bank details ----------

    public async Task<BankSummary> SaveBankAsync(DbLease lease, Guid id, byte[] nonce, byte[] cipher, string last4)
    {
        return await lease.InTransactionAsync(async tx =>
        {
            var exists = await lease.Connection.ExecuteScalarAsync<int>("SELECT COUNT(*) FROM candidates.Candidate WHERE CandidateId = @id AND IsErased = 0", new { id }, tx);
            if (exists == 0) throw ApiException.NotFound();
            var updatedAt = await lease.Connection.ExecuteScalarAsync<DateTime>("""
                MERGE candidates.CandidateBankDetail AS t
                USING (SELECT @id AS CandidateId) AS s ON t.CandidateId = s.CandidateId
                WHEN MATCHED THEN UPDATE SET EncryptionIv = @nonce, Ciphertext = @cipher, KeyVersion = @keyVersion, AccountLast4 = @last4, UpdatedAt = SYSUTCDATETIME()
                WHEN NOT MATCHED THEN INSERT (CandidateId, EncryptionIv, Ciphertext, KeyVersion, AccountLast4) VALUES (@id, @nonce, @cipher, @keyVersion, @last4);
                UPDATE candidates.Candidate SET UpdatedAt = SYSUTCDATETIME() WHERE CandidateId = @id;
                SELECT UpdatedAt FROM candidates.CandidateBankDetail WHERE CandidateId = @id;
                """, new { id, nonce, cipher, keyVersion = BankCrypto.KeyVersion, last4 }, tx);
            await WriteAuditAsync(lease, "Updated bank details", id, "Encrypted", tx);
            return new BankSummary(last4, updatedAt);
        });
    }

    public async Task<(byte[] Nonce, byte[] Cipher)?> GetBankCipherAsync(DbLease lease, Guid id)
    {
        var row = await lease.Connection.QuerySingleOrDefaultAsync<(byte[] EncryptionIv, byte[] Ciphertext)>("""
            SELECT b.EncryptionIv, b.Ciphertext FROM candidates.CandidateBankDetail b
            JOIN candidates.Candidate c ON c.CandidateId = b.CandidateId AND c.IsErased = 0
            WHERE b.CandidateId = @id;
            """, new { id });
        return row.EncryptionIv is null ? null : (row.EncryptionIv, row.Ciphertext);
    }

    // ---------- Audit ----------

    public static Task WriteAuditAsync(DbLease lease, string action, Guid? candidateId, string? details, IDbTransaction? tx = null) =>
        lease.Connection.ExecuteAsync(
            "INSERT candidates.AuditLog (UserName, Action, CandidateId, Details) VALUES (@UserName, @Action, @CandidateId, @Details);",
            new { lease.UserName, Action = Trunc(action, 100), CandidateId = candidateId, Details = Trunc(details, 1000) }, tx);

    public async Task<IReadOnlyList<AuditEntry>> AuditAsync(DbLease lease, Guid? candidateId, int take) =>
        (await lease.Connection.QueryAsync<AuditEntry>("""
            SELECT TOP (@take) AuditId AS Id, OccurredAt AS At, UserName AS [User], Action, CandidateId, Details
            FROM candidates.AuditLog
            WHERE @candidateId IS NULL OR CandidateId = @candidateId
            ORDER BY AuditId DESC;
            """, new { candidateId, take })).ToList();

    // ---------- Helpers ----------

    private static string? N(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
    private static string? Trunc(string? s, int max) => s is null ? null : s.Length <= max ? s : s[..max];
    private static DateOnly? D(DateTime? v) => v is null ? null : DateOnly.FromDateTime(v.Value);
    private static DateTime? T(DateOnly? d) => d?.ToDateTime(TimeOnly.MinValue);

    // Dapper row shapes (column names match the database).
    private sealed class CandidateRow
    {
        public Guid CandidateId { get; set; }
        public string StatusCode { get; set; } = "";
        public string? FirstName { get; set; } public string? LastName { get; set; } public string? Email { get; set; } public string? Phone { get; set; }
        public string? Location { get; set; } public string? CurrentEmployer { get; set; } public string? CurrentTitle { get; set; } public string? Abn { get; set; }
        public DateTime? AvailabilityDate { get; set; } public string SalaryBasis { get; set; } = ""; public decimal? SalaryAmount { get; set; }
        public string ClearanceLevel { get; set; } = ""; public DateTime? ClearanceExpiry { get; set; } public string? ClearanceIssuingAgency { get; set; }
        public string ClearanceVerification { get; set; } = "";
        public string? WorkRights { get; set; } public string? VisaType { get; set; } public DateTime? VisaExpiry { get; set; } public string? VisaRestrictions { get; set; }
        public string? SourceChannelCode { get; set; } public string? SourceDetail { get; set; } public string? LinkedInUrl { get; set; }
        public string LinkedInOutreachStatus { get; set; } = "";
        public bool ConsentGiven { get; set; } public DateTime? ConsentDate { get; set; } public string? ConsentMethod { get; set; } public bool CollectionNoticeProvided { get; set; }
        public string? Notes { get; set; } public DateTime CreatedAt { get; set; } public DateTime UpdatedAt { get; set; } public byte[] RowVer { get; set; } = [];
    }
    private sealed class SkillRow { public Guid CandidateId { get; set; } public string SkillName { get; set; } = ""; public decimal? YearsExperience { get; set; } }
    private sealed class CertificationRow { public Guid CandidateId { get; set; } public Guid CertificationId { get; set; } public string CertificationName { get; set; } = ""; public string? Issuer { get; set; } public DateTime? ExpiryDate { get; set; } }
    private sealed class OutreachRow { public Guid CandidateId { get; set; } public Guid OutreachId { get; set; } public DateTime OutreachDate { get; set; } public string Channel { get; set; } = ""; public string OutreachStatus { get; set; } = ""; public string? Note { get; set; } }
    private sealed class ScreeningRow { public Guid CandidateId { get; set; } public Guid ScreeningId { get; set; } public Guid? QuestionnaireId { get; set; } public DateTime ScreeningDate { get; set; } public string RoleType { get; set; } = ""; public string CallNotes { get; set; } = ""; public string Outcome { get; set; } = ""; public string? RecordedBy { get; set; } }
    private sealed class AnswerRow { public Guid ScreeningId { get; set; } public short Sequence { get; set; } public string QuestionText { get; set; } = ""; public string? AnswerText { get; set; } }
    private sealed class RatingRow { public Guid ScreeningId { get; set; } public string SkillName { get; set; } = ""; public byte Weight { get; set; } public byte Rating { get; set; } }
    private sealed class ReferenceRow { public Guid CandidateId { get; set; } public Guid ReferenceId { get; set; } public string RefereeName { get; set; } = ""; public string? Organisation { get; set; } public string? Relationship { get; set; } public string? Email { get; set; } public string? Phone { get; set; } public DateTime? RequestedDate { get; set; } public string ReferenceStatus { get; set; } = ""; public string? ResponseText { get; set; } }
    private sealed class CheckRow { public Guid CandidateId { get; set; } public string CheckType { get; set; } = ""; public bool IsApplicable { get; set; } public string CheckStatus { get; set; } = ""; public DateTime? CheckDate { get; set; } public DateTime? ExpiryDate { get; set; } public string? RegistrationNumber { get; set; } }
    private sealed class DocumentRow { public Guid CandidateId { get; set; } public Guid DocumentId { get; set; } public string DocumentTypeCode { get; set; } = ""; public string Description { get; set; } = ""; public string? FileName { get; set; } public long? FileSizeBytes { get; set; } public DateTime? ExpiryDate { get; set; } public DateTime UploadedAt { get; set; } public string? UploadedBy { get; set; } }
    private sealed class InductionRow { public Guid CandidateId { get; set; } public string InductionTypeCode { get; set; } = ""; public DateTime CompletedDate { get; set; } public string? Notes { get; set; } }
    private sealed class OnboardingRow { public Guid CandidateId { get; set; } public string? SuperFundName { get; set; } public string? SuperMemberNumber { get; set; } public string? SuperUsi { get; set; } public string AgreementStatus { get; set; } = ""; public DateTime? AgreementGeneratedOn { get; set; } public DateTime? AgreementSentOn { get; set; } public DateTime? AgreementSignedOn { get; set; } }
    private sealed class BankRow { public Guid CandidateId { get; set; } public string AccountLast4 { get; set; } = ""; public DateTime UpdatedAt { get; set; } }
    private sealed class HistoryRow { public Guid CandidateId { get; set; } public Guid StatusHistoryId { get; set; } public string? FromStatus { get; set; } public string ToStatus { get; set; } = ""; public DateTime ChangedAt { get; set; } public string ChangedBy { get; set; } = ""; public string? Reason { get; set; } }
}
