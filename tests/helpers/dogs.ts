/**
 * Synthetic dogs for the publish tests.
 *
 * Every fixture in this repository is invented. The working contract forbids a fixture
 * built from real data — the master holds living people's records, and a test file is the
 * least controlled thing in a repository.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import type { Animal } from '../../src/vendor/pedigree-insights/schema.ts';

/** An animal with everything absent except what the test cares about. */
export function dog(name: string, extra: Partial<Animal> = {}): Animal {
  return {
    name,
    sire: null,
    dam: null,
    sex: null,
    dob: null,
    registration: null,
    preTitle: null,
    postTitle: null,
    color: null,
    breed: null,
    coi: null,
    avk: null,
    fields: {},
    ...extra,
  };
}

/**
 * A small kennel: two founders, a litter of three, and a second generation.
 *
 * ALFA and BETA are the founders. Their litter is GAMMA, DELTA and EPSILON. GAMMA is bred
 * to ZETA (recorded) and to a bitch known only as a name, so both offspring cases appear.
 */
export function sampleKennel(): Animal[] {
  return [
    dog('KENNEL ALFA', { sex: 'M', registration: 'REG-1', dob: '1990-01-01 00:00:00' }),
    dog('KENNEL BETA', { sex: 'F', registration: 'REG-2', dob: '1990-02-01 00:00:00' }),
    dog('KENNEL GAMMA', {
      sex: 'M',
      registration: 'REG-3',
      dob: '1993-03-01 00:00:00',
      sire: 'KENNEL ALFA',
      dam: 'KENNEL BETA',
    }),
    dog('KENNEL DELTA', {
      sex: 'F',
      registration: 'REG-4',
      dob: '1993-03-01 00:00:00',
      sire: 'KENNEL ALFA',
      dam: 'KENNEL BETA',
    }),
    dog('KENNEL EPSILON', {
      sex: 'F',
      registration: 'REG-5',
      dob: '1995-05-01 00:00:00',
      sire: 'KENNEL ALFA',
      dam: 'OTHER BITCH',
    }),
    dog('KENNEL ZETA', { sex: 'F', registration: 'REG-6', dob: '1994-04-01 00:00:00' }),
    dog('KENNEL ETA', {
      sex: 'M',
      registration: 'REG-7',
      dob: '1997-07-01 00:00:00',
      sire: 'KENNEL GAMMA',
      dam: 'KENNEL ZETA',
    }),
    dog('KENNEL THETA', {
      sex: 'F',
      registration: 'REG-8',
      dob: '1998-08-01 00:00:00',
      sire: 'KENNEL GAMMA',
      dam: 'UNRECORDED BITCH',
    }),
  ];
}

/** A lookup over a list of animals, matching the case-insensitive source contract. */
export function lookupOver(animals: readonly Animal[]): (name: string) => Animal | null {
  const byKey = new Map(animals.map((a) => [a.name.trim().toLowerCase(), a]));
  return (name: string) => byKey.get(name.trim().toLowerCase()) ?? null;
}

/** The `byKey` map the index rule and the payload builder expect. */
export function byKeyOver(animals: readonly Animal[]): Map<string, Animal> {
  return new Map(animals.map((a) => [a.name.trim().toLowerCase(), a]));
}

/**
 * A deterministic, deliberately line-bred population (the generator `reports.test.ts`
 * uses, shared here for the mating tests).
 *
 * Founders first, then litters whose parents come from the previous two generations with
 * a heavy bias towards a few popular sires — what a closed breed looks like. Same seed,
 * same dogs, every run, so a parity test fails for a reason and not a random one.
 */
export function linebredPopulation(
  seed: number,
  founders: number,
  generations: number,
  litterSize: number,
): Animal[] {
  let s = seed >>> 0;
  const rnd = () => {
    // xorshift32
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
  const all: Animal[] = [];
  let males: Animal[] = [];
  let females: Animal[] = [];
  for (let i = 0; i < founders; i += 1) {
    const sex = i % 2 === 0 ? 'M' : 'F';
    const a = dog(`FOUNDER ${i}`, { sex, registration: `F${i}` });
    all.push(a);
    (sex === 'M' ? males : females).push(a);
  }
  let n = 0;
  for (let g = 1; g <= generations; g += 1) {
    const nextM: Animal[] = [];
    const nextF: Animal[] = [];
    const litters = Math.max(2, Math.floor(females.length / 2));
    for (let l = 0; l < litters; l += 1) {
      const sire = males[Math.floor(rnd() ** 3 * males.length)];
      const dam = females[Math.floor(rnd() * females.length)];
      for (let p = 0; p < litterSize; p += 1) {
        const sex = rnd() < 0.5 ? 'M' : 'F';
        const a = dog(`GEN${g} PUP ${n}`, { sex, registration: `P${n}`, sire: sire.name, dam: dam.name });
        n += 1;
        all.push(a);
        (sex === 'M' ? nextM : nextF).push(a);
      }
    }
    males = [...nextM, ...males.slice(0, 3)];
    females = [...nextF, ...females.slice(0, 3)];
  }
  return all;
}
