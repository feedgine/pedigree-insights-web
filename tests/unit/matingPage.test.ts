import { describe, expect, it } from 'vitest';
import { scriptSafeJson } from '../../src/render/escape.ts';
import {
  renderMatingChoosePage,
  renderMatingPage,
  type MatingPairView,
} from '../../src/render/matingPage.ts';
import { SITE_CSS } from '../../src/render/styles.ts';
import { matingPath } from '../../src/render/site.ts';

/**
 * The `/mating` server shell (task 7.2).
 *
 * [DRAFT — requires Yuliya's review]
 */

const SIRE = { slug: 'kennel-alfa', name: 'KENNEL ALFA', sex: 'M' };
const DAM = { slug: 'kennel-beta', name: 'KENNEL BETA', sex: 'F' };

/** Stored bytes as the publish writes them — including an escaped closing tag. */
const sireObject = scriptSafeJson(JSON.stringify({ slug: 'kennel-alfa', name: 'A </script> B', grid: [null] }));
const damObject = scriptSafeJson(JSON.stringify({ slug: 'kennel-beta', name: 'KENNEL BETA', grid: [null] }));

function pair(extra: Partial<MatingPairView> = {}): string {
  return renderMatingPage({
    sire: SIRE,
    dam: DAM,
    generations: 6,
    asOf: '2026-10-22',
    sireObject,
    damObject,
    script: '/assets/mating.0123456789ab.js',
    ...extra,
  });
}

/** Every `<script …>` opening tag on a page. */
const scripts = (html: string) => html.match(/<script\b[^>]*>/g) ?? [];

/** Every link into `/mating`. */
const matingLinks = (html: string) => html.match(/<a [^>]*href="\/mating[^"]*"[^>]*>/g) ?? [];

describe('matingPath', () => {
  it('orders sire, dam, g and leaves out what is absent', () => {
    expect(matingPath({ dam: 'b', g: 5, sire: 'a' })).toBe('/mating?sire=a&dam=b&g=5');
    expect(matingPath({ dam: 'b' })).toBe('/mating?dam=b');
    expect(matingPath({})).toBe('/mating');
  });
});

