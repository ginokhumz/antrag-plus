import { ConditionsSchema, DeadlineSchema, FieldSchema, ProgramSchema, RequirementSchema } from '@antrag-plus/schema';
import type { Issue, Program } from '@antrag-plus/schema';

const DeadlineFieldSchema = FieldSchema(DeadlineSchema);

const degrade = (candidate: Record<string, unknown>, issues: Issue[]): Record<string, unknown> => {
  const out = { ...candidate };

  if (!DeadlineFieldSchema.safeParse(out['deadline']).success) {
    issues.push({ field: 'deadline', code: 'invalid', message: 'deadline failed schema; degraded to unknown' });
    out['deadline'] = { value: { kind: 'unknown' }, tier: 'locale', evidence: 'degraded' };
  }

  // Degrade per member, not per block: one implausible percentage must not take the
  // grant, duration and co-financing down with it. Spec §5 requires per-field issues.
  const rawConditions = out['conditions'];
  if (ConditionsSchema.safeParse(rawConditions).success === false) {
    if (rawConditions === null || typeof rawConditions !== 'object') {
      issues.push({ field: 'conditions', code: 'invalid', message: 'conditions was not an object; degraded to empty' });
      out['conditions'] = {};
    } else {
      const kept: Record<string, unknown> = {};
      for (const [member, value] of Object.entries(rawConditions)) {
        if (ConditionsSchema.safeParse({ [member]: value }).success) {
          kept[member] = value;
        } else {
          issues.push({
            field: `conditions.${member}`,
            code: 'invalid',
            message: `${member} failed schema; dropped while the rest of conditions was kept`,
          });
        }
      }
      out['conditions'] = kept;
    }
  }

  const reqs = Array.isArray(out['requirements']) ? out['requirements'] : [];
  const keptReqs = reqs.filter(r => RequirementSchema.safeParse(r).success);
  if (keptReqs.length !== reqs.length) {
    issues.push({ field: 'requirements', code: 'invalid', message: 'dropped requirement entries failing schema' });
  }
  out['requirements'] = keptReqs;

  return out;
};

export const validateProgram = (candidate: unknown): { program: Program; issues: Issue[] } | undefined => {
  if (candidate === null || typeof candidate !== 'object') return undefined;

  const priorIssues = Array.isArray((candidate as { issues?: unknown }).issues)
    ? (candidate as { issues: Issue[] }).issues
    : [];
  const issues: Issue[] = [...priorIssues];

  const degraded = degrade(candidate as Record<string, unknown>, issues);
  const parsed = ProgramSchema.safeParse({ ...degraded, issues });
  if (!parsed.success) return undefined;

  return { program: parsed.data, issues };
};
