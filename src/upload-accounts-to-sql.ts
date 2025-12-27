/**
 * Script to upload all account data from accounts.json to Azure SQL Database
 * 
 * Database connection is configured via environment variables in .env file:
 * - AZURE_SQL_SERVER: Azure SQL server name (e.g., myserver.database.windows.net) - do NOT include port (required)
 * - AZURE_SQL_DATABASE: Database name (required)
 * - AZURE_SQL_USER: Database user (required)
 * - AZURE_SQL_PASSWORD: Database password (required)
 * - AZURE_SQL_PORT: Database port (default: 1433)
 * - CLEAR_EXISTING: Set to 'false' to preserve existing data (default: 'true', clears existing data)
 * 
 * Alternative: You can also use a connection string:
 * - AZURE_SQL_CONNECTION_STRING: Full connection string (overrides other settings)
 * 
 * Usage:
 *   npm run upload:accounts
 * 
 * Environment variables are loaded from .env file. See .env.example for a template.
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';

// Azure SQL Database client - requires: npm install mssql
import * as sql from 'mssql';

interface LocalAccount {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
  lastLogin?: string;
  ownedOperators?: string[];
  wantToUse?: string[];
}

interface AccountsData {
  accounts: {
    [email: string]: LocalAccount;
  };
}

// Database configuration from environment variables
function getDbConfig(): string | sql.config {
  // If connection string is provided, return it as a string
  if (process.env.AZURE_SQL_CONNECTION_STRING) {
    return process.env.AZURE_SQL_CONNECTION_STRING;
  }

  // Otherwise, use individual settings
  let server = process.env.AZURE_SQL_SERVER || '';
  const database = process.env.AZURE_SQL_DATABASE || '';
  const user = process.env.AZURE_SQL_USER || '';
  const password = process.env.AZURE_SQL_PASSWORD || '';
  
  // Handle case where port might be included in server name (e.g., server:1433)
  let port = parseInt(process.env.AZURE_SQL_PORT || '1433', 10);
  if (server.includes(':')) {
    const parts = server.split(':');
    server = parts[0];
    if (parts[1] && !process.env.AZURE_SQL_PORT) {
      port = parseInt(parts[1], 10);
    }
  }

  if (!server || !database || !user || !password) {
    console.error('Error: Missing required database configuration');
    console.error('Please set the following environment variables:');
    console.error('  AZURE_SQL_SERVER - Azure SQL server (e.g., myserver.database.windows.net) (required)');
    console.error('  AZURE_SQL_DATABASE - Database name (required)');
    console.error('  AZURE_SQL_USER - Database user (required)');
    console.error('  AZURE_SQL_PASSWORD - Database password (required)');
    console.error('\nOptional variables:');
    console.error('  AZURE_SQL_PORT - Database port (default: 1433)');
    console.error('\nOr use a connection string:');
    console.error('  AZURE_SQL_CONNECTION_STRING - Full connection string (overrides other settings)');
    process.exit(1);
  }

  return {
    server,
    database,
    user,
    password,
    port,
    options: {
      encrypt: true, // Azure SQL requires encryption
      trustServerCertificate: false,
      enableArithAbort: true
    }
  };
}

const dbConfig = getDbConfig();

// Note: accounts table should already exist with id as INT IDENTITY(1,1)
// ownedOperators and wantToUse are JSON columns in the accounts table

async function verifyAccountsTable(pool: sql.ConnectionPool): Promise<void> {
  console.log('Verifying accounts table exists...');
  const result = await pool.request().query(`
    SELECT COUNT(*) as count 
    FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_NAME = 'accounts'
  `);
  if (result.recordset[0].count === 0) {
    throw new Error('Accounts table does not exist in the database');
  }
  console.log('Accounts table verified');
}

async function getAccountsTableColumns(pool: sql.ConnectionPool): Promise<Record<string, string>> {
  // Query the actual column names and data types from the accounts table
  const query = `
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'accounts'
    ORDER BY ORDINAL_POSITION
  `;
  const result = await pool.request().query(query);
  const columns: Record<string, string> = {};
  let passwordHashType: string | null = null;
  let passwordHashMaxLength: number | null = null;
  
  for (const row of result.recordset) {
    const colName = row.COLUMN_NAME;
    const dataType = row.DATA_TYPE;
    const maxLength = row.CHARACTER_MAXIMUM_LENGTH;
    
    // Map common column names (case-insensitive matching)
    const lowerName = colName.toLowerCase();
    if (lowerName === 'email' || lowerName === 'emailaddress') {
      columns.email = colName;
    } else if (lowerName === 'password' || lowerName === 'passwordhash' || lowerName === 'password_hash') {
      columns.passwordHash = colName;
      passwordHashType = dataType;
      passwordHashMaxLength = maxLength;
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
  
  // Warn if passwordHash column is too small for bcrypt (which is 60 characters)
  if (passwordHashType !== null) {
    console.log(`  passwordHash column: type=${passwordHashType}, maxLength=${passwordHashMaxLength}`);
    if (passwordHashMaxLength !== null && passwordHashMaxLength < 60) {
      console.warn(`  ⚠️  WARNING: passwordHash column max length (${passwordHashMaxLength}) is less than bcrypt hash length (60).`);
      console.warn(`     The column needs to be resized to at least NVARCHAR(60) or NVARCHAR(MAX) to store bcrypt hashes.`);
    }
  }
  
  return columns;
}

async function clearExistingData(pool: sql.ConnectionPool, columns: Record<string, string>): Promise<void> {
  console.log('Clearing existing operator data from accounts table...');
  const escapeCol = (col: string) => `[${col}]`;
  const ownedOperatorsCol = columns.ownedOperators || 'ownedOperators';
  const wantToUseCol = columns.wantToUse || 'wantToUse';
  
  // Update all accounts to set JSON columns to null
  await pool.request().query(`
    UPDATE accounts 
    SET ${escapeCol(ownedOperatorsCol)} = NULL, 
        ${escapeCol(wantToUseCol)} = NULL
  `);
  console.log('Existing operator data cleared');
}

async function insertAccount(pool: sql.ConnectionPool, account: LocalAccount, columns: Record<string, string>): Promise<number> {
  // Build the MERGE statement using actual column names from the database
  const emailCol = columns.email || 'email';
  const passwordHashCol = columns.passwordHash || 'passwordHash';
  const createdAtCol = columns.createdAt || 'createdAt';
  const lastLoginCol = columns.lastLogin || 'lastLogin';
  const ownedOperatorsCol = columns.ownedOperators || 'ownedOperators';
  const wantToUseCol = columns.wantToUse || 'wantToUse';
  const idCol = columns.id || 'id';
  
  // Escape column names with brackets for SQL Server
  const escapeCol = (col: string) => `[${col}]`;
  
  // Convert arrays to JSON strings for SQL Server JSON columns
  const ownedOperatorsJson = account.ownedOperators ? JSON.stringify(account.ownedOperators) : null;
  const wantToUseJson = account.wantToUse ? JSON.stringify(account.wantToUse) : null;
  
  // Build the MERGE statement dynamically with proper column escaping
  const mergeAccountSQL = `
    MERGE accounts AS target
    USING (SELECT @email AS email_val, @password_hash AS password_hash_val, @created_at AS created_at_val, @last_login AS last_login_val, @owned_operators AS owned_operators_val, @want_to_use AS want_to_use_val) AS source
    ON target.${escapeCol(emailCol)} = source.email_val
    WHEN MATCHED THEN
      UPDATE SET 
        ${escapeCol(passwordHashCol)} = source.password_hash_val,
        ${escapeCol(createdAtCol)} = source.created_at_val,
        ${escapeCol(lastLoginCol)} = source.last_login_val,
        ${escapeCol(ownedOperatorsCol)} = source.owned_operators_val,
        ${escapeCol(wantToUseCol)} = source.want_to_use_val
    WHEN NOT MATCHED THEN
      INSERT (${escapeCol(emailCol)}, ${escapeCol(passwordHashCol)}, ${escapeCol(createdAtCol)}, ${escapeCol(lastLoginCol)}, ${escapeCol(ownedOperatorsCol)}, ${escapeCol(wantToUseCol)})
      VALUES (source.email_val, source.password_hash_val, source.created_at_val, source.last_login_val, source.owned_operators_val, source.want_to_use_val);
  `;

  const request = pool.request();
  request.input('email', sql.NVarChar(255), account.email);
  // Use NVarChar(MAX) for passwordHash to handle bcrypt hashes which can be up to 60 characters
  request.input('password_hash', sql.NVarChar(sql.MAX), account.passwordHash);
  request.input('created_at', sql.DateTime2, new Date(account.createdAt));
  request.input('last_login', sql.DateTime2, account.lastLogin ? new Date(account.lastLogin) : null);
  request.input('owned_operators', sql.NVarChar(sql.MAX), ownedOperatorsJson);
  request.input('want_to_use', sql.NVarChar(sql.MAX), wantToUseJson);
  
  await request.query(mergeAccountSQL);
  
  // Get the account id (whether it was inserted or updated)
  const getAccountIdRequest = pool.request();
  getAccountIdRequest.input('email', sql.NVarChar(255), account.email);
  const result = await getAccountIdRequest.query(`SELECT ${escapeCol(idCol)} FROM accounts WHERE ${escapeCol(emailCol)} = @email`);
  const accountId = result.recordset[0][idCol];
  return accountId;
}


async function uploadAccounts(): Promise<void> {
  // Read accounts.json
  const accountsFilePath = path.join(__dirname, '..', 'data', 'accounts.json');
  
  if (!fs.existsSync(accountsFilePath)) {
    console.error(`Error: accounts.json not found at ${accountsFilePath}`);
    process.exit(1);
  }

  console.log(`Reading accounts from ${accountsFilePath}...`);
  const accountsData: AccountsData = JSON.parse(fs.readFileSync(accountsFilePath, 'utf-8'));
  
  const accounts = Object.values(accountsData.accounts);
  console.log(`Found ${accounts.length} account(s) to upload`);

  if (accounts.length === 0) {
    console.log('No accounts to upload');
    return;
  }

  // Create database connection pool
  const pool = typeof dbConfig === 'string' 
    ? new sql.ConnectionPool(dbConfig)
    : new sql.ConnectionPool(dbConfig);
  
  try {
    // Connect to database
    const serverName = typeof dbConfig === 'string' 
      ? dbConfig.split('Server=')[1]?.split(';')[0] || 'Azure SQL'
      : dbConfig.server;
    const databaseName = typeof dbConfig === 'string'
      ? dbConfig.split('Database=')[1]?.split(';')[0] || 'database'
      : dbConfig.database;
    console.log(`Connecting to Azure SQL Database: ${databaseName} on ${serverName}...`);
    
    await pool.connect();
    console.log('Connected successfully');

    // Verify accounts table exists
    await verifyAccountsTable(pool);

    // Detect actual column names from the accounts table
    console.log('Detecting column names from accounts table...');
    const columns = await getAccountsTableColumns(pool);
    console.log('Detected columns:', columns);

    // Ask user if they want to clear existing data (optional - you can remove this if you want to always clear)
    // For now, we'll clear existing data by default
    const shouldClear = process.env.CLEAR_EXISTING !== 'false';
    if (shouldClear) {
      await clearExistingData(pool, columns);
    }

    // Upload accounts
    console.log('\nUploading accounts...');
    for (const account of accounts) {
      console.log(`  Uploading account: ${account.email}`);
      
      const accountId = await insertAccount(pool, account, columns);
      console.log(`    - Account ID: ${accountId}`);
      
      if (account.ownedOperators && account.ownedOperators.length > 0) {
        console.log(`    - Added ${account.ownedOperators.length} owned operators to JSON column`);
      }
      
      if (account.wantToUse && account.wantToUse.length > 0) {
        console.log(`    - Added ${account.wantToUse.length} want-to-use operators to JSON column`);
      }
    }

    console.log('\n✅ Successfully uploaded all accounts to the database!');
    
    // Print summary
    const result = await pool.request().query('SELECT COUNT(*) as count FROM accounts');
    console.log(`\nTotal accounts in database: ${result.recordset[0].count}`);

  } catch (error: any) {
    console.error('Error uploading accounts:', error);
    throw error;
  } finally {
    await pool.close();
    console.log('\nDatabase connection closed');
  }
}

// Run the script
uploadAccounts()
  .then(() => {
    console.log('\nScript completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nScript failed:', error);
    process.exit(1);
  });

