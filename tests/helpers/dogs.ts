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
