/**
 * Account storage system - currently uses JSON file, ready for SQL migration
 */

import * as fs from 'fs';
import * as path from 'path';
import bcrypt from 'bcrypt';

export interface LocalAccount {
  id: string;
  email: string;
  passwordHash: string; // bcrypt hash
  createdAt: string; // ISO date string
  lastLogin?: string; // ISO date string
  ownedOperators?: string[]; // Array of operator IDs
}

interface AccountStorage {
  accounts: Record<string, LocalAccount>; // email -> account
}

const ACCOUNTS_FILE = path.join(__dirname, '../data/accounts.json');

/**
 * Initialize accounts file if it doesn't exist
 */
function ensureAccountsFile(): void {
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    const dir = path.dirname(ACCOUNTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const initialData: AccountStorage = { accounts: {} };
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(initialData, null, 2));
  }
}

/**
 * Load all accounts from storage
 */
export function loadAccounts(): Record<string, LocalAccount> {
  ensureAccountsFile();
  try {
    const content = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
    const data: AccountStorage = JSON.parse(content);
    return data.accounts || {};
  } catch (error) {
    console.error('Error loading accounts:', error);
    return {};
  }
}

/**
 * Save accounts to storage
 */
export function saveAccounts(accounts: Record<string, LocalAccount>): void {
  ensureAccountsFile();
  const data: AccountStorage = { accounts };
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Find account by email
 */
export function findAccountByEmail(email: string): LocalAccount | null {
  const accounts = loadAccounts();
  const normalizedEmail = email.toLowerCase().trim();
  return accounts[normalizedEmail] || null;
}

/**
 * Create a new account
 */
export async function createAccount(email: string, password: string): Promise<LocalAccount> {
  const accounts = loadAccounts();
  const normalizedEmail = email.toLowerCase().trim();

  if (accounts[normalizedEmail]) {
    throw new Error('Account with this email already exists');
  }

  // Hash password
  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const account: LocalAccount = {
    id: `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    email: normalizedEmail,
    passwordHash,
    createdAt: new Date().toISOString(),
    ownedOperators: []
  };

  accounts[normalizedEmail] = account;
  saveAccounts(accounts);

  return account;
}

/**
 * Verify password for an account
 */
export async function verifyPassword(account: LocalAccount, password: string): Promise<boolean> {
  return await bcrypt.compare(password, account.passwordHash);
}

/**
 * Update last login time
 */
export function updateLastLogin(email: string): void {
  const accounts = loadAccounts();
  const normalizedEmail = email.toLowerCase().trim();
  
  if (accounts[normalizedEmail]) {
    accounts[normalizedEmail].lastLogin = new Date().toISOString();
    saveAccounts(accounts);
  }
}

/**
 * Add operator to account's owned operators
 */
export function addOperatorToAccount(email: string, operatorId: string): boolean {
  const accounts = loadAccounts();
  const normalizedEmail = email.toLowerCase().trim();
  
  if (accounts[normalizedEmail]) {
    if (!accounts[normalizedEmail].ownedOperators) {
      accounts[normalizedEmail].ownedOperators = [];
    }
    if (!accounts[normalizedEmail].ownedOperators!.includes(operatorId)) {
      accounts[normalizedEmail].ownedOperators!.push(operatorId);
      saveAccounts(accounts);
      return true;
    }
  }
  
  return false;
}

/**
 * Remove operator from account's owned operators
 */
export function removeOperatorFromAccount(email: string, operatorId: string): boolean {
  const accounts = loadAccounts();
  const normalizedEmail = email.toLowerCase().trim();
  
  if (accounts[normalizedEmail] && accounts[normalizedEmail].ownedOperators) {
    const index = accounts[normalizedEmail].ownedOperators!.indexOf(operatorId);
    if (index > -1) {
      accounts[normalizedEmail].ownedOperators!.splice(index, 1);
      saveAccounts(accounts);
      return true;
    }
  }
  
  return false;
}

/**
 * Get owned operators for an account
 */
export function getOwnedOperators(email: string): string[] {
  const account = findAccountByEmail(email);
  return account?.ownedOperators || [];
}

/**
 * Delete an account (for future use)
 */
export function deleteAccount(email: string): boolean {
  const accounts = loadAccounts();
  const normalizedEmail = email.toLowerCase().trim();
  
  if (accounts[normalizedEmail]) {
    delete accounts[normalizedEmail];
    saveAccounts(accounts);
    return true;
  }
  
  return false;
}

