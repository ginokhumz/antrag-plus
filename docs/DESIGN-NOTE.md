# Scaling to tens of thousands of unseen sources

One scraper built, for `aktion-mensch.de/foerderung/foerderangebote`: 6 URLs, 7 programmes,
197 tests. Every number below comes from `data/run-report.json`.

## Discovery automates; extraction resists

Discovery has cheap deterministic probes and needs no model: walk **every** sitemap
`robots.txt` declares, recursing through indexes; look for an embedded route manifest
(RSC payload, `__NEXT_DATA__`, JSON-LD `ItemList`); test whether `?page=2` differs; watch
for XHRs returning JSON. This source shows why it matters — three strategies disagree
(`sitemapIndex` 6, `embeddedManifest` 6, `linkCluster` 4), and `/sitemap.xml`, the path any
crawler reaches for first, contains **zero** programmes. They sit in the fourth
sub-sitemap. A crawler trusting the obvious path finds nothing and reports success, which
is why the scraper exits non-zero on an empty result.

## Key off standards, frameworks and locale — never sites

Extraction knowledge sorts by reach. Measured across 59 resolved fields:

| Tier | Example | Reach | Fields |
|---|---|---|---|
| `standard` | JSON-LD, sitemaps | universal | **10** |
| `framework` | `self.__next_f` RSC payload | dozens of frameworks | **0** |
| `locale` | `Zuschuss`, `Eigenmittel`, `bis zu`/`mindestens` | every German funding site | **47** |
| `site` | this CMS's section-heading convention | one site | **2** |

**57 of 59 fields — 96.6% — resolve from a standard or from German funding vocabulary.**
The two `site` fields are both names of sub-programmes on the one page that splits, since a
page carries a single `Article` headline. Not a clean sweep, and pinned by a test.
`framework` scores 0 because the RSC payload earned its place in *discovery*, not
extraction — a distinction the measurement surfaced and I would not have predicted.

That 96.6% is the argument: **the per-source cost collapses if you key off standards and
national vocabulary instead of sites.** German funding terms recur across every funder here,
so a few hundred entries plausibly cover a national corpus. Matching must be fuzzy — this
CMS misspells `Rahmenbedingungen` as `Rahmenbedinungen`, which a literal set would miss
silently.

## Typed quantities, not numbers

A first-pass regex got two of three `pauschalfoerderung` values wrong: its grant read as
`50` (a per-person-day rate; the real ceiling is 400.000 per partner-year) and its duration
as `2` (the approval cadence, outside the conditions block). Five traps, each now a test:
German digit grouping (`50.000` is 50000, not 50); the bound living in the adverb (`maximal`
vs `mindestens`); units differing per programme; three percentages on one page with three
referents; `4 Jahre` and `48 Monate` being one limit.

So a quantity is `{ value, bound, basis }`. *Grants above €50,000 per project* then returns
two programmes and excludes `pauschalfoerderung` instead of matching its `50`. **That needed
the right type, not a model.** An unclassifiable basis is dropped with an issue, since an
unclassified amount silently enters comparisons.

## Source cardinality is not page cardinality

Six URLs describe seven programmes. Another states its terms **per process phase** (50.000
planning, 600.000 delivery), which the schema cannot hold without making "max grant"
ambiguous, so it records an issue rather than reporting absence. A pipeline assuming one
record per page is wrong on its first source, and invisibly — the URL count stays right
while a programme vanishes. Count both.

## What I would do differently

**Navigation is not a config value.** A config expresses static listings, pagination and
sitemaps — not "load more", infinite scroll, or faceted POST. It inevitably grows a
`strategy: custom` escape hatch, leaving a DSL *and* per-source code. Config should be the
**cached output of detection**, not something a human writes.

**Prune before segmenting.** One page has promo sections whose headings look exactly like
programme boundaries, and a CTA reading `Förderkonditionen kennenlernen`. Segmenting first
invents programmes; an unpruned scan attaches another organisation's `450.000` to this one —
and passes.

**Design against "passes but wrong."** Both bugs that survived longest were that shape.
Pruning stripped `<script>` tags including the JSON-LD, so every field quietly dropped a
tier and the 96.6% above would have been false while every other test stayed green. Only a
test asserting *which tier* resolved each field caught it.

## Where a model earns its cost

Not per page. **Once per source**, on a sample, to propose resolvers — then frozen, committed
as fixtures, tested, and watched by a `verify:live` diff that says the site moved rather than
the code. A model that writes extractors is affordable at 10,000 sources; one that reads
pages is not.

## Honest limits

`linkCluster` assumes detail pages are path children of the listing, so it degrades on
`/programs` → `/p/48213`. Tiers are ordinal, not calibrated. No PDF handling, and one
programme's real eligibility rules are in a linked PDF. The basis enums are closed over 7
programmes on one site; watch for a new basis being coerced rather than rejected.
