import { describe, expect, it } from 'vitest';
import { matingKey } from '../../src/publish/constants.ts';
import { handleMating, type MatingEnv } from '../../src/render/matingRoute.ts';

/**
 * `/mating` request handling (task 7.4), against fakes that count every storage call —
 * the free-tier budget is part of the specification: one D1 query and two R2 GETs for a
 * canonical pair, a redirect lookup only on a miss, and R2 only for two known dogs.
 *
 * [DRAFT — requires Yuliya's review]
 */

const SCRIPT = '/assets/mating.0123456789ab.js';
const NOW = new Date('2026-10-22T15:30:00Z');

const DOGS = [
  { slug: 'stud', name: 'THE STUD', sex: 'M' },
  { slug: 'bitch', name: 'THE BITCH', sex: 'F' },
];
const REDIRECTS: Record<string, string> = { 'old-stud': 'stud' };
const OBJECTS: Record<string, string> = {
  [matingKey('stud')]: '{"slug":"stud","name":"\\u003c/script\\u003e"}',
  [matingKey('bitch')]: '{"slug":"bitch"}',
};

function fakeEnv(objects = OBJECTS) {
  const d1: string[] = [];
  const r2: string[] = [];
  const env: MatingEnv = {
    DB: {
      prepare: (sql) => ({
        bind: (...values) => ({
          first: async <T,>() => {
            d1.push(sql);
            if (sql.includes('FROM redirect')) {
              const to = REDIRECTS[values[0] as string];
              return (to ? { new_slug: to } : null) as T | null;
            }
            return { n: DOGS.length } as T;
          },
          all: async <T,>() => {
            d1.push(sql);
            if (sql.includes('FROM dog WHERE slug')) {
              return { results: DOGS.filter((d) => values.includes(d.slug)) as T[] };
            }
            return { results: DOGS as T[] };
          },
        }),
      }),
    },
    PAYLOADS: {
      get: async (key) => {
        r2.push(key);
        const body = objects[key];
        return body === undefined ? null : { etag: `e-${key.length}`, text: async () => body };
      },
    },
  };
  return { env, d1, r2 };
}

async function get(path: string, objects?: Record<string, string>) {
  const f = fakeEnv(objects);
  const res = await handleMating(new Request(`https://pedigree.example${path}`), f.env, SCRIPT, NOW);
  return { res, body: await res.text(), d1: f.d1, r2: f.r2 };
}

const location = (res: Response) => {
  const l = res.headers.get('location');
  return l == null ? null : new URL(l).pathname + new URL(l).search;
};

