/**
 * Reading the master database.
 *
 * Three rules govern this file and nothing else in the pipeline needs to restate them:
 *
 *   - **Read-only, always.** The connection is opened `readonly` and `fileMustExist`, and
 *     no statement in this module is anything but a SELECT or a PRAGMA. PRD R-8.3 requires
 *     the master to be byte-identical after a publish; `fileDigest()` is here so the CLI
 *     can prove it rather than promise it.
 *   - **The projection is the whitelist.** Columns are named from
 *     `publishedSourceColumns()`, so a field outside the whitelist is never selected. It
 *     does not reach memory, so it cannot reach a file (PRD §7.2).
 *   - **A missing column is not an error.** Exports of this schema differ — the sample uses
 *     `Inbreeding Coefficient`, the real master uses `COI` — so each field falls back
 *     through its candidate source columns and degrades to NULL when none is present. Only
 *     `Name`, `Sire` and `Dam` are genuinely required; without them the file is not a
 *     pedigree database and we say so plainly.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import Database from 'better-sqlite3';

import { type Animal, type AnimalRow, toAnimal } from '../vendor/pedigree-insights/schema';
import { SOURCE_FIELDS } from '../vendor/pedigree-insights/sourceFields';
import {
  PEDIGREE_TABLE_INFO,
  missingRequiredColumns,
  quoteIdent,
} from '../vendor/pedigree-insights/queries';
import { PUBLISHED_CATALOGUE } from './whitelist';
import { indexKey } from './key';

// Re-exported so callers that already hold a database connection do not need a second
// import for the key that goes with it.
export { indexKey };

/** The loaded population, with the lookups the rest of the pipeline needs. */
export interface Population {
  /** Every dog, in the order the database returned them, deduplicated by key. */
  readonly animals: readonly Animal[];
  /** Index key → animal. The key is the trimmed, lower-cased name (see `indexKey`). */
  readonly byKey: ReadonlyMap<string, Animal>;
  /** Resolve a Sire/Dam string to a record, or null when the ancestor is a name only. */
  readonly lookup: (name: string) => Animal | null;
  /** Source columns that were absent from this file and degraded to NULL. */
  readonly missingOptionalColumns: readonly string[];
  /** Rows the file held, before de-duplication by name. */
  readonly rowCount: number;
}

/**
 * Build the SELECT projection from the columns this file actually has, restricted to the
 * whitelist. A whitelisted field whose source columns are all absent is selected as NULL.
 */
export function buildPublishedSelect(available: ReadonlySet<string>): string {
  return PUBLISHED_CATALOGUE.map(({ as, sources }) => {
    const found = sources.find((s) => available.has(s));
    return found ? `${quoteIdent(found)} AS ${as}` : `NULL AS ${as}`;
  }).join(',\n  ');
}

/**
 * Normalise one raw row into the shape the rest of the pipeline may assume.
 *
 * Two jobs, both of them boundary work that must happen exactly once.
 *
 * **Fill in the aliases the projection did not select.** `toAnimal` reads the full
 * `AnimalRow` shape; because the projection is narrower than the catalogue, the aliases
 * the whitelist withholds are simply absent. Setting them to null keeps "absent" and
 * "empty" a single check downstream, and it is a one-way fill — an excluded column has no
 * value to restore.
 *
 * **Make the declared types true.** SQLite has no column types, only value types: a
 * `Registration` written as `12345` comes back as a NUMBER however the column was
 * declared, and every `.trim()` downstream then fails. So a field the catalogue does not
 * mark `numeric` is coerced to text here, and a `numeric` field that arrives as text is
 * parsed once — rather than each of the twenty call sites defending itself.
 */
function normaliseRow(row: Record<string, unknown>): AnimalRow {
  const full: Record<string, unknown> = {};
  for (const f of SOURCE_FIELDS) {
    const raw = f.as in row ? row[f.as] : null;
    if (raw == null) {
      full[f.as] = null;
    } else if (f.numeric) {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim().replace(',', '.'));
      full[f.as] = Number.isFinite(n) ? n : null;
    } else if (typeof raw === 'string') {
      full[f.as] = raw;
    } else if (raw instanceof Buffer) {
      // A BLOB is not text and is never displayed; treat it as absent rather than as
      // the string "[object Object]".
      full[f.as] = null;
    } else {
      full[f.as] = String(raw);
    }
  }
  return full as AnimalRow;
}

/** Names of whitelisted source columns this file does not have. */
function absentOptionalColumns(available: ReadonlySet<string>): string[] {
  return PUBLISHED_CATALOGUE.filter((f) => !f.sources.some((s) => available.has(s))).map(
    (f) => f.label,
  );
}

/**
 * Open the master, read every dog through the whitelist, and close the file again.
 *
 * The whole population is held in memory on purpose: the publish walks each pedigree and
 * every dog's offspring, which is thousands of lookups per dog against a table of tens of
 * thousands of rows. Reading it once is the difference between a publish that takes
 * minutes and one that takes hours, and the extract is a batch job on the owner's own
 * machine, not a request handler.
 *
 * Duplicate names cannot exist in a well-formed file (`Name` is the primary key). If one
 * appears anyway, the first row wins and the duplicate is reported rather than merged —
 * silently choosing between two records for one URL would be worse than saying so.
 */
export function loadPopulation(file: string): Population & { readonly duplicates: readonly string[] } {
  let db: Database.Database;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
  } catch (err) {
    // The first thing anyone following the runbook gets wrong is the path — it has spaces
    // and parentheses in it. A raw ENOENT does not say which option was wrong.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' || /unable to open/i.test(String(err))) {
      throw new Error(
        `--source: no database at ${file}\n` +
          'Check the path and keep it in double quotes — spaces and parentheses in it will ' +
          'otherwise be split into separate arguments.',
      );
    }
    throw err;
  }
  try {
    const info = db.prepare(PEDIGREE_TABLE_INFO).all() as { name: string }[];
    const available = new Set(info.map((c) => c.name));
    if (available.size === 0) {
      throw new Error(
        `${file} has no "Pedigree" table. This is not a BreedMate-compatible pedigree database.`,
      );
    }
    const missing = missingRequiredColumns(available);
    if (missing.length > 0) {
      throw new Error(
        `${file} is missing required column(s): ${missing.join(', ')}. ` +
          'Without Name, Sire and Dam there is no pedigree to publish.',
      );
    }

    const select = buildPublishedSelect(available);
    const rows = db.prepare(`SELECT ${select}\nFROM "Pedigree"`).all() as Record<
      string,
      unknown
    >[];

    const animals: Animal[] = [];
    const byKey = new Map<string, Animal>();
    const duplicates: string[] = [];
    for (const raw of rows) {
      const animal = toAnimal(normaliseRow(raw));
      const key = indexKey(animal.name);
      if (key == null) continue; // a row with no name is not a dog we can publish
      if (byKey.has(key)) {
        duplicates.push(animal.name);
        continue;
      }
      byKey.set(key, animal);
      animals.push(animal);
    }

    return {
      animals,
      byKey,
      lookup: (name: string) => {
        const key = indexKey(name);
        return key == null ? null : (byKey.get(key) ?? null);
      },
      missingOptionalColumns: absentOptionalColumns(available),
      rowCount: rows.length,
      duplicates,
    };
  } finally {
    db.close();
  }
}

/**
 * SHA-256 of a file, streamed.
 *
 * Used by the CLI to record the master's digest before the run and check it after, so
 * "the publish did not touch the master" is evidence rather than an assurance.
 */
export function fileDigest(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
