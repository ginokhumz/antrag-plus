import { describe, it, expect } from 'vitest';
import { parseGermanNumber, parseQuantities } from './quantity.js';

describe('parseGermanNumber', () => {
  it('reads a dot as a thousands separator, not a decimal point', () => {
    expect(parseGermanNumber('50.000')).toBe(50000);
    expect(parseGermanNumber('7.500')).toBe(7500);
    expect(parseGermanNumber('400.000')).toBe(400000);
  });

  it('reads a comma as the decimal separator', () => {
    expect(parseGermanNumber('1.234,56')).toBe(1234.56);
    expect(parseGermanNumber('90,5')).toBe(90.5);
  });

  it('reads a bare integer', () => {
    expect(parseGermanNumber('50')).toBe(50);
  });

  it('returns undefined rather than a wrong number for malformed input', () => {
    expect(parseGermanNumber('50.00.000')).toBeUndefined();
    expect(parseGermanNumber('abc')).toBeUndefined();
    expect(parseGermanNumber('')).toBeUndefined();
  });
});

describe('parseQuantities — bounds come from the adverb, not the numeral', () => {
  it('reads maximal as a ceiling', () => {
    const { money } = parseQuantities('Zuschuss maximal 50.000 Euro');
    expect(money).toEqual([{ amountEur: 50000, bound: 'max', per: 'project' }]);
  });

  it('reads mindestens as a floor on an identical numeral', () => {
    const { rates } = parseQuantities('Eigenmittel von mindestens 10 Prozent der förderfähigen Kosten');
    expect(rates).toEqual([{ percent: 10, bound: 'min', of: 'own-funds' }]);
  });

  it('reads bis zu as a ceiling', () => {
    const { rates } = parseQuantities('bis zu 90 Prozent der förderfähigen Kosten');
    expect(rates).toEqual([{ percent: 90, bound: 'max', of: 'eligible-costs' }]);
  });

  it('defaults to exact with no governing adverb', () => {
    const { duration } = parseQuantities('24 Monate Laufzeit');
    expect(duration).toEqual({ months: 24, bound: 'exact' });
  });
});

describe('parseQuantities — basis comes from the unit phrase', () => {
  it('classifies a per-day rate as person-day, never as a project ceiling', () => {
    const { money } = parseQuantities('physische Teilnahme: 50 Euro pro Tag');
    expect(money).toEqual([{ amountEur: 50, bound: 'exact', per: 'person-day' }]);
  });

  it('classifies a compound per-year-per-partner ceiling', () => {
    const { money } = parseQuantities('Maximal 400.000 Euro pro Jahr und Projekt-Partner');
    expect(money).toEqual([{ amountEur: 400000, bound: 'max', per: 'partner-year' }]);
  });

  it('classifies an overnight rate', () => {
    const { money } = parseQuantities('Übernachtung: 70 Euro');
    expect(money).toEqual([{ amountEur: 70, bound: 'exact', per: 'night' }]);
  });

  it('resolves three same-page percentages to three different bases', () => {
    const phrase =
      'bis zu 90 Prozent der förderfähigen Kosten. ' +
      'Investitionen (bis maximal 10 Prozent der Gesamtkosten). ' +
      'Eigenmittel von mindestens 10 Prozent der förderfähigen Kosten';
    const { rates } = parseQuantities(phrase);
    expect(rates).toEqual([
      { percent: 90, bound: 'max', of: 'eligible-costs' },
      { percent: 10, bound: 'max', of: 'total-costs' },
      { percent: 10, bound: 'min', of: 'own-funds' },
    ]);
  });

  it('lets Eigenmittel win over a trailing förderfähigen Kosten', () => {
    const { rates } = parseQuantities('Eigenmittel von mindestens 30 Prozent der förderfähigen Kosten');
    expect(rates[0]!.of).toBe('own-funds');
  });

  it('classifies accessibility costs', () => {
    const { rates } = parseQuantities('bis zu 70 Prozent der Kosten zur Herstellung der Barrierefreiheit');
    expect(rates).toEqual([{ percent: 70, bound: 'max', of: 'accessibility-costs' }]);
  });
});

describe('parseQuantities — durations normalise to months from either unit', () => {
  it('reads Monate directly', () => {
    expect(parseQuantities('48 Monate Laufzeit').duration).toEqual({ months: 48, bound: 'exact' });
  });

  it('converts Jahre to months so the two spellings compare equal', () => {
    expect(parseQuantities('4 Jahre Laufzeit').duration).toEqual({ months: 48, bound: 'exact' });
  });

  it('keeps the bound through the unit conversion', () => {
    expect(parseQuantities('bis zu 2 Jahre Laufzeit').duration).toEqual({ months: 24, bound: 'max' });
  });
});

