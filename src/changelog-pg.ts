/**
 * Tier changelog stored in Postgres. Uses same DATABASE_URL as account-storage-pg / team-data-pg.
 * Single source of truth: read and write only to this table.
 */

import { getPool } from './pg-pool';
import * as fs from 'fs';
import * as path from 'path';

export interface ChangelogEntryRow {
  date: string;
  time?: string;
  operatorId: string;
  operatorName: string;
  niche: string;
  nicheFilename: string;
  oldTier: string | null;
  newTier: string | null;
  oldLevel: string;
  newLevel: string;
  justification: string;
  global?: boolean;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS tier_changelog (
  id SERIAL PRIMARY KEY,
  date VARCHAR(10) NOT NULL,
  time VARCHAR(5),
  operator_id VARCHAR(128) NOT NULL,
  operator_name VARCHAR(256) NOT NULL,
  niche VARCHAR(256) NOT NULL,
  niche_filename VARCHAR(256) NOT NULL,
  old_tier VARCHAR(8),
  new_tier VARCHAR(8),
  old_level VARCHAR(32) NOT NULL DEFAULT '',
  new_level VARCHAR(32) NOT NULL DEFAULT '',
  justification TEXT NOT NULL DEFAULT '',
  global BOOLEAN
);
`;

let ensureTablePromise: Promise<void> | null = null;
async function ensureTable(): Promise<void> {
  if (ensureTablePromise) return ensureTablePromise;
  ensureTablePromise = getPool().query(CREATE_TABLE_SQL).then(() => {});
  try {
    await ensureTablePromise;
  } catch (e) {
    ensureTablePromise = null;
    throw e;
  }
}

function rowToEntry(row: {
  date: string;
  time: string | null;
  operator_id: string;
  operator_name: string;
  niche: string;
  niche_filename: string;
  old_tier: string | null;
  new_tier: string | null;
  old_level: string;
  new_level: string;
  justification: string;
  global: boolean | null;
}): ChangelogEntryRow {
  return {
    date: row.date,
    time: row.time ?? undefined,
    operatorId: row.operator_id,
    operatorName: row.operator_name,
    niche: row.niche,
    nicheFilename: row.niche_filename,
    oldTier: row.old_tier,
    newTier: row.new_tier,
    oldLevel: row.old_level ?? '',
    newLevel: row.new_level ?? '',
    justification: row.justification ?? '',
    global: row.global ?? undefined,
  };
}

/**
 * Get all changelog entries, newest first (by id).
 */
export async function getChangelogEntries(): Promise<ChangelogEntryRow[]> {
  await ensureTable();
  const res = await getPool().query(
    `SELECT date, time, operator_id, operator_name, niche, niche_filename,
            old_tier, new_tier, old_level, new_level, justification, global
     FROM tier_changelog
     ORDER BY id DESC`
  );
  return res.rows.map(rowToEntry);
}

/**
 * Insert one changelog entry. Returns the new row id or null on failure.
 */
export async function insertChangelogEntry(entry: ChangelogEntryRow): Promise<number | null> {
  await ensureTable();
  const res = await getPool().query(
    `INSERT INTO tier_changelog (date, time, operator_id, operator_name, niche, niche_filename,
       old_tier, new_tier, old_level, new_level, justification, global)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      entry.date,
      entry.time ?? null,
      entry.operatorId,
      entry.operatorName,
      entry.niche,
      entry.nicheFilename,
      entry.oldTier,
      entry.newTier,
      entry.oldLevel ?? '',
      entry.newLevel ?? '',
      entry.justification ?? '',
      entry.global ?? null,
    ]
  );
  if (res.rows.length === 0) return null;
  return res.rows[0].id as number;
}

/**
 * Insert multiple entries (e.g. migration from JSON). Inserts in order; DB will list newest by id if inserted oldest-first.
 */
export async function insertChangelogEntries(entries: ChangelogEntryRow[]): Promise<number> {
  await ensureTable();
  let count = 0;
  for (const entry of entries) {
    const id = await insertChangelogEntry(entry);
    if (id != null) count++;
  }
  return count;
}

