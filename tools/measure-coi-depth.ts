/**
 * Which depth reproduces the stored COI? Computes the inbreeding coefficient with the
 * vendored genetics engine over a pedigree truncated at N generations, for several N, and
 * compares with the COI stored in the database (as carried in the page payloads).
 *
 *   npx tsx tools/measure-coi-depth.ts --payloads out [--sample 300] [--depths 5,10,15,20,64]
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { indexKey } from '../src/publish/key';
import type { DogPayload } from '../src/publish/payload';
import { createGeneticsEngine } from '../src/vendor/pedigree-insights/genetics';
import type { Animal } from '../src/vendor/pedigree-insights/schema';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const payloads = arg('payloads', 'out');
const sample = Number(arg('sample', '300'));
const depths = arg('depths', '5,10,15,20,64').split(',').map(Number);

const animals: Animal[] = [];
const root = join(payloads, 'dog');
for (const shard of readdirSync(root)) {
  if (shard.startsWith('.')) continue;
  for (const file of readdirSync(join(root, shard))) {
    if (!file.endsWith('.json')) continue;
    const p = JSON.parse(readFileSync(join(root, shard, file), 'utf8')) as DogPayload;
    animals.push({
      name: p.name, sire: p.sire?.name ?? null, dam: p.dam?.name ?? null, sex: p.subject.sex ?? null,
      dob: null, registration: null, preTitle: null, postTitle: null, color: null, breed: null,
      coi: p.subject.coi ?? null, avk: null, fields: {},
    });
  }
}
const byKey = new Map(animals.map((a) => [indexKey(a.name)!, a]));
const lookup = (name: string) => byKey.get(indexKey(name) ?? '') ?? null;

/** Depth of each ancestor from the subject (shallowest path), bounded. */
function depthsFrom(subject: Animal, cap: number): Map<string, number> {
  const d = new Map<string, number>([[indexKey(subject.name)!, 0]]);
  let layer = [subject];
  for (let g = 1; g <= cap && layer.length > 0; g += 1) {
    const next: Animal[] = [];
    for (const a of layer) {
      for (const pn of [a.sire, a.dam]) {
        const k = indexKey(pn);
        if (k == null || d.has(k)) continue;
        const p = byKey.get(k);
        if (!p) continue;
        d.set(k, g);
        next.push(p);
      }
    }
    layer = next;
  }
  return d;
}

/** A lookup that forgets the parents of anything at generation N from the subject. */
function truncated(subject: Animal, n: number) {
  const d = depthsFrom(subject, n);
  return (name: string): Animal | null => {
    const a = lookup(name);
    if (!a) return null;
    const g = d.get(indexKey(a.name)!);
    if (g === undefined) return null;
    return g >= n ? { ...a, sire: null, dam: null } : a;
  };
}

// Dogs with a stored COI and a deep pedigree: the ones where depth makes a difference.
const candidates = animals.filter((a) => a.coi != null && a.coi > 0 && depthsFrom(a, 12).size > 500);
let seed = 7;
const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const chosen = candidates.sort(() => rnd() - 0.5).slice(0, sample);
console.log(`candidates ${candidates.length} (stored COI > 0, >500 ancestors within 12 gens); sample ${chosen.length}`);

for (const n of depths) {
  let exact = 0;
  const errs: number[] = [];
  for (const a of chosen) {
    const engine = createGeneticsEngine(truncated(a, n));
    const f = engine.inbreeding(a.name);
    const err = Math.abs(f - (a.coi as number));
    errs.push(err);
    if (err < 5e-7) exact += 1;
  }
  errs.sort((x, y) => x - y);
  const med = errs[Math.floor(errs.length / 2)];
  const p90 = errs[Math.floor(errs.length * 0.9)];
  console.log(`depth ${String(n).padStart(2)}  within 5e-7 of stored: ${exact}/${chosen.length}   median |err| ${med.toExponential(2)}   p90 ${p90.toExponential(2)}`);
}
