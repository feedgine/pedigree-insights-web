/**
 * `npm run publish:extract` — the one command PRD R-8.5 asks for.
 *
 * It reads the master, applies the whitelist, walks every pedigree once, and writes one
 * payload per dog plus the state the next run needs. It is safe to re-run: the same
 * database produces the same output, and a second run reports zero changes.
 *
 * Usage:
 *   tsx src/publish/index.ts --source <master.db> --out <dir> [options]
 *
 *   --state <file>   slug assignments and payload hashes; default ./publish-state/state.json
 *   --rule <name>    index rule: `mvp` (default) or `producers` — see indexRule.ts
 *   --dry-run        compute and report, write nothing
 *
 * **The state file is not a cache.** It holds the URL every dog was published under. Lose
 * it and the next run re-mints synthetic ids and can move URLs that are already in search
 * results — the one thing PRD R-5.2 forbids. It belongs in the backed-up part of the
 * owner's machine, beside the master, not in a build directory somebody might clear.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { payloadKey } from './constants';
import { fileDigest, loadPopulation } from './source';
import { buildRelations } from './relations';
import { producers, producersWithCompletePedigree } from './indexRule';
import { buildPayload, contentHash, stableStringify, type DogPayload } from './payload';
import {
  assignSlugs,
  emptySlugState,
  parseSlugState,
  serialiseSlugState,
  type SlugState,
} from './slugMap';

interface Options {
  source: string;
  out: string;
  state: string;
  rule: 'mvp' | 'producers';
  dryRun: boolean;
}

/** Payload hashes from the previous run: slug → hash. Absent on the first run. */
type Manifest = Record<string, string>;

