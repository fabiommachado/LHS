namespace Lhs.Candidates.Api.Models;

/// <summary>Create/update body. <see cref="Audit"/> describes the change for the audit log (e.g. "Added certification").</summary>
public sealed record SaveCandidateRequest(CandidateDoc Candidate, AuditNote? Audit);
public sealed record AuditNote(string? Action, string? Details);

public sealed record StatusChangeRequest(string To, string? Reason);
public sealed record EraseRequest(string Reason);
public sealed record MergeRequest(Guid SecondaryId);

public sealed record BankDetails(string AccountName, string Bsb, string Account);
public sealed record BankSummary(string Last4, DateTime UpdatedAt);

public sealed record AuditRequest(string Action, Guid? CandidateId, string? Details);
public sealed record AuditEntry(long Id, DateTime At, string User, string Action, Guid? CandidateId, string? Details);

public sealed class QuestionnaireDoc
{
    public Guid Id { get; set; }
    public string RoleType { get; set; } = "";
    public List<string> Questions { get; set; } = [];
    public List<QuestionnaireSkillDoc> RequiredSkills { get; set; } = [];
}
public sealed class QuestionnaireSkillDoc { public string Name { get; set; } = ""; public int Weight { get; set; } = 1; }
