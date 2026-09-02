/**
 * `npm run publish:d1` — turn the payloads into the rows D1 needs.
 *
 * The split this file implements: **R2 holds the pages, D1 holds the questions.** A dog's
 * payload is fetched by key and never searched, so it belongs in object storage; "which
 * dogs did this kennel breed", "which names start with L", "where does this old URL go"
 * are queries, so they belong in a database. Neither store holds anything the master does
 * not, so both are disposable (PRD R-8.4).
 *
 * Output is one SQL file for `wrangler d1 import`. It rebuilds the derived tables from
 * scratch inside a transaction rather than trying to compute a difference: at 62,469 rows
 * that is seconds, and a rebuild cannot leave a half-updated index behind. The payloads —
 * the part that is actually large — stay incremental, in R2, where `rclone sync` uploads
 * only the files the extract rewrote.
 *
 * Usage: tsx src/publish/exportSite.ts --payloads <dir> --state <file> --out <file>
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { DogPayload } from './payload';
import { contentHash } from './payload';
import { parseSlugState } from './slugMap';
import { suffixes, words } from './searchWords';
import { accentFreeName } from '../render/text';

interface Options {
  payloads: string;
  state: string;
  out: string;
}

function parseArgs(argv: readonly string[]): Options {
  const opts: Partial<Options> = { out: 'out/d1/seed.sql' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${arg} needs a value.`);
      i += 1;
      return v;
    };
    switch (arg) {
      case '--payloads': opts.payloads = next(); break;
      case '--state': opts.state = next(); break;
      case '--out': opts.out = next(); break;
      default: throw new Error(`Unknown option ${arg}.`);
    }
  }
  if (!opts.payloads) throw new Error('--payloads <dir> is required.');
  if (!opts.state) throw new Error('--state <file> is required.');
  return opts as Options;
}

/** Single-quote a value for SQL, or NULL. Doubling the quote is the whole escape. */
function q(value: string | null | undefined): string {
  if (value == null || value === '') return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

function payloadFiles(dir: string): string[] {
  const root = join(dir, 'dog');
  const out: string[] = [];
  for (const shard of readdirSync(root)) {
    const shardDir = join(root, shard);
    if (!statSync(shardDir).isDirectory()) continue;
    for (const f of readdirSync(shardDir)) if (f.endsWith('.json')) out.push(join(shardDir, f));
  }
  return out.sort();
}

/**
 * D1 refuses any single SQL statement longer than 100,000 bytes.
 * <https://developers.cloudflare.com/d1/platform/limits/>
 */
const D1_MAX_STATEMENT_BYTES = 100_000;

/** Two thirds of the limit, so an unusually long row cannot tip a batch over it. */
const STATEMENT_BUDGET = Math.floor((D1_MAX_STATEMENT_BYTES * 2) / 3);

/**
 * Rows are written in batches rather than one INSERT each — 62,469 single-row statements
 * is a file D1 chews through slowly for no benefit.
 *
 * Batches are sized by **bytes, not by row count**. A row count is a proxy for length, and
 * a proxy that fails exactly when the data gets interesting: 500 rows of ordinary Finnish
 * kennel names fit comfortably, 500 rows carrying long titles and registration codes do
 * not, and the failure arrives as `SQLITE_TOOBIG` from the server after the whole file has
 * been uploaded. Measuring the thing the limit actually measures costs nothing.
 */
function batched(rows: readonly string[], into: string[], prefix: string): void {
  let batch: string[] = [];
  let bytes = Buffer.byteLength(prefix);

  const flush = () => {
    if (batch.length === 0) return;
    into.push(`${prefix}\n${batch.join(',\n')};`);
    batch = [];
    bytes = Buffer.byteLength(prefix);
  };

  for (const row of rows) {
    const size = Buffer.byteLength(row) + 2; // the comma and the newline that join it
    // A single row over the budget still gets its own statement: it is the smallest
    // thing that can be sent, and splitting it is not this function's business.
    if (batch.length > 0 && bytes + size > STATEMENT_BUDGET) flush();
    batch.push(row);
    bytes += size;
  }
  flush();
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  const state = parseSlugState(
    JSON.stringify(
      (JSON.parse(readFileSync(opts.state, 'utf8')) as { slugs?: unknown }).slugs ??
        JSON.parse(readFileSync(opts.state, 'utf8')),
    ),
  );

  const dogRows: string[] = [];
  const dnaRows: string[] = [];
  /** word -> the dogs carrying it. A Set because a name may repeat a word. */
  const dogsByWord = new Map<string, Set<string>>();
  let indexed = 0;

  for (const file of payloadFiles(opts.payloads)) {
    const p = JSON.parse(readFileSync(file, 'utf8')) as DogPayload;
    const s = p.subject;
    if (p.indexed) indexed += 1;

    dogRows.push(
      '(' +
        [
          q(p.slug),
          q(p.name),
          // Folded once here, so a search is a plain comparison rather than a per-query
          // normalisation of 62,469 names (R-4.2).
          q(accentFreeName(p.name).toLowerCase()),
          q(s.sex),
          q(s.dob),
          q(s.registration),
          q(s.breeder),
          q(p.context.kennelSlug),
          q(p.context.birthYear),
          q(p.context.country),
          String(p.offspringCount),
          p.indexed ? '1' : '0',
          q(contentHash(p)),
        ].join(',') +
        ')',
    );

    for (const d of p.context.dna) {
      dnaRows.push(`(${q(p.slug)},${q(d.test)},${q(d.result)})`);
    }

    // The search index is built from the SAME folded string the `dog` row carries, so a
    // query can never match one and miss the other.
    for (const w of words(accentFreeName(p.name).toLowerCase())) {
      let slugs = dogsByWord.get(w);
      if (slugs === undefined) {
        slugs = new Set<string>();
        dogsByWord.set(w, slugs);
      }
      slugs.add(p.slug);
    }
  }

  // Sorted so a rebuilt seed is byte-identical when the catalogue has not changed — the
  // same determinism the payload hashes depend on.
  const wordList = [...dogsByWord.keys()].sort();
  const suffixRows: string[] = [];
  const wordDogRows: string[] = [];
  for (const w of wordList) {
    for (const suffix of suffixes(w)) suffixRows.push(`(${q(suffix)},${q(w)})`);
    for (const slug of [...dogsByWord.get(w)!].sort()) wordDogRows.push(`(${q(w)},${q(slug)})`);
  }

  const redirectRows = Object.entries(state.redirects).map(
    ([oldSlug, newSlug]) => `(${q(oldSlug)},${q(newSlug)})`,
  );

  const sql: string[] = [
    '-- Generated by publish:d1. Every table here is derived from the master and is',
    '-- rebuilt in full: a bad import is never data loss (PRD R-8.4).',
    'PRAGMA defer_foreign_keys = true;',
    'DELETE FROM dog;',
    'DELETE FROM dna_result;',
    'DELETE FROM redirect;',
    'DELETE FROM publish_state;',
    'DELETE FROM search_word;',
    'DELETE FROM search_word_dog;',
  ];

  batched(
    dogRows,
    sql,
    'INSERT INTO dog (slug,name,name_folded,sex,dob,registration,breeder,kennel_slug,' +
      'birth_year,country,offspring_count,indexed,hash) VALUES',
  );
  batched(dnaRows, sql, 'INSERT INTO dna_result (slug,test,result) VALUES');
  if (redirectRows.length > 0) {
    batched(redirectRows, sql, 'INSERT INTO redirect (old_slug,new_slug) VALUES');
  }
  batched(suffixRows, sql, 'INSERT INTO search_word (suffix,word) VALUES');
  batched(wordDogRows, sql, 'INSERT INTO search_word_dog (word,slug) VALUES');

  const runReport = JSON.parse(
    readFileSync(join(opts.payloads, 'run-report.json'), 'utf8'),
  ) as { sourceDigest: string };
  sql.push(
    'INSERT INTO publish_state (id,published_at,dogs,indexed,source_digest) VALUES ' +
      `(1,${q(new Date().toISOString())},${dogRows.length},${indexed},${q(runReport.sourceDigest)});`,
  );

  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, `${sql.join('\n')}\n`);

  const pad = (s: string) => s.padEnd(16);
  console.log(
    [
      pad('dogs') + dogRows.length,
      pad('indexed') + indexed,
      pad('dna results') + dnaRows.length,
      pad('redirects') + redirectRows.length,
      pad('search words') +
        `${wordList.length}  (${suffixRows.length} suffixes, ${wordDogRows.length} word/dog pairs)`,
      pad('statements') + sql.length,
      pad('seed file') + opts.out,
    ].join('\n'),
  );
}

main();
