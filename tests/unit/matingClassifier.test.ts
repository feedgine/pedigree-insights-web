import { describe, expect, it } from 'vitest';
import { buildHypotheticalMating } from '../../src/vendor/pedigree-insights/hypotheticalMating.ts';
import type { Animal } from '../../src/vendor/pedigree-insights/schema.ts';
import { dog, lookupOver } from '../helpers/dogs.ts';

/**
 * The desktop's Appendix-C classifier scenarios (`pedigree-insights`
 * `tests/unit/matingClassifier.test.ts`), re-run here against the vendored copies.
 *
 * Not a test of new code: it proves the vendored files behave on this side exactly as they
 * do on the desktop, so the web mating page can rely on them. Exercised end to end through
 * `buildHypotheticalMating`, as on the desktop, so the signatures see real
 * `analyzeLinebreeding` output. Same fixtures, same expectations; only the fixture helper
 * is this repository's.
 *
 * [DRAFT — requires Yuliya's review]
 */

const ASOF = new Date('2026-07-26T00:00:00Z');

const a = (name: string, sire: string | null, dam: string | null, sex: Animal['sex'] = null): Animal =>
  dog(name, { sire, dam, sex });

const keys = (r: ReturnType<typeof buildHypotheticalMating>) => r.classification.matches.map((m) => m.key);

describe('classifier signatures (vendored, desktop scenarios)', () => {
  it('half-sib parents → onstott (both sides) + half-sib', () => {
    const lookup = lookupOver([
      a('SI', 'G', 'H1', 'M'), a('DA', 'G', 'H2', 'F'),
      a('G', null, null, 'M'), a('H1', null, null, 'F'), a('H2', null, null, 'F'),
    ]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 5, ASOF);
    expect(keys(r)).toContain('onstott');
    expect(keys(r)).toContain('half-sib');
    expect(r.classification.isOutcross).toBe(false);
  });

  it('full-sib parents → full-sib', () => {
    const lookup = lookupOver([
      a('SI', 'G', 'H', 'M'), a('DA', 'G', 'H', 'F'),
      a('G', null, null, 'M'), a('H', null, null, 'F'),
    ]);
    expect(keys(buildHypotheticalMating(lookup, 'SI', 'DA', 5, ASOF))).toContain('full-sib');
  });

  it('parent × offspring → parent-offspring + a possible Morgan note', () => {
    const lookup = lookupOver([a('DA', 'SI', 'Q', 'F'), a('SI', null, null, 'M'), a('Q', null, null, 'F')]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 5, ASOF);
    expect(keys(r)).toContain('parent-offspring');
    const morgan = r.classification.matches.find((m) => m.key === 'morgan');
    expect(morgan?.confidence).toBe('possible');
  });

  it('an ancestor at the 2nd and 3rd generations → Brackett "Rule of Five"', () => {
    // X is the sire's sire (gen 2, SS) and appears again down the dam side at gen 3
    // (D→E→X, path DSS), so its occurrences are at generations {2, 3}.
    const lookup = lookupOver([
      a('SI', 'X', 'A', 'M'),
      a('A', 'B', 'C', 'F'),
      a('DA', 'E', 'F2', 'F'),
      a('E', 'X', 'GG', 'M'),
      a('X', null, null, 'M'),
      a('B', null, null, 'M'), a('C', null, null, 'F'),
      a('F2', null, null, 'F'), a('GG', null, null, 'F'),
    ]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 6, ASOF);
    const x = r.commonAncestors.find((c) => c.name === 'X')!;
    expect(new Set(x.occurrences.map((o) => o.generation))).toEqual(new Set([2, 3]));
    expect(keys(r)).toContain('brackett');
  });

  it('tail-line matriarchal is flagged only as "possible"', () => {
    // Q sits on the unbroken all-dam line (litter → DA → QM → Q) and once on the sire
    // side, so it is a common ancestor.
    const lookup = lookupOver([
      a('SI', 'Q', 'SM', 'M'),
      a('DA', 'DS', 'QM', 'F'),
      a('QM', null, 'Q', 'F'),
      a('Q', null, null, 'F'),
      a('SM', null, null, 'F'), a('DS', null, null, 'M'),
    ]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 6, ASOF);
    const wy = r.classification.matches.find((m) => m.key === 'wycliffe');
    if (wy) expect(wy.confidence).toBe('possible');
  });

  it('unrelated parents → outcross, empty matches', () => {
    const lookup = lookupOver([
      a('SI', 'A', 'B', 'M'), a('DA', 'C', 'D', 'F'),
      a('A', null, null), a('B', null, null), a('C', null, null), a('D', null, null),
    ]);
    const r = buildHypotheticalMating(lookup, 'SI', 'DA', 5, ASOF);
    expect(r.classification.isOutcross).toBe(true);
    expect(r.classification.matches).toHaveLength(0);
    expect(r.classification.outcrossNote).not.toBe('');
  });
});
