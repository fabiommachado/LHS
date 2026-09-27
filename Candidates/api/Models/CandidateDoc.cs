namespace Lhs.Candidates.Api.Models;

// JSON contract shared with the SPA (Candidates/js/domain.js blankCandidate). Property names serialise to camelCase.
// A candidate travels as one document; the repository maps it to and from the normalised candidates.* tables.

public sealed class CandidateDoc
{
    public Guid Id { get; set; }
    public string? Version { get; set; }              // base64 rowversion, for optimistic concurrency
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
    public string Status { get; set; } = "Prospect";  // read-only here; change via POST /status
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string? Location { get; set; }
    public string? CurrentEmployer { get; set; }
    public string? CurrentTitle { get; set; }
    public string? Abn { get; set; }
    public DateOnly? AvailabilityDate { get; set; }
    public SalaryDoc Salary { get; set; } = new();
    public List<SkillDoc> Skills { get; set; } = [];
    public List<CertificationDoc> Certifications { get; set; } = [];
    public ClearanceDoc Clearance { get; set; } = new();
    public VisaDoc Visa { get; set; } = new();
    public SourceDoc Source { get; set; } = new();
    public LinkedInDoc Linkedin { get; set; } = new();
    public List<OutreachDoc> OutreachLog { get; set; } = [];
    public ConsentDoc Consent { get; set; } = new();
    public List<ScreeningDoc> Screenings { get; set; } = [];
    public List<ReferenceDoc> References { get; set; } = [];
    public ChecksDoc Checks { get; set; } = new();
    public List<DocumentDoc> Documents { get; set; } = [];
    public List<InductionDoc> Inductions { get; set; } = [];
    public OnboardingDoc Onboarding { get; set; } = new();
    public List<StatusHistoryDoc> StatusHistory { get; set; } = [];   // read-only; written by the database
    public string? Notes { get; set; }
}

public sealed class SalaryDoc { public string Basis { get; set; } = "Daily rate"; public decimal? Amount { get; set; } }
public sealed class SkillDoc { public string Name { get; set; } = ""; public decimal? Years { get; set; } }
public sealed class CertificationDoc { public Guid? Id { get; set; } public string Name { get; set; } = ""; public string? Issuer { get; set; } public DateOnly? Expiry { get; set; } }
public sealed class ClearanceDoc { public string Level { get; set; } = "None"; public DateOnly? Expiry { get; set; } public string? IssuingAgency { get; set; } public string Verification { get; set; } = "Unverified"; }
public sealed class VisaDoc { public string? WorkRights { get; set; } public string? Type { get; set; } public DateOnly? Expiry { get; set; } public string? Restrictions { get; set; } }
public sealed class SourceDoc { public string? Channel { get; set; } public string? Detail { get; set; } }
public sealed class LinkedInDoc { public string? Url { get; set; } public string OutreachStatus { get; set; } = "Not contacted"; }
public sealed class OutreachDoc { public Guid? Id { get; set; } public DateOnly? Date { get; set; } public string Channel { get; set; } = ""; public string Status { get; set; } = ""; public string? Note { get; set; } }
public sealed class ConsentDoc { public bool Given { get; set; } public DateOnly? Date { get; set; } public string? Method { get; set; } public bool CollectionNoticeProvided { get; set; } }

public sealed class ScreeningDoc
{
    public Guid? Id { get; set; }
    public DateOnly? Date { get; set; }
    public Guid? QuestionnaireId { get; set; }
    public string RoleType { get; set; } = "";
    public List<AnswerDoc> Answers { get; set; } = [];
    public List<RatingDoc> Ratings { get; set; } = [];
    public string Notes { get; set; } = "";
    public string Outcome { get; set; } = "Hold";
    public string? RecordedBy { get; set; }
}
public sealed class AnswerDoc { public string Question { get; set; } = ""; public string? Answer { get; set; } }
public sealed class RatingDoc { public string Skill { get; set; } = ""; public int Weight { get; set; } public int Rating { get; set; } }

public sealed class ReferenceDoc
{
    public Guid? Id { get; set; }
    public string Name { get; set; } = "";
    public string? Company { get; set; }
    public string? Relationship { get; set; }
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public string Status { get; set; } = "Requested";
    public DateOnly? RequestedDate { get; set; }
    public string? Response { get; set; }
}

public sealed class ChecksDoc { public PoliceCheckDoc Police { get; set; } = new(); public WwvpCheckDoc Wwvp { get; set; } = new(); }
public sealed class PoliceCheckDoc { public string Status { get; set; } = "Not started"; public DateOnly? Date { get; set; } public DateOnly? Expiry { get; set; } }
public sealed class WwvpCheckDoc { public bool Applicable { get; set; } public string Status { get; set; } = "Not started"; public string? Number { get; set; } public DateOnly? Expiry { get; set; } }

public sealed class DocumentDoc
{
    public Guid? Id { get; set; }
    public string Type { get; set; } = "";
    public string Name { get; set; } = "";
    public string? FileName { get; set; }
    public long? Size { get; set; }
    public DateOnly? Expiry { get; set; }
    public DateTime? UploadedAt { get; set; }
    public string? UploadedBy { get; set; }
}

public sealed class InductionDoc { public Guid? Id { get; set; } public string Type { get; set; } = ""; public DateOnly? CompletedDate { get; set; } public string? Notes { get; set; } }

public sealed class OnboardingDoc
{
    public BankSummaryDoc? Bank { get; set; }      // read-only summary; details go through /bank
    public SuperDoc Super { get; set; } = new();
    public AgreementDoc Agreement { get; set; } = new();
}
public sealed class BankSummaryDoc { public string Last4 { get; set; } = ""; public DateTime UpdatedAt { get; set; } }
public sealed class SuperDoc { public string? FundName { get; set; } public string? MemberNumber { get; set; } public string? Usi { get; set; } }
public sealed class AgreementDoc { public string Status { get; set; } = "Not generated"; public DateOnly? GeneratedAt { get; set; } public DateOnly? SentAt { get; set; } public DateOnly? SignedAt { get; set; } }

public sealed class StatusHistoryDoc { public Guid Id { get; set; } public string? From { get; set; } public string To { get; set; } = ""; public DateTime At { get; set; } public string By { get; set; } = ""; public string? Reason { get; set; } }