describe('parseQuantities — unclassifiable values are dropped, never guessed', () => {
  it('drops a Euro amount with no recognisable basis and records an issue', () => {
    const { money, issues } = parseQuantities('Ein Betrag von 1.000 Euro wurde erwähnt');
    expect(money).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('unclassified-basis');
    expect(issues[0]!.raw).toContain('1.000');
  });

  it('drops a percentage with no recognisable referent and records an issue', () => {
    const { rates, issues } = parseQuantities('etwa 40 Prozent aller Anträge');
    expect(rates).toEqual([]);
    expect(issues[0]!.code).toBe('unclassified-basis');
  });

  it('returns nothing and no issue for a phrase with no quantities', () => {
    expect(parseQuantities('Wir fördern inklusive Projekte')).toEqual({ money: [], rates: [], issues: [] });
  });
});

describe('parseQuantities — the nearest referent wins, not a fixed priority', () => {
  it('reads Gesamtkosten as total costs even when Barrierefreiheit follows later', () => {
    const phrase = 'Investitionen (bis maximal 10 Prozent der Gesamtkosten) Kosten zur Herstellung der Barrierefreiheit';
    expect(parseQuantities(phrase).rates).toEqual([{ percent: 10, bound: 'max', of: 'total-costs' }]);
  });

  it('still reads accessibility costs when that is the nearest referent', () => {
    expect(parseQuantities('bis zu 70 Prozent der Kosten zur Herstellung der Barrierefreiheit').rates).toEqual([
      { percent: 70, bound: 'max', of: 'accessibility-costs' },
    ]);
  });
});

describe('parseQuantities — grouped and scaled amounts are never silently wrong', () => {
  it('records an issue rather than returning 0 for a space-grouped amount', () => {
    const { money, issues } = parseQuantities('Zuschuss maximal 50 000 Euro');
    expect(money.every(m => m.amountEur !== 0)).toBe(true);
    expect(issues.some(i => i.code === 'unparsed-amount')).toBe(true);
  });

  it('records an issue rather than dropping a scale word silently', () => {
    const { money, issues } = parseQuantities('5 Mio. Euro Fördermittel insgesamt');
    expect(money).toEqual([]);
    expect(issues.some(i => i.code === 'unparsed-amount')).toBe(true);
  });

  it('handles Millionen spelled out', () => {
    const { issues } = parseQuantities('2,5 Millionen Euro stehen bereit');
    expect(issues.some(i => i.code === 'unparsed-amount')).toBe(true);
  });

  it('reports a duration range rather than flattening it to an exact figure', () => {
    const { duration, issues } = parseQuantities('Laufzeit 1 bis 3 Jahre');
    expect(duration).toEqual({ months: 36, bound: 'max' });
    expect(issues.some(i => i.code === 'duration-range')).toBe(true);
  });
});

describe('parseQuantities — a basis phrase belongs to its nearest amount', () => {
  it('does not let an amount take the basis of the amount after it', () => {
    const phrase = 'für Kinder und Jugendliche ohne Behinderung 50 € Maximal 400.000 Euro pro Jahr und Projekt-Partner';
    const { money, issues } = parseQuantities(phrase);
    expect(money).toEqual([{ amountEur: 400000, bound: 'max', per: 'partner-year' }]);
    expect(issues.some(i => i.code === 'unclassified-basis' && i.raw?.includes('50'))).toBe(true);
  });

  it('does not give a bracketed sub-allocation the parent project ceiling', () => {
    const phrase = 'Zuschuss maximal 7.500 € (bis zu 5.000 € für Honorar- und Sachkosten)';
    const { money, issues } = parseQuantities(phrase);
    expect(money).toEqual([{ amountEur: 7500, bound: 'max', per: 'project' }]);
    expect(issues.some(i => i.code === 'unclassified-basis' && i.raw?.includes('5.000'))).toBe(true);
  });

  it('still reads two genuinely separate per-day rates', () => {
    const { money } = parseQuantities('physische Teilnahme: 50 Euro pro Tag digitale Teilnahme: 30 Euro pro Tag');
    expect(money).toEqual([
      { amountEur: 50, bound: 'exact', per: 'person-day' },
      { amountEur: 30, bound: 'exact', per: 'person-day' },
    ]);
  });

  it('does not let a percentage take a referent beyond the next percentage', () => {
    const phrase = 'bis zu 90 Prozent der förderfähigen Kosten bis maximal 10 Prozent der Gesamtkosten';
    expect(parseQuantities(phrase).rates).toEqual([
      { percent: 90, bound: 'max', of: 'eligible-costs' },
      { percent: 10, bound: 'max', of: 'total-costs' },
    ]);
  });
});
