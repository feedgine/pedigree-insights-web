/**
 * The public field whitelist — the privacy boundary of the whole project.
 *
 * PRD §7.2 requires a STRICT whitelist applied **where the extract is produced**, so that
 * a field outside it never leaves the owner's machine and no later change to the site can
 * expose it. This module is that whitelist, and it is deliberately written as an ALLOW
 * list over the agreed 74-column catalogue rather than a list of things to remove:
 * a deny list fails open — a column added to the master tomorrow would be published by
 * default — while an allow list fails closed.
 *
 * Two properties are enforced by tests, not by convention:
 *
 *   1. **Every catalogue column appears exactly once**, either published or excluded with
 *      a reason. Adding a column to `sourceFields.ts` therefore breaks the test suite
 *      until somebody records a decision about it. That is the intended friction.
 *   2. **Excluded columns are never selected.** `publishedSourceColumns()` feeds the SQL
 *      projection in `source.ts`, so `Owner` and `Microchip` are not filtered out late —
 *      they are never read out of the database at all.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { SOURCE_FIELDS, type SourceField } from '../vendor/pedigree-insights/sourceFields';

/** Why a catalogue column is not published. */
export type ExclusionReason =
  /** Names or identifies a person, or is a private identifier of an animal.
   *  PRD §7.2: the catalogue publishes facts about dogs, not about people. */
  | 'personal'
  /** A dog fact, but not part of the published page in this release. Excluding it is a
   *  product decision that can be revisited; it is not a privacy question. */
  | 'not-published'
  /** Source-format bookkeeping with no meaning outside the desktop application. */
  | 'internal';

export interface FieldDecision {
  /** Catalogue alias (`SourceField.as`). */
  readonly as: string;
  readonly reason: ExclusionReason;
  /** Why, in one sentence — read by a human, and by the whitelist report. */
  readonly note: string;
}

/**
 * The published set, by catalogue alias.
 *
 * Each entry is here because a requirement asks for it. The requirement is named so that
 * removing the requirement and removing the field stay one action, not two.
 */
export const PUBLISHED_FIELDS: ReadonlySet<string> = new Set([
  // Identity — R-2.2 subject card, R-2.3 bracket, R-6.8 first line of body text.
  'name',
  'sexRaw',
  'dob',
  'diedDate',
  'sire',
  'dam',
  'preTitle',
  'postTitle',
  'callName',
  'color',
  'breed',
  'variety',
  // Registration — R-2.2. `register` (#27) carries the registry code; `Studbook No.` (#16)
  // was emptied by the owner's import and is excluded below.
  'registration',
  'register',
  // Breeding — R-2.2 breeder (published as stored, §7.2), R-2.6 country hub.
  'breeder',
  'country',
  // Stored coefficient — R-6.4 emits `pdg:inbreedingCoefficient` where one is held.
  // `avk` is excluded below; the reason is a measurement one, not a privacy one.
  'coi',
  // DNA / genetic test block, catalogue #62–#74 — R-2.6 context strip and R-3.4 DNA hubs.
  'mh',
  'lte',
  'patella',
  'ecvo',
  'wdAtp7b',
  'samsKcnj10',
  'praRcd4C2orf71',
  'mdr2Abcb1',
  'f7',
  'curN',
  'dmdCfax',
  'h',
  'dnaCoi',
  // Photograph — R-7.1/R-7.2. Optional everywhere; the reference only, never a person.
  'photo',
]);

/**
 * Everything the catalogue holds that is NOT published, and why.
 *
 * The four names in PRD §7.2 — Owner, Microchip, Litter No., Additional Reg No. — are
 * here as `personal`. The rest are recorded so that no column is excluded by silence.
 */
