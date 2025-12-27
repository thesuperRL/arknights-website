/**
 * Team building algorithm for Arknights operators
 */

import * as fs from 'fs';
import * as path from 'path';
import { getNichesForOperator } from './niche-list-utils';
import { getWantToUse } from './account-storage';

export interface TeamPreferences {
  requiredNiches: string[]; // Niches that must be filled (e.g., ["Healing", "Tanking/Blocking Operators"])
  preferredNiches: string[]; // Niches that are preferred but not required
  minOperatorsPerNiche?: number; // Minimum operators per niche (default: 1)
  maxOperatorsPerNiche?: number; // Maximum operators per niche (default: 3)
  prioritizeRarity?: boolean; // Prioritize higher rarity operators
  allowDuplicates?: boolean; // Allow multiple operators from same niche
}

export interface TeamMember {
  operatorId: string;
  operator: any; // Operator data
  niches: string[]; // Niches this operator fills
  primaryNiche?: string; // Primary niche this operator is filling
}

export interface TeamResult {
  team: TeamMember[];
  coverage: Record<string, number>; // Niche -> count of operators covering it
  missingNiches: string[]; // Required niches that couldn't be filled
  score: number; // Team quality score
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
 * Gets niches for an operator
 */
function getOperatorNiches(operatorId: string): string[] {
  return getNichesForOperator(operatorId);
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
  if (preferences.prioritizeRarity) {
    const rarity = operator.rarity || 0;
    score += rarity * 10;
  }
  
  // Check if operator fills required niches
  for (const niche of niches) {
    if (requiredNiches.has(niche)) {
      score += 100; // High priority for required niches
    } else if (preferredNiches.has(niche)) {
      score += 50; // Medium priority for preferred niches
    }
  }
  
  // Penalize if too many operators from same niche already in team
  if (!preferences.allowDuplicates) {
    const existingNicheCounts: Record<string, number> = {};
    for (const member of existingTeam) {
      for (const niche of member.niches) {
        existingNicheCounts[niche] = (existingNicheCounts[niche] || 0) + 1;
      }
    }
    
    for (const niche of niches) {
      const existingCount = existingNicheCounts[niche] || 0;
      const maxCount = preferences.maxOperatorsPerNiche || 3;
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
  preferredNiches: Set<string>
): { operatorId: string; operator: any; niches: string[] } | null {
  let bestOperator: { operatorId: string; operator: any; niches: string[] } | null = null;
  let bestScore = -Infinity;
  
  for (const operatorId of availableOperators) {
    const operator = allOperators[operatorId];
    if (!operator) continue;
    
    const niches = getOperatorNiches(operatorId);
    if (!niches.includes(niche)) continue;
    
    const score = scoreOperator(operator, operatorId, niches, preferences, existingTeam, requiredNiches, preferredNiches);
    
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
  
  // Get user's raised operators
  const raisedOperatorIds = getWantToUse(email);
  const availableOperators = raisedOperatorIds.filter(id => allOperators[id]);
  
  if (availableOperators.length === 0) {
    return {
      team: [],
      coverage: {},
      missingNiches: preferences.requiredNiches,
      score: 0
    };
  }
  
  // Convert to sets for faster lookup
  const requiredNiches = new Set(preferences.requiredNiches);
  const preferredNiches = new Set(preferences.preferredNiches);
  
  const team: TeamMember[] = [];
  const usedOperatorIds = new Set<string>();
  const nicheCounts: Record<string, number> = {};
  
  // First pass: Fill required niches
  for (const niche of preferences.requiredNiches) {
    const minCount = preferences.minOperatorsPerNiche || 1;
    const currentCount = nicheCounts[niche] || 0;
    
    if (currentCount < minCount && team.length < 12) {
      const candidate = findBestOperatorForNiche(
        niche,
        availableOperators.filter(id => !usedOperatorIds.has(id)),
        allOperators,
        team,
        preferences,
        requiredNiches,
        preferredNiches
      );
      
      if (candidate) {
        team.push({
          operatorId: candidate.operatorId,
          operator: candidate.operator,
          niches: candidate.niches,
          primaryNiche: niche
        });
        usedOperatorIds.add(candidate.operatorId);
        
        // Update niche counts
        for (const opNiche of candidate.niches) {
          nicheCounts[opNiche] = (nicheCounts[opNiche] || 0) + 1;
        }
      }
    }
  }
  
  // Second pass: Fill preferred niches
  for (const niche of preferences.preferredNiches) {
    if (team.length >= 12) break;
    
    const maxCount = preferences.maxOperatorsPerNiche || 3;
    const currentCount = nicheCounts[niche] || 0;
    
    if (currentCount < maxCount) {
      const candidate = findBestOperatorForNiche(
        niche,
        availableOperators.filter(id => !usedOperatorIds.has(id)),
        allOperators,
        team,
        preferences,
        requiredNiches,
        preferredNiches
      );
      
      if (candidate) {
        team.push({
          operatorId: candidate.operatorId,
          operator: candidate.operator,
          niches: candidate.niches,
          primaryNiche: niche
        });
        usedOperatorIds.add(candidate.operatorId);
        
        // Update niche counts
        for (const opNiche of candidate.niches) {
          nicheCounts[opNiche] = (nicheCounts[opNiche] || 0) + 1;
        }
      }
    }
  }
  
  // Third pass: Fill remaining slots with best available operators
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
        niches: bestCandidate.niches
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
  for (const niche of preferences.requiredNiches) {
    const minCount = preferences.minOperatorsPerNiche || 1;
    if ((nicheCounts[niche] || 0) < minCount) {
      missingNiches.push(niche);
    }
  }
  
  // Calculate team score
  let score = 0;
  for (const niche of preferences.requiredNiches) {
    if (nicheCounts[niche] && nicheCounts[niche] >= (preferences.minOperatorsPerNiche || 1)) {
      score += 100;
    }
  }
  for (const niche of preferences.preferredNiches) {
    if (nicheCounts[niche]) {
      score += 50;
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
    requiredNiches: ['Healing', 'Tanking/Blocking Operators'],
    preferredNiches: ['Arts DPS', 'Phys DPS', 'DP Generator', 'Fast-Redeploy'],
    minOperatorsPerNiche: 1,
    maxOperatorsPerNiche: 3,
    prioritizeRarity: true,
    allowDuplicates: false
  };
}

