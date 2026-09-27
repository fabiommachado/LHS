/*
  LHS – Candidate module database
  04: Views, functions and stored procedures. All CREATE OR ALTER, so safe to re-run.
  Business rules mirror Candidates/js/domain.js so the database enforces them even if a client doesn't.
*/
USE [$(DatabaseName)];
GO
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* Agency's local date (Canberra). Expiry and availability are calendar dates in AEST/AEDT, not UTC. */
CREATE OR ALTER FUNCTION candidates.fn_Today ()
RETURNS DATE
AS
BEGIN
    RETURN CAST(SYSDATETIMEOFFSET() AT TIME ZONE N'AUS Eastern Standard Time' AS DATE);
END;
GO

/* ===================== Views ===================== */

-- One row per live candidate for list/search screens.
CREATE OR ALTER VIEW candidates.vw_CandidateList
AS
SELECT
    c.CandidateId,
    CONCAT_WS(N' ', c.FirstName, c.LastName)                       AS FullName,
    c.FirstName, c.LastName, c.Email, c.Phone, c.Location,
    c.CurrentTitle, c.CurrentEmployer,
    c.StatusCode, st.SortOrder                                     AS StatusSortOrder,
    c.ClearanceLevel, c.ClearanceVerification, c.ClearanceExpiry,
    c.WorkRights, c.VisaExpiry,
    c.AvailabilityDate, c.SalaryBasis, c.SalaryAmount,
    c.SourceChannelCode, c.LinkedInOutreachStatus,
    c.ConsentGiven,
    sk.Skills,
    c.CreatedAt, c.UpdatedAt                                       AS LastActivityAt,
    CAST(CASE WHEN c.UpdatedAt <= DATEADD(YEAR, -7, SYSUTCDATETIME()) THEN 1 ELSE 0 END AS BIT) AS RetentionPeriodEnded
FROM candidates.Candidate AS c
JOIN candidates.CandidateStatus AS st ON st.StatusCode = c.StatusCode
OUTER APPLY (
    SELECT STRING_AGG(s.SkillName, N', ') WITHIN GROUP (ORDER BY s.YearsExperience DESC, s.SkillName) AS Skills
    FROM candidates.CandidateSkill AS s
    WHERE s.CandidateId = c.CandidateId
) AS sk
WHERE c.IsErased = 0;
GO

-- Everything that expires, with the 30/60/90-day alert bucket (req 3.1.3, 3.9.2 compliance report).
CREATE OR ALTER VIEW candidates.vw_CandidateExpiringItem
AS
WITH Items AS (
    SELECT CandidateId, N'Visa' AS ItemKind, CONCAT(N'Visa', N' (' + VisaType + N')') AS ItemLabel, VisaExpiry AS ExpiryDate
    FROM candidates.Candidate WHERE WorkRights = N'Visa holder' AND VisaExpiry IS NOT NULL
    UNION ALL
    SELECT CandidateId, N'Clearance', CONCAT(ClearanceLevel, N' clearance'), ClearanceExpiry
    FROM candidates.Candidate WHERE ClearanceLevel <> N'None' AND ClearanceExpiry IS NOT NULL
    UNION ALL
    SELECT CandidateId, N'Certification', CONCAT(N'Certification: ', CertificationName), ExpiryDate
    FROM candidates.CandidateCertification WHERE ExpiryDate IS NOT NULL
    UNION ALL
    SELECT CandidateId, CASE CheckType WHEN N'WWVP' THEN N'WWVP' ELSE N'Police check' END,
           CASE CheckType WHEN N'WWVP' THEN N'WWVP check' ELSE N'Police check' END, ExpiryDate
    FROM candidates.BackgroundCheck WHERE IsApplicable = 1 AND ExpiryDate IS NOT NULL
    UNION ALL
    SELECT CandidateId, N'Document', CONCAT(N'Document: ', DocumentTypeCode, N' – ', Description), ExpiryDate
    FROM candidates.CandidateDocument WHERE ExpiryDate IS NOT NULL
)
SELECT
    i.CandidateId,
    CONCAT_WS(N' ', c.FirstName, c.LastName) AS FullName,
    c.StatusCode,
    i.ItemKind, i.ItemLabel, i.ExpiryDate,
    d.DaysUntilExpiry,
    CASE WHEN d.DaysUntilExpiry < 0  THEN N'Expired'
         WHEN d.DaysUntilExpiry <= 30 THEN N'30'
         WHEN d.DaysUntilExpiry <= 60 THEN N'60'
         WHEN d.DaysUntilExpiry <= 90 THEN N'90'
         ELSE N'OK' END AS AlertBucket
