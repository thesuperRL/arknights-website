/**
 * Account storage using Heroku Postgres (or any PostgreSQL via DATABASE_URL).
 * See: https://devcenter.heroku.com/articles/connecting-heroku-postgres
 */

import bcrypt from 'bcrypt';
import { getPool, closePool } from './pg-pool';
import { sanitizeIdentifier, sanitizeOperatorId } from './sql-sanitize';

export interface LocalAccount {
  id: number;
  username: string;
  email: string | null;
  passwordHash: string;
  createdAt: string;
  lastLogin?: string;
  ownedOperators?: string[];
  wantToUse?: string[];
}

function parseJsonArray(val: unknown): string[] {
  if (val == null) return [];
  if (Array.isArray(val)) return val as string[];
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function rowToAccount(row: {
  id: number;
  username: string;
  email: string | null;
  password_hash: string;
  created_at: Date;
  last_login: Date | null;
  owned_operators: unknown;
  want_to_use: unknown;
}): LocalAccount {
  return {
    id: row.id,
    username: row.username,
    email: row.email ?? null,
    passwordHash: row.password_hash,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    lastLogin: row.last_login ? new Date(row.last_login).toISOString() : undefined,
    ownedOperators: parseJsonArray(row.owned_operators),
    wantToUse: parseJsonArray(row.want_to_use),
  };
}

export async function findAccountByEmail(email: string): Promise<LocalAccount | null> {
  return findAccountByUsername(email);
}

/** Find account by username or (for legacy accounts) by email. Used for login and session lookups. */
export async function findAccountByUsername(identifier: string): Promise<LocalAccount | null> {
  const normalized = sanitizeIdentifier(identifier);
  if (!normalized) return null;
  const res = await getPool().query(
    `SELECT id, username, email, password_hash, created_at, last_login, owned_operators, want_to_use
     FROM accounts
     WHERE LOWER(username) = $1 OR (email IS NOT NULL AND LOWER(email) = $1)`,
    [normalized]
  );
  if (res.rows.length === 0) return null;
  return rowToAccount(res.rows[0]);
}

export async function createAccount(username: string, password: string): Promise<LocalAccount> {
  const trimmed = username.trim();
  if (!trimmed) {
    throw new Error('Username is required');
  }
  if (trimmed.length < 2 || trimmed.length > 64) {
    throw new Error('Username must be between 2 and 64 characters');
  }
  const allowed = /^[a-zA-Z0-9_-]+$/;
  if (!allowed.test(trimmed)) {
    throw new Error('Username may only contain letters, numbers, underscores, and hyphens');
  }
  const existing = await findAccountByUsername(trimmed);
  if (existing) {
    throw new Error('Username already taken');
  }
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);
  const createdAt = new Date();
  const res = await getPool().query(
    `INSERT INTO accounts (username, email, password_hash, created_at, owned_operators, want_to_use)
     VALUES ($1, NULL, $2, $3, $4, $5)
     RETURNING id, username, email, password_hash, created_at, last_login, owned_operators, want_to_use`,
    [trimmed, passwordHash, createdAt, JSON.stringify([]), JSON.stringify([])]
  );
  const row = res.rows[0];
  return rowToAccount(row);
}

export async function verifyPassword(account: LocalAccount, password: string): Promise<boolean> {
  try {
    const startTime = Date.now();
    const isValid = await bcrypt.compare(password, account.passwordHash);
    const duration = Date.now() - startTime;
    if (duration > 500) {
      console.warn(`Password verification took ${duration}ms, which is unusually slow`);
    }
    return isValid;
  } catch {
    return false;
  }
}

export async function updateLastLogin(identifier: string): Promise<void> {
  try {
    const account = await findAccountByUsername(identifier);
    if (!account) return;
    await getPool().query(`UPDATE accounts SET last_login = $1 WHERE id = $2`, [new Date(), account.id]);
  } catch (err: unknown) {
    console.warn('Failed to update last login time (non-critical):', (err as Error)?.message ?? err);
  }
}

