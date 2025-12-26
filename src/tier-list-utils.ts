/**
 * Utility functions for working with tier lists
 */

import * as fs from 'fs';
import * as path from 'path';
import { TierList, TierListCollection, TierRank } from './tier-list-types';

/**
 * Loads all tier lists from the data directory
 */
export function loadAllTierLists(dataDir: string = path.join(__dirname, '../data/tier-lists')): TierListCollection {
  const collection: TierListCollection = {};
  
  if (!fs.existsSync(dataDir)) {
    console.warn(`Tier lists directory does not exist: ${dataDir}`);
    return collection;
  }

  const files = fs.readdirSync(dataDir);
  const jsonFiles = files.filter(file => 
    file.endsWith('.json') && file !== 'trash-operators.json' && file !== 'README.md'
  );

  for (const file of jsonFiles) {
    try {
      const filePath = path.join(dataDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const tierList: TierList = JSON.parse(content);
      // Only add if it has the tier list structure (has 'tiers' property)
      if (tierList.tiers && tierList.niche) {
        collection[tierList.niche] = tierList;
      }
    } catch (error) {
      console.error(`Error loading tier list from ${file}:`, error);
    }
  }

  return collection;
}

/**
 * Loads a specific tier list by niche name
 */
export function loadTierList(niche: string, dataDir: string = path.join(__dirname, '../data/tier-lists')): TierList | null {
  const filePath = path.join(dataDir, `${niche.toLowerCase().replace(/\s+/g, '-')}.json`);
  
  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading tier list for ${niche}:`, error);
    return null;
  }
}

/**
 * Saves a tier list to a JSON file
 */
export function saveTierList(tierList: TierList, dataDir: string = path.join(__dirname, '../data/tier-lists')): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filename = `${tierList.niche.toLowerCase().replace(/\s+/g, '-')}.json`;
  const filePath = path.join(dataDir, filename);
  
  // Update lastUpdated timestamp
  tierList.lastUpdated = new Date().toISOString().split('T')[0];
  
  fs.writeFileSync(filePath, JSON.stringify(tierList, null, 2));
}

/**
 * Validates that all operator IDs in a tier list exist in the operators data
 */
export function validateTierList(tierList: TierList, operatorsData: Record<string, any>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const tierRanks: TierRank[] = ['EX', 'S', 'A', 'B', 'C', 'D', 'F'];

  for (const rank of tierRanks) {
    const operators = tierList.tiers[rank] || [];
    for (const op of operators) {
      if (!operatorsData[op.operatorId]) {
        errors.push(`Operator ${op.operatorId} in ${tierList.niche} ${rank} tier not found in operators data`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Gets all operators in a specific tier for a niche
 */
export function getOperatorsInTier(niche: string, tier: TierRank, dataDir: string = path.join(__dirname, '../data/tier-lists')): string[] {
  const tierList = loadTierList(niche, dataDir);
  if (!tierList) {
    return [];
  }

  const operators = tierList.tiers[tier] || [];
  return operators.map(op => op.operatorId);
}

/**
 * Gets all niches that include a specific operator
 */
export function getNichesForOperator(operatorId: string, dataDir: string = path.join(__dirname, '../data/tier-lists')): string[] {
  const collection = loadAllTierLists(dataDir);
  const niches: string[] = [];

  for (const [niche, tierList] of Object.entries(collection)) {
    const tierRanks: TierRank[] = ['EX', 'S', 'A', 'B', 'C', 'D', 'F'];
    for (const rank of tierRanks) {
      const operators = tierList.tiers[rank] || [];
      if (operators.some(op => op.operatorId === operatorId)) {
        niches.push(niche);
        break;
      }
    }
  }

  return niches;
}

