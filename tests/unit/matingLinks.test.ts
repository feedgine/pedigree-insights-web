import { describe, expect, it } from 'vitest';
import { buildRelations } from '../../src/publish/relations.ts';
import { assignSlugs } from '../../src/publish/slugMap.ts';
import { buildPayload, type PayloadContext } from '../../src/publish/payload.ts';
import { renderDogPage } from '../../src/render/dogPage.ts';
import { robotsTxt, routesJson, sitemapXml } from '../../src/render/home.ts';
import type { Animal } from '../../src/vendor/pedigree-insights/schema.ts';
import { dog, lookupOver, sampleKennel } from '../helpers/dogs.ts';

/**
 * The way into `/mating` from a dog page (task 7.6), and the routing and crawl rules
 * around it (task 7.5).
 *
 * [DRAFT — requires Yuliya's review]
 */

function pageFor(animals: readonly Animal[], name: string): string {
  const ctx: PayloadContext = {
    lookup: lookupOver(animals),
    slugByKey: assignSlugs(animals).slugByKey,
    relations: buildRelations(animals),
    isIndexed: () => true,
  };
  return renderDogPage(buildPayload(ctx, animals.find((a) => a.name === name)!));
}

describe('"Plan a mating" on the dog page (task 7.6)', () => {
  const animals = [...sampleKennel(), dog('KENNEL IOTA', { sire: 'KENNEL GAMMA', dam: 'KENNEL ZETA' })];

  it('a male is the sire', () => {
    expect(pageFor(animals, 'KENNEL GAMMA')).toContain(
      '<p class="mating-link"><a href="/mating?sire=kennel-gamma" rel="nofollow">Plan a mating</a></p>',
    );
  });

  it('a female is the dam', () => {
    expect(pageFor(animals, 'KENNEL DELTA')).toContain('<a href="/mating?dam=kennel-delta" rel="nofollow">Plan a mating</a>');
  });

  it('a dog of unrecorded sex is the sire', () => {
    expect(pageFor(animals, 'KENNEL IOTA')).toContain('<a href="/mating?sire=kennel-iota" rel="nofollow">');
  });

  it('a founder with no pedigree is offered too, and the link sits under the bracket', () => {
    const html = pageFor(animals, 'KENNEL ALFA');
    const section = html.slice(html.indexOf('<section id="pedigree">'));
    expect(section.slice(0, section.indexOf('</section>'))).toContain('Plan a mating');
  });

  it('every /mating link is nofollow, and the page has no script but its JSON-LD', () => {
    for (const name of ['KENNEL GAMMA', 'KENNEL DELTA', 'KENNEL ETA']) {
      const html = pageFor(animals, name);
      for (const a of html.match(/<a [^>]*href="\/mating[^"]*"[^>]*>/g) ?? []) expect(a).toContain('rel="nofollow"');
      expect(html.match(/<script\b[^>]*>/g)).toEqual(['<script type="application/ld+json">']);
    }
  });
});

describe('routing and crawling (task 7.5)', () => {
  it('routes /mating to the Functions', () => {
    expect(JSON.parse(routesJson()).include).toContain('/mating');
  });

  it('disallows /mating in robots.txt, and keeps /search disallowed', () => {
    const lines = robotsTxt().split('\n');
    expect(lines).toContain('Disallow: /mating');
    expect(lines).toContain('Disallow: /search');
  });

  it('never lists /mating in the sitemap', () => {
    expect(sitemapXml(['kennel-alfa', 'kennel-beta'], '2026-10-22')).not.toContain('/mating');
  });
});
