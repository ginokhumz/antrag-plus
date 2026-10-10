import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ProgramSchema, RunReportSchema } from '@antrag-plus/schema';
import type { Program, RunReport } from '@antrag-plus/schema';
import { z } from 'zod';

const readJson = async (path: string): Promise<unknown> => {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Error(`${path} is missing. Run \`npm run scrape\` to produce it.`);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${path} is not valid JSON. Run \`npm run scrape\` to regenerate it.`);
  }
};

export const loadSnapshot = async (dir: string): Promise<{ programmes: Program[]; report: RunReport }> => {
  const programmesPath = join(dir, 'programs.json');
  const parsed = z.array(ProgramSchema).safeParse(await readJson(programmesPath));
  if (!parsed.success) {
    throw new Error(
      `${programmesPath} failed the shared schema: ${parsed.error.issues[0]?.message ?? 'unknown reason'}`,
    );
  }
  if (parsed.data.length === 0) {
    throw new Error(`${programmesPath} is empty. Run \`npm run scrape\` to populate it.`);
  }

  const reportPath = join(dir, 'run-report.json');
  const report = RunReportSchema.safeParse(await readJson(reportPath));
  if (!report.success) {
    throw new Error(`${reportPath} failed the shared schema.`);
  }

  return { programmes: parsed.data, report: report.data };
};