describe('a canonical pair', () => {
  it('200 with the /mating CSP, at one D1 query and two R2 GETs', async () => {
    const { res, body, d1, r2 } = await get('/mating?sire=stud&dam=bitch&g=6');
    expect(res.status).toBe(200);
    const csp = res.headers.get('content-security-policy')!;
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("default-src 'none'");
    expect(d1).toEqual(['SELECT slug, name, sex FROM dog WHERE slug IN (?1, ?2)']);
    expect(r2).toEqual([matingKey('stud'), matingKey('bitch')]);
    // The stored bytes, unparsed.
    expect(body).toContain(`<script type="application/json" id="mating-sire">${OBJECTS[matingKey('stud')]}</script>`);
    expect(body).toContain('data-generations="6" data-as-of="2026-10-22"');
    expect(body).toContain(`<script src="${SCRIPT}" defer></script>`);
  });

  it('offers the swap from the D1 sex, with no extra query', async () => {
    const right = await get('/mating?sire=stud&dam=bitch&g=6');
    expect(right.body).not.toContain('Swap sire and dam');
    const wrong = await get('/mating?sire=bitch&dam=stud&g=6');
    expect(wrong.res.status).toBe(200);
    expect(wrong.body).toContain('<a href="/mating?sire=stud&amp;dam=bitch&amp;g=6" rel="nofollow">Swap sire and dam</a>');
    expect(wrong.d1).toEqual(['SELECT slug, name, sex FROM dog WHERE slug IN (?1, ?2)']);
  });

  it('an etag from both objects, the date and the script; the reports’ cache policy', async () => {
    const { res } = await get('/mating?sire=stud&dam=bitch&g=6');
    expect(res.headers.get('etag')).toBe(`"e-${matingKey('stud').length}-e-${matingKey('bitch').length}-2026-10-22-0123456789ab"`);
    expect(res.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=86400');
  });
});

describe('canonical URLs', () => {
  it.each([
    ['/mating?sire=stud&dam=bitch&g=14', '/mating?sire=stud&dam=bitch&g=10'],
    ['/mating?sire=stud&dam=bitch&g=1', '/mating?sire=stud&dam=bitch&g=3'],
    ['/mating?sire=stud&dam=bitch', '/mating?sire=stud&dam=bitch&g=5'],
    ['/mating?sire=stud&dam=bitch&g=x', '/mating?sire=stud&dam=bitch&g=5'],
    ['/mating?g=6&dam=bitch&sire=stud', '/mating?sire=stud&dam=bitch&g=6'],
    ['/mating?sire=stud&dam=bitch&g=06', '/mating?sire=stud&dam=bitch&g=6'],
    ['/mating?sire=stud&dam=bitch&g=6&q=x', '/mating?sire=stud&dam=bitch&g=6'],
    ['/mating?dam=bitch&g=40', '/mating?dam=bitch&g=10'],
  ])('%s → 301 %s, after the one D1 query and no R2 read', async (from, to) => {
    const { res, d1, r2 } = await get(from);
    expect(res.status).toBe(301);
    expect(location(res)).toBe(to);
    expect(d1).toHaveLength(1);
    expect(d1[0]).toMatch(/^SELECT slug, name, sex FROM dog WHERE slug/);
    expect(r2).toEqual([]);
  });

  it.each([
    ['/mating?sire=old-stud&dam=bitch', '/mating?sire=stud&dam=bitch&g=5'],
    ['/mating?sire=old-stud&dam=bitch&g=14', '/mating?sire=stud&dam=bitch&g=10'],
    ['/mating?dam=bitch&sire=old-stud&g=6', '/mating?sire=stud&dam=bitch&g=6'],
    ['/mating?sire=old-stud&g=40', '/mating?sire=stud&g=10'],
  ])('a rename and a depth fix together: %s → one 301 %s', async (from, to) => {
    const { res } = await get(from);
    expect(res.status).toBe(301);
    expect(location(res)).toBe(to);
    // The target is canonical: following it does not redirect again.
    expect((await get(to)).res.status).toBe(200);
  });

  it('a search page with a renamed parent keeps its query and page', async () => {
    const { res } = await get('/mating?sire=old-stud&q=the%20bitch&page=1');
    expect(res.status).toBe(301);
    const to = new URL(res.headers.get('location')!);
    expect([...to.searchParams]).toEqual([['sire', 'stud'], ['q', 'the bitch'], ['page', '1']]);
    expect((await get(to.pathname + to.search)).res.status).toBe(200);
  });

  it('an old slug → 301 to the same URL with the new one, after one redirect lookup', async () => {
    const { res, d1, r2 } = await get('/mating?sire=old-stud&dam=bitch&g=7');
    expect(res.status).toBe(301);
    expect(location(res)).toBe('/mating?sire=stud&dam=bitch&g=7');
    expect(d1).toEqual([
      'SELECT slug, name, sex FROM dog WHERE slug IN (?1, ?2)',
      'SELECT new_slug FROM redirect WHERE old_slug = ?',
    ]);
    expect(r2).toEqual([]);
  });
});

describe('not found', () => {
  it('an unknown slug → 404, with no R2 read', async () => {
    const { res, body, r2 } = await get('/mating?sire=nobody&dam=bitch&g=5');
    expect(res.status).toBe(404);
    expect(body).toContain('<h1>Not found</h1>');
    expect(r2).toEqual([]);
  });

  it('a slug that cannot exist → 404 before any read', async () => {
    const { res, d1, r2 } = await get('/mating?sire=..%2Fsecret&dam=bitch&g=5');
    expect(res.status).toBe(404);
    expect(d1).toEqual([]);
    expect(r2).toEqual([]);
  });

  it('a dog with no mating object in R2 → 404', async () => {
    const { res } = await get('/mating?sire=stud&dam=bitch&g=5', { [matingKey('stud')]: '{}' });
    expect(res.status).toBe(404);
  });
});

describe('choosing a parent', () => {
  it('?dam=x only: 200, the search box for the sire, one D1 query, no R2', async () => {
    const { res, body, d1, r2 } = await get('/mating?dam=bitch');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(body).toContain('Search for the sire by name');
    expect(d1).toEqual(['SELECT slug, name, sex FROM dog WHERE slug = ?1']);
    expect(r2).toEqual([]);
  });

  it('a search uses the /search query, and results complete the URL', async () => {
    const { body, d1 } = await get('/mating?dam=bitch&q=stud');
    expect(d1.some((s) => s.includes('FROM search_word s'))).toBe(true);
    expect(body).toContain('href="/mating?sire=stud&amp;dam=bitch&amp;g=5" rel="nofollow"');
  });

  it('the same dog twice: no analysis, the search for the other parent, the dog on its own side', async () => {
    const female = await get('/mating?sire=bitch&dam=bitch&g=5');
    expect(female.res.status).toBe(200);
    expect(female.body).toContain('was given as both sire and dam');
    expect(female.body).toContain('Search for the sire by name');
    expect(female.body).not.toContain('mating-analysis');
    expect(female.r2).toEqual([]);
    const male = await get('/mating?sire=stud&dam=stud&g=5');
    expect(male.body).toContain('Search for the dam by name');
  });
});
