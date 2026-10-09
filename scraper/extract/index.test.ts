import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { extractPrograms } from './index.js';

const BASE = 'https://www.aktion-mensch.de/foerderung/foerderangebote';
const ALL = ['sport-kultur', 'junge-menschen', 'anschubfoerderung-arbeit', 'pauschalfoerderung', 'zeichen-setzen', 'aktion-mensch-stiftung'];
const programmesOf = async (name: string) =>
  extractPrograms(await readFile(`tests/fixtures/${name}.html`, 'utf8'), `${BASE}/${name}`);

describe('extractPrograms — tiers, which is the measurement the design note argues from', () => {
  it('falls through to the site tier for a split programme name, the one field that needs it', async () => {
    const ps = await programmesOf('pauschalfoerderung');
    expect(ps.map(p => p.name.value)).toEqual([
      'Pauschalförderung Bildungsveranstaltungen',
      'Pauschalförderung Ferienreisen',
    ]);
    for (const p of ps) expect(p.name.tier).toBe('site');
  });

  it('resolves name and description at the standard tier', async () => {
    const [p] = await programmesOf('sport-kultur');
    expect(p!.name.tier).toBe('standard');
    expect(p!.shortDescription.tier).toBe('standard');
  });

  it('resolves the deadline at the locale tier', async () => {
    const [p] = await programmesOf('sport-kultur');
    expect(p!.deadline.tier).toBe('locale');
    expect(p!.deadline.value).toEqual({ kind: 'window', start: '2026-09-01', end: '2026-10-15' });
  });

  it('records evidence that names what matched', async () => {
    const [p] = await programmesOf('sport-kultur');
    expect(p!.name.evidence).toContain('jsonld');
  });
});

describe('extractPrograms — conditions', () => {
  it('reads the project grant ceiling on sport-kultur', async () => {
    const [p] = await programmesOf('sport-kultur');
    expect(p!.conditions.grant?.value).toContainEqual({ amountEur: 50000, bound: 'max', per: 'project' });
  });

  it('reads the duration on anschubfoerderung as months converted from Jahre', async () => {
    const [p] = await programmesOf('anschubfoerderung-arbeit');
    expect(p!.conditions.maxDuration?.value.months).toBe(48);
  });

  it('lists the eligible cost categories on sport-kultur', async () => {
    const [p] = await programmesOf('sport-kultur');
    const costs = p!.conditions.eligibleCosts?.value ?? [];
    expect(costs.some(c => c.startsWith('Personalkosten'))).toBe(true);
    expect(costs.some(c => c.startsWith('Honorarkosten'))).toBe(true);
  });

  it('leaves conditions empty on aktion-mensch-stiftung and records why, since its terms are phase-scoped', async () => {
    const [p] = await programmesOf('aktion-mensch-stiftung');
    expect(p!.conditions.grant).toBeUndefined();
    expect(p!.conditions.maxDuration).toBeUndefined();
    expect(p!.issues.map(i => i.code)).toContain('phase-scoped-conditions');
  });

  it('reads pauschalfoerderung as rolling, since it states ganzjährig in an unheaded section', async () => {
    const ps = await programmesOf('pauschalfoerderung');
    for (const p of ps) {
      expect(p.deadline.value.kind).toBe('rolling');
      expect(p.deadline.tier).toBe('locale');
    }
  });

  it('does not read the approval cadence as a project duration on pauschalfoerderung', async () => {
    const ps = await programmesOf('pauschalfoerderung');
    for (const p of ps) expect(p.conditions.maxDuration?.value.months).not.toBe(2);
  });

  it('keeps the per-person-day rate out of the project basis', async () => {
    const ps = await programmesOf('pauschalfoerderung');
    const projectGrants = ps.flatMap(p => p.conditions.grant?.value ?? []).filter(m => m.per === 'project');
    expect(projectGrants.every(m => m.amountEur !== 50)).toBe(true);
  });
});

describe('extractPrograms — segmentation and identity', () => {
  it('splits pauschalfoerderung into two programmes with fragment-bearing urls', async () => {
    const ps = await programmesOf('pauschalfoerderung');
    expect(ps).toHaveLength(2);
    expect(ps.map(p => p.url)).toEqual([
      `${BASE}/pauschalfoerderung#151880`,
      `${BASE}/pauschalfoerderung#151904`,
    ]);
    expect(new Set(ps.map(p => p.id)).size).toBe(2);
  });

  it('produces identical ids on a second run over the same input', async () => {
    const first = await programmesOf('pauschalfoerderung');
    const second = await programmesOf('pauschalfoerderung');
    expect(first.map(p => p.id)).toEqual(second.map(p => p.id));
  });

  it('yields exactly one programme for every single-programme page', async () => {
    for (const name of ALL.filter(n => n !== 'pauschalfoerderung')) {
      expect(await programmesOf(name)).toHaveLength(1);
    }
  });
});

describe('extractPrograms — requirements', () => {
  it('classifies the misspelled Rahmenbedinungen heading despite the missing g', async () => {
    const [p] = await programmesOf('zeichen-setzen');
    const formal = p!.requirements.filter(r => r.kind === 'formal');
    expect(formal.map(r => r.heading)).toContain('Rahmenbedinungen');
  });

  it('classifies exclusions', async () => {
    const [p] = await programmesOf('sport-kultur');
    expect(p!.requirements.some(r => r.kind === 'exclusions')).toBe(true);
  });

  it('keeps the original heading as evidence of what was classified', async () => {
    const [p] = await programmesOf('junge-menschen');
    expect(p!.requirements.map(r => r.heading)).toContain('Wichtige Voraussetzungen');
  });
});

describe('extractPrograms — the §3 query the schema exists to answer', () => {
  it('excludes the per-person-day rate when filtering grants above 50000 per project', async () => {
    const all = (await Promise.all(ALL.map(n => programmesOf(n)))).flat();

    const matching = all.filter(p =>
      (p.conditions.grant?.value ?? []).some(m => m.per === 'project' && m.bound === 'max' && m.amountEur > 50000),
    );

    expect(matching.map(p => p.name.value.replace(/\u00ad/g, ''))).toEqual([
      'Förderung: Junge Menschen stärken',
      'Förderung: Arbeitsplätze in Inklusionsunternehmen und Zuverdienstbetrieben',
    ]);
    expect(matching.some(p => p.url.includes('pauschalfoerderung'))).toBe(false);
  });
});
