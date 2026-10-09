import { canonicalUrl } from './canonicalUrl.js';
import type { Strategy, StrategyDeps } from './sitemapIndex.js';

export type DiscoveryReport = {
  strategies: { name: string; found: number; failed: boolean }[];
  union: string[];
  disagreements: { url: string; missedBy: string[] }[];
};

export const discover = async (strategies: Strategy[], deps: StrategyDeps): Promise<DiscoveryReport> => {
  const results: { name: string; urls: Set<string>; failed: boolean }[] = [];

  for (const strategy of strategies) {
    try {
      const raw = await strategy.run(deps);
      const urls = new Set<string>();
      for (const u of raw) {
        const c = canonicalUrl(u);
        if (c) urls.add(c);
      }
      results.push({ name: strategy.name, urls, failed: false });
    } catch {
      results.push({ name: strategy.name, urls: new Set(), failed: true });
    }
  }

  const union = [...new Set(results.flatMap(r => [...r.urls]))];
  const succeeded = results.filter(r => !r.failed);

  const disagreements = union
    .map(url => ({ url, missedBy: succeeded.filter(r => !r.urls.has(url)).map(r => r.name) }))
    .filter(d => d.missedBy.length > 0);

  return {
    strategies: results.map(r => ({ name: r.name, found: r.urls.size, failed: r.failed })),
    union,
    disagreements,
  };
};
