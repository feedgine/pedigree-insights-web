/**
 * `/dog/<slug>/linebreeding` and `/dog/<slug>/foundation` — the two reports for every dog.
 *
 * There is no static tier for reports: the report object is read from R2 and rendered
 * here for indexed and unindexed dogs alike. That is deliberate. The pages are `noindex`,
 * so a static copy would buy nothing from search engines, and 62,818 × 2 more files is
 * more than Pages will hold. What matters is the invariant the dog Function relies on
 * too: the template is the same one the build would use, so nothing here can drift.
 *
 * A request is one R2 GET by key and a template — the walk happened at publish
 * (PRD §8.3). A miss consults the redirect table, so a report URL survives a rename
 * exactly as the dog URL does (R-5.2).
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { FOUNDATION_LIST_KEY, reportKey } from '../../../src/publish/constants';
import { FOUNDATION_DOGS } from '../../../src/publish/foundationDogs';
import type { DogReports } from '../../../src/publish/reports';
import { renderFoundationPage, renderLinebreedingPage } from '../../../src/render/reportPage';
import { renderNotFound } from '../../../src/render/home';
import { REPORT_KINDS, SITE, type ReportKind } from '../../../src/render/site';
import { SECURITY_HEADERS } from '../../../src/render/headers';

interface Env {
  PAYLOADS: R2Bucket;
  DB: D1Database;
}

/** Same policy as the dog page: the edge keeps it, a republish changes it. */
const CACHE_CONTROL = 'public, max-age=300, s-maxage=86400';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const notFound = () =>
    new Response(renderNotFound(SITE), {
      status: 404,
      headers: { ...SECURITY_HEADERS, 'content-type': 'text/html; charset=utf-8' },
    });

  const slug = String(context.params.slug ?? '');
  const kind = String(context.params.report ?? '');
  if (slug === '' || !/^[a-z0-9-]+$/.test(slug)) return notFound();
  if (!(REPORT_KINDS as readonly string[]).includes(kind)) return notFound();

  const object = await context.env.PAYLOADS.get(reportKey(slug));

  if (object === null) {
    const row = await context.env.DB.prepare('SELECT new_slug FROM redirect WHERE old_slug = ?')
      .bind(slug)
      .first<{ new_slug: string }>();
    if (row?.new_slug) {
      return Response.redirect(
        new URL(`/dog/${row.new_slug}/${kind}`, context.request.url).toString(),
        301,
      );
    }
    return notFound();
  }

  const reports = (await object.json()) as DogReports;

  let html: string;
  // The ETag must change whenever anything the page shows changes. A Foundation page is
  // built from the dog's report AND the founder list, and most reports stay byte-identical
  // when only the list changes — so the report's own etag alone let browsers and the edge
  // keep serving "of 55" after the list had grown (2026-09-28).
  let etag = object.etag;
  if ((kind as ReportKind) === 'linebreeding') {
    html = renderLinebreedingPage(reports, SITE, () => true);
  } else {
    // The founder list is read from the bucket, where the publish put it beside the
    // reports, so the page's "of N" and its absent rows always match the data it renders.
    // The compiled constant is only the fallback for a bucket that predates the list file.
    const list = await context.env.PAYLOADS.get(FOUNDATION_LIST_KEY);
    const names =
      list === null ? FOUNDATION_DOGS : ((await list.json()) as { names: string[] }).names;
    etag = `${object.etag}-${list === null ? `c${FOUNDATION_DOGS.length}` : list.etag}`;
    html = renderFoundationPage(reports, SITE, () => true, undefined, names);
  }

  return new Response(html, {
    headers: {
      ...SECURITY_HEADERS,
      'content-type': 'text/html; charset=utf-8',
      'cache-control': CACHE_CONTROL,
      etag: `"${etag}"`,
    },
  });
};
