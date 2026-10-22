/**
 * The mating analysis as HTML — what the browser inserts into `#mating-analysis`.
 *
 * A pure function of the analysis and the two objects, returning a string: no DOM, so it
 * is tested like every other template here, and the page's only DOM code is the few
 * lines of `entry.ts`. The vocabulary is the report pages': the same stat list, warning
 * box, table columns and cycle wording, so the litter reads like a dog's Linebreeding
 * report. Two things differ, each because the desktop's Hypothetical Mating tab differs:
 * the cross notation is the desktop's full form (`2S x 3D`), not the per-generation
 * counts the twenty-generation report needs, and the classification is shown as notes
 * graded match or possible, never as a claim.
 *
 * Every value from the data goes through `esc` — names, notes and warning messages alike,
 * since the vendored modules build their messages from dog names.
 *
 * [DRAFT — requires Yuliya's review]
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { renderBracket } from '../render/bracket';
import { esc, lines } from '../render/escape';
import { formatDmy } from '../vendor/pedigree-insights/schema';
import type { AncestorCrosses } from '../vendor/pedigree-insights/linebreeding';
import { DEFAULT_MIN_CROSSES } from '../vendor/pedigree-insights/linebreeding';
import { litterBracket } from './bracket';
import type { MatingAnalysis } from './compute';
import type { MatingObject } from './object';

const pct = (percent: number, digits = 2): string => `${percent.toFixed(digits)}%`;

/** The smallest bound worth printing: half a unit of the displayed 0.01 %. */
const BOUND_SHOWN_FROM = 0.005;

/** Slugs by lower-cased name, from both parents and both dicts. */
function slugIndex(sire: MatingObject, dam: MatingObject): Map<string, string> {
  const index = new Map<string, string>();
  for (const o of [sire, dam]) {
    index.set(o.name.trim().toLowerCase(), o.slug);
    for (const e of o.dict) if (e.slug != null) index.set(e.name.trim().toLowerCase(), e.slug);
  }
  return index;
}

/** A dog's name: a link where it has a record (and so a page), plain text otherwise. */
function nameLink(name: string, slug: string | undefined): string {
  return slug != null ? `<a href="/dog/${esc(slug)}">${esc(name)}</a>` : `<span>${esc(name)}</span>`;
}

/**
 * COI and AVK. Labels only — the values are the vendored ones: AVK is `uniqueAncestors` over
 * the possible positions, and the recorded positions are `totalCrosses`. Both counts come
 * from the same walk and leave out a name with no record, so U ≤ R ≤ P always holds. AVK
 * falls for gaps as well as for repeats, which is why the recorded positions sit beside it.
 */
function stats(a: MatingAnalysis): string {
  const positions = 2 ** (a.generations + 1) - 2;
  const bound = a.litterCoiBound >= BOUND_SHOWN_FROM ? ` ± ${a.litterCoiBound.toFixed(2)}` : '';
  return lines(
    '<ul class="report-stats">',
    `<li>Litter inbreeding coefficient (full-depth value): <strong>${pct(a.litterCoi)}${bound}</strong></li>`,
    `<li>AVK, ${a.generations} generations: <strong>${pct(a.litterAvk)}</strong> — ` +
      `${a.uniqueAncestors} different dogs in ${positions} positions ` +
      '(100% = every position filled by a different dog)</li>',
    `<li>Ancestor positions recorded: <strong>${a.totalCrosses}</strong> of ${positions}</li>`,
    '</ul>',
  );
}

function warnings(a: MatingAnalysis, asOf: Date): string {
  const day = esc(formatDmy(asOf.toISOString().slice(0, 10)));
  if (a.warnings.length === 0) {
    return `<p class="note">Checked as of ${day}: no sex, breeding-age or recessive DNA warnings.</p>`;
  }
  return lines(
    '<div class="report-warn" role="alert">',
    `<p><strong>Checks as of ${day}</strong> — warnings only; they do not change the analysis.</p>`,
    '<ul>',
    a.warnings.map((w) => `<li>${esc(w.message)}</li>`).join(''),
    '</ul>',
    '</div>',
  );
}

