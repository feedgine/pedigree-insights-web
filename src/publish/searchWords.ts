/**
 * The search index: how a name becomes rows, and how a query becomes a lookup.
 *
 * The problem this solves. Search matches a fragment **anywhere** inside a name —
 * `hovin` has to find TÄHTIHOVIN, because Finnish kennel names are compounds and many
 * Japanese names have no spaces at all. Expressed directly that is
 * `instr(name_folded, ?) > 0`, which no index can serve: SQLite reads all 62,466 rows,
 * twice per request once the result count is included. On 2026-09-01 that was 788
 * searches against a 5,000,000-row daily allowance, and most of them failed.
 *
 * The way out is an arithmetic accident of this particular data. The 62,466 names contain
 * only **25,494 distinct words, averaging 4.5 characters**. Every suffix of every distinct
 * word is therefore about 110,000 rows — small. And a substring of a word is exactly a
 * **prefix of one of that word's suffixes**, so "does any word contain `q`" becomes a
 * range scan over an indexed column. Same answers as `instr`, not similar ones: a
 * word-prefix index was measured first and lost results on 41% of sampled queries.
 *
 * Two tables, both derived and rebuilt by every publish:
 *   `search_word(suffix, word)`   — every suffix of every distinct word
 *   `search_word_dog(word, slug)` — which dogs carry that word
 *
 * A single token cannot span a separator, so "some word of this name contains the token"
 * and "the folded name contains the token" are the same statement, and the index path is
 * exact. A multi-word query can span one, so the caller narrows with the longest token and
 * still applies `instr` to that small set — which is why the SQL keeps both conditions.
 *
 * No imports: the publish pipeline and the Worker both use this file, and the Worker
 * bundle must not acquire a Node dependency through it.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

/**
 * A token shorter than this is not worth an index lookup: it matches most of the
 * catalogue, so the range scan reads more rows than the plain scan it replaces.
 */
export const MIN_TOKEN = 2;

/** Everything that is not a letter or a digit separates words, in any script. */
const SEPARATORS = /[^\p{L}\p{N}]+/u;

/**
 * The words of an already-folded name.
 *
 * Takes `name_folded`, not the display name, so the publish side and the query side fold
 * exactly once and in the same place. Katakana middle dots, hyphens, apostrophes and
 * brackets all separate; a name written as one unbroken run stays one word, which is what
 * the suffix table is for.
 */
export function words(folded: string): string[] {
  return folded.split(SEPARATORS).filter((w) => w.length > 0);
}

/**
 * Every suffix of a word, from the whole word down to a single character.
 *
 * The whole word is included deliberately: a search for a complete word must hit the same
 * index as a search for a fragment of it, or the common case would take the slow path.
 */
export function suffixes(word: string): string[] {
  const out: string[] = [];
  // Split into code points, not UTF-16 units: a surrogate pair must never be cut in half.
  const points = [...word];
  for (let i = 0; i < points.length; i += 1) out.push(points.slice(i).join(''));
  return out;
}

/**
 * The exclusive upper bound of a prefix range.
 *
 * `suffix >= p AND suffix < upper(p)` is the whole trick, and it is deliberately not
 * `LIKE p || '%'`: D1 caps a LIKE pattern at 50 bytes, which katakana reaches in 17
 * characters, and LIKE would read a `%` typed by the visitor as a wildcard. A range
 * comparison has neither limit and uses the index.
 */
export function prefixUpperBound(prefix: string): string {
  return `${prefix}\u{10FFFF}`;
}

/**
 * The token to look up, or `null` when the query cannot use the index.
 *
 * The longest token wins because it is the most selective. `null` means every token is
 * shorter than `MIN_TOKEN` — the caller then falls back to the scan, which is what the
 * site did for every query before this existed.
 */
export function indexToken(needle: string): string | null {
  let best: string | null = null;
  for (const w of words(needle)) {
    if ([...w].length < MIN_TOKEN) continue;
    if (best === null || [...w].length > [...best].length) best = w;
  }
  return best;
}
