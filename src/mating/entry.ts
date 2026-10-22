/**
 * The mating page's script — the bundle entry, and the page's only DOM code.
 *
 * It reads what the server shell embedded and nothing else: the two stored objects in
 * `#mating-sire` and `#mating-dam`, and the depth and the request's UTC date as
 * `data-generations` and `data-as-of` on `#mating-analysis`. Then it computes, renders
 * and inserts. It makes no network request, so `connect-src` stays closed under the
 * page's CSP (design §7).
 *
 * Kept this small on purpose: everything worth testing is in `compute.ts` and
 * `render.ts`, which the unit tests import; this file is checked live (task 8.2).
 *
 * [DRAFT — requires Yuliya's review]
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { computeMating } from './compute';
import type { MatingObject } from './object';
import { renderMatingAnalysis } from './render';

function embedded(id: string): MatingObject {
  const block = document.getElementById(id);
  if (block == null || block.textContent == null) throw new Error(`#${id} is missing.`);
  return JSON.parse(block.textContent) as MatingObject;
}

function run(): void {
  const target = document.getElementById('mating-analysis');
  if (target == null) return;
  try {
    const sire = embedded('mating-sire');
    const dam = embedded('mating-dam');
    const generations = Number(target.dataset.generations);
    const asOf = new Date(`${target.dataset.asOf ?? ''}T00:00:00Z`);
    if (!Number.isFinite(generations) || Number.isNaN(asOf.getTime())) {
      throw new Error('#mating-analysis has no valid data-generations or data-as-of.');
    }
    target.innerHTML = renderMatingAnalysis(computeMating(sire, dam, generations, asOf), sire, dam, asOf);
  } catch (err) {
    // Say so on the page rather than leave it silently empty; the detail is for the console.
    target.textContent = 'The analysis could not be calculated for this pair.';
    console.error(err);
  }
}

run();
