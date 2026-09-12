/**
 * The report payload — the Linebreeding and Foundation reports for one dog, computed once
 * at publish, stored beside the page payload and rendered by a template (PRD §8.3: never
 * traverse a pedigree at request time).
 *
 * WHY THE LINEBREEDING WALK IS NOT THE VENDORED ONE
 * -------------------------------------------------
 * The desktop's `analyzeLinebreeding` enumerates every occurrence path. That is the right
 * tool for one dog on demand and the wrong one for 62,818 dogs in a batch: the most
 * line-bred dog in the catalogue has 819,295 crosses within twenty generations, and the
 * path count is what that walk pays for. The walk here is the layered, memoised one the
 * desktop already uses for the Foundation report (`contribution.ts`): one generation at a
 * time, per-ancestor totals, work proportional to ancestors × generations. Measured on
 * the real catalogue: 16 seconds for every dog at twenty generations.
 *
 * It is the same quantity, not a variant of it. The desktop report's columns are all
 * sums over occurrences grouped by (generation, side): crosses, sire and dam lines, the
 * closest cross, Blood % = Σ ½^generation, and Influence, which is a function of Blood %.
 * Carrying path COUNTS per (ancestor, generation, side) instead of the paths themselves
 * loses nothing those columns need. `tests/unit/reports.test.ts` asserts, row for row,
 * that this walk and the vendored one agree — the working contract's rule that a web
 * number disagreeing with the desktop number is a defect, made executable.
 *
 * The one place the two can differ is a pedigree with a true cycle — a dog within its own
 * ancestry, which is a data error. The vendored walk cuts the cycle where each path meets
 * it; a layered walk has no path to cut, so cycles are found first, over the whole
 * population, and the closing edge is treated as unrecorded — the same thing the desktop's
 * genetics step does before computing COI. The broken edges are reported, not hidden.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { createHash } from 'node:crypto';

import type { Animal } from '../vendor/pedigree-insights/schema';
import type { AnimalLookup } from '../vendor/pedigree-insights/pedigreeAlgorithm';
import { buildFoundationReport } from '../vendor/pedigree-insights/contribution';

import { LINEBREEDING_GENERATIONS, LINEBREEDING_MIN_CROSSES } from './constants';
import { FOUNDATION_DOGS } from './foundationDogs';
import { indexKey } from './key';
import { stableStringify } from './payload';
import {
  rowStats,
  type CycleEdge,
  type DogReports,
  type FoundationRow,
  type FoundationSummary,
  type LinebreedingRow,
  type LinebreedingSummary,
} from './reportModel';

export type {
  CycleEdge,
  DogReports,
  FoundationRow,
  FoundationSummary,
  LinebreedingRow,
  LinebreedingSummary,
  RowStats,
} from './reportModel';
export { rowStats } from './reportModel';

// ---------------------------------------------------------------------------------------
// Cycles
// ---------------------------------------------------------------------------------------

/**
 * Find every parent edge that closes a cycle in the population's parent graph.
 *
 * Iterative depth-first colouring over the whole population (white, grey, black): an edge
 * from a grey node to a grey node is a back edge, and breaking exactly those leaves an
 * acyclic graph. Iterative rather than recursive on purpose — the working contract asks
 * for it, and 62,818 nodes is deep enough to make the point.
 *
 * Which edge of a cycle gets broken depends on traversal order, as it does in the
 * desktop's genetics step. Sorted input keeps it deterministic between runs, which the
 * report hash requires.
 */
export function findCycleEdges(animals: readonly Animal[], lookup: AnimalLookup): CycleEdge[] {
  const colour = new Map<string, 1 | 2>(); // absent = white
  const edges: CycleEdge[] = [];

  const parentsOf = (a: Animal): [string, 'Sire' | 'Dam', Animal | null][] =>
    ([
      [a.sire, 'Sire'],
      [a.dam, 'Dam'],
    ] as const)
      .filter((p): p is readonly [string, 'Sire' | 'Dam'] => indexKey(p[0]) != null)
      .map(([name, rel]) => [name as string, rel, lookup(name as string)]);

  for (const root of animals) {
    const rootKey = indexKey(root.name);
    if (rootKey == null || colour.has(rootKey)) continue;

    // Explicit stack of frames: the animal and which of its parents comes next.
    const stack: { animal: Animal; key: string; next: number }[] = [
      { animal: root, key: rootKey, next: 0 },
    ];
    colour.set(rootKey, 1);

    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const parents = parentsOf(frame.animal);
      if (frame.next >= parents.length) {
        colour.set(frame.key, 2);
        stack.pop();
        continue;
      }
      const [parentName, relation, parent] = parents[frame.next];
      frame.next += 1;
      if (parent == null) continue; // a name with no record — the line ends
      const parentKey = indexKey(parent.name)!;
      const c = colour.get(parentKey);
      if (c === 1) {
        edges.push({ child: frame.animal.name, parent: parentName, relation });
      } else if (c === undefined) {
        colour.set(parentKey, 1);
        stack.push({ animal: parent, key: parentKey, next: 0 });
      }
    }
  }
  return edges;
}

