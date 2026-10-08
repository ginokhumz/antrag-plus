# antrag-plus — Design

**Date:** 2026-10-08
**Source:** `aktion-mensch.de/foerderung/foerderangebote`

## 1. Purpose and deliverables

A job-application exercise in three parts:

1. **Scraper** — Node.js, extracts program listings (name, short description, link, deadline if available) plus the detail page for each program, from one well-chosen source.
2. **App** — Node backend serving the scraped data; React frontend with a list view and a detail view.
3. **Design note** — one page: how to make this work across tens of thousands of unseen sources without running a model over every page, and what would change from what was built.

Success is judged on craft and on clear thinking, not feature count. The frontend is deliberately simple; the scraper and the note carry the signal.

## 2. Source findings

All verified by direct inspection, not assumed. These findings drive the design.

`robots.txt` permits `/foerderung/`. The site is Next.js App Router, fully server-rendered — the HTTP response contains everything. **No headless browser is needed.**

### 2.1 Discovery paths disagree

| Path | Programs found |
|---|---|
| Listing page `[data-module=fokusbox]` cards | 4 |
| Embedded Next.js RSC nav payload (`self.__next_f`) | 6 |
| `/sitemap.xml` — the obvious one | **0** |
| `/meta/sitemap.xml` — 4th entry in the sitemap index | 6 |

`robots.txt` declares `index-sitemap.xml`, which fans out to four sub-sitemaps. The programs appear in none of the first three; they are in `meta/`. A crawler that fetches `/sitemap.xml` finds **zero programs and reports success**.

Of the paths that find anything at all, the **listing page is the least complete** — the thing a human calls "the program listing" omits `zeichen-setzen` and `aktion-mensch-stiftung`. The most authoritative path is the one a crawler is least likely to reach.

Generic anchor harvesting reproduces the listing-page result with **no site-specific selectors**: collect every `<a>`, keep same-origin, cluster by `(parent path, depth)`, take the cluster that are path-children of the listing URL. Verified: 4 programs, `fokusbox` never referenced.

### 2.2 Three deadline cases, not one

| Program | Markup | Meaning |
|---|---|---|
| `junge-menschen`, `sport-kultur` | `Aktuelle Antragsphase: 01.09. – 15.10.2026` | a window |
| `pauschalfoerderung` | "ganzjährig … Bewilligungsrunden … sechs Mal jährlich" | rolling, no single deadline |
| `zeichen-setzen`, `aktion-mensch-stiftung` | no date present | unknown |

### 2.3 The facts block is CMS rich text, not markup

Zero `<dl>`/`<dt>`/`<dd>` on the page. An editor typed bold labels into a rich-text field:

```html
<p><span><strong>Art der Förderung:</strong> </span><br/>Projektförderung</p>
<p><span><strong>Fokusthema:</strong></span><br/>J<span>unge Menschen</span></p>
<p><span><strong>Aktuelle Antragsphase: 01.09. – 15.10.2026</strong></span></p>
```

Two consequences:

- **The deadline has a different shape from the other three facts** — label and value both inside `<strong>`, no `<br/>`. Editor inconsistency *within a single page*. Extraction must key on label text, not structure.
- **Words split mid-token**: `J<span>unge Menschen</span>` is a bare text node followed by a span. Naive `textContent` with whitespace joining yields `J unge Menschen`.

### 2.4 JSON-LD supplies name and description

Detail pages carry `Article` JSON-LD with clean `headline` and `description`. Both available from a standard, with no selectors.

### 2.5 Extraction tiers

The findings above sort into four tiers by how far the knowledge reaches:

| Tier | Example | Reach | Fields covered here |
|---|---|---|---|
| **standard** | `robots.txt`→sitemaps, JSON-LD | universal | URLs, name, description |
| **framework** | `self.__next_f` RSC payload | dozens of frameworks | URLs |
| **locale** | `Antragsphase`, `Frist`, `Antragsschluss`, `ganzjährig` | every German funding site | deadline, facts |
| **site** | `[data-module=fokusbox]` | one site | *nothing required* |

