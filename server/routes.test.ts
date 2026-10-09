import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { field } from '@antrag-plus/schema';
import type { Program, RunReport } from '@antrag-plus/schema';
import { createApp } from './index.js';
import { loadSnapshot } from './snapshot.js';

const ID = '782ed2f2-31b1-5165-b3ac-919eceb6eb6d';
const OTHER = 'c59d5f5e-76bf-59b5-9533-bbd050563e8b';

const programme: Program = {
  id: ID,
  url: 'https://www.aktion-mensch.de/foerderung/foerderangebote/sport-kultur',
  name: field('Sport und Kultur vor Ort', 'standard', 'jsonld'),
  shortDescription: field('Kurzbeschreibung', 'standard', 'jsonld'),
  deadline: field({ kind: 'window', end: '2026-10-15' }, 'locale', 'label'),
  facts: {},
  conditions: { grant: field([{ amountEur: 50000, bound: 'max', per: 'project' }], 'locale', 'section') },
  requirements: [{ kind: 'exclusions', heading: 'Was wir nicht fördern', text: 'Baukosten' }],
  bodySections: [{ heading: 'Unsere Konditionen', text: 'Zuschuss maximal 50.000 Euro' }],
  issues: [],
};

const report: RunReport = {
  scrapedAt: '2026-10-09T08:00:00.000Z',
  urls: 6,
  programmes: 7,
  strategies: [{ name: 'sitemapIndex', found: 6, failed: false }],
  disagreements: [{ url: 'https://x.test/zeichen-setzen', missedBy: ['linkCluster'] }],
  tierCounts: { standard: 2, framework: 0, locale: 2, site: 0 },
};

const app = createApp({ programmes: [programme], report });

describe('GET /api/programs', () => {
  it('returns the list payload with conditions but without body prose', async () => {
    const res = await request(app).get('/api/programs').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(ID);
    expect(res.body[0].conditions.grant.value[0].amountEur).toBe(50000);
    expect(res.body[0].bodySections).toBeUndefined();
    expect(res.body[0].requirements).toBeUndefined();
  });
});

describe('GET /api/programs/:id', () => {
  it('returns the full record', async () => {
    const res = await request(app).get(`/api/programs/${ID}`).expect(200);
    expect(res.body.bodySections).toHaveLength(1);
    expect(res.body.requirements).toHaveLength(1);
  });

  it('returns a structured 404 for an unknown id', async () => {
    const res = await request(app).get(`/api/programs/${OTHER}`).expect(404);
    expect(res.body.error.code).toBe('not-found');
    expect(res.body.error.message).toContain(OTHER);
  });

  it('returns 404 rather than 500 for a non-uuid id', async () => {
    await request(app).get('/api/programs/sport-kultur').expect(404);
  });
});

describe('GET /api/meta', () => {
  it('returns the run report including the disagreements', async () => {
    const res = await request(app).get('/api/meta').expect(200);
    expect(res.body.urls).toBe(6);
    expect(res.body.programmes).toBe(7);
    expect(res.body.disagreements[0].missedBy).toEqual(['linkCluster']);
  });
});

describe('loadSnapshot', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'antrag-server-'));
    return () => rm(dir, { recursive: true, force: true });
  });

  it('loads a valid snapshot', async () => {
    await writeFile(join(dir, 'programs.json'), JSON.stringify([programme]));
    await writeFile(join(dir, 'run-report.json'), JSON.stringify(report));
    const s = await loadSnapshot(dir);
    expect(s.programmes).toHaveLength(1);
  });

  it('names the missing file and the command that produces it', async () => {
    await expect(loadSnapshot(dir)).rejects.toThrow(/programs\.json/);
    await expect(loadSnapshot(dir)).rejects.toThrow(/npm run scrape/);
  });

  it('refuses an empty snapshot rather than serving nothing as success', async () => {
    await writeFile(join(dir, 'programs.json'), '[]');
    await writeFile(join(dir, 'run-report.json'), JSON.stringify(report));
    await expect(loadSnapshot(dir)).rejects.toThrow(/empty/i);
  });

  it('refuses a snapshot that fails the shared schema', async () => {
    await writeFile(join(dir, 'programs.json'), JSON.stringify([{ ...programme, id: 'nope' }]));
    await writeFile(join(dir, 'run-report.json'), JSON.stringify(report));
    await expect(loadSnapshot(dir)).rejects.toThrow(/schema/i);
  });

  it('refuses malformed JSON with a message naming the file', async () => {
    await writeFile(join(dir, 'programs.json'), '{ not json');
    await expect(loadSnapshot(dir)).rejects.toThrow(/programs\.json/);
  });
});
