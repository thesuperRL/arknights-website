/**
 * Authentication utilities for ArkPRTS API (EN/JP/KR) and Skland API (CN) integration
 */

import axios from 'axios';

const ARKPRTS_API_BASE = 'https://arkprts.ashlen.top';
const SKLAND_API_BASE = 'https://zonai.skland.com/api/v1';

export type ServerType = 'en' | 'jp' | 'kr' | 'cn';

export interface AuthCredentials {
  server: string;
  channeluid?: string; // For ArkPRTS
  token?: string; // For ArkPRTS
  cred?: string; // For Skland
  uid?: string; // For Skland
}

export interface UserSession {
  email: string;
  server?: string; // Optional for local accounts
  accountType: 'arknights' | 'local'; // Type of account
  credentials?: AuthCredentials; // Only for Arknights accounts
  userData?: any; // Only for Arknights accounts
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

/**
 * Send login code via ArkPRTS API
 */
export async function sendLoginCode(email: string, server: string = 'en'): Promise<void> {
  try {
    const response = await axios.get(`${ARKPRTS_API_BASE}/api/login/sendcode`, {
      params: { email, server },
      validateStatus: (status) => status < 500 // Don't throw on 4xx errors
    });
    
    if (response.status !== 200) {
      const errorMsg = response.data?.error || response.data?.message || `HTTP ${response.status}`;
      throw new Error(errorMsg);
    }
    
    // Check if response is actually JSON
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      console.error('Unexpected response type:', contentType);
      console.error('Response data:', response.data?.substring?.(0, 200) || response.data);
      throw new Error('Server returned invalid response format');
    }
  } catch (error: any) {
    if (error.response) {
      // Axios error with response
      const status = error.response.status;
      const data = error.response.data;
      if (typeof data === 'string' && data.includes('<!DOCTYPE')) {
        throw new Error('Server returned HTML instead of JSON. The API may be down or the endpoint is incorrect.');
      }
      throw new Error(data?.error || data?.message || `HTTP ${status}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Login via ArkPRTS API
 */
export async function login(email: string, code: string, server: string = 'en'): Promise<AuthCredentials> {
  try {
    const response = await axios.get(`${ARKPRTS_API_BASE}/api/login`, {
      params: { email, code, server },
      validateStatus: (status) => status < 500
    });
    
    // Check if response is actually JSON
    const contentType = response.headers['content-type'] || '';
    if (!contentType.includes('application/json')) {
      console.error('Unexpected response type:', contentType);
      console.error('Response data:', typeof response.data === 'string' ? response.data.substring(0, 200) : response.data);
      throw new Error('Server returned invalid response format');
    }
    
    if (response.status !== 200 || !response.data) {
      const errorMsg = response.data?.error || response.data?.message || `HTTP ${response.status}`;
      throw new Error(errorMsg);
    }

    if (!response.data.channeluid || !response.data.token) {
      throw new Error('Invalid login response: missing credentials');
    }

    return {
      server: response.data.server || server,
      channeluid: response.data.channeluid,
      token: response.data.token
    };
  } catch (error: any) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      if (typeof data === 'string' && data.includes('<!DOCTYPE')) {
        throw new Error('Server returned HTML instead of JSON. The API may be down or the endpoint is incorrect.');
      }
      throw new Error(data?.error || data?.message || `HTTP ${status}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get user data from ArkPRTS API or Skland API based on server
 */
export async function getUserData(credentials: AuthCredentials): Promise<any> {
  if (credentials.server === 'cn') {
    // Use Skland API
    if (!credentials.cred || !credentials.uid) {
      throw new Error('Missing Skland credentials');
    }
    return await getSklandUserData(credentials.cred, credentials.uid);
  } else {
    // Use ArkPRTS API
    try {
      const response = await axios.get(`${ARKPRTS_API_BASE}/api/raw/user`, {
        params: {
          server: credentials.server,
          channeluid: credentials.channeluid,
          token: credentials.token
        },
        validateStatus: (status) => status < 500
      });

      // Check if response is actually JSON
      const contentType = response.headers['content-type'] || '';
      if (!contentType.includes('application/json')) {
        console.error('Unexpected response type:', contentType);
        console.error('Response data:', typeof response.data === 'string' ? response.data.substring(0, 200) : response.data);
        throw new Error('Server returned invalid response format');
      }

      if (response.status !== 200) {
        const errorMsg = response.data?.error || response.data?.message || `HTTP ${response.status}`;
        throw new Error(errorMsg);
      }

      return response.data;
    } catch (error: any) {
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        if (typeof data === 'string' && data.includes('<!DOCTYPE')) {
          throw new Error('Server returned HTML instead of JSON. The API may be down or the endpoint is incorrect.');
        }
        throw new Error(data?.error || data?.message || `HTTP ${status}: ${error.message}`);
      }
      throw error;
    }
  }
}

/**
 * Skland API functions
 */

/**
 * Get game bindings from Skland API
 */
export async function getSklandGameBindings(cred: string): Promise<any> {
  try {
    const response = await axios.get(`${SKLAND_API_BASE}/user/auth/info/game-list`, {
      headers: { cred },
      validateStatus: (status) => status < 500
    });

    if (response.status !== 200 || response.data.code !== 0) {
      throw new Error(response.data.message || 'Failed to get game bindings');
    }

    return response.data.data;
  } catch (error: any) {
    if (error.response) {
      const data = error.response.data;
      throw new Error(data?.message || `HTTP ${error.response.status}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get user data from Skland API
 */
export async function getSklandUserData(cred: string, uid: string): Promise<any> {
  try {
    const response = await axios.get(`${SKLAND_API_BASE}/game/player/info`, {
      headers: { cred },
      params: { uid },
      validateStatus: (status) => status < 500
    });

    if (response.status !== 200 || response.data.code !== 0) {
      throw new Error(response.data.message || 'Failed to fetch user data');
    }

    return response.data.data;
  } catch (error: any) {
    if (error.response) {
      const data = error.response.data;
      throw new Error(data?.message || `HTTP ${error.response.status}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Map character ID to our operator ID format
 * ArkPRTS uses character IDs like "char_001_amiya", we use "amiya"
 * Skland uses character IDs like "char_001_amiya" or just "amiya"
 */
export function mapCharacterIdToOperatorId(charId: string): string {
  // Remove "char_" prefix and number prefix (e.g., "char_001_amiya" -> "amiya")
  const match = charId.match(/char_\d+_(.+)/);
  if (match) {
    return match[1];
  }
  // If it doesn't match, try removing just "char_" prefix
  if (charId.startsWith('char_')) {
    return charId.replace(/^char_\d+_/, '').replace(/^char_/, '');
  }
  return charId;
}

