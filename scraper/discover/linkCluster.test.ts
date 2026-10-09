import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { linkCluster } from './linkCluster.js';

const listing = await readFile('tests/fixtures/listing.html', 'utf8');
const deps = {
  listingUrl: 'https://www.aktion-mensch.de/foerderung/foerderangebote',
  fetchText: async () => listing,
};

describe('linkCluster', () => {
  it('finds the four programmes reachable from rendered anchors', async () => {
    const urls = await linkCluster.run(deps);
    expect(urls).toHaveLength(4);
    expect(urls).toEqual(expect.arrayContaining([
      'https://www.aktion-mensch.de/foerderung/foerderangebote/sport-kultur',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/junge-menschen',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/pauschalfoerderung',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/anschubfoerderung-arbeit',
    ]));
  });

  it('misses the two programmes that exist only in the embedded payload, which reconcile must surface', async () => {
    const urls = await linkCluster.run(deps);
    expect(urls.some(u => u.includes('zeichen-setzen'))).toBe(false);
    expect(urls.some(u => u.includes('aktion-mensch-stiftung'))).toBe(false);
  });

  it('ignores same-origin links outside the listing path', async () => {
    const urls = await linkCluster.run(deps);
    expect(urls.every(u => u.startsWith(`${deps.listingUrl}/`))).toBe(true);
  });

  it('ignores off-origin links', async () => {
    const html = `<a href="${deps.listingUrl}/a">a</a><a href="${deps.listingUrl}/b">b</a><a href="https://other.test/foerderung/foerderangebote/c">c</a>`;
    const urls = await linkCluster.run({ ...deps, fetchText: async () => html });
    expect(urls).toHaveLength(2);
  });

  it('requires at least two members before treating a path group as a cluster', async () => {
    const html = `<a href="${deps.listingUrl}/only">only</a>`;
    expect(await linkCluster.run({ ...deps, fetchText: async () => html })).toEqual([]);
  });

  it('returns an empty array when the page cannot be fetched', async () => {
    expect(await linkCluster.run({ ...deps, fetchText: async () => undefined })).toEqual([]);
  });
});
