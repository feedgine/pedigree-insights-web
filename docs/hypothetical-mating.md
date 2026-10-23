# Hypothetical mating specification

What `/mating` does and how it behaves. Each requirement and scenario has a permanent ID
(`MAT-03`, `MAT-03.2`); code and later changes cite these IDs. IDs are never reused or
renumbered. How it is built is described in [`hypothetical-mating-design.md`](hypothetical-mating-design.md).

`[DRAFT — requires Yuliya's review]`

## Purpose

Lets anyone preview a planned dam × sire litter from the published catalogue. The preview
gives the same COI, common ancestors, line-breeding notes and warnings as the desktop's
Hypothetical Mating tab. The server only delivers data; the analysis runs in the visitor's
browser, so the page fits the Cloudflare free tier and no pedigree is walked at request time.

## Requirements

### Requirement: MAT-01 Mating page address
The site SHALL serve a mating preview at `/mating?sire=<slug>&dam=<slug>&g=<n>`. `g` is the
analysis depth, clamped to 3–10 and defaulting to 5 as on the desktop. The URL SHALL be
canonical: a recognised parameter in a different form SHALL get a 301 to the canonical URL.

#### Scenario: MAT-01.1 Both parents given
- **WHEN** a visitor opens `/mating?sire=a&dam=b&g=6` and both slugs are published dogs
- **THEN** the page returns 200 with the analysis of the litter of `a` × `b` at 6 generations

#### Scenario: MAT-01.2 Depth out of range
- **WHEN** a visitor opens `/mating?sire=a&dam=b&g=14`
- **THEN** the response is a 301 to `/mating?sire=a&dam=b&g=10`

#### Scenario: MAT-01.3 Depth omitted
- **WHEN** a visitor opens `/mating?sire=a&dam=b`
- **THEN** the analysis is shown at 5 generations

#### Scenario: MAT-01.4 Unknown slug
- **WHEN** a parent slug matches no published dog and no redirect row
- **THEN** the page returns 404 with the site's not-found page

### Requirement: MAT-02 Mating URLs survive renames
A parent slug that has a row in the redirect table SHALL be answered with a 301 to the same
mating URL carrying the new slug. A mating URL that has been shared keeps working after a
rename or a merge, as dog and report URLs do.

#### Scenario: MAT-02.1 Sire renamed
- **WHEN** `/mating?sire=old&dam=b` is requested and the redirect table maps `old` to `new`
- **THEN** the response is a 301 to `/mating?sire=new&dam=b` (depth parameter preserved)

### Requirement: MAT-03 Analysis contents
The page SHALL show both parents, linked to their dog pages. With scripting enabled, it SHALL
also show the litter COI, the litter AVK at the chosen depth, the common ancestors (name,
cross notation, Blood %), the line-breeding notes and the warn-only checks. The COI SHALL be
labelled "full-depth value", the other values with the depth used.

#### Scenario: MAT-03.1 Common ancestor listed
- **WHEN** an ancestor appears at least twice in the planned litter's pedigree within the chosen depth
- **THEN** it is listed with its desktop-format notation (for example `2S x 3D`) and its Blood %, ranked by Blood %

#### Scenario: MAT-03.2 Outcross note
- **WHEN** no ancestor appears at least twice in the planned litter's pedigree within the chosen depth, or the closest repeated ancestor is at least 5 generations back
- **THEN** the page shows the outcross note with the litter COI. A repeat on one parent's side alone counts as a repeat, so two parents with no shared ancestor can still get no outcross note

### Requirement: MAT-04 AVK and positions
Beside the AVK, the page SHALL show the number of different dogs and the possible
positions, and the number of positions holding a recorded dog out of those possible.

#### Scenario: MAT-04.1 AVK and positions wording
- **WHEN** the analysis renders at depth `g`, with `P = 2^(g+1) − 2`
- **THEN** it shows "AVK, g generations: X% — U different dogs in P positions (100% = every position filled by a different dog)" and "Ancestor positions recorded: R of P", where X, U and R are the desktop's AVK, unique-ancestor count and total crosses, and it shows no "Total crosses walked" line

### Requirement: MAT-05 Reading order
The page SHALL present the analysis in this order: the controls (swap where shown, change
sire, change dam); the litter bracket; the COI and AVK; the warnings; the line-breeding
notes; and the common-ancestor table.

#### Scenario: MAT-05.1 Bracket before the numbers
- **WHEN** the analysis renders with scripting enabled
- **THEN** the bracket headed "Planned litter, four generations" follows the controls and precedes the COI, and the common-ancestor table comes after the notes