FROM Items AS i
JOIN candidates.Candidate AS c ON c.CandidateId = i.CandidateId AND c.IsErased = 0
CROSS APPLY (SELECT DATEDIFF(DAY, candidates.fn_Today(), i.ExpiryDate) AS DaysUntilExpiry) AS d;
GO

-- Likely duplicate pairs (req 3.1.1). A name match alone is too weak: it also needs the same employer or location.
CREATE OR ALTER VIEW candidates.vw_PossibleDuplicate
AS
SELECT
    a.CandidateId AS CandidateIdA,
    b.CandidateId AS CandidateIdB,
    CONCAT_WS(N' ', a.FirstName, a.LastName) AS FullNameA,
    CONCAT_WS(N' ', b.FirstName, b.LastName) AS FullNameB,
    CONCAT_WS(N', ',
        CASE WHEN a.EmailKey = b.EmailKey THEN N'Same email' END,
        CASE WHEN a.PhoneKey = b.PhoneKey THEN N'Same phone' END,
        CASE WHEN a.LinkedInKey = b.LinkedInKey THEN N'Same LinkedIn profile' END,
        CASE WHEN a.FirstName = b.FirstName AND a.LastName = b.LastName THEN N'Same name' END,
        CASE WHEN a.FirstName = b.FirstName AND a.LastName = b.LastName AND a.CurrentEmployer = b.CurrentEmployer THEN N'Same employer' END,
        CASE WHEN a.FirstName = b.FirstName AND a.LastName = b.LastName AND a.Location = b.Location THEN N'Same location' END
    ) AS MatchReasons
FROM candidates.Candidate AS a
JOIN candidates.Candidate AS b
  ON a.CandidateId < b.CandidateId
 AND (   a.EmailKey = b.EmailKey
      OR a.PhoneKey = b.PhoneKey
      OR a.LinkedInKey = b.LinkedInKey
      OR (a.FirstName = b.FirstName AND a.LastName = b.LastName AND (a.CurrentEmployer = b.CurrentEmployer OR a.Location = b.Location)))
WHERE a.IsErased = 0 AND b.IsErased = 0;
GO

/* ===================== Workflow gates (req 3.1.5) ===================== */

