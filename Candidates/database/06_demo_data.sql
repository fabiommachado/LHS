/*
  LHS – Candidate module database
  06: Demo data – the same six candidates and two questionnaires as the SPA's seed (Candidates/js/store.js).
  Dates are relative to today so expiry alerts always have something to show.
  Only runs when the Candidate table is empty. Don't deploy to production.
*/
USE [$(DatabaseName)];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF EXISTS (SELECT 1 FROM candidates.Candidate)
BEGIN
    PRINT 'Candidates already exist – demo data skipped.';
    SET NOEXEC ON;
END;
GO

EXEC sp_set_session_context N'UserName', N'Seed data';

DECLARE @Today DATE = candidates.fn_Today();
DECLARE @Now DATETIME2(3) = SYSUTCDATETIME();

DECLARE @QCloud UNIQUEIDENTIFIER = NEWID(), @QBa UNIQUEIDENTIFIER = NEWID();
DECLARE @Priya UNIQUEIDENTIFIER = NEWID(), @James UNIQUEIDENTIFIER = NEWID(), @Wei UNIQUEIDENTIFIER = NEWID(),
        @Emma1 UNIQUEIDENTIFIER = NEWID(), @Emma2 UNIQUEIDENTIFIER = NEWID(), @Daniel UNIQUEIDENTIFIER = NEWID();
DECLARE @ScrPriya UNIQUEIDENTIFIER = NEWID(), @ScrWei UNIQUEIDENTIFIER = NEWID(), @ScrDaniel UNIQUEIDENTIFIER = NEWID();

BEGIN TRANSACTION;

/* ---------- Questionnaires ---------- */
INSERT candidates.Questionnaire (QuestionnaireId, RoleType) VALUES (@QCloud, N'Cloud Engineer'), (@QBa, N'Business Analyst');

INSERT candidates.QuestionnaireQuestion (QuestionnaireId, Sequence, QuestionText) VALUES
    (@QCloud, 1, N'Describe your most recent AWS or Azure migration.'),
    (@QCloud, 2, N'What infrastructure-as-code tools have you used in production?'),
    (@QCloud, 3, N'Are you comfortable working on-site in Canberra 3 days a week?'),
    (@QBa, 1, N'Walk through a requirements elicitation you led in government.'),
    (@QBa, 2, N'Which modelling notations (BPMN, UML) do you use?'),
    (@QBa, 3, N'Experience with Digital Service Standard?');

INSERT candidates.QuestionnaireSkill (QuestionnaireId, SkillName, Weight) VALUES
    (@QCloud, N'AWS', 3), (@QCloud, N'Terraform', 2), (@QCloud, N'Kubernetes', 2), (@QCloud, N'Python', 1),
    (@QBa, N'Requirements analysis', 3), (@QBa, N'BPMN', 2), (@QBa, N'Stakeholder engagement', 3);

/* ---------- Candidates ---------- */
INSERT candidates.Candidate (
    CandidateId, StatusCode, FirstName, LastName, Email, Phone, Location, CurrentEmployer, CurrentTitle, Abn,
    AvailabilityDate, SalaryBasis, SalaryAmount,
    ClearanceLevel, ClearanceExpiry, ClearanceIssuingAgency, ClearanceVerification,
    WorkRights, VisaType, VisaExpiry, VisaRestrictions,
    SourceChannelCode, SourceDetail, LinkedInUrl, LinkedInOutreachStatus,
    ConsentGiven, ConsentDate, ConsentMethod, CollectionNoticeProvided, Notes)
