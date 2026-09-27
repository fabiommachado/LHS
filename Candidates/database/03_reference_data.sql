/*
  LHS – Candidate module database
  03: Reference data (statuses, workflow transitions, sources, document and induction types).
  Upserts via MERGE, so it is safe to re-run and picks up changes. Keep in sync with Candidates/js/domain.js.
*/
USE [$(DatabaseName)];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

BEGIN TRANSACTION;

-- Status workflow (req 3.1.5): Prospect → Screening → Cleared → Submitted → Shortlisted → Placed → Active → Bench → Inactive → Do Not Use
MERGE candidates.CandidateStatus AS t
USING (VALUES
    (N'Prospect',     1,  1, N'Profile received'),
    (N'Screening',    2,  1, N'Application in review'),
    (N'Cleared',      3,  1, N'Ready for opportunities'),
    (N'Submitted',    4,  1, N'Submitted to a client'),
    (N'Shortlisted',  5,  1, N'Shortlisted by a client'),
    (N'Placed',       6,  1, N'Placement confirmed'),
    (N'Active',       7,  1, N'On assignment'),
    (N'Bench',        8,  1, N'Available for new opportunities'),
    (N'Inactive',     9,  0, N'Not currently active'),
    (N'Do Not Use',  10,  0, N'Not currently active')
) AS s (StatusCode, SortOrder, IsPipeline, CandidateLabel)
ON t.StatusCode = s.StatusCode
WHEN MATCHED THEN UPDATE SET SortOrder = s.SortOrder, IsPipeline = s.IsPipeline, CandidateLabel = s.CandidateLabel
WHEN NOT MATCHED THEN INSERT (StatusCode, SortOrder, IsPipeline, CandidateLabel) VALUES (s.StatusCode, s.SortOrder, s.IsPipeline, s.CandidateLabel);

-- Allowed moves. Inactive and Do Not Use are reachable from every state except Do Not Use (which is final).
WITH Forward AS (
    SELECT * FROM (VALUES
        (N'Prospect',    N'Screening'),
        (N'Screening',   N'Cleared'),     (N'Screening',   N'Prospect'),
        (N'Cleared',     N'Submitted'),   (N'Cleared',     N'Bench'),
        (N'Submitted',   N'Shortlisted'), (N'Submitted',   N'Cleared'),  (N'Submitted',   N'Bench'),
        (N'Shortlisted', N'Placed'),      (N'Shortlisted', N'Cleared'),  (N'Shortlisted', N'Bench'),
        (N'Placed',      N'Active'),      (N'Placed',      N'Bench'),
        (N'Active',      N'Bench'),
        (N'Bench',       N'Submitted'),   (N'Bench',       N'Screening'),
        (N'Inactive',    N'Prospect')
    ) AS v (FromStatus, ToStatus)
),
Exits AS (
    SELECT s.StatusCode AS FromStatus, x.ToStatus
    FROM candidates.CandidateStatus AS s
    CROSS JOIN (VALUES (N'Inactive'), (N'Do Not Use')) AS x (ToStatus)
    WHERE s.StatusCode <> N'Do Not Use' AND s.StatusCode <> x.ToStatus
),
AllMoves AS (
    SELECT FromStatus, ToStatus, CAST(0 AS BIT) AS RequiresReason FROM Forward
    UNION
    SELECT FromStatus, ToStatus, CAST(1 AS BIT) FROM Exits
)
MERGE candidates.StatusTransition AS t
USING AllMoves AS s
ON t.FromStatus = s.FromStatus AND t.ToStatus = s.ToStatus
WHEN MATCHED THEN UPDATE SET RequiresReason = s.RequiresReason
WHEN NOT MATCHED BY TARGET THEN INSERT (FromStatus, ToStatus, RequiresReason) VALUES (s.FromStatus, s.ToStatus, s.RequiresReason)
WHEN NOT MATCHED BY SOURCE THEN DELETE;

MERGE candidates.SourceChannel AS t
USING (VALUES (N'LinkedIn'), (N'Referral'), (N'Inbound'), (N'Job board'), (N'Partner agency')) AS s (SourceChannelCode)
ON t.SourceChannelCode = s.SourceChannelCode
WHEN NOT MATCHED THEN INSERT (SourceChannelCode) VALUES (s.SourceChannelCode);

MERGE candidates.DocumentType AS t
USING (VALUES
    (N'Resume',               0, 1,  1),
    (N'TFN declaration',      1, 1,  2),
    (N'Super choice form',    1, 1,  3),
    (N'Identity document',    1, 1,  4),
    (N'Qualification',        1, 1,  5),
    (N'Visa',                 0, 1,  6),
    (N'Security clearance',   0, 0,  7),
    (N'Certification',        0, 1,  8),
    (N'Police check',         0, 1,  9),
    (N'WWVP check',           0, 1, 10),
    (N'First aid',            0, 1, 11),
    (N'Contractor agreement', 0, 0, 12),
    (N'Other',                0, 1, 13)
) AS s (DocumentTypeCode, IsOnboardingRequired, CandidateCanUpload, SortOrder)
ON t.DocumentTypeCode = s.DocumentTypeCode
WHEN MATCHED THEN UPDATE SET IsOnboardingRequired = s.IsOnboardingRequired, CandidateCanUpload = s.CandidateCanUpload, SortOrder = s.SortOrder
WHEN NOT MATCHED THEN INSERT (DocumentTypeCode, IsOnboardingRequired, CandidateCanUpload, SortOrder)
    VALUES (s.DocumentTypeCode, s.IsOnboardingRequired, s.CandidateCanUpload, s.SortOrder);

MERGE candidates.InductionType AS t
USING (VALUES (N'WHS', 1, 1), (N'Client site', 0, 2), (N'ICT security', 1, 3)) AS s (InductionTypeCode, IsMandatory, SortOrder)
ON t.InductionTypeCode = s.InductionTypeCode
WHEN MATCHED THEN UPDATE SET IsMandatory = s.IsMandatory, SortOrder = s.SortOrder
WHEN NOT MATCHED THEN INSERT (InductionTypeCode, IsMandatory, SortOrder) VALUES (s.InductionTypeCode, s.IsMandatory, s.SortOrder);

COMMIT TRANSACTION;
GO
