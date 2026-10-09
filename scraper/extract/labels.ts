const FOLD: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

const normalise = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[äöüß]/g, c => FOLD[c]!)
    .replace(/[^a-z0-9]+/g, '');

const editDistance = (a: string, b: string): number => {
  const prev = Array.from({ length: b.length + 1 }, (_v, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = prev[j]!;
      prev[j] = Math.min(
        prev[j]! + 1,
        prev[j - 1]! + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return prev[b.length]!;
};

const TOLERANCE = 2;

export const matchesLabel = (heading: string, vocabulary: string[]): boolean => {
  const h = normalise(heading);
  if (!h) return false;
  return vocabulary.some(entry => {
    const v = normalise(entry);
    return h === v || editDistance(h, v) <= TOLERANCE;
  });
};

export const CONDITION_HEADINGS = ['Unsere Konditionen', 'Förderkonditionen', 'Konditionen'];

export const ELIGIBLE_COST_HEADINGS = ['Förderfähige Kosten', 'Was wir fördern'];

export const DEADLINE_LABELS = [
  'Aktuelle Antragsphase',
  'Antragsphase',
  'Antragsfrist',
  'Frist',
  'Antragsschluss',
  'Einsendeschluss',
];

export const REQUIREMENT_LABELS = {
  eligibility: ['Wichtige Voraussetzungen', 'Voraussetzungen', 'Wichtig zu wissen', 'Wen wir fördern'],
  formal: ['Formale Anforderungen', 'Anforderungen', 'Unsere Anforderungen', 'Rahmenbedingungen', 'Zusätzliche Hinweise'],
  exclusions: ['Was wir nicht fördern'],
  process: ['Dein Weg zum Modellprojekt', 'So stellst du deinen Antrag'],
};

export const PRUNE_HEADINGS = [
  'Seiten-Fußbereich',
  'Beliebte Seiten',
  'Bleib immer auf dem Laufenden. Mit unserem Förder-Newsletter.',
  'Projektideen für dich',
  'Projektbeispiele',
  'Erfolgreiche Projektbeispiele',
  'Förderbeispiele entdecken',
  'Finde deine Förderung',
  'Unsere Förderung im Überblick',
  'Die Förderung des Aktion Mensch-Vereins',
  'Über die Stiftung',
  'Du hast Fragen?',
  'Weiterführende Informationen',
  'Impulse',
  'Beratung',
];
