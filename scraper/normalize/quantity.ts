import type { Bound, Duration, Issue, Money, MoneyBasis, Rate, RateBasis } from '@antrag-plus/schema';

const NUM = String.raw`\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?`;

export const parseGermanNumber = (s: string): number | undefined => {
  const t = s.trim();
  if (!new RegExp(`^(?:${NUM})$`).test(t)) return undefined;
  const [whole, frac] = t.split(',');
  const digits = whole!.replace(/\./g, '');
  return Number(frac === undefined ? digits : `${digits}.${frac}`);
};

const boundFrom = (before: string): Bound => {
  const tail = before.slice(-60).toLowerCase();
  if (/\bmindestens\b|\bmindest/.test(tail)) return 'min';
  if (/\bmaximal\b|\bhöchstens\b|\bbis zu\b|\bbis maximal\b|\bmax\.?\b/.test(tail)) return 'max';
  return 'exact';
};

const moneyBasisFrom = (before: string, after: string): MoneyBasis | undefined => {
  const a = after.slice(0, 60).toLowerCase();
  const b = before.slice(-60).toLowerCase();
  if (/pro jahr und projekt-?partner/.test(a)) return 'partner-year';
  if (/pro tag/.test(a)) return 'person-day';
  if (/pro jahr/.test(a)) return 'year';
  if (/übernachtung/.test(b)) return 'night';
  if (/zuschuss|fördersumme|förderung|maximal/.test(b)) return 'project';
  return undefined;
};

const rateBasisFrom = (before: string, after: string): RateBasis | undefined => {
  const a = after.slice(0, 80).toLowerCase();
  const b = before.slice(-80).toLowerCase();
  if (/eigenmittel/.test(b)) return 'own-funds';
  if (/barrierefreiheit/.test(a)) return 'accessibility-costs';
  if (/gesamtkosten/.test(a)) return 'total-costs';
  if (/förderfähigen kosten/.test(a)) return 'eligible-costs';
  return undefined;
};

const issue = (raw: string, message: string): Issue => ({
  field: 'conditions',
  code: 'unclassified-basis',
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

  for (const m of phrase.matchAll(new RegExp(`(${NUM})\\s*(?:Euro|EUR|€)`, 'gi'))) {
    const amountEur = parseGermanNumber(m[1]!);
    if (amountEur === undefined) continue;
    const before = phrase.slice(0, m.index);
    const after = phrase.slice(m.index + m[0].length);
    const per = moneyBasisFrom(before, after);
    if (per === undefined) {
      issues.push(issue(m[0], 'Euro amount with no recognisable basis'));
      continue;
    }
    money.push({ amountEur, bound: boundFrom(before), per });
  }

  for (const m of phrase.matchAll(new RegExp(`(${NUM})\\s*(?:Prozent|%)`, 'gi'))) {
    const percent = parseGermanNumber(m[1]!);
    if (percent === undefined) continue;
    const before = phrase.slice(0, m.index);
    const after = phrase.slice(m.index + m[0].length);
    const of = rateBasisFrom(before, after);
    if (of === undefined) {
      issues.push(issue(m[0], 'percentage with no recognisable referent'));
      continue;
    }
    rates.push({ percent, bound: boundFrom(before), of });
  }

  const dm = new RegExp(`(${NUM})\\s*(Monate?|Jahre?)`, 'i').exec(phrase);
  if (dm) {
    const n = parseGermanNumber(dm[1]!);
    if (n !== undefined) {
      const months = /^jahr/i.test(dm[2]!) ? n * 12 : n;
      duration = { months, bound: boundFrom(phrase.slice(0, dm.index)) };
    }
  }

  return duration === undefined ? { money, rates, issues } : { money, rates, duration, issues };
};
