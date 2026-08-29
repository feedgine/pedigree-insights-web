/**
 * The page shell: head, header, breadcrumbs, footer.
 *
 * Everything here is a requirement rather than decoration. The search box is on every page
 * (R-4.1) and is a plain GET form, so it works with scripting disabled (R-2.8). The
 * breadcrumb is there because a visitor arrives from a search result and not from the home
 * page (R-2.1). The footer carries the source, the data licence, the privacy policy and
 * the correction form (R-2.7), which is the whole of what this site promises about itself.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { esc, jsonForScript, lines } from './escape';
import { SITE, type SiteConfig } from './site';

export interface Crumb {
  readonly label: string;
  /** Absent for the current page, which is named but not linked. */
  readonly href?: string;
}

export interface PageMeta {
  /** Leads with the dog's name (R-6.8). */
  readonly title: string;
  /** For the click-through, not for ranking. Omitted rather than padded. */
  readonly description?: string;
  readonly canonical: string;
  /** True for the tier that is published but not offered to search engines (R-1.2). */
  readonly noindex: boolean;
  readonly crumbs: readonly Crumb[];
  /** The JSON representation of this page, if it has one (R-6.6). */
  readonly jsonUrl?: string;
  /** Structured data, emitted as one `application/ld+json` block (R-6.4). */
  readonly jsonLd?: unknown;
}

function head(meta: PageMeta, site: SiteConfig): string {
  return lines(
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(meta.title)}</title>`,
    meta.description ? `<meta name="description" content="${esc(meta.description)}">` : '',
    `<link rel="canonical" href="${esc(meta.canonical)}">`,
    // Published, linked and crawlable — just not offered to the index (R-1.2, R-1.3).
    meta.noindex ? '<meta name="robots" content="noindex, follow">' : '',
    '<link rel="stylesheet" href="/assets/site.css">',
    meta.jsonUrl
      ? `<link rel="alternate" type="application/json" href="${esc(meta.jsonUrl)}">`
      : '',
    `<link rel="license" href="${esc(site.dataLicenceUrl)}">`,
    meta.jsonLd
      ? `<script type="application/ld+json">\n${jsonForScript(meta.jsonLd)}\n</script>`
      : '',
  );
}

function header(meta: PageMeta, site: SiteConfig): string {
  const crumbs = meta.crumbs
    .map((c) =>
      c.href ? `<li><a href="${esc(c.href)}">${esc(c.label)}</a></li>` : `<li>${esc(c.label)}</li>`,
    )
    .join('');
  return lines(
    '<header class="site-head"><div class="wrap">',
    `<a class="site-name" href="/">${esc(site.name)}</a>`,
    // A plain GET form: no script, and a bookmarkable result URL.
    '<form class="site-search" action="/search" method="get" role="search">',
    '<label class="visually-hidden" for="q">Search by name</label>',
    '<input id="q" name="q" type="search" placeholder="Search by name" autocomplete="off">',
    '<button type="submit">Search</button>',
    '</form>',
    '</div></header>',
    `<nav class="crumbs wrap" aria-label="Breadcrumb"><ol>${crumbs}</ol></nav>`,
  );
}

function footer(site: SiteConfig): string {
  return lines(
    '<footer class="site-foot"><div class="wrap">',
    `<p>Data from the ${esc(site.publisher)} pedigree database, published by ` +
      `<a href="${esc(site.publisherUrl)}">${esc(site.publisher)}</a> under ` +
      `<a href="${esc(site.dataLicenceUrl)}" rel="license">${esc(site.dataLicence)}</a>. ` +
      'Photographs are licensed separately and are not covered by that licence.</p>',
    `<p>Spotted a mistake, or have a dog to add? ` +
      `<a href="${esc(site.correctionFormUrl)}">Send a correction</a> — accepted changes go ` +
      'into the source database and appear here at the next publish.</p>',
    `<p class="fine"><a href="${esc(site.privacyPolicyUrl)}">Privacy policy</a> · ` +
      'This catalogue publishes facts about dogs. Owners, microchip numbers and litter ' +
      'records are not published.</p>',
    '</div></footer>',
  );
}

/** A complete HTML document. These are static files, so the shell is written out in full. */
export function renderPage(meta: PageMeta, body: string, site: SiteConfig = SITE): string {
  return lines(
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    head(meta, site),
    '<style>.visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}</style>',
    '</head>',
    '<body>',
    header(meta, site),
    '<main class="wrap">',
    body,
    '</main>',
    footer(site),
    '</body>',
    '</html>',
    '',
  );
}
