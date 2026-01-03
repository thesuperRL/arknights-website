/**
 * Account storage system - SQL Database implementation
 * Migrated from JSON file to Azure SQL Database
 */

import * as sql from 'mssql';
import bcrypt from 'bcrypt';

export interface LocalAccount {
  id: number; // Changed from string to number (INT IDENTITY in SQL)
  email: string;
  passwordHash: string; // bcrypt hash
  createdAt: string; // ISO date string
  lastLogin?: string; // ISO date string
  ownedOperators?: string[]; // Array of operator IDs (stored as JSON)
  wantToUse?: string[]; // Array of operator IDs (stored as JSON)
}

// Database connection pool (singleton)
let pool: sql.ConnectionPool | null = null;

// Cache for column names (to avoid repeated INFORMATION_SCHEMA queries)
let columnNamesCache: Record<string, string> | null = null;

/**
 * Sanitize error messages to remove sensitive server information
 */
function sanitizeErrorMessage(error: any): string {
  let message = error.message || String(error);
  
  // Remove server names and ports from error messages
  message = message.replace(/[a-zA-Z0-9-]+\.database\.windows\.net(?::\d+)?/g, 'SQL server');
  message = message.replace(/Failed to connect to [^ ]+ in (\d+)ms/g, 'Failed to connect to SQL server in $1ms');
  message = message.replace(/ConnectionError: [^:]+: /g, '');
  
  return message;
}

/**
 * Get or create database connection pool
 */
async function getDbPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  // Database configuration from environment variables
  function getDbConfig(): string | sql.config {
    // If connection string is provided, use it
    if (process.env.AZURE_SQL_CONNECTION_STRING) {
      return process.env.AZURE_SQL_CONNECTION_STRING;
    }

    // Otherwise, use individual settings
    let server = process.env.AZURE_SQL_SERVER || '';
    const database = process.env.AZURE_SQL_DATABASE || '';
    const user = process.env.AZURE_SQL_USER || '';
    const password = process.env.AZURE_SQL_PASSWORD || '';
    
    // Handle case where port might be included in server name
    let port = parseInt(process.env.AZURE_SQL_PORT || '1433', 10);
    if (server.includes(':')) {
      const parts = server.split(':');
      server = parts[0];
      if (parts[1] && !process.env.AZURE_SQL_PORT) {
        port = parseInt(parts[1], 10);
      }
    }

    if (!server || !database || !user || !password) {
      throw new Error('Missing required database configuration. Please set AZURE_SQL_SERVER, AZURE_SQL_DATABASE, AZURE_SQL_USER, and AZURE_SQL_PASSWORD environment variables.');
    }

    return {
      server,
      database,
      user,
      password,
      port,
      connectionTimeout: parseInt(process.env.AZURE_SQL_CONNECTION_TIMEOUT || '15000', 10), // 15 seconds (increased from 5)
      requestTimeout: parseInt(process.env.AZURE_SQL_REQUEST_TIMEOUT || '20000', 10), // 20 seconds (increased from 10)
      pool: {
        max: 5, // Reduced from 10 to prevent connection pool exhaustion
        min: 0,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 20000, // 20 seconds to acquire connection
        createTimeoutMillis: 20000, // 20 seconds to create connection
        destroyTimeoutMillis: 5000, // 5 seconds to destroy connection
        reapIntervalMillis: 1000, // Check for idle connections every second
        createRetryIntervalMillis: 200 // Retry every 200ms if connection creation fails
      },
      options: {
        encrypt: true, // Azure SQL requires encryption
        trustServerCertificate: false,
        enableArithAbort: true,
        abortTransactionOnError: true,
        useUTC: false,
        datefirst: 1,
        dateFormat: 'dmy'
      }
    };
  }

  const dbConfig = getDbConfig();
  pool = typeof dbConfig === 'string' 
    ? new sql.ConnectionPool(dbConfig)
    : new sql.ConnectionPool(dbConfig);
  
  try {
    await pool.connect();
    console.log('Database connection established successfully');
    return pool;
  } catch (error: any) {
    const sanitizedMessage = sanitizeErrorMessage(error);
    console.error('Database connection error:', sanitizedMessage);
    pool = null; // Reset pool on error
    
    // Provide helpful error messages without exposing server details
    if (error.code === 'ETIMEOUT' || error.message?.includes('timeout') || error.message?.includes('Failed to connect')) {
      // Extract timeout value if present, otherwise use default
      const timeoutMatch = error.message?.match(/(\d+)ms/);
      const timeout = timeoutMatch ? timeoutMatch[1] : '15000';
      throw new Error(`Failed to connect to SQL server in ${timeout}ms`);
    } else if (error.code === 'ELOGIN' || error.message?.includes('Login failed')) {
      throw new Error(`Database authentication failed. Please check your credentials.`);
    } else {
      throw new Error(`Database connection failed: ${sanitizedMessage}`);
    }
  }
}

