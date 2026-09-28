import { describe, expect, it } from 'vitest';
import type { DogReports } from '../../src/publish/reportModel.ts';
import { LINEBREEDING_GENERATIONS } from '../../src/publish/constants.ts';
import { buildRelations } from '../../src/publish/relations.ts';
import { assignSlugs } from '../../src/publish/slugMap.ts';
import { buildPayload } from '../../src/publish/payload.ts';
import { renderDogPage } from '../../src/render/dogPage.ts';
import {
  crossNotation,
  renderFoundationPage,
  renderLinebreedingPage,
  renderReportPage,
} from '../../src/render/reportPage.ts';
import { SITE_CSS } from '../../src/render/styles.ts';
import { FOUNDATION_DOGS } from '../../src/publish/foundationDogs.ts';
import { lookupOver, sampleKennel } from '../helpers/dogs.ts';

/** A hand-made report: the shape the publish writes, with numbers chosen to be checkable. */
function sampleReports(): DogReports {
  return {
    slug: 'kennel-theta',
    name: "KENNEL THETA <O'BRIEN>",
    subject: { sex: 'M', preTitle: 'CH', coi: 0.0625 },
    linebreeding: {
      generations: LINEBREEDING_GENERATIONS,
      minCrosses: 2,
      reached: 4,
      uniqueAncestors: 7,
      totalCrosses: 12,
      ancestors: [
        // 2S + 3D + 3D: crosses 3, lines (1)(2), blood ½² + 2·½³ = 0.5 → "2x2"
        { name: 'KENNEL ALFA', slug: 'kennel-alfa', sex: 'M', occ: [[2, 1, 0], [3, 0, 2]] },
        // A bitch appearing in the final generation: lower-case letters and the asterisk.
        { name: 'KENNEL BETA', slug: 'kennel-beta', sex: 'F', occ: [[3, 1, 0], [LINEBREEDING_GENERATIONS, 0, 1]] },
      ],
    },
    foundation: {
      generations: 4,
      rows: [{ name: 'KENNEL ALFA', slug: 'kennel-alfa', contribution: 0.5, closest: 2, crosses: 3 }],
    },
  };
}

describe('the cross notation', () => {
  it('prints generation and side per appearance, with a multiplier and the sex as case', () => {
    const r = sampleReports();
    expect(crossNotation(r.linebreeding.ancestors[0])).toBe('2S · 3D×2');
    expect(crossNotation(r.linebreeding.ancestors[1])).toBe(`3s · ${LINEBREEDING_GENERATIONS}d`);
  });
});

describe('the linebreeding page', () => {
  const html = renderLinebreedingPage(sampleReports(), undefined, () => true, '2026-09-11');

  it('is published but not offered to search engines, and names its own depth', () => {
    expect(html).toContain('<meta name="robots" content="noindex, follow">');
    expect(html).toContain(`linebreeding, ${LINEBREEDING_GENERATIONS} generations</title>`);
    expect(html).toContain('<link rel="canonical" href="https://pedigree.japanesespitz.org/dog/kennel-theta/linebreeding">');
    expect(html).toContain('Linebreeding statistics, 20 generations');
  });

  it('shows the desktop columns, derived from the stored counts', () => {
    expect(html).toContain('<td class="crosses">2S · 3D×2</td>');
    expect(html).toContain('<td class="num">3 <span class="split">(1)(2)</span></td>');
    expect(html).toContain('<td class="num">50.00%</td><td class="num">2x2</td></tr>');
    // The bitch in the final generation gets the asterisk. No per-ancestor COI column.
    expect(html).toContain('KENNEL BETA</a> <span class="final"');
    expect(html).toContain('<td class="num">12.50%</td><td class="num">4x4</td></tr>');
    expect(html).not.toContain('>COI</th>');
  });

  it('carries the header facts and the way back', () => {
    expect(html).toContain('Inbreeding coefficient (full-depth value): <strong>6.25%</strong>');
    expect(html).toContain('Unique ancestors in 20 generations (7 / 2097150) = <strong>0.00%</strong>');
    expect(html).toContain('Total crosses walked (incl. repeats): <strong>12</strong>');
    expect(html).toContain('Min crosses: 2 · 2 repeated ancestors');
    expect(html).toContain('rows are ranked by Blood % to surface top influencers');
    expect(html).toContain('The recorded pedigree runs out after 4 generations.');
    expect(html).toContain('<a href="/dog/kennel-theta">Dog page</a>');
    expect(html).toContain('<a href="/dog/kennel-theta/foundation">Foundation dogs</a>');
    expect(html).toContain('<span aria-current="page">Linebreeding</span>');
  });

  it('escapes names and links only where a page exists', () => {
    expect(html).toContain('KENNEL THETA &lt;O&#39;BRIEN&gt;');
    expect(html).not.toContain("<O'BRIEN>");
    const partial = renderLinebreedingPage(sampleReports(), undefined, (slug) => slug !== 'kennel-beta');
    expect(partial).toContain('<a href="/dog/kennel-alfa">KENNEL ALFA</a>');
    expect(partial).toContain('<span>KENNEL BETA</span>');
  });

  it('has no script and says so when nothing repeats', () => {
    expect(html).not.toContain('<script');
    const empty: DogReports = {
      ...sampleReports(),
      linebreeding: { ...sampleReports().linebreeding, ancestors: [], reached: 0, uniqueAncestors: 0, totalCrosses: 0 },
    };
    const page = renderLinebreedingPage(empty);
    expect(page).toContain('No ancestor appears at least 2 times within 20 generations.');
    expect(page).not.toContain('<table');
  });

  it('surfaces a pedigree cycle as the desktop does', () => {
    const cyclic: DogReports = {
      ...sampleReports(),
      cycles: [{ child: 'KENNEL ALFA', parent: 'KENNEL THETA', relation: 'Dam' }],
    };
    const page = renderLinebreedingPage(cyclic);
    expect(page).toContain('1 pedigree cycle detected');
    expect(page).toContain('<strong>KENNEL ALFA</strong> — Dam = KENNEL THETA (already an ancestor)');
  });
});

