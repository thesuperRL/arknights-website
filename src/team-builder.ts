/**
 * Team building algorithm for Arknights operators
 */

import * as fs from 'fs';
import * as path from 'path';
import { getNichesForOperator, loadNicheList } from './niche-list-utils';
import { getOwnedOperators, getWantToUse } from './account-storage';
import { loadAllSynergies, SynergyOperatorEntry } from './synergy-utils';

/**
 * Helper function to extract operator ID from a synergy entry
 * Handles both old format (string) and new format ([string, string])
 */
function getOperatorIdFromSynergyEntry(entry: SynergyOperatorEntry): string {
  if (typeof entry === 'string') {
    return entry;
  } else if (Array.isArray(entry) && entry.length >= 1) {
    return entry[0];
  }
  return '';
}

/**
 * Helper function to extract all operator IDs from an array of synergy entries
 */
function getOperatorIdsFromSynergyEntries(entries: SynergyOperatorEntry[]): string[] {
  return entries.map(getOperatorIdFromSynergyEntry);
}

/**
 * Hope cost configuration for different rarity operators
 */
export const HOPE_COST_CONFIG = {
  6: 6,  // 6-star operators cost 6 hope
  5: 3,  // 5-star operators cost 3 hope
  4: 0,  // 4-star operators cost 0 hope (configurable)
  3: 0,  // 3-star and below cost 0 hope
  2: 0,
  1: 0
};

/**
 * Get the hope cost for a given rarity using configured values
 */
export function getConfiguredHopeCost(rarity: number, hopeCosts?: Record<number, number>): number {
  if (hopeCosts && hopeCosts[rarity] !== undefined) {
    return hopeCosts[rarity];
  }
  return HOPE_COST_CONFIG[rarity as keyof typeof HOPE_COST_CONFIG] ?? 0;
}

export interface NicheRange {
  min: number;
  max: number;
}

export interface TeamPreferences {
  requiredNiches: Record<string, NicheRange>; // Niche filename -> range of operators needed (e.g., {"healing-operators": {min: 1, max: 2}})
  preferredNiches: Record<string, NicheRange>; // Niche filename -> range of operators preferred (e.g., {"arts-dps": {min: 1, max: 3}})
  rarityRanking?: number[]; // Rarity preference order (e.g., [6, 4, 5, 3, 2, 1] means 6-star is most preferred, then 4-star, etc.)
  allowDuplicates?: boolean; // Allow multiple operators from same niche
  hopeCosts?: Record<number, number>; // Hope costs for different rarities (e.g., {6: 6, 5: 3, 4: 0})
}

export interface TeamMember {
  operatorId: string;
  operator: any; // Operator data
  niches: string[]; // Niches this operator fills
  primaryNiche?: string; // Primary niche this operator is filling
  isTrash?: boolean; // Whether this operator is a trash operator
}

export interface TeamResult {
  team: TeamMember[];
  coverage: Record<string, number>; // Niche -> count of operators covering it
  missingNiches: string[]; // Required niches that couldn't be filled
  score: number; // Team quality score
  emptySlots: number; // Number of empty slots after filling all niches
}

/**
 * Loads trash operators from the trash-operators.json file
 */
function loadTrashOperators(): Set<string> {
  const trashFilePath = path.join(__dirname, '../data', 'trash-operators.json');
  const trashOperators = new Set<string>();

  if (fs.existsSync(trashFilePath)) {
    try {
      const content = fs.readFileSync(trashFilePath, 'utf-8');
      const trashData = JSON.parse(content);
      if (trashData.operators && typeof trashData.operators === 'object' && !Array.isArray(trashData.operators)) {
        // Dictionary format
        for (const operatorId of Object.keys(trashData.operators)) {
          trashOperators.add(operatorId);
        }
      } else if (trashData.operators && Array.isArray(trashData.operators)) {
        // Legacy array format (for backwards compatibility)
        for (const op of trashData.operators) {
          if (typeof op === 'string') {
            trashOperators.add(op);
          } else if (op.operatorId) {
            trashOperators.add(op.operatorId);
          }
        }
      }
    } catch (error) {
      console.error('Error loading trash operators:', error);
    }
  }

  return trashOperators;
}

/**
 * Loads free operators from the free.json file
 */
function loadFreeOperators(): Set<string> {
  const freeFilePath = path.join(__dirname, '../data', 'free.json');
  const freeOperators = new Set<string>();

  if (fs.existsSync(freeFilePath)) {
    try {
      const content = fs.readFileSync(freeFilePath, 'utf-8');
      const freeData = JSON.parse(content);
      if (freeData.operators && typeof freeData.operators === 'object') {
        // Flat operator structure: iterate directly through operators
        for (const operatorId of Object.keys(freeData.operators)) {
          freeOperators.add(operatorId);
        }
      }
    } catch (error) {
      console.error('Error loading free operators:', error);
    }
  }

  return freeOperators;
}

/**
 * Loads team preferences from team-preferences.json for a specific user
 */
function loadTeamPreferencesForUser(email: string): TeamPreferences | null {
  const preferencesFile = path.join(__dirname, '../data/team-preferences.json');
  
  if (!fs.existsSync(preferencesFile)) {
    return null;
  }
  
  try {
    const content = fs.readFileSync(preferencesFile, 'utf-8');
    const allPreferences: Record<string, TeamPreferences> = JSON.parse(content);
    
    if (allPreferences[email]) {
      return allPreferences[email];
    }
  } catch (error) {
    console.error('Error loading team preferences:', error);
  }
  
  return null;
}

/**
 * Loads all operator data from JSON files
 */
function loadAllOperators(): Record<string, any> {
  const operatorsDir = path.join(__dirname, '../data');
  const operators: Record<string, any> = {};
  
  const rarityFiles = ['1star', '2star', '3star', '4star', '5star', '6star'];
  
  for (const rarity of rarityFiles) {
    const filePath = path.join(operatorsDir, `operators-${rarity}.json`);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        // Handle both dictionary and array formats
        if (Array.isArray(data)) {
          for (const op of data) {
            if (op.id) {
              operators[op.id] = op;
            }
          }
        } else {
          Object.assign(operators, data);
        }
      } catch (error) {
        console.error(`Error loading operators-${rarity}.json:`, error);
      }
    }
  }
  
  return operators;
}

/** Niches excluded from all teambuilding (not used for filling, scoring, or coverage). */
const TEAMBUILD_EXCLUDED_NICHES = new Set(['unconventional-niches']);

/**
 * Gets niches for an operator, with AOE niches merged into DPS niches.
 * Excludes niches that are not used in teambuilding (e.g. unconventional-niches).
 */
