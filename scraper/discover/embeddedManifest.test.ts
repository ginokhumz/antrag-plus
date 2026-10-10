import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { embeddedManifest } from './embeddedManifest.js';

const listing = await readFile('tests/fixtures/listing.html', 'utf8');
const deps = {
  listingUrl: 'https://www.aktion-mensch.de/foerderung/foerderangebote',
  fetchText: async () => listing,
};

describe('embeddedManifest', () => {
  it('finds all six programme URLs in the RSC payload', async () => {
    const urls = await embeddedManifest.run(deps);
    expect(urls).toHaveLength(6);
    expect(urls).toEqual(expect.arrayContaining([
      'https://www.aktion-mensch.de/foerderung/foerderangebote/zeichen-setzen',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/aktion-mensch-stiftung',
    ]));
  });

  it('finds the two programmes the rendered anchors omit', async () => {
    const urls = await embeddedManifest.run(deps);
    const omittedByMarkup = urls.filter(u => /zeichen-setzen|aktion-mensch-stiftung/.test(u));
    expect(omittedByMarkup).toHaveLength(2);
  });

  it('excludes the overview entry that shares the listing URL', async () => {
    expect(await embeddedManifest.run(deps)).not.toContain(deps.listingUrl);
  });

  it('returns an empty array on a page with no embedded payload', async () => {
    expect(await embeddedManifest.run({ ...deps, fetchText: async () => '<html><body>nix</body></html>' })).toEqual([]);
  });

  it('returns an empty array when the page cannot be fetched', async () => {
    expect(await embeddedManifest.run({ ...deps, fetchText: async () => undefined })).toEqual([]);
  });
});
