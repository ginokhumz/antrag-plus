import type { Bound, Conditions, MoneyBasis, RateBasis } from '@antrag-plus/schema';

const BOUND: Record<Bound, string> = { max: 'max.', min: 'min.', exact: '' };

const MONEY_BASIS: Record<MoneyBasis, string> = {
  project: 'pro Projekt',
  year: 'pro Jahr',
  'person-day': 'pro Person und Tag',
  night: 'pro Übernachtung',
  'partner-year': 'pro Jahr und Projekt-Partner',
};

const RATE_BASIS: Record<RateBasis, string> = {
  'eligible-costs': 'der förderfähigen Kosten',
  'total-costs': 'der Gesamtkosten',
  'own-funds': 'Eigenmittel',
  'accessibility-costs': 'der Kosten für Barrierefreiheit',
};

const euros = (n: number): string => n.toLocaleString('de-DE');

export const ConditionsTable = ({ conditions }: { conditions: Conditions }) => {
  const rows: { label: string; value: string }[] = [];

  for (const m of conditions.grant?.value ?? []) {
    rows.push({ label: 'Zuschuss', value: `${BOUND[m.bound]} ${euros(m.amountEur)} € ${MONEY_BASIS[m.per]}`.trim() });
  }
  for (const r of conditions.fundingRate?.value ?? []) {
    rows.push({ label: 'Förderquote', value: `${BOUND[r.bound]} ${r.percent} % ${RATE_BASIS[r.of]}`.trim() });
  }
  for (const r of conditions.coFinancing?.value ?? []) {
    rows.push({ label: 'Finanzierung', value: `${BOUND[r.bound]} ${r.percent} % ${RATE_BASIS[r.of]}`.trim() });
  }
  if (conditions.maxDuration) {
    const d = conditions.maxDuration.value;
    rows.push({ label: 'Laufzeit', value: `${BOUND[d.bound]} ${d.months} Monate`.trim() });
  }
  for (const cost of conditions.eligibleCosts?.value ?? []) {
    rows.push({ label: 'Förderfähig', value: cost });
  }

  if (rows.length === 0) {
    return <p className="muted">Keine eigenen Förderkonditionen angegeben.</p>;
  }

  return (
    <table className="conditions">
      <tbody>
        {rows.map((row, i) => (
          <tr key={`${row.label}-${i}`}>
            <th scope="row">{row.label}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
