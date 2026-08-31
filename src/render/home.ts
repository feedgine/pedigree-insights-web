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

import { PUBLISHED_AT } from '../generated/published';
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

/**
 * The banner at the top of the home page, or nothing at all.
 *
 * With more than one configured, the choice rotates by publish date. That is the only
 * rotation a static page can honestly offer: there is no JavaScript on this site, so it
 * cannot vary per visitor — but it can vary per publish, which at a monthly cadence is a
 * monthly rotation and costs nothing.
 *
 * `width` and `height` are declared so the browser reserves the space before the image
 * arrives, and the page does not jump under the reader mid-sentence. Not lazy-loaded: it
 * is the first thing below the heading, so deferring it would only make it flash in late.
 */
function renderBanner(site: SiteConfig): string {
  if (site.banners.length === 0) return '';
  const days = Math.floor(Date.parse(`${PUBLISHED_AT}T00:00:00Z`) / 86_400_000);
  const banner = site.banners[days % site.banners.length]!;
  return (
    '<section class="banner">' +
    `<a href="${esc(banner.href)}">` +
    `<img src="${esc(banner.image)}" alt="${esc(banner.alt)}" ` +
    `width="${banner.width}" height="${banner.height}">` +
    '</a></section>'
  );
}

export function renderHome(stats: CatalogueStats, site: SiteConfig = SITE): string {
  const body = [
    '<div class="subject">',
    `<h1>${esc(site.name)}</h1>`,
    `<p class="lede">Pedigree records for ${esc(stats.dogs.toLocaleString('en'))} ` +
      `${esc(site.breed)} dogs — ancestry, offspring, siblings and DNA test results.</p>`,
    '</div>',
    renderBanner(site),
    '<section>',
    '<h2>Find a dog</h2>',
    '<p class="note">Search by name in the box above. Accents are optional — ' +
      '<em>tahtihovin</em> finds <em>TÄHTIHOVIN</em>, and the other way round.</p>',
    // Known issue, stated plainly. Someone searching a name they read on a pedigree and
    // not finding it will assume the dog is missing; it is usually recorded under the
    // spelling another register used. Saying so turns a dead end into a second try.
    '<p class="note">Names for the same dog often differ between national registers, and ' +
      'sometimes between a register and the pedigree document itself. Where sources ' +
      'disagree, this database follows a fixed order: the studbook of the country of ' +
      'origin first, then the pedigree as scanned, and only then the studbook of the ' +
      'country where the dog is registered now. If a name you know is not here, try ' +
      'another spelling of it before concluding the dog is missing.</p>',
    '<p class="note">The name also identifies the dog here. Where the same name has been ' +
      'used for more than one dog, the year of birth is added to tell them apart — for ' +
      'example <em>GODDESS OF IWAKI T.M.K. FCI (2018)</em>.</p>',
    '</section>',
    // Deliberately NOT an "about this catalogue" section. The footer already carries the
    // licence, the correction route and the privacy position on every page (R-2.7), so
    // repeating them here says the same three things twice within one screen. What a
    // visitor cannot learn from the footer is what they get by clicking through.
    '<section>',
    '<h2>What each page shows</h2>',
    '<p class="note">A four-generation pedigree. The dog’s own offspring, grouped by ' +
      'mate. Its full siblings. And whatever DNA test results are on record, shown ' +
      'exactly as recorded.</p>',
    `<p class="note">Every one of the ${esc(stats.dogs.toLocaleString('en'))} dogs has a ` +
      'page, however little is known about it — a founder with no recorded parents is ' +
      'in here too.</p>',
    '</section>',
    // The conventions a pedigree page uses, explained once here rather than captioned
    // under all 62,469 charts. A reference work should not annotate itself on every
    // page; it should be legible, and say once how to read it.
    '<section>',
    '<h2>Reading a pedigree</h2>',
    '<p class="note"><strong>Colour</strong> marks an ancestor that appears more than ' +
      'once in the same pedigree — line-breeding. Each repeated dog has its own tint, ' +
      'and the stronger the colour, the larger the share of the blood that dog ' +
      'contributes. A chart with no colour in it has no ancestor doubled up.</p>',
    '<p class="note"><strong>A name that is a link</strong> has a record of its own, and ' +
      'that record has its own pedigree behind it. <strong>A name in plain text</strong> ' +
      'is recorded only as the parent of the dog beside it — the register knows the ' +
      'name and nothing further.</p>',
    '<p class="note"><strong>An empty box</strong> is a position with no ancestor ' +
      'recorded. Every pedigree is drawn to four generations whether or not the records ' +
      'reach that far, so a short line is visibly short rather than quietly cropped.</p>',
    '</section>',
    // A first release says two useful things at once: the catalogue is alive and being
    // worked on, and here is what is missing — which is what turns a reader into someone
    // who sends a correction. Deliberately no dates: an undated plan can stay true for a
    // year, and nothing here is a commitment the Foundation has made to a schedule.
    '<section>',
    '<h2>A first release</h2>',
    '<p class="note">This is the first published version of the catalogue. Every dog in ' +
      'the register is here, with its pedigree as complete as the records allow — but ' +
      'the site around them is still being built.</p>',
    '<p class="note"><strong>Here now:</strong> a page for every dog, four-generation ' +
      'pedigrees, offspring grouped by mate, full siblings, DNA test results, search by ' +
      'name, and a JSON version of every record for anyone building on the data.</p>',
    '<p class="note"><strong>Planned:</strong> pages gathering dogs by kennel, birth ' +
      'year, country and DNA test; an A–Z index of the whole register; and photographs, ' +
      'once the right to publish each one has been settled.</p>',
    // Naming the three reports was no use to anyone who does not already run the desktop
    // application — which is most people who will read this page. Say what each answers.
    '<p class="note">Also planned: the analysis the Foundation already runs on the ' +
      'desktop, available here.</p>',
    '<ul class="plain">',
    '<li><strong>Linebreeding</strong> — which ancestors appear on both the sire’s and ' +
      'the dam’s side of a pedigree, how close up they sit, and how much of the dog they ' +
      'account for between them.</li>',
    '<li><strong>Hypothetical matings</strong> — choose a sire and a dam that have never ' +
      'been bred together and see the pedigree their puppies would have, its inbreeding ' +
      'coefficient, and a warning where both parents carry the same recessive DNA ' +
      'result.</li>',
    '<li><strong>Foundation reports</strong> — which of the breed’s founding dogs stand ' +
      'behind a pedigree, and in what proportion each of them contributed.</li>',
    '<li><strong>DNA test reports</strong> — for a chosen test, how the whole population ' +
      'divides between clear, carrier and affected, and which dogs make up each group.</li>',
    '</ul>',
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
