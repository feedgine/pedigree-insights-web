#!/usr/bin/env node
/**
 * The index-threshold measurement required by P0 (PRD AC-14, WCD *Result Checks*).
 * Opens the database READ-ONLY. It never writes.
 *
 * Usage: node tools/measure-index.mjs <path-to.db>
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */
import Database from 'better-sqlite3';
import { keyOf } from '../src/vendor/pedigree-insights/schema.ts';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node tools/measure-index.mjs <path-to.db>');
  process.exit(1);
}

const DNA_COLUMNS = [
  'WD-ATP7B', 'SAMS-KCNJ10', 'PRA-rcd4-C2orf71', 'MDR2-ABCB1',
  'F7', 'CUR/N', 'DMD-CFAX', 'H', 'DNA-COI',
];
const REG_COLUMNS = ['Registration', 'Additional Reg No.', 'Studbook No.'];
const TITLE_COLUMNS = ['PreTitle', 'PostTitle'];
const INFLUENCE_DEPTH = 8;

const db = new Database(file, { readonly: true, fileMustExist: true });
const quote = (c) => '"' + c.replace(/"/g, '""') + '"';
const projection = ['Name', 'DOB', 'Sire', 'Dam', ...REG_COLUMNS, ...TITLE_COLUMNS, ...DNA_COLUMNS]
  .map(quote)
  .join(', ');
const rows = db.prepare('select ' + projection + ' from "Pedigree"').all();
db.close();

const filled = (v) => v != null && String(v).trim() !== '';

const byKey = new Map();
for (const r of rows) {
  const k = keyOf(r.Name);
  if (k != null && !byKey.has(k)) byKey.set(k, r);
}

const producers = new Set();
for (const r of rows) {
  for (const parent of [r.Sire, r.Dam]) {
    const k = keyOf(parent);
    if (k != null && byKey.has(k)) producers.add(k);
  }
}

/**
 * Complete to n generations. Generation n counts as present when the NAME appears on a
 * generation n-1 record, even where that ancestor has no record of its own — the owner's
 * counting rule, kept so the numbers stay comparable.
 */
const depthMemo = new Map();
function completeTo(key, n) {
  if (n === 0) return true;
  const memoKey = key + ' ' + n;
  const hit = depthMemo.get(memoKey);
  if (hit !== undefined) return hit;
  depthMemo.set(memoKey, false); // cycle guard: a loop is not a complete pedigree
  const row = byKey.get(key);
  let result = false;
  if (row && filled(row.Sire) && filled(row.Dam)) {
    if (n === 1) result = true;
    else {
      const s = keyOf(row.Sire);
      const d = keyOf(row.Dam);
      result = s != null && d != null && completeTo(s, n - 1) && completeTo(d, n - 1);
    }
  }
  depthMemo.set(memoKey, result);
  return result;
}

const signals = (key, row) => ({
  dob: filled(row.DOB),
  reg: REG_COLUMNS.some((c) => filled(row[c])),
  title: TITLE_COLUMNS.some((c) => filled(row[c])),
  dna: DNA_COLUMNS.some((c) => filled(row[c])),
  offspring: producers.has(key),
});
const anySignal = (s) => s.dob || s.reg || s.title || s.dna || s.offspring;

const dogs = [...byKey.entries()].map(([key, row]) => {
  const s = signals(key, row);
  return {
    key, row, s, any: anySignal(s),
    d3: completeTo(key, 3), d4: completeTo(key, 4), d5: completeTo(key, 5),
  };
});

/** Descendants within INFLUENCE_DEPTH generations, for the founder check. */
const influence = new Map();
for (const { key } of dogs) {
  const seen = new Set();
  let frontier = [key];
  for (let g = 0; g < INFLUENCE_DEPTH && frontier.length > 0; g++) {
    const next = [];
    for (const k of frontier) {
      const row = byKey.get(k);
      if (!row) continue;
      for (const parent of [row.Sire, row.Dam]) {
        const pk = keyOf(parent);
        if (pk == null || seen.has(pk)) continue;
        seen.add(pk);
        influence.set(pk, (influence.get(pk) ?? 0) + 1);
        next.push(pk);
      }
    }
    frontier = next;
  }
}

const n = dogs.length;
const pct = (x) => ((x / n) * 100).toFixed(1) + '%';
const pad = (s, w) => String(s).padStart(w);

console.log('source: ' + file);
console.log('dogs (distinct names): ' + n + '   rows: ' + rows.length + '\n');

console.log('complete pedigree by depth');
for (const [label, sel] of [['3 generations', 'd3'], ['4 generations', 'd4'], ['5 generations', 'd5']]) {
  const c = dogs.filter((d) => d[sel]).length;
  console.log('  ' + label.padEnd(16) + pad(c, 7) + '  ' + pad(pct(c), 7));
}

console.log('\nsignal carriers');
for (const k of ['dob', 'reg', 'offspring', 'title', 'dna']) {
  const c = dogs.filter((d) => d.s[k]).length;
  console.log('  ' + k.padEnd(16) + pad(c, 7) + '  ' + pad(pct(c), 7));
}
const anyCount = dogs.filter((d) => d.any).length;
console.log('  ' + 'ANY signal'.padEnd(16) + pad(anyCount, 7) + '  ' + pad(pct(anyCount), 7));

const RULES = [
  ['A  5 gens + signal', (d) => d.d5 && d.any],
  ['B  4 gens + signal', (d) => d.d4 && d.any],
  ['C  3 gens + signal', (d) => d.d3 && d.any],
  ['D  signal, any depth', (d) => d.any],
  ['E  A or 10+ descendants', (d) => (d.d5 && d.any) || (influence.get(d.key) ?? 0) >= 10],
  ['MVP  recorded offspring', (d) => d.s.offspring],
  ['MVP-narrow  offspring+5gen', (d) => d.s.offspring && d.d5],
];

console.log('\ncandidate index rules');
const sets = new Map();
for (const [label, fn] of RULES) {
  const set = new Set(dogs.filter(fn).map((d) => d.key));
  sets.set(label, set);
  console.log('  ' + label.padEnd(26) + pad(set.size, 7) + '  ' + pad(pct(set.size), 7));
}

console.log('\nfounder check - top 200 by descendants within ' + INFLUENCE_DEPTH + ' generations');
const top = [...influence.entries()]
  .filter(([k]) => byKey.has(k))
  .sort((a, b) => b[1] - a[1])
  .slice(0, 200);
for (const [label] of RULES) {
  const excluded = top.filter(([k]) => !sets.get(label).has(k)).length;
  console.log('  ' + label.padEnd(26) + 'excludes ' + pad(excluded, 4) + ' of the top 200');
}
console.log('\n  most influential dogs:');
for (const [k, c] of top.slice(0, 10)) {
  const wide = sets.get('MVP  recorded offspring').has(k) ? 'producers: in ' : 'producers: OUT';
  const narrow = sets.get('MVP-narrow  offspring+5gen').has(k) ? 'offspring+5gen: in ' : 'offspring+5gen: OUT';
  console.log('    ' + pad(c, 6) + '  ' + wide + '  ' + narrow + '   ' + byKey.get(k).Name);
}
