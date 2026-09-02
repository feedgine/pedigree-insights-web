import { describe, expect, it } from 'vitest';
import {
  assignSlugs,
  emptySlugState,
  parseSlugState,
  serialiseSlugState,
} from '../../src/publish/slugMap.ts';
import { dog, sampleKennel } from '../helpers/dogs.ts';

const slugFor = (r: ReturnType<typeof assignSlugs>, key: string) => r.slugByKey.get(key);

describe('slug assignment', () => {
  it('gives every dog a slug and repeats itself exactly on a second run', () => {
    const animals = sampleKennel();
    const first = assignSlugs(animals);
    expect(first.slugByKey.size).toBe(animals.length);

    const second = assignSlugs(animals, first.state);
    expect([...second.slugByKey.entries()]).toEqual([...first.slugByKey.entries()]);
    expect(second.report.assigned).toBe(0);
    expect(second.report.moved).toEqual([]);
    expect(serialiseSlugState(second.state)).toBe(serialiseSlugState(first.state));
  });

  it('does not depend on the order the database returned the rows', () => {
    const animals = sampleKennel();
    const forwards = assignSlugs(animals);
    const backwards = assignSlugs([...animals].reverse());
    expect([...backwards.slugByKey.entries()].sort()).toEqual(
      [...forwards.slugByKey.entries()].sort(),
    );
  });

  it('resolves two names that transliterate alike, and keeps both usable', () => {
    const animals = [
      dog('BJØRN', { registration: 'R1' }),
      dog('BJORN', { registration: 'R2' }),
    ];
    const result = assignSlugs(animals);
    const slugs = [...result.slugByKey.values()];
    expect(new Set(slugs).size).toBe(2);
    expect(slugs).toContain('bjorn');
    expect(result.report.collisions).toHaveLength(1);
  });
});

describe('a renamed dog', () => {
  it('moves to the new name and leaves a redirect behind', () => {
    const first = assignSlugs([dog('OLD NAME', { registration: 'R1' })]);
    expect(slugFor(first, 'old name')).toBe('old-name');

    const second = assignSlugs([dog('NEW NAME', { registration: 'R1' })], first.state);
    expect(slugFor(second, 'new name')).toBe('new-name');
    expect(second.state.redirects).toEqual({ 'old-name': 'new-name' });
    expect(second.report.moved).toEqual([{ from: 'old-name', to: 'new-name', name: 'NEW NAME' }]);
  });

  it('collapses a second rename instead of chaining redirects', () => {
    const a = assignSlugs([dog('FIRST NAME', { registration: 'R1' })]);
    const b = assignSlugs([dog('SECOND NAME', { registration: 'R1' })], a.state);
    const c = assignSlugs([dog('THIRD NAME', { registration: 'R1' })], b.state);
    expect(c.state.redirects).toEqual({
      'first-name': 'third-name',
      'second-name': 'third-name',
    });
  });

  it('cannot be followed when the dog has no registration — and the count says so', () => {
    const first = assignSlugs([dog('NO PAPERS')]);
    expect(first.report.withoutRegistration).toBe(1);
    const second = assignSlugs([dog('RENAMED')], first.state);
    // A new identity, a new URL, and the old URL still belongs to the record it was
    // published for. The limit is real; the test states it rather than hiding it.
    expect(second.state.redirects).toEqual({});
    expect(second.report.assigned).toBe(1);
  });
});

describe('retired URLs', () => {
  it('never hands a departed dog’s slug to a different dog', () => {
    const first = assignSlugs([dog('ALFA', { registration: 'R1' })]);
    expect(slugFor(first, 'alfa')).toBe('alfa');

    const second = assignSlugs([dog('ALFA', { registration: 'R2' })], first.state);
    expect(slugFor(second, 'alfa')).not.toBe('alfa');
    expect(second.report.retired).toBe(1);
  });
});

describe('synthetic identifiers', () => {
  it('are minted once and survive a run in which the dog is absent', () => {
    const first = assignSlugs([dog('NO PAPERS')]);
    const id = first.state.synthetic['no papers'];
    expect(id).toMatch(/^x-\d{6}$/);

    const withoutIt = assignSlugs([dog('SOMEONE ELSE', { registration: 'R9' })], first.state);
    const back = assignSlugs([dog('NO PAPERS')], withoutIt.state);
    expect(back.state.synthetic['no papers']).toBe(id);
    expect(slugFor(back, 'no papers')).toBe('no-papers');
  });

  it('separate two rows that carry the same registration code', () => {
    const result = assignSlugs([
      dog('ONE', { registration: 'SAME' }),
      dog('TWO', { registration: 'SAME' }),
    ]);
    expect(new Set(result.identityByKey.values()).size).toBe(2);
    expect(new Set(result.slugByKey.values()).size).toBe(2);
  });
});

describe('the state file', () => {
  it('round-trips, with keys in a fixed order', () => {
    const { state } = assignSlugs(sampleKennel());
    const json = serialiseSlugState(state);
    expect(serialiseSlugState(parseSlugState(json))).toBe(json);
  });

  it('refuses a state file written by a different version rather than guessing', () => {
    const bad = JSON.stringify({ ...emptySlugState(), version: 99 });
    expect(() => parseSlugState(bad)).toThrow(/version/i);
  });
});

describe('a dog that gains a registration', () => {
  it('keeps the URL it was already published under, and records no move', () => {
    // Published once with no registration: the identity is synthetic.
    const first = assignSlugs([dog('MAHO MIRAI DRAKO')]);
    expect(slugFor(first, 'maho mirai drako')).toBe('maho-mirai-drako');

    // The owner fills the registration in. Same dog, same name, new identity.
    const second = assignSlugs(
      [dog('MAHO MIRAI DRAKO', { registration: 'RKF4888086' })],
      first.state,
    );

    expect(slugFor(second, 'maho mirai drako')).toBe('maho-mirai-drako');
    expect(second.report.registrationsAdopted).toBe(1);
    // Nothing moved, nothing was newly assigned, no redirect was needed.
    expect(second.report.moved).toEqual([]);
    expect(second.report.assigned).toBe(0);
    expect(second.report.collisions).toEqual([]);
    expect(second.state.redirects).toEqual({});
    // The synthetic identity is gone rather than left holding the slug.
    expect(second.state.assignments['reg:RKF4888086']).toBe('maho-mirai-drako');
  });

  it('still follows a later rename, now that the registration is the identity', () => {
    const first = assignSlugs([dog('MAHO MIRAI DRAKO')]);
    const second = assignSlugs(
      [dog('MAHO MIRAI DRAKO', { registration: 'RKF4888086' })],
      first.state,
    );
    const third = assignSlugs(
      [dog('MAHO MIRAI DRACO', { registration: 'RKF4888086' })],
      second.state,
    );

    expect(slugFor(third, 'maho mirai draco')).toBe('maho-mirai-draco');
    expect(third.report.moved).toEqual([
      { from: 'maho-mirai-drako', to: 'maho-mirai-draco', name: 'MAHO MIRAI DRACO' },
    ]);
    expect(third.state.redirects['maho-mirai-drako']).toBe('maho-mirai-draco');
  });

  it('does not adopt when the dog was already published under that registration', () => {
    const first = assignSlugs([dog('KOU', { registration: 'FI1/99' })]);
    const second = assignSlugs([dog('KOU', { registration: 'FI1/99' })], first.state);
    expect(second.report.registrationsAdopted).toBe(0);
  });
});
