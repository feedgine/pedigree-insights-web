# Hypothetical mating

How `/mating` works, and why it is built the way it is. Requirements are tracked as
R-2.11; this file is the companion document — the *how*. The stored mating object is
described field by field in `publish-pipeline.md` ("The mating objects").

`[DRAFT — requires Yuliya's review]`

## What the page is

`/mating?sire=<slug>&dam=<slug>&g=<n>` previews a litter that does not exist yet: both
parents, linked to their pages; the planned litter's four-generation bracket; and the
desktop's Hypothetical Mating analysis — litter COI, litter AVK at depth `g` (3–10,
default 5), the common ancestors with their cross notation and Blood %, the line-breeding
notes and the warn-only checks. It is reached by "Plan a mating" under every dog's
bracket, which fills in one parent; a server-rendered search fills in the other.

It is public and not indexed: `Disallow: /mating` in `robots.txt`, `noindex`, every link
to it `rel="nofollow"`, and no pair in any sitemap. There are far too many pairs to be
worth crawling, and none of them is a published record.

## What is reused

Nothing genetic is written here. The desktop's own modules are vendored and run unchanged:

- `hypotheticalMating.ts` — `makeMatingLookup`, which presents the planned litter as one
  virtual dog with the chosen sire and dam;
- `linebreeding.ts` — `analyzeLinebreeding` and `ancestorLossPercent`, for the common
  ancestors and AVK;
- `matingClassifier.ts` — `classifyLinebreeding`, for the line-breeding notes;
- `matingChecks.ts` — `checkMating`, for the warnings.

The desktop's `buildHypotheticalMating` is used only in tests, as the oracle that the web
result is compared against. The bracket is the dog page's own (`src/render/bracket.ts`),
so the repeated-ancestor shading marks shared ancestors with no new code.

## Where the analysis runs, and why

**In the visitor's browser.** The Function (`functions/mating.ts`) does only I/O: it
canonicalises the parameters, reads both parents from D1 in one indexed query, fetches
both mating objects from R2, and returns an HTML shell with the two objects embedded as
`<script type="application/json">` blocks and the request's UTC date as `asOf`. A static
script then reads the blocks, computes, and inserts the analysis.

The alternatives were worse:

- **Compute on the server.** That is a pedigree walk at request time, which the site's
  design rules out, and the deepest pairs would run up against the platform's per-request CPU
  limit — the visitor would see an error page instead of an analysis.
- **A JSON API that the script fetches.** Three Function invocations per view instead of
  one, against a daily request cap shared with the dog pages, and a `connect-src` the site
  otherwise never needs.
- **Precompute every pair.** The number of pairs is the square of the catalogue.

The consequence is that the analysis needs JavaScript. The no-JavaScript rule governs
published content — dog pages, reports, home, search — and all of it stays script-free.
`/mating` is a calculator: its result is computed, never published. With scripting off it
still shows both parents, the controls, and the line "The analysis is calculated in your
browser and needs JavaScript." Parent search, swap, replace and depth are plain links and
GET forms, so choosing a pair never needs a script.

## The litter COI: A = T·D·Tᵀ

The desktop computes the litter COI with a Meuwissen–Luo pass over the litter's whole
subpedigree. The browser cannot hold that subpedigree, so the web uses the decomposition
that Meuwissen–Luo itself rests on.

The numerator relationship matrix factors as **A = T·D·Tᵀ**, where `T_Xk` is Wright's
contribution of ancestor `k` to dog `X` (with `T_XX = 1`) and `D_k` is `k`'s
Mendelian-sampling variance (the `mendelian()` rule in the vendored `genetics.ts`). So the
coancestry of sire `S` and dam `D` is

```
a(S, D) = Σ_k T_Sk · D_k · T_Dk        F_litter = ½ · a(S, D)
```

Each mating object stores `w_Xk = T_Xk · √D_k`, sorted by slug. The litter COI is then
`½ Σ w_Sk · w_Dk` — a merge join of two sorted lists, linear in their length.
`src/mating/coi.ts` holds that one function, and both the publish and the browser call it.

`D_k` depends on the inbreeding of `k`'s parents. The publish gets every dog's own `F`
from the diagonal of the same identity, `‖w_X‖² = a(X, X) = 1 + F_X`, in one
parents-first pass: a dog's vector needs only the `D` of itself and its ancestors, all of
which come earlier in the order. A test also asserts `F_X = ½ Σ w_sire · w_dam` for every
dog with both parents, so the diagonal form and the sire × dam form cannot drift apart.

This is the same quantity, not an approximation. The parity tests compare it with the
vendored `createGeneticsEngine().coancestry` and with `buildHypotheticalMating().litterCoi`
on synthetic pedigrees built to be awkward: deep line-breeding, half- and full-sibling
pairs, backcrosses, one-parent dogs, name-only ancestors and a cycle.

The litter COI is a full-depth value, so the page labels it that way; AVK and the common
ancestors are labelled with the depth used.

## The grid and the dict

COI needs only the weight vectors. Everything else — the common ancestors, notation,
Blood %, AVK, the notes and the bracket — comes from the vendored path-enumerating walk,
and that walk needs real paths. So each object also carries the dog's ancestry as a
**grid**: 1,023 slots in heap order, slot `i`'s sire at `2i+1` and dam at `2i+2`, nine
generations of ancestors. Nine, because the litter at depth 10 is one generation deeper
than its parents: 2 + 2 × 1,022 = 2,046 litter positions.

