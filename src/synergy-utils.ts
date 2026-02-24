/**
 * Utility functions for working with synergies
 * Uses JSON files for storage in data/synergies/
 */

import * as fs from 'fs';
import * as path from 'path';

// Operator entry in synergies can be:
// - string: operator ID (backwards compatible, means always has synergy)
// - [string, string]: [operatorId, level] where level is "" (always), "E2" (elite 2), or a module code
export type SynergyOperatorEntry = string | [string, string];

export interface Synergy {
  name: string;
  description: string;
  core: Record<string, SynergyOperatorEntry[]>; // Dictionary of group name -> operator entries
  optional: Record<string, SynergyOperatorEntry[]>; // Dictionary of group name -> operator entries
  corePointBonus: number; // Bonus points added if core is satisfied (at least one operator from each core group)
  optionalPointBonus: number; // Bonus points added for each optional group satisfied IF core is already satisfied
  isOnly: boolean; // If true, this synergy is only valid for Integrated Strategies (not normal teambuilding)
  coreCountSeparately: boolean; // If true, each operator in core groups gives corePointBonus (instead of once per synergy)
  optionalCountSeparately: boolean; // If true, each operator in optional groups gives optionalPointBonus (instead of once per group)
  optionalCountMinimum: number; // Minimum number of optional operators needed before optional bonuses start counting (default 0)
}

export interface SynergyCollection {
  [filename: string]: Synergy;
}

const defaultSynergyDataDir = path.join(__dirname, '../data/synergies');
let cachedAllSynergies: SynergyCollection | null = null;
let cachedAllSynergiesDataDir: string | null = null;
const synergyCache = new Map<string, Synergy | null>();

/**
 * Loads all synergies from the data/synergies directory
 * Returns a collection keyed by filename (without .json extension)
 */
export function loadAllSynergies(dataDir: string = defaultSynergyDataDir): SynergyCollection {
  if (cachedAllSynergies !== null && cachedAllSynergiesDataDir === dataDir) {
    return cachedAllSynergies;
  }
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
        if (synergy.name && synergy.core && synergy.optional) {
          const filename = file.replace('.json', '');
          collection[filename] = synergy;
          synergyCache.set(`${dataDir}\0${filename}`, synergy);
        }
      } catch (error) {
        console.error(`Error loading synergy from ${fullPath}:`, error);
      }
    }
  }

  cachedAllSynergies = collection;
  cachedAllSynergiesDataDir = dataDir;
  return collection;
}

/**
 * Loads a specific synergy by filename (without .json extension)
 */
export function loadSynergy(synergyFilename: string, dataDir: string = defaultSynergyDataDir): Synergy | null {
  const decodedFilename = decodeURIComponent(synergyFilename);
  let filename = decodedFilename;
  if (filename.endsWith('.json')) {
    filename = filename.replace('.json', '');
  }
  const cacheKey = `${dataDir}\0${filename}`;
  const cached = synergyCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let result: Synergy | null = null;
  const filePath = path.join(dataDir, `${filename}.json`);
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const synergy = JSON.parse(content);
      if (synergy.name && synergy.core && synergy.optional) result = synergy;
    } catch (error) {
      console.error(`Error loading synergy from ${filePath}:`, error);
    }
  }
  synergyCache.set(cacheKey, result);
  return result;
}
