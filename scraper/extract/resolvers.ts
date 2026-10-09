import type { Deadline, Duration, Money, Rate } from '@antrag-plus/schema';
import { parseDeadline } from '../normalize/germanDates.js';
import { parseQuantities } from '../normalize/quantity.js';
import { CONDITION_HEADINGS, DEADLINE_LABELS, ELIGIBLE_COST_HEADINGS } from './labels.js';
import type { PageCtx } from './pageCtx.js';
import type { Resolver } from './resolve.js';

const conditionsText = (ctx: PageCtx): string | undefined => ctx.section(CONDITION_HEADINGS);

export const nameResolvers: Resolver<string>[] = [
  { tier: 'standard', name: 'jsonld.Article.headline', run: c => c.jsonLd.Article?.headline },
  // A page split into several programmes carries one Article headline for the whole
  // page, so a sub-programme takes its own section heading instead. This is the one
  // field on this source that needs site-tier knowledge, and the design note says so.
  { tier: 'site', name: 'segment-title-heading', run: c => c.segmentTitle() },
  { tier: 'site', name: 'h1', run: c => c.q('h1') },
];

export const descriptionResolvers: Resolver<string>[] = [
  { tier: 'standard', name: 'jsonld.Article.description', run: c => c.jsonLd.Article?.description },
  { tier: 'locale', name: 'lead-paragraph', run: c => c.firstProsePara() },
];

export const deadlineResolvers: Resolver<Deadline>[] = [
  {
    tier: 'locale',
    name: 'label:Antragsphase|Frist|Antragsschluss',
    run: c => {
      const raw = c.labelledFact(DEADLINE_LABELS);
      if (raw === undefined) return undefined;
      const d = parseDeadline(raw);
      return d.kind === 'unknown' ? undefined : d;
    },
  },
  {
    tier: 'locale',
    name: 'rolling:ganzjährig|laufend',
    run: c => {
      // The rolling statement is a page-level sentence that need not sit under any
      // heading, so this scans the whole segment and isolates the sentence carrying
      // the marker: handing a whole page to parseDeadline would let an unrelated
      // date elsewhere win as a window.
      const body = c.bodyText();
      const sentence = /[^.!?]*\b(?:ganzjährig|laufend\w*)\b[^.!?]*[.!?](?:[^.!?]*[.!?])?/i.exec(body);
      if (!sentence) return undefined;
      const d = parseDeadline(sentence[0]);
      return d.kind === 'rolling' ? d : undefined;
    },
  },
];

export const grantResolvers: Resolver<Money[]>[] = [
  {
    tier: 'locale',
    name: 'section:Konditionen|Förderkonditionen',
    run: c => {
      const t = conditionsText(c);
      return t === undefined ? undefined : parseQuantities(t).money;
    },
  },
];

export const rateResolvers: Resolver<Rate[]>[] = [
  {
    tier: 'locale',
    name: 'section:Konditionen|Förderkonditionen',
    run: c => {
      const t = conditionsText(c);
      if (t === undefined) return undefined;
      return parseQuantities(t).rates.filter(r => r.of !== 'own-funds');
    },
  },
];

export const coFinancingResolvers: Resolver<Rate[]>[] = [
  {
    tier: 'locale',
    name: 'section:Konditionen|Förderkonditionen',
    run: c => {
      const t = conditionsText(c);
      if (t === undefined) return undefined;
      return parseQuantities(t).rates.filter(r => r.of === 'own-funds');
    },
  },
];

export const durationResolvers: Resolver<Duration>[] = [
  {
    tier: 'locale',
    name: 'section:Konditionen|Förderkonditionen',
    run: c => {
      const t = conditionsText(c);
      return t === undefined ? undefined : parseQuantities(t).duration;
    },
  },
];

export const eligibleCostResolvers: Resolver<string[]>[] = [
  {
    tier: 'locale',
    name: 'section:Förderfähige Kosten',
    run: c => {
      const t = c.section(ELIGIBLE_COST_HEADINGS);
      if (t === undefined) return undefined;
      return t
        .split(/(?<=[a-zäöüß)])\s+(?=[A-ZÄÖÜ])/)
        .map(part => part.trim())
        .filter(part => part.length > 2 && part.length < 120);
    },
  },
];
