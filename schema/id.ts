import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = '8f14e45f-ceea-467a-9b2c-1d6f3c2b7a51';

export const programId = (canonicalPath: string, sectionId?: string): string => {
  const path = canonicalPath.replace(/\/+$/, '');
  const identity = sectionId === undefined ? path : `${path}#${sectionId}`;
  return uuidv5(identity, NAMESPACE);
};
