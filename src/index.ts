/**
 * Main entry point for the Arknights website
 */

import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import { loadAllNicheLists, loadNicheList } from './niche-list-utils';
import { sendLoginCode, login, getUserData, generateSessionId, setSession, getSession, deleteSession, mapCharacterIdToOperatorId, getSklandGameBindings, getSklandUserData } from './auth-utils';
import { createAccount, findAccountByEmail, verifyPassword, updateLastLogin, addOperatorToAccount, removeOperatorFromAccount } from './account-storage';
import * as fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cookieParser());

// Serve static files from the public directory (React build output)
app.use(express.static(path.join(__dirname, '../public')));
// Serve images and other assets
app.use('/images', express.static(path.join(__dirname, '../public/images')));

// API route to get all niche lists
app.get('/api/niche-lists', (_req, res) => {
  try {
    const nicheLists = loadAllNicheLists();
    const niches = Object.keys(nicheLists).map(niche => ({
      niche,
      description: nicheLists[niche].description || '',
      lastUpdated: nicheLists[niche].lastUpdated || ''
    }));
    res.json(niches);
  } catch (error) {
    console.error('Error loading niche lists:', error);
    res.status(500).json({ error: 'Failed to load niche lists' });
  }
});

// API route to get a specific niche list
app.get('/api/niche-lists/:niche', (req, res) => {
  try {
    const niche = req.params.niche;
    const operatorList = loadNicheList(niche);
    
    if (!operatorList) {
      res.status(404).json({ error: 'Operator list not found' });
      return;
    }

    // Load operator data to enrich the operator list
    const operatorsData: Record<string, any> = {};
    const rarities = [1, 2, 3, 4, 5, 6];
    
    for (const rarity of rarities) {
      const filePath = path.join(__dirname, '../data', `operators-${rarity}star.json`);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const operators = JSON.parse(content);
        Object.assign(operatorsData, operators);
      }
    }

    // Enrich operator list with operator data
    const enrichedOperatorList = {
      ...operatorList,
      operators: Object.entries(operatorList.operators).map(([operatorId, note]) => ({
        operatorId,
        note,
        operator: operatorsData[operatorId] || null
      }))
    };

    res.json(enrichedOperatorList);
  } catch (error) {
    console.error('Error loading operator list:', error);
    res.status(500).json({ error: 'Failed to load operator list' });
  }
});

// API route to get trash operators
app.get('/api/trash-operators', (_req, res) => {
  try {
    const filePath = path.join(__dirname, '../data/niche-lists', 'trash-operators.json');
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Trash operators not found' });
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const trashData = JSON.parse(content);
    
    // Load operator data to enrich the trash operators list
    const operatorsData: Record<string, any> = {};
    const rarities = [1, 2, 3, 4, 5, 6];
    
    for (const rarity of rarities) {
      const operatorFilePath = path.join(__dirname, '../data', `operators-${rarity}star.json`);
      if (fs.existsSync(operatorFilePath)) {
        const operatorContent = fs.readFileSync(operatorFilePath, 'utf-8');
        const operators = JSON.parse(operatorContent);
        Object.assign(operatorsData, operators);
      }
    }

    // Enrich trash operators list with operator data
    const enrichedTrashList = {
      ...trashData,
      operators: Object.entries(trashData.operators || {}).map(([operatorId, note]) => ({
        operatorId,
        note: note || '',
        operator: operatorsData[operatorId] || null
      }))
    };

    res.json(enrichedTrashList);
  } catch (error) {
    console.error('Error loading trash operators:', error);
    res.status(500).json({ error: 'Failed to load trash operators' });
  }
});

