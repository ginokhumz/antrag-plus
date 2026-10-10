import { parseRobots } from '../robots.js';
import { canonicalUrl } from './canonicalUrl.js';

export type StrategyDeps = {
  listingUrl: string;
  fetchText(url: string): Promise<string | undefined>;
};

export type Strategy = { name: string; run(deps: StrategyDeps): Promise<string[]> };

const locsIn = (xml: string): string[] =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]!);

const isChildOf = (candidate: string, parent: string): boolean =>
  candidate.startsWith(`${parent}/`) && !candidate.slice(parent.length + 1).includes('/');

export const sitemapIndex: Strategy = {
  name: 'sitemapIndex',
  async run({ listingUrl, fetchText }) {
    const origin = new URL(listingUrl).origin;
    const robots = await fetchText(`${origin}/robots.txt`);
    if (robots === undefined) return [];

    const queue = [...parseRobots(robots).sitemaps];
    const seen = new Set<string>();
    const found = new Set<string>();

    while (queue.length > 0) {
      const next = queue.shift()!;
      if (seen.has(next)) continue;
      seen.add(next);
      const xml = await fetchText(next);
      if (xml === undefined) continue;
      const nested = /<sitemapindex/.test(xml);
      for (const loc of locsIn(xml)) {
        if (nested) {
          queue.push(loc);
          continue;
        }
        const url = canonicalUrl(loc);
        if (url && isChildOf(url, listingUrl)) found.add(url);
      }
    }

    return [...found];
  },
};
