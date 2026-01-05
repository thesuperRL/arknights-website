/**
 * Account storage system - TEMPORARILY using JSON file instead of SQL Database
 * Original: SQL Database implementation migrated from JSON file
 */

import bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

export interface LocalAccount {
  id: number; // Changed from string to number (INT IDENTITY in SQL)
  email: string;
  passwordHash: string; // bcrypt hash
  createdAt: string; // ISO date string
  lastLogin?: string; // ISO date string
  ownedOperators?: string[]; // Array of operator IDs that are OWNED (in collection)
  wantToUse?: string[]; // Array of operator IDs that are RAISED (max level, deployable) - used as raised operators
}

// JSON account interface (from accounts.json)
interface JsonAccount {
  id: string; // String ID in JSON
  email: string;
  passwordHash: string;
  createdAt: string;
  lastLogin?: string;
  ownedOperators?: string[];
  wantToUse?: string[];
}

// JSON accounts structure
interface AccountsJson {
  accounts: Record<string, JsonAccount>;
}

// Cache for accounts data
let accountsCache: Record<string, LocalAccount> | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5000; // 5 seconds

// Path to accounts JSON file
const ACCOUNTS_JSON_PATH = path.join(__dirname, '../data/accounts.json');

/**
 * Load accounts from JSON file
 */
function loadAccountsFromJson(): Record<string, LocalAccount> {
  try {
    if (fs.existsSync(ACCOUNTS_JSON_PATH)) {
      const content = fs.readFileSync(ACCOUNTS_JSON_PATH, 'utf-8');
      const jsonData: AccountsJson = JSON.parse(content);

      const accounts: Record<string, LocalAccount> = {};
      for (const [email, jsonAccount] of Object.entries(jsonData.accounts)) {
        accounts[email] = {
          id: parseInt(jsonAccount.id.split('_').pop() || '0', 36), // Convert string ID to number
          email: jsonAccount.email,
          passwordHash: jsonAccount.passwordHash,
          createdAt: jsonAccount.createdAt,
          lastLogin: jsonAccount.lastLogin,
          ownedOperators: jsonAccount.ownedOperators || [],
          wantToUse: jsonAccount.wantToUse || []
        };
      }
      return accounts;
    }
  } catch (error) {
    console.error('Error loading accounts from JSON:', error);
  }
  return {};
}

/**
 * Save accounts to JSON file
 */
function saveAccountsToJson(accounts: Record<string, LocalAccount>): void {
  try {
    const jsonData: AccountsJson = { accounts: {} };

    for (const [email, account] of Object.entries(accounts)) {
      jsonData.accounts[email] = {
        id: `local_${account.createdAt.replace(/[-:]/g, '').slice(0, -5)}_${account.id.toString(36)}`,
        email: account.email,
        passwordHash: account.passwordHash,
        createdAt: account.createdAt,
        lastLogin: account.lastLogin,
        ownedOperators: account.ownedOperators || [],
        wantToUse: account.wantToUse || []
      };
    }

    const dir = path.dirname(ACCOUNTS_JSON_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(ACCOUNTS_JSON_PATH, JSON.stringify(jsonData, null, 2));
  } catch (error) {
    console.error('Error saving accounts to JSON:', error);
  }
}

/**
 * Get cached accounts or reload from JSON
 */
function getAccountsCache(): Record<string, LocalAccount> {
  const now = Date.now();
  if (!accountsCache || (now - cacheTimestamp) > CACHE_DURATION) {
    accountsCache = loadAccountsFromJson();
    cacheTimestamp = now;
  }
  return accountsCache;
}

/**
 * Invalidate cache
 */
function invalidateCache(): void {
  accountsCache = null;
}

// Database connection pool (singleton) - REMOVED: Using JSON storage instead
// let pool: sql.ConnectionPool | null = null;

// Cache for column names (to avoid repeated INFORMATION_SCHEMA queries) - REMOVED: Using JSON storage instead
// let columnNamesCache: Record<string, string> | null = null;

// REMOVED: SQL-related helper functions (parseJsonColumn, rowToAccount, getColumnNames) - using JSON storage instead

/**
 * Find account by email - JSON implementation
 */
export async function findAccountByEmail(email: string): Promise<LocalAccount | null> {
  try {
    const accounts = getAccountsCache();
    const normalizedEmail = email.toLowerCase().trim();
    return accounts[normalizedEmail] || null;
  } catch (error: any) {
    console.error('Error finding account by email:', error.message);
    throw error;
  }
}

/**
 * Create a new account - JSON implementation
 */
export async function createAccount(email: string, password: string): Promise<LocalAccount> {
  try {
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
    const accountId = Math.floor(Math.random() * 1000000); // Simple ID generation

    const newAccount: LocalAccount = {
      id: accountId,
      email: normalizedEmail,
      passwordHash,
      createdAt,
      ownedOperators: [],
      wantToUse: []
    };

    // Load existing accounts, add new one, and save
    const accounts = getAccountsCache();
    accounts[normalizedEmail] = newAccount;
    saveAccountsToJson(accounts);
    invalidateCache(); // Force reload on next access

    return newAccount;
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
 * Update last login time - JSON implementation (non-blocking)
 */
export async function updateLastLogin(email: string): Promise<void> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const accounts = getAccountsCache();

    if (accounts[normalizedEmail]) {
      accounts[normalizedEmail].lastLogin = new Date().toISOString();
      saveAccountsToJson(accounts);
      invalidateCache();
    }
  } catch (error: any) {
    // Don't throw error for last login update - it's not critical for login success
    console.warn('Failed to update last login time (non-critical):', error?.message || error);
  }
}

/**
 * Add operator to account's owned operators - JSON implementation
 */
export async function addOperatorToAccount(email: string, operatorId: string): Promise<boolean> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const accounts = getAccountsCache();

    const account = accounts[normalizedEmail];
    if (!account) {
      return false;
    }

    const ownedOperators = account.ownedOperators || [];
    if (ownedOperators.includes(operatorId)) {
      return false; // Already exists
    }

    ownedOperators.push(operatorId);
    saveAccountsToJson(accounts);
    invalidateCache();
    return true;
  } catch (error) {
    console.error('Error adding operator to account:', error);
    return false;
  }
}

