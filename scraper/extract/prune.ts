import type { CheerioAPI } from 'cheerio';
import { collapse } from '../normalize/text.js';
import { matchesLabel, PRUNE_HEADINGS } from './labels.js';

const STRUCTURAL = 'header, nav, footer, aside, style, noscript, form';

// JSON-LD is content, not chrome: it carries the headline and description that
// resolve at the standard tier, so it must survive pruning while other scripts do not.
const SCRIPTS_TO_DROP = 'script:not([type="application/ld+json"])';

export const prune = ($: CheerioAPI): void => {
  $(STRUCTURAL).remove();
  $(SCRIPTS_TO_DROP).remove();

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
