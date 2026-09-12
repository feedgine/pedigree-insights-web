/**
 * The two report pages a dog page links to — Linebreeding and Foundation — assembled from
 * the report payload (`reports.ts`) and nothing else.
 *
 * They are the desktop application's reports on the web, and the columns, the ordering
 * and the footnote follow the desktop so a breeder who knows one reads the other. Three
 * things are deliberately different, each for a reason the page cannot avoid:
 *
 *  - **One depth, no controls.** The desktop lets the user pick the generations and the
 *    minimum crosses; a page with no JavaScript (R-2.8) shows one report. Twenty
 *    generations, two crosses — the constants in `publish/constants.ts`.
 *  - **Crosses as counts.** The desktop prints every occurrence (`3S x 5D x 5D`). At
 *    twenty generations an ancestor can appear thousands of times, so the same
 *    information is printed per generation with a multiplier: `3S · 5D×2`.
 *  - **No COR and no per-ancestor COI column.** COR needs the genetics engine at publish,
 *    which is not run yet; the ancestors' own COI was dropped on the owner's instruction
 *    (2026-09-11) — the subject's full-depth COI in the header is the figure that matters.
 *
 * Both pages are `noindex, follow`: they are derived from the dog page and would compete
 * with it in search for the same name.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import {
  rowStats,
  type DogReports,
  type FoundationRow,
  type LinebreedingRow,
} from '../publish/reportModel';
import { FOUNDATION_DOGS } from '../publish/foundationDogs';
import { esc, lines } from './escape';
import { renderPage, type PageMeta } from './layout';
import { SITE, reportUrl, type ReportKind, type SiteConfig } from './site';
import type { HasPage } from './dogPage';

const pct = (fraction: number, digits = 2): string => `${(fraction * 100).toFixed(digits)}%`;

/** A dog's name: a link where its page exists, plain text where it does not. */
function nameLink(name: string, slug: string | null, hasPage: HasPage): string {
  return slug != null && hasPage(slug)
    ? `<a href="/dog/${esc(slug)}">${esc(name)}</a>`
    : `<span>${esc(name)}</span>`;
}

/**
 * The desktop's cross notation, compressed: generation + subject side, the letter's case
 * carrying the ancestor's sex (male or unknown upper, female lower), one token per
 * generation and side with a multiplier where the count is more than one.
 */
export function crossNotation(row: LinebreedingRow): string {
  const letter = (side: 'S' | 'D') => (row.sex === 'F' ? side.toLowerCase() : side);
  const tokens: string[] = [];
  for (const [gen, s, d] of row.occ) {
    if (s > 0) tokens.push(`${gen}${letter('S')}${s > 1 ? `×${s}` : ''}`);
    if (d > 0) tokens.push(`${gen}${letter('D')}${d > 1 ? `×${d}` : ''}`);
  }
  return tokens.join(' · ');
}

/** The small strip that joins the dog page and its two reports. */
function reportNav(r: DogReports, current: ReportKind): string {
  const item = (kind: ReportKind, label: string) =>
    kind === current
      ? `<li><span aria-current="page">${label}</span></li>`
      : `<li><a href="/dog/${esc(r.slug)}/${kind}">${label}</a></li>`;
  return lines(
    '<nav class="report-nav" aria-label="Reports">',
    '<ul>',
    `<li><a href="/dog/${esc(r.slug)}">Dog page</a></li>`,
    item('linebreeding', 'Linebreeding'),
    item('foundation', 'Foundation dogs'),
    '</ul>',
    '</nav>',
  );
}

/** The heading block both pages share: titles, name, the report's name. */
function reportHead(r: DogReports, subtitle: string): string {
  const s = r.subject;
  return lines(
    '<div class="subject report-subject">',
    s.preTitle ? `<p class="titles">${esc(s.preTitle)}</p>` : '',
    `<h1>${esc(r.name)}</h1>`,
    s.postTitle ? `<p class="titles">${esc(s.postTitle)}</p>` : '',
    `<p class="report-kind">${subtitle}</p>`,
    '</div>',
  );
}

/** The desktop's cycle warning: a dog within its own ancestry is a data error. */
function cycleWarning(r: DogReports): string {
  if (!r.cycles || r.cycles.length === 0) return '';
  const n = r.cycles.length;
  return lines(
    '<div class="report-warn" role="alert">',
    `<p><strong>${n} pedigree cycle${n === 1 ? '' : 's'} detected</strong> — a dog appears in its ` +
      'own ancestry, which is a data error. The closing edge was read as unrecorded so the ' +
      'report could be computed; please send a correction.</p>',
    '<ul>',
    r.cycles
      .map(
        (c) =>
          `<li><strong>${esc(c.child)}</strong> — ${esc(c.relation)} = ${esc(c.parent)} (already an ancestor)</li>`,
      )
      .join(''),
    '</ul>',
    '</div>',
  );
}

