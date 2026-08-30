/**
 * The accent-free spelling of a name, for reading rather than for a URL.
 *
 * People type `Lumivyoryn` when they mean `LUMIVYÖRYN`, so the plain spelling belongs on
 * the page and in `alternateName` (PRD R-6.8, R-4.2). This is the display twin of the
 * transliteration in `publish/slug.ts`: same rule — **strip diacritics, do not expand
 * them** — but it keeps the spacing and the case, because it is a name and not a path.
 *
 * The two are held together by a test: folding a name and then slugifying it must give the
 * same slug as slugifying it directly. If they ever drift, that test says so.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

/** Letters carrying no combining mark, so NFD cannot reach them. Both cases. */
const SPECIAL: ReadonlyMap<string, string> = new Map([
  ['ß', 'ss'], ['æ', 'ae'], ['Æ', 'AE'], ['œ', 'oe'], ['Œ', 'OE'],
  ['ø', 'o'], ['Ø', 'O'], ['đ', 'd'], ['Đ', 'D'], ['ð', 'd'], ['Ð', 'D'],
  ['þ', 'th'], ['Þ', 'TH'], ['ł', 'l'], ['Ł', 'L'], ['ħ', 'h'], ['Ħ', 'H'],
  ['ı', 'i'], ['ŋ', 'n'], ['Ŋ', 'N'],
]);

/**
 * Combining marks that must SURVIVE folding.
 *
 * U+3099 and U+309A are the Japanese voiced and semi-voiced sound marks. NFD decomposition
 * turns ダ into タ + U+3099, which makes them look like accents to a rule that strips
 * combining marks — but a dakuten is not an accent. It changes the letter: da is not ta,
 * bu is not fu. Stripping them silently rewrote every katakana name in the register.
 * Found 2026-08-29 on アレキサンダー・オブ・ハラセガルデン.
 */
const KEEP = /[\u3099\u309A]/;

export function accentFreeName(name: string): string {
  let expanded = '';
  for (const ch of name.normalize('NFC')) expanded += SPECIAL.get(ch) ?? ch;
  return (
    expanded
      .normalize('NFD')
      .replace(/\p{M}/gu, (mark) => (KEEP.test(mark) ? mark : ''))
      // Back to NFC so the marks that were kept recompose into their own characters:
      // タ + U+3099 becomes ダ again rather than staying decomposed.
      .normalize('NFC')
  );
}

/** Does this name look any different without its accents? */
export function hasAccents(name: string): boolean {
  return accentFreeName(name) !== name;
}
