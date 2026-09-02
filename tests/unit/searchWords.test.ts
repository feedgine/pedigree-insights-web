import { describe, expect, it } from 'vitest';
import {
  MIN_TOKEN,
  indexToken,
  prefixUpperBound,
  suffixes,
  words,
} from '../../src/publish/searchWords.ts';

describe('words', () => {
  it('splits on anything that is not a letter or a digit', () => {
    expect(words('baltik lain yasny moy svet')).toEqual([
      'baltik',
      'lain',
      'yasny',
      'moy',
      'svet',
    ]);
    expect(words("jasam's incredible secret of cola")).toEqual([
      'jasam',
      's',
      'incredible',
      'secret',
      'of',
      'cola',
    ]);
    expect(words('bobo (2020)')).toEqual(['bobo', '2020']);
  });

  it('keeps a compound name as one word — which is what the suffix table is for', () => {
    // `hovin` has to find TÄHTIHOVIN, and there is no word boundary to help.
    expect(words('tahtihovin lumikko')).toEqual(['tahtihovin', 'lumikko']);
  });

  it('splits a katakana name on its middle dots', () => {
    expect(words('アレキサンダー・オブ・ハラセガルデン')).toEqual([
      'アレキサンダー',
      'オブ',
      'ハラセガルデン',
    ]);
  });
});

describe('suffixes', () => {
  it('includes the whole word and every shorter tail', () => {
    expect(suffixes('lain')).toEqual(['lain', 'ain', 'in', 'n']);
  });

  it('never cuts a surrogate pair in half', () => {
    const word = '𝒜b';
    expect(suffixes(word)).toEqual(['𝒜b', 'b']);
  });
});

describe('prefixUpperBound', () => {
  it('bounds the range above every string with that prefix', () => {
    const lo = 'hovin';
    const hi = prefixUpperBound(lo);
    expect('hovin' >= lo && 'hovin' < hi).toBe(true);
    expect('hovinen' >= lo && 'hovinen' < hi).toBe(true);
    expect('hovim' >= lo).toBe(false);
    expect('hovio' < hi).toBe(false);
  });
});

describe('indexToken', () => {
  it('picks the longest token, because it is the most selective', () => {
    expect(indexToken('baltik lain')).toBe('baltik');
    expect(indexToken('of shiroi hanamachi')).toBe('hanamachi');
  });

  it('returns null when nothing is long enough to be worth a lookup', () => {
    expect(indexToken('a')).toBeNull();
    expect(indexToken('a b')).toBeNull();
    expect(indexToken('!')).toBeNull();
    expect(indexToken('')).toBeNull();
    expect(MIN_TOKEN).toBe(2);
  });
});

describe('the index answers exactly what instr() answers', () => {
  // The whole point of the change: the same dogs, not merely similar ones. This
  // reproduces both sides in memory — the SQL narrows by the longest token's suffix
  // range and then applies instr, so the property to hold is that narrowing never
  // removes a dog that instr would have kept.
  const catalogue = [
    'tahtihovin lumikko',
    'baltik lain yasny moy svet',
    'plushlandia elastic lain',
    'sakura show omoshiroi otoko',
    "jasam's incredible secret of cola",
    'アレキサンダー・オブ・ハラセガルデン',
    'kannibalens day tripper',
    'eren hof fujiyama fci',
  ];

  const scanMatches = (needle: string) => catalogue.filter((n) => n.includes(needle));

  const indexMatches = (needle: string) => {
    const token = indexToken(needle);
    if (token === null) return scanMatches(needle);
    const hi = prefixUpperBound(token);
    return catalogue.filter((name) => {
      const narrowed = words(name).some((w) =>
        suffixes(w).some((suffix) => suffix >= token && suffix < hi),
      );
      return narrowed && name.includes(needle);
    });
  };

  const queries = [
    'hovin', // inside a compound word — the case a word-prefix index would lose
    'tahtihovin',
    'lain',
    'ain',
    'baltik lain', // spans a separator
    'yasny moy',
    'omoshiroi',
    'ガルデン', // inside a katakana word
    'オブ',
    'fci',
    'zzz', // no match at all
    'a', // below MIN_TOKEN, takes the fallback
  ];

  for (const q of queries) {
    it(`returns the same dogs for "${q}"`, () => {
      expect(indexMatches(q)).toEqual(scanMatches(q));
    });
  }
});

describe('the refusal', () => {
  // The search Function refuses a query with no token this long rather than scanning for
  // it. The rule lives here so the test and the Function cannot drift apart.
  it('refuses exactly the queries that no index could serve', () => {
    expect(indexToken('a')).toBeNull();
    expect(indexToken('x y z')).toBeNull();
    expect(indexToken('   ')).toBeNull();
    expect(indexToken('・')).toBeNull();
  });

  it('accepts anything with two characters to hold on to', () => {
    expect(indexToken('of')).toBe('of');
    expect(indexToken('a lain')).toBe('lain');
    expect(indexToken('オブ')).toBe('オブ');
  });
});