function getOperatorNiches(operatorId: string): string[] {
  const niches = getNichesForOperator(operatorId);
  const expandedNiches = niches.filter(n => !TEAMBUILD_EXCLUDED_NICHES.has(n));
  
  // Add arts-dps if operator has aoe-arts-dps but not arts-dps
  if (niches.includes('aoe-arts-dps') && !niches.includes('arts-dps')) {
    expandedNiches.push('arts-dps');
  }
  
  // Add physical-dps if operator has aoe-physical-dps but not physical-dps
  if (niches.includes('aoe-physical-dps') && !niches.includes('physical-dps')) {
    expandedNiches.push('physical-dps');
  }
  
  return expandedNiches;
}

/**
 * Calculates synergy score for a team
 * @param team Team members (operator objects)
 * @param isIS Whether this is for Integrated Strategies (filters out non-IS synergies)
 * @returns Total synergy bonus score
 */
function calculateSynergyScore(team: TeamMember[], isIS: boolean): number {
  const synergies = loadAllSynergies();
  const teamOperatorIds = new Set(team.map(member => member.operatorId));
  let totalScore = 0;

  for (const [, synergy] of Object.entries(synergies)) {
    // Skip IS-only synergies for normal teambuilding, skip non-IS synergies for IS
    if (synergy.isOnly && !isIS) continue;
    if (!synergy.isOnly && isIS) continue;

    // Check if core is satisfied (at least one operator from each core group)
    let coreSatisfied = true;
    for (const [, operatorEntries] of Object.entries(synergy.core)) {
      const operatorIds = getOperatorIdsFromSynergyEntries(operatorEntries);
      const hasOperator = operatorIds.some(id => teamOperatorIds.has(id));
      if (!hasOperator) {
        coreSatisfied = false;
        break;
      }
    }

    if (synergy.coreCountSeparately) {
      // Count each operator in core groups separately
      for (const [, operatorEntries] of Object.entries(synergy.core)) {
        const operatorIds = getOperatorIdsFromSynergyEntries(operatorEntries);
        for (const operatorId of operatorIds) {
          if (teamOperatorIds.has(operatorId)) {
            totalScore += synergy.corePointBonus;
          }
        }
      }
      // Optional bonuses still require core to be satisfied (all core groups have at least one operator)
      if (coreSatisfied) {
        // Count total optional operators
        let totalOptionalCount = 0;
        for (const [, operatorEntries] of Object.entries(synergy.optional)) {
          const operatorIds = getOperatorIdsFromSynergyEntries(operatorEntries);
          for (const operatorId of operatorIds) {
            if (teamOperatorIds.has(operatorId)) {
              totalOptionalCount++;
            }
          }
        }

        // Check if we meet the minimum threshold
        const optionalCountMinimum = synergy.optionalCountMinimum || 0;
        if (totalOptionalCount >= optionalCountMinimum) {
          if (synergy.optionalCountSeparately) {
            // Count each operator in optional groups separately
            for (const [, operatorEntries] of Object.entries(synergy.optional)) {
              const operatorIds = getOperatorIdsFromSynergyEntries(operatorEntries);
              for (const operatorId of operatorIds) {
                if (teamOperatorIds.has(operatorId)) {
                  totalScore += synergy.optionalPointBonus;
                }
              }
            }
          } else {
            // Count satisfied optional groups
            let satisfiedOptionalGroups = 0;
            for (const [, operatorEntries] of Object.entries(synergy.optional)) {
              const operatorIds = getOperatorIdsFromSynergyEntries(operatorEntries);
              const hasOperator = operatorIds.some(id => teamOperatorIds.has(id));
              if (hasOperator) {
                satisfiedOptionalGroups++;
              }
            }
            totalScore += satisfiedOptionalGroups * synergy.optionalPointBonus;
          }
        }
      }
    } else {
      // Original behavior: core bonus once if all core groups satisfied
      if (coreSatisfied) {
        totalScore += synergy.corePointBonus;

        // Handle optional bonuses (only if core is satisfied)
        // Count total optional operators
        let totalOptionalCount = 0;
        for (const [, operatorEntries] of Object.entries(synergy.optional)) {
          const operatorIds = getOperatorIdsFromSynergyEntries(operatorEntries);
          for (const operatorId of operatorIds) {
            if (teamOperatorIds.has(operatorId)) {
              totalOptionalCount++;
            }
          }
        }

        // Check if we meet the minimum threshold
        const optionalCountMinimum = synergy.optionalCountMinimum || 0;
        if (totalOptionalCount >= optionalCountMinimum) {
          if (synergy.optionalCountSeparately) {
            // Count each operator in optional groups separately
            for (const [, operatorEntries] of Object.entries(synergy.optional)) {
              const operatorIds = getOperatorIdsFromSynergyEntries(operatorEntries);
              for (const operatorId of operatorIds) {
                if (teamOperatorIds.has(operatorId)) {
                  totalScore += synergy.optionalPointBonus;
                }
              }
            }
          } else {
            // Count satisfied optional groups (original behavior)
            let satisfiedOptionalGroups = 0;
            for (const [, operatorEntries] of Object.entries(synergy.optional)) {
              const operatorIds = getOperatorIdsFromSynergyEntries(operatorEntries);
              const hasOperator = operatorIds.some(id => teamOperatorIds.has(id));
              if (hasOperator) {
                satisfiedOptionalGroups++;
              }
            }
            totalScore += satisfiedOptionalGroups * synergy.optionalPointBonus;
          }
        }
      }
    }
  }

  return totalScore;
}

/**
 * Calculates synergy score for a specific operator being added to a team (for IS recommendations)
 * @param team Team members (operator objects including the new operator)
 * @param newOperatorId The operator being evaluated
 * @param isIS Whether this is for Integrated Strategies
 * @returns Synergy bonus score for this operator
 */
