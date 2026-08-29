# The publish pipeline

How the extract works, and the handful of things about it that are not obvious from the
code. Requirements live in the PRD; this file is the companion document — the *how*.

## The one command

```
npm run publish:extract -- --source <master.db> --out <dir> [--state <file>] [--rule mvp|producers] [--dry-run]
```

It reads the master, applies the whitelist, walks every pedigree once, and writes one
JSON payload per dog under `<out>/dog/<shard>/<slug>.json`, plus `redirects.json` and
`run-report.json`. Nothing else is touched. Re-running it against an unchanged database
writes nothing and says so.

## The state file is not a cache

`--state` (default `publish-state/state.json`) holds the URL every dog has been published
under: the slug assignments, the synthetic ids for dogs with no registration, the redirect
table, and the payload hash per dog.

**Keep it beside the master, in backed-up storage.** Lose it and the next run re-mints the
synthetic ids and can move URLs that are already in search results — the one outcome
PRD R-5.2 forbids. It is deliberately git-ignored: it is derived from the database and
lists every dog, so it is not source code and does not belong in the repository.

The run report says `first run — no previous state was found` when it starts from nothing.
On any run but the first, that line means the state file was lost.

## Identity, and why the URL survives a rename

`Name` is the source's primary key, so correcting a typo changes the name — and would
change the URL, with nothing left to redirect from. Slugs are therefore keyed by a stable
identity: the **registration code** where a dog has one, and a **synthetic id assigned
once** where it does not.

- A rename with a registration: the canonical URL follows the new name and the old slug
  301s to it. Chains are collapsed, so a dog renamed twice leaves two redirects pointing
  at the current URL, never a hop through the middle one.
- A rename without a registration: **not recognisable.** Nothing in the file connects the
  two records, so the dog gets a new identity and a new URL, and the old URL keeps
  belonging to the record it was published for. The run report counts these dogs
  (`no registration`) rather than hiding the limit behind a guess.
- A slug is never reissued. When a dog leaves the file its URL is retired, so a different
  dog with the same name cannot inherit its search results.

## Incremental publishing

Each payload carries a content hash. A run writes only the payloads whose hash changed and
deletes the pages of dogs that left the file — PRD R-8.2.

The hash covers everything a visitor sees, which means a dog changes when a **relative's**
record changes too: a new puppy changes both parents' pages, a corrected ancestor name
changes every descendant's bracket. That is deliberate. A hash over the dog's own row
would be cheaper and would quietly serve stale pedigrees.

Determinism is therefore load-bearing. Every list is sorted, `stableStringify` orders
object keys, and nothing in a payload carries a timestamp or a run id. A change that makes
the output order-dependent turns an incremental publish back into a full one.

## Half siblings are out of scope, and why that made the size problem vanish

Measured on the real database, 2026-08-28 (62,467 dogs): the first extract came to **860 MB**
against the platform's 500 MB limit, and **528 MB of it — 61% — was sibling lists**:
4.86 million entries, 78 per dog.

The cause was a shape, not a volume. A dog's half siblings by sire *are* its sire's
offspring, minus its full siblings. Storing them per dog stored the same relation twice,
and quadratically: a sire with N offspring puts N−1 entries on each of N pages. One sire in
this database has about 758 offspring and was contributing over half a million entries by
himself. As the base grows toward 100,000 dogs, that term grows faster than the database.

**Owner decision, 2026-08-28: the page shows own puppies and full siblings, and no half
siblings at all** (PRD R-2.5, v1.4, recorded as a breaking change). The rest of a sire's
get is one click away on his own page, which the bracket already links to — so nothing is
unreachable, only unrepeated. `relations.ts` therefore does not compute half siblings in
any form: no lists, no counts, no `bySire`/`byDam` maps. That is the version of this
decision that also makes the publish faster and the code smaller.

Offspring, for contrast, are **one generation** — direct children only, no descendant tree.
118,620 links across the whole database, 1.7% of the extract. There was never anything to
save there.

The bracket is what remains, and it shrank again on the same day: **four ancestor
generations, not five** (owner decision after seeing the first rendered page — PRD R-2.3,
v1.5). Halving the node count more than pays for the `registration` and `dob` now carried
on every node, which the desktop-style cell needs. Re-measure after the next full run.

If more headroom is ever needed after that, `generation` on each bracket node is derivable
from its id and need not be stored.

## The whitelist## The whitelist

`src/publish/whitelist.ts` is an allow list over the agreed 74-column catalogue, not a
list of things to strip. A deny list fails open — a column added to the master tomorrow
would be published by default.

Two properties are held by tests rather than by care:

1. **Every catalogue column has a decision.** Adding a column to `sourceFields.ts` fails
   the suite until someone records whether it may be published. That friction is the point.
2. **Excluded columns are never selected.** The whitelist builds the SQL projection, so
   `Owner` and `Microchip` are not filtered out late — they are never read.

## Reading the code

| File | What it answers |
|---|---|
| `key.ts` | What is the matching key for a name? (No database dependency — every pure module uses it.) |
| `whitelist.ts` | Which columns may leave the owner's machine? |
| `source.ts` | Read the master, read-only, through the whitelist. The only file that touches SQLite. |
| `relations.ts` | Offspring, mates, full siblings — built in one pass. |
| `slug.ts` / `slugMap.ts` | The candidate slug; and the assignment that keeps URLs working. |
| `indexRule.ts` | Which pages are offered to search engines. One file, because it is scheduled to be revisited. |
| `payload.ts` | Everything one page needs, plus the content hash. |
| `index.ts` | The command, and the run report. |

## Things worth knowing before changing it

- **The bracket walk is not a second pedigree algorithm.** The vendored
  `buildPedigreeTree` resolves an ancestor to `Animal | null` and so cannot tell "no parent
  recorded" from "a parent named but not held". PRD R-2.3 is built on exactly that
  distinction, so `buildBracket` keeps the name string. No genetics, no counting.
- **A dog inside an ancestry loop counts as having a complete pedigree.** The counting rule
  asks whether a name is recorded at each level, and a loop always has one. It matches the
  2026-08-28 measurement, so the one-month index review can compare against it directly.
- **The kennel is the `Breeder` field as stored**, not the first word of the dog's name.
  Names in this breed begin with a kennel affix, but deriving a hub from that is a guess;
  the breeder field is what the source actually records.
