# Dog page specification

What a `/dog/<slug>` page shows and how it behaves. Each requirement and scenario has a
permanent ID (`DOG-07`, `DOG-07.1`); code and later changes cite these IDs. IDs are never
reused or renumbered.

`[DRAFT — requires Yuliya's review]`

## Purpose

Defines what a dog page at `/dog/<slug>` shows and how it behaves. The page is rendered
from one stored payload by the same template whether it is served as a static file or by
a Function. This is the baseline of current behaviour, as of 2026-10-22.

## Requirements

### Requirement: DOG-01 Section order
The page body SHALL present, in this order: the subject card, the pedigree bracket
(followed by the report links, then the "Plan a mating" link), offspring, full siblings,
and the context strip. A section with no content SHALL be left out entirely, leaving no
heading or gap. What the "Plan a mating" link does is DOG-23.

#### Scenario: DOG-01.1 Dog with offspring and siblings
- **WHEN** a payload has offspring, full siblings and DNA results
- **THEN** the sections appear as subject card, `#pedigree`, `#offspring`, `#siblings`, `#context`, in that order

#### Scenario: DOG-01.2 Founder with nothing but a name
- **WHEN** a payload has no offspring, no siblings, no kennel, birth year, country or DNA
- **THEN** the page has the subject card and the pedigree section only, and no `#offspring`, `#siblings` or `#context` element

### Requirement: DOG-02 Page shell
Every dog page SHALL have a header with the site name linked to `/`, a GET search form to
`/search` (field `q`, with a visually hidden label), a breadcrumb, and a footer. The
footer SHALL state the data's source and publisher, link the data licence with
`rel="license"`, link the correction form and the correction e-mail, state the last
publish date as a long date, and link the privacy policy.

#### Scenario: DOG-02.1 Footer contents
- **WHEN** any dog page is rendered
- **THEN** the footer contains links to `site.correctionFormUrl`, `mailto:` + `site.correctionEmail`, `site.privacyPolicyUrl` and `site.dataLicenceUrl`, and the text "Data last published <d Month yyyy>"

#### Scenario: DOG-02.2 Searching from a dog page
- **WHEN** a visitor submits the header search with scripting disabled
- **THEN** the browser issues `GET /search?q=<text>`

### Requirement: DOG-03 Breadcrumb
The breadcrumb SHALL read Home › kennel › dog name. Home links to `/`. The dog name is the
current page and is not linked. The kennel crumb SHALL appear only when the dog has a
breeder with a slug, and SHALL be a link to `/kennel/<slug>` only while the kennel hub flag
is on. Otherwise it is a label.

#### Scenario: DOG-03.1 Kennel hub not built
- **WHEN** the dog has a breeder and `site.hubs.kennel` is false
- **THEN** the breadcrumb shows the breeder as an unlinked item between Home and the dog's name

#### Scenario: DOG-03.2 No breeder
- **WHEN** the dog has no breeder
- **THEN** the breadcrumb is Home › dog name

### Requirement: DOG-04 Subject card
The card SHALL show the pre-title above the `<h1>` name and the post-title below it,
followed by a facts list in this order: Born, Died, Sex, Registration, Registry, Breeder,
Country of origin, Other name, and "Inbreeding coefficient (full-depth value)". Colour and
variety SHALL NOT be shown. A date stored as ISO (`YYYY-MM-DD…`) SHALL be shown as
`DD-Mon-YYYY`; any other stored value SHALL be shown as stored. Sex SHALL be shown as
"male" or "female".

#### Scenario: DOG-04.1 COI shown as a percentage
- **WHEN** the stored COI is 0.0625
- **THEN** the facts list shows "Inbreeding coefficient (full-depth value)" with the value `6.25%`

#### Scenario: DOG-04.2 Call name
- **WHEN** the dog has a call name
- **THEN** it appears under the label "Other name"

### Requirement: DOG-05 Photograph on the card
Where the payload carries a photograph file name, the card SHALL show
`<img src="/photos/<file>">` with the dog's name as alt text, lazy-loaded, and the caption
"Photograph published by <publisher>; licensed separately from the data." With no
photograph, the card SHALL render normally with no figure.

