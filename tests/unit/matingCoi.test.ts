import { describe, expect, it } from 'vitest';
import { coancestry } from '../../src/mating/coi.ts';
import { populationGenetics, weightVector } from '../../src/publish/mating.ts';
import { brokenEdgesOf, findCycleEdges, withoutCycles } from '../../src/publish/reports.ts';
import { assignSlugs } from '../../src/publish/slugMap.ts';
import { indexKey } from '../../src/publish/key.ts';
import { createGeneticsEngine } from '../../src/vendor/pedigree-insights/genetics.ts';
import { CONTRIBUTION_MAX_GENERATIONS } from '../../src/vendor/pedigree-insights/pedigreeAlgorithm.ts';
import type { Animal } from '../../src/vendor/pedigree-insights/schema.ts';
import { dog, linebredPopulation, lookupOver } from '../helpers/dogs.ts';

/**
 * The litter COI from stored weight vectors, held to the vendored engine.
 *
 * The web computes COI by a different route from the desktop — A = T·D·Tᵀ over
 * precomputed contribution vectors instead of a Meuwissen-Luo pass per query — and the
 * working contract says a web number that disagrees with the desktop's is a defect. So
 * every number here is compared against `createGeneticsEngine`, the desktop's own code,
 * on the same synthetic lookup.
 *
 * [DRAFT — requires Yuliya's review]
 */

const TOL = 1e-9;

/** Everything the publish holds for a population: cut lookup, slugs, F/D, vectors. */
function setUp(animals: readonly Animal[]) {
  const raw = lookupOver(animals);
  const cycles = findCycleEdges(animals, raw);
  const lookup = withoutCycles(raw, brokenEdgesOf(cycles));
  const { slugByKey } = assignSlugs(animals);
  const genetics = populationGenetics(animals, lookup);
  const w = (name: string) => weightVector(lookup, genetics, slugByKey, lookup(name)!);
  return { lookup, cycles, slugByKey, genetics, w, engine: createGeneticsEngine(lookup) };
}

/** A line-bred population with one-parent dogs and name-only parents mixed in. */
function mixedPopulation(): Animal[] {
  const base = linebredPopulation(7, 6, 7, 3);
  return base.map((a, i) => {
    // Every 11th pup has its dam known only as a name, every 13th has no dam recorded:
    // the two ways a line ends, and the two one-parent cases of the Mendelian rule.
    if (a.sire == null) return a;
    if (i % 11 === 0) return { ...a, dam: `NAME ONLY BITCH ${i}` };
    if (i % 13 === 0) return { ...a, dam: null };
    if (i % 17 === 0) return { ...a, sire: null };
    return a;
  });
}

