import { describe, expect, it } from 'vitest';
import { buildRelations } from '../../src/publish/relations.ts';
import { assignSlugs } from '../../src/publish/slugMap.ts';
import {
  BRACKET_GENERATIONS,
  buildBracket,
  buildPayload,
  contentHash,
  stableStringify,
  type PayloadContext,
} from '../../src/publish/payload.ts';
import type { Animal } from '../../src/vendor/pedigree-insights/schema.ts';
import { dog, lookupOver, sampleKennel } from '../helpers/dogs.ts';

function contextFor(animals: readonly Animal[], indexed: (a: Animal) => boolean = () => false): PayloadContext {
  return {
    lookup: lookupOver(animals),
    slugByKey: assignSlugs(animals).slugByKey,
    relations: buildRelations(animals),
    isIndexed: indexed,
  };
}

const find = (animals: readonly Animal[], name: string) => animals.find((a) => a.name === name)!;

describe('the pedigree bracket', () => {
  const animals = sampleKennel();
  const ctx = contextFor(animals);

  it('links an ancestor that has a record and keeps one that is only a name', () => {
    const bracket = buildBracket(ctx, find(animals, 'KENNEL THETA'));
    const byId = new Map(bracket.map((n) => [n.id, n]));
    expect(byId.get('0.S')?.slug).toBe('kennel-gamma');
    // PRD R-2.3: a name on a parent's record is plain text — present, and not a link.
    expect(byId.get('0.D')?.name).toBe('UNRECORDED BITCH');
    expect(byId.get('0.D')?.slug).toBeNull();
    expect(byId.get('0.D.S')).toBeUndefined();
  });

  it('emits no box at all where a parent is not recorded', () => {
    const bracket = buildBracket(ctx, find(animals, 'KENNEL ALFA'));
    expect(bracket.map((n) => n.id)).toEqual(['0']);
  });

  it('stops at the generation limit', () => {
    const chain: Animal[] = [];
    for (let i = 0; i < 9; i += 1) {
      chain.push(
        dog(`GEN ${i}`, { registration: `R${i}`, sire: i < 8 ? `GEN ${i + 1}` : null }),
      );
    }
    const bracket = buildBracket(contextFor(chain), chain[0]!);
    expect(Math.max(...bracket.map((n) => n.generation))).toBe(BRACKET_GENERATIONS);
    // Four ancestor generations, so five columns and sixteen rows at the deepest.
    expect(BRACKET_GENERATIONS).toBe(4);
  });

  it('marks an ancestry loop instead of running forever', () => {
    const animals2 = [
      dog('A', { registration: 'R1', sire: 'B' }),
      dog('B', { registration: 'R2', sire: 'A' }),
    ];
    const bracket = buildBracket(contextFor(animals2), animals2[0]!);
    expect(bracket.some((n) => n.loop === true)).toBe(true);
  });
});

describe('the payload', () => {
  const animals = sampleKennel();
  const ctx = contextFor(animals);

  it('carries the parts of the page PRD §6.2 lists', () => {
    const payload = buildPayload(ctx, find(animals, 'KENNEL GAMMA'));
    expect(payload.slug).toBe('kennel-gamma');
    expect(payload.sire?.slug).toBe('kennel-alfa');
    expect(payload.dam?.slug).toBe('kennel-beta');
    expect(payload.offspring.map((g) => g.mate)).toEqual(['KENNEL ZETA', 'UNRECORDED BITCH']);
    expect(payload.fullSiblings.map((s) => s.name)).toEqual(['KENNEL DELTA']);
    expect(payload.offspringCount).toBe(2);
  });

  it('omits an absent field rather than writing a placeholder (R-2.9)', () => {
    const payload = buildPayload(ctx, find(animals, 'KENNEL ALFA'));
    for (const absent of ['colour', 'breeder', 'country', 'photo', 'died', 'coi']) {
      expect(payload.subject).not.toHaveProperty(absent);
    }
    expect(payload.context).not.toHaveProperty('kennel');
    // The two parents are the exception, and deliberately so: `null` there means "no
    // parent recorded", which a template has to be able to tell from "not asked".
    expect(payload.sire).toBeNull();
    expect(stableStringify(payload.subject)).not.toContain('null');
  });

  it('carries no field the whitelist withholds, even when the record holds one', () => {
    // The whitelist stops these at the SQL projection. This test guards the second door:
    // a payload built from a record that somehow carries them must still not repeat them.
    const leaky = dog('LEAKY', {
      registration: 'R1',
      breeder: 'KENNEL AFFIX',
      fields: {
        owner: 'A Person',
        microchip: '981000000000000',
        litterNo: 'L-77',
        notes: 'a private remark',
      },
    });
    const json = stableStringify(buildPayload(contextFor([leaky]), leaky));
    expect(json).toContain('KENNEL AFFIX');
    for (const secret of ['A Person', '981000000000000', 'L-77', 'a private remark']) {
      expect(json).not.toContain(secret);
    }
  });

  it('reads DNA results verbatim, and none where the dog is untested', () => {
    const tested = dog('TESTED', {
      registration: 'R1',
      fields: { praRcd4C2orf71: 'Clear', samsKcnj10: 'N/N' },
    });
    const payload = buildPayload(contextFor([tested]), tested);
    expect(payload.context.dna).toEqual([
      { test: 'SAMS-KCNJ10', result: 'N/N' },
      { test: 'PRA-rcd4-C2orf71', result: 'Clear' },
    ]);
    expect(buildPayload(ctx, find(animals, 'KENNEL ALFA')).context.dna).toEqual([]);
  });
});

