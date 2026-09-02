/**
 * `/search?q=` — look a dog up by name (PRD §6.4).
 *
 * A server-rendered results page rather than a client-side index, for the reason that
 * governs this whole site: it must work with JavaScript disabled (R-2.8), and the search
 * box is a plain GET form on every page. Matching is on the folded name column, so
 * `tahtihovin` finds TÄHTIHOVIN and `TÄHTIHOVIN` finds it too — diacritic-insensitive in
 * both directions (R-4.2), because the folding happened once at publish rather than per
 * query.
 *
 * Search covers the WHOLE published set, not the indexed subset (R-4.4).
 *
 * **Results are paginated, not truncated.** A kennel affix matches every dog that carries
 * it — `abaseiko` returns 107 — so a page of results is a window onto an answer rather
 * than the answer. Cutting the list at 100 and saying "100+" would hide the other seven
 * with no way to reach them, which is the same failure as a link to a page that does not
 * exist: the site would know something it declines to show. Paging is plain `?page=`
 * links, so it works with scripting off and every page of results is bookmarkable.
 *
 * **A query shorter than `MIN_TOKEN` is refused, not answered.** It is the one shape that
 * no index can serve, it matches most of the catalogue, and 200 reachable pages of it is
 * a day's database allowance for a single crawler. Refusing is not a limitation being
 * apologised for: one letter is not a search anyone means.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { accentFreeName } from '../src/render/text';
import { MIN_TOKEN, indexToken, prefixUpperBound } from '../src/publish/searchWords';
import { formatDmy } from '../src/vendor/pedigree-insights/schema';
import { esc } from '../src/render/escape';
import { renderPage } from '../src/render/layout';
import { SITE } from '../src/render/site';

interface Env {
  DB: D1Database;
}

/** Results per page. Enough that most searches are one page, few enough to scan. */
const PER_PAGE = 100;

/** A ceiling on paging, so a crawler cannot walk `?page=` forever. */
const MAX_PAGE = 200;

interface Row {
  slug: string;
  name: string;
  dob: string | null;
  registration: string | null;
  offspring_count: number;
}

/** `?page=` as a sane integer. Anything unparseable, negative or absurd becomes page 1. */
function pageParam(raw: string | null): number {
  const n = Number.parseInt(raw ?? '1', 10);
  if (!Number.isFinite(n) || n < 1 || n > MAX_PAGE) return 1;
  return n;
}

