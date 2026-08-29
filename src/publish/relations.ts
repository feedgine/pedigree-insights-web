/**
 * Offspring, mates and full siblings — the "downward" and "sideways" halves of the page.
 *
 * The pedigree bracket looks up; PRD R-2.4 and R-2.5 look down and sideways. Both are
 * answered here, and both are built in ONE pass over the population rather than by asking
 * a question per dog: at 62,475 dogs, "who are this dog's children?" asked once per dog is
 * a self-join done 62,475 times. The publish is a batch job, but it is a batch job the
 * owner runs by hand and waits for.
 *
 * **Offspring are one generation.** Direct children only — dogs whose `Sire` or `Dam` is
 * this dog. No descendant tree: a grandchild is reached by opening a puppy's own page.
 *
 * **Half siblings are not computed at all** (owner decision, 2026-08-28). They were 528 MB
 * of an 860 MB extract — 4.86 million entries — because a sire with N offspring puts N-1
 * half siblings on each of N pages, and one sire in this database has about 758. The page
 * shows own puppies and full siblings; the rest of a sire's get is his own page.
 *
 * Relationships are **name-primary** (PRD §8.1): `Sire` and `Dam` hold the parent's name.
 * A parent may therefore be a full record or a bare name, and both are normal. Grouping is
 * by the same case-insensitive key the rest of the pipeline uses, so a mate written with
 * different capitalisation on two litters is still one mate.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import type { Animal } from '../vendor/pedigree-insights/schema';
import { indexKey } from './key';

/** A dog's offspring by one mate. The mate may have no record of its own. */
export interface MateGroup {
  /** The mate's name as stored, or null when the other parent is unrecorded. */
  readonly mate: string | null;
  /** Index key of the mate, or null when unrecorded. */
  readonly mateKey: string | null;
  /** True when the mate has a record of its own, and so a page to link to. */
  readonly mateHasRecord: boolean;
  readonly offspring: readonly Animal[];
}

export interface RelationsIndex {
  /** Direct offspring of a dog, in a stable order. Empty for a non-producer. */
  offspringOf(key: string): readonly Animal[];
  /** The same offspring, grouped by the other parent (PRD R-2.4). */
  offspringByMate(animal: Animal): readonly MateGroup[];
  /** Siblings sharing BOTH parents (PRD R-2.5). Half siblings are out of scope. */
  fullSiblingsOf(animal: Animal): readonly Animal[];
  /** True when the dog has at least one recorded offspring — the MVP index rule (R-1.2). */
  isProducer(key: string): boolean;
  /** How many recorded offspring a dog has. Used by the index rule and the hubs. */
  offspringCount(key: string): number;
}

/**
 * Order offspring and siblings the same way everywhere: oldest first, then by name.
 *
 * Determinism is not cosmetic here. The page payload is content-hashed to decide whether a
 * dog changed since the last publish (PRD R-8.2); an unstable order would make every dog
 * look changed on every run and turn an incremental publish back into a full one.
 */
function byBirthThenName(a: Animal, b: Animal): number {
  const da = a.dob ?? '';
  const db = b.dob ?? '';
  if (da !== db) {
    if (da === '') return 1;
    if (db === '') return -1;
    return da < db ? -1 : 1;
  }
  return a.name.localeCompare(b.name, 'en');
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) map.set(key, [value]);
  else list.push(value);
}

/**
 * Build the index.
 *
 * One pass fills two maps: children by parent, and children by the (sire, dam) pair for
 * full siblings. A dog listed as its own parent is skipped rather than allowed to become
 * its own child — real data contains such rows, and a self-referencing offspring list
 * would render as a page linking to itself.
 */
export function buildRelations(animals: readonly Animal[]): RelationsIndex {
  const byPair = new Map<string, Animal[]>();
  const byParent = new Map<string, Animal[]>();
  /** Every dog that has a record, so a mate can be told from a bare name in O(1). */
  const known = new Set<string>();

  for (const a of animals) {
    const k = indexKey(a.name);
    if (k != null) known.add(k);
  }

  for (const child of animals) {
    const childKey = indexKey(child.name);
    const sireKey = indexKey(child.sire);
    const damKey = indexKey(child.dam);

    if (sireKey != null && sireKey !== childKey) push(byParent, sireKey, child);
    if (damKey != null && damKey !== childKey && damKey !== sireKey) {
      push(byParent, damKey, child);
    }
    if (sireKey != null && damKey != null) push(byPair, `${sireKey} ${damKey}`, child);
  }

  for (const list of byParent.values()) list.sort(byBirthThenName);
  for (const list of byPair.values()) list.sort(byBirthThenName);

  const empty: readonly Animal[] = [];
  const offspringOf = (key: string): readonly Animal[] => byParent.get(key) ?? empty;

  const offspringByMate = (animal: Animal): readonly MateGroup[] => {
    const key = indexKey(animal.name);
    if (key == null) return [];
    const children = offspringOf(key);
    if (children.length === 0) return [];

    const groups = new Map<
      string,
      { mate: string | null; mateKey: string | null; offspring: Animal[] }
    >();
    for (const child of children) {
      // The mate is whichever parent is not this dog. Where the dog stands as both parents
      // of a row — bad data — the mate is treated as unrecorded rather than as itself.
      const mateName = indexKey(child.sire) === key ? child.dam : child.sire;
      const mateKey = indexKey(mateName);
      const bucket = mateKey ?? '';
      const existing = groups.get(bucket);
      if (existing === undefined) {
        groups.set(bucket, {
          mate: mateKey == null ? null : (mateName?.trim() ?? null),
          mateKey,
          offspring: [child],
        });
      } else {
        existing.offspring.push(child);
      }
    }

    return [...groups.values()]
      .map((g) => ({
        mate: g.mate,
        mateKey: g.mateKey,
        mateHasRecord: g.mateKey != null && known.has(g.mateKey),
        offspring: g.offspring.sort(byBirthThenName),
      }))
      .sort((a, b) => {
        if (a.mate === null) return 1; // the unrecorded-mate group goes last
        if (b.mate === null) return -1;
        return a.mate.localeCompare(b.mate, 'en');
      });
  };

  const fullSiblingsOf = (animal: Animal): readonly Animal[] => {
    const key = indexKey(animal.name);
    const sireKey = indexKey(animal.sire);
    const damKey = indexKey(animal.dam);
    if (key == null || sireKey == null || damKey == null) return empty;
    return (byPair.get(`${sireKey} ${damKey}`) ?? empty).filter(
      (a) => indexKey(a.name) !== key,
    );
  };

  return {
    offspringOf,
    offspringByMate,
    fullSiblingsOf,
    isProducer: (key: string) => (byParent.get(key)?.length ?? 0) > 0,
    offspringCount: (key: string) => byParent.get(key)?.length ?? 0,
  };
}
