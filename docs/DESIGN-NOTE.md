# Scaling to tens of thousands of unseen sources

One scraper built, for `aktion-mensch.de/foerderung/foerderangebote`: 6 URLs, 7 programmes,
238 tests. Every number below comes from `data/run-report.json`.

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
| `locale` | `Zuschuss`, `Eigenmittel`, `bis zu`/`mindestens` | every German funding site | **29** |
| `site` | this CMS's section-heading convention | one site | **2** |

**39 of 41 resolved fields — 95.1% — come from a standard or from German funding
vocabulary.** The two `site` fields are both names of sub-programmes on the one page that
splits, since a page carries a single `Article` headline. Not a clean sweep, and pinned by
a test.

Two things the counting had to get right before the ratio meant anything. A field that
resolved from *nothing* — a placeholder with evidence `none` — is excluded, or a
non-resolution would be reported as a success. And the 15 `facts` are counted separately
(`factCount`), because they come from a DOM shape — a `<strong>` ending in a colon — not
from German vocabulary; folding them in would both mislabel them and make the headline
ratio a function of how many bold paragraphs a page happens to carry. The first version of
this note quoted 96.6% and did neither.

`framework` scores 0 because the RSC payload earned its place in *discovery*, not
extraction — a distinction the measurement surfaced and I would not have predicted.

That 95.1% is the argument: **the per-source cost collapses if you key off standards and
national vocabulary instead of sites.** German funding terms recur across every funder here,
so a few hundred entries plausibly cover a national corpus. Matching must be fuzzy — this
CMS misspells `Rahmenbedingungen` as `Rahmenbedinungen`, which a literal set would miss
silently. But tolerance must scale with length: a flat two edits aliases `Wen wir fördern`
(whom we fund) onto `Was wir fördern` (what we fund), which is how an early version
published one page's target-group prose as its eligible cost categories.

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

The type alone is not sufficient, though — the *window* matters as much. A fixed-width scan
around a numeral crosses into its neighbour's clause: a per-person-day rate acquired `pro
Jahr und Projekt-Partner` from the sentence after it, and a bracketed sub-allocation
inherited its parent's `maximal`, so one programme published two contradictory project
ceilings. Both were live in committed output until the windows were clamped to stop at the
next or previous amount. A basis phrase belongs to the amount nearest it, and nothing
further.

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

**Design against "passes but wrong."** Every bug that survived longest here was that shape,
and a green suite caught none of them. Pruning stripped `<script>` tags including the
JSON-LD, so every field quietly dropped a tier. Scoping a heading's content to its enclosing
`<section>` gave every heading in that section the same blob, which published fifteen
fragments of the conditions block as "eligible cost categories" — and the test passed,
because it asserted only that *one* expected category was present. The lesson is that an
assertion of the form "the output contains X" cannot catch "the output also contains
garbage"; the tests that found real defects were the ones asserting an output *exactly*, or
asserting which tier produced it.

## Where a model earns its cost

Not per page. **Once per source**, on a sample, to propose resolvers — then frozen, committed
as fixtures, tested, and watched by a `verify:live` diff that says the site moved rather than
the code. A model that writes extractors is affordable at 10,000 sources; one that reads
pages is not.

## Honest limits

`linkCluster` assumes detail pages are path children of the listing, so it degrades on
`/programs` → `/p/48213`. Tiers are ordinal, not calibrated. The basis enums are closed over
7 programmes on one site; watch for a new basis being coerced rather than rejected.

Two limits worth naming precisely. **The requirement bodies are not in the server HTML** —
their accordion panels are empty, so the build ships the requirement *headings* with empty
text rather than inventing bodies, and the spec's claim that "the HTTP response contains
everything" is true of every field except these. **No PDF handling**, and one programme's
real eligibility rules are in a linked PDF. Where a quantity could not be classified the
record says so: 5 of 7 programmes carry issues, and the detail view shows them rather than
presenting a gap as a fact.
