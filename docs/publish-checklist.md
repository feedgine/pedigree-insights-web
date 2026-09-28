# Publishing database changes — checklist

The short version of the routine. Every command runs **in Terminal on the Mac, from the
repository root**. Background, reasons and rare cases: [`deploy-runbook.md`](deploy-runbook.md),
section 9.

Total time: about 45 minutes, most of it waiting for the upload.

---

## 1. Before you start (5 min)

- [ ] All edits in the master database are saved and BreedMate is closed.
- [ ] Did the hub foundation list (`foundation-japanese-spitz-exports.txt`) change?
      Then `src/publish/foundationDogs.ts` must change to match. Step 2 tells you if they differ.
- [ ] Open Terminal and go to the repository:

```
cd <GIT_ROOT>/pedigreepoint/pedigree-insights-web
source deploy.local.env
```

## 2. Checks (2 min)

```
npm test
npm run foundation:check
ls migrations/
```

- `npm test` — every test green.
- `foundation:check` — `✓ foundation list: N names, identical…`
- `migrations/` — a file newer than the last one you ran? Apply it first:
  `npx wrangler d1 execute "$D1_NAME" --remote --file=migrations/000N_name.sql`

## 3. Dry run — nothing is written (2 min)

```
npm run publish:extract -- --source "$MASTER_DB" --out "$PAYLOAD_DIR" --state "$PUBLISH_STATE" --dry-run
```

Read these lines. Anything unexpected → stop and ask before building.

| Line | Good | Act when |
|---|---|---|
| `REG SWAP?` | absent | **Present → fix before building** (runbook: *A registration swapped between two dogs*). A URL would redirect to the wrong dog. |
| `moved slugs` | only renames you made | A name you did not change, or a completely different name. |
| `merges` | only duplicates you merged | Two different dogs listed as one. |
| `reg corrected` | numbers you corrected | Nothing to do — they keep their URLs. |
| `FOUNDATION LIST` | absent | A founder name matches no record: fix the name in the list or the database. |
| `DUPLICATE NAMES` | absent | Two rows with one name — one is being skipped. |
| `payloads written` | your edits plus their relatives | Tens of thousands → something global changed; find out what first. |

## 4. Build (5 min)

Back up the URL state first — it is not in git:

```
cp -p publish-state/state.json "publish-state/state.json.bak-$(date +%F)"
```

```
npm run publish:extract -- --source "$MASTER_DB" --out "$PAYLOAD_DIR" --state "$PUBLISH_STATE"
npm run render:site -- --payloads "$PAYLOAD_DIR" --out "$SITE_DIR" --include indexed --clean
npm run publish:d1 -- --payloads "$PAYLOAD_DIR" --state "$PUBLISH_STATE" --out "$PAYLOAD_DIR/d1/seed.sql"
```

## 5. Load the data (15–30 min)

```
rclone sync "$PAYLOAD_DIR/dog" "$RCLONE_REMOTE:$R2_BUCKET/dog" --transfers 32 --checkers 32 --progress --exclude ".DS_Store"
rclone sync "$PAYLOAD_DIR/report" "$RCLONE_REMOTE:$R2_BUCKET/report" --transfers 32 --checkers 32 --progress --exclude ".DS_Store"
npx wrangler d1 execute "$D1_NAME" --remote --file="$PAYLOAD_DIR/d1/seed.sql"
```

Answer `yes` to the D1 prompt. **Always `--remote`** — without it the command "works" and
the site sees nothing.

## 6. Deploy (1 min)

```
npx wrangler pages deploy "$SITE_DIR" --project-name "$PAGES_PROJECT"
```

## 7. Check the live site (5 min) — in a private window

Pages are cached, so a normal window can show the old version.

- [ ] A dog you corrected shows the new data.
- [ ] A renamed dog's old URL redirects to the new one.
- [ ] Search: `hovin` finds TÄHTIHOVIN.
- [ ] Footer date on the home page is today.
- [ ] A Foundation report says "of N foundation dogs" with the right N.

## 8. Commit (1 min)

The render rewrote `src/generated/published.ts` with today's date — commit it with any code changes:

```
git status
git add src/generated/published.ts <any other changed files>
git commit -m "publish YYYY-MM-DD"
git push
```

---

## If something goes wrong

| Symptom | Fix |
|---|---|
| `foundation:check` prints `Usage: …` | `deploy.local.env` lacks `FOUNDATION_LIST` — copy the line from `deploy.env.example`, `source` again. |
| `foundation:check` lists names only in one file | Make `foundationDogs.ts` match the hub file (same names, same order). |
| A test fails after changing the foundation list | A test expects a fixed count — make it read `FOUNDATION_DOGS.length`. |
| `git push`: *Invalid username or token* | Token expired. `printf "protocol=https\nhost=github.com\n\n" \| git credential-osxkeychain erase`, then `git push`; username `feedgine`, password = new token. |
| Live page shows old content | Check in a private window before assuming a bug. |
| Search finds nothing new | The D1 seed was not imported, or was imported without `--remote`. |
| The run went wrong | Put the backup back: `cp -p publish-state/state.json.bak-<date> publish-state/state.json`, fix, start again at step 3. |

**Never:** run git through Claude's Cowork bridge · edit `state.json` while a run is going ·
run `d1 execute` without `--remote`.