/** `child key → the edges of that child to treat as unrecorded`. */
export type BrokenEdges = ReadonlyMap<string, readonly CycleEdge[]>;

export function brokenEdgesOf(cycles: readonly CycleEdge[]): BrokenEdges {
  const out = new Map<string, CycleEdge[]>();
  for (const c of cycles) {
    const key = indexKey(c.child)!;
    const list = out.get(key) ?? [];
    list.push(c);
    out.set(key, list);
  }
  return out;
}

/**
 * A lookup that reads a broken edge as "parent not recorded".
 *
 * It returns a copy of the animal with the offending parent nulled, so the vendored
 * modules — which read `sire` and `dam` straight off the row — see the acyclic graph
 * without knowing anything about cycles.
 */
export function withoutCycles(lookup: AnimalLookup, broken: BrokenEdges): AnimalLookup {
  if (broken.size === 0) return lookup;
  const cache = new Map<string, Animal | null>();
  return (name: string) => {
    const key = indexKey(name);
    if (key == null) return null;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const a = lookup(name);
    const cut = a == null ? undefined : broken.get(indexKey(a.name)!);
    const cuts = (rel: 'Sire' | 'Dam') => cut?.some((c) => c.relation === rel) ?? false;
    const out =
      a == null || cut === undefined
        ? a
        : { ...a, sire: cuts('Sire') ? null : a.sire, dam: cuts('Dam') ? null : a.dam };
    cache.set(key, out);
    return out;
  };
}

// ---------------------------------------------------------------------------------------
// Linebreeding — the layered walk
// ---------------------------------------------------------------------------------------

/** Fewer digits than a double carries, so JSON stays short and `0.1 + 0.2` stays honest. */
function round(v: number): number {
  return Number(v.toPrecision(12));
}

/** Context needed to turn an animal into its reports. */
export interface ReportContext {
  /** Already cycle-free — see `withoutCycles`. */
  readonly lookup: AnimalLookup;
  readonly slugByKey: ReadonlyMap<string, string>;
  /** Which parent edges were broken, so the report can say so. */
  readonly broken: BrokenEdges;
  readonly generations?: number;
  readonly minCrosses?: number;
  readonly foundationDogs?: readonly string[];
}

/** Path counts reaching one ancestor at the current generation, by subject side. */
interface Paths {
  S: number;
  D: number;
}

/** Everything accumulated for one ancestor across generations. */
interface Acc {
  animal: Animal;
  occ: [number, number, number][];
  crosses: number;
}

export function buildLinebreeding(
  ctx: ReportContext,
  subject: Animal,
  cyclesMet: CycleEdge[] = [],
): LinebreedingSummary {
  const generations = ctx.generations ?? LINEBREEDING_GENERATIONS;
  const minCrosses = ctx.minCrosses ?? LINEBREEDING_MIN_CROSSES;
  const { lookup } = ctx;

  const acc = new Map<string, Acc>();
  let totalCrosses = 0;
  let reached = 0;

  // Generation 1 is seeded from the subject and DEFINES the side; deeper, the side is
  // inherited along every path, so per-ancestor counts are kept per side.
  let layer = new Map<string, { animal: Animal; paths: Paths }>();
  // The lookup already reads a broken edge as "no parent", so the edge itself — which is
  // what the page must say — comes from the cycle list, not from the animal.
  const noteCycle = (child: Animal) => {
    const cut = ctx.broken.get(indexKey(child.name)!);
    if (cut === undefined) return;
    for (const edge of cut) {
      if (!cyclesMet.some((c) => c.child === edge.child && c.relation === edge.relation)) {
        cyclesMet.push(edge);
      }
    }
  };
  const add = (
    into: Map<string, { animal: Animal; paths: Paths }>,
    name: string | null,
    paths: Paths,
  ) => {
    const key = indexKey(name);
    if (key == null) return;
    const animal = lookup(name as string);
    if (animal == null) return; // known only as a name — the line ends (R-2.3)
    const cur = into.get(key) ?? { animal, paths: { S: 0, D: 0 } };
    cur.paths.S += paths.S;
    cur.paths.D += paths.D;
    into.set(key, cur);
  };

  noteCycle(subject);
  add(layer, subject.sire, { S: 1, D: 0 });
  add(layer, subject.dam, { S: 0, D: 1 });

  for (let gen = 1; gen <= generations && layer.size > 0; gen += 1) {
    reached = gen;
    for (const [key, { animal, paths }] of layer) {
      const n = paths.S + paths.D;
      totalCrosses += n;
      const a = acc.get(key) ?? { animal, occ: [], crosses: 0 };
      a.occ.push([gen, paths.S, paths.D]);
      a.crosses += n;
      acc.set(key, a);
    }
    if (gen === generations) break;
    const next = new Map<string, { animal: Animal; paths: Paths }>();
    for (const { animal, paths } of layer.values()) {
      noteCycle(animal);
      add(next, animal.sire, paths);
      add(next, animal.dam, paths);
    }
    layer = next;
  }

  // Rows carry the occurrence counts only; every column is derived from them where it is
  // shown (`rowStats`). The ranking is fixed here, once, from the same derivation.
  const ranked: { row: LinebreedingRow; crosses: number; closest: number; blood: number }[] = [];
  for (const a of acc.values()) {
    if (a.crosses < minCrosses) continue;
    const key = indexKey(a.animal.name)!;
    const slug = ctx.slugByKey.get(key);
    if (slug === undefined) throw new Error(`No slug assigned for ${JSON.stringify(a.animal.name)}.`);
    const row: LinebreedingRow = {
      name: a.animal.name,
      slug,
      sex: a.animal.sex ?? undefined,
      occ: a.occ,
    };
    const stats = rowStats(row, generations);
    ranked.push({ row, crosses: stats.crosses, closest: stats.closest, blood: stats.blood });
  }
  ranked.sort(
    (x, y) =>
      y.blood - x.blood ||
      y.crosses - x.crosses ||
      x.closest - y.closest ||
      (x.row.name < y.row.name ? -1 : x.row.name > y.row.name ? 1 : 0),
  );
  const rows = ranked.map((r) => r.row);

  return {
    generations,
    minCrosses,
    reached,
    uniqueAncestors: acc.size,
    totalCrosses,
    ancestors: rows,
  };
}

