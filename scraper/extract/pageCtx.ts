import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { collapse, text } from '../normalize/text.js';
import { matchesLabel } from './labels.js';

export type JsonLd = { Article?: { headline?: string; description?: string } };

export type PageCtx = {
  jsonLd: JsonLd;
  q(selector: string): string | undefined;
  section(headings: string[]): string | undefined;
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

  const headingSections = (): { heading: string; text: string }[] => {
    const out: { heading: string; text: string }[] = [];
    $('h2, h3').each((_i, el) => {
      const heading = collapse($(el).text());
      if (!heading) return;
      const container = $(el).closest('section');
      const body = container.length > 0 ? text($, container[0]!) : '';
      const stripped = body.startsWith(heading) ? body.slice(heading.length) : body;
      out.push({ heading, text: collapse(stripped) });
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