function calculateSynergyScoreForOperator(team: any[], newOperatorId: string, isIS: boolean): number {
  const synergies = loadAllSynergies();
  const teamOperatorIds = new Set(team.map(op => op.id || op.operatorId));
  let totalScore = 0;

  for (const [, synergy] of Object.entries(synergies)) {
    // Skip IS-only synergies for normal teambuilding, skip non-IS synergies for IS
    if (synergy.isOnly && !isIS) continue;
    if (!synergy.isOnly && isIS) continue;

    // Check if this operator is in this synergy
    let operatorInSynergy = false;
    let operatorRole: 'core' | 'optional' | null = null;

    // Check core groups
    for (const [, operatorEntries] of Object.entries(synergy.core)) {
      const operatorIds = getOperatorIdsFromSynergyEntries(operatorEntries);
      if (operatorIds.includes(newOperatorId)) {
        operatorInSynergy = true;
        operatorRole = 'core';
        break;
      }
    }

    // Check optional groups
    if (!operatorInSynergy) {
      for (const [, operatorEntries] of Object.entries(synergy.optional)) {
        const operatorIds = getOperatorIdsFromSynergyEntries(operatorEntries);
        if (operatorIds.includes(newOperatorId)) {
          operatorInSynergy = true;
          operatorRole = 'optional';
          break;
        }
      }
    }

    if (!operatorInSynergy) continue;

    // Check if core is satisfied (at least one operator from each core group)
    let coreSatisfied = true;
    for (const [, operatorEntries] of Object.entries(synergy.core)) {
      const operatorIds = getOperatorIdsFromSynergyEntries(operatorEntries);
      const hasOperator = operatorIds.some(id => teamOperatorIds.has(id));
      if (!hasOperator) {
        coreSatisfied = false;
        break;
      }
    }

    if (operatorRole === 'core') {
      if (synergy.coreCountSeparately) {
        // Each core operator gives bonus
        totalScore += synergy.corePointBonus;
      } else {
        // If this operator completes the core, add core bonus once
        if (coreSatisfied) {
          totalScore += synergy.corePointBonus;
        }
      }
    } else if (operatorRole === 'optional') {
      // Optional bonuses require core to be satisfied (all core groups have at least one operator)
      if (coreSatisfied) {
        // Count total optional operators
        let totalOptionalCount = 0;
        for (const [, operatorIds] of Object.entries(synergy.optional)) {
          for (const operatorId of operatorIds) {
            if (teamOperatorIds.has(operatorId)) {
              totalOptionalCount++;
            }
          }
        }

        // Check if we meet the minimum threshold
        const optionalCountMinimum = synergy.optionalCountMinimum || 0;
        if (totalOptionalCount >= optionalCountMinimum) {
          if (synergy.optionalCountSeparately) {
            // Each optional operator gives bonus
            totalScore += synergy.optionalPointBonus;
          } else {
            // Only count if this operator's group is now satisfied (first operator from this group)
            for (const [, operatorEntries] of Object.entries(synergy.optional)) {
              const operatorIds = getOperatorIdsFromSynergyEntries(operatorEntries);
              if (operatorIds.includes(newOperatorId)) {
                const hasOtherOperator = operatorIds.some(id => id !== newOperatorId && teamOperatorIds.has(id));
                if (!hasOtherOperator) {
                  // This is the first operator from this group, so add bonus
                  totalScore += synergy.optionalPointBonus;
                }
                break;
              }
            }
          }
        }
      }
    }
  }

  return totalScore;
}

/**
 * Gets the tier of an operator in a specific niche
 * Returns a numerical score where higher numbers = better tier
 */
/**
 * Gets the tier score for an operator in a specific niche at a specific level
 * @param operatorId The operator ID
 * @param niche The niche filename
 * @param level The level requirement: "" (level 0), "E2" (elite 2), or module code
 * @returns The tier score, or 0 if not found at that level
 */
export function getOperatorTierInNicheAtLevel(operatorId: string, niche: string, level: string): number {
  const nicheList = loadNicheList(niche);
  if (!nicheList || !nicheList.operators) {
    return 0;
  }

  // Define tier values (higher = better)
  const tierValues: Record<string, number> = {
    'SS': 100,
    'S': 90,
    'A': 80,
    'B': 70,
    'C': 60,
    'D': 50,
    'F': 40
  };

  // Search through all tier groups to find the operator at the specified level
  for (const [tier, operators] of Object.entries(nicheList.operators)) {
    if (operators && operatorId in operators) {
      const entry = operators[operatorId];
      let entryLevel = '';
      
      // Extract level from entry
      if (typeof entry === 'string') {
        entryLevel = ''; // Old format, always available
      } else if (Array.isArray(entry) && entry.length >= 2) {
        entryLevel = entry[1] || '';
      }
      
      // Match level requirement
      if (entryLevel === level) {
        return tierValues[tier] || 0;
      }
    }
  }

  return 0; // Not found at this level
}

/**
 * Gets all tiers for an operator in a niche at level 0 (empty string)
 * Returns the highest tier score available at level 0
 */
export function getOperatorTierAtLevel0(operatorId: string, niche: string): number {
  return getOperatorTierInNicheAtLevel(operatorId, niche, '');
}

/**
 * Gets all new tiers for an operator in a niche that require E2 or modules
 * Returns the highest tier score from E2/module levels (excluding level 0)
 */
export function getOperatorNewTiersAtPromotion(operatorId: string, niche: string): number {
  const nicheList = loadNicheList(niche);
  if (!nicheList || !nicheList.operators) {
    return 0;
  }

  // Define tier values (higher = better)
  const tierValues: Record<string, number> = {
    'SS': 100,
    'S': 90,
    'A': 80,
    'B': 70,
    'C': 60,
    'D': 50,
    'F': 40
  };

  let highestTierScore = 0;
  const level0Tier = getOperatorTierAtLevel0(operatorId, niche);

  // Search through all tier groups to find the operator at E2/module levels
  for (const [tier, operators] of Object.entries(nicheList.operators)) {
    if (operators && operatorId in operators) {
      const entry = operators[operatorId];
      let entryLevel = '';
      
      // Extract level from entry
      if (typeof entry === 'string') {
        entryLevel = ''; // Old format, always available
      } else if (Array.isArray(entry) && entry.length >= 2) {
        entryLevel = entry[1] || '';
      }
      
      // Only consider E2 or module levels (not level 0)
      if (entryLevel !== '') {
        const tierScore = tierValues[tier] || 0;
        // Only count if this tier is better than level 0 tier (new capability)
        if (tierScore > level0Tier) {
          if (tierScore > highestTierScore) {
            highestTierScore = tierScore;
          }
        }
      }
    }
  }

  return highestTierScore; // Returns highest new tier, or 0 if no promotions available
}

/**
 * Checks if an operator has E2 or module levels available in any niche
 */
export function hasOperatorPromotionLevels(operatorId: string, allNiches: string[]): boolean {
  for (const niche of allNiches) {
    const newTiers = getOperatorNewTiersAtPromotion(operatorId, niche);
    if (newTiers > 0) {
      return true;
    }
  }
  return false;
}

/**
 * Gets the tier score for an operator in a specific niche
 * For normal teambuilding (not IS), returns the highest tier available (excluding RA-, ISW-, SO- modules)
 * Returns a numerical score where higher numbers = better tier
 * @param operatorId The operator ID
 * @param niche The niche filename
 * @param isIS Whether this is for Integrated Strategies (if true, considers all instances; if false, only highest tier)
 */
