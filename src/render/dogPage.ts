/**
 * One dog page (PRD §6.2), assembled from a payload and nothing else.
 *
 * The sections appear in the order the requirement lists them, because that order is the
 * argument: who this dog is, where it came from, what it produced, who it was born beside,
 * and how to reach the rest of the catalogue from here.
 *
 * Two rules run through every section and are not repeated in each one:
 *
 *  - **An absent field is silent** (R-2.9). No "unknown", no empty row, no dash. A helper
 *    returns an empty string for a missing section and `lines()` drops it.
 *  - **Nothing needs JavaScript** (R-2.8). There is no script on the page at all, which is
 *    the strongest form of that guarantee.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { formatDmy } from '../vendor/pedigree-insights/schema';
import type { DogPayload, DogRef } from '../publish/payload';
import { renderBracket } from './bracket';
import { esc, lines } from './escape';
import { dogJsonLd } from './jsonld';
import { renderPage, type PageMeta } from './layout';
import { SITE, dogJsonUrl, dogUrl, type SiteConfig } from './site';
import { accentFreeName } from './text';

/** `24-Aug-1994`, or undefined. */
const when = (value: string | undefined): string | undefined =>
  value == null ? undefined : (formatDmy(value) ?? undefined);

const SEX_WORD: Record<string, string> = { M: 'male', F: 'female' };

/**
 * Whether a page exists for a slug in the build being rendered.
 *
 * The default says yes to everything, which is right for the finished site: every dog is
 * published (R-1.1), the indexed tier as files and the rest from D1. A partial build —
 * `--include indexed`, or a `--limit` while looking at something — passes the real set, so
 * a page never links to something that is not there.
 */
export type HasPage = (slug: string) => boolean;

/** A dog in a list: a link where a page exists for it, plain text where none does. */
function dogLink(d: DogRef, hasPage: HasPage): string {
  const born = when(d.dob);
  const name =
    d.slug != null && hasPage(d.slug)
      ? `<a href="/dog/${esc(d.slug)}">${esc(d.name)}</a>`
      : `<span>${esc(d.name)}</span>`;
  return `<li>${name}${born ? ` <span class="when">${esc(born)}</span>` : ''}</li>`;
}

/**
 * The page title (R-6.8).
 *
 * It leads with the name — people search the name, not "japanese spitz <name>" — and then
 * promises only what the page actually has. A title offering "offspring and DNA results"
 * for a dog with neither is a small lie that a visitor discovers one click later.
 */
export function pageTitle(payload: DogPayload, site: SiteConfig): string {
  const has: string[] = ['pedigree'];
  if (payload.offspringCount > 0) has.push('offspring');
  if (payload.context.dna.length > 0) has.push('DNA results');
  const tail = has.length === 1 ? has[0] : `${has.slice(0, -1).join(', ')} and ${has.at(-1)}`;
  return `${payload.name} — ${payload.subject.breed ?? site.breed} ${tail}`;
}

/**
 * One natural sentence describing the dog: name, accent-free variant, breed, sex, date of
 * birth, registration and breeder. Every part is optional and the sentence stays
 * grammatical without any of them.
 *
 * It is the page's **meta description** and nothing else. It used to open the body as
 * well (PRD R-6.8) and was removed from the visible page on the owner's instruction,
 * 2026-08-28: the facts list under the heading says the same things without a paragraph
 * of prose above it. The cost is real and recorded rather than argued away — the first
 * sentence of visible text is one of the few things that carries meaning to a search
 * engine, and a definition list carries it less well.
 */
export function lede(payload: DogPayload, site: SiteConfig): string {
  const s = payload.subject;
  const plain = accentFreeName(payload.name);
  const alt = plain === payload.name ? '' : ` (${plain})`;

  const sex = s.sex ? SEX_WORD[s.sex] : undefined;
  const breed = s.breed ?? site.breed;
  const born = when(s.dob);

  let sentence = `${payload.name}${alt} is a ${[sex, breed].filter(Boolean).join(' ')}`;
  if (born) sentence += ` born ${born}`;
  if (s.died) sentence += `, died ${when(s.died)}`;
  if (s.registration) sentence += `, registration ${s.registration}`;
  if (s.breeder) sentence += `, bred by ${s.breeder}`;
  return `${sentence}.`;
}

