/**
 * `/api/dog/<slug>.json` — the JSON representation of a dog (PRD R-6.6).
 *
 * It serves the stored payload verbatim. That is the point: the page and the API cannot
 * disagree about a dog, because they are the same bytes rendered two ways. It also means
 * the whitelist protects both — a field that never left the owner's machine cannot appear
 * here either.
 *
 * Every dog page declares this URL with `<link rel="alternate" type="application/json">`,
 * so an agent that finds a page finds the data behind it without guessing at a scheme.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { payloadKey } from '../../../src/publish/constants';
import { SECURITY_HEADERS } from '../../../src/render/headers';

interface Env {
  PAYLOADS: R2Bucket;
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  // The route is `/api/dog/<slug>.json`, so the extension is part of the parameter.
  const raw = String(context.params.slug ?? '');
  const slug = raw.endsWith('.json') ? raw.slice(0, -'.json'.length) : raw;
  if (slug === '' || !/^[a-z0-9-]+$/.test(slug)) {
    return new Response('{"error":"not found"}', {
      status: 404,
      headers: {
        ...SECURITY_HEADERS,
        'content-type': 'application/json; charset=utf-8',
      },
    });
  }

  const object = await context.env.PAYLOADS.get(payloadKey(slug));
  if (object === null) {
    const row = await context.env.DB.prepare(
      'SELECT new_slug FROM redirect WHERE old_slug = ?',
    )
      .bind(slug)
      .first<{ new_slug: string }>();
    if (row?.new_slug) {
      return Response.redirect(
        new URL(`/api/dog/${row.new_slug}.json`, context.request.url).toString(),
        301,
      );
    }
    return new Response('{"error":"not found"}', {
      status: 404,
      headers: {
        ...SECURITY_HEADERS,
        'content-type': 'application/json; charset=utf-8',
      },
    });
  }

  return new Response(object.body, {
    headers: {
      ...SECURITY_HEADERS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=86400',
      etag: `"${object.etag}"`,
      // The data licence travels with the data, not only with the page (PRD §7.6).
      link: '<https://creativecommons.org/licenses/by-nc-sa/4.0/>; rel="license"',
      'access-control-allow-origin': '*',
    },
  });
};
