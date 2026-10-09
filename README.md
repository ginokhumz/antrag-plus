# antrag-plus

Scrapes the funding programmes ("Förderangebote") published by
[Aktion Mensch](https://www.aktion-mensch.de/foerderung/foerderangebote), serves them from
an Express API, and renders them in a React list and detail view.

**6 URLs, 7 programmes.** That gap is the central finding, not a rounding error — one page
carries two complete sub-programmes with separate terms, so discovery counts URLs and
extraction counts programmes, and the run report carries both.

## Run it

```bash
npm install
npm run scrape     # fetch + extract → data/
npm run dev        # API on :3001, app on :5173
```

```bash
npm test           # 197 tests, offline by construction
npm run typecheck
npm run verify:live   # re-fetch and diff against committed fixtures
```

`npm test` never touches the network: the suite reads the ten committed files in
`tests/fixtures/`. `verify:live` is the separate command that tells you **the site changed
rather than the code** — if it reports a diff, re-run `scripts/fetch-fixtures.ts` and review
what the tests then say.

## How it works

```
schema/     one zod contract: the scraper writes it, the API validates it at boot,
            the web app derives its types from it
scraper/    fetch → discover → extract → normalize → validate → emit
server/     three endpoints over the validated snapshot
web/        two routes, plain CSS, no component library
```

**Discovery** runs three independent, source-agnostic strategies and reconciles them rather
than trusting one. They disagree — 6, 6 and 4 — and the disagreement is reported, not
smoothed over. `/sitemap.xml` contains zero programmes; they are in the fourth sub-sitemap
`robots.txt` declares.

**Extraction** prunes navigational and promo modules, segments a page into programmes, then
resolves each field through a tier-ordered chain. Every value records which tier produced
it, so the design note's central ratio is measured rather than asserted:

| Tier | Fields |
|---|---|
| `standard` (JSON-LD, sitemaps) | 10 |
| `framework` (RSC payload) | 0 |
| `locale` (German funding vocabulary) | 47 |
| `site` (this CMS's markup) | 2 |

**Quantities are never bare numbers.** A grant is `{ amountEur, bound, per }`, because
`50.000` is fifty thousand, `maximal` and `mindestens` are opposite bounds on identical
digits, and 50 € per person-day must never be compared against a 400.000 € project ceiling.

**Deadlines are a union**, not a nullable date: `window`, `rolling` or `unknown`. The real
data exercises all three — 3 windows, 2 rolling with cadence, 2 genuinely unknown.
Collapsing `rolling` and `unknown` into `null` would discard the only signal separating a
correct extraction from a silent miss.

## Politeness

`robots.txt` is parsed and honoured, one request per second, identifying User-Agent,
backoff on 5xx only. A full scrape is 7 pages, and the on-disk cache means repeat runs make
no requests at all.

## Documents

- [Design note](docs/DESIGN-NOTE.md) — how this scales to tens of thousands of unseen
  sources without running a model over every page, and what I would do differently
- [Design spec](docs/superpowers/specs/2026-10-08-antrag-plus-design.md) — the findings the
  build argues from, including two the implementation corrected
- [Implementation plan](docs/superpowers/plans/2026-10-09-antrag-plus.md) — the 20 TDD tasks
