/**
 * One box of the pedigree chart — the shape `payload.ts` stores and `render/bracket.ts`
 * draws, and the one the mating page builds for a planned litter in the browser.
 *
 * Its own module because `payload.ts` imports `node:crypto`, and the browser bundle's
 * typecheck pass (DOM lib, no Node types) fails on that file even for a type-only import.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

/** One box of the pedigree chart. Empty boxes are not emitted at all. */
export interface BracketNode {
  /** Path id: '0' is the subject, then '.S' for sire and '.D' for dam. */
  readonly id: string;
  readonly generation: number;
  readonly name: string;
  /** null when the ancestor is a name on a parent's record and nothing more. */
  readonly slug: string | null;
  readonly preTitle?: string;
  readonly postTitle?: string;
  /** Registration and date of birth: the desktop bracket shows full information in every
   *  cell, including the deepest generation, and the web bracket matches it. */
  readonly registration?: string;
  readonly dob?: string;
  /** True when this box repeats an ancestor already on the path — a true ancestry loop. */
  readonly loop?: true;
}