export const EXCLUDED_FIELDS: readonly FieldDecision[] = [
  // ---- personal ---------------------------------------------------------------
  { as: 'owner', reason: 'personal', note: 'Names a person. Excluded by PRD §7.2.' },
  {
    as: 'microchip',
    reason: 'personal',
    note: 'Private identifier tied to a keeper record. Excluded by PRD §7.2.',
  },
  {
    as: 'litterNo',
    reason: 'personal',
    note: "Breeder's internal litter administration. Excluded by PRD §7.2.",
  },
  {
    as: 'additionalRegNo',
    reason: 'personal',
    note: 'Second registry identifier held for administration. Excluded by PRD §7.2.',
  },
  {
    as: 'tattoo',
    reason: 'personal',
    note: 'Same class as Microchip — a private identifying mark, so it follows the same rule.',
  },
  {
    as: 'surveyor',
    reason: 'personal',
    note: 'Names the person who carried out a survey.',
  },
  {
    as: 'notes',
    reason: 'personal',
    note: 'Free text. Cannot be shown to contain no personal data, so it is not extracted.',
  },
  {
    as: 'comment',
    reason: 'personal',
    note: 'Free text, as Notes — unreviewed, so not extracted.',
  },
  {
    as: 'hyperlink',
    reason: 'personal',
    note: 'May point at a private or third-party page; not reviewed, so not republished.',
  },
  ...Array.from({ length: 9 }, (_, i) => ({
    as: `userField${i + 1}`,
    reason: 'personal' as const,
    note: 'Breeder-defined free text with no agreed meaning; contents unknown, so not extracted.',
  })),
  // ---- dog facts held back from this release ----------------------------------
  {
    as: 'hipScore',
    reason: 'not-published',
    note: 'Health screening. The dog page defined in PRD §6.2 does not carry it — OI, see below.',
  },
  { as: 'elbowScore', reason: 'not-published', note: 'Health screening result, held back with the rest of the block.' },
  { as: 'ofa', reason: 'not-published', note: 'Health screening result, held back with the rest of the block.' },
  { as: 'cerf', reason: 'not-published', note: 'Health screening result, held back with the rest of the block.' },
  { as: 'genotype', reason: 'not-published', note: 'Health screening result, held back with the rest of the block.' },
  { as: 'certifications', reason: 'not-published', note: 'Health screening result, held back with the rest of the block.' },
  { as: 'eyeColour', reason: 'not-published', note: 'Health screening result, held back with the rest of the block.' },
  { as: 'bloodType', reason: 'not-published', note: 'Health screening result, held back with the rest of the block.' },
  {
    as: 'causeOfDeath',
    reason: 'not-published',
    note: 'Sensitive to the breed community and unverified; the date of death is published, the cause is not.',
  },
  {
    as: 'height',
    reason: 'not-published',
    note: 'Measurement not carried by the page defined in PRD §6.2.',
  },
  {
    as: 'points',
    reason: 'not-published',
    note: 'Show points; no meaning agreed for the public catalogue.',
  },
  {
    as: 'avk',
    reason: 'not-published',
    note:
      'Withdrawn 2026-09-02. It IS BreedMate\'s AVK, computed correctly by its own ' +
      'definition — distinct ancestors / (2^(N+1) − 2) — but that denominator is the ' +
      'THEORETICAL maximum for the generation setting, here N=10, so 2,046 positions. ' +
      'A pedigree that thins out before ten generations therefore scores low for being ' +
      'incomplete, not for being inbred: measured across 400 dogs the stored values run ' +
      'at a median of 8.0%, while the same pedigrees over their FILLED positions — the ' +
      'convention a breeder means when they say AVK should exceed 85% — give 49.6%. ' +
      'Publishing the first number under the name AVK would read as catastrophic ' +
      'inbreeding. Publish it again only when it is computed over filled positions, or ' +
      'labelled with its denominator; the algorithm is decoded in _General ' +
      'Specifications/decompiled/PedX64_native_COI_AVK_reference.md.',
  },
  {
    as: 'studbookNo',
    reason: 'not-published',
    note: "Emptied by the owner's import — the registry code lives in Register (#27).",
  },
  {
    as: 'htmlPhoto',
    reason: 'not-published',
    note: 'Alternate photo column. One photograph per dog in the MVP (PRD §6.7).',
  },
  { as: 'photo2', reason: 'not-published', note: 'Alternate photo column; the MVP shows one photograph per dog.' },
  { as: 'photo3', reason: 'not-published', note: 'Alternate photo column; the MVP shows one photograph per dog.' },
  { as: 'photo4', reason: 'not-published', note: 'Alternate photo column; the MVP shows one photograph per dog.' },
  // ---- bookkeeping -------------------------------------------------------------
  {
    as: 'gd',
    reason: 'internal',
    note: 'Source-format flag with no documented meaning.',
  },
  { as: 'imported', reason: 'internal', note: "Import bookkeeping from the owner's pipeline." },
  { as: 'publishedDate', reason: 'internal', note: 'Bookkeeping from the source application.' },
  { as: 'created', reason: 'internal', note: 'Row timestamp, not a fact about the dog.' },
  { as: 'modified', reason: 'internal', note: 'Row timestamp, not a fact about the dog.' },
  { as: 'mark1', reason: 'internal', note: 'Source-format bitmask.' },
  { as: 'mark2', reason: 'internal', note: 'Source-format bitmask.' },
  { as: 'marksBits', reason: 'internal', note: 'Source-format bitmask.' },
];

/** Lookup for the exclusion reason of an alias. */
export const EXCLUDED_BY_ALIAS: ReadonlyMap<string, FieldDecision> = new Map(
  EXCLUDED_FIELDS.map((d) => [d.as, d]),
);

/** The catalogue entries that are published, in catalogue order. */
export const PUBLISHED_CATALOGUE: readonly SourceField[] = SOURCE_FIELDS.filter((f) =>
  PUBLISHED_FIELDS.has(f.as),
);

/**
 * Every source column name that may be read from the master, in preference order per
 * field. This is what `source.ts` turns into the SQL projection: a column outside this
 * list is never named in a query, so it cannot reach memory, let alone a file.
 */
export function publishedSourceColumns(): readonly string[] {
  const out: string[] = [];
  for (const f of PUBLISHED_CATALOGUE) for (const s of f.sources) out.push(s);
  return out;
}

/**
 * Catalogue aliases that are neither published nor excluded.
 *
 * Always empty in a correct build. A new column added to `sourceFields.ts` appears here,
 * the whitelist test fails, and somebody has to decide — which is the point.
 */
export function undecidedAliases(): readonly string[] {
  return SOURCE_FIELDS.filter(
    (f) => !PUBLISHED_FIELDS.has(f.as) && !EXCLUDED_BY_ALIAS.has(f.as),
  ).map((f) => f.as);
}

/**
 * Aliases claimed by both lists. Always empty; a contradiction here would mean the SQL
 * projection and the publishing decision disagree, so it is checked rather than assumed.
 */
export function contradictoryAliases(): readonly string[] {
  return [...PUBLISHED_FIELDS].filter((a) => EXCLUDED_BY_ALIAS.has(a));
}
