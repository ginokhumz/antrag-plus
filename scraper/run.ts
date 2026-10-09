import { field } from '@antrag-plus/schema';
import type { Issue, Program, RunReport } from '@antrag-plus/schema';
import { programId } from '@antrag-plus/schema/id.js';
import { canonicalUrl } from './discover/canonicalUrl.js';
import { embeddedManifest } from './discover/embeddedManifest.js';
import { linkCluster } from './discover/linkCluster.js';
import { discover } from './discover/reconcile.js';
import { sitemapIndex } from './discover/sitemapIndex.js';
import { emit } from './emit.js';
import { extractPrograms } from './extract/index.js';
import { createFetcher, type Fetched } from './fetch.js';
import { parseRobots } from './robots.js';
import { validateProgram } from './validate.js';

const LISTING_URL = 'https://www.aktion-mensch.de/foerderung/foerderangebote';

const unreachable = (url: string, status: number, reason?: string): Program => {
  const issue: Issue = {
    field: 'page',
    code: 'fetch-failed',
    message: reason ?? `detail page returned ${status}; fields unresolved`,
  };
  const slug = new URL(url).pathname.split('/').filter(Boolean).pop() ?? url;
  return {
    id: programId(new URL(url).pathname),
    url,
    name: field(slug, 'site', 'url-path'),
    shortDescription: field('', 'site', 'none'),
    deadline: field({ kind: 'unknown' as const }, 'locale', 'none'),
    facts: {},
    conditions: {},
    requirements: [],
    bodySections: [],
    issues: [issue],
  };
};

export const scrape = async (deps: {
  listingUrl: string;
  fetch(url: string): Promise<Fetched>;
  outDir: string;
}): Promise<RunReport> => {
  const fetchText = async (url: string): Promise<string | undefined> => {
    const r = await deps.fetch(url);
    return r.status === 200 ? r.html : undefined;
  };

  const report = await discover([sitemapIndex, embeddedManifest, linkCluster], {
    listingUrl: deps.listingUrl,
    fetchText,
  });

  if (report.union.length === 0) {
    throw new Error('no programmes discovered; refusing to report success on an empty result');
  }

  const programmes: Program[] = [];
  const rawHtml = new Map<string, string>();
  const rejectedUrls: string[] = [];

  for (const url of report.union) {
    // A rejection here — DNS, reset, TLS, timeout — must cost one programme, not the
    // whole run: five already-extracted records should not be thrown away by the sixth.
    let res: Fetched;
    try {
      res = await deps.fetch(url);
    } catch (err) {
      programmes.push(unreachable(url, 0, err instanceof Error ? err.message : 'network error'));
      continue;
    }

    if (res.status !== 200) {
      programmes.push(unreachable(url, res.status));
      continue;
    }

    rawHtml.set(url, res.html);
    for (const candidate of extractPrograms(res.html, canonicalUrl(url) ?? url)) {
      const validated = validateProgram(candidate);
      if (validated) {
        programmes.push(validated.program);
      } else {
        // The record cannot be served or referenced, but a vanished programme must
        // still be countable: programmes alone would make the loss invisible.
        rejectedUrls.push(url);
      }
    }
  }

  return emit({ outDir: deps.outDir, programmes, report, rawHtml, rejectedUrls });
};

const httpGet = async (url: string, headers: Record<string, string>, signal: AbortSignal) => {
  const res = await globalThis.fetch(url, { headers, signal });
  return {
    status: res.status,
    body: Buffer.from(await res.arrayBuffer()),
    headers: Object.fromEntries(res.headers.entries()),
  };
};

if (process.argv[1]?.endsWith('run.ts')) {
  // robots.txt is fetched and applied to every later request, which is what makes
  // "honours robots" true of the running scraper rather than only of the parser.
  const origin = new URL(LISTING_URL).origin;
  const bootstrap = createFetcher({ cacheDir: 'data/cache', get: httpGet });
  const robotsBody = await bootstrap.fetch(`${origin}/robots.txt`);
  const robots = robotsBody.status === 200 ? parseRobots(robotsBody.html) : undefined;

  const fetcher = createFetcher({
    cacheDir: 'data/cache',
    get: httpGet,
    ...(robots ? { robots } : {}),
  });

  try {
    const report = await scrape({ listingUrl: LISTING_URL, fetch: fetcher.fetch, outDir: 'data' });
    console.log(`urls: ${report.urls}  programmes: ${report.programmes}  rejected: ${report.rejected}`);
    console.log(`tiers: ${JSON.stringify(report.tierCounts)}`);
    for (const url of report.rejectedUrls) console.error(`rejected by schema: ${url}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
