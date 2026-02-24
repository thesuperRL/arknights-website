import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from '../translations/useTranslation';
import { getOperatorName } from '../utils/operatorNameUtils';
import { getRarityClass } from '../utils/rarityUtils';
import Stars from '../components/Stars';
import { apiFetch, getImageUrl } from '../api';
import './IntegratedStrategiesPage.css';

interface TeamPreferences {
  requiredNiches: Record<string, { min: number; max: number }>;
  preferredNiches: Record<string, { min: number; max: number }>;
  rarityRanking?: number[];
  allowDuplicates?: boolean;
}

export interface ISNicheWeightPools {
  important: { rawScore: number; niches: string[] };
  optional: { rawScore: number; niches: string[] };
  good: { rawScore: number; niches: string[] };
  /** Bonus added when a synergy's core (required operators) is satisfied. Used for all IS synergies. */
  synergyCoreBonus?: number;
  /** Multiplier applied to each synergy's corePointBonus and optionalPointBonus from its JSON. */
  synergyScaleFactor?: number;
}

// Cache for niche lists to avoid repeated API calls
const nicheListCache: Record<string, any> = {};

// Helper function to get operator tier in a niche
async function getOperatorTierInNiche(operatorId: string, niche: string): Promise<number> {
  // Check cache first
  if (!nicheListCache[niche]) {
    try {
      const response = await apiFetch(`/api/niche-lists/${encodeURIComponent(niche)}`);
      if (response.ok) {
        const data = await response.json();
        nicheListCache[niche] = data;
      } else {
        return 0; // Niche list not found
      }
    } catch (error) {
      console.error(`Error loading niche list ${niche}:`, error);
      return 0;
    }
  }

  const nicheList = nicheListCache[niche];
  if (!nicheList || !nicheList.operators) {
    return 0;
  }

  // Define tier values (higher = better)
  const tierValues: Record<string, number> = {
    'SS': 120,
    'S': 90,
    'A': 75,
    'B': 50,
    'C': 30,
    'D': 15,
    'F': 5
  };

  // Search through operators array to find the operator
  for (const entry of nicheList.operators) {
    if (entry.operatorId === operatorId) {
      return tierValues[entry.rating] || 0;
    }
  }

  return 0; // Operator not found in this niche
}

// Helper to get tier name from tier value
function getTierNameFromValue(tierValue: number): string {
  const tierMap: Record<number, string> = {
    120: 'SS',
    90: 'S',
    75: 'A',
    50: 'B',
    30: 'C',
    15: 'D',
    5: 'F'
  };
  return tierMap[tierValue] || 'Unknown';
}

// Helper function to check if operator has E2 or module levels available
// All 4-star, 5-star, and 6-star operators can be promoted
async function hasOperatorPromotionLevels(operatorId: string, niches: string[], operator: any): Promise<boolean> {
  // 4-star, 5-star, and 6-star operators can always be promoted
  if (operator && operator.rarity && operator.rarity >= 4) {
    return true;
  }
  
  // For lower rarity operators, check if they have E2/module levels in niche lists
  for (const niche of niches) {
    // Check if operator has tiers at E2 or module levels (not level 0)
    if (!nicheListCache[niche]) {
      try {
        const response = await apiFetch(`/api/niche-lists/${encodeURIComponent(niche)}`);
        if (response.ok) {
          const data = await response.json();
          nicheListCache[niche] = data;
        } else {
          continue;
        }
      } catch (error) {
        continue;
      }
    }
    
    const nicheList = nicheListCache[niche];
    if (!nicheList || !nicheList.operators) continue;
    
    for (const entry of nicheList.operators) {
      if (entry.operatorId === operatorId && entry.level && entry.level.trim() !== '') {
        return true; // Found an E2 or module level requirement
      }
    }
  }
  return false;
}

// Helper function to get operator tier at level 0 (empty string level)
async function getOperatorTierInNicheAtLevel0(operatorId: string, niche: string): Promise<number> {
  if (!nicheListCache[niche]) {
    try {
      const response = await apiFetch(`/api/niche-lists/${encodeURIComponent(niche)}`);
      if (response.ok) {
        const data = await response.json();
        nicheListCache[niche] = data;
      } else {
        return 0;
      }
    } catch (error) {
      return 0;
    }
  }

  const nicheList = nicheListCache[niche];
  if (!nicheList || !nicheList.operators) {
    return 0;
  }

  const tierValues: Record<string, number> = {
    'SS': 120,
    'S': 90,
    'A': 75,
    'B': 50,
    'C': 30,
    'D': 15,
    'F': 5
  };

  let highestTier = 0;

  // Find highest tier at level 0 (empty string)
  for (const entry of nicheList.operators) {
    if (entry.operatorId === operatorId) {
      const entryLevel = entry.level || '';
      if (entryLevel === '') {
        const tierScore = tierValues[entry.rating] || 0;
        if (tierScore > highestTier) {
          highestTier = tierScore;
        }
      }
    }
  }

  return highestTier;
}

// Helper function to get the highest tier across ALL levels (including level 0)
async function getOperatorMaxTierInNiche(operatorId: string, niche: string): Promise<number> {
  if (!nicheListCache[niche]) {
    try {
      const response = await apiFetch(`/api/niche-lists/${encodeURIComponent(niche)}`);
      if (response.ok) {
        const data = await response.json();
        nicheListCache[niche] = data;
      } else {
        return 0;
      }
    } catch (error) {
      return 0;
    }
  }

  const nicheList = nicheListCache[niche];
  if (!nicheList || !nicheList.operators) {
    return 0;
  }

  const tierValues: Record<string, number> = {
    'SS': 120,
    'S': 90,
    'A': 75,
    'B': 50,
    'C': 30,
    'D': 15,
    'F': 5
  };

  let highestTier = 0;

  // Find highest tier across ALL levels
  for (const entry of nicheList.operators) {
    if (entry.operatorId === operatorId) {
      const tierScore = tierValues[entry.rating] || 0;
      if (tierScore > highestTier) {
        highestTier = tierScore;
      }
    }
  }

  return highestTier;
}

// Helper: best tier at E2/module levels only (excludes level 0). Used for promotion scoring.
async function getOperatorBestTierAtPromotionLevel(operatorId: string, niche: string): Promise<number> {
  if (!nicheListCache[niche]) {
    try {
      const response = await apiFetch(`/api/niche-lists/${encodeURIComponent(niche)}`);
      if (response.ok) {
        const data = await response.json();
        nicheListCache[niche] = data;
      } else {
        return 0;
      }
    } catch (error) {
      return 0;
    }
  }

  const nicheList = nicheListCache[niche];
  if (!nicheList || !nicheList.operators) {
    return 0;
  }

  const tierValues: Record<string, number> = {
    'SS': 120,
    'S': 90,
    'A': 75,
    'B': 50,
    'C': 30,
    'D': 15,
    'F': 5
  };

  let highestTier = 0;
  for (const entry of nicheList.operators) {
    if (entry.operatorId === operatorId) {
      const entryLevel = (entry.level || '').trim();
      if (entryLevel !== '') {
        const tierScore = tierValues[entry.rating] || 0;
        if (tierScore > highestTier) {
          highestTier = tierScore;
        }
      }
    }
  }
  return highestTier;
}

// Helper function to get new tiers at promotion level (E2 or modules) that are better than level 0
async function getOperatorNewTiersAtPromotion(operatorId: string, niche: string): Promise<number> {
  if (!nicheListCache[niche]) {
    try {
      const response = await apiFetch(`/api/niche-lists/${encodeURIComponent(niche)}`);
      if (response.ok) {
        const data = await response.json();
        nicheListCache[niche] = data;
      } else {
        return 0;
      }
    } catch (error) {
      return 0;
    }
  }

  const nicheList = nicheListCache[niche];
  if (!nicheList || !nicheList.operators) {
    return 0;
  }

  const tierValues: Record<string, number> = {
    'SS': 120,
    'S': 90,
    'A': 75,
    'B': 50,
    'C': 30,
    'D': 15,
    'F': 5
  };

  const level0Tier = await getOperatorTierInNicheAtLevel0(operatorId, niche);
  let highestNewTier = 0;

  // Find highest tier at E2/module levels that's better than level 0
  for (const entry of nicheList.operators) {
    if (entry.operatorId === operatorId) {
      const entryLevel = entry.level || '';
      if (entryLevel !== '') {
        // This is an E2 or module level
        const tierScore = tierValues[entry.rating] || 0;
        if (tierScore > level0Tier && tierScore > highestNewTier) {
          highestNewTier = tierScore;
        }
      }
    }
  }

  return highestNewTier;
}

const DEFAULT_WEIGHT_POOLS: ISNicheWeightPools = {
  important: { rawScore: 5, niches: [] },
  optional: { rawScore: 2, niches: [] },
  good: { rawScore: 0.5, niches: [] },
  synergyCoreBonus: 15,
  synergyScaleFactor: 1
};

function getPoolRawScore(niche: string, weightPools: ISNicheWeightPools): number {
  if (weightPools.important.niches.includes(niche)) return weightPools.important.rawScore;
  if (weightPools.optional.niches.includes(niche)) return weightPools.optional.rawScore;
  return weightPools.good.rawScore;
}

/** Synergy shape for IS scoring (core/optional are group -> operator IDs). */
interface SynergyForIS {
  filename: string;
  name: string;
  core: Record<string, string[]>;
  optional: Record<string, string[]>;
  corePointBonus: number;
  optionalPointBonus: number;
  coreCountSeparately: boolean;
  optionalCountSeparately: boolean;
  optionalCountMinimum: number;
  isOnly: boolean;
}

