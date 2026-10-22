/**
 * The `/mating` page as the server sends it — the shell around the browser's analysis
 * (design §6).
 *
 * The server does no pedigree work here. With both parents known, the page carries them
 * linked to their dog pages, then the depth and swap/change controls, then
 * `#mating-analysis`, where the script puts the litter bracket first. The two stored mating
 * objects as `application/json` data blocks **inserted byte for byte** (they were made
 * safe to embed at publish, `scriptSafeJson`), and one external script that computes and
 * renders the analysis into `#mating-analysis`. With scripting off, what is left is
 * complete on its own terms: the parents, the controls, and a note saying why there is no
 * analysis — never a partial one (R-2.8 as clarified for `/mating`, 2026-10-22).
 *
 * With a parent missing, or the same dog given twice, the page is a GET search for the
 * other parent, using `/search`'s own query and limits (`searchQuery.ts`); every result
 * links to the completed mating URL, so the whole page works without JavaScript.
 *
 * Every link to `/mating` carries `rel="nofollow"`, and the page is `noindex, follow`: it
 * is a calculator over the catalogue, not part of it.
 *
 * [DRAFT — requires Yuliya's review]
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import {
  DEFAULT_HYPOTHETICAL_MATING_GENERATIONS,
  HYPOTHETICAL_MATING_MAX_GENERATIONS,
  HYPOTHETICAL_MATING_MIN_GENERATIONS,
} from '../vendor/pedigree-insights/hypotheticalMating';
import { formatDmy } from '../vendor/pedigree-insights/schema';
import { esc, lines } from './escape';
import { renderPage, type PageMeta } from './layout';
import { MIN_TOKEN, pager, type SearchResult } from './searchQuery';
import { SITE, matingPath, type SiteConfig } from './site';

/** A parent as the shell shows it: its D1 row, enough to name and link it. */
export interface MatingParent {
  readonly slug: string;
  readonly name: string;
  /** `'M'`, `'F'`, or null when unrecorded; decides whether swapping is offered. */
  readonly sex: string | null;
}

/** Both parents known and distinct: the full page. */
export interface MatingPairView {
  readonly sire: MatingParent;
  readonly dam: MatingParent;
  readonly generations: number;
  /** The request's UTC date, `YYYY-MM-DD`; the age checks are computed as of it. */
  readonly asOf: string;
  /** The stored R2 objects, exactly as read. */
  readonly sireObject: string;
  readonly damObject: string;
  /** `/assets/mating.<hash>.js`, from `generated/matingScript.ts`. */
  readonly script: string;
}

/** A parent to choose: one is missing, or the same dog was given twice. */
export interface MatingChooseView {
  /** The parent kept; null when neither was given. */
  readonly sire: MatingParent | null;
  readonly dam: MatingParent | null;
  /** True when the request named one dog as both parents. */
  readonly sameDog: boolean;
  /** The depth asked for, carried into every result link; null when none was given. */
  readonly generations: number | null;
  readonly query: string;
  readonly page: number;
  /** null when no search was made. */
  readonly results: SearchResult | null;
}

const PAGE_TITLE = 'Plan a mating';

const NOSCRIPT_NOTE = 'The analysis is calculated in your browser and needs JavaScript.';

const dogLink = (p: MatingParent) => `<a href="/dog/${esc(p.slug)}">${esc(p.name)}</a>`;

/** A `/mating` link: always `rel="nofollow"`. */
const matingLink = (href: string, text: string) => `<a href="${esc(href)}" rel="nofollow">${esc(text)}</a>`;

function crumbs() {
  return [{ label: 'Home', href: '/' }, { label: PAGE_TITLE }];
}

function meta(title: string, path: string, site: SiteConfig): PageMeta {
  return { title, canonical: `${site.origin}${path}`, noindex: true, crumbs: crumbs() };
}

/** The depth form: a GET form, so changing the depth works with scripting off. */
function depthForm(v: MatingPairView): string {
  const options: string[] = [];
  for (let g = HYPOTHETICAL_MATING_MIN_GENERATIONS; g <= HYPOTHETICAL_MATING_MAX_GENERATIONS; g += 1) {
    options.push(`<option value="${g}"${g === v.generations ? ' selected' : ''}>${g}</option>`);
  }
  return lines(
    '<form class="mating-controls mating-depth" action="/mating" method="get">',
    `<input type="hidden" name="sire" value="${esc(v.sire.slug)}">`,
    `<input type="hidden" name="dam" value="${esc(v.dam.slug)}">`,
    '<label for="mating-g">Generations</label>',
    `<select id="mating-g" name="g">${options.join('')}</select>`,
    '<button type="submit">Recalculate</button>',
    '</form>',
  );
}

/**
 * Swapping is offered only where it could fix something: a sire not recorded as male or a
 * dam not recorded as female. An unrecorded sex counts, since the visitor may know better.
 */
export function swapOffered(sire: MatingParent, dam: MatingParent): boolean {
  return sire.sex !== 'M' || dam.sex !== 'F';
}

