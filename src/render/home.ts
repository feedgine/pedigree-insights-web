/**
 * The home page, and the small text files that sit beside it.
 *
 * The home page has one job the rest of the site depends on: it is the root of the crawl
 * and the top of every breadcrumb, so it must reach the catalogue rather than describe it.
 * The search box in the header does that on every page; here it is joined by a plain
 * statement of what the data is, who publishes it, and under what licence — which is the
 * provenance signal that tells both a reader and a machine this is the registry itself
 * and not a copy of one.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { esc } from './escape';
import { renderPage } from './layout';
import { SITE, type SiteConfig } from './site';

export interface CatalogueStats {
  readonly dogs: number;
  readonly indexed: number;
  readonly publishedAt: string;
}

/** The `Dataset` node: the database described as one thing, not 62,469 things (R-6.4). */
function datasetJsonLd(site: SiteConfig, stats: CatalogueStats): unknown {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': `${site.origin}/#dataset`,
    name: site.name,
    description:
      `Pedigree records for ${stats.dogs.toLocaleString('en')} ${site.breed} dogs, ` +
      `published by ${site.publisher}.`,
    url: `${site.origin}/`,
    license: site.dataLicenceUrl,
    isAccessibleForFree: true,
    creator: { '@type': 'Organization', name: site.publisher, url: site.publisherUrl },
    publisher: { '@id': `${site.origin}/#publisher` },
    dateModified: stats.publishedAt.slice(0, 10),
    distribution: {
      '@type': 'DataDownload',
      encodingFormat: 'application/json',
      contentUrl: `${site.origin}/api/dog/{slug}.json`,
    },
  };
}

export function renderHome(stats: CatalogueStats, site: SiteConfig = SITE): string {
  const body = [
    '<div class="subject">',
    `<h1>${esc(site.name)}</h1>`,
    `<p class="lede">Pedigree records for ${esc(stats.dogs.toLocaleString('en'))} ` +
      `${esc(site.breed)} dogs — ancestry, offspring, siblings and DNA test results, ` +
      `published by <a href="${esc(site.publisherUrl)}">${esc(site.publisher)}</a>.</p>`,
    '</div>',
    '<section>',
    '<h2>Find a dog</h2>',
    '<p class="note">Search by name in the box above. Accents are optional — ' +
      '<em>lumivyoryn</em> finds <em>LUMIVYÖRYN</em>, and the other way round.</p>',
    '</section>',
    '<section>',
    '<h2>About this catalogue</h2>',
    `<p class="note">Every dog in the database has a page. The records come from the ` +
      `${esc(site.publisher)} pedigree database and are published under ` +
      `<a href="${esc(site.dataLicenceUrl)}" rel="license">${esc(site.dataLicence)}</a>. ` +
      'This catalogue publishes facts about dogs: owners, microchip numbers and litter ' +
      'records are not published.</p>',
    `<p class="note">Something wrong or missing? ` +
      `<a href="${esc(site.correctionFormUrl)}">Send a correction</a> — accepted changes ` +
      'go into the source database and appear here at the next publish.</p>',
    '</section>',
  ].join('\n');

  return renderPage(
    {
      title: `${site.name} — pedigrees, offspring and DNA results`,
      description:
        `Searchable pedigree records for ${stats.dogs.toLocaleString('en')} ${site.breed} ` +
        `dogs: ancestry, offspring, siblings and DNA test results. Published by ` +
        `${site.publisher} under ${site.dataLicence}.`,
      canonical: `${site.origin}/`,
      noindex: false,
      crumbs: [{ label: 'Home' }],
      jsonLd: datasetJsonLd(site, stats),
    },
    body,
    site,
  );
}

/**
 * The not-found page — and the reason the site cannot do without one.
 *
 * Cloudflare Pages, asked for a path that matches no static file, serves the root
 * `index.html` **with status 200** unless a `404.html` exists. That makes "no such asset"
 * indistinguishable from "here is your page" to anything downstream — including the
 * Function that serves the dynamic tier, which asks for the static asset first and reads
 * the status to decide whether to look in R2. Without this file every unindexed dog is
 * answered with the home page, and nothing anywhere reports an error.
 *
 * So this is not decoration. It is the signal the routing depends on.
 */
