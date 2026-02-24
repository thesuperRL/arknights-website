/**
 * Sanitize and validate all inputs that are passed to SQL (or stored and later used in DB).
 * All DB access uses parameterized queries; these helpers enforce format and length limits
 * and strip control characters to prevent injection and abuse.
 */

const MAX_IDENTIFIER_LENGTH = 255;
const MAX_OPERATOR_ID_LENGTH = 64;
const MAX_CHANGELOG_STRING = 512;
const MAX_CHANGELOG_FILENAME = 256;
const MAX_CHANGELOG_JUSTIFICATION = 2000;
const MAX_CHANGELOG_TIER_LEVEL = 32;

/** Safe chars for login identifier: alphanumeric, underscore, hyphen, dot, @ (for email). */
const IDENTIFIER_SAFE = /^[a-zA-Z0-9_.@-]+$/;

/** Username (register): alphanumeric, underscore, hyphen only; 2–64 chars. */
const USERNAME_SAFE = /^[a-zA-Z0-9_-]+$/;

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

/** Control chars and null byte - passwords must not contain these. */
const PASSWORD_UNSAFE = /[\x00-\x1F\x7F]/;

/** Operator IDs: alphanumeric, underscore, hyphen only. */
const OPERATOR_ID_SAFE = /^[a-zA-Z0-9_-]+$/;

/** Strip control characters and null bytes from a string. */
function stripControlChars(s: string): string {
  return s.replace(/[\x00-\x1F\x7F]/g, '');
}

/**
 * Sanitize a login identifier (username or email). Used for session lookup and login.
 * Returns normalized string or empty string if invalid.
 */
export function sanitizeIdentifier(value: unknown): string {
  if (value == null || typeof value !== 'string') return '';
  const trimmed = stripControlChars(value).trim().toLowerCase();
  if (trimmed.length > MAX_IDENTIFIER_LENGTH) return trimmed.slice(0, MAX_IDENTIFIER_LENGTH);
  if (!IDENTIFIER_SAFE.test(trimmed)) return '';
  return trimmed;
}

/**
 * Sanitize username for registration. Stricter than identifier (no dot/at). Returns null if invalid.
 */
export function sanitizeUsername(value: unknown): string | null {
  if (value == null || typeof value !== 'string') return null;
  const trimmed = stripControlChars(value).trim();
  if (trimmed.length < 2 || trimmed.length > 64) return null;
  if (!USERNAME_SAFE.test(trimmed)) return null;
  return trimmed;
}

/**
 * Validate password for register/login. Does not modify the string; rejects if invalid.
 * - Must be string, 8–128 chars, no control characters or null bytes.
 * Returns the password as-is or null if invalid.
 */
export function validatePassword(value: unknown): string | null {
  if (value == null || typeof value !== 'string') return null;
  if (PASSWORD_UNSAFE.test(value)) return null;
  if (value.length < MIN_PASSWORD_LENGTH || value.length > MAX_PASSWORD_LENGTH) return null;
  return value;
}

/**
 * Sanitize operator ID. Used for owned/want-to-use lists. Returns null if invalid.
 */
export function sanitizeOperatorId(value: unknown): string | null {
  if (value == null || typeof value !== 'string') return null;
  const trimmed = stripControlChars(value).trim();
  if (trimmed.length === 0 || trimmed.length > MAX_OPERATOR_ID_LENGTH) return null;
  if (!OPERATOR_ID_SAFE.test(trimmed)) return null;
  return trimmed;
}

/**
 * Sanitize a generic string for changelog/text columns: trim, strip control chars, truncate.
 */
export function sanitizeChangelogString(value: unknown, maxLength: number = MAX_CHANGELOG_STRING): string {
  if (value == null) return '';
  const s = stripControlChars(String(value)).trim();
  return s.length > maxLength ? s.slice(0, maxLength) : s;
}

/**
 * Sanitize changelog entry fields before insert. Mutates and returns the entry.
 */
export function sanitizeChangelogEntry(entry: {
  date: string;
  time?: string;
  operatorId: string;
  operatorName: string;
  niche: string;
  nicheFilename: string;
  oldTier: string | null;
  newTier: string | null;
  oldLevel: string;
  newLevel: string;
  justification: string;
  global?: boolean;
}): typeof entry {
  return {
    ...entry,
    date: sanitizeChangelogString(entry.date, 10),
    time: entry.time != null ? sanitizeChangelogString(entry.time, 5) : undefined,
    operatorId: sanitizeChangelogString(entry.operatorId, MAX_OPERATOR_ID_LENGTH),
    operatorName: sanitizeChangelogString(entry.operatorName, MAX_CHANGELOG_STRING),
    niche: sanitizeChangelogString(entry.niche, MAX_CHANGELOG_STRING),
    nicheFilename: sanitizeChangelogString(entry.nicheFilename, MAX_CHANGELOG_FILENAME),
    oldTier: entry.oldTier != null ? sanitizeChangelogString(entry.oldTier, MAX_CHANGELOG_TIER_LEVEL) : null,
    newTier: entry.newTier != null ? sanitizeChangelogString(entry.newTier, MAX_CHANGELOG_TIER_LEVEL) : null,
    oldLevel: sanitizeChangelogString(entry.oldLevel, MAX_CHANGELOG_TIER_LEVEL),
    newLevel: sanitizeChangelogString(entry.newLevel, MAX_CHANGELOG_TIER_LEVEL),
    justification: sanitizeChangelogString(entry.justification, MAX_CHANGELOG_JUSTIFICATION),
    global: entry.global,
  };
}

/**
 * Sanitize array of operator IDs (e.g. lockedOperatorIds). Drops invalid entries.
 */
export function sanitizeOperatorIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const id = sanitizeOperatorId(item);
    if (id != null) out.push(id);
  }
  return out;
}
