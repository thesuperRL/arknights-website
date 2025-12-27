/**
 * Team building algorithm for Arknights operators
 */

import * as fs from 'fs';
import * as path from 'path';
import { getNichesForOperator } from './niche-list-utils';
import { getOwnedOperators, getWantToUse } from './account-storage';

export interface NicheRange {
  min: number;
  max: number;
}

export interface TeamPreferences {
  requiredNiches: Record<string, NicheRange>; // Niche filename -> range of operators needed (e.g., {"healing": {min: 1, max: 2}})
  preferredNiches: Record<string, NicheRange>; // Niche filename -> range of operators preferred (e.g., {"arts_dps": {min: 1, max: 3}})
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
  const trashFilePath = path.join(__dirname, '../data/niche-lists', 'trash-operators.json');
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
async function getOperatorNiches(operatorId: string): Promise<string[]> {
  const niches = await getNichesForOperator(operatorId);
  const expandedNiches = [...niches];
  
  // Add arts_dps if operator has arts_aoe but not arts_dps
  if (niches.includes('arts_aoe') && !niches.includes('arts_dps')) {
    expandedNiches.push('arts_dps');
  }
  
  // Add phys_dps if operator has phys_aoe but not phys_dps
  if (niches.includes('phys_aoe') && !niches.includes('phys_dps')) {
    expandedNiches.push('phys_dps');
  }
  
  return expandedNiches;
}

/**
 * Scores an operator based on how well it fits the preferences
 */
function scoreOperator(
  operator: any,
  operatorId: string,
  niches: string[],
  preferences: TeamPreferences,
  existingTeam: TeamMember[],
  requiredNiches: Set<string>,
  preferredNiches: Set<string>,
  wantToUseSet?: Set<string>
): number {
  let score = 0;
  
  // Base score from rarity ranking
  // Higher position in ranking = higher score
  if (preferences.rarityRanking && preferences.rarityRanking.length > 0) {
    const rarity = operator.rarity || 0;
    const rankingIndex = preferences.rarityRanking.indexOf(rarity);
    if (rankingIndex !== -1) {
      // Score based on position in ranking (first = highest score)
      // Score decreases by 10 for each position down the ranking
      const baseScore = 60;
      const positionScore = baseScore - (rankingIndex * 10);
      score += Math.max(0, positionScore); // Ensure non-negative
    }
  }
  
  // Calculate current niche counts in existing team (using normalized niches)
  const normalizeNiche = (niche: string): string => {
    if (niche === 'arts_aoe') return 'arts_dps';
    if (niche === 'phys_aoe') return 'phys_dps';
    return niche;
  };
  
  const nicheCounts: Record<string, number> = {};
  for (const member of existingTeam) {
    for (const niche of member.niches) {
      const normalized = normalizeNiche(niche);
      nicheCounts[normalized] = (nicheCounts[normalized] || 0) + 1;
    }
  }
  
  // Niches that should not contribute to scoring (using filenames)
  const excludedNiches = new Set(['free', 'soloists', 'enmity_healers', 'unconventional_niches', 'dual-dps']);
  
  // Boost score for operators in want-to-use list
  if (wantToUseSet && wantToUseSet.has(operatorId)) {
    score += 50; // Significant boost for operators user wants to use
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
 */
async function findBestOperatorForNiche(
  niche: string,
  availableOperators: string[],
  allOperators: Record<string, any>,
  existingTeam: TeamMember[],
  preferences: TeamPreferences,
  requiredNiches: Set<string>,
  preferredNiches: Set<string>,
  trashOperators?: Set<string>,
  wantToUseSet?: Set<string>
): Promise<{ operatorId: string; operator: any; niches: string[] } | null> {
  let bestOperator: { operatorId: string; operator: any; niches: string[] } | null = null;
  let bestScore = -Infinity;
  
  // First pass: only consider non-trash operators
  for (const operatorId of availableOperators) {
    if (trashOperators && trashOperators.has(operatorId)) continue; // Skip trash operators in first pass
    
    const operator = allOperators[operatorId];
    if (!operator) continue;
    
    const niches = await getOperatorNiches(operatorId);
    // Check if operator fills the niche (including AOE variants)
    const fillsNiche = niches.includes(niche) || 
                      (niche === 'arts_dps' && niches.includes('arts_aoe')) ||
                      (niche === 'phys_dps' && niches.includes('phys_aoe'));
    if (!fillsNiche) continue;
    
    const score = scoreOperator(operator, operatorId, niches, preferences, existingTeam, requiredNiches, preferredNiches, wantToUseSet);
    
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
      
      const niches = await getOperatorNiches(operatorId);
      // Check if operator fills the niche (including AOE variants)
      const fillsNiche = niches.includes(niche) || 
                        (niche === 'arts_dps' && niches.includes('arts_aoe')) ||
                        (niche === 'phys_dps' && niches.includes('phys_aoe'));
      if (!fillsNiche) continue;
      
      const score = scoreOperator(operator, operatorId, niches, preferences, existingTeam, requiredNiches, preferredNiches, wantToUseSet);
      
      if (score > bestScore) {
        bestScore = score;
        bestOperator = { operatorId, operator, niches };
      }
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
  
  // Load trash operators to apply penalty (but not exclude them)
  const trashOperators = loadTrashOperators();
  
  // Get user's owned operators and want-to-use operators from SQL database
  const ownedOperatorIds = await getOwnedOperators(email);
  const wantToUseOperatorIds = await getWantToUse(email);
  
  // Use owned operators as the available pool
  // Want-to-use operators will be given priority/preference in scoring
  const availableOperators = ownedOperatorIds.filter(id => allOperators[id]);
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
    const currentCount = nicheCounts[niche] || 0;
    const minCount = range.min;
    
    // Fill up to minimum
    while (currentCount < minCount && team.length < 12) {
      const candidate = await findBestOperatorForNiche(
        niche,
        availableOperators.filter(id => !usedOperatorIds.has(id)),
        allOperators,
        team,
        preferences,
        requiredNiches,
        preferredNiches,
        trashOperators,
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
        
        // Update currentCount for this niche
        const newCurrentCount = nicheCounts[niche] || 0;
        if (newCurrentCount >= minCount) break;
      } else {
        break; // No more operators available for this niche
      }
    }
  }
  
  // Second pass: Fill required niches up to maximum (optional)
  for (const [niche, range] of Object.entries(preferences.requiredNiches)) {
    if (team.length >= 12) break;
    
    const currentCount = nicheCounts[niche] || 0;
    const maxCount = range.max;
    
    // Fill up to maximum if we have space
    while (currentCount < maxCount && team.length < 12) {
      const candidate = await findBestOperatorForNiche(
        niche,
        availableOperators.filter(id => !usedOperatorIds.has(id)),
        allOperators,
        team,
        preferences,
        requiredNiches,
        preferredNiches,
        trashOperators,
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
        
        // Update currentCount for this niche
        const newCurrentCount = nicheCounts[niche] || 0;
        if (newCurrentCount >= maxCount) break;
      } else {
        break; // No more operators available for this niche
      }
    }
  }
  
  // Third pass: Fill preferred niches to minimum
  for (const [niche, range] of Object.entries(preferences.preferredNiches)) {
    if (team.length >= 12) break;
    
    const currentCount = nicheCounts[niche] || 0;
    const minCount = range.min;
    
    // Fill up to minimum
    while (currentCount < minCount && team.length < 12) {
      const candidate = await findBestOperatorForNiche(
        niche,
        availableOperators.filter(id => !usedOperatorIds.has(id)),
        allOperators,
        team,
        preferences,
        requiredNiches,
        preferredNiches,
        trashOperators,
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
        
        // Update currentCount for this niche
        const newCurrentCount = nicheCounts[niche] || 0;
        if (newCurrentCount >= minCount) break;
      } else {
        break; // No more operators available for this niche
      }
    }
  }
  
  // Fourth pass: Fill preferred niches up to maximum (optional)
  for (const [niche, range] of Object.entries(preferences.preferredNiches)) {
    if (team.length >= 12) break;
    
    const currentCount = nicheCounts[niche] || 0;
    const maxCount = range.max;
    
    // Fill up to maximum if we have space
    while (currentCount < maxCount && team.length < 12) {
      const candidate = await findBestOperatorForNiche(
        niche,
        availableOperators.filter(id => !usedOperatorIds.has(id)),
        allOperators,
        team,
        preferences,
        requiredNiches,
        preferredNiches,
        trashOperators,
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
        
        // Update currentCount for this niche
        const newCurrentCount = nicheCounts[niche] || 0;
        if (newCurrentCount >= maxCount) break;
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
  while (team.length < 12 && availableOperators.length > usedOperatorIds.size && !(allRequiredNichesFilled && allPreferredNichesFilled)) {
    let bestCandidate: { operatorId: string; operator: any; niches: string[]; score: number } | null = null;
    
    // First pass: only consider non-trash operators
    for (const operatorId of availableOperators) {
      if (usedOperatorIds.has(operatorId)) continue;
      if (trashOperators.has(operatorId)) continue; // Skip trash operators in first pass
      
      const operator = allOperators[operatorId];
      if (!operator) continue;
      
      const niches = await getOperatorNiches(operatorId);
      const score = scoreOperator(operator, operatorId, niches, preferences, team, requiredNiches, preferredNiches, wantToUseSet);
      
      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { operatorId, operator, niches, score };
      }
    }
    
    // If no non-trash candidate found, allow trash operators as last resort
    if (!bestCandidate) {
      for (const operatorId of availableOperators) {
        if (usedOperatorIds.has(operatorId)) continue;
        if (!trashOperators.has(operatorId)) continue; // Only consider trash operators now
        
        const operator = allOperators[operatorId];
        if (!operator) continue;
        
        const niches = await getOperatorNiches(operatorId);
        const score = scoreOperator(operator, operatorId, niches, preferences, team, requiredNiches, preferredNiches, wantToUseSet);
        
        if (!bestCandidate || score > bestCandidate.score) {
          bestCandidate = { operatorId, operator, niches, score };
        }
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
 * Gets default team preferences
 */
export function getDefaultPreferences(): TeamPreferences {
  return {
    requiredNiches: {
        'dp_generator': { min: 1, max: 2 },
        'laneholder': { min: 2, max: 3 },
        'healing': { min: 2, max: 3 },
        'arts_dps': { min: 1, max: 2 },
        'phys_dps': { min: 1, max: 2 },
    },
    preferredNiches: {
        'early_laneholder': { min: 1, max: 1 },
        'anti-air': { min: 1, max: 1 },
        'tanking_blocking': { min: 1, max: 2 },
        'stall': { min: 0, max: 1 },
        'fast-redeploy': { min: 0, max: 1 }
    },
    rarityRanking: [6, 4, 5, 3, 2, 1], // Default: 6 > 4 > 5 > 3 > 2 > 1
    allowDuplicates: true
  };
}

