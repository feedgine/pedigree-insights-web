/**
 * The shape of a stored mating object, and the grid arithmetic — shared by the publish,
 * which writes the objects, and the browser bundle, which reads them.
 *
 * Its own module, with no Node dependency, for the reason `reportModel.ts` and
 * `constants.ts` have theirs: `publish/mating.ts` hashes with `node:crypto`, and the
 * bundle's typecheck pass (DOM lib, no Node types) would fail on it even for a type-only
 * import, because the compiler still loads the file.
 *
 * [DRAFT — requires Yuliya's review]
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import type { CycleEdge } from '../publish/reportModel';
import type { Weights } from './coi';

/** Generations of ancestors in the grid: the litter at depth 10 is one deeper. */
export const MATING_GRID_GENERATIONS = 9;

/** Slots in the grid: the dog at 0, then 2 + 4 + … + 512 ancestors in heap order. */
export const MATING_GRID_SLOTS = 2 ** (MATING_GRID_GENERATIONS + 1) - 1;

/** Slots 1–14 are generations 1–3, the only cells the litter bracket draws. */
export const BRACKET_LAST_SLOT = 2 ** 4 - 2;

/** One distinct ancestor in a dog's grid. */
export interface MatingDictEntry {
  readonly name: string;
  /** null when the ancestor is a name on a parent's record and nothing more (R-2.3). */
  readonly slug: string | null;
  readonly sex?: 'M' | 'F';
  /** Parent names as the (cycle-cut) record gives them, so a synthetic lookup can answer
   *  the vendored code as the database would. Absent on a name-only entry. */
  readonly sire?: string;
  readonly dam?: string;
  /** Bracket-only fields: kept only for an ancestor within generations 1–3. */
  readonly preTitle?: string;
  readonly postTitle?: string;
  readonly registration?: string;
  readonly dob?: string;
}

export interface MatingObject {
  readonly slug: string;
  readonly name: string;
  readonly self: {
    readonly sex?: 'M' | 'F';
    readonly dob?: string;
    readonly preTitle?: string;
    readonly postTitle?: string;
    readonly registration?: string;
    readonly praRcd4C2orf71?: string;
    readonly samsKcnj10?: string;
  };
  /** Broken cycle edges inside this dog's ancestry, so the page can say which. */
  readonly cycles?: readonly CycleEdge[];
  /** 1023 slots: slot 0 is the dog (always null, see `self`), slot i's sire at 2i+1 and
   *  dam at 2i+2; each non-null value indexes `dict`. */
  readonly grid: readonly (number | null)[];
  readonly dict: readonly MatingDictEntry[];
  readonly coi: { readonly w: Weights; readonly dropped: number };
}
