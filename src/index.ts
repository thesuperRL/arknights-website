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
import { keepPeakEntriesOnly, keepPeakInstanceOnly } from './peak-level-utils';
import { loadAllSynergies, loadSynergy } from './synergy-utils';
import { generateSessionId, setSession, getSession, deleteSession } from './auth-utils';
import { createAccount, findAccountByUsername, verifyPassword, updateLastLogin, addOperatorToAccount, removeOperatorFromAccount, toggleWantToUse, initializeDbConnection } from './account-storage';
import { buildTeam, getDefaultPreferences, TeamPreferences } from './team-builder';
import {
  getAccountTeamData,
  saveNormalTeambuild,
  saveISTeamState,
  deleteISTeamState,
  initializeTeamDataTable
} from './team-data-pg';
import {
  getChangelogEntries,
  insertChangelogEntry,
  initializeChangelogTable,
  ChangelogEntryRow
} from './changelog-pg';
import * as fs from 'fs';

const useTeamDataDb = () => !!process.env.DATABASE_URL;

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

// Cookie options: when CORS_ORIGIN is set (e.g. GitHub Pages), use SameSite=None; Secure for cross-origin
const sessionCookieOptions = () => {
  const crossOrigin = !!process.env.CORS_ORIGIN;
  return {
    httpOnly: true,
    secure: crossOrigin || process.env.NODE_ENV === 'production',
    sameSite: (crossOrigin ? 'none' : 'lax') as 'lax' | 'none',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  };
};

// Middleware
app.use(express.json());
app.use(cookieParser());

// CORS for GitHub Pages / cross-origin: allow specific origin(s) and credentials
// CORS_ORIGIN can be a single URL or comma-separated list (e.g. https://thesuperrl.github.io,https://username.github.io)
// Request origin is echoed back when it matches an allowed origin (case-insensitive) so CORS works.
const corsOriginEnv = process.env.CORS_ORIGIN || '';
const allowedOrigins = corsOriginEnv
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const allowedOriginsLower = new Set(allowedOrigins.map((o) => o.toLowerCase()));

