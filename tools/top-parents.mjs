#!/usr/bin/env node
/**
 * Which dogs have the most recorded offspring, and are those numbers real?
 *
 * Raised by the first real run: twenty of the largest pages each carried ~758 half
 * siblings, which means one parent with ~758 recorded offspring. That is either a
 * foundation sire used very widely, or an import artefact — many dogs given the same
 * placeholder parent name. The two look identical in the byte count and completely
 * different in the data, so this lists the evidence rather than guessing.
 *
 * Opens the database READ-ONLY. It never writes.
 *
 * Usage: node tools/top-parents.mjs <path-to.db> [--top 25]
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */
import Database from 'better-sqlite3';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/top-parents.mjs <path-to.db> [--top N]');
  process.exit(1);
}
const topN = Number(process.argv[process.argv.indexOf('--top') + 1]) || 25;

const db = new Database(file, { readonly: true, fileMustExist: true });
const rows = db
  .prepare('SELECT "Name", "Sex", "DOB", "Sire", "Dam", "Registration", "Country of Origin" FROM "Pedigree"')
  .all();
db.close();

const key = (v) => {
  const s = v == null ? '' : String(v).trim();
  return s === '' ? null : s.toLowerCase();
};
const byKey = new Map();
for (const r of rows) {
  const k = key(r.Name);
  if (k != null && !byKey.has(k)) byKey.set(k, r);
}

const asSire = new Map();
const asDam = new Map();
const litters = new Map(); // sire+dam pair → offspring count
for (const r of rows) {
  const s = key(r.Sire);
  const d = key(r.Dam);
  if (s != null) asSire.set(s, (asSire.get(s) ?? 0) + 1);
  if (d != null) asDam.set(d, (asDam.get(d) ?? 0) + 1);
  if (s != null && d != null) {
    const pair = s + ' × ' + d;
    litters.set(pair, (litters.get(pair) ?? 0) + 1);
  }
}

const pad = (v, w) => String(v).padStart(w);
const year = (v) => (v == null ? '' : String(v).slice(0, 4));

function report(title, counts) {
  console.log('\n' + title);
  console.log(
    '  ' + 'offspring'.padStart(9) + '  ' + 'born'.padEnd(6) + 'has own record  name',
  );
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN);
  for (const [k, n] of top) {
    const row = byKey.get(k);
    const has = row ? 'yes' : 'NAME ONLY';
    const name = row ? row.Name : k;
    console.log(
      '  ' + pad(n, 9) + '  ' + year(row?.DOB).padEnd(6) + has.padEnd(16) + name,
    );
  }
}

console.log('source: ' + file);
console.log('rows: ' + rows.length + '   distinct names: ' + byKey.size);

report('most used as SIRE', asSire);
report('most used as DAM', asDam);

console.log('\nlargest single pairing (one sire × one dam)');
const topPairs = [...litters.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
for (const [pair, n] of topPairs) console.log('  ' + pad(n, 6) + '  ' + pair);

console.log('\nwhat the tail looks like');
const all = [...asSire.values(), ...asDam.values()].sort((a, b) => b - a);
const over = (n) => all.filter((c) => c >= n).length;
for (const n of [10, 25, 50, 100, 250, 500]) {
  console.log('  parents with ' + pad(n, 4) + '+ offspring: ' + pad(over(n), 6));
}
const totalEdges = all.reduce((a, b) => a + b, 0);
const sqSum = all.reduce((a, b) => a + b * b, 0);
console.log(
  '\n  parent→offspring links: ' + totalEdges +
  '\n  half-sibling entries they generate (sum of n²): ' + sqSum +
  '\n  — that is the number the payload was storing.',
);
