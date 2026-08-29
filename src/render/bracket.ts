/**
 * The pedigree bracket, laid out the way the desktop application lays it out.
 *
 * That is a deliberate match, not a coincidence: a breeder who reads a pedigree in
 * PedigreeInsights and then opens the same dog on the web should be looking at the same
 * chart. Four conventions come straight from the desktop's Pedigree tab (owner decisions,
 * 2026-08-01):
 *
 *  1. **A filled table, not boxes with connector lines.** Coloured fill plus grid borders.
 *     This is the one place the desktop deliberately departs from BreedMate's look, and
 *     the web follows the desktop.
 *  2. **Full information in every cell, including the deepest** — titles, name,
 *     registration, date of birth. Not a graded reduction with bare names at the edge.
 *  3. **Fixed column widths**: each column is as wide as its own widest line, names on one
 *     line, never truncated. Depth costs horizontal scrolling, never legibility.
 *  4. **Pastel violet, one tint per repeated ancestor, saturation by influence.** No red,
 *     no badges, no letter labels. A dog appearing twice in a pedigree is the single most
 *     useful thing a bracket can show, and colour shows it without adding furniture.
 *
 * The layout is CSS Grid with explicit row spans — every position is computed here from
 * the path id, so nothing is measured in the browser and the chart is identical with
 * scripting disabled (PRD R-2.8).
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { BRACKET_GENERATIONS } from '../publish/constants';
import type { BracketNode } from '../publish/payload';
import { formatDmy } from '../vendor/pedigree-insights/schema';
import { esc } from './escape';

/**
 * Column headings, in breeders' own words.
 *
 * Indexed by generation, and generation 0 — the dog itself — has no heading because it
 * has no column: **a dog does not appear in its own pedigree.** The chart is the ancestry
 * above it, and the subject card directly above the chart already says who it is.
 */
const GENERATION_LABELS: Record<number, string> = {
  1: 'Parents',
  2: 'Grandparents',
  3: 'Great-grandparents',
  4: '2× great-grandparents',
  5: '3× great-grandparents',
};

/**
 * Hues for repeated ancestors, and the tint formula, both taken verbatim from the desktop
 * so the same dog is the same colour in both applications.
 */
export const REPEAT_HUES = [268, 284, 255, 298, 246, 312, 274, 260] as const;

/**
 * Every path id at one generation, in printed-pedigree order: sire line at the top, dam
 * line at the bottom, at every level.
 */
export function slotIds(generation: number): string[] {
  const ids: string[] = [];
  for (let i = 0; i < 2 ** generation; i += 1) {
    let id = '0';
    for (let bit = generation - 1; bit >= 0; bit -= 1) id += (i >> bit) & 1 ? '.D' : '.S';
    ids.push(id);
  }
  return ids;
}

/** How a repeated ancestor is identified across the chart. */
function identityOf(node: BracketNode): string {
  return node.slug ?? node.name.trim().toLowerCase();
}

export interface RepeatTint {
  /** Index into REPEAT_HUES. */
  readonly hue: number;
  /** Influence in 0..1 — the blood fraction this ancestor contributes, normalised. */
  readonly weight: number;
  /** How many boxes this ancestor occupies in the chart. */
  readonly occurrences: number;
}

/**
 * Which ancestors repeat, and how strongly.
 *
 * Blood is the standard fraction: an ancestor at generation g contributes 2⁻ᵍ per
 * appearance, summed over appearances. Only ancestors appearing more than once are
 * tinted — a colour on a cell means "this dog is in here twice", so colouring a
 * once-only ancestor would say something untrue.
 *
 * Weight is normalised against the strongest repeat in THIS pedigree, not across the
 * database: the chart answers "what is doubled up in this dog", and that is a local
 * question.
 */
export function repeatTints(nodes: readonly BracketNode[]): Map<string, RepeatTint> {
  const blood = new Map<string, number>();
  const count = new Map<string, number>();
  const firstSeen: string[] = [];

  for (const node of nodes) {
    if (node.generation === 0) continue; // the subject is not its own ancestor
    const id = identityOf(node);
    if (!count.has(id)) firstSeen.push(id);
    count.set(id, (count.get(id) ?? 0) + 1);
    blood.set(id, (blood.get(id) ?? 0) + 2 ** -node.generation);
  }

  const repeated = firstSeen.filter((id) => (count.get(id) ?? 0) > 1);
  const strongest = repeated.reduce((max, id) => Math.max(max, blood.get(id) ?? 0), 0);

  const tints = new Map<string, RepeatTint>();
  repeated.forEach((id, i) => {
    tints.set(id, {
      hue: REPEAT_HUES[i % REPEAT_HUES.length]!,
      weight: strongest === 0 ? 0 : (blood.get(id) ?? 0) / strongest,
      occurrences: count.get(id) ?? 0,
    });
  });
  return tints;
}

/**
 * Does this cell show titles?
 *
 * The desktop layout: **titles · name · registration · date of birth in every column
 * except the last, which drops the titles.** The deepest column is sixteen rows of a
 * fixed height, so it is the one place a third line costs legibility — and it is the
 * column a reader scans rather than studies.
 */
function showsTitles(node: BracketNode, deepest: number): boolean {
  return node.generation < deepest;
}