if (allowedOrigins.length > 0) {
  app.use((req, res, next) => {
    const requestOrigin = req.get('Origin');
    const originAllowed =
      requestOrigin && allowedOriginsLower.has(requestOrigin.toLowerCase());
    if (originAllowed) {
      // Echo the request origin so the browser accepts the response (required when using credentials)
      res.setHeader('Access-Control-Allow-Origin', requestOrigin!);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
}

// Serve static files from the public directory (React build output)
app.use(express.static(path.join(__dirname, '../public')));
// Serve images and other assets
app.use('/images', express.static(path.join(__dirname, '../public/images')));

// API route to get all niche lists
app.get('/api/niche-lists', (_req, res) => {
  try {
    const nicheLists = loadAllNicheLists();
    // Collection is now keyed by filename
    const niches = Object.entries(nicheLists)
      .filter(([filename]) => !filename.startsWith('synergies/'))
      .map(([filename, operatorList]) => {
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

// IS niche weight pools: important, optional, good — raw scores used in Integrated Strategies scoring
app.get('/api/config/is-niche-weight-pools', (_req, res) => {
  try {
    const configPath = path.join(__dirname, '../data/is-niche-weight-pools.json');
    if (!fs.existsSync(configPath)) {
      return res.json({
        important: { rawScore: 5, niches: [] },
        optional: { rawScore: 2, niches: [] },
        good: { rawScore: 0.5, niches: [] },
        synergyCoreBonus: 15,
        synergyScaleFactor: 1
      });
    }
    const raw = fs.readFileSync(configPath, 'utf-8');
    const data = JSON.parse(raw);
    return res.json(data);
  } catch (error) {
    console.error('Error loading IS niche weight pools:', error);
    return res.status(500).json({ error: 'Failed to load IS niche weight pools' });
  }
});

// API route to get a specific niche list
// Query: allLevels=1 returns every (tier, level) evaluation; otherwise returns peak-only (one per operator).
app.get('/api/niche-lists/:niche', (req, res) => {
  try {
    const niche = decodeURIComponent(req.params.niche);
    const allLevels = req.query.allLevels === '1' || req.query.allLevels === 'true';

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
    const operatorEntries: Array<{operatorId: string; rating: string; note: string; level: string; operator: any}> = [];
    const ratingOrder: Rating[] = ["SS", "S", "A", "B", "C", "D", "F"];

    for (const rating of ratingOrder) {
      if (operatorList.operators[rating]) {
        const operatorsInRating = operatorList.operators[rating]!;
        for (const [operatorId, entry] of Object.entries(operatorsInRating)) {
          // Parse entry: can be string (backwards compatible) or [string, string] tuple
          let note: string = '';
          let level: string = '';

          if (typeof entry === 'string') {
            // Old format: just description, level is empty (always has niche)
            note = entry;
            level = '';
          } else if (Array.isArray(entry) && entry.length === 2) {
            // New format: [description, level]
            note = entry[0] || '';
            level = entry[1] || '';
          }

          operatorEntries.push({
            operatorId: operatorId,
            rating: rating,
            note: note,
            level: level,
            operator: operatorsData[operatorId] || null
          });
        }
      }
    }

    // When allLevels=1, return every evaluation; otherwise return peak-only (one per operator).
    const operatorsToSend = allLevels ? operatorEntries : keepPeakEntriesOnly(operatorEntries);

    // Resolve relatedNiches (display names) to filenames so the frontend can link and translate.
    const allLists = loadAllNicheLists();
    const displayNameToFilename: Record<string, string> = {};
    for (const [filename, list] of Object.entries(allLists)) {
      if (list.niche) displayNameToFilename[list.niche] = filename;
    }
    const relatedNichesResolved = (operatorList.relatedNiches || [])
      .map((displayName: string) => ({
        displayName,
        filename: displayNameToFilename[displayName]
      }))
      .filter((item: { filename?: string }) => item.filename) as Array<{ displayName: string; filename: string }>;

    const enrichedOperatorList = {
      ...operatorList,
      operators: operatorsToSend,
      relatedNichesResolved
    };

    res.json(enrichedOperatorList);
  } catch (error) {
    console.error('Error loading operator list:', error);
    res.status(500).json({ error: 'Failed to load operator list' });
  }
});

// API route to get all synergies
app.get('/api/synergies', (_req, res) => {
  try {
    const synergies = loadAllSynergies();
    const synergyList = Object.entries(synergies).map(([filename, synergy]) => {
      return {
        filename,
        name: synergy.name,
        description: synergy.description || ''
      };
    });
    res.json(synergyList);
  } catch (error) {
    console.error('Error loading synergies:', error);
    res.status(500).json({ error: 'Failed to load synergies' });
  }
});

// API route to get a specific synergy
app.get('/api/synergies/:synergy', (req, res) => {
  try {
    const synergyName = decodeURIComponent(req.params.synergy);
    const synergy = loadSynergy(synergyName);
    
    if (!synergy) {
      res.status(404).json({ error: 'Synergy not found' });
      return;
    }

    // Load operator data to enrich the synergy
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

    // Enrich synergy with operator data
    const enrichedCore: Record<string, Array<{ operatorId: string; level: string; operator: any }>> = {};
    for (const [groupName, operatorEntries] of Object.entries(synergy.core)) {
      enrichedCore[groupName] = operatorEntries.map(entry => {
        // Parse entry: can be string (backwards compatible) or [string, string] tuple
        let operatorId: string;
        let level: string = '';
        
        if (typeof entry === 'string') {
          // Old format: just operator ID, level is empty (always has synergy)
          operatorId = entry;
          level = '';
        } else if (Array.isArray(entry) && entry.length === 2) {
          // New format: [operatorId, level]
          operatorId = entry[0] || '';
          level = entry[1] || '';
        } else {
          operatorId = '';
        }
        
        return {
          operatorId,
          level,
          operator: operatorsData[operatorId] || null
        };
      });
    }

    const enrichedOptional: Record<string, Array<{ operatorId: string; level: string; operator: any }>> = {};
    for (const [groupName, operatorEntries] of Object.entries(synergy.optional)) {
      enrichedOptional[groupName] = operatorEntries.map(entry => {
        // Parse entry: can be string (backwards compatible) or [string, string] tuple
        let operatorId: string;
        let level: string = '';
        
        if (typeof entry === 'string') {
          // Old format: just operator ID, level is empty (always has synergy)
          operatorId = entry;
          level = '';
        } else if (Array.isArray(entry) && entry.length === 2) {
          // New format: [operatorId, level]
          operatorId = entry[0] || '';
          level = entry[1] || '';
        } else {
          operatorId = '';
        }
        
        return {
          operatorId,
          level,
          operator: operatorsData[operatorId] || null
        };
      });
    }

    const enrichedSynergy = {
      ...synergy,
      core: enrichedCore,
      optional: enrichedOptional
    };

    res.json(enrichedSynergy);
  } catch (error) {
    console.error('Error loading synergy:', error);
    res.status(500).json({ error: 'Failed to load synergy' });
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

// Changelog: single source of truth is tier_changelog SQL table when DATABASE_URL is set
function getOperatorGlobalMap(dataDir: string): Record<string, boolean> {
  const operatorGlobal: Record<string, boolean> = {};
  for (const rarity of [1, 2, 3, 4, 5, 6]) {
    const opPath = path.join(dataDir, `operators-${rarity}star.json`);
    if (fs.existsSync(opPath)) {
      const opData = JSON.parse(fs.readFileSync(opPath, 'utf-8')) as Record<string, { global?: boolean }>;
      for (const [id, op] of Object.entries(opData)) {
        operatorGlobal[id] = op?.global ?? true;
      }
    }
  }
  return operatorGlobal;
}

type OperatorNameLang = 'en' | 'cn' | 'tw' | 'jp' | 'kr';
interface OperatorNames {
  name: string;
  cnName?: string;
  twName?: string;
  jpName?: string;
  krName?: string;
}

function getOperatorNamesMap(dataDir: string): Record<string, OperatorNames> {
  const map: Record<string, OperatorNames> = {};
  for (const rarity of [1, 2, 3, 4, 5, 6]) {
    const opPath = path.join(dataDir, `operators-${rarity}star.json`);
    if (fs.existsSync(opPath)) {
      const opData = JSON.parse(fs.readFileSync(opPath, 'utf-8')) as Record<string, OperatorNames & { global?: boolean }>;
      for (const [id, op] of Object.entries(opData)) {
        if (op && typeof op.name === 'string') {
          map[id] = { name: op.name, cnName: op.cnName, twName: op.twName, jpName: op.jpName, krName: op.krName };
        }
      }
    }
  }
  return map;
}

function getOperatorNameForLanguage(op: OperatorNames | null, fallback: string, lang: OperatorNameLang): string {
  if (!op) return fallback;
  switch (lang) {
    case 'cn':
      return (op.cnName && op.cnName.trim()) || op.name;
    case 'tw':
      return (op.twName && op.twName.trim()) || (op.cnName && op.cnName.trim()) || op.name;
    case 'jp':
      return (op.jpName && op.jpName.trim()) || op.name;
    case 'kr':
      return (op.krName && op.krName.trim()) || op.name;
    case 'en':
    default:
      return op.name;
  }
}

app.get('/api/changelog', async (req, res) => {
  try {
    const dataDir = path.join(__dirname, '../data');
    const operatorGlobal = getOperatorGlobalMap(dataDir);
    const lang = (req.query.language as OperatorNameLang) || 'en';
    const validLang: OperatorNameLang[] = ['en', 'cn', 'tw', 'jp', 'kr'];
    const language = validLang.includes(lang) ? lang : 'en';
    const operatorNames = getOperatorNamesMap(dataDir);

    const resolveName = (operatorId: string, currentName: string): string =>
      getOperatorNameForLanguage(operatorNames[operatorId] || null, currentName, language);

    if (process.env.DATABASE_URL) {
      const entries = await getChangelogEntries();
      const withGlobal = entries.map((e: ChangelogEntryRow) => ({
        ...e,
        operatorName: resolveName(e.operatorId, e.operatorName),
        global: e.global !== undefined ? e.global : (operatorGlobal[e.operatorId] ?? true),
      }));
      res.json({ entries: withGlobal });
      return;
    }

    // No DB: changelog is SQL-only; return empty so UI still works
    res.json({ entries: [] });
  } catch (error) {
    console.error('Error loading changelog:', error);
    res.status(500).json({ error: 'Failed to load changelog' });
  }
});

app.post('/api/changelog', async (req, res) => {
  try {
    if (!process.env.DATABASE_URL) {
      res.status(503).json({ error: 'Changelog is stored in database; DATABASE_URL is not set' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const entry: ChangelogEntryRow = {
      date: String(body.date ?? ''),
      time: body.time != null ? String(body.time) : undefined,
      operatorId: String(body.operatorId ?? ''),
      operatorName: String(body.operatorName ?? ''),
      niche: String(body.niche ?? ''),
      nicheFilename: String(body.nicheFilename ?? ''),
      oldTier: body.oldTier != null ? String(body.oldTier) : null,
      newTier: body.newTier != null ? String(body.newTier) : null,
      oldLevel: String(body.oldLevel ?? ''),
      newLevel: String(body.newLevel ?? ''),
      justification: String(body.justification ?? ''),
      global: body.global !== undefined ? Boolean(body.global) : undefined,
    };
    if (!entry.date || !entry.operatorId || !entry.nicheFilename) {
      res.status(400).json({ error: 'date, operatorId, and nicheFilename are required' });
      return;
    }
    const id = await insertChangelogEntry(entry);
    if (id == null) {
      res.status(500).json({ error: 'Failed to insert changelog entry' });
      return;
    }
    res.status(201).json({ success: true, id });
  } catch (error: unknown) {
    console.error('Error adding changelog entry:', error);
    res.status(500).json({ error: 'Failed to add changelog entry' });
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
// Query: allLevels=1 returns every (tier, level) evaluation per niche; otherwise peak-only.
// This must come BEFORE the rarity route to avoid conflicts
app.get('/api/operators/:id', async (req, res) => {
  try {
    const operatorId = req.params.id;
    const allLevels = req.query.allLevels === '1' || req.query.allLevels === 'true';
    
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

    // Load all niche lists to get display names and create bidirectional mapping
    const operatorLists = loadAllNicheLists();
    const nicheDisplayNames: Record<string, string> = {}; // filename -> display name
    const nicheFilenames: Record<string, string> = {}; // display name -> filename
    for (const [filename, operatorList] of Object.entries(operatorLists)) {
      nicheDisplayNames[filename] = operatorList.niche;
      nicheFilenames[operatorList.niche] = filename;
    }

    // Always build rankings by scanning niche list files so every (tier, level) evaluation appears
    const rankingsByNiche: Record<string, Array<{ tier: string; level: string; notes?: string }>> = {};

    for (const [filename, operatorList] of Object.entries(operatorLists)) {
      if (filename.startsWith('synergies/')) continue; // Synergies use core/optional, not tier lists
      if (!operatorList.operators || typeof operatorList.operators !== 'object') continue;

      for (const [rating, operatorsInRating] of Object.entries(operatorList.operators)) {
        if (!operatorsInRating || !(operatorId in operatorsInRating)) continue;

        const entry = operatorsInRating[operatorId];
        let notes: string | undefined = undefined;
        let level: string = '';

        if (typeof entry === 'string') {
          notes = entry || undefined;
          level = '';
        } else if (Array.isArray(entry) && entry.length >= 1) {
          notes = entry[0] || undefined;
          level = entry.length >= 2 ? (entry[1] || '') : '';
        }

        const nicheDisplayName = nicheDisplayNames[filename] || operatorList.niche;
        if (!rankingsByNiche[nicheDisplayName]) {
          rankingsByNiche[nicheDisplayName] = [];
        }
        rankingsByNiche[nicheDisplayName].push({
          tier: rating,
          level: level,
          notes: notes
        });
      }
    }

    // Check if operator is in special lists (free, global-range, trash, unconventional, low-rarity)
    // These operators show niche name but no ranking tier.
    // Canonical nicheFilename must match frontend routes and translation keys (niche-translations.json).
    const specialLists = [
      { file: 'free.json', name: 'Free Operators', nicheFilename: 'free' },
      { file: 'global-range.json', name: 'Global Range Operators', nicheFilename: 'global-range' },
      { file: 'trash-operators.json', name: 'Trash Operators', nicheFilename: 'trash-operators' },
      { file: 'unconventional-niches.json', name: 'Unconventional Niches', nicheFilename: 'unconventional-niches' },
      { file: 'low-rarity.json', name: 'Good Low-Rarity Operators', nicheFilename: 'low-rarity' }
    ];
    const specialListNicheFilenames: Record<string, string> = {};
    for (const sl of specialLists) {
      specialListNicheFilenames[sl.name] = sl.nicheFilename;
    }

    for (const specialList of specialLists) {
      const specialFilePath = path.join(__dirname, '../data', specialList.file);
      if (fs.existsSync(specialFilePath)) {
        try {
          const specialContent = fs.readFileSync(specialFilePath, 'utf-8');
          const specialData = JSON.parse(specialContent);
          if (specialData.operators && operatorId in specialData.operators) {
            if (!rankingsByNiche[specialList.name]) {
              rankingsByNiche[specialList.name] = [];
            }
            rankingsByNiche[specialList.name].push({
              tier: '', // Empty tier - will display niche name without ranking
              level: '',
              notes: specialData.operators[operatorId] || undefined
            });
          }
        } catch (error) {
          // Silently ignore errors when checking special lists
        }
      }
    }

    const rankings = Object.entries(rankingsByNiche)
      .filter(([, instances]) => instances && Array.isArray(instances) && instances.length > 0)
      .map(([niche, instances]) => ({
        niche,
        nicheFilename: specialListNicheFilenames[niche] || nicheFilenames[niche] || niche.toLowerCase().replace(/\s+/g, '-'),
        instances: allLevels ? (instances || []) : keepPeakInstanceOnly(instances || [])
      }));

    // Enrich synergies with display names
    const allSynergies = loadAllSynergies();
    const enrichedSynergies: Array<{ synergy: string; role: string; groups: string[]; filename: string }> = [];
    
    if (operator.synergies) {
      for (const [synergyFilename, synergyData] of Object.entries(operator.synergies)) {
        const synergy = allSynergies[synergyFilename];
        if (synergy) {
          // Handle both old format (group) and new format (groups)
          const data = synergyData as { role: string; group?: string; groups?: string[] };
          const groups = data.groups || (data.group ? [data.group] : []);
          enrichedSynergies.push({
            synergy: synergy.name,
            role: data.role,
            groups: groups,
            filename: synergyFilename
          });
        }
      }
    }

    res.json({
      operator,
      rankings,
      synergies: enrichedSynergies
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

    const account = await findAccountByUsername(session.email);
    if (!account) {
      res.status(401).json({ error: 'Invalid session' });
      return;
    }
    const ownedOperators = account.ownedOperators || [];
    const raisedOperators = account.wantToUse || [];
    const wantToUse = account.wantToUse || [];

    res.json({
      email: account.email ?? account.username,
      nickname: account.username,
      ownedOperators,
      raisedOperators, // wantToUse field contains raised operators
      wantToUse
    });
  } catch (error: any) {
    console.error('Error getting user data:', error);
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Failed to get user data' });
  }
});

// POST /api/auth/register - Register a new local account (username + password only)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters long' });
      return;
    }

    const account = await createAccount(username, password);

    const sessionId = generateSessionId();
    setSession(sessionId, {
      email: account.username,
      lastUpdated: Date.now()
    });

    res.cookie('sessionId', sessionId, sessionCookieOptions());

    res.json({
      success: true,
      sessionId,
      user: {
        email: account.username,
        nickname: account.username
      }
    });
  } catch (error: any) {
    console.error('Error registering account:', error);
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Registration failed' });
  }
});

// POST /api/auth/local-login - Login with username (or email for legacy accounts) and password
app.post('/api/auth/local-login', async (req, res) => {
  const startTime = Date.now();

  try {
    const { username, email, password } = req.body;
    const loginId = (username ?? email ?? '').trim();

    if (!loginId || !password) {
      const duration = Date.now() - startTime;
      console.log(`Login failed - missing credentials (${duration}ms)`);
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    console.log(`Login attempt for: ${loginId.substring(0, 3)}***`);

    const account = await findAccountByUsername(loginId);
    if (!account) {
      const duration = Date.now() - startTime;
      console.log(`Login failed - account not found (${duration}ms)`);
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const passwordStartTime = Date.now();
    const isValid = await verifyPassword(account, password);
    const passwordDuration = Date.now() - passwordStartTime;

    if (!isValid) {
      const duration = Date.now() - startTime;
      console.log(`Login failed - invalid password (${duration}ms, password check: ${passwordDuration}ms)`);
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    updateLastLogin(account.username);

    const sessionId = generateSessionId();
    setSession(sessionId, {
      email: account.username,
      lastUpdated: Date.now()
    });

    res.cookie('sessionId', sessionId, sessionCookieOptions());

    const totalDuration = Date.now() - startTime;
    console.log(`Login successful for ${account.username} (${totalDuration}ms total, ${passwordDuration}ms password)`);

    res.json({
      success: true,
      sessionId,
      user: {
        email: account.email ?? account.username,
        nickname: account.username
      }
    });
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`Login error after ${duration}ms:`, sanitizeErrorMessage(error));

    // Provide more specific error messages based on error type
    if (!process.env.DATABASE_URL || error.message?.includes('DATABASE_URL')) {
      res.status(503).json({ error: 'Login is unavailable: database not configured (DATABASE_URL).' });
    } else if (error.message?.includes('timeout') || error.code === 'ETIMEOUT') {
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

    const opts = sessionCookieOptions();
    res.clearCookie('sessionId', { httpOnly: opts.httpOnly, secure: opts.secure, sameSite: opts.sameSite });
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
      const account = await findAccountByUsername(session.email);
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
    const lockedOperatorIds: string[] = Array.isArray(req.body.lockedOperatorIds) ? req.body.lockedOperatorIds : [];
    const result = await buildTeam(session.email, preferences, lockedOperatorIds);

    if (useTeamDataDb()) {
      const lastTeamOperatorIds = result.team?.map((m: { operatorId: string }) => m.operatorId) ?? [];
      await saveNormalTeambuild(session.email, { lockedOperatorIds, lastTeamOperatorIds });
    }

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

// GET /api/team/preferences - Get universal team preferences (and optional user's teambuild state)
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

    // Always use universal preferences
    const prefs = getDefaultPreferences();
    const response: Record<string, unknown> = { ...prefs };

    // Include user's teambuild state (locked operators, last team) if available
    if (useTeamDataDb()) {
      const data = await getAccountTeamData(session.email);
      if (data?.normalTeambuild) {
        response.normalTeambuild = data.normalTeambuild;
      }
    }

    res.json(response);
  } catch (error: any) {
    console.error('Error getting preferences:', error);
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Failed to get preferences' });
  }
});

// POST /api/team/preferences - Save user's teambuild state (locked operators, last team)
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

    // Only save teambuild state, not preferences (preferences are universal now)
    if (useTeamDataDb()) {
      const normalTeambuild = req.body.normalTeambuild as { lockedOperatorIds?: string[]; lastTeamOperatorIds?: string[] } | undefined;
      if (normalTeambuild) {
        await saveNormalTeambuild(session.email, normalTeambuild);
      }
    }

    // Return universal preferences
    const prefs = getDefaultPreferences();
    res.json({ success: true, preferences: prefs });
  } catch (error: any) {
    console.error('Error saving teambuild state:', error);
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Failed to save teambuild state' });
  }
});

// GET /api/integrated-strategies/team - Get user's saved IS team state
app.get('/api/integrated-strategies/team', async (req, res) => {
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

    if (useTeamDataDb()) {
      const data = await getAccountTeamData(session.email);
      res.json(data?.isTeamState ?? null);
      return;
    }

    const isTeamFile = path.join(__dirname, '../data/integrated-strategies-teams.json');
    let allTeamStates: Record<string, any> = {};
    if (fs.existsSync(isTeamFile)) {
      try {
        const content = fs.readFileSync(isTeamFile, 'utf-8');
        allTeamStates = JSON.parse(content);
      } catch (error) {
        console.error('Error loading IS team states:', error);
      }
    }
    res.json(allTeamStates[session.email] || null);
  } catch (error: any) {
    console.error('Error getting IS team state:', error);
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Failed to get IS team state' });
  }
});

// POST /api/integrated-strategies/team - Save user's IS team state
app.post('/api/integrated-strategies/team', async (req, res) => {
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

    const teamState = req.body;
    if (!teamState) {
      res.status(400).json({ error: 'Team state is required' });
      return;
    }

    if (useTeamDataDb()) {
      await saveISTeamState(session.email, teamState as Record<string, unknown>);
      res.json({ success: true, teamState });
      return;
    }

    const isTeamFile = path.join(__dirname, '../data/integrated-strategies-teams.json');
    let allTeamStates: Record<string, any> = {};
    if (fs.existsSync(isTeamFile)) {
      try {
        const content = fs.readFileSync(isTeamFile, 'utf-8');
        allTeamStates = JSON.parse(content);
      } catch (error) {
        console.error('Error loading IS team states:', error);
      }
    }
    allTeamStates[session.email] = teamState;
    const dir = path.dirname(isTeamFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(isTeamFile, JSON.stringify(allTeamStates, null, 2));
    res.json({ success: true, teamState });
  } catch (error: any) {
    console.error('Error saving IS team state:', error);
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Failed to save IS team state' });
  }
});

// DELETE /api/integrated-strategies/team - Clear user's IS team state
app.delete('/api/integrated-strategies/team', async (req, res) => {
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

    if (useTeamDataDb()) {
      await deleteISTeamState(session.email);
      res.json({ success: true });
      return;
    }

    const isTeamFile = path.join(__dirname, '../data/integrated-strategies-teams.json');
    let allTeamStates: Record<string, any> = {};
    if (fs.existsSync(isTeamFile)) {
      try {
        const content = fs.readFileSync(isTeamFile, 'utf-8');
        allTeamStates = JSON.parse(content);
      } catch (error) {
        console.error('Error loading IS team states:', error);
      }
    }
    delete allTeamStates[session.email];
    const dir = path.dirname(isTeamFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(isTeamFile, JSON.stringify(allTeamStates, null, 2));
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting IS team state:', error);
    res.status(500).json({ error: sanitizeErrorMessage(error) || 'Failed to delete IS team state' });
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

// Initialize database connection before starting server
(async () => {
  await initializeDbConnection();
  if (process.env.DATABASE_URL) {
    await initializeTeamDataTable();
    await initializeChangelogTable();
  }

  // Start the server
  app.listen(PORT, () => {
    console.log('🚀 Arknights Website is running!');
    console.log(`📍 Server running at http://localhost:${PORT}`);
    console.log(`   Open your browser and navigate to: http://localhost:${PORT}`);
    console.log(`   Press Ctrl+C to stop the server`);
  });
})();
