/**
 * Main entry point for the Arknights website
 */

import express from 'express';
import path from 'path';
import { loadAllTierLists, loadTierList } from './tier-list-utils';
import * as fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the public directory (React build output)
app.use(express.static(path.join(__dirname, '../public')));
// Serve images and other assets
app.use('/images', express.static(path.join(__dirname, '../public/images')));

// API route to get all tier lists (niches)
app.get('/api/tier-lists', (_req, res) => {
  try {
    const tierLists = loadAllTierLists();
    const niches = Object.keys(tierLists).map(niche => ({
      niche,
      description: tierLists[niche].description || '',
      lastUpdated: tierLists[niche].lastUpdated || ''
    }));
    res.json(niches);
  } catch (error) {
    console.error('Error loading tier lists:', error);
    res.status(500).json({ error: 'Failed to load tier lists' });
  }
});

// API route to get a specific tier list
app.get('/api/tier-lists/:niche', (req, res) => {
  try {
    const niche = req.params.niche;
    const tierList = loadTierList(niche);
    
    if (!tierList) {
      res.status(404).json({ error: 'Tier list not found' });
      return;
    }

    // Load operator data to enrich the tier list
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

    // Enrich tier list with operator data
    const enrichedTierList = {
      ...tierList,
      tiers: {} as Record<string, any[]>
    };

    const tierRanks = ['EX', 'S', 'A', 'B', 'C', 'D', 'F'] as const;
    for (const rank of tierRanks) {
      enrichedTierList.tiers[rank] = (tierList.tiers[rank] || []).map(op => ({
        ...op,
        operator: operatorsData[op.operatorId] || null
      }));
    }

    res.json(enrichedTierList);
  } catch (error) {
    console.error('Error loading tier list:', error);
    res.status(500).json({ error: 'Failed to load tier list' });
  }
});

// API route to get operators by rarity
app.get('/api/operators/:rarity', (req, res) => {
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

// API route to get trash operators
app.get('/api/trash-operators', (_req, res) => {
  try {
    const filePath = path.join(__dirname, '../data/tier-lists', 'trash-operators.json');
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Trash operators not found' });
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const trashData = JSON.parse(content);
    res.json(trashData);
  } catch (error) {
    console.error('Error loading trash operators:', error);
    res.status(500).json({ error: 'Failed to load trash operators' });
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
