/**
 * `/search?q=` — look a dog up by name (PRD §6.4).
 *
 * A server-rendered results page rather than a client-side index, for the reason that
 * governs this whole site: it must work with JavaScript disabled (R-2.8), and the search
 * box is a plain GET form on every page. Matching is on the folded name column, so
 * `lumivyoryn` finds LUMIVYÖRYN and `LUMIVYÖRYN` finds it too — diacritic-insensitive in
 * both directions (R-4.2), because the folding happened once at publish rather than per
 * query.
 *
 * Search covers the WHOLE published set, not the indexed subset (R-4.4).
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

const LIMIT = 100;

interface Row {
  slug: string;
  name: string;
  dob: string | null;
  registration: string | null;
  breeder: string | null;
  offspring_count: number;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const query = (url.searchParams.get('q') ?? '').trim();

  let rows: Row[] = [];
  if (query !== '') {
    const folded = accentFreeName(query).toLowerCase();
    const result = await context.env.DB.prepare(
      'SELECT slug, name, dob, registration, breeder, offspring_count FROM dog ' +
        'WHERE name_folded LIKE ?1 ORDER BY name COLLATE NOCASE LIMIT ?2',
    )
      .bind(`%${folded}%`, LIMIT)
      .all<Row>();
    rows = result.results ?? [];
  }

  const body =
    query === ''
      ? '<section><h2>Search</h2><p class="note">Type a dog’s name in the box above. ' +
        'Accents are optional: <em>lumivyoryn</em> finds <em>LUMIVYÖRYN</em>.</p></section>'
      : `<section><h2>${esc(String(rows.length))}${rows.length === LIMIT ? '+' : ''} ` +
        `result${rows.length === 1 ? '' : 's'} for “${esc(query)}”</h2>` +
        (rows.length === 0
          ? '<p class="note">No dog of that name is in the catalogue. ' +
            `<a href="${esc(SITE.correctionFormUrl)}">Send a correction</a> if one should be.</p>`
          : `<ul class="dogs">${rows
              .map(
                (r) =>
                  `<li><a href="/dog/${esc(r.slug)}">${esc(r.name)}</a>` +
                  (r.dob ? ` <span class="when">${esc(r.dob.slice(0, 10))}</span>` : '') +
                  '</li>',
              )
              .join('')}</ul>`) +
        '</section>';

  return new Response(
    renderPage(
      {
        title: query === '' ? `Search — ${SITE.name}` : `“${query}” — ${SITE.name}`,
        canonical: `${SITE.origin}/search`,
        // A results page is not a page a search engine should hold (it is a view of the
        // catalogue, not part of it), but its links must still be followed.
        noindex: true,
        crumbs: [{ label: 'Home', href: '/' }, { label: 'Search' }],
      },
      body,
    ),
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=60' } },
  );
};
