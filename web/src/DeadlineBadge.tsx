import type { Deadline } from '@antrag-plus/schema';

const germanDate = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

export const DeadlineBadge = ({ deadline }: { deadline: Deadline }) => {
  if (deadline.kind === 'window') {
    return <span className="badge" data-deadline="window">bis {germanDate(deadline.end)}</span>;
  }
  if (deadline.kind === 'rolling') {
    return (
      <span className="badge" data-deadline="rolling">
        laufend{deadline.cadence ? ` · ${deadline.cadence}` : ''}
      </span>
    );
  }
  return <span className="badge" data-deadline="unknown">—</span>;
};