/**
 * Remove operator from account's owned operators - JSON implementation
 */
export async function removeOperatorFromAccount(email: string, operatorId: string): Promise<boolean> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const accounts = getAccountsCache();

    const account = accounts[normalizedEmail];
    if (!account || !account.ownedOperators) {
      return false;
    }

    const ownedOperators = account.ownedOperators.filter(id => id !== operatorId);

    if (ownedOperators.length === account.ownedOperators.length) {
      return false; // Operator not found
    }

    account.ownedOperators = ownedOperators;
    saveAccountsToJson(accounts);
    invalidateCache();
    return true;
  } catch (error) {
    console.error('Error removing operator from account:', error);
    return false;
  }
}

/**
 * Get owned operators for an account - JSON implementation
 */
export async function getOwnedOperators(email: string): Promise<string[]> {
  const account = await findAccountByEmail(email);
  return account?.ownedOperators || [];
}

/**
 * Toggle want to use status for an operator - JSON implementation
 */
export async function toggleWantToUse(email: string, operatorId: string): Promise<boolean> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const accounts = getAccountsCache();

    const account = accounts[normalizedEmail];
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

    account.wantToUse = wantToUse;
    saveAccountsToJson(accounts);
    invalidateCache();
    return true;
  } catch (error) {
    console.error('Error toggling want to use:', error);
    return false;
  }
}

/**
 * Get want to use operators for an account - JSON implementation
 */
export async function getWantToUse(email: string): Promise<string[]> {
  const account = await findAccountByEmail(email);
  return account?.wantToUse || [];
}

/**
 * Delete an account - JSON implementation
 */
export async function deleteAccount(email: string): Promise<boolean> {
  try {
    const normalizedEmail = email.toLowerCase().trim();
    const accounts = getAccountsCache();

    if (accounts[normalizedEmail]) {
      delete accounts[normalizedEmail];
      saveAccountsToJson(accounts);
      invalidateCache();
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting account:', error);
    return false;
  }
}

/**
 * Load all accounts (for migration/backup purposes) - JSON implementation
 * @deprecated Use JSON file directly instead
 */
export async function loadAccounts(): Promise<Record<string, LocalAccount>> {
  try {
    return getAccountsCache();
  } catch (error) {
    console.error('Error loading accounts:', error);
    return {};
  }
}

/**
 * Initialize JSON account storage at startup
 */
export async function initializeDbConnection(): Promise<void> {
  try {
    console.log('🔄 Initializing JSON account storage...');
    const startTime = Date.now();

    // Test loading accounts from JSON
    const accounts = loadAccountsFromJson();
    const accountCount = Object.keys(accounts).length;

    const duration = Date.now() - startTime;
    console.log(`✅ JSON account storage initialized successfully in ${duration}ms (${accountCount} accounts loaded)`);
  } catch (error: any) {
    console.error('❌ Failed to initialize JSON account storage:', error);
    console.warn('⚠️  Server will continue to run, but account features may be unavailable');
    // Don't throw - allow server to start even if JSON is unavailable
  }
}

/**
 * Close JSON account storage (for cleanup)
 */
export async function closeDbConnection(): Promise<void> {
  // No cleanup needed for JSON storage
  console.log('JSON account storage closed');
}
