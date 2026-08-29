/**
 * Slug assignment — the state that keeps published URLs working.
 *
 * `slug.ts` answers "what is the candidate slug for this name?". This module answers the
 * harder question: "what is this dog's URL, given every URL this site has already
 * published?" That is an assignment, not a calculation, and it needs memory. The memory is
 * a small JSON file the publish pipeline owns (PRD R-5.2, R-5.3).
 *
 * The identity problem, stated once. `Name` is the source's primary key, so a corrected
 * typo changes the name, the candidate slug, and — if nothing else were remembered — the
 * URL, with nothing left to redirect from. The stable identity is therefore the
 * **registration code** where a dog has one, and a **synthetic id assigned once** where it
 * does not. Slugs are keyed by that identity, so a rename is seen for what it is: the same
 * dog, a new canonical URL, and a 301 from the old one.
 *
 * What this module deliberately does NOT do: guess. A dog with no registration that is
 * renamed between two publishes cannot be recognised as the same dog by any information in
 * the file, so it receives a new identity and a new URL, and the old URL is left pointing
 * at the record it was published for. That limit is real and is stated in the run report
 * rather than hidden behind a heuristic.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import type { Animal } from '../vendor/pedigree-insights/schema';
import { disambiguate, slugify } from './slug';
import { indexKey } from './key';

/** Current shape of the persisted state. Bumped only for a breaking change. */
export const SLUG_STATE_VERSION = 1;

export interface SlugState {
  readonly version: number;
  /** Stable identity → the canonical slug currently published for it. */
  readonly assignments: Record<string, string>;
  /** Index key of a dog with no registration → the synthetic id minted for it (R-5.3). */
  readonly synthetic: Record<string, string>;
  /** A slug that was canonical once → the slug that replaced it. Never a chain. */
  readonly redirects: Record<string, string>;
  /** Next synthetic number, so an id is never reused after a dog leaves the file. */
  readonly nextSynthetic: number;
}

/** An empty state, for the first ever run. */
export function emptySlugState(): SlugState {
  return {
    version: SLUG_STATE_VERSION,
    assignments: {},
    synthetic: {},
    redirects: {},
    nextSynthetic: 1,
  };
}

export interface SlugAssignment {
  /** Index key of a dog → its canonical slug. Every dog in the file appears here. */
  readonly slugByKey: ReadonlyMap<string, string>;
  /** Index key → the stable identity the slug is held against. */
  readonly identityByKey: ReadonlyMap<string, string>;
  /** The state to persist for the next run. */
  readonly state: SlugState;
  readonly report: SlugReport;
}

export interface SlugReport {
  /** Dogs that received a URL for the first time. */
  readonly assigned: number;
  /** Dogs whose canonical URL changed, with the redirect that was recorded. */
  readonly moved: readonly { from: string; to: string; name: string }[];
  /** Dogs whose candidate slug was already taken and were disambiguated. */
  readonly collisions: readonly { slug: string; name: string; resolved: string }[];
  /** Dogs with no registration, which cannot be followed through a rename. */
  readonly withoutRegistration: number;
  /** Slugs held in state for dogs no longer in the file. Kept, never reissued. */
  readonly retired: number;
}

/**
 * The stable identity of a dog.
 *
 * Registration codes are compared case-insensitively and with whitespace collapsed,
 * because the same code is written `FIN 12345/99` and `FIN12345/99` across imports.
 */
export function registrationIdentity(animal: Animal): string | null {
  // `String()` rather than `.trim()`: a registration written as a number comes back from
  // SQLite as one, and a dog's identity must not depend on how a value was typed in.
  const raw = animal.registration == null ? '' : String(animal.registration).trim();
  if (raw === '') return null;
  return `reg:${raw.replace(/\s+/g, ' ').toUpperCase()}`;
}

/** A synthetic id looks like `x-000042`; the prefix keeps it clearly not a registration. */
function syntheticId(n: number): string {
  return `x-${String(n).padStart(6, '0')}`;
}

