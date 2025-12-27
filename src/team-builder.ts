/**
 * Team building algorithm for Arknights operators
 */

import * as fs from 'fs';
import * as path from 'path';
import { getNichesForOperator } from './niche-list-utils';
import { getWantToUse } from './account-storage';

export interface NicheRange {
  min: number;
  max: number;
}

export interface TeamPreferences {
  requiredNiches: Record<string, NicheRange>; // Niche filename -> range of operators needed (e.g., {"healing": {min: 1, max: 2}})
  preferredNiches: Record<string, NicheRange>; // Niche filename -> range of operators preferred (e.g., {"arts_dps": {min: 1, max: 3}})
  prioritizeRarity?: boolean; // Prioritize higher rarity operators
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
function getOperatorNiches(operatorId: string): string[] {
  const niches = getNichesForOperator(operatorId);
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
  _operatorId: string,
  niches: string[],
  preferences: TeamPreferences,
  existingTeam: TeamMember[],
  requiredNiches: Set<string>,
  preferredNiches: Set<string>
): number {
  let score = 0;
  
  // Base score from rarity (if prioritizing rarity)
  // Priority order: 6 > 4 > 5 > 3 > 2 > 1
  if (preferences.prioritizeRarity) {
    const rarity = operator.rarity || 0;
    const rarityScores: Record<number, number> = {
      6: 60,
      4: 50,
      5: 40,
      3: 30,
      2: 20,
      1: 10
    };
    score += rarityScores[rarity] || 0;
  }
  
  // Niches that should not contribute to scoring (using filenames)
  const excludedNiches = new Set(['free', 'soloists', 'enmity_healers', 'unconventional_niches', 'dual-dps']);
  
  // Normalize niche names for scoring (treat AOE and DPS as equivalent)
  const normalizeNiche = (niche: string): string => {
    if (niche === 'arts_aoe') return 'arts_dps';
    if (niche === 'phys_aoe') return 'phys_dps';
    return niche;
  };
  
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
    
    if (requiredNiches.has(niche) || requiredNiches.has(normalizedNiche)) {
      score += 100; // High priority for required niches
    } else if (preferredNiches.has(niche) || preferredNiches.has(normalizedNiche)) {
      score += 50; // Medium priority for preferred niches
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
function findBestOperatorForNiche(
  niche: string,
  availableOperators: string[],
  allOperators: Record<string, any>,
  existingTeam: TeamMember[],
  preferences: TeamPreferences,
  requiredNiches: Set<string>,
  preferredNiches: Set<string>,
  trashOperators?: Set<string>
): { operatorId: string; operator: any; niches: string[] } | null {
  let bestOperator: { operatorId: string; operator: any; niches: string[] } | null = null;
  let bestScore = -Infinity;
  
  for (const operatorId of availableOperators) {
    const operator = allOperators[operatorId];
    if (!operator) continue;
    
    const niches = getOperatorNiches(operatorId);
    // Check if operator fills the niche (including AOE variants)
    const fillsNiche = niches.includes(niche) || 
                      (niche === 'arts_dps' && niches.includes('arts_aoe')) ||
                      (niche === 'phys_dps' && niches.includes('phys_aoe'));
    if (!fillsNiche) continue;
    
    // Apply heavy penalty for trash operators
    let score = scoreOperator(operator, operatorId, niches, preferences, existingTeam, requiredNiches, preferredNiches);
    if (trashOperators && trashOperators.has(operatorId)) {
      score -= 500; // Heavy penalty for trash operators
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestOperator = { operatorId, operator, niches };
    }
  }
  
  return bestOperator;
}

/**
 * Builds a team of 12 operators based on preferences
 */
export function buildTeam(
  email: string,
  preferences: TeamPreferences
): TeamResult {
  // Load all operators
  const allOperators = loadAllOperators();
  
  // Load trash operators to apply penalty (but not exclude them)
  const trashOperators = loadTrashOperators();
  
  // Get user's raised operators (including trash operators)
  const raisedOperatorIds = getWantToUse(email);
  const availableOperators = raisedOperatorIds.filter(id => allOperators[id]);
  
  if (availableOperators.length === 0) {
    return {
      team: [],
      coverage: {},
      missingNiches: Object.keys(preferences.requiredNiches),
      score: 0
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
      const candidate = findBestOperatorForNiche(
        niche,
        availableOperators.filter(id => !usedOperatorIds.has(id)),
        allOperators,
        team,
        preferences,
        requiredNiches,
        preferredNiches,
        trashOperators
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
      const candidate = findBestOperatorForNiche(
        niche,
        availableOperators.filter(id => !usedOperatorIds.has(id)),
        allOperators,
        team,
        preferences,
        requiredNiches,
        preferredNiches,
        trashOperators
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
      const candidate = findBestOperatorForNiche(
        niche,
        availableOperators.filter(id => !usedOperatorIds.has(id)),
        allOperators,
        team,
        preferences,
        requiredNiches,
        preferredNiches,
        trashOperators
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
      const candidate = findBestOperatorForNiche(
        niche,
        availableOperators.filter(id => !usedOperatorIds.has(id)),
        allOperators,
        team,
        preferences,
        requiredNiches,
        preferredNiches,
        trashOperators
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
  
  // Fifth pass: Fill remaining slots with best available operators
  while (team.length < 12 && availableOperators.length > usedOperatorIds.size) {
    let bestCandidate: { operatorId: string; operator: any; niches: string[]; score: number } | null = null;
    
    for (const operatorId of availableOperators) {
      if (usedOperatorIds.has(operatorId)) continue;
      
      const operator = allOperators[operatorId];
      if (!operator) continue;
      
      const niches = getOperatorNiches(operatorId);
      const score = scoreOperator(operator, operatorId, niches, preferences, team, requiredNiches, preferredNiches);
      
      if (!bestCandidate || score > bestCandidate.score) {
        bestCandidate = { operatorId, operator, niches, score };
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
    score
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
    prioritizeRarity: true,
    allowDuplicates: true
  };
}

