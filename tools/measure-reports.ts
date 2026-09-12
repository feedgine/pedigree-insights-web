/**
 * Measure the report payloads (Linebreeding + Foundation) over the published catalogue
 * WITHOUT touching the master: the page payloads in `out/dog/` already carry every dog's
 * name, sire, dam, sex and COI, which is all the walks need.
 *
 * Prints how many dogs have a report worth reading, the row-count distribution, the
 * largest report, the total bytes R2 would hold, and the time the walks took — the
 * numbers behind the decisions in `src/publish/constants.ts`.
 *
 *   npx tsx tools/measure-reports.ts --payloads out [--generations 20] [--sample 0]
 *       [--dump "<name>" --to <file.json>]   also write one dog's report payload
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { LINEBREEDING_GENERATIONS } from '../src/publish/constants';
import { indexKey } from '../src/publish/key';
import { stableStringify, type DogPayload } from '../src/publish/payload';
import {
  brokenEdgesOf,
  buildReports,
  findCycleEdges,
  unmatchedFoundationDogs,
  withoutCycles,
  type ReportContext,
} from '../src/publish/reports';
import type { Animal } from '../src/vendor/pedigree-insights/schema';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const payloads = arg('payloads', 'out');
const generations = Number(arg('generations', String(LINEBREEDING_GENERATIONS)));
const sample = Number(arg('sample', '0'));
const dump = arg('dump', '');
const dumpTo = arg('to', 'report.json');

/** A minimal Animal from a page payload: the fields the walks read, nothing else. */
function animalOf(p: DogPayload): Animal {
  return {
    name: p.name,
    sire: p.sire?.name ?? null,
    dam: p.dam?.name ?? null,
    sex: p.subject.sex ?? null,
    dob: p.subject.dob ?? null,
    registration: p.subject.registration ?? null,
    preTitle: p.subject.preTitle ?? null,
    postTitle: p.subject.postTitle ?? null,
    color: null,
    breed: null,
    coi: p.subject.coi ?? null,
    avk: null,
    fields: {},
  };
}

const t0 = Date.now();
const animals: Animal[] = [];
const slugByKey = new Map<string, string>();
const root = join(payloads, 'dog');
for (const shard of readdirSync(root)) {
  if (shard.startsWith('.')) continue;
  for (const file of readdirSync(join(root, shard))) {
    if (!file.endsWith('.json')) continue;
    const p = JSON.parse(readFileSync(join(root, shard, file), 'utf8')) as DogPayload;
    animals.push(animalOf(p));
    slugByKey.set(indexKey(p.name)!, p.slug);
  }
}
const byKey = new Map(animals.map((a) => [indexKey(a.name)!, a]));
const lookup = (name: string) => byKey.get(indexKey(name) ?? '') ?? null;
console.log(`payloads read     ${animals.length} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const cycles = findCycleEdges(animals, lookup);
const broken = brokenEdgesOf(cycles);
const ctx: ReportContext = { lookup: withoutCycles(lookup, broken), slugByKey, broken, generations };
const unmatched = unmatchedFoundationDogs(lookup);

if (dump !== '') {
  const animal = lookup(dump);
  if (animal == null) throw new Error(`No dog named ${JSON.stringify(dump)} in the payloads.`);
  writeFileSync(dumpTo, `${stableStringify(buildReports(ctx, animal))}\n`);
  console.log(`dumped            ${animal.name} → ${dumpTo}`);
}

const t1 = Date.now();
const buckets: Record<string, number> = {};
let withRows = 0;
let rowsTotal = 0;
let bytesTotal = 0;
let largest = { bytes: 0, rows: 0, name: '' };
let foundationPresent = 0;
let n = 0;
for (const animal of animals) {
  if (sample > 0 && n >= sample) break;
  n += 1;
  const r = buildReports(ctx, animal);
  const bytes = Buffer.byteLength(stableStringify(r)) + 1;
  const rows = r.linebreeding.ancestors.length;
  rowsTotal += rows;
  bytesTotal += bytes;
  if (rows > 0) withRows += 1;
  if (r.foundation.rows.length > 0) foundationPresent += 1;
  if (bytes > largest.bytes) largest = { bytes, rows, name: animal.name };
  const b = rows === 0 ? '0' : rows < 10 ? '1-9' : rows < 50 ? '10-49' : rows < 200 ? '50-199' : rows < 500 ? '200-499' : '500+';
  buckets[b] = (buckets[b] ?? 0) + 1;
}
const seconds = ((Date.now() - t1) / 1000).toFixed(1);

console.log(`generations       ${generations}`);
console.log(`dogs measured     ${n}   walked in ${seconds} s`);
console.log(`with a repeat     ${withRows}   (${((withRows / n) * 100).toFixed(1)}%)`);
console.log(`rows per report   mean ${(rowsTotal / n).toFixed(1)}   distribution ${JSON.stringify(buckets)}`);
console.log(`largest report    ${largest.bytes} B, ${largest.rows} rows — ${largest.name}`);
console.log(`total bytes       ${(bytesTotal / 1e6).toFixed(1)} MB   mean ${(bytesTotal / n).toFixed(0)} B`);
console.log(`foundation        ${foundationPresent} dogs have at least one foundation dog in the pedigree`);
console.log(`foundation list   ${unmatched.length} unmatched${unmatched.length ? `: ${unmatched.join(', ')}` : ''}`);
console.log(`pedigree cycles   ${cycles.length}`);
