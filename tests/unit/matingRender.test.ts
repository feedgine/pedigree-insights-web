import { describe, expect, it } from 'vitest';
import { litterBracket, slotPath } from '../../src/mating/bracket.ts';
import { computeMating } from '../../src/mating/compute.ts';
import type { MatingObject } from '../../src/mating/object.ts';
import { renderMatingAnalysis } from '../../src/mating/render.ts';
import {
  buildMatingObject,
  populationGenetics,
  serialiseMatingObject,
} from '../../src/publish/mating.ts';
import { brokenEdgesOf, findCycleEdges, withoutCycles } from '../../src/publish/reports.ts';
import { assignSlugs } from '../../src/publish/slugMap.ts';
import { renderBracket } from '../../src/render/bracket.ts';
import type { Animal } from '../../src/vendor/pedigree-insights/schema.ts';
import { dog, lookupOver } from '../helpers/dogs.ts';

/**
 * The litter bracket (task 6.2) and the analysis HTML (task 6.3).
 *
 * [DRAFT — requires Yuliya's review]
 */

const AS_OF = new Date('2026-10-22T00:00:00Z');

/** Stored objects for a population, parsed back as the browser parses them. */
function objects(animals: readonly Animal[]): (name: string) => MatingObject {
  const raw = lookupOver(animals);
  const cycles = findCycleEdges(animals, raw);
  const lookup = withoutCycles(raw, brokenEdgesOf(cycles));
  const ctx = {
    lookup,
    slugByKey: assignSlugs(animals).slugByKey,
    genetics: populationGenetics(animals, lookup),
    cycles,
  };
  return (name) => JSON.parse(serialiseMatingObject(buildMatingObject(ctx, lookup(name)!))) as MatingObject;
}

function page(animals: readonly Animal[], sire: string, dam: string, g = 5): string {
  const obj = objects(animals);
  const s = obj(sire);
  const d = obj(dam);
  return renderMatingAnalysis(computeMating(s, d, g, AS_OF), s, d, AS_OF);
}

/** Two half siblings by one sire, with titled, registered grandparents. */
function halfSibs(): Animal[] {
  return [
    dog('GRAND SIRE', { sex: 'M', preTitle: 'CH', registration: 'GS-1', dob: '2012-01-01 00:00:00' }),
    dog('DAM ONE', { sex: 'F' }),
    dog('DAM TWO', { sex: 'F' }),
    dog('HALF BROTHER', { sex: 'M', sire: 'GRAND SIRE', dam: 'DAM ONE', dob: '2020-05-01 00:00:00' }),
    dog('HALF SISTER', { sex: 'F', sire: 'GRAND SIRE', dam: 'DAM TWO', dob: '2021-06-01 00:00:00' }),
  ];
}

describe('the litter bracket (task 6.2)', () => {
  it('maps grid slots to bracket paths', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 14].map(slotPath)).toEqual([
      '.S', '.D', '.S.S', '.S.D', '.D.S', '.D.D', '.S.S.S', '.D.D.D',
    ]);
  });

  it('puts both parents at generation 1 and three generations behind each', () => {
    const obj = objects(halfSibs());
    const nodes = litterBracket(obj('HALF BROTHER'), obj('HALF SISTER'));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    expect(byId.get('0.S')).toMatchObject({ generation: 1, name: 'HALF BROTHER', dob: '2020-05-01 00:00:00' });
    expect(byId.get('0.D')).toMatchObject({ generation: 1, name: 'HALF SISTER' });
    expect(byId.get('0.S.S')).toMatchObject({ generation: 2, name: 'GRAND SIRE', preTitle: 'CH', registration: 'GS-1' });
    expect(byId.get('0.D.S')).toMatchObject({ generation: 2, name: 'GRAND SIRE' });
    expect(byId.get('0.D.D')?.name).toBe('DAM TWO');
    expect(Math.max(...nodes.map((n) => n.generation))).toBeLessThanOrEqual(4);
  });

  it('shades a shared grandparent on both halves, and the litter is not a cell or a link', () => {
    const obj = objects(halfSibs());
    const html = renderBracket(litterBracket(obj('HALF BROTHER'), obj('HALF SISTER')));
    const shared = html.match(/<a class="cell repeat"[^>]*href="\/dog\/grand-sire"/g) ?? [];
    expect(shared).toHaveLength(2);
    expect(html).toContain('title="Appears 2 times in this pedigree"');
    expect(html).not.toContain('Planned litter');
    // Only the five dogs with a record are links; every other position is an empty cell.
    expect(html.match(/<a /g)).toHaveLength(6); // two parents, grand sire twice, two dams
    expect(html.match(/class="cell empty"/g)).toHaveLength(30 - 6);
  });
});

