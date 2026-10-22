import { describe, expect, it } from 'vitest';
import { computeMating, type MatingAnalysis } from '../../src/mating/compute.ts';
import {
  buildMatingObject,
  populationGenetics,
  serialiseMatingObject,
  type MatingContext,
  type MatingObject,
} from '../../src/publish/mating.ts';
import { brokenEdgesOf, findCycleEdges, withoutCycles } from '../../src/publish/reports.ts';
import { assignSlugs } from '../../src/publish/slugMap.ts';
import {
  buildHypotheticalMating,
  type HypotheticalMatingReport,
} from '../../src/vendor/pedigree-insights/hypotheticalMating.ts';
import type { AncestorCrosses } from '../../src/vendor/pedigree-insights/linebreeding.ts';
import type { Animal } from '../../src/vendor/pedigree-insights/schema.ts';
import { dog, linebredPopulation, lookupOver, sampleKennel } from '../helpers/dogs.ts';

/**
 * The browser analysis, held to the desktop's own `buildHypotheticalMating` (task 6.1).
 *
 * The web runs the vendored modules on a lookup made from two stored objects instead of
 * the database, and takes the litter COI from weight vectors instead of a Meuwissen-Luo
 * pass. Both substitutions are only acceptable if the output is the desktop's, so every
 * pair here is computed both ways on the same synthetic, cycle-cut population — the
 * objects going through their stored bytes, exactly as the page receives them.
 *
 * [DRAFT — requires Yuliya's review]
 */

const DEPTHS = [3, 5, 10] as const;
const AS_OF = new Date('2026-10-22T00:00:00Z');

function setUp(animals: readonly Animal[]) {
  const raw = lookupOver(animals);
  const cycles = findCycleEdges(animals, raw);
  const lookup = withoutCycles(raw, brokenEdgesOf(cycles));
  const ctx: MatingContext = {
    lookup,
    slugByKey: assignSlugs(animals).slugByKey,
    genetics: populationGenetics(animals, lookup),
    cycles,
  };
  /** The object as the browser gets it: serialised, embedded, parsed back. */
  const stored = (name: string) =>
    JSON.parse(serialiseMatingObject(buildMatingObject(ctx, lookup(name)!))) as MatingObject;
  return { lookup, cycles, stored };
}

/**
 * A common-ancestor row without what the web deliberately does not carry: `animal` is the
 * record the walk resolved (the database row on the desktop, the synthetic one here), and
 * `coi`/`agr` are per-ancestor genetics columns `applyGenetics` fills and the mating page
 * does not show.
 */
function row(a: AncestorCrosses) {
  const { animal: _animal, coi: _coi, agr: _agr, ...rest } = a;
  return rest;
}

function expectParity(web: MatingAnalysis, desk: HypotheticalMatingReport): void {
  expect(web.generations).toBe(desk.generations);
  expect(web.commonAncestors.map(row)).toEqual(desk.commonAncestors.map(row));
  expect(web.uniqueAncestors).toBe(desk.uniqueAncestors);
  expect(web.totalCrosses).toBe(desk.totalCrosses);
  expect(web.litterAvk).toBe(desk.litterAvk);
  expect(web.classification).toEqual(desk.classification);
  expect(web.warnings).toEqual(desk.warnings);
  // Both are percentages; the tolerance is on the fraction.
  expect(Math.abs(web.litterCoi / 100 - desk.litterCoi! / 100)).toBeLessThan(1e-9);
  expect(web.litterCoiBound).toBe(0);
}

/** Run every pair at every depth; returns how many rows were compared, and how many of
 *  them reach generation 10 — the last row of a parent's nine-generation grid. */
function checkPairs(animals: readonly Animal[], pairs: readonly [string, string][]) {
  expect(pairs.length).toBeGreaterThan(0);
  const { lookup, stored } = setUp(animals);
  let rows = 0;
  let atTen = 0;
  for (const [s, d] of pairs) {
    for (const g of DEPTHS) {
      const web = computeMating(stored(s), stored(d), g, AS_OF);
      const desk = buildHypotheticalMating(lookup, s, d, g, AS_OF);
      expectParity(web, desk);
      rows += web.commonAncestors.length;
      atTen += web.commonAncestors.filter((a) => a.occurrences.some((o) => o.generation === 10)).length;
    }
  }
  return { rows, atTen };
}

