import { canonicalUrl } from './canonicalUrl.js';
import type { Strategy } from './sitemapIndex.js';

const HREF_IN_PAYLOAD = /\\?"href\\?":\\?"([^"\\]+)\\?"/g;
const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

const hrefsFrom = (html: string): string[] => {
  const out: string[] = [];
  if (/self\.__next_f\.push/.test(html)) {
    for (const m of html.matchAll(HREF_IN_PAYLOAD)) out.push(m[1]!);
  }
  const nextData = NEXT_DATA.exec(html);
  if (nextData) {
    for (const m of nextData[1]!.matchAll(/"href":"([^"]+)"/g)) out.push(m[1]!);
  }
  return out;
};

const isChildOf = (candidate: string, parent: string): boolean =>
  candidate.startsWith(`${parent}/`) && !candidate.slice(parent.length + 1).includes('/');

export const embeddedManifest: Strategy = {
  name: 'embeddedManifest',
  async run({ listingUrl, fetchText }) {
    const html = await fetchText(listingUrl);
    if (html === undefined) return [];
    const found = new Set<string>();
    for (const href of hrefsFrom(html)) {
      const url = canonicalUrl(href, listingUrl);
      if (url && isChildOf(url, listingUrl)) found.add(url);
    }
    return [...found];
  },
};
