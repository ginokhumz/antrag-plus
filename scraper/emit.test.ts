import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { field } from '@antrag-plus/schema';
import type { Program } from '@antrag-plus/schema';
import { emit } from './emit.js';
import { scrape } from './run.js';

let outDir: string;
beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'antrag-emit-'));
  return () => rm(outDir, { recursive: true, force: true });
});

const programme = (id: string, url: string): Program => ({
  id,
  url,
  name: field('Name', 'standard', 'jsonld'),
  shortDescription: field('Beschreibung', 'standard', 'jsonld'),
  deadline: field({ kind: 'unknown' }, 'locale', 'none'),
  facts: {},
  conditions: {},
  requirements: [],
  bodySections: [],
  issues: [],
});

const A = '782ed2f2-31b1-5165-b3ac-919eceb6eb6d';
const B = 'c59d5f5e-76bf-59b5-9533-bbd050563e8b';
const report = { strategies: [{ name: 's', found: 1, failed: false }], union: ['https://x.test/a'], disagreements: [] };

describe('emit', () => {
  it('writes programs.json, the run report and the raw html', async () => {
    await emit({
      outDir,
      programmes: [programme(A, 'https://x.test/a')],
      report,
      rawHtml: new Map([['https://x.test/a', '<p>a</p>']]),
    });
    const written = JSON.parse(await readFile(join(outDir, 'programs.json'), 'utf8'));
    expect(written).toHaveLength(1);
    expect(JSON.parse(await readFile(join(outDir, 'run-report.json'), 'utf8')).programmes).toBe(1);
    expect(await readFile(join(outDir, 'raw', 'a.html'), 'utf8')).toBe('<p>a</p>');
  });

  it('counts urls and programmes separately, so a lost sub-programme is visible', async () => {
    const r = await emit({
      outDir,
      programmes: [programme(A, 'https://x.test/a#1'), programme(B, 'https://x.test/a#2')],
      report,
      rawHtml: new Map(),
    });
    expect(r.urls).toBe(1);
    expect(r.programmes).toBe(2);
  });

  it('throws on a duplicate id rather than letting one record overwrite another', async () => {
    await expect(
      emit({ outDir, programmes: [programme(A, 'https://x.test/a'), programme(A, 'https://x.test/b')], report, rawHtml: new Map() }),
    ).rejects.toThrow(/duplicate id/i);
  });

  it('reports tier counts so the design note can quote a measured ratio', async () => {
    const r = await emit({ outDir, programmes: [programme(A, 'https://x.test/a')], report, rawHtml: new Map() });
    expect(r.tierCounts.standard).toBeGreaterThan(0);
  });
});

describe('scrape', () => {
  const listingUrl = 'https://www.aktion-mensch.de/foerderung/foerderangebote';

  const fixtures = async (): Promise<Record<string, string>> => ({
    [listingUrl]: await readFile('tests/fixtures/listing.html', 'utf8'),
    'https://www.aktion-mensch.de/robots.txt': await readFile('tests/fixtures/robots.txt', 'utf8'),
    'https://www.aktion-mensch.de/index-sitemap.xml': await readFile('tests/fixtures/sitemap-index.xml', 'utf8'),
    'https://www.aktion-mensch.de/sitemap.xml': await readFile('tests/fixtures/sitemap-main.xml', 'utf8'),
    'https://www.aktion-mensch.de/meta/sitemap.xml': await readFile('tests/fixtures/sitemap-meta.xml', 'utf8'),
    [`${listingUrl}/sport-kultur`]: await readFile('tests/fixtures/sport-kultur.html', 'utf8'),
    [`${listingUrl}/junge-menschen`]: await readFile('tests/fixtures/junge-menschen.html', 'utf8'),
    [`${listingUrl}/anschubfoerderung-arbeit`]: await readFile('tests/fixtures/anschubfoerderung-arbeit.html', 'utf8'),
    [`${listingUrl}/pauschalfoerderung`]: await readFile('tests/fixtures/pauschalfoerderung.html', 'utf8'),
    [`${listingUrl}/zeichen-setzen`]: await readFile('tests/fixtures/zeichen-setzen.html', 'utf8'),
    [`${listingUrl}/aktion-mensch-stiftung`]: await readFile('tests/fixtures/aktion-mensch-stiftung.html', 'utf8'),
  });

  const fetcherFor = (pages: Record<string, string>) => async (url: string) => {
    const html = pages[url];
    return html === undefined
      ? { html: '', status: 404, fetchedAt: new Date().toISOString(), fromCache: false }
      : { html, status: 200, fetchedAt: new Date().toISOString(), fromCache: false };
  };

  it('produces six urls and seven programmes end to end', async () => {
    const r = await scrape({ listingUrl, fetch: fetcherFor(await fixtures()), outDir });
    expect(r.urls).toBe(6);
    expect(r.programmes).toBe(7);
  });

  it('keeps a programme whose detail page 404s, with an issue, and continues the run', async () => {
    const pages = await fixtures();
    delete pages[`${listingUrl}/zeichen-setzen`];
    const r = await scrape({ listingUrl, fetch: fetcherFor(pages), outDir });
    const written: Program[] = JSON.parse(await readFile(join(outDir, 'programs.json'), 'utf8'));
    const stub = written.find(p => p.url.includes('zeichen-setzen'));
    expect(stub).toBeDefined();
    expect(stub!.issues.map(i => i.code)).toContain('fetch-failed');
    expect(r.programmes).toBe(7);
  });

  it('throws rather than reporting success when discovery finds nothing', async () => {
    await expect(scrape({ listingUrl, fetch: fetcherFor({}), outDir })).rejects.toThrow(/no programmes discovered/i);
  });
});