/**
 * Point every redirect that ended at `from` at `to` as well, and record `from → to`.
 *
 * Chains are collapsed rather than followed. Two hops cost the visitor a second round
 * trip and cost the site a diluted signal, and there is no reason to keep them: the target
 * is known at the moment the move is recorded.
 */
function recordMove(redirects: Record<string, string>, from: string, to: string): void {
  for (const [old, target] of Object.entries(redirects)) {
    if (target === from) redirects[old] = to;
  }
  redirects[from] = to;
  // A slug that is canonical again must not also redirect somewhere.
  delete redirects[to];
}

/**
 * Assign a canonical slug to every dog in the population.
 *
 * The pass order is what makes the result stable: dogs that already hold the slug they
 * would be given keep it first, so a newcomer can never take a URL out from under a dog
 * that has been published under it. Everything after that is resolved in identity order,
 * which does not depend on how the database returned its rows.
 */
export function assignSlugs(
  animals: readonly Animal[],
  previous: SlugState = emptySlugState(),
): SlugAssignment {
  const assignments: Record<string, string> = { ...previous.assignments };
  const synthetic: Record<string, string> = { ...previous.synthetic };
  const redirects: Record<string, string> = { ...previous.redirects };
  let nextSynthetic = previous.nextSynthetic;

  const moved: { from: string; to: string; name: string }[] = [];
  const collisions: { slug: string; name: string; resolved: string }[] = [];
  let assigned = 0;
  let withoutRegistration = 0;

  // ---- 1. identity for every dog, minted in a deterministic order ----------------
  interface Entry {
    key: string;
    animal: Animal;
    identity: string;
    candidate: string | null;
    desired: string;
  }
  const entries: Entry[] = [];
  const named = [...animals]
    .map((a) => ({ a, key: indexKey(a.name) }))
    .filter((e): e is { a: Animal; key: string } => e.key != null)
    .sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : 0));

  for (const { a, key } of named) {
    let identity = registrationIdentity(a);
    if (identity == null) {
      withoutRegistration += 1;
      const existing = synthetic[key];
      if (existing !== undefined) {
        identity = `syn:${existing}`;
      } else {
        const id = syntheticId(nextSynthetic);
        nextSynthetic += 1;
        synthetic[key] = id;
        identity = `syn:${id}`;
      }
    }
    const candidate = slugify(a.name);
    const discriminator = identity.slice(identity.indexOf(':') + 1);
    const desired = candidate ?? disambiguate(null, discriminator);
    entries.push({ key, animal: a, identity, candidate, desired });
  }

  // ---- 2. one identity per dog ----------------------------------------------------
  // Two rows may carry the same registration code — a data error, but one that must not
  // make two dogs share a URL. The first in key order keeps the registration identity;
  // the rest fall back to a synthetic id, exactly as an unregistered dog does.
  const identitySeen = new Set<string>();
  for (const e of entries) {
    if (!identitySeen.has(e.identity)) {
      identitySeen.add(e.identity);
      continue;
    }
    let id = synthetic[e.key];
    if (id === undefined) {
      id = syntheticId(nextSynthetic);
      nextSynthetic += 1;
      synthetic[e.key] = id;
    }
    e.identity = `syn:${id}`;
    if (e.candidate == null) e.desired = disambiguate(null, id);
    identitySeen.add(e.identity);
  }

  // ---- 3. claim slugs -------------------------------------------------------------
  /** slug → the identity holding it. Seeded with every slug this site has ever used, so
   *  a URL published for a dog that has since left the file is never handed to another. */
  const RETIRED = ' retired';
  const taken = new Map<string, string>();
  for (const [identity, slug] of Object.entries(previous.assignments)) taken.set(slug, identity);
  for (const old of Object.keys(previous.redirects)) if (!taken.has(old)) taken.set(old, RETIRED);

  const slugByKey = new Map<string, string>();
  const identityByKey = new Map<string, string>();
  const free = (slug: string, identity: string) => {
    const holder = taken.get(slug);
    return holder === undefined || holder === identity;
  };

  // 3a. Dogs already published under the slug they would be given keep it, before anyone
  //     else can claim it. Without this pass a newcomer could take a live URL.
  const settled = new Set<string>();
  for (const e of entries) {
    if (assignments[e.identity] === e.desired && free(e.desired, e.identity)) {
      taken.set(e.desired, e.identity);
      slugByKey.set(e.key, e.desired);
      identityByKey.set(e.key, e.identity);
      settled.add(e.key);
    }
  }

  // 3b. Everyone else, in identity order — independent of the order the file returned.
  const ordered = [...entries].sort((x, y) =>
    x.identity < y.identity ? -1 : x.identity > y.identity ? 1 : 0,
  );
  for (const e of ordered) {
    if (settled.has(e.key)) continue;

    const discriminator = e.identity.slice(e.identity.indexOf(':') + 1);
    let slug = e.desired;
    if (!free(slug, e.identity)) {
      const resolved = disambiguate(e.candidate, discriminator);
      collisions.push({ slug, name: e.animal.name, resolved });
      slug = resolved;
      // Two dogs sharing a name AND a discriminator cannot be told apart by it; the
      // counter keeps the loop finite and the outcome deterministic.
      let n = 2;
      while (!free(slug, e.identity)) {
        slug = `${resolved}-${n}`;
        n += 1;
      }
    }

    const previousSlug = assignments[e.identity];
    if (previousSlug === undefined) {
      assigned += 1;
    } else if (previousSlug !== slug) {
      recordMove(redirects, previousSlug, slug);
      taken.set(previousSlug, RETIRED);
      moved.push({ from: previousSlug, to: slug, name: e.animal.name });
    }

    assignments[e.identity] = slug;
    taken.set(slug, e.identity);
    slugByKey.set(e.key, slug);
    identityByKey.set(e.key, e.identity);
  }

  // Both passes fill the maps in the order they happen to settle dogs, and which pass
  // settles a dog depends on what the previous run left behind. Rebuilding in key order
  // makes the result identical between a first run and a repeat of it — the property the
  // incremental publish is checked against.
  const ordered_keys = [...slugByKey.keys()].sort();
  const sortedSlugs = new Map(ordered_keys.map((k) => [k, slugByKey.get(k)!]));
  const sortedIdentities = new Map(ordered_keys.map((k) => [k, identityByKey.get(k)!]));

  const live = new Set(identityByKey.values());
  const retired = Object.keys(assignments).filter((id) => !live.has(id)).length;

  return {
    slugByKey: sortedSlugs,
    identityByKey: sortedIdentities,
    state: { version: SLUG_STATE_VERSION, assignments, synthetic, redirects, nextSynthetic },
    report: { assigned, moved, collisions, withoutRegistration, retired },
  };
}