/**
 * Check if the changelog table has any rows.
 */
export async function hasChangelogEntries(): Promise<boolean> {
  await ensureTable();
  const res = await getPool().query('SELECT 1 FROM tier_changelog LIMIT 1');
  return res.rows.length > 0;
}

/**
 * Delete "first ranking" / addition rows (old_tier IS NULL, new_tier IS NOT NULL) from the table.
 * Returns the number of rows deleted. Use to keep only real tier changes and removals.
 */
export async function deleteChangelogAdditionEntries(): Promise<number> {
  await ensureTable();
  const res = await getPool().query(
    `DELETE FROM tier_changelog WHERE old_tier IS NULL AND new_tier IS NOT NULL`
  );
  return res.rowCount ?? 0;
}

/**
 * Check if an entry with the same key fields already exists (avoids duplicate inserts).
 */
export async function changelogEntryExists(entry: ChangelogEntryRow): Promise<boolean> {
  await ensureTable();
  const res = await getPool().query(
    `SELECT 1 FROM tier_changelog
     WHERE date = $1 AND operator_id = $2 AND niche_filename = $3
       AND (old_tier IS NOT DISTINCT FROM $4) AND (new_tier IS NOT DISTINCT FROM $5)
       AND (old_level IS NOT DISTINCT FROM $6) AND (new_level IS NOT DISTINCT FROM $7)
     LIMIT 1`,
    [
      entry.date,
      entry.operatorId,
      entry.nicheFilename,
      entry.oldTier,
      entry.newTier,
      entry.oldLevel ?? '',
      entry.newLevel ?? '',
    ]
  );
  return res.rows.length > 0;
}

/**
 * Initialize table and optionally migrate from data/tier-changelog.json if table is empty.
 */
export async function initializeChangelogTable(): Promise<void> {
  try {
    await ensureTable();
  } catch (err) {
    console.error('Failed to ensure tier_changelog table:', err);
  }
}

/**
 * Replace entire tier_changelog table with entries from a JSON file.
 * Truncates the table then inserts all entries (oldest-first to preserve order).
 * Returns number of entries inserted.
 */
export async function replaceChangelogWithJson(jsonPath: string): Promise<number> {
  await ensureTable();
  await getPool().query('TRUNCATE TABLE tier_changelog');
  if (!fs.existsSync(jsonPath)) return 0;
  const content = fs.readFileSync(jsonPath, 'utf-8');
  let data: { entries?: ChangelogEntryRow[] };
  try {
    data = JSON.parse(content);
  } catch {
    return 0;
  }
  const entries = Array.isArray(data.entries) ? data.entries : [];
  if (entries.length === 0) return 0;
  const reversed = [...entries].reverse();
  return insertChangelogEntries(reversed);
}

/**
 * One-time migration: load entries from data/tier-changelog.json and insert into DB.
 * Only inserts if the table is empty. Returns number of entries inserted.
 */
export async function migrateChangelogFromJson(): Promise<number> {
  const has = await hasChangelogEntries();
  if (has) return 0;

  const dataDir = path.join(__dirname, '../data');
  const jsonPath = path.join(dataDir, 'tier-changelog.json');
  if (!fs.existsSync(jsonPath)) return 0;

  const content = fs.readFileSync(jsonPath, 'utf-8');
  let data: { entries?: ChangelogEntryRow[] };
  try {
    data = JSON.parse(content);
  } catch {
    return 0;
  }

  const entries = Array.isArray(data.entries) ? data.entries : [];
  if (entries.length === 0) return 0;

  // JSON is newest-first; we want to preserve order. Insert in reverse so oldest gets lower id, newest higher (so ORDER BY id DESC = newest first).
  const reversed = [...entries].reverse();
  const count = await insertChangelogEntries(reversed);
  if (count > 0) {
    console.log(`Changelog: migrated ${count} entries from tier-changelog.json into tier_changelog table.`);
  }
  return count;
}
