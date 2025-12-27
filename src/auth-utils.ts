/**
 * Authentication utilities for session management
 */

export interface UserSession {
  email: string;
  lastUpdated?: number;
}

// In-memory session store (in production, use Redis or a database)
const sessions = new Map<string, UserSession>();

/**
 * Generate a session ID
 */
export function generateSessionId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Store a session
 */
export function setSession(sessionId: string, session: UserSession): void {
  sessions.set(sessionId, session);
}

/**
 * Get a session
 */
export function getSession(sessionId: string): UserSession | undefined {
  return sessions.get(sessionId);
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}
