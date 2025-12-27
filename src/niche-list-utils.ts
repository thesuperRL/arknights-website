/**
 * Utility functions for working with operator lists
 */

import * as fs from 'fs';
import * as path from 'path';
import { OperatorList, OperatorListCollection } from './niche-list-types';

/**
 * Loads all operator lists from the data directory
 */
export function loadAllNicheLists(dataDir: string = path.join(__dirname, '../data/niche-lists')): OperatorListCollection {
  const collection: OperatorListCollection = {};
  
  if (!fs.existsSync(dataDir)) {
    console.warn(`Operator lists directory does not exist: ${dataDir}`);
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
      const operatorList: OperatorList = JSON.parse(content);
      // Only add if it has the operator list structure (has 'operators' property)
      if (operatorList.operators && operatorList.niche) {
        collection[operatorList.niche] = operatorList;
      }
    } catch (error) {
      console.error(`Error loading operator list from ${file}:`, error);
    }
  }

  return collection;
}

/**
 * Loads a specific operator list by niche name
 * First tries to find by exact niche name match, then falls back to filename matching
 */
export function loadNicheList(niche: string, dataDir: string = path.join(__dirname, '../data/niche-lists')): OperatorList | null {
  // Decode URL-encoded niche name
  const decodedNiche = decodeURIComponent(niche);
  
  // First, try to load all operator lists and find by niche name (most reliable)
  const allOperatorLists = loadAllNicheLists(dataDir);
  for (const [nicheName, operatorList] of Object.entries(allOperatorLists)) {
    if (nicheName === decodedNiche || nicheName.toLowerCase() === decodedNiche.toLowerCase()) {
      return operatorList;
    }
  }
  
  // Fallback: try filename matching
  const filePath = path.join(dataDir, `${decodedNiche.toLowerCase().replace(/\s+/g, '-')}.json`);
  
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const operatorList = JSON.parse(content);
      // Only return if it has the operator list structure
      if (operatorList.operators && operatorList.niche) {
        return operatorList;
      }
    } catch (error) {
      console.error(`Error loading operator list from ${filePath}:`, error);
    }
  }
  
  return null;
}

/**
 * Saves an operator list to a JSON file
 */
export function saveNicheList(operatorList: OperatorList, dataDir: string = path.join(__dirname, '../data/niche-lists')): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filename = `${operatorList.niche.toLowerCase().replace(/\s+/g, '-')}.json`;
  const filePath = path.join(dataDir, filename);
  
  // Update lastUpdated timestamp
  operatorList.lastUpdated = new Date().toISOString().split('T')[0];
  
  fs.writeFileSync(filePath, JSON.stringify(operatorList, null, 2));
}

/**
 * Validates that all operator IDs in an operator list exist in the operators data
 */
export function validateNicheList(operatorList: OperatorList, operatorsData: Record<string, any>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const operatorId of Object.keys(operatorList.operators)) {
    if (!operatorsData[operatorId]) {
      errors.push(`Operator ${operatorId} in ${operatorList.niche} not found in operators data`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Gets all niches that include a specific operator
 */
export function getNichesForOperator(operatorId: string, dataDir: string = path.join(__dirname, '../data/niche-lists')): string[] {
  const collection = loadAllNicheLists(dataDir);
  const niches: string[] = [];

  for (const [niche, operatorList] of Object.entries(collection)) {
    if (operatorId in operatorList.operators) {
      niches.push(niche);
    }
  }

  return niches;
}