/**
 * Read the state file, or start empty when there is none.
 *
 * A first run and a lost state file look identical from here, and they are not the same
 * thing: the first is normal, the second silently re-mints every synthetic id and can move
 * URLs. The CLI says which one happened; this function only reports what it found.
 */
export function parseSlugState(json: string): SlugState {
  const raw: unknown = JSON.parse(json);
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Slug state file is not an object.');
  }
  const state = raw as Partial<SlugState>;
  if (state.version !== SLUG_STATE_VERSION) {
    throw new Error(
      `Slug state version ${String(state.version)} cannot be read by this build ` +
        `(expected ${SLUG_STATE_VERSION}). Refusing to guess: published URLs depend on it.`,
    );
  }
  return {
    version: SLUG_STATE_VERSION,
    assignments: state.assignments ?? {},
    synthetic: state.synthetic ?? {},
    redirects: state.redirects ?? {},
    nextSynthetic: state.nextSynthetic ?? 1,
  };
}

/** Serialise the state with sorted keys, so two identical runs produce identical files. */
export function serialiseSlugState(state: SlugState): string {
  const sortKeys = (o: Record<string, string>): Record<string, string> =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return `${JSON.stringify(
    {
      version: state.version,
      nextSynthetic: state.nextSynthetic,
      assignments: sortKeys(state.assignments),
      synthetic: sortKeys(state.synthetic),
      redirects: sortKeys(state.redirects),
    },
    null,
    2,
  )}\n`;
}
