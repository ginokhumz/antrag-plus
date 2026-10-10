import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RunReportSchema } from '@antrag-plus/schema';
import type { Program, RunReport, Tier } from '@antrag-plus/schema';
import type { DiscoveryReport } from './discover/reconcile.js';

const TIERS: Tier[] = ['standard', 'framework', 'locale', 'site'];

// Counts only fields that actually resolved from a source. A placeholder carrying
// evidence 'none' resolved from nothing, so counting it would report a non-resolution
// as a success. Facts are counted separately: they come from a DOM shape (a <strong>
// ending in a colon), not from German vocabulary, so folding them into the locale row
// would both mislabel them and make the ratio a function of how many bold paragraphs
// a page happens to carry.
const RESOLVED_FIELDS = (p: Program) => [p.name, p.shortDescription, p.deadline, ...Object.values(p.conditions)];

const tierCountsOf = (programmes: Program[]): Record<Tier, number> => {
  const counts = Object.fromEntries(TIERS.map(t => [t, 0])) as Record<Tier, number>;
  for (const p of programmes) {
    for (const f of RESOLVED_FIELDS(p)) {
      if (f && f.evidence !== 'none') counts[f.tier] += 1;
    }
  }
  return counts;
};

const factCountOf = (programmes: Program[]): number =>
  programmes.reduce((n, p) => n + Object.keys(p.facts).length, 0);

const basenameFor = (url: string): string => {
  const u = new URL(url);
  const last = u.pathname.split('/').filter(Boolean).pop() ?? 'index';
  return u.hash ? `${last}${u.hash.replace('#', '-')}` : last;
};

export const emit = async (opts: {
  outDir: string;
  programmes: Program[];
  report: DiscoveryReport;
  rawHtml: Map<string, string>;
  rejectedUrls?: string[];
}): Promise<RunReport> => {
  const seen = new Set<string>();
  for (const p of opts.programmes) {
    if (seen.has(p.id)) throw new Error(`duplicate id ${p.id} for ${p.url}; refusing to overwrite a record`);
    seen.add(p.id);
  }

  await mkdir(join(opts.outDir, 'raw'), { recursive: true });

  const report = RunReportSchema.parse({
    scrapedAt: new Date().toISOString(),
    urls: opts.report.union.length,
    programmes: opts.programmes.length,
    rejected: opts.rejectedUrls?.length ?? 0,
    rejectedUrls: opts.rejectedUrls ?? [],
    strategies: opts.report.strategies,
    disagreements: opts.report.disagreements,
    tierCounts: tierCountsOf(opts.programmes),
    factCount: factCountOf(opts.programmes),
  });

  await writeFile(join(opts.outDir, 'programs.json'), `${JSON.stringify(opts.programmes, null, 2)}\n`);
  await writeFile(join(opts.outDir, 'run-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  for (const [url, html] of opts.rawHtml) {
    await writeFile(join(opts.outDir, 'raw', `${basenameFor(url)}.html`), html);
  }

  return report;
};