// API route to get a specific operator by ID with their rankings
// This must come BEFORE the rarity route to avoid conflicts
app.get('/api/operators/:id', (req, res) => {
  try {
    const operatorId = req.params.id;
    
    // Load all operators
    const operatorsData: Record<string, any> = {};
    const rarities = [1, 2, 3, 4, 5, 6];
    
    for (const rarity of rarities) {
      const filePath = path.join(__dirname, '../data', `operators-${rarity}star.json`);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const operators = JSON.parse(content);
        Object.assign(operatorsData, operators);
      }
    }

    const operator = operatorsData[operatorId];
    if (!operator) {
      res.status(404).json({ error: 'Operator not found' });
      return;
    }

    // Load all niche lists to find where this operator is listed
    const operatorLists = loadAllNicheLists();
    const rankings: Array<{ niche: string; tier: string; notes?: string }> = [];

    for (const [niche, operatorList] of Object.entries(operatorLists)) {
      if (operatorList.operators && operatorId in operatorList.operators) {
        rankings.push({
          niche: operatorList.niche || niche,
          tier: 'N/A',
          notes: operatorList.operators[operatorId] || undefined
        });
      }
    }

    // Check if operator is in trash list
    const trashFilePath = path.join(__dirname, '../data/niche-lists', 'trash-operators.json');
    if (fs.existsSync(trashFilePath)) {
      const trashContent = fs.readFileSync(trashFilePath, 'utf-8');
      const trashData = JSON.parse(trashContent);
      if (trashData.operators && operatorId in trashData.operators) {
        rankings.push({
          niche: trashData.niche || 'Trash Operators',
          tier: 'N/A',
          notes: trashData.operators[operatorId] || 'No optimal use'
        });
      }
    }

    res.json({
      operator,
      rankings
    });
  } catch (error) {
    console.error('Error loading operator:', error);
    res.status(500).json({ error: 'Failed to load operator' });
  }
});

// API route to get operators by rarity
// This must come AFTER the operator ID route
app.get('/api/operators/rarity/:rarity', (req, res) => {
  try {
    const rarity = parseInt(req.params.rarity);
    if (isNaN(rarity) || rarity < 1 || rarity > 6) {
      res.status(400).json({ error: 'Invalid rarity' });
      return;
    }

    const filePath = path.join(__dirname, '../data', `operators-${rarity}star.json`);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Operators not found' });
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const operators = JSON.parse(content);
    res.json(operators);
  } catch (error) {
    console.error('Error loading operators:', error);
    res.status(500).json({ error: 'Failed to load operators' });
  }
});

// Authentication routes
// POST /api/auth/sendcode - Send login code (for EN/JP/KR servers)
app.post('/api/auth/sendcode', async (req, res) => {
  try {
    const { email, server = 'en' } = req.body;
    
    if (server === 'cn') {
      res.status(400).json({ error: 'CN server uses Skland API. Please use /api/auth/skland/login endpoint.' });
      return;
    }
    
    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    await sendLoginCode(email, server);
    res.json({ success: true, message: 'Login code sent to email' });
  } catch (error: any) {
    console.error('Error sending login code:', error);
    res.status(500).json({ error: error.message || 'Failed to send login code' });
  }
});

// POST /api/auth/skland/bindings - Get game bindings from Skland (CN server)
app.post('/api/auth/skland/bindings', async (req, res) => {
  try {
    const { cred } = req.body;
    
    if (!cred) {
      res.status(400).json({ error: 'Cred token is required' });
      return;
    }

    const bindings = await getSklandGameBindings(cred);
    res.json({ success: true, bindings });
  } catch (error: any) {
    console.error('Error getting Skland bindings:', error);
    res.status(500).json({ error: error.message || 'Failed to get game bindings' });
  }
});

// POST /api/auth/skland/login - Login with Skland (CN server)
app.post('/api/auth/skland/login', async (req, res) => {
  try {
    const { cred, uid } = req.body;
    
    if (!cred || !uid) {
      res.status(400).json({ error: 'Cred token and UID are required' });
      return;
    }

    // Fetch user data
    const userData = await getSklandUserData(cred, uid);
    
    // Create session
    const sessionId = generateSessionId();
    setSession(sessionId, {
      email: `skland_${uid}`, // Use UID as identifier for CN
      server: 'cn',
      accountType: 'arknights',
      credentials: {
        server: 'cn',
        cred,
        uid
      },
      userData,
      lastUpdated: Date.now()
    });

    // Set cookie
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json({ 
      success: true, 
      sessionId,
      user: {
        email: `skland_${uid}`,
        server: 'cn',
        nickname: userData.status?.name || `CN-${uid}`
      }
    });
  } catch (error: any) {
    console.error('Error logging in with Skland:', error);
    res.status(500).json({ error: error.message || 'Login failed' });
  }
});