/*
  Reasons a candidate can't enter @ToStatus (empty result = allowed). Mirrors domain.gateIssues:
    - Beyond Prospect: privacy consent.
    - Cleared and later: right to work, a passed screening, a received reference, verified & current clearance, no adverse police check.
    - Active: onboarding documents, bank details, super fund, mandatory inductions, signed contractor agreement.
*/
CREATE OR ALTER FUNCTION candidates.fn_StatusGateIssues (@CandidateId UNIQUEIDENTIFIER, @ToStatus NVARCHAR(20))
RETURNS TABLE
AS
RETURN
WITH C AS (
    SELECT c.*,
           candidates.fn_Today() AS Today,
           CASE WHEN @ToStatus IN (N'Inactive', N'Do Not Use', N'Bench', N'Prospect') THEN 0 ELSE 1 END AS NeedsConsent,
           CASE WHEN @ToStatus IN (N'Cleared', N'Submitted', N'Shortlisted', N'Placed', N'Active') THEN 1 ELSE 0 END AS NeedsClearance,
           CASE WHEN @ToStatus = N'Active' THEN 1 ELSE 0 END AS NeedsOnboarding
    FROM candidates.Candidate AS c
    WHERE c.CandidateId = @CandidateId AND c.IsErased = 0
)
SELECT v.Issue
FROM C
CROSS APPLY (VALUES
    (CASE WHEN NeedsConsent = 1 AND ConsentGiven = 0 THEN N'Privacy consent has not been recorded' END),
    (CASE WHEN NeedsClearance = 1 AND WorkRights IS NULL THEN N'Right-to-work status not recorded' END),
    (CASE WHEN NeedsClearance = 1 AND WorkRights = N'Visa holder' AND VisaType IS NULL THEN N'Visa type not recorded' END),
    (CASE WHEN NeedsClearance = 1 AND WorkRights = N'Visa holder' AND VisaExpiry < Today THEN N'Visa has expired' END),
    (CASE WHEN NeedsClearance = 1 AND NOT EXISTS (SELECT 1 FROM candidates.Screening AS s WHERE s.CandidateId = C.CandidateId AND s.Outcome = N'Pass')
          THEN N'No passed screening on record' END),
    (CASE WHEN NeedsClearance = 1 AND NOT EXISTS (SELECT 1 FROM candidates.CandidateReference AS r WHERE r.CandidateId = C.CandidateId AND r.ReferenceStatus = N'Received')
          THEN N'At least one reference must be received' END),
    (CASE WHEN NeedsClearance = 1 AND ClearanceLevel <> N'None' AND ClearanceVerification <> N'Verified' THEN CONCAT(ClearanceLevel, N' clearance is not verified') END),
    (CASE WHEN NeedsClearance = 1 AND ClearanceLevel <> N'None' AND ClearanceExpiry < Today THEN N'Security clearance has expired' END),
    (CASE WHEN NeedsClearance = 1 AND EXISTS (SELECT 1 FROM candidates.BackgroundCheck AS b WHERE b.CandidateId = C.CandidateId AND b.CheckType = N'Police' AND b.CheckStatus = N'Adverse')
          THEN N'Police check returned an adverse result' END),
    (CASE WHEN NeedsOnboarding = 1 AND NOT EXISTS (SELECT 1 FROM candidates.CandidateBankDetail AS bd WHERE bd.CandidateId = C.CandidateId)
          THEN N'Bank details not recorded' END),
    (CASE WHEN NeedsOnboarding = 1 AND NOT EXISTS (SELECT 1 FROM candidates.CandidateOnboarding AS o WHERE o.CandidateId = C.CandidateId AND o.SuperFundName IS NOT NULL)
          THEN N'Superannuation fund details not recorded' END),
    (CASE WHEN NeedsOnboarding = 1 AND NOT EXISTS (SELECT 1 FROM candidates.CandidateOnboarding AS o WHERE o.CandidateId = C.CandidateId AND o.AgreementStatus = N'Signed')
          THEN N'Contractor agreement not signed' END)
) AS v (Issue)
WHERE v.Issue IS NOT NULL
UNION ALL
SELECT CONCAT(N'Missing onboarding document: ', dt.DocumentTypeCode)
FROM C
CROSS JOIN candidates.DocumentType AS dt
WHERE C.NeedsOnboarding = 1 AND dt.IsOnboardingRequired = 1
  AND NOT EXISTS (SELECT 1 FROM candidates.CandidateDocument AS d
                  WHERE d.CandidateId = C.CandidateId AND d.DocumentTypeCode = dt.DocumentTypeCode
                    AND (d.ExpiryDate IS NULL OR d.ExpiryDate >= C.Today))
UNION ALL
SELECT CONCAT(it.InductionTypeCode, N' induction not completed')
FROM C
CROSS JOIN candidates.InductionType AS it
WHERE C.NeedsOnboarding = 1 AND it.IsMandatory = 1
  AND NOT EXISTS (SELECT 1 FROM candidates.CandidateInduction AS ci WHERE ci.CandidateId = C.CandidateId AND ci.InductionTypeCode = it.InductionTypeCode);
GO

/* ===================== Triggers ===================== */

