import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { discover } from './reconcile.js';
import { sitemapIndex } from './sitemapIndex.js';
import { embeddedManifest } from './embeddedManifest.js';
import { linkCluster } from './linkCluster.js';
import type { Strategy } from './sitemapIndex.js';

const listingUrl = 'https://www.aktion-mensch.de/foerderung/foerderangebote';
const fixtures: Record<string, string> = {
  [listingUrl]: await readFile('tests/fixtures/listing.html', 'utf8'),
  'https://www.aktion-mensch.de/robots.txt': await readFile('tests/fixtures/robots.txt', 'utf8'),
  'https://www.aktion-mensch.de/index-sitemap.xml': await readFile('tests/fixtures/sitemap-index.xml', 'utf8'),
  'https://www.aktion-mensch.de/sitemap.xml': await readFile('tests/fixtures/sitemap-main.xml', 'utf8'),
  'https://www.aktion-mensch.de/meta/sitemap.xml': await readFile('tests/fixtures/sitemap-meta.xml', 'utf8'),
};
const deps = { listingUrl, fetchText: async (u: string) => fixtures[u] };
const all = [sitemapIndex, embeddedManifest, linkCluster];

const stub = (name: string, urls: string[]): Strategy => ({ name, run: async () => urls });

describe('discover', () => {
  it('records the real per-strategy counts', async () => {
    const r = await discover(all, deps);
    expect(r.strategies).toEqual([
      { name: 'sitemapIndex', found: 6, failed: false },
      { name: 'embeddedManifest', found: 6, failed: false },
      { name: 'linkCluster', found: 4, failed: false },
    ]);
  });

  it('unions to six URLs', async () => {
    expect((await discover(all, deps)).union).toHaveLength(6);
  });

  it('names exactly the two URLs linkCluster missed', async () => {
    const r = await discover(all, deps);
    expect(r.disagreements).toHaveLength(2);
    expect(r.disagreements.map(d => d.url).sort()).toEqual([
      `${listingUrl}/aktion-mensch-stiftung`,
      `${listingUrl}/zeichen-setzen`,
    ]);
    for (const d of r.disagreements) expect(d.missedBy).toEqual(['linkCluster']);
  });

  it('reports no disagreement when every strategy agrees', async () => {
    const r = await discover([stub('a', [`${listingUrl}/x`]), stub('b', [`${listingUrl}/x`])], deps);
    expect(r.disagreements).toEqual([]);
  });

  it('canonicalizes before unioning, so two spellings of one URL count once', async () => {
    const r = await discover(
      [stub('a', [`${listingUrl}/x`]), stub('b', [`${listingUrl}/x/`]), stub('c', [`${listingUrl}/x?utm=1`])],
      deps,
    );
    expect(r.union).toEqual([`${listingUrl}/x`]);
    expect(r.disagreements).toEqual([]);
  });

  it('records a throwing strategy as failed without aborting the run', async () => {
    const boom: Strategy = { name: 'boom', run: async () => { throw new Error('network gone'); } };
    const r = await discover([boom, stub('ok', [`${listingUrl}/x`, `${listingUrl}/y`])], deps);
    expect(r.strategies[0]).toEqual({ name: 'boom', found: 0, failed: true });
    expect(r.union).toHaveLength(2);
  });

  it('omits a failed strategy from disagreements, since it missed everything for a different reason', async () => {
    const boom: Strategy = { name: 'boom', run: async () => { throw new Error('x'); } };
    const r = await discover([boom, stub('ok', [`${listingUrl}/x`])], deps);
    expect(r.disagreements).toEqual([]);
  });

  it('returns an empty union when every strategy finds nothing', async () => {
    const r = await discover([stub('a', []), stub('b', [])], deps);
    expect(r.union).toEqual([]);
  });
});