// POST /api/auth/login - Login with code
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, code, server = 'en' } = req.body;
    
    if (!email || !code) {
      res.status(400).json({ error: 'Email and code are required' });
      return;
    }

    const credentials = await login(email, code, server);
    
    // Fetch user data
    const userData = await getUserData(credentials);
    
    // Create session
    const sessionId = generateSessionId();
    setSession(sessionId, {
      email,
      server,
      accountType: 'arknights',
      credentials,
      userData,
      lastUpdated: Date.now()
    });

    // Set cookie
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json({ 
      success: true, 
      sessionId,
      user: {
        email,
        server,
        nickname: userData.status?.nickName || email
      }
    });
  } catch (error: any) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: error.message || 'Login failed' });
  }
});

// GET /api/auth/user - Get current user data
app.get('/api/auth/user', async (req, res) => {
  try {
    const sessionId = req.cookies.sessionId;
    
    if (!sessionId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }

    // Handle local accounts
    if (session.accountType === 'local') {
      const account = findAccountByEmail(session.email);
      const ownedOperators = account?.ownedOperators || [];
      res.json({
        email: session.email,
        nickname: session.email.split('@')[0],
        accountType: 'local',
        ownedOperators
      });
      return;
    }

    // Handle Arknights accounts - refresh user data if it's older than 5 minutes
    const now = Date.now();
    if (!session.lastUpdated || (now - session.lastUpdated) > 5 * 60 * 1000) {
      try {
        if (session.credentials) {
          session.userData = await getUserData(session.credentials);
          session.lastUpdated = now;
          setSession(sessionId, session);
        }
      } catch (error) {
        console.error('Error refreshing user data:', error);
        // Continue with cached data
      }
    }

    // Extract owned operators from user data
    const ownedOperators: string[] = [];
    if (session.server === 'cn') {
      // Skland API format: data.chars is an object with character IDs as keys
      if (session.userData?.chars) {
        const chars = session.userData.chars;
        for (const charId in chars) {
          const operatorId = mapCharacterIdToOperatorId(charId);
          ownedOperators.push(operatorId);
        }
      }
    } else {
      // ArkPRTS API format: Check multiple possible locations
      // Log the structure for debugging
      console.log('=== ArkPRTS User Data Structure ===');
      console.log('userData keys:', Object.keys(session.userData || {}));
      console.log('userData.troop exists:', !!session.userData?.troop);
      if (session.userData?.troop) {
        console.log('troop keys:', Object.keys(session.userData.troop));
        console.log('troop.chars exists:', !!session.userData.troop.chars);
        if (session.userData.troop.chars) {
          const charKeys = Object.keys(session.userData.troop.chars);
          console.log('Number of chars:', charKeys.length);
          console.log('First 5 char IDs:', charKeys.slice(0, 5));
        }
      }
      console.log('userData.chars exists:', !!session.userData?.chars);
      if (session.userData?.chars) {
        const charKeys = Object.keys(session.userData.chars);
        console.log('Number of chars (direct):', charKeys.length);
        console.log('First 5 char IDs (direct):', charKeys.slice(0, 5));
      }
      console.log('===================================');

      // Try multiple possible locations for character data
      let chars: any = null;
      
      // Primary location: data.troop.chars
      if (session.userData?.troop?.chars) {
        chars = session.userData.troop.chars;
      }
      // Alternative location: data.chars
      else if (session.userData?.chars) {
        chars = session.userData.chars;
      }
      // Another possible location: data.troop.charInfoMap
      else if (session.userData?.troop?.charInfoMap) {
        chars = session.userData.troop.charInfoMap;
      }
      // Or maybe it's in data.charInfoMap
      else if (session.userData?.charInfoMap) {
        chars = session.userData.charInfoMap;
      }

      if (chars) {
        for (const charId in chars) {
          const operatorId = mapCharacterIdToOperatorId(charId);
          ownedOperators.push(operatorId);
        }
      } else {
        console.warn('No character data found in userData. Available keys:', Object.keys(session.userData || {}));
      }
    }

    // Get nickname based on server
    let nickname = session.email;
    if (session.server === 'cn') {
      nickname = session.userData?.status?.name || `CN-${session.credentials?.uid || 'unknown'}`;
    } else {
      nickname = session.userData?.status?.nickName || session.email;
    }

    res.json({
      email: session.email,
      server: session.server,
      nickname,
      ownedOperators,
      userData: {
        level: session.userData?.status?.level,
        charCnt: session.userData?.status?.charCnt || (session.server === 'cn' ? Object.keys(session.userData?.chars || {}).length : undefined),
        uid: session.userData?.status?.uid || (session.server === 'cn' ? session.credentials?.uid : undefined)
      }
    });
  } catch (error: any) {
    console.error('Error getting user data:', error);
    res.status(500).json({ error: error.message || 'Failed to get user data' });
  }
});