VALUES
    (@Priya, N'Active', N'Priya', N'Raman', N'priya.raman@example.com', N'0412 345 678', N'Canberra, ACT', N'Department of Home Affairs', N'Senior Cloud Engineer', '51824753556',
     DATEADD(DAY, 120, @Today), N'Daily rate', 1150,
     N'NV1', DATEADD(DAY, 700, @Today), N'AGSVA', N'Verified',
     N'Australian citizen', NULL, NULL, NULL,
     N'LinkedIn', N'Recruiter search: AWS NV1 Canberra', N'https://www.linkedin.com/in/priya-raman-example', N'Interested',
     1, DATEADD(DAY, -200, @Today), N'Email', 1, N'Placed with Home Affairs via Cloud Platform SOW.'),

    (@James, N'Screening', N'James', N'O''Connell', N'j.oconnell@example.com', N'0423 111 222', N'Queanbeyan, NSW', N'Accenture', N'Business Analyst', NULL,
     DATEADD(DAY, 14, @Today), N'Daily rate', 950,
     N'Baseline', DATEADD(DAY, 50, @Today), N'AGSVA', N'Pending',
     N'Australian citizen', NULL, NULL, NULL,
     N'Referral', N'Referred by Priya Raman', NULL, N'Not contacted',
     1, DATEADD(DAY, -10, @Today), N'Email', 1, NULL),

    (@Wei, N'Bench', N'Wei', N'Zhang', N'wei.zhang@example.com', N'0433 987 654', N'Canberra, ACT', N'Datacom', N'DevOps Engineer', NULL,
     DATEADD(DAY, 3, @Today), N'Daily rate', 1000,
     N'Baseline', DATEADD(DAY, 400, @Today), N'AGSVA', N'Verified',
     N'Visa holder', N'Subclass 482', DATEADD(DAY, 45, @Today), N'Must work in nominated occupation',
     N'Job board', N'SEEK', NULL, N'Not contacted',
     1, DATEADD(DAY, -400, @Today), N'Candidate portal', 1, NULL),

    (@Emma1, N'Prospect', N'Emma', N'Walsh', N'emma.walsh@example.com', N'0400 555 000', N'Canberra, ACT', N'Services Australia', N'Test Analyst', NULL,
     DATEADD(DAY, 60, @Today), N'Daily rate', NULL,
     N'None', NULL, NULL, N'Unverified',
     NULL, NULL, NULL, NULL,
     N'LinkedIn', N'InMail campaign – testers', N'https://linkedin.com/in/emma-walsh-example', N'InMail sent',
     0, NULL, NULL, 0, NULL),

    (@Emma2, N'Prospect', N'Emma', N'Walsh', N'EMMA.WALSH@example.com', NULL, N'Canberra ACT', N'Services Australia', N'Senior Test Analyst', NULL,
     NULL, N'Daily rate', NULL,
     N'None', NULL, NULL, N'Unverified',
     NULL, NULL, NULL, NULL,
     N'Partner agency', N'Capital Talent Partners', NULL, N'Not contacted',
     0, NULL, NULL, 0, N'Submitted by partner for testing roles.'),

    (@Daniel, N'Cleared', N'Daniel', N'Kovac', N'd.kovac@example.com', N'0455 202 303', N'Sydney, NSW', NULL, N'Security Architect', NULL,
     DATEADD(DAY, 30, @Today), N'Daily rate', 1400,
     N'NV2', DATEADD(DAY, 80, @Today), N'AGSVA', N'Verified',
     N'Permanent resident', NULL, NULL, NULL,
     N'Inbound', N'Website application', NULL, N'Not contacted',
     1, DATEADD(DAY, -60, @Today), N'Written form', 1, NULL);

/* ---------- Skills & certifications ---------- */
INSERT candidates.CandidateSkill (CandidateId, SkillName, YearsExperience) VALUES
    (@Priya, N'AWS', 8), (@Priya, N'Terraform', 5), (@Priya, N'Kubernetes', 4), (@Priya, N'Python', 6),
    (@James, N'Requirements analysis', 7), (@James, N'BPMN', 5), (@James, N'Stakeholder engagement', 7), (@James, N'Jira', 6),
    (@Wei, N'Azure', 5), (@Wei, N'Kubernetes', 4), (@Wei, N'Terraform', 3), (@Wei, N'Go', 2),
    (@Emma1, N'Selenium', 4), (@Emma1, N'Test automation', 5),
    (@Emma2, N'Playwright', 2), (@Emma2, N'Test automation', 5),
    (@Daniel, N'ISM', 10), (@Daniel, N'IRAP', 6), (@Daniel, N'Zero trust', 4);

INSERT candidates.CandidateCertification (CandidateId, CertificationName, Issuer, ExpiryDate) VALUES
    (@Priya, N'AWS Solutions Architect – Professional', N'Amazon Web Services', DATEADD(DAY, 25, @Today)),
    (@Daniel, N'CISSP', N'ISC2', DATEADD(DAY, -5, @Today));

/* ---------- Screening ---------- */
INSERT candidates.Screening (ScreeningId, CandidateId, QuestionnaireId, ScreeningDate, RoleType, CallNotes, Outcome, RecordedBy) VALUES
    (@ScrPriya,  @Priya,  @QCloud, DATEADD(DAY, -190, @Today), N'Cloud Engineer',     N'Excellent depth on AWS landing zones.', N'Pass', N'Seed data'),
    (@ScrWei,    @Wei,    @QCloud, DATEADD(DAY, -380, @Today), N'Cloud Engineer',     N'Strong on Azure, lighter on AWS.',      N'Pass', N'Seed data'),
    (@ScrDaniel, @Daniel, NULL,    DATEADD(DAY, -50, @Today),  N'Security Architect', N'IRAP assessor background.',             N'Pass', N'Seed data');