/**
 * Parse JSON column safely
 */
function parseJsonColumn(jsonString: string | null): string[] {
  if (!jsonString) return [];
  try {
    const parsed = JSON.parse(jsonString);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Convert database row to LocalAccount
 */
function rowToAccount(row: any, ownedOperatorsCol: string, wantToUseCol: string): LocalAccount {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.passwordHash,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
    lastLogin: row.lastLogin ? new Date(row.lastLogin).toISOString() : undefined,
    ownedOperators: parseJsonColumn(row[ownedOperatorsCol]),
    wantToUse: parseJsonColumn(row[wantToUseCol])
  };
}

/**
 * Get column names from accounts table (cached)
 */
async function getColumnNames(pool: sql.ConnectionPool): Promise<Record<string, string>> {
  // Return cached column names if available
  if (columnNamesCache) {
    return columnNamesCache;
  }

  try {
    // Use a simpler, faster query to get column names
    const query = `
      SELECT TOP 1 * FROM accounts WHERE 1=0
    `;
    const result = await pool.request().query(query);

    const columns: Record<string, string> = {};

    // Extract column names from the result metadata instead of INFORMATION_SCHEMA
    if (result.recordset.columns) {
      for (const colName of Object.keys(result.recordset.columns)) {
        const lowerName = colName.toLowerCase();

        if (lowerName === 'email' || lowerName === 'emailaddress') {
          columns.email = colName;
        } else if (lowerName === 'password' || lowerName === 'passwordhash' || lowerName === 'password_hash') {
          columns.passwordHash = colName;
        } else if (lowerName === 'createdat' || lowerName === 'created_at' || lowerName === 'datecreated') {
          columns.createdAt = colName;
        } else if (lowerName === 'lastlogin' || lowerName === 'last_login' || lowerName === 'datelastlogin') {
          columns.lastLogin = colName;
        } else if (lowerName === 'id') {
          columns.id = colName;
        } else if (lowerName === 'ownedoperators' || lowerName === 'owned_operators') {
          columns.ownedOperators = colName;
        } else if (lowerName === 'wanttouse' || lowerName === 'want_to_use' || lowerName === 'wanttouseoperators' || lowerName === 'want_to_use_operators') {
          columns.wantToUse = colName;
        }
      }
    }

    // Set defaults if not found
    columns.email = columns.email || 'email';
    columns.passwordHash = columns.passwordHash || 'passwordHash';
    columns.createdAt = columns.createdAt || 'createdAt';
    columns.lastLogin = columns.lastLogin || 'lastLogin';
    columns.id = columns.id || 'id';
    columns.ownedOperators = columns.ownedOperators || 'ownedOperators';
    columns.wantToUse = columns.wantToUse || 'wantToUse';

    // Cache the result
    columnNamesCache = columns;
    return columns;
  } catch (error: any) {
    // Fallback to hardcoded defaults if query fails
    console.warn('Failed to get column names from database, using defaults:', error);
    const columns = {
      email: 'email',
      passwordHash: 'passwordHash',
      createdAt: 'createdAt',
      lastLogin: 'lastLogin',
      id: 'id',
      ownedOperators: 'ownedOperators',
      wantToUse: 'wantToUse'
    };
    columnNamesCache = columns;
    return columns;
  }
}

/**
 * Find account by email with optimized query
 */
export async function findAccountByEmail(email: string): Promise<LocalAccount | null> {
  const maxRetries = 2;
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const dbPool = await getDbPool();
      const columns = await getColumnNames(dbPool);
      const normalizedEmail = email.toLowerCase().trim();

      // Use a more efficient query - only select needed columns
      const escapeCol = (col: string) => `[${col}]`;
      const query = `SELECT ${escapeCol(columns.id)}, ${escapeCol(columns.email)}, ${escapeCol(columns.passwordHash)}, ${escapeCol(columns.createdAt)}, ${escapeCol(columns.lastLogin)}, ${escapeCol(columns.ownedOperators)}, ${escapeCol(columns.wantToUse)} FROM accounts WHERE LOWER(${escapeCol(columns.email)}) = LOWER(@email)`;

      const request = dbPool.request();
      request.input('email', sql.NVarChar(255), normalizedEmail);
      const result = await request.query(query);

      if (result.recordset.length === 0) {
        return null;
      }

      return rowToAccount(result.recordset[0], columns.ownedOperators, columns.wantToUse);
    } catch (error: any) {
      lastError = error;
      console.error(`Error finding account by email (attempt ${attempt}/${maxRetries}):`, error.message);

      // If this is a timeout or connection error and we have retries left, wait and retry
      if ((error.code === 'ETIMEOUT' || error.code === 'TIMEOUT' || error.message?.includes('timeout')) && attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
        continue;
      }

      // For other errors or if we're out of retries, throw
      throw error;
    }
  }

  throw lastError;
}

