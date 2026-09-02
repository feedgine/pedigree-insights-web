-- Search index — added 2026-09-01, after the free-tier D1 read limit was exhausted.
--
-- `instr(name_folded, ?) > 0` cannot use an index, so every search scanned all 62,466
-- rows, twice (count, then page). 788 searches in the first 24 hours after the public
-- announcement is ~98 million rows read against a 5,000,000 daily allowance: search
-- worked for roughly the first 40 visitors and failed for the rest.
--
-- These two tables make the same question index-backed. A substring of a word is a
-- prefix of one of that word's suffixes, so "which words contain q" is a range scan.
-- Sizing measured on the real catalogue: 25,494 distinct words averaging 4.5 characters
-- give ~110,000 suffix rows, and 266,965 word/dog pairs. Roughly 10 MB against the same
-- 500 MB limit the rest of the schema fits inside.
--
-- Derived like every other table here: rebuilt in full by each publish, never a source
-- of truth (PRD R-8.4).
--
-- @author Yuliya Malinina <julia.malinina@gmail.com>

-- Every suffix of every distinct word appearing in a name.
CREATE TABLE IF NOT EXISTS search_word (
  suffix TEXT NOT NULL,
  word   TEXT NOT NULL
);

-- The index IS the table's purpose: `suffix` leads so a prefix range scan uses it, and
-- `word` follows so the lookup is covered and never touches the row.
CREATE INDEX IF NOT EXISTS search_word_suffix ON search_word (suffix, word);

-- Which dogs carry a given word.
CREATE TABLE IF NOT EXISTS search_word_dog (
  word TEXT NOT NULL,
  slug TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS search_word_dog_word ON search_word_dog (word, slug);
