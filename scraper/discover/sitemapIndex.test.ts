import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { sitemapIndex } from './sitemapIndex.js';

const fixtures: Record<string, string> = {
  'https://www.aktion-mensch.de/robots.txt': await readFile('tests/fixtures/robots.txt', 'utf8'),
  'https://www.aktion-mensch.de/index-sitemap.xml': await readFile('tests/fixtures/sitemap-index.xml', 'utf8'),
  'https://www.aktion-mensch.de/sitemap.xml': await readFile('tests/fixtures/sitemap-main.xml', 'utf8'),
  'https://www.aktion-mensch.de/meta/sitemap.xml': await readFile('tests/fixtures/sitemap-meta.xml', 'utf8'),
};

const deps = {
  listingUrl: 'https://www.aktion-mensch.de/foerderung/foerderangebote',
  fetchText: async (url: string) => fixtures[url],
};

describe('sitemapIndex', () => {
  it('finds all six programme URLs by walking the sitemap index', async () => {
    const urls = await sitemapIndex.run(deps);
    expect(urls).toHaveLength(6);
    expect(urls).toEqual(expect.arrayContaining([
      'https://www.aktion-mensch.de/foerderung/foerderangebote/sport-kultur',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/junge-menschen',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/anschubfoerderung-arbeit',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/pauschalfoerderung',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/zeichen-setzen',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/aktion-mensch-stiftung',
    ]));
  });

  it('excludes the listing URL itself from the programme set', async () => {
    expect(await sitemapIndex.run(deps)).not.toContain(deps.listingUrl);
  });

  it('finds nothing in the obvious sitemap alone, which is the whole point of walking the index', async () => {
    const onlyMain = { ...deps, fetchText: async (url: string) =>
      url.endsWith('/sitemap.xml') && !url.includes('/meta/') ? fixtures['https://www.aktion-mensch.de/sitemap.xml'] : undefined };
    expect(await sitemapIndex.run(onlyMain)).toHaveLength(0);
  });

  it('tolerates a sub-sitemap that cannot be fetched', async () => {
    const patchy = { ...deps, fetchText: async (url: string) =>
      url.includes('lotterie') ? undefined : fixtures[url] };
    expect(await sitemapIndex.run(patchy)).toHaveLength(6);
  });

  it('returns an empty array when robots.txt is unavailable', async () => {
    expect(await sitemapIndex.run({ ...deps, fetchText: async () => undefined })).toEqual([]);
  });
});
