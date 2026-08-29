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
