import { z } from 'zod';

export const TierSchema = z.enum(['standard', 'framework', 'locale', 'site']);
export type Tier = z.infer<typeof TierSchema>;

export const FieldSchema = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, tier: TierSchema, evidence: z.string().min(1) });

export type Field<T> = { value: T; tier: Tier; evidence: string };

export const field = <T>(value: T, tier: Tier, evidence: string): Field<T> => ({ value, tier, evidence });

export const IssueSchema = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string(),
  raw: z.string().optional(),
});
export type Issue = z.infer<typeof IssueSchema>;

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type IsoDate = z.infer<typeof IsoDateSchema>;

export const DeadlineSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('window'), start: IsoDateSchema.optional(), end: IsoDateSchema }),
  z.object({ kind: z.literal('rolling'), cadence: z.string().optional() }),
  z.object({ kind: z.literal('unknown') }),
]);
export type Deadline = z.infer<typeof DeadlineSchema>;

export const BoundSchema = z.enum(['max', 'min', 'exact']);
export type Bound = z.infer<typeof BoundSchema>;

export const MoneyBasisSchema = z.enum(['project', 'year', 'person-day', 'night', 'partner-year']);
export type MoneyBasis = z.infer<typeof MoneyBasisSchema>;

export const RateBasisSchema = z.enum(['eligible-costs', 'total-costs', 'own-funds', 'accessibility-costs']);
export type RateBasis = z.infer<typeof RateBasisSchema>;

export const MoneySchema = z.object({ amountEur: z.number().nonnegative(), bound: BoundSchema, per: MoneyBasisSchema });
export type Money = z.infer<typeof MoneySchema>;

export const RateSchema = z.object({ percent: z.number().min(0).max(100), bound: BoundSchema, of: RateBasisSchema });
export type Rate = z.infer<typeof RateSchema>;

export const DurationSchema = z.object({ months: z.number().int().positive(), bound: BoundSchema });
export type Duration = z.infer<typeof DurationSchema>;

export const ConditionsSchema = z.object({
  grant: FieldSchema(z.array(MoneySchema)).optional(),
  fundingRate: FieldSchema(z.array(RateSchema)).optional(),
  maxDuration: FieldSchema(DurationSchema).optional(),
  coFinancing: FieldSchema(z.array(RateSchema)).optional(),
  eligibleCosts: FieldSchema(z.array(z.string())).optional(),
});
export type Conditions = z.infer<typeof ConditionsSchema>;

export const RequirementKindSchema = z.enum(['eligibility', 'formal', 'exclusions', 'process']);
export type RequirementKind = z.infer<typeof RequirementKindSchema>;

export const RequirementSchema = z.object({
  kind: RequirementKindSchema,
  heading: z.string().min(1),
  text: z.string(),
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const ProgramSchema = z.object({
  id: z.uuid(),
  url: z.url(),
  name: FieldSchema(z.string().min(1)),
  shortDescription: FieldSchema(z.string()),
  deadline: FieldSchema(DeadlineSchema),
  facts: z.record(z.string(), FieldSchema(z.string())),
  conditions: ConditionsSchema,
  requirements: z.array(RequirementSchema),
  bodySections: z.array(z.object({ heading: z.string(), text: z.string() })),
  issues: z.array(IssueSchema),
});
export type Program = z.infer<typeof ProgramSchema>;

export const RunReportSchema = z.object({
  scrapedAt: z.iso.datetime(),
  urls: z.number().int().nonnegative(),
  programmes: z.number().int().nonnegative(),
  strategies: z.array(z.object({ name: z.string(), found: z.number().int().nonnegative(), failed: z.boolean() })),
  disagreements: z.array(z.object({ url: z.string(), missedBy: z.array(z.string()) })),
  tierCounts: z.record(TierSchema, z.number().int().nonnegative()),
});
export type RunReport = z.infer<typeof RunReportSchema>;