/**
 * Create a new account
 */
export async function createAccount(email: string, password: string): Promise<LocalAccount> {
  try {
    const dbPool = await getDbPool();
    const columns = await getColumnNames(dbPool);
    const normalizedEmail = email.toLowerCase().trim();
    
    // Check if account already exists
    const existing = await findAccountByEmail(normalizedEmail);
    if (existing) {
      throw new Error('Account with this email already exists');
    }
    
    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const createdAt = new Date().toISOString();
    
    const escapeCol = (col: string) => `[${col}]`;
    const insertQuery = `
      INSERT INTO accounts (${escapeCol(columns.email)}, ${escapeCol(columns.passwordHash)}, ${escapeCol(columns.createdAt)}, ${escapeCol(columns.ownedOperators)}, ${escapeCol(columns.wantToUse)})
      OUTPUT INSERTED.${escapeCol(columns.id)}
      VALUES (@email, @passwordHash, @createdAt, @ownedOperators, @wantToUse)
    `;
    
    const request = dbPool.request();
    request.input('email', sql.NVarChar(255), normalizedEmail);
    request.input('passwordHash', sql.NVarChar(sql.MAX), passwordHash);
    request.input('createdAt', sql.DateTime2, new Date(createdAt));
    request.input('ownedOperators', sql.NVarChar(sql.MAX), JSON.stringify([]));
    request.input('wantToUse', sql.NVarChar(sql.MAX), JSON.stringify([]));
    
    const result = await request.query(insertQuery);
    const accountId = result.recordset[0][columns.id];
    
    return {
      id: accountId,
      email: normalizedEmail,
      passwordHash,
      createdAt,
      ownedOperators: [],
      wantToUse: []
    };
  } catch (error) {
    console.error('Error creating account:', error);
    throw error;
  }
}

/**
 * Verify password for an account with timing
 */
export async function verifyPassword(account: LocalAccount, password: string): Promise<boolean> {
  try {
    // Add timing for password verification (should be fast, < 100ms typically)
    const startTime = Date.now();
    const isValid = await bcrypt.compare(password, account.passwordHash);
    const duration = Date.now() - startTime;

    if (duration > 500) {
      console.warn(`Password verification took ${duration}ms, which is unusually slow`);
    }

    return isValid;
  } catch (error) {
    console.error('Error verifying password:', error);
    return false;
  }
}

/**
 * Update last login time (non-blocking)
 */
export async function updateLastLogin(email: string): Promise<void> {
  try {
    const dbPool = await getDbPool();
    const columns = await getColumnNames(dbPool);
    const normalizedEmail = email.toLowerCase().trim();

    const escapeCol = (col: string) => `[${col}]`;
    const updateQuery = `UPDATE accounts SET ${escapeCol(columns.lastLogin)} = @lastLogin WHERE LOWER(${escapeCol(columns.email)}) = LOWER(@email)`;

    const request = dbPool.request();
    request.input('email', sql.NVarChar(255), normalizedEmail);
    request.input('lastLogin', sql.DateTime2, new Date());

    // Execute in background - don't wait for completion
    request.query(updateQuery).catch(error => {
      console.warn('Failed to update last login time (non-critical):', error.message);
    });
  } catch (error: any) {
    // Don't throw error for last login update - it's not critical for login success
    console.warn('Failed to update last login time (non-critical):', error?.message || error);
  }
}

/**
 * Add operator to account's owned operators
 */
export async function addOperatorToAccount(email: string, operatorId: string): Promise<boolean> {
  try {
    const account = await findAccountByEmail(email);
    if (!account) {
      return false;
    }
    
    const ownedOperators = account.ownedOperators || [];
    if (ownedOperators.includes(operatorId)) {
      return false; // Already exists
    }
    
    ownedOperators.push(operatorId);
    
    const dbPool = await getDbPool();
    const columns = await getColumnNames(dbPool);
    const normalizedEmail = email.toLowerCase().trim();
    
    const escapeCol = (col: string) => `[${col}]`;
    const updateQuery = `UPDATE accounts SET ${escapeCol(columns.ownedOperators)} = @ownedOperators WHERE ${escapeCol(columns.email)} = @email`;
    
    const request = dbPool.request();
    request.input('email', sql.NVarChar(255), normalizedEmail);
    request.input('ownedOperators', sql.NVarChar(sql.MAX), JSON.stringify(ownedOperators));
    
    await request.query(updateQuery);
    return true;
  } catch (error) {
    console.error('Error adding operator to account:', error);
    return false;
  }
}

