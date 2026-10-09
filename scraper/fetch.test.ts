import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFetcher, type HttpGet } from './fetch.js';

let cacheDir: string;
beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'antrag-fetch-'));
  return () => rm(cacheDir, { recursive: true, force: true });
});

const ok = (body: Buffer, headers: Record<string, string> = {}): Awaited<ReturnType<HttpGet>> => ({
  status: 200,
  body,
  headers,
});

describe('createFetcher', () => {
  it('sends an identifying User-Agent', async () => {
    const seen: Record<string, string>[] = [];
    const get: HttpGet = async (_u, h) => { seen.push(h); return ok(Buffer.from('<p>hi</p>')); };
    await createFetcher({ get, cacheDir, sleep: async () => {} }).fetch('https://x.test/a');
    expect(seen[0]!['User-Agent']).toMatch(/antrag-plus/);
  });

  it('decodes ISO-8859-1 from the Content-Type header so umlauts survive', async () => {
    const latin1 = Buffer.from('<p>Förderung</p>', 'latin1');
    const get: HttpGet = async () => ok(latin1, { 'content-type': 'text/html; charset=ISO-8859-1' });
    const { html } = await createFetcher({ get, cacheDir, sleep: async () => {} }).fetch('https://x.test/a');
    expect(html).toContain('Förderung');
  });

  it('falls back to the meta charset when the header is silent', async () => {
    const latin1 = Buffer.from('<meta charset="iso-8859-1"><p>Maßnahmen</p>', 'latin1');
    const get: HttpGet = async () => ok(latin1, {});
    const { html } = await createFetcher({ get, cacheDir, sleep: async () => {} }).fetch('https://x.test/a');
    expect(html).toContain('Maßnahmen');
  });

  it('defaults to UTF-8', async () => {
    const get: HttpGet = async () => ok(Buffer.from('<p>Förderfähige</p>', 'utf8'));
    const { html } = await createFetcher({ get, cacheDir, sleep: async () => {} }).fetch('https://x.test/a');
    expect(html).toContain('Förderfähige');
  });

  it('serves the second request for a URL from disk without calling out', async () => {
    let calls = 0;
    const get: HttpGet = async () => { calls += 1; return ok(Buffer.from('<p>once</p>')); };
    const f = createFetcher({ get, cacheDir, sleep: async () => {} });
    const first = await f.fetch('https://x.test/a');
    const second = await f.fetch('https://x.test/a');
    expect(calls).toBe(1);
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.html).toBe('<p>once</p>');
  });

  it('retries a 500 and succeeds on the second attempt', async () => {
    let calls = 0;
    const get: HttpGet = async () => {
      calls += 1;
      return calls === 1 ? { status: 500, body: Buffer.alloc(0), headers: {} } : ok(Buffer.from('<p>ok</p>'));
    };
    const { html } = await createFetcher({ get, cacheDir, sleep: async () => {} }).fetch('https://x.test/a');
    expect(calls).toBe(2);
    expect(html).toBe('<p>ok</p>');
  });

  it('gives up after the retry budget and reports the status', async () => {
    const get: HttpGet = async () => ({ status: 503, body: Buffer.alloc(0), headers: {} });
    const { status } = await createFetcher({ get, cacheDir, sleep: async () => {} }).fetch('https://x.test/a');
    expect(status).toBe(503);
  });

  it('does not retry a 404', async () => {
    let calls = 0;
    const get: HttpGet = async () => { calls += 1; return { status: 404, body: Buffer.alloc(0), headers: {} }; };
    const { status } = await createFetcher({ get, cacheDir, sleep: async () => {} }).fetch('https://x.test/a');
    expect(calls).toBe(1);
    expect(status).toBe(404);
  });

  it('waits between distinct requests', async () => {
    const waits: number[] = [];
    const get: HttpGet = async () => ok(Buffer.from('<p>x</p>'));
    const f = createFetcher({ get, cacheDir, sleep: async ms => { waits.push(ms); } });
    await f.fetch('https://x.test/a');
    await f.fetch('https://x.test/b');
    expect(waits.some(ms => ms > 900)).toBe(true);
  });
});
