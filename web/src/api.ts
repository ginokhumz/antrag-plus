import type { Program, RunReport } from '@antrag-plus/schema';

export type ListEntry = Pick<Program, 'id' | 'url' | 'name' | 'shortDescription' | 'deadline' | 'conditions'>;

const getJson = async <T>(path: string): Promise<T> => {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json() as Promise<T>;
};

export const getPrograms = (): Promise<ListEntry[]> => getJson<ListEntry[]>('/api/programs');
export const getProgram = (id: string): Promise<Program> => getJson<Program>(`/api/programs/${id}`);
export const getMeta = (): Promise<RunReport> => getJson<RunReport>('/api/meta');
