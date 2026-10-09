import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPrograms, type ListEntry } from './api.js';
import { DeadlineBadge } from './DeadlineBadge.js';

const projectCeiling = (entry: ListEntry): string | undefined => {
  const grant = (entry.conditions.grant?.value ?? []).find(m => m.per === 'project');
  return grant ? `max. ${grant.amountEur.toLocaleString('de-DE')} € pro Projekt` : undefined;
};

export const ProgramList = () => {
  const [entries, setEntries] = useState<ListEntry[] | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    getPrograms()
      .then(setEntries)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p role="alert">Die Förderangebote konnten nicht geladen werden: {error}</p>;
  if (!entries) return <p>Lädt …</p>;

  return (
    <main>
      <h1>Förderangebote</h1>
      <ul className="programs">
        {entries.map(entry => {
          const ceiling = projectCeiling(entry);
          return (
            <li key={entry.id}>
              <Link to={`/programs/${entry.id}`}>{entry.name.value}</Link>
              <p>{entry.shortDescription.value}</p>
              <div className="meta">
                <DeadlineBadge deadline={entry.deadline.value} />
                {ceiling ? <span className="badge">{ceiling}</span> : undefined}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
};