#### Scenario: DOG-05.1 Dog without a photograph
- **WHEN** the payload has no `photo`
- **THEN** the card contains no `<figure>` and no `<img>`

#### Scenario: DOG-05.2 Dog with a photograph
- **WHEN** the payload has `photo: "x.jpg"`
- **THEN** the card contains a figure with `src="/photos/x.jpg"` and the credit caption

### Requirement: DOG-06 Bracket frame
The bracket SHALL always draw four generations of ancestors, or more if the payload holds
more. The columns are headed "Parents", "Grandparents", "Great-grandparents" and "2×
great-grandparents", with the sire line on top at every level. The dog SHALL NOT appear in
its own bracket. An unrecorded position SHALL be an empty cell with no text.

#### Scenario: DOG-06.1 Foundation import
- **WHEN** the payload's bracket holds only the subject
- **THEN** the chart draws 30 empty cells under the four headings

#### Scenario: DOG-06.2 Missing dam line
- **WHEN** the sire is recorded and the dam is not
- **THEN** the dam's position and the 14 positions behind it are empty cells, and the sire half is filled

### Requirement: DOG-07 Bracket cells
Each filled cell SHALL show the titles (pre and post, joined), then the name, then the
registration and date of birth joined by ` · `, the date formatted as in DOG-04 (ISO as
`DD-Mon-YYYY`, anything else as stored). The deepest column SHALL omit titles. An
ancestor with a record SHALL be a link to `/dog/<slug>`. An ancestor known only as a name
SHALL be plain text. A position that repeats an ancestor on its own path SHALL carry the
note "appears in its own ancestry".

#### Scenario: DOG-07.1 Name-only ancestor
- **WHEN** a bracket node has `slug: null`
- **THEN** the cell is a non-link element with class `name-only`

#### Scenario: DOG-07.2 Titles in the last column
- **WHEN** a 4th-generation ancestor has titles
- **THEN** its cell shows the name and the registration/date line, without the titles

### Requirement: DOG-08 Repeated ancestors tinted
An ancestor appearing more than once in the bracket SHALL be tinted with a pastel-violet
hue from a fixed list of eight, assigned in order of first appearance and repeating after
the eighth. Saturation scales with
its blood share (Σ 2⁻ᵍ over appearances), relative to the strongest repeat in that chart.
A linked repeated cell SHALL carry the title "Appears N times in this pedigree". An
ancestor appearing once SHALL NOT be tinted.

#### Scenario: DOG-08.1 Grandsire appears twice
- **WHEN** the same ancestor sits at two positions in the bracket
- **THEN** both cells have class `repeat` and the same `--h` hue, and the link title says "Appears 2 times in this pedigree"

#### Scenario: DOG-08.2 More than eight repeated ancestors
- **WHEN** a chart has nine or more repeated ancestors
- **THEN** the ninth reuses the first hue, in order of first appearance

### Requirement: DOG-09 Bracket column width
Each column SHALL be sized in `ch` to its longest line plus one, the longest line being
counted as at least 12 characters, so the narrowest column is `13ch`. The width SHALL be
capped at `28ch`. A line longer than the cap SHALL wrap inside its cell and SHALL never be
truncated. All layout SHALL be computed server-side, using inline grid positions.

#### Scenario: DOG-09.1 Very long name
- **WHEN** an ancestor's name is 40 characters long
- **THEN** its column is `28ch` wide and the full name appears in the HTML

### Requirement: DOG-10 Report links
Under the bracket, the page SHALL link to `/dog/<slug>/linebreeding`, labelled
"Linebreeding (20 generations)", and to `/dog/<slug>/foundation`, labelled "Foundation
dogs". The links SHALL be shown only when the bracket holds at least one node besides the
subject. This includes a parent known only as a name.

#### Scenario: DOG-10.1 Dog with no parent recorded
- **WHEN** the payload's bracket holds only the subject
- **THEN** no report links are rendered

