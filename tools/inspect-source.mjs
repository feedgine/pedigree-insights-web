#!/usr/bin/env node
/**
 * Read-only inspection of a source pedigree database.
 *
 * Opens the file READ-ONLY and prints what the publish pipeline needs to know: the tables,
 * the columns of the pedigree table, the row count, and how the real column names line up
 * with the agreed 74-column catalogue in the vendored `sourceFields.ts`.
 *
 * That last part settles a question open in pedigree-insights since 2026-08-05: the column
 * names came from the import mapping, never from `PRAGMA table_info` of the master. A name
 * that does not match degrades to NULL silently, which is the worst kind of wrong.
 *
 * Usage: node tools/inspect-source.mjs <path-to.db>
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */
import Database from 'better-sqlite3';
import { SOURCE_FIELDS } from '../src/vendor/pedigree-insights/sourceFields.ts';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/inspect-source.mjs <path-to.db>');
  process.exit(1);
}

// readonly + fileMustExist: the master is the source of truth and is never written to.
const db = new Database(file, { readonly: true, fileMustExist: true });

const tables = db
  .prepare("select name from sqlite_master where type='table' order by name")
  .all()
  .map((r) => r.name);
console.log(`tables (${tables.length}): ${tables.join(', ')}\n`);

const table = tables.includes('Pedigree') ? 'Pedigree' : tables[0];
const cols = db.prepare(`PRAGMA table_info("${table}")`).all();
const count = db.prepare(`select count(*) as c from "${table}"`).get().c;
console.log(`table "${table}": ${count} rows, ${cols.length} columns\n`);

const actual = new Set(cols.map((c) => c.name));
const catalogue = SOURCE_FIELDS.map((f) => ({
  label: f.label ?? f.key,
  sources: f.sources ?? [f.key],
}));

const matched = [];
const missing = [];
for (const f of catalogue) {
  const hit = f.sources.find((s) => actual.has(s));
  if (hit) matched.push({ label: f.label, column: hit });
  else missing.push({ label: f.label, tried: f.sources });
}
const known = new Set(matched.map((m) => m.column));
const unmapped = cols.map((c) => c.name).filter((n) => !known.has(n));

console.log(`catalogue entries matched to a real column: ${matched.length}/${catalogue.length}`);
if (missing.length) {
  console.log(`\nNOT FOUND in the database (these degrade to NULL):`);
  for (const m of missing) console.log(`  ${m.label}  ← tried: ${m.tried.join(' | ')}`);
}
if (unmapped.length) {
  console.log(`\nColumns present but not in the catalogue (${unmapped.length}):`);
  console.log('  ' + unmapped.join(', '));
}

db.close();
