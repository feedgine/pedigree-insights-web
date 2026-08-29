/**
 * The page payload — everything one dog page needs, computed once.
 *
 * PRD §8.3 and the working contract both say the same thing from different ends: never
 * traverse a pedigree at request time. Serving a page must be one indexed read and a
 * template. So the traversal, the offspring grouping, the sibling sets and the context
 * links all happen here, in the publish, and the result is a single row.
 *
 * Two details are worth knowing before reading the code.
 *
 * **The bracket keeps the names of ancestors that have no record.** PRD R-2.3 draws a
 * sharp line: an ancestor with a record of its own is a link, an ancestor known only as a
 * name on a parent's record is plain text, and there is no third case. The vendored
 * `buildPedigreeTree` resolves ancestors to `Animal | null` and so cannot tell "no parent
 * recorded" from "a parent named but not held" — both arrive as null. That is exactly the
 * distinction the page is built on, so the walk here keeps the name string. It is not a
 * second pedigree algorithm: no genetics, no counting, no de-duplication semantics. It is
 * a chart walk, depth-limited and cycle-guarded like the original.
 *
 * **The payload is hashed, so it must be deterministic.** Same database, same payload,
 * byte for byte — otherwise the incremental publish (PRD R-8.2) degrades into a full one.
 * Every list is sorted, every map is serialised with sorted keys, and nothing carries a
 * timestamp or a run id.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { createHash } from 'node:crypto';

import { BRACKET_GENERATIONS } from './constants';

import type { Animal } from '../vendor/pedigree-insights/schema';
import { DNA_TEST_FIELDS, fieldText } from '../vendor/pedigree-insights/sourceFields';
import type { RelationsIndex } from './relations';
import { indexKey } from './key';

export { BRACKET_GENERATIONS };
import { slugify } from './slug';


/** A link to another dog, or a name with no page behind it. */
export interface DogRef {
  readonly name: string;
  /** null when this dog has no record of its own — render as plain text (R-2.3). */
  readonly slug: string | null;
  readonly dob?: string;
  readonly sex?: 'M' | 'F';
}

/** One box of the pedigree chart. Empty boxes are not emitted at all. */
export interface BracketNode {
  /** Path id: '0' is the subject, then '.S' for sire and '.D' for dam. */
  readonly id: string;
  readonly generation: number;
  readonly name: string;
  /** null when the ancestor is a name on a parent's record and nothing more. */
  readonly slug: string | null;
  readonly preTitle?: string;
  readonly postTitle?: string;
  /** Registration and date of birth: the desktop bracket shows full information in every
   *  cell, including the deepest generation, and the web bracket matches it. */
  readonly registration?: string;
  readonly dob?: string;
  /** True when this box repeats an ancestor already on the path — a true ancestry loop. */
  readonly loop?: true;
}

export interface DnaResult {
  readonly test: string;
  readonly result: string;
}

export interface DogPayload {
  readonly slug: string;
  readonly name: string;
  readonly subject: {
    readonly preTitle?: string;
    readonly postTitle?: string;
    readonly callName?: string;
    readonly sex?: 'M' | 'F';
    readonly dob?: string;
    readonly died?: string;
    readonly registration?: string;
    readonly register?: string;
    readonly breed?: string;
    readonly variety?: string;
    readonly colour?: string;
    readonly breeder?: string;
    readonly country?: string;
    readonly photo?: string;
    /** Stored COI, a fraction in [0,1] — see the scale note in the vendored schema. */
    readonly coi?: number;
    /** Stored AVK, already a percentage in [0,100]. Never multiplied again. */
    readonly avk?: number;
  };
  readonly sire: DogRef | null;
  readonly dam: DogRef | null;
  readonly bracket: readonly BracketNode[];
  readonly offspring: readonly {
    readonly mate: string | null;
    readonly mateSlug: string | null;
    readonly dogs: readonly DogRef[];
  }[];
  /**
   * Siblings sharing BOTH parents. Half siblings are out of scope entirely (owner
   * decision, 2026-08-28): they were 528 MB of an 860 MB extract, because a sire with N
   * offspring puts N-1 half siblings on each of N pages. A visitor who wants the rest of
   * a sire's get opens the sire's page, where the offspring list already is.
   */
  readonly fullSiblings: readonly DogRef[];
  readonly context: {
    /** The kennel is the Breeder field as stored (PRD §7.2), not a guess from the name. */
    readonly kennel?: string;
    readonly kennelSlug?: string;
    readonly birthYear?: string;
    readonly country?: string;
    readonly dna: readonly DnaResult[];
  };
  readonly offspringCount: number;
  /** Whether this page is offered to search engines (PRD R-1.2). Publication is separate. */
  readonly indexed: boolean;
}

