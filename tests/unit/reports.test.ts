import { describe, expect, it } from 'vitest';
import {
  brokenEdgesOf,
  buildFoundation,
  buildLinebreeding,
  buildReports,
  findCycleEdges,
  reportHash,
  rowStats,
  unmatchedFoundationDogs,
  withoutCycles,
  type ReportContext,
} from '../../src/publish/reports.ts';
import { LINEBREEDING_GENERATIONS, LINEBREEDING_MIN_CROSSES } from '../../src/publish/constants.ts';
import { stableStringify } from '../../src/publish/payload.ts';
import { assignSlugs } from '../../src/publish/slugMap.ts';
import { analyzeLinebreeding } from '../../src/vendor/pedigree-insights/linebreeding.ts';
import { buildFoundationReport } from '../../src/vendor/pedigree-insights/contribution.ts';
import type { Animal } from '../../src/vendor/pedigree-insights/schema.ts';
import { dog, lookupOver } from '../helpers/dogs.ts';

/**
 * A deterministic pseudo-random population, line-bred on purpose.
 *
 * Founders first, then generations of litters whose parents are drawn from the previous
 * two generations with a heavy bias towards a few popular sires — which is what a real
 * closed breed looks like, and what makes a linebreeding report worth having. Same seed,
 * same dogs, every run: the parity test must fail for a reason, not for a random one.
 */
function population(seed: number, founders: number, generations: number, litterSize: number): Animal[] {
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
    const a = dog(`FOUNDER ${i}`, { sex, registration: `F${i}`, coi: i / 100 });
    all.push(a);
    (sex === 'M' ? males : females).push(a);
  }
  let n = 0;
  for (let g = 1; g <= generations; g += 1) {
    const nextM: Animal[] = [];
    const nextF: Animal[] = [];
    const litters = Math.max(2, Math.floor(females.length / 2));
    for (let l = 0; l < litters; l += 1) {
      // Popular-sire bias: the first few males get most of the matings.
      const sire = males[Math.floor(rnd() ** 3 * males.length)];
      const dam = females[Math.floor(rnd() * females.length)];
      for (let p = 0; p < litterSize; p += 1) {
        const sex = rnd() < 0.5 ? 'M' : 'F';
        const a = dog(`GEN${g} PUP ${n}`, { sex, registration: `P${n}`, sire: sire.name, dam: dam.name, coi: (n % 7) / 50 });
        n += 1;
        all.push(a);
        (sex === 'M' ? nextM : nextF).push(a);
      }
    }
    // Keep the previous generation in the pool too, so ancestors repeat at different depths.
    males = [...nextM, ...males.slice(0, 3)];
    females = [...nextF, ...females.slice(0, 3)];
  }
  return all;
}

function contextFor(animals: readonly Animal[], extra: Partial<ReportContext> = {}): ReportContext {
  const lookup = lookupOver(animals);
  const cycles = findCycleEdges(animals, lookup);
  const broken = brokenEdgesOf(cycles);
  return {
    lookup: withoutCycles(lookup, broken),
    slugByKey: assignSlugs(animals).slugByKey,
    broken,
    ...extra,
  };
}

const find = (animals: readonly Animal[], name: string) => animals.find((a) => a.name === name)!;