export function getOperatorTierInNiche(operatorId: string, niche: string, isIS: boolean = false): number {
  const nicheList = loadNicheList(niche);
  if (!nicheList || !nicheList.operators) {
    return 0; // Default tier if niche not found
  }

  // Define tier values (higher = better)
  const tierValues: Record<string, number> = {
    'SS': 100,
    'S': 90,
    'A': 80,
    'B': 70,
    'C': 60,
    'D': 50,
    'F': 40
  };

  // Modules to exclude for normal teambuilding (Integrated Strategies and Stationary Security Service modules)
  const excludedModulePrefixes = ['RA-', 'ISW-', 'SO-'];

  let highestTierScore = 0;

  // Search through all tier groups to find the operator
  for (const [tier, operators] of Object.entries(nicheList.operators)) {
    if (operators && operatorId in operators) {
      const entry = operators[operatorId];
      const tierScore = tierValues[tier] || 0;
      
      if (isIS) {
        // For IS, consider all instances (but for now, just return the first one found)
        // In the future, this could be enhanced to consider level requirements
        return tierScore;
      } else {
        // For normal teambuilding, exclude entries with RA-, ISW-, or SO- modules
        let shouldExclude = false;
        
        if (Array.isArray(entry) && entry.length >= 2) {
          const module = entry[1] || '';
          if (module) {
            shouldExclude = excludedModulePrefixes.some(prefix => module.startsWith(prefix));
          }
        }
        
        // Track the highest tier, excluding IS/SSS-only modules
        if (!shouldExclude && tierScore > highestTierScore) {
          highestTierScore = tierScore;
        }
      }
    }
  }

  return highestTierScore; // Returns highest tier for normal, or 0 if not found
}

/**
 * Scores an operator based on how well it fits the preferences
 * If primaryNiche is provided, heavily prioritizes operator tier in that niche
 */
export function scoreOperator(
  _operator: any,
  operatorId: string,
  niches: string[],
  preferences: TeamPreferences,
  existingTeam: TeamMember[],
  requiredNiches: Set<string>,
  preferredNiches: Set<string>,
  wantToUseSet?: Set<string>,
  primaryNiche?: string,
  isTrash?: boolean
): number {
  let score = 0;

  // Apply heavy penalty for trash operators - more significant than any tier benefits
  if (isTrash) {
    score -= 1000; // Massive penalty that outweighs any tier score (tier max is 100 * 10 = 1000)
  }

  // Calculate current niche counts in existing team (using normalized niches)
  const normalizeNiche = (niche: string): string => {
    // Normalize AOE niches to their DPS equivalents for counting purposes
    if (niche === 'aoe-arts-dps') return 'arts-dps';
    if (niche === 'aoe-physical-dps') return 'physical-dps';
    // Legacy support (old format with underscores)
    if (niche === 'arts_aoe') return 'arts-dps';
    if (niche === 'phys_aoe') return 'physical-dps';
    return niche;
  };
  
  const nicheCounts: Record<string, number> = {};
  for (const member of existingTeam) {
    for (const niche of member.niches) {
      const normalized = normalizeNiche(niche);
      nicheCounts[normalized] = (nicheCounts[normalized] || 0) + 1;
    }
  }
  
  // Niches that should not contribute to scoring in normal team building (using filenames)
  const excludedNiches = new Set([
    'free',
    'unconventional-niches',
    'fragile',
    'enmity-healing',
    'sleep',
    'global-range',
    'low-rarity'
  ]);
  
  // If we have a primary niche, heavily prioritize the operator's tier in that niche
  if (primaryNiche) {
    const tierScore = getOperatorTierInNiche(operatorId, primaryNiche);
    // Tier score becomes the dominant factor (multiplied by 10 for heavy weighting)
    score += tierScore * 10;

    // Still give some bonus for covering the primary niche
    if (niches.includes(primaryNiche)) {
      score += 50;
    }
  }

  // Boost score for operators in want-to-use list
  if (wantToUseSet && wantToUseSet.has(operatorId)) {
    score += 50; // Significant boost for operators user wants to use
  }

  // If no primary niche specified, score based on operator tiers across all niches
  // with tier performance weighted more heavily than niche coverage
  if (!primaryNiche) {
    // Calculate current niche counts in existing team (using normalized niches)
    const normalizeNiche = (niche: string): string => {
      // Normalize AOE niches to their DPS equivalents for counting purposes
      if (niche === 'aoe-arts-dps') return 'arts-dps';
      if (niche === 'aoe-physical-dps') return 'physical-dps';
      // Legacy support (old format with underscores)
      if (niche === 'arts_aoe') return 'arts-dps';
      if (niche === 'phys_aoe') return 'physical-dps';
      return niche;
    };

    const nicheCounts: Record<string, number> = {};
    for (const member of existingTeam) {
      for (const niche of member.niches) {
        const normalized = normalizeNiche(niche);
        nicheCounts[normalized] = (nicheCounts[normalized] || 0) + 1;
      }
    }

    // Track which normalized niches we've already scored to avoid double counting
    const scoredNiches = new Set<string>();
    let totalTierScore = 0;
    let nicheCoverageScore = 0;

    // Score based on operator's tier performance in each niche they cover
    for (const niche of niches) {
      // Skip excluded niches
      if (excludedNiches.has(niche)) {
        continue;
      }

      const normalizedNiche = normalizeNiche(niche);

      // Skip if we've already scored this normalized niche
      if (scoredNiches.has(normalizedNiche)) {
        continue;
      }

      scoredNiches.add(normalizedNiche);

      // Get operator's tier score in this niche (heavily weighted)
      const tierScore = getOperatorTierInNiche(operatorId, niche);
      totalTierScore += tierScore;

      // Check if niche is in required or preferred niches for additional coverage scoring
      const isRequired = requiredNiches.has(niche) || requiredNiches.has(normalizedNiche);
      const isPreferred = preferredNiches.has(niche) || preferredNiches.has(normalizedNiche);

      if (isRequired || isPreferred) {
        // Get the range for this niche (check both original and normalized)
        const requiredRange = preferences.requiredNiches[niche] || preferences.requiredNiches[normalizedNiche];
        const preferredRange = preferences.preferredNiches[niche] || preferences.preferredNiches[normalizedNiche];

        // Get current count for this normalized niche (before adding this operator)
        const currentCount = nicheCounts[normalizedNiche] || 0;
        // Count after adding this operator would be currentCount + 1
        const newCount = currentCount + 1;

        // Calculate niche coverage score with diminishing returns (no penalty for exceeding max)
        if (isRequired && requiredRange) {
          const maxCount = requiredRange.max;
          const minCount = requiredRange.min;

          if (newCount < minCount) {
            // Below minimum: full score (we need more operators)
            nicheCoverageScore += 50;
          } else if (newCount <= maxCount) {
            // Between min and max: diminishing returns
            if (maxCount === minCount) {
              nicheCoverageScore += 50;
            } else {
              const progress = (newCount - minCount) / (maxCount - minCount);
              const diminishingScore = 50 * (1 - progress);
              nicheCoverageScore += diminishingScore;
            }
          }
          // Exceeding max: no bonus, but no penalty either
        } else if (isPreferred && preferredRange) {
          const maxCount = preferredRange.max;
          const minCount = preferredRange.min;

          if (newCount < minCount) {
            // Below minimum: full score (we need more operators)
            nicheCoverageScore += 25;
          } else if (newCount <= maxCount) {
            // Diminishing returns for preferred niches
            if (maxCount === minCount) {
              nicheCoverageScore += 25;
            } else {
              const progress = (newCount - minCount) / (maxCount - minCount);
              const diminishingScore = 25 * (1 - progress);
              nicheCoverageScore += diminishingScore;
            }
          }
          // Exceeding max: no bonus, but no penalty either
        }
      }
    }

    // Apply tier scores with heavy weighting (tier performance is more important than coverage)
    score += totalTierScore * 8; // Heavy weighting for tier performance across all niches

    // Apply niche coverage score with reduced weighting
    score += nicheCoverageScore;

  }

  // Penalize if too many operators from same niche already in team
  // Note: allowDuplicates is always true now, but keeping logic for potential future use
  if (false) {
    const existingNicheCounts: Record<string, number> = {};
    for (const member of existingTeam) {
      for (const niche of member.niches) {
        existingNicheCounts[niche] = (existingNicheCounts[niche] || 0) + 1;
      }
    }

    for (const niche of niches) {
      const existingCount = existingNicheCounts[niche] || 0;
      // Check against required/preferred ranges
      const requiredRange = preferences.requiredNiches[niche];
      const preferredRange = preferences.preferredNiches[niche];
      const maxCount = Math.max(
        requiredRange?.max || 0,
        preferredRange?.max || 0,
        3 // Default to 3 if not specified
      );

      if (existingCount >= maxCount) {
        score -= 50; // Penalty for exceeding max per niche
      }
    }
  }

  return score;
}

