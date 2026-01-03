/**
 * Main entry point for the Arknights website
 */

// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import { loadAllNicheLists, loadNicheList } from './niche-list-utils';
import { Rating } from './niche-list-types';
import { generateSessionId, setSession, getSession, deleteSession } from './auth-utils';
import { createAccount, findAccountByEmail, verifyPassword, updateLastLogin, addOperatorToAccount, removeOperatorFromAccount, toggleWantToUse } from './account-storage';
import { buildTeam, getDefaultPreferences, TeamPreferences } from './team-builder';
import * as fs from 'fs';

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
    // Collection is now keyed by filename
    const niches = Object.entries(nicheLists).map(([filename, operatorList]) => {
      return {
        filename,
        displayName: operatorList.niche,
        description: operatorList.description || '',
        lastUpdated: operatorList.lastUpdated || ''
      };
    });
    res.json(niches);
  } catch (error) {
    console.error('Error loading niche lists:', error);
    res.status(500).json({ error: 'Failed to load niche lists' });
  }
});

// API route to get a specific niche list
app.get('/api/niche-lists/:niche', (req, res) => {
  try {
    const niche = decodeURIComponent(req.params.niche);
    
    // Load by filename (the parameter should be a filename code)
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
    // Convert from rating-grouped structure to flat array for frontend
    const operatorEntries: Array<{operatorId: string; rating: string; note: string; operator: any}> = [];
    const ratingOrder: Rating[] = ["SS", "S", "A", "B", "C", "D", "F"];
    
    for (const rating of ratingOrder) {
      if (operatorList.operators[rating]) {
        const operatorsInRating = operatorList.operators[rating]!;
        for (const [operatorId, description] of Object.entries(operatorsInRating)) {
          operatorEntries.push({
            operatorId: operatorId,
            rating: rating,
            note: description,
            operator: operatorsData[operatorId] || null
          });
        }
      }
    }
    
    const enrichedOperatorList = {
      ...operatorList,
      operators: operatorEntries
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
    const filePath = path.join(__dirname, '../data', 'trash-operators.json');
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

// API route to get free operators
app.get('/api/free-operators', (_req, res) => {
  try {
    const filePath = path.join(__dirname, '../data', 'free.json');
    if (!fs.existsSync(filePath)) {
      console.log('Free operators file not found');
      res.status(404).json({ error: 'Free operators not found' });
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const freeData = JSON.parse(content);

    // Load operator data to enrich the free operators list
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

    // Enrich free operators list with operator data
    const enrichedFreeList = {
      ...freeData,
      operators: Object.entries(freeData.operators || {}).map(([operatorId, note]) => ({
        operatorId,
        note: note || '',
        operator: operatorsData[operatorId] || null
      }))
    };

    res.json(enrichedFreeList);
  } catch (error) {
    console.error('Error loading free operators:', error);
    res.status(500).json({ error: 'Failed to load free operators' });
  }
});

// API route to get global range operators
app.get('/api/global-range-operators', (_req, res) => {
  try {
    const filePath = path.join(__dirname, '../data', 'global-range.json');
    if (!fs.existsSync(filePath)) {
      console.log('Global range operators file not found');
      res.status(404).json({ error: 'Global range operators not found' });
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const globalRangeData = JSON.parse(content);

    // Load operator data to enrich the global range operators list
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

    // Enrich global range operators list with operator data
    const enrichedGlobalRangeList = {
      ...globalRangeData,
      operators: Object.entries(globalRangeData.operators || {}).map(([operatorId, note]) => ({
        operatorId,
        note: note || '',
        operator: operatorsData[operatorId] || null
      }))
    };

    res.json(enrichedGlobalRangeList);
  } catch (error) {
    console.error('Error loading global range operators:', error);
    res.status(500).json({ error: 'Failed to load global range operators' });
  }
});

// API route to get unconventional niches operators
app.get('/api/unconventional-niches-operators', (_req, res) => {
  try {
    const filePath = path.join(__dirname, '../data', 'unconventional-niches.json');
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Unconventional niches operators not found' });
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const unconventionalData = JSON.parse(content);

    // Load operator data to enrich the unconventional niches operators list
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

    // Enrich unconventional niches operators list with operator data
    const enrichedUnconventionalList = {
      ...unconventionalData,
      operators: Object.entries(unconventionalData.operators || {}).map(([operatorId, note]) => ({
        operatorId,
        note: note || '',
        operator: operatorsData[operatorId] || null
      }))
    };

    res.json(enrichedUnconventionalList);
  } catch (error) {
    console.error('Error loading unconventional niches operators:', error);
    res.status(500).json({ error: 'Failed to load unconventional niches operators' });
  }
});

// API route to get low-rarity operators
app.get('/api/low-rarity-operators', (_req, res) => {
  try {
    const filePath = path.join(__dirname, '../data', 'low-rarity.json');
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Low-rarity operators not found' });
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lowRarityData = JSON.parse(content);

    // Load operator data to enrich the low-rarity operators list
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

    // Enrich low-rarity operators list with operator data
    const enrichedLowRarityList = {
      ...lowRarityData,
      operators: Object.entries(lowRarityData.operators || {}).map(([operatorId, note]) => ({
        operatorId,
        note: note || '',
        operator: operatorsData[operatorId] || null
      }))
    };

    res.json(enrichedLowRarityList);
  } catch (error) {
    console.error('Error loading low-rarity operators:', error);
    res.status(500).json({ error: 'Failed to load low-rarity operators' });
  }
});

// API route to get a specific operator by ID with their rankings
// This must come BEFORE the rarity route to avoid conflicts
app.get('/api/operators/:id', async (req, res) => {
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

    // Collection is now keyed by filename
    for (const [_filename, operatorList] of Object.entries(operatorLists)) {
      if (operatorList.operators) {
        // Search through all rating groups
        for (const [rating, operatorsInRating] of Object.entries(operatorList.operators)) {
          if (operatorsInRating && operatorId in operatorsInRating) {
            rankings.push({
              niche: operatorList.niche, // Use display name for the ranking
              tier: rating,
              notes: operatorsInRating[operatorId] || undefined
            });
            break; // Found in this niche, move to next niche
          }
        }
      }
    }

    // Check if operator is in special lists (free, global-range, trash, unconventional, low-rarity)
    // These operators show niche name but no ranking tier
    const specialLists = [
      { file: 'free.json', name: 'Free Operators' },
      { file: 'global-range.json', name: 'Global Range Operators' },
      { file: 'trash-operators.json', name: 'Trash Operators' },
      { file: 'unconventional-niches.json', name: 'Unconventional Niches' },
      { file: 'low-rarity.json', name: 'Good Low-Rarity Operators' }
    ];

    for (const specialList of specialLists) {
      const specialFilePath = path.join(__dirname, '../data', specialList.file);
      if (fs.existsSync(specialFilePath)) {
        try {
          const specialContent = fs.readFileSync(specialFilePath, 'utf-8');
          const specialData = JSON.parse(specialContent);
          if (specialData.operators && operatorId in specialData.operators) {
            rankings.push({
              niche: specialList.name,
              tier: '', // Empty tier - will display niche name without ranking
              notes: specialData.operators[operatorId] || undefined
            });
          }
        } catch (error) {
          // Silently ignore errors when checking special lists
        }
      }
    }

    // Add normal rankings for operators not in special lists (only if no special ranking added)

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

    const account = await findAccountByEmail(session.email);
    const ownedOperators = account?.ownedOperators || [];
    const raisedOperators = account?.wantToUse || []; // wantToUse is actually the raised operators
    const wantToUse = account?.wantToUse || [];

    console.log('API /auth/user response:', {
      email: session.email,
      ownedOperatorsCount: ownedOperators.length,
      raisedOperatorsCount: raisedOperators.length,
      wantToUseCount: wantToUse.length,
      first5Raised: raisedOperators.slice(0, 5),
      first5WantToUse: wantToUse.slice(0, 5)
    });

    res.json({
      email: session.email,
      nickname: session.email.split('@')[0],
      ownedOperators,
      raisedOperators, // wantToUse field contains raised operators
      wantToUse
    });
  } catch (error: any) {
    console.error('Error getting user data:', error);
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Failed to get user data' });
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
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Registration failed' });
  }
});

// POST /api/auth/local-login - Login with local account (email/password)
app.post('/api/auth/local-login', async (req, res) => {
  const startTime = Date.now();

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      const duration = Date.now() - startTime;
      console.log(`Login failed - missing credentials (${duration}ms)`);
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    console.log(`Login attempt for email: ${email.substring(0, 3)}***`);

    const account = await findAccountByEmail(email);
    if (!account) {
      const duration = Date.now() - startTime;
      console.log(`Login failed - account not found (${duration}ms)`);
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const passwordStartTime = Date.now();
    const isValid = await verifyPassword(account, password);
    const passwordDuration = Date.now() - passwordStartTime;

    if (!isValid) {
      const duration = Date.now() - startTime;
      console.log(`Login failed - invalid password (${duration}ms, password check: ${passwordDuration}ms)`);
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Update last login (non-blocking)
    updateLastLogin(email);

    // Create session
    const sessionId = generateSessionId();
    setSession(sessionId, {
      email: account.email,
      lastUpdated: Date.now()
    });

    // Set cookie
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 60 * 1000 // 30 days
    });

    const totalDuration = Date.now() - startTime;
    console.log(`Login successful for ${email} (${totalDuration}ms total, ${passwordDuration}ms password)`);

    res.json({
      success: true,
      sessionId,
      user: {
        email: account.email,
        nickname: account.email.split('@')[0] // Use email prefix as nickname
      }
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`Login error after ${duration}ms:`, sanitizeErrorMessage(error));

    // Provide more specific error messages based on error type
    if (error.message?.includes('timeout') || error.code === 'ETIMEOUT') {
      res.status(503).json({ error: 'Login service temporarily unavailable. Please try again.' });
    } else if (error.message?.includes('connection')) {
      res.status(503).json({ error: 'Database connection issue. Please try again.' });
    } else {
      res.status(500).json({ error: sanitizeErrorMessage(error) || 'Login failed' });
    }
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
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Failed to logout' });
  }
});

// POST /api/auth/add-operator - Add operator to user's collection
app.post('/api/auth/add-operator', async (req, res) => {
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


    const { operatorId } = req.body;
    if (!operatorId) {
      res.status(400).json({ error: 'Operator ID is required' });
      return;
    }

    const success = await addOperatorToAccount(session.email, operatorId);
    if (success) {
      res.json({ success: true, operatorId });
    } else {
      res.status(400).json({ error: 'Failed to add operator (may already be added)' });
    }
  } catch (error: any) {
    console.error('Error adding operator:', error);
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Failed to add operator' });
  }
});

// POST /api/auth/remove-operator - Remove operator from user's collection
app.post('/api/auth/remove-operator', async (req, res) => {
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

    const { operatorId } = req.body;
    if (!operatorId) {
      res.status(400).json({ error: 'Operator ID is required' });
      return;
    }

    const success = await removeOperatorFromAccount(session.email, operatorId);
    if (success) {
      res.json({ success: true, operatorId });
    } else {
      res.status(400).json({ error: 'Failed to remove operator' });
    }
  } catch (error: any) {
    console.error('Error removing operator:', error);
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Failed to remove operator' });
  }
});

// POST /api/auth/toggle-want-to-use - Toggle want to use status for an operator
app.post('/api/auth/toggle-want-to-use', async (req, res) => {
  try {
    console.log('Toggle want to use endpoint hit');
    const sessionId = req.cookies.sessionId;
    
    if (!sessionId) {
      console.log('No session ID found');
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      console.log('Invalid session');
      res.status(401).json({ error: 'Invalid session' });
      return;
    }

    const { operatorId } = req.body;
    if (!operatorId) {
      console.log('No operator ID provided');
      res.status(400).json({ error: 'Operator ID is required' });
      return;
    }

    console.log(`Toggling want to use for operator: ${operatorId}, user: ${session.email}`);
    const success = await toggleWantToUse(session.email, operatorId);
    if (success) {
      const account = await findAccountByEmail(session.email);
      const wantToUse = account?.wantToUse || [];
      const isWantToUse = wantToUse.includes(operatorId);
      console.log(`Successfully toggled. Want to use: ${isWantToUse}`);
      res.json({ success: true, operatorId, wantToUse: isWantToUse });
    } else {
      console.log('Failed to toggle');
      res.status(400).json({ error: 'Failed to toggle want to use' });
    }
  } catch (error: any) {
    console.error('Error toggling want to use:', error);
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Failed to toggle want to use' });
  }
});

// POST /api/team/build - Build a team based on preferences
app.post('/api/team/build', async (req, res) => {
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

    const preferences: TeamPreferences = req.body.preferences || getDefaultPreferences();
    const result = await buildTeam(session.email, preferences);
    
    res.json(result);
  } catch (error: any) {
    console.error('Error building team:', error);
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Failed to build team' });
  }
});

// GET /api/team/preferences/default - Get default team preferences
app.get('/api/team/preferences/default', (_req, res) => {
  try {
    res.json(getDefaultPreferences());
  } catch (error: any) {
    console.error('Error getting default preferences:', error);
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Failed to get default preferences' });
  }
});

// GET /api/team/preferences - Get user's saved team preferences
app.get('/api/team/preferences', async (req, res) => {
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

    // Load preferences from file (per-user preferences)
    const preferencesFile = path.join(__dirname, '../data/team-preferences.json');
    let preferences: Record<string, TeamPreferences> = {};
    
    if (fs.existsSync(preferencesFile)) {
      try {
        const content = fs.readFileSync(preferencesFile, 'utf-8');
        preferences = JSON.parse(content);
      } catch (error) {
        console.error('Error loading preferences:', error);
      }
    }
    
    // If user has no saved preferences, use defaults and auto-save them
    if (!preferences[session.email]) {
      const defaultPrefs = getDefaultPreferences();
      preferences[session.email] = defaultPrefs;
      
      // Save defaults to file so they persist across rebuilds
      const dir = path.dirname(preferencesFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(preferencesFile, JSON.stringify(preferences, null, 2));
    }
    
    const userPreferences = preferences[session.email];
    res.json(userPreferences);
  } catch (error: any) {
    console.error('Error getting preferences:', error);
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Failed to get preferences' });
  }
});

// POST /api/team/preferences - Save user's team preferences
app.post('/api/team/preferences', async (req, res) => {
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

    const preferences: TeamPreferences = req.body.preferences;
    if (!preferences) {
      res.status(400).json({ error: 'Preferences are required' });
      return;
    }

    // Load existing preferences
    const preferencesFile = path.join(__dirname, '../data/team-preferences.json');
    let allPreferences: Record<string, TeamPreferences> = {};

    if (fs.existsSync(preferencesFile)) {
      try {
        const content = fs.readFileSync(preferencesFile, 'utf-8');
        allPreferences = JSON.parse(content);
      } catch (error) {
        console.error('Error loading preferences:', error);
      }
    }

    // Save user's preferences
    allPreferences[session.email] = preferences;

    // Ensure directory exists
    const dir = path.dirname(preferencesFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(preferencesFile, JSON.stringify(allPreferences, null, 2));

    res.json({ success: true, preferences });
  } catch (error: any) {
    console.error('Error saving preferences:', error);
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Failed to save preferences' });
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
