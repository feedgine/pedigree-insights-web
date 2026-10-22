import { describe, expect, it } from 'vitest';
import { coancestry } from '../../src/mating/coi.ts';
import { matingKey, payloadKey, reportKey } from '../../src/publish/constants.ts';
import {
  MATING_GRID_SLOTS,
  buildMatingObject,
  matingHash,
  populationGenetics,
  serialiseMatingObject,
  type MatingContext,
  type MatingObject,
} from '../../src/publish/mating.ts';
import { brokenEdgesOf, findCycleEdges, withoutCycles } from '../../src/publish/reports.ts';
import { assignSlugs } from '../../src/publish/slugMap.ts';
import { createGeneticsEngine } from '../../src/vendor/pedigree-insights/genetics.ts';
import type { Animal } from '../../src/vendor/pedigree-insights/schema.ts';
import { dog, linebredPopulation, lookupOver, sampleKennel } from '../helpers/dogs.ts';

/**
 * The mating object: grid, dict, weight vector, cycles, and the bytes it is stored as.
 *
 * [DRAFT — requires Yuliya's review]
 */

function contextFor(animals: readonly Animal[]): MatingContext {
  const raw = lookupOver(animals);
  const cycles = findCycleEdges(animals, raw);
  const lookup = withoutCycles(raw, brokenEdgesOf(cycles));
  return {
    lookup,
    slugByKey: assignSlugs(animals).slugByKey,
    genetics: populationGenetics(animals, lookup),
    cycles,
  };
}

function objectFor(animals: readonly Animal[], name: string): MatingObject {
  const ctx = contextFor(animals);
  return buildMatingObject(ctx, ctx.lookup(name)!);
}

/** The name in a grid slot, or null. */
const at = (o: MatingObject, slot: number) => {
  const i = o.grid[slot];
  return i == null ? null : o.dict[i].name;
};

describe('the ancestor grid (task 3.1)', () => {
  it('is 1023 slots, slot 0 is the dog (null), sire of i at 2i+1, dam at 2i+2', () => {
    const o = objectFor(sampleKennel(), 'KENNEL ETA');
    expect(o.grid).toHaveLength(1023);
    expect(MATING_GRID_SLOTS).toBe(1023);
    expect(o.grid[0]).toBeNull();
    // ETA = GAMMA × ZETA; GAMMA = ALFA × BETA; ZETA has no parents recorded.
    expect(at(o, 1)).toBe('KENNEL GAMMA');
    expect(at(o, 2)).toBe('KENNEL ZETA');
    expect(at(o, 2 * 1 + 1)).toBe('KENNEL ALFA');
    expect(at(o, 2 * 1 + 2)).toBe('KENNEL BETA');
    expect(at(o, 2 * 2 + 1)).toBeNull();
    expect(at(o, 2 * 2 + 2)).toBeNull();
    expect(o.grid.filter((v) => v != null)).toHaveLength(4);
  });

  it('agrees with every dog’s own record, slot for slot, through nine generations', () => {
    const animals = linebredPopulation(42, 8, 12, 3);
    const lookup = lookupOver(animals);
    const subject = animals[animals.length - 1];
    const o = objectFor(animals, subject.name);
    for (let i = 0; 2 * i + 2 < o.grid.length; i += 1) {
      const name = i === 0 ? subject.name : at(o, i);
      const rec = name == null ? null : lookup(name);
      expect(at(o, 2 * i + 1)).toBe(rec?.sire ?? null);
      expect(at(o, 2 * i + 2)).toBe(rec?.dam ?? null);
    }
    // Nine generations deep: the fixture has twelve, so the last row is not empty.
    expect(o.grid.slice(511).some((v) => v != null)).toBe(true);
  });

  it('keeps a name-only ancestor as slug null, with no parents and no line behind it', () => {
    const o = objectFor(sampleKennel(), 'KENNEL THETA');
    // THETA = GAMMA × "UNRECORDED BITCH".
    const i = o.grid[2]!;
    expect(o.dict[i]).toEqual({ name: 'UNRECORDED BITCH', slug: null });
    expect(o.grid[5]).toBeNull();
    expect(o.grid[6]).toBeNull();
  });

  it('de-duplicates a repeated ancestor into one dict entry', () => {
    const animals = [
      dog('G', { sex: 'M' }), dog('H1', { sex: 'F' }), dog('H2', { sex: 'F' }),
      dog('SI', { sex: 'M', sire: 'G', dam: 'H1' }), dog('DA', { sex: 'F', sire: 'G', dam: 'H2' }),
      dog('PUP', { sire: 'SI', dam: 'DA' }),
    ];
    const o = objectFor(animals, 'PUP');
    expect(o.grid[3]).toBe(o.grid[5]); // G, both sides
    expect(o.dict.filter((d) => d.name === 'G')).toHaveLength(1);
  });

  it('keeps titles, registration and DOB only for generations 1–3', () => {
    const chain: Animal[] = [];
    for (let i = 0; i <= 6; i += 1) {
      chain.push(dog(`LINE ${i}`, {
        sire: i === 0 ? null : `LINE ${i - 1}`,
        preTitle: 'CH', postTitle: 'OB1', registration: `R${i}`, dob: '2000-01-01 00:00:00', sex: 'M',
      }));
    }
    const o = objectFor(chain, 'LINE 6');
    const entry = (n: string) => o.dict.find((d) => d.name === n)!;
    // LINE 5 is generation 1, LINE 3 generation 3, LINE 2 generation 4.
    expect(entry('LINE 5')).toMatchObject({ preTitle: 'CH', postTitle: 'OB1', registration: 'R5', dob: '2000-01-01 00:00:00' });
    expect(entry('LINE 3')).toMatchObject({ preTitle: 'CH', registration: 'R3' });
    expect(entry('LINE 2')).toEqual({ name: 'LINE 2', slug: expect.any(String), sex: 'M', sire: 'LINE 1' });
  });
});

