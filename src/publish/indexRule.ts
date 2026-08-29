/**
 * Which pages are offered to search engines.
 *
 * Publication and indexing are independent decisions (PRD R-1.3): every dog gets a page,
 * a subset gets a place in the sitemap and no `noindex`. This file is the subset rule, on
 * its own, because it is the one product decision scheduled to be revisited — the indexed
 * set is reviewed a month after launch (R-1.4, AC-14), and the agreed widening is simply
 * dropping the depth condition. That should be a one-line change in one file.
 *
 * The MVP rule: **recorded offspring AND a complete five-generation pedigree** — 3,449 of
 * 62,467 dogs as measured on 2026-08-28.
 *
 * The counting rule for "complete" is the owner's, and it is not the obvious one: a
 * generation counts as present when the ancestor's NAME appears on the record one
 * generation closer, even where that ancestor has no record of its own. It is the rule the
 * measurement used, so keeping it means the review can compare like with like instead of
 * re-measuring.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import type { Animal } from '../vendor/pedigree-insights/schema';
import type { RelationsIndex } from './relations';
import { indexKey } from './key';

/** Generations required by the MVP rule. */
export const REQUIRED_GENERATIONS = 5;

export interface IndexRule {
  /** A short name, written into the run report so a publish says which rule it applied. */
  readonly name: string;
  isIndexed(animal: Animal): boolean;
}

/** A parent field that holds something. Blank and NULL both mean "not recorded". */
function filled(value: string | null | undefined): boolean {
  return value != null && value.trim() !== '';
}

/**
 * Is this dog's pedigree complete to `generations`?
 *
 * Memoised across the whole run — the same ancestors are asked about tens of thousands of
 * times. Termination is guaranteed by the counter, which strictly decreases on every step;
 * the `false` seeded into the memo before recursing is a second guard that would catch a
 * future change in which it did not.
 *
 * **A dog inside an ancestry loop counts as complete**, and that is not an oversight. The
 * counting rule asks only whether a name is recorded at each level, and in a loop every
 * level has one. It is also the behaviour the 2026-08-28 measurement had, so keeping it
 * means the one-month review compares like with like instead of re-measuring. Such dogs
 * are a handful, and a looping bracket is visible on the page, which marks the repeat.
 */
export function makeCompletenessTest(
  byKey: ReadonlyMap<string, Animal>,
): (key: string, generations: number) => boolean {
  const memo = new Map<string, boolean>();

  return function completeTo(key: string, generations: number): boolean {
    if (generations <= 0) return true;
    const memoKey = `${key} ${generations}`;
    const hit = memo.get(memoKey);
    if (hit !== undefined) return hit;
    memo.set(memoKey, false);

    const row = byKey.get(key);
    let result = false;
    if (row && filled(row.sire) && filled(row.dam)) {
      if (generations === 1) {
        result = true;
      } else {
        const s = indexKey(row.sire);
        const d = indexKey(row.dam);
        result =
          s != null &&
          d != null &&
          completeTo(s, generations - 1) &&
          completeTo(d, generations - 1);
      }
    }
    memo.set(memoKey, result);
    return result;
  };
}

/**
 * The MVP rule (PRD §7.3): a producer with a complete five-generation pedigree.
 *
 * The known cost is recorded in the PRD rather than worked around here: the depth
 * condition excludes the breed's founders, because a foundation import has no five
 * generations behind it. Every one of those dogs is still published and still reachable.
 */
export function producersWithCompletePedigree(
  byKey: ReadonlyMap<string, Animal>,
  relations: RelationsIndex,
  generations: number = REQUIRED_GENERATIONS,
): IndexRule {
  const completeTo = makeCompletenessTest(byKey);
  return {
    name: `producers with a complete ${generations}-generation pedigree`,
    isIndexed(animal: Animal): boolean {
      const key = indexKey(animal.name);
      if (key == null) return false;
      return relations.isProducer(key) && completeTo(key, generations);
    },
  };
}

/**
 * The agreed widening, kept ready rather than described in prose: producers, any depth.
 * 11,329 dogs, no founder exclusion. Switch to this after the one-month review (R-1.4).
 */
export function producers(relations: RelationsIndex): IndexRule {
  return {
    name: 'producers (any pedigree depth)',
    isIndexed(animal: Animal): boolean {
      const key = indexKey(animal.name);
      return key != null && relations.isProducer(key);
    },
  };
}
