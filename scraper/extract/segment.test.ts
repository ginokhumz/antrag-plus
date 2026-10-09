import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import { prune } from './prune.js';
import { segment } from './segment.js';

const segmentsOf = async (name: string) => {
  const $ = cheerio.load(await readFile(`tests/fixtures/${name}.html`, 'utf8'));
  prune($);
  return segment($);
};

describe('segment', () => {
  it('splits pauschalfoerderung into two programmes with the section ids the source assigns', async () => {
    const segs = await segmentsOf('pauschalfoerderung');
    expect(segs).toHaveLength(2);
    expect(segs.map(s => s.sectionId)).toEqual(['151880', '151904']);
  });

  it('gives each pauschalfoerderung segment its own conditions text', async () => {
    const segs = await segmentsOf('pauschalfoerderung');
    expect(segs[0]!.html).toContain('Bildungsveranstaltungen');
    expect(segs[1]!.html).toContain('Ferienreisen');
    expect(segs[0]!.html).not.toContain('Ferienreisen');
  });

  it('returns a single unidentified segment for a single-programme page', async () => {
    for (const name of ['sport-kultur', 'junge-menschen', 'zeichen-setzen', 'anschubfoerderung-arbeit']) {
      const segs = await segmentsOf(name);
      expect(segs).toHaveLength(1);
      expect(segs[0]!.sectionId).toBeUndefined();
    }
  });

  it('returns a single segment for a page with no conditions block at all', async () => {
    const segs = await segmentsOf('aktion-mensch-stiftung');
    expect(segs).toHaveLength(1);
    expect(segs[0]!.sectionId).toBeUndefined();
  });

  it('keeps the approval-cadence sentence out of the first segment conditions region', async () => {
    const segs = await segmentsOf('pauschalfoerderung');
    expect(segs[0]!.html).toContain('Förderkonditionen');
  });
});

describe('segment — a collapsed or unanchored split must not pass silently', () => {
  const page = (body: string) => {
    const $ = cheerio.load(`<html><body>${body}</body></html>`);
    prune($);
    return segment($);
  };

  it('reports when two conditions blocks share one anchor, instead of merging in silence', () => {
    const segs = page(`
      <section><h2 id="111-headline">Programm A</h2><p>a</p></section>
      <section><h3>Unsere Konditionen</h3><p>Zuschuss maximal 1.000 Euro</p></section>
      <section><h3>Förderkonditionen</h3><p>Zuschuss maximal 2.000 Euro</p></section>
    `);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.issues.map(i => i.code)).toContain('segments-collapsed');
  });

  it('reports when the anchor convention is absent, rather than colliding ids downstream', () => {
    const segs = page(`
      <section><h2>Programm A</h2><p>a</p></section>
      <section><h3>Unsere Konditionen</h3><p>Zuschuss maximal 1.000 Euro</p></section>
      <section><h2>Programm B</h2><p>b</p></section>
      <section><h3>Förderkonditionen</h3><p>Zuschuss maximal 2.000 Euro</p></section>
    `);
    expect(segs.every(s => s.sectionId === undefined)).toBe(true);
    expect(segs.flatMap(s => s.issues).map(i => i.code)).toContain('segment-anchor-missing');
  });

  it('carries no issues on the real multi-programme page', async () => {
    const segs = await segmentsOf('pauschalfoerderung');
    expect(segs.flatMap(s => s.issues)).toEqual([]);
  });

  it('carries no issues on a single-programme page', async () => {
    const segs = await segmentsOf('sport-kultur');
    expect(segs.flatMap(s => s.issues)).toEqual([]);
  });
});