// ---------------------------------------------------------------------------------------
// Foundation — the vendored report, present rows only
// ---------------------------------------------------------------------------------------

export function buildFoundation(ctx: ReportContext, subject: Animal): FoundationSummary {
  const list = ctx.foundationDogs ?? FOUNDATION_DOGS;
  const report = buildFoundationReport(ctx.lookup, subject.name, [...list]);
  const rows: FoundationRow[] = [];
  for (const r of report.rows) {
    if (!r.present) continue;
    const slug = ctx.slugByKey.get(indexKey(r.name)!);
    if (slug === undefined) throw new Error(`No slug assigned for ${JSON.stringify(r.name)}.`);
    rows.push({
      name: r.name,
      slug,
      contribution: round(r.contribution),
      closest: r.closest as number,
      crosses: r.crosses,
    });
  }
  // The vendored report already orders present rows by contribution; sorting again by the
  // stored (rounded) values keeps the order a function of the stored content alone.
  rows.sort(
    (x, y) =>
      y.contribution - x.contribution ||
      x.closest - y.closest ||
      (x.name < y.name ? -1 : x.name > y.name ? 1 : 0),
  );
  return { generations: report.generations, rows };
}

/** Trimmed text, or undefined. */
function text(value: string | null | undefined): string | undefined {
  const s = value?.trim();
  return s ? s : undefined;
}

/** Both reports for one dog. */
export function buildReports(ctx: ReportContext, animal: Animal): DogReports {
  const key = indexKey(animal.name);
  if (key == null) throw new Error('Cannot build reports for a dog with no name.');
  const slug = ctx.slugByKey.get(key);
  if (slug === undefined) throw new Error(`No slug assigned for ${JSON.stringify(animal.name)}.`);

  const cyclesMet: CycleEdge[] = [];
  const linebreeding = buildLinebreeding(ctx, animal, cyclesMet);
  const foundation = buildFoundation(ctx, animal);

  const subject: DogReports['subject'] = {};
  if (animal.sex) (subject as { sex?: 'M' | 'F' }).sex = animal.sex;
  const pre = text(animal.preTitle);
  const post = text(animal.postTitle);
  if (pre) (subject as { preTitle?: string }).preTitle = pre;
  if (post) (subject as { postTitle?: string }).postTitle = post;
  if (animal.coi != null) (subject as { coi?: number }).coi = animal.coi;

  const out: DogReports = { slug, name: animal.name, subject, linebreeding, foundation };
  return cyclesMet.length > 0 ? { ...out, cycles: cyclesMet } : out;
}

/**
 * Names on the foundation list that match no record in the master — reported by the
 * publish run, because a misspelt founder would otherwise read as absent from every
 * pedigree in the catalogue and nobody would know.
 */
export function unmatchedFoundationDogs(
  lookup: AnimalLookup,
  list: readonly string[] = FOUNDATION_DOGS,
): string[] {
  return list.filter((name) => lookup(name) == null);
}

/** The content hash of a report — the basis of its incremental publish, as for payloads. */
export function reportHash(reports: DogReports): string {
  return createHash('sha256').update(stableStringify(reports)).digest('hex').slice(0, 32);
}
