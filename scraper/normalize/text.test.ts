import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';
import { text } from './text.js';

const extract = (html: string): string => {
  const $ = cheerio.load(html);
  return text($, $('body')[0]!);
};

describe('text', () => {
  it('joins inline elements without inserting whitespace', () => {
    expect(extract('<p>J<span>unge Menschen</span></p>')).toBe('Junge Menschen');
  });

  it('keeps legitimate word breaks', () => {
    expect(extract('<p>Junge <strong>Menschen</strong> stärken</p>')).toBe('Junge Menschen stärken');
  });

  it('separates block elements with a single space', () => {
    expect(extract('<p>Erster Satz.</p><p>Zweiter Satz.</p>')).toBe('Erster Satz. Zweiter Satz.');
  });

  it('treats a br as a block boundary', () => {
    expect(extract('<p><strong>Fokusthema:</strong><br/>Junge Menschen</p>')).toBe('Fokusthema: Junge Menschen');
  });

  it('collapses runs of whitespace and non-breaking spaces', () => {
    expect(extract('<p>a  \n\t b&nbsp;c</p>')).toBe('a b c');
  });

  it('preserves diacritics', () => {
    expect(extract('<p>Förderfähige Kosten für Maßnahmen</p>')).toBe('Förderfähige Kosten für Maßnahmen');
  });
});
