import type { Deadline } from '@antrag-plus/schema';

const SEP = String.raw`(?:–|—|-|bis)`;
const D = String.raw`(\d{1,2})\.(\d{1,2})\.(\d{4})?`;

const iso = (y: number, m: number, d: number): string | undefined => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return undefined;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const CADENCE = /((?:ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|\d+)\s*[Mm]al\s+jährlich)/;

export const parseDeadline = (phrase: string): Deadline => {
  const range = new RegExp(`${D}\\s*${SEP}\\s*${D}`).exec(phrase);
  if (range) {
    const [, sd, sm, sy, ed, em, ey] = range;
    const endYear = Number(ey ?? sy);
    if (Number.isFinite(endYear)) {
      const end = iso(endYear, Number(em), Number(ed));
      let startYear = sy ? Number(sy) : endYear;
      let start = iso(startYear, Number(sm), Number(sd));
      // The start date is routinely written without a year ("01.09. – 15.10.2026"),
      // so it inherits the end year; a Dec→Jan window then needs the prior year.
      if (end && start && start > end && !sy) {
        startYear -= 1;
        start = iso(startYear, Number(sm), Number(sd));
      }
      if (end) return start ? { kind: 'window', start, end } : { kind: 'window', end };
    }
  }

  const single = new RegExp(D.replace('(\\d{4})?', '(\\d{4})')).exec(phrase);
  if (single) {
    const end = iso(Number(single[3]), Number(single[2]), Number(single[1]));
    if (end) return { kind: 'window', end };
  }

  if (/ganzjährig|laufend/i.test(phrase)) {
    const c = CADENCE.exec(phrase);
    return c ? { kind: 'rolling', cadence: c[1]! } : { kind: 'rolling' };
  }

  return { kind: 'unknown' };
};
