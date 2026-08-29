import { describe, expect, it } from 'vitest';
import { buildRelations } from '../../src/publish/relations.ts';
import {
  producers,
  producersWithCompletePedigree,
} from '../../src/publish/indexRule.ts';
import type { Animal } from '../../src/vendor/pedigree-insights/schema.ts';
import { byKeyOver, dog, sampleKennel } from '../helpers/dogs.ts';

/**
 * A pedigree that is complete to `depth` generations.
 *
 * Records exist down to generation `depth - 1`; the last generation is present as names
 * on those records and nothing more. That is the owner's counting rule, and building the
 * fixture this way is what makes the test check the rule rather than a stricter one.
 */
function perfectPedigree(depth: number): Animal[] {
  const animals: Animal[] = [];
  const walk = (id: string, generation: number): void => {
    if (generation >= depth) return; // named on the parent's record, no record of its own
    animals.push(
      dog(id, { registration: `R-${id}`, sire: `${id}S`, dam: `${id}D` }),
    );
    walk(`${id}S`, generation + 1);
    walk(`${id}D`, generation + 1);
  };
  walk('X', 0);
  return animals;
}

describe('the MVP index rule', () => {
  it('indexes a producer whose pedigree is complete to five generations', () => {
    const ancestry = perfectPedigree(5);
    const subject = ancestry[0]!;
    const animals = [
      ...ancestry,
      dog('PUP', { registration: 'R-PUP', sire: subject.name, dam: 'A BITCH' }),
    ];
    const rule = producersWithCompletePedigree(byKeyOver(animals), buildRelations(animals));
    expect(rule.isIndexed(subject)).toBe(true);
  });

  it('leaves out a producer whose pedigree is shallower', () => {
    const ancestry = perfectPedigree(4);
    const subject = ancestry[0]!;
    const animals = [
      ...ancestry,
      dog('PUP', { registration: 'R-PUP', sire: subject.name, dam: 'A BITCH' }),
    ];
    const rule = producersWithCompletePedigree(byKeyOver(animals), buildRelations(animals));
    expect(rule.isIndexed(subject)).toBe(false);
  });

  it('leaves out a deep pedigree with no recorded offspring', () => {
    const animals = perfectPedigree(5);
    const rule = producersWithCompletePedigree(byKeyOver(animals), buildRelations(animals));
    expect(rule.isIndexed(animals[0]!)).toBe(false);
  });

  it('excludes the founders, as PRD §7.3 records — the accepted cost of the depth rule', () => {
    const animals = sampleKennel();
    const rule = producersWithCompletePedigree(byKeyOver(animals), buildRelations(animals));
    const alfa = animals.find((a) => a.name === 'KENNEL ALFA')!;
    expect(rule.isIndexed(alfa)).toBe(false);
  });

  it('terminates on a dog that is its own ancestor, and counts the loop as depth', () => {
    // Recorded rather than corrected: the counting rule asks whether a name is present at
    // each level, and a loop always has one. It is what the 2026-08-28 measurement did, so
    // the one-month review can compare against it without measuring again.
    const animals = [
      dog('LOOP A', { registration: 'R1', sire: 'LOOP B', dam: 'LOOP B' }),
      dog('LOOP B', { registration: 'R2', sire: 'LOOP A', dam: 'LOOP A' }),
    ];
    const rule = producersWithCompletePedigree(byKeyOver(animals), buildRelations(animals));
    expect(rule.isIndexed(animals[0]!)).toBe(true);
  });
});

describe('the agreed widening', () => {
  it('indexes every producer, founders included', () => {
    const animals = sampleKennel();
    const rule = producers(buildRelations(animals));
    expect(rule.isIndexed(animals.find((a) => a.name === 'KENNEL ALFA')!)).toBe(true);
    expect(rule.isIndexed(animals.find((a) => a.name === 'KENNEL ETA')!)).toBe(false);
  });
});