/** The full page: parents, controls, data blocks, the script, and the place it writes. */
export function renderMatingPage(v: MatingPairView, site: SiteConfig = SITE): string {
  const g = v.generations;
  const links = [
    matingLink(matingPath({ dam: v.dam.slug, g }), 'Change sire'),
    matingLink(matingPath({ sire: v.sire.slug, g }), 'Change dam'),
  ];
  if (swapOffered(v.sire, v.dam)) {
    links.unshift(matingLink(matingPath({ sire: v.dam.slug, dam: v.sire.slug, g }), 'Swap sire and dam'));
  }
  const controls = `<p class="mating-controls">${links.join(' · ')}</p>`;

  const body = lines(
    '<div class="subject">',
    `<h1>Planned litter</h1>`,
    '</div>',
    '<section id="mating">',
    '<ul class="report-stats mating-parents">',
    `<li>Sire: <strong>${dogLink(v.sire)}</strong></li>`,
    `<li>Dam: <strong>${dogLink(v.dam)}</strong></li>`,
    '</ul>',
    depthForm(v),
    controls,
    // Verbatim. The objects were escaped for exactly this at publish, and parsing or
    // re-serialising them here would be server-side work the design rules out.
    `<script type="application/json" id="mating-sire">${v.sireObject}</script>`,
    `<script type="application/json" id="mating-dam">${v.damObject}</script>`,
    `<div id="mating-analysis" data-generations="${g}" data-as-of="${esc(v.asOf)}">`,
    `<noscript><p class="note">${esc(NOSCRIPT_NOTE)}</p></noscript>`,
    '</div>',
    '</section>',
    `<script src="${esc(v.script)}" defer></script>`,
  );

  return renderPage(
    meta(
      `${v.sire.name} × ${v.dam.name} — planned litter`,
      matingPath({ sire: v.sire.slug, dam: v.dam.slug, g }),
      site,
    ),
    body,
    site,
  );
}

/** The search for the missing parent, and its results. */
function searchSection(v: MatingChooseView, role: 'sire' | 'dam', kept: MatingParent | null): string {
  const g = v.generations;
  const keptRole = role === 'sire' ? 'dam' : 'sire';
  const form = lines(
    '<form class="mating-search" action="/mating" method="get" role="search">',
    kept ? `<input type="hidden" name="${keptRole}" value="${esc(kept.slug)}">` : '',
    g != null ? `<input type="hidden" name="g" value="${g}">` : '',
    `<label for="mating-q">Search for the ${role} by name</label>`,
    `<input id="mating-q" name="q" type="search" value="${esc(v.query)}" autocomplete="off">`,
    '<button type="submit">Search</button>',
    '</form>',
  );

  const r = v.results;
  if (r == null) return form;
  if (r.tooShort) {
    return lines(form, `<p class="note">Please type at least ${MIN_TOKEN} letters.</p>`);
  }
  if (r.total === 0) {
    return lines(
      form,
      `<p class="note">No dog in the catalogue matches “${esc(v.query)}”. Try a shorter part of the name.</p>`,
    );
  }

  const completed = (slug: string) =>
    role === 'sire'
      ? matingPath({ sire: slug, dam: kept?.slug, g: g ?? DEFAULT_HYPOTHETICAL_MATING_GENERATIONS })
      : matingPath({ sire: kept?.slug, dam: slug, g: g ?? DEFAULT_HYPOTHETICAL_MATING_GENERATIONS });
  // With no parent kept, a result picks the sire and the next page asks for the dam —
  // there is no pair to complete yet, so no depth in the link either.
  const target = (slug: string) => (kept ? completed(slug) : matingPath({ sire: slug, g }));

  const results = r.rows
    .filter((row) => row.slug !== kept?.slug)
    .map(
      (row) =>
        `<li>${matingLink(target(row.slug), row.name)}` +
        (row.dob ? ` <span class="when">${esc(formatDmy(row.dob) ?? row.dob)}</span>` : '') +
        '</li>',
    )
    .join('');
  const pageHref = (p: number) =>
    esc(
      `${matingPath(role === 'sire' ? { dam: kept?.slug, g } : { sire: kept?.slug, g })}` +
        `${kept || g != null ? '&' : '?'}q=${encodeURIComponent(v.query)}&page=${p}`,
    );
  return lines(
    form,
    `<p class="report-count">${r.total} result${r.total === 1 ? '' : 's'} for “${esc(v.query)}”</p>`,
    `<ul class="dogs">${results}</ul>`,
    pager(pageHref, v.page, r.pages, 'nofollow'),
  );
}

/** One parent known, none, or the same dog twice: ask for the other. */
export function renderMatingChoosePage(v: MatingChooseView, site: SiteConfig = SITE): string {
  const kept = v.sire ?? v.dam;
  const role: 'sire' | 'dam' = v.sire ? 'dam' : 'sire';

  const intro = v.sameDog && kept
    ? `<p class="note">${dogLink(kept)} was given as both sire and dam. The two parents ` +
      `must be different dogs — search for the ${role} below.</p>`
    : kept
      ? `<p class="note">${v.sire ? 'Sire' : 'Dam'}: <strong>${dogLink(kept)}</strong>. ` +
        `Search for the ${role} to see the planned litter.</p>`
      : '<p class="note">Search for the sire, then the dam, to see the planned litter: its ' +
        'inbreeding coefficient, common ancestors and pedigree.</p>';

  const body = lines(
    '<div class="subject">',
    `<h1>${esc(PAGE_TITLE)}</h1>`,
    '</div>',
    '<section id="mating">',
    intro,
    searchSection(v, role, kept),
    '</section>',
  );

  return renderPage(
    meta(
      kept ? `${PAGE_TITLE} — ${kept.name}` : PAGE_TITLE,
      matingPath({ sire: v.sire?.slug, dam: v.dam?.slug, g: v.generations }),
      site,
    ),
    body,
    site,
  );
}