function calculateISSynergyScore(
  teamOperatorIds: Set<string>,
  candidateOperatorId: string,
  synergies: SynergyForIS[],
  synergyCoreBonus: number,
  synergyScaleFactor: number
): { score: number; lines: string[] } {
  let score = 0;
  const lines: string[] = [];
  for (const synergy of synergies) {
    const hasCore = Object.keys(synergy.core).length > 0;
    let coreSatisfied = true;
    if (hasCore) {
      for (const operatorIds of Object.values(synergy.core)) {
        if (!operatorIds.some(id => teamOperatorIds.has(id))) {
          coreSatisfied = false;
          break;
        }
      }
    }
    const candidateIsCore = hasCore && Object.values(synergy.core).some(ids => ids.includes(candidateOperatorId));
    const candidateInOptional = Object.values(synergy.optional).some(ids => ids.includes(candidateOperatorId));

    let rawPoints = 0;
    if (synergy.coreCountSeparately) {
      if (candidateIsCore) {
        for (const operatorIds of Object.values(synergy.core)) {
          if (operatorIds.includes(candidateOperatorId)) rawPoints += synergy.corePointBonus;
        }
      }
      if (coreSatisfied && candidateInOptional) {
        let totalOptional = 0;
        for (const operatorIds of Object.values(synergy.optional)) {
          for (const id of operatorIds) {
            if (teamOperatorIds.has(id)) totalOptional++;
          }
        }
        if (totalOptional >= (synergy.optionalCountMinimum || 0)) {
          if (synergy.optionalCountSeparately) {
            for (const operatorIds of Object.values(synergy.optional)) {
              if (operatorIds.includes(candidateOperatorId)) rawPoints += synergy.optionalPointBonus;
            }
          } else {
            for (const operatorIds of Object.values(synergy.optional)) {
              if (operatorIds.includes(candidateOperatorId) && operatorIds.some(id => teamOperatorIds.has(id))) {
                rawPoints += synergy.optionalPointBonus;
              }
            }
          }
        }
      }
    } else {
      if (candidateIsCore) {
        rawPoints += synergy.corePointBonus;
      }
      if (coreSatisfied && candidateInOptional) {
        let totalOptional = 0;
        for (const operatorIds of Object.values(synergy.optional)) {
          for (const id of operatorIds) {
            if (teamOperatorIds.has(id)) totalOptional++;
          }
        }
        if (totalOptional >= (synergy.optionalCountMinimum || 0)) {
          if (synergy.optionalCountSeparately) {
            for (const operatorIds of Object.values(synergy.optional)) {
              if (operatorIds.includes(candidateOperatorId)) rawPoints += synergy.optionalPointBonus;
            }
          } else {
            for (const operatorIds of Object.values(synergy.optional)) {
              if (operatorIds.includes(candidateOperatorId) && operatorIds.some(id => teamOperatorIds.has(id))) {
                rawPoints += synergy.optionalPointBonus;
              }
            }
          }
        }
      }
    }
    // Core bonus whenever the operator BEING CONSIDERED is a core operator (no need for full core to be satisfied)
    const coreBonus = candidateIsCore ? synergyCoreBonus : 0;
    const scaledPoints = rawPoints * synergyScaleFactor;
    const synergyTotal = coreBonus + scaledPoints;
    if (synergyTotal > 0) {
      score += synergyTotal;
      const coreLabel = hasCore ? (candidateIsCore ? 'core ✓' : 'optional') : 'optional';
      lines.push(`Synergy "${synergy.name}": ${coreLabel} (+${Math.round(synergyTotal)})`);
    }
  }
  return { score, lines };
}

