/**
 * `npm run render:site` — turn payloads into static HTML.
 *
 * Only the **indexed** tier is written as static files by default, and that is an
 * architectural limit rather than a preference: Cloudflare Pages allows 20,000 files on the
 * free plan, and there are 62,467 dogs. The indexed 3,449 are static; every other dog is
 * published too, but served from D1 by a Function using these same templates. One renderer,
 * two delivery paths — which is why nothing in `dogPage.ts` knows where its payload came
 * from.
 *
 * Usage:
 *   tsx src/render/build.ts --payloads <dir> --out <dir> [options]
 *
 *   --include indexed|all   which tier to write (default: indexed)
 *   --limit <n>            stop after n pages — for looking at a few locally
 *   --only <slug>          render one dog, by slug
 *   --clean                delete the output's dog pages first
 *
 * **Why `--clean` exists.** The build overwrites what it writes and never removes what it
 * does not, so switching from `--include all` to `--include indexed` leaves tens of
 * thousands of stale pages behind — rendered by an older template, still served, and
 * invisible in the run report. Deleting `--out` by hand is the same fix, but only if you
 * are standing in the right directory when you do it.
 *
 * @author Yuliya Malinina <julia.malinina@gmail.com>
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import type { DogPayload } from '../publish/payload';
import { renderDogPage } from './dogPage';
import { llmsTxt, renderHome, renderNotFound, robotsTxt, routesJson, sitemapXml } from './home';
import { SITE_CSS } from './styles';
import { headersFile } from './headers';

interface Options {
  payloads: string;
  out: string;
  include: 'indexed' | 'all';
  limit: number;
  only: string | null;
  clean: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const opts: Options = {
    payloads: '',
    out: '',
    include: 'indexed',
    limit: Number.POSITIVE_INFINITY,
    only: null,
    clean: false,
  };
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
      case '--out': opts.out = next(); break;
      case '--include': {
        const v = next();
        if (v !== 'indexed' && v !== 'all') throw new Error(`--include takes indexed or all, not ${v}.`);
        opts.include = v;
        break;
      }
      case '--limit': opts.limit = Number(next()); break;
      case '--only': opts.only = next(); break;
      case '--clean': opts.clean = true; break;
      default: throw new Error(`Unknown option ${arg}.`);
    }
  }
  if (!opts.payloads) throw new Error('--payloads <dir> is required (the publish --out directory).');
  if (!opts.out) throw new Error('--out <dir> is required.');
  return opts;
}

function writeFile(file: string, contents: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

/** Every payload file under `<dir>/dog/<shard>/`. */
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
 * Every slug this publish contains — the set a page is allowed to link to.
 *
 * Computed before anything is rendered, because a page has to know what exists before it
 * can decide what to link to. `--limit` and `--only` therefore still produce pages that
 * link the way the finished site links, rather than pages where everything is text
 * because only one dog was written.
 *
 * It deliberately does NOT apply the include filter. That filter decides which pages this
 * run writes as **files**; it says nothing about which dogs have a **page**. R-1.1 says
 * every dog has one: the indexed tier as files, the remainder rendered from R2 by
 * `functions/dog/[slug].ts`, which passes `() => true` for exactly this reason.
 *
 * Applying the filter here was a bug, and a quiet one. On a static page an indexed dog's
 * unindexed ancestors came out as plain text, while the very same ancestors linked
 * normally on any dynamic page — one renderer giving two answers for one dog, which is
 * the drift the shared template exists to prevent. It also removed the only `follow` path
 * a crawler had into the unindexed tier, which `noindex, follow` explicitly asks for.
 *
 * What is left is the honest question: is this dog part of this publish? A partial `out/`
 * still yields pages that link only to payloads that are really there.
 */
