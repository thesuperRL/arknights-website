/**
 * Account storage using Heroku Postgres (or any PostgreSQL via DATABASE_URL).
 * See: https://devcenter.heroku.com/articles/connecting-heroku-postgres
 */

import { Pool } from 'pg';
import bcrypt from 'bcrypt';

export interface LocalAccount {
  id: number;
  email: string;
  passwordHash: string;
  createdAt: string;
  lastLogin?: string;
  ownedOperators?: string[];
  wantToUse?: string[];
}

let pool: Pool | null = null;

function getPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set');
  }
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
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
  email: string;
  password_hash: string;
  created_at: Date;
  last_login: Date | null;
  owned_operators: unknown;
  want_to_use: unknown;
}): LocalAccount {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    lastLogin: row.last_login ? new Date(row.last_login).toISOString() : undefined,
    ownedOperators: parseJsonArray(row.owned_operators),
    wantToUse: parseJsonArray(row.want_to_use),
  };
}

export async function findAccountByEmail(email: string): Promise<LocalAccount | null> {
  const normalizedEmail = email.toLowerCase().trim();
  const res = await getPool().query(
    `SELECT id, email, password_hash, created_at, last_login, owned_operators, want_to_use
     FROM accounts WHERE LOWER(email) = $1`,
    [normalizedEmail]
  );
  if (res.rows.length === 0) return null;
  return rowToAccount(res.rows[0]);
}

export async function createAccount(email: string, password: string): Promise<LocalAccount> {
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await findAccountByEmail(normalizedEmail);
  if (existing) {
    throw new Error('Account with this email already exists');
  }
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);
  const createdAt = new Date();
  const res = await getPool().query(
    `INSERT INTO accounts (email, password_hash, created_at, owned_operators, want_to_use)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, email, password_hash, created_at, last_login, owned_operators, want_to_use`,
    [normalizedEmail, passwordHash, createdAt, JSON.stringify([]), JSON.stringify([])]
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

export async function updateLastLogin(email: string): Promise<void> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    await getPool().query(
      `UPDATE accounts SET last_login = $1 WHERE LOWER(email) = $2`,
      [new Date(), normalizedEmail]
    );
  } catch (err: unknown) {
    console.warn('Failed to update last login time (non-critical):', (err as Error)?.message ?? err);
  }
}

export async function addOperatorToAccount(email: string, operatorId: string): Promise<boolean> {
  const account = await findAccountByEmail(email);
  if (!account) return false;
  const owned = account.ownedOperators ?? [];
  if (owned.includes(operatorId)) return false;
  owned.push(operatorId);
  await getPool().query(
    `UPDATE accounts SET owned_operators = $1 WHERE id = $2`,
    [JSON.stringify(owned), account.id]
  );
  return true;
}

export async function removeOperatorFromAccount(email: string, operatorId: string): Promise<boolean> {
  const account = await findAccountByEmail(email);
  if (!account?.ownedOperators) return false;
  const owned = account.ownedOperators.filter((id) => id !== operatorId);
  if (owned.length === account.ownedOperators.length) return false;
  await getPool().query(
    `UPDATE accounts SET owned_operators = $1 WHERE id = $2`,
    [JSON.stringify(owned), account.id]
  );
  return true;
}

export async function getOwnedOperators(email: string): Promise<string[]> {
  const account = await findAccountByEmail(email);
  return account?.ownedOperators ?? [];
}

export async function toggleWantToUse(email: string, operatorId: string): Promise<boolean> {
  const account = await findAccountByEmail(email);
  if (!account) return false;
  const wantToUse = account.wantToUse ?? [];
  const idx = wantToUse.indexOf(operatorId);
  if (idx > -1) wantToUse.splice(idx, 1);
  else wantToUse.push(operatorId);
  await getPool().query(
    `UPDATE accounts SET want_to_use = $1 WHERE id = $2`,
    [JSON.stringify(wantToUse), account.id]
  );
  return true;
}

export async function getWantToUse(email: string): Promise<string[]> {
  const account = await findAccountByEmail(email);
  return account?.wantToUse ?? [];
}

export async function deleteAccount(email: string): Promise<boolean> {
  const normalizedEmail = email.toLowerCase().trim();
  const res = await getPool().query(`DELETE FROM accounts WHERE LOWER(email) = $1`, [normalizedEmail]);
  return (res.rowCount ?? 0) > 0;
}

export async function loadAccounts(): Promise<Record<string, LocalAccount>> {
  const res = await getPool().query(
    `SELECT id, email, password_hash, created_at, last_login, owned_operators, want_to_use FROM accounts`
  );
  const out: Record<string, LocalAccount> = {};
  for (const row of res.rows) {
    const acc = rowToAccount(row);
    out[acc.email] = acc;
  }
  return out;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ NULL,
  owned_operators JSONB NULL,
  want_to_use JSONB NULL,
  UNIQUE (email)
);
`;

export async function initializeDbConnection(): Promise<void> {
  try {
    console.log('🔄 Initializing Heroku Postgres account storage...');
    const start = Date.now();
    const p = getPool();
    await p.query(CREATE_TABLE_SQL);
    const countRes = await p.query('SELECT COUNT(*)::int AS c FROM accounts');
    const count = countRes.rows[0]?.c ?? 0;
    console.log(`✅ Postgres account storage ready in ${Date.now() - start}ms (${count} accounts)`);
  } catch (err: unknown) {
    console.error('❌ Failed to initialize Postgres account storage:', err);
    console.warn('⚠️  Server will continue; account features may be unavailable.');
  }
}

export async function closeDbConnection(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  console.log('Postgres account storage closed');
}
