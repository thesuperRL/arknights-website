/**
 * Team building algorithm for Arknights operators
 */

import * as fs from 'fs';
import * as path from 'path';
import { getNichesForOperator, loadNicheList } from './niche-list-utils';
import { getOwnedOperators, getWantToUse } from './account-storage';
import { loadAllSynergies } from './synergy-utils';

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

/**
 * Gets niches for an operator, with AOE niches merged into DPS niches
 */
function getOperatorNiches(operatorId: string): string[] {
  const niches = getNichesForOperator(operatorId);
  const expandedNiches = [...niches];
  
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
    for (const [, operatorIds] of Object.entries(synergy.core)) {
      const hasOperator = operatorIds.some(id => teamOperatorIds.has(id));
      if (!hasOperator) {
        coreSatisfied = false;
        break;
      }
    }

    if (coreSatisfied) {
      // Add core bonus
      totalScore += synergy.corePointBonus;

      // Count satisfied optional groups (only if core is satisfied)
      let satisfiedOptionalGroups = 0;
      for (const [, operatorIds] of Object.entries(synergy.optional)) {
        const hasOperator = operatorIds.some(id => teamOperatorIds.has(id));
        if (hasOperator) {
          satisfiedOptionalGroups++;
        }
      }

      // Add optional bonus for each satisfied optional group
      totalScore += satisfiedOptionalGroups * synergy.optionalPointBonus;
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
    for (const [, operatorIds] of Object.entries(synergy.core)) {
      if (operatorIds.includes(newOperatorId)) {
        operatorInSynergy = true;
        operatorRole = 'core';
        break;
      }
    }

    // Check optional groups
    if (!operatorInSynergy) {
      for (const [, operatorIds] of Object.entries(synergy.optional)) {
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
    for (const [, operatorIds] of Object.entries(synergy.core)) {
      const hasOperator = operatorIds.some(id => teamOperatorIds.has(id));
      if (!hasOperator) {
        coreSatisfied = false;
        break;
      }
    }

    if (operatorRole === 'core') {
      // If this operator completes the core, add core bonus
      if (coreSatisfied) {
        totalScore += synergy.corePointBonus;
      }
    } else if (operatorRole === 'optional' && coreSatisfied) {
      // If core is satisfied and this operator is in an optional group, add optional bonus
      totalScore += synergy.optionalPointBonus;
    }
  }

  return totalScore;
}

/**
 * Gets the tier of an operator in a specific niche
 * Returns a numerical score where higher numbers = better tier
 */
export function getOperatorTierInNiche(operatorId: string, niche: string): number {
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

  // Search through all tier groups to find the operator
  for (const [tier, operators] of Object.entries(nicheList.operators)) {
    if (operators && operatorId in operators) {
      return tierValues[tier] || 0;
    }
  }

  return 0; // Operator not found in this niche
}

/**
 * Scores an operator based on how well it fits the preferences
 * If primaryNiche is provided, heavily prioritizes operator tier in that niche
 */
export function scoreOperator(
  operator: any,
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
  
  // Base score from rarity ranking
  // Higher position in ranking = higher score
  // This ensures rarity preference has significant weight in selection
  if (preferences.rarityRanking && preferences.rarityRanking.length > 0) {
    const rarity = operator.rarity || 0;
    const rankingIndex = preferences.rarityRanking.indexOf(rarity);
    if (rankingIndex !== -1) {
      // Score based on position in ranking (first = highest score)
      // Score decreases by 20 for each position down the ranking
      // Increased from 10 to 20 to give rarity preference more weight
      const baseScore = 100;
      const positionScore = baseScore - (rankingIndex * 20);
      score += Math.max(0, positionScore); // Ensure non-negative
    }
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

        // Calculate niche coverage score with diminishing returns and negative penalties
        if (isRequired && requiredRange) {
          const maxCount = requiredRange.max;
          const minCount = requiredRange.min;

          if (newCount < minCount) {
            // Below minimum: full score (we need more operators)
            nicheCoverageScore += 50; // Reduced from 100 since tier is now primary
          } else if (newCount <= maxCount) {
            // Between min and max: diminishing returns
            // Full score at min, linearly decreases to 0 at max
            if (maxCount === minCount) {
              // If min == max, give full score when we reach it
              nicheCoverageScore += 50;
            } else {
              // Calculate diminishing score based on how close we are to max
              // At min: full score (50)
              // At max: 0 score
              // Linear interpolation
              const progress = (newCount - minCount) / (maxCount - minCount);
              const diminishingScore = 50 * (1 - progress);
              nicheCoverageScore += diminishingScore;
            }
          } else {
            // Negative penalty for exceeding max
            // Penalty increases with how much we exceed
            const excess = newCount - maxCount;
            nicheCoverageScore -= 25 * excess; // -25 per operator over max (reduced penalty)
          }
        } else if (isPreferred && preferredRange) {
          const maxCount = preferredRange.max;
          const minCount = preferredRange.min;

          if (newCount < minCount) {
            // Below minimum: full score (we need more operators)
            nicheCoverageScore += 25; // Reduced from 50 since tier is now primary
          } else if (newCount <= maxCount) {
            // Diminishing returns for preferred niches (lower base score)
            if (maxCount === minCount) {
              nicheCoverageScore += 25;
            } else {
              const progress = (newCount - minCount) / (maxCount - minCount);
              const diminishingScore = 25 * (1 - progress);
              nicheCoverageScore += diminishingScore;
            }
          } else {
            // Negative penalty for exceeding preferred max
            const excess = newCount - maxCount;
            nicheCoverageScore -= 12.5 * excess; // -12.5 per operator over max (reduced penalty)
          }
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
 * Sorts operators by rarity preference order
 * This ensures we always examine operators in rarity preference order for optimal selection
 */
function sortOperatorsByRarityPreference(
  operatorIds: string[],
  allOperators: Record<string, any>,
  rarityRanking: number[] = [6, 4, 5, 3, 2, 1]
): string[] {
  // Create a map of rarity -> position in ranking (lower number = higher priority)
  const rarityPriority: Record<number, number> = {};
  rarityRanking.forEach((rarity, index) => {
    rarityPriority[rarity] = index;
  });
  
  // Default priority for rarities not in ranking (put them at the end)
  const defaultPriority = rarityRanking.length;
  
  // Sort operators by rarity priority
  return [...operatorIds].sort((a, b) => {
    const operatorA = allOperators[a];
    const operatorB = allOperators[b];
    if (!operatorA || !operatorB) return 0;
    
    const rarityA = operatorA.rarity || 0;
    const rarityB = operatorB.rarity || 0;
    const priorityA = rarityPriority[rarityA] !== undefined ? rarityPriority[rarityA] : defaultPriority;
    const priorityB = rarityPriority[rarityB] !== undefined ? rarityPriority[rarityB] : defaultPriority;
    
    return priorityA - priorityB;
  });
}

/**
 * Finds the best operator to fill a specific niche
 * Always prioritizes operators by rarity preference order and score for optimal selection
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
  // Sort operators by rarity preference order for optimal examination
  const rarityRanking = preferences.rarityRanking || [6, 4, 5, 3, 2, 1];
  const sortedOperators = sortOperatorsByRarityPreference(availableOperators, allOperators, rarityRanking);
  
  let bestOperator: { operatorId: string; operator: any; niches: string[] } | null = null;
  let bestScore = -Infinity;
  const candidates: Array<{ operatorId: string; operator: any; niches: string[]; score: number }> = [];
  
  // First pass: only consider non-trash and non-free operators
  for (const operatorId of sortedOperators) {
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
    for (const operatorId of sortedOperators) {
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
  
  // If we have multiple candidates with similar scores, prioritize by rarity preference order and score
  // Select the optimal operator based on rarity preference and score
  if (candidates.length > 1 && bestScore > -Infinity) {
    const topCandidates = candidates.filter(c => c.score >= bestScore * 0.95);
    if (topCandidates.length > 1) {
      // Sort by rarity preference order first, then by score
      const rarityRanking = preferences.rarityRanking || [6, 4, 5, 3, 2, 1];
      const rarityPriority: Record<number, number> = {};
      rarityRanking.forEach((rarity, index) => {
        rarityPriority[rarity] = index;
      });
      const defaultPriority = rarityRanking.length;
      
      topCandidates.sort((a, b) => {
        const rarityA = allOperators[a.operatorId]?.rarity || 0;
        const rarityB = allOperators[b.operatorId]?.rarity || 0;
        const priorityA = rarityPriority[rarityA] !== undefined ? rarityPriority[rarityA] : defaultPriority;
        const priorityB = rarityPriority[rarityB] !== undefined ? rarityPriority[rarityB] : defaultPriority;
        
        // First sort by rarity priority (lower number = higher priority)
        if (priorityA !== priorityB) {
          return priorityA - priorityB;
        }
        
        // If same rarity priority, sort by score (higher first)
        return b.score - a.score;
      });
      
      // Pick the first one (highest rarity preference, highest score)
      const selected = topCandidates[0];
      return { operatorId: selected.operatorId, operator: selected.operator, niches: selected.niches };
    }
  }
  
  return bestOperator;
}

/**
 * Builds a team of 12 operators based on preferences
 */
export async function buildTeam(
  email: string,
  preferences: TeamPreferences
): Promise<TeamResult> {
  // Load all operators
  const allOperators = loadAllOperators();
  
  // Load trash operators and free operators to apply penalty (but not exclude them)
  const trashOperators = loadTrashOperators();
  const freeOperators = loadFreeOperators();
  
  // Get user's owned operators and want-to-use operators from SQL database
  const ownedOperatorIds = await getOwnedOperators(email);
  const wantToUseOperatorIds = await getWantToUse(email);
  
  // Use owned operators as the available pool
  // Want-to-use operators will be given priority/preference in scoring
  // Sort operators by rarity preference order (with shuffling within each rarity group for randomness)
  const baseAvailableOperators = ownedOperatorIds.filter(id => allOperators[id]);
  const rarityRanking = preferences.rarityRanking || [6, 4, 5, 3, 2, 1];
  const availableOperators = sortOperatorsByRarityPreference(baseAvailableOperators, allOperators, rarityRanking);
  const wantToUseSet = new Set(wantToUseOperatorIds);
  
  if (availableOperators.length === 0) {
    return {
      team: [],
      coverage: {},
      missingNiches: Object.keys(preferences.requiredNiches),
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
  
  // First pass: Fill required niches to minimum
  for (const [niche, range] of Object.entries(preferences.requiredNiches)) {
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
  
  // Check if all required and preferred niches are filled to their maximum
  const allRequiredNichesFilled = Object.entries(preferences.requiredNiches).every(([niche, range]) => {
    const currentCount = nicheCounts[niche] || 0;
    return currentCount >= range.max;
  });
  
  const allPreferredNichesFilled = Object.entries(preferences.preferredNiches).every(([niche, range]) => {
    const currentCount = nicheCounts[niche] || 0;
    return currentCount >= range.max;
  });
  
  // Calculate empty slots (only fill remaining slots if niches aren't all filled)
  const emptySlots = allRequiredNichesFilled && allPreferredNichesFilled 
    ? Math.max(0, 12 - team.length)
    : 0;
  
  // Fifth pass: Fill remaining slots with best available operators
  // Only fill if not all niches are filled to their maximum
  // First try to fill with non-trash operators only
  // Sort remaining operators by rarity preference order for optimal selection
  const remainingOperators = availableOperators.filter(id => !usedOperatorIds.has(id));
  const sortedRemainingOperators = sortOperatorsByRarityPreference(remainingOperators, allOperators, rarityRanking);
  
  while (team.length < 12 && sortedRemainingOperators.length > 0 && !(allRequiredNichesFilled && allPreferredNichesFilled)) {
    let bestCandidate: { operatorId: string; operator: any; niches: string[]; score: number } | null = null;
    const candidates: Array<{ operatorId: string; operator: any; niches: string[]; score: number }> = [];
    
    // First pass: only consider non-trash and non-free operators (already sorted by rarity preference)
    for (const operatorId of sortedRemainingOperators) {
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
      for (const operatorId of sortedRemainingOperators) {
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
    
    // If we have multiple candidates with similar scores, prioritize by rarity preference order and score
    // Select the optimal operator based on rarity preference and score
    if (bestCandidate && candidates.length > 1) {
      const topCandidates = candidates.filter(c => c.score >= bestCandidate!.score * 0.95);
      if (topCandidates.length > 1) {
        // Sort by rarity preference order first, then by score
        const rarityPriority: Record<number, number> = {};
        rarityRanking.forEach((rarity, index) => {
          rarityPriority[rarity] = index;
        });
        const defaultPriority = rarityRanking.length;
        
        topCandidates.sort((a, b) => {
          const rarityA = allOperators[a.operatorId]?.rarity || 0;
          const rarityB = allOperators[b.operatorId]?.rarity || 0;
          const priorityA = rarityPriority[rarityA] !== undefined ? rarityPriority[rarityA] : defaultPriority;
          const priorityB = rarityPriority[rarityB] !== undefined ? rarityPriority[rarityB] : defaultPriority;
          
          // First sort by rarity priority (lower number = higher priority)
          if (priorityA !== priorityB) {
            return priorityA - priorityB;
          }
          
          // If same rarity priority, sort by score (higher first)
          return b.score - a.score;
        });
        
        // Pick the first one (highest rarity preference, highest score)
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
      
      // Remove the selected operator from sortedRemainingOperators
      const index = sortedRemainingOperators.indexOf(bestCandidate.operatorId);
      if (index > -1) {
        sortedRemainingOperators.splice(index, 1);
      }
    } else {
      break; // No more candidates
    }
  }
  
  // Calculate missing niches
  const missingNiches: string[] = [];
  for (const [niche, range] of Object.entries(preferences.requiredNiches)) {
    const currentCount = nicheCounts[niche] || 0;
    if (currentCount < range.min) {
      missingNiches.push(`${niche} (${currentCount}/${range.min}-${range.max})`);
    }
  }
  
  // Calculate team score
  let score = 0;
  for (const [niche, range] of Object.entries(preferences.requiredNiches)) {
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

  // Load current team operators and their niches
  const currentTeamOperators = currentTeamOperatorIds.map(id => allOperators[id]).filter(Boolean);
  const currentTeamNiches: string[] = [];

  for (const operator of currentTeamOperators) {
    if (operator && operator.niches) {
      currentTeamNiches.push(...operator.niches);
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
  const preferencesFile = path.join(__dirname, '../data/team-preferences.json');
  
  // Try to load from file
  if (fs.existsSync(preferencesFile)) {
    try {
      const content = fs.readFileSync(preferencesFile, 'utf-8');
      const allPreferences: Record<string, TeamPreferences> = JSON.parse(content);
      
      // Use the first user's preferences if available
      const firstUserEmail = Object.keys(allPreferences)[0];
      if (firstUserEmail && allPreferences[firstUserEmail]) {
        const userPrefs = allPreferences[firstUserEmail];
        // Ensure all required fields are present
        return {
          requiredNiches: userPrefs.requiredNiches || {},
          preferredNiches: userPrefs.preferredNiches || {},
          rarityRanking: userPrefs.rarityRanking || [6, 4, 5, 3, 2, 1],
          allowDuplicates: userPrefs.allowDuplicates !== undefined ? userPrefs.allowDuplicates : true,
          hopeCosts: userPrefs.hopeCosts || { ...HOPE_COST_CONFIG }
        };
      }
    } catch (error) {
      console.error('Error loading team preferences from file:', error);
    }
  }
  
  // Fallback to hardcoded defaults
  return {
    requiredNiches: {
        'dp-generation': { min: 1, max: 2 },
        'early-laneholder': { min: 1, max: 2 },
        'late-laneholder': { min: 1, max: 2 },
        'healing-operators': { min: 2, max: 3 },
        'arts-dps': { min: 1, max: 2 },
        'physical-dps': { min: 1, max: 2 },
    },
    preferredNiches: {
        'anti-air-operators': { min: 1, max: 1 },
        'tanking-blocking-operators': { min: 1, max: 2 },
        'stalling': { min: 0, max: 1 },
        'fast-redeploy-operators': { min: 0, max: 1 }
    },
    rarityRanking: [6, 4, 5, 3, 2, 1], // Default: 6 > 4 > 5 > 3 > 2 > 1
    allowDuplicates: true,
    hopeCosts: { ...HOPE_COST_CONFIG } // Use default hope costs
  };
}

