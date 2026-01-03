/**
 * Team building algorithm for Arknights operators
 */

import * as fs from 'fs';
import * as path from 'path';
import { getNichesForOperator, loadNicheList } from './niche-list-utils';
import { getOwnedOperators, getWantToUse } from './account-storage';

export interface NicheRange {
  min: number;
  max: number;
}

export interface TeamPreferences {
  requiredNiches: Record<string, NicheRange>; // Niche filename -> range of operators needed (e.g., {"healing-operators": {min: 1, max: 2}})
  preferredNiches: Record<string, NicheRange>; // Niche filename -> range of operators preferred (e.g., {"arts-dps": {min: 1, max: 3}})
  rarityRanking?: number[]; // Rarity preference order (e.g., [6, 4, 5, 3, 2, 1] means 6-star is most preferred, then 4-star, etc.)
  allowDuplicates?: boolean; // Allow multiple operators from same niche
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

  // If no primary niche specified, fall back to the original niche coverage logic
  // but with reduced weighting compared to tier scoring
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

    // Check if operator fills required niches
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
    
    // Check if niche is in required or preferred niches
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
      
      // Calculate score with diminishing returns and negative penalties
      if (isRequired && requiredRange) {
        const maxCount = requiredRange.max;
        const minCount = requiredRange.min;
        
        if (newCount < minCount) {
          // Below minimum: full score (we need more operators)
          score += 100;
        } else if (newCount <= maxCount) {
          // Between min and max: diminishing returns
          // Full score at min, linearly decreases to 0 at max
          if (maxCount === minCount) {
            // If min == max, give full score when we reach it
            score += 100;
          } else {
            // Calculate diminishing score based on how close we are to max
            // At min: full score (100)
            // At max: 0 score
            // Linear interpolation
            const progress = (newCount - minCount) / (maxCount - minCount);
            const diminishingScore = 100 * (1 - progress);
            score += diminishingScore;
          }
        } else {
          // Negative penalty for exceeding max
          // Penalty increases with how much we exceed
          const excess = newCount - maxCount;
          score -= 50 * excess; // -50 per operator over max
        }
      } else if (isPreferred && preferredRange) {
        const maxCount = preferredRange.max;
        const minCount = preferredRange.min;
        
        if (newCount < minCount) {
          // Below minimum: full score (we need more operators)
          score += 50;
        } else if (newCount <= maxCount) {
          // Diminishing returns for preferred niches (lower base score)
          if (maxCount === minCount) {
            score += 50;
          } else {
            const progress = (newCount - minCount) / (maxCount - minCount);
            const diminishingScore = 50 * (1 - progress);
            score += diminishingScore;
          }
        } else {
          // Negative penalty for exceeding preferred max
          const excess = newCount - maxCount;
          score -= 25 * excess; // -25 per operator over max (less penalty than required)
        }
      }
    }
  }
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

  // Load default team preferences to understand what niches are typically important
  const defaultPreferences = getDefaultPreferences();

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

    // Base score from rarity (higher rarity = higher base score)
    const rarityScore = (operator.rarity || 1) * 10;
    score += rarityScore;
    reasoning.push(`★ ${operator.rarity}★ rarity base score (+${rarityScore})`);

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
    const duplicateNiches = operator.niches.filter((niche: string) =>
      !isExcludedNiches.has(niche) && (nicheCounts[niche] || 0) >= 3
    );
    if (duplicateNiches.length > 0) {
      const penalty = duplicateNiches.length * 20;
      score -= penalty;
      reasoning.push(`⚠️ Over-specializes in: ${duplicateNiches.join(', ')} (-${penalty})`);
    }

    // Bonus for operators with multiple useful niches
    const usefulNiches = operator.niches.filter((niche: string) => importantNiches.has(niche));
    if (usefulNiches.length > 1) {
      const bonus = (usefulNiches.length - 1) * 25;
      score += bonus;
      reasoning.push(`🔄 Versatile: covers ${usefulNiches.length} important niches (+${bonus})`);
    }

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
 */
export function getDefaultPreferences(): TeamPreferences {
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
    allowDuplicates: true
  };
}