describe('the layered linebreeding walk agrees with the desktop walk', () => {
  const animals = population(42, 30, 9, 4);
  const ctx = contextFor(animals);
  const lookup = lookupOver(animals);

  it('is a population deep enough to mean something', () => {
    expect(animals.length).toBeGreaterThan(200);
    const deepest = Math.max(
      ...animals.map((a) => analyzeLinebreeding(lookup, a.name, LINEBREEDING_GENERATIONS).generations),
    );
    expect(deepest).toBe(LINEBREEDING_GENERATIONS);
  });

  for (const generations of [LINEBREEDING_GENERATIONS, 6, 3]) {
    it(`matches every row of every dog at ${generations} generations`, () => {
      const gctx = { ...ctx, generations };
      let rowsCompared = 0;
      for (const subject of animals) {
        const web = buildLinebreeding(gctx, subject);
        const desktop = analyzeLinebreeding(lookup, subject.name, generations, LINEBREEDING_MIN_CROSSES);

        expect(web.uniqueAncestors).toBe(desktop.uniqueAncestors);
        expect(web.totalCrosses).toBe(desktop.totalCrosses);
        expect(web.ancestors.map((r) => r.name)).toEqual(desktop.ancestors.map((r) => r.name));

        for (let i = 0; i < web.ancestors.length; i += 1) {
          const w = web.ancestors[i];
          const d = desktop.ancestors[i];
          const s = rowStats(w, generations);
          expect(s.crosses).toBe(d.crosses);
          expect(s.sireLines).toBe(d.sireLines);
          expect(s.damLines).toBe(d.damLines);
          expect(s.closest).toBe(d.closest);
          expect(s.inFinal).toBe(d.inFinalGeneration);
          expect(s.blood * 100).toBeCloseTo(d.bloodPercent as number, 9);
          expect(s.influence).toBe(d.influence);
          // The per-generation counts reproduce the desktop's occurrence list exactly.
          const occurrences = w.occ.flatMap(([gen, s, dd]) => [
            ...Array<string>(s).fill(`${gen}S`),
            ...Array<string>(dd).fill(`${gen}D`),
          ]);
          const desktopOccurrences = d.occurrences
            .map((o) => `${o.generation}${o.side}`)
            .sort((a, b) => Number.parseInt(a) - Number.parseInt(b) || (a < b ? 1 : -1));
          expect(occurrences).toEqual(desktopOccurrences);
          rowsCompared += 1;
        }
      }
      expect(rowsCompared).toBeGreaterThan(generations >= 6 ? 500 : 100);
    });
  }

  it('walks no deeper than the constant and records how deep it got', () => {
    const founder = find(animals, 'FOUNDER 0');
    const empty = buildLinebreeding(ctx, founder);
    expect(empty.reached).toBe(0);
    expect(empty.ancestors).toEqual([]);
    expect(empty.uniqueAncestors).toBe(0);

    const last = animals[animals.length - 1];
    const deep = buildLinebreeding(ctx, last);
    expect(deep.generations).toBe(LINEBREEDING_GENERATIONS);
    expect(deep.reached).toBeLessThanOrEqual(LINEBREEDING_GENERATIONS);
    expect(deep.reached).toBeGreaterThanOrEqual(9);
  });

  it('ends a line at a parent that is only a name (R-2.3)', () => {
    const named = [
      dog('ONLY NAMED', { sex: 'M', sire: 'NOBODY KNOWN', dam: 'FOUNDER 1' }),
      ...animals,
    ];
    const r = buildLinebreeding(contextFor(named), find(named, 'ONLY NAMED'));
    expect(r.uniqueAncestors).toBe(1);
    expect(r.totalCrosses).toBe(1);
  });
});

describe('cycles', () => {
  // ALFA lists BETA as sire; BETA lists ALFA as dam — each is the other's ancestor.
  const cyclic = [
    dog('LOOP ALFA', { sex: 'F', sire: 'LOOP BETA', dam: 'LOOP GAMMA' }),
    dog('LOOP BETA', { sex: 'M', sire: 'LOOP DELTA', dam: 'LOOP ALFA' }),
    dog('LOOP GAMMA', { sex: 'F' }),
    dog('LOOP DELTA', { sex: 'M' }),
    dog('LOOP PUP', { sex: 'M', sire: 'LOOP BETA', dam: 'LOOP ALFA' }),
  ];

  it('are found over the whole population and broken deterministically', () => {
    const edges = findCycleEdges(cyclic, lookupOver(cyclic));
    expect(edges).toHaveLength(1);
    expect(edges).toEqual(findCycleEdges(cyclic, lookupOver(cyclic)));
    const broken = brokenEdgesOf(edges);
    const clean = withoutCycles(lookupOver(cyclic), broken);
    const e = edges[0];
    const child = clean(e.child)!;
    expect(e.relation === 'Sire' ? child.sire : child.dam).toBeNull();
    expect(e.parent).toMatch(/^LOOP /);
  });

  it('terminate the walk and are reported on the dogs they affect', () => {
    const ctx = contextFor(cyclic);
    const pup = buildReports(ctx, find(cyclic, 'LOOP PUP'));
    expect(pup.cycles).toHaveLength(1);
    expect(pup.linebreeding.reached).toBeLessThanOrEqual(3);
    // A dog whose ancestry does not touch the cycle carries no warning.
    const gamma = buildReports(ctx, find(cyclic, 'LOOP GAMMA'));
    expect(gamma.cycles).toBeUndefined();
  });

  it('are absent from an ordinary population', () => {
    const animals = population(7, 10, 5, 2);
    expect(findCycleEdges(animals, lookupOver(animals))).toEqual([]);
  });
});