Each grid value indexes a **dict** of the ancestors, and each dict entry keeps its own
parents' names. From the two objects `src/mating/compute.ts` builds a synthetic
`AnimalLookup` that answers the vendored code exactly as the database would within those
nine generations. A name with no record ends its line, as it does on the dog page and on
the desktop. Cycles are cut once at publish, as for the reports, and a cut edge met inside
either grid is listed on the page.

**Escaping.** Objects are serialised with `<`, `>`, U+2028 and U+2029 written as `\u`
sequences — the rule the JSON-LD already follows (`scriptSafeJson` in
`src/render/escape.ts`). The Function places the stored bytes in the page without parsing
or re-escaping them, and no data value can close its `<script>` block.

## Budgets and pruning

Three budgets were set before anything was uploaded, and measured against the real
catalogue with `tools/measure-mating.ts`:

- **A — storage:** all mating objects together ≤ 4 GB, so R2 stays well inside its free
  10 GB alongside the payloads and reports.
- **B — browser compute:** parse plus analysis for the worst pair at depth 10 ≤ 50 ms
  median in Node, as a stand-in for a phone several times slower.
- **C — page weight:** the worst pair's HTML, both objects embedded, ≤ 2 MB uncompressed.

If a budget had failed, the plan was to prune each weight vector smallest-entry first
while the pruned mass `dropped = Σ w²` stays ≤ 6e-10. Since `‖w‖² = 1 + F ≤ 2`,
Cauchy–Schwarz bounds the COI error by `½(√dropped_S + √dropped_D)·√2`, below half a unit
of the displayed 0.01 %. All three budgets passed, so the publish writes exact vectors and
`dropped` is always 0. The browser still computes the bound, and prints the COI with its
± bound if a nonzero `dropped` ever appears.

The publish **fails** if any pedigree reaches the 64-generation contribution cap: a
truncated vector would be a wrong COI with nothing on the page to say so.

## The bundle

`src/mating/entry.ts` is the bundle's entry: it reads the two data blocks and `asOf`,
calls `computeMating`, then `renderMatingAnalysis`, and inserts the HTML into
`#mating-analysis`. It makes no network request.

`npm run render:site` bundles it with esbuild (ES2020, minified, one file) into
`site/assets/mating.<content-hash>.js` and writes the hashed name into the shell, so a new
build never meets a stale cached script. The bundle is build output under the git-ignored
`site/`: never committed, never edited by hand, always rebuilt from the vendored sources
that `vendor:check` guards. The parity tests import the same `src/mating/compute.ts`
the bundle is built from, and a separate typecheck pass compiles `src/mating/` against the
DOM library with no Node types, so a Node API cannot slip into the browser.

**Script policy.** `/mating` alone sends `script-src 'self'`, set in the Function from
`src/render/headers.ts`; every other route keeps `script-src 'none'`, and a test asserts
that. `default-src 'none'` stays, so `connect-src` stays closed: the page could not fetch
anything even if it tried. The data blocks are `application/json`, which `script-src`
does not govern.

## The request

One request costs one Function invocation, one D1 query, and two R2 reads. A slug that
is not `^[a-z0-9-]+$` is a 404 before any read. A parent missing from D1 gets one lookup
in the redirect table: a 301 to the current mating URL on a hit, a 404 otherwise — so a
shared mating URL survives a rename. A non-canonical but recognised URL (depth out of
range, an old slug) gets a single 301 to the canonical form. The `etag` combines both
objects' etags with `asOf`, because the age warnings change with the date.

## What differs from the desktop

- **The bracket is four generations**, the dog page's, not the desktop's chart. The
  analysis still runs to depth 10.
- **Print, not export.** There is no PNG or PDF file: the browser's print gives the
  printout, and the print stylesheet hides the controls. No photograph appears in it.
- **It needs JavaScript** for the analysis (see above).
- **Ages are as of the request date (UTC)**, set by the server and printed on the page,
  so the visitor's clock does not matter.
- **AVK depth is stated.** The page labels AVK with the depth used; compare like with like
  when checking a number against the desktop.

Every number is otherwise the desktop's: a web value that disagrees with the desktop at
the same depth is a defect, not a variant.

## Reading the code

| File | What it does |
|---|---|
| `src/publish/mating.ts` | builds one mating object per dog at publish |
| `src/mating/object.ts` | the object's type |
| `src/mating/coi.ts` | the coancestry merge join, shared by publish and browser |
| `src/mating/compute.ts` | synthetic lookup + the vendored analysis; pure, no DOM, no Node |
| `src/mating/render.ts` | the analysis as an HTML string |
| `src/mating/bracket.ts` | the litter's `BracketNode[]` for the shared bracket |
| `src/mating/entry.ts` | the bundle entry |
| `src/render/matingPage.ts` | the server-rendered shell |
| `functions/mating.ts` | the Function: parameters, D1, R2, headers |
| `tests/unit/matingCompute.test.ts` | parity with `buildHypotheticalMating` at depths 3, 5, 10 |
| `tests/unit/matingCoi.test.ts` | parity of the COI with the vendored genetics engine |