/**
 * Remove operator from account's owned operators
 */
export async function removeOperatorFromAccount(email: string, operatorId: string): Promise<boolean> {
  try {
    const account = await findAccountByEmail(email);
    if (!account || !account.ownedOperators) {
      return false;
    }
    
    const ownedOperators = account.ownedOperators.filter(id => id !== operatorId);
    
    if (ownedOperators.length === account.ownedOperators.length) {
      return false; // Operator not found
    }
    
    const dbPool = await getDbPool();
    const columns = await getColumnNames(dbPool);
    const normalizedEmail = email.toLowerCase().trim();
    
    const escapeCol = (col: string) => `[${col}]`;
    const updateQuery = `UPDATE accounts SET ${escapeCol(columns.ownedOperators)} = @ownedOperators WHERE ${escapeCol(columns.email)} = @email`;
    
    const request = dbPool.request();
    request.input('email', sql.NVarChar(255), normalizedEmail);
    request.input('ownedOperators', sql.NVarChar(sql.MAX), JSON.stringify(ownedOperators));
    
    await request.query(updateQuery);
    return true;
  } catch (error) {
    console.error('Error removing operator from account:', error);
    return false;
  }
}

/**
 * Get owned operators for an account
 */
export async function getOwnedOperators(email: string): Promise<string[]> {
  const account = await findAccountByEmail(email);
  return account?.ownedOperators || [];
}

/**
 * Toggle want to use status for an operator
 */
export async function toggleWantToUse(email: string, operatorId: string): Promise<boolean> {
  try {
    const account = await findAccountByEmail(email);
    if (!account) {
      return false;
    }
    
    const wantToUse = account.wantToUse || [];
    const index = wantToUse.indexOf(operatorId);
    
    if (index > -1) {
      // Remove from want to use
      wantToUse.splice(index, 1);
    } else {
      // Add to want to use
      wantToUse.push(operatorId);
    }
    
    const dbPool = await getDbPool();
    const columns = await getColumnNames(dbPool);
    const normalizedEmail = email.toLowerCase().trim();
    
    const escapeCol = (col: string) => `[${col}]`;
    const updateQuery = `UPDATE accounts SET ${escapeCol(columns.wantToUse)} = @wantToUse WHERE ${escapeCol(columns.email)} = @email`;
    
    const request = dbPool.request();
    request.input('email', sql.NVarChar(255), normalizedEmail);
    request.input('wantToUse', sql.NVarChar(sql.MAX), JSON.stringify(wantToUse));
    
    await request.query(updateQuery);
    return true;
  } catch (error) {
    console.error('Error toggling want to use:', error);
    return false;
  }
}

/**
 * Get want to use operators for an account
 */
export async function getWantToUse(email: string): Promise<string[]> {
  const account = await findAccountByEmail(email);
  return account?.wantToUse || [];
}

/**
 * Delete an account
 */
export async function deleteAccount(email: string): Promise<boolean> {
  try {
    const dbPool = await getDbPool();
    const columns = await getColumnNames(dbPool);
    const normalizedEmail = email.toLowerCase().trim();
    
    const escapeCol = (col: string) => `[${col}]`;
    const deleteQuery = `DELETE FROM accounts WHERE ${escapeCol(columns.email)} = @email`;
    
    const request = dbPool.request();
    request.input('email', sql.NVarChar(255), normalizedEmail);
    
    const result = await request.query(deleteQuery);
    return result.rowsAffected[0] > 0;
  } catch (error) {
    console.error('Error deleting account:', error);
    return false;
  }
}

/**
 * Load all accounts (for migration/backup purposes)
 * @deprecated Use SQL queries directly instead
 */
export async function loadAccounts(): Promise<Record<string, LocalAccount>> {
  try {
    const dbPool = await getDbPool();
    const columns = await getColumnNames(dbPool);
    
    const escapeCol = (col: string) => `[${col}]`;
    const query = `SELECT ${escapeCol(columns.id)}, ${escapeCol(columns.email)}, ${escapeCol(columns.passwordHash)}, ${escapeCol(columns.createdAt)}, ${escapeCol(columns.lastLogin)}, ${escapeCol(columns.ownedOperators)}, ${escapeCol(columns.wantToUse)} FROM accounts`;
    
    const result = await dbPool.request().query(query);
    const accounts: Record<string, LocalAccount> = {};
    
    for (const row of result.recordset) {
      const account = rowToAccount(row, columns.ownedOperators, columns.wantToUse);
      accounts[account.email] = account;
    }
    
    return accounts;
  } catch (error) {
    console.error('Error loading accounts:', error);
    return {};
  }
}

/**
 * Close database connection (for cleanup)
 */
export async function closeDbConnection(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}
