import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import type { Issue } from '@antrag-plus/schema';
import { collapse } from '../normalize/text.js';
import { CONDITION_HEADINGS, matchesLabel } from './labels.js';

export type Segment = { sectionId?: string; html: string; issues: Issue[] };

const SECTION_ID = /^(\d+)-headline$/;

const issue = (code: string, message: string): Issue => ({ field: 'page', code, message });

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
    return [{ html: $.html(), issues: [] }];
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
  const pageIssues: Issue[] = [];

  // Two conditions blocks resolving to one start means two programmes become one
  // record whose conditions mix both sets of money. That disagreement is the signal.
  if (uniqueStarts.length < conditionIndexes.length) {
    pageIssues.push(
      issue(
        'segments-collapsed',
        `${conditionIndexes.length} conditions blocks resolved to ${uniqueStarts.length} programme boundaries; terms may be merged`,
      ),
    );
  }

  if (titleIndexes.length === 0) {
    pageIssues.push(
      issue('segment-anchor-missing', 'no section-id heading found, so split programmes cannot be identified separately'),
    );
  }

  return uniqueStarts.map((start, n) => {
    const end = n + 1 < uniqueStarts.length ? uniqueStarts[n + 1]! : topLevel.length;
    const slice = topLevel.slice(start, end) as Element[];
    const id = SECTION_ID.exec($(slice[0]!).find('h2[id]').first().attr('id') ?? '');
    const html = slice.map(el => $.html(el)).join('');
    const issues = n === 0 ? pageIssues : [];
    return id ? { sectionId: id[1]!, html, issues } : { html, issues };
  });
};