describe('the assembled object (task 3.2)', () => {
  it('builds byte-identical output twice, with a stable hash', () => {
    const animals = linebredPopulation(7, 6, 7, 3);
    const name = animals[animals.length - 1].name;
    const a = serialiseMatingObject(objectFor(animals, name));
    const b = serialiseMatingObject(objectFor([...animals].reverse(), name));
    expect(b).toBe(a);
    expect(matingHash(b)).toBe(matingHash(a));
    expect(matingHash(a)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('carries slug, name, self, grid, dict and coi; cycles only when there are some', () => {
    const o = objectFor(sampleKennel(), 'KENNEL ETA');
    expect(Object.keys(o).sort()).toEqual(['coi', 'dict', 'grid', 'name', 'self', 'slug']);
    expect(o.self).toEqual({ sex: 'M', dob: '1997-07-01 00:00:00', registration: 'REG-7' });
    expect(o.coi.dropped).toBe(0);
  });

  it('keeps the DNA results the checks need in self', () => {
    const o = objectFor(
      [dog('CARRIER', { sex: 'F', praRcd4C2orf71: 'Carrier', samsKcnj10: ' N/N ' })],
      'CARRIER',
    );
    expect(o.self).toEqual({ sex: 'F', praRcd4C2orf71: 'Carrier', samsKcnj10: 'N/N' });
  });

  it('never carries Owner, Microchip, Litter No. or Additional Reg No.', () => {
    const secret = {
      owner: 'SECRET OWNER PERSON',
      microchip: '981000000000000',
      litterNo: 'LITTER-SECRET-77',
      additionalRegNo: 'ADDREG-SECRET-99',
    };
    const animals = [
      dog('PARENT', { sex: 'M', fields: secret, ...(secret as Partial<Animal>) }),
      dog('CHILD', { sex: 'F', sire: 'PARENT', fields: secret, ...(secret as Partial<Animal>) }),
    ];
    const bytes = serialiseMatingObject(objectFor(animals, 'CHILD'));
    for (const v of Object.values(secret)) expect(bytes).not.toContain(v);
    for (const k of Object.keys(secret)) expect(bytes).not.toContain(k);
  });
});

describe('stored bytes are safe to embed (task 3.3)', () => {
  it('escapes a closing script tag, and the object parses back to the original', () => {
    const evil = 'BAD </script><script>alert(1)</script> & \u2028\u2029 DOG';
    const animals = [dog(evil, { sex: 'M' }), dog('PUP', { sire: evil })];
    const o = objectFor(animals, 'PUP');
    const bytes = serialiseMatingObject(o);
    expect(bytes).toContain('BAD \\u003c/script\\u003e');
    expect(bytes).not.toMatch(/[<>\u2028\u2029]/);
    expect(JSON.parse(bytes)).toEqual(JSON.parse(JSON.stringify(o)));
    expect(JSON.parse(bytes).dict[0].name).toBe(evil);
  });
});

describe('mating object key (task 3.4)', () => {
  it('shards exactly as payloads and reports do', () => {
    for (const slug of ['kennel-alfa', 'a', 'zz-top-1999', 'x1']) {
      const shard = (k: string) => k.split('/').slice(1).join('/');
      expect(matingKey(slug)).toBe(`mating/${shard(payloadKey(slug))}`);
      expect(shard(matingKey(slug))).toBe(shard(reportKey(slug)));
    }
    expect(matingKey('a')).toBe('mating/a_/a.json');
  });
});

describe('a pedigree with a cycle (task 2.4)', () => {
  /** B's sire is recorded as its own grandchild: B → C → D → B. */
  function looped(): Animal[] {
    return [
      dog('A', { sex: 'M' }),
      dog('M', { sex: 'F' }),
      dog('B', { sex: 'M', sire: 'D', dam: 'M' }),
      dog('C', { sex: 'M', sire: 'B', dam: 'M' }),
      dog('D', { sex: 'M', sire: 'C', dam: 'M' }),
      dog('E', { sex: 'F', sire: 'C', dam: 'M' }),
      dog('F', { sex: 'M', sire: 'A', dam: 'E' }),
    ];
  }

  it('cuts the edge, keeps every weight finite, and records the edge in the object', () => {
    const animals = looped();
    const ctx = contextFor(animals);
    expect(ctx.cycles).toHaveLength(1);
    for (const v of ctx.genetics.F.values()) expect(Number.isFinite(v)).toBe(true);

    const o = buildMatingObject(ctx, ctx.lookup('F')!);
    for (const [, w] of o.coi.w) expect(Number.isFinite(w)).toBe(true);
    expect(o.cycles).toEqual([...ctx.cycles]);

    // A dog outside the loop's ancestry carries no cycle note.
    expect(buildMatingObject(ctx, ctx.lookup('A')!).cycles).toBeUndefined();
  });

  it('matches the vendored engine run on the same cycle-cut lookup', () => {
    const animals = looped();
    const ctx = contextFor(animals);
    const engine = createGeneticsEngine(ctx.lookup);
    const obj = (n: string) => buildMatingObject(ctx, ctx.lookup(n)!);
    const names = animals.map((a) => a.name);
    for (const s of names) {
      for (const d of names) {
        if (s === d) continue;
        expect(Math.abs(coancestry(obj(s).coi.w, obj(d).coi.w) - engine.coancestry(s, d))).toBeLessThan(1e-9);
      }
    }
  });
});
