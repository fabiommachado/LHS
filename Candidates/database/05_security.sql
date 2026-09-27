/*
  LHS – Candidate module database
  05: Database roles (req 3.10.1 RBAC, 3.10.2 audit). Safe to re-run.
  Add logins/users to these roles; don't grant table rights to users directly.

  candidates_app       – the application's service account. Full data access through the schema, but:
                         * the audit log is append-only (no UPDATE/DELETE),
                         * candidates can't be hard-deleted; use usp_EraseCandidate / usp_MergeCandidates,
                         * status can only change via usp_ChangeCandidateStatus (StatusCode column is not updatable).
                         The procedures run under ownership chaining, so these DENYs don't block them.
  candidates_reporting – read-only access for reporting, without encrypted bank data or internal notes.
*/
USE [$(DatabaseName)];
GO
SET NOCOUNT ON;
GO

IF DATABASE_PRINCIPAL_ID(N'candidates_app') IS NULL
    CREATE ROLE candidates_app AUTHORIZATION dbo;
IF DATABASE_PRINCIPAL_ID(N'candidates_reporting') IS NULL
    CREATE ROLE candidates_reporting AUTHORIZATION dbo;
GO

GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON SCHEMA::candidates TO candidates_app;
DENY UPDATE, DELETE ON OBJECT::candidates.AuditLog TO candidates_app;
DENY DELETE ON OBJECT::candidates.Candidate TO candidates_app;
DENY UPDATE ON OBJECT::candidates.Candidate (StatusCode, IsErased, ErasedAt, ErasureReason) TO candidates_app;
DENY INSERT, UPDATE, DELETE ON OBJECT::candidates.StatusHistory TO candidates_app;
-- Reference data is maintained by deployment scripts, not the app.
DENY INSERT, UPDATE, DELETE ON OBJECT::candidates.CandidateStatus  TO candidates_app;
DENY INSERT, UPDATE, DELETE ON OBJECT::candidates.StatusTransition TO candidates_app;
GO

GRANT SELECT ON SCHEMA::candidates TO candidates_reporting;
DENY SELECT ON OBJECT::candidates.CandidateBankDetail TO candidates_reporting;
DENY SELECT ON OBJECT::candidates.Candidate (Notes) TO candidates_reporting;
GO

/*
  candidates_api – database user the Candidates API runs as. It has no login: the API connects with its own
  identity and switches to this user (EXECUTE AS USER), so every query is limited to candidates_app rights.
  In production, map the API's service account (Windows or SQL login) to this user instead.
*/
IF DATABASE_PRINCIPAL_ID(N'candidates_api') IS NULL
    CREATE USER candidates_api WITHOUT LOGIN WITH DEFAULT_SCHEMA = candidates;
IF IS_ROLEMEMBER(N'candidates_app', N'candidates_api') = 0
    ALTER ROLE candidates_app ADD MEMBER candidates_api;
GO
