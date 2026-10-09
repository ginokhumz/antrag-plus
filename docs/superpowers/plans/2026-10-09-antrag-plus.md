# antrag-plus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scrape the seven funding programmes at `aktion-mensch.de/foerderung/foerderangebote`, serve them from an Express API, and render them in a React list and detail view.

**Architecture:** A six-stage scraper pipeline (fetch → discover → extract → normalize → validate → emit) writes a JSON snapshot. Discovery runs three independent source-agnostic strategies and reconciles their disagreements. Extraction prunes non-content modules, segments pages into programmes, then resolves each field through a tier-ordered resolver chain that records which tier produced the value. One zod module is the shared contract: the scraper writes against it, the API validates against it at boot, the frontend derives its types from it.

**Tech Stack:** TypeScript, Node 20+, zod, cheerio, uuid (v5), Express, Vite, React, React Router, Vitest, Testing Library, supertest.

**Spec:** `docs/superpowers/specs/2026-10-08-antrag-plus-design.md`

## Global Constraints

- TypeScript throughout, `strict: true`. Node 20+.
- One `schema/` module is the single source of truth. The scraper, server and web app all import types from it; none redeclares a `Program` shape.
- **Tests never touch the network.** Every test reads from `tests/fixtures/`.
- Scraper politeness: 1 request/second, identifying User-Agent, exponential backoff on 5xx, `robots.txt` parsed and honoured.
- Frontend: plain CSS, system font stack, **no component library**, no state management library.
- No filtering or sorting UI, and no API query parameters (spec §11).
- **Comments explain why, never what** (spec §9). No comment that restates the code (`// ISO dates` above a field typed `IsoDate`). No comment that enumerates current values (`// Art der Förderung, Fokusthema, Zielgruppe`), because it goes stale silently. Encode facts in types and function names; reserve comments for reasoning that is not recoverable from the code.
- German text is the data. Never strip diacritics from extracted values.
- Every extracted value is a `Field<T>` carrying `tier` and `evidence`. No numeric confidence scores.
- A value that cannot be classified is **dropped with an issue, never guessed**.

## Review Focus

Five input classes the spec implies but no task's tests exercise. Each line's test is added to the task that owns the code, named in brackets.

- **A detail page 404s or times out after discovery succeeded.** The spec says a failing *strategy* is recorded not fatal, but is silent on a failing *detail page*. A reasonable person expects the programme to survive from discovery with unresolved fields and a logged issue, and the run to continue. [Task 16]
- **JSON-LD is present but malformed.** The resolver chain reads `c.jsonLd.Article?.description`; invalid JSON would throw and abort extraction for the whole page. A reasonable person expects the chain to fall through to the next tier. [Task 13]
- **Two strategies return the same URL spelled differently** — trailing slash, case, or percent-encoding. `reconcile` unions URL sets, so `/x` and `/x/` would count as two URLs and produce two duplicate programmes. A reasonable person expects them canonicalized to one. [Task 10]
- **A quantity carries a German decimal comma**, e.g. `1.234,56 Euro`. The spec specifies grouping (`50.000` → 50000) but not decimals, so a grouping-only parser yields `123456`. A reasonable person expects `1234.56`, or a rejection — never a hundredfold error. [Task 4]
- **`data/programs.json` is absent or empty when the API boots.** The spec says refuse to start on *garbage*; an absent file is a different case and the default error would be an unhandled `ENOENT`. A reasonable person expects a message naming the missing file and the command that produces it. [Task 17]

---

## File Structure

```
package.json                        workspace root, scripts
tsconfig.base.json                  strict TS config shared by packages
vitest.config.ts                    test runner, offline by construction
.gitignore                          adds data/ except run-report.json

schema/
  index.ts                          zod schemas + inferred types (§3)
  id.ts                             deterministic uuidv5 over canonical identity

scraper/
  fetch.ts                          robots, politeness, charset, disk cache
  robots.ts                         robots.txt parse + allow check
  discover/
    sitemapIndex.ts                 robots → sitemap index → recurse
    embeddedManifest.ts             Next.js RSC payload route manifest
    linkCluster.ts                  anchor harvest + path-shape clustering
    canonicalUrl.ts                 URL canonicalization shared by strategies
    reconcile.ts                    union + disagreement report
  extract/
    prune.ts                        drop nav/footer/promo/example modules
    segment.ts                      split a page into programme segments
    pageCtx.ts                      PageCtx: jsonLd, section, labelledFact, moneyIn
    resolve.ts                      tier-ordered resolver walk → Field<T>
    resolvers.ts                    the resolver lists per field
    labels.ts                       German label vocabulary + fuzzy matcher
    aktionMensch.ts                 site-tier fallbacks only
  normalize/
    text.ts                         inline-join text extraction
    quantity.ts                     German number + bound + basis parser
    germanDates.ts                  date window / rolling / unknown
  validate.ts                       zod parse with per-field issues
  emit.ts                           write outputs, assert id uniqueness
  run.ts                            scrape entrypoint
  verifyLive.ts                     re-fetch and diff against fixtures

server/
  index.ts                          Express app + boot validation
  routes.ts                         three endpoints

web/
  src/main.tsx                      router mount
  src/api.ts                        typed fetch wrappers
  src/ProgramList.tsx               `/`
  src/ProgramDetail.tsx             `/programs/:id`
  src/DeadlineBadge.tsx             the three union renderings
  src/ConditionsTable.tsx           quantity + bound + basis rendering
  src/styles.css                    plain CSS

tests/fixtures/                     7 committed HTML files + robots.txt + sitemaps
docs/DESIGN-NOTE.md                 the one-page deliverable
```

---

## Task 1: Workspace scaffold and committed fixtures

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`
- Create: `scripts/fetch-fixtures.ts`
- Create: `tests/fixtures/` (7 HTML files, `robots.txt`, 2 sitemap XML files)
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` runs Vitest; `tests/fixtures/<name>.html` readable by every later task. Fixture basenames: `listing.html`, `sport-kultur.html`, `junge-menschen.html`, `anschubfoerderung-arbeit.html`, `pauschalfoerderung.html`, `zeichen-setzen.html`, `aktion-mensch-stiftung.html`, `robots.txt`, `sitemap-index.xml`, `sitemap-meta.xml`.

- [ ] **Step 1: Initialise the workspace**

```bash
cd /Users/eugene/Documents/projects/antrag-plus
npm init -y
npm pkg set name="antrag-plus" private=true type="module"
npm pkg set workspaces[0]="schema" workspaces[1]="scraper" workspaces[2]="server" workspaces[3]="web"
npm install -D typescript vitest @types/node tsx
npm install zod cheerio uuid
```

- [ ] **Step 2: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Write `scripts/fetch-fixtures.ts`**

This runs once, by hand, to populate the fixture corpus. It is not part of the test path.

```ts
import { writeFile, mkdir } from 'node:fs/promises';

const UA = 'antrag-plus-fixtures/1.0 (job application exercise)';
const BASE = 'https://www.aktion-mensch.de';
const PROGRAMMES = [
  'sport-kultur',
  'junge-menschen',
  'anschubfoerderung-arbeit',
  'pauschalfoerderung',
  'zeichen-setzen',
  'aktion-mensch-stiftung',
];

const get = async (path: string): Promise<string> => {
  const res = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.text();
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

await mkdir('tests/fixtures', { recursive: true });
await writeFile('tests/fixtures/robots.txt', await get('/robots.txt'));
await sleep(1000);
await writeFile('tests/fixtures/sitemap-index.xml', await get('/index-sitemap.xml'));
await sleep(1000);
await writeFile('tests/fixtures/sitemap-meta.xml', await get('/meta/sitemap.xml'));
await sleep(1000);
await writeFile('tests/fixtures/listing.html', await get('/foerderung/foerderangebote'));
for (const slug of PROGRAMMES) {
  await sleep(1000);
  await writeFile(`tests/fixtures/${slug}.html`, await get(`/foerderung/foerderangebote/${slug}`));
}
console.log('fixtures written');
```

- [ ] **Step 5: Run it and verify the corpus**

```bash
npx tsx scripts/fetch-fixtures.ts
ls tests/fixtures/
```

Expected: 10 files. Each HTML file over 250KB. `grep -c 'Unsere Konditionen\|Förderkonditionen' tests/fixtures/pauschalfoerderung.html` returns at least 1.

- [ ] **Step 6: Add `data/` to `.gitignore`**

Append to `.gitignore`:

```
# scraper output
/data/*
!/data/run-report.json
```

- [ ] **Step 7: Add scripts to `package.json`**

```bash
npm pkg set scripts.test="vitest run"
npm pkg set scripts.scrape="tsx scraper/run.ts"
npm pkg set scripts.typecheck="tsc -p tsconfig.base.json --noEmit"
```

- [ ] **Step 8: Verify the test runner starts**

Run: `npm test`
Expected: exits 0 with "No test files found" — the runner works and there is nothing to run yet.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.base.json vitest.config.ts scripts/ tests/fixtures/ .gitignore
git commit -m "chore: workspace scaffold and committed HTML fixtures"
```

---

## Task 2: The shared zod contract

**Files:**
- Create: `schema/index.ts`
- Create: `schema/package.json`
- Test: `schema/index.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - Schemas: `TierSchema`, `FieldSchema<T>`, `IssueSchema`, `DeadlineSchema`, `MoneySchema`, `RateSchema`, `DurationSchema`, `ConditionsSchema`, `RequirementSchema`, `ProgramSchema`, `RunReportSchema`.
  - Types: `Tier`, `Field<T>`, `Issue`, `IsoDate`, `Deadline`, `Bound`, `MoneyBasis`, `RateBasis`, `Money`, `Rate`, `Duration`, `Conditions`, `RequirementKind`, `Requirement`, `Program`, `RunReport`.
  - `field<T>(value: T, tier: Tier, evidence: string): Field<T>` — constructor used by every resolver.

- [ ] **Step 1: Write the failing test**

Create `schema/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ProgramSchema, DeadlineSchema, ConditionsSchema, field } from './index.js';

const validProgram = {
  id: '6f9619ff-8b86-d011-b42d-00c04fc964ff',
  url: 'https://www.aktion-mensch.de/foerderung/foerderangebote/sport-kultur',
  name: field('Förderung: Sport und Kultur vor Ort', 'standard', 'jsonld.Article.headline'),
  shortDescription: field('Wir wollen Menschen zusammenbringen.', 'standard', 'jsonld.Article.description'),
  deadline: field({ kind: 'window', start: '2026-09-01', end: '2026-10-15' }, 'locale', 'label:Aktuelle Antragsphase'),
  facts: {},
  conditions: {},
  requirements: [],
  bodySections: [],
  issues: [],
};

describe('ProgramSchema', () => {
  it('accepts a valid programme', () => {
    expect(ProgramSchema.parse(validProgram).id).toBe(validProgram.id);
  });

  it('rejects a non-uuid id', () => {
    expect(() => ProgramSchema.parse({ ...validProgram, id: 'sport-kultur' })).toThrow();
  });

  it('rejects a field missing its evidence', () => {
    const bad = { ...validProgram, name: { value: 'x', tier: 'standard' } };
    expect(() => ProgramSchema.parse(bad)).toThrow();
  });
});

describe('DeadlineSchema', () => {
  it('discriminates the three kinds', () => {
    expect(DeadlineSchema.parse({ kind: 'rolling', cadence: 'sechs Mal jährlich' }).kind).toBe('rolling');
    expect(DeadlineSchema.parse({ kind: 'unknown' }).kind).toBe('unknown');
    expect(DeadlineSchema.parse({ kind: 'window', end: '2026-10-15' }).kind).toBe('window');
  });

  it('requires an end date on a window', () => {
    expect(() => DeadlineSchema.parse({ kind: 'window', start: '2026-09-01' })).toThrow();
  });

  it('rejects an unknown kind', () => {
    expect(() => DeadlineSchema.parse({ kind: 'maybe' })).toThrow();
  });
});

describe('ConditionsSchema', () => {
  it('accepts an empty object, which is how aktion-mensch-stiftung is represented', () => {
    expect(ConditionsSchema.parse({})).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run schema/index.test.ts`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 3: Write `schema/package.json`**

```json
{
  "name": "@antrag-plus/schema",
  "private": true,
  "type": "module",
  "main": "index.ts",
  "exports": {
    ".": "./index.ts",
    "./id.js": "./id.ts"
  }
}
```

The `exports` map is what makes `@antrag-plus/schema/id.js` resolve in Task 12; without it that subpath import fails at run time rather than at type-check.

- [ ] **Step 4: Write `schema/index.ts`**

```ts
import { z } from 'zod';

export const TierSchema = z.enum(['standard', 'framework', 'locale', 'site']);
export type Tier = z.infer<typeof TierSchema>;

export const FieldSchema = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, tier: TierSchema, evidence: z.string().min(1) });

export type Field<T> = { value: T; tier: Tier; evidence: string };

export const field = <T>(value: T, tier: Tier, evidence: string): Field<T> => ({ value, tier, evidence });

export const IssueSchema = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string(),
  raw: z.string().optional(),
});
export type Issue = z.infer<typeof IssueSchema>;

const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export type IsoDate = z.infer<typeof IsoDateSchema>;

export const DeadlineSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('window'), start: IsoDateSchema.optional(), end: IsoDateSchema }),
  z.object({ kind: z.literal('rolling'), cadence: z.string().optional() }),
  z.object({ kind: z.literal('unknown') }),
]);
export type Deadline = z.infer<typeof DeadlineSchema>;

export const BoundSchema = z.enum(['max', 'min', 'exact']);
export type Bound = z.infer<typeof BoundSchema>;

export const MoneyBasisSchema = z.enum(['project', 'year', 'person-day', 'night', 'partner-year']);
export type MoneyBasis = z.infer<typeof MoneyBasisSchema>;

export const RateBasisSchema = z.enum(['eligible-costs', 'total-costs', 'own-funds', 'accessibility-costs']);
export type RateBasis = z.infer<typeof RateBasisSchema>;

export const MoneySchema = z.object({ amountEur: z.number().nonnegative(), bound: BoundSchema, per: MoneyBasisSchema });
export type Money = z.infer<typeof MoneySchema>;

export const RateSchema = z.object({ percent: z.number().min(0).max(100), bound: BoundSchema, of: RateBasisSchema });
export type Rate = z.infer<typeof RateSchema>;

export const DurationSchema = z.object({ months: z.number().int().positive(), bound: BoundSchema });
export type Duration = z.infer<typeof DurationSchema>;

export const ConditionsSchema = z.object({
  grant: FieldSchema(z.array(MoneySchema)).optional(),
  fundingRate: FieldSchema(z.array(RateSchema)).optional(),
  maxDuration: FieldSchema(DurationSchema).optional(),
  coFinancing: FieldSchema(z.array(RateSchema)).optional(),
  eligibleCosts: FieldSchema(z.array(z.string())).optional(),
});
export type Conditions = z.infer<typeof ConditionsSchema>;

export const RequirementKindSchema = z.enum(['eligibility', 'formal', 'exclusions', 'process']);
export type RequirementKind = z.infer<typeof RequirementKindSchema>;

export const RequirementSchema = z.object({
  kind: RequirementKindSchema,
  heading: z.string().min(1),
  text: z.string(),
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const ProgramSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url(),
  name: FieldSchema(z.string().min(1)),
  shortDescription: FieldSchema(z.string()),
  deadline: FieldSchema(DeadlineSchema),
  facts: z.record(z.string(), FieldSchema(z.string())),
  conditions: ConditionsSchema,
  requirements: z.array(RequirementSchema),
  bodySections: z.array(z.object({ heading: z.string(), text: z.string() })),
  issues: z.array(IssueSchema),
});
export type Program = z.infer<typeof ProgramSchema>;

export const RunReportSchema = z.object({
  scrapedAt: z.string().datetime(),
  urls: z.number().int().nonnegative(),
  programmes: z.number().int().nonnegative(),
  strategies: z.array(z.object({ name: z.string(), found: z.number().int().nonnegative(), failed: z.boolean() })),
  disagreements: z.array(z.object({ url: z.string(), missedBy: z.array(z.string()) })),
  tierCounts: z.record(TierSchema, z.number().int().nonnegative()),
});
export type RunReport = z.infer<typeof RunReportSchema>;
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run schema/index.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add schema/
git commit -m "feat(schema): shared zod contract for programmes and run reports"
```

---

## Task 3: Text normalization that repairs mid-word element splits

**Files:**
- Create: `scraper/normalize/text.ts`
- Create: `scraper/package.json`
- Test: `scraper/normalize/text.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `text($: CheerioAPI, el: Element): string` — extracts text joining inline elements with no separator and block elements with a single space. Also `collapse(s: string): string`.

- [ ] **Step 1: Write the failing test**

Create `scraper/normalize/text.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';
import { text } from './text.js';

const extract = (html: string): string => {
  const $ = cheerio.load(html);
  return text($, $('body')[0]!);
};

