/**
 * The mating analysis, computed from two stored mating objects — what the browser runs.
 *
 * Nothing here is new genetics. The two objects are turned into a synthetic `AnimalLookup`
 * that answers the vendored modules exactly as the database would within nine generations
 * of each parent, and then the desktop's own pipeline runs on it, unchanged:
 * `makeMatingLookup` → `analyzeLinebreeding` → `ancestorLossPercent` →
 * `classifyLinebreeding` → `checkMating`. The only substitution is the litter COI, which
 * comes from the stored weight vectors (`coi.ts`) instead of a Meuwissen-Luo pass — the
 * same quantity, held to the vendored engine by the parity tests.
 *
 * Pure on purpose: no DOM and no Node APIs. The browser bundle is built from this file and
 * the parity tests import this file, so what is tested is what ships.
 *
 * [DRAFT — requires Yuliya's review]
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import type { MatingDictEntry, MatingObject } from '../publish/mating';
import type { Animal } from '../vendor/pedigree-insights/schema';
import type { AnimalLookup } from '../vendor/pedigree-insights/pedigreeAlgorithm';
import { ancestorLossPercent } from '../vendor/pedigree-insights/genetics';
import {
  DEFAULT_MIN_CROSSES,
  analyzeLinebreeding,
  type AncestorCrosses,
} from '../vendor/pedigree-insights/linebreeding';
import {
  PLANNED_LITTER_NAME,
  clampMatingGenerations,
  makeMatingLookup,
} from '../vendor/pedigree-insights/hypotheticalMating';
import { classifyLinebreeding, type MatingClassification } from '../vendor/pedigree-insights/matingClassifier';
import { checkMating, type MatingWarning } from '../vendor/pedigree-insights/matingChecks';

import { coancestry } from './coi';

const lc = (s: string): string => s.trim().toLowerCase();

/** Everything the page shows, as numbers and records; `render.ts` turns it into HTML. */
export interface MatingAnalysis {
  /** Analysis depth, clamped to 3–10. */
  readonly generations: number;
  /** Litter COI over the full pedigree, a percentage. */
  readonly litterCoi: number;
  /** ± bound on `litterCoi` in percentage points from pruned weights; 0 when exact. */
  readonly litterCoiBound: number;
  /** Litter AVK at `generations`, a percentage. */
  readonly litterAvk: number;
  readonly commonAncestors: readonly AncestorCrosses[];
  readonly uniqueAncestors: number;
  readonly totalCrosses: number;
  readonly classification: MatingClassification;
  readonly warnings: readonly MatingWarning[];
  /** Broken cycle edges in either parent's ancestry, de-duplicated. */
  readonly cycles: readonly { child: string; parent: string; relation: 'Sire' | 'Dam' }[];
}

function blankAnimal(name: string): Animal {
  return {
    name, sire: null, dam: null, sex: null, dob: null, registration: null,
    preTitle: null, postTitle: null, color: null, breed: null, coi: null, avk: null,
  };
}

function fromEntry(e: MatingDictEntry): Animal {
  return {
    ...blankAnimal(e.name),
    sire: e.sire ?? null,
    dam: e.dam ?? null,
    sex: e.sex ?? null,
    dob: e.dob ?? null,
    registration: e.registration ?? null,
    preTitle: e.preTitle ?? null,
    postTitle: e.postTitle ?? null,
  };
}

/** The parent itself, as a record: its own fields plus its parents from grid slots 1, 2. */
function fromSelf(o: MatingObject): Animal {
  const parent = (slot: number) => {
    const i = o.grid[slot];
    return i == null ? null : o.dict[i].name;
  };
  return {
    ...blankAnimal(o.name),
    sire: parent(1),
    dam: parent(2),
    sex: o.self.sex ?? null,
    dob: o.self.dob ?? null,
    registration: o.self.registration ?? null,
    preTitle: o.self.preTitle ?? null,
    postTitle: o.self.postTitle ?? null,
    praRcd4C2orf71: o.self.praRcd4C2orf71 ?? null,
    samsKcnj10: o.self.samsKcnj10 ?? null,
  };
}

/**
 * A lookup over the two objects. Name-only dict entries are left out, so they resolve to
 * null and their line ends — as they do against the database. Where both objects hold the
 * same dog, a parent's own record (`self`) wins over a dict entry, because it carries the
 * date of birth and DNA results the checks read; dict entries of one dog agree on its
 * parents in both objects, which is all the walk reads.
 */
export function lookupFromObjects(sire: MatingObject, dam: MatingObject): AnimalLookup {
  const byKey = new Map<string, Animal>();
  for (const o of [sire, dam]) {
    for (const e of o.dict) {
      if (e.slug == null) continue;
      const k = lc(e.name);
      if (!byKey.has(k)) byKey.set(k, fromEntry(e));
    }
  }
  for (const o of [sire, dam]) byKey.set(lc(o.name), fromSelf(o));
  return (name: string) => byKey.get(lc(name)) ?? null;
}

/** The analysis of the planned litter `sire × dam` at `generations`, as of `asOf` (UTC). */
export function computeMating(
  sire: MatingObject,
  dam: MatingObject,
  generations: number,
  asOf: Date,
): MatingAnalysis {
  const gens = clampMatingGenerations(generations);
  const base = lookupFromObjects(sire, dam);
  const sireAnimal = base(sire.name);
  const damAnimal = base(dam.name);
  const matingLookup = makeMatingLookup(base, sire.name, dam.name);

  const report = analyzeLinebreeding(matingLookup, PLANNED_LITTER_NAME, gens, DEFAULT_MIN_CROSSES);
  const litterCoi = coancestry(sire.coi.w, dam.coi.w) * 100;
  // Design §5: by Cauchy–Schwarz, with ‖w‖² = 1 + F ≤ 2, pruning a vector by `dropped`
  // moves the coancestry by at most ½(√dropped_S·√2 + √dropped_D·√2).
  const litterCoiBound =
    sire.coi.dropped > 0 || dam.coi.dropped > 0
      ? 0.5 * Math.SQRT2 * (Math.sqrt(sire.coi.dropped) + Math.sqrt(dam.coi.dropped)) * 100
      : 0;

  const classification = classifyLinebreeding({
    ancestors: report.ancestors,
    sire: sireAnimal,
    dam: damAnimal,
    sireName: sire.name,
    damName: dam.name,
    offspringCoiPct: litterCoi,
    generations: gens,
  });

  const seen = new Set<string>();
  const cycles = [...(sire.cycles ?? []), ...(dam.cycles ?? [])].filter((c) => {
    const k = `${lc(c.child)}\u0000${c.relation}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return {
    generations: gens,
    litterCoi,
    litterCoiBound,
    litterAvk: ancestorLossPercent(report.uniqueAncestors, report.generations),
    commonAncestors: report.ancestors,
    uniqueAncestors: report.uniqueAncestors,
    totalCrosses: report.totalCrosses,
    classification,
    warnings: checkMating(damAnimal, sireAnimal, asOf),
    cycles,
  };
}