The `locale` tier is the important one: a label-scan keyed on German funding vocabulary is **domain knowledge, not site knowledge** — written once, reused across every German funding source. Consequently `extract/aktionMensch.ts` is expected to hold only fallbacks.

## 3. Data contract

One `schema/` module, shared by scraper (writes), API (validates at boot), and frontend (derives types). Single source of truth.

```ts
type Tier = 'standard' | 'framework' | 'locale' | 'site';

type Field<T> = { value: T; tier: Tier; evidence: string };

type Issue = { field: string; code: string; message: string; raw?: string };

type IsoDate = string;

type Deadline =
  | { kind: 'window';  start?: IsoDate; end: IsoDate }
  | { kind: 'rolling'; cadence?: string }
  | { kind: 'unknown' };

type Program = {
  slug: string;
  url: string;
  name: Field<string>;
  shortDescription: Field<string>;
  deadline: Field<Deadline>;
  facts: Record<string, Field<string>>;
  bodySections: { heading: string; text: string }[];
  issues: Issue[];
};
```

**Why `Deadline` is a union, not `string | null`.** `null` conflates *"this program has no deadline"* with *"we failed to find one."* Across 10,000 sources that distinction is the entire data-quality problem — `rolling` versus `unknown` is the difference between a correct extraction and a silent miss.

**Why `Field<T>` carries a tier.** `evidence` is the matching label or selector, so any value traces back to the markup that produced it. No numeric confidence score — the tier is the trust signal and is not invented precision. Counting resolved fields by tier is the measurement the design note argues from.

## 4. Scraper pipeline

Six stages, each a typed function. Only stage 3 holds site knowledge.

```
scraper/
  fetch.ts       politeness, cache, encoding
  discover/      sitemapIndex · embeddedManifest · linkCluster · reconcile
  extract/       tiered resolvers
  normalize/     text · germanDates
  validate.ts    zod schema, per-field issues
  emit.ts        programs.json · raw/*.html · run-report.json
```

### 4.1 fetch

`fetch(url) → { html, status, fetchedAt, fromCache }`

Parses `robots.txt` and honors it rather than assuming. 1 request/sec, identifying User-Agent, exponential backoff on 5xx. Charset detected from `Content-Type` then `<meta charset>` — required on a German site; umlauts corrupt silently otherwise. An on-disk cache keyed by URL serves double duty: dev runs stop hitting the network, and the cached HTML becomes the test fixture corpus. Total real load: ~7 pages.

### 4.2 discover

`discover(listingUrl) → DiscoveryReport`

Runs all three strategies independently, unions the results, records who missed what:

```ts
{ strategies: [ { name: 'sitemapIndex',     found: 6 },
                { name: 'embeddedManifest', found: 6 },
                { name: 'linkCluster',      found: 4 } ],
  union: [ /* 6 urls */ ],
  disagreements: [ { url: '…/zeichen-setzen',          missedBy: ['linkCluster'] },
                   { url: '…/aktion-mensch-stiftung',  missedBy: ['linkCluster'] } ] }
```

A strategy that throws is recorded as failed, not fatal. **Zero total discoveries exits non-zero** — that is precisely the failure mode `/sitemap.xml` would have produced, and a scraper that reports success on an empty result is worse than one that crashes.

No site-specific discovery strategy exists. `linkCluster` replaces an earlier `listingPage` design that depended on `[data-module=fokusbox]`; that selector was site knowledge wearing a general-strategy name.

**Known limitation.** `linkCluster` assumes detail pages are path-children of the listing URL. It breaks when a listing at `/programs` links to `/p/48213`, or off-domain. Mitigable without site knowledge by scoring clusters — size ≥ 2, uniform depth, uniform prefix, links inside `<main>` rather than nav/footer — but it degrades, and the design note states this rather than claiming three strategies suffice.