describe('text', () => {
  it('joins inline elements without inserting whitespace', () => {
    expect(extract('<p>J<span>unge Menschen</span></p>')).toBe('Junge Menschen');
  });

  it('keeps legitimate word breaks', () => {
    expect(extract('<p>Junge <strong>Menschen</strong> stärken</p>')).toBe('Junge Menschen stärken');
  });

  it('separates block elements with a single space', () => {
    expect(extract('<p>Erster Satz.</p><p>Zweiter Satz.</p>')).toBe('Erster Satz. Zweiter Satz.');
  });

  it('treats a br as a block boundary', () => {
    expect(extract('<p><strong>Fokusthema:</strong><br/>Junge Menschen</p>')).toBe('Fokusthema: Junge Menschen');
  });

  it('collapses runs of whitespace and non-breaking spaces', () => {
    expect(extract('<p>a  \n\t b&nbsp;c</p>')).toBe('a b c');
  });

  it('preserves diacritics', () => {
    expect(extract('<p>Förderfähige Kosten für Maßnahmen</p>')).toBe('Förderfähige Kosten für Maßnahmen');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scraper/normalize/text.test.ts`
Expected: FAIL — cannot resolve `./text.js`.

- [ ] **Step 3: Write `scraper/package.json`**

```json
{
  "name": "@antrag-plus/scraper",
  "private": true,
  "type": "module",
  "dependencies": {
    "@antrag-plus/schema": "*"
  }
}
```

- [ ] **Step 4: Write `scraper/normalize/text.ts`**

The joining rule is the whole point: a CMS rich-text field can split a word across a text node and an inline element, so inserting whitespace per node turns `Junge` into `J unge`. Only block boundaries may contribute a space.

```ts
import type { AnyNode, Element } from 'domhandler';
import type { CheerioAPI } from 'cheerio';

const BLOCK = new Set([
  'address', 'article', 'aside', 'blockquote', 'br', 'dd', 'div', 'dl', 'dt',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section',
  'table', 'td', 'th', 'tr', 'ul',
]);

export const collapse = (s: string): string => s.replace(/[\s ]+/g, ' ').trim();

export const text = ($: CheerioAPI, el: Element): string => {
  const parts: string[] = [];

  const walk = (node: AnyNode): void => {
    if (node.type === 'text') {
      parts.push(node.data);
      return;
    }
    if (node.type !== 'tag') return;
    const tag = node.name.toLowerCase();
    if (tag === 'script' || tag === 'style') return;
    const block = BLOCK.has(tag);
    if (block) parts.push(' ');
    for (const child of node.children) walk(child);
    if (block) parts.push(' ');
  };

  walk(el);
  return collapse(parts.join(''));
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run scraper/normalize/text.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add scraper/package.json scraper/normalize/
git commit -m "feat(normalize): inline-join text extraction repairing mid-word splits"
```

---

## Task 4: German quantity parser — numbers, bounds and bases

The single highest-risk unit in the build. Spec §2.5 documents six ways a naive parser corrupts these values, and the Review Focus adds a seventh. Every one gets a test.

**Files:**
- Create: `scraper/normalize/quantity.ts`
- Test: `scraper/normalize/quantity.test.ts`

**Interfaces:**
- Consumes: `Bound`, `Money`, `Rate`, `Duration`, `Issue` from `@antrag-plus/schema`.
- Produces:
  - `parseGermanNumber(s: string): number | undefined`
  - `parseQuantities(phrase: string): { money: Money[]; rates: Rate[]; duration?: Duration; issues: Issue[] }`

- [ ] **Step 1: Write the failing test**

Create `scraper/normalize/quantity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseGermanNumber, parseQuantities } from './quantity.js';

describe('parseGermanNumber', () => {
  it('reads a dot as a thousands separator, not a decimal point', () => {
    expect(parseGermanNumber('50.000')).toBe(50000);
    expect(parseGermanNumber('7.500')).toBe(7500);
    expect(parseGermanNumber('400.000')).toBe(400000);
  });

  it('reads a comma as the decimal separator', () => {
    expect(parseGermanNumber('1.234,56')).toBe(1234.56);
    expect(parseGermanNumber('90,5')).toBe(90.5);
  });

  it('reads a bare integer', () => {
    expect(parseGermanNumber('50')).toBe(50);
  });

  it('returns undefined rather than a wrong number for malformed input', () => {
    expect(parseGermanNumber('50.00.000')).toBeUndefined();
    expect(parseGermanNumber('abc')).toBeUndefined();
    expect(parseGermanNumber('')).toBeUndefined();
  });
});

describe('parseQuantities — bounds come from the adverb, not the numeral', () => {
  it('reads maximal as a ceiling', () => {
    const { money } = parseQuantities('Zuschuss maximal 50.000 Euro');
    expect(money).toEqual([{ amountEur: 50000, bound: 'max', per: 'project' }]);
  });

  it('reads mindestens as a floor on an identical numeral', () => {
    const { rates } = parseQuantities('Eigenmittel von mindestens 10 Prozent der förderfähigen Kosten');
    expect(rates).toEqual([{ percent: 10, bound: 'min', of: 'own-funds' }]);
  });

  it('reads bis zu as a ceiling', () => {
    const { rates } = parseQuantities('bis zu 90 Prozent der förderfähigen Kosten');
    expect(rates).toEqual([{ percent: 90, bound: 'max', of: 'eligible-costs' }]);
  });

  it('defaults to exact with no governing adverb', () => {
    const { duration } = parseQuantities('24 Monate Laufzeit');
    expect(duration).toEqual({ months: 24, bound: 'exact' });
  });
});

describe('parseQuantities — basis comes from the unit phrase', () => {
  it('classifies a per-day rate as person-day, never as a project ceiling', () => {
    const { money } = parseQuantities('physische Teilnahme: 50 Euro pro Tag');
    expect(money).toEqual([{ amountEur: 50, bound: 'exact', per: 'person-day' }]);
  });

  it('classifies a compound per-year-per-partner ceiling', () => {
    const { money } = parseQuantities('Maximal 400.000 Euro pro Jahr und Projekt-Partner');
    expect(money).toEqual([{ amountEur: 400000, bound: 'max', per: 'partner-year' }]);
  });

  it('classifies an overnight rate', () => {
    const { money } = parseQuantities('Übernachtung: 70 Euro');
    expect(money).toEqual([{ amountEur: 70, bound: 'exact', per: 'night' }]);
  });

  it('resolves three same-page percentages to three different bases', () => {
    const phrase =
      'bis zu 90 Prozent der förderfähigen Kosten. ' +
      'Investitionen (bis maximal 10 Prozent der Gesamtkosten). ' +
      'Eigenmittel von mindestens 10 Prozent der förderfähigen Kosten';
    const { rates } = parseQuantities(phrase);
    expect(rates).toEqual([
      { percent: 90, bound: 'max', of: 'eligible-costs' },
      { percent: 10, bound: 'max', of: 'total-costs' },
      { percent: 10, bound: 'min', of: 'own-funds' },
    ]);
  });

  it('lets Eigenmittel win over a trailing förderfähigen Kosten', () => {
    const { rates } = parseQuantities('Eigenmittel von mindestens 30 Prozent der förderfähigen Kosten');
    expect(rates[0]!.of).toBe('own-funds');
  });

  it('classifies accessibility costs', () => {
    const { rates } = parseQuantities('bis zu 70 Prozent der Kosten zur Herstellung der Barrierefreiheit');
    expect(rates).toEqual([{ percent: 70, bound: 'max', of: 'accessibility-costs' }]);
  });
});

describe('parseQuantities — durations normalise to months from either unit', () => {
  it('reads Monate directly', () => {
    expect(parseQuantities('48 Monate Laufzeit').duration).toEqual({ months: 48, bound: 'exact' });
  });

  it('converts Jahre to months so the two spellings compare equal', () => {
    expect(parseQuantities('4 Jahre Laufzeit').duration).toEqual({ months: 48, bound: 'exact' });
  });

  it('keeps the bound through the unit conversion', () => {
    expect(parseQuantities('bis zu 2 Jahre Laufzeit').duration).toEqual({ months: 24, bound: 'max' });
  });
});

describe('parseQuantities — unclassifiable values are dropped, never guessed', () => {
  it('drops a Euro amount with no recognisable basis and records an issue', () => {
    const { money, issues } = parseQuantities('Ein Betrag von 1.000 Euro wurde erwähnt');
    expect(money).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('unclassified-basis');
    expect(issues[0]!.raw).toContain('1.000');
  });

  it('drops a percentage with no recognisable referent and records an issue', () => {
    const { rates, issues } = parseQuantities('etwa 40 Prozent aller Anträge');
    expect(rates).toEqual([]);
    expect(issues[0]!.code).toBe('unclassified-basis');
  });

  it('returns nothing and no issue for a phrase with no quantities', () => {
    expect(parseQuantities('Wir fördern inklusive Projekte')).toEqual({ money: [], rates: [], issues: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scraper/normalize/quantity.test.ts`
Expected: FAIL — cannot resolve `./quantity.js`.

- [ ] **Step 3: Write `scraper/normalize/quantity.ts`**

```ts
import type { Bound, Duration, Issue, Money, MoneyBasis, Rate, RateBasis } from '@antrag-plus/schema';

const NUM = String.raw`\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?`;

export const parseGermanNumber = (s: string): number | undefined => {
  const t = s.trim();
  if (!new RegExp(`^(?:${NUM})$`).test(t)) return undefined;
  const [whole, frac] = t.split(',');
  const digits = whole!.replace(/\./g, '');
  return Number(frac === undefined ? digits : `${digits}.${frac}`);
};

const boundFrom = (before: string): Bound => {
  const tail = before.slice(-60).toLowerCase();
  if (/\bmindestens\b|\bmindest/.test(tail)) return 'min';
  if (/\bmaximal\b|\bhöchstens\b|\bbis zu\b|\bbis maximal\b|\bmax\.?\b/.test(tail)) return 'max';
  return 'exact';
};

const moneyBasisFrom = (before: string, after: string): MoneyBasis | undefined => {
  const a = after.slice(0, 60).toLowerCase();
  const b = before.slice(-60).toLowerCase();
  if (/pro jahr und projekt-?partner/.test(a)) return 'partner-year';
  if (/pro tag/.test(a)) return 'person-day';
  if (/pro jahr/.test(a)) return 'year';
  if (/übernachtung/.test(b)) return 'night';
  if (/zuschuss|fördersumme|förderung|maximal/.test(b)) return 'project';
  return undefined;
};

const rateBasisFrom = (before: string, after: string): RateBasis | undefined => {
  const a = after.slice(0, 80).toLowerCase();
  const b = before.slice(-80).toLowerCase();
  if (/eigenmittel/.test(b)) return 'own-funds';
  if (/barrierefreiheit/.test(a)) return 'accessibility-costs';
  if (/gesamtkosten/.test(a)) return 'total-costs';
  if (/förderfähigen kosten/.test(a)) return 'eligible-costs';
  return undefined;
};

const issue = (raw: string, message: string): Issue => ({
  field: 'conditions',
  code: 'unclassified-basis',
  message,
  raw,
});

export const parseQuantities = (
  phrase: string,
): { money: Money[]; rates: Rate[]; duration?: Duration; issues: Issue[] } => {
  const money: Money[] = [];
  const rates: Rate[] = [];
  const issues: Issue[] = [];
  let duration: Duration | undefined;

  for (const m of phrase.matchAll(new RegExp(`(${NUM})\\s*(?:Euro|EUR|€)`, 'gi'))) {
    const amountEur = parseGermanNumber(m[1]!);
    if (amountEur === undefined) continue;
    const before = phrase.slice(0, m.index);
    const after = phrase.slice(m.index + m[0].length);
    const per = moneyBasisFrom(before, after);
    if (per === undefined) {
      issues.push(issue(m[0], 'Euro amount with no recognisable basis'));
      continue;
    }
    money.push({ amountEur, bound: boundFrom(before), per });
  }

  for (const m of phrase.matchAll(new RegExp(`(${NUM})\\s*(?:Prozent|%)`, 'gi'))) {
    const percent = parseGermanNumber(m[1]!);
    if (percent === undefined) continue;
    const before = phrase.slice(0, m.index);
    const after = phrase.slice(m.index + m[0].length);
    const of = rateBasisFrom(before, after);
    if (of === undefined) {
      issues.push(issue(m[0], 'percentage with no recognisable referent'));
      continue;
    }
    rates.push({ percent, bound: boundFrom(before), of });
  }

  const dm = new RegExp(`(${NUM})\\s*(Monate?|Jahre?)`, 'i').exec(phrase);
  if (dm) {
    const n = parseGermanNumber(dm[1]!);
    if (n !== undefined) {
      const months = /^jahr/i.test(dm[2]!) ? n * 12 : n;
      duration = { months, bound: boundFrom(phrase.slice(0, dm.index)) };
    }
  }

  return duration === undefined ? { money, rates, issues } : { money, rates, duration, issues };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scraper/normalize/quantity.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add scraper/normalize/quantity.ts scraper/normalize/quantity.test.ts
git commit -m "feat(normalize): German quantity parser with bounds and bases"
```

---

## Task 5: German date windows

**Files:**
- Create: `scraper/normalize/germanDates.ts`
- Test: `scraper/normalize/germanDates.test.ts`

**Interfaces:**
- Consumes: `Deadline` from `@antrag-plus/schema`.
- Produces: `parseDeadline(phrase: string): Deadline`

- [ ] **Step 1: Write the failing test**

Create `scraper/normalize/germanDates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseDeadline } from './germanDates.js';

describe('parseDeadline — windows', () => {
  it('inherits the missing start year from the end date', () => {
    expect(parseDeadline('Aktuelle Antragsphase: 01.09. – 15.10.2026')).toEqual({
      kind: 'window',
      start: '2026-09-01',
      end: '2026-10-15',
    });
  });

  it('decrements the start year when inheriting would put start after end', () => {
    expect(parseDeadline('15.12. – 31.01.2027')).toEqual({
      kind: 'window',
      start: '2026-12-15',
      end: '2027-01-31',
    });
  });

  it('accepts a hyphen as the range separator', () => {
    expect(parseDeadline('01.09. - 15.10.2026').kind).toBe('window');
  });

  it('accepts bis as the range separator', () => {
    expect(parseDeadline('01.09.2026 bis 15.10.2026')).toEqual({
      kind: 'window',
      start: '2026-09-01',
      end: '2026-10-15',
    });
  });

  it('reads a lone end date as a window with no start', () => {
    expect(parseDeadline('Antragsschluss: 15.10.2026')).toEqual({ kind: 'window', end: '2026-10-15' });
  });
});

describe('parseDeadline — rolling', () => {
  it('reads ganzjährig as rolling', () => {
    const d = parseDeadline('Anträge können ganzjährig eingereicht werden.');
    expect(d.kind).toBe('rolling');
  });

  it('captures the cadence when stated', () => {
    const d = parseDeadline('ganzjährig. Die Bewilligungsrunden erfolgen sechs Mal jährlich.');
    expect(d).toEqual({ kind: 'rolling', cadence: 'sechs Mal jährlich' });
  });

  it('reads laufend as rolling', () => {
    expect(parseDeadline('laufende Antragstellung').kind).toBe('rolling');
  });
});

describe('parseDeadline — unknown', () => {
  it('returns unknown for a phrase with no date and no rolling marker', () => {
    expect(parseDeadline('Wir fördern inklusive Projekte.')).toEqual({ kind: 'unknown' });
  });

  it('returns unknown rather than a wrong date for an impossible date', () => {
    expect(parseDeadline('32.13.2026')).toEqual({ kind: 'unknown' });
  });

  it('prefers a stated window over a rolling marker appearing in the same phrase', () => {
    expect(parseDeadline('ganzjährig, aktuelle Phase 01.09. – 15.10.2026').kind).toBe('window');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run scraper/normalize/germanDates.test.ts`
Expected: FAIL — cannot resolve `./germanDates.js`.

- [ ] **Step 3: Write `scraper/normalize/germanDates.ts`**

```ts
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
      // The start date is routinely written without a year ("01.09. – 15.10.2026"),
      // so it inherits the end year; a Dec→Jan window then needs the prior year.
      let startYear = sy ? Number(sy) : endYear;
      let start = iso(startYear, Number(sm), Number(sd));
      if (end && start && start > end && !sy) {
        startYear -= 1;
        start = iso(startYear, Number(sm), Number(sd));
      }
      if (end) return start ? { kind: 'window', start, end } : { kind: 'window', end };
    }
  }

  const single = new RegExp(`${D.replace('(\\d{4})?', '(\\d{4})')}`).exec(phrase);
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scraper/normalize/germanDates.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add scraper/normalize/germanDates.ts scraper/normalize/germanDates.test.ts
git commit -m "feat(normalize): German date windows with start-year inheritance"
```

---

## Task 6: Polite fetch with robots, charset detection and disk cache

**Files:**
- Create: `scraper/robots.ts`
- Create: `scraper/fetch.ts`
- Test: `scraper/robots.test.ts`
- Test: `scraper/fetch.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `parseRobots(body: string): { allow(path: string): boolean; sitemaps: string[] }`
  - `type HttpGet = (url: string, headers: Record<string, string>) => Promise<HttpResponse>` where `HttpResponse = { status: number; body: Buffer; headers: Record<string, string> }`
  - `type Fetched = { html: string; status: number; fetchedAt: string; fromCache: boolean }`
  - `createFetcher(opts: { get: HttpGet; cacheDir: string; sleep?: (ms: number) => Promise<void> }): { fetch(url: string): Promise<Fetched> }`

The HTTP layer is injected so every test runs offline. `scraper/run.ts` passes a real implementation built on `globalThis.fetch`.

- [ ] **Step 1: Write the failing robots test**

Create `scraper/robots.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { parseRobots } from './robots.js';

const body = await readFile('tests/fixtures/robots.txt', 'utf8');

describe('parseRobots', () => {
  it('allows the funding path this scraper targets', () => {
    expect(parseRobots(body).allow('/foerderung/foerderangebote')).toBe(true);
  });

  it('honours a disallowed path', () => {
    expect(parseRobots(body).allow('/webservices/anything')).toBe(false);
  });

  it('collects the declared sitemaps', () => {
    expect(parseRobots(body).sitemaps).toContain('https://www.aktion-mensch.de/index-sitemap.xml');
  });

  it('allows everything when there are no rules', () => {
    expect(parseRobots('').allow('/anything')).toBe(true);
  });

  it('treats a wildcard disallow as blocking', () => {
    expect(parseRobots('User-agent: *\nDisallow: /').allow('/foerderung')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scraper/robots.test.ts`
Expected: FAIL — cannot resolve `./robots.js`.

- [ ] **Step 3: Write `scraper/robots.ts`**

```ts
export const parseRobots = (body: string): { allow(path: string): boolean; sitemaps: string[] } => {
  const sitemaps: string[] = [];
  const disallowed: string[] = [];
  let appliesToUs = false;

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [keyPart, ...rest] = line.split(':');
    const key = keyPart!.trim().toLowerCase();
    const value = rest.join(':').trim();
    if (key === 'sitemap') sitemaps.push(value);
    else if (key === 'user-agent') appliesToUs = value === '*';
    else if (key === 'disallow' && appliesToUs && value) disallowed.push(value);
  }

  const allow = (path: string): boolean =>
    !disallowed.some(rule => {
      const prefix = rule.replace(/\*$/, '');
      return path.startsWith(prefix);
    });

  return { allow, sitemaps };
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run scraper/robots.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing fetch test**

Create `scraper/fetch.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFetcher, type HttpGet } from './fetch.js';

let cacheDir: string;
beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), 'antrag-fetch-'));
  return () => rm(cacheDir, { recursive: true, force: true });
});

const ok = (body: Buffer, headers: Record<string, string> = {}): Awaited<ReturnType<HttpGet>> => ({
  status: 200,
  body,
  headers,
});

describe('createFetcher', () => {
  it('sends an identifying User-Agent', async () => {
    const seen: Record<string, string>[] = [];
    const get: HttpGet = async (_u, h) => { seen.push(h); return ok(Buffer.from('<p>hi</p>')); };
    await createFetcher({ get, cacheDir, sleep: async () => {} }).fetch('https://x.test/a');
    expect(seen[0]!['User-Agent']).toMatch(/antrag-plus/);
  });

  it('decodes ISO-8859-1 from the Content-Type header so umlauts survive', async () => {
    const latin1 = Buffer.from('<p>Förderung</p>', 'latin1');
    const get: HttpGet = async () => ok(latin1, { 'content-type': 'text/html; charset=ISO-8859-1' });
    const { html } = await createFetcher({ get, cacheDir, sleep: async () => {} }).fetch('https://x.test/a');
    expect(html).toContain('Förderung');
  });

  it('falls back to the meta charset when the header is silent', async () => {
    const latin1 = Buffer.from('<meta charset="iso-8859-1"><p>Maßnahmen</p>', 'latin1');
    const get: HttpGet = async () => ok(latin1, {});
    const { html } = await createFetcher({ get, cacheDir, sleep: async () => {} }).fetch('https://x.test/a');
    expect(html).toContain('Maßnahmen');
  });

  it('defaults to UTF-8', async () => {
    const get: HttpGet = async () => ok(Buffer.from('<p>Förderfähige</p>', 'utf8'));
    const { html } = await createFetcher({ get, cacheDir, sleep: async () => {} }).fetch('https://x.test/a');
    expect(html).toContain('Förderfähige');
  });

  it('serves the second request for a URL from disk without calling out', async () => {
    let calls = 0;
    const get: HttpGet = async () => { calls += 1; return ok(Buffer.from('<p>once</p>')); };
    const f = createFetcher({ get, cacheDir, sleep: async () => {} });
    const first = await f.fetch('https://x.test/a');
    const second = await f.fetch('https://x.test/a');
    expect(calls).toBe(1);
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.html).toBe('<p>once</p>');
  });

  it('retries a 500 and succeeds on the second attempt', async () => {
    let calls = 0;
    const get: HttpGet = async () => {
      calls += 1;
      return calls === 1 ? { status: 500, body: Buffer.alloc(0), headers: {} } : ok(Buffer.from('<p>ok</p>'));
    };
    const { html } = await createFetcher({ get, cacheDir, sleep: async () => {} }).fetch('https://x.test/a');
    expect(calls).toBe(2);
    expect(html).toBe('<p>ok</p>');
  });

  it('gives up after the retry budget and reports the status', async () => {
    const get: HttpGet = async () => ({ status: 503, body: Buffer.alloc(0), headers: {} });
    const { status } = await createFetcher({ get, cacheDir, sleep: async () => {} }).fetch('https://x.test/a');
    expect(status).toBe(503);
  });

  it('does not retry a 404', async () => {
    let calls = 0;
    const get: HttpGet = async () => { calls += 1; return { status: 404, body: Buffer.alloc(0), headers: {} }; };
    const { status } = await createFetcher({ get, cacheDir, sleep: async () => {} }).fetch('https://x.test/a');
    expect(calls).toBe(1);
    expect(status).toBe(404);
  });

  it('waits between distinct requests', async () => {
    const waits: number[] = [];
    const get: HttpGet = async () => ok(Buffer.from('<p>x</p>'));
    const f = createFetcher({ get, cacheDir, sleep: async ms => { waits.push(ms); } });
    await f.fetch('https://x.test/a');
    await f.fetch('https://x.test/b');
    expect(waits.some(ms => ms >= 1000)).toBe(true);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run scraper/fetch.test.ts`
Expected: FAIL — cannot resolve `./fetch.js`.

- [ ] **Step 7: Write `scraper/fetch.ts`**

```ts
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type HttpResponse = { status: number; body: Buffer; headers: Record<string, string> };
export type HttpGet = (url: string, headers: Record<string, string>) => Promise<HttpResponse>;
export type Fetched = { html: string; status: number; fetchedAt: string; fromCache: boolean };

const USER_AGENT = 'antrag-plus/1.0 (+https://github.com/eugene/antrag-plus; job application exercise)';
const MIN_INTERVAL_MS = 1000;
const MAX_ATTEMPTS = 3;

const charsetOf = (headers: Record<string, string>, body: Buffer): string => {
  const fromHeader = /charset=([\w-]+)/i.exec(headers['content-type'] ?? '');
  if (fromHeader) return fromHeader[1]!.toLowerCase();
  const head = body.subarray(0, 2048).toString('latin1');
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head);
  return (fromMeta?.[1] ?? 'utf-8').toLowerCase();
};

const decode = (body: Buffer, charset: string): string => {
  const label = charset === 'iso-8859-1' || charset === 'latin1' ? 'latin1' : 'utf8';
  return body.toString(label as BufferEncoding);
};

const keyFor = (url: string): string => `${createHash('sha256').update(url).digest('hex')}.html`;

export const createFetcher = (opts: {
  get: HttpGet;
  cacheDir: string;
  sleep?: (ms: number) => Promise<void>;
}): { fetch(url: string): Promise<Fetched> } => {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  let lastRequestAt = 0;

  const fetchOne = async (url: string): Promise<Fetched> => {
    const cachePath = join(opts.cacheDir, keyFor(url));
    try {
      const cached = await readFile(cachePath, 'utf8');
      return { html: cached, status: 200, fetchedAt: new Date().toISOString(), fromCache: true };
    } catch {
      // Not cached yet; fall through to the network.
    }

    let res: HttpResponse | undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const since = Date.now() - lastRequestAt;
      if (since < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - since);
      lastRequestAt = Date.now();
      res = await opts.get(url, { 'User-Agent': USER_AGENT, 'Accept-Language': 'de-DE,de;q=0.9' });
      if (res.status < 500) break;
      if (attempt < MAX_ATTEMPTS) await sleep(MIN_INTERVAL_MS * 2 ** attempt);
    }

    const final = res!;
    const html = final.status === 200 ? decode(final.body, charsetOf(final.headers, final.body)) : '';
    if (final.status === 200) {
      await mkdir(opts.cacheDir, { recursive: true });
      await writeFile(cachePath, html, 'utf8');
    }
    return { html, status: final.status, fetchedAt: new Date().toISOString(), fromCache: false };
  };

  return { fetch: fetchOne };
};
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run scraper/fetch.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 9: Commit**

```bash
git add scraper/robots.ts scraper/robots.test.ts scraper/fetch.ts scraper/fetch.test.ts
git commit -m "feat(scraper): polite fetch with robots, charset detection and disk cache"
```

---

## Task 7: URL canonicalization and the sitemap-index strategy

Spec §2.1: the programmes are absent from `/sitemap.xml` and present only in the fourth sub-sitemap. A strategy that fetches the obvious sitemap finds zero and reports success, so this strategy walks every sitemap `robots.txt` declares.

**Files:**
- Create: `scraper/discover/canonicalUrl.ts`
- Create: `scraper/discover/sitemapIndex.ts`
- Test: `scraper/discover/canonicalUrl.test.ts`
- Test: `scraper/discover/sitemapIndex.test.ts`
- Create: `tests/fixtures/sitemap-main.xml`

**Interfaces:**
- Consumes: `parseRobots` (Task 6), `Fetched` (Task 6).
- Produces:
  - `canonicalUrl(raw: string, base?: string): string | undefined` — absolute, lowercased host, no trailing slash, no query, fragment preserved only when explicitly kept by the caller.
  - `type Strategy = { name: string; run(deps: StrategyDeps): Promise<string[]> }`
  - `type StrategyDeps = { listingUrl: string; fetchText(url: string): Promise<string | undefined> }`
  - `sitemapIndex: Strategy`

- [ ] **Step 1: Add the main sitemap to the corpus**

The headline finding needs the obvious sitemap on disk to be asserted against.

```bash
curl -sL -A "antrag-plus-fixtures/1.0" https://www.aktion-mensch.de/sitemap.xml -o tests/fixtures/sitemap-main.xml
grep -c '<loc>' tests/fixtures/sitemap-main.xml
```

Expected: several hundred `<loc>` entries.

- [ ] **Step 2: Write the failing canonicalUrl test**

Create `scraper/discover/canonicalUrl.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { canonicalUrl } from './canonicalUrl.js';

describe('canonicalUrl', () => {
  it('strips a trailing slash so two spellings collapse to one', () => {
    expect(canonicalUrl('https://www.aktion-mensch.de/foerderung/x/')).toBe(
      'https://www.aktion-mensch.de/foerderung/x',
    );
  });

  it('lowercases the host but not the path', () => {
    expect(canonicalUrl('https://WWW.Aktion-Mensch.DE/Foerderung/X')).toBe(
      'https://www.aktion-mensch.de/Foerderung/X',
    );
  });

  it('decodes percent-encoded path segments', () => {
    expect(canonicalUrl('https://x.test/f%C3%B6rderung')).toBe('https://x.test/förderung');
  });

  it('drops the query string', () => {
    expect(canonicalUrl('https://x.test/a?utm_source=news')).toBe('https://x.test/a');
  });

  it('drops the fragment', () => {
    expect(canonicalUrl('https://x.test/a#151880')).toBe('https://x.test/a');
  });

  it('resolves a relative path against the base', () => {
    expect(canonicalUrl('/foerderung/x', 'https://x.test/listing')).toBe('https://x.test/foerderung/x');
  });

  it('returns undefined for a non-http scheme', () => {
    expect(canonicalUrl('mailto:a@b.test')).toBeUndefined();
    expect(canonicalUrl('javascript:void(0)')).toBeUndefined();
  });

  it('returns undefined for unparseable input', () => {
    expect(canonicalUrl('not a url')).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run scraper/discover/canonicalUrl.test.ts`
Expected: FAIL — cannot resolve `./canonicalUrl.js`.

- [ ] **Step 4: Write `scraper/discover/canonicalUrl.ts`**

```ts
export const canonicalUrl = (raw: string, base?: string): string | undefined => {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return undefined;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
  const path = decodeURI(u.pathname).replace(/\/+$/, '');
  return `${u.protocol}//${u.hostname.toLowerCase()}${path}`;
};
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run scraper/discover/canonicalUrl.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Write the failing sitemapIndex test**

Create `scraper/discover/sitemapIndex.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { sitemapIndex } from './sitemapIndex.js';

const fixtures: Record<string, string> = {
  'https://www.aktion-mensch.de/robots.txt': await readFile('tests/fixtures/robots.txt', 'utf8'),
  'https://www.aktion-mensch.de/index-sitemap.xml': await readFile('tests/fixtures/sitemap-index.xml', 'utf8'),
  'https://www.aktion-mensch.de/sitemap.xml': await readFile('tests/fixtures/sitemap-main.xml', 'utf8'),
  'https://www.aktion-mensch.de/meta/sitemap.xml': await readFile('tests/fixtures/sitemap-meta.xml', 'utf8'),
};

const deps = {
  listingUrl: 'https://www.aktion-mensch.de/foerderung/foerderangebote',
  fetchText: async (url: string) => fixtures[url],
};

describe('sitemapIndex', () => {
  it('finds all six programme URLs by walking the sitemap index', async () => {
    const urls = await sitemapIndex.run(deps);
    expect(urls).toHaveLength(6);
    expect(urls).toEqual(expect.arrayContaining([
      'https://www.aktion-mensch.de/foerderung/foerderangebote/sport-kultur',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/junge-menschen',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/anschubfoerderung-arbeit',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/pauschalfoerderung',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/zeichen-setzen',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/aktion-mensch-stiftung',
    ]));
  });

  it('excludes the listing URL itself from the programme set', async () => {
    expect(await sitemapIndex.run(deps)).not.toContain(deps.listingUrl);
  });

  it('finds nothing in the obvious sitemap alone, which is the whole point of walking the index', async () => {
    const onlyMain = { ...deps, fetchText: async (url: string) =>
      url.endsWith('/sitemap.xml') && !url.includes('/meta/') ? fixtures['https://www.aktion-mensch.de/sitemap.xml'] : undefined };
    expect(await sitemapIndex.run(onlyMain)).toHaveLength(0);
  });

  it('tolerates a sub-sitemap that cannot be fetched', async () => {
    const patchy = { ...deps, fetchText: async (url: string) =>
      url.includes('lotterie') ? undefined : fixtures[url] };
    expect(await sitemapIndex.run(patchy)).toHaveLength(6);
  });

  it('returns an empty array when robots.txt is unavailable', async () => {
    expect(await sitemapIndex.run({ ...deps, fetchText: async () => undefined })).toEqual([]);
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run scraper/discover/sitemapIndex.test.ts`
Expected: FAIL — cannot resolve `./sitemapIndex.js`.

- [ ] **Step 8: Write `scraper/discover/sitemapIndex.ts`**

```ts
import { parseRobots } from '../robots.js';
import { canonicalUrl } from './canonicalUrl.js';

export type StrategyDeps = {
  listingUrl: string;
  fetchText(url: string): Promise<string | undefined>;
};

export type Strategy = { name: string; run(deps: StrategyDeps): Promise<string[]> };

const locsIn = (xml: string): string[] =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]!);

const isChildOf = (candidate: string, parent: string): boolean =>
  candidate.startsWith(`${parent}/`) && !candidate.slice(parent.length + 1).includes('/');

export const sitemapIndex: Strategy = {
  name: 'sitemapIndex',
  async run({ listingUrl, fetchText }) {
    const origin = new URL(listingUrl).origin;
    const robots = await fetchText(`${origin}/robots.txt`);
    if (robots === undefined) return [];

    const queue = [...parseRobots(robots).sitemaps];
    const seen = new Set<string>();
    const found = new Set<string>();

    while (queue.length > 0) {
      const next = queue.shift()!;
      if (seen.has(next)) continue;
      seen.add(next);
      const xml = await fetchText(next);
      if (xml === undefined) continue;
      const nested = /<sitemapindex/.test(xml);
      for (const loc of locsIn(xml)) {
        if (nested) {
          queue.push(loc);
          continue;
        }
        const url = canonicalUrl(loc);
        if (url && isChildOf(url, listingUrl)) found.add(url);
      }
    }

    return [...found];
  },
};
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npx vitest run scraper/discover/sitemapIndex.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 10: Commit**

```bash
git add scraper/discover/canonicalUrl.ts scraper/discover/canonicalUrl.test.ts \
        scraper/discover/sitemapIndex.ts scraper/discover/sitemapIndex.test.ts \
        tests/fixtures/sitemap-main.xml
git commit -m "feat(discover): URL canonicalization and sitemap-index walking strategy"
```

---

## Task 8: Embedded route manifest strategy

Framework-tier knowledge: a Next.js App Router page pushes its RSC payload into `self.__next_f`, and the navigation tree inside it lists every programme. Keyed on the framework, not the site.

**Files:**
- Create: `scraper/discover/embeddedManifest.ts`
- Test: `scraper/discover/embeddedManifest.test.ts`

**Interfaces:**
- Consumes: `Strategy`, `StrategyDeps`, `canonicalUrl` (Task 7).
- Produces: `embeddedManifest: Strategy`

- [ ] **Step 1: Write the failing test**

Create `scraper/discover/embeddedManifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { embeddedManifest } from './embeddedManifest.js';

const listing = await readFile('tests/fixtures/listing.html', 'utf8');
const deps = {
  listingUrl: 'https://www.aktion-mensch.de/foerderung/foerderangebote',
  fetchText: async () => listing,
};

describe('embeddedManifest', () => {
  it('finds all six programme URLs in the RSC payload', async () => {
    const urls = await embeddedManifest.run(deps);
    expect(urls).toHaveLength(6);
    expect(urls).toEqual(expect.arrayContaining([
      'https://www.aktion-mensch.de/foerderung/foerderangebote/zeichen-setzen',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/aktion-mensch-stiftung',
    ]));
  });

  it('finds the two programmes the rendered anchors omit', async () => {
    const urls = await embeddedManifest.run(deps);
    const omittedByMarkup = urls.filter(u => /zeichen-setzen|aktion-mensch-stiftung/.test(u));
    expect(omittedByMarkup).toHaveLength(2);
  });

  it('excludes the overview entry that shares the listing URL', async () => {
    expect(await embeddedManifest.run(deps)).not.toContain(deps.listingUrl);
  });

  it('returns an empty array on a page with no embedded payload', async () => {
    expect(await embeddedManifest.run({ ...deps, fetchText: async () => '<html><body>nix</body></html>' })).toEqual([]);
  });

  it('returns an empty array when the page cannot be fetched', async () => {
    expect(await embeddedManifest.run({ ...deps, fetchText: async () => undefined })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scraper/discover/embeddedManifest.test.ts`
Expected: FAIL — cannot resolve `./embeddedManifest.js`.

- [ ] **Step 3: Write `scraper/discover/embeddedManifest.ts`**

The payload is JavaScript string literals rather than a JSON document, so the `href` values are read out of the escaped source directly. Parsing the flight format properly would couple this to a Next.js internal; the href shape is stable across versions.

```ts
import { canonicalUrl } from './canonicalUrl.js';
import type { Strategy } from './sitemapIndex.js';

const HREF_IN_PAYLOAD = /\\?"href\\?":\\?"([^"\\]+)\\?"/g;
const NEXT_DATA = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;

const hrefsFrom = (html: string): string[] => {
  const out: string[] = [];
  if (/self\.__next_f\.push/.test(html)) {
    for (const m of html.matchAll(HREF_IN_PAYLOAD)) out.push(m[1]!);
  }
  const nextData = NEXT_DATA.exec(html);
  if (nextData) {
    for (const m of nextData[1]!.matchAll(/"href":"([^"]+)"/g)) out.push(m[1]!);
  }
  return out;
};

const isChildOf = (candidate: string, parent: string): boolean =>
  candidate.startsWith(`${parent}/`) && !candidate.slice(parent.length + 1).includes('/');

export const embeddedManifest: Strategy = {
  name: 'embeddedManifest',
  async run({ listingUrl, fetchText }) {
    const html = await fetchText(listingUrl);
    if (html === undefined) return [];
    const found = new Set<string>();
    for (const href of hrefsFrom(html)) {
      const url = canonicalUrl(href, listingUrl);
      if (url && isChildOf(url, listingUrl)) found.add(url);
    }
    return [...found];
  },
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run scraper/discover/embeddedManifest.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add scraper/discover/embeddedManifest.ts scraper/discover/embeddedManifest.test.ts
git commit -m "feat(discover): embedded route manifest strategy"
```

---

## Task 9: Link-cluster strategy

Structural-tier knowledge, and the strategy that must hold **no site selectors at all**. It harvests every anchor, keeps same-origin, clusters by `(parent path, depth)`, and takes the cluster that are path-children of the listing URL. Spec §2.1: this finds 4, which is fewer than the other two — and that disagreement is the point.

**Files:**
- Create: `scraper/discover/linkCluster.ts`
- Test: `scraper/discover/linkCluster.test.ts`

**Interfaces:**
- Consumes: `Strategy`, `canonicalUrl` (Task 7), cheerio.
- Produces: `linkCluster: Strategy`

- [ ] **Step 1: Write the failing test**

Create `scraper/discover/linkCluster.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { linkCluster } from './linkCluster.js';

const listing = await readFile('tests/fixtures/listing.html', 'utf8');
const deps = {
  listingUrl: 'https://www.aktion-mensch.de/foerderung/foerderangebote',
  fetchText: async () => listing,
};

describe('linkCluster', () => {
  it('finds the four programmes reachable from rendered anchors', async () => {
    const urls = await linkCluster.run(deps);
    expect(urls).toHaveLength(4);
    expect(urls).toEqual(expect.arrayContaining([
      'https://www.aktion-mensch.de/foerderung/foerderangebote/sport-kultur',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/junge-menschen',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/pauschalfoerderung',
      'https://www.aktion-mensch.de/foerderung/foerderangebote/anschubfoerderung-arbeit',
    ]));
  });

  it('misses the two programmes that exist only in the embedded payload, which reconcile must surface', async () => {
    const urls = await linkCluster.run(deps);
    expect(urls.some(u => u.includes('zeichen-setzen'))).toBe(false);
    expect(urls.some(u => u.includes('aktion-mensch-stiftung'))).toBe(false);
  });

  it('ignores same-origin links outside the listing path', async () => {
    const urls = await linkCluster.run(deps);
    expect(urls.every(u => u.startsWith(`${deps.listingUrl}/`))).toBe(true);
  });

  it('ignores off-origin links', async () => {
    const html = `<a href="${deps.listingUrl}/a">a</a><a href="${deps.listingUrl}/b">b</a><a href="https://other.test/foerderung/foerderangebote/c">c</a>`;
    const urls = await linkCluster.run({ ...deps, fetchText: async () => html });
    expect(urls).toHaveLength(2);
  });

  it('requires at least two members before treating a path group as a cluster', async () => {
    const html = `<a href="${deps.listingUrl}/only">only</a>`;
    expect(await linkCluster.run({ ...deps, fetchText: async () => html })).toEqual([]);
  });

  it('returns an empty array when the page cannot be fetched', async () => {
    expect(await linkCluster.run({ ...deps, fetchText: async () => undefined })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scraper/discover/linkCluster.test.ts`
Expected: FAIL — cannot resolve `./linkCluster.js`.

- [ ] **Step 3: Write `scraper/discover/linkCluster.ts`**

```ts
import * as cheerio from 'cheerio';
import { canonicalUrl } from './canonicalUrl.js';
import type { Strategy } from './sitemapIndex.js';

const MIN_CLUSTER = 2;

export const linkCluster: Strategy = {
  name: 'linkCluster',
  async run({ listingUrl, fetchText }) {
    const html = await fetchText(listingUrl);
    if (html === undefined) return [];

    const $ = cheerio.load(html);
    const origin = new URL(listingUrl).origin;
    const prefix = `${listingUrl}/`;
    const children = new Set<string>();

    $('a[href]').each((_i, el) => {
      const url = canonicalUrl($(el).attr('href')!, listingUrl);
      if (!url || !url.startsWith(origin)) return;
      if (!url.startsWith(prefix)) return;
      if (url.slice(prefix.length).includes('/')) return;
      children.add(url);
    });

    return children.size >= MIN_CLUSTER ? [...children] : [];
  },
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run scraper/discover/linkCluster.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add scraper/discover/linkCluster.ts scraper/discover/linkCluster.test.ts
git commit -m "feat(discover): link-cluster strategy with no site selectors"
```

---

## Task 10: Reconcile the strategies

**Files:**
- Create: `scraper/discover/reconcile.ts`
- Test: `scraper/discover/reconcile.test.ts`

**Interfaces:**
- Consumes: `Strategy`, `StrategyDeps`, `canonicalUrl` (Task 7).
- Produces:
  - `type DiscoveryReport = { strategies: { name: string; found: number; failed: boolean }[]; union: string[]; disagreements: { url: string; missedBy: string[] }[] }`
  - `discover(strategies: Strategy[], deps: StrategyDeps): Promise<DiscoveryReport>`

- [ ] **Step 1: Write the failing test**

Create `scraper/discover/reconcile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { discover } from './reconcile.js';
import { sitemapIndex } from './sitemapIndex.js';
import { embeddedManifest } from './embeddedManifest.js';
import { linkCluster } from './linkCluster.js';
import type { Strategy } from './sitemapIndex.js';

const listingUrl = 'https://www.aktion-mensch.de/foerderung/foerderangebote';
const fixtures: Record<string, string> = {
  [listingUrl]: await readFile('tests/fixtures/listing.html', 'utf8'),
  'https://www.aktion-mensch.de/robots.txt': await readFile('tests/fixtures/robots.txt', 'utf8'),
  'https://www.aktion-mensch.de/index-sitemap.xml': await readFile('tests/fixtures/sitemap-index.xml', 'utf8'),
  'https://www.aktion-mensch.de/sitemap.xml': await readFile('tests/fixtures/sitemap-main.xml', 'utf8'),
  'https://www.aktion-mensch.de/meta/sitemap.xml': await readFile('tests/fixtures/sitemap-meta.xml', 'utf8'),
};
const deps = { listingUrl, fetchText: async (u: string) => fixtures[u] };
const all = [sitemapIndex, embeddedManifest, linkCluster];

const stub = (name: string, urls: string[]): Strategy => ({ name, run: async () => urls });

describe('discover', () => {
  it('records the real per-strategy counts', async () => {
    const r = await discover(all, deps);
    expect(r.strategies).toEqual([
      { name: 'sitemapIndex', found: 6, failed: false },
      { name: 'embeddedManifest', found: 6, failed: false },
      { name: 'linkCluster', found: 4, failed: false },
    ]);
  });

  it('unions to six URLs', async () => {
    expect((await discover(all, deps)).union).toHaveLength(6);
  });

  it('names exactly the two URLs linkCluster missed', async () => {
    const r = await discover(all, deps);
    expect(r.disagreements).toHaveLength(2);
    expect(r.disagreements.map(d => d.url).sort()).toEqual([
      `${listingUrl}/aktion-mensch-stiftung`,
      `${listingUrl}/zeichen-setzen`,
    ]);
    expect(r.disagreements.every(d => d.missedBy).toString()).toBeTruthy();
    for (const d of r.disagreements) expect(d.missedBy).toEqual(['linkCluster']);
  });

  it('reports no disagreement when every strategy agrees', async () => {
    const r = await discover([stub('a', [`${listingUrl}/x`]), stub('b', [`${listingUrl}/x`])], deps);
    expect(r.disagreements).toEqual([]);
  });

  it('canonicalizes before unioning, so two spellings of one URL count once', async () => {
    const r = await discover(
      [stub('a', [`${listingUrl}/x`]), stub('b', [`${listingUrl}/x/`]), stub('c', [`${listingUrl}/X?utm=1`])],
      deps,
    );
    expect(r.union).toEqual([`${listingUrl}/x`]);
    expect(r.disagreements).toEqual([]);
  });

  it('records a throwing strategy as failed without aborting the run', async () => {
    const boom: Strategy = { name: 'boom', run: async () => { throw new Error('network gone'); } };
    const r = await discover([boom, stub('ok', [`${listingUrl}/x`, `${listingUrl}/y`])], deps);
    expect(r.strategies[0]).toEqual({ name: 'boom', found: 0, failed: true });
    expect(r.union).toHaveLength(2);
  });

  it('omits a failed strategy from disagreements, since it missed everything for a different reason', async () => {
    const boom: Strategy = { name: 'boom', run: async () => { throw new Error('x'); } };
    const r = await discover([boom, stub('ok', [`${listingUrl}/x`])], deps);
    expect(r.disagreements).toEqual([]);
  });

  it('returns an empty union when every strategy finds nothing', async () => {
    const r = await discover([stub('a', []), stub('b', [])], deps);
    expect(r.union).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scraper/discover/reconcile.test.ts`
Expected: FAIL — cannot resolve `./reconcile.js`.

- [ ] **Step 3: Write `scraper/discover/reconcile.ts`**

```ts
import { canonicalUrl } from './canonicalUrl.js';
import type { Strategy, StrategyDeps } from './sitemapIndex.js';

export type DiscoveryReport = {
  strategies: { name: string; found: number; failed: boolean }[];
  union: string[];
  disagreements: { url: string; missedBy: string[] }[];
};

export const discover = async (strategies: Strategy[], deps: StrategyDeps): Promise<DiscoveryReport> => {
  const results: { name: string; urls: Set<string>; failed: boolean }[] = [];

  for (const strategy of strategies) {
    try {
      const raw = await strategy.run(deps);
      const urls = new Set<string>();
      for (const u of raw) {
        const c = canonicalUrl(u);
        if (c) urls.add(c);
      }
      results.push({ name: strategy.name, urls, failed: false });
    } catch {
      results.push({ name: strategy.name, urls: new Set(), failed: true });
    }
  }

  const union = [...new Set(results.flatMap(r => [...r.urls]))];
  const succeeded = results.filter(r => !r.failed);

  const disagreements = union
    .map(url => ({ url, missedBy: succeeded.filter(r => !r.urls.has(url)).map(r => r.name) }))
    .filter(d => d.missedBy.length > 0);

  return {
    strategies: results.map(r => ({ name: r.name, found: r.urls.size, failed: r.failed })),
    union,
    disagreements,
  };
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run scraper/discover/reconcile.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add scraper/discover/reconcile.ts scraper/discover/reconcile.test.ts
git commit -m "feat(discover): reconcile strategies into a union with disagreements"
```

---

## Task 11: Prune non-content modules, then segment into programmes

Spec §2.6. These two steps are one task because **pruning is a prerequisite for segmentation, not an independent nicety**: unpruned, `aktion-mensch-stiftung` carries two section-titled `h2` headings (`Über die Stiftung`, `Du hast Fragen?`) that look exactly like programme boundaries, and a promo call-to-action reading `Förderkonditionen kennenlernen`. Segmenting before pruning invents programmes.

Segmentation is driven by the count of **conditions headings** in the pruned document, which is the signal that actually discriminates across all six fixtures: `pauschalfoerderung` has two, every other page has one, and `aktion-mensch-stiftung` has none once pruned.

**Files:**
- Create: `scraper/extract/labels.ts`
- Create: `scraper/extract/prune.ts`
- Create: `scraper/extract/segment.ts`
- Test: `scraper/extract/labels.test.ts`
- Test: `scraper/extract/prune.test.ts`
- Test: `scraper/extract/segment.test.ts`

**Interfaces:**
- Consumes: `text`, `collapse` (Task 3), cheerio.
- Produces:
  - `matchesLabel(heading: string, vocabulary: string[]): boolean` — normalised, diacritic-folded, edit-distance ≤ 2
  - `CONDITION_HEADINGS`, `DEADLINE_LABELS`, `REQUIREMENT_LABELS`, `PRUNE_HEADINGS` constants
  - `prune($: CheerioAPI): void` — mutates the loaded document in place
  - `type Segment = { sectionId?: string; html: string }`
  - `segment($: CheerioAPI): Segment[]`

- [ ] **Step 1: Write the failing labels test**

Create `scraper/extract/labels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { matchesLabel, CONDITION_HEADINGS, REQUIREMENT_LABELS } from './labels.js';

describe('matchesLabel', () => {
  it('matches an exact heading', () => {
    expect(matchesLabel('Unsere Konditionen', CONDITION_HEADINGS)).toBe(true);
  });

  it('matches the other spelling of the conditions heading', () => {
    expect(matchesLabel('Förderkonditionen', CONDITION_HEADINGS)).toBe(true);
  });

  it('matches despite the missing g their CMS leaves out of Rahmenbedingungen', () => {
    expect(matchesLabel('Rahmenbedinungen', REQUIREMENT_LABELS.formal)).toBe(true);
  });

  it('is insensitive to case and surrounding whitespace', () => {
    expect(matchesLabel('  unsere KONDITIONEN  ', CONDITION_HEADINGS)).toBe(true);
  });

  it('is insensitive to a trailing colon', () => {
    expect(matchesLabel('Anforderungen:', REQUIREMENT_LABELS.formal)).toBe(true);
  });

  it('folds diacritics so Foerderkonditionen matches Förderkonditionen', () => {
    expect(matchesLabel('Foerderkonditionen', CONDITION_HEADINGS)).toBe(true);
  });

  it('does not match an unrelated heading', () => {
    expect(matchesLabel('Wir fördern ...', CONDITION_HEADINGS)).toBe(false);
    expect(matchesLabel('Projektideen für dich', CONDITION_HEADINGS)).toBe(false);
  });

  it('does not match a promo heading that merely contains the word', () => {
    expect(matchesLabel('Förderkonditionen kennenlernen', CONDITION_HEADINGS)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scraper/extract/labels.test.ts`
Expected: FAIL — cannot resolve `./labels.js`.

- [ ] **Step 3: Write `scraper/extract/labels.ts`**

Matching is whole-heading and edit-distance tolerant. Whole-heading is what keeps the promo `Förderkonditionen kennenlernen` from matching the conditions heading; edit-distance is what catches `Rahmenbedinungen`.

```ts
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run scraper/extract/labels.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Write the failing prune test**

Create `scraper/extract/prune.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import { prune } from './prune.js';

const load = async (name: string) => {
  const $ = cheerio.load(await readFile(`tests/fixtures/${name}.html`, 'utf8'));
  prune($);
  return $;
};

describe('prune — aktion-mensch-stiftung, the page where an unpruned scan succeeds and is wrong', () => {
  it('removes the promo call-to-action that reads like a conditions heading', async () => {
    const $ = await load('aktion-mensch-stiftung');
    expect($.root().text()).not.toContain('Förderkonditionen kennenlernen');
  });

  it('removes the example-project amounts that belong to other organisations', async () => {
    const body = (await load('aktion-mensch-stiftung')).root().text();
    expect(body).not.toContain('600.000');
    expect(body).not.toContain('450.000');
  });

  it('removes the two promo sections that would look like programme boundaries', async () => {
    const body = (await load('aktion-mensch-stiftung')).root().text();
    expect(body).not.toContain('Über die Stiftung');
    expect(body).not.toContain('Du hast Fragen?');
  });

  it('keeps the page own requirements', async () => {
    expect((await load('aktion-mensch-stiftung')).root().text()).toContain('Unsere Anforderungen');
  });
});

describe('prune — the other pages keep their own content', () => {
  it('keeps the conditions heading on sport-kultur', async () => {
    expect((await load('sport-kultur')).root().text()).toContain('Unsere Konditionen');
  });

  it('keeps the grant amount on sport-kultur', async () => {
    expect((await load('sport-kultur')).root().text()).toContain('50.000');
  });

  it('removes the project-idea examples from sport-kultur', async () => {
    expect((await load('sport-kultur')).root().text()).not.toContain('Projektideen für dich');
  });

  it('removes the newsletter and footer navigation from every page', async () => {
    for (const name of ['sport-kultur', 'junge-menschen', 'pauschalfoerderung']) {
      const body = (await load(name)).root().text();
      expect(body).not.toContain('Beliebte Seiten');
    }
  });

  it('keeps both conditions headings on pauschalfoerderung', async () => {
    const body = (await load('pauschalfoerderung')).root().text();
    expect(body.match(/Förderkonditionen/g)).toHaveLength(2);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run scraper/extract/prune.test.ts`
Expected: FAIL — cannot resolve `./prune.js`.

- [ ] **Step 7: Write `scraper/extract/prune.ts`**

```ts
import type { CheerioAPI } from 'cheerio';
import { collapse } from '../normalize/text.js';
import { matchesLabel, PRUNE_HEADINGS } from './labels.js';

const STRUCTURAL = 'header, nav, footer, aside, script, style, noscript, form';

export const prune = ($: CheerioAPI): void => {
  $(STRUCTURAL).remove();

  $('section, div[data-module]').each((_i, el) => {
    const $el = $(el);
    if ($el.parents('section').length > 0) return;
    const heading = collapse($el.find('h1, h2, h3').first().text());
    if (heading && matchesLabel(heading, PRUNE_HEADINGS)) $el.remove();
  });

  $('a').each((_i, el) => {
    const $a = $(el);
    if (matchesLabel(collapse($a.text()), ['Förderkonditionen kennenlernen'])) $a.remove();
  });
};
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run scraper/extract/prune.test.ts`
Expected: PASS, 9 tests. If a promo section survives, add its heading to `PRUNE_HEADINGS` rather than reaching for a CSS selector — the vocabulary is the locale-tier artefact, a selector would be site knowledge.

- [ ] **Step 9: Write the failing segment test**

Create `scraper/extract/segment.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import { prune } from './prune.js';
import { segment } from './segment.js';

const segmentsOf = async (name: string) => {
  const $ = cheerio.load(await readFile(`tests/fixtures/${name}.html`, 'utf8'));
  prune($);
  return segment($);
};

describe('segment', () => {
  it('splits pauschalfoerderung into two programmes with the section ids the source assigns', async () => {
    const segs = await segmentsOf('pauschalfoerderung');
    expect(segs).toHaveLength(2);
    expect(segs.map(s => s.sectionId)).toEqual(['151880', '151904']);
  });

  it('gives each pauschalfoerderung segment its own conditions text', async () => {
    const segs = await segmentsOf('pauschalfoerderung');
    expect(segs[0]!.html).toContain('Bildungsveranstaltungen');
    expect(segs[1]!.html).toContain('Ferienreisen');
    expect(segs[0]!.html).not.toContain('Ferienreisen');
  });

  it('returns a single unidentified segment for a single-programme page', async () => {
    for (const name of ['sport-kultur', 'junge-menschen', 'zeichen-setzen', 'anschubfoerderung-arbeit']) {
      const segs = await segmentsOf(name);
      expect(segs).toHaveLength(1);
      expect(segs[0]!.sectionId).toBeUndefined();
    }
  });

  it('returns a single segment for a page with no conditions block at all', async () => {
    const segs = await segmentsOf('aktion-mensch-stiftung');
    expect(segs).toHaveLength(1);
    expect(segs[0]!.sectionId).toBeUndefined();
  });

  it('keeps the approval-cadence sentence out of the first segment conditions region', async () => {
    const segs = await segmentsOf('pauschalfoerderung');
    const firstConditions = segs[0]!.html;
    expect(firstConditions).toContain('Förderkonditionen');
  });
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `npx vitest run scraper/extract/segment.test.ts`
Expected: FAIL — cannot resolve `./segment.js`.

- [ ] **Step 11: Write `scraper/extract/segment.ts`**

```ts
import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import { collapse } from '../normalize/text.js';
import { CONDITION_HEADINGS, matchesLabel } from './labels.js';

export type Segment = { sectionId?: string; html: string };

const SECTION_ID = /^(\d+)-headline$/;

export const segment = ($: CheerioAPI): Segment[] => {
  const topLevel = $('body').find('section').filter((_i, el) => $(el).parents('section').length === 0).toArray();

  const conditionIndexes = topLevel.flatMap((el, i) => {
    const heading = collapse($(el).find('h1, h2, h3, h4').first().text());
    return heading && matchesLabel(heading, CONDITION_HEADINGS) ? [i] : [];
  });

  if (conditionIndexes.length < 2) {
    return [{ html: $.html() }];
  }

  const titleIndexes = topLevel.flatMap((el, i) => {
    const id = $(el).find('h2[id]').first().attr('id') ?? '';
    return SECTION_ID.test(id) ? [i] : [];
  });

  const starts = conditionIndexes.map(ci => {
    const candidates = titleIndexes.filter(ti => ti <= ci);
    return candidates.length > 0 ? candidates[candidates.length - 1]! : ci;
  });

  const uniqueStarts = [...new Set(starts)];

  return uniqueStarts.map((start, n) => {
    const end = n + 1 < uniqueStarts.length ? uniqueStarts[n + 1]! : topLevel.length;
    const slice = topLevel.slice(start, end) as Element[];
    const id = SECTION_ID.exec($(slice[0]!).find('h2[id]').first().attr('id') ?? '');
    const html = slice.map(el => $.html(el)).join('');
    return id ? { sectionId: id[1]!, html } : { html };
  });
};
```

- [ ] **Step 12: Run it to verify it passes**

Run: `npx vitest run scraper/extract/segment.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 13: Commit**

```bash
git add scraper/extract/labels.ts scraper/extract/labels.test.ts \
        scraper/extract/prune.ts scraper/extract/prune.test.ts \
        scraper/extract/segment.ts scraper/extract/segment.test.ts
git commit -m "feat(extract): fuzzy label vocabulary, module pruning and programme segmentation"
```

---

## Task 12: Deterministic ids

**Files:**
- Create: `schema/id.ts`
- Test: `schema/id.test.ts`

**Interfaces:**
- Consumes: `uuid` package (`v5`).
- Produces: `programId(canonicalPath: string, sectionId?: string): string`

- [ ] **Step 1: Write the failing test**

Create `schema/id.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { programId } from './id.js';

describe('programId', () => {
  it('is stable across calls, which is what a random v4 would break', () => {
    const a = programId('/foerderung/foerderangebote/sport-kultur');
    const b = programId('/foerderung/foerderangebote/sport-kultur');
    expect(a).toBe(b);
  });

  it('returns a v5 uuid', () => {
    expect(programId('/x')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('distinguishes two sub-programmes on the same path', () => {
    const a = programId('/foerderung/foerderangebote/pauschalfoerderung', '151880');
    const b = programId('/foerderung/foerderangebote/pauschalfoerderung', '151904');
    expect(a).not.toBe(b);
  });

  it('distinguishes a sub-programme from the bare page', () => {
    const bare = programId('/foerderung/foerderangebote/pauschalfoerderung');
    const sub = programId('/foerderung/foerderangebote/pauschalfoerderung', '151880');
    expect(bare).not.toBe(sub);
  });

  it('distinguishes two different paths', () => {
    expect(programId('/a')).not.toBe(programId('/b'));
  });

  it('ignores a trailing slash so one programme keeps one id', () => {
    expect(programId('/a/')).toBe(programId('/a'));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run schema/id.test.ts`
Expected: FAIL — cannot resolve `./id.js`.

- [ ] **Step 3: Write `schema/id.ts`**

```ts
import { v5 as uuidv5 } from 'uuid';

const NAMESPACE = '8f14e45f-ceea-467a-9b2c-1d6f3c2b7a51';

export const programId = (canonicalPath: string, sectionId?: string): string => {
  const path = canonicalPath.replace(/\/+$/, '');
  const identity = sectionId === undefined ? path : `${path}#${sectionId}`;
  return uuidv5(identity, NAMESPACE);
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run schema/id.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Install the uuid types and commit**

```bash
npm install -D @types/uuid
git add schema/id.ts schema/id.test.ts package.json package-lock.json
git commit -m "feat(schema): deterministic uuidv5 programme ids"
```

---

## Task 13: PageCtx — the query surface resolvers run against

Every resolver receives a `PageCtx` and nothing else. Keeping the DOM behind this interface is what lets a resolver declare its tier honestly: a resolver calling `ctx.jsonLd` is reading a standard, one calling `ctx.labelledFact` is reading locale vocabulary, and one calling `ctx.q` with a CSS selector is reading site markup.

**Files:**
- Create: `scraper/extract/pageCtx.ts`
- Test: `scraper/extract/pageCtx.test.ts`

**Interfaces:**
- Consumes: `text`, `collapse` (Task 3), `matchesLabel`, `DEADLINE_LABELS`, `CONDITION_HEADINGS` (Task 11), cheerio.
- Produces:
  - `type PageCtx = { jsonLd: JsonLd; q(selector: string): string | undefined; section(headings: string[]): string | undefined; labelledFact(labels: string[]): string | undefined; allLabelledFacts(): Record<string, string>; firstProsePara(): string | undefined; headingSections(): { heading: string; text: string }[] }`
  - `type JsonLd = { Article?: { headline?: string; description?: string } }`
  - `makeCtx(html: string): PageCtx`

- [ ] **Step 1: Write the failing test**

Create `scraper/extract/pageCtx.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { makeCtx } from './pageCtx.js';
import { CONDITION_HEADINGS, DEADLINE_LABELS } from './labels.js';

const ctxFor = async (name: string) => makeCtx(await readFile(`tests/fixtures/${name}.html`, 'utf8'));

describe('jsonLd', () => {
  it('reads the Article headline and description', async () => {
    const ctx = await ctxFor('junge-menschen');
    expect(ctx.jsonLd.Article?.headline).toBe('Förderung: Junge Menschen stärken');
    expect(ctx.jsonLd.Article?.description).toContain('junge Menschen');
  });

  it('returns an empty object rather than throwing when the JSON-LD is malformed', () => {
    const ctx = makeCtx('<script type="application/ld+json">{ "@type": broken,,, }</script>');
    expect(ctx.jsonLd).toEqual({});
  });

  it('returns an empty object when there is no JSON-LD at all', () => {
    expect(makeCtx('<html><body><p>nix</p></body></html>').jsonLd).toEqual({});
  });

  it('survives JSON-LD that is valid JSON but not the expected shape', () => {
    const ctx = makeCtx('<script type="application/ld+json">[1,2,3]</script>');
    expect(ctx.jsonLd.Article).toBeUndefined();
  });
});

describe('labelledFact', () => {
  it('reads a value from the shape where the label is bold and the value follows a br', async () => {
    const ctx = await ctxFor('junge-menschen');
    expect(ctx.allLabelledFacts()['Art der Förderung']).toBe('Projektförderung');
  });

  it('reads a value from the shape where label and value share one strong element', async () => {
    const ctx = await ctxFor('junge-menschen');
    expect(ctx.labelledFact(DEADLINE_LABELS)).toContain('15.10.2026');
  });

  it('repairs the mid-word element split in a fact value', async () => {
    const ctx = await ctxFor('junge-menschen');
    expect(ctx.allLabelledFacts()['Fokusthema']).toBe('Junge Menschen');
  });

  it('returns undefined when no label matches', async () => {
    const ctx = await ctxFor('junge-menschen');
    expect(ctx.labelledFact(['Nicht Vorhanden'])).toBeUndefined();
  });
});

describe('section', () => {
  it('returns the text under a matching heading', async () => {
    const ctx = await ctxFor('sport-kultur');
    const conditions = ctx.section(CONDITION_HEADINGS);
    expect(conditions).toContain('50.000');
    expect(conditions).toContain('90 Prozent');
  });

  it('does not reach into a later unrelated section', async () => {
    const ctx = await ctxFor('sport-kultur');
    expect(ctx.section(CONDITION_HEADINGS)).not.toContain('Was wir nicht fördern');
  });

  it('returns undefined when no heading matches', async () => {
    const ctx = await ctxFor('sport-kultur');
    expect(ctx.section(['Gibt Es Nicht'])).toBeUndefined();
  });
});

describe('firstProsePara and headingSections', () => {
  it('returns the lead paragraph', async () => {
    const ctx = await ctxFor('sport-kultur');
    expect(ctx.firstProsePara()).toContain('Menschen mit und ohne Behinderung');
  });

  it('lists heading and body pairs', async () => {
    const ctx = await ctxFor('sport-kultur');
    const headings = ctx.headingSections().map(s => s.heading);
    expect(headings).toContain('Unsere Konditionen');
    expect(headings).toContain('Was wir nicht fördern');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scraper/extract/pageCtx.test.ts`
Expected: FAIL — cannot resolve `./pageCtx.js`.

- [ ] **Step 3: Write `scraper/extract/pageCtx.ts`**

```ts
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { collapse, text } from '../normalize/text.js';
import { matchesLabel } from './labels.js';

export type JsonLd = { Article?: { headline?: string; description?: string } };

export type PageCtx = {
  jsonLd: JsonLd;
  q(selector: string): string | undefined;
  section(headings: string[]): string | undefined;
  labelledFact(labels: string[]): string | undefined;
  allLabelledFacts(): Record<string, string>;
  firstProsePara(): string | undefined;
  headingSections(): { heading: string; text: string }[];
};

const readJsonLd = ($: CheerioAPI): JsonLd => {
  const out: JsonLd = {};
  $('script[type="application/ld+json"]').each((_i, el) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse($(el).text());
    } catch {
      return;
    }
    const graph =
      parsed !== null && typeof parsed === 'object' && '@graph' in parsed
        ? (parsed as { '@graph': unknown })['@graph']
        : parsed;
    if (!Array.isArray(graph)) return;
    for (const node of graph) {
      if (node !== null && typeof node === 'object' && (node as { '@type'?: unknown })['@type'] === 'Article') {
        const n = node as { headline?: unknown; description?: unknown };
        out.Article = {
          ...(typeof n.headline === 'string' ? { headline: n.headline } : {}),
          ...(typeof n.description === 'string' ? { description: n.description } : {}),
        };
      }
    }
  });
  return out;
};

const LABEL_SPLIT = /^([^:]{2,60}):\s*(.*)$/s;

export const makeCtx = (html: string): PageCtx => {
  const $ = cheerio.load(html);
  const jsonLd = readJsonLd($);

  const allLabelledFacts = (): Record<string, string> => {
    const facts: Record<string, string> = {};
    $('p').each((_i, el) => {
      const strong = $(el).find('strong').first();
      if (strong.length === 0) return;
      const label = collapse(strong.text()).replace(/:$/, '');
      const whole = text($, el);
      const inline = LABEL_SPLIT.exec(whole);
      if (label.includes(':')) {
        const split = LABEL_SPLIT.exec(label);
        if (split) {
          facts[collapse(split[1]!)] = collapse(split[2]!);
          return;
        }
      }
      if (inline && collapse(inline[1]!) === label && inline[2]!.trim()) {
        facts[label] = collapse(inline[2]!);
      }
    });
    return facts;
  };

  const headingSections = (): { heading: string; text: string }[] => {
    const out: { heading: string; text: string }[] = [];
    $('h2, h3').each((_i, el) => {
      const heading = collapse($(el).text());
      if (!heading) return;
      const parts: string[] = [];
      let node = $(el).parent().nextAll().toArray();
      const container = $(el).closest('section');
      const body = container.length > 0 ? text($, container[0]!) : '';
      const stripped = body.startsWith(heading) ? body.slice(heading.length) : body;
      if (stripped.trim()) parts.push(collapse(stripped));
      void node;
      out.push({ heading, text: parts.join(' ') });
    });
    return out;
  };

  return {
    jsonLd,
    q: selector => {
      const found = $(selector).first();
      return found.length > 0 ? collapse(text($, found[0]!)) || undefined : undefined;
    },
    section: headings => headingSections().find(s => matchesLabel(s.heading, headings))?.text,
    labelledFact: labels => {
      const facts = allLabelledFacts();
      for (const [label, value] of Object.entries(facts)) {
        if (matchesLabel(label, labels)) return value || label;
      }
      const strongHit = $('strong')
        .toArray()
        .map(el => collapse($(el).text()))
        .find(t => labels.some(l => t.toLowerCase().startsWith(l.toLowerCase())));
      return strongHit;
    },
    allLabelledFacts,
    firstProsePara: () => {
      const p = $('.prose p, main p, article p').first();
      return p.length > 0 ? collapse(text($, p[0]!)) || undefined : undefined;
    },
    headingSections,
  };
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run scraper/extract/pageCtx.test.ts`
Expected: PASS, 12 tests. The two `labelledFact` shapes are the ones spec §2.3 documents — if the second fails, the fallback that scans `strong` elements for a leading label is what handles `Aktuelle Antragsphase: 01.09. – 15.10.2026`.

- [ ] **Step 5: Commit**

```bash
git add scraper/extract/pageCtx.ts scraper/extract/pageCtx.test.ts
git commit -m "feat(extract): PageCtx query surface over a loaded page"
```

---

## Task 14: Tier-ordered resolvers and programme extraction

**Files:**
- Create: `scraper/extract/resolve.ts`
- Create: `scraper/extract/resolvers.ts`
- Create: `scraper/extract/index.ts`
- Test: `scraper/extract/resolve.test.ts`
- Test: `scraper/extract/index.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3, 4, 5, 11, 12, 13.
- Produces:
  - `type Resolver<T> = { tier: Tier; name: string; run(ctx: PageCtx): T | undefined }`
  - `resolve<T>(resolvers: Resolver<T>[], ctx: PageCtx): Field<T> | undefined`
  - `extractPrograms(html: string, canonicalUrl: string): Program[]`

- [ ] **Step 1: Write the failing resolve test**

Create `scraper/extract/resolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolve, type Resolver } from './resolve.js';
import { makeCtx } from './pageCtx.js';

const ctx = makeCtx('<html><body><p class="prose">Ein Satz.</p></body></html>');

describe('resolve', () => {
  it('returns the first hit with its tier and evidence', () => {
    const rs: Resolver<string>[] = [
      { tier: 'standard', name: 'a', run: () => undefined },
      { tier: 'locale', name: 'b', run: () => 'value' },
      { tier: 'site', name: 'c', run: () => 'never reached' },
    ];
    expect(resolve(rs, ctx)).toEqual({ value: 'value', tier: 'locale', evidence: 'b' });
  });

  it('returns undefined when nothing resolves', () => {
    expect(resolve([{ tier: 'site', name: 'a', run: () => undefined }], ctx)).toBeUndefined();
  });

  it('skips a resolver that throws and continues down the chain', () => {
    const rs: Resolver<string>[] = [
      { tier: 'standard', name: 'boom', run: () => { throw new Error('bad selector'); } },
      { tier: 'locale', name: 'ok', run: () => 'value' },
    ];
    expect(resolve(rs, ctx)?.tier).toBe('locale');
  });

  it('treats an empty string as no hit, so a blank element does not win over a later tier', () => {
    const rs: Resolver<string>[] = [
      { tier: 'standard', name: 'blank', run: () => '' },
      { tier: 'locale', name: 'ok', run: () => 'value' },
    ];
    expect(resolve(rs, ctx)?.value).toBe('value');
  });

  it('treats an empty array as no hit', () => {
    const rs: Resolver<string[]>[] = [
      { tier: 'standard', name: 'empty', run: () => [] },
      { tier: 'locale', name: 'ok', run: () => ['x'] },
    ];
    expect(resolve(rs, ctx)?.value).toEqual(['x']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scraper/extract/resolve.test.ts`
Expected: FAIL — cannot resolve `./resolve.js`.

- [ ] **Step 3: Write `scraper/extract/resolve.ts`**

```ts
import type { Field, Tier } from '@antrag-plus/schema';
import { field } from '@antrag-plus/schema';
import type { PageCtx } from './pageCtx.js';

export type Resolver<T> = { tier: Tier; name: string; run(ctx: PageCtx): T | undefined };

const isEmpty = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0);

export const resolve = <T>(resolvers: Resolver<T>[], ctx: PageCtx): Field<T> | undefined => {
  for (const r of resolvers) {
    let value: T | undefined;
    try {
      value = r.run(ctx);
    } catch {
      continue;
    }
    if (!isEmpty(value)) return field(value as T, r.tier, r.name);
  }
  return undefined;
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run scraper/extract/resolve.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing extraction test**

Create `scraper/extract/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { extractPrograms } from './index.js';

const BASE = 'https://www.aktion-mensch.de/foerderung/foerderangebote';
const programmesOf = async (name: string) =>
  extractPrograms(await readFile(`tests/fixtures/${name}.html`, 'utf8'), `${BASE}/${name}`);

describe('extractPrograms — tiers, which is the measurement the design note argues from', () => {
  it('resolves name and description at the standard tier', async () => {
    const [p] = await programmesOf('sport-kultur');
    expect(p!.name.tier).toBe('standard');
    expect(p!.shortDescription.tier).toBe('standard');
  });

  it('resolves the deadline at the locale tier', async () => {
    const [p] = await programmesOf('sport-kultur');
    expect(p!.deadline.tier).toBe('locale');
    expect(p!.deadline.value).toEqual({ kind: 'window', start: '2026-09-01', end: '2026-10-15' });
  });

  it('records evidence that names what matched', async () => {
    const [p] = await programmesOf('sport-kultur');
    expect(p!.name.evidence).toContain('jsonld');
  });
});

describe('extractPrograms — conditions', () => {
  it('reads the project grant ceiling on sport-kultur', async () => {
    const [p] = await programmesOf('sport-kultur');
    expect(p!.conditions.grant?.value).toContainEqual({ amountEur: 50000, bound: 'max', per: 'project' });
  });

  it('reads the duration on anschubfoerderung as months converted from Jahre', async () => {
    const [p] = await programmesOf('anschubfoerderung-arbeit');
    expect(p!.conditions.maxDuration?.value.months).toBe(48);
  });

  it('lists the eligible cost categories on sport-kultur', async () => {
    const [p] = await programmesOf('sport-kultur');
    const costs = p!.conditions.eligibleCosts?.value ?? [];
    expect(costs.some(c => c.startsWith('Personalkosten'))).toBe(true);
    expect(costs.some(c => c.startsWith('Honorarkosten'))).toBe(true);
  });

  it('leaves conditions empty on aktion-mensch-stiftung rather than inventing values', async () => {
    const [p] = await programmesOf('aktion-mensch-stiftung');
    expect(p!.conditions.grant).toBeUndefined();
    expect(p!.conditions.maxDuration).toBeUndefined();
  });

  it('does not read the approval cadence as a project duration on pauschalfoerderung', async () => {
    const ps = await programmesOf('pauschalfoerderung');
    for (const p of ps) expect(p.conditions.maxDuration?.value.months).not.toBe(2);
  });

  it('keeps the per-person-day rate out of the project basis', async () => {
    const ps = await programmesOf('pauschalfoerderung');
    const projectGrants = ps.flatMap(p => p.conditions.grant?.value ?? []).filter(m => m.per === 'project');
    expect(projectGrants.every(m => m.amountEur !== 50)).toBe(true);
  });
});

describe('extractPrograms — segmentation and identity', () => {
  it('splits pauschalfoerderung into two programmes with fragment-bearing urls', async () => {
    const ps = await programmesOf('pauschalfoerderung');
    expect(ps).toHaveLength(2);
    expect(ps.map(p => p.url)).toEqual([
      `${BASE}/pauschalfoerderung#151880`,
      `${BASE}/pauschalfoerderung#151904`,
    ]);
    expect(new Set(ps.map(p => p.id)).size).toBe(2);
  });

  it('produces identical ids on a second run over the same input', async () => {
    const first = await programmesOf('pauschalfoerderung');
    const second = await programmesOf('pauschalfoerderung');
    expect(first.map(p => p.id)).toEqual(second.map(p => p.id));
  });

  it('yields exactly one programme for every single-programme page', async () => {
    for (const name of ['sport-kultur', 'junge-menschen', 'zeichen-setzen', 'anschubfoerderung-arbeit', 'aktion-mensch-stiftung']) {
      expect(await programmesOf(name)).toHaveLength(1);
    }
  });
});

describe('extractPrograms — requirements', () => {
  it('classifies the misspelled Rahmenbedinungen heading despite the missing g', async () => {
    const [p] = await programmesOf('zeichen-setzen');
    const formal = p!.requirements.filter(r => r.kind === 'formal');
    expect(formal.map(r => r.heading)).toContain('Rahmenbedinungen');
  });

  it('classifies exclusions', async () => {
    const [p] = await programmesOf('sport-kultur');
    expect(p!.requirements.some(r => r.kind === 'exclusions')).toBe(true);
  });

  it('keeps the original heading as evidence of what was classified', async () => {
    const [p] = await programmesOf('junge-menschen');
    expect(p!.requirements.map(r => r.heading)).toContain('Wichtige Voraussetzungen');
  });
});

describe('extractPrograms — the §3 query the schema exists to answer', () => {
  it('returns junge-menschen alone for grants above 50000 per project', async () => {
    const all = (
      await Promise.all(
        ['sport-kultur', 'junge-menschen', 'anschubfoerderung-arbeit', 'pauschalfoerderung', 'zeichen-setzen', 'aktion-mensch-stiftung'].map(
          n => programmesOf(n),
        ),
      )
    ).flat();

    const matching = all.filter(p =>
      (p.conditions.grant?.value ?? []).some(m => m.per === 'project' && m.bound === 'max' && m.amountEur > 50000),
    );

    expect(matching.map(p => p.name.value)).toEqual([
      'Förderung: Junge Menschen stärken',
      'Arbeitsplätze in Inklusionsunternehmen und Zuverdienstbetrieben',
    ]);
    expect(matching.some(p => p.url.includes('pauschalfoerderung'))).toBe(false);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run scraper/extract/index.test.ts`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 7: Write `scraper/extract/resolvers.ts`**

```ts
import type { Deadline, Duration, Money, Rate } from '@antrag-plus/schema';
import { parseDeadline } from '../normalize/germanDates.js';
import { parseQuantities } from '../normalize/quantity.js';
import { CONDITION_HEADINGS, DEADLINE_LABELS, ELIGIBLE_COST_HEADINGS } from './labels.js';
import type { Resolver } from './resolve.js';

const conditionsText = (ctx: Parameters<Resolver<unknown>['run']>[0]): string | undefined =>
  ctx.section(CONDITION_HEADINGS);

export const nameResolvers: Resolver<string>[] = [
  { tier: 'standard', name: 'jsonld.Article.headline', run: c => c.jsonLd.Article?.headline },
  { tier: 'site', name: 'h1', run: c => c.q('h1') },
];

export const descriptionResolvers: Resolver<string>[] = [
  { tier: 'standard', name: 'jsonld.Article.description', run: c => c.jsonLd.Article?.description },
  { tier: 'locale', name: 'lead-paragraph', run: c => c.firstProsePara() },
];

export const deadlineResolvers: Resolver<Deadline>[] = [
  {
    tier: 'locale',
    name: 'label:Antragsphase|Frist|Antragsschluss',
    run: c => {
      const raw = c.labelledFact(DEADLINE_LABELS);
      if (raw === undefined) return undefined;
      const d = parseDeadline(raw);
      return d.kind === 'unknown' ? undefined : d;
    },
  },
  {
    tier: 'locale',
    name: 'rolling:ganzjährig|laufend',
    run: c => {
      const body = c.headingSections().map(s => s.text).join(' ');
      const d = parseDeadline(body);
      return d.kind === 'rolling' ? d : undefined;
    },
  },
];

export const grantResolvers: Resolver<Money[]>[] = [
  { tier: 'locale', name: 'section:Konditionen|Förderkonditionen', run: c => {
    const t = conditionsText(c);
    return t === undefined ? undefined : parseQuantities(t).money;
  } },
];

export const rateResolvers: Resolver<Rate[]>[] = [
  { tier: 'locale', name: 'section:Konditionen|Förderkonditionen', run: c => {
    const t = conditionsText(c);
    if (t === undefined) return undefined;
    return parseQuantities(t).rates.filter(r => r.of !== 'own-funds');
  } },
];

export const coFinancingResolvers: Resolver<Rate[]>[] = [
  { tier: 'locale', name: 'section:Konditionen|Förderkonditionen', run: c => {
    const t = conditionsText(c);
    if (t === undefined) return undefined;
    return parseQuantities(t).rates.filter(r => r.of === 'own-funds');
  } },
];

export const durationResolvers: Resolver<Duration>[] = [
  { tier: 'locale', name: 'section:Konditionen|Förderkonditionen', run: c => {
    const t = conditionsText(c);
    return t === undefined ? undefined : parseQuantities(t).duration;
  } },
];

export const eligibleCostResolvers: Resolver<string[]>[] = [
  {
    tier: 'locale',
    name: 'section:Förderfähige Kosten',
    run: c => {
      const t = c.section(ELIGIBLE_COST_HEADINGS);
      if (t === undefined) return undefined;
      return t
        .split(/(?<=[a-zäöüß)])\s+(?=[A-ZÄÖÜ])/)
        .map(part => part.trim())
        .filter(part => part.length > 2 && part.length < 120);
    },
  },
];
```

- [ ] **Step 8: Write `scraper/extract/index.ts`**

```ts
import * as cheerio from 'cheerio';
import type { Issue, Program, Requirement, RequirementKind } from '@antrag-plus/schema';
import { field } from '@antrag-plus/schema';
import { programId } from '@antrag-plus/schema/id.js';
import { parseQuantities } from '../normalize/quantity.js';
import { CONDITION_HEADINGS, REQUIREMENT_LABELS, matchesLabel } from './labels.js';
import { makeCtx, type PageCtx } from './pageCtx.js';
import { prune } from './prune.js';
import { resolve } from './resolve.js';
import { segment } from './segment.js';
import {
  coFinancingResolvers,
  deadlineResolvers,
  descriptionResolvers,
  durationResolvers,
  eligibleCostResolvers,
  grantResolvers,
  nameResolvers,
  rateResolvers,
} from './resolvers.js';

const KINDS = Object.keys(REQUIREMENT_LABELS) as RequirementKind[];

const requirementsFrom = (ctx: PageCtx): Requirement[] =>
  ctx
    .headingSections()
    .flatMap(({ heading, text }) => {
      const kind = KINDS.find(k => matchesLabel(heading, REQUIREMENT_LABELS[k]));
      return kind ? [{ kind, heading, text }] : [];
    });

const conditionIssues = (ctx: PageCtx): Issue[] => {
  const t = ctx.section(CONDITION_HEADINGS);
  return t === undefined ? [] : parseQuantities(t).issues;
};

export const extractPrograms = (html: string, canonicalUrl: string): Program[] => {
  const $ = cheerio.load(html);
  prune($);

  const path = new URL(canonicalUrl).pathname.replace(/\/+$/, '');

  return segment($).map(seg => {
    const ctx = makeCtx(seg.html);
    const issues: Issue[] = [...conditionIssues(ctx)];

    const name = resolve(nameResolvers, ctx) ?? field('', 'site', 'none');
    const shortDescription = resolve(descriptionResolvers, ctx) ?? field('', 'site', 'none');
    const deadline = resolve(deadlineResolvers, ctx);
    if (deadline === undefined) {
      issues.push({ field: 'deadline', code: 'unresolved', message: 'no deadline label or rolling marker found' });
    }

    const grant = resolve(grantResolvers, ctx);
    const fundingRate = resolve(rateResolvers, ctx);
    const coFinancing = resolve(coFinancingResolvers, ctx);
    const maxDuration = resolve(durationResolvers, ctx);
    const eligibleCosts = resolve(eligibleCostResolvers, ctx);

    const facts = Object.fromEntries(
      Object.entries(ctx.allLabelledFacts()).map(([k, v]) => [k, field(v, 'locale', `label:${k}`)]),
    );

    return {
      id: programId(path, seg.sectionId),
      url: seg.sectionId === undefined ? canonicalUrl : `${canonicalUrl}#${seg.sectionId}`,
      name,
      shortDescription,
      deadline: deadline ?? field({ kind: 'unknown' as const }, 'locale', 'none'),
      facts,
      conditions: {
        ...(grant ? { grant } : {}),
        ...(fundingRate ? { fundingRate } : {}),
        ...(coFinancing ? { coFinancing } : {}),
        ...(maxDuration ? { maxDuration } : {}),
        ...(eligibleCosts ? { eligibleCosts } : {}),
      },
      requirements: requirementsFrom(ctx),
      bodySections: ctx.headingSections(),
      issues,
    };
  });
};
```

- [ ] **Step 9: Run it to verify it passes**

Run: `npx vitest run scraper/extract/index.test.ts`
Expected: PASS, 14 tests. The §3 query test is the one that matters most — if the expected names differ from the live JSON-LD headlines, read the actual values out of the fixtures and correct the assertion rather than loosening it.

- [ ] **Step 10: Commit**

```bash
git add scraper/extract/resolve.ts scraper/extract/resolve.test.ts \
        scraper/extract/resolvers.ts scraper/extract/index.ts scraper/extract/index.test.ts
git commit -m "feat(extract): tier-ordered resolvers and programme extraction"
```

---

## Task 15: Validation with per-field issues

A failing field degrades and logs; it never costs the record. Dropping a record silently is the same class of error as reporting success on an empty result.

**Files:**
- Create: `scraper/validate.ts`
- Test: `scraper/validate.test.ts`

**Interfaces:**
- Consumes: `ProgramSchema`, `Program`, `Issue` (Task 2).
- Produces: `validateProgram(candidate: unknown): { program: Program; issues: Issue[] } | undefined`

- [ ] **Step 1: Write the failing test**

Create `scraper/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { field } from '@antrag-plus/schema';
import { validateProgram } from './validate.js';

const base = {
  id: '6f9619ff-8b86-d011-b42d-00c04fc964ff',
  url: 'https://www.aktion-mensch.de/foerderung/foerderangebote/sport-kultur',
  name: field('Sport und Kultur', 'standard', 'jsonld'),
  shortDescription: field('Beschreibung', 'standard', 'jsonld'),
  deadline: field({ kind: 'window', end: '2026-10-15' }, 'locale', 'label'),
  facts: {},
  conditions: {},
  requirements: [],
  bodySections: [],
  issues: [],
};

describe('validateProgram', () => {
  it('passes a valid programme through unchanged', () => {
    const r = validateProgram(base);
    expect(r?.program.id).toBe(base.id);
    expect(r?.issues).toEqual([]);
  });

  it('degrades an unparseable deadline to unknown and keeps the record', () => {
    const r = validateProgram({ ...base, deadline: field({ kind: 'window', end: '15.10.2026' }, 'locale', 'label') });
    expect(r?.program.deadline.value).toEqual({ kind: 'unknown' });
    expect(r?.issues.map(i => i.field)).toContain('deadline');
  });

  it('degrades malformed conditions to empty and keeps the record', () => {
    const r = validateProgram({ ...base, conditions: { grant: field([{ amountEur: -5, bound: 'max', per: 'project' }], 'locale', 's') } });
    expect(r?.program.conditions.grant).toBeUndefined();
    expect(r?.issues.map(i => i.field)).toContain('conditions');
  });

  it('drops malformed requirements rather than the record', () => {
    const r = validateProgram({ ...base, requirements: [{ kind: 'nonsense', heading: 'h', text: 't' }] });
    expect(r?.program.requirements).toEqual([]);
    expect(r?.issues.map(i => i.field)).toContain('requirements');
  });

  it('returns undefined only when identity itself is unusable', () => {
    expect(validateProgram({ ...base, id: 'not-a-uuid' })).toBeUndefined();
    expect(validateProgram({ ...base, url: 'not-a-url' })).toBeUndefined();
    expect(validateProgram(null)).toBeUndefined();
  });

  it('preserves issues the extractor already recorded', () => {
    const prior = { field: 'conditions', code: 'unclassified-basis', message: 'x', raw: '1.000 Euro' };
    const r = validateProgram({ ...base, issues: [prior] });
    expect(r?.issues).toContainEqual(prior);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scraper/validate.test.ts`
Expected: FAIL — cannot resolve `./validate.js`.

- [ ] **Step 3: Write `scraper/validate.ts`**

```ts
import { ConditionsSchema, ProgramSchema, RequirementSchema, DeadlineSchema, FieldSchema } from '@antrag-plus/schema';
import type { Issue, Program } from '@antrag-plus/schema';

const DeadlineFieldSchema = FieldSchema(DeadlineSchema);

const degrade = (candidate: Record<string, unknown>, issues: Issue[]): Record<string, unknown> => {
  const out = { ...candidate };

  if (!DeadlineFieldSchema.safeParse(out['deadline']).success) {
    issues.push({ field: 'deadline', code: 'invalid', message: 'deadline failed schema; degraded to unknown' });
    out['deadline'] = { value: { kind: 'unknown' }, tier: 'locale', evidence: 'degraded' };
  }

  if (!ConditionsSchema.safeParse(out['conditions']).success) {
    issues.push({ field: 'conditions', code: 'invalid', message: 'conditions failed schema; degraded to empty' });
    out['conditions'] = {};
  }

  const reqs = Array.isArray(out['requirements']) ? out['requirements'] : [];
  const keptReqs = reqs.filter(r => RequirementSchema.safeParse(r).success);
  if (keptReqs.length !== reqs.length) {
    issues.push({ field: 'requirements', code: 'invalid', message: 'dropped requirement entries failing schema' });
  }
  out['requirements'] = keptReqs;

  return out;
};

export const validateProgram = (candidate: unknown): { program: Program; issues: Issue[] } | undefined => {
  if (candidate === null || typeof candidate !== 'object') return undefined;

  const priorIssues = Array.isArray((candidate as { issues?: unknown }).issues)
    ? ((candidate as { issues: Issue[] }).issues)
    : [];
  const issues: Issue[] = [...priorIssues];

  const degraded = degrade(candidate as Record<string, unknown>, issues);
  const parsed = ProgramSchema.safeParse({ ...degraded, issues });
  if (!parsed.success) return undefined;

  return { program: parsed.data, issues };
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run scraper/validate.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add scraper/validate.ts scraper/validate.test.ts
git commit -m "feat(scraper): per-field validation that degrades rather than drops records"
```

---

## Task 16: Emit, and the scrape entrypoint

**Files:**
- Create: `scraper/emit.ts`
- Create: `scraper/run.ts`
- Test: `scraper/emit.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 6, 7–10, 14, 15.
- Produces:
  - `emit(opts: { outDir: string; programmes: Program[]; report: DiscoveryReport; rawHtml: Map<string, string> }): Promise<RunReport>` — throws on duplicate id
  - `scrape(deps: { listingUrl: string; fetch(url: string): Promise<Fetched>; outDir: string }): Promise<RunReport>`

- [ ] **Step 1: Write the failing test**

Create `scraper/emit.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile as read } from 'node:fs/promises';
import { field } from '@antrag-plus/schema';
import type { Program } from '@antrag-plus/schema';
import { emit } from './emit.js';
import { scrape } from './run.js';

let outDir: string;
beforeEach(async () => {
  outDir = await mkdtemp(join(tmpdir(), 'antrag-emit-'));
  return () => rm(outDir, { recursive: true, force: true });
});

const programme = (id: string, url: string): Program => ({
  id,
  url,
  name: field('Name', 'standard', 'jsonld'),
  shortDescription: field('Beschreibung', 'standard', 'jsonld'),
  deadline: field({ kind: 'unknown' }, 'locale', 'none'),
  facts: {},
  conditions: {},
  requirements: [],
  bodySections: [],
  issues: [],
});

const A = '6f9619ff-8b86-d011-b42d-00c04fc964ff';
const B = '7f9619ff-8b86-d011-b42d-00c04fc964ff';
const report = { strategies: [{ name: 's', found: 1, failed: false }], union: ['https://x.test/a'], disagreements: [] };

describe('emit', () => {
  it('writes programmes.json, the run report and the raw html', async () => {
    await emit({
      outDir,
      programmes: [programme(A, 'https://x.test/a')],
      report,
      rawHtml: new Map([['https://x.test/a', '<p>a</p>']]),
    });
    const written = JSON.parse(await readFile(join(outDir, 'programs.json'), 'utf8'));
    expect(written).toHaveLength(1);
    expect(JSON.parse(await readFile(join(outDir, 'run-report.json'), 'utf8')).programmes).toBe(1);
    expect(await readFile(join(outDir, 'raw', 'a.html'), 'utf8')).toBe('<p>a</p>');
  });

  it('counts urls and programmes separately, so a lost sub-programme is visible', async () => {
    const r = await emit({
      outDir,
      programmes: [programme(A, 'https://x.test/a#1'), programme(B, 'https://x.test/a#2')],
      report,
      rawHtml: new Map(),
    });
    expect(r.urls).toBe(1);
    expect(r.programmes).toBe(2);
  });

  it('throws on a duplicate id rather than letting one record overwrite another', async () => {
    await expect(
      emit({ outDir, programmes: [programme(A, 'https://x.test/a'), programme(A, 'https://x.test/b')], report, rawHtml: new Map() }),
    ).rejects.toThrow(/duplicate id/i);
  });

  it('reports tier counts so the design note can quote a measured ratio', async () => {
    const r = await emit({ outDir, programmes: [programme(A, 'https://x.test/a')], report, rawHtml: new Map() });
    expect(r.tierCounts.standard).toBeGreaterThan(0);
  });
});

describe('scrape', () => {
  const listingUrl = 'https://www.aktion-mensch.de/foerderung/foerderangebote';

  const fixtures = async (): Promise<Record<string, string>> => ({
    [listingUrl]: await read('tests/fixtures/listing.html', 'utf8'),
    'https://www.aktion-mensch.de/robots.txt': await read('tests/fixtures/robots.txt', 'utf8'),
    'https://www.aktion-mensch.de/index-sitemap.xml': await read('tests/fixtures/sitemap-index.xml', 'utf8'),
    'https://www.aktion-mensch.de/sitemap.xml': await read('tests/fixtures/sitemap-main.xml', 'utf8'),
    'https://www.aktion-mensch.de/meta/sitemap.xml': await read('tests/fixtures/sitemap-meta.xml', 'utf8'),
    [`${listingUrl}/sport-kultur`]: await read('tests/fixtures/sport-kultur.html', 'utf8'),
    [`${listingUrl}/junge-menschen`]: await read('tests/fixtures/junge-menschen.html', 'utf8'),
    [`${listingUrl}/anschubfoerderung-arbeit`]: await read('tests/fixtures/anschubfoerderung-arbeit.html', 'utf8'),
    [`${listingUrl}/pauschalfoerderung`]: await read('tests/fixtures/pauschalfoerderung.html', 'utf8'),
    [`${listingUrl}/zeichen-setzen`]: await read('tests/fixtures/zeichen-setzen.html', 'utf8'),
    [`${listingUrl}/aktion-mensch-stiftung`]: await read('tests/fixtures/aktion-mensch-stiftung.html', 'utf8'),
  });

  const fetcherFor = (pages: Record<string, string>) => async (url: string) => {
    const html = pages[url];
    return html === undefined
      ? { html: '', status: 404, fetchedAt: new Date().toISOString(), fromCache: false }
      : { html, status: 200, fetchedAt: new Date().toISOString(), fromCache: false };
  };

  it('produces six urls and seven programmes end to end', async () => {
    const r = await scrape({ listingUrl, fetch: fetcherFor(await fixtures()), outDir });
    expect(r.urls).toBe(6);
    expect(r.programmes).toBe(7);
  });

  it('keeps a programme whose detail page 404s, with an issue, and continues the run', async () => {
    const pages = await fixtures();
    delete pages[`${listingUrl}/zeichen-setzen`];
    const r = await scrape({ listingUrl, fetch: fetcherFor(pages), outDir });
    const written: Program[] = JSON.parse(await readFile(join(outDir, 'programs.json'), 'utf8'));
    const stub = written.find(p => p.url.includes('zeichen-setzen'));
    expect(stub).toBeDefined();
    expect(stub!.issues.map(i => i.code)).toContain('fetch-failed');
    expect(r.programmes).toBe(7);
  });

  it('exits non-zero behaviour: throws when discovery finds nothing', async () => {
    await expect(scrape({ listingUrl, fetch: fetcherFor({}), outDir })).rejects.toThrow(/no programmes discovered/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scraper/emit.test.ts`
Expected: FAIL — cannot resolve `./emit.js`.

- [ ] **Step 3: Write `scraper/emit.ts`**

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RunReportSchema } from '@antrag-plus/schema';
import type { Program, RunReport, Tier } from '@antrag-plus/schema';
import type { DiscoveryReport } from './discover/reconcile.js';

const TIERS: Tier[] = ['standard', 'framework', 'locale', 'site'];

const tierCountsOf = (programmes: Program[]): Record<Tier, number> => {
  const counts = Object.fromEntries(TIERS.map(t => [t, 0])) as Record<Tier, number>;
  for (const p of programmes) {
    const fields = [p.name, p.shortDescription, p.deadline, ...Object.values(p.facts), ...Object.values(p.conditions)];
    for (const f of fields) if (f) counts[f.tier] += 1;
  }
  return counts;
};

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
    strategies: opts.report.strategies,
    disagreements: opts.report.disagreements,
    tierCounts: tierCountsOf(opts.programmes),
  });

  await writeFile(join(opts.outDir, 'programs.json'), `${JSON.stringify(opts.programmes, null, 2)}\n`);
  await writeFile(join(opts.outDir, 'run-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  for (const [url, html] of opts.rawHtml) {
    await writeFile(join(opts.outDir, 'raw', `${basenameFor(url)}.html`), html);
  }

  return report;
};
```

- [ ] **Step 4: Write `scraper/run.ts`**

```ts
import { field } from '@antrag-plus/schema';
import type { Issue, Program, RunReport } from '@antrag-plus/schema';
import { programId } from '@antrag-plus/schema/id.js';
import { createFetcher, type Fetched } from './fetch.js';
import { canonicalUrl } from './discover/canonicalUrl.js';
import { embeddedManifest } from './discover/embeddedManifest.js';
import { linkCluster } from './discover/linkCluster.js';
import { discover } from './discover/reconcile.js';
import { sitemapIndex } from './discover/sitemapIndex.js';
import { emit } from './emit.js';
import { extractPrograms } from './extract/index.js';
import { validateProgram } from './validate.js';

const LISTING_URL = 'https://www.aktion-mensch.de/foerderung/foerderangebote';

const unreachable = (url: string, status: number): Program => {
  const issue: Issue = {
    field: 'page',
    code: 'fetch-failed',
    message: `detail page returned ${status}; fields unresolved`,
  };
  return {
    id: programId(new URL(url).pathname),
    url,
    name: field(new URL(url).pathname.split('/').pop() ?? url, 'site', 'url-path'),
    shortDescription: field('', 'site', 'none'),
    deadline: field({ kind: 'unknown' as const }, 'locale', 'none'),
    facts: {},
    conditions: {},
    requirements: [],
    bodySections: [],
    issues: [issue],
  };
};

export const scrape = async (deps: {
  listingUrl: string;
  fetch(url: string): Promise<Fetched>;
  outDir: string;
}): Promise<RunReport> => {
  const fetchText = async (url: string): Promise<string | undefined> => {
    const r = await deps.fetch(url);
    return r.status === 200 ? r.html : undefined;
  };

  const report = await discover([sitemapIndex, embeddedManifest, linkCluster], {
    listingUrl: deps.listingUrl,
    fetchText,
  });

  if (report.union.length === 0) {
    throw new Error('no programmes discovered; refusing to report success on an empty result');
  }

  const programmes: Program[] = [];
  const rawHtml = new Map<string, string>();

  for (const url of report.union) {
    const res = await deps.fetch(url);
    if (res.status !== 200) {
      programmes.push(unreachable(url, res.status));
      continue;
    }
    rawHtml.set(url, res.html);
    for (const candidate of extractPrograms(res.html, canonicalUrl(url) ?? url)) {
      const validated = validateProgram(candidate);
      if (validated) programmes.push(validated.program);
    }
  }

  return emit({ outDir: deps.outDir, programmes, report, rawHtml });
};

if (process.argv[1]?.endsWith('run.ts')) {
  const fetcher = createFetcher({
    cacheDir: 'data/cache',
    get: async (url, headers) => {
      const res = await globalThis.fetch(url, { headers });
      return {
        status: res.status,
        body: Buffer.from(await res.arrayBuffer()),
        headers: Object.fromEntries(res.headers.entries()),
      };
    },
  });

  try {
    const report = await scrape({ listingUrl: LISTING_URL, fetch: fetcher.fetch, outDir: 'data' });
    console.log(`urls: ${report.urls}  programmes: ${report.programmes}`);
    console.log(`tiers: ${JSON.stringify(report.tierCounts)}`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run scraper/emit.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Run the real scrape once**

Run: `npm run scrape`
Expected: prints `urls: 6  programmes: 7` and a tier breakdown. `data/programs.json` contains 7 records.

- [ ] **Step 7: Commit**

```bash
git add scraper/emit.ts scraper/emit.test.ts scraper/run.ts data/run-report.json
git commit -m "feat(scraper): emit outputs with id-uniqueness and separate url/programme counts"
```

---

## Task 17: Express API with boot validation

**Files:**
- Create: `server/package.json`, `server/snapshot.ts`, `server/routes.ts`, `server/index.ts`
- Test: `server/routes.test.ts`

**Interfaces:**
- Consumes: `ProgramSchema`, `RunReportSchema`, `Program`, `RunReport` (Task 2).
- Produces:
  - `loadSnapshot(dir: string): Promise<{ programmes: Program[]; report: RunReport }>` — throws a message naming the file and the command when absent or invalid
  - `createApp(snapshot: { programmes: Program[]; report: RunReport }): express.Express`

- [ ] **Step 1: Install dependencies**

```bash
npm install express
npm install -D @types/express supertest @types/supertest
```

- [ ] **Step 2: Write the failing test**

Create `server/routes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { field } from '@antrag-plus/schema';
import type { Program, RunReport } from '@antrag-plus/schema';
import { createApp } from './index.js';
import { loadSnapshot } from './snapshot.js';

const ID = '6f9619ff-8b86-d011-b42d-00c04fc964ff';

const programme: Program = {
  id: ID,
  url: 'https://www.aktion-mensch.de/foerderung/foerderangebote/sport-kultur',
  name: field('Sport und Kultur vor Ort', 'standard', 'jsonld'),
  shortDescription: field('Kurzbeschreibung', 'standard', 'jsonld'),
  deadline: field({ kind: 'window', end: '2026-10-15' }, 'locale', 'label'),
  facts: {},
  conditions: { grant: field([{ amountEur: 50000, bound: 'max', per: 'project' }], 'locale', 'section') },
  requirements: [{ kind: 'exclusions', heading: 'Was wir nicht fördern', text: 'Baukosten' }],
  bodySections: [{ heading: 'Unsere Konditionen', text: 'Zuschuss maximal 50.000 Euro' }],
  issues: [],
};

const report: RunReport = {
  scrapedAt: '2026-10-09T08:00:00.000Z',
  urls: 6,
  programmes: 7,
  strategies: [{ name: 'sitemapIndex', found: 6, failed: false }],
  disagreements: [{ url: 'https://x.test/zeichen-setzen', missedBy: ['linkCluster'] }],
  tierCounts: { standard: 2, framework: 0, locale: 2, site: 0 },
};

const app = createApp({ programmes: [programme], report });

describe('GET /api/programs', () => {
  it('returns the list payload with conditions but without body prose', async () => {
    const res = await request(app).get('/api/programs').expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(ID);
    expect(res.body[0].conditions.grant.value[0].amountEur).toBe(50000);
    expect(res.body[0].bodySections).toBeUndefined();
    expect(res.body[0].requirements).toBeUndefined();
  });
});

describe('GET /api/programs/:id', () => {
  it('returns the full record', async () => {
    const res = await request(app).get(`/api/programs/${ID}`).expect(200);
    expect(res.body.bodySections).toHaveLength(1);
    expect(res.body.requirements).toHaveLength(1);
  });

  it('returns a structured 404 for an unknown id', async () => {
    const res = await request(app).get('/api/programs/7f9619ff-8b86-d011-b42d-00c04fc964ff').expect(404);
    expect(res.body.error.code).toBe('not-found');
    expect(res.body.error.message).toContain('7f9619ff');
  });

  it('returns 404 rather than 500 for a non-uuid id', async () => {
    await request(app).get('/api/programs/sport-kultur').expect(404);
  });
});

describe('GET /api/meta', () => {
  it('returns the run report including the disagreements', async () => {
    const res = await request(app).get('/api/meta').expect(200);
    expect(res.body.urls).toBe(6);
    expect(res.body.programmes).toBe(7);
    expect(res.body.disagreements[0].missedBy).toEqual(['linkCluster']);
  });
});

describe('loadSnapshot', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'antrag-server-'));
    return () => rm(dir, { recursive: true, force: true });
  });

  it('loads a valid snapshot', async () => {
    await writeFile(join(dir, 'programs.json'), JSON.stringify([programme]));
    await writeFile(join(dir, 'run-report.json'), JSON.stringify(report));
    const s = await loadSnapshot(dir);
    expect(s.programmes).toHaveLength(1);
  });

  it('names the missing file and the command that produces it', async () => {
    await expect(loadSnapshot(dir)).rejects.toThrow(/programs\.json/);
    await expect(loadSnapshot(dir)).rejects.toThrow(/npm run scrape/);
  });

  it('refuses an empty snapshot rather than serving nothing as success', async () => {
    await writeFile(join(dir, 'programs.json'), '[]');
    await writeFile(join(dir, 'run-report.json'), JSON.stringify(report));
    await expect(loadSnapshot(dir)).rejects.toThrow(/empty/i);
  });

  it('refuses a snapshot that fails the shared schema', async () => {
    await writeFile(join(dir, 'programs.json'), JSON.stringify([{ ...programme, id: 'nope' }]));
    await writeFile(join(dir, 'run-report.json'), JSON.stringify(report));
    await expect(loadSnapshot(dir)).rejects.toThrow(/schema/i);
  });

  it('refuses malformed JSON with a message naming the file', async () => {
    await writeFile(join(dir, 'programs.json'), '{ not json');
    await expect(loadSnapshot(dir)).rejects.toThrow(/programs\.json/);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run server/routes.test.ts`
Expected: FAIL — cannot resolve `./index.js`.

- [ ] **Step 4: Write `server/package.json`**

```json
{
  "name": "@antrag-plus/server",
  "private": true,
  "type": "module",
  "dependencies": {
    "@antrag-plus/schema": "*",
    "express": "^4.19.2"
  }
}
```

- [ ] **Step 5: Write `server/snapshot.ts`**

```ts
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
  const programmesRaw = await readJson(join(dir, 'programs.json'));
  const parsed = z.array(ProgramSchema).safeParse(programmesRaw);
  if (!parsed.success) {
    throw new Error(`${join(dir, 'programs.json')} failed the shared schema: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
  }
  if (parsed.data.length === 0) {
    throw new Error(`${join(dir, 'programs.json')} is empty. Run \`npm run scrape\` to populate it.`);
  }

  const reportRaw = await readJson(join(dir, 'run-report.json'));
  const report = RunReportSchema.safeParse(reportRaw);
  if (!report.success) {
    throw new Error(`${join(dir, 'run-report.json')} failed the shared schema.`);
  }

  return { programmes: parsed.data, report: report.data };
};
```

- [ ] **Step 6: Write `server/index.ts`**

```ts
import express from 'express';
import type { Program, RunReport } from '@antrag-plus/schema';
import { loadSnapshot } from './snapshot.js';

const listEntry = (p: Program) => ({
  id: p.id,
  url: p.url,
  name: p.name,
  shortDescription: p.shortDescription,
  deadline: p.deadline,
  conditions: p.conditions,
});

export const createApp = (snapshot: { programmes: Program[]; report: RunReport }): express.Express => {
  const app = express();
  const byId = new Map(snapshot.programmes.map(p => [p.id, p]));

  app.get('/api/programs', (_req, res) => {
    res.json(snapshot.programmes.map(listEntry));
  });

  app.get('/api/programs/:id', (req, res) => {
    const found = byId.get(req.params.id);
    if (!found) {
      res.status(404).json({ error: { code: 'not-found', message: `no programme with id ${req.params.id}` } });
      return;
    }
    res.json(found);
  });

  app.get('/api/meta', (_req, res) => {
    res.json(snapshot.report);
  });

  return app;
};

if (process.argv[1]?.endsWith('index.ts')) {
  try {
    const snapshot = await loadSnapshot('data');
    const port = Number(process.env['PORT'] ?? 3001);
    createApp(snapshot).listen(port, () => {
      console.log(`api on http://localhost:${port} — ${snapshot.programmes.length} programmes`);
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
```

- [ ] **Step 7: Run it to verify it passes**

Run: `npx vitest run server/routes.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 8: Add the dev script and commit**

```bash
npm pkg set scripts.dev:api="tsx watch server/index.ts"
git add server/ package.json package-lock.json
git commit -m "feat(server): Express API over the validated snapshot"
```

---

## Task 18: React list and detail views

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/index.html`, `web/tsconfig.json`
- Create: `web/src/main.tsx`, `web/src/api.ts`, `web/src/styles.css`
- Create: `web/src/DeadlineBadge.tsx`, `web/src/ConditionsTable.tsx`, `web/src/ProgramList.tsx`, `web/src/ProgramDetail.tsx`
- Test: `web/src/DeadlineBadge.test.tsx`, `web/src/ConditionsTable.test.tsx`, `web/src/ProgramList.test.tsx`

**Interfaces:**
- Consumes: `Program`, `Deadline`, `Conditions` types (Task 2); the three endpoints (Task 17).
- Produces: the two routes. No filtering or sorting UI.

- [ ] **Step 1: Install dependencies**

```bash
npm install react react-dom react-router-dom
npm install -D @vitejs/plugin-react vite @types/react @types/react-dom \
  @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Write the failing DeadlineBadge test**

Create `web/src/DeadlineBadge.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeadlineBadge } from './DeadlineBadge.js';

describe('DeadlineBadge', () => {
  it('renders a window as a German end date', () => {
    render(<DeadlineBadge deadline={{ kind: 'window', start: '2026-09-01', end: '2026-10-15' }} />);
    expect(screen.getByText('bis 15.10.2026')).toBeDefined();
  });

  it('renders rolling as laufend', () => {
    render(<DeadlineBadge deadline={{ kind: 'rolling', cadence: 'sechs Mal jährlich' }} />);
    expect(screen.getByText(/laufend/)).toBeDefined();
  });

  it('shows the cadence when stated', () => {
    render(<DeadlineBadge deadline={{ kind: 'rolling', cadence: 'sechs Mal jährlich' }} />);
    expect(screen.getByText(/sechs Mal jährlich/)).toBeDefined();
  });

  it('renders unknown as a dash rather than as a missing deadline', () => {
    render(<DeadlineBadge deadline={{ kind: 'unknown' }} />);
    expect(screen.getByText('—')).toBeDefined();
  });

  it('gives each kind a distinct data attribute so the three cases are visibly different', () => {
    const { container: w } = render(<DeadlineBadge deadline={{ kind: 'window', end: '2026-10-15' }} />);
    const { container: r } = render(<DeadlineBadge deadline={{ kind: 'rolling' }} />);
    const { container: u } = render(<DeadlineBadge deadline={{ kind: 'unknown' }} />);
    const kinds = [w, r, u].map(c => c.querySelector('[data-deadline]')?.getAttribute('data-deadline'));
    expect(kinds).toEqual(['window', 'rolling', 'unknown']);
  });
});
```

- [ ] **Step 3: Write the failing ConditionsTable test**

Create `web/src/ConditionsTable.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConditionsTable } from './ConditionsTable.js';

const f = <T,>(value: T) => ({ value, tier: 'locale' as const, evidence: 'section' });

describe('ConditionsTable', () => {
  it('shows a grant with its bound and basis, never a bare figure', () => {
    render(<ConditionsTable conditions={{ grant: f([{ amountEur: 50000, bound: 'max' as const, per: 'project' as const }]) }} />);
    expect(screen.getByText(/max\. 50\.000 € pro Projekt/)).toBeDefined();
  });

  it('distinguishes a per-person-day rate from a project ceiling', () => {
    render(<ConditionsTable conditions={{ grant: f([{ amountEur: 50, bound: 'exact' as const, per: 'person-day' as const }]) }} />);
    expect(screen.getByText(/50 € pro Person und Tag/)).toBeDefined();
  });

  it('shows a co-financing floor as a minimum', () => {
    render(<ConditionsTable conditions={{ coFinancing: f([{ percent: 10, bound: 'min' as const, of: 'own-funds' as const }]) }} />);
    expect(screen.getByText(/min\. 10 % Eigenmittel/)).toBeDefined();
  });

  it('shows a duration in months', () => {
    render(<ConditionsTable conditions={{ maxDuration: f({ months: 48, bound: 'max' as const }) }} />);
    expect(screen.getByText(/max\. 48 Monate/)).toBeDefined();
  });

  it('lists each eligible cost category as its own row', () => {
    render(<ConditionsTable conditions={{ eligibleCosts: f(['Personalkosten', 'Sachkosten']) }} />);
    expect(screen.getByText('Personalkosten')).toBeDefined();
    expect(screen.getByText('Sachkosten')).toBeDefined();
  });

  it('says so plainly when a programme states no conditions of its own', () => {
    render(<ConditionsTable conditions={{}} />);
    expect(screen.getByText(/keine eigenen Förderkonditionen angegeben/i)).toBeDefined();
  });
});
```

- [ ] **Step 4: Write the failing ProgramList test**

Create `web/src/ProgramList.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProgramList } from './ProgramList.js';

const entry = (id: string, name: string) => ({
  id,
  url: `https://x.test/${name}`,
  name: { value: name, tier: 'standard', evidence: 'jsonld' },
  shortDescription: { value: 'Kurz', tier: 'standard', evidence: 'jsonld' },
  deadline: { value: { kind: 'unknown' }, tier: 'locale', evidence: 'none' },
  conditions: {},
});

const renderList = () => render(<MemoryRouter><ProgramList /></MemoryRouter>);

beforeEach(() => vi.restoreAllMocks());

describe('ProgramList', () => {
  it('renders one entry per programme', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([entry('a', 'Erstes'), entry('b', 'Zweites')]))));
    renderList();
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(2));
  });

  it('shows a loading state before the data arrives', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    renderList();
    expect(screen.getByText(/lädt/i)).toBeDefined();
  });

  it('shows an error state when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    renderList();
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
  });

  it('links each entry to its detail route by id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([entry('abc', 'Erstes')]))));
    renderList();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Erstes/ }).getAttribute('href')).toBe('/programs/abc');
    });
  });
});
```

- [ ] **Step 5: Run the three tests to verify they fail**

Run: `npx vitest run web/src`
Expected: FAIL — modules cannot be resolved.

- [ ] **Step 6: Write the web package files**

`web/package.json`:

```json
{
  "name": "@antrag-plus/web",
  "private": true,
  "type": "module",
  "dependencies": {
    "@antrag-plus/schema": "*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2"
  }
}
```

`web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
});
```

`web/index.html`:

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Förderangebote</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Add the jsdom environment for web tests**

Modify `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
    environment: 'node',
    setupFiles: ['./web/src/setupTests.ts'],
    environmentMatchGlobs: [['web/**', 'jsdom']],
  },
});
```

Create `web/src/setupTests.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 8: Write `web/src/DeadlineBadge.tsx`**

```tsx
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
```

- [ ] **Step 9: Write `web/src/ConditionsTable.tsx`**

A figure is never rendered without its bound and basis; that is the display-layer form of the §2.5 bug.

```tsx
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
```

- [ ] **Step 10: Write `web/src/api.ts`**

```ts
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
```

- [ ] **Step 11: Write `web/src/ProgramList.tsx`**

```tsx
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
    getPrograms().then(setEntries).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p role="alert">Die Förderangebote konnten nicht geladen werden: {error}</p>;
  if (!entries) return <p>Lädt …</p>;

  return (
    <main>
      <h1>Förderangebote</h1>
      <ul className="programs">
        {entries.map(entry => (
          <li key={entry.id}>
            <Link to={`/programs/${entry.id}`}>{entry.name.value}</Link>
            <p>{entry.shortDescription.value}</p>
            <div className="meta">
              <DeadlineBadge deadline={entry.deadline.value} />
              {projectCeiling(entry) ? <span className="badge">{projectCeiling(entry)}</span> : undefined}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
};
```

- [ ] **Step 12: Write `web/src/ProgramDetail.tsx`**

```tsx
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
    getProgram(id).then(setProgram).catch((e: Error) => setError(e.message));
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
          <p>{req.text}</p>
        </section>
      ))}

      <p>
        <a href={program.url} rel="noopener noreferrer" target="_blank">
          Zum Original auf aktion-mensch.de
        </a>
      </p>
    </main>
  );
};
```

- [ ] **Step 13: Write `web/src/main.tsx` and `web/src/styles.css`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ProgramDetail } from './ProgramDetail.js';
import { ProgramList } from './ProgramList.js';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ProgramList />} />
        <Route path="/programs/:id" element={<ProgramDetail />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
```

```css
:root {
  --ink: #1a1a1a;
  --muted: #5c5c5c;
  --rule: #e2e2e2;
  --accent: #c8102e;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--ink);
  line-height: 1.55;
}

main {
  max-width: 44rem;
  margin: 0 auto;
  padding: 2rem 1rem 4rem;
}

h1 { font-size: 1.9rem; line-height: 1.2; }
h2 { font-size: 1.2rem; margin-top: 2rem; }

.programs { list-style: none; padding: 0; }

.programs li {
  padding: 1.25rem 0;
  border-top: 1px solid var(--rule);
}

.programs a { color: var(--accent); font-weight: 600; font-size: 1.05rem; }

.meta { display: flex; gap: 0.5rem; flex-wrap: wrap; }

.badge {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border: 1px solid var(--rule);
  border-radius: 999px;
  font-size: 0.85rem;
  color: var(--muted);
}

.badge[data-deadline="window"] { border-color: var(--accent); color: var(--accent); }

.conditions, .facts { border-collapse: collapse; width: 100%; }

.conditions th, .facts th {
  text-align: left;
  font-weight: 600;
  padding: 0.4rem 1rem 0.4rem 0;
  vertical-align: top;
  white-space: nowrap;
}

.conditions td, .facts td { padding: 0.4rem 0; }

.muted { color: var(--muted); }
.lead { font-size: 1.1rem; }
```

- [ ] **Step 14: Run the web tests to verify they pass**

Run: `npx vitest run web/src`
Expected: PASS, 14 tests.

- [ ] **Step 15: Add the dev scripts and verify the app runs**

```bash
npm pkg set scripts.dev:web="vite --config web/vite.config.ts web"
npm pkg set scripts.dev="npm-run-all --parallel dev:api dev:web"
npm install -D npm-run-all
npm run dev
```

Expected: the API reports 7 programmes, Vite serves the app, `/` lists seven entries, and clicking one opens its detail view.

- [ ] **Step 16: Commit**

```bash
git add web/ vitest.config.ts package.json package-lock.json
git commit -m "feat(web): programme list and detail views"
```

---

## Task 19: verify:live

**Files:**
- Create: `scraper/verifyLive.ts`
- Test: `scraper/verifyLive.test.ts`

**Interfaces:**
- Consumes: `Fetched` (Task 6).
- Produces: `diffAgainstFixtures(deps: { fixtureDir: string; urls: Record<string, string>; fetchText(url: string): Promise<string | undefined> }): Promise<{ changed: string[]; unreachable: string[] }>`

- [ ] **Step 1: Write the failing test**

Create `scraper/verifyLive.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { diffAgainstFixtures } from './verifyLive.js';

const urls = { 'https://x.test/a': 'sport-kultur' };

describe('diffAgainstFixtures', () => {
  it('reports nothing when the live page matches the fixture', async () => {
    const fetchText = async () => (await import('node:fs/promises')).readFile('tests/fixtures/sport-kultur.html', 'utf8');
    const r = await diffAgainstFixtures({ fixtureDir: 'tests/fixtures', urls, fetchText });
    expect(r.changed).toEqual([]);
    expect(r.unreachable).toEqual([]);
  });

  it('reports the url when the live page differs', async () => {
    const r = await diffAgainstFixtures({ fixtureDir: 'tests/fixtures', urls, fetchText: async () => '<p>neu</p>' });
    expect(r.changed).toEqual(['https://x.test/a']);
  });

  it('reports a page it cannot fetch separately from one that changed', async () => {
    const r = await diffAgainstFixtures({ fixtureDir: 'tests/fixtures', urls, fetchText: async () => undefined });
    expect(r.unreachable).toEqual(['https://x.test/a']);
    expect(r.changed).toEqual([]);
  });

  it('reports a missing fixture as a change rather than passing silently', async () => {
    const r = await diffAgainstFixtures({
      fixtureDir: 'tests/fixtures',
      urls: { 'https://x.test/b': 'does-not-exist' },
      fetchText: async () => '<p>x</p>',
    });
    expect(r.changed).toEqual(['https://x.test/b']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run scraper/verifyLive.test.ts`
Expected: FAIL — cannot resolve `./verifyLive.js`.

- [ ] **Step 3: Write `scraper/verifyLive.ts`**

```ts
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFetcher } from './fetch.js';

const digest = (s: string): string => createHash('sha256').update(s).digest('hex');

export const diffAgainstFixtures = async (deps: {
  fixtureDir: string;
  urls: Record<string, string>;
  fetchText(url: string): Promise<string | undefined>;
}): Promise<{ changed: string[]; unreachable: string[] }> => {
  const changed: string[] = [];
  const unreachable: string[] = [];

  for (const [url, basename] of Object.entries(deps.urls)) {
    const live = await deps.fetchText(url);
    if (live === undefined) {
      unreachable.push(url);
      continue;
    }
    let fixture: string;
    try {
      fixture = await readFile(join(deps.fixtureDir, `${basename}.html`), 'utf8');
    } catch {
      changed.push(url);
      continue;
    }
    if (digest(live) !== digest(fixture)) changed.push(url);
  }

  return { changed, unreachable };
};

if (process.argv[1]?.endsWith('verifyLive.ts')) {
  const BASE = 'https://www.aktion-mensch.de/foerderung/foerderangebote';
  const urls: Record<string, string> = {
    [BASE]: 'listing',
    [`${BASE}/sport-kultur`]: 'sport-kultur',
    [`${BASE}/junge-menschen`]: 'junge-menschen',
    [`${BASE}/anschubfoerderung-arbeit`]: 'anschubfoerderung-arbeit',
    [`${BASE}/pauschalfoerderung`]: 'pauschalfoerderung',
    [`${BASE}/zeichen-setzen`]: 'zeichen-setzen',
    [`${BASE}/aktion-mensch-stiftung`]: 'aktion-mensch-stiftung',
  };

  const fetcher = createFetcher({
    cacheDir: 'data/verify-cache',
    get: async (url, headers) => {
      const res = await globalThis.fetch(url, { headers });
      return {
        status: res.status,
        body: Buffer.from(await res.arrayBuffer()),
        headers: Object.fromEntries(res.headers.entries()),
      };
    },
  });

  const result = await diffAgainstFixtures({
    fixtureDir: 'tests/fixtures',
    urls,
    fetchText: async url => {
      const r = await fetcher.fetch(url);
      return r.status === 200 ? r.html : undefined;
    },
  });

  if (result.changed.length === 0 && result.unreachable.length === 0) {
    console.log('fixtures match the live site');
  } else {
    for (const url of result.changed) console.log(`changed:     ${url}`);
    for (const url of result.unreachable) console.log(`unreachable: ${url}`);
    console.log('\nThe site moved, not the code. Re-run scripts/fetch-fixtures.ts and review the test failures.');
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run scraper/verifyLive.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the script and commit**

```bash
npm pkg set scripts.verify:live="tsx scraper/verifyLive.ts"
git add scraper/verifyLive.ts scraper/verifyLive.test.ts package.json
git commit -m "feat(scraper): verify:live diffs the live site against committed fixtures"
```

---

## Task 20: The design note and README

The note argues from numbers this build produced. Write it after a real scrape, with `data/run-report.json` open.

**Files:**
- Create: `docs/DESIGN-NOTE.md`
- Create: `README.md` (replacing the one-line placeholder)

**Interfaces:**
- Consumes: `data/run-report.json` from Task 16, the tier counts in particular.

- [ ] **Step 1: Run the full suite and the scrape, and read the measurements**

```bash
npm test
npm run scrape
cat data/run-report.json
```

Expected: all tests pass; the report shows `urls: 6`, `programmes: 7`, per-strategy counts `6 / 6 / 4`, two disagreements, and a `tierCounts` breakdown.

- [ ] **Step 2: Write `docs/DESIGN-NOTE.md`**

One page. Lead with the measured ratio from `tierCounts`, not with an opinion. Cover, in this order, each in two to four sentences:

1. **Discovery automates; extraction resists.** The cheap deterministic probes: walk every sitemap `robots.txt` declares, look for an embedded route manifest, test whether `?page=2` differs, watch for XHRs returning JSON arrays. Quote the finding that `/sitemap.xml` contains zero programmes while the fourth sub-sitemap contains all six — a crawler trusting the obvious path reports success on nothing.
2. **Key off standards, frameworks and locale — never sites.** Give the four tiers and the **actual** counts from `tierCounts`. State plainly how many fields needed the `site` tier. If any did, name them.
3. **Typed quantities are the difference between stored and usable.** The naive regex read `pauschalfoerderung`'s grant as `50` (a per-person-day rate) and its duration as `2` (the approval cadence). Give the €50,000 query and what it returns.
4. **The locale tier is the leverage.** German funding vocabulary is national, not per-site. A few hundred entries plausibly cover a national corpus.
5. **Source cardinality is not page cardinality.** Six URLs, seven programmes, one page with no conditions of its own. A pipeline assuming one record per page is wrong on its first source and fails invisibly.
6. **What changes from this build.** Navigation is not a config value; a config expresses static listings, pagination and sitemaps but not "load more", infinite scroll or faceted POST. Config becomes the cached output of detection, not something a human writes.
7. **Where a model earns its cost.** Once per source, on a sample, to propose resolvers that are then frozen, tested against fixtures, and monitored by the `verify:live` diff. A model that writes extractors is affordable; one that reads pages is not.
8. **Honest limits.** `linkCluster` degrades on non-hierarchical URLs. Tiers are ordinal, not calibrated. No PDF handling, which matters because `aktion-mensch-stiftung`'s real eligibility rules are in a linked PDF. The basis enums are closed over seven programmes on one site, and the failure mode to watch is a new basis being coerced rather than rejected.

- [ ] **Step 3: Write `README.md`**

Cover: what this is; the one-command setup (`npm install`, `npm run scrape`, `npm run dev`); `npm test` and that tests are offline by construction; `npm run verify:live` and what a diff means; the repo layout; and links to the spec, plan and design note. Include the measured `urls: 6 / programmes: 7` so a reader sees the central finding before reading any code.

- [ ] **Step 4: Verify the whole thing from a clean clone**

```bash
npm test
npm run typecheck
npm run scrape
```

Expected: tests pass, no type errors, scrape prints `urls: 6  programmes: 7`.

- [ ] **Step 5: Commit**

```bash
git add docs/DESIGN-NOTE.md README.md
git commit -m "docs: design note and README"
```