#### Scenario: DOG-10.2 Parent known only by name
- **WHEN** the sire is a name with no record and the dam is absent
- **THEN** the report links are rendered

### Requirement: DOG-11 Offspring grouped by mate
When the dog has offspring, the page SHALL show "Offspring (N)", where N is the total
count, then one group per mate headed "with <mate> — <k> offspring". Each offspring is
listed with its date of birth. A mate with a page SHALL be a link. A missing mate SHALL
read "Dam or sire not recorded".

#### Scenario: DOG-11.1 Unknown mate
- **WHEN** an offspring group has no mate
- **THEN** its heading reads "with Dam or sire not recorded — <k> offspring"

### Requirement: DOG-12 Full siblings only
When the dog has siblings sharing both parents, the page SHALL show "Full siblings (N)"
listing them with dates of birth. Half siblings SHALL NOT be shown.

#### Scenario: DOG-12.1 Shares only a sire
- **WHEN** another dog shares the sire but not the dam
- **THEN** it does not appear in the siblings section

### Requirement: DOG-13 Context strip
The "Elsewhere in the database" section SHALL show chips "Bred by <kennel>", "Born
<year>" and "From <country>" where those facts exist, plus a table of DNA test name and
result, shown verbatim. Each chip, and the DNA "All dogs tested" link, SHALL be a link
only while its hub flag is on. Otherwise it is text and the DNA row's third cell is empty.

#### Scenario: DOG-13.1 All hub flags off
- **WHEN** `site.hubs` has every flag false and the dog has a kennel and a DNA result
- **THEN** the chips are `<span>` text, the DNA row has an empty third cell, and the section contains no `/kennel/`, `/year/`, `/country/` or `/dna/` link

### Requirement: DOG-14 Links only where pages exist
A link to another dog (bracket, offspring, siblings, mate) and every structured-data `@id`
reference SHALL be written only when that dog has a slug and its payload is part of the
publish being rendered. Which tier is written as files does not matter. Otherwise the name
SHALL be plain text, or `{ name }` in the structured data. In the Function tier every
slug counts as having a page.

#### Scenario: DOG-14.1 Static page linking to an unindexed ancestor
- **WHEN** the site is built with `--include indexed` and an ancestor's payload is in the extract but the ancestor is not indexed
- **THEN** that ancestor's cell is still a link to `/dog/<slug>`

#### Scenario: DOG-14.2 Payload missing from the extract
- **WHEN** an ancestor has a slug but no payload in the extract being rendered
- **THEN** that ancestor's cell is plain text and its JSON-LD reference is `{ "name": … }`

### Requirement: DOG-15 Absent fields are silent
Any field absent from the payload SHALL be omitted, with no placeholder text, no
"unknown" and no empty facts row in its place. This governs fields, not records: an
offspring group exists even when its other parent is not recorded, and DOG-11 names that
group rather than leaving it out.

#### Scenario: DOG-15.1 No date of birth
- **WHEN** the subject has no `dob`
- **THEN** the facts list has no "Born" row, and the meta description contains no "born"

### Requirement: DOG-16 No JavaScript
The page SHALL render completely without scripting. The only `<script>` element SHALL be
the `application/ld+json` data block.

#### Scenario: DOG-16.1 Script elements
- **WHEN** a dog page's HTML is inspected
- **THEN** it contains exactly one `<script>` and its type is `application/ld+json`

### Requirement: DOG-17 All text escaped
Every value from the payload SHALL be HTML-escaped (`& < > " '`) in content and attributes.
The JSON-LD block SHALL escape `<`, `>`, U+2028 and U+2029 so that no data can end the
block.

#### Scenario: DOG-17.1 Name with an apostrophe and ampersand
- **WHEN** a dog is named `O'Hara & Co`
- **THEN** the HTML contains `O&#39;Hara &amp; Co`, and the page structure is intact

### Requirement: DOG-18 Title and description
The `<title>` SHALL be `<name> — <breed> pedigree`, extended with "offspring" and/or
"DNA results" only when the dog has them. The meta description SHALL be one sentence:
name, accent-free variant if different, sex, breed, birth date, death date, registration,
breeder. That sentence SHALL NOT appear in the page body.