function crumbs(r: DogReports, label: string) {
  return [{ label: 'Home', href: '/' }, { label: r.name, href: `/dog/${r.slug}` }, { label }];
}

// ---------------------------------------------------------------------------------------
// Linebreeding
// ---------------------------------------------------------------------------------------

function linebreedingRow(a: LinebreedingRow, generations: number, hasPage: HasPage): string {
  const s = rowStats(a, generations);
  const sex = a.sex === 'M' ? 'M' : a.sex === 'F' ? 'F' : 'U';
  return (
    '<tr>' +
    `<td class="name"><span class="sex sex-${sex}" aria-hidden="true"></span>${nameLink(a.name, a.slug, hasPage)}` +
    (s.inFinal ? ' <span class="final" title="Appears in the final generation of the report">*</span>' : '') +
    '</td>' +
    `<td class="crosses">${esc(crossNotation(a))}</td>` +
    `<td class="num">${s.crosses}</td>` +
    `<td class="num">${s.crosses} <span class="split">(${s.sireLines})(${s.damLines})</span></td>` +
    `<td class="num">${pct(s.blood)}</td>` +
    `<td class="num">${esc(s.influence)}</td>` +
    '</tr>'
  );
}

export function linebreedingTitle(r: DogReports): string {
  return `${r.name} — linebreeding, ${r.linebreeding.generations} generations`;
}

export function renderLinebreedingPage(
  r: DogReports,
  site: SiteConfig = SITE,
  hasPage: HasPage = () => true,
  publishedAt?: string,
): string {
  const lb = r.linebreeding;

  const meta: PageMeta = {
    title: linebreedingTitle(r),
    description:
      `Repeated ancestors of ${r.name} within ${lb.generations} generations: crosses, ` +
      'lines, blood contribution and influence.',
    canonical: reportUrl(site, r.slug, 'linebreeding'),
    noindex: true,
    publishedAt,
    crumbs: crumbs(r, 'Linebreeding'),
  };

  // Ancestor positions across g generations: 2 + 4 + … + 2^g = 2^(g+1) − 2 — the desktop's
  // denominator (corrected there on 2026-06-27), shown as the desktop shows it.
  const slots = 2 ** (lb.generations + 1) - 2;
  const uniquePct = ((lb.uniqueAncestors / slots) * 100).toFixed(2);
  const stats = lines(
    '<ul class="report-stats">',
    // The same label as the dog page: the stored COI is the full-depth value (measured).
    r.subject.coi == null
      ? ''
      : `<li>Inbreeding coefficient (full-depth value): <strong>${pct(r.subject.coi)}</strong></li>`,
    `<li>Unique ancestors in ${lb.generations} generations (${lb.uniqueAncestors} / ${slots}) = <strong>${uniquePct}%</strong></li>`,
    `<li>Total crosses walked (incl. repeats): <strong>${lb.totalCrosses}</strong></li>`,
    lb.reached < lb.generations && lb.reached > 0
      ? `<li>The recorded pedigree runs out after ${lb.reached} generation${lb.reached === 1 ? '' : 's'}.</li>`
      : '',
    '</ul>',
  );

  const table =
    lb.ancestors.length === 0
      ? `<p class="empty">No ancestor appears at least ${lb.minCrosses} times within ${lb.generations} generations.</p>`
      : lines(
          `<p class="report-count">Min crosses: ${lb.minCrosses} · ${lb.ancestors.length} repeated ancestor${lb.ancestors.length === 1 ? '' : 's'}</p>`,
          '<div class="table-scroll">',
          '<table class="report">',
          '<thead><tr>',
          '<th class="name">Name</th>',
          '<th class="crosses" title="Generation and side of each appearance: S = sire side, D = dam side; lower case = female. ×n = that many appearances at that generation and side">Crosses</th>',
          '<th class="num">#</th>',
          '<th class="num" title="Total (sire side)(dam side)">Lines</th>',
          '<th class="num" title="Percent of blood: the ancestor\'s contribution to the subject, ½ per generation summed over every cross (Wright). Rows are ranked by this">Blood %</th>',
          '<th class="num" title="The equivalent cross pair (n×n or n×(n+1)) representing the blood contribution; < 7x7 below that floor">Influence</th>',
          '</tr></thead>',
          '<tbody>',
          lb.ancestors.map((a) => linebreedingRow(a, lb.generations, hasPage)).join('\n'),
          '</tbody>',
          '</table>',
          '</div>',
        );

  const note =
    '<p class="note">Crosses, Lines, Blood % and Influence are structural. Blood % (Percent ' +
    "of Blood / Genetic Contribution Coefficient) is Wright's ½^generation contribution " +
    'summed over every cross, and Influence is its equivalent-cross restatement; rows are ' +
    'ranked by Blood % to surface top influencers. An asterisk marks an ancestor that ' +
    `also appears in the final (${lb.generations}th) generation, where the walk stops.</p>`;

  const body = lines(
    reportHead(r, `Linebreeding statistics, ${lb.generations} generations`),
    reportNav(r, 'linebreeding'),
    '<section id="linebreeding">',
    stats,
    cycleWarning(r),
    table,
    note,
    '</section>',
  );

  return renderPage(meta, body, site);
}

