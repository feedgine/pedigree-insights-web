import { describe, expect, it } from 'vitest';
import type { BracketNode } from '../../src/publish/bracketNode.ts';
import { renderBracket, slotIds } from '../../src/render/bracket.ts';
import { SITE_CSS } from '../../src/render/styles.ts';

/**
 * The bracket's rows grow with their content, so a wrapped name in the last column is
 * never clipped.
 *
 * [DRAFT — requires Yuliya's review]
 */

const LONG_NAME = 'KITSUNEBI NO HOSHI OF THE NORTHERN LIGHT';

/** A full four-generation bracket, every last-generation position holding `LONG_NAME`. */
function fullBracket(): BracketNode[] {
  const nodes: BracketNode[] = [];
  for (let g = 1; g <= 4; g += 1) {
    for (const [i, id] of slotIds(g).entries()) {
      nodes.push({
        id,
        generation: g,
        name: g === 4 ? LONG_NAME : `ANCESTOR ${g}-${i}`,
        slug: `ancestor-${g}-${i}`,
        registration: 'FIN12345/19',
        dob: '2019-04-01 00:00:00',
      });
    }
  }
  return nodes;
}

describe('a long name in the last generation', () => {
  it('is written in full, in every last-generation cell', () => {
    expect(LONG_NAME).toHaveLength(40);
    const html = renderBracket(fullBracket());
    expect(html.split(`<span class="nm">${LONG_NAME}</span>`)).toHaveLength(16 + 1);
  });

  it('gets rows that grow past the minimum height: minmax, not a fixed track', () => {
    const html = renderBracket(fullBracket());
    expect(html).toContain('grid-template-rows:auto repeat(16, minmax(var(--row-h), auto))');
    expect(html).not.toMatch(/repeat\(16, var\(--row-h\)\)/);
  });

  it('is wrapped by the stylesheet, never truncated', () => {
    const nm = /\.cell \.nm \{([^}]*)\}/.exec(SITE_CSS)?.[1] ?? '';
    expect(nm).toContain('overflow-wrap: anywhere');
    expect(nm).not.toMatch(/nowrap|text-overflow|line-clamp/);
  });
});

describe('the column-count class', () => {
  it('marks a four-generation bracket gens-4', () => {
    expect(renderBracket(fullBracket())).toContain('<div class="bracket gens-4" ');
  });

  it('marks a deeper bracket by its own depth, so the four-column print rule leaves it alone', () => {
    const deeper = [...fullBracket(), { id: slotIds(5)[0], generation: 5, name: 'DEEP ONE', slug: 'deep-one' }];
    const html = renderBracket(deeper);
    expect(html).toContain('<div class="bracket gens-5" ');
    expect(html).not.toContain('gens-4');
  });
});

describe('the print rules', () => {
  const print = /@media print \{\n[\s\S]*?\n\}/.exec(SITE_CSS.slice(SITE_CSS.lastIndexOf('@media print')))?.[0] ?? '';

  it('fit A4 landscape', () => {
    expect(print).toContain('@page { size: A4 landscape; margin: 12mm; }');
  });

  it('keep the cells tight', () => {
    expect(print).toContain('.cell { border-left: 0; padding: 1px 6px; }');
    expect(print).toContain('.cell .nm, .cell .tt, .cell .dt { line-height: 1.15; }');
  });

  it('spread only a four-column bracket across the page, the last column widest', () => {
    expect(print).toContain(
      '.bracket.gens-4 { grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 1.5fr) !important; }',
    );
    // No unscoped column override that would squeeze a deeper bracket into four tracks.
    expect(print).not.toMatch(/(^|\n)\s*\.bracket \{[^}]*grid-template-columns/);
  });

  it('keep whole only the bracket, a stat list, a table row, and a heading with what follows', () => {
    expect(print).toContain('.bracket-scroll, .report-stats, tr { break-inside: avoid; }');
    expect(print).toContain('h2 { break-after: avoid; }');
  });

  it('no longer hold a whole section together, which pushed it to a fresh page', () => {
    expect(print).toContain('section { border-bottom: 0; }');
    expect(print).not.toMatch(/section \{[^}]*break-inside/);
  });
});
