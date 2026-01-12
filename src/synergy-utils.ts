/**
 * Utility functions for working with synergies
 * Uses JSON files for storage in data/synergies/
 */

import * as fs from 'fs';
import * as path from 'path';

export interface Synergy {
  name: string;
  description: string;
  core: Record<string, string[]>; // Dictionary of group name -> operator IDs
  optional: Record<string, string[]>; // Dictionary of group name -> operator IDs
  corePointBonus: number; // Bonus points added if core is satisfied (at least one operator from each core group)
  optionalPointBonus: number; // Bonus points added for each optional group satisfied IF core is already satisfied
  isOnly: boolean; // If true, this synergy is only valid for Integrated Strategies (not normal teambuilding)
}

export interface SynergyCollection {
  [filename: string]: Synergy;
}

/**
 * Loads all synergies from the data/synergies directory
 * Returns a collection keyed by filename (without .json extension)
 */
export function loadAllSynergies(dataDir: string = path.join(__dirname, '../data/synergies')): SynergyCollection {
  const collection: SynergyCollection = {};

  if (!fs.existsSync(dataDir)) {
    console.warn(`Synergies directory does not exist: ${dataDir}`);
    return collection;
  }

  const files = fs.readdirSync(dataDir);

  for (const file of files) {
    if (file.endsWith('.json')) {
      const fullPath = path.join(dataDir, file);
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const synergy: Synergy = JSON.parse(content);
        // Only add if it has the synergy structure (has 'name', 'core', 'optional')
        if (synergy.name && synergy.core && synergy.optional) {
          const filename = file.replace('.json', '');
          collection[filename] = synergy;
        }
      } catch (error) {
        console.error(`Error loading synergy from ${fullPath}:`, error);
      }
    }
  }

  return collection;
}

/**
 * Loads a specific synergy by filename (without .json extension)
 */
export function loadSynergy(synergyFilename: string, dataDir: string = path.join(__dirname, '../data/synergies')): Synergy | null {
  const decodedFilename = decodeURIComponent(synergyFilename);
  let filename = decodedFilename;
  if (filename.endsWith('.json')) {
    filename = filename.replace('.json', '');
  }

  const filePath = path.join(dataDir, `${filename}.json`);

  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const synergy = JSON.parse(content);
      // Only return if it has the synergy structure
      if (synergy.name && synergy.core && synergy.optional) {
        return synergy;
      }
    } catch (error) {
      console.error(`Error loading synergy from ${filePath}:`, error);
    }
  }

  return null;
}