describe('the analysis (task 6.3)', () => {
  it('outcross: labelled COI and AVK, the outcross note, no common ancestors', () => {
    const html = page(
      [dog('UNREL M', { sex: 'M', sire: 'A1', dam: 'A2' }), dog('UNREL F', { sex: 'F', sire: 'B1', dam: 'B2' })],
      'UNREL M',
      'UNREL F',
    );
    expect(html).toContain('Litter inbreeding coefficient (full-depth value): <strong>0.00%</strong>');
    expect(html).toMatch(
      /<li>AVK, 5 generations: <strong>[\d.]+%<\/strong> — \d+ different dogs in 62 positions \(100% = every position filled by a different dog\)<\/li>/,
    );
    expect(html).toMatch(/<li>Ancestor positions recorded: <strong>\d+<\/strong> of 62<\/li>/);
    expect(html).not.toContain('Total crosses walked');
    expect(html).toContain('<strong>Outcross</strong>');
    expect(html).toContain('<h2>Common ancestors, 5 generations</h2>');
    expect(html).toContain('No ancestor appears at least 2 times within 5 generations.');
    expect(html).not.toContain('<table');
  });

  it('half-sib: the half-sibling note graded match, naming the shared parent, and the row', () => {
    const html = page(halfSibs(), 'HALF BROTHER', 'HALF SISTER');
    expect(html).toContain('Litter inbreeding coefficient (full-depth value): <strong>12.50%</strong>');
    expect(html).toMatch(
      /<li class="grade-match"><span class="grade">match<\/span> <strong>Half-sibling cross<\/strong> — [^<]*GRAND SIRE/,
    );
    expect(html).toContain('<a href="/dog/grand-sire">GRAND SIRE</a>');
    // The report pages' sex classes, which the stylesheet colours.
    expect(html).toContain('<span class="sex sex-M" aria-hidden="true"></span><a href="/dog/grand-sire">');
    expect(html).toContain('<td class="crosses">2S x 2D</td>');
    expect(html).toContain('<td class="num">50.00%</td>');
    expect(html).toContain('Checked as of 22-Oct-2026: no sex, breeding-age or recessive DNA warnings.');
    expect(html).toContain('<h2>Planned litter, four generations</h2>');
  });

  it('two males: a sex warning with the date, and the analysis still renders', () => {
    const html = page(
      [dog('MALE A', { sex: 'M', sire: 'X' }), dog('MALE B', { sex: 'M', sire: 'Y' })],
      'MALE A',
      'MALE B',
    );
    expect(html).toContain('<strong>Checks as of 22-Oct-2026</strong>');
    expect(html).toMatch(/<li>Sex mismatch — the dam &quot;MALE B&quot; is recorded as M/);
    expect(html).toContain('Litter inbreeding coefficient');
    expect(html).toContain('class="bracket"');
  });

  it('carrier × carrier: the 25% Affected warning, and the analysis still renders', () => {
    const html = page(
      [
        dog('CARRIER SIRE', { sex: 'M', praRcd4C2orf71: 'Carrier' }),
        dog('CARRIER DAM', { sex: 'F', praRcd4C2orf71: 'N/m' }),
      ],
      'CARRIER SIRE',
      'CARRIER DAM',
    );
    expect(html).toMatch(/<li>[^<]*PRA \(rcd4 \/ C2orf71\)[^<]*25%[^<]*Affected/);
    expect(html).toContain('Litter inbreeding coefficient');
  });

  it('renders a name containing markup as text, everywhere it appears', () => {
    const evil = '<b>x</b>';
    const html = page(
      [
        dog(evil, { sex: 'M' }),
        dog('SIB M', { sex: 'M', sire: evil, dam: 'D1' }),
        dog('SIB F', { sex: 'F', sire: evil, dam: 'D2' }),
      ],
      'SIB M',
      'SIB F',
    );
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    // In the table, in the half-sibling note, and twice in the bracket.
    expect(html.split('&lt;b&gt;x&lt;/b&gt;').length - 1).toBeGreaterThanOrEqual(4);
  });

  it('states a broken cycle edge', () => {
    const html = page(
      [
        dog('A', { sex: 'M' }),
        dog('M', { sex: 'F' }),
        dog('B', { sex: 'M', sire: 'D', dam: 'M' }),
        dog('C', { sex: 'M', sire: 'B', dam: 'M' }),
        dog('D', { sex: 'M', sire: 'C', dam: 'M' }),
        dog('E', { sex: 'F', sire: 'C', dam: 'M' }),
      ],
      'D',
      'E',
    );
    expect(html).toContain('<strong>1 pedigree cycle detected</strong>');
    expect(html).toMatch(/<li><strong>[BCD]<\/strong> — (Sire|Dam) = [BCD] \(already an ancestor\)<\/li>/);
  });

  it('reads in page order: bracket, stats, warnings, notes, common ancestors, cycle note', () => {
    // The cycle fixture again, with both parents carriers, so every section is present.
    const html = page(
      [
        dog('A', { sex: 'M' }),
        dog('M', { sex: 'F' }),
        dog('B', { sex: 'M', sire: 'D', dam: 'M' }),
        dog('C', { sex: 'M', sire: 'B', dam: 'M' }),
        dog('D', { sex: 'M', sire: 'C', dam: 'M', praRcd4C2orf71: 'Carrier' }),
        dog('E', { sex: 'F', sire: 'C', dam: 'M', praRcd4C2orf71: 'Carrier' }),
      ],
      'D',
      'E',
    );
    const at = [
      '<h2>Planned litter, four generations</h2>',
      'class="bracket"',
      'Litter inbreeding coefficient',
      '<li>AVK, ',
      '<strong>Checks as of',
      '<h2>Line-breeding notes',
      '<h2>Common ancestors',
      '<table class="report">',
      'pedigree cycle detected',
    ].map((marker) => html.indexOf(marker));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((x, y) => x - y));
  });

  it('counts a name-only ancestor in neither U nor R, so U ≤ R ≤ P', () => {
    // GHOST is both parents' sire but has no record; GRAN, their dam, has one. Recorded
    // positions: SIRE, DAM, GRAN twice = 4; different dogs: SIRE, DAM, GRAN = 3. Counting
    // GHOST on either side alone would break the shared basis (U 4, or R 6).
    const animals = [
      dog('GRAN', { sex: 'F' }),
      dog('SIRE', { sex: 'M', sire: 'GHOST', dam: 'GRAN' }),
      dog('DAM', { sex: 'F', sire: 'GHOST', dam: 'GRAN' }),
    ];
    const obj = objects(animals);
    expect(obj('SIRE').dict.find((e) => e.name === 'GHOST')?.slug).toBeNull();

    const a = computeMating(obj('SIRE'), obj('DAM'), 5, AS_OF);
    const positions = 2 ** (5 + 1) - 2;
    expect(a.uniqueAncestors).toBe(3);
    expect(a.totalCrosses).toBe(4);
    expect(a.uniqueAncestors).toBeLessThanOrEqual(a.totalCrosses);
    expect(a.totalCrosses).toBeLessThanOrEqual(positions);

    const html = renderMatingAnalysis(a, obj('SIRE'), obj('DAM'), AS_OF);
    expect(html).toContain(
      '<li>AVK, 5 generations: <strong>4.84%</strong> — 3 different dogs in 62 positions ' +
        '(100% = every position filled by a different dog)</li>',
    );
    expect(html).toContain('<li>Ancestor positions recorded: <strong>4</strong> of 62</li>');
  });

  it('keeps U ≤ R ≤ P at every depth on a line-bred pedigree with gaps', () => {
    const obj = objects(halfSibs());
    for (let g = 3; g <= 10; g += 1) {
      const a = computeMating(obj('HALF BROTHER'), obj('HALF SISTER'), g, AS_OF);
      expect(a.uniqueAncestors).toBeLessThanOrEqual(a.totalCrosses);
      expect(a.totalCrosses).toBeLessThanOrEqual(2 ** (g + 1) - 2);
    }
  });
});
