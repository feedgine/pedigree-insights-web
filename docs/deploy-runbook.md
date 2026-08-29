# Deploy runbook

Everything needed to put the catalogue on `pedigree.japanesespitz.org`, in order, once.
After that, republishing is section 6 alone.

Run every command **from the repository root in Terminal on the Mac**. Git and npm do not
work through the Cowork bridge.

---

## 0. Install

```
npm install
npm test
npm run typecheck
```

`npm install` now brings in `wrangler` and `@cloudflare/workers-types`. `npm test` must be
green before anything is deployed — the code is `[DRAFT]` until it passes on this machine.

## 1. Sign in to Cloudflare

```
npx wrangler login
```

Opens a browser and authorises the CLI against your account. Nothing is created yet.

## 2. Create the two stores

```
npx wrangler r2 bucket create pedigree-payloads
npx wrangler d1 create pedigree
```

`d1 create` prints a `database_id`. **Paste it into `wrangler.toml`**, replacing
`REPLACE_WITH_DATABASE_ID`. Without it every later command talks to the wrong database or
none at all.

Then create the schema:

```
npx wrangler d1 execute pedigree --remote --file=migrations/0001_initial.sql
```

`--remote` matters. Without it wrangler writes to a local emulated database and the site
sees nothing.

## 3. An R2 API token, for bulk upload

62,469 objects cannot go up one `wrangler r2 object put` at a time. R2 speaks the S3 API,
so `rclone` uploads them in parallel and — the part that matters monthly — **syncs**:
after the first run it only sends the payloads the extract actually rewrote.

In the Cloudflare dashboard: **R2 → API → Manage API tokens → Create token**, permission
**Object Read & Write**, scoped to the `pedigree-payloads` bucket. Keep the Access Key ID,
the Secret Access Key, and the account ID from the R2 overview page.

```
brew install rclone
rclone config
```

Answer: `n` (new remote) · name `r2` · storage `s3` · provider `Cloudflare` ·
`env_auth` false · your access key and secret · region `auto` · endpoint
`https://<ACCOUNT_ID>.r2.cloudflarestorage.com` · leave the rest empty.

Check it:

```
rclone lsd r2:
```

It should list `pedigree-payloads`.

## 4. Build everything from the master

```
npm run publish:extract -- --source "<path to japanesespitz-2026-master.db>" --out out --state publish-state/state.json
npm run render:site -- --payloads out --out site --include indexed --clean
npm run publish:d1 -- --payloads out --state publish-state/state.json --out out/d1/seed.sql
```

Three outputs, three destinations:

| | what | goes to |
|---|---|---|
| `out/dog/**` | one JSON payload per dog | R2 |
| `out/d1/seed.sql` | dog index, redirects, DNA results | D1 |
| `site/` | the indexed pages, home, robots, sitemap, llms.txt | Pages |

**Keep `publish-state/state.json`.** It holds every published URL. Losing it re-mints the
synthetic identifiers for the dogs without registrations and can move their links.

## 5. Load the data

```
rclone sync out/dog r2:pedigree-payloads/dog --transfers 32 --checkers 32 --progress
npx wrangler d1 execute pedigree --remote --file=out/d1/seed.sql
```

The first sync uploads about 395 MB and takes a while. Later ones send only what changed.

`--transfers 32` is worth the flag: the default of 4 turns a ten-minute upload into an
hour.

## 6. Deploy

```
npx wrangler pages deploy site --project-name pedigree-insights-web
```

The first run offers to create the project — accept, and choose **Direct Upload**. It
prints a `*.pages.dev` URL. Open a dog page there and check it renders before going near
DNS.

**Republishing later is only this:** section 4, then section 5, then this command.

## 7. Bind the stores to the Pages project

The bindings in `wrangler.toml` cover local development. The deployed project needs them
set on the project itself, once:

Dashboard → **Workers & Pages → pedigree-insights-web → Settings → Functions**:

- **R2 bucket bindings** — variable name `PAYLOADS`, bucket `pedigree-payloads`
- **D1 database bindings** — variable name `DB`, database `pedigree`

Add them for **Production** and, if you use it, Preview. Then redeploy (section 6) so the
Functions pick them up. Until this is done, an unindexed dog's page returns an error while
the indexed ones work — which is a useful symptom to recognise.

## 8. The domain, in this order

**Order matters here and getting it wrong produces a 522 that looks like a broken site.**

1. Dashboard → the Pages project → **Custom domains → Set up a domain** →
   `pedigree.japanesespitz.org`. Cloudflare will show the CNAME target it wants.
2. **Only then**, at GoDaddy, add one record: `CNAME` · host `pedigree` · value
   `pedigree-insights-web.pages.dev`.
3. Back in the dashboard, wait for the domain to go **Active**. Certificates take a few
   minutes.

The club's nameservers stay at GoDaddy. Nothing about the WordPress.com site or the club's
email changes — one subdomain is added and that is all.

---

## Checks after the first deploy

- An **indexed** dog: `/dog/<slug>` — served as a static file, no R2 read.
- An **unindexed** dog: `/dog/<slug>` — same page, rendered by the Function from R2.
  Use `node tools/find-dog.mjs out "<name>"`; it prints which tier a dog is in.
- The JSON: `/api/dog/<slug>.json`.
- Search: `/search?q=lumivyoryn` — and confirm it finds the accented spelling.
- `/robots.txt`, `/sitemap.xml`, `/llms.txt`.
- A **renamed** dog's old URL, if `out/redirects.json` lists one: expect a 301.
- The site with JavaScript disabled. Every page must be complete without it (R-2.8).

## When something is wrong

| Symptom | Cause |
|---|---|
| 522 on the custom domain | CNAME was added before the domain was set up in Pages. Remove the record, do section 8 in order. |
| Indexed dogs fine, others error | The `PAYLOADS` or `DB` binding is missing on the project (section 7). |
| Everything 404s under `/dog/` | `_routes.json` missing from `site/` — re-run the render. |
| `d1 execute` seems to work, site sees nothing | `--remote` was omitted. |
| Search returns nothing | The seed was not imported, or was imported to the local database. |