// ---------------------------------------------------------------------------------------
// Foundation
// ---------------------------------------------------------------------------------------

export function foundationTitle(r: DogReports): string {
  return `${r.name} — foundation dogs in the pedigree`;
}

export function renderFoundationPage(
  r: DogReports,
  site: SiteConfig = SITE,
  hasPage: HasPage = () => true,
  publishedAt?: string,
  foundationDogs: readonly string[] = FOUNDATION_DOGS,
): string {
  const f = r.foundation;
  const present = new Map<string, FoundationRow>(f.rows.map((row) => [row.name.trim().toLowerCase(), row]));
  // The list is the site's; the report stores only who is present. Absent founders are
  // listed after the present ones, by name, as the desktop does.
  const absent = foundationDogs
    .filter((name) => !present.has(name.trim().toLowerCase()))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const total = foundationDogs.length;
  const share = total > 0 ? ((f.rows.length / total) * 100).toFixed(0) : '0';
  const combined = f.rows.reduce((s, row) => s + row.contribution, 0);

  const meta: PageMeta = {
    title: foundationTitle(r),
    description:
      `Which of the ${total} foundation dogs appear in the pedigree of ${r.name}, how close, ` +
      'how often, and how much of the blood each contributes.',
    canonical: reportUrl(site, r.slug, 'foundation'),
    noindex: true,
    publishedAt,
    crumbs: crumbs(r, 'Foundation dogs'),
  };

  const stats = lines(
    '<ul class="report-stats">',
    `<li><strong>${f.rows.length}</strong> of ${total} foundation dogs present in the pedigree (${share}%)` +
      (f.generations > 0 ? `, traced over ${f.generations} generation${f.generations === 1 ? '' : 's'}` : '') +
      '.</li>',
    f.rows.length > 0
      ? `<li>Combined contribution of the foundation dogs present: <strong>${pct(combined)}</strong> ` +
        '<span class="split">(founders descended from one another overlap, so this can exceed their distinct share)</span></li>'
      : '',
    '</ul>',
  );

  const rows = [
    ...f.rows.map(
      (row) =>
        '<tr>' +
        `<td class="name">${nameLink(row.name, row.slug, hasPage)}</td>` +
        '<td class="num">✓</td>' +
        `<td class="num">${row.closest}</td>` +
        `<td class="num">${row.crosses}</td>` +
        `<td class="num">${pct(row.contribution)}</td>` +
        '</tr>',
    ),
    ...absent.map(
      (name) =>
        '<tr class="absent">' +
        `<td class="name">${esc(name)}</td>` +
        '<td class="num">—</td><td class="num">—</td><td class="num">—</td><td class="num">—</td>' +
        '</tr>',
    ),
  ];

  const table = lines(
    '<div class="table-scroll">',
    '<table class="report">',
    '<thead><tr>',
    '<th class="name">Foundation dog</th>',
    '<th class="num">Present</th>',
    '<th class="num" title="Closest generation of appearance (1 = a parent)">Closest</th>',
    '<th class="num" title="Occurrence paths within 20 generations">Crosses</th>',
    '<th class="num" title="Wright\'s blood contribution over every generation — a computed estimate">Contribution</th>',
    '</tr></thead>',
    '<tbody>',
    rows.join('\n'),
    '</tbody>',
    '</table>',
    '</div>',
  );

  const note =
    `<p class="note">The foundation dogs are the ${total} Japanese exports that founded the ` +
    "breed outside Japan, as listed by the Foundation. Contribution % is Wright's genetic " +
    'blood contribution (½ per generation, summed over every path), computed across all ' +
    'generations. It is a computed estimate — distinct from the externally-validated COI.</p>';

  const body = lines(
    reportHead(r, 'Foundation dogs in the pedigree'),
    reportNav(r, 'foundation'),
    '<section id="foundation">',
    stats,
    cycleWarning(r),
    table,
    note,
    '</section>',
  );

  return renderPage(meta, body, site);
}

/** Render whichever report a URL names. */
export function renderReportPage(
  kind: ReportKind,
  r: DogReports,
  site: SiteConfig = SITE,
  hasPage: HasPage = () => true,
  publishedAt?: string,
): string {
  return kind === 'linebreeding'
    ? renderLinebreedingPage(r, site, hasPage, publishedAt)
    : renderFoundationPage(r, site, hasPage, publishedAt);
}
