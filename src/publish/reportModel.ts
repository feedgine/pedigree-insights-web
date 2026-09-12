/**
 * The shape of a report payload, and the arithmetic that turns a stored row into the
 * columns a page shows.
 *
 * Its own module, with no Node dependency, because the Worker renders from it: `reports.ts`
 * hashes with `node:crypto`, and a value import from there would pull that into the
 * bundle (the same reason `constants.ts` exists).
 *
 * A row stores the one thing that cannot be recomputed cheaply — how many paths reach
 * the ancestor at each generation on each side — and nothing that follows from it. The
 * crosses, the line split, the closest generation, the blood share and the influence
 * label are all sums over that list, so they are derived where they are shown. Measured
 * on the real catalogue this is the difference between 3.0 GB and about 1.8 GB of
 * reports in R2, for the same page.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { influenceLabel } from '../vendor/pedigree-insights/linebreeding';

/** One repeated ancestor in the Linebreeding report. */
export interface LinebreedingRow {
  readonly name: string;
  readonly slug: string;
  readonly sex?: 'M' | 'F';
  /**
   * Crosses by generation: `[generation, on the sire side, on the dam side]`, ascending.
   * The desktop lists each occurrence separately (`3S x 5D x 5D`); with twenty
   * generations the same information is carried as counts and printed as `3S · 5D×2`.
   */
  readonly occ: readonly (readonly [number, number, number])[];
}

/** The desktop's columns, derived from a row's occurrence counts. */
export interface RowStats {
  /** Every appearance within the report depth — the "#" column. */
  readonly crosses: number;
  readonly sireLines: number;
  readonly damLines: number;
  /** The shallowest generation the ancestor appears at (1 = a parent). */
  readonly closest: number;
  /** Blood % as a fraction: Σ ½^generation over every cross (Wright). */
  readonly blood: number;
  /** The equivalent cross pair for that Blood %, e.g. `4x5`, or `< 7x7`. */
  readonly influence: string;
  /** At least one cross sits in the deepest generation walked. */
  readonly inFinal: boolean;
}

export function rowStats(row: LinebreedingRow, generations: number): RowStats {
  let crosses = 0;
  let sireLines = 0;
  let damLines = 0;
  let blood = 0;
  for (const [gen, s, d] of row.occ) {
    crosses += s + d;
    sireLines += s;
    damLines += d;
    blood += (s + d) * 0.5 ** gen;
  }
  const first = row.occ[0];
  const last = row.occ[row.occ.length - 1];
  return {
    crosses,
    sireLines,
    damLines,
    closest: first ? first[0] : 0,
    blood,
    influence: influenceLabel(blood),
    inFinal: last !== undefined && last[0] === generations,
  };
}

export interface LinebreedingSummary {
  /** The depth walked — the constant, stored so a page can never mislabel itself. */
  readonly generations: number;
  readonly minCrosses: number;
  /** Deepest generation at which any ancestor was found (≤ generations). */
  readonly reached: number;
  /** Distinct ancestors within `generations`, excluding the subject. */
  readonly uniqueAncestors: number;
  /** Ancestor positions walked, counting repeats. */
  readonly totalCrosses: number;
  /** Repeated ancestors, ranked by Blood % desc, then crosses desc, closest asc, name. */
  readonly ancestors: readonly LinebreedingRow[];
}

/** A foundation dog that IS in the subject's ancestry. Absent ones are not stored. */
export interface FoundationRow {
  readonly name: string;
  readonly slug: string;
  /** Wright's contribution as a fraction, over every generation. */
  readonly contribution: number;
  readonly closest: number;
  /** Occurrence paths within twenty generations, as the desktop counts them. */
  readonly crosses: number;
}

export interface FoundationSummary {
  /** Generations the contribution walk went before every line ran out. */
  readonly generations: number;
  /**
   * Only the foundation dogs present in this pedigree. The full list is a site constant
   * (`foundationDogs.ts`), so the page derives the absent rows from it; storing 55 rows
   * of "absent" on 62,818 reports would have been 140 MB of nothing.
   */
  readonly rows: readonly FoundationRow[];
}

/** A parent edge that closes a cycle: `child` lists `parent`, but is its ancestor. */
export interface CycleEdge {
  readonly child: string;
  readonly parent: string;
  readonly relation: 'Sire' | 'Dam';
}

export interface DogReports {
  readonly slug: string;
  readonly name: string;
  readonly subject: {
    readonly sex?: 'M' | 'F';
    readonly preTitle?: string;
    readonly postTitle?: string;
    /** Stored COI, a fraction, for the report header. */
    readonly coi?: number;
  };
  /** Cycle edges met while walking THIS pedigree; absent when there were none. */
  readonly cycles?: readonly CycleEdge[];
  readonly linebreeding: LinebreedingSummary;
  readonly foundation: FoundationSummary;
}