describe('populationGenetics — every dog’s F (task 2.1)', () => {
  it('matches the vendored engine’s inbreeding for every dog, within 1e-9', () => {
    const animals = mixedPopulation();
    const { genetics, engine } = setUp(animals);
    // The fixture is only worth something if it really is line-bred and really mixed.
    const inbred = animals.filter((a) => engine.inbreeding(a.name) > 0.01).length;
    expect(inbred).toBeGreaterThan(20);
    expect(animals.some((a) => a.dam?.startsWith('NAME ONLY'))).toBe(true);
    expect(animals.some((a) => a.sire != null && a.dam == null)).toBe(true);
    expect(animals.some((a) => a.sire == null && a.dam != null)).toBe(true);

    for (const a of animals) {
      expect(Math.abs(genetics.F.get(indexKey(a.name)!)! - engine.inbreeding(a.name))).toBeLessThan(TOL);
    }
  });

  it('agrees with the sire × dam form: F_X = f(sire, dam) from the stored vectors', () => {
    // The identity the browser relies on, checked from the publish side: a dog's own F,
    // computed from its own vector, equals the coancestry of its parents' vectors.
    const animals = mixedPopulation();
    const { genetics, lookup, w } = setUp(animals);
    let checked = 0;
    for (const a of animals) {
      const x = lookup(a.name)!;
      if (x.sire == null || x.dam == null || !lookup(x.sire) || !lookup(x.dam)) continue;
      expect(Math.abs(coancestry(w(x.sire), w(x.dam)) - genetics.F.get(indexKey(x.name)!)!)).toBeLessThan(TOL);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('gives a founder F = 0 and D = 1, a one-parent dog D = 0.75 − ¼F(parent)', () => {
    const animals = [dog('FOUNDER'), dog('PUP', { sire: 'FOUNDER', dam: 'UNHELD' })];
    const { genetics } = setUp(animals);
    expect(genetics.F.get('founder')).toBe(0);
    expect(genetics.D.get('founder')).toBe(1);
    expect(genetics.D.get('pup')).toBe(0.75);
  });

  it('is iterative: a 60-generation line does not touch the stack', () => {
    const chain = [dog('CHAIN 0')];
    for (let i = 1; i <= 60; i += 1) chain.push(dog(`CHAIN ${i}`, { sire: `CHAIN ${i - 1}` }));
    expect(() => setUp(chain)).not.toThrow();
  });
});

describe('weight vectors and coancestry (task 2.2)', () => {
  /** Two founders, their litter, and the crosses each test needs. */
  function family(): Animal[] {
    return [
      dog('SIRE A', { sex: 'M' }),
      dog('DAM B', { sex: 'F' }),
      dog('DAM C', { sex: 'F' }),
      dog('OTHER M', { sex: 'M' }),
      dog('OTHER F', { sex: 'F' }),
      // Full siblings (A × B) and a half sibling (A × C).
      dog('FULL 1', { sex: 'M', sire: 'SIRE A', dam: 'DAM B' }),
      dog('FULL 2', { sex: 'F', sire: 'SIRE A', dam: 'DAM B' }),
      dog('HALF 1', { sex: 'F', sire: 'SIRE A', dam: 'DAM C' }),
      // An unrelated pair.
      dog('UNREL M', { sex: 'M', sire: 'OTHER M', dam: 'OTHER F' }),
    ];
  }

  const pairs: [string, string, string][] = [
    ['half-sib', 'FULL 1', 'HALF 1'],
    ['full-sib', 'FULL 1', 'FULL 2'],
    ['backcross (parent × offspring)', 'SIRE A', 'FULL 2'],
    ['unrelated', 'FULL 1', 'UNREL M'],
  ];

  for (const [label, s, d] of pairs) {
    it(`${label}: matches vendored coancestry within 1e-9`, () => {
      const { w, engine } = setUp(family());
      expect(Math.abs(coancestry(w(s), w(d)) - engine.coancestry(s, d))).toBeLessThan(TOL);
    });
  }

  it('textbook values: full-sib 0.25, half-sib 0.125, unrelated 0', () => {
    const { w } = setUp(family());
    expect(coancestry(w('FULL 1'), w('FULL 2'))).toBeCloseTo(0.25, 12);
    expect(coancestry(w('FULL 1'), w('HALF 1'))).toBeCloseTo(0.125, 12);
    expect(coancestry(w('FULL 1'), w('UNREL M'))).toBe(0);
  });

  it('deep line-bred pairs: every male × female of the last generations matches the engine', () => {
    const animals = linebredPopulation(42, 8, 9, 3);
    const { w, engine } = setUp(animals);
    const late = animals.filter((a) => /^GEN[89] /.test(a.name));
    const males = late.filter((a) => a.sex === 'M').slice(0, 8);
    const females = late.filter((a) => a.sex === 'F').slice(0, 8);
    let maxCoi = 0;
    for (const m of males) {
      for (const f of females) {
        const ours = coancestry(w(m.name), w(f.name));
        expect(Math.abs(ours - engine.coancestry(m.name, f.name))).toBeLessThan(TOL);
        maxCoi = Math.max(maxCoi, ours);
      }
    }
    expect(maxCoi).toBeGreaterThan(0.1); // the fixture really is line-bred
  });

  it('stores the dog itself, slugs sorted, weights at 12 significant digits', () => {
    const { w, slugByKey } = setUp(family());
    const v = w('FULL 1');
    const slugs = v.map(([s]) => s);
    expect(slugs).toContain(slugByKey.get('full 1'));
    expect([...slugs].sort()).toEqual(slugs);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const [, x] of v) expect(Number(x.toPrecision(12))).toBe(x);
    // Self: √D with two founder parents = √0.5; each parent: ½·√1.
    expect(v.find(([s]) => s === slugByKey.get('full 1'))![1]).toBe(Number(Math.SQRT1_2.toPrecision(12)));
    expect(v.find(([s]) => s === slugByKey.get('sire a'))![1]).toBe(0.5);
  });
});

describe('the contribution cap (task 2.3)', () => {
  it('fails the publish, naming the dog, when a pedigree reaches the cap', () => {
    const chain = [dog('CHAIN 0')];
    for (let i = 1; i <= CONTRIBUTION_MAX_GENERATIONS + 2; i += 1) {
      chain.push(dog(`CHAIN ${i}`, { sire: `CHAIN ${i - 1}` }));
    }
    // CHAIN 64 is the first dog with 64 generations behind it.
    expect(() => setUp(chain)).toThrow(`"CHAIN ${CONTRIBUTION_MAX_GENERATIONS}"`);
    expect(() => setUp(chain)).toThrow(/reaches 64 generations/);
  });

  it('passes a pedigree one generation short of the cap', () => {
    const chain = [dog('CHAIN 0')];
    for (let i = 1; i < CONTRIBUTION_MAX_GENERATIONS; i += 1) {
      chain.push(dog(`CHAIN ${i}`, { sire: `CHAIN ${i - 1}` }));
    }
    expect(() => setUp(chain)).not.toThrow();
  });
});