function parseArgs(argv: readonly string[]): Options {
  const opts: Partial<Options> = { rule: 'mvp', dryRun: false, state: 'publish-state/state.json' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${arg} needs a value.`);
      i += 1;
      return v;
    };
    switch (arg) {
      case '--source':
        opts.source = next();
        break;
      case '--out':
        opts.out = next();
        break;
      case '--state':
        opts.state = next();
        break;
      case '--rule': {
        const v = next();
        if (v !== 'mvp' && v !== 'producers') throw new Error(`Unknown --rule ${v}.`);
        opts.rule = v;
        break;
      }
      case '--dry-run':
        opts.dryRun = true;
        break;
      default:
        throw new Error(`Unknown option ${arg}.`);
    }
  }
  if (!opts.source) throw new Error('--source <master.db> is required.');
  if (!opts.out) throw new Error('--out <dir> is required.');
  return opts as Options;
}

/** Read a JSON file, or return the fallback when it is not there. */
function readJson<T>(file: string, fallback: T, parse: (raw: string) => T): T {
  try {
    return parse(readFileSync(file, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

/** Where one dog's payload lives on disk — the same relative path it takes in R2. */
function payloadPath(out: string, slug: string): string {
  return join(out, payloadKey(slug));
}

function writeFile(file: string, contents: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

interface RunReport {
  readonly source: string;
  readonly sourceDigest: string;
  readonly dogs: number;
  readonly rows: number;
  readonly duplicates: readonly string[];
  readonly missingOptionalColumns: readonly string[];
  readonly indexRule: string;
  readonly indexed: number;
  readonly written: number;
  readonly unchanged: number;
  /** Payloads the state believed were written but which were missing from `--out`. */
  readonly restored: number;
  readonly removed: readonly string[];
  readonly slugsAssigned: number;
  readonly slugsMoved: readonly { from: string; to: string; name: string }[];
  readonly slugCollisions: number;
  readonly withoutRegistration: number;
  readonly retiredSlugs: number;
  readonly firstRun: boolean;
  readonly largestPayloadBytes: number;
  readonly totalPayloadBytes: number;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  // Checked before anything else touches it. The path to the master has spaces and
  // parentheses in it, so a wrong `--source` is the first thing anyone following the
  // runbook hits, and a bare ENOENT does not say which of the three paths was wrong.
  if (!existsSync(opts.source)) {
    throw new Error(
      `--source: no file at ${opts.source}\n` +
        'Check the path, and keep it in double quotes — spaces and parentheses would ' +
        'otherwise be split into separate arguments.',
    );
  }

  const digestBefore = await fileDigest(opts.source);

  const population = loadPopulation(opts.source);
  const relations = buildRelations(population.animals);

  const statePath = opts.state;
  const previousState = readJson<SlugState>(statePath, emptySlugState(), (raw) => {
    const parsed: unknown = JSON.parse(raw);
    const wrapper = parsed as { slugs?: unknown; manifest?: unknown };
    return parseSlugState(JSON.stringify(wrapper.slugs ?? parsed));
  });
  const previousManifest = readJson<Manifest>(statePath, {}, (raw) => {
    const parsed = JSON.parse(raw) as { manifest?: Manifest };
    return parsed.manifest ?? {};
  });
  const firstRun = Object.keys(previousState.assignments).length === 0;

  const { slugByKey, state, report: slugReport } = assignSlugs(population.animals, previousState);

  const rule =
    opts.rule === 'producers'
      ? producers(relations)
      : producersWithCompletePedigree(population.byKey, relations);

  const ctx = {
    lookup: population.lookup,
    slugByKey,
    relations,
    isIndexed: rule.isIndexed.bind(rule),
  };

  const manifest: Manifest = {};
  let written = 0;
  let unchanged = 0;
  let restored = 0;
  let indexed = 0;
  let largestPayloadBytes = 0;
  let totalPayloadBytes = 0;

  for (const animal of population.animals) {
    const payload: DogPayload = buildPayload(ctx, animal);
    const json = `${stableStringify(payload)}\n`;
    const hash = contentHash(payload);
    manifest[payload.slug] = hash;
    if (payload.indexed) indexed += 1;

    const bytes = Buffer.byteLength(json);
    totalPayloadBytes += bytes;
    if (bytes > largestPayloadBytes) largestPayloadBytes = bytes;

    // The manifest is a claim about the output directory, so it is checked against it.
    // Without this, clearing `--out` while keeping `--state` would produce a quietly
    // incomplete publish: the state says "already written", the file is not there, and
    // nothing notices. Roughly 62,000 stat calls — a few hundred milliseconds against a
    // run measured in minutes, for a failure mode that is invisible.
    const file = payloadPath(opts.out, payload.slug);
    if (previousManifest[payload.slug] === hash) {
      if (opts.dryRun || existsSync(file)) {
        unchanged += 1;
        continue;
      }
      restored += 1;
    }
    written += 1;
    if (!opts.dryRun) writeFile(file, json);
  }

  // A dog that left the file takes its page with it; its URL keeps working through the
  // redirect table, which is why the slug is retired rather than freed.
  const removed = Object.keys(previousManifest).filter((slug) => manifest[slug] === undefined);
  if (!opts.dryRun) {
    for (const slug of removed) {
      try {
        rmSync(payloadPath(opts.out, slug));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    }
  }

  const digestAfter = await fileDigest(opts.source);
  if (digestAfter !== digestBefore) {
    throw new Error(
      'The master database changed during the run. PRD R-8.3 requires it to be untouched; ' +
        'stopping so nothing is published from a moving file.',
    );
  }

  const runReport: RunReport = {
    source: opts.source,
    sourceDigest: digestBefore,
    dogs: population.animals.length,
    rows: population.rowCount,
    duplicates: population.duplicates,
    missingOptionalColumns: population.missingOptionalColumns,
    indexRule: rule.name,
    indexed,
    written,
    unchanged,
    restored,
    removed,
    slugsAssigned: slugReport.assigned,
    slugsMoved: slugReport.moved,
    slugCollisions: slugReport.collisions.length,
    withoutRegistration: slugReport.withoutRegistration,
    retiredSlugs: slugReport.retired,
    firstRun,
    largestPayloadBytes,
    totalPayloadBytes,
  };

  if (!opts.dryRun) {
    writeFile(
      statePath,
      `${JSON.stringify({ slugs: JSON.parse(serialiseSlugState(state)), manifest }, null, 2)}\n`,
    );
    writeFile(join(opts.out, 'redirects.json'), `${JSON.stringify(state.redirects, null, 2)}\n`);
    writeFile(join(opts.out, 'run-report.json'), `${JSON.stringify(runReport, null, 2)}\n`);
  }

  const pct = (n: number) => `${((n / Math.max(1, runReport.dogs)) * 100).toFixed(1)}%`;
  const lines = [
    `source            ${opts.source}`,
    `                  sha-256 ${digestBefore.slice(0, 16)}… unchanged after the run`,
    `dogs              ${runReport.dogs}  (rows read: ${runReport.rows})`,
    `index rule        ${rule.name}`,
    `indexed           ${indexed}  ${pct(indexed)}`,
    `payloads written  ${written}   unchanged ${unchanged}   removed ${removed.length}`,
    `payload size      largest ${largestPayloadBytes} B, total ${(totalPayloadBytes / 1e6).toFixed(1)} MB`,
    `slugs             ${slugReport.assigned} new, ${slugReport.moved.length} moved, ` +
      `${slugReport.collisions.length} collisions, ${slugReport.retired} retired`,
    `no registration   ${slugReport.withoutRegistration}  (cannot be followed through a rename)`,
  ];
  if (restored > 0) {
    lines.push(
      `restored          ${restored} payload(s) the state believed were written were missing ` +
        'from the output directory',
    );
  }
  if (firstRun) lines.push('first run         no previous state was found — every URL is new');
  if (population.duplicates.length > 0) {
    lines.push(`DUPLICATE NAMES   ${population.duplicates.length}: first row wins, the rest are skipped`);
  }
  if (population.missingOptionalColumns.length > 0) {
    lines.push(`absent columns    ${population.missingOptionalColumns.join(', ')}`);
  }
  if (opts.dryRun) lines.push('dry run           nothing was written');
  console.log(lines.join('\n'));
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
