import { describe, expect, it } from 'vitest';
import { buildRelations } from '../../src/publish/relations.ts';
import { dog, sampleKennel } from '../helpers/dogs.ts';

const names = (list: readonly { name: string }[]) => list.map((a) => a.name);

describe('offspring', () => {
  const relations = buildRelations(sampleKennel());

  it('finds a dog through either parent column', () => {
    expect(names(relations.offspringOf('kennel alfa'))).toEqual([
      'KENNEL DELTA',
      'KENNEL GAMMA',
      'KENNEL EPSILON',
    ]);
    expect(names(relations.offspringOf('kennel beta'))).toEqual(['KENNEL DELTA', 'KENNEL GAMMA']);
  });

  it('groups offspring by the other parent, unrecorded mates last', () => {
    const groups = relations.offspringByMate(
      sampleKennel().find((a) => a.name === 'KENNEL GAMMA')!,
    );
    expect(groups.map((g) => g.mate)).toEqual(['KENNEL ZETA', 'UNRECORDED BITCH']);
    expect(groups[0]?.mateHasRecord).toBe(true);
    expect(groups[1]?.mateHasRecord).toBe(false);
    expect(names(groups[0]!.offspring)).toEqual(['KENNEL ETA']);
  });

  it('counts a producer and a dog with no offspring correctly', () => {
    expect(relations.isProducer('kennel alfa')).toBe(true);
    expect(relations.offspringCount('kennel alfa')).toBe(3);
    expect(relations.isProducer('kennel eta')).toBe(false);
  });

  it('matches a parent written with different capitalisation', () => {
    const rel = buildRelations([
      dog('SIRE ONE', { registration: 'R1' }),
      dog('PUP', { sire: 'sire one', registration: 'R2' }),
    ]);
    expect(names(rel.offspringOf('sire one'))).toEqual(['PUP']);
  });

  it('never makes a dog its own offspring', () => {
    const rel = buildRelations([dog('LOOP', { sire: 'LOOP', registration: 'R1' })]);
    expect(rel.offspringOf('loop')).toEqual([]);
  });
});

describe('full siblings', () => {
  const animals = sampleKennel();
  const relations = buildRelations(animals);
  const find = (name: string) => animals.find((a) => a.name === name)!;

  it('are the dogs sharing both parents', () => {
    expect(names(relations.fullSiblingsOf(find('KENNEL GAMMA')))).toEqual(['KENNEL DELTA']);
  });

  it('are empty for a dog with only one known parent', () => {
    // KENNEL EPSILON shares a sire with two others; half siblings are out of scope, so
    // there is nothing to show. The sire's page carries his whole get.
    expect(relations.fullSiblingsOf(find('KENNEL EPSILON'))).toEqual([]);
  });

  it('are empty when a parent is unrecorded', () => {
    expect(relations.fullSiblingsOf(find('KENNEL ALFA'))).toEqual([]);
  });

  it('never list the dog itself', () => {
    for (const a of animals) {
      expect(names(relations.fullSiblingsOf(a))).not.toContain(a.name);
    }
  });

  it('do not grow when a sire has very many offspring by different dams', () => {
    const many = [dog('BIG SIRE', { registration: 'R0' })];
    for (let i = 0; i < 200; i += 1) {
      many.push(dog(`PUP ${i}`, { registration: `R${i + 1}`, sire: 'BIG SIRE', dam: `DAM ${i}` }));
    }
    expect(buildRelations(many).fullSiblingsOf(many[1]!)).toEqual([]);
  });
});
