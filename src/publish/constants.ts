/**
 * Constants shared by the publish pipeline and the renderer.
 *
 * Their own module for one structural reason: `payload.ts` imports `node:crypto` for the
 * content hash, and the renderer runs inside a Cloudflare Worker. A value import from the
 * renderer into `payload.ts` would drag the hashing code — and its Node dependency — into
 * the Worker bundle for the sake of one number. Types are erased at compile time and are
 * safe to import from anywhere; values are not.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

/**
 * Generations of ancestors carried in the bracket (PRD R-2.3).
 *
 * Four, not five (owner decision, 2026-08-28): five columns of 32 boxes did not read well
 * on a page, and the desktop application's bracket shows full information in every cell —
 * which only stays legible while the deepest column has 16 rows rather than 32. Every
 * ancestor remains reachable: the fifth generation is one click away on a grandparent's
 * page.
 */
export const BRACKET_GENERATIONS = 4;

/**
 * Where a dog's payload lives, as a path under the output directory and as an R2 object
 * key — the same string, because the publish uploads the directory as-is.
 *
 * The two-character shard is not decoration: 62,469 files in one directory is legal and
 * unpleasant to list, sync or open, and the same fan-out keeps an R2 listing usable.
 * Stated once here so the writer, the static build and the Worker cannot disagree about
 * where a payload is — a disagreement that would look like a missing dog.
 */
export function payloadKey(slug: string): string {
  const shard = slug.slice(0, 2).padEnd(2, '_');
  return `dog/${shard}/${slug}.json`;
}

/**
 * Generations the Linebreeding report walks (owner decision, 2026-09-11).
 *
 * Twenty, the desktop application's ceiling, not the ten the stored COI uses. The report
 * exists to make old repeated lines visible — the Swedish club's reviewer reads a pedigree
 * from the oldest generation forward, and her example dog appears up to ten times in
 * modern pedigrees, none of it visible at five generations. Measured on the real
 * catalogue before deciding: 45,820 of 62,818 dogs have a repeated ancestor within
 * twenty generations, 194 rows on average, 1,249 at most.
 */
export const LINEBREEDING_GENERATIONS = 20;

/** Ancestors with fewer crosses than this are counted in the totals but not listed. */
export const LINEBREEDING_MIN_CROSSES = 2;

/**
 * Where a dog's report payload lives — the Linebreeding and Foundation reports, computed
 * once at publish. A separate object from the page payload, sharded the same way, so the
 * page payload (and the public `/api/dog/<slug>.json`, which returns it verbatim) is not
 * changed by a report that is several times its size.
 */
export function reportKey(slug: string): string {
  const shard = slug.slice(0, 2).padEnd(2, '_');
  return `report/${shard}/${slug}.json`;
}

/**
 * Where the foundation list itself lives in R2, beside the reports.
 *
 * The Foundation page lists the absent founders from the list, not from the report (an
 * "absent" row on 62,866 reports would be 140 MB of nothing). If that list were only the
 * constant compiled into the Worker, a change to it would wait for the next deploy while
 * the reports had already changed — which happened on 2026-09-12: "28 of 55" on a page
 * whose data already knew 54. So the publish writes the list here, the report sync
 * carries it, and the page reads the list that matches the reports beside it.
 */
export const FOUNDATION_LIST_KEY = 'report/_foundation.json';

