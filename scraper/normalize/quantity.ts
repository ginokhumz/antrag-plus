import type { Bound, Duration, Issue, Money, MoneyBasis, Rate, RateBasis } from '@antrag-plus/schema';

const NUM = String.raw`\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?`;

// A digit run that is NOT a well-formed German number: space- or NBSP-grouped
// (`50 000`), or carrying a scale word (`5 Mio.`). Matching these explicitly is what
// turns them into a recorded issue instead of the trailing group parsed alone.
const MALFORMED_AMOUNT = new RegExp(
  String.raw`\d[\d.,]*(?:[\s ]+\d{3})+|\d[\d.,]*[\s ]*(?:Mio\.?|Mrd\.?|Millionen|Milliarden)`,
  'gi',
);

export const parseGermanNumber = (s: string): number | undefined => {
  const t = s.trim();
  if (!new RegExp(`^(?:${NUM})$`).test(t)) return undefined;
  const [whole, frac] = t.split(',');
  const digits = whole!.replace(/\./g, '');
  return Number(frac === undefined ? digits : `${digits}.${frac}`);
};

// A basis or bound phrase belongs to the amount nearest it, so a window must never
// scan past a neighbouring amount. A fixed character width does, which is how a
// per-person-day rate acquired the project ceiling's "pro Jahr und Projekt-Partner"
// from the sentence after it, and how a bracketed sub-allocation inherited "maximal".
const AMOUNT_TOKEN = new RegExp(String.raw`(?:${NUM})\s*(?:Euro|EUR|€|Prozent|%)`, 'gi');

const clampBefore = (before: string, width = 60): string => {
  const window = before.slice(-width);
  let cut = 0;
  for (const m of window.matchAll(AMOUNT_TOKEN)) cut = m.index + m[0].length;
  return window.slice(cut);
};

const clampAfter = (after: string, width = 80): string => {
  const window = after.slice(0, width);
  const next = AMOUNT_TOKEN.exec(window);
  AMOUNT_TOKEN.lastIndex = 0;
  return next ? window.slice(0, next.index) : window;
};

const boundFrom = (before: string): Bound => {
  const tail = clampBefore(before).toLowerCase();
  if (/\bmindestens\b|\bmindest/.test(tail)) return 'min';
  if (/\bmaximal\b|\bhöchstens\b|\bbis zu\b|\bbis maximal\b|\bmax\.?\b/.test(tail)) return 'max';
  return 'exact';
};

// The nearest marker wins. A fixed priority order would let a far-away word beat the
// phrase actually attached to the numeral: "10 Prozent der Gesamtkosten) Kosten zur
// Herstellung der Barrierefreiheit" is a share of total costs, not of accessibility costs.
const nearest = <T extends string>(haystack: string, markers: [RegExp, T][]): T | undefined => {
  let best: { at: number; value: T } | undefined;
  for (const [re, value] of markers) {
    const m = re.exec(haystack);
    if (m && (best === undefined || m.index < best.at)) best = { at: m.index, value };
  }
  return best?.value;
};

const moneyBasisFrom = (before: string, after: string): MoneyBasis | undefined => {
  const a = clampAfter(after, 60).toLowerCase();
  const b = clampBefore(before).toLowerCase();
  const fromAfter = nearest<MoneyBasis>(a, [
    [/pro jahr und projekt-?partner/, 'partner-year'],
    [/pro tag/, 'person-day'],
    [/pro jahr/, 'year'],
  ]);
  if (fromAfter) return fromAfter;
  if (/übernachtung/.test(b)) return 'night';
  if (/zuschuss|fördersumme|förderung|maximal/.test(b)) return 'project';
  return undefined;
};

const rateBasisFrom = (before: string, after: string): RateBasis | undefined => {
  const a = clampAfter(after).toLowerCase();
  if (/eigenmittel/.test(clampBefore(before, 80).toLowerCase())) return 'own-funds';
  return nearest<RateBasis>(a, [
    [/gesamtkosten/, 'total-costs'],
    [/förderfähigen kosten/, 'eligible-costs'],
    [/barrierefreiheit/, 'accessibility-costs'],
  ]);
};

const issue = (code: string, raw: string, message: string): Issue => ({
  field: 'conditions',
  code,
  message,
  raw,
});

export const parseQuantities = (
  phrase: string,
): { money: Money[]; rates: Rate[]; duration?: Duration; issues: Issue[] } => {
  const money: Money[] = [];
  const rates: Rate[] = [];
  const issues: Issue[] = [];
  let duration: Duration | undefined;

  const malformed: { start: number; end: number }[] = [];
  for (const m of phrase.matchAll(MALFORMED_AMOUNT)) {
    malformed.push({ start: m.index, end: m.index + m[0].length });
    issues.push(issue('unparsed-amount', m[0].trim(), 'amount is space-grouped or carries a scale word; not parsed'));
  }
  const insideMalformed = (at: number): boolean => malformed.some(r => at >= r.start && at < r.end);

  for (const m of phrase.matchAll(new RegExp(`(${NUM})\\s*(?:Euro|EUR|€)`, 'gi'))) {
    if (insideMalformed(m.index)) continue;
    const amountEur = parseGermanNumber(m[1]!);
    if (amountEur === undefined) continue;
    const before = phrase.slice(0, m.index);
    const after = phrase.slice(m.index + m[0].length);
    const per = moneyBasisFrom(before, after);
    if (per === undefined) {
      issues.push(issue('unclassified-basis', m[0], 'Euro amount with no recognisable basis'));
      continue;
    }
    money.push({ amountEur, bound: boundFrom(before), per });
  }

  for (const m of phrase.matchAll(new RegExp(`(${NUM})\\s*(?:Prozent|%)`, 'gi'))) {
    const percent = parseGermanNumber(m[1]!);
    if (percent === undefined || percent > 100) {
      if (percent !== undefined) {
        issues.push(issue('implausible-rate', m[0], 'percentage above 100; dropped'));
      }
      continue;
    }
    const before = phrase.slice(0, m.index);
    const after = phrase.slice(m.index + m[0].length);
    const of = rateBasisFrom(before, after);
    if (of === undefined) {
      issues.push(issue('unclassified-basis', m[0], 'percentage with no recognisable referent'));
      continue;
    }
    rates.push({ percent, bound: boundFrom(before), of });
  }

  const dm = new RegExp(`(${NUM})\\s*(?:bis|–|—|-)\\s*(${NUM})\\s*(Monate?|Jahre?)|(${NUM})\\s*(Monate?|Jahre?)`, 'i').exec(
    phrase,
  );
  if (dm) {
    const isRange = dm[1] !== undefined;
    const value = parseGermanNumber(isRange ? dm[2]! : dm[4]!);
    const unit = isRange ? dm[3]! : dm[5]!;
    if (value !== undefined) {
      const months = /^jahr/i.test(unit) ? value * 12 : value;
      duration = { months, bound: isRange ? 'max' : boundFrom(phrase.slice(0, dm.index)) };
      if (isRange) {
        issues.push(issue('duration-range', dm[0], 'duration given as a range; upper bound used'));
      }
    }
  }

  return duration === undefined ? { money, rates, issues } : { money, rates, duration, issues };
};
