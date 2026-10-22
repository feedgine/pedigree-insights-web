/**
 * Measure the mating objects over the real master, before anything is uploaded — the
 * figures behind gates A, B and C in the hypothetical-mating design (§5).
 *
 * Reads the master read-only (the same `loadPopulation` the publish uses) and the slug
 * assignments from the publish state, which it never writes. Writes nothing. Prints the
 * master's SHA-256 before and after, so the read-only claim is checked, not assumed.
 *
 *   npx tsx tools/measure-mating.ts --source "$MASTER_DB" --state "$PUBLISH_STATE"
 *       [--bench]        also run gates B and C on the most demanding pairs
 *       [--runs 50]      benchmark iterations per pair (after 5 warm-up runs)
 *       [--top 5]        how many of the largest objects to pair up in the benchmark
 *
 * Gate A: total mating objects ≤ 4 GB.
 * Gate B: median parse + computeMating for the worst pair at g = 10 ≤ 50 ms.
 * Gate C: the worst pair's page ≤ 2 MB uncompressed. The shell is not built yet (task
 *         7.2), so the page is measured as both embedded objects plus a fixed allowance
 *         for the shell, stated in the output.
 *
 * [DRAFT — requires Yuliya's review]
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { computeMating } from '../src/mating/compute';
import { indexKey } from '../src/publish/key';
import {
  buildMatingObject,
  populationGenetics,
  serialiseMatingObject,
  type MatingContext,
  type MatingObject,
} from '../src/publish/mating';
import { brokenEdgesOf, findCycleEdges, withoutCycles } from '../src/publish/reports';
import { assignSlugs, emptySlugState, parseSlugState } from '../src/publish/slugMap';
import { fileDigest, loadPopulation } from '../src/publish/source';
import type { Animal } from '../src/vendor/pedigree-insights/schema';
import type { AnimalLookup } from '../src/vendor/pedigree-insights/pedigreeAlgorithm';
import { CONTRIBUTION_MAX_GENERATIONS } from '../src/vendor/pedigree-insights/pedigreeAlgorithm';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const source = arg('source', '');
const statePath = arg('state', 'publish-state/state.json');
const bench = process.argv.includes('--bench');
const runs = Number(arg('runs', '50'));
const top = Number(arg('top', '5'));

const GATE_A_BYTES = 4e9;
const GATE_B_MS = 50;
const GATE_C_BYTES = 2e6;
/** Allowance for the HTML shell around the two data blocks (layout, controls, header). */
const SHELL_ALLOWANCE_BYTES = 20_000;

if (!source || !existsSync(source)) {
  throw new Error(`--source: no file at ${JSON.stringify(source)}. Keep the path in double quotes.`);
}

const mb = (n: number) => `${(n / 1e6).toFixed(2)} MB`;
const gb = (n: number) => `${(n / 1e9).toFixed(3)} GB (${(n / 2 ** 30).toFixed(3)} GiB)`;
const pct = (sorted: readonly number[], p: number) =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
function distribution(label: string, values: number[], unit: (n: number) => string = String): void {
  const s = [...values].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
  console.log(
    `  ${label.padEnd(16)} p50 ${unit(pct(s, 50))} · p90 ${unit(pct(s, 90))} · p99 ${unit(pct(s, 99))} · ` +
      `max ${unit(s[s.length - 1] ?? 0)} · mean ${unit(Math.round(mean))}`,
  );
}

/**
 * The longest recorded line behind every dog, parents first — iterative, over the
 * cycle-cut lookup. Counted before the population pass, which stops at the first dog that
 * reaches the contribution cap: here every such dog is listed instead.
 */
function lineDepths(animals: readonly Animal[], lookup: AnimalLookup): Map<string, number> {
  const depth = new Map<string, number>();
  for (const root of animals) {
    const rootKey = indexKey(root.name);
    if (rootKey == null || depth.has(rootKey)) continue;
    const stack: { key: string; animal: Animal }[] = [{ key: rootKey, animal: lookup(root.name) ?? root }];
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const parents = [top.animal.sire, top.animal.dam]
        .map((n) => (indexKey(n) == null ? null : lookup(n as string)))
        .filter((p): p is Animal => p != null);
      const pending = parents.filter((p) => !depth.has(indexKey(p.name)!));
      if (pending.length > 0) {
        for (const p of pending) stack.push({ key: indexKey(p.name)!, animal: p });
        continue;
      }
      stack.pop();
      if (depth.has(top.key)) continue;
      depth.set(top.key, parents.length === 0 ? 0 : 1 + Math.max(...parents.map((p) => depth.get(indexKey(p.name)!)!)));
    }
  }
  return depth;
}

const digestBefore = await fileDigest(source);
console.log(`master   ${source}\nsha-256  ${digestBefore} (before)`);

const t0 = performance.now();
const population = loadPopulation(source);
const previous = existsSync(statePath)
  ? (() => {
      const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as { slugs?: unknown; manifest?: Record<string, string> };
      return {
        state: parseSlugState(JSON.stringify(parsed.slugs ?? parsed)),
        published: new Set(Object.keys(parsed.manifest ?? {})),
      };
    })()
  : { state: emptySlugState(), published: new Set<string>() };
const { slugByKey } = assignSlugs(population.animals, previous.state, previous.published);
const cycles = findCycleEdges(population.animals, population.lookup);
const lookup = withoutCycles(population.lookup, brokenEdgesOf(cycles));
const tLoad = performance.now();
console.log(
  `\n${population.animals.length} dogs loaded, ${cycles.length} cycle edges broken ` +
    `(${((tLoad - t0) / 1000).toFixed(1)} s)`,
);