/** Up to `n` males × `n` females from the last generations of a generated population. */
function latePairs(animals: readonly Animal[], pattern: RegExp, n: number): [string, string][] {
  const late = animals.filter((a) => pattern.test(a.name));
  const males = late.filter((a) => a.sex === 'M').slice(0, n);
  const females = late.filter((a) => a.sex === 'F').slice(0, n);
  return males.flatMap((m) => females.map((f): [string, string] => [m.name, f.name]));
}

describe('computeMating matches buildHypotheticalMating (task 6.1)', () => {
  it('a twelve-generation line-bred population, at g = 3, 5 and 10', () => {
    // Twelve generations behind the pups, so at g = 10 the walk reaches the last row of
    // both grids and the grid boundary itself is under test.
    const animals = linebredPopulation(42, 8, 12, 3);
    const { rows, atTen } = checkPairs(animals, latePairs(animals, /^GEN1[12] /, 4));
    expect(rows).toBeGreaterThan(100); // the fixture really has common ancestors
    expect(atTen).toBeGreaterThan(0); // …and some are only reached at the grid's last row
  });

  it('a common ancestor met only in the last row of both grids, at g = 10', () => {
    // A bitch nine generations behind each parent and nowhere nearer: the litter meets her
    // only at generation 10, so only the grid's ninth row can resolve her. In a line-bred
    // fixture almost every deep ancestor also sits nearer in one of the grids, which
    // hides an off-by-one generation in the grid; this cannot.
    const animals: Animal[] = [dog('DEEP MATRIARCH', { sex: 'F' })];
    for (const side of ['S', 'D'] as const) {
      let child = 'DEEP MATRIARCH';
      for (let g = 8; g >= 0; g -= 1) {
        const name = g === 0 ? `${side} PARENT` : `${side} LINE ${g}`;
        const sex = g === 0 ? (side === 'S' ? 'M' : 'F') : 'M';
        animals.push(dog(`${side} MATE ${g}`, { sex: sex === 'M' ? 'F' : 'M' }));
        animals.push(dog(name, {
          sex,
          ...(sex === 'M' ? { dam: child, sire: `${side} MATE ${g}` } : { sire: child, dam: `${side} MATE ${g}` }),
        }));
        child = name;
      }
    }
    const { stored } = setUp(animals);
    const web = computeMating(stored('S PARENT'), stored('D PARENT'), 10, AS_OF);
    expect(web.commonAncestors.map((a) => [a.name, a.notation])).toEqual([['DEEP MATRIARCH', '10s x 10d']]);
    expect(computeMating(stored('S PARENT'), stored('D PARENT'), 9, AS_OF).commonAncestors).toEqual([]);
    checkPairs(animals, [['S PARENT', 'D PARENT']]);
  });

  it('close relatives: full siblings, half siblings, parent × offspring', () => {
    const animals = linebredPopulation(7, 6, 7, 3);
    const lookup = lookupOver(animals);
    const pups = animals.filter((a) => a.sire != null);
    const pairs: [string, string][] = [];
    for (const a of pups) {
      for (const b of pups) {
        if (a.sex !== 'M' || b.sex !== 'F') continue;
        const full = a.sire === b.sire && a.dam === b.dam;
        const half = (a.sire === b.sire) !== (a.dam === b.dam);
        if ((full || half) && pairs.length < 12) pairs.push([a.name, b.name]);
      }
      const dam = lookup(a.dam ?? '');
      if (a.sex === 'M' && dam && pairs.length < 16) pairs.push([a.name, dam.name]);
    }
    expect(pairs.length).toBeGreaterThan(8);
    checkPairs(animals, pairs);
  });

  it('one-parent dogs and parents known only by name', () => {
    const animals = linebredPopulation(7, 6, 7, 3).map((a, i) => {
      if (a.sire == null) return a;
      if (i % 11 === 0) return { ...a, dam: `NAME ONLY BITCH ${i}` };
      if (i % 13 === 0) return { ...a, dam: null };
      if (i % 17 === 0) return { ...a, sire: null };
      return a;
    });
    checkPairs(animals, latePairs(animals, /^GEN[67] /, 4));
  });

  it('the sample kennel, including a parent whose dam is a bare name', () => {
    checkPairs(sampleKennel(), [
      ['KENNEL GAMMA', 'KENNEL DELTA'], // full siblings
      ['KENNEL GAMMA', 'KENNEL EPSILON'], // half siblings, one dam unrecorded
      ['KENNEL ETA', 'KENNEL THETA'], // paternal half siblings
      ['KENNEL ALFA', 'KENNEL ZETA'], // outcross of founders
    ]);
  });

  it('warnings: two males, out-of-window ages, carrier × carrier', () => {
    const animals = [
      dog('OLD SIRE', { sex: 'M', dob: '2010-01-01 00:00:00', praRcd4C2orf71: 'Carrier' }),
      dog('YOUNG DAM', { sex: 'F', dob: '2026-03-01 00:00:00', praRcd4C2orf71: ' N/m ' }),
      dog('SECOND MALE', { sex: 'M', dob: '2020-01-01 00:00:00', samsKcnj10: 'm/m' }),
      dog('CLEAR DAM', { sex: 'F', dob: '2021-01-01 00:00:00', samsKcnj10: 'N/N' }),
    ];
    const { lookup, stored } = setUp(animals);
    const pairs: [string, string][] = [
      ['OLD SIRE', 'YOUNG DAM'],
      ['OLD SIRE', 'SECOND MALE'],
      ['SECOND MALE', 'CLEAR DAM'],
    ];
    for (const [s, d] of pairs) {
      const web = computeMating(stored(s), stored(d), 5, AS_OF);
      expectParity(web, buildHypotheticalMating(lookup, s, d, 5, AS_OF));
    }
    const kinds = computeMating(stored('OLD SIRE'), stored('YOUNG DAM'), 5, AS_OF).warnings.map((w) => w.kind);
    expect(kinds).toEqual(['dam-age', 'sire-age', 'health']);
    expect(computeMating(stored('OLD SIRE'), stored('SECOND MALE'), 5, AS_OF).warnings[0].kind).toBe('sex');
  });

  it('a pedigree with a cycle: the cut edge is read as unrecorded both ways, and reported', () => {
    // B's sire is recorded as its own grandchild: B → C → D → B.
    const animals = [
      dog('A', { sex: 'M' }),
      dog('M', { sex: 'F' }),
      dog('B', { sex: 'M', sire: 'D', dam: 'M' }),
      dog('C', { sex: 'M', sire: 'B', dam: 'M' }),
      dog('D', { sex: 'M', sire: 'C', dam: 'M' }),
      dog('E', { sex: 'F', sire: 'C', dam: 'M' }),
      dog('F', { sex: 'M', sire: 'A', dam: 'E' }),
    ];
    checkPairs(animals, [['F', 'E'], ['D', 'E'], ['A', 'E']]);
    const { cycles, stored } = setUp(animals);
    const web = computeMating(stored('F'), stored('E'), 5, AS_OF);
    expect(web.cycles).toEqual([...cycles]);
    expect(computeMating(stored('A'), stored('M'), 5, AS_OF).cycles).toEqual([]);
  });

  it('clamps the depth to 3–10 as the desktop does', () => {
    const animals = sampleKennel();
    const { lookup, stored } = setUp(animals);
    for (const g of [0, 1, 11, 40]) {
      const web = computeMating(stored('KENNEL GAMMA'), stored('KENNEL DELTA'), g, AS_OF);
      expectParity(web, buildHypotheticalMating(lookup, 'KENNEL GAMMA', 'KENNEL DELTA', g, AS_OF));
    }
  });
});
