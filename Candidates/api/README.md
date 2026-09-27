# Candidates API

ASP.NET Core (.NET 10) API that connects the Candidates SPA to the `LHS` SQL Server database. It also serves the SPA, so the app and API share one origin.

## Run it

1. Deploy the database (once, and after schema changes):
   ```powershell
   ..\database\deploy.ps1 -IncludeDemoData
   ```
2. Set the bank-details encryption key (once per machine; it's kept in your Windows profile, never in the repo):
   ```powershell
   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
   dotnet user-secrets set BankEncryption:Key ([Convert]::ToBase64String($b))
   ```
   Keep a secure copy. Bank details encrypted with a lost key can't be recovered.
3. Start the API and open http://localhost:5080:
   ```powershell
   dotnet run
   ```

Opening `Candidates/index.html` straight from disk still works. It runs the offline prototype on browser storage and doesn't use the API.

## How it connects

- **Database access.** Connects with Windows authentication, then runs every request as the `candidates_api` database user (`Database:ImpersonateUser`). That user belongs to the `candidates_app` role, so the database's permission rules apply: no hard deletes, an append-only audit log, and status changes only through `usp_ChangeCandidateStatus`.
- **Acting user.** Taken from the `X-LHS-User` header and passed to the database via `SESSION_CONTEXT` for history and audit. This is simulated sign-in; real authentication (SSO/MFA) belongs to Module 10.
- **Bank details.** Encrypted on the server with AES-256-GCM. The candidate data only ever includes the last four digits. `GET /api/candidates/{id}/bank` decrypts them and writes an audit entry.
- **Concurrency.** Every candidate carries a `version`. Saving an out-of-date copy returns `409`, and the SPA reloads the latest version.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Database connectivity check |
| GET | `/api/candidates` | All live candidates, with full detail |
| GET | `/api/candidates/{id}` | One candidate |
| POST | `/api/candidates` | Create (`{ candidate, audit }`) |
| PUT | `/api/candidates/{id}` | Update profile and child records (`{ candidate, audit }`) |
| POST | `/api/candidates/{id}/status` | Change status (`{ to, reason }`). Workflow and compliance rules are enforced by the database |
| GET | `/api/candidates/{id}/gate-issues?to=Active` | What's blocking a move to that status |
| POST | `/api/candidates/{id}/merge` | Merge a duplicate into this candidate (`{ secondaryId }`) |
| POST | `/api/candidates/{id}/erase` | Privacy Act erasure (`{ reason }`) |
| PUT | `/api/candidates/{id}/bank` | Save bank details (encrypted) |
| GET | `/api/candidates/{id}/bank` | Reveal bank details (audited) |
| GET / POST | `/api/audit` | Read the audit log (`?candidateId=`) / record a client event |
| GET | `/api/questionnaires` | Active screening questionnaires |
| PUT / DELETE | `/api/questionnaires/{id}` | Save / delete (used questionnaires are deactivated instead) |

Errors are returned as RFC 7807 problem responses, with a `detail` message the SPA shows to the user.

## Before production

- Serve over HTTPS only, and put real authentication in front of the API (Module 10).
- Enforce candidate-portal restrictions on the server. Today the SPA limits what a candidate sees, but the API doesn't yet.
- Run under a least-privileged service account mapped to `candidates_api`. Then set `Database:ImpersonateUser` to empty.
- Move `BankEncryption:Key` to a key vault.