export function renderNotFound(site: SiteConfig = SITE): string {
  return renderPage(
    {
      title: `Not found — ${site.name}`,
      canonical: `${site.origin}/404`,
      noindex: true,
      crumbs: [{ label: 'Home', href: '/' }, { label: 'Not found' }],
    },
    [
      '<div class="subject">',
      '<h1>Not found</h1>',
      '</div>',
      '<section>',
      '<p class="note">There is no page at this address. The dog may have been recorded ' +
        'under a different spelling of its name — try searching for part of it in the box ' +
        'above, where accents are optional.</p>',
      `<p class="note">If a dog is missing from the catalogue altogether, ` +
        `<a href="${esc(site.correctionFormUrl)}">send a correction</a> — accepted ` +
        'additions go into the source database and appear here at the next publish.</p>',
      '</section>',
    ].join('\n'),
    site,
  );
}

/**
 * `robots.txt` — the ONLY crawler control this setup has.
 *
 * Without a Cloudflare zone there are no cache rules, no WAF and no managed crawler
 * controls (PRD §8.3), so everything the Foundation wants to say to a crawler is said
 * here. It is written permissively on purpose: the point of the catalogue is to be found,
 * and to be citable by the assistants people now ask about dogs. The crawl delay is the
 * courtesy a small free-tier site owes a large crawler.
 */
export function robotsTxt(site: SiteConfig = SITE): string {
  return [
    '# The Japanese Spitz Foundation pedigree database.',
    '# The catalogue is meant to be found, read and cited. Crawl politely.',
    '',
    'User-agent: *',
    'Allow: /',
    '# Search results are a view of the catalogue, not part of it.',
    'Disallow: /search',
    'Crawl-delay: 10',
    '',
    `Sitemap: ${site.origin}/sitemap.xml`,
    '',
  ].join('\n');
}

/**
 * Which paths the Functions runtime is asked about. Everything else is a static file
 * served without invoking any code at all.
 *
 * `/dog/*` is included even though 3,459 of those paths are static files, because the
 * rule list is capped at 100 entries and could never name them. The Function asks for the
 * static asset first and returns it when there is one, so an indexed page still costs no
 * R2 read and no render.
 */
export function routesJson(): string {
  return `${JSON.stringify(
    { version: 1, include: ['/dog/*', '/api/*', '/search'], exclude: ['/assets/*'] },
    null,
    2,
  )}\n`;
}

/**
 * The sitemap: the indexed set, with the date of the publish that produced it (R-6.1).
 *
 * Only the indexed tier appears. That is the whole distinction the index rule exists to
 * draw — every dog is published and crawlable, and this file is the smaller statement of
 * which pages the Foundation is actually offering to search engines (R-1.2, R-1.3).
 */
export function sitemapXml(
  slugs: readonly string[],
  lastmod: string,
  site: SiteConfig = SITE,
): string {
  const day = lastmod.slice(0, 10);
  const urls = slugs
    .map(
      (slug) =>
        `  <url><loc>${esc(`${site.origin}/dog/${slug}`)}</loc>` +
        `<lastmod>${esc(day)}</lastmod></url>`,
    )
    .join('\n');
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * `llms.txt` (R-6.7) — what the dataset is, how its URLs are shaped, and what an
 * assistant may do with it.
 *
 * Worth writing carefully rather than generating: the licence line is the part that tells
 * an assistant whether it may quote the Foundation, and the URL patterns are what let one
 * fetch a dog it has heard about instead of guessing.
 */
export function llmsTxt(stats: CatalogueStats, site: SiteConfig = SITE): string {
  return [
    `# ${site.name}`,
    '',
    `> Pedigree records for ${stats.dogs.toLocaleString('en')} ${site.breed} dogs, ` +
      `published by ${site.publisher}. Ancestry, offspring, full siblings and DNA test ` +
      'results, drawn from the club register itself.',
    '',
    '## What is here',
    '',
    `- Every dog in the database has a page at \`/dog/<slug>\`, where the slug is the ` +
      "dog's registered name, lower-cased, accents stripped, spaces hyphenated.",
    `- A JSON representation of each dog is at \`/api/dog/<slug>.json\` — the same data ` +
      'the page is rendered from, not a summary of it.',
    '- Search by name: `/search?q=<name>`. Accents are optional in either direction.',
    `- ${stats.indexed.toLocaleString('en')} pages are listed in \`/sitemap.xml\`; the ` +
      'rest are published and linked but not offered to search engines.',
    '',
    '## Terms',
    '',
    `- Data licence: ${site.dataLicence} — ${site.dataLicenceUrl}`,
    `- Attribution: ${site.publisher} — ${site.publisherUrl}`,
    '- Photographs are licensed separately and are NOT covered by the data licence.',
    '- The catalogue publishes facts about dogs. Owners, microchip numbers and litter',
    '  records are deliberately absent and should not be inferred.',
    '',
    `Last published: ${stats.publishedAt.slice(0, 10)}`,
    '',
  ].join('\n');
}
