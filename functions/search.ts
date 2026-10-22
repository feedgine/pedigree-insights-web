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

import { formatDmy } from '../src/vendor/pedigree-insights/schema';
import { esc } from '../src/render/escape';
import { renderPage } from '../src/render/layout';
import { SITE } from '../src/render/site';
import { SECURITY_HEADERS } from '../src/render/headers';
import {
  MIN_TOKEN,
  PER_PAGE,
  pageParam,
  pager,
  searchDogs,
  type SearchRow,
} from '../src/render/searchQuery';

interface Env {
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const query = (url.searchParams.get('q') ?? '').trim();
  const page = pageParam(url.searchParams.get('page'));

  let total = 0;
  let pages = 1;
  let rows: readonly SearchRow[] = [];
  /** The query carries nothing long enough to look up — see `MIN_TOKEN`. */
  let tooShort = false;

  // The query, the refusal and the limits live in `searchQuery.ts`, shared with the
  // `/mating` page's search for a missing parent.
  if (query !== '') {
    ({ total, pages, rows, tooShort } = await searchDogs(context.env.DB, query, page));
  }

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
      pager((p) => `/search?q=${encodeURIComponent(query)}&amp;page=${p}`, page, pages),
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
      ...SECURITY_HEADERS,
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=60',
      },
    },
  );
};
