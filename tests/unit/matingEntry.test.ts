import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The bundle entry makes no network request (task 6.4): the page embeds everything, and
 * its CSP keeps `connect-src` closed, so a request would only fail — loudly in the
 * console, silently on the page. Behaviour is checked live in task 8.2.
 *
 * [DRAFT — requires Yuliya's review]
 */

describe('src/mating/entry.ts (task 6.4)', () => {
  const source = readFileSync(new URL('../../src/mating/entry.ts', import.meta.url), 'utf8');

  it('contains no fetch, XMLHttpRequest or dynamic import', () => {
    expect(source).not.toMatch(/\bfetch\b/);
    expect(source).not.toMatch(/XMLHttpRequest/);
    expect(source).not.toMatch(/\bimport\s*\(/);
  });

  it('reads the two data blocks and writes only into #mating-analysis', () => {
    expect(source).toContain("embedded('mating-sire')");
    expect(source).toContain("embedded('mating-dam')");
    expect(source.match(/getElementById\(/g)).toHaveLength(2);
  });
});
