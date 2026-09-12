#!/usr/bin/env node
/**
 * The foundation list exists in exactly two places, by design: the human-readable text
 * file in the documentation hub (what the owner imports into the desktop application) and
 * `src/publish/foundationDogs.ts` (what the site publishes). They must be identical, and
 * nothing else enforces that — the publish only checks that names match the catalogue.
 *
 * Usage:
 *   node tools/foundation-check.mjs [path/to/foundation-japanese-spitz-exports.txt]
 *
 * The path defaults to $FOUNDATION_LIST (set in deploy.local.env). Exit 1 on any difference.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hubPath = process.argv[2] ?? process.env.FOUNDATION_LIST;
if (!hubPath) {
  console.error('Usage: node tools/foundation-check.mjs <hub txt>  (or set FOUNDATION_LIST)');
  process.exit(2);
}

const ts = readFileSync(join(root, 'src/publish/foundationDogs.ts'), 'utf8');
const body = ts.slice(ts.indexOf('= ['), ts.lastIndexOf('];'));
const repo = [...body.matchAll(/^\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"),/gm)].map(
  (m) => (m[1] ?? m[2]).replace(/\\(['"])/g, '$1'),
);
const hub = readFileSync(hubPath, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter((l) => l !== '');

const onlyRepo = repo.filter((n) => !hub.includes(n));
const onlyHub = hub.filter((n) => !repo.includes(n));
const sameOrder = repo.length === hub.length && repo.every((n, i) => n === hub[i]);

if (onlyRepo.length === 0 && onlyHub.length === 0 && sameOrder) {
  console.log(`✓ foundation list: ${repo.length} names, identical in the repo and the hub.`);
  process.exit(0);
}
if (onlyRepo.length > 0) console.error(`only in foundationDogs.ts:\n  ${onlyRepo.join('\n  ')}`);
if (onlyHub.length > 0) console.error(`only in the hub file:\n  ${onlyHub.join('\n  ')}`);
if (onlyRepo.length === 0 && onlyHub.length === 0) console.error('same names, different order.');
console.error(`\n✗ ${repo.length} names in the repo, ${hub.length} in the hub. Fix both, then re-run.`);
process.exit(1);
