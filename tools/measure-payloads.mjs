#!/usr/bin/env node
/**
 * Where the bytes are.
 *
 * The first real run produced 860 MB of payloads against a 500 MB D1 limit, so the
 * question "what makes a page big?" now decides the storage design. This reads the
 * payloads a publish already wrote — it does not touch the master and needs no database.
 *
 * Usage: node tools/measure-payloads.mjs <out-dir> [--top 20]
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node tools/measure-payloads.mjs <out-dir> [--top N]');
  process.exit(1);
}
const topN = Number(process.argv[process.argv.indexOf('--top') + 1]) || 20;

const files = [];
const dogDir = join(dir, 'dog');
for (const shard of readdirSync(dogDir)) {
  const shardDir = join(dogDir, shard);
  if (!statSync(shardDir).isDirectory()) continue;
  for (const f of readdirSync(shardDir)) if (f.endsWith('.json')) files.push(join(shardDir, f));
}
console.log(`payloads: ${files.length}\n`);

const bytes = (v) => Buffer.byteLength(JSON.stringify(v ?? null));
const sections = { subject: 0, bracket: 0, offspring: 0, siblings: 0, context: 0, other: 0 };
const counts = { offspring: 0, siblings: 0, bracket: 0 };
let total = 0;
let totalGz = 0;
const sizes = [];
const rows = [];
const hubs = { kennel: new Set(), year: new Set(), country: new Set(), dna: new Set() };
let indexed = 0;

for (const file of files) {
  const raw = readFileSync(file);
  const p = JSON.parse(raw);
  const size = raw.length;
  total += size;
  totalGz += gzipSync(raw, { level: 6 }).length;
  sizes.push(size);

  const s = {
    subject: bytes(p.subject),
    bracket: bytes(p.bracket),
    offspring: bytes(p.offspring),
    siblings: bytes(p.siblings),
    context: bytes(p.context),
  };
  for (const k of Object.keys(s)) sections[k] += s[k];
  sections.other += size - Object.values(s).reduce((a, b) => a + b, 0);

  const nOffspring = (p.offspring ?? []).reduce((a, g) => a + g.dogs.length, 0);
  // Half siblings are counts, not lists, since 2026-08-28 — the older shape is still read
  // so a report can be run against output produced before the change.
  const nSiblings =
    (p.siblings?.full?.length ?? 0) +
    (p.siblings?.halfBySire?.length ?? p.siblings?.halfBySireCount ?? 0) +
    (p.siblings?.halfByDam?.length ?? p.siblings?.halfByDamCount ?? 0);
  counts.offspring += nOffspring;
  counts.siblings += nSiblings;
  counts.bracket += (p.bracket ?? []).length;

  rows.push({ name: p.name, size, nOffspring, nSiblings, s });

  // Hub page budget: how many distinct pages each hub family would need. Cloudflare
  // Pages allows 20,000 files on the free plan, so this is the number that decides
  // which hubs are pre-built files and which are served from D1 by a Function.
  if (p.context?.kennelSlug) hubs.kennel.add(p.context.kennelSlug);
  if (p.context?.birthYear) hubs.year.add(p.context.birthYear);
  if (p.context?.country) hubs.country.add(p.context.country.toLowerCase());
  for (const d of p.context?.dna ?? []) hubs.dna.add(d.test);
  if (p.indexed) indexed += 1;
}

sizes.sort((a, b) => a - b);
const q = (f) => sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * f))];
const mb = (n) => (n / 1e6).toFixed(1) + ' MB';
const pad = (v, w) => String(v).padStart(w);

console.log('size distribution');
for (const [label, v] of [
  ['p50', q(0.5)], ['p90', q(0.9)], ['p99', q(0.99)],
  ['max', sizes[sizes.length - 1]], ['mean', Math.round(total / sizes.length)],
]) console.log('  ' + label.padEnd(6) + pad(v, 9) + ' B');

console.log('\ntotals');
console.log('  raw            ' + pad(mb(total), 10));
console.log('  gzip -6        ' + pad(mb(totalGz), 10) + `   (${(total / totalGz).toFixed(1)}x)`);

console.log('\nwhere the bytes are');
for (const [k, v] of Object.entries(sections).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + k.padEnd(12) + pad(mb(v), 10) + pad(((v / total) * 100).toFixed(1) + '%', 8));
}

console.log('\nlist lengths (total entries across all pages)');
for (const [k, v] of Object.entries(counts)) console.log('  ' + k.padEnd(12) + pad(v, 12));

console.log(`\nwhat a cap would save (siblings + offspring lists trimmed per page)`);
for (const cap of [20, 50, 100, 200, 500]) {
  let saved = 0;
  for (const r of rows) {
    const over = Math.max(0, r.nSiblings - cap) + Math.max(0, r.nOffspring - cap);
    const perEntry = (r.s.siblings + r.s.offspring) / Math.max(1, r.nSiblings + r.nOffspring);
    saved += over * perEntry;
  }
  console.log(
    '  cap ' + pad(cap, 4) + '   saves ~' + pad(mb(saved), 9) +
    '   → ' + pad(mb(total - saved), 9) + ' raw, ~' + pad(mb((total - saved) / (total / totalGz)), 9) + ' gzip',
  );
}

console.log('\nhub pages each family would need');
const AZ_PER_PAGE = 200;
const az = Math.ceil(files.length / AZ_PER_PAGE);
const rowsOut = [
  ['dog pages (indexed)', indexed],
  ['kennels', hubs.kennel.size],
  ['birth years', hubs.year.size],
  ['countries', hubs.country.size],
  ['DNA tests', hubs.dna.size],
  [`A-Z index (${AZ_PER_PAGE}/page)`, az],
];
let budget = 0;
for (const [label, n] of rowsOut) {
  budget += n;
  console.log('  ' + label.padEnd(24) + pad(n, 7));
}
console.log('  ' + '─'.repeat(31));
console.log('  ' + 'total files'.padEnd(24) + pad(budget, 7) + '   of 20,000 Cloudflare Pages allows');

console.log(`\nlargest ${topN} pages`);
rows.sort((a, b) => b.size - a.size);
for (const r of rows.slice(0, topN)) {
  console.log(
    '  ' + pad(r.size, 8) + ' B   offspring ' + pad(r.nOffspring, 5) +
    '   siblings ' + pad(r.nSiblings, 6) + '   ' + r.name,
  );
}
