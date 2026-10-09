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
