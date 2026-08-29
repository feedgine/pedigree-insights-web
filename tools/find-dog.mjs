#!/usr/bin/env node
/**
 * Find a dog's slug by name.
 *
 * The slug is usually predictable — lower-case, accents stripped, hyphens — but not
 * always: a name that collides with another after transliteration, or a dog with no
 * registration, gets a discriminator appended. Guessing is right nearly every time, which
 * is exactly what makes guessing a bad habit here. This reads what was actually assigned.
 *
 * Matching ignores case and accents in BOTH directions, so `lumivyoryn` finds
 * LUMIVYÖRYN and vice versa (the same rule the site's own search uses, PRD R-4.2).
 *
 * Usage: node tools/find-dog.mjs <out-dir> <name fragment> [--limit 20]
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [dir, ...rest] = process.argv.slice(2);
const limitFlag = rest.indexOf('--limit');
const limit = limitFlag === -1 ? 20 : Number(rest[limitFlag + 1]) || 20;
const query = (limitFlag === -1 ? rest : rest.slice(0, limitFlag)).join(' ');

if (!dir || !query) {
  console.error('Usage: node tools/find-dog.mjs <out-dir> <name fragment> [--limit 20]');
  process.exit(1);
}

/** Fold accents and case, so a search types the way people actually type. */
const fold = (s) =>
  s.normalize('NFC').toLowerCase()
    .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ß/g, 'ss').replace(/ł/g, 'l')
    .normalize('NFD').replace(/\p{M}+/gu, '');

const needle = fold(query);
const root = join(dir, 'dog');
const hits = [];

for (const shard of readdirSync(root)) {
  const shardDir = join(root, shard);
  if (!statSync(shardDir).isDirectory()) continue;
  for (const f of readdirSync(shardDir)) {
    if (!f.endsWith('.json')) continue;
    const p = JSON.parse(readFileSync(join(shardDir, f), 'utf8'));
    if (fold(p.name).includes(needle)) {
      hits.push({
        name: p.name,
        slug: p.slug,
        born: p.subject?.dob?.slice(0, 10) ?? '',
        reg: p.subject?.registration ?? '',
        indexed: p.indexed,
        offspring: p.offspringCount,
        // How deep this dog's recorded pedigree actually goes. The bracket draws four
        // ancestor generations when they exist; a shallow chart is usually the data
        // saying so, not the page failing to draw it.
        depth: Math.max(0, ...(p.bracket ?? []).map((n) => n.generation)),
      });
    }
  }
}

hits.sort((a, b) => a.name.localeCompare(b.name, 'en'));
console.log(`${hits.length} match${hits.length === 1 ? '' : 'es'} for "${query}"\n`);
for (const h of hits.slice(0, limit)) {
  console.log(
    `  ${h.name}\n` +
    `    /dog/${h.slug}\n` +
    `    ${[h.born, h.reg, `pedigree ${h.depth} gen`, h.offspring ? `${h.offspring} offspring` : '',
       h.indexed ? 'indexed' : 'not indexed']
      .filter(Boolean).join('  ·  ')}\n`,
  );
}
if (hits.length > limit) console.log(`  … ${hits.length - limit} more (use --limit)`);
