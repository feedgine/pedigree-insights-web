/**
 * The matching key for a dog's name.
 *
 * Its own module, and not part of `source.ts`, for one reason: every pure module in the
 * pipeline needs it, and `source.ts` imports the SQLite driver. Keeping the key here means
 * the relations index, the slug map, the index rule and the payload builder stay free of a
 * native dependency — they can be reasoned about, and tested, without a database at all.
 * The same thin-shell-over-a-pure-core habit as the desktop application.
 *
 * `Name` is the primary key and `Sire`/`Dam` join on it, but the join is case-insensitive
 * in SQL (`COLLATE NOCASE`) and the stored strings carry stray whitespace. Lower-casing
 * here reproduces that behaviour in memory, so a dog whose sire was typed in a different
 * case still finds its record.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { keyOf } from '../vendor/pedigree-insights/schema';

export function indexKey(name: string | null | undefined): string | null {
  const k = keyOf(name);
  return k == null ? null : k.toLowerCase();
}
