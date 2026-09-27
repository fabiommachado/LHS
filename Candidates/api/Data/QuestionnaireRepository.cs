using Dapper;
using Lhs.Candidates.Api.Infrastructure;
using Lhs.Candidates.Api.Models;

namespace Lhs.Candidates.Api.Data;

/// <summary>Screening questionnaires (req 3.1.2). Questionnaires used by past screenings are deactivated instead of deleted.</summary>
public sealed class QuestionnaireRepository
{
    public async Task<List<QuestionnaireDoc>> ListAsync(DbLease lease)
    {
        using var grid = await lease.Connection.QueryMultipleAsync("""
            SELECT QuestionnaireId AS Id, RoleType FROM candidates.Questionnaire WHERE IsActive = 1 ORDER BY RoleType;
            SELECT q.QuestionnaireId, q.QuestionText FROM candidates.QuestionnaireQuestion q
                JOIN candidates.Questionnaire x ON x.QuestionnaireId = q.QuestionnaireId AND x.IsActive = 1 ORDER BY q.Sequence;
            SELECT s.QuestionnaireId, s.SkillName, s.Weight FROM candidates.QuestionnaireSkill s
                JOIN candidates.Questionnaire x ON x.QuestionnaireId = s.QuestionnaireId AND x.IsActive = 1 ORDER BY s.Weight DESC, s.SkillName;
            """);
        var list = (await grid.ReadAsync<QuestionnaireDoc>()).ToList();
        var questions = (await grid.ReadAsync<(Guid QuestionnaireId, string QuestionText)>()).ToLookup(x => x.QuestionnaireId, x => x.QuestionText);
        var skills = (await grid.ReadAsync<(Guid QuestionnaireId, string SkillName, byte Weight)>()).ToLookup(x => x.QuestionnaireId);
        foreach (var q in list)
        {
            q.Questions = questions[q.Id].ToList();
            q.RequiredSkills = skills[q.Id].Select(s => new QuestionnaireSkillDoc { Name = s.SkillName, Weight = s.Weight }).ToList();
        }
        return list;
    }

    public async Task<QuestionnaireDoc> SaveAsync(DbLease lease, Guid id, QuestionnaireDoc q)
    {
        var roleType = q.RoleType?.Trim();
        if (string.IsNullOrEmpty(roleType)) throw ApiException.BadRequest("Role type is required.");
        var questions = (q.Questions ?? []).Select(x => x?.Trim()).Where(x => !string.IsNullOrEmpty(x)).ToList();
        if (questions.Count == 0) throw ApiException.BadRequest("Add at least one screening question.");
        var skills = (q.RequiredSkills ?? []).Where(s => !string.IsNullOrWhiteSpace(s.Name))
            .GroupBy(s => s.Name.Trim(), StringComparer.OrdinalIgnoreCase).Select(g => g.First())
            .Select(s => new { QuestionnaireId = id, SkillName = s.Name.Trim(), Weight = (byte)Math.Clamp(s.Weight, 1, 3) }).ToList();

        await lease.InTransactionAsync(async tx =>
        {
            var cn = lease.Connection;
            await cn.ExecuteAsync("""
                IF EXISTS (SELECT 1 FROM candidates.Questionnaire WHERE QuestionnaireId = @id)
                    UPDATE candidates.Questionnaire SET RoleType = @roleType, IsActive = 1, UpdatedAt = SYSUTCDATETIME() WHERE QuestionnaireId = @id;
                ELSE
                    INSERT candidates.Questionnaire (QuestionnaireId, RoleType) VALUES (@id, @roleType);
                DELETE candidates.QuestionnaireQuestion WHERE QuestionnaireId = @id;
                DELETE candidates.QuestionnaireSkill WHERE QuestionnaireId = @id;
                """, new { id, roleType }, tx);
            await cn.ExecuteAsync("INSERT candidates.QuestionnaireQuestion (QuestionnaireId, Sequence, QuestionText) VALUES (@QuestionnaireId, @Sequence, @QuestionText);",
                questions.Select((text, i) => new { QuestionnaireId = id, Sequence = (short)(i + 1), QuestionText = text }), tx);
            await cn.ExecuteAsync("INSERT candidates.QuestionnaireSkill (QuestionnaireId, SkillName, Weight) VALUES (@QuestionnaireId, @SkillName, @Weight);", skills, tx);
            await CandidateRepository.WriteAuditAsync(lease, "Saved questionnaire", null, roleType, tx);
        });

        return new QuestionnaireDoc
        {
            Id = id, RoleType = roleType, Questions = questions!,
            RequiredSkills = skills.Select(s => new QuestionnaireSkillDoc { Name = s.SkillName, Weight = s.Weight }).ToList(),
        };
    }

    public async Task DeleteAsync(DbLease lease, Guid id)
    {
        await lease.InTransactionAsync(async tx =>
        {
            var roleType = await lease.Connection.ExecuteScalarAsync<string?>(
                "SELECT RoleType FROM candidates.Questionnaire WHERE QuestionnaireId = @id AND IsActive = 1", new { id }, tx)
                ?? throw ApiException.NotFound("Questionnaire");
            // Keep questionnaires that screenings refer to, so screening history stays linked.
            await lease.Connection.ExecuteAsync("""
                IF EXISTS (SELECT 1 FROM candidates.Screening WHERE QuestionnaireId = @id)
                    UPDATE candidates.Questionnaire SET IsActive = 0, UpdatedAt = SYSUTCDATETIME() WHERE QuestionnaireId = @id;
                ELSE
                    DELETE candidates.Questionnaire WHERE QuestionnaireId = @id;
                """, new { id }, tx);
            await CandidateRepository.WriteAuditAsync(lease, "Deleted questionnaire", null, roleType, tx);
        });
    }
}
