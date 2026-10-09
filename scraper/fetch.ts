import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type HttpResponse = { status: number; body: Buffer; headers: Record<string, string> };
export type HttpGet = (url: string, headers: Record<string, string>) => Promise<HttpResponse>;
export type Fetched = { html: string; status: number; fetchedAt: string; fromCache: boolean };

const USER_AGENT = 'antrag-plus/1.0 (job application exercise; contact via repository)';
const MIN_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 3;

const charsetOf = (headers: Record<string, string>, body: Buffer): string => {
  const fromHeader = /charset=([\w-]+)/i.exec(headers['content-type'] ?? '');
  if (fromHeader) return fromHeader[1]!.toLowerCase();
  const head = body.subarray(0, 2048).toString('latin1');
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  return (fromMeta?.[1] ?? 'utf-8').toLowerCase();
};

const decode = (body: Buffer, charset: string): string => {
  const label = charset === 'iso-8859-1' || charset === 'latin1' ? 'latin1' : 'utf8';
  return body.toString(label as BufferEncoding);
};

const keyFor = (url: string): string => `${createHash('sha256').update(url).digest('hex')}.html`;

export const createFetcher = (opts: {
  get: HttpGet;
  cacheDir: string;
  sleep?: (ms: number) => Promise<void>;
}): { fetch(url: string): Promise<Fetched> } => {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  let lastRequestAt = 0;

  const fetchOne = async (url: string): Promise<Fetched> => {
    const cachePath = join(opts.cacheDir, keyFor(url));
    try {
      const cached = await readFile(cachePath, 'utf8');
      return { html: cached, status: 200, fetchedAt: new Date().toISOString(), fromCache: true };
    } catch {
      // Not cached yet; fall through to the network.
    }

    let res: HttpResponse | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const since = Date.now() - lastRequestAt;
      if (since < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - since);
      lastRequestAt = Date.now();
      res = await opts.get(url, { 'User-Agent': USER_AGENT, 'Accept-Language': 'de-DE,de;q=0.9' });
      if (res.status < 500) break;
      if (attempt < MAX_ATTEMPTS) await sleep(MIN_INTERVAL_MS * 2 ** attempt);
    }

    const final = res!;
    const html = final.status === 200 ? decode(final.body, charsetOf(final.headers, final.body)) : '';
    if (final.status === 200) {
      await mkdir(opts.cacheDir, { recursive: true });
      await writeFile(cachePath, html, 'utf8');
    }
    return { html, status: final.status, fetchedAt: new Date().toISOString(), fromCache: false };
  };

  return { fetch: fetchOne };
};
