import { describe, it, expect } from 'vitest';
import { field } from '@antrag-plus/schema';
import { validateProgram } from './validate.js';

const base = {
  id: '782ed2f2-31b1-5165-b3ac-919eceb6eb6d',
  url: 'https://www.aktion-mensch.de/foerderung/foerderangebote/sport-kultur',
  name: field('Sport und Kultur', 'standard', 'jsonld'),
  shortDescription: field('Beschreibung', 'standard', 'jsonld'),
  deadline: field({ kind: 'window', end: '2026-10-15' }, 'locale', 'label'),
  facts: {},
  conditions: {},
  requirements: [],
  bodySections: [],
  issues: [],
};

describe('validateProgram', () => {
  it('passes a valid programme through unchanged', () => {
    const r = validateProgram(base);
    expect(r?.program.id).toBe(base.id);
    expect(r?.issues).toEqual([]);
  });

  it('degrades an unparseable deadline to unknown and keeps the record', () => {
    const r = validateProgram({ ...base, deadline: field({ kind: 'window', end: '15.10.2026' }, 'locale', 'label') });
    expect(r?.program.deadline.value).toEqual({ kind: 'unknown' });
    expect(r?.issues.map(i => i.field)).toContain('deadline');
  });

  it('degrades malformed conditions to empty and keeps the record', () => {
    const r = validateProgram({ ...base, conditions: { grant: field([{ amountEur: -5, bound: 'max', per: 'project' }], 'locale', 's') } });
    expect(r?.program.conditions.grant).toBeUndefined();
    expect(r?.issues.map(i => i.field)).toContain('conditions');
  });

  it('drops malformed requirements rather than the record', () => {
    const r = validateProgram({ ...base, requirements: [{ kind: 'nonsense', heading: 'h', text: 't' }] });
    expect(r?.program.requirements).toEqual([]);
    expect(r?.issues.map(i => i.field)).toContain('requirements');
  });

  it('returns undefined only when identity itself is unusable', () => {
    expect(validateProgram({ ...base, id: 'not-a-uuid' })).toBeUndefined();
    expect(validateProgram({ ...base, url: 'not-a-url' })).toBeUndefined();
    expect(validateProgram(null)).toBeUndefined();
  });

  it('preserves issues the extractor already recorded', () => {
    const prior = { field: 'conditions', code: 'unclassified-basis', message: 'x', raw: '1.000 Euro' };
    const r = validateProgram({ ...base, issues: [prior] });
    expect(r?.issues).toContainEqual(prior);
  });
});