// Local recommendation algorithm - ONLY considers raised/deployable operators
async function getIntegratedStrategiesRecommendation(
  allOperators: Record<string, Operator>,
  raisedOperatorIds: string[], // ONLY raised operators that user can deploy
  currentTeamOperators: SelectedOperator[], // Full team with selection counts
  requiredClasses: string[],
  preferences: TeamPreferences,
  temporaryRecruitment?: string,
  currentHope?: number,
  hopeCosts?: Record<number, number>,
  trashOperators?: Set<string>,
  teamSize?: number,
  promotionCost?: number,
  weightPools: ISNicheWeightPools = DEFAULT_WEIGHT_POOLS,
  allSynergies: SynergyForIS[] = []
): Promise<{ recommendedOperator: Operator | null; reasoning: string; score: number; isPromotion?: boolean }> {
  // Helper functions for hope costs
  const getHopeCost = (rarity: number): number => {
    return hopeCosts?.[rarity] ?? 0;
  };

  const getActualHopeCost = (rarity: number): number => {
    return hopeCosts?.[rarity] ?? 0;
  };

  // Temporarily add the recruitment operator to raised operators (considered owned & raised)
  let effectiveRaisedOperators = [...raisedOperatorIds];
  if (temporaryRecruitment && allOperators[temporaryRecruitment]) {
    if (!effectiveRaisedOperators.includes(temporaryRecruitment)) {
      effectiveRaisedOperators.push(temporaryRecruitment);
    }
  }

  // ONLY use raised operators (user's deployable collection)
  let availableOperatorIds = effectiveRaisedOperators.filter(id => allOperators[id]);

  // Create a map of operator selection counts
  const selectionCounts = new Map<string, number>();
  for (const teamOp of currentTeamOperators) {
    const count = selectionCounts.get(teamOp.operatorId) || 0;
    selectionCounts.set(teamOp.operatorId, count + (teamOp.selectionCount || 1));
  }

  // Filter to only operators of the required classes
  let availableOperators = availableOperatorIds
    .filter(id => requiredClasses.includes(allOperators[id].class))
    .filter(id => {
      const selectionCount = selectionCounts.get(id) || 0;
      // Allow operator if:
      // 1. Not selected yet (selectionCount === 0) - can recruit
      // 2. Selected once and has promotion levels available (selectionCount === 1) - can promote
      if (selectionCount === 0) return true;
      if (selectionCount === 1) {
        const operator = allOperators[id];
        if (!operator || !operator.niches) return false;
        // Check if operator has promotion levels and sufficient hope
        const actualPromotionCost = promotionCost ?? 3;
        if (currentHope !== undefined && currentHope < actualPromotionCost) {
          return false; // Insufficient hope for promotion
        }
        return hasOperatorPromotionLevels(id, operator.niches, operator);
      }
      return false; // Already selected twice
    });

  // Filter based on hope requirements for first selection (recruit)
  // Promotions are already filtered above
  if (currentHope !== undefined) {
    availableOperators = availableOperators.filter(id => {
      const selectionCount = selectionCounts.get(id) || 0;
      // Promotions already filtered above
      if (selectionCount === 1) return true;
      
      const operator = allOperators[id];
      // Temporary recruitment costs 0 hope
      if (temporaryRecruitment === id) {
        return true;
      }
      const hopeCost = getHopeCost(operator.rarity || 1);
      return currentHope >= hopeCost;
    });
  }

  if (availableOperators.length === 0) {
    const classText = requiredClasses.length === 1
      ? requiredClasses[0]
      : `${requiredClasses.join(' or ')}`;
    const teamCondition = currentTeamOperators.length > 0 ? ' and aren\'t already in your team (or already promoted)' : '';
    return {
      recommendedOperator: null,
      reasoning: `No ${classText} raised operators available${teamCondition}.`,
      score: 0
    };
  }

  // Niches excluded from all teambuilding (not used for filling, scoring, or coverage)
  const teambuildExcludedNiches = new Set(['unconventional-niches']);

  // Load current team niches based on selection counts
  // For level 0 selections, use level 0 tiers; for promotions, use new tiers
  const currentTeamNiches: string[] = [];
  const currentTeamNichesByLevel: Record<string, Set<string>> = {}; // niche -> set of operator IDs at level 0

  for (const teamOp of currentTeamOperators) {
    const operator = teamOp.operator;
    const selectionCount = teamOp.selectionCount || 1;
    
    if (operator && operator.niches) {
      if (selectionCount === 1) {
        // First selection: use level 0 tiers (exclude teambuild-excluded niches)
        for (const niche of operator.niches) {
          if (teambuildExcludedNiches.has(niche)) continue;
          currentTeamNiches.push(niche);
          if (!currentTeamNichesByLevel[niche]) {
            currentTeamNichesByLevel[niche] = new Set();
          }
          currentTeamNichesByLevel[niche].add(teamOp.operatorId);
        }
      }
      // For promotions (selectionCount === 2), we don't add to currentTeamNiches
      // because we'll only count NEW tiers in scoring
    }
  }

  // Count current niche coverage (only from level 0 selections)
  const nicheCounts: Record<string, number> = {};
  for (const niche of currentTeamNiches) {
    nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
  }
  
  // Note: Promotions don't contribute to nicheCounts because they only add NEW tiers
  // The scoring logic will handle promotions separately by checking for new tiers

  // Adjust niche requirements based on team size if provided
  // Scale down requirements proportionally to team size (assuming default team size is 12)
  const defaultTeamSize = 12;
  const effectiveTeamSize = teamSize || defaultTeamSize;
  const sizeMultiplier = effectiveTeamSize / defaultTeamSize;

  // Use preferences passed as parameter (loaded from team-preferences.json via API)
  // Scale niche requirements based on team size
  const defaultPreferences = {
    ...preferences,
    requiredNiches: Object.fromEntries(
      Object.entries(preferences.requiredNiches).map(([niche, range]) => [
        niche,
        {
          min: Math.ceil(range.min * sizeMultiplier),
          max: Math.ceil(range.max * sizeMultiplier)
        }
      ])
    ),
    preferredNiches: Object.fromEntries(
      Object.entries(preferences.preferredNiches).map(([niche, range]) => [
        niche,
        {
          min: Math.ceil(range.min * sizeMultiplier),
          max: Math.ceil(range.max * sizeMultiplier)
        }
      ])
    )
  };

  // Niches that should not contribute to scoring in IS team building (using filenames)
  const isExcludedNiches = new Set([
    'free',
    'unconventional-niches',
    'fragile',
    'enmity-healing',
    'sleep',
    'global-range',
    'synergies/enmity-healing',
    'synergies/sleep'
  ]);

  const importantNiches = new Set([
    ...Object.keys(defaultPreferences.requiredNiches),
    ...Object.keys(defaultPreferences.preferredNiches),
    'low-rarity' // Include low-rarity even though it's not in the niches folder
  ].filter(niche => !isExcludedNiches.has(niche)));

  // Score each available operator
  const operatorScores: Array<{ operatorId: string; score: number; reasoning: string[]; isPromotion: boolean }> = [];

  for (const operatorId of availableOperators) {
    const operator = allOperators[operatorId];
    if (!operator || !operator.niches) continue;

    let score = 0;
    const reasoning: string[] = [];

    // Determine if this is a first selection (recruit) or second (promotion)
    const selectionCount = selectionCounts.get(operatorId) || 0;
    const isPromotion = selectionCount === 1;

    // Tier-based scoring - VERY significant, should outweigh hope penalties
    // Calculate tier scores across all niches the operator has
    // Skip special lists that don't have tier-based scoring
    const excludedFromTierScoring = new Set(['low-rarity', 'unconventional-niches']);

    // Bonus for filling important niches that are missing or under-covered
    for (const niche of operator.niches) {
      if (excludedFromTierScoring.has(niche)) {
        continue;
      }

      const currentCount = nicheCounts[niche] || 0;

      // Get tier based on selection type
      let tier = 0;
      let tierName = '';
      
      if (isPromotion) {
        // Promotion: only E2/module tiers (minus promotion cost applied later)
        tier = await getOperatorBestTierAtPromotionLevel(operatorId, niche);
        if (tier === 0) {
          continue;
        }
        tierName = getTierNameFromValue(tier);
      } else {
        // First recruitment: only level 0 (no E2 or modules)
        tier = await getOperatorTierInNicheAtLevel0(operatorId, niche);
        if (tier === 0) {
          continue;
        }
        tierName = getTierNameFromValue(tier);
      }

      const tierPoints = tier;

      if (niche === 'trash-operators') {
        const trashPenalty = 1000;
        score -= trashPenalty;
        reasoning.push(`Trash operator (-${trashPenalty})`);
      } else {
        const rawScore = getPoolRawScore(niche, weightPools);
        const requiredRange = defaultPreferences.requiredNiches[niche];
        const preferredRange = defaultPreferences.preferredNiches[niche];
        let coverageFactor = 1;
        let label = 'Provides niche variety';
        if (requiredRange) {
          if (currentCount < requiredRange.min) {
            coverageFactor = 1;
            label = isPromotion ? 'Adds new capability' : 'Fills missing required niche';
          } else if (currentCount < requiredRange.max) {
            coverageFactor = 0.5;
            label = isPromotion ? 'Enhances capability' : 'Strengthens required niche';
          } else {
            coverageFactor = 0.25;
            label = isPromotion ? 'Adds over-specialization' : 'Over-specializes in';
          }
        } else if (preferredRange) {
          if (currentCount < preferredRange.min) {
            coverageFactor = 1;
            label = isPromotion ? 'Adds new capability' : 'Fills missing preferred niche';
          } else if (currentCount < preferredRange.max) {
            coverageFactor = 0.5;
            label = isPromotion ? 'Enhances capability' : 'Strengthens preferred niche';
          } else {
            coverageFactor = 0.25;
            label = isPromotion ? 'Adds over-specialization' : 'Over-specializes in';
          }
        }
        const bonus = tierPoints * rawScore * coverageFactor;
        score += bonus;
        reasoning.push(`${label}: ${niche} at ${tierName} tier (+${Math.round(bonus)})`);
      }
    }

    // Apply hope cost penalty
    // For promotions (second selection), use configured promotion cost
    // For first selection (recruit), use normal rarity-based hope cost
    let hopeCost: number;
    if (isPromotion) {
      hopeCost = promotionCost ?? 3; // Promotion cost
      reasoning.push(`This is a promotion (second selection)`);
    } else {
      hopeCost = getActualHopeCost(operator.rarity || 1);
    }

    // Filter based on hope requirements
    if (currentHope !== undefined && currentHope < hopeCost) {
      // Skip this operator if insufficient hope
      continue;
    }

    // Calculate how much the operator's niches are needed (0 = not needed, higher = more needed)
    let nicheNeedFactor = 0;

    for (const niche of operator.niches) {
      if (!importantNiches.has(niche)) continue;

      const currentCount = nicheCounts[niche] || 0;
      const requiredRange = defaultPreferences.requiredNiches[niche];
      const preferredRange = defaultPreferences.preferredNiches[niche];

      if (requiredRange) {
        if (currentCount < requiredRange.min) {
          // High need - niches are under-covered
          nicheNeedFactor += 2;
        } else if (currentCount < requiredRange.max) {
          // Moderate need - niches could use more coverage
          nicheNeedFactor += 1;
        }
      } else if (preferredRange) {
        if (currentCount < preferredRange.min) {
          // Moderate need for preferred niches
          nicheNeedFactor += 1;
        }
      }
    }

    // Apply large hope cost penalty - always present, discourages expensive operators
    // Exception: temporary recruitment operators don't incur a hope penalty
    const isTemporaryRecruitment = operatorId === temporaryRecruitment;
    if (!isTemporaryRecruitment) {
      const hopePenalty = hopeCost * 10; // Large multiplier to make hope cost very significant
      score -= hopePenalty;
      reasoning.push(`Hope cost penalty: ${hopeCost} hope (-${hopePenalty})`);
    } else {
      reasoning.push(`Temporary recruitment: No hope penalty applied!`);
    }

    // Synergy scoring (IS-only synergies): core bonus + scale factor × points from each synergy's JSON
    const synergyCoreBonus = weightPools.synergyCoreBonus ?? 0;
    const synergyScaleFactor = weightPools.synergyScaleFactor ?? 1;
    if (allSynergies.length > 0 && (synergyCoreBonus !== 0 || synergyScaleFactor !== 0)) {
      const teamWithCandidate = new Set([...currentTeamOperators.map(t => t.operatorId), operatorId]);
      const { score: synScore, lines: synLines } = calculateISSynergyScore(
        teamWithCandidate,
        operatorId,
        allSynergies,
        synergyCoreBonus,
        synergyScaleFactor
      );
      if (synScore > 0) {
        score += synScore;
        reasoning.push(...synLines);
      }
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
      reasoning,
      isPromotion
    });
  }

  // Sort by score (highest first)
  operatorScores.sort((a, b) => b.score - a.score);

  if (operatorScores.length === 0) {
    const classText = requiredClasses.length === 1
      ? requiredClasses[0]
      : `${requiredClasses.join(' or ')}`;

    // Count valid operators (raised, correct class, sufficient hope)
    const validOperatorsCount = raisedOperatorIds.filter(id => {
      const operator = allOperators[id];
      if (!operator) return false;

      // Check class constraint
      if (!requiredClasses.includes(operator.class)) return false;

      // Check hope constraint (if hope tracking is enabled)
      if (currentHope !== undefined) {
        const hopeCost = getHopeCost(operator.rarity || 1);
        if (currentHope < hopeCost) return false;
      }

      return true;
    }).length;

    return {
      recommendedOperator: null,
      reasoning: `No suitable ${classText} operators found for your team composition. You have ${validOperatorsCount} valid ${classText} operators available.`,
      score: 0
    };
  }

  const bestOperator = operatorScores[0];
  const operator = allOperators[bestOperator.operatorId];
  const isPromotion = bestOperator.isPromotion || false;

  // Create detailed reasoning with better formatting
  const classText = requiredClasses.length === 1
    ? requiredClasses[0]
    : `${requiredClasses.slice(0, -1).join(', ')} or ${requiredClasses[requiredClasses.length - 1]}`;

  const actionType = isPromotion ? 'Promotion' : 'Recruitment';
  const actualPromotionCost = promotionCost ?? 3;
  const reasoningParts = [
    `**Recommended ${classText} ${actionType}**`,
    '',
    ...(isPromotion ? [
      `**This is a promotion (second selection)**`,
      `**Cost: ${actualPromotionCost} hope**`,
      `**Adds new tiers from E2/module levels only**`,
      ''
    ] : []),
    ...(temporaryRecruitment ? [
      `**Temporary recruitment: ${allOperators[temporaryRecruitment]?.name || 'Unknown Operator'} (considered owned & raised)**`,
      ''
    ] : []),
    '**Scoring Breakdown:**',
    ...bestOperator.reasoning.map(line => `- ${line}`),
    '',
    `**Final Score: ${bestOperator.score}**`,
    '',
    isPromotion 
      ? '*This promotion adds new capabilities (E2/module tiers) that weren\'t available at level 0.*'
      : '*This operator was selected because it best complements your current team composition and fills important gaps.*'
  ];

  return {
    recommendedOperator: operator,
    reasoning: reasoningParts.join('\n'),
    score: bestOperator.score,
    isPromotion: isPromotion
  };
}

// Component to render formatted reasoning text
const FormattedReasoning: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');

  return (
    <div className="formatted-reasoning">
      {lines.map((line, index) => {
        // Handle headers (lines starting with ** and ending with **)
        if (line.startsWith('**') && line.endsWith('**')) {
          return (
            <h5 key={index} className="reasoning-header">
              {line.replace(/\*\*/g, '')}
            </h5>
          );
        }

        // Handle bullet points (lines starting with - )
        if (line.startsWith('- ')) {
          return (
            <div key={index} className="reasoning-bullet">
              {line.substring(2)}
            </div>
          );
        }

        // Handle italic text (lines starting and ending with *)
        if (line.startsWith('*') && line.endsWith('*')) {
          return (
            <p key={index} className="reasoning-emphasis">
              {line.replace(/\*/g, '')}
            </p>
          );
        }

        // Regular lines
        return line.trim() ? (
          <p key={index} className="reasoning-text">
            {line}
          </p>
        ) : (
          <br key={index} />
        );
      })}
    </div>
  );
};

interface Operator {
  id: string;
  name: string;
  rarity: number;
  class: string;
  profileImage: string;
  global: boolean;
  niches?: string[];
  cnName?: string;
  twName?: string;
  jpName?: string;
  krName?: string;
}

