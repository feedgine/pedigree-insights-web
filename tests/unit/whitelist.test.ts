import { describe, expect, it } from 'vitest';
import { SOURCE_FIELDS } from '../../src/vendor/pedigree-insights/sourceFields.ts';
import {
  EXCLUDED_BY_ALIAS,
  PUBLISHED_FIELDS,
  contradictoryAliases,
  publishedSourceColumns,
  undecidedAliases,
} from '../../src/publish/whitelist.ts';

describe('the public field whitelist', () => {
  it('has a decision for every column in the source catalogue', () => {
    // This is the test that makes the whitelist fail closed. A column added to
    // sourceFields.ts lands here until somebody decides whether it may be published.
    expect(undecidedAliases()).toEqual([]);
  });

  it('never publishes and excludes the same column', () => {
    expect(contradictoryAliases()).toEqual([]);
  });

  it('excludes the four fields PRD §7.2 names, as personal data', () => {
    for (const alias of ['owner', 'microchip', 'litterNo', 'additionalRegNo']) {
      expect(PUBLISHED_FIELDS.has(alias)).toBe(false);
      expect(EXCLUDED_BY_ALIAS.get(alias)?.reason).toBe('personal');
    }
  });

  it('gives every exclusion a reason someone can read', () => {
    for (const [alias, decision] of EXCLUDED_BY_ALIAS) {
      expect(decision.note.length, `${alias} has no note`).toBeGreaterThan(20);
    }
  });

  it('never names an excluded source column in the SQL projection', () => {
    // The point of PRD §7.2: an excluded field is not filtered out late, it is never read.
    const projected = new Set(publishedSourceColumns());
    const excludedColumns = SOURCE_FIELDS.filter((f) => EXCLUDED_BY_ALIAS.has(f.as)).flatMap(
      (f) => f.sources,
    );
    for (const column of excludedColumns) {
      // `Photo` appears among the fallbacks of the published photo field as well; only a
      // column that is exclusively excluded must be absent.
      const alsoPublished = SOURCE_FIELDS.some(
        (f) => PUBLISHED_FIELDS.has(f.as) && f.sources.includes(column),
      );
      if (!alsoPublished) expect(projected.has(column), `${column} is projected`).toBe(false);
    }
  });

  it('publishes the breeder, as the owner decided, and not the owner', () => {
    expect(PUBLISHED_FIELDS.has('breeder')).toBe(true);
    expect(PUBLISHED_FIELDS.has('owner')).toBe(false);
  });
});

describe('the coefficients', () => {
  it('publishes COI', () => {
    expect(PUBLISHED_FIELDS.has('coi')).toBe(true);
  });

  it('does not publish AVK, and says why', () => {
    // Measured 2026-09-02 on 400 dogs: BreedMate divides distinct ancestors by the
    // THEORETICAL maximum for its generation setting (N=10 → 2,046 positions), so a
    // pedigree that thins out early scores low for being incomplete rather than for being
    // inbred — median 8.0%, against 49.6% for the same dogs over their filled positions,
    // which is the convention a breeder means. Publishing the first number under the name
    // AVK would read as catastrophic inbreeding. If this test is ever deleted, read the
    // note on the field before deciding it was pedantry.
    expect(PUBLISHED_FIELDS.has('avk')).toBe(false);
    const decision = EXCLUDED_BY_ALIAS.get('avk');
    expect(decision).toBeDefined();
    expect(decision?.note).toContain('2,046');
  });
});
