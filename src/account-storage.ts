/**
 * Account storage: Heroku Postgres (or any PostgreSQL via DATABASE_URL).
 * Requires DATABASE_URL to be set. See: https://devcenter.heroku.com/articles/connecting-heroku-postgres
 */

export {
  findAccountByEmail,
  findAccountByUsername,
  createAccount,
  verifyPassword,
  updateLastLogin,
  addOperatorToAccount,
  removeOperatorFromAccount,
  toggleWantToUse,
  getOwnedOperators,
  getWantToUse,
  deleteAccount,
  loadAccounts,
  initializeDbConnection,
  closeDbConnection,
} from './account-storage-pg';
export type { LocalAccount } from './account-storage-pg';