// POST /api/auth/register - Register a new local account
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // Validate password strength
    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long' });
      return;
    }

    const account = await createAccount(email, password);

    // Create session immediately after registration
    const sessionId = generateSessionId();
    setSession(sessionId, {
      email: account.email,
      accountType: 'local',
      lastUpdated: Date.now()
    });

    // Set cookie
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json({ 
      success: true, 
      sessionId,
      user: {
        email: account.email,
        nickname: account.email.split('@')[0] // Use email prefix as nickname
      }
    });
  } catch (error: any) {
    console.error('Error registering account:', error);
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

// POST /api/auth/local-login - Login with local account (email/password)
app.post('/api/auth/local-login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const account = findAccountByEmail(email);
    if (!account) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const isValid = await verifyPassword(account, password);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Update last login
    updateLastLogin(email);

    // Create session
    const sessionId = generateSessionId();
    setSession(sessionId, {
      email: account.email,
      accountType: 'local',
      lastUpdated: Date.now()
    });

    // Set cookie
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json({ 
      success: true, 
      sessionId,
      user: {
        email: account.email,
        nickname: account.email.split('@')[0] // Use email prefix as nickname
      }
    });
  } catch (error: any) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: error.message || 'Login failed' });
  }
});

// POST /api/auth/logout - Logout
app.post('/api/auth/logout', (req, res) => {
  try {
    const sessionId = req.cookies.sessionId;
    
    if (sessionId) {
      deleteSession(sessionId);
    }

    res.clearCookie('sessionId');
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error logging out:', error);
    res.status(500).json({ error: error.message || 'Failed to logout' });
  }
});

// POST /api/auth/add-operator - Add operator to user's collection
app.post('/api/auth/add-operator', (req, res) => {
  try {
    const sessionId = req.cookies.sessionId;
    
    if (!sessionId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }

    if (session.accountType !== 'local') {
      res.status(400).json({ error: 'Only local accounts can manually add operators' });
      return;
    }

    const { operatorId } = req.body;
    if (!operatorId) {
      res.status(400).json({ error: 'Operator ID is required' });
      return;
    }

    const success = addOperatorToAccount(session.email, operatorId);
    if (success) {
      res.json({ success: true, operatorId });
    } else {
      res.status(400).json({ error: 'Failed to add operator (may already be added)' });
    }
  } catch (error: any) {
    console.error('Error adding operator:', error);
    res.status(500).json({ error: error.message || 'Failed to add operator' });
  }
});

// POST /api/auth/remove-operator - Remove operator from user's collection
app.post('/api/auth/remove-operator', (req, res) => {
  try {
    const sessionId = req.cookies.sessionId;
    
    if (!sessionId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }

    if (session.accountType !== 'local') {
      res.status(400).json({ error: 'Only local accounts can manually remove operators' });
      return;
    }

    const { operatorId } = req.body;
    if (!operatorId) {
      res.status(400).json({ error: 'Operator ID is required' });
      return;
    }

    const success = removeOperatorFromAccount(session.email, operatorId);
    if (success) {
      res.json({ success: true, operatorId });
    } else {
      res.status(400).json({ error: 'Failed to remove operator' });
    }
  } catch (error: any) {
    console.error('Error removing operator:', error);
    res.status(500).json({ error: error.message || 'Failed to remove operator' });
  }
});