/**
 * Finds the best operator to fill a specific niche
 * Selection is based on score only (rarity is disregarded).
 */
function findBestOperatorForNiche(
  niche: string,
  availableOperators: string[],
  allOperators: Record<string, any>,
  existingTeam: TeamMember[],
  preferences: TeamPreferences,
  requiredNiches: Set<string>,
  preferredNiches: Set<string>,
  trashOperators?: Set<string>,
  freeOperators?: Set<string>,
  wantToUseSet?: Set<string>
): { operatorId: string; operator: any; niches: string[] } | null {
  let bestOperator: { operatorId: string; operator: any; niches: string[] } | null = null;
  let bestScore = -Infinity;
  const candidates: Array<{ operatorId: string; operator: any; niches: string[]; score: number }> = [];

  // First pass: only consider non-trash and non-free operators
  for (const operatorId of availableOperators) {
    if (trashOperators && trashOperators.has(operatorId)) continue; // Skip trash operators in first pass
    if (freeOperators && freeOperators.has(operatorId)) continue; // Skip free operators in first pass

    const operator = allOperators[operatorId];
    if (!operator) continue;

    const niches = getOperatorNiches(operatorId);
    // Check if operator fills the niche (including AOE variants)
    const fillsNiche = niches.includes(niche) ||
                      (niche === 'arts-dps' && niches.includes('aoe-arts-dps')) ||
                      (niche === 'physical-dps' && niches.includes('aoe-physical-dps'));
    if (!fillsNiche) continue;

    const score = scoreOperator(operator, operatorId, niches, preferences, existingTeam, requiredNiches, preferredNiches, wantToUseSet, niche, false);

    candidates.push({ operatorId, operator, niches, score });

    if (score > bestScore) {
      bestScore = score;
      bestOperator = { operatorId, operator, niches };
    }
  }
  
  // If no non-trash operator found, consider trash operators as last resort
  if (!bestOperator && trashOperators) {
    for (const operatorId of availableOperators) {
      if (!trashOperators.has(operatorId)) continue; // Only consider trash operators now

      const operator = allOperators[operatorId];
      if (!operator) continue;

      const niches = getOperatorNiches(operatorId);
      // Check if operator fills the niche (including AOE variants)
      const fillsNiche = niches.includes(niche) ||
                        (niche === 'arts-dps' && niches.includes('aoe-arts-dps')) ||
                        (niche === 'physical-dps' && niches.includes('aoe-physical-dps'));
      if (!fillsNiche) continue;

      const score = scoreOperator(operator, operatorId, niches, preferences, existingTeam, requiredNiches, preferredNiches, wantToUseSet, niche, true);

      candidates.push({ operatorId, operator, niches, score });

      if (score > bestScore) {
        bestScore = score;
        bestOperator = { operatorId, operator, niches };
      }
    }
  }
  
  // If we have multiple candidates with similar scores, pick by score only (higher first)
  if (candidates.length > 1 && bestScore > -Infinity) {
    const topCandidates = candidates.filter(c => c.score >= bestScore * 0.95);
    if (topCandidates.length > 1) {
      topCandidates.sort((a, b) => b.score - a.score);
      const selected = topCandidates[0];
      return { operatorId: selected.operatorId, operator: selected.operator, niches: selected.niches };
    }
  }

  return bestOperator;
}

/**
 * Builds a team of 12 operators based on preferences.
 * lockedOperatorIds: operators that are always in the team (order preserved); remaining slots filled by algorithm.
 */
