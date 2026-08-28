import { describe, expect, it } from 'vitest';
import { disambiguate, dogPath, slugify } from '../../src/publish/slug.ts';

describe('slugify', () => {
  it('lower-cases and hyphenates a plain name', () => {
    expect(slugify('LUMIVYORYN LUMIKKO')).toBe('lumivyoryn-lumikko');
  });

  it('strips diacritics rather than expanding them', () => {
    expect(slugify('LUMIVYÖRYN LUMIKKO')).toBe('lumivyoryn-lumikko');
    expect(slugify('ARČIAU ŠIRDIES AURA')).toBe('arciau-sirdies-aura');
    expect(slugify('BALTA LAPĖ')).toBe('balta-lape');
  });

  it('treats the composed and decomposed forms of a name as the same slug', () => {
    // The same visible name: Ö as one code point, and as O + combining diaeresis.
    const composed = 'LUMIVYÖRYN';
    const decomposed = 'LUMIVYÖRYN';
    expect(composed).not.toBe(decomposed);
    expect(composed.normalize('NFC')).toBe(decomposed.normalize('NFC'));
    expect(slugify(composed)).toBe(slugify(decomposed));
    expect(slugify(decomposed)).toBe('lumivyoryn');
  });

  it('expands the letters that carry no combining mark', () => {
    expect(slugify('Bjørn')).toBe('bjorn');
    expect(slugify('Straße')).toBe('strasse');
    expect(slugify('Æthel')).toBe('aethel');
    expect(slugify('Łukasz')).toBe('lukasz');
  });

  it('drops apostrophes instead of turning them into hyphens', () => {
    expect(slugify("O'Hara's Dream")).toBe('oharas-dream');
    expect(slugify('O’Hara')).toBe('ohara');
  });

  it('collapses runs of punctuation and whitespace into single hyphens', () => {
    expect(slugify('  A   B..C / D  ')).toBe('a-b-c-d');
  });

  it('does not let a slash split the path', () => {
    expect(slugify('KENNEL/NAME')).toBe('kennel-name');
    expect(slugify('KENNEL/NAME')).not.toContain('/');
  });

  it('keeps digits', () => {
    expect(slugify('Fi 12345/08')).toBe('fi-12345-08');
  });

  it('is idempotent', () => {
    const once = slugify('LUMIVYÖRYN LUMIKKO')!;
    expect(slugify(once)).toBe(once);
  });

  it('returns null when nothing usable remains', () => {
    expect(slugify('')).toBeNull();
    expect(slugify('   ')).toBeNull();
    expect(slugify('---')).toBeNull();
    expect(slugify('!!!')).toBeNull();
    expect(slugify(null)).toBeNull();
    expect(slugify(undefined)).toBeNull();
  });

  it('never returns a leading or trailing hyphen', () => {
    for (const name of ['  Lumi  ', '--Lumi--', '/Lumi/', 'Ö']) {
      const s = slugify(name);
      if (s != null) {
        expect(s.startsWith('-')).toBe(false);
        expect(s.endsWith('-')).toBe(false);
      }
    }
  });

  it('produces the same slug for names that differ only by case or diacritic', () => {
    // This is the collision the publish pipeline must resolve; the function must not
    // hide it by inventing a suffix of its own.
    expect(slugify('ARCIAU SIRDIES')).toBe(slugify('ARČIAU ŠIRDIES'));
  });
});

describe('disambiguate', () => {
  it('appends the discriminator to a candidate', () => {
    expect(disambiguate('lumivyoryn-lumikko', 'FI12345/08')).toBe(
      'lumivyoryn-lumikko-fi12345-08',
    );
  });

  it('falls back to the discriminator alone when there is no usable name', () => {
    expect(disambiguate(null, 'FI12345/08')).toBe('fi12345-08');
  });

  it('refuses a discriminator that yields nothing', () => {
    expect(() => disambiguate('lumi', '   ')).toThrow(/yields nothing usable/);
  });
});

describe('dogPath', () => {
  it('states the /dog/ prefix once', () => {
    expect(dogPath('lumivyoryn-lumikko')).toBe('/dog/lumivyoryn-lumikko');
  });
});
