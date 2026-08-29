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

## 0b. Record the identifiers as you go

```
cp deploy.env.example deploy.local.env
```

Fill each value in as the command that produces it runs. `deploy.local.env` is git-ignored
and holds **identifiers only** — no credentials; wrangler and rclone each keep their own.
Sourcing it makes the rest of this runbook copy-pasteable:

```
source deploy.local.env
```

Every command below can then be written once and reused, which matters most for the ones
that are run again every month.

## 1. Sign in to Cloudflare

```
npx wrangler login
npx wrangler whoami
```

Opens a browser, authorises the CLI, and creates nothing. `whoami` then prints the account
everything will be created in, and the scopes the token carries.

**Check that `r2 (write)` is in that scope list.** Wrangler 3 does not request R2
permission at all — its token can create a database and deploy a project but will be
refused a bucket, and the error names a permission rather than the version, which is a
slow thing to work out. `package.json` therefore requires wrangler 4. If the list is
missing `r2`, the token predates the upgrade:

```
npx wrangler logout
npx wrangler login
```

## 2. Create the two stores

```
npx wrangler r2 bucket create "$R2_BUCKET"
npx wrangler d1 create "$D1_NAME"
```

`d1 create` prints a `database_id`. **Paste it into `wrangler.toml`**, replacing
`REPLACE_WITH_DATABASE_ID`. Without it every later command talks to the wrong database or
none at all.

Then create the schema:

```
npx wrangler d1 execute "$D1_NAME" --remote --file=migrations/0001_initial.sql
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
`$R2_ENDPOINT` (echo it if you need the literal value) · leave the rest empty.

Check it — and note **the trailing colon**, which is what makes `r2:` a remote rather
than a local folder called `r2`:

```
rclone ls "r2:$R2_BUCKET"
```

**No output is success**: the bucket exists, the credentials work, and it is empty.

Do NOT check with `rclone lsd r2:`. That asks to list every bucket on the account, which a
token scoped to one bucket is correctly refused — a 403 `AccessDenied` that looks like
broken credentials and is in fact the scoping working.

## 4. Build everything from the master

```
npm run publish:extract -- --source "$MASTER_DB" --out "$PAYLOAD_DIR" --state "$PUBLISH_STATE"
npm run render:site -- --payloads "$PAYLOAD_DIR" --out "$SITE_DIR" --include indexed --clean
npm run publish:d1 -- --payloads "$PAYLOAD_DIR" --state "$PUBLISH_STATE" --out "$PAYLOAD_DIR/d1/seed.sql"
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
rclone sync "$PAYLOAD_DIR/dog" "$RCLONE_REMOTE:$R2_BUCKET/dog" \
  --transfers 32 --checkers 32 --progress --exclude ".DS_Store"
npx wrangler d1 execute "$D1_NAME" --remote --file="$PAYLOAD_DIR/d1/seed.sql"
```

The first sync uploads about 395 MB and takes a while. Later ones send only what changed.

`--transfers 32` is worth the flag: the default of 4 turns a ten-minute upload into an
hour. Measured on the first real run: **62,469 objects, 322.7 MiB, 10m25s.**

`--exclude ".DS_Store"` keeps macOS's directory-metadata files out of the bucket. They are
harmless but they are also permanent — nothing ever deletes them, and `sync` re-uploads
each one every time Finder touches a folder.

## 6. Deploy

```
npx wrangler pages deploy "$SITE_DIR" --project-name "$PAGES_PROJECT"
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
   `$PAGES_PROJECT.pages.dev`.
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