/**
 * Trimmed text, or undefined — so "absent" is one check and the JSON stays small.
 *
 * Takes `unknown` rather than `string | null` on purpose. `source.ts` coerces every
 * non-numeric column to text, because SQLite returns a number for `Registration` when the
 * value was written as one; this is the second door, so a value that ever arrives from
 * somewhere else cannot crash a publish over a type.
 */
function text(value: unknown): string | undefined {
  if (value == null) return undefined;
  const s = String(value).trim();
  return s === '' ? undefined : s;
}

/** The four-digit year of a stored date, or undefined. Text only, no timezone maths. */
function birthYear(dob: unknown): string | undefined {
  const m = text(dob)?.match(/^(\d{4})/);
  return m ? m[1] : undefined;
}

/** Drop `undefined` members so an absent field costs nothing in the stored row. */
function compact<T extends Record<string, unknown>>(o: T): T {
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}

/** Context needed to turn an animal into a payload. */
export interface PayloadContext {
  readonly lookup: (name: string) => Animal | null;
  readonly slugByKey: ReadonlyMap<string, string>;
  readonly relations: RelationsIndex;
  /** Decides whether a page is offered to search engines (PRD R-1.2). */
  readonly isIndexed: (animal: Animal) => boolean;
}

/** The slug of a dog that has a record, or null when it is a bare name. */
function slugOf(ctx: PayloadContext, name: string | null | undefined): string | null {
  const key = indexKey(name);
  if (key == null) return null;
  return ctx.slugByKey.get(key) ?? null;
}

/** A reference to a dog we hold, or to a name we do not. */
function refFor(ctx: PayloadContext, animal: Animal): DogRef {
  return compact({
    name: animal.name,
    slug: slugOf(ctx, animal.name),
    dob: text(animal.dob),
    sex: animal.sex ?? undefined,
  }) as DogRef;
}

/** A parent reference: a link where the parent has a record, plain text where it does not. */
function parentRef(ctx: PayloadContext, name: string | null | undefined): DogRef | null {
  const n = text(name);
  if (n === undefined) return null;
  const held = ctx.lookup(n);
  return held ? refFor(ctx, held) : { name: n, slug: null };
}

/**
 * Walk the ancestors into a flat list of chart boxes.
 *
 * Flat, not nested, for two reasons: the row is smaller, and a template can render the
 * chart by looking boxes up by id without walking a tree. Boxes with nothing in them are
 * not emitted — an unrecorded parent is an absence, and PRD R-2.9 says absences are
 * silent.
 *
 * Both stop conditions the working contract requires are present and independent: the
 * finite `generations` cap, and `onPath`, which halts a dog that appears within its own
 * ancestry. The looping box is emitted and marked, not dropped, because a visitor looking
 * at a chart that stops early deserves to see why.
 */
