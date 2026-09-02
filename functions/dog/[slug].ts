/**
 * The dynamic half of the catalogue: `/dog/<slug>` for every dog not written as a file.
 *
 * The static build writes the 3,459 indexed pages; Cloudflare Pages allows 20,000 files
 * and there are 62,469 dogs, so the rest arrive here. **The same templates render both** —
 * `renderDogPage` has no idea whether its payload came off a disk or out of a bucket,
 * which is the property that keeps the two tiers from drifting into two different sites.
 *
 * A request is: one R2 GET by key, one D1 lookup only if that misses, and a template. No
 * pedigree is walked, nothing is joined, nothing is counted — that work happened once, on
 * the owner's machine, when the extract ran (PRD §8.3).
 *
 * Pages serves a static file in preference to a Function at the same path, so this runs
 * only for dogs the build did not write. No coordination is needed between the two.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { payloadKey } from '../../src/publish/constants';
import type { DogPayload } from '../../src/publish/payload';
import { renderDogPage } from '../../src/render/dogPage';
import { renderNotFound } from '../../src/render/home';
import { SITE } from '../../src/render/site';
import { SECURITY_HEADERS } from '../../src/render/headers';

interface Env {
  /** Bucket holding one JSON payload per dog, keyed as `dog/<shard>/<slug>.json`. */
  PAYLOADS: R2Bucket;
  /** Slugs, hub membership and the redirect table. */
  DB: D1Database;
}

/**
 * How long a browser may keep a page, and how long the edge may.
 *
 * A publish is an act the owner performs, monthly or on demand (R-8.1), so a page is
 * stable for weeks at a time — but "weeks" is exactly the wrong thing to promise a
 * browser, because a correction should appear when she republishes rather than when a
 * cache decides. A short browser TTL with a long shared TTL puts the choice in the right
 * place: the edge holds the page, and a republish is what changes it.
 */
const CACHE_CONTROL = 'public, max-age=300, s-maxage=86400';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const notFound = () =>
    new Response(renderNotFound(SITE), {
      status: 404,
      headers: {
        ...SECURITY_HEADERS,
        'content-type': 'text/html; charset=utf-8',
      },
    });

  const slug = String(context.params.slug ?? '');
  if (slug === '' || !/^[a-z0-9-]+$/.test(slug)) return notFound();

  // Ask for the static file first. The indexed tier is written as files by the build, and
  // where one exists it is the answer: no R2 read, no render. Doing it this way rather
  // than by listing routes keeps the two tiers independent — 3,459 paths could not be
  // expressed in `_routes.json` anyway, which allows 100 rules.
  //
  // This depends on the build emitting `404.html`. Without it Pages answers a missing
  // asset with the ROOT index.html at status 200, every unindexed dog is served the home
  // page, and nothing reports an error anywhere. Found the hard way, 2026-08-29.
  const asset = await context.next();
  if (asset.status !== 404) return asset;

  const object = await context.env.PAYLOADS.get(payloadKey(slug));

  if (object === null) {
    // No payload under that slug. Before answering 404, ask whether the URL used to mean
    // something: a published URL never stops working (R-5.2).
    const row = await context.env.DB.prepare(
      'SELECT new_slug FROM redirect WHERE old_slug = ?',
    )
      .bind(slug)
      .first<{ new_slug: string }>();

    if (row?.new_slug) {
      return Response.redirect(new URL(`/dog/${row.new_slug}`, context.request.url).toString(), 301);
    }
    return notFound();
  }

  const payload = (await object.json()) as DogPayload;

  // Every dog is published (R-1.1), so within the live site every link resolves — the
  // predicate that makes a partial build honest is simply "yes" here.
  const html = renderDogPage(payload, SITE, () => true);

  return new Response(html, {
    headers: {
      ...SECURITY_HEADERS,
      'content-type': 'text/html; charset=utf-8',
      'cache-control': CACHE_CONTROL,
      // The payload's own hash: invalidation becomes per-page and automatic, with no
      // purge API and no Cloudflare zone (which this setup deliberately does not have).
      etag: `"${object.etag}"`,
    },
  });
};
