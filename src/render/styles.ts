/**
 * The stylesheet, as one string written to `/assets/site.css` by the build.
 *
 * One file, no build step, no framework. The pages are documents: a registry entry should
 * read like a reference work, not like a product page. Three things it must do beyond
 * looking tidy — all of them requirements, not taste:
 *
 *  - **Work with no JavaScript at all** (PRD R-2.8). Nothing here depends on a script;
 *    the bracket is laid out with flexbox, not measured and positioned.
 *  - **Survive a narrow screen.** A five-generation bracket is 63 boxes wide by design, so
 *    it scrolls inside its own box rather than making the page scroll sideways.
 *  - **Print.** Breeders print pedigrees. The print rules drop the furniture and keep the
 *    bracket.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

const BASE_CSS = `
:root {
  --ink: #1a1a1a;
  --ink-soft: #5b5b5b;
  --ink-faint: #8a8a8a;
  --paper: #ffffff;
  --paper-soft: #f6f5f3;
  --rule: #d9d6d0;
  --accent: #1f5c8b;
  --accent-soft: #eaf1f7;
  --radius: 3px;
}

* { box-sizing: border-box; }

/* One appearance for everyone, light, whatever the reader's system is set to (owner
   instruction, 2026-08-28). A registry should look the same to everybody, and the page
   people print is the page they saw. color-scheme: light also keeps form controls —
   the search box — from being drawn dark by a dark-mode browser. */
html { color-scheme: light; background: #fff; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  -webkit-text-size-adjust: 100%;
}

a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }
a:hover { text-decoration-thickness: 2px; }

.wrap { max-width: 1100px; margin: 0 auto; padding: 0 20px; }

/* ---- header ------------------------------------------------------------- */
.site-head {
  border-bottom: 1px solid var(--rule);
  background: var(--paper-soft);
  padding: 14px 0;
}
.site-head .wrap { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; }
.site-name { font-weight: 600; font-size: 15px; text-decoration: none; color: var(--ink); }
.site-search { margin-left: auto; display: flex; gap: 6px; }
.site-search input {
  font: inherit; font-size: 14px; padding: 6px 10px; min-width: 15rem;
  border: 1px solid var(--rule); border-radius: var(--radius);
  background: var(--paper); color: var(--ink);
}
.site-search button {
  font: inherit; font-size: 14px; padding: 6px 14px; cursor: pointer;
  border: 1px solid var(--rule); border-radius: var(--radius);
  background: var(--paper); color: var(--ink);
}

.crumbs { font-size: 13px; color: var(--ink-soft); padding: 12px 0 0; }
.crumbs ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
.crumbs li:not(:last-child)::after { content: " ›"; color: var(--ink-faint); }

/* ---- subject card ------------------------------------------------------- */
.subject { padding: 18px 0 26px; border-bottom: 1px solid var(--rule); }
.subject h1 { font-size: 30px; line-height: 1.2; margin: 6px 0 4px; font-weight: 650; }
.titles { font-size: 14px; color: var(--ink-soft); letter-spacing: .02em; }
.subject-body { display: flex; gap: 26px; align-items: flex-start; flex-wrap: wrap; }
.subject-photo img { max-width: 220px; height: auto; border-radius: var(--radius); border: 1px solid var(--rule); }
.subject-photo figcaption { font-size: 12px; color: var(--ink-faint); margin-top: 4px; max-width: 220px; }

dl.facts { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 14px 0 0; font-size: 15px; }
dl.facts dt { color: var(--ink-faint); }
dl.facts dd { margin: 0; }
`;

const BRACKET_CSS = `
/* ---- pedigree bracket ---------------------------------------------------
   The desktop application's chart, on the web: a FILLED TABLE with coloured
   fill and grid borders, not boxes with connector lines. That is the one
   deliberate departure from BreedMate's look, decided for the desktop on
   2026-08-01, and the web follows the desktop so the same pedigree reads the
   same way in both.

   CSS Grid with explicit row spans, all computed server-side: nothing is
   measured in the browser, so the chart is identical with scripting off. Row
   height is fixed and columns are as wide as their own widest line, which is
   why depth costs horizontal scrolling and never legibility. */
.bracket-scroll { overflow-x: auto; padding-bottom: 10px; }
.bracket {
  --row-h: 34px;
  display: grid;
  gap: 1px;
  background: var(--rule);
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  width: max-content;
  min-width: 100%;
}
.gen-head {
  background: var(--paper-soft);
  font-size: 11px; text-transform: uppercase; letter-spacing: .07em;
  color: var(--ink-faint); padding: 6px 8px; white-space: nowrap;
}

.cell {
  background: var(--paper);
  display: flex; flex-direction: column; justify-content: center;
  padding: 3px 8px; overflow: hidden; text-decoration: none; color: inherit;
  border-left: 2px solid transparent;
}
a.cell:hover { border-left-color: var(--accent); }
/* Names are never truncated. Where the desktop keeps them on one line and lets the
   window scroll sideways, the web wraps them instead: a page that fits is worth more
   here than a chart that matches the desktop to the pixel, and nothing is lost either
   way. Columns are capped so five of them fit a normal window. */