// POST /api/auth/add-operator - Add operator to user's collection
app.post('/api/auth/add-operator', (req, res) => {
  try {
    const sessionId = req.cookies.sessionId;
    
    if (!sessionId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }

    if (session.accountType !== 'local') {
      res.status(400).json({ error: 'Only local accounts can manually add operators' });
      return;
    }

    const { operatorId } = req.body;
    if (!operatorId) {
      res.status(400).json({ error: 'Operator ID is required' });
      return;
    }

    const success = addOperatorToAccount(session.email, operatorId);
    if (success) {
      res.json({ success: true, operatorId });
    } else {
      res.status(400).json({ error: 'Failed to add operator (may already be added)' });
    }
  } catch (error: any) {
    console.error('Error adding operator:', error);
    res.status(500).json({ error: error.message || 'Failed to add operator' });
  }
});

// POST /api/auth/remove-operator - Remove operator from user's collection
app.post('/api/auth/remove-operator', (req, res) => {
  try {
    const sessionId = req.cookies.sessionId;
    
    if (!sessionId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }

    if (session.accountType !== 'local') {
      res.status(400).json({ error: 'Only local accounts can manually remove operators' });
      return;
    }

    const { operatorId } = req.body;
    if (!operatorId) {
      res.status(400).json({ error: 'Operator ID is required' });
      return;
    }

    const success = removeOperatorFromAccount(session.email, operatorId);
    if (success) {
      res.json({ success: true, operatorId });
    } else {
      res.status(400).json({ error: 'Failed to remove operator' });
    }
  } catch (error: any) {
    console.error('Error removing operator:', error);
    res.status(500).json({ error: error.message || 'Failed to remove operator' });
  }
});

// GET /api/auth/debug - Debug endpoint to examine user data structure (development only)
app.get('/api/auth/debug', (req, res) => {
  try {
    const sessionId = req.cookies.sessionId;
    
    if (!sessionId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }

    // Return detailed structure information
    const userData = session.userData || {};
    const structure = {
      server: session.server,
      topLevelKeys: Object.keys(userData),
      hasTroop: !!userData.troop,
      troopKeys: userData.troop ? Object.keys(userData.troop) : [],
      hasTroopChars: !!userData.troop?.chars,
      troopCharsType: userData.troop?.chars ? (Array.isArray(userData.troop.chars) ? 'array' : typeof userData.troop.chars) : null,
      troopCharsCount: userData.troop?.chars ? (Array.isArray(userData.troop.chars) ? userData.troop.chars.length : Object.keys(userData.troop.chars).length) : 0,
      troopCharsSample: userData.troop?.chars ? (
        Array.isArray(userData.troop.chars) 
          ? userData.troop.chars.slice(0, 3)
          : Object.keys(userData.troop.chars).slice(0, 10)
      ) : null,
      hasChars: !!userData.chars,
      charsType: userData.chars ? (Array.isArray(userData.chars) ? 'array' : typeof userData.chars) : null,
      charsCount: userData.chars ? (Array.isArray(userData.chars) ? userData.chars.length : Object.keys(userData.chars).length) : 0,
      charsSample: userData.chars ? (
        Array.isArray(userData.chars)
          ? userData.chars.slice(0, 3)
          : Object.keys(userData.chars).slice(0, 10)
      ) : null,
      hasCharInfoMap: !!userData.charInfoMap,
      hasTroopCharInfoMap: !!userData.troop?.charInfoMap,
      status: userData.status ? {
        keys: Object.keys(userData.status),
        nickName: userData.status.nickName,
        level: userData.status.level,
        charCnt: userData.status.charCnt
      } : null
    };

    res.json(structure);
  } catch (error: any) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ error: error.message || 'Debug failed' });
  }
});

// Serve React app for all non-API routes (SPA routing) - must be last
// Use a catch-all middleware instead of a route pattern for Express 5
app.use((req, res, next) => {
  // Skip API routes and static assets (already handled above)
  if (req.path.startsWith('/api') || req.path.startsWith('/images') || req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
    return next();
  }
  // Serve React app for all other routes
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start the server
app.listen(PORT, () => {
  console.log('🚀 Arknights Website is running!');
  console.log(`📍 Server running at http://localhost:${PORT}`);
  console.log(`   Open your browser and navigate to: http://localhost:${PORT}`);
  console.log(`   Press Ctrl+C to stop the server`);
});