function publishedSlugs(files: readonly string[]): Set<string> {
  const slugs = new Set<string>();
  for (const file of files) {
    const payload = JSON.parse(readFileSync(file, 'utf8')) as DogPayload;
    slugs.add(payload.slug);
  }
  return slugs;
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));

  // Clearing before writing, not after: a page removed from the indexed set has no
  // record anywhere afterwards saying it should go. `--only` never cleans — it is the
  // flag for looking at one dog, not for rebuilding a site.
  if (opts.clean && opts.only == null) {
    const dogs = join(opts.out, 'dog');
    if (existsSync(dogs)) rmSync(dogs, { recursive: true });
  }

  // Anything checked into `assets/` ships as-is: images and the like, kept in the repo
  // because they are part of the site rather than derived from the master.
  if (existsSync('assets')) {
    for (const name of readdirSync('assets')) {
      const from = join('assets', name);
      if (!statSync(from).isFile()) continue;
      const to = join(opts.out, 'assets', name);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
    }
  }

  // `/favicon.ico` at the root as well as under `assets/`. The `<link>` tags cover
  // browsers, but that exact path is fetched unprompted by clients that never read the
  // page — and an icon a crawler cannot find is an icon Google will not print beside
  // the result.
  const rootIcon = join('assets', 'favicon.ico');
  if (existsSync(rootIcon)) copyFileSync(rootIcon, join(opts.out, 'favicon.ico'));

  // One stylesheet for the whole site, written once. Pages link to it rather than
  // carrying it, so a design change is one file and not 3,449.
  writeFile(join(opts.out, 'assets', 'site.css'), SITE_CSS);

  // ONE clock reading for the whole run, taken before a single page is rendered, and
  // threaded into every renderer that states it. Two dates from two `new Date()` calls in
  // the same build is how the footer and the sitemap came to disagree by a day.
  const publishedAt = new Date().toISOString();
  const publishedDay = publishedAt.slice(0, 10);

  // Written as a source file so the Functions bundle carries the same value the static
  // pages do. Written here, before the pages, because it is committed and read at import
  // time: a page rendered by this run must not be stamped from the file this run is about
  // to overwrite. The Worker imports the constant and is right to — by the time a deploy
  // exists, this file holds the date of the render that produced it.
  writeFile(
    'src/generated/published.ts',
    [
      '/**',
      ' * When the catalogue was last published. **Generated — do not edit by hand.**',
      ' *',
      ' * Written by `npm run render:site` on every build, and committed, for two reasons.',
      ' * The footer states it on every page, which answers the question a contributor asks',
      ' * first — "I sent a correction, why is it not here?" — before they have to ask it.',
      ' * And the dynamic tier needs the same value as the static tier: baking it into the',
      ' * Functions bundle at build time costs nothing at request time, where reading it',
      ' * from D1 would be an extra query on every page view of 59,010 dogs.',
      ' *',
      ' * Committed rather than git-ignored so a fresh clone typechecks, and so the history',
      ' * carries a record of when each publish actually happened.',
      ' */',
      `export const PUBLISHED_AT = '${publishedDay}';`,
      '',
    ].join('\n'),
  );

  /** Every page this run produced, so the build says what it built. */
  const pages: string[] = [];
  const files = payloadFiles(opts.payloads);
  const present = publishedSlugs(files);
  const hasPage = (slug: string) => present.has(slug);

  /** Every indexed slug, whether or not this run wrote its file — the sitemap describes
   *  the site, not the run. */
  const indexedSlugs: string[] = [];
  let indexedCount = 0;
  let seen = 0;
  let written = 0;
  let skipped = 0;
  let largest = 0;
  let total = 0;

  for (const file of files) {
    if (written >= opts.limit) break;
    const payload = JSON.parse(readFileSync(file, 'utf8')) as DogPayload;
    seen += 1;

    if (payload.indexed) {
      indexedCount += 1;
      indexedSlugs.push(payload.slug);
    }

    if (opts.only != null && payload.slug !== opts.only) continue;
    if (opts.only == null && opts.include === 'indexed' && !payload.indexed) {
      skipped += 1;
      continue;
    }

    const html = renderDogPage(payload, undefined, hasPage, publishedDay);
    // `/dog/<slug>/index.html` rather than `/dog/<slug>.html`: the canonical URL has no
    // extension, and this is the shape that serves it without a redirect.
    writeFile(join(opts.out, 'dog', payload.slug, 'index.html'), html);
    pages.push(`/dog/${payload.slug}/\t${payload.name}`);
    written += 1;
    const bytes = Buffer.byteLength(html);
    total += bytes;
    if (bytes > largest) largest = bytes;
  }

  // A plain list of what was built: paste a path after localhost to open it.
  writeFile(join(opts.out, 'pages.txt'), `${pages.sort().join('\n')}\n`);

  // The site's furniture. Written by the build rather than kept as checked-in files,
  // because every one of them states a number or a date the build is the only thing that
  // knows: how many dogs there are, how many are indexed, when the publish ran.
  const stats = {
    dogs: seen,
    indexed: indexedCount,
    publishedAt,
  };
  writeFile(join(opts.out, 'index.html'), renderHome(stats));
  // Not optional: without it Pages answers a missing asset with the home page at status
  // 200, and the Function that serves the dynamic tier cannot tell a miss from a hit.
  writeFile(join(opts.out, '404.html'), renderNotFound(undefined, publishedDay));
  writeFile(join(opts.out, 'robots.txt'), robotsTxt());
  writeFile(join(opts.out, 'llms.txt'), llmsTxt(stats));
  writeFile(join(opts.out, '_routes.json'), routesJson());
  // Static responses only — the Functions set the same headers themselves, because
  // Cloudflare Pages does not apply this file to them. See `headers.ts`.
  writeFile(join(opts.out, '_headers'), headersFile());
  // The sitemap lists the indexed set only — the distinction the whole index rule exists
  // to draw (R-1.2, R-6.1).
  writeFile(join(opts.out, 'sitemap.xml'), sitemapXml(indexedSlugs.sort(), stats.publishedAt));

  const pad = (s: string) => s.padEnd(18);
  console.log(
    [
      pad('payloads read') + seen,
      pad('pages written') + written + (opts.include === 'indexed' ? '  (indexed tier)' : ''),
      pad('not indexed') + skipped + '  served from D1, not written as files',
      pad('page size') +
        `largest ${largest} B, total ${(total / 1e6).toFixed(1)} MB`,
      pad('files') + (written + 1) + '  of the 20,000 Cloudflare Pages allows',
      pad('linkable pages') + present.size + '  links to any other dog render as plain text',
      pad('sitemap') + indexedSlugs.length + '  indexed URLs listed',
      pad('list of pages') + join(opts.out, 'pages.txt'),
      opts.clean ? pad('cleaned') + 'previous pages removed before writing' : '',
      pad('output') + opts.out,
    ].filter(Boolean).join('\n'),
  );
}

main();