/** A pager link, or plain text at the ends so there is never a link to nothing. */
function pager(query: string, page: number, pages: number): string {
  if (pages <= 1) return '';
  const href = (p: number) => `/search?q=${encodeURIComponent(query)}&amp;page=${p}`;
  const prev =
    page > 1
      ? `<a href="${href(page - 1)}" rel="prev">← Previous</a>`
      : '<span>← Previous</span>';
  const next =
    page < pages ? `<a href="${href(page + 1)}" rel="next">Next →</a>` : '<span>Next →</span>';
  return (
    `<nav class="pager" aria-label="Search results pages">${prev}` +
    `<span class="pager-where">Page ${page} of ${pages}</span>${next}</nav>`
  );
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  const page = pageParam(url.searchParams.get('page'));

  let total = 0;
  let rows: Row[] = [];
  /** The query carries nothing long enough to look up — see `MIN_TOKEN`. */
  let tooShort = false;

  if (query !== '') {
    const needle = accentFreeName(query).toLowerCase();

    // One path, and a refusal.
    //
    // `search_word` is a range scan over the suffixes of every distinct word, which is
    // what makes "a fragment anywhere inside a name" something an index can serve at all
    // — the reasoning is in `searchWords.ts`. It narrows; `instr` then decides, on that
    // small set rather than on 62,466 rows. `instr` still has to be there because a query
    // of two words can span a separator, which no single token covers.
    //
    // The narrowing never loses a dog. The longest token of the query contains no
    // separator, so any name containing the whole query contains that token inside a
    // single word — which is exactly what the suffix range finds. Checked against the
    // real catalogue: 145 queries, no difference from a plain scan.
    //
    // `instr()` and not `LIKE '%…%'`, for two reasons found live: D1 caps a LIKE pattern
    // at 50 bytes, which katakana reaches in 17 characters, and LIKE reads a `%` typed by
    // the visitor as a wildcard.
    //
    // A query with no token of at least `MIN_TOKEN` characters is REFUSED rather than
    // served. It could only be answered by scanning the whole table, it would match most
    // of the catalogue, and with 200 pages reachable one crawler could spend a day's
    // database allowance on it — which is how search went down on 2026-09-01. A single
    // letter is not a search anyone means.
    const token = indexToken(needle);
    tooShort = token === null;

    if (token !== null) {
      const where =
        'g.slug IN (SELECT wd.slug FROM search_word s ' +
        'JOIN search_word_dog wd ON wd.word = s.word ' +
        'WHERE s.suffix >= ?1 AND s.suffix < ?2) ' +
        'AND instr(g.name_folded, ?3) > 0';
      const upper = prefixUpperBound(token);

      const count = await context.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM dog g WHERE ${where}`,
      )
        .bind(token, upper, needle)
        .first<{ n: number }>();
      total = count?.n ?? 0;

      const result = await context.env.DB.prepare(
        'SELECT g.slug, g.name, g.dob, g.registration, g.offspring_count FROM dog g ' +
          `WHERE ${where} ORDER BY g.name COLLATE NOCASE LIMIT ?4 OFFSET ?5`,
      )
        .bind(token, upper, needle, PER_PAGE, (page - 1) * PER_PAGE)
        .all<Row>();
      rows = result.results ?? [];
    }
  }

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const first = (page - 1) * PER_PAGE + 1;
  const last = first + rows.length - 1;

  let body: string;
  if (query === '') {
    body =
      '<section><h2>Search</h2><p class="note">Type a dog’s name in the box above. ' +
      'Accents are optional: <em>tahtihovin</em> finds <em>TÄHTIHOVIN</em>.</p></section>';
  } else if (tooShort) {
    body =
      `<section><h2>“${esc(query)}” is too short to search</h2>` +
      `<p class="note">Please type at least ${MIN_TOKEN} letters. One letter matches most ` +
      'of the catalogue, so the answer would be every dog rather than the one you want. ' +
      'A kennel affix on its own works well — it finds the whole line.</p></section>';
  } else if (total === 0) {
    body =
      `<section><h2>No results for “${esc(query)}”</h2>` +
      '<p class="note">No dog of that name is in the catalogue. Try a shorter part of ' +
      'the name — a kennel affix on its own will find the whole line.</p></section>';
  } else {
    const heading =
      total <= PER_PAGE
        ? `${total} result${total === 1 ? '' : 's'} for “${esc(query)}”`
        : `${total} results for “${esc(query)}” — showing ${first}–${last}`;
    body = [
      '<section>',
      `<h2>${heading}</h2>`,
      `<ul class="dogs">${rows
        .map(
          (r) =>
            `<li><a href="/dog/${esc(r.slug)}">${esc(r.name)}</a>` +
            // `formatDmy`, the same formatter the dog page and the bracket use. Slicing the
            // stored value instead printed 2016-03-17 in a result list and 17-Mar-2016 on
            // the page it links to — two spellings of one date, in two clicks.
            (r.dob ? ` <span class="when">${esc(formatDmy(r.dob) ?? r.dob)}</span>` : '') +
            '</li>',
        )
        .join('')}</ul>`,
      pager(query, page, pages),
      '</section>',
    ].join('\n');
  }

  return new Response(
    renderPage(
      {
        // The tab has to say what the page says. A refused query has no result count,
        // and printing "0 results" beside a page that explains it did not search would be
        // two answers to one question.
        title:
          query === ''
            ? `Search — ${SITE.name}`
            : tooShort
              ? `“${query}” — too short to search`
              : `“${query}” — ${total} result${total === 1 ? '' : 's'}${pages > 1 ? `, page ${page}` : ''}`,
        canonical: `${SITE.origin}/search`,
        // A results page is a view of the catalogue rather than part of it, so it is not
        // offered to the index — but its links must still be followed, which is how a
        // crawler reaches dogs no hub links to yet.
        noindex: true,
        crumbs: [{ label: 'Home', href: '/' }, { label: 'Search' }],
      },
      body,
    ),
    {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=60',
      },
    },
  );
};
