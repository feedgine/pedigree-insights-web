import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { buildPublishedSelect, loadPopulation } from '../../src/publish/source.ts';

/**
 * These tests build a database in memory. Nothing is written to disk and no row here
 * describes a real dog — the working contract forbids a fixture drawn from the master.
 *
 * `loadPopulation` takes a path, so the fixtures are written to a temporary file; the
 * projection tests need no file at all.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function makeDb(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'piw-'));
  const file = join(dir, 'fixture.db');
  const db = new Database(file);
  db.exec(`CREATE TABLE "Pedigree" (${columns.map((c) => `"${c}"`).join(', ')})`);
  const insert = db.prepare(
    `INSERT INTO "Pedigree" (${columns.map((c) => `"${c}"`).join(',')}) ` +
      `VALUES (${columns.map(() => '?').join(',')})`,
  );
  for (const row of rows) insert.run(columns.map((c) => row[c] ?? null));
  db.close();
  return file;
}

const cleanUp = (file: string) => rmSync(join(file, '..'), { recursive: true, force: true });

describe('the SQL projection', () => {
  it('names no column the whitelist withholds', () => {
    const select = buildPublishedSelect(new Set(['Name', 'Sire', 'Dam', 'Owner', 'Microchip']));
    expect(select).not.toMatch(/"Owner"/);
    expect(select).not.toMatch(/"Microchip"/);
    expect(select).toMatch(/"Name" AS name/);
  });

  it('selects NULL for a whitelisted column this file does not have', () => {
    const select = buildPublishedSelect(new Set(['Name', 'Sire', 'Dam']));
    expect(select).toMatch(/NULL AS breeder/);
  });
});

describe('loading a population', () => {
  it('reads a registration stored as a number as text', () => {
    // SQLite has no column types, only value types: a Registration typed in as 12345 comes
    // back as a number however the column was declared. Found on the real master.
    const file = makeDb(
      ['Name', 'Sire', 'Dam', 'Registration', 'DOB'],
      [{ Name: 'NUMERIC REG', Registration: 12345, DOB: 1994 }],
    );
    try {
      const population = loadPopulation(file);
      const dog = population.animals[0]!;
      expect(dog.registration).toBe('12345');
      expect(dog.dob).toBe('1994');
    } finally {
      cleanUp(file);
    }
  });

  it('parses a coefficient stored as text back into a number', () => {
    const file = makeDb(
      ['Name', 'Sire', 'Dam', 'COI', 'AVK'],
      [{ Name: 'TEXTUAL COI', COI: '0.19', AVK: '80' }],
    );
    try {
      const dog = loadPopulation(file).animals[0]!;
      expect(dog.coi).toBe(0.19);
      expect(dog.avk).toBe(80);
    } finally {
      cleanUp(file);
    }
  });

  it('never carries an excluded column into memory', () => {
    const file = makeDb(
      ['Name', 'Sire', 'Dam', 'Owner', 'Microchip', 'Breeder'],
      [{ Name: 'A DOG', Owner: 'A PERSON', Microchip: '981000000000001', Breeder: 'A KENNEL' }],
    );
    try {
      const dog = loadPopulation(file).animals[0]!;
      expect(JSON.stringify(dog)).not.toContain('A PERSON');
      expect(JSON.stringify(dog)).not.toContain('981000000000001');
      expect(dog.breeder).toBe('A KENNEL');
    } finally {
      cleanUp(file);
    }
  });

  it('refuses a file that is not a pedigree database, and says why', () => {
    const file = makeDb(['Name', 'Colour'], [{ Name: 'NO PARENTS' }]);
    try {
      expect(() => loadPopulation(file)).toThrow(/Sire/);
    } finally {
      cleanUp(file);
    }
  });

  it('reports duplicate names instead of merging two dogs into one page', () => {
    const file = makeDb(
      ['Name', 'Sire', 'Dam', 'Registration'],
      [
        { Name: 'TWICE', Registration: 'R1' },
        { Name: 'twice', Registration: 'R2' },
      ],
    );
    try {
      const population = loadPopulation(file);
      expect(population.animals).toHaveLength(1);
      expect(population.duplicates).toEqual(['twice']);
    } finally {
      cleanUp(file);
    }
  });
});