export async function buildTeam(
  email: string,
  preferences: TeamPreferences,
  lockedOperatorIds: string[] = []
): Promise<TeamResult> {
  // Load all operators
  const allOperators = loadAllOperators();

  // Load trash operators and free operators to apply penalty (but not exclude them)
  const trashOperators = loadTrashOperators();
  const freeOperators = loadFreeOperators();

  // Get user's want-to-use (raised) operators from SQL database
  const wantToUseOperatorIds = await getWantToUse(email);
  const wantToUseSet = new Set(wantToUseOperatorIds);

  // Locked operators must be in want-to-use and valid; dedupe and truncate to 12
  const locked = lockedOperatorIds.filter(id => allOperators[id] && wantToUseSet.has(id));
  const lockedSet = new Set(locked);
  const maxLocked = Math.min(locked.length, 12);

  // Available pool = want-to-use minus locked (rarity is disregarded)
  const baseAvailableOperators = wantToUseOperatorIds.filter(id => allOperators[id] && !lockedSet.has(id));
  const availableOperators = [...baseAvailableOperators];

  if (maxLocked === 0 && availableOperators.length === 0) {
    return {
      team: [],
      coverage: {},
      missingNiches: Object.keys(preferences.requiredNiches).filter(n => !TEAMBUILD_EXCLUDED_NICHES.has(n)),
      score: 0,
      emptySlots: 0
    };
  }

  // Convert to sets for faster lookup
  const requiredNiches = new Set(Object.keys(preferences.requiredNiches));
  const preferredNiches = new Set(Object.keys(preferences.preferredNiches));

  const team: TeamMember[] = [];
  const usedOperatorIds = new Set<string>();
  const nicheCounts: Record<string, number> = {};

  // Add locked operators first and account for their niches
  for (let i = 0; i < maxLocked; i++) {
    const operatorId = locked[i];
    const operator = allOperators[operatorId];
    if (!operator) continue;
    const niches = getOperatorNiches(operatorId);
    team.push({
      operatorId,
      operator,
      niches,
      primaryNiche: undefined,
      isTrash: trashOperators.has(operatorId)
    });
    usedOperatorIds.add(operatorId);
    for (const opNiche of niches) {
      nicheCounts[opNiche] = (nicheCounts[opNiche] || 0) + 1;
    }
  }
  
  // First pass: Fill required niches to minimum
  for (const [niche, range] of Object.entries(preferences.requiredNiches)) {
    if (TEAMBUILD_EXCLUDED_NICHES.has(niche)) continue;
    const minCount = range.min;
    
    // Fill up to minimum
    while (team.length < 12) {
      const currentCount = nicheCounts[niche] || 0;
      if (currentCount >= minCount) break;
      const candidate = findBestOperatorForNiche(
        niche,
        availableOperators.filter(id => !usedOperatorIds.has(id)),
        allOperators,
        team,
        preferences,
        requiredNiches,
        preferredNiches,
        trashOperators,
        freeOperators,
        wantToUseSet
      );
      
      if (candidate) {
        team.push({
          operatorId: candidate.operatorId,
          operator: candidate.operator,
          niches: candidate.niches,
          primaryNiche: niche,
          isTrash: trashOperators.has(candidate.operatorId)
        });
        usedOperatorIds.add(candidate.operatorId);
        
        // Update niche counts
        for (const opNiche of candidate.niches) {
          nicheCounts[opNiche] = (nicheCounts[opNiche] || 0) + 1;
        }
      } else {
        break; // No more operators available for this niche
      }
    }
  }
  
  // Second pass: Fill required niches up to maximum (optional)
  for (const [niche, range] of Object.entries(preferences.requiredNiches)) {
    if (TEAMBUILD_EXCLUDED_NICHES.has(niche)) continue;
    if (team.length >= 12) break;
    
    const maxCount = range.max;
    
    // Fill up to maximum if we have space
    while (team.length < 12) {
      const currentCount = nicheCounts[niche] || 0;
      if (currentCount >= maxCount) break;
      const candidate = findBestOperatorForNiche(
        niche,
        availableOperators.filter(id => !usedOperatorIds.has(id)),
        allOperators,
        team,
        preferences,
        requiredNiches,
        preferredNiches,
        trashOperators,
        freeOperators,
        wantToUseSet
      );
      
      if (candidate) {
        team.push({
          operatorId: candidate.operatorId,
          operator: candidate.operator,
          niches: candidate.niches,
          primaryNiche: niche,
          isTrash: trashOperators.has(candidate.operatorId)
        });
        usedOperatorIds.add(candidate.operatorId);
        
        // Update niche counts
        for (const opNiche of candidate.niches) {
          nicheCounts[opNiche] = (nicheCounts[opNiche] || 0) + 1;
        }
      } else {
        break; // No more operators available for this niche
      }
    }
  }
  
  // Third pass: Fill preferred niches to minimum
  for (const [niche, range] of Object.entries(preferences.preferredNiches)) {
    if (TEAMBUILD_EXCLUDED_NICHES.has(niche)) continue;
    if (team.length >= 12) break;
    
    const minCount = range.min;
    
    // Fill up to minimum
    while (team.length < 12) {
      const currentCount = nicheCounts[niche] || 0;
      if (currentCount >= minCount) break;
      const candidate = findBestOperatorForNiche(
        niche,
        availableOperators.filter(id => !usedOperatorIds.has(id)),
        allOperators,
        team,
        preferences,
        requiredNiches,
        preferredNiches,
        trashOperators,
        freeOperators,
        wantToUseSet
      );
      
      if (candidate) {
        team.push({
          operatorId: candidate.operatorId,
          operator: candidate.operator,
          niches: candidate.niches,
          primaryNiche: niche,
          isTrash: trashOperators.has(candidate.operatorId)
        });
        usedOperatorIds.add(candidate.operatorId);
        
        // Update niche counts
        for (const opNiche of candidate.niches) {
          nicheCounts[opNiche] = (nicheCounts[opNiche] || 0) + 1;
        }
      } else {
        break; // No more operators available for this niche
      }
    }
  }
  
  // Fourth pass: Fill preferred niches up to maximum (optional)
  for (const [niche, range] of Object.entries(preferences.preferredNiches)) {
    if (TEAMBUILD_EXCLUDED_NICHES.has(niche)) continue;
    if (team.length >= 12) break;
    
    const maxCount = range.max;
    
    // Fill up to maximum if we have space
    while (team.length < 12) {
      const currentCount = nicheCounts[niche] || 0;
      if (currentCount >= maxCount) break;
      const candidate = findBestOperatorForNiche(
        niche,
        availableOperators.filter(id => !usedOperatorIds.has(id)),
        allOperators,
        team,
        preferences,
        requiredNiches,
        preferredNiches,
        trashOperators,
        freeOperators,
        wantToUseSet
      );
      
      if (candidate) {
        team.push({
          operatorId: candidate.operatorId,
          operator: candidate.operator,
          niches: candidate.niches,
          primaryNiche: niche,
          isTrash: trashOperators.has(candidate.operatorId)
        });
        usedOperatorIds.add(candidate.operatorId);
        
        // Update niche counts
        for (const opNiche of candidate.niches) {
          nicheCounts[opNiche] = (nicheCounts[opNiche] || 0) + 1;
        }
      } else {
        break; // No more operators available for this niche
      }
    }
  }
  
  // Check if all required and preferred niches are filled to their maximum (exclude teambuild-excluded niches)
  const allRequiredNichesFilled = Object.entries(preferences.requiredNiches)
    .filter(([niche]) => !TEAMBUILD_EXCLUDED_NICHES.has(niche))
    .every(([niche, range]) => {
      const currentCount = nicheCounts[niche] || 0;
      return currentCount >= range.max;
    });
  
  const allPreferredNichesFilled = Object.entries(preferences.preferredNiches)
    .filter(([niche]) => !TEAMBUILD_EXCLUDED_NICHES.has(niche))
    .every(([niche, range]) => {
      const currentCount = nicheCounts[niche] || 0;
      return currentCount >= range.max;
    });
  
  // Calculate empty slots (only fill remaining slots if niches aren't all filled)
  const emptySlots = allRequiredNichesFilled && allPreferredNichesFilled 
    ? Math.max(0, 12 - team.length)
    : 0;
  
  // Fifth pass: Fill remaining slots with best available operators (rarity disregarded)
  const remainingOperators = availableOperators.filter(id => !usedOperatorIds.has(id));

  while (team.length < 12 && remainingOperators.length > 0 && !(allRequiredNichesFilled && allPreferredNichesFilled)) {
    let bestCandidate: { operatorId: string; operator: any; niches: string[]; score: number } | null = null;
    const candidates: Array<{ operatorId: string; operator: any; niches: string[]; score: number }> = [];

    // Consider non-trash and non-free operators first
    for (const operatorId of remainingOperators) {
      if (usedOperatorIds.has(operatorId)) continue;
      if (trashOperators.has(operatorId)) continue; // Skip trash operators in first pass
      if (freeOperators.has(operatorId)) continue; // Skip free operators in first pass

      const operator = allOperators[operatorId];
      if (!operator) continue;

      const niches = getOperatorNiches(operatorId);
      const score = scoreOperator(operator, operatorId, niches, preferences, team, requiredNiches, preferredNiches, wantToUseSet, undefined, false);

      candidates.push({ operatorId, operator, niches, score });

      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { operatorId, operator, niches, score };
      }
    }
    
    // If no non-trash candidate found, allow trash operators as last resort
    if (!bestCandidate) {
      for (const operatorId of remainingOperators) {
        if (usedOperatorIds.has(operatorId)) continue;
        if (!trashOperators.has(operatorId)) continue; // Only consider trash operators now

        const operator = allOperators[operatorId];
        if (!operator) continue;

        const niches = getOperatorNiches(operatorId);
        const score = scoreOperator(operator, operatorId, niches, preferences, team, requiredNiches, preferredNiches, wantToUseSet, undefined, true);

        candidates.push({ operatorId, operator, niches, score });

        if (!bestCandidate || score > bestCandidate.score) {
          bestCandidate = { operatorId, operator, niches, score };
        }
      }
    }
    
    // Tie-break by score only (higher first)
    if (bestCandidate && candidates.length > 1) {
      const topCandidates = candidates.filter(c => c.score >= bestCandidate!.score * 0.95);
      if (topCandidates.length > 1) {
        topCandidates.sort((a, b) => b.score - a.score);
        bestCandidate = topCandidates[0];
      }
    }

    if (bestCandidate) {
      team.push({
        operatorId: bestCandidate.operatorId,
        operator: bestCandidate.operator,
        niches: bestCandidate.niches,
        isTrash: trashOperators.has(bestCandidate.operatorId)
      });
      usedOperatorIds.add(bestCandidate.operatorId);

      // Update niche counts
      for (const niche of bestCandidate.niches) {
        nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
      }

      // Remove the selected operator from remainingOperators
      const index = remainingOperators.indexOf(bestCandidate.operatorId);
      if (index > -1) {
        remainingOperators.splice(index, 1);
      }
    } else {
      break; // No more candidates
    }
  }
  
  // Calculate missing niches (exclude teambuild-excluded niches)
  const missingNiches: string[] = [];
  for (const [niche, range] of Object.entries(preferences.requiredNiches)) {
    if (TEAMBUILD_EXCLUDED_NICHES.has(niche)) continue;
    const currentCount = nicheCounts[niche] || 0;
    if (currentCount < range.min) {
      missingNiches.push(`${niche} (${currentCount}/${range.min}-${range.max})`);
    }
  }
  
  // Calculate team score (exclude teambuild-excluded niches)
  let score = 0;
  for (const [niche, range] of Object.entries(preferences.requiredNiches)) {
    if (TEAMBUILD_EXCLUDED_NICHES.has(niche)) continue;
    const currentCount = nicheCounts[niche] || 0;
    if (currentCount >= range.min) {
      // Full points for meeting minimum requirement
      score += 100;
      // Bonus if we're within the ideal range
      if (currentCount <= range.max) {
        score += 20; // Bonus for being in ideal range
      }
    } else {
      // Partial points based on how close we are to minimum
      score += (currentCount / range.min) * 100;
    }
  }
  for (const [niche, range] of Object.entries(preferences.preferredNiches)) {
    if (TEAMBUILD_EXCLUDED_NICHES.has(niche)) continue;
    const currentCount = nicheCounts[niche] || 0;
    if (currentCount > 0) {
      // Score based on how well we meet the preferred range
      if (currentCount >= range.min && currentCount <= range.max) {
        score += 50; // Full points for being in preferred range
      } else if (currentCount < range.min) {
        score += (currentCount / range.min) * 50; // Partial points
      } else {
        score += 30; // Some points for exceeding (but less than ideal)
      }
    }
  }
  score += team.length * 10; // Bonus for filling more slots
  
  // Calculate synergy bonuses (only for normal teambuilding, not IS)
  const synergyBonus = calculateSynergyScore(team, false);
  score += synergyBonus;
  
  return {
    team,
    coverage: nicheCounts,
    missingNiches,
    score,
    emptySlots
  };
}