export async function addOperatorToAccount(identifier: string, operatorId: string): Promise<boolean> {
  const safeId = sanitizeOperatorId(operatorId);
  if (!safeId) return false;
  const account = await findAccountByUsername(identifier);
  if (!account) return false;
  const owned = account.ownedOperators ?? [];
  if (owned.includes(safeId)) return false;
  owned.push(safeId);
  await getPool().query(
    `UPDATE accounts SET owned_operators = $1 WHERE id = $2`,
    [JSON.stringify(owned), account.id]
  );
  return true;
}

export async function removeOperatorFromAccount(identifier: string, operatorId: string): Promise<boolean> {
  const safeId = sanitizeOperatorId(operatorId);
  if (!safeId) return false;
  const account = await findAccountByUsername(identifier);
  if (!account?.ownedOperators) return false;
  const owned = account.ownedOperators.filter((id) => id !== safeId);
  if (owned.length === account.ownedOperators.length) return false;
  await getPool().query(
    `UPDATE accounts SET owned_operators = $1 WHERE id = $2`,
    [JSON.stringify(owned), account.id]
  );
  return true;
}

export async function getOwnedOperators(identifier: string): Promise<string[]> {
  const account = await findAccountByUsername(identifier);
  return account?.ownedOperators ?? [];
}

export async function toggleWantToUse(identifier: string, operatorId: string): Promise<boolean> {
  const safeId = sanitizeOperatorId(operatorId);
  if (!safeId) return false;
  const account = await findAccountByUsername(identifier);
  if (!account) return false;
  const wantToUse = account.wantToUse ?? [];
  const idx = wantToUse.indexOf(safeId);
  if (idx > -1) wantToUse.splice(idx, 1);
  else wantToUse.push(safeId);
  await getPool().query(
    `UPDATE accounts SET want_to_use = $1 WHERE id = $2`,
    [JSON.stringify(wantToUse), account.id]
  );
  return true;
}

export async function getWantToUse(identifier: string): Promise<string[]> {
  const account = await findAccountByUsername(identifier);
  return account?.wantToUse ?? [];
}

export async function deleteAccount(identifier: string): Promise<boolean> {
  const account = await findAccountByUsername(identifier);
  if (!account) return false;
  const res = await getPool().query(`DELETE FROM accounts WHERE id = $1`, [account.id]);
  return (res.rowCount ?? 0) > 0;
}

export async function loadAccounts(): Promise<Record<string, LocalAccount>> {
  const res = await getPool().query(
    `SELECT id, username, email, password_hash, created_at, last_login, owned_operators, want_to_use FROM accounts`
  );
  const out: Record<string, LocalAccount> = {};
  for (const row of res.rows) {
    const acc = rowToAccount(row);
    out[acc.username] = acc;
  }
  return out;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ NULL,
  owned_operators JSONB NULL,
  want_to_use JSONB NULL
);
`;

const MIGRATE_LEGACY_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'accounts' AND column_name = 'username') THEN
    ALTER TABLE accounts ADD COLUMN username VARCHAR(255) NULL;
    UPDATE accounts SET username = email WHERE username IS NULL;
    ALTER TABLE accounts ALTER COLUMN username SET NOT NULL;
    ALTER TABLE accounts ALTER COLUMN email DROP NOT NULL;
  END IF;
END $$;
`;

export async function initializeDbConnection(): Promise<void> {
  try {
    console.log('🔄 Initializing Heroku Postgres account storage...');
    const start = Date.now();
    const p = getPool();
    await p.query(CREATE_TABLE_SQL);
    await p.query(MIGRATE_LEGACY_SQL);
    await p.query('CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_lower_idx ON accounts (LOWER(username))');
    const countRes = await p.query('SELECT COUNT(*)::int AS c FROM accounts');
    const count = countRes.rows[0]?.c ?? 0;
    console.log(`✅ Postgres account storage ready in ${Date.now() - start}ms (${count} accounts)`);
  } catch (err: unknown) {
    console.error('❌ Failed to initialize Postgres account storage:', err);
    console.warn('⚠️  Server will continue; account features may be unavailable.');
  }
}

export async function closeDbConnection(): Promise<void> {
  await closePool();
  console.log('Postgres account storage closed');
}
