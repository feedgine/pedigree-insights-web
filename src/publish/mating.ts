/**
 * The mating object — what one dog contributes to any planned litter it is a parent of,
 * computed once at publish (design: `openspec/changes/add-hypothetical-mating/design.md`).
 *
 * The `/mating` page never walks a pedigree on the server. It embeds the two parents'
 * objects verbatim and the browser does the rest, so everything the analysis needs must
 * already be in here:
 *
 *  - **`coi.w`, the dog's weight vector.** The litter COI is the coancestry of its parents,
 *    and with A = T·D·Tᵀ that is ½ Σ w_Sk·w_Dk for `w_Xk = T_Xk·√D_k` (see
 *    `src/mating/coi.ts`). `T_X` is the vendored `computeContributions` — full depth, the
 *    layered walk the Foundation report already runs per dog — plus the dog itself.
 *  - **`D_k` needs every dog's own F.** One parents-first pass over the population gives
 *    it: by the same identity, the diagonal of A is ‖w_X‖² = 1 + F_X, and `w_X` only needs
 *    D of X's ancestors and of X — which in turn only need F of *their* parents, all
 *    earlier in the order. So F_X = 2·coancestry(w_X, w_X) − 1, through the very function
 *    the browser uses for the litter. Not the sire × dam form, ½ Σ w_sire·w_dam, though it
 *    is equal (and a test says so): that form needs both parents' vectors held at once,
 *    which for 62,866 dogs means holding all of them.
 *
 * Mendelian-sampling variance follows `mendelian()` in the vendored `genetics.ts` — four
 * lines that module does not export. The parity tests against `createGeneticsEngine` are
 * what keep the two the same rule.
 *
 * Cycles are cut before anything here runs (`withoutCycles`, as for the reports), so the
 * lookup this module receives is a DAG. A pedigree that still reaches
 * `CONTRIBUTION_MAX_GENERATIONS` would have its vector truncated and its COI wrong, so the
 * publish fails instead of shipping it.
 *
 * [DRAFT — requires Yuliya's review]
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { createHash } from 'node:crypto';

import type { Animal } from '../vendor/pedigree-insights/schema';
import {
  CONTRIBUTION_MAX_GENERATIONS,
  type AnimalLookup,
} from '../vendor/pedigree-insights/pedigreeAlgorithm';
import { computeContributions } from '../vendor/pedigree-insights/contribution';

import { bySlug, coancestry, type WeightEntry, type Weights } from '../mating/coi';
import {
  BRACKET_LAST_SLOT,
  MATING_GRID_SLOTS,
  type MatingDictEntry,
  type MatingObject,
} from '../mating/object';
import { scriptSafeJson } from '../render/escape';
import { indexKey } from './key';
import { stableStringify } from './payload';
import type { CycleEdge } from './reportModel';

// ---------------------------------------------------------------------------------------
// Population genetics — every dog's F and D, parents first
// ---------------------------------------------------------------------------------------

/** Every dog's inbreeding `F` and Mendelian-sampling variance `D`, by index key. */
export interface PopulationGenetics {
  readonly F: ReadonlyMap<string, number>;
  readonly D: ReadonlyMap<string, number>;
}

/** Mendelian-sampling variance given the parents' F — `mendelian()` in `genetics.ts`. */
function mendelian(fSire: number | undefined, fDam: number | undefined): number {
  if (fSire !== undefined && fDam !== undefined) return 0.5 - 0.25 * (fSire + fDam);
  if (fSire !== undefined) return 0.75 - 0.25 * fSire;
  if (fDam !== undefined) return 0.75 - 0.25 * fDam;
  return 1;
}

/** The index key of a recorded parent, or null when none is recorded or held. */
function parentKey(lookup: AnimalLookup, name: string | null | undefined): string | null {
  if (indexKey(name) == null) return null;
  const parent = lookup(name as string);
  return parent == null ? null : indexKey(parent.name);
}

/**
 * The dog's weights over itself and every ancestor, keyed by index key, unrounded.
 *
 * Throws when the walk reaches the contribution cap: a pedigree that deep has been cut
 * short, and a short vector is a wrong COI with nothing on the page to say so.
 */
function weightsByKey(
  lookup: AnimalLookup,
  D: ReadonlyMap<string, number>,
  animal: Animal,
): WeightEntry[] {
  const key = indexKey(animal.name);
  if (key == null) throw new Error('Cannot build a weight vector for a dog with no name.');
  const result = computeContributions(lookup, animal.name);
  if (result.generations >= CONTRIBUTION_MAX_GENERATIONS) {
    throw new Error(
      `The pedigree of ${JSON.stringify(animal.name)} reaches ${CONTRIBUTION_MAX_GENERATIONS} ` +
        'generations, the contribution cap. Its COI would be computed from a truncated ' +
        'pedigree, so the publish stops here. Check the record for a mistaken parent.',
    );
  }
  const dSelf = D.get(key);
  if (dSelf === undefined) throw new Error(`No Mendelian variance for ${JSON.stringify(animal.name)}.`);
  const out: WeightEntry[] = [[key, Math.sqrt(dSelf)]];
  for (const c of result.byName.values()) {
    const k = indexKey(c.animal.name)!;
    const d = D.get(k);
    if (d === undefined) throw new Error(`No Mendelian variance for ${JSON.stringify(c.name)}.`);
    out.push([k, c.contribution * Math.sqrt(d)]);
  }
  return out.sort(bySlug);
}