/** The lines of one cell — used to size the column, and mirrored by `cell()` below. */
function cellLines(node: BracketNode, deepest: number): string[] {
  const titles = showsTitles(node, deepest)
    ? [node.preTitle, node.postTitle].filter(Boolean).join(' ')
    : '';
  const born = node.dob ? (formatDmy(node.dob) ?? node.dob) : undefined;
  const detail = [node.registration, born].filter(Boolean).join(' · ');
  return [titles, node.name, detail].filter((l): l is string => !!l);
}

function cell(
  node: BracketNode | undefined,
  tints: Map<string, RepeatTint>,
  column: number,
  rowStart: number,
  rowSpan: number,
  deepest: number,
  hasPage: (slug: string) => boolean,
): string {
  const place = `grid-column:${column + 1};grid-row:${rowStart} / span ${rowSpan}`;

  if (node === undefined) {
    // An unrecorded ancestor keeps its place and says nothing — no "unknown", no
    // placeholder (PRD R-2.9).
    return `<div class="cell empty" style="${place}"></div>`;
  }

  const tint = tints.get(identityOf(node));
  const style = tint
    ? `${place};--h:${tint.hue};--n:${tint.weight.toFixed(3)}`
    : place;

  const titles = showsTitles(node, deepest)
    ? [node.preTitle, node.postTitle].filter(Boolean).join(' ')
    : '';
  const born = node.dob ? (formatDmy(node.dob) ?? node.dob) : undefined;
  const detail = [node.registration, born].filter(Boolean).join(' · ');

  const body =
    (titles ? `<span class="tt">${esc(titles)}</span>` : '') +
    `<span class="nm">${esc(node.name)}</span>` +
    (detail ? `<span class="dt">${esc(detail)}</span>` : '') +
    (node.loop ? '<span class="dt loop-note">appears in its own ancestry</span>' : '');

  // R-2.3: a record of its own is a link, a name on a parent's record is text. A third
  // condition joins it, and it is about this build rather than about the data: a link is
  // only written where the page exists. In the finished site every dog has one — the
  // unindexed tier is served from D1 — but a partial build must not link into thin air.
  const linked = node.slug != null && hasPage(node.slug);

  const classes = ['cell'];
  if (tint) classes.push('repeat');
  if (node.loop) classes.push('loop');
  if (!linked) classes.push('name-only');

  if (!linked || node.slug == null) {
    return `<div class="${classes.join(' ')}" style="${style}">${body}</div>`;
  }
  const title = tint ? ` title="Appears ${tint.occurrences} times in this pedigree"` : '';
  return `<a class="${classes.join(' ')}" style="${style}" href="/dog/${esc(node.slug)}"${title}>${body}</a>`;
}

/**
 * Render the bracket — always the full four generations, with an empty cell wherever no
 * dog is recorded (owner decision, 2026-08-28).
 *
 * Drawing only as deep as the data goes made every page a different shape and, worse, made
 * a shallow pedigree look like a rendering fault rather than a fact about the record. The
 * full frame says what a printed pedigree form says: this is a four-generation pedigree,
 * and these positions are unfilled. A founder page shows thirty empty cells, which is the
 * honest picture of a foundation import.
 *
 * The depth is never less than what the payload holds, so a payload built by an older or
 * newer publish can never have a generation silently dropped.
 *
 * Column widths are computed from the longest line each column actually holds, in `ch`
 * units — the desktop's "widest name plus one character" rule.
 */
export function renderBracket(
  nodes: readonly BracketNode[],
  hasPage: (slug: string) => boolean = () => true,
): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const held = nodes.reduce((max, n) => Math.max(max, n.generation), 0);
  const deepest = Math.max(BRACKET_GENERATIONS, held);

  const tints = repeatTints(nodes);
  const rows = 2 ** deepest;

  const widths: string[] = [];
  const cells: string[] = [];
  const heads: string[] = [];

  // Generation 1 up: the subject is not one of its own ancestors, so the chart starts at
  // its parents. Column 1 of the grid is therefore generation 1.
  for (let g = 1; g <= deepest; g += 1) {
    const ids = slotIds(g);
    const span = rows / ids.length;
    const column = g - 1;

    let longest = 12; // a floor, so a column of short names is still readable
    for (const [i, id] of ids.entries()) {
      const node = byId.get(id);
      if (node) longest = Math.max(longest, ...cellLines(node, deepest).map((l) => l.length));
      cells.push(cell(node, tints, column, i * span + 2, span, deepest, hasPage));
    }
    // "+1 character and padding", as the desktop sizes its columns — but capped, so the
    // four columns fit a normal window. A name longer than the cap wraps within its cell;
    // it is never cut off.
    widths.push(`${Math.min(longest + 1, 28)}ch`);
    heads.push(
      `<div class="gen-head" style="grid-column:${column + 1};grid-row:1">` +
        `${esc(GENERATION_LABELS[g] ?? `Generation ${g}`)}</div>`,
    );
  }

  return (
    `<div class="bracket-scroll"><div class="bracket" ` +
    `style="grid-template-columns:${widths.join(' ')};` +
    `grid-template-rows:auto repeat(${rows}, var(--row-h))">` +
    heads.join('') +
    cells.join('') +
    '</div></div>'
  );
}
