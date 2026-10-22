import { describe, expect, it } from 'vitest';
import {
  MAX_PAGE,
  MIN_TOKEN,
  PER_PAGE,
  pageParam,
  pager,
  searchDogs,
  type SearchDb,
} from '../../src/render/searchQuery.ts';

/**
 * The shared name search (task 7.1): `/search` and the mating page's parent search spend
 * D1's allowance through this one query, so its limits are pinned here.
 *
 * [DRAFT — requires Yuliya's review]
 */

/** A D1 stand-in that answers `total` matches and records every statement. */
function fakeDb(total: number) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const db: SearchDb = {
    prepare: (sql) => ({
      bind: (...values) => ({
        first: async <T,>() => {
          calls.push({ sql, values });
          return { n: total } as T;
        },
        all: async <T,>() => {
          calls.push({ sql, values });
          const [, , , limit, offset] = values as number[];
          const n = Math.max(0, Math.min(limit, total - offset));
          return { results: Array.from({ length: n }, (_, i) => ({ slug: `d-${offset + i}` })) as T[] };
        },
      }),
    }),
  };
  return { db, calls };
}

describe('searchDogs', () => {
  it('refuses a query with no token of MIN_TOKEN characters, without touching D1', async () => {
    const { db, calls } = fakeDb(10);
    expect(MIN_TOKEN).toBe(2);
    expect(await searchDogs(db, 'a', 1)).toEqual({ tooShort: true, total: 0, rows: [], pages: 1 });
    expect(calls).toHaveLength(0);
  });

  it('folds accents and case into the needle, and narrows through the suffix index', async () => {
    const { db, calls } = fakeDb(3);
    await searchDogs(db, 'TÄHTI', 1);
    expect(calls).toHaveLength(2);
    expect(calls[0].sql).toContain('FROM search_word s');
    expect(calls[0].sql).toContain('instr(g.name_folded, ?3) > 0');
    expect(calls[0].values[2]).toBe('tahti');
    expect(calls[1].values.slice(3)).toEqual([PER_PAGE, 0]);
  });

  it('pages by PER_PAGE', async () => {
    const { db, calls } = fakeDb(107);
    const r = await searchDogs(db, 'abaseiko', 2);
    expect(r.total).toBe(107);
    expect(r.pages).toBe(2);
    expect(r.rows).toHaveLength(7);
    expect(calls[1].values.slice(3)).toEqual([PER_PAGE, PER_PAGE]);
  });
});

describe('pageParam and pager', () => {
  it('reads ?page= as an integer within 1–MAX_PAGE, otherwise 1', () => {
    expect([null, '2', '0', '-3', 'x', String(MAX_PAGE), String(MAX_PAGE + 1)].map(pageParam)).toEqual([
      1, 2, 1, 1, 1, MAX_PAGE, 1,
    ]);
  });

  it('links only to pages that exist, with an optional extra rel', () => {
    const href = (p: number) => `/x?page=${p}`;
    expect(pager(href, 1, 1)).toBe('');
    const first = pager(href, 1, 3, 'nofollow');
    expect(first).toContain('<span>← Previous</span>');
    expect(first).toContain('<a href="/x?page=2" rel="next nofollow">Next →</a>');
    expect(pager(href, 3, 3)).toContain('<a href="/x?page=2" rel="prev">← Previous</a>');
  });
});
