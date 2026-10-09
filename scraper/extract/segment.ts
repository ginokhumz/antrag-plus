import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import { collapse } from '../normalize/text.js';
import { CONDITION_HEADINGS, matchesLabel } from './labels.js';

export type Segment = { sectionId?: string; html: string };

const SECTION_ID = /^(\d+)-headline$/;

export const segment = ($: CheerioAPI): Segment[] => {
  const topLevel = $('body')
    .find('section')
    .filter((_i, el) => $(el).parents('section').length === 0)
    .toArray();

  const conditionIndexes = topLevel.flatMap((el, i) => {
    const heading = collapse($(el).find('h1, h2, h3, h4').first().text());
    return heading && matchesLabel(heading, CONDITION_HEADINGS) ? [i] : [];
  });

  if (conditionIndexes.length < 2) {
    return [{ html: $.html() }];
  }

  const titleIndexes = topLevel.flatMap((el, i) => {
    const id = $(el).find('h2[id]').first().attr('id') ?? '';
    return SECTION_ID.test(id) ? [i] : [];
  });

  const starts = conditionIndexes.map(ci => {
    const candidates = titleIndexes.filter(ti => ti <= ci);
    return candidates.length > 0 ? candidates[candidates.length - 1]! : ci;
  });

  const uniqueStarts = [...new Set(starts)];

  return uniqueStarts.map((start, n) => {
    const end = n + 1 < uniqueStarts.length ? uniqueStarts[n + 1]! : topLevel.length;
    const slice = topLevel.slice(start, end) as Element[];
    const id = SECTION_ID.exec($(slice[0]!).find('h2[id]').first().attr('id') ?? '');
    const html = slice.map(el => $.html(el)).join('');
    return id ? { sectionId: id[1]!, html } : { html };
  });
};