#### Scenario: DOG-18.1 Title for a producer with DNA
- **WHEN** a Japanese Spitz has offspring and DNA results
- **THEN** the title is `<name> — Japanese Spitz pedigree, offspring and DNA results`

#### Scenario: DOG-18.2 Accented name
- **WHEN** the name is `LUMIVYÖRYN X`
- **THEN** the description begins `LUMIVYÖRYN X (LUMIVYORYN X) is a`

### Requirement: DOG-19 Head metadata
The head SHALL declare a canonical URL `<origin>/dog/<slug>`, a JSON alternate
`<origin>/api/dog/<slug>.json`, a licence link, the favicons, and `/assets/site.css`. It
SHALL carry `noindex, follow` exactly when the payload is not indexed.

#### Scenario: DOG-19.1 Unindexed dog
- **WHEN** `payload.indexed` is false
- **THEN** the head contains `<meta name="robots" content="noindex, follow">`

#### Scenario: DOG-19.2 Indexed dog
- **WHEN** `payload.indexed` is true
- **THEN** the head contains no robots meta element

### Requirement: DOG-20 Structured data
The page SHALL emit one JSON-LD `@graph` containing a `WebPage` (with `BreadcrumbList`), an
`Organization` publisher, and the dog as a `Thing` with `additionalType` Wikidata Q144 and
`pdg:` properties. Absent values SHALL be dropped, not emitted empty. The breadcrumb SHALL
list a kennel only while the kennel hub is on.

#### Scenario: DOG-20.1 COI in structured data
- **WHEN** the stored COI is 0.0625
- **THEN** `pdg:inbreedingCoefficient` is `{ "@type": "QuantitativeValue", "value": 6.25, "unitText": "%" }` and `pdg:inbreedingCoefficientGenerations` is 20

#### Scenario: DOG-20.2 Sire without a record
- **WHEN** the sire is known only by name
- **THEN** `pdg:sire` is `{ "name": "<sire name>" }` with no `@id`

### Requirement: DOG-21 Print
When printed, the page SHALL be A4 landscape and SHALL hide the header, search,
breadcrumb, footer fine print, report links, the "Plan a mating" link and any photograph.
A four-generation bracket (`gens-4`) SHALL fit the page width; a deeper bracket SHALL keep
its screen column widths. Repeated-ancestor tints print only when the browser prints
background graphics.

#### Scenario: DOG-21.1 Dog with a photograph printed
- **WHEN** a page with a photograph is printed
- **THEN** the photograph figure is not printed and the bracket is

#### Scenario: DOG-21.2 Printing with background graphics off
- **WHEN** a page with repeated ancestors is printed with the browser's background graphics off
- **THEN** the bracket prints without tints, and the repeated cells look like any other cell

### Requirement: DOG-22 Same page in both tiers
The static file and the Function-rendered page for the same payload SHALL come from the
same render function, with all links enabled, and SHALL differ only in the publish date
source.

#### Scenario: DOG-22.1 Indexed vs unindexed render
- **WHEN** the same payload is rendered by the build and by the Function with the same publish date
- **THEN** the HTML is identical

### Requirement: DOG-23 Plan a mating link
Every dog page, founders included, SHALL carry a "Plan a mating" link with
`rel="nofollow"` that fills one parent with this dog: `/mating?dam=<slug>` if the dog is
recorded female, otherwise `/mating?sire=<slug>`, including when its sex is unknown.

#### Scenario: DOG-23.1 Bitch's page
- **WHEN** the dog is recorded female
- **THEN** the page has a `rel="nofollow"` link "Plan a mating" to `/mating?dam=<slug>`

#### Scenario: DOG-23.2 Dog's page, or sex unknown
- **WHEN** the dog is recorded male, or its sex is not recorded
- **THEN** the link goes to `/mating?sire=<slug>`

#### Scenario: DOG-23.3 Founder
- **WHEN** the payload's bracket holds only the subject
- **THEN** the link is still rendered, although the report links are not
