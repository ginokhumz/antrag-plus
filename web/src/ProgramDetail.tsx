import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Program } from '@antrag-plus/schema';
import { getProgram } from './api.js';
import { ConditionsTable } from './ConditionsTable.js';
import { DeadlineBadge } from './DeadlineBadge.js';

export const ProgramDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [program, setProgram] = useState<Program | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (!id) return;
    getProgram(id)
      .then(setProgram)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <p role="alert">Dieses Förderangebot konnte nicht geladen werden: {error}</p>;
  if (!program) return <p>Lädt …</p>;

  return (
    <main>
      <Link to="/">← Alle Förderangebote</Link>
      <h1>{program.name.value}</h1>
      <p className="lead">{program.shortDescription.value}</p>
      <DeadlineBadge deadline={program.deadline.value} />

      <h2>Konditionen</h2>
      <ConditionsTable conditions={program.conditions} />

      {Object.keys(program.facts).length > 0 ? (
        <>
          <h2>Eckdaten</h2>
          <table className="facts">
            <tbody>
              {Object.entries(program.facts).map(([label, value]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{value.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : undefined}

      {program.requirements.map(req => (
        <section key={`${req.kind}-${req.heading}`}>
          <h2>{req.heading}</h2>
          {req.text ? <p>{req.text}</p> : <p className="muted">Nur auf der Originalseite ausgeführt.</p>}
        </section>
      ))}

      {program.bodySections.filter(s => s.text).length > 0 ? (
        <>
          <h2>Weitere Angaben</h2>
          {program.bodySections
            .filter(s => s.text)
            .map(s => (
              <section key={s.heading}>
                <h3>{s.heading}</h3>
                <p>{s.text}</p>
              </section>
            ))}
        </>
      ) : undefined}

      {program.issues.length > 0 ? (
        <section className="issues">
          <h2>Hinweise zur Extraktion</h2>
          <ul>
            {program.issues.map((issue, i) => (
              <li key={`${issue.code}-${i}`}>
                <strong>{issue.field}</strong> — {issue.message}
                {issue.raw ? <span className="muted"> ({issue.raw})</span> : undefined}
              </li>
            ))}
          </ul>
        </section>
      ) : undefined}

      <p>
        <a href={program.url} rel="noopener noreferrer" target="_blank">
          Zum Original auf aktion-mensch.de
        </a>
      </p>
    </main>
  );
};