/*
  Every new candidate gets its initial status-history entry, so history is complete however the row was created.
  The acting user comes from SESSION_CONTEXT('UserName'), which the API sets per request
  (EXEC sp_set_session_context N'UserName', N'...'); falls back to the SQL login.
*/
CREATE OR ALTER TRIGGER candidates.TR_Candidate_Insert
ON candidates.Candidate
AFTER INSERT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @User NVARCHAR(150) = COALESCE(CAST(SESSION_CONTEXT(N'UserName') AS NVARCHAR(150)), ORIGINAL_LOGIN());

    -- The workflow starts at Prospect; only DBAs (data migration) may insert candidates further along.
    IF IS_MEMBER(N'db_owner') = 0 AND EXISTS (SELECT 1 FROM inserted WHERE StatusCode <> N'Prospect' OR IsErased = 1)
        THROW 50030, N'New candidates must start in Prospect status. Use usp_ChangeCandidateStatus to move them on.', 1;

    INSERT candidates.StatusHistory (CandidateId, FromStatus, ToStatus, ChangedBy, Reason)
    SELECT i.CandidateId, NULL, i.StatusCode, @User,
           CASE WHEN i.SourceChannelCode = N'LinkedIn' THEN N'Imported from LinkedIn' ELSE N'Created' END
    FROM inserted AS i;

    INSERT candidates.AuditLog (UserName, Action, CandidateId, Details)
    SELECT @User, N'Created candidate', i.CandidateId, CONCAT_WS(N' ', i.FirstName, i.LastName)
    FROM inserted AS i;
END;
GO

/* ===================== Procedures ===================== */

CREATE OR ALTER PROCEDURE candidates.usp_WriteAudit
    @UserName    NVARCHAR(150),
    @Action      NVARCHAR(100),
    @CandidateId UNIQUEIDENTIFIER = NULL,
    @Details     NVARCHAR(1000)   = NULL
AS
BEGIN
    SET NOCOUNT ON;
    INSERT candidates.AuditLog (UserName, Action, CandidateId, Details)
    VALUES (@UserName, @Action, @CandidateId, @Details);
END;
GO

-- The only supported way to change status: checks the allowed move, the compliance gates, records history and audit.
CREATE OR ALTER PROCEDURE candidates.usp_ChangeCandidateStatus
    @CandidateId UNIQUEIDENTIFIER,
    @ToStatus    NVARCHAR(20),
    @ChangedBy   NVARCHAR(150),
    @Reason      NVARCHAR(1000) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @From NVARCHAR(20), @RequiresReason BIT, @Issues NVARCHAR(MAX), @Msg NVARCHAR(2048);
    SET @Reason = NULLIF(LTRIM(RTRIM(@Reason)), N'');

    BEGIN TRY
    BEGIN TRANSACTION;

    SELECT @From = StatusCode
    FROM candidates.Candidate WITH (UPDLOCK, HOLDLOCK)
    WHERE CandidateId = @CandidateId AND IsErased = 0;

    IF @From IS NULL
        THROW 50001, N'Candidate not found.', 1;

    SELECT @RequiresReason = RequiresReason
    FROM candidates.StatusTransition
    WHERE FromStatus = @From AND ToStatus = @ToStatus;

    IF @RequiresReason IS NULL
    BEGIN
        SET @Msg = CONCAT(N'Cannot move from ', @From, N' to ', @ToStatus, N'.');
        THROW 50002, @Msg, 1;
    END;

    IF @RequiresReason = 1 AND @Reason IS NULL
    BEGIN
        SET @Msg = CONCAT(N'A reason is required to move a candidate to ', @ToStatus, N'.');
        THROW 50003, @Msg, 1;
    END;

    SELECT @Issues = STRING_AGG(Issue, N'; ') FROM candidates.fn_StatusGateIssues(@CandidateId, @ToStatus);
    IF @Issues IS NOT NULL
    BEGIN
        SET @Msg = LEFT(CONCAT(N'Cannot move to ', @ToStatus, N': ', @Issues), 2048);
        THROW 50004, @Msg, 1;
    END;

    UPDATE candidates.Candidate
    SET StatusCode = @ToStatus, UpdatedAt = SYSUTCDATETIME()
    WHERE CandidateId = @CandidateId;

    INSERT candidates.StatusHistory (CandidateId, FromStatus, ToStatus, ChangedBy, Reason)
    VALUES (@CandidateId, @From, @ToStatus, @ChangedBy, @Reason);

    INSERT candidates.AuditLog (UserName, Action, CandidateId, Details)
    VALUES (@ChangedBy, N'Status changed', @CandidateId, LEFT(CONCAT(@From, N' → ', @ToStatus, N' – ' + @Reason), 1000));

    COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        -- Roll back so callers never inherit a doomed transaction, then re-raise the original error.
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