// ---- the contribution cap ---------------------------------------------------------------
const depths = lineDepths(population.animals, lookup);
const atCap = [...depths].filter(([, d]) => d >= CONTRIBUTION_MAX_GENERATIONS);
const deepest = [...depths].sort((a, b) => b[1] - a[1]).slice(0, 3);
console.log(
  `\ndeepest recorded line: ${deepest.map(([k, d]) => `${population.byKey.get(k)?.name ?? k} (${d})`).join(', ')}`,
);
console.log(`dogs reaching the ${CONTRIBUTION_MAX_GENERATIONS}-generation cap: ${atCap.length}`);
if (atCap.length > 0) {
  for (const [k, d] of atCap.slice(0, 20)) console.log(`  ${population.byKey.get(k)?.name ?? k} — ${d}`);
  console.log('\nThe publish would stop on these. Stopping here too.');
  process.exit(1);
}

// ---- the publish pass ---------------------------------------------------------------------
const tGen0 = performance.now();
const genetics = populationGenetics(population.animals, lookup);
const tGen1 = performance.now();
const ctx: MatingContext = { lookup, slugByKey, genetics, cycles };

const lengths: number[] = [];
const sizes: number[] = [];
const dictSizes: number[] = [];
let total = 0;
let withCycles = 0;
/** The largest objects, kept as stored bytes for the benchmark. */
let largest: { name: string; slug: string; bytes: string; w: number }[] = [];
for (const a of population.animals) {
  const o = buildMatingObject(ctx, a);
  const bytes = serialiseMatingObject(o);
  const n = Buffer.byteLength(bytes, 'utf8');
  lengths.push(o.coi.w.length);
  sizes.push(n);
  dictSizes.push(o.dict.length);
  total += n;
  if (o.cycles) withCycles += 1;
  if (largest.length < top * 4 || n > Buffer.byteLength(largest[largest.length - 1].bytes)) {
    largest.push({ name: o.name, slug: o.slug, bytes, w: o.coi.w.length });
    largest = largest
      .sort((x, y) => Buffer.byteLength(y.bytes) - Buffer.byteLength(x.bytes))
      .slice(0, top * 4);
  }
}
const tObj = performance.now();

const fMax = Math.max(...genetics.F.values());
console.log(`\npublish pass`);
console.log(`  population F/D pass   ${((tGen1 - tGen0) / 1000).toFixed(1)} s (max F ${(fMax * 100).toFixed(2)} %)`);
console.log(`  objects built         ${((tObj - tGen1) / 1000).toFixed(1)} s`);
console.log(`  total                 ${((tObj - tGen0) / 1000).toFixed(1)} s`);
console.log(`\nobjects: ${sizes.length}, ${withCycles} carry a cycle note`);
distribution('vector length', lengths);
distribution('dict entries', dictSizes);
distribution('object size', sizes, (n) => `${(n / 1024).toFixed(1)} KiB`);
console.log(`\nlargest objects`);
for (const l of largest.slice(0, 10)) {
  console.log(`  ${(Buffer.byteLength(l.bytes) / 1024).toFixed(1).padStart(8)} KiB  w ${String(l.w).padStart(5)}  ${l.name}`);
}

console.log(`\nGATE A  total mating objects ${gb(total)} — limit ${gb(GATE_A_BYTES)} → ${total <= GATE_A_BYTES ? 'PASS' : 'FAIL'}`);

// ---- gates B and C --------------------------------------------------------------------
if (bench) {
  const asOf = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const candidates = largest.slice(0, top);
  let worst = { ms: 0, page: 0, pair: '' };
  let worstPage = { page: 0, pair: '' };
  console.log(`\nbenchmark: parse + computeMating at g = 10, ${runs} runs after 5 warm-up, as of ${asOf.toISOString().slice(0, 10)}`);
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const s = candidates[i];
      const d = candidates[j];
      const once = () => computeMating(JSON.parse(s.bytes) as MatingObject, JSON.parse(d.bytes) as MatingObject, 10, asOf);
      for (let k = 0; k < 5; k += 1) once();
      const times: number[] = [];
      let r = once();
      for (let k = 0; k < runs; k += 1) {
        const a = performance.now();
        r = once();
        times.push(performance.now() - a);
      }
      times.sort((x, y) => x - y);
      const median = times[Math.floor(times.length / 2)];
      const page = Buffer.byteLength(s.bytes) + Buffer.byteLength(d.bytes) + SHELL_ALLOWANCE_BYTES;
      const pair = `${s.name} × ${d.name}`;
      console.log(
        `  ${median.toFixed(2).padStart(7)} ms median (p90 ${pct(times, 90).toFixed(2)})  page ${mb(page)}  ` +
          `COI ${r.litterCoi.toFixed(2)} %  ${r.commonAncestors.length} common  ${pair}`,
      );
      if (median > worst.ms) worst = { ms: median, page, pair };
      if (page > worstPage.page) worstPage = { page, pair };
    }
  }
  console.log(`\nGATE B  worst median ${worst.ms.toFixed(2)} ms (${worst.pair}) — limit ${GATE_B_MS} ms → ${worst.ms <= GATE_B_MS ? 'PASS' : 'FAIL'}`);
  console.log(
    `GATE C  worst page ${mb(worstPage.page)} (${worstPage.pair}; both objects + ${SHELL_ALLOWANCE_BYTES / 1000} KB shell allowance) ` +
      `— limit ${mb(GATE_C_BYTES)} → ${worstPage.page <= GATE_C_BYTES ? 'PASS' : 'FAIL'}`,
  );
}

const digestAfter = await fileDigest(source);
console.log(`\nsha-256  ${digestAfter} (after) — ${digestAfter === digestBefore ? 'unchanged' : 'CHANGED'}`);
if (digestAfter !== digestBefore) process.exit(2);
