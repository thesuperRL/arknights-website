/**
 * Utility functions for working with operator lists
 * Uses JSON files for storage
 * Internal identification uses filename codes (e.g., "healing-operators") instead of display names
 */

import * as fs from 'fs';
import * as path from 'path';
import { OperatorList, OperatorListCollection } from './niche-list-types';

/**
 * Loads all operator lists from the data directory
 * Returns a collection keyed by filename (without .json extension)
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
        // Use filename (without .json) as the key
        const filename = file.replace('.json', '');
        collection[filename] = operatorList;
      }
    } catch (error) {
      console.error(`Error loading operator list from ${file}:`, error);
    }
  }

  return collection;
}

/**
 * Loads a specific operator list by filename (without .json extension)
 * The filename parameter should be the filename code (e.g., "healing-operators")
 */
export function loadNicheList(nicheFilename: string, dataDir: string = path.join(__dirname, '../data/niche-lists')): OperatorList | null {
  // Decode URL-encoded niche filename
  const decodedFilename = decodeURIComponent(nicheFilename);
  
  // Try loading by filename directly
  let filename = decodedFilename;
  if (filename.endsWith('.json')) {
    filename = filename.replace('.json', '');
  }
  
  const filePath = path.join(dataDir, `${filename}.json`);
  
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
 * The filename is determined from the niche display name (for backwards compatibility)
 */
export function saveNicheList(operatorList: OperatorList, dataDir: string = path.join(__dirname, '../data/niche-lists')): void {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filename = `${operatorList.niche.toLowerCase().replace(/\s+/g, '-').replace(/\//g, '-')}.json`;
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
 * @deprecated Use filename codes directly. This function is kept for backwards compatibility.
 */
export function getNicheFilename(nicheDisplayName: string, dataDir: string = path.join(__dirname, '../data/niche-lists')): string | null {
  const files = fs.readdirSync(dataDir);
  
  for (const file of files) {
    if (file.endsWith('.json') && file !== 'trash-operators.json' && file !== 'README.md') {
      const filePath = path.join(dataDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed.niche === nicheDisplayName) {
          return file.replace('.json', '');
        }
      } catch (error) {
        // Skip invalid files
      }
    }
  }
  return null;
}

/**
 * Gets the display name for a niche filename
 */
export function getNicheDisplayName(nicheFilename: string, dataDir: string = path.join(__dirname, '../data/niche-lists')): string | null {
  const operatorList = loadNicheList(nicheFilename, dataDir);
  return operatorList?.niche || null;
}

/**
 * Gets all niches (as filenames) that include a specific operator
 */
export function getNichesForOperator(operatorId: string, dataDir: string = path.join(__dirname, '../data/niche-lists')): string[] {
  const collection = loadAllNicheLists(dataDir);
  const niches: string[] = [];

  // Collection is now keyed by filename, so we can directly iterate
  for (const [filename, operatorList] of Object.entries(collection)) {
    if (operatorId in operatorList.operators) {
      niches.push(filename);
    }
  }

  // If operator is in fragile niche, also count them as def-shred and res-shred
  // This allows fragile operators to be counted in those niches for teambuilding
  if (niches.includes('fragile')) {
    if (!niches.includes('def-shred')) {
      niches.push('def-shred');
    }
    if (!niches.includes('res-shred')) {
      niches.push('res-shred');
    }
  }

  // If operator is in dual-dps niche, also count them as arts-dps and physical-dps
  // This allows dual-dps operators to be counted in those niches for teambuilding
  if (niches.includes('dual-dps')) {
    if (!niches.includes('arts-dps')) {
      niches.push('arts-dps');
    }
    if (!niches.includes('physical-dps')) {
      niches.push('physical-dps');
    }
  }

  return niches;
}

/**
 * Gets a map of all niche filenames to their display names
 */
export function getNicheFilenameMap(dataDir: string = path.join(__dirname, '../data/niche-lists')): Record<string, string> {
  const map: Record<string, string> = {};
  const collection = loadAllNicheLists(dataDir);
  
  // Collection is now keyed by filename, so we can directly map
  for (const [filename, operatorList] of Object.entries(collection)) {
    map[filename] = operatorList.niche;
  }
  
  return map;
}
