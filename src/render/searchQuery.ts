/**
 * The name search, as one query shared by `/search` and the `/mating` page's search for a
 * missing parent.
 *
 * Shared rather than copied because the cost of a search is decided here: the refusal of
 * a too-short query, the page size and the paging ceiling are what keep D1's free daily
 * allowance intact (the episode in `migrations/0002_search_index.sql`). A second search
 * with its own idea of those limits would be a second way to spend it.
 *
 * D1 stays the only search backend. The database is typed structurally, by the three
 * calls made on it, so this module compiles without the Workers types and a test can hand
 * it a fake.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { indexToken, prefixUpperBound } from '../publish/searchWords';
import { accentFreeName } from './text';

export { MIN_TOKEN } from '../publish/searchWords';

/** Results per page. Enough that most searches are one page, few enough to scan. */
export const PER_PAGE = 100;

/** A ceiling on paging, so a crawler cannot walk `?page=` forever. */
export const MAX_PAGE = 200;

/** The part of D1 the search uses. */
export interface SearchDb {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T>(): Promise<T | null>;
      all<T>(): Promise<{ results?: T[] }>;
    };
  };
}

export interface SearchRow {
  slug: string;
  name: string;
  dob: string | null;
  registration: string | null;
  offspring_count: number;
}

export interface SearchResult {
  /** The query carries nothing long enough to look up — see `MIN_TOKEN`. */
  readonly tooShort: boolean;
  readonly total: number;
  readonly rows: readonly SearchRow[];
  /** Pages of results, at least 1. */
  readonly pages: number;
}

/** `?page=` as a sane integer. Anything unparseable, negative or absurd becomes page 1. */
export function pageParam(raw: string | null): number {
  const n = Number.parseInt(raw ?? '1', 10);
  if (!Number.isFinite(n) || n < 1 || n > MAX_PAGE) return 1;
  return n;
}

/**
 * One page of dogs whose name contains `query`, accent-insensitively.
 *
 * One path, and a refusal.
 *
 * `search_word` is a range scan over the suffixes of every distinct word, which is what
 * makes "a fragment anywhere inside a name" something an index can serve at all — the
 * reasoning is in `searchWords.ts`. It narrows; `instr` then decides, on that small set
 * rather than on 62,466 rows. `instr` still has to be there because a query of two words
 * can span a separator, which no single token covers.
 *
 * The narrowing never loses a dog. The longest token of the query contains no separator,
 * so any name containing the whole query contains that token inside a single word —
 * which is exactly what the suffix range finds. Checked against the real catalogue: 145
 * queries, no difference from a plain scan.
 *
 * `instr()` and not `LIKE '%…%'`, for two reasons found live: D1 caps a LIKE pattern at
 * 50 bytes, which katakana reaches in 17 characters, and LIKE reads a `%` typed by the
 * visitor as a wildcard.
 *
 * A query with no token of at least `MIN_TOKEN` characters is REFUSED rather than served.
 * It could only be answered by scanning the whole table, it would match most of the
 * catalogue, and with 200 pages reachable one crawler could spend a day's database
 * allowance on it — which is how search went down on 2026-09-01. A single letter is not
 * a search anyone means.
 */
export async function searchDogs(db: SearchDb, query: string, page: number): Promise<SearchResult> {
  const needle = accentFreeName(query).toLowerCase();
  const token = indexToken(needle);
  if (token === null) return { tooShort: true, total: 0, rows: [], pages: 1 };

  const where =
    'g.slug IN (SELECT wd.slug FROM search_word s ' +
    'JOIN search_word_dog wd ON wd.word = s.word ' +
    'WHERE s.suffix >= ?1 AND s.suffix < ?2) ' +
    'AND instr(g.name_folded, ?3) > 0';
  const upper = prefixUpperBound(token);

  const count = await db
    .prepare(`SELECT COUNT(*) AS n FROM dog g WHERE ${where}`)
    .bind(token, upper, needle)
    .first<{ n: number }>();
  const total = count?.n ?? 0;

  const result = await db
    .prepare(
      'SELECT g.slug, g.name, g.dob, g.registration, g.offspring_count FROM dog g ' +
        `WHERE ${where} ORDER BY g.name COLLATE NOCASE LIMIT ?4 OFFSET ?5`,
    )
    .bind(token, upper, needle, PER_PAGE, (page - 1) * PER_PAGE)
    .all<SearchRow>();

  return {
    tooShort: false,
    total,
    rows: result.results ?? [],
    pages: Math.max(1, Math.ceil(total / PER_PAGE)),
  };
}

/**
 * A pager, or nothing for a single page; plain text at the ends so there is never a link
 * to nothing. `href` builds an already-escaped URL for a page number.
 */
export function pager(href: (page: number) => string, page: number, pages: number, rel = ''): string {
  if (pages <= 1) return '';
  const extra = rel ? ` ${rel}` : '';
  const prev =
    page > 1
      ? `<a href="${href(page - 1)}" rel="prev${extra}">← Previous</a>`
      : '<span>← Previous</span>';
  const next =
    page < pages ? `<a href="${href(page + 1)}" rel="next${extra}">Next →</a>` : '<span>Next →</span>';
  return (
    `<nav class="pager" aria-label="Search results pages">${prev}` +
    `<span class="pager-where">Page ${page} of ${pages}</span>${next}</nav>`
  );
}