function notes(a: MatingAnalysis): string {
  const { matches, isOutcross, outcrossNote } = a.classification;
  const items = matches.map(
    (m) =>
      `<li class="grade-${esc(m.confidence)}"><span class="grade">${esc(m.confidence)}</span> ` +
      `<strong>${esc(m.method)}</strong> — ${esc(m.note)}</li>`,
  );
  if (isOutcross && outcrossNote) {
    items.push(`<li class="grade-outcross"><strong>Outcross</strong> — ${esc(outcrossNote)}</li>`);
  }
  return lines(
    `<h2>Line-breeding notes, ${a.generations} generations</h2>`,
    items.length === 0
      ? '<p class="empty">No line-breeding pattern noted.</p>'
      : lines('<ul class="mating-notes">', items.join('\n'), '</ul>'),
    '<p class="note">Notes, not claims: <em>match</em> is read from the pedigree, ' +
      '<em>possible</em> is only partly inferable from it.</p>',
  );
}

function ancestorRow(row: AncestorCrosses, slugs: Map<string, string>): string {
  const sex = row.animal.sex === 'M' ? 'M' : row.animal.sex === 'F' ? 'F' : 'U';
  const blood = row.bloodPercent == null ? '' : pct(row.bloodPercent);
  return (
    '<tr>' +
    `<td class="name"><span class="sex sex-${sex}" aria-hidden="true"></span>` +
    nameLink(row.name, slugs.get(row.name.trim().toLowerCase())) +
    (row.inFinalGeneration ? ' <span class="final" title="Appears in the final generation walked">*</span>' : '') +
    '</td>' +
    `<td class="crosses">${esc(row.notation)}</td>` +
    `<td class="num">${row.crosses}</td>` +
    `<td class="num">${row.crosses} <span class="split">(${row.sireLines})(${row.damLines})</span></td>` +
    `<td class="num">${blood}</td>` +
    `<td class="num">${esc(row.influence)}</td>` +
    '</tr>'
  );
}

function ancestors(a: MatingAnalysis, slugs: Map<string, string>): string {
  const n = a.commonAncestors.length;
  const heading = `<h2>Common ancestors, ${a.generations} generations</h2>`;
  if (n === 0) {
    return lines(
      heading,
      `<p class="empty">No ancestor appears at least ${DEFAULT_MIN_CROSSES} times within ${a.generations} generations.</p>`,
    );
  }
  return lines(
    heading,
    `<p class="report-count">Min crosses: ${DEFAULT_MIN_CROSSES} · ${n} ancestor${n === 1 ? '' : 's'}, ranked by Blood %</p>`,
    '<div class="table-scroll">',
    '<table class="report">',
    '<thead><tr>',
    '<th class="name">Name</th>',
    '<th class="crosses" title="Generation and side of each appearance: S = sire side, D = dam side; lower case = female">Crosses</th>',
    '<th class="num">#</th>',
    '<th class="num" title="Total (sire side)(dam side)">Lines</th>',
    '<th class="num" title="Percent of blood: the ancestor\'s contribution to the litter, ½ per generation summed over every cross (Wright)">Blood %</th>',
    '<th class="num" title="The equivalent cross pair representing the blood contribution; < 7x7 below that floor">Influence</th>',
    '</tr></thead>',
    '<tbody>',
    a.commonAncestors.map((row) => ancestorRow(row, slugs)).join('\n'),
    '</tbody>',
    '</table>',
    '</div>',
  );
}

/** The reports' cycle warning, for the edges either parent's object carries. */
function cycleNote(a: MatingAnalysis): string {
  const n = a.cycles.length;
  if (n === 0) return '';
  return lines(
    '<div class="report-warn" role="alert">',
    `<p><strong>${n} pedigree cycle${n === 1 ? '' : 's'} detected</strong> — a dog appears in its ` +
      'own ancestry, which is a data error. The closing edge was read as unrecorded so the ' +
      'analysis could be computed; please send a correction.</p>',
    '<ul>',
    a.cycles
      .map((c) => `<li><strong>${esc(c.child)}</strong> — ${esc(c.relation)} = ${esc(c.parent)} (already an ancestor)</li>`)
      .join(''),
    '</ul>',
    '</div>',
  );
}

/** The whole analysis, in the order the page reads. */
export function renderMatingAnalysis(
  a: MatingAnalysis,
  sire: MatingObject,
  dam: MatingObject,
  asOf: Date,
): string {
  return lines(
    '<section class="mating-result">',
    '<h2>Planned litter, four generations</h2>',
    renderBracket(litterBracket(sire, dam)),
    stats(a),
    warnings(a, asOf),
    notes(a),
    ancestors(a, slugIndex(sire, dam)),
    cycleNote(a),
    '</section>',
  );
}
