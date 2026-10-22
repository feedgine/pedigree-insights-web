/**
 * `/mating` — the request handling behind `functions/mating.ts` (design §6, §7).
 *
 * Only I/O and canonicalisation: no pedigree is parsed, combined or walked here. For a
 * canonical URL with two known parents a request costs one D1 query (both rows at once)
 * and two R2 GETs, whose bodies go into the page as they are. A miss costs one redirect
 * lookup per missing parent, and R2 is read only once both dogs are known.
 *
 * Kept out of the Function file, and typed by the few calls it makes on D1 and R2, so
 * the unit tests can count those calls against the budget with fakes — the Function
 * itself is the bindings and nothing else.
 *
 * [DRAFT — requires Yuliya's review]
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { matingKey } from '../publish/constants';
import {
  DEFAULT_HYPOTHETICAL_MATING_GENERATIONS,
  clampMatingGenerations,
} from '../vendor/pedigree-insights/hypotheticalMating';
import { MATING_HEADERS } from './headers';
import { renderNotFound } from './home';
import { renderMatingChoosePage, renderMatingPage, type MatingParent } from './matingPage';
import { pageParam, searchDogs, type SearchDb, type SearchResult } from './searchQuery';
import { SITE, matingPath } from './site';

/** The part of R2 the page uses. */
export interface MatingBucket {
  get(key: string): Promise<{ readonly etag: string; text(): Promise<string> } | null>;
}

export interface MatingEnv {
  readonly DB: SearchDb;
  readonly PAYLOADS: MatingBucket;
}

/** As the reports: the browser keeps it briefly, a republish changes it. */
const CACHE_CONTROL = 'public, max-age=300, s-maxage=86400';

/** As `/search`. */
const SEARCH_CACHE_CONTROL = 'public, max-age=60';

const SLUG = /^[a-z0-9-]+$/;

interface DogRow extends MatingParent {
  readonly sex: string | null;
}

function html(body: string, status: number, cacheControl: string, etag?: string): Response {
  const headers: Record<string, string> = {
    ...MATING_HEADERS,
    'content-type': 'text/html; charset=utf-8',
    'cache-control': cacheControl,
  };
  if (etag) headers.etag = `"${etag}"`;
  return new Response(body, { status, headers });
}

const notFound = () =>
  new Response(renderNotFound(SITE), {
    status: 404,
    headers: { ...MATING_HEADERS, 'content-type': 'text/html; charset=utf-8' },
  });

const redirect = (request: Request, path: string) =>
  Response.redirect(new URL(path, request.url).toString(), 301);

/** `g` as given: a whole number clamped to 3–10, or null when absent or not a number. */
function depthParam(raw: string | null): number | null {
  if (raw == null || !/^\d+$/.test(raw.trim())) return null;
  return clampMatingGenerations(Number(raw.trim()));
}

/** The query string the canonical URL would carry, for comparing with the request's. */
const searchOf = (path: string) => {
  const i = path.indexOf('?');
  return i < 0 ? '' : path.slice(i);
};

/**
 * Handle one `/mating` request. `script` is the bundle's path, from
 * `generated/matingScript.ts`; `now` is injected so the date is testable.
 */
