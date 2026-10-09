import type { Field, Tier } from '@antrag-plus/schema';
import { field } from '@antrag-plus/schema';
import type { PageCtx } from './pageCtx.js';

export type Resolver<T> = { tier: Tier; name: string; run(ctx: PageCtx): T | undefined };

const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);

export const resolve = <T>(resolvers: Resolver<T>[], ctx: PageCtx): Field<T> | undefined => {
  for (const r of resolvers) {
    let value: T | undefined;
    try {
      value = r.run(ctx);
    } catch {
      continue;
    }
    if (!isEmpty(value)) return field(value as T, r.tier, r.name);
  }
  return undefined;
};
