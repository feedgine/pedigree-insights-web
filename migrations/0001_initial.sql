-- PedigreeInsightsWeb — D1 schema.
--
-- D1 holds only what has to be QUERIED: which dogs exist, how to find them by name, which
-- hub each belongs to, and where an old URL now points. The page payloads themselves live
-- in R2, one object per dog — they are fetched by key and never searched, which is exactly
-- what object storage is for and exactly what a relational database is wasted on.
--
-- Sizing (measured 2026-08-28, 62,469 dogs): this schema is roughly 8 MB against a 500 MB
-- free-plan limit. The 394.6 MB of payloads that would otherwise have gone here are in R2,
-- whose free tier is 10 GB.
--
-- Every table is derived from the master and rebuilt by a publish. Nothing here is a
-- source of truth, so a bad import is never data loss (PRD R-8.4).
--
-- @author Yuliya Malinina <julia.malinina@gmail.com>

-- One row per published dog. Drives search, the A-Z index and every hub page.
CREATE TABLE IF NOT EXISTS dog (
  slug            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  -- Accent-free, lower-cased. Search matches on this so that `lumivyoryn` finds
  -- LUMIVYÖRYN and vice versa (R-4.2) without a per-query normalisation pass.
  name_folded     TEXT NOT NULL,
  sex             TEXT,
  dob             TEXT,
  registration    TEXT,
  breeder         TEXT,
  kennel_slug     TEXT,
  birth_year      TEXT,
  country         TEXT,
  offspring_count INTEGER NOT NULL DEFAULT 0,
  -- Whether the page is offered to search engines (R-1.2). Publication is separate: every
  -- dog in this table has a page, indexed or not.
  indexed         INTEGER NOT NULL DEFAULT 0,
  -- Content hash of the payload in R2. Lets a publish skip unchanged rows, and lets a
  -- cache key be per-page and automatic.
  hash            TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS dog_name_folded ON dog (name_folded);
CREATE INDEX IF NOT EXISTS dog_kennel      ON dog (kennel_slug);
CREATE INDEX IF NOT EXISTS dog_year        ON dog (birth_year);
CREATE INDEX IF NOT EXISTS dog_country     ON dog (country);
CREATE INDEX IF NOT EXISTS dog_indexed     ON dog (indexed);

-- A URL that has been published never stops working (R-5.2). A rename moves the canonical
-- slug and leaves a row here; the Function answers a 301 from it.
CREATE TABLE IF NOT EXISTS redirect (
  old_slug TEXT PRIMARY KEY,
  new_slug TEXT NOT NULL
);

-- DNA results, one row per dog per test, for the per-test hub pages (R-3.4). Results are
-- text shown verbatim and are never parsed into categories.
CREATE TABLE IF NOT EXISTS dna_result (
  slug   TEXT NOT NULL,
  test   TEXT NOT NULL,
  result TEXT NOT NULL,
  PRIMARY KEY (slug, test)
);

CREATE INDEX IF NOT EXISTS dna_by_test ON dna_result (test);

-- What the last publish did. One row, overwritten each time: the runbook reads it to
-- confirm a publish landed, and the site can state when the data was last refreshed.
CREATE TABLE IF NOT EXISTS publish_state (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  published_at  TEXT NOT NULL,
  dogs          INTEGER NOT NULL,
  indexed       INTEGER NOT NULL,
  source_digest TEXT NOT NULL
);
