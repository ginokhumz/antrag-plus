import { describe, it, expect } from 'vitest';
import { ProgramSchema, DeadlineSchema, ConditionsSchema, field } from './index.js';

const validProgram = {
  id: '782ed2f2-31b1-5165-b3ac-919eceb6eb6d',
  url: 'https://www.aktion-mensch.de/foerderung/foerderangebote/sport-kultur',
  name: field('Förderung: Sport und Kultur vor Ort', 'standard', 'jsonld.Article.headline'),
  shortDescription: field('Wir wollen Menschen zusammenbringen.', 'standard', 'jsonld.Article.description'),
  deadline: field({ kind: 'window', start: '2026-09-01', end: '2026-10-15' }, 'locale', 'label:Aktuelle Antragsphase'),
  facts: {},
  conditions: {},
  requirements: [],
  bodySections: [],
  issues: [],
};

describe('ProgramSchema', () => {
  it('accepts a valid programme', () => {
    expect(ProgramSchema.parse(validProgram).id).toBe(validProgram.id);
  });

  it('rejects a non-uuid id', () => {
    expect(() => ProgramSchema.parse({ ...validProgram, id: 'sport-kultur' })).toThrow();
  });

  it('rejects a field missing its evidence', () => {
    const bad = { ...validProgram, name: { value: 'x', tier: 'standard' } };
    expect(() => ProgramSchema.parse(bad)).toThrow();
  });
});

describe('DeadlineSchema', () => {
  it('discriminates the three kinds', () => {
    expect(DeadlineSchema.parse({ kind: 'rolling', cadence: 'sechs Mal jährlich' }).kind).toBe('rolling');
    expect(DeadlineSchema.parse({ kind: 'unknown' }).kind).toBe('unknown');
    expect(DeadlineSchema.parse({ kind: 'window', end: '2026-10-15' }).kind).toBe('window');
  });

  it('requires an end date on a window', () => {
    expect(() => DeadlineSchema.parse({ kind: 'window', start: '2026-09-01' })).toThrow();
  });

  it('rejects an unknown kind', () => {
    expect(() => DeadlineSchema.parse({ kind: 'maybe' })).toThrow();
  });
});

describe('ConditionsSchema', () => {
  it('accepts an empty object, which is how aktion-mensch-stiftung is represented', () => {
    expect(ConditionsSchema.parse({})).toEqual({});
  });
});