describe('the shell with both parents', () => {
  it('links both parents to their dog pages', () => {
    const html = pair();
    expect(html).toContain('<li>Sire: <strong><a href="/dog/kennel-alfa">KENNEL ALFA</a></strong></li>');
    expect(html).toContain('<li>Dam: <strong><a href="/dog/kennel-beta">KENNEL BETA</a></strong></li>');
  });

  it('embeds both data blocks byte for byte, and the block cannot be closed early', () => {
    const html = pair();
    expect(html).toContain(`<script type="application/json" id="mating-sire">${sireObject}</script>`);
    expect(html).toContain(`<script type="application/json" id="mating-dam">${damObject}</script>`);
    expect(html.split('</script>')).toHaveLength(4); // two data blocks, one script, nothing else
  });

  it('carries exactly one external script and no inline script', () => {
    const tags = scripts(pair());
    const external = tags.filter((t) => / src="/.test(t));
    expect(external).toEqual(['<script src="/assets/mating.0123456789ab.js" defer>']);
    // Every other script element is a data block, which script-src does not govern.
    for (const t of tags.filter((t) => !/ src="/.test(t))) expect(t).toMatch(/type="application\/json"/);
  });

  it('gives the depth and the date to the script, and a noscript note in the analysis slot', () => {
    const html = pair();
    expect(html).toContain('<div id="mating-analysis" data-generations="6" data-as-of="2026-10-22">');
    expect(html).toContain(
      '<noscript><p class="note">The analysis is calculated in your browser and needs JavaScript.</p></noscript>',
    );
  });

  it('offers depth 3–10 as a GET form, and change links, all nofollow', () => {
    const html = pair();
    expect(html).toContain('<form class="mating-controls mating-depth" action="/mating" method="get">');
    expect(html.match(/<option value="\d+"/g)).toHaveLength(8);
    expect(html).toContain('<option value="6" selected>6</option>');
    expect(html).toContain(
      '<p class="mating-controls"><a href="/mating?dam=kennel-beta&amp;g=6" rel="nofollow">Change sire</a> · ' +
        '<a href="/mating?sire=kennel-alfa&amp;g=6" rel="nofollow">Change dam</a></p>',
    );
    for (const a of matingLinks(html)) expect(a).toContain('rel="nofollow"');
  });

  it('offers no swap for a male sire and a female dam', () => {
    expect(pair()).not.toContain('Swap sire and dam');
  });

  it('offers the swap, first on the control line, when a parent is unsexed or on the wrong side', () => {
    const swap =
      '<p class="mating-controls"><a href="/mating?sire=kennel-beta&amp;dam=kennel-alfa&amp;g=6" rel="nofollow">Swap sire and dam</a> · ';
    for (const view of [
      { sire: { ...SIRE, sex: null } }, // sire's sex unrecorded
      { dam: { ...DAM, sex: null } }, // dam's sex unrecorded
      { dam: { ...DAM, sex: 'M' } }, // a male given as dam
      { sire: { ...SIRE, sex: 'F' } }, // a female given as sire
    ]) {
      expect(pair(view)).toContain(swap);
    }
  });

  it('reads in page order: parents, depth form, control line, then the analysis slot', () => {
    const html = pair({ dam: { ...DAM, sex: null } });
    const at = [
      '<ul class="report-stats mating-parents">',
      '<form class="mating-controls mating-depth"',
      '<p class="mating-controls">',
      '<div id="mating-analysis"',
      '<noscript>',
    ].map((marker) => html.indexOf(marker));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((x, y) => x - y));
  });

  it('is noindex, follow, with the canonical mating URL', () => {
    const html = pair();
    expect(html).toContain('<meta name="robots" content="noindex, follow">');
    expect(html).toContain('/mating?sire=kennel-alfa&amp;dam=kennel-beta&amp;g=6">');
  });

  it('hides the controls and the search in print', () => {
    expect(SITE_CSS).toMatch(/@media print[\s\S]*\.mating-controls, \.mating-search, p\.mating-link \{ display: none; \}/);
  });
});

describe('the shell with a parent to choose', () => {
  const results = {
    tooShort: false,
    total: 2,
    pages: 1,
    rows: [
      { slug: 'stud-one', name: 'STUD <ONE>', dob: '2019-04-01 00:00:00', registration: null, offspring_count: 3 },
      { slug: 'kennel-beta', name: 'KENNEL BETA', dob: null, registration: null, offspring_count: 0 },
    ],
  };

  it('?dam=x only: names the dam, offers a GET search for the sire, no analysis', () => {
    const html = renderMatingChoosePage({
      sire: null, dam: DAM, sameDog: false, generations: null, query: '', page: 1, results: null,
    });
    expect(html).toContain('Dam: <strong><a href="/dog/kennel-beta">KENNEL BETA</a></strong>');
    expect(html).toContain('<form class="mating-search" action="/mating" method="get" role="search">');
    expect(html).toContain('<input type="hidden" name="dam" value="kennel-beta">');
    expect(html).toContain('<label for="mating-q">Search for the sire by name</label>');
    expect(scripts(html)).toEqual([]);
    expect(html).not.toContain('mating-analysis');
  });

  it('results link to the completed URL, nofollow, never to the kept parent itself', () => {
    const html = renderMatingChoosePage({
      sire: null, dam: DAM, sameDog: false, generations: null, query: 'stud', page: 1, results,
    });
    expect(html).toContain('<a href="/mating?sire=stud-one&amp;dam=kennel-beta&amp;g=5" rel="nofollow">STUD &lt;ONE&gt;</a>');
    expect(html).not.toContain('sire=kennel-beta');
    for (const a of matingLinks(html)) expect(a).toContain('rel="nofollow"');
  });

  it('carries a chosen depth through the search into the results', () => {
    const html = renderMatingChoosePage({
      sire: SIRE, dam: null, sameDog: false, generations: 8, query: 'stud', page: 1, results,
    });
    expect(html).toContain('<input type="hidden" name="g" value="8">');
    expect(html).toContain('href="/mating?sire=kennel-alfa&amp;dam=stud-one&amp;g=8"');
  });

  it('sire=x&dam=x: explains the parents must differ and searches for the other, no analysis', () => {
    const html = renderMatingChoosePage({
      sire: SIRE, dam: null, sameDog: true, generations: 5, query: '', page: 1, results: null,
    });
    expect(html).toContain('was given as both sire and dam. The two parents must be different dogs');
    expect(html).toContain('Search for the dam by name');
    expect(html).not.toContain('mating-analysis');
    expect(scripts(html)).toEqual([]);
  });

  it('a too-short query is refused, as on /search', () => {
    const html = renderMatingChoosePage({
      sire: SIRE, dam: null, sameDog: false, generations: null, query: 'a', page: 1,
      results: { tooShort: true, total: 0, rows: [], pages: 1 },
    });
    expect(html).toContain('Please type at least 2 letters.');
  });

  it('pages its results with nofollow links that keep the parent and the query', () => {
    const html = renderMatingChoosePage({
      sire: SIRE, dam: null, sameDog: false, generations: null, query: 'stud', page: 1,
      results: { ...results, total: 150, pages: 2 },
    });
    expect(html).toContain('<a href="/mating?sire=kennel-alfa&amp;q=stud&amp;page=2" rel="next nofollow">Next →</a>');
  });
});