export function buildBracket(
  ctx: PayloadContext,
  subject: Animal,
  generations: number = BRACKET_GENERATIONS,
): BracketNode[] {
  const nodes: BracketNode[] = [];
  const onPath = new Set<string>();

  function walk(name: string | null | undefined, generation: number, id: string): void {
    const n = text(name);
    if (n === undefined) return;

    const held = ctx.lookup(n);
    const key = indexKey(n);
    const loop = key != null && onPath.has(key);

    nodes.push(
      compact({
        id,
        generation,
        name: held?.name ?? n,
        slug: held ? slugOf(ctx, n) : null,
        preTitle: text(held?.preTitle),
        postTitle: text(held?.postTitle),
        registration: text(held?.registration),
        dob: text(held?.dob),
        loop: loop ? (true as const) : undefined,
      }) as BracketNode,
    );

    if (held == null || loop || generation >= generations) return;
    if (key != null) onPath.add(key);
    walk(held.sire, generation + 1, `${id}.S`);
    walk(held.dam, generation + 1, `${id}.D`);
    if (key != null) onPath.delete(key);
  }

  walk(subject.name, 0, '0');
  return nodes;
}

/** The DNA test results a dog actually has, in catalogue order, shown verbatim. */
function dnaResults(animal: Animal): DnaResult[] {
  const out: DnaResult[] = [];
  for (const f of DNA_TEST_FIELDS) {
    const value = fieldText(animal, f);
    if (value !== null) out.push({ test: f.label, result: value });
  }
  return out;
}

/** Build the complete page payload for one dog. */
export function buildPayload(ctx: PayloadContext, animal: Animal): DogPayload {
  const key = indexKey(animal.name);
  if (key == null) throw new Error('Cannot build a payload for a dog with no name.');
  const slug = ctx.slugByKey.get(key);
  if (slug === undefined) {
    throw new Error(`No slug assigned for ${JSON.stringify(animal.name)}.`);
  }

  const fullSiblings = ctx.relations.fullSiblingsOf(animal);
  const kennel = text(animal.breeder);

  return {
    slug,
    name: animal.name,
    subject: compact({
      preTitle: text(animal.preTitle),
      postTitle: text(animal.postTitle),
      callName: text(animal.callName),
      sex: animal.sex ?? undefined,
      dob: text(animal.dob),
      died: text(animal.diedDate),
      registration: text(animal.registration),
      register: text(animal.fields?.['register'] as string | undefined),
      breed: text(animal.breed),
      variety: text(animal.fields?.['variety'] as string | undefined),
      colour: text(animal.color),
      breeder: kennel,
      country: text(animal.country),
      photo: text(animal.photo),
      coi: animal.coi ?? undefined,
      avk: animal.avk ?? undefined,
    }),
    sire: parentRef(ctx, animal.sire),
    dam: parentRef(ctx, animal.dam),
    bracket: buildBracket(ctx, animal),
    offspring: ctx.relations.offspringByMate(animal).map((g) => ({
      mate: g.mate,
      mateSlug: g.mateHasRecord ? slugOf(ctx, g.mate) : null,
      dogs: g.offspring.map((o) => refFor(ctx, o)),
    })),
    fullSiblings: fullSiblings.map((s) => refFor(ctx, s)),
    context: compact({
      kennel,
      kennelSlug: kennel === undefined ? undefined : (slugify(kennel) ?? undefined),
      birthYear: birthYear(animal.dob),
      country: text(animal.country),
      dna: dnaResults(animal),
    }) as DogPayload['context'],
    offspringCount: ctx.relations.offspringCount(key),
    indexed: ctx.isIndexed(animal),
  };
}

/**
 * JSON with object keys in a fixed order.
 *
 * `JSON.stringify` preserves insertion order, which depends on the order the code happened
 * to build an object in. That is fine for a file and fatal for a hash: a harmless
 * refactor would rewrite 62,475 rows. Sorting the keys makes the hash a function of the
 * content and nothing else.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/**
 * The content hash of a payload — the whole basis of an incremental publish (PRD R-8.2).
 *
 * It covers everything a visitor would see, which means a dog changes when its own record
 * changes AND when a relative's does: a new puppy changes the parents' pages, a corrected
 * ancestor name changes every descendant's bracket. That breadth is deliberate. A hash
 * over the dog's own row alone would be cheaper to compute and would quietly serve stale
 * pedigrees.
 */
export function contentHash(payload: DogPayload): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex').slice(0, 32);
}