/*
  Right to erasure (Privacy Act, req 2.10 / 3.10.2). Removes all personal information and child records,
  keeps an anonymous tombstone row, and scrubs audit details so the trail survives without PII.
*/
CREATE OR ALTER PROCEDURE candidates.usp_EraseCandidate
    @CandidateId UNIQUEIDENTIFIER,
    @Reason      NVARCHAR(500),
    @ErasedBy    NVARCHAR(150)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @FullName NVARCHAR(210);

    IF NULLIF(LTRIM(RTRIM(@Reason)), N'') IS NULL
        THROW 50010, N'An erasure reason or request reference is required.', 1;

    BEGIN TRY
    BEGIN TRANSACTION;

    SELECT @FullName = CONCAT_WS(N' ', FirstName, LastName)
    FROM candidates.Candidate WITH (UPDLOCK, HOLDLOCK)
    WHERE CandidateId = @CandidateId AND IsErased = 0;

    IF @FullName IS NULL
        THROW 50001, N'Candidate not found.', 1;

    DELETE candidates.CandidateSkill         WHERE CandidateId = @CandidateId;
    DELETE candidates.CandidateCertification WHERE CandidateId = @CandidateId;
    DELETE candidates.OutreachLog            WHERE CandidateId = @CandidateId;
    DELETE candidates.Screening              WHERE CandidateId = @CandidateId;  -- cascades answers and ratings
    DELETE candidates.CandidateReference     WHERE CandidateId = @CandidateId;
    DELETE candidates.BackgroundCheck        WHERE CandidateId = @CandidateId;
    DELETE candidates.CandidateDocument      WHERE CandidateId = @CandidateId;
    DELETE candidates.CandidateInduction     WHERE CandidateId = @CandidateId;
    DELETE candidates.CandidateOnboarding    WHERE CandidateId = @CandidateId;
    DELETE candidates.CandidateBankDetail    WHERE CandidateId = @CandidateId;
    DELETE candidates.StatusHistory          WHERE CandidateId = @CandidateId;

    UPDATE candidates.Candidate
    SET StatusCode = N'Inactive',
        FirstName = NULL, LastName = NULL, Email = NULL, Phone = NULL, Location = NULL,
        CurrentEmployer = NULL, CurrentTitle = NULL, Abn = NULL, AvailabilityDate = NULL, SalaryAmount = NULL,
        ClearanceLevel = N'None', ClearanceExpiry = NULL, ClearanceIssuingAgency = NULL, ClearanceVerification = N'Unverified',
        WorkRights = NULL, VisaType = NULL, VisaExpiry = NULL, VisaRestrictions = NULL,
        SourceDetail = NULL, LinkedInUrl = NULL, LinkedInOutreachStatus = N'Not contacted',
        ConsentGiven = 0, ConsentDate = NULL, ConsentMethod = NULL, CollectionNoticeProvided = 0,
        Notes = NULL,
        IsErased = 1, ErasedAt = SYSUTCDATETIME(), ErasureReason = @Reason, UpdatedAt = SYSUTCDATETIME()
    WHERE CandidateId = @CandidateId;

    UPDATE candidates.AuditLog SET Details = N'[erased]' WHERE CandidateId = @CandidateId;
    UPDATE candidates.AuditLog SET UserName = N'Candidate: [erased]' WHERE UserName = CONCAT(N'Candidate: ', @FullName);

    INSERT candidates.AuditLog (UserName, Action, CandidateId, Details)
    VALUES (@ErasedBy, N'Erased candidate (Privacy Act request)', @CandidateId, @Reason);

    COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        -- Roll back so callers never inherit a doomed transaction, then re-raise the original error.
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO

/*
  Merge a duplicate into a primary record (req 3.1.1). Same rules as domain.mergeCandidates:
  the primary's values win, its blanks are filled from the secondary, and history, screenings, references,
  documents etc. are combined. If only the secondary has consent or a clearance, those are taken as a whole.
*/
CREATE OR ALTER PROCEDURE candidates.usp_MergeCandidates
    @PrimaryId   UNIQUEIDENTIFIER,
    @SecondaryId UNIQUEIDENTIFIER,
    @MergedBy    NVARCHAR(150)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @PrimaryName NVARCHAR(210), @SecondaryName NVARCHAR(210);

    IF @PrimaryId = @SecondaryId
        THROW 50020, N'Cannot merge a candidate into itself.', 1;

    BEGIN TRY
    BEGIN TRANSACTION;

    SELECT @PrimaryName = CONCAT_WS(N' ', FirstName, LastName)
    FROM candidates.Candidate WITH (UPDLOCK, HOLDLOCK) WHERE CandidateId = @PrimaryId AND IsErased = 0;
    SELECT @SecondaryName = CONCAT_WS(N' ', FirstName, LastName)
    FROM candidates.Candidate WITH (UPDLOCK, HOLDLOCK) WHERE CandidateId = @SecondaryId AND IsErased = 0;

    IF @PrimaryName IS NULL OR @SecondaryName IS NULL
        THROW 50001, N'Candidate not found.', 1;

    UPDATE p SET
        Email                  = COALESCE(p.Email, s.Email),
        Phone                  = COALESCE(p.Phone, s.Phone),
        Location               = COALESCE(p.Location, s.Location),
        CurrentEmployer        = COALESCE(p.CurrentEmployer, s.CurrentEmployer),
        CurrentTitle           = COALESCE(p.CurrentTitle, s.CurrentTitle),
        Abn                    = COALESCE(p.Abn, s.Abn),
        AvailabilityDate       = COALESCE(p.AvailabilityDate, s.AvailabilityDate),
        SalaryAmount           = COALESCE(p.SalaryAmount, s.SalaryAmount),
        SalaryBasis            = CASE WHEN p.SalaryAmount IS NULL AND s.SalaryAmount IS NOT NULL THEN s.SalaryBasis ELSE p.SalaryBasis END,
        ClearanceLevel         = CASE WHEN p.ClearanceLevel = N'None' THEN s.ClearanceLevel         ELSE p.ClearanceLevel END,
        ClearanceExpiry        = CASE WHEN p.ClearanceLevel = N'None' THEN s.ClearanceExpiry        ELSE p.ClearanceExpiry END,
        ClearanceIssuingAgency = CASE WHEN p.ClearanceLevel = N'None' THEN s.ClearanceIssuingAgency ELSE p.ClearanceIssuingAgency END,
        ClearanceVerification  = CASE WHEN p.ClearanceLevel = N'None' THEN s.ClearanceVerification  ELSE p.ClearanceVerification END,
        WorkRights             = CASE WHEN p.WorkRights IS NULL THEN s.WorkRights       ELSE p.WorkRights END,
        VisaType               = CASE WHEN p.WorkRights IS NULL THEN s.VisaType         ELSE p.VisaType END,
        VisaExpiry             = CASE WHEN p.WorkRights IS NULL THEN s.VisaExpiry       ELSE p.VisaExpiry END,
        VisaRestrictions       = CASE WHEN p.WorkRights IS NULL THEN s.VisaRestrictions ELSE p.VisaRestrictions END,
        SourceChannelCode      = COALESCE(p.SourceChannelCode, s.SourceChannelCode),
        SourceDetail           = COALESCE(p.SourceDetail, s.SourceDetail),
        LinkedInUrl            = COALESCE(p.LinkedInUrl, s.LinkedInUrl),
        ConsentGiven           = CASE WHEN p.ConsentGiven = 0 AND s.ConsentGiven = 1 THEN 1 ELSE p.ConsentGiven END,
        ConsentDate            = CASE WHEN p.ConsentGiven = 0 AND s.ConsentGiven = 1 THEN s.ConsentDate ELSE p.ConsentDate END,
        ConsentMethod          = CASE WHEN p.ConsentGiven = 0 AND s.ConsentGiven = 1 THEN s.ConsentMethod ELSE p.ConsentMethod END,
        CollectionNoticeProvided = CASE WHEN p.CollectionNoticeProvided = 1 OR s.CollectionNoticeProvided = 1 THEN 1 ELSE 0 END,
        Notes                  = CASE WHEN s.Notes IS NULL THEN p.Notes
                                      ELSE CONCAT_WS(CHAR(13) + CHAR(10) + CHAR(13) + CHAR(10), p.Notes, N'[Merged from duplicate] ' + s.Notes) END,
        UpdatedAt              = SYSUTCDATETIME()
    FROM candidates.Candidate AS p
    JOIN candidates.Candidate AS s ON s.CandidateId = @SecondaryId
    WHERE p.CandidateId = @PrimaryId;

    -- Skills: keep the primary's entry when both have the same skill.
    INSERT candidates.CandidateSkill (CandidateId, SkillName, YearsExperience)
    SELECT @PrimaryId, s.SkillName, s.YearsExperience
    FROM candidates.CandidateSkill AS s
    WHERE s.CandidateId = @SecondaryId
      AND NOT EXISTS (SELECT 1 FROM candidates.CandidateSkill AS p WHERE p.CandidateId = @PrimaryId AND p.SkillName = s.SkillName);

    UPDATE s SET CandidateId = @PrimaryId
    FROM candidates.CandidateCertification AS s
    WHERE s.CandidateId = @SecondaryId
      AND NOT EXISTS (SELECT 1 FROM candidates.CandidateCertification AS p
                      WHERE p.CandidateId = @PrimaryId AND p.CertificationName = s.CertificationName
                        AND ISNULL(p.ExpiryDate, '19000101') = ISNULL(s.ExpiryDate, '19000101'));

    UPDATE candidates.OutreachLog        SET CandidateId = @PrimaryId WHERE CandidateId = @SecondaryId;
    UPDATE candidates.StatusHistory      SET CandidateId = @PrimaryId WHERE CandidateId = @SecondaryId;
    UPDATE candidates.Screening          SET CandidateId = @PrimaryId WHERE CandidateId = @SecondaryId;
    UPDATE candidates.CandidateReference SET CandidateId = @PrimaryId WHERE CandidateId = @SecondaryId;
    UPDATE candidates.CandidateDocument  SET CandidateId = @PrimaryId WHERE CandidateId = @SecondaryId;

    -- One-per-candidate records: move only where the primary has none.
    UPDATE s SET CandidateId = @PrimaryId FROM candidates.BackgroundCheck AS s
    WHERE s.CandidateId = @SecondaryId
      AND NOT EXISTS (SELECT 1 FROM candidates.BackgroundCheck AS p WHERE p.CandidateId = @PrimaryId AND p.CheckType = s.CheckType);
    UPDATE s SET CandidateId = @PrimaryId FROM candidates.CandidateInduction AS s
    WHERE s.CandidateId = @SecondaryId
      AND NOT EXISTS (SELECT 1 FROM candidates.CandidateInduction AS p WHERE p.CandidateId = @PrimaryId AND p.InductionTypeCode = s.InductionTypeCode);
    IF NOT EXISTS (SELECT 1 FROM candidates.CandidateOnboarding WHERE CandidateId = @PrimaryId)
        UPDATE candidates.CandidateOnboarding SET CandidateId = @PrimaryId WHERE CandidateId = @SecondaryId;
    IF NOT EXISTS (SELECT 1 FROM candidates.CandidateBankDetail WHERE CandidateId = @PrimaryId)
        UPDATE candidates.CandidateBankDetail SET CandidateId = @PrimaryId WHERE CandidateId = @SecondaryId;

    UPDATE candidates.AuditLog SET CandidateId = @PrimaryId WHERE CandidateId = @SecondaryId;

    DELETE candidates.Candidate WHERE CandidateId = @SecondaryId;   -- cascades any remaining child rows

    INSERT candidates.AuditLog (UserName, Action, CandidateId, Details)
    VALUES (@MergedBy, N'Merged duplicate', @PrimaryId, CONCAT(@SecondaryName, N' merged into ', @PrimaryName));

    COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        -- Roll back so callers never inherit a doomed transaction, then re-raise the original error.
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        THROW;
    END CATCH;
END;
GO