/**
 * Gets the best operator recommendation for Integrated Strategies
 * Analyzes current team composition and suggests the next operator to add based on class constraint
 */
export async function getIntegratedStrategiesRecommendation(
  email: string,
  currentTeamOperatorIds: string[],
  requiredClasses: string[],
  temporaryRecruitment?: string
): Promise<{ recommendedOperator: any | null; reasoning: string; score: number }> {
  // Load all operators and user's data
  const allOperators = loadAllOperators();
  const ownedOperatorIds = await getOwnedOperators(email);

  // Start with owned operators
  let availableOperatorIds = ownedOperatorIds.filter(id => allOperators[id]);

  // Add temporary recruitment operator if specified and not already owned
  if (temporaryRecruitment && allOperators[temporaryRecruitment] && !ownedOperatorIds.includes(temporaryRecruitment)) {
    availableOperatorIds.push(temporaryRecruitment);
  }

  // Filter to only operators of the required classes
  const availableOperators = availableOperatorIds
    .filter(id => requiredClasses.includes(allOperators[id].class))
    .filter(id => !currentTeamOperatorIds.includes(id)); // Exclude operators already in team

  if (availableOperators.length === 0) {
    const classText = requiredClasses.length === 1
      ? requiredClasses[0]
      : `${requiredClasses.join(' or ')}`;
    const teamCondition = currentTeamOperatorIds.length > 0 ? ' and aren\'t already in your team' : '';
    return {
      recommendedOperator: null,
      reasoning: `No ${classText} operators available that you own${teamCondition}.`,
      score: 0
    };
  }

  // Load current team operators and their niches (exclude teambuild-excluded niches)
  const currentTeamOperators = currentTeamOperatorIds.map(id => allOperators[id]).filter(Boolean);
  const currentTeamNiches: string[] = [];

  for (const operator of currentTeamOperators) {
    if (operator && operator.niches) {
      for (const niche of operator.niches) {
        if (!TEAMBUILD_EXCLUDED_NICHES.has(niche)) currentTeamNiches.push(niche);
      }
    }
  }

  // Count current niche coverage
  const nicheCounts: Record<string, number> = {};
  for (const niche of currentTeamNiches) {
    nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
  }

  // Load team preferences from team-preferences.json for this user
  const userPreferences = loadTeamPreferencesForUser(email);
  const defaultPreferences = userPreferences || getDefaultPreferences();

  // Niches that should not contribute to scoring in IS team building (using filenames)
  const isExcludedNiches = new Set([
    'free',
    'unconventional-niches',
    'fragile',
    'enmity-healing',
    'sleep',
    'global-range'
  ]);

  const importantNiches = new Set([
    ...Object.keys(defaultPreferences.requiredNiches),
    ...Object.keys(defaultPreferences.preferredNiches)
  ].filter(niche => !isExcludedNiches.has(niche)));

  // Score each available operator
  const operatorScores: Array<{ operatorId: string; score: number; reasoning: string[] }> = [];

  for (const operatorId of availableOperators) {
    const operator = allOperators[operatorId];
    if (!operator || !operator.niches) continue;

    let score = 0;
    const reasoning: string[] = [];

    // Bonus for filling important niches that are missing or under-covered
    for (const niche of operator.niches) {
      const currentCount = nicheCounts[niche] || 0;

      if (importantNiches.has(niche)) {
        const requiredRange = defaultPreferences.requiredNiches[niche];
        const preferredRange = defaultPreferences.preferredNiches[niche];

        if (requiredRange) {
          // Required niche
          if (currentCount < requiredRange.min) {
            // Filling a missing required niche
            score += 100;
            reasoning.push(`🎯 Fills missing required niche: ${niche} (+100)`);
          } else if (currentCount < requiredRange.max) {
            // Filling an under-covered required niche
            score += 50;
            reasoning.push(`➕ Strengthens required niche: ${niche} (+50)`);
          } else {
            // Over-covered required niche (still some value)
            score += 10;
            reasoning.push(`✅ Supports required niche: ${niche} (+10)`);
          }
        } else if (preferredRange) {
          // Preferred niche
          if (currentCount < preferredRange.min) {
            // Filling a missing preferred niche
            score += 75;
            reasoning.push(`🎯 Fills missing preferred niche: ${niche} (+75)`);
          } else if (currentCount < preferredRange.max) {
            // Filling an under-covered preferred niche
            score += 30;
            reasoning.push(`➕ Strengthens preferred niche: ${niche} (+30)`);
          } else {
            // Over-covered preferred niche (minimal value)
            score += 5;
            reasoning.push(`✅ Supports preferred niche: ${niche} (+5)`);
          }
        }
      } else {
        // Non-standard niche (some value for variety)
        score += 15;
        reasoning.push(`🌟 Provides niche variety: ${niche} (+15)`);
      }
    }

    // Penalty for duplicate niches (discourage over-specialization)
    // Skip penalty for low-rarity operators
    if (!operator.niches.includes('low-rarity')) {
      const duplicateNiches = operator.niches.filter((niche: string) =>
        !isExcludedNiches.has(niche) && (nicheCounts[niche] || 0) >= 3
      );
      if (duplicateNiches.length > 0) {
        const penalty = duplicateNiches.length * 20;
        score -= penalty;
        reasoning.push(`⚠️ Over-specializes in: ${duplicateNiches.join(', ')} (-${penalty})`);
      }
    }

    // Calculate synergy bonus for this operator if added to team (for IS recommendations)
    const testTeam = [...currentTeamOperators, operator];
    const synergyBonus = calculateSynergyScoreForOperator(testTeam, operatorId, true);
    if (synergyBonus > 0) {
      score += synergyBonus;
      reasoning.push(`🔗 Synergy bonus: +${synergyBonus}`);
    }

    // Log each evaluated character and their scoring criteria
    console.log(`\n=== Integrated Strategies Evaluation: ${operator.name || operatorId} ===`);
    console.log(`Class: ${operator.class}, Rarity: ${operator.rarity}★`);
    console.log(`Niches: ${operator.niches?.join(', ') || 'None'}`);
    console.log(`Final Score: ${score}`);
    console.log('Scoring Breakdown:');
    reasoning.forEach(reason => console.log(`  ${reason}`));

    operatorScores.push({
      operatorId,
      score,
      reasoning
    });
  }

  // Sort by score (highest first)
  operatorScores.sort((a, b) => b.score - a.score);

  if (operatorScores.length === 0) {
    const classText = requiredClasses.length === 1
      ? requiredClasses[0]
      : `${requiredClasses.join(' or ')}`;
    return {
      recommendedOperator: null,
      reasoning: `No suitable ${classText} operators found for your team composition.`,
      score: 0
    };
  }

  const bestOperator = operatorScores[0];
  const operator = allOperators[bestOperator.operatorId];

  // Create detailed reasoning with better formatting
  const classText = requiredClasses.length === 1
    ? requiredClasses[0]
    : `${requiredClasses.slice(0, -1).join(', ')} or ${requiredClasses[requiredClasses.length - 1]}`;

  const reasoningParts = [
    `🏆 **Recommended ${classText} Operator**`,
    '',
    ...(temporaryRecruitment ? [
      `💫 **Considering temporary recruitment: ${allOperators[temporaryRecruitment]?.name || 'Unknown Operator'}**`,
      ''
    ] : []),
    '**Scoring Breakdown:**',
    ...bestOperator.reasoning.map(line => `• ${line}`),
    '',
    `**Final Score: ${bestOperator.score}**`,
    '',
    '*This operator was selected because it best complements your current team composition and fills important gaps.*'
  ];

  return {
    recommendedOperator: operator,
    reasoning: reasoningParts.join('\n'),
    score: bestOperator.score
  };
}