/** The subject card (R-2.2): the same information the desktop application shows. */
function subjectCard(payload: DogPayload, site: SiteConfig): string {
  const s = payload.subject;
  const facts: [string, string | undefined][] = [
    ['Born', when(s.dob)],
    ['Died', when(s.died)],
    ['Sex', s.sex ? SEX_WORD[s.sex] : undefined],
    ['Registration', s.registration],
    ['Registry', s.register],
    ['Breeder', s.breeder],
    ['Country of origin', s.country],
    ['Other name', s.callName],
    // The stored COI is a fraction; it is shown as the percentage a breeder expects.
    ['Inbreeding coefficient', s.coi == null ? undefined : `${(s.coi * 100).toFixed(2)}%`],
  ];
  const rows = facts
    .filter((f): f is [string, string] => f[1] !== undefined && f[1] !== '')
    .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`)
    .join('');

  // The photograph appears here and nowhere else — never in a saved or downloadable
  // output, even where one exists (MVP limitation L-5 / R-7.3). The print rules drop it.
  const photo = s.photo
    ? `<figure class="subject-photo photo"><img src="/photos/${esc(s.photo)}" alt="${esc(payload.name)}" loading="lazy">` +
      `<figcaption>Photograph published by ${esc(site.publisher)}; licensed separately from the data.</figcaption></figure>`
    : '';

  return lines(
    '<div class="subject">',
    s.preTitle ? `<p class="titles">${esc(s.preTitle)}</p>` : '',
    `<h1>${esc(payload.name)}</h1>`,
    s.postTitle ? `<p class="titles">${esc(s.postTitle)}</p>` : '',
    '<div class="subject-body">',
    photo,
    rows ? `<dl class="facts">${rows}</dl>` : '',
    '</div>',
    '</div>',
  );
}

/** Offspring, grouped by mate (R-2.4). */
function offspringSection(payload: DogPayload, hasPage: HasPage): string {
  if (payload.offspring.length === 0) return '';
  const groups = payload.offspring
    .map((g) => {
      const mate =
        g.mate == null
          ? 'Dam or sire not recorded'
          : g.mateSlug && hasPage(g.mateSlug)
            ? `<a href="/dog/${esc(g.mateSlug)}">${esc(g.mate)}</a>`
            : esc(g.mate);
      return lines(
        '<div class="litter">',
        `<h3>with ${mate} — ${g.dogs.length} ${g.dogs.length === 1 ? 'offspring' : 'offspring'}</h3>`,
        `<ul class="dogs">${g.dogs.map((d) => dogLink(d, hasPage)).join('')}</ul>`,
        '</div>',
      );
    })
    .join('\n');

  return lines(
    '<section id="offspring">',
    `<h2>Offspring (${payload.offspringCount})</h2>`,
    groups,
    '</section>',
  );
}

/** Full siblings — dogs sharing both parents (R-2.5). Half siblings are out of scope. */
function siblingSection(payload: DogPayload, hasPage: HasPage): string {
  if (payload.fullSiblings.length === 0) return '';
  return lines(
    '<section id="siblings">',
    `<h2>Full siblings (${payload.fullSiblings.length})</h2>`,
    `<ul class="dogs">${payload.fullSiblings.map((d) => dogLink(d, hasPage)).join('')}</ul>`,
    '</section>',
  );
}

/**
 * A chip: a link when the hub it points at exists, plain text when it does not.
 *
 * The fact is worth showing either way — "Bred by Lesley Mott" tells a visitor something
 * on its own. What is not worth doing is shipping 62,467 pages of links to a route
 * nobody has built.
 */
function chip(label: string, href: string, live: boolean): string {
  return live
    ? `<li><a href="${esc(href)}">${esc(label)}</a></li>`
    : `<li><span>${esc(label)}</span></li>`;
}

/** The context strip (R-2.6): each fact a way into the rest of the catalogue. */
function contextSection(payload: DogPayload, site: SiteConfig): string {
  const c = payload.context;
  const chips: string[] = [];
  if (c.kennel && c.kennelSlug) {
    chips.push(chip(`Bred by ${c.kennel}`, `/kennel/${c.kennelSlug}`, site.hubs.kennel));
  }
  if (c.birthYear) chips.push(chip(`Born ${c.birthYear}`, `/year/${c.birthYear}`, site.hubs.year));
  if (c.country) {
    chips.push(chip(`From ${c.country}`, `/country/${c.country.toLowerCase()}`, site.hubs.country));
  }

  const dna =
    c.dna.length === 0
      ? ''
      : lines(
          '<table class="dna">',
          '<tbody>',
          c.dna
            .map(
              (d) =>
                `<tr><th scope="row">${esc(d.test)}</th><td>${esc(d.result)}</td>` +
                (site.hubs.dna
                  ? `<td><a href="/dna/${esc(d.test.toLowerCase())}">All dogs tested</a></td>`
                  : '<td></td>') +
                '</tr>',
            )
            .join(''),
          '</tbody>',
          '</table>',
        );

  if (chips.length === 0 && dna === '') return '';
  return lines(
    '<section id="context">',
    '<h2>Elsewhere in the database</h2>',
    chips.length > 0 ? `<ul class="chips">${chips.join('')}</ul>` : '',
    dna,
    '</section>',
  );
}

/** The pedigree bracket section (R-2.3). Always four generations, blanks and all. */
function bracketSection(payload: DogPayload, hasPage: HasPage): string {
  const bracket = renderBracket(payload.bracket, hasPage);
  return lines(
    '<section id="pedigree">',
    '<h2>Pedigree</h2>',
    bracket,
    '</section>',
  );
}

/** The whole page. */
export function renderDogPage(
  payload: DogPayload,
  site: SiteConfig = SITE,
  hasPage: HasPage = () => true,
  publishedAt?: string,
): string {
  const plain = accentFreeName(payload.name);
  const meta: PageMeta = {
    title: pageTitle(payload, site),
    description: lede(payload, site),
    canonical: dogUrl(site, payload.slug),
    noindex: !payload.indexed,
    publishedAt,
    jsonUrl: dogJsonUrl(site, payload.slug),
    jsonLd: dogJsonLd(payload, site, plain, hasPage),
    crumbs: [
      { label: 'Home', href: '/' },
      ...(payload.context.kennel && payload.context.kennelSlug
        ? [
            {
              label: payload.context.kennel,
              // Named, but linked only once kennel pages exist — a breadcrumb that 404s
              // is worse than a breadcrumb that is only a label.
              href: site.hubs.kennel
                ? `/kennel/${payload.context.kennelSlug}`
                : undefined,
            },
          ]
        : []),
      { label: payload.name },
    ],
  };

  const body = lines(
    subjectCard(payload, site),
    bracketSection(payload, hasPage),
    offspringSection(payload, hasPage),
    siblingSection(payload, hasPage),
    contextSection(payload, site),
  );

  return renderPage(meta, body, site);
}