describe('the foundation report', () => {
  const animals = population(99, 16, 7, 3);
  const list = ['FOUNDER 0', 'founder 3', 'FOUNDER 5', 'NOT IN THE DATABASE', 'GEN1 PUP 0'];
  const ctx = contextFor(animals, { foundationDogs: list });
  const lookup = lookupOver(animals);

  it('stores only the dogs that are present, with the desktop numbers', () => {
    for (const subject of animals.slice(-40)) {
      const web = buildFoundation(ctx, subject);
      const desktop = buildFoundationReport(lookup, subject.name, list);
      const present = desktop.rows.filter((r) => r.present);
      expect(web.generations).toBe(desktop.generations);
      expect(web.rows.map((r) => r.name)).toEqual(present.map((r) => r.name));
      for (let i = 0; i < web.rows.length; i += 1) {
        expect(web.rows[i].contribution).toBeCloseTo(present[i].contribution, 9);
        expect(web.rows[i].closest).toBe(present[i].closest);
        expect(web.rows[i].crosses).toBe(present[i].crosses);
        expect(web.rows[i].slug).toBe(ctx.slugByKey.get(present[i].name.toLowerCase()));
      }
      expect(web.rows.some((r) => r.name === 'NOT IN THE DATABASE')).toBe(false);
    }
  });

  it('matches names the way the database does — trimmed, case-insensitive', () => {
    // 'founder 3' on the list; the stored row carries the record's own spelling.
    const descendant = animals.find(
      (a) => buildFoundationReport(lookup, a.name, ['founder 3']).presentCount === 1,
    )!;
    const web = buildFoundation(ctx, descendant);
    expect(web.rows.some((r) => r.name === 'FOUNDER 3')).toBe(true);
  });

  it('names the list entries that match no record', () => {
    expect(unmatchedFoundationDogs(lookup, list)).toEqual(['NOT IN THE DATABASE']);
  });
});

describe('the report payload', () => {
  const animals = population(3, 12, 6, 2);
  const ctx = contextFor(animals);
  const last = animals[animals.length - 1];

  it('carries the subject header and both reports', () => {
    const r = buildReports(ctx, last);
    expect(r.slug).toBe(ctx.slugByKey.get(last.name.toLowerCase()));
    expect(r.name).toBe(last.name);
    expect(r.subject.sex).toBe(last.sex ?? undefined);
    expect(r.subject.coi).toBe(last.coi ?? undefined);
    expect(r.linebreeding.generations).toBe(LINEBREEDING_GENERATIONS);
    expect(r.foundation.rows).toEqual([]); // the site list names no synthetic dog
  });

  it('is deterministic, so the hash is a function of the content', () => {
    const a = buildReports(ctx, last);
    const b = buildReports(contextFor(animals), last);
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(reportHash(a)).toBe(reportHash(b));
    expect(reportHash(a)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('changes when an ancestor changes, as a bracket does', () => {
    const before = reportHash(buildReports(ctx, last));
    const renamed = animals.map((a) =>
      a.name === 'FOUNDER 0' ? { ...a, name: 'FOUNDER ZERO' } : { ...a, sire: a.sire === 'FOUNDER 0' ? 'FOUNDER ZERO' : a.sire, dam: a.dam === 'FOUNDER 0' ? 'FOUNDER ZERO' : a.dam },
    );
    const after = reportHash(buildReports(contextFor(renamed), find(renamed, last.name)));
    expect(after).not.toBe(before);
  });
});