### Requirement: MAT-06 Numbers match the desktop
For the same source data, the litter COI, AVK, common-ancestor rows (crosses, notation,
Blood %), classification notes and warnings SHALL equal the desktop Hypothetical Mating
output at displayed precision. A disagreement is a defect, not a variant.

#### Scenario: MAT-06.1 Line-bred fixture
- **WHEN** the web analysis and the vendored desktop analysis are run on the same synthetic line-bred pedigree
- **THEN** the litter COI agrees within 1e-9 (as a fraction) and every other field is identical, using the same compute module the browser bundle is built from

#### Scenario: MAT-06.2 Pedigree with a cycle
- **WHEN** the source data contains a dog within its own ancestry
- **THEN** the cycle edge is treated as unrecorded, as in the reports, the page says which edge was broken, and the page still renders

### Requirement: MAT-07 Line-breeding notes are never claims
Classification output SHALL be presented as notes graded `match` or `possible`, exactly as
the desktop grades them. Methods the desktop does not assert (Oppenheimer, clan/quad,
three-line rotation) SHALL NOT be shown as matches.

#### Scenario: MAT-07.1 Half-sibling cross
- **WHEN** the chosen dam and sire share exactly one parent
- **THEN** the page shows the "Half-sibling cross" note graded `match`, naming the shared parent

### Requirement: MAT-08 Checks warn and never block
Sex, breeding-age and recessive-DNA checks SHALL be shown as warnings and SHALL NOT prevent
the analysis from rendering. Ages SHALL be computed as of the request date (UTC), and the
page SHALL state that date. A missing sex, date of birth or DNA result SHALL raise no warning.

#### Scenario: MAT-08.1 Both parents carriers
- **WHEN** both parents have a published `PRA-rcd4-C2orf71` result that reads as Carrier
- **THEN** the page warns that about 25% of the litter could be Affected, and still shows the full analysis

#### Scenario: MAT-08.2 Two males chosen
- **WHEN** the dog given as `dam` is recorded as male
- **THEN** the page shows a sex-mismatch warning and still renders the analysis

### Requirement: MAT-09 Litter bracket
With scripting enabled, the page SHALL draw a four-generation bracket of the planned litter
(parents, then three generations behind each), with the dog-page bracket's template, cell
content and repeated-ancestor shading, headed "Planned litter, four generations" (its place
on the page: MAT-05). The litter itself SHALL NOT be a link. Cells with no record SHALL be
blank, and ancestors without a page SHALL be plain text.

#### Scenario: MAT-09.1 Shared grandparent
- **WHEN** the sire and dam have a parent in common
- **THEN** that ancestor appears on both halves of the bracket and both cells carry the repeated-ancestor shading

### Requirement: MAT-10 Plan a mating link — moved to DOG-23
Retired, ID kept. The dog page's "Plan a mating" link SHALL be specified once, in DOG-23
of the `dog-page` capability; this capability specifies only
what `/mating` does with the parent the link fills.

#### Scenario: MAT-10.1 Arriving from a bitch's page
- **WHEN** a visitor arrives at `/mating?dam=<her slug>` by the link DOG-23 specifies
- **THEN** the page shows her as the dam and a search box for the sire

### Requirement: MAT-11 Parent search without JavaScript
With a parent missing, the page SHALL show a GET name search for it, with server-rendered
results linking to the completed URL. Swap, replace and depth controls SHALL be plain links
or GET forms.

#### Scenario: MAT-11.1 Picking the sire from results
- **WHEN** the visitor searches for a sire by name with scripting disabled
- **THEN** each result is a link to `/mating?sire=<result>&dam=<her slug>`, and following it shows the analysis

#### Scenario: MAT-11.2 Same dog twice
- **WHEN** the same slug is given as both sire and dam
- **THEN** the page explains that the two parents must differ and offers the search for the other parent, without computing an analysis

### Requirement: MAT-12 Swap only on a sex mismatch
The swap control SHALL be shown only when the sire is not recorded as male or the dam is
not recorded as female (unknown sex counts as not matching); otherwise only "Change sire"
and "Change dam" are offered.

#### Scenario: MAT-12.1 Correctly sexed pair
- **WHEN** the sire is recorded as male and the dam as female
- **THEN** the controls show "Change sire" and "Change dam" and no swap link

#### Scenario: MAT-12.2 Parent of unknown or wrong sex
- **WHEN** either parent's sex is unrecorded, or the dog given as `dam` is recorded as male (or the `sire` as female)
- **THEN** the controls also show the swap link

