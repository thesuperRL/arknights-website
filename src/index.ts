/**
 * Main entry point for the Arknights website
 */

import express from 'express';
import path from 'path';
import { loadAllNicheLists, loadNicheList } from './niche-list-utils';
import * as fs from 'fs';

const app = express();
const PORT = process.env.PORT || 3000;

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
      operators: operatorList.operators.map(operatorId => ({
        operatorId,
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
    res.json(trashData);
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
      if (operatorList.operators && operatorList.operators.includes(operatorId)) {
        rankings.push({
          niche: operatorList.niche || niche,
          tier: 'N/A',
          notes: undefined
        });
      }
    }

    // Check if operator is in trash list
    const trashFilePath = path.join(__dirname, '../data/niche-lists', 'trash-operators.json');
    if (fs.existsSync(trashFilePath)) {
      const trashContent = fs.readFileSync(trashFilePath, 'utf-8');
      const trashData = JSON.parse(trashContent);
      if (trashData.operators && trashData.operators.some((op: any) => op.operatorId === operatorId)) {
        rankings.push({
          niche: 'Trash Operators',
          tier: 'N/A',
          notes: 'No optimal use'
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
