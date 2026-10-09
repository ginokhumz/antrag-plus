import type { CheerioAPI } from 'cheerio';
import { collapse } from '../normalize/text.js';
import { matchesLabel, PRUNE_HEADINGS } from './labels.js';

const STRUCTURAL = 'header, nav, footer, aside, script, style, noscript, form';

export const prune = ($: CheerioAPI): void => {
  $(STRUCTURAL).remove();

  $('section, div[data-module]').each((_i, el) => {
    const $el = $(el);
    if ($el.parents('section').length > 0) return;
    const heading = collapse($el.find('h1, h2, h3').first().text());
    if (heading && matchesLabel(heading, PRUNE_HEADINGS)) $el.remove();
  });

  $('a').each((_i, el) => {
    const $a = $(el);
    if (matchesLabel(collapse($a.text()), ['Förderkonditionen kennenlernen'])) $a.remove();
  });
};
