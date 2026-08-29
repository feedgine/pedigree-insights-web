/**
 * Structured data for a dog page (PRD R-6.4, R-6.5).
 *
 * The one fact that shapes this whole file: **schema.org has no `Dog` type.** There is no
 * `Animal` and no `Pet` either — `Thing`'s children are Action, BioChemEntity,
 * CreativeWork, Event, Intangible, Organization, Person, Place and Product. Any
 * `Thing > Animal > Pet > Dog` chain is invented, and emitting `"@type": "Dog"` produces a
 * node no consumer understands. So the markup is in three layers:
 *
 *  1. **schema.org for the page furniture** — `WebPage`, `BreadcrumbList` (which Google
 *     actually renders) and `Organization` as the publisher, which is the provenance
 *     signal that says where this data came from.
 *  2. **A `pdg:` vocabulary of the Foundation's own** for the dog itself, hung off a
 *     `Thing` with `additionalType` pointing at Wikidata.
 *  3. Sire, dam and offspring as **`@id` references to other pages' dog nodes**, so the
 *     catalogue reads as one graph an agent can walk rather than 62,000 islands.
 *
 * R-6.5: only fields that are held and whitelisted. Nothing is padded, and a dog with no
 * date of birth simply has no `pdg:dateOfBirth` — not an empty one.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import type { DogPayload } from '../publish/payload';
import { dogUrl, type SiteConfig } from './site';

/** Wikidata identifiers used with `additionalType`. Verified before shipping (OI-4). */
export const WIKIDATA_DOG = 'https://www.wikidata.org/wiki/Q144';
export const WIKIDATA_JAPANESE_SPITZ = 'https://www.wikidata.org/wiki/Q38126';

/** The `@id` of a dog node — the page URL plus a fragment, so it is globally unique. */
function dogNodeId(site: SiteConfig, slug: string): string {
  return `${dogUrl(site, slug)}#dog`;
}

/**
 * A reference to another dog: an `@id` where a page exists for it, a bare name where none
 * does.
 *
 * The same rule the visible links follow, and for a stronger reason. An `@id` is a
 * machine-readable assertion that a node exists at that address; pointing one at a page
 * this build does not contain is a promise to a crawler that the site cannot keep.
 */
function ref(
  site: SiteConfig,
  name: string,
  slug: string | null,
  hasPage: (slug: string) => boolean,
): unknown {
  return slug == null || !hasPage(slug) ? { name } : { '@id': dogNodeId(site, slug) };
}

function dropEmpty<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) delete o[k];
  }
  return o;
}

/** ISO date from a stored `YYYY-MM-DD hh:mm:ss`, or undefined. Text only, no timezone. */
function isoDate(value: string | undefined): string | undefined {
  const m = value?.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : undefined;
}

/**
 * The whole `application/ld+json` block for one dog page.
 *
 * Returned as a `@graph` so the page furniture and the dog are separate nodes that can
 * refer to each other, rather than one node pretending to be both.
 */
export function dogJsonLd(
  payload: DogPayload,
  site: SiteConfig,
  accentFreeName: string,
  hasPage: (slug: string) => boolean = () => true,
): unknown {
  const url = dogUrl(site, payload.slug);
  const s = payload.subject;

  const publisher = {
    '@type': 'Organization',
    '@id': `${site.origin}/#publisher`,
    name: site.publisher,
    url: site.publisherUrl,
  };

  // The breadcrumb names only pages that exist. Advertising a kennel URL to a crawler
  // before the route is built is a 404 offered in structured data, which is worse than a
  // shorter trail: it is a machine-readable promise.
  const crumbs = [
    { name: 'Home', item: `${site.origin}/` },
    ...(site.hubs.kennel && payload.context.kennel && payload.context.kennelSlug
      ? [
          {
            name: payload.context.kennel,
            item: `${site.origin}/kennel/${payload.context.kennelSlug}`,
          },
        ]
      : []),
    { name: payload.name, item: url },
  ];

  const webPage = {
    '@type': 'WebPage',
    '@id': url,
    url,
    name: payload.name,
    isPartOf: { '@id': `${site.origin}/#dataset` },
    publisher: { '@id': publisher['@id'] },
    license: site.dataLicenceUrl,
    mainEntity: { '@id': dogNodeId(site, payload.slug) },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        item: c.item,
      })),
    },
  };

  const offspring = payload.offspring.flatMap((g) =>
    g.dogs.map((d) => ref(site, d.name, d.slug, hasPage)),
  );

  const dog = dropEmpty({
    '@type': 'Thing',
    '@id': dogNodeId(site, payload.slug),
    additionalType: [WIKIDATA_DOG],
    name: payload.name,
    // The accent-free spelling is a real alternate name people type and search for.
    alternateName: accentFreeName === payload.name ? undefined : accentFreeName,
    url,
    'pdg:breed': s.breed ?? site.breed,
    'pdg:breedRef': WIKIDATA_JAPANESE_SPITZ,
    'pdg:sex': s.sex === 'M' ? 'male' : s.sex === 'F' ? 'female' : undefined,
    'pdg:dateOfBirth': isoDate(s.dob),
    'pdg:dateOfDeath': isoDate(s.died),
    'pdg:registration': s.registration,
    'pdg:registry': s.register,
    'pdg:colour': s.colour,
    'pdg:breeder': s.breeder,
    'pdg:countryOfOrigin': s.country,
    'pdg:titles': s.preTitle,
    'pdg:sire': payload.sire ? ref(site, payload.sire.name, payload.sire.slug, hasPage) : undefined,
    'pdg:dam': payload.dam ? ref(site, payload.dam.name, payload.dam.slug, hasPage) : undefined,
    'pdg:offspring': offspring,
    'pdg:offspringCount': payload.offspringCount,
    // The stored coefficient is a fraction in [0,1]; it is published as the percentage a
    // reader expects, with the unit named rather than implied.
    'pdg:inbreedingCoefficient':
      s.coi == null
        ? undefined
        : { '@type': 'QuantitativeValue', value: Number((s.coi * 100).toFixed(2)), unitText: '%' },
    'pdg:dnaResult': payload.context.dna.map((d) => ({
      '@type': 'PropertyValue',
      name: d.test,
      value: d.result,
    })),
  });

  return {
    '@context': ['https://schema.org', { pdg: `${site.origin}/ns#` }],
    '@graph': [webPage, publisher, dog],
  };
}
