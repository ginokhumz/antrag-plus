import { describe, it, expect } from 'vitest';
import { matchesLabel, CONDITION_HEADINGS, ELIGIBLE_COST_HEADINGS, REQUIREMENT_LABELS } from './labels.js';

describe('matchesLabel', () => {
  it('matches an exact heading', () => {
    expect(matchesLabel('Unsere Konditionen', CONDITION_HEADINGS)).toBe(true);
  });

  it('matches the other spelling of the conditions heading', () => {
    expect(matchesLabel('Förderkonditionen', CONDITION_HEADINGS)).toBe(true);
  });

  it('matches despite the missing g their CMS leaves out of Rahmenbedingungen', () => {
    expect(matchesLabel('Rahmenbedinungen', REQUIREMENT_LABELS.formal)).toBe(true);
  });

  it('is insensitive to case and surrounding whitespace', () => {
    expect(matchesLabel('  unsere KONDITIONEN  ', CONDITION_HEADINGS)).toBe(true);
  });

  it('is insensitive to a trailing colon', () => {
    expect(matchesLabel('Anforderungen:', REQUIREMENT_LABELS.formal)).toBe(true);
  });

  it('folds diacritics so Foerderkonditionen matches Förderkonditionen', () => {
    expect(matchesLabel('Foerderkonditionen', CONDITION_HEADINGS)).toBe(true);
  });

  it('does not match an unrelated heading', () => {
    expect(matchesLabel('Wir fördern ...', CONDITION_HEADINGS)).toBe(false);
    expect(matchesLabel('Projektideen für dich', CONDITION_HEADINGS)).toBe(false);
  });

  it('does not match a promo heading that merely contains the word', () => {
    expect(matchesLabel('Förderkonditionen kennenlernen', CONDITION_HEADINGS)).toBe(false);
  });
});

describe('matchesLabel — tolerance must not alias short, opposite headings', () => {
  it('does not treat "Wen wir fördern" as "Was wir fördern"', () => {
    expect(matchesLabel('Wen wir fördern', ELIGIBLE_COST_HEADINGS)).toBe(false);
    expect(matchesLabel('Was wir fördern', REQUIREMENT_LABELS.eligibility)).toBe(false);
  });

  it('still matches the one real CMS typo, which is a single edit', () => {
    expect(matchesLabel('Rahmenbedinungen', REQUIREMENT_LABELS.formal)).toBe(true);
  });

  it('keeps each vocabulary entry matching itself', () => {
    const all = [...CONDITION_HEADINGS, ...ELIGIBLE_COST_HEADINGS, ...Object.values(REQUIREMENT_LABELS).flat()];
    for (const entry of all) {
      expect(matchesLabel(entry, [entry])).toBe(true);
    }
  });
});