describe('the foundation page', () => {
  const list = ['KENNEL ALFA', 'KENNEL ZETA', 'A FOUNDER NOBODY HAS'];
  const html = renderFoundationPage(sampleReports(), undefined, () => true, '2026-09-11', list);

  it('lists present dogs from the report and absent ones from the site list', () => {
    expect(html).toContain('<meta name="robots" content="noindex, follow">');
    expect(html).toContain('<strong>1</strong> of 3 foundation dogs present in the pedigree (33%), traced over 4 generations.');
    expect(html).toContain('<td class="name"><a href="/dog/kennel-alfa">KENNEL ALFA</a></td><td class="num">✓</td><td class="num">2</td><td class="num">3</td><td class="num">50.00%</td>');
    expect(html).toContain('<tr class="absent"><td class="name">A FOUNDER NOBODY HAS</td>');
    expect(html).toContain('<tr class="absent"><td class="name">KENNEL ZETA</td>');
    expect(html.indexOf('KENNEL ALFA</a>')).toBeLessThan(html.indexOf('A FOUNDER NOBODY HAS'));
    expect(html).toContain('Combined contribution of the foundation dogs present: <strong>50.00%</strong>');
    expect(html).toContain('It is a computed estimate — distinct from the externally-validated COI.');
  });

  it('uses the site list by default and renders through the shared entry point', () => {
    const page = renderReportPage('foundation', sampleReports());
    expect(page).toContain(`of ${FOUNDATION_DOGS.length} foundation dogs present`);
    expect(page).toContain('<span aria-current="page">Foundation dogs</span>');
    expect(renderReportPage('linebreeding', sampleReports())).toContain('Linebreeding statistics');
  });
});

describe('the dog page', () => {
  const animals = sampleKennel();
  const ctx = {
    lookup: lookupOver(animals),
    slugByKey: assignSlugs(animals).slugByKey,
    relations: buildRelations(animals),
    isIndexed: () => false,
  };
  const find = (name: string) => animals.find((a) => a.name === name)!;

  it('links to both reports where there is a pedigree to report on', () => {
    const html = renderDogPage(buildPayload(ctx, find('KENNEL THETA')));
    expect(html).toContain(`<a href="/dog/kennel-theta/linebreeding">Linebreeding (${LINEBREEDING_GENERATIONS} generations)</a>`);
    expect(html).toContain('<a href="/dog/kennel-theta/foundation">Foundation dogs</a>');
  });

  it('offers no report for a dog with no recorded parent (R-2.9)', () => {
    const html = renderDogPage(buildPayload(ctx, find('KENNEL ALFA')));
    expect(html).not.toContain('/linebreeding');
    expect(html).not.toContain('class="reports"');
  });

  it('ships the report styles in the one stylesheet', () => {
    expect(SITE_CSS).toContain('table.report');
    expect(SITE_CSS).toContain('.report-nav');
  });
});
