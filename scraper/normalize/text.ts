import type { AnyNode, Element } from 'domhandler';
import type { CheerioAPI } from 'cheerio';

const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section',
  'table', 'td', 'th', 'tr', 'ul',
]);

export const collapse = (s: string): string => s.replace(/[\s ]+/g, ' ').trim();

export const text = ($: CheerioAPI, el: Element): string => {
  const parts: string[] = [];

  const walk = (node: AnyNode): void => {
    if (node.type === 'text') {
      parts.push(node.data);
      return;
    }
    if (node.type !== 'tag') return;
    const tag = node.name.toLowerCase();
    if (tag === 'script' || tag === 'style') return;
    const block = BLOCK.has(tag);
    if (block) parts.push(' ');
    for (const child of node.children) walk(child);
    if (block) parts.push(' ');
  };

  walk(el);
  return collapse(parts.join(''));
};