describe('half siblings', () => {
  const animals = sampleKennel();
  const ctx = contextFor(animals);

  it('are not in the payload at all', () => {
    const payload = buildPayload(ctx, find(animals, 'KENNEL EPSILON'));
    expect(payload.fullSiblings).toEqual([]);
    expect(payload).not.toHaveProperty('siblings');
    // What a visitor follows instead: the sire's page, where his whole get is listed.
    expect(payload.sire?.slug).toBe('kennel-alfa');
  });

  it('leave the payload flat however many offspring a sire has', () => {
    // The shape this decision exists for: one sire, many offspring. Each offspring page
    // used to carry all the others — 528 MB of the first real extract.
    const many = [dog('BIG SIRE', { registration: 'R0' })];
    for (let i = 0; i < 200; i += 1) {
      many.push(dog(`PUP ${i}`, { registration: `R${i + 1}`, sire: 'BIG SIRE', dam: `DAM ${i}` }));
    }
    const payload = buildPayload(contextFor(many), many[1]!);
    expect(stableStringify(payload.fullSiblings)).toBe('[]');
  });
});

describe('the content hash', () => {
  const animals = sampleKennel();

  it('is the same for the same data, so a re-run writes nothing', () => {
    const a = buildPayload(contextFor(animals), find(animals, 'KENNEL GAMMA'));
    const b = buildPayload(contextFor([...animals].reverse()), find(animals, 'KENNEL GAMMA'));
    expect(contentHash(b)).toBe(contentHash(a));
  });

  it('changes when the dog’s own record changes', () => {
    const before = buildPayload(contextFor(animals), find(animals, 'KENNEL GAMMA'));
    const edited = animals.map((a) =>
      a.name === 'KENNEL GAMMA' ? { ...a, color: 'white' } : a,
    );
    const after = buildPayload(contextFor(edited), find(edited, 'KENNEL GAMMA'));
    expect(contentHash(after)).not.toBe(contentHash(before));
  });

  it('changes on the parents’ pages when a puppy is added', () => {
    // The page shows the litter, so the page changed. A hash over the dog's own row alone
    // would leave a stale offspring list published.
    const before = buildPayload(contextFor(animals), find(animals, 'KENNEL ALFA'));
    const withPup = [
      ...animals,
      dog('KENNEL IOTA', { registration: 'R9', sire: 'KENNEL ALFA', dam: 'KENNEL BETA' }),
    ];
    const after = buildPayload(contextFor(withPup), find(withPup, 'KENNEL ALFA'));
    expect(contentHash(after)).not.toBe(contentHash(before));
  });

  it('does not change when an unrelated dog is added', () => {
    const before = buildPayload(contextFor(animals), find(animals, 'KENNEL GAMMA'));
    const withStranger = [...animals, dog('FAR AWAY', { registration: 'R99' })];
    const after = buildPayload(contextFor(withStranger), find(withStranger, 'KENNEL GAMMA'));
    expect(contentHash(after)).toBe(contentHash(before));
  });
});

describe('stableStringify', () => {
  it('does not depend on the order the object was built in', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(
      stableStringify({ a: [2, { c: 4, d: 3 }], b: 1 }),
    );
  });
});
