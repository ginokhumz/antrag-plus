import * as cheerio from 'cheerio';
import { canonicalUrl } from './canonicalUrl.js';
import type { Strategy } from './sitemapIndex.js';

const MIN_CLUSTER = 2;

export const linkCluster: Strategy = {
  name: 'linkCluster',
  async run({ listingUrl, fetchText }) {
    const html = await fetchText(listingUrl);
    if (html === undefined) return [];

    const $ = cheerio.load(html);
    const origin = new URL(listingUrl).origin;
    const prefix = `${listingUrl}/`;
    const children = new Set<string>();

    $('a[href]').each((_i, el) => {
      const url = canonicalUrl($(el).attr('href')!, listingUrl);
      if (!url || !url.startsWith(origin)) return;
      if (!url.startsWith(prefix)) return;
      if (url.slice(prefix.length).includes('/')) return;
      children.add(url);
    });

    return children.size >= MIN_CLUSTER ? [...children] : [];
  },
};