/**
 * F and D for every dog, in one parents-first pass.
 *
 * Order by Kahn's algorithm over the parent graph — iterative, each dog visited once.
 * `lookup` must already be cycle-free; a dog the sort cannot place means it is not, and
 * that is reported rather than looped over.
 */
export function populationGenetics(
  animals: readonly Animal[],
  lookup: AnimalLookup,
): PopulationGenetics {
  // The cycle-cut record of every dog, by key — the lookup's copy, not the raw row, so a
  // broken edge is absent here exactly as it is to the vendored code.
  const node = new Map<string, Animal>();
  for (const a of animals) {
    const key = indexKey(a.name);
    if (key == null || node.has(key)) continue;
    node.set(key, lookup(a.name) ?? a);
  }

  const parents = new Map<string, { sire: string | null; dam: string | null }>();
  const children = new Map<string, string[]>();
  const pending = new Map<string, number>();
  for (const [key, a] of node) {
    const sire = parentKey(lookup, a.sire);
    const dam = parentKey(lookup, a.dam);
    parents.set(key, { sire, dam });
    let n = 0;
    for (const p of [sire, dam]) {
      if (p == null || !node.has(p)) continue;
      n += 1;
      const list = children.get(p) ?? [];
      list.push(key);
      children.set(p, list);
    }
    pending.set(key, n);
  }

  const queue: string[] = [];
  for (const [key, n] of pending) if (n === 0) queue.push(key);

  const F = new Map<string, number>();
  const D = new Map<string, number>();
  for (let head = 0; head < queue.length; head += 1) {
    const key = queue[head];
    const { sire, dam } = parents.get(key)!;
    D.set(key, mendelian(sire == null ? undefined : F.get(sire), dam == null ? undefined : F.get(dam)));
    const w = weightsByKey(lookup, D, node.get(key)!);
    F.set(key, 2 * coancestry(w, w) - 1);
    for (const child of children.get(key) ?? []) {
      const left = pending.get(child)! - 1;
      pending.set(child, left);
      if (left === 0) queue.push(child);
    }
  }

  if (F.size !== node.size) {
    const stuck = [...node.keys()].filter((k) => !F.has(k)).slice(0, 5);
    throw new Error(
      `${node.size - F.size} dogs could not be ordered parents-first — the lookup still has ` +
        `a cycle. First: ${stuck.map((k) => JSON.stringify(node.get(k)!.name)).join(', ')}.`,
    );
  }
  return { F, D };
}

// ---------------------------------------------------------------------------------------
// The stored weight vector
// ---------------------------------------------------------------------------------------

/** Fewer digits than a double carries, as in `reports.ts`, so the hash is stable. */
function round(v: number): number {
  return Number(v.toPrecision(12));
}

/**
 * The dog's stored weight vector: `T_X·√D` over itself and every ancestor, keyed by slug,
 * sorted by slug, 12 significant digits.
 *
 * Keyed by slug and not by a per-publish number because slugs do not move (R-5.2): an
 * unchanged dog keeps a byte-identical object, and the incremental publish stays one.
 */
export function weightVector(
  lookup: AnimalLookup,
  genetics: PopulationGenetics,
  slugByKey: ReadonlyMap<string, string>,
  animal: Animal,
): Weights {
  return weightsByKey(lookup, genetics.D, animal)
    .map(([key, w]): WeightEntry => {
      const slug = slugByKey.get(key);
      if (slug === undefined) throw new Error(`No slug assigned for ${JSON.stringify(key)}.`);
      return [slug, round(w)];
    })
    .sort(bySlug);
}

// ---------------------------------------------------------------------------------------
// The ancestor grid
// ---------------------------------------------------------------------------------------

export {
  BRACKET_LAST_SLOT,
  MATING_GRID_GENERATIONS,
  MATING_GRID_SLOTS,
  type MatingDictEntry,
  type MatingObject,
} from '../mating/object';

/** Context needed to turn an animal into its mating object. */
export interface MatingContext {
  /** Already cycle-free — see `withoutCycles`. */
  readonly lookup: AnimalLookup;
  readonly slugByKey: ReadonlyMap<string, string>;
  readonly genetics: PopulationGenetics;
  /** Every edge `findCycleEdges` broke, population-wide. */
  readonly cycles: readonly CycleEdge[];
}

/** Trimmed text, or undefined. */
function text(value: string | null | undefined): string | undefined {
  const s = value?.trim();
  return s ? s : undefined;
}

/** Drop `undefined` members so an absent field costs nothing in the stored object. */
function compact<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

/**
 * Walk nine generations of ancestors into a heap-ordered grid and a de-duplicated dict.
 *
 * Iterative over slot numbers — no recursion, and the grid size is the depth limit. A
 * recorded ancestor resolves through the cycle-cut lookup, so a broken edge is simply an
 * empty slot. A name with no record is a dict entry with `slug: null` and no parents: the
 * line ends there, as on the dog page and the desktop. The dict is in order of first
 * appearance by slot, which is deterministic.
 */
