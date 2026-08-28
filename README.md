# PedigreeInsightsWeb

The web edition of [PedigreeInsights](https://github.com/feedgine/pedigree-insights) —
**one application with two halves**, served at `pedigree.japanesespitz.org`:

- a **public catalogue** of the Japanese Spitz Foundation's pedigree database: one page
  per dog, delivered as finished HTML so search engines and AI assistants can read and
  cite it;
- a **member area** at `/app`: the same analysis reports as the desktop application —
  Pedigree, Indented Tree, Linebreeding, Foundation, Hypothetical Mating, DNA Tests —
  behind sign-in and excluded from search.

**The Foundation's master database is the single source of truth and is never written to
from the web.** The site is a published, read-only mirror, derived by a script the owner
runs and rebuildable from scratch at any time. Corrections arrive through the
Foundation's existing form and are applied to the master by hand.

Source code: **MIT**. Published data: **CC BY-NC-SA 4.0**, rights held by the Japanese
Spitz Foundation. Photographs are licensed separately; the data licence does not extend
to them.

## Status

**Not yet implemented.** The understanding is confirmed and the product requirements are
written; this repository is the scaffold for phase P0. See *Requirements and process*
below for where those documents live.

| Phase | What it delivers | Status |
|---|---|---|
| P0 | publish pipeline, D1 schema, one page of each tier | in progress |
| P1 | MVP live: the catalogue, read-only | not started |
| P2 | publish on demand — one command, with a runbook | not started |
| P3 | index review, one month after P1 | not started |
| P4 | the member area and sign-in | not started |

## How it is built

- **Cloudflare Pages** with Functions and a **D1** binding, inside the free tier. The
  club's nameservers stay with its registrar; the site is reached by a single DNS record.
- **The expensive work happens once, offline.** A publish script on the owner's Mac walks
  every pedigree and writes a finished page payload per dog, so serving a page is one
  indexed read and a template.
- **Two delivery tiers.** Dogs offered to search engines are written as static files;
  every other dog is published, linked and crawlable, and rendered on request.
- **Genetics are not reimplemented here.** The pure modules from PedigreeInsights
  (`src/lib/`) are database-agnostic and are reused as they are, so a web report cannot
  disagree with the desktop application.

## What is in this folder

- `README.md` — this file: what the project is, and what is in the folder.
- `LICENSE` — MIT.
- `package.json` — package manifest. The toolchain is chosen in P0.
- `.gitignore` — excludes build output, Wrangler state, secrets, and any `.db`. **No
  database file, master or derived, ever belongs in this repository.**
- `CLAUDE.md` — private working contract (git-ignored, never published).

## Requirements and process

Product requirements, the change contract and the delivery status live outside this
repository, in the Foundation's documentation hub under
`PROJECT.Pedigree app/PedigreeInsightsWeb/task-to-handoff/`:

- `pedigree-insightsWeb-specification.md` — the **PRD**: what the product must do
  (requirements `R-n`, acceptance criteria `AC-n`, open items `OI-n`).
- `pedigree-insightsWeb-init-working-change-record.md` — the **Working Change Document**:
  why, the chosen approach, alternatives rejected, accepted risks, the P0–P4
  decomposition and honest handoff status.

Facts are stated once: the PRD for *what*, the working change document for *why* and
*how ready*. Neither is duplicated here.
