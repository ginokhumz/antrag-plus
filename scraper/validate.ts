import { ConditionsSchema, DeadlineSchema, FieldSchema, ProgramSchema, RequirementSchema } from '@antrag-plus/schema';
import type { Issue, Program } from '@antrag-plus/schema';

const DeadlineFieldSchema = FieldSchema(DeadlineSchema);

const degrade = (candidate: Record<string, unknown>, issues: Issue[]): Record<string, unknown> => {
  const out = { ...candidate };

  if (!DeadlineFieldSchema.safeParse(out['deadline']).success) {
    issues.push({ field: 'deadline', code: 'invalid', message: 'deadline failed schema; degraded to unknown' });
    out['deadline'] = { value: { kind: 'unknown' }, tier: 'locale', evidence: 'degraded' };
  }

  if (!ConditionsSchema.safeParse(out['conditions']).success) {
    issues.push({ field: 'conditions', code: 'invalid', message: 'conditions failed schema; degraded to empty' });
    out['conditions'] = {};
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