export function buildGrid(
  ctx: Pick<MatingContext, 'lookup' | 'slugByKey'>,
  animal: Animal,
): { grid: (number | null)[]; dict: MatingDictEntry[] } {
  const grid: (number | null)[] = new Array(MATING_GRID_SLOTS).fill(null);
  /** The record behind each slot, for walking on; null for a name-only or empty slot. */
  const held: (Animal | null)[] = new Array(MATING_GRID_SLOTS).fill(null);
  held[0] = ctx.lookup(animal.name) ?? animal;

  const index = new Map<string, number>();
  const entries: { record: Animal | null; name: string; nearSlot: number }[] = [];

  const lastParent = (MATING_GRID_SLOTS - 1) / 2 - 1; // 510: the last slot with children
  for (let i = 0; i <= lastParent; i += 1) {
    const child = held[i];
    if (child == null) continue;
    const parents: [string | null, number][] = [
      [child.sire, 2 * i + 1],
      [child.dam, 2 * i + 2],
    ];
    for (const [parentName, slot] of parents) {
      const name = text(parentName);
      if (name === undefined) continue;
      const record = ctx.lookup(name);
      const key = indexKey(record?.name ?? name)!;
      let at = index.get(key);
      if (at === undefined) {
        at = entries.length;
        index.set(key, at);
        entries.push({ record, name: record?.name ?? name, nearSlot: slot });
      }
      grid[slot] = at;
      held[slot] = record;
    }
  }

  const dict = entries.map(({ record, name, nearSlot }): MatingDictEntry => {
    if (record == null) return { name, slug: null };
    const slug = ctx.slugByKey.get(indexKey(record.name)!);
    if (slug === undefined) throw new Error(`No slug assigned for ${JSON.stringify(record.name)}.`);
    const inBracket = nearSlot <= BRACKET_LAST_SLOT;
    return compact({
      name,
      slug,
      sex: record.sex ?? undefined,
      sire: text(record.sire),
      dam: text(record.dam),
      preTitle: inBracket ? text(record.preTitle) : undefined,
      postTitle: inBracket ? text(record.postTitle) : undefined,
      registration: inBracket ? text(record.registration) : undefined,
      dob: inBracket ? text(record.dob) : undefined,
    }) as MatingDictEntry;
  });
  return { grid, dict };
}

// ---------------------------------------------------------------------------------------
// The object
// ---------------------------------------------------------------------------------------

/** Build the complete mating object for one dog. */
export function buildMatingObject(ctx: MatingContext, animal: Animal): MatingObject {
  const key = indexKey(animal.name);
  if (key == null) throw new Error('Cannot build a mating object for a dog with no name.');
  const slug = ctx.slugByKey.get(key);
  if (slug === undefined) throw new Error(`No slug assigned for ${JSON.stringify(animal.name)}.`);

  const record = ctx.lookup(animal.name) ?? animal;
  const { grid, dict } = buildGrid(ctx, record);
  const w = weightVector(ctx.lookup, ctx.genetics, ctx.slugByKey, record);

  // A broken edge matters to this dog when its child is the dog or any ancestor — the COI
  // is full depth, so that is the whole vector, not only the nine generations of the grid.
  const inAncestry = new Set(w.map(([s]) => s));
  const cycles = ctx.cycles
    .filter((c) => {
      const s = ctx.slugByKey.get(indexKey(c.child)!);
      return s !== undefined && inAncestry.has(s);
    })
    .map((c) => ({ child: c.child, parent: c.parent, relation: c.relation }))
    .sort(
      (x, y) =>
        (x.child < y.child ? -1 : x.child > y.child ? 1 : 0) ||
        (x.relation < y.relation ? -1 : x.relation > y.relation ? 1 : 0),
    );

  const self = compact({
    sex: animal.sex ?? undefined,
    dob: text(animal.dob),
    preTitle: text(animal.preTitle),
    postTitle: text(animal.postTitle),
    registration: text(animal.registration),
    praRcd4C2orf71: text(animal.praRcd4C2orf71),
    samsKcnj10: text(animal.samsKcnj10),
  }) as MatingObject['self'];

  const out: MatingObject = { slug, name: animal.name, self, grid, dict, coi: { w, dropped: 0 } };
  return cycles.length > 0 ? { ...out, cycles } : out;
}

/**
 * The stored bytes: sorted keys, then `<`, `>`, U+2028 and U+2029 as `\u` sequences (the
 * JSON-LD rule). The Function embeds them in a `<script type="application/json">` block
 * as they are — no parse, no re-escape — and no value can close the block.
 */
export function serialiseMatingObject(obj: MatingObject): string {
  return scriptSafeJson(stableStringify(obj));
}

/** The content hash of the stored bytes — the basis of the incremental publish (R-8.2). */
export function matingHash(serialised: string): string {
  return createHash('sha256').update(serialised).digest('hex').slice(0, 32);
}