INSERT candidates.ScreeningSkillRating (ScreeningId, SkillName, Weight, Rating) VALUES
    (@ScrPriya, N'AWS', 3, 5), (@ScrPriya, N'Terraform', 2, 4), (@ScrPriya, N'Kubernetes', 2, 4), (@ScrPriya, N'Python', 1, 4),
    (@ScrWei,   N'AWS', 3, 2), (@ScrWei,   N'Terraform', 2, 4), (@ScrWei,   N'Kubernetes', 2, 4), (@ScrWei,   N'Python', 1, 3);

INSERT candidates.CandidateReference (CandidateId, RefereeName, Organisation, Relationship, RequestedDate, ReferenceStatus, ResponseText) VALUES
    (@Priya,  N'Tom Nguyen', N'Department of Finance', N'Former manager', DATEADD(DAY, -20, @Today), N'Received', N'Strong technical skills, reliable, would re-hire.'),
    (@James,  N'Sarah Lee',  N'Accenture',             N'Former manager', DATEADD(DAY, -20, @Today), N'Requested', NULL),
    (@Wei,    N'Ana Costa',  N'Datacom',               N'Former manager', DATEADD(DAY, -20, @Today), N'Received', N'Strong technical skills, reliable, would re-hire.'),
    (@Daniel, N'Mark Chen',  N'CyberCX',               N'Former manager', DATEADD(DAY, -20, @Today), N'Received', N'Strong technical skills, reliable, would re-hire.');

INSERT candidates.BackgroundCheck (CandidateId, CheckType, IsApplicable, CheckStatus, CheckDate, ExpiryDate) VALUES
    (@Priya, N'Police', 1, N'Cleared', DATEADD(DAY, -180, @Today), DATEADD(DAY, 185, @Today)),
    (@Priya, N'WWVP',   0, N'Not applicable', NULL, NULL);

/* ---------- Onboarding ---------- */
INSERT candidates.CandidateDocument (CandidateId, DocumentTypeCode, Description, FileName, ExpiryDate, UploadedBy) VALUES
    (@Priya, N'Resume',               N'Priya Raman CV',                N'priya-raman-cv.pdf',                NULL, N'Seed data'),
    (@Priya, N'TFN declaration',      N'TFN declaration',               N'tfn-declaration.pdf',               NULL, N'Seed data'),
    (@Priya, N'Super choice form',    N'Super choice',                  N'super-choice.pdf',                  NULL, N'Seed data'),
    (@Priya, N'Identity document',    N'Passport',                      N'passport.pdf',                      DATEADD(DAY, 1500, @Today), N'Seed data'),
    (@Priya, N'Qualification',        N'BEng Software',                 N'beng-software.pdf',                 NULL, N'Seed data'),
    (@Priya, N'Contractor agreement', N'Signed contractor agreement',   N'signed-contractor-agreement.pdf',   NULL, N'Seed data'),
    (@Wei,   N'Visa',                 N'VEVO check',                    N'vevo-check.pdf',                    DATEADD(DAY, 45, @Today), N'Seed data'),
    (@Wei,   N'Resume',               N'Wei Zhang CV',                  N'wei-zhang-cv.pdf',                  NULL, N'Seed data');

INSERT candidates.CandidateInduction (CandidateId, InductionTypeCode, CompletedDate) VALUES
    (@Priya, N'WHS', DATEADD(DAY, -170, @Today)),
    (@Priya, N'ICT security', DATEADD(DAY, -170, @Today));

INSERT candidates.CandidateOnboarding (CandidateId, SuperFundName, SuperMemberNumber, SuperUsi, AgreementStatus, AgreementGeneratedOn, AgreementSignedOn) VALUES
    (@Priya, N'AustralianSuper', N'12345678', N'STA0100AU', N'Signed', DATEADD(DAY, -175, @Today), DATEADD(DAY, -172, @Today));

INSERT candidates.OutreachLog (CandidateId, OutreachDate, Channel, OutreachStatus, Note) VALUES
    (@Emma1, DATEADD(DAY, -3, @Today), N'InMail', N'InMail sent', N'Testing roles campaign');

INSERT candidates.AuditLog (UserName, Action, Details) VALUES (N'System', N'Seeded demo data', N'6 candidates');

COMMIT TRANSACTION;

EXEC sp_set_session_context N'UserName', NULL;
PRINT 'Demo data loaded.';
GO

SET NOEXEC OFF;
GO