export async function handleMating(
  request: Request,
  env: MatingEnv,
  script: string,
  now: Date = new Date(),
): Promise<Response> {
  const url = new URL(request.url);
  const params = url.searchParams;
  const sireSlug = params.get('sire') || null;
  const damSlug = params.get('dam') || null;

  // A slug that cannot exist is a 404 before any read.
  for (const s of [sireSlug, damSlug]) if (s != null && !SLUG.test(s)) return notFound();

  const gGiven = params.get('g');
  const g = depthParam(gGiven);
  const both = sireSlug != null && damSlug != null && sireSlug !== damSlug;

  // Canonical form. With two parents: sire, dam, g — a missing or out-of-range depth and
  // any other parameter are put right with one 301, before anything is read. Without a
  // pair the page is a search, whose `q`/`page` belong to it; only the depth is put right.
  if (both) {
    const canonical = matingPath({ sire: sireSlug, dam: damSlug, g: g ?? DEFAULT_HYPOTHETICAL_MATING_GENERATIONS });
    if (url.search !== searchOf(canonical)) return redirect(request, canonical);
  } else if (gGiven != null && String(g) !== gGiven) {
    const fixed = new URL(url);
    if (g == null) fixed.searchParams.delete('g');
    else fixed.searchParams.set('g', String(g));
    return redirect(request, fixed.pathname + fixed.search);
  }

  // One indexed query for both parents.
  const asked = [...new Set([sireSlug, damSlug].filter((s): s is string => s != null))];
  const found = new Map<string, DogRow>();
  if (asked.length > 0) {
    const sql =
      asked.length === 2
        ? 'SELECT slug, name, sex FROM dog WHERE slug IN (?1, ?2)'
        : 'SELECT slug, name, sex FROM dog WHERE slug = ?1';
    const rows = await env.DB.prepare(sql).bind(...asked).all<DogRow>();
    for (const r of rows.results ?? []) found.set(r.slug, r);
  }

  // A miss: the redirect table, once per missing parent — a shared mating URL survives a
  // rename or a merge as dog and report URLs do (R-5.2).
  const missing = asked.filter((s) => !found.has(s));
  if (missing.length > 0) {
    const moved = new Map<string, string>();
    for (const s of missing) {
      const row = await env.DB.prepare('SELECT new_slug FROM redirect WHERE old_slug = ?')
        .bind(s)
        .first<{ new_slug: string }>();
      if (!row?.new_slug) return notFound();
      moved.set(s, row.new_slug);
    }
    const target = new URL(url);
    if (sireSlug != null && moved.has(sireSlug)) target.searchParams.set('sire', moved.get(sireSlug)!);
    if (damSlug != null && moved.has(damSlug)) target.searchParams.set('dam', moved.get(damSlug)!);
    return redirect(request, target.pathname + target.search);
  }

  if (both) {
    const sire = found.get(sireSlug)!;
    const dam = found.get(damSlug)!;
    const [s, d] = await Promise.all([
      env.PAYLOADS.get(matingKey(sire.slug)),
      env.PAYLOADS.get(matingKey(dam.slug)),
    ]);
    // A published dog with no mating object means R2 and D1 are from different publishes.
    if (s === null || d === null) return notFound();
    const asOf = now.toISOString().slice(0, 10);
    const body = renderMatingPage({
      sire: { slug: sire.slug, name: sire.name },
      dam: { slug: dam.slug, name: dam.name },
      generations: g ?? DEFAULT_HYPOTHETICAL_MATING_GENERATIONS,
      asOf,
      sireObject: await s.text(),
      damObject: await d.text(),
      script,
    });
    // Both objects, the date (the age checks move with it) and the script (a deploy
    // changes what the page computes).
    return html(body, 200, CACHE_CONTROL, `${s.etag}-${d.etag}-${asOf}-${/mating\.([0-9a-f]+)\.js$/.exec(script)?.[1] ?? 'script'}`);
  }

  // A parent to choose. The same dog twice keeps it on the side its sex puts it.
  const same = sireSlug != null && sireSlug === damSlug;
  let sire = sireSlug != null ? (found.get(sireSlug) ?? null) : null;
  let dam = damSlug != null ? (found.get(damSlug) ?? null) : null;
  if (same) {
    if (sire?.sex === 'F') sire = null;
    else dam = null;
  }
  const query = (params.get('q') ?? '').trim();
  const page = pageParam(params.get('page'));
  let results: SearchResult | null = null;
  if (query !== '') results = await searchDogs(env.DB, query, page);

  const parent = (r: DogRow | null): MatingParent | null => (r ? { slug: r.slug, name: r.name } : null);
  return html(
    renderMatingChoosePage({
      sire: parent(sire),
      dam: parent(dam),
      sameDog: same,
      generations: g,
      query,
      page,
      results,
    }),
    200,
    SEARCH_CACHE_CONTROL,
  );
}
