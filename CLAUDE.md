# antrag-plus

Scrapes funding programs ("Förderangebote") from `aktion-mensch.de`, serves them over an
Express API, and renders them in a React app. Built as a job-application exercise in three
parts: the scraper, the app, and a one-page note on generalizing to tens of thousands of
unseen sources without running a model over every page.

Full design: `docs/superpowers/specs/2026-10-08-antrag-plus-design.md`. Read it before
changing architecture. This file holds the invariants.

## The tier model

The central idea. Extraction knowledge is classified by how far it reaches:

| Tier | Keys off | Reach |
|---|---|---|
| `standard` | `robots.txt` → sitemaps, JSON-LD | universal |
| `framework` | Next.js RSC payload (`self.__next_f`), `__NEXT_DATA__` | dozens of frameworks |
| `locale` | German funding vocabulary — `Antragsphase`, `Frist`, `ganzjährig` | every German funding site |
| `site` | selectors like `[data-module=fokusbox]` | one site |

Every extracted value is tagged with the tier that produced it. Prefer the highest-reaching
tier that works. Site-tier knowledge is confined to `extract/aktionMensch.ts` and belongs
nowhere else — a "general" module that reaches for a site selector is miscategorized.

## Invariants

- **`Deadline` is a discriminated union** (`window` | `rolling` | `unknown`), never a
  nullable date. `rolling` means the program accepts applications continuously; `unknown`
  means extraction found nothing. Collapsing those two loses the only signal that
  distinguishes a correct result from a silent miss.
- **Zero discovered programs is a non-zero exit.** Reporting success on an empty result is
  the worst available failure.
- **Quantities are bounded, never bare numbers.** A grant, rate, or duration is
  `{ value, bound, basis }`. German digit grouping means `50.000` is 50000, the bound comes
  from the governing adverb (`maximal` → max, `mindestens` → min), and the basis comes from
  the unit phrase (`pro Tag` → person-day, `der förderfähigen Kosten` → eligible-costs).
  A quantity whose basis cannot be classified is **dropped with an issue, never guessed** —
  an unclassified amount silently enters comparisons and is worse than a missing one.
- **Durations are always months**, whichever unit the page uses. `4 Jahre` and `48 Monate`
  are the same limit and must compare equal.
- **One record is one fundable thing, not one page.** `pauschalfoerderung` is two
  programmes on one URL and splits into two records sharing a `url`, distinguished by
  `slug` and `anchor`. Discovery counts URLs, extraction counts programmes; the run report
  carries both (`urls: 6, programmes: 7`) because a sub-programme can vanish while the URL
  count stays right.
- **Prune nav, footer, promo and example-project modules before matching anything.** On
  `aktion-mensch-stiftung` an unpruned scan matches `Förderkonditionen` in a promo
  call-to-action and harvests Euro amounts belonging to other organisations' projects.
- **Then segment, then resolve.** Condition and requirement resolvers never see text
  outside their own programme segment; unscoped, the approval cadence
  (`Bewilligungsrunden … 2 Monaten`) reads as a project duration.
- **Label matching is fuzzy, never a literal string set.** Their CMS misspells
  `Rahmenbedingungen` as `Rahmenbedinungen`; a literal set misses that section with no
  signal that it did.
- **Requirements are classified prose, not predicates.** Six programmes use six heading
  schemes and range from statutory accreditation to editorial judgement. Keep the original
  heading as evidence so a misclassification stays visible.
- **Validation issues attach per field, not per record.** A bad deadline degrades to
  `unknown` with a logged issue; the record still ships. Never drop a record silently.
- **The API validates the snapshot at boot** against the same schema the scraper writes
  with, and refuses to start if it fails.
- **One schema module** is the single source of truth, shared by scraper, API, and frontend.
- **Discovery runs all strategies and reconciles**, recording disagreements rather than
  taking the first answer. The three current strategies return 6, 6, and 4 programs.
- **Tests never touch the network.** Fixtures live in `tests/fixtures/`.

## Structure

```
schema/     shared zod contract
scraper/    fetch · discover · extract · normalize · validate · emit
server/     Express API over data/programs.json
web/        Vite + React, list view and detail view
tests/      fixtures + specs
```

## Commands

```
npm run scrape        fetch + extract → data/
npm run dev           API + Vite together
npm test              fixtures, offline
npm run verify:live   diff the live site against committed fixtures
```

## Code style

TypeScript throughout. The frontend stays deliberately plain: plain CSS, system font stack,
no component library.

**Comments explain why, never what.** Two kinds are specifically unwanted:

- **Restating the code.** `// ISO dates` above a field already named `start` and typed
  `IsoDate` adds nothing. If a type needs explaining, name it better.
- **Enumerating current values.** `// Art der Förderung, Fokusthema, Zielgruppe` beside a
  `facts` map is stale the moment a fact is added or renamed, and nothing will flag it.
  The same applies to comments listing current routes, strategies, or fields.

A comment earns its place when the reasoning is not recoverable from the code — why a date
range inherits its year from the end date, why inline elements are joined without
whitespace. Prefer encoding the fact in a type or a well-named function over writing it in
prose.
