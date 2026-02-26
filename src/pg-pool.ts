/**
 * Shared PostgreSQL connection pool for account-storage, team-data, and changelog.
 * One pool reduces connection usage under concurrent load.
 */

import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000, // fail fast when DB unreachable (e.g. remote Heroku from local)
      statement_timeout: 30000, // 30s max per query so one slow query doesn't hold a connection
    });
    pool.on('error', (err) => {
      console.error('Postgres pool error (connection may be lost):', err.message);
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