### Requirement: MAT-13 Public but not indexed
Mating pages SHALL be public, SHALL carry `noindex, follow`, SHALL be disallowed for `/mating`
in `robots.txt`, and every link to them SHALL carry `rel="nofollow"`. They SHALL NOT appear in
the sitemap.

#### Scenario: MAT-13.1 Crawler reads robots.txt
- **WHEN** `robots.txt` is fetched
- **THEN** it contains `Disallow: /mating`

### Requirement: MAT-14 Analysis runs in the browser
The server SHALL NOT parse, combine or walk pedigree data for `/mating`. The Function SHALL
embed both parents' stored mating objects byte-for-byte as `<script type="application/json">`
data blocks, together with the request's UTC date, and a static script SHALL compute and
render the analysis from them. The script SHALL be built from the vendored modules on every
build and SHALL NOT fetch anything.

#### Scenario: MAT-14.1 Server does not parse the objects
- **WHEN** a valid mating page is served
- **THEN** the two data blocks are byte-identical to the stored R2 objects for the two parents

#### Scenario: MAT-14.2 Script makes no requests
- **WHEN** the analysis renders in a browser
- **THEN** the only network requests are for the page and its static assets

### Requirement: MAT-15 Page without JavaScript
With scripting disabled, the page SHALL still show both parents (linked), the depth,
swap and change controls, and the note "The analysis is calculated in your browser and needs
JavaScript." It SHALL NOT show a partial or empty analysis. Dog pages, report pages, the home
page and search SHALL remain complete without scripts.

#### Scenario: MAT-15.1 Scripting off
- **WHEN** a visitor opens a valid mating URL with scripting disabled
- **THEN** the page shows both parents, the controls and the JavaScript note, and no COI, common-ancestor list or bracket

### Requirement: MAT-16 Script policy scoped to the mating page
Responses for `/mating` SHALL carry the site CSP with `script-src 'self'` in place of
`script-src 'none'`, and SHALL keep `default-src 'none'` so `connect-src` stays closed. Every
other response SHALL keep `script-src 'none'`.

#### Scenario: MAT-16.1 Mating page header
- **WHEN** `/mating?sire=a&dam=b` is requested
- **THEN** its `content-security-policy` contains `script-src 'self'` and `default-src 'none'`, and no `connect-src` source

#### Scenario: MAT-16.2 Other pages unchanged
- **WHEN** a dog page, a report page, `/search` or the home page is requested
- **THEN** its `content-security-policy` contains `script-src 'none'`

### Requirement: MAT-17 Embedded data cannot break the page
Mating objects SHALL be stored with `<`, `>`, U+2028 and U+2029 escaped as `\u` sequences,
so that embedding them verbatim can never close their `<script>` block. The browser SHALL
escape every value it renders.

#### Scenario: MAT-17.1 Name containing a closing tag
- **WHEN** an ancestor's name contains `</script>`
- **THEN** the stored object contains `\u003c/script\u003e`, the page structure is intact, and the name renders as text

### Requirement: MAT-18 Free-tier request budget
Serving a mating page with two valid canonical slugs SHALL cost one Function invocation, at
most one D1 query (plus one redirect lookup per parent only on a miss) and at most two R2
reads, with no pedigree computation on the server. The analysis for the most demanding pair
SHALL stay within the compute-time and page-size budgets set for it.

#### Scenario: MAT-18.1 Most demanding pair
- **WHEN** the two dogs with the largest mating objects are paired at depth 10
- **THEN** the page size and the measured compute time stay within those budgets, and the server issues no reads beyond the budget

#### Scenario: MAT-18.2 Search for the missing parent
- **WHEN** a name search is made from the mating page
- **THEN** it uses the same indexed D1 query as `/search`, with the same minimum-length refusal and paging limits

### Requirement: MAT-19 Published data only
A mating object SHALL contain only fields already on the public whitelist. An analysis and
its printout SHALL contain no photograph. The master database SHALL remain byte-identical
after a publish that writes mating objects.

#### Scenario: MAT-19.1 Excluded field in source
- **WHEN** a source dog has `Owner` and `Microchip` values
- **THEN** neither value appears in that dog's mating object nor in any mating page

#### Scenario: MAT-19.2 Printing
- **WHEN** a visitor prints a mating page
- **THEN** the printout contains the analysis and bracket without the search and navigation controls, and no image of a dog

### Requirement: MAT-20 Incremental publish of mating objects
Mating objects SHALL be content-hashed and written only when their content changes. A
republish from an unchanged master SHALL write zero mating objects.

#### Scenario: MAT-20.1 Second run on unchanged master
- **WHEN** the publish is run twice in a row on the same master
- **THEN** the second run reports 0 mating objects written
