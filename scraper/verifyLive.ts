import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFetcher } from './fetch.js';

const digest = (s: string): string => createHash('sha256').update(s).digest('hex');

export const diffAgainstFixtures = async (deps: {
  fixtureDir: string;
  urls: Record<string, string>;
  fetchText(url: string): Promise<string | undefined>;
}): Promise<{ changed: string[]; unreachable: string[] }> => {
  const changed: string[] = [];
  const unreachable: string[] = [];

  for (const [url, basename] of Object.entries(deps.urls)) {
    const live = await deps.fetchText(url);
    if (live === undefined) {
      unreachable.push(url);
      continue;
    }
    let fixture: string;
    try {
      fixture = await readFile(join(deps.fixtureDir, `${basename}.html`), 'utf8');
    } catch {
      changed.push(url);
      continue;
    }
    if (digest(live) !== digest(fixture)) changed.push(url);
  }

  return { changed, unreachable };
};

if (process.argv[1]?.endsWith('verifyLive.ts')) {
  const BASE = 'https://www.aktion-mensch.de/foerderung/foerderangebote';
  const urls: Record<string, string> = {
    [BASE]: 'listing',
    [`${BASE}/sport-kultur`]: 'sport-kultur',
    [`${BASE}/junge-menschen`]: 'junge-menschen',
    [`${BASE}/anschubfoerderung-arbeit`]: 'anschubfoerderung-arbeit',
    [`${BASE}/pauschalfoerderung`]: 'pauschalfoerderung',
    [`${BASE}/zeichen-setzen`]: 'zeichen-setzen',
    [`${BASE}/aktion-mensch-stiftung`]: 'aktion-mensch-stiftung',
  };

  const fetcher = createFetcher({
    cacheDir: 'data/verify-cache',
    get: async (url, headers) => {
      const res = await globalThis.fetch(url, { headers });
      return {
        status: res.status,
        body: Buffer.from(await res.arrayBuffer()),
        headers: Object.fromEntries(res.headers.entries()),
      };
    },
  });

  const result = await diffAgainstFixtures({
    fixtureDir: 'tests/fixtures',
    urls,
    fetchText: async url => {
      const r = await fetcher.fetch(url);
      return r.status === 200 ? r.html : undefined;
    },
  });

  if (result.changed.length === 0 && result.unreachable.length === 0) {
    console.log('fixtures match the live site');
  } else {
    for (const url of result.changed) console.log(`changed:     ${url}`);
    for (const url of result.unreachable) console.log(`unreachable: ${url}`);
    console.log('\nThe site moved, not the code. Re-run scripts/fetch-fixtures.ts and review the test failures.');
  }
}
