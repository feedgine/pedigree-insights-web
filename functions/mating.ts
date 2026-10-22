/**
 * `/mating?sire=<slug>&dam=<slug>&g=<n>` — the planned-litter page (PRD R-2.11, pending).
 *
 * The bindings and nothing else: the canonicalisation, the reads and the page are in
 * `src/render/matingRoute.ts`, where the tests can count the storage calls. A canonical
 * pair costs one D1 query and two R2 GETs, and the analysis is computed by the visitor's
 * browser from the two objects embedded in the page — never here (design §2).
 *
 * This is the only response on the site with `script-src 'self'` (`MATING_HEADERS`).
 *
 * [DRAFT — requires Yuliya's review]
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { MATING_SCRIPT } from '../src/generated/matingScript';
import { handleMating } from '../src/render/matingRoute';

interface Env {
  PAYLOADS: R2Bucket;
  DB: D1Database;
}

export const onRequestGet: PagesFunction<Env> = (context) =>
  handleMating(context.request, context.env, MATING_SCRIPT);