.cell .nm {
  font-size: 12.5px; font-weight: 600; line-height: 1.22;
  overflow-wrap: anywhere;
}
.cell .tt { font-size: 10.5px; color: var(--ink-faint); white-space: nowrap; letter-spacing: .02em; }
.cell .dt { font-size: 10.5px; color: var(--ink-soft); white-space: nowrap; }
/* An unfilled position is blank, not shaded: same ground as every other cell, so the
   chart reads as a form with empty boxes rather than as greyed-out content. The 1px grid
   gaps still show where the box is. */
.cell.empty { background: var(--paper); }
/* An ancestor named on a parent's record but with no record of its own (R-2.3). */
.cell.name-only .nm { font-weight: 500; color: var(--ink-soft); }
.cell.loop { outline: 1px dashed var(--ink-faint); outline-offset: -3px; }
.cell .loop-note { font-style: italic; }

/* Repeated ancestors: pastel violet, one hue each, saturation by share of the
   blood. The formula is the desktop's, so a doubled-up dog is the same colour
   in both applications. No red, no badges, no letter labels. */
.cell.repeat { background: hsl(var(--h) calc(38% + var(--n) * 6%) calc(92% - var(--n) * 17%)); }
.cell.repeat .nm, .cell.repeat .dt, .cell.repeat .tt { color: #241d33; }
`;

const SECTION_CSS = `
/* ---- sections ----------------------------------------------------------- */
section { padding: 26px 0; border-bottom: 1px solid var(--rule); }
section > h2 { font-size: 18px; margin: 0 0 4px; font-weight: 600; }
section > .note { font-size: 13px; color: var(--ink-faint); margin: 0 0 14px; }

.litter { margin: 0 0 18px; }
.litter h3 { font-size: 14px; font-weight: 600; margin: 0 0 6px; color: var(--ink-soft); }
ul.dogs { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px 20px;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); font-size: 15px; }
ul.dogs li { padding: 2px 0; }
ul.dogs .when { color: var(--ink-faint); font-size: 13px; }

ul.chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; }
ul.chips li a, ul.chips li span {
  display: inline-block; padding: 4px 10px; font-size: 13px;
  border: 1px solid var(--rule); border-radius: 999px; background: var(--paper-soft);
  text-decoration: none; color: var(--ink);
}
.banner { padding: 22px 0; }
.banner img { display: block; width: 100%; height: auto; border-radius: var(--radius); }
@media print { .banner { display: none; } }

/* A list that reads as prose: same voice as .note, but each item is its own thing. */
ul.plain { list-style: none; margin: 0 0 14px; padding: 0; font-size: 13px; color: var(--ink-faint); }
ul.plain li { margin: 0 0 8px; }

.pager { display: flex; align-items: center; gap: 18px; margin: 20px 0 0; font-size: 14px; }
.pager span { color: var(--ink-faint); }
.pager .pager-where { margin-left: auto; margin-right: auto; }

table.dna { border-collapse: collapse; font-size: 15px; }
table.dna th, table.dna td { text-align: left; padding: 4px 22px 4px 0; border-bottom: 1px solid var(--rule); }
table.dna th { font-weight: 500; color: var(--ink-faint); }
`;

const FOOT_CSS = `
/* ---- footer ------------------------------------------------------------- */
.site-foot { padding: 26px 0 50px; font-size: 13px; color: var(--ink-soft); }
.site-foot p { margin: 0 0 8px; }
.site-foot .fine { color: var(--ink-faint); }
`;

const PRINT_CSS = `
/* ---- print --------------------------------------------------------------
   Breeders print pedigrees. Drop the furniture, keep the chart, and never
   print a photograph: MVP limitation L-5 / R-7.3 keeps images on the page
   and out of anything that leaves the site. */
@media print {
  /* The screen palette is already light, so print only darkens the ink a little for
     paper and keeps the ancestor tints, which are the one colour carrying meaning. */
  :root { --ink: #111; --ink-soft: #444; --ink-faint: #666; --rule: #bbb; }
  @page { size: A4 landscape; margin: 12mm; }
  body { background: #fff; color: #111; }
  .bracket { --row-h: 26px; }
  .cell .nm { font-size: 9pt; }
  .cell .tt, .cell .dt { font-size: 7.5pt; }
  .site-head, .site-search, .crumbs, .site-foot .fine { display: none; }
  .subject-photo, figure.photo { display: none !important; }
  body { font-size: 11pt; }
  .bracket-scroll { overflow: visible; }
  .bracket { min-width: 0; width: 100%; }
  .cell { border-left: 0; }
  section { break-inside: avoid; border-bottom: 0; }
  a { color: inherit; text-decoration: none; }
}
`;

/** The whole stylesheet, written once to `/assets/site.css`. */
export const SITE_CSS = [BASE_CSS, BRACKET_CSS, SECTION_CSS, FOOT_CSS, PRINT_CSS].join('\n');