/**
 * Gets default team preferences
 * Reads from data/team-preferences.json, using the first user's preferences if available,
 * otherwise falls back to hardcoded defaults
 */
export function getDefaultPreferences(): TeamPreferences {
  const preferencesFile = path.join(__dirname, '../data/universal-team-preferences.json');
  
  // Load from universal config file
  if (fs.existsSync(preferencesFile)) {
    try {
      const content = fs.readFileSync(preferencesFile, 'utf-8');
      const prefs: Partial<TeamPreferences> = JSON.parse(content);
      
      return {
        requiredNiches: prefs.requiredNiches || {},
        preferredNiches: prefs.preferredNiches || {},
        rarityRanking: prefs.rarityRanking || [6, 4, 5, 3, 2, 1],
        allowDuplicates: prefs.allowDuplicates !== undefined ? prefs.allowDuplicates : false,
        hopeCosts: prefs.hopeCosts || { ...HOPE_COST_CONFIG }
      };
    } catch (error) {
      console.error('Error loading universal team preferences:', error);
    }
  }
  
  // Fallback to hardcoded defaults
  return {
    requiredNiches: {
        'dp-generation': { min: 1, max: 2 },
        'late-laneholder': { min: 2, max: 2 },
        'healing-operators': { min: 2, max: 2 },
        'arts-dps': { min: 3, max: 4 },
        'physical-dps': { min: 3, max: 4 },
    },
    preferredNiches: {
        'elemental-damage': { min: 1, max: 1 },
        'early-laneholder': { min: 1, max: 1 },
        'boss-killing': { min: 1, max: 1 },
        'tanking-blocking-operators': { min: 1, max: 2 },
        'stalling': { min: 0, max: 1 },
        'anti-air-operators': { min: 0, max: 1 }
    },
    rarityRanking: [6, 4, 5, 3, 2, 1],
    allowDuplicates: false,
    hopeCosts: { ...HOPE_COST_CONFIG }
  };
}

