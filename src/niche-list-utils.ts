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
  
  // Try filename matching - handle both with and without .json extension
  let filename = decodedNiche.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-').replace(/_/g, '-');
  if (!filename.endsWith('.json')) {
    filename = `${filename}.json`;
  }
  
  const filePath = path.join(dataDir, filename);
  
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
  
  // Try alternative filename formats (with underscores instead of hyphens)
  const altFilename = decodedNiche.toLowerCase().replace(/\s+/g, '_').replace(/\//g, '_');
  const altFilePath = path.join(dataDir, `${altFilename}.json`);
  
  if (fs.existsSync(altFilePath)) {
    try {
      const content = fs.readFileSync(altFilePath, 'utf-8');
      const operatorList = JSON.parse(content);
      if (operatorList.operators && operatorList.niche) {
        return operatorList;
      }
    } catch (error) {
      console.error(`Error loading operator list from ${altFilePath}:`, error);
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
 * Gets the filename (without .json) for a niche display name
 */
export function getNicheFilename(nicheDisplayName: string, dataDir: string = path.join(__dirname, '../data/niche-lists')): string | null {
  const collection = loadAllNicheLists(dataDir);
  for (const [displayName] of Object.entries(collection)) {
    if (displayName === nicheDisplayName) {
      // Find the filename by checking all files
      const files = fs.readdirSync(dataDir);
      for (const file of files) {
        if (file.endsWith('.json') && file !== 'trash-operators.json' && file !== 'README.md') {
          const filePath = path.join(dataDir, file);
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const parsed = JSON.parse(content);
            if (parsed.niche === displayName) {
              return file.replace('.json', '');
            }
          } catch (error) {
            // Skip invalid files
          }
        }
      }
    }
  }
  return null;
}

/**
 * Gets the display name for a niche filename
 */
export function getNicheDisplayName(nicheFilename: string, dataDir: string = path.join(__dirname, '../data/niche-lists')): string | null {
  const filePath = path.join(dataDir, `${nicheFilename}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      return parsed.niche || null;
    } catch (error) {
      return null;
    }
  }
  return null;
}

/**
 * Gets all niches (as filenames) that include a specific operator
 */
export function getNichesForOperator(operatorId: string, dataDir: string = path.join(__dirname, '../data/niche-lists')): string[] {
  const collection = loadAllNicheLists(dataDir);
  const niches: string[] = [];

  for (const [displayName, operatorList] of Object.entries(collection)) {
    if (operatorId in operatorList.operators) {
      // Get the filename for this niche
      const filename = getNicheFilename(displayName, dataDir);
      if (filename) {
        niches.push(filename);
      }
    }
  }

  return niches;
}

/**
 * Gets a map of all niche filenames to their display names
 */
export function getNicheFilenameMap(dataDir: string = path.join(__dirname, '../data/niche-lists')): Record<string, string> {
  const map: Record<string, string> = {};
  const files = fs.readdirSync(dataDir);
  
  for (const file of files) {
    if (file.endsWith('.json') && file !== 'trash-operators.json' && file !== 'README.md') {
      const filePath = path.join(dataDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed.niche) {
          const filename = file.replace('.json', '');
          map[filename] = parsed.niche;
        }
      } catch (error) {
        // Skip invalid files
      }
    }
  }
  
  return map;
}

