import type { Field, Tier } from '@antrag-plus/schema';
import { field } from '@antrag-plus/schema';
import type { PageCtx } from './pageCtx.js';

export type Resolver<T> = { tier: Tier; name: string; run(ctx: PageCtx): T | undefined };

const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);

export type ResolverError = { name: string; message: string };

// A resolver that throws is a defect in this code, not an absent value. Without the
// reporter it would present as "field not found", which is the silent-failure shape
// the whole pipeline is built to refuse.
export const resolve = <T>(
  resolvers: Resolver<T>[],
  ctx: PageCtx,
  onError?: (error: ResolverError) => void,
): Field<T> | undefined => {
  for (const r of resolvers) {
    let value: T | undefined;
    try {
      value = r.run(ctx);
    } catch (err) {
      onError?.({ name: r.name, message: err instanceof Error ? err.message : String(err) });
      continue;
    }
    if (!isEmpty(value)) return field(value as T, r.tier, r.name);
  }
  return undefined;
};