interface SelectedOperator {
  operatorId: string;
  operator: Operator;
  selectionCount?: number; // 1 = recruited at level 0, 2 = promoted (for IS only)
}

interface RecommendationResult {
  recommendedOperator: Operator | null;
  reasoning: string;
  score: number;
  isPromotion?: boolean; // True if this is a promotion (second selection)
}

const CLASS_OPTIONS = [
  'Vanguard',
  'Guard',
  'Defender',
  'Sniper',
  'Caster',
  'Medic',
  'Supporter',
  'Specialist'
];

const IntegratedStrategiesPage: React.FC = () => {
  const { user } = useAuth();
  const { language } = useLanguage();
  const { t, translateClass, interpolate } = useTranslation();

  const [allOperators, setAllOperators] = useState<Record<string, Operator>>({});
  const [ownedOperators, setOwnedOperators] = useState<Set<string>>(new Set());
  const [raisedOperators, setRaisedOperators] = useState<Set<string>>(new Set());
  const [originalRaisedOperators, setOriginalRaisedOperators] = useState<Set<string>>(new Set());
  const [allClassesAvailable, setAllClassesAvailable] = useState<boolean>(false);
  const [rawUserData, setRawUserData] = useState<any>(null);
  const [selectedOperators, setSelectedOperators] = useState<SelectedOperator[]>([]);
  const [requiredClasses, setRequiredClasses] = useState<Set<string>>(new Set());
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [allRecommendations, setAllRecommendations] = useState<RecommendationResult[]>([]);
  const [currentRecommendationIndex, setCurrentRecommendationIndex] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOperatorSelectModal, setShowOperatorSelectModal] = useState(false);
  const [operatorSelectSearch, setOperatorSelectSearch] = useState('');
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [temporaryRecruitment, setTemporaryRecruitment] = useState<string>('');
  const [showTempRecruitmentModal, setShowTempRecruitmentModal] = useState(false);
  const [tempRecruitmentSearch, setTempRecruitmentSearch] = useState('');
  const [currentHope, setCurrentHope] = useState<number>(0);
  const [hopeCosts, setHopeCosts] = useState<Record<number, number>>({
    6: 6,
    5: 3,
    4: 0
  });
  const [promotionCost, setPromotionCost] = useState<number>(3);
  const [trashOperators, setTrashOperators] = useState<Set<string>>(new Set());
  const [preferences, setPreferences] = useState<TeamPreferences | null>(null);
  const [weightPoolsConfig, setWeightPoolsConfig] = useState<ISNicheWeightPools>(DEFAULT_WEIGHT_POOLS);
  const [allSynergies, setAllSynergies] = useState<SynergyForIS[]>([]);
  const [teamSize, setTeamSize] = useState<number>(8);
  const [optimalTeam, setOptimalTeam] = useState<Set<string>>(new Set());
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);

  // Helper function to get hope cost for an operator
  const getHopeCost = (rarity: number): number => {
    return hopeCosts[rarity] ?? 0;
  };


  useEffect(() => {
    if (user) {
      loadAllOperators();
      loadOwnedOperators();
      loadTrashOperators();
      loadPreferences();
      loadSynergies();
      // Load hope and hope costs immediately (don't need to wait for operators)
      loadISTeamState(true);
    }
  }, [user]);

  // Load selected operators after allOperators is loaded
  useEffect(() => {
    if (user && Object.keys(allOperators).length > 0) {
      loadISTeamState(false); // Load everything including operators
    }
  }, [user, allOperators]);

  // Calculate optimal team whenever team or team size changes
  useEffect(() => {
    if (selectedOperators.length > 0 && preferences && teamSize > 0) {
      calculateOptimalTeam();
    } else {
      setOptimalTeam(new Set());
    }
  }, [selectedOperators, teamSize, preferences, allOperators]);

  // Auto-save IS team state when it changes (instant save)
  // Skip saving during initial load to prevent overwriting loaded data
  useEffect(() => {
    if (user && Object.keys(allOperators).length > 0 && !isInitialLoad) {
      saveISTeamState();
    }
  }, [selectedOperators, currentHope, hopeCosts, promotionCost, teamSize, user, allOperators, isInitialLoad]);

  const loadPreferences = async () => {
    try {
      const [prefsResponse, weightResponse] = await Promise.all([
        apiFetch('/api/team/preferences'),
        apiFetch('/api/config/is-niche-weight-pools')
      ]);
      if (prefsResponse.ok) {
        const data = await prefsResponse.json();
        setPreferences(data);
      } else {
        // Load defaults if no saved preferences
        const defaultResponse = await apiFetch('/api/team/preferences/default');
        if (defaultResponse.ok) {
          const defaultData = await defaultResponse.json();
          setPreferences(defaultData);
        }
      }
      if (weightResponse.ok) {
        const weightData = await weightResponse.json();
        setWeightPoolsConfig({
          important: weightData.important ?? DEFAULT_WEIGHT_POOLS.important,
          optional: weightData.optional ?? DEFAULT_WEIGHT_POOLS.optional,
          good: weightData.good ?? DEFAULT_WEIGHT_POOLS.good,
          synergyCoreBonus: weightData.synergyCoreBonus ?? DEFAULT_WEIGHT_POOLS.synergyCoreBonus ?? 15,
          synergyScaleFactor: weightData.synergyScaleFactor ?? DEFAULT_WEIGHT_POOLS.synergyScaleFactor ?? 1
        });
      }
    } catch (err) {
      console.error('Error loading preferences:', err);
      // Load defaults on error
      try {
        const defaultResponse = await apiFetch('/api/team/preferences/default');
        if (defaultResponse.ok) {
          const defaultData = await defaultResponse.json();
          setPreferences(defaultData);
        }
      } catch (e) {
        console.error('Failed to load default preferences:', e);
      }
    }
  };

  const loadSynergies = async () => {
    try {
      const response = await apiFetch('/api/synergies');
      if (!response.ok) return;
      const list = await response.json();
      const synergyPromises = list.map(async (s: { filename: string }) => {
        const detailRes = await apiFetch(`/api/synergies/${encodeURIComponent(s.filename)}`);
        if (!detailRes.ok) return null;
        const full = await detailRes.json();
        // Load all synergies for IS; isOnly only affects normal teambuilding
        const core: Record<string, string[]> = {};
        for (const [groupName, operators] of Object.entries(full.core || {})) {
          core[groupName] = (operators as Array<{ operatorId: string }>).map((op: { operatorId: string }) => op.operatorId);
        }
        const optional: Record<string, string[]> = {};
        for (const [groupName, operators] of Object.entries(full.optional || {})) {
          optional[groupName] = (operators as Array<{ operatorId: string }>).map((op: { operatorId: string }) => op.operatorId);
        }
        return {
          filename: s.filename,
          name: full.name,
          core,
          optional,
          isOnly: !!full.isOnly,
          corePointBonus: full.corePointBonus ?? 0,
          optionalPointBonus: full.optionalPointBonus ?? 0,
          coreCountSeparately: !!full.coreCountSeparately,
          optionalCountSeparately: !!full.optionalCountSeparately,
          optionalCountMinimum: full.optionalCountMinimum ?? 0
        } as SynergyForIS;
      });
      const synergies = await Promise.all(synergyPromises);
      setAllSynergies(synergies.filter((s): s is SynergyForIS => s !== null));
    } catch (err) {
      console.error('Error loading synergies for IS:', err);
    }
  };

  const loadISTeamState = async (loadOnlyHope: boolean = false) => {
    try {
      const response = await apiFetch('/api/integrated-strategies/team');
      if (response.ok) {
        const data = await response.json();
        if (data) {
          // Always restore current hope and hope costs immediately (don't need to wait for operators)
          if (loadOnlyHope) {
            if (data.currentHope !== undefined) {
              setCurrentHope(data.currentHope);
            }
            
            if (data.hopeCosts) {
              setHopeCosts(data.hopeCosts);
            }
            
            if (data.promotionCost !== undefined) {
              setPromotionCost(data.promotionCost);
            }
            return; // Early return if only loading hope
          }
          
          // Restore everything (hope, costs, and operators)
          if (data.currentHope !== undefined) {
            setCurrentHope(data.currentHope);
          }
          
          if (data.hopeCosts) {
            setHopeCosts(data.hopeCosts);
          }
          
          if (data.promotionCost !== undefined) {
            setPromotionCost(data.promotionCost);
          }
          
          // Restore team size
          if (data.teamSize !== undefined) {
            setTeamSize(data.teamSize);
          }
          
          // Restore selected operators only after allOperators is loaded
          if (Object.keys(allOperators).length > 0) {
            if (data.selectedOperators && Array.isArray(data.selectedOperators)) {
              // Handle both old format (array of strings) and new format (array of objects with selectionCount)
              const operators = data.selectedOperators
                .map((item: any) => {
                  let opId: string;
                  let selectionCount: number = 1;
                  
                  if (typeof item === 'string') {
                    // Old format: just operator ID
                    opId = item;
                  } else if (item && typeof item === 'object' && item.operatorId) {
                    // New format: object with operatorId and selectionCount
                    opId = item.operatorId;
                    selectionCount = item.selectionCount || 1;
                  } else {
                    return null;
                  }
                  
                  const op = allOperators[opId];
                  if (op) {
                    return { operatorId: opId, operator: op, selectionCount };
                  }
                  return null;
                })
                .filter((item: any) => item !== null);
              setSelectedOperators(operators);
            }
          }
          
          // Mark initial load as complete after loading all data
          if (!loadOnlyHope && Object.keys(allOperators).length > 0) {
            setIsInitialLoad(false);
          } else if (loadOnlyHope) {
            // For hope-only load, mark complete after a short delay to ensure state is set
            setTimeout(() => setIsInitialLoad(false), 100);
          }
        }
      }
    } catch (err) {
      console.error('Error loading IS team state:', err);
      setIsInitialLoad(false); // Mark as complete even on error
    }
  };

  // Extract scoring logic into a reusable function
  const scoreCombination = async (
    combo: string[],
    isExcludedNiches: Set<string>,
    importantNiches: Set<string>,
    preferences: TeamPreferences
  ): Promise<number> => {
    // Calculate niche coverage for this combination
    const nicheCounts: Record<string, number> = {};
    
    for (const opId of combo) {
      const op = allOperators[opId];
      if (op && op.niches) {
        for (const niche of op.niches) {
          if (isExcludedNiches.has(niche)) continue;
          nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
        }
      }
    }

    // Score based on tier performance (HIGH EMPHASIS) and niche coverage
    let score = 0;
    
    // Track which niches we've scored to avoid double counting
    const scoredNiches = new Set<string>();

    // FIRST: Score based on tier performance (HIGH PRIORITY)
    let totalTierScore = 0;
    for (const opId of combo) {
      const op = allOperators[opId];
      if (!op || !op.niches) continue;

      // Penalty for trash operators (check both Set and niche list)
      const isTrash = (trashOperators && trashOperators.has(opId)) || 
                      op.niches.includes("trash-operator") || 
                      op.niches.includes("trash-operators");
      if (isTrash) {
        score -= 1000;
        continue;
      }

      // Calculate tier scores for this operator across all niches
      for (const niche of op.niches) {
        if (isExcludedNiches.has(niche)) continue;
        
        const normalizedNiche = niche;
        if (scoredNiches.has(normalizedNiche)) continue;
        scoredNiches.add(normalizedNiche);

        // Get tier for this operator in this niche
        const tier = await getOperatorTierInNiche(opId, niche);
        if (tier === 0) continue;

        // Tier score is weighted heavily (emphasize tiers over coverage)
        totalTierScore += tier * 10; // High multiplier to prioritize tiers
      }
    }

    // Apply tier score (HIGH WEIGHT)
    score += totalTierScore;

    // SECOND: Score based on niche coverage (with tier-weighted bonuses)
    scoredNiches.clear(); // Reset for coverage scoring
    let nicheCoverageScore = 0;

    for (const opId of combo) {
      const op = allOperators[opId];
      if (!op || !op.niches) continue;

      // Skip trash operators in niche coverage scoring (penalty already applied)
      const isTrash = (trashOperators && trashOperators.has(opId)) || 
                      op.niches.includes("trash-operator") || 
                      op.niches.includes("trash-operators");
      if (isTrash) continue;

      for (const niche of op.niches) {
        if (isExcludedNiches.has(niche)) continue;

        const normalizedNiche = niche;
        if (scoredNiches.has(normalizedNiche)) continue;
        scoredNiches.add(normalizedNiche);

        const currentCount = nicheCounts[niche] || 0;

        // Get required/preferred ranges to determine how many top tiers to consider
        const requiredRange = importantNiches.has(niche) ? preferences.requiredNiches[niche] : undefined;
        const preferredRange = importantNiches.has(niche) ? preferences.preferredNiches[niche] : undefined;
        
        // Determine how many top tiers to consider
        let tierCount = 1; // Default to just the best tier
        if (requiredRange) {
          tierCount = Math.max(tierCount, requiredRange.max);
        }
        if (preferredRange) {
          tierCount = Math.max(tierCount, preferredRange.max);
        }

        // Collect all tiers in this niche from operators in the combo (excluding trash operators)
        const tiersInNiche: number[] = [];
        for (const otherOpId of combo) {
          const otherOp = allOperators[otherOpId];
          if (!otherOp || !otherOp.niches) continue;
          
          // Skip trash operators
          const isOtherTrash = (trashOperators && trashOperators.has(otherOpId)) || 
                              otherOp.niches.includes("trash-operator") || 
                              otherOp.niches.includes("trash-operators");
          if (isOtherTrash) continue;
          
          // Only consider operators that have this niche
          if (otherOp.niches.includes(niche)) {
            const tier = await getOperatorTierInNiche(otherOpId, niche);
            if (tier > 0) {
              tiersInNiche.push(tier);
            }
          }
        }

        // Sort tiers in descending order and take the top x
        tiersInNiche.sort((a, b) => b - a);
        const topTiers = tiersInNiche.slice(0, tierCount);
        
        // Sum the top tiers (or use the best tier if none found)
        const totalTierValue = topTiers.length > 0 
          ? topTiers.reduce((sum, tier) => sum + tier, 0)
          : 0;

        const rawScore = getPoolRawScore(niche, weightPoolsConfig);
        let coverageFactor = 1;
        if (requiredRange) {
          if (currentCount < requiredRange.min) coverageFactor = 1;
          else if (currentCount < requiredRange.max) coverageFactor = 0.5;
          else coverageFactor = 0.25;
        } else if (preferredRange) {
          if (currentCount < preferredRange.min) coverageFactor = 1;
          else if (currentCount < preferredRange.max) coverageFactor = 0.5;
          else coverageFactor = 0.25;
        }
        if (importantNiches.has(niche)) {
          nicheCoverageScore += totalTierValue * rawScore * coverageFactor;
        } else {
          const bestTier = topTiers.length > 0 ? topTiers[0] : 0;
          nicheCoverageScore += bestTier * rawScore * coverageFactor;
        }
      }
    }

    // Apply niche coverage score (LOWER WEIGHT than tier score)
    score += nicheCoverageScore;

    return score;
  };

  const calculateOptimalTeam = async () => {
    if (!preferences || selectedOperators.length === 0 || teamSize <= 0) {
      setOptimalTeam(new Set());
      return;
    }

    // If team size is greater than or equal to selected operators, all are optimal
    if (teamSize >= selectedOperators.length) {
      setOptimalTeam(new Set(selectedOperators.map(s => s.operatorId)));
      return;
    }

    // Niches that should not contribute to scoring
    const isExcludedNiches = new Set([
      'free',
      'unconventional-niches',
      'fragile',
      'enmity-healing',
      'sleep',
      'global-range',
      'synergies/enmity-healing',
      'synergies/sleep',
      'low-rarity'
    ]);

    const importantNiches = new Set([
      ...Object.keys(preferences.requiredNiches),
      ...Object.keys(preferences.preferredNiches)
    ].filter(niche => !isExcludedNiches.has(niche)));

    const operatorIds = selectedOperators.map(s => s.operatorId);
    const currentOptimalTeam = Array.from(optimalTeam);
    
    let bestCombination: string[] = [];
    let bestScore = -Infinity;

    // Check if we have an existing optimal team that's still valid (all operators still in selectedOperators)
    const hasValidOptimalTeam = currentOptimalTeam.length === teamSize &&
                                 currentOptimalTeam.every(id => operatorIds.includes(id));

    if (hasValidOptimalTeam) {
      // Incremental optimization: try replacing 3 operators at a time
      const combinations: string[][] = [];
      
      // Include the current optimal team
      combinations.push([...currentOptimalTeam]);
      
      // Generate combinations by replacing up to 3 operators at a time
      function generateReplacementCombinations(
        baseTeam: string[],
        availableOps: string[],
        replaceCount: number,
        start: number,
        indices: number[]
      ) {
        if (indices.length === replaceCount) {
          // Try all combinations of replacements for these positions
          // Operators that are staying in the team (not being replaced)
          const stayingOps = baseTeam.filter((_, idx) => !indices.includes(idx));
          
          // Available operators for replacement (any operator not already staying in the team)
          const replacementOps = availableOps.filter(id => !stayingOps.includes(id));
          
          function selectReplacements(
            remaining: string[],
            count: number,
            startIdx: number,
            current: string[]
          ) {
            if (current.length === count) {
              const newTeam = [...baseTeam];
              // Replace the selected positions with the new operators
              for (let i = 0; i < indices.length; i++) {
                newTeam[indices[i]] = current[i];
              }
              // Ensure no duplicates (shouldn't happen but safety check)
              if (new Set(newTeam).size === newTeam.length) {
                combinations.push(newTeam);
              }
              return;
            }
            
            for (let i = startIdx; i < remaining.length; i++) {
              current.push(remaining[i]);
              selectReplacements(remaining, count, i + 1, current);
              current.pop();
            }
          }
          
          selectReplacements(replacementOps, replaceCount, 0, []);
          return;
        }
        
        for (let i = start; i < baseTeam.length; i++) {
          indices.push(i);
          generateReplacementCombinations(baseTeam, availableOps, replaceCount, i + 1, indices);
          indices.pop();
        }
      }

      // Try replacing 1, 2, or 3 operators
      for (let replaceCount = 1; replaceCount <= Math.min(3, teamSize); replaceCount++) {
        generateReplacementCombinations(currentOptimalTeam, operatorIds, replaceCount, 0, []);
      }
      
      // Score all combinations
      for (const combo of combinations) {
        const score = await scoreCombination(combo, isExcludedNiches, importantNiches, preferences);
        if (score > bestScore) {
          bestScore = score;
          bestCombination = combo;
        }
      }
    } else {
      // No existing optimal team or it's invalid - do a full calculation
      // Generate all possible combinations of teamSize operators
      const combinations: string[][] = [];
      
      function generateCombinations(arr: string[], size: number, start: number, current: string[]) {
        if (current.length === size) {
          combinations.push([...current]);
          return;
        }
        
        for (let i = start; i < arr.length; i++) {
          current.push(arr[i]);
          generateCombinations(arr, size, i + 1, current);
          current.pop();
        }
      }

      generateCombinations(operatorIds, Math.min(teamSize, operatorIds.length), 0, []);

      // Score each combination
      for (const combo of combinations) {
        const score = await scoreCombination(combo, isExcludedNiches, importantNiches, preferences);
        if (score > bestScore) {
          bestScore = score;
          bestCombination = combo;
        }
      }
    }

    setOptimalTeam(new Set(bestCombination));
  };

  const saveISTeamState = async () => {
    if (!user) return;
    
    try {
      const teamState = {
        selectedOperators: selectedOperators.map(s => ({
          operatorId: s.operatorId,
          selectionCount: s.selectionCount || 1
        })),
        currentHope,
        hopeCosts,
        promotionCost,
        teamSize
      };
      
      await apiFetch('/api/integrated-strategies/team', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(teamState)
      });
    } catch (err) {
      console.error('Error saving IS team state:', err);
    }
  };

  const resetISTeamState = async () => {
    if (!user) return;
    
    if (!confirm(t('isTeamBuilder.resetConfirm'))) {
      return;
    }
    
    try {
      // Clear saved state on server
      await apiFetch('/api/integrated-strategies/team', {
        method: 'DELETE'
      });
      
      // Reset local state to defaults
      setSelectedOperators([]);
      setCurrentHope(0);
      setHopeCosts({
        6: 6,
        5: 3,
        4: 0
      });
      setPromotionCost(3);
      setTeamSize(8);
      setOptimalTeam(new Set());
      setRecommendation(null);
      
      setIsInitialLoad(false); // Allow saving after reset
    } catch (err) {
      console.error('Error resetting IS team state:', err);
    }
  };

  const loadTrashOperators = async () => {
    try {
      const response = await apiFetch('/api/trash-operators');
      if (response.ok) {
        const data = await response.json();
        const trashIds = new Set<string>((data.operators || []).map((op: any) => op.id).filter((id: any): id is string => typeof id === 'string'));
        setTrashOperators(trashIds);
      }
    } catch (err) {
      console.error('Error loading trash operators:', err);
      setTrashOperators(new Set());
    }
  };

  const loadAllOperators = async () => {
    try {
      const rarities = [1, 2, 3, 4, 5, 6];
      const allOps: Record<string, Operator> = {};

      for (const rarity of rarities) {
        const response = await apiFetch(`/api/operators/rarity/${rarity}`);
        if (response.ok) {
          const operators = await response.json() as Record<string, Operator>;
          Object.assign(allOps, operators);
        }
      }

      setAllOperators(allOps);
    } catch (err) {
      console.error('Error loading operators:', err);
    }
  };

  const loadOwnedOperators = async () => {
    if (!user) {
      setOwnedOperators(new Set());
      setRaisedOperators(new Set());
      setRawUserData(null);
      return;
    }

    try {
      const response = await apiFetch('/api/auth/user');
      if (response.ok) {
        const data = await response.json();
        setRawUserData(data);
        setOwnedOperators(new Set(data.ownedOperators || []));
        const raisedOps = new Set<string>(data.raisedOperators || []);
        setRaisedOperators(raisedOps); // raisedOperators comes from wantToUse field
        setOriginalRaisedOperators(new Set<string>(raisedOps)); // Store original state
      }
    } catch (err) {
      console.error('Error loading owned operators:', err);
    }
  };

  const addOperator = async (operatorId: string, isPromotion: boolean = false, fromRecommendation: boolean = false) => {
    const operator = allOperators[operatorId];
    if (!operator) return;

    // Calculate hope cost if this is from a recommendation
    let hopeCostToDeduct = 0;
    if (fromRecommendation) {
      if (isPromotion) {
        hopeCostToDeduct = promotionCost;
      } else {
        hopeCostToDeduct = getHopeCost(operator.rarity || 1);
      }
    }

    setSelectedOperators(prev => {
      const existing = prev.find(s => s.operatorId === operatorId);
      
      if (existing) {
        // Operator already selected
        if (existing.selectionCount === 1 && isPromotion) {
          // Promotion: second selection
          // No hope check or subtraction for manual additions
          
          // Update to selection count 2 (promotion)
          return prev.map(s => 
            s.operatorId === operatorId 
              ? { ...s, selectionCount: 2 }
              : s
          );
        }
        // Already promoted or invalid state
        return prev;
      } else {
        // First selection (recruit at level 0)
        // No hope check or subtraction for manual additions
        
        return [...prev, { operatorId, operator, selectionCount: 1 }];
      }
    });
    
    // Deduct hope cost if this is from a recommendation
    if (fromRecommendation && hopeCostToDeduct > 0) {
      setCurrentHope(prev => Math.max(0, prev - hopeCostToDeduct));
    }
    
    setRecommendation(null); // Clear recommendation when team changes
    setError(null); // Clear any previous error
  };

  const removeOperator = (operatorId: string) => {
    setSelectedOperators(prev => {
      const existing = prev.find(s => s.operatorId === operatorId);
      if (!existing) return prev;
      
      if (existing.selectionCount === 2) {
        // If removing a promotion, downgrade to level 0 (selectionCount = 1)
        // No hope refund for manual removals
        return prev.map(s => 
          s.operatorId === operatorId 
            ? { ...s, selectionCount: 1 }
            : s
        );
      } else {
        // Remove completely if it's the first selection
        // No hope refund for manual removals
        return prev.filter(selected => selected.operatorId !== operatorId);
      }
    });
    setRecommendation(null); // Clear recommendation when team changes
  };

  const getRecommendation = async () => {
    if (!user) {
      setError(t('isTeamBuilder.pleaseLogIn'));
      return;
    }

    if (requiredClasses.size === 0) {
      setError(t('isTeamBuilder.selectOneClass'));
      return;
    }

    if (!preferences) {
      setError(t('isTeamBuilder.waitForPreferences'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const operatorIds = selectedOperators.map(selected => selected.operatorId);
      const raisedOpsArray = Array.from(raisedOperators); // raisedOperators are the deployable operators

      // Use optimal team for recommendations if team size is set
      // Convert optimal team IDs back to SelectedOperator objects with selection counts
      let teamForRecommendation: SelectedOperator[];
      if (teamSize > 0 && optimalTeam.size > 0) {
        // Map optimal team IDs to SelectedOperator objects, preserving selection counts
        teamForRecommendation = Array.from(optimalTeam).map(opId => {
          const existing = selectedOperators.find(s => s.operatorId === opId);
          if (existing) {
            return existing;
          }
          // If not in selectedOperators, create new entry (shouldn't happen, but handle it)
          return {
            operatorId: opId,
            operator: allOperators[opId],
            selectionCount: 1
          };
        });
      } else {
        // Use selectedOperators directly (already has selection counts)
        teamForRecommendation = selectedOperators;
      }

      // Get multiple recommendations (top 10) by temporarily excluding previous recommendations
      const recommendations: RecommendationResult[] = [];
      const excludedOperators = new Set<string>();
      const maxRecommendations = 10;

      for (let i = 0; i < maxRecommendations; i++) {
        // Create a modified raised operators array that excludes already recommended operators
        const filteredRaisedOps = raisedOpsArray.filter(id => !excludedOperators.has(id));
        
        if (filteredRaisedOps.length === 0) {
          break; // No more operators to recommend
        }

        const result = await getIntegratedStrategiesRecommendation(
          allOperators,
          filteredRaisedOps,
          teamForRecommendation,
          Array.from(requiredClasses),
          preferences,
          temporaryRecruitment || undefined,
          currentHope,
          hopeCosts,
          trashOperators,
          teamSize,
          promotionCost,
          weightPoolsConfig,
          allSynergies
        );

        if (result.recommendedOperator) {
          recommendations.push(result);
          excludedOperators.add(result.recommendedOperator.id);
        } else {
          // No more valid recommendations
          break;
        }
      }

      if (recommendations.length > 0) {
        setAllRecommendations(recommendations);
        setCurrentRecommendationIndex(0);
        setRecommendation(recommendations[0]);
      } else {
        // No recommendations found
        setAllRecommendations([]);
        setCurrentRecommendationIndex(0);
        setRecommendation({
          recommendedOperator: null,
          reasoning: t('isTeamBuilder.noSuitableFound'),
          score: 0
        });
      }
    } catch (err: any) {
      console.error('Error getting recommendation:', err);
      setError(err.message || t('isTeamBuilder.failedRecommendation'));
    } finally {
      setLoading(false);
    }
  };

  const goToPreviousRecommendation = () => {
    if (currentRecommendationIndex > 0) {
      const newIndex = currentRecommendationIndex - 1;
      setCurrentRecommendationIndex(newIndex);
      setRecommendation(allRecommendations[newIndex]);
    }
  };

  const goToNextRecommendation = () => {
    if (currentRecommendationIndex < allRecommendations.length - 1) {
      const newIndex = currentRecommendationIndex + 1;
      setCurrentRecommendationIndex(newIndex);
      setRecommendation(allRecommendations[newIndex]);
    }
  };

  if (!user) {
    return (
      <div className="integrated-strategies-page">
        <div className="error">{t('isTeamBuilder.loginRequired')}</div>
      </div>
    );
  }

  return (
    <div className="integrated-strategies-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h1 style={{ margin: 0 }}>{t('isTeamBuilder.title')}</h1>
        <button
          onClick={resetISTeamState}
          className="reset-team-btn"
          title={t('isTeamBuilder.resetAllTitle')}
        >
          {t('isTeamBuilder.resetAll')}
        </button>
      </div>
      <p className="subtitle">{t('isTeamBuilder.subtitle')}</p>

      {error && <div className="error">{error}</div>}

      <div className="team-selection-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
          <h2 style={{ margin: 0 }}>{t('isTeamBuilder.yourCurrentTeam')}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <label htmlFor="team-size-input" style={{ color: 'var(--text-light)', fontSize: '0.9rem' }}>
              {t('isTeamBuilder.teamSize')}:
            </label>
            <input
              id="team-size-input"
              type="number"
              min="1"
              max="12"
              value={teamSize}
              onChange={(e) => {
                const value = parseInt(e.target.value) || 8;
                setTeamSize(Math.max(1, Math.min(12, value)));
              }}
              style={{
                width: '60px',
                padding: '0.25rem 0.5rem',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-light)',
                fontSize: '0.9rem'
              }}
            />
          </div>
        </div>
        <p>{t('isTeamBuilder.selectOperatorsHelp')}</p>

        <div className="selected-operators">
          {selectedOperators.map(selected => {
            const selectionCount = selected.selectionCount || 1;
            // Check if operator has promotion levels
            // All 4-star, 5-star, and 6-star operators can be promoted
            let hasPromotions = false;
            if (selected.operator.rarity && selected.operator.rarity >= 4) {
              hasPromotions = true;
            } else {
              // For lower rarity, check cache for E2/module levels
              hasPromotions = !!(selected.operator.niches && selected.operator.niches.some(niche => {
                const nicheList = nicheListCache[niche];
                if (!nicheList || !nicheList.operators) return false;
                return nicheList.operators.some((entry: any) => 
                  entry.operatorId === selected.operatorId && entry.level && entry.level.trim() !== ''
                );
              }));
            }
            const canPromote = selectionCount === 1 && hasPromotions;
            
            return (
            <div 
              key={selected.operatorId} 
              className={`selected-operator-card ${optimalTeam.has(selected.operatorId) ? 'optimal-team-member' : ''} ${selectionCount === 2 ? 'promoted' : ''}`}
            >
              <img
                src={getImageUrl(selected.operator.profileImage || '/images/operators/placeholder.png')}
                alt={getOperatorName(selected.operator, language)}
                className="operator-image"
              />
              <div className="operator-info">
                <div className="operator-name">
                  {getOperatorName(selected.operator, language)}
                  {selectionCount === 2 && <span className="promote-badge">↑</span>}
                </div>
                <Stars rarity={selected.operator.rarity} size="small" />
                <div className="operator-class">{translateClass(selected.operator.class)}</div>
                {canPromote && (
                  <button
                    onClick={() => {
                      addOperator(selected.operatorId, true);
                    }}
                    className="promote-btn"
                    title={t('isTeamBuilder.promoteToE2')}
                  >
                    {t('isTeamBuilder.promote')}
                  </button>
                )}
              </div>
              <button
                className="remove-operator-btn"
                onClick={() => removeOperator(selected.operatorId)}
                title={selectionCount === 2 ? t('isTeamBuilder.removePromotion') : t('isTeamBuilder.removeFromTeam')}
              >
                ×
              </button>
            </div>
            );
          })}

          <div
            className="add-operator-card"
            onClick={() => setShowOperatorSelectModal(true)}
          >
            <div className="add-operator-content">
              <span className="add-icon">+</span>
              <span className="add-text">{t('isTeamBuilder.addOperator')}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="hope-section">
        <h2>{t('isTeamBuilder.hopeSystem')}</h2>
        <p>{t('isTeamBuilder.hopeHelp')}</p>

        <div className="hope-input-container">
          <label htmlFor="hope-input" className="hope-label">{t('isTeamBuilder.currentHope')}:</label>
          <input
            id="hope-input"
            type="number"
            min="0"
            value={currentHope}
            onChange={(e) => {
              const value = parseInt(e.target.value) || 0;
              setCurrentHope(Math.max(0, value));
              setRecommendation(null); // Clear recommendation when hope changes
            }}
            className="hope-input"
          />
          <div className="hope-requirements">
            <div className="hope-requirement">
              <span className="hope-stars">★★★★★★</span>
              <span className="hope-cost">{hopeCosts[6]} {t('isTeamBuilder.hope')}</span>
            </div>
            <div className="hope-requirement">
              <span className="hope-stars">★★★★★</span>
              <span className="hope-cost">{hopeCosts[5]} {t('isTeamBuilder.hope')}</span>
            </div>
            <div className="hope-requirement">
              <span className="hope-stars">★★★★</span>
              <span className="hope-cost">{hopeCosts[4]} {t('isTeamBuilder.hope')}</span>
            </div>
            <div className="hope-requirement">
              <span className="hope-stars">{t('isTeamBuilder.starsAndBelow')}</span>
              <span className="hope-cost">0 {t('isTeamBuilder.hope')}</span>
            </div>
            <div className="hope-requirement">
              <span className="hope-stars">{t('isTeamBuilder.tempRecruitment')}</span>
              <span className="hope-cost">0 {t('isTeamBuilder.hope')}</span>
            </div>
          </div>
        </div>

        <div className="hope-cost-config-section">
          <h3>{t('isTeamBuilder.hopeCostConfig')}</h3>
          <div className="hope-cost-config">
            <div className="hope-cost-input-group">
              <label htmlFor="hope-cost-6star">{t('isTeamBuilder.cost6')}:</label>
              <input
                id="hope-cost-6star"
                type="number"
                min="0"
                max="50"
                value={hopeCosts[6]}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  setHopeCosts(prev => ({ ...prev, 6: value }));
                  setRecommendation(null); // Clear recommendation when costs change
                }}
                className="hope-cost-input"
              />
            </div>
            <div className="hope-cost-input-group">
              <label htmlFor="hope-cost-5star">{t('isTeamBuilder.cost5')}:</label>
              <input
                id="hope-cost-5star"
                type="number"
                min="0"
                max="30"
                value={hopeCosts[5]}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  setHopeCosts(prev => ({ ...prev, 5: value }));
                  setRecommendation(null); // Clear recommendation when costs change
                }}
                className="hope-cost-input"
              />
            </div>
            <div className="hope-cost-input-group">
              <label htmlFor="hope-cost-4star">{t('isTeamBuilder.cost4')}:</label>
              <input
                id="hope-cost-4star"
                type="number"
                min="0"
                max="20"
                value={hopeCosts[4]}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  setHopeCosts(prev => ({ ...prev, 4: value }));
                  setRecommendation(null); // Clear recommendation when costs change
                }}
                className="hope-cost-input"
              />
            </div>
            <div className="hope-cost-input-group">
              <label htmlFor="promotion-cost">{t('isTeamBuilder.promotionCost')}:</label>
              <input
                id="promotion-cost"
                type="number"
                min="0"
                max="20"
                value={promotionCost}
                onChange={(e) => {
                  const value = parseInt(e.target.value) || 0;
                  setPromotionCost(value);
                  setRecommendation(null); // Clear recommendation when costs change
                }}
                className="hope-cost-input"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="class-constraint-section">
        <h2>{t('isTeamBuilder.requiredClasses')}</h2>
        <p>{t('isTeamBuilder.requiredClassesHelp')}</p>

        <div className="class-options">
          {CLASS_OPTIONS.map(className => (
            <button
              key={className}
              className={`class-option ${requiredClasses.has(className) ? 'selected' : ''}`}
              onClick={() => {
                const newClasses = new Set(requiredClasses);
                if (newClasses.has(className)) {
                  newClasses.delete(className);
                } else {
                  newClasses.add(className);
                }
                setRequiredClasses(newClasses);
                setRecommendation(null); // Clear recommendation when classes change
              }}
            >
              {translateClass(className)}
            </button>
          ))}
          <div className="select-all-container">
            <button
              className="select-all-btn"
              onClick={() => {
                if (requiredClasses.size === CLASS_OPTIONS.length) {
                  // If all are selected, deselect all
                  setRequiredClasses(new Set());
                } else {
                  // Otherwise, select all
                  setRequiredClasses(new Set(CLASS_OPTIONS));
                }
                setRecommendation(null);
              }}
            >
              {requiredClasses.size === CLASS_OPTIONS.length ? t('isTeamBuilder.deselectAll') : t('isTeamBuilder.selectAll')}
            </button>
          </div>
        </div>
      </div>

      <div className="advanced-options-section-collapsible">
        <button
          className="advanced-options-toggle"
          onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
        >
          <span>{t('isTeamBuilder.advancedOptions')}</span>
          <span className="toggle-icon">{showAdvancedOptions ? '▼' : '▶'}</span>
        </button>
        {showAdvancedOptions && (
          <div className="advanced-options-content">
            <div className="advanced-option-group">
              <label className="advanced-option-label">{t('isTeamBuilder.temporaryRecruitment')}</label>
              <div className="temporary-recruitment-selector">
                <div className="temp-recruitment-container">
                  {temporaryRecruitment ? (
                    <div className="selected-temp-operator-card">
                      <img
                        src={getImageUrl(allOperators[temporaryRecruitment]?.profileImage || '/images/operators/placeholder.png')}
                        alt={getOperatorName(allOperators[temporaryRecruitment], language)}
                        className="temp-operator-image"
                      />
                      <div className="temp-operator-info">
                        <div className="temp-operator-name">{getOperatorName(allOperators[temporaryRecruitment], language)}</div>
                        <Stars rarity={allOperators[temporaryRecruitment]?.rarity} />
                        <div className="temp-operator-class">{allOperators[temporaryRecruitment]?.class ? translateClass(allOperators[temporaryRecruitment].class) : ''}</div>
                        <div className="temp-recruitment-note">{t('isTeamBuilder.tempRecruitmentNote')}</div>
                      </div>
                      <button
                        className="remove-temp-operator-btn"
                        onClick={() => {
                          setTemporaryRecruitment('');
                          setRecommendation(null);
                        }}
                        title={t('isTeamBuilder.removeTempRecruitment')}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div
                      className="add-temp-operator-card"
                      onClick={() => setShowTempRecruitmentModal(true)}
                    >
                      <div className="add-temp-operator-content">
                        <span className="add-icon" aria-hidden="true">+</span>
                        <span className="add-text">{t('isTeamBuilder.selectTempRecruitment')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {requiredClasses.size > 0 && (
                <div className="selected-classes-indicator">
                  <span className="indicator-label">{t('isTeamBuilder.selectedClasses')}:</span>
                  <div className="class-chips">
                    {Array.from(requiredClasses).map(className => (
                      <span key={className} className="class-chip">{translateClass(className)}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="advanced-option-toggle">
                <label 
                  className={`toggle-container ${!allClassesAvailable && requiredClasses.size === 0 ? 'disabled' : ''}`}
                  title={allClassesAvailable 
                    ? `Toggle off to restore your original raised operators list`
                    : requiredClasses.size > 0 
                      ? `Add all ${Array.from(requiredClasses).join(', ')} operators to available pool (simulates IS run start)`
                      : 'Select at least one class first'
                  }
                >
                  <input
                    type="checkbox"
                    checked={allClassesAvailable}
                    disabled={!allClassesAvailable && requiredClasses.size === 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        // Activate: Add all operators of the required classes
                        if (requiredClasses.size === 0) {
                          setError(t('isTeamBuilder.selectOneClassFirst'));
                          return;
                        }
                        
                        // Store current raised operators as original
                        setOriginalRaisedOperators(new Set(raisedOperators));
                        
                        // Add all operators of the required classes to raised operators
                        const classArray = Array.from(requiredClasses);
                        const operatorsToAdd = Object.keys(allOperators).filter(id => {
                          const operator = allOperators[id];
                          return operator && classArray.includes(operator.class);
                        });
                        
                        setRaisedOperators(prev => {
                          const newSet = new Set(prev);
                          operatorsToAdd.forEach(id => newSet.add(id));
                          return newSet;
                        });
                        
                        setAllClassesAvailable(true);
                        setRecommendation(null);
                        setError(null);
                        
                        // Show success message
                        const addedCount = operatorsToAdd.filter(id => !raisedOperators.has(id)).length;
                        if (addedCount > 0) {
                          console.log(`Added ${addedCount} operators of classes: ${classArray.join(', ')}`);
                        }
                      } else {
                        // Deactivate: Restore original raised operators
                        setRaisedOperators(new Set(originalRaisedOperators));
                        setAllClassesAvailable(false);
                        setRecommendation(null);
                        setError(null);
                        console.log('Restored original raised operators');
                      }
                    }}
                    className="toggle-checkbox"
                  />
                  <span className="toggle-slider"></span>
                  <span className="toggle-label">
                    {requiredClasses.size > 0 
                      ? `${t('isTeamBuilder.addAllOperators')} ${Array.from(requiredClasses).map(c => translateClass(c)).join('/')}`
                      : t('isTeamBuilder.addAllClassOperators')
                    }
                  </span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="recommendation-section">
        <button
          onClick={getRecommendation}
          disabled={loading || !user || requiredClasses.size === 0}
          className="recommend-btn primary"
        >
          {loading ? t('isTeamBuilder.gettingRecommendation') : t('isTeamBuilder.getRecommendation')}
        </button>

        {recommendation && (
          <div className="recommendation-result">
            <div className="recommendation-header">
              <h3>{t('isTeamBuilder.recommendedNext')}</h3>
              {allRecommendations.length > 1 && (
                <div className="recommendation-navigation">
                  <button
                    onClick={goToPreviousRecommendation}
                    disabled={currentRecommendationIndex === 0}
                    className="nav-btn prev-btn"
                    title={t('isTeamBuilder.previousTitle')}
                  >
                    {t('isTeamBuilder.previous')}
                  </button>
                  <span className="recommendation-counter">
                    {currentRecommendationIndex + 1} / {allRecommendations.length}
                  </span>
                  <button
                    onClick={goToNextRecommendation}
                    disabled={currentRecommendationIndex === allRecommendations.length - 1}
                    className="nav-btn next-btn"
                    title={t('isTeamBuilder.nextTitle')}
                  >
                    {t('isTeamBuilder.next')}
                  </button>
                </div>
              )}
            </div>

            {recommendation.recommendedOperator ? (
              <>
                <div className="recommended-operator-card">
                  <img
                    src={getImageUrl(recommendation.recommendedOperator.profileImage || '/images/operators/placeholder.png')}
                    alt={getOperatorName(recommendation.recommendedOperator, language)}
                    className="operator-image"
                  />
                  <div className="operator-info">
                    <div className="operator-name">{getOperatorName(recommendation.recommendedOperator, language)}</div>
                    <Stars rarity={recommendation.recommendedOperator.rarity} />
                    <div className="operator-class">{translateClass(recommendation.recommendedOperator.class)}</div>
                    <div className="recommendation-score">{t('isTeamBuilder.score')}: {recommendation.score.toFixed(1)}</div>
                    <div className="operator-hope-cost">
                      {t('isTeamBuilder.hopeCost')}: {getHopeCost(recommendation.recommendedOperator.rarity || 1)}
                    </div>
                  </div>
                </div>

                <div className="recommendation-actions">
                  <button
                    onClick={() => {
                      addOperator(recommendation.recommendedOperator!.id, recommendation.isPromotion || false, true);
                      setRecommendation(null); // Clear recommendation after adding
                      setAllRecommendations([]); // Clear all recommendations after accepting one
                      setCurrentRecommendationIndex(0);
                    }}
                    className="add-recommended-btn primary"
                  >
                    {recommendation.isPromotion ? t('isTeamBuilder.promoteOperator') : t('isTeamBuilder.addToTeam')}
                  </button>
                </div>
              </>
            ) : (
              <div className="no-recommendation">
                <p>{t('isTeamBuilder.noSuitableOperator')}</p>
                {raisedOperators.size === 0 ? (
                  <div className="no-raised-operators-notice">
                    <p><strong>{t('isTeamBuilder.noRaisedNote')}</strong></p>
                    <p>{t('isTeamBuilder.noRaisedHelp')}</p>
                  </div>
                ) : (
                  <div className="raised-operators-count">
                    <p>{interpolate(t('isTeamBuilder.raisedCount'), { count: String(raisedOperators.size) })}</p>
                  </div>
                )}
                <button
                  onClick={() => setRecommendation(null)}
                  className="try-again-btn secondary"
                >
                  {t('isTeamBuilder.tryDifferentClass')}
                </button>
              </div>
            )}

            {recommendation.recommendedOperator && (
              <div className="recommendation-reasoning">
                <h4>{t('isTeamBuilder.reasoning')}</h4>
                <FormattedReasoning text={recommendation.reasoning} />
              </div>
            )}
          </div>
        )}
      </div>

      <p style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
        <Link to="/config/is-niche-weights" style={{ color: 'var(--text-muted)' }}>Dev: Configure IS niche weight pools</Link>
      </p>

      {/* Operator Selection Modal */}
      {showOperatorSelectModal && (
        <div className="modal-overlay" onClick={() => setShowOperatorSelectModal(false)}>
          <div className="modal-content operator-select-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('isTeamBuilder.addOperator')}</h2>
              <button className="modal-close" onClick={() => setShowOperatorSelectModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <input
                type="text"
                placeholder={t('teamBuilder.searchOperators')}
                value={operatorSelectSearch}
                onChange={(e) => setOperatorSelectSearch(e.target.value)}
                className="operator-search-input"
              />
              <div className="operator-select-grid">
                {Object.values(allOperators)
                  .filter(op => {
                    // Exclude operators already in the team
                    if (selectedOperators.some(selected => selected.operatorId === op.id)) {
                      return false;
                    }

                    // Apply search filter
                    if (operatorSelectSearch) {
                      const displayName = getOperatorName(op, language);
                      const allNames = [
                        op.name,
                        op.cnName,
                        op.twName,
                        op.jpName,
                        op.krName
                      ].filter(Boolean).map(n => n!.toLowerCase());
                      const searchLower = operatorSelectSearch.toLowerCase();
                      return displayName.toLowerCase().includes(searchLower) ||
                        allNames.some(name => name.includes(searchLower));
                    }
                    return true;
                  })
                  .sort((a, b) => {
                    // Sort by rarity (higher first), then by name
                    if (a.rarity !== b.rarity) {
                      return b.rarity - a.rarity;
                    }
                    return getOperatorName(a, language).localeCompare(getOperatorName(b, language));
                  })
                  .map(op => (
                    <div
                      key={op.id}
                      className={`operator-select-card rarity-${op.rarity}`}
                      onClick={() => {
                        addOperator(op.id);
                        setShowOperatorSelectModal(false);
                        setOperatorSelectSearch('');
                      }}
                    >
                      <img
                        src={getImageUrl(op.profileImage || '/images/operators/placeholder.png')}
                        alt={getOperatorName(op, language)}
                        className="operator-select-image"
                      />
                      <div className="operator-select-name">{getOperatorName(op, language)}</div>
                      <Stars rarity={op.rarity} />
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Temporary Recruitment Modal */}
      {showTempRecruitmentModal && (
        <div className="modal-overlay" onClick={() => setShowTempRecruitmentModal(false)}>
          <div className="modal-content operator-select-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('isTeamBuilder.selectTempRecruitment')}</h2>
              <button className="modal-close" onClick={() => setShowTempRecruitmentModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <input
                type="text"
                placeholder={t('teamBuilder.searchOperators')}
                value={tempRecruitmentSearch}
                onChange={(e) => setTempRecruitmentSearch(e.target.value)}
                className="operator-search-input"
              />
              <div className="operator-select-grid">
                {Object.values(allOperators)
                  .filter(op => {
                    // Apply search filter
                    if (tempRecruitmentSearch) {
                      const displayName = getOperatorName(op, language);
                      const allNames = [
                        op.name,
                        op.cnName,
                        op.twName,
                        op.jpName,
                        op.krName
                      ].filter(Boolean).map(n => n!.toLowerCase());
                      const searchLower = tempRecruitmentSearch.toLowerCase();
                      return displayName.toLowerCase().includes(searchLower) ||
                        allNames.some(name => name.includes(searchLower));
                    }
                    return true;
                  })
                  .sort((a, b) => {
                    // Sort by rarity (higher first), then by name
                    if (a.rarity !== b.rarity) {
                      return b.rarity - a.rarity;
                    }
                    return getOperatorName(a, language).localeCompare(getOperatorName(b, language));
                  })
                  .map(op => (
                    <div
                      key={op.id}
                      className={`operator-select-card rarity-${op.rarity}`}
                      onClick={() => {
                        setTemporaryRecruitment(op.id);
                        setRecommendation(null); // Clear recommendation when temporary recruitment changes
                        setShowTempRecruitmentModal(false);
                        setTempRecruitmentSearch('');
                      }}
                    >
                      <img
                        src={getImageUrl(op.profileImage || '/images/operators/placeholder.png')}
                        alt={getOperatorName(op, language)}
                        className="operator-select-image"
                      />
                      <div className="operator-select-name">{getOperatorName(op, language)}</div>
                      <Stars rarity={op.rarity} />
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IntegratedStrategiesPage;