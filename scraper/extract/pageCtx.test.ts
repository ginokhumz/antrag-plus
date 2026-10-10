import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { makeCtx } from './pageCtx.js';
import { CONDITION_HEADINGS, DEADLINE_LABELS } from './labels.js';

const ctxFor = async (name: string) => makeCtx(await readFile(`tests/fixtures/${name}.html`, 'utf8'));

describe('jsonLd', () => {
  it('reads the Article headline and description', async () => {
    const ctx = await ctxFor('junge-menschen');
    expect(ctx.jsonLd.Article?.headline).toBe('Förderung: Junge Menschen stärken');
    expect(ctx.jsonLd.Article?.description).toContain('junge Menschen');
  });

  it('returns an empty object rather than throwing when the JSON-LD is malformed', () => {
    const ctx = makeCtx('<script type="application/ld+json">{ "@type": broken,,, }</script>');
    expect(ctx.jsonLd).toEqual({});
  });

  it('returns an empty object when there is no JSON-LD at all', () => {
    expect(makeCtx('<html><body><p>nix</p></body></html>').jsonLd).toEqual({});
  });

  it('survives JSON-LD that is valid JSON but not the expected shape', () => {
    const ctx = makeCtx('<script type="application/ld+json">[1,2,3]</script>');
    expect(ctx.jsonLd.Article).toBeUndefined();
  });
});

describe('labelledFact', () => {
  it('reads a value from the shape where the label is bold and the value follows a br', async () => {
    const ctx = await ctxFor('junge-menschen');
    expect(ctx.allLabelledFacts()['Art der Förderung']).toBe('Projektförderung');
  });

  it('reads a value from the shape where label and value share one strong element', async () => {
    const ctx = await ctxFor('junge-menschen');
    expect(ctx.labelledFact(DEADLINE_LABELS)).toContain('15.10.2026');
  });

  it('repairs the mid-word element split in a fact value', async () => {
    const ctx = await ctxFor('junge-menschen');
    expect(ctx.allLabelledFacts()['Fokusthema']).toBe('Junge Menschen');
  });

  it('returns undefined when no label matches', async () => {
    const ctx = await ctxFor('junge-menschen');
    expect(ctx.labelledFact(['Nicht Vorhanden'])).toBeUndefined();
  });
});

describe('section', () => {
  it('returns the text under a matching heading', async () => {
    const ctx = await ctxFor('sport-kultur');
    const conditions = ctx.section(CONDITION_HEADINGS);
    expect(conditions).toContain('50.000');
    expect(conditions).toContain('90 Prozent');
  });

  it('does not reach into a later unrelated section', async () => {
    const ctx = await ctxFor('sport-kultur');
    expect(ctx.section(CONDITION_HEADINGS)).not.toContain('Was wir nicht fördern');
  });

  it('returns undefined when no heading matches', async () => {
    const ctx = await ctxFor('sport-kultur');
    expect(ctx.section(['Gibt Es Nicht'])).toBeUndefined();
  });
});

describe('firstProsePara and headingSections', () => {
  it('returns the lead paragraph', async () => {
    const ctx = await ctxFor('sport-kultur');
    expect(ctx.firstProsePara()).toContain('Menschen mit und ohne Behinderung');
  });

  it('lists heading and body pairs', async () => {
    const ctx = await ctxFor('sport-kultur');
    const headings = ctx.headingSections().map(s => s.heading);
    expect(headings).toContain('Unsere Konditionen');
    expect(headings).toContain('Was wir nicht fördern');
  });
});

describe('headingSections scoping — a heading owns the content that follows it, not its whole section', () => {
  it('does not give a heading the text of its sibling headings', async () => {
    const ctx = await ctxFor('sport-kultur');
    const conditions = ctx.headingSections().find(s => s.heading === 'Unsere Konditionen');
    expect(conditions!.text).not.toContain('Was wir nicht fördern');
    expect(conditions!.text).not.toContain('Wichtige Voraussetzungen');
  });

  it('scopes a sub-heading to its own value rather than the enclosing block', async () => {
    const ctx = await ctxFor('sport-kultur');
    const costs = ctx.headingSections().find(s => s.heading === 'Förderfähige Kosten');
    expect(costs!.text).toContain('Personalkosten');
    expect(costs!.text).not.toContain('50.000');
    expect(costs!.text).not.toContain('Eigenmittel');
  });

  it('gives sibling headings distinct text rather than one repeated blob', async () => {
    const ctx = await ctxFor('sport-kultur');
    const sections = ctx.headingSections();
    const zuschuss = sections.find(s => s.heading === 'Zuschuss')!;
    const finanzierung = sections.find(s => s.heading === 'Finanzierung')!;
    expect(zuschuss.text).not.toBe(finanzierung.text);
    expect(zuschuss.text).toContain('50.000');
    expect(finanzierung.text).toContain('Eigenmittel');
  });

  it('yields empty text for a heading whose panel is empty in the server HTML', async () => {
    const ctx = await ctxFor('sport-kultur');
    const req = ctx.headingSections().find(s => s.heading === 'Wichtige Voraussetzungen');
    expect(req!.text).toBe('');
  });
});
