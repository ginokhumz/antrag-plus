import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { collapse, text } from '../normalize/text.js';
import { matchesLabel } from './labels.js';

export type JsonLd = { Article?: { headline?: string; description?: string } };

export type PageCtx = {
  jsonLd: JsonLd;
  q(selector: string): string | undefined;
  section(headings: string[]): string | undefined;
  listUnder(headings: string[]): string[] | undefined;
  labelledFact(labels: string[]): string | undefined;
  allLabelledFacts(): Record<string, string>;
  firstProsePara(): string | undefined;
  bodyText(): string;
  segmentTitle(): string | undefined;
  headingSections(): { heading: string; text: string }[];
};

const readJsonLd = ($: CheerioAPI): JsonLd => {
  const out: JsonLd = {};
  $('script[type="application/ld+json"]').each((_i, el) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse($(el).text());
    } catch {
      return;
    }
    const graph =
      parsed !== null && typeof parsed === 'object' && '@graph' in parsed
        ? (parsed as { '@graph': unknown })['@graph']
        : parsed;
    if (!Array.isArray(graph)) return;
    for (const node of graph) {
      if (node !== null && typeof node === 'object' && (node as { '@type'?: unknown })['@type'] === 'Article') {
        const n = node as { headline?: unknown; description?: unknown };
        out.Article = {
          ...(typeof n.headline === 'string' ? { headline: n.headline } : {}),
          ...(typeof n.description === 'string' ? { description: n.description } : {}),
        };
      }
    }
  });
  return out;
};

const LABEL_SPLIT = /^([^:]{2,60}):\s*([\s\S]*)$/;

export const makeCtx = (html: string): PageCtx => {
  const $ = cheerio.load(html);
  const jsonLd = readJsonLd($);

  const allLabelledFacts = (): Record<string, string> => {
    const facts: Record<string, string> = {};
    $('p').each((_i, el) => {
      const strong = $(el).find('strong').first();
      if (strong.length === 0) return;
      const strongText = collapse(strong.text());
      const whole = text($, el);

      const inStrong = LABEL_SPLIT.exec(strongText);
      if (inStrong && inStrong[2]!.trim()) {
        facts[collapse(inStrong[1]!)] = collapse(inStrong[2]!);
        return;
      }

      const label = strongText.replace(/:$/, '');
      const inWhole = LABEL_SPLIT.exec(whole);
      if (inWhole && collapse(inWhole[1]!) === label && inWhole[2]!.trim()) {
        facts[label] = collapse(inWhole[2]!);
      }
    });
    return facts;
  };

  // A heading owns the content that follows it, with any nested heading LABELS removed:
  // an accordion whose panels are empty in the server HTML would otherwise take its
  // sibling headings as its body, while a conditions block legitimately keeps the
  // values under its sub-headings. Scoping to the enclosing <section> instead gives
  // every heading in that section the same blob.
  const textWithoutHeadings = (nodes: AnyNode[]): string => {
    const html = nodes.map(n => $.html(n)).join('');
    if (!html.trim()) return '';
    const frag = cheerio.load(`<div id="frag">${html}</div>`);
    frag('h1, h2, h3, h4, h5, h6').remove();
    const root = frag('#frag')[0];
    return root ? collapse(text(frag, root)) : '';
  };

  const contentAfter = (el: Element): string => {
    const own = textWithoutHeadings($(el).nextAll().toArray());
    if (own) return own;
    // The CMS wraps some labels in their own div, putting the value in the wrapper's sibling.
    return textWithoutHeadings($(el).parent().nextAll().toArray());
  };

  const headingSections = (): { heading: string; text: string }[] => {
    const out: { heading: string; text: string }[] = [];
    $('h2, h3').each((_i, el) => {
      const heading = collapse($(el).text());
      if (heading) out.push({ heading, text: contentAfter(el) });
    });
    return out;
  };

  return {
    jsonLd,
    q: selector => {
      const found = $(selector).first();
      return found.length > 0 ? collapse(text($, found[0]!)) || undefined : undefined;
    },
    section: headings => headingSections().find(s => matchesLabel(s.heading, headings))?.text,
    // Cost categories are separate block elements. Splitting their joined text on
    // German capitalisation would cut mid-phrase, because German capitalises every noun.
    listUnder: headings => {
      const el = $('h2, h3')
        .toArray()
        .find(h => matchesLabel(collapse($(h).text()), headings));
      if (!el) return undefined;
      const scope = textWithoutHeadings($(el).nextAll().toArray())
        ? $(el).nextAll().toArray()
        : $(el).parent().nextAll().toArray();
      const html = scope.map(n => $.html(n)).join('');
      if (!html.trim()) return undefined;
      const frag = cheerio.load(`<div id="frag">${html}</div>`);
      frag('h1, h2, h3, h4, h5, h6').remove();
      const items = frag('#frag li').toArray();
      const blocks = items.length > 0 ? items : frag('#frag p, #frag div:not(:has(div, p, li))').toArray();
      const out = blocks.map(n => collapse(text(frag, n))).filter(t => t.length > 1);
      return out.length > 0 ? out : undefined;
    },
    labelledFact: labels => {
      for (const [label, value] of Object.entries(allLabelledFacts())) {
        if (matchesLabel(label, labels)) return value || label;
      }
      return $('strong')
        .toArray()
        .map(el => collapse($(el).text()))
        .find(t => {
          const split = LABEL_SPLIT.exec(t);
          return split !== null && matchesLabel(split[1]!, labels) && split[2]!.trim().length > 0;
        });
    },
    allLabelledFacts,
    firstProsePara: () => {
      const p = $('.prose p, main p, article p').first();
      return p.length > 0 ? collapse(text($, p[0]!)) || undefined : undefined;
    },
    bodyText: () => {
      const body = $('body')[0];
      return body ? text($, body) : collapse($.root().text());
    },
    segmentTitle: () => {
      const h = $('h2[id$="-headline"]').first();
      return h.length > 0 ? collapse(h.text()) || undefined : undefined;
    },
    headingSections,
  };
};
