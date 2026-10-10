import { describe, it, expect } from 'vitest';
import { parseDeadline } from './germanDates.js';

describe('parseDeadline — windows', () => {
  it('inherits the missing start year from the end date', () => {
    expect(parseDeadline('Aktuelle Antragsphase: 01.09. – 15.10.2026')).toEqual({
      kind: 'window',
      start: '2026-09-01',
      end: '2026-10-15',
    });
  });

  it('decrements the start year when inheriting would put start after end', () => {
    expect(parseDeadline('15.12. – 31.01.2027')).toEqual({
      kind: 'window',
      start: '2026-12-15',
      end: '2027-01-31',
    });
  });

  it('accepts a hyphen as the range separator', () => {
    expect(parseDeadline('01.09. - 15.10.2026').kind).toBe('window');
  });

  it('accepts bis as the range separator', () => {
    expect(parseDeadline('01.09.2026 bis 15.10.2026')).toEqual({
      kind: 'window',
      start: '2026-09-01',
      end: '2026-10-15',
    });
  });

  it('reads a lone end date as a window with no start', () => {
    expect(parseDeadline('Antragsschluss: 15.10.2026')).toEqual({ kind: 'window', end: '2026-10-15' });
  });
});

describe('parseDeadline — rolling', () => {
  it('reads ganzjährig as rolling', () => {
    const d = parseDeadline('Anträge können ganzjährig eingereicht werden.');
    expect(d.kind).toBe('rolling');
  });

  it('captures the cadence when stated', () => {
    const d = parseDeadline('ganzjährig. Die Bewilligungsrunden erfolgen sechs Mal jährlich.');
    expect(d).toEqual({ kind: 'rolling', cadence: 'sechs Mal jährlich' });
  });

  it('reads laufend as rolling', () => {
    expect(parseDeadline('laufende Antragstellung').kind).toBe('rolling');
  });
});

describe('parseDeadline — unknown', () => {
  it('returns unknown for a phrase with no date and no rolling marker', () => {
    expect(parseDeadline('Wir fördern inklusive Projekte.')).toEqual({ kind: 'unknown' });
  });

  it('returns unknown rather than a wrong date for an impossible date', () => {
    expect(parseDeadline('32.13.2026')).toEqual({ kind: 'unknown' });
  });

  it('prefers a stated window over a rolling marker appearing in the same phrase', () => {
    expect(parseDeadline('ganzjährig, aktuelle Phase 01.09. – 15.10.2026').kind).toBe('window');
  });
});
