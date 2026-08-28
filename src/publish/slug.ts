/**
 * URL slugs for dog pages.
 *
 * A published URL must never stop working (PRD R-5.2), so this module is deliberately
 * small and deliberately boring. It answers one question — what is the *candidate* slug
 * for a name — and nothing else.
 *
 * It does NOT decide the final slug. That is an assignment, not a calculation: once a dog
 * has a URL it keeps it, even if a later import would produce a different candidate or a
 * newly added dog would like the same one. The assignment map is persistent state owned by
 * the publish pipeline; a pure function of the current snapshot would silently move URLs
 * whenever the data changed, which is the exact failure R-5.2 forbids.
 *
 * Transliteration note: diacritics are stripped, not expanded — Ö becomes `o`, not `oe`.
 * The population is predominantly Finnish, Swedish and Baltic, where stripping matches
 * how the names are written in ASCII; the German `oe` convention would produce slugs no
 * one in this breed types. Recorded as a judgement call, not a default.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

/**
 * Letters that carry no combining mark to strip, so NFD cannot reach them.
 * Lower-cased before lookup, hence lower-case keys only.
 */
const SPECIAL_LETTERS: ReadonlyMap<string, string> = new Map([
  ['ß', 'ss'],
  ['æ', 'ae'],
  ['œ', 'oe'],
  ['ø', 'o'],
  ['đ', 'd'],
  ['ð', 'd'],
  ['þ', 'th'],
  ['ł', 'l'],
  ['ħ', 'h'],
  ['ı', 'i'],
  ['ŋ', 'n'],
  ['ʼ', ''],
  ['’', ''],
  ['`', ''],
  ["'", ''],
]);

/**
 * The candidate slug for a stored name.
 *
 * NFC-normalise → lower-case → expand the letters NFD cannot reach → strip combining
 * marks → collapse everything else to single hyphens.
 *
 * Returns `null` when the name yields nothing usable (empty, or punctuation only). The
 * caller must then fall back to the dog's stable identifier — a page still has to exist.
 */
export function slugify(name: string | null | undefined): string | null {
  if (name == null) return null;

  let s = name.normalize('NFC').toLowerCase();

  let expanded = '';
  for (const ch of s) expanded += SPECIAL_LETTERS.get(ch) ?? ch;

  s = expanded
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return s.length > 0 ? s : null;
}

/**
 * A slug for a dog that has no usable name, or whose candidate slug is already taken.
 * The discriminator is a stable identifier — the registration code where there is one,
 * otherwise the synthetic id assigned once and never regenerated (PRD R-5.3).
 */
export function disambiguate(candidate: string | null, discriminator: string): string {
  const tail = slugify(discriminator);
  if (tail == null) {
    throw new Error(
      `Cannot build a slug: discriminator ${JSON.stringify(discriminator)} yields nothing usable.`,
    );
  }
  return candidate == null ? tail : `${candidate}-${tail}`;
}

/** The canonical path for a slug. Kept here so the `/dog/` prefix is stated once. */
export function dogPath(slug: string): string {
  return `/dog/${slug}`;
}