describe('scrape — nothing disappears without a trace', () => {
  const listingUrl = 'https://www.aktion-mensch.de/foerderung/foerderangebote';

  const fixturePages = async (): Promise<Record<string, string>> => ({
    [listingUrl]: await readFile('tests/fixtures/listing.html', 'utf8'),
    'https://www.aktion-mensch.de/robots.txt': await readFile('tests/fixtures/robots.txt', 'utf8'),
    'https://www.aktion-mensch.de/index-sitemap.xml': await readFile('tests/fixtures/sitemap-index.xml', 'utf8'),
    'https://www.aktion-mensch.de/sitemap.xml': await readFile('tests/fixtures/sitemap-main.xml', 'utf8'),
    'https://www.aktion-mensch.de/meta/sitemap.xml': await readFile('tests/fixtures/sitemap-meta.xml', 'utf8'),
    [`${listingUrl}/sport-kultur`]: await readFile('tests/fixtures/sport-kultur.html', 'utf8'),
    [`${listingUrl}/junge-menschen`]: await readFile('tests/fixtures/junge-menschen.html', 'utf8'),
    [`${listingUrl}/anschubfoerderung-arbeit`]: await readFile('tests/fixtures/anschubfoerderung-arbeit.html', 'utf8'),
    [`${listingUrl}/pauschalfoerderung`]: await readFile('tests/fixtures/pauschalfoerderung.html', 'utf8'),
    [`${listingUrl}/zeichen-setzen`]: await readFile('tests/fixtures/zeichen-setzen.html', 'utf8'),
    [`${listingUrl}/aktion-mensch-stiftung`]: await readFile('tests/fixtures/aktion-mensch-stiftung.html', 'utf8'),
  });

  const fetcherFor = (pages: Record<string, string>, throwOn?: string) => async (url: string) => {
    if (throwOn !== undefined && url.includes(throwOn)) throw new Error('ECONNRESET');
    const html = pages[url];
    return html === undefined
      ? { html: '', status: 404, fetchedAt: new Date().toISOString(), fromCache: false }
      : { html, status: 200, fetchedAt: new Date().toISOString(), fromCache: false };
  };

  it('survives a network rejection on one detail page and still emits the rest', async () => {
    const r = await scrape({ listingUrl, fetch: fetcherFor(await fixturePages(), 'zeichen-setzen'), outDir });
    expect(r.programmes).toBe(7);
    const written: Program[] = JSON.parse(await readFile(join(outDir, 'programs.json'), 'utf8'));
    const stub = written.find(p => p.url.includes('zeichen-setzen'));
    expect(stub!.issues.map(i => i.code)).toContain('fetch-failed');
  });

  it('counts a record rejected by the schema instead of discarding it in silence', async () => {
    const pages = await fixturePages();
    pages[`${listingUrl}/sport-kultur`] = '<html><body><section><h2>Ohne alles</h2></section></body></html>';
    const r = await scrape({ listingUrl, fetch: fetcherFor(pages), outDir });
    expect(r.rejected).toBeGreaterThan(0);
    expect(r.rejectedUrls).toContain(`${listingUrl}/sport-kultur`);
  });

  it('reports zero rejections on a clean run', async () => {
    const r = await scrape({ listingUrl, fetch: fetcherFor(await fixturePages()), outDir });
    expect(r.rejected).toBe(0);
    expect(r.rejectedUrls).toEqual([]);
  });
});

describe('emit — tierCounts must count resolutions, not placeholders', () => {
  const withFields = (over: Partial<Program>): Program => ({ ...programme(A, 'https://x.test/a'), ...over });

  it('excludes a field whose evidence is none, since it resolved from nothing', async () => {
    const p = withFields({ deadline: field({ kind: 'unknown' }, 'locale', 'none') });
    const r = await emit({ outDir, programmes: [p], report, rawHtml: new Map() });
    expect(r.tierCounts.locale).toBe(0);
  });

  it('counts a field that genuinely resolved', async () => {
    const p = withFields({ deadline: field({ kind: 'window', end: '2026-10-15' }, 'locale', 'label:Frist') });
    const r = await emit({ outDir, programmes: [p], report, rawHtml: new Map() });
    expect(r.tierCounts.locale).toBe(1);
  });

  it('reports facts separately rather than inflating the tier ratio with them', async () => {
    const p = withFields({ facts: { 'Art der Förderung': field('Projektförderung', 'locale', 'label:Art der Förderung') } });
    const r = await emit({ outDir, programmes: [p], report, rawHtml: new Map() });
    expect(r.factCount).toBe(1);
    expect(r.tierCounts.locale).toBe(0);
  });

  it('counts the named contract fields and nothing else', async () => {
    const r = await emit({ outDir, programmes: [programme(A, 'https://x.test/a')], report, rawHtml: new Map() });
    const total = Object.values(r.tierCounts).reduce((a, b) => a + b, 0);
    expect(total).toBe(2);
  });
});
