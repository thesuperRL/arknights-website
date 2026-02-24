/**
 * Per-account team data in Postgres: normal teambuild + preferences, IS teambuild + state.
 * Keyed by account_id (from accounts table). Uses same DATABASE_URL as account-storage-pg.
 */

import { getPool } from './pg-pool';
import { sanitizeIdentifier } from './sql-sanitize';

export interface NormalTeambuild {
  lockedOperatorIds?: string[];
  lastTeamOperatorIds?: string[];
}

export interface AccountTeamData {
  accountId: number;
  normalPreferences: Record<string, unknown> | null;
  normalTeambuild: NormalTeambuild | null;
  isTeamState: Record<string, unknown> | null;
  updatedAt: string;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS account_team_data (
  account_id INT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  normal_preferences JSONB NULL,
  normal_teambuild JSONB NULL,
  is_team_state JSONB NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

/**
 * Get account id by username or (legacy) email. Returns null if not found.
 */
async function getAccountIdByIdentifier(identifier: string): Promise<number | null> {
  const normalized = sanitizeIdentifier(identifier);
  if (!normalized) return null;
  const res = await getPool().query(
    `SELECT id FROM accounts WHERE LOWER(username) = $1 OR (email IS NOT NULL AND LOWER(email) = $1)`,
    [normalized]
  );
  if (res.rows.length === 0) return null;
  return res.rows[0].id as number;
}

function rowToTeamData(row: {
  account_id: number;
  normal_preferences: unknown;
  normal_teambuild: unknown;
  is_team_state: unknown;
  updated_at: Date;
}): AccountTeamData {
  return {
    accountId: row.account_id,
    normalPreferences: row.normal_preferences as Record<string, unknown> | null,
    normalTeambuild: row.normal_teambuild as NormalTeambuild | null,
    isTeamState: row.is_team_state as Record<string, unknown> | null,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

/**
 * Get full team data for an account by username (or legacy email). Returns null if no row.
 */
export async function getAccountTeamData(identifier: string): Promise<AccountTeamData | null> {
  await ensureTable();
  const accountId = await getAccountIdByIdentifier(identifier);
  if (accountId == null) return null;
  const res = await getPool().query(
    'SELECT account_id, normal_preferences, normal_teambuild, is_team_state, updated_at FROM account_team_data WHERE account_id = $1',
    [accountId]
  );
  if (res.rows.length === 0) return null;
  return rowToTeamData(res.rows[0]);
}

/**
 * Upsert team data. Pass only the keys you want to update; others are left unchanged (or set null if creating).
 */
export async function saveAccountTeamData(
  identifier: string,
  updates: {
    normalPreferences?: Record<string, unknown> | null;
    normalTeambuild?: NormalTeambuild | null;
    isTeamState?: Record<string, unknown> | null;
  }
): Promise<boolean> {
  await ensureTable();
  const accountId = await getAccountIdByIdentifier(identifier);
  if (accountId == null) return false;

  const now = new Date();
  const res = await getPool().query(
    `INSERT INTO account_team_data (account_id, normal_preferences, normal_teambuild, is_team_state, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (account_id) DO UPDATE SET
       normal_preferences = COALESCE(EXCLUDED.normal_preferences, account_team_data.normal_preferences),
       normal_teambuild = COALESCE(EXCLUDED.normal_teambuild, account_team_data.normal_teambuild),
       is_team_state = COALESCE(EXCLUDED.is_team_state, account_team_data.is_team_state),
       updated_at = EXCLUDED.updated_at`,
    [
      accountId,
      updates.normalPreferences !== undefined ? JSON.stringify(updates.normalPreferences) : null,
      updates.normalTeambuild !== undefined ? JSON.stringify(updates.normalTeambuild) : null,
      updates.isTeamState !== undefined ? JSON.stringify(updates.isTeamState) : null,
      now,
    ]
  );
  return (res.rowCount ?? 0) > 0;
}

/**
 * Update only normal preferences.
 */
export async function saveNormalPreferences(identifier: string, preferences: Record<string, unknown>): Promise<boolean> {
  const accountId = await getAccountIdByIdentifier(identifier);
  if (accountId == null) return false;
  await ensureTable();
  const now = new Date();
  await getPool().query(
    `INSERT INTO account_team_data (account_id, normal_preferences, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (account_id) DO UPDATE SET normal_preferences = EXCLUDED.normal_preferences, updated_at = EXCLUDED.updated_at`,
    [accountId, JSON.stringify(preferences), now]
  );
  return true;
}

/**
 * Update only normal teambuild (locked IDs + last team IDs).
 */
export async function saveNormalTeambuild(identifier: string, data: NormalTeambuild): Promise<boolean> {
  const accountId = await getAccountIdByIdentifier(identifier);
  if (accountId == null) return false;
  await ensureTable();
  const now = new Date();
  await getPool().query(
    `INSERT INTO account_team_data (account_id, normal_teambuild, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (account_id) DO UPDATE SET normal_teambuild = EXCLUDED.normal_teambuild, updated_at = EXCLUDED.updated_at`,
    [accountId, JSON.stringify(data), now]
  );
  return true;
}

/**
 * Update only IS team state.
 */
export async function saveISTeamState(identifier: string, state: Record<string, unknown> | null): Promise<boolean> {
  const accountId = await getAccountIdByIdentifier(identifier);
  if (accountId == null) return false;
  await ensureTable();
  const now = new Date();
  await getPool().query(
    `INSERT INTO account_team_data (account_id, is_team_state, updated_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (account_id) DO UPDATE SET is_team_state = EXCLUDED.is_team_state, updated_at = EXCLUDED.updated_at`,
    [accountId, state ? JSON.stringify(state) : null, now]
  );
  return true;
}

/**
 * Delete IS team state for an account (set to null).
 */
export async function deleteISTeamState(identifier: string): Promise<boolean> {
  return saveISTeamState(identifier, null);
}

/**
 * Initialize team data table (call on app startup if desired).
 */
export async function initializeTeamDataTable(): Promise<void> {
  try {
    await ensureTable();
  } catch (err) {
    console.error('Failed to ensure account_team_data table:', err);
  }
}
