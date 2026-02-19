/**
 * Upload all account data from data/accounts.json to Postgres (Heroku Postgres or any DATABASE_URL).
 *
 * Requires DATABASE_URL in .env (e.g. from Heroku Postgres add-on).
 * Usage: npm run upload:accounts:pg
 */

import dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

interface JsonAccount {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  lastLogin?: string;
  ownedOperators?: string[];
  wantToUse?: string[];
}

interface AccountsData {
  accounts: Record<string, JsonAccount>;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Error: DATABASE_URL is not set. Set it in .env or the environment.');
    process.exit(1);
  }

  const jsonPath = path.join(__dirname, '..', 'data', 'accounts.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`Error: accounts.json not found at ${jsonPath}`);
    process.exit(1);
  }

  const data: AccountsData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const accounts = Object.values(data.accounts);
  console.log(`Found ${accounts.length} account(s) in accounts.json`);

  if (accounts.length === 0) {
    console.log('Nothing to upload.');
    return;
  }

  const pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login TIMESTAMPTZ NULL,
        owned_operators JSONB NULL,
        want_to_use JSONB NULL,
        UNIQUE (email)
      )
    `);

    const upsert = `
      INSERT INTO accounts (email, password_hash, created_at, last_login, owned_operators, want_to_use)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        created_at = EXCLUDED.created_at,
        last_login = EXCLUDED.last_login,
        owned_operators = EXCLUDED.owned_operators,
        want_to_use = EXCLUDED.want_to_use
    `;

    for (const a of accounts) {
      const email = a.email.toLowerCase().trim();
      const createdAt = new Date(a.createdAt);
      const lastLogin = a.lastLogin ? new Date(a.lastLogin) : null;
      const owned = JSON.stringify(a.ownedOperators ?? []);
      const wantToUse = JSON.stringify(a.wantToUse ?? []);
      await pool.query(upsert, [email, a.passwordHash, createdAt, lastLogin, owned, wantToUse]);
      console.log(`  Uploaded: ${email}`);
    }

    const count = await pool.query('SELECT COUNT(*)::int AS c FROM accounts');
    console.log(`\nDone. Total accounts in database: ${count.rows[0].c}`);
  } catch (err) {
    console.error('Upload failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
