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
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { accentFreeName } from '../src/render/text';
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

  if (query !== '') {
    const like = `%${accentFreeName(query).toLowerCase()}%`;

    // Counted separately so the page can say how many there are, not just how many it is
    // showing. Two indexed reads instead of one, on a column that is indexed for it.
    const count = await context.env.DB.prepare(
      'SELECT COUNT(*) AS n FROM dog WHERE name_folded LIKE ?1',
    )
      .bind(like)
      .first<{ n: number }>();
    total = count?.n ?? 0;

    const result = await context.env.DB.prepare(
      'SELECT slug, name, dob, registration, offspring_count FROM dog ' +
        'WHERE name_folded LIKE ?1 ORDER BY name COLLATE NOCASE LIMIT ?2 OFFSET ?3',
    )
      .bind(like, PER_PAGE, (page - 1) * PER_PAGE)
      .all<Row>();
    rows = result.results ?? [];
  }

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const first = (page - 1) * PER_PAGE + 1;
  const last = first + rows.length - 1;

  let body: string;
  if (query === '') {
    body =
      '<section><h2>Search</h2><p class="note">Type a dog’s name in the box above. ' +
      'Accents are optional: <em>tahtihovin</em> finds <em>TÄHTIHOVIN</em>.</p></section>';
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
            (r.dob ? ` <span class="when">${esc(r.dob.slice(0, 10))}</span>` : '') +
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
        title:
          query === ''
            ? `Search — ${SITE.name}`
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