### 4.3 extract

A field is a **list of candidate resolvers**, tried in tier order; first hit wins.

```ts
type Resolver<T> = { tier: Tier; name: string; run(ctx: PageCtx): T | undefined };

const description: Resolver<string>[] = [
  { tier: 'standard', name: 'jsonld.Article.description', run: c => c.jsonLd.Article?.description },
  { tier: 'locale',   name: 'lead-paragraph',             run: c => c.firstProsePara() },
  { tier: 'site',     name: 'h1-sibling-prose',           run: c => c.q('h1 ~ .prose p') },
];

const deadline: Resolver<Deadline>[] = [
  { tier: 'locale', name: 'label:Antragsphase|Frist|Antragsschluss', run: c => c.labelledFact(DEADLINE_LABELS) },
  { tier: 'locale', name: 'rolling:ganzjährig|laufend',              run: c => c.rollingPhrase() },
];
```

`resolve()` walks the list and returns `Field<T>` tagged with the tier and evidence that produced it. `labelledFact` matches on **label text, not structure**, so it handles both observed shapes from §2.3.

### 4.4 normalize

**Text.** Join adjacent inline elements with *no* separator; insert whitespace only at block boundaries. This repairs `J<span>unge Menschen</span>` → `Junge Menschen` at the source. A post-hoc regex cannot do this correctly — it has no way to distinguish a spurious `J unge` from a real word break.

**Dates.** `01.09. – 15.10.2026` → `{ start: '2026-09-01', end: '2026-10-15' }`. The start date carries **no year**; inherit it from the end, and if that places start after end, decrement — a Dec→Jan window otherwise lands a year wrong. Handles en-dash, hyphen, and `bis`.

### 4.5 validate

zod, with issues attached **per field, not per record**. A program with an unparseable date ships as `deadline: { kind: 'unknown' }` with an issue logged, rather than vanishing from the dataset. Dropping records silently is the same class of error as reporting success on empty.

### 4.6 emit

`data/programs.json`, `data/raw/<slug>.html`, `data/run-report.json`. One command: `npm run scrape`.

## 5. Backend

Express + TypeScript. Reads `data/programs.json` at boot and validates it against the shared zod schema. If the scraper emitted garbage, **the API refuses to start** rather than serving it.

```
GET /api/programs        → list payload: slug, name, shortDescription, url, deadline
GET /api/programs/:slug  → full record incl. facts, body sections, provenance
GET /api/meta            → run report: scrapedAt, per-strategy counts, disagreements
```

The list endpoint strips heavy detail fields; no reason to ship body prose to a list view. `/api/meta` is a few lines and earns its place — it lets the UI show when the data was scraped and that two programs were found by only one strategy. Unknown slug → `404 { error: { code, message } }`.

**No database.** Six records from a static snapshot: a JSON file keeps the pipeline inspectable with `cat`, and the repo clones-and-runs. Accepted tradeoff: re-scraping requires an API restart. A file watcher is not worth it.

## 6. Frontend

Vite + React + TypeScript, React Router, two routes, plain CSS, system font stack, **no component library**. Vite dev proxy to the API, so no CORS configuration.

- `/` — list of programs: name, short description, deadline badge
- `/programs/:slug` — name, description, facts, body sections, outbound link to the original page

Loading and error states handled; that is the extent of it.

The one place to spend care is the **deadline badge**, where the data model becomes visible: `window` → "bis 15.10.2026", `rolling` → "laufend", `unknown` → "—". Three genuinely different renderings make the union justify itself without explanation.

## 7. Testing

**Fixtures, not network.** The fetch cache produces the corpus; all 7 HTML files (listing + 6 detail pages) are committed to `tests/fixtures/`. Tests are deterministic and offline.

Tests that would actually catch a regression:

- **German dates** — year inheritance on `01.09. – 15.10.2026`; Dec→Jan rollover; en-dash vs hyphen vs `bis`; `ganzjährig` → `rolling`
- **Text normalizer** — `J<span>unge Menschen</span>` → `Junge Menschen`, *and* that legitimate word breaks survive the same code path
- **Each discovery strategy against its fixture, asserting 6 / 6 / 4** — pins the real-world discrepancy as a regression test
- **Reconcile** — union is 6; `disagreements` names exactly the two `linkCluster` missed
- **Extraction tier per field** — description resolves at `standard`, deadline at `locale`. The note's central measurement, enforced by tests rather than claimed in prose
- **Corrupted fixture** — a mangled date yields `{ kind: 'unknown' }` *plus* an issue, and the record still ships
- **API** — supertest: list shape, detail by slug, 404
- **Frontend** — two tests: list renders n items; badge renders all three union kinds

Not tested: Express wiring, Router configuration, or anything exercising only a framework. Coverage theater costs review attention and catches nothing.

**`npm run verify:live`** — a separate command that re-fetches and diffs against committed fixtures. CI stays green and deterministic; running it tells you the *site* changed. At 10,000 sources that diff is the monitoring layer, so the seed of it belongs here.

## 8. Design note — thesis

The one-pager argues from measurements this build produces, not from opinion.

1. **Discovery automates; extraction resists.** Discovery has cheap deterministic probes — walk every sitemap `robots.txt` declares, look for an embedded route manifest, test whether `?page=2` differs, watch for XHRs returning JSON arrays. Each is a handful of requests and no model.
2. **Key off standards and frameworks, never sites.** Per §2.5, on the 4 detail pages inspected during design, every required field resolved at `standard` or `locale` — no field required a site-specific selector. The build measures this across all 6 and reports the real ratio; that ratio, not an architectural preference, is the argument. If a field does fall through to the `site` tier, the note says so.
3. **The `locale` tier is the leverage.** German funding vocabulary is shared by every German funding site. A few hundred vocabulary entries plausibly cover a national corpus; that is the cheap layer between universal standards and per-site bespoke work.
4. **What changes from this build.** Navigation is not a config value — a declarative config expresses static listings, query pagination and sitemaps, but "load more", infinite scroll and faceted POST search need imperative logic. Such a config inevitably grows a `strategy: custom` escape hatch, leaving a DSL *and* per-source code to maintain: worse than either alone. Instead, config becomes the **cached output of detection**, not something a human writes.
5. **Where a model earns its cost.** Not per page. Once per *source*, on a sample, to propose resolvers that are then frozen, tested against fixtures, and monitored by the `verify:live` diff. A model that writes extractors is affordable; a model that reads pages is not.
6. **Honest limits.** `linkCluster` degrades on non-hierarchical URLs (§4.2). Confidence tiers are ordinal, not calibrated. And nothing here handles a source whose listing exists only as a PDF.

## 9. Code conventions

Comments explain why, never what. Two kinds are specifically unwanted: comments that
restate the code (`// ISO dates` above a field already typed `IsoDate`), and comments that
enumerate current values (`// Art der Förderung, Fokusthema, Zielgruppe` beside a `facts`
map), which go stale silently the moment the set changes. Where a fact can be encoded in a
type or a function name instead of prose, encode it. The non-obvious reasoning — why a date
range inherits its year from the end date, why inline elements join without whitespace — is
exactly what a comment is for.

## 10. Repo layout and commands

```
schema/            shared zod contract
scraper/           §4
server/            §5
web/               §6
tests/fixtures/    committed HTML
data/              scraper output (gitignored except run-report)
docs/              this spec + DESIGN-NOTE.md
```

```
npm run scrape        # fetch + extract → data/
npm run dev           # API + Vite together
npm test              # fixtures, offline
npm run verify:live   # diff live site against fixtures
```

## 11. Out of scope

Headless browser (unnecessary — §2). Database. Authentication. Pagination (6 records). Deployment. i18n of the UI chrome. A generic extraction engine validated on one source.
