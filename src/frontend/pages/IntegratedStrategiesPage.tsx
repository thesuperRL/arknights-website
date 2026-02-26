import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTranslation } from '../translations/useTranslation';
import { getOperatorName } from '../utils/operatorNameUtils';
import { getRarityClass } from '../utils/rarityUtils';
import Stars from '../components/Stars';
import { apiFetch, getImageUrl } from '../api';
import { IS_TITLES, IS_SQUADS_BY_TITLE } from '../is-constants';
import { getPoolRawScore, type ISNicheWeightPools as ISNicheWeightPoolsShared } from '../../is-scoring';
import './IntegratedStrategiesPage.css';

interface TeamPreferences {
  requiredNiches: Record<string, { min: number; max: number }>;
  preferredNiches: Record<string, { min: number; max: number }>;
  rarityRanking?: number[];
  allowDuplicates?: boolean;
}

/** Re-export shared type for IS teambuilder; scoring uses getPoolRawScore from is-scoring. */
export type ISNicheWeightPools = ISNicheWeightPoolsShared;

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
  synergyScaleFactor: 1,
  firstRecruitPotentialMultiplier: 0
};

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
  synergyScaleFactor: number,
  i18n?: { t: (key: string) => string; interpolate: (tpl: string, vars: Record<string, string | number>) => string; getNicheName: (filename: string, fallback: string) => string }
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
      const labelKey = hasCore ? (candidateIsCore ? 'isTeamBuilder.synergyCoreLabel' : 'isTeamBuilder.synergyOptionalLabel') : 'isTeamBuilder.synergyOptionalLabel';
      const label = i18n ? i18n.t(labelKey) : (candidateIsCore && hasCore ? 'core ✓' : 'optional');
      const name = i18n ? i18n.getNicheName(synergy.filename, synergy.name) : synergy.name;
      if (i18n) {
        lines.push(i18n.interpolate(i18n.t('isTeamBuilder.synergyLineFormat'), { name, label, score: Math.round(synergyTotal) }));
      } else {
        lines.push(`Synergy "${synergy.name}": ${label} (+${Math.round(synergyTotal)})`);
      }
    }
  }
  return { score, lines };
}

// Local recommendation algorithm - ONLY considers raised/deployable operators
type I18nRecommendation = {
  t: (key: string) => string;
  interpolate: (template: string, vars: Record<string, string | number>) => string;
  translateClass: (className: string) => string;
  getNicheName: (filename: string, fallback: string) => string;
};

/** Hope cost config: IS id -> squad id (or "default") -> rarity "4"|"5"|"6" -> class (or "default") -> hope cost. */
type IsHopeCostsConfig = Record<string, Record<string, Record<string, Record<string, number>>>>;

const DEFAULT_HOPE_BY_RARITY: Record<number, number> = { 6: 6, 5: 3, 4: 0, 3: 0, 2: 0, 1: 0 };

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
  weightPools: ISNicheWeightPools = DEFAULT_WEIGHT_POOLS,
  allSynergies: SynergyForIS[] = [],
  i18n?: I18nRecommendation,
  hopeCostConfig?: { config: IsHopeCostsConfig | null; isId: string; squadId: string | null; autoPromoteClasses?: string[] },
  onlyGlobalOperators: boolean = true
): Promise<{ recommendedOperator: Operator | null; reasoning: string; score: number; isPromotion?: boolean; isAutoPromoteOnRecruit?: boolean }> {
  const t = i18n?.t ?? ((k: string) => k);
  const interpolate = i18n?.interpolate ?? ((tpl: string, vars: Record<string, string | number>) =>
    tpl.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? '')));
  const translateClass = i18n?.translateClass ?? ((c: string) => c);
  const getNicheName = i18n?.getNicheName ?? ((_filename: string, fallback: string) => fallback);
  const synergyI18n = i18n ? { t, interpolate, getNicheName } : undefined;

  const getHopeCostForOperator = (operator: Operator): number => {
    if (hopeCostConfig?.config && hopeCostConfig.isId && hopeCostConfig.config[hopeCostConfig.isId]) {
      const bySquad = hopeCostConfig.config[hopeCostConfig.isId];
      const squadKey = hopeCostConfig.squadId ?? 'default';
      const byRarity = bySquad[squadKey] ?? bySquad['default'];
      if (byRarity) {
        const r = operator.rarity || 1;
        const rarityKey = r >= 4 ? String(r) : '4';
        const byClass = byRarity[rarityKey] as Record<string, number> | undefined;
        if (byClass && typeof byClass === 'object') {
          const hope = byClass[operator.class ?? ''];
          if (hope !== undefined) return hope;
        }
      }
    }
    return hopeCosts?.[operator.rarity ?? 1] ?? DEFAULT_HOPE_BY_RARITY[operator.rarity ?? 1] ?? 0;
  };

  const getPromotionCostForOperator = (operator: Operator): number => {
    if (hopeCostConfig?.config && hopeCostConfig.isId && hopeCostConfig.config[hopeCostConfig.isId]) {
      const bySquad = hopeCostConfig.config[hopeCostConfig.isId];
      const squadKey = hopeCostConfig.squadId ?? 'default';
      const entry = bySquad[squadKey] ?? bySquad['default'];
      const prom = entry?.['promotionCost'] as Record<string, unknown> | undefined;
      if (prom && typeof prom === 'object') {
        const r = operator.rarity || 1;
        const rarityKey = r >= 4 ? String(r) : '4';
        const byRarity = prom[rarityKey];
        if (byRarity && typeof byRarity === 'object' && !Array.isArray(byRarity)) {
          const cost = (byRarity as Record<string, number>)[operator.class ?? ''];
          if (cost !== undefined) return cost;
        }
        const flat = prom as Record<string, number>;
        const cost = flat[operator.class ?? ''] ?? flat['default'];
        if (cost !== undefined) return cost;
      }
    }
    return 3;
  };

  const getHopeCost = (rarity: number): number => hopeCosts?.[rarity] ?? DEFAULT_HOPE_BY_RARITY[rarity] ?? 0;
  const getActualHopeCost = (operator: Operator): number => getHopeCostForOperator(operator);

  // Temporarily add the recruitment operator to raised operators (considered owned & raised)
  let effectiveRaisedOperators = [...raisedOperatorIds];
  if (temporaryRecruitment && allOperators[temporaryRecruitment]) {
    if (!effectiveRaisedOperators.includes(temporaryRecruitment)) {
      effectiveRaisedOperators.push(temporaryRecruitment);
    }
  }

  // ONLY use raised operators (user's deployable collection)
  let availableOperatorIds = effectiveRaisedOperators.filter(id => allOperators[id]);

  // Optionally restrict to globally released operators only
  if (onlyGlobalOperators) {
    availableOperatorIds = availableOperatorIds.filter(id => allOperators[id].global === true);
  }

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
        const actualPromotionCost = getPromotionCostForOperator(operator);
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
      const hopeCost = getHopeCostForOperator(operator);
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
  const autoPromoteClasses = hopeCostConfig?.autoPromoteClasses ?? [];
  const operatorScores: Array<{ operatorId: string; score: number; reasoning: string[]; isPromotion: boolean; isAutoPromoteOnRecruit: boolean }> = [];

  for (const operatorId of availableOperators) {
    const operator = allOperators[operatorId];
    if (!operator || !operator.niches) continue;

    let score = 0;
    const reasoning: string[] = [];

    // Determine if this is a first selection (recruit) or second (promotion)
    const selectionCount = selectionCounts.get(operatorId) || 0;
    const isPromotion = selectionCount === 1;
    // If this class is auto-promoted on recruitment, score them at max potential (E2/module) for first pick
    const isAutoPromoteOnRecruit = !isPromotion && autoPromoteClasses.includes(operator.class ?? '');

    // Tier-based scoring - VERY significant, should outweigh hope penalties
    // Include ALL niches the operator has (no exclusions); each uses pool rawScore and coverage factor
    const firstRecruitPotentialMultiplier = weightPools.firstRecruitPotentialMultiplier ?? 0;
    let totalPotentialBonus = 0; // First recruitment only: E2/module potential bonus (not used when isAutoPromoteOnRecruit)

    for (const niche of operator.niches) {
      const currentCount = nicheCounts[niche] || 0;

      // Get tier based on selection type (or auto-promote: first recruitment at max potential)
      let tier = 0;
      let tierName = '';
      
      if (isPromotion || isAutoPromoteOnRecruit) {
        // Promotion, or first recruitment with auto-promote class: use E2/module (max potential)
        tier = await getOperatorBestTierAtPromotionLevel(operatorId, niche);
        if (tier === 0) continue;
        tierName = getTierNameFromValue(tier);
      } else {
        // First recruitment (no auto-promote): level 0 tier + optional future potential bonus
        tier = await getOperatorTierInNicheAtLevel0(operatorId, niche);
        tierName = tier > 0 ? getTierNameFromValue(tier) : '';
      }

      const tierPoints = tier;

      if (niche === 'trash-operators') {
        const trashPenalty = 1000;
        score -= trashPenalty;
        reasoning.push(interpolate(t('isTeamBuilder.trashOperator'), { penalty: String(trashPenalty) }));
      } else {
        const rawScore = getPoolRawScore(niche, weightPools);
        const requiredRange = defaultPreferences.requiredNiches[niche];
        const preferredRange = defaultPreferences.preferredNiches[niche];
        let coverageFactor = 1;
        let labelKey = 'isTeamBuilder.providesNicheVariety';
        if (requiredRange) {
          if (currentCount < requiredRange.min) {
            coverageFactor = 1;
            labelKey = isPromotion ? 'isTeamBuilder.addsNewCapability' : 'isTeamBuilder.fillsMissingRequiredNiche';
          } else if (currentCount < requiredRange.max) {
            coverageFactor = 0.5;
            labelKey = isPromotion ? 'isTeamBuilder.enhancesCapability' : 'isTeamBuilder.strengthensRequiredNiche';
          } else {
            coverageFactor = 0.25;
            labelKey = isPromotion ? 'isTeamBuilder.addsOverSpecialization' : 'isTeamBuilder.overSpecializesIn';
          }
        } else if (preferredRange) {
          if (currentCount < preferredRange.min) {
            coverageFactor = 1;
            labelKey = isPromotion ? 'isTeamBuilder.addsNewCapability' : 'isTeamBuilder.fillsMissingPreferredNiche';
          } else if (currentCount < preferredRange.max) {
            coverageFactor = 0.5;
            labelKey = isPromotion ? 'isTeamBuilder.enhancesCapability' : 'isTeamBuilder.strengthensPreferredNiche';
          } else {
            coverageFactor = 0.25;
            labelKey = isPromotion ? 'isTeamBuilder.addsOverSpecialization' : 'isTeamBuilder.overSpecializesIn';
          }
        }
        const bonus = tierPoints * rawScore * coverageFactor;
        score += bonus;
        if (tier > 0) {
          reasoning.push(interpolate(t('isTeamBuilder.reasoningLineFormat'), {
            label: t(labelKey),
            niche,
            tier: tierName,
            bonus: Math.round(bonus)
          }));
        }

        // First recruitment only (and not auto-promote): add a small multiplier of E2/module potential
        if (!isPromotion && !isAutoPromoteOnRecruit && firstRecruitPotentialMultiplier > 0) {
          const fullPotentialTier = await getOperatorBestTierAtPromotionLevel(operatorId, niche);
          if (fullPotentialTier > 0) {
            totalPotentialBonus += fullPotentialTier * rawScore * coverageFactor * firstRecruitPotentialMultiplier;
          }
        }
      }
    }

    if (!isPromotion && !isAutoPromoteOnRecruit && totalPotentialBonus > 0) {
      score += totalPotentialBonus;
      reasoning.push(interpolate(t('isTeamBuilder.futurePotentialBonus'), { bonus: Math.round(totalPotentialBonus) }));
    }

    // Apply hope cost penalty
    // For promotions (second selection), use configured promotion cost per class
    // For first selection (recruit), use normal rarity-based hope cost
    let hopeCost: number;
    if (isPromotion) {
      hopeCost = getPromotionCostForOperator(operator);
      reasoning.push(t('isTeamBuilder.thisIsPromotion'));
    } else {
      hopeCost = getActualHopeCost(operator);
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
      const hopePenalty = hopeCost * 6; // Large multiplier to make hope cost very significant
      score -= hopePenalty;
      reasoning.push(interpolate(t('isTeamBuilder.hopeCostPenalty'), { hope: String(hopeCost), penalty: String(hopePenalty) }));
    } else {
      reasoning.push(t('isTeamBuilder.temporaryRecruitmentNoPenalty'));
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
        synergyScaleFactor,
        synergyI18n
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
      isPromotion,
      isAutoPromoteOnRecruit
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
        const hopeCost = getHopeCostForOperator(operator);
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
  const isAutoPromoteOnRecruit = bestOperator.isAutoPromoteOnRecruit || false;

  // Create detailed reasoning with better formatting (translated)
  const classTextTranslated = requiredClasses.length === 1
    ? translateClass(requiredClasses[0])
    : `${requiredClasses.slice(0, -1).map(c => translateClass(c)).join(', ')} or ${translateClass(requiredClasses[requiredClasses.length - 1]!)}`;

  const recommendedHeader = isPromotion
    ? interpolate(t('isTeamBuilder.recommendedPromotion'), { class: classTextTranslated })
    : interpolate(t('isTeamBuilder.recommendedRecruitment'), { class: classTextTranslated });
  const actualPromotionCost = getPromotionCostForOperator(operator);
  const reasoningParts = [
    `**${recommendedHeader}**`,
    '',
    ...(isPromotion ? [
      `**${t('isTeamBuilder.thisIsPromotion')}**`,
      `**${interpolate(t('isTeamBuilder.costHope'), { cost: actualPromotionCost })}**`,
      `**${t('isTeamBuilder.addsNewTiers')}**`,
      ''
    ] : []),
    ...(isAutoPromoteOnRecruit ? [
      `**${t('isTeamBuilder.autoPromoteOnRecruit')}**`,
      ''
    ] : []),
    ...(temporaryRecruitment ? [
      `**${interpolate(t('isTeamBuilder.temporaryRecruitmentConsidered'), { name: allOperators[temporaryRecruitment]?.name || 'Unknown Operator' })}**`,
      ''
    ] : []),
    `**${t('isTeamBuilder.scoringBreakdown')}**`,
    ...bestOperator.reasoning.map(line => `- ${line}`),
    '',
    `**${interpolate(t('isTeamBuilder.finalScoreLabel'), { score: bestOperator.score })}**`,
    '',
    isPromotion
      ? `*${t('isTeamBuilder.conclusionPromotion')}*`
      : `*${t('isTeamBuilder.conclusionRecruitment')}*`
  ];

  return {
    recommendedOperator: operator,
    reasoning: reasoningParts.join('\n'),
    score: bestOperator.score,
    isPromotion: isPromotion,
    isAutoPromoteOnRecruit: isAutoPromoteOnRecruit
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
  isAutoPromoteOnRecruit?: boolean; // True if this class is auto-promoted on first recruitment (scored at max potential)
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
  const { t, translateClass, interpolate, getNicheName } = useTranslation();

  const [allOperators, setAllOperators] = useState<Record<string, Operator>>({});
  const [ownedOperators, setOwnedOperators] = useState<Set<string>>(new Set());
  const [raisedOperators, setRaisedOperators] = useState<Set<string>>(new Set());
  const [originalRaisedOperators, setOriginalRaisedOperators] = useState<Set<string>>(new Set());
  const [allClassesAvailable, setAllClassesAvailable] = useState<boolean>(false);
  /** When true, add-all and recommendations only consider globally released operators. Default on. */
  const [onlyGlobalOperators, setOnlyGlobalOperators] = useState<boolean>(true);
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
  // Hope and promotion costs come from config (is-hope-costs.json) only; no user editing
  const [trashOperators, setTrashOperators] = useState<Set<string>>(new Set());
  const [preferences, setPreferences] = useState<TeamPreferences | null>(null);
  const [weightPoolsConfig, setWeightPoolsConfig] = useState<ISNicheWeightPools>(DEFAULT_WEIGHT_POOLS);
  const [allSynergies, setAllSynergies] = useState<SynergyForIS[]>([]);
  const [teamSize, setTeamSize] = useState<number>(8);
  const [optimalTeam, setOptimalTeam] = useState<Set<string>>(new Set());
  const [isInitialLoad, setIsInitialLoad] = useState<boolean>(true);
  const [selectedISTitleId, setSelectedISTitleId] = useState<string>(IS_TITLES[0].id);
  /** At most one squad selected; null = none. Only shown for titles that have squads (e.g. IS6). */
  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null);
  const [isHopeCostsConfig, setIsHopeCostsConfig] = useState<IsHopeCostsConfig | null>(null);
  const [squadRecommendationLoading, setSquadRecommendationLoading] = useState(false);
  const [squadRecommendation, setSquadRecommendation] = useState<{
    top12AvgByClass: Record<string, number>;
    recommendedSquad: { isId: string; squadId: string; reason: string } | null;
  } | null>(null);

  const getHopeCostForOperator = (operator: Operator): number => {
    if (isHopeCostsConfig && selectedISTitleId && isHopeCostsConfig[selectedISTitleId]) {
      const bySquad = isHopeCostsConfig[selectedISTitleId];
      const squadKey = selectedSquadId ?? 'default';
      const byRarity = bySquad[squadKey] ?? bySquad['default'];
      if (byRarity) {
        const r = operator.rarity || 1;
        const rarityKey = r >= 4 ? String(r) : '4';
        const byClass = byRarity[rarityKey] as Record<string, number> | undefined;
        if (byClass && typeof byClass === 'object') {
          const hope = byClass[operator.class ?? ''];
          if (hope !== undefined) return hope;
        }
      }
    }
    return DEFAULT_HOPE_BY_RARITY[operator.rarity ?? 1] ?? 0;
  };

  const getPromotionCostForOperator = (operator: Operator): number => {
    if (isHopeCostsConfig && selectedISTitleId && isHopeCostsConfig[selectedISTitleId]) {
      const bySquad = isHopeCostsConfig[selectedISTitleId];
      const squadKey = selectedSquadId ?? 'default';
      const entry = bySquad[squadKey] ?? bySquad['default'];
      const prom = entry?.['promotionCost'] as Record<string, unknown> | undefined;
      if (prom && typeof prom === 'object') {
        const r = operator.rarity || 1;
        const rarityKey = r >= 4 ? String(r) : '4';
        const byRarity = prom[rarityKey];
        if (byRarity && typeof byRarity === 'object' && !Array.isArray(byRarity)) {
          const cost = (byRarity as Record<string, number>)[operator.class ?? ''];
          if (cost !== undefined) return cost;
        }
        const flat = prom as Record<string, number>;
        const cost = flat[operator.class ?? ''] ?? flat['default'];
        if (cost !== undefined) return cost;
      }
    }
    return 3;
  };

  const effectiveHopeByRarity = (): Record<number, number> => {
    if (isHopeCostsConfig && selectedISTitleId && isHopeCostsConfig[selectedISTitleId]) {
      const bySquad = isHopeCostsConfig[selectedISTitleId];
      const squadKey = selectedSquadId ?? 'default';
      const byRarity = bySquad[squadKey] ?? bySquad['default'];
      if (byRarity) {
        const firstVal = (r: Record<string, number> | undefined, fallback: number) =>
          (r && typeof r === 'object' ? (Object.values(r).find((v): v is number => typeof v === 'number') ?? fallback) : fallback);
        return {
          6: firstVal(byRarity['6'] as Record<string, number> | undefined, 6),
          5: firstVal(byRarity['5'] as Record<string, number> | undefined, 3),
          4: firstVal(byRarity['4'] as Record<string, number> | undefined, 0),
          3: 0,
          2: 0,
          1: 0
        };
      }
    }
    return { ...DEFAULT_HOPE_BY_RARITY };
  };

  const getHopeCost = (rarity: number): number => effectiveHopeByRarity()[rarity] ?? 0;

  const getAutoPromoteClasses = (): string[] => {
    if (!isHopeCostsConfig || !selectedISTitleId || !isHopeCostsConfig[selectedISTitleId]) return [];
    const bySquad = isHopeCostsConfig[selectedISTitleId];
    const squadKey = selectedSquadId ?? 'default';
    const entry = bySquad[squadKey] ?? bySquad['default'];
    const arr = (entry as Record<string, unknown>)?.['autoPromoteClasses'];
    return Array.isArray(arr) ? arr.filter((c): c is string => typeof c === 'string') : [];
  };

  /** For a map class -> cost, return the mode (most common value) and list of { class, cost } that differ from mode. */
  const modeAndDiffs = (byClass: Record<string, number> | undefined): { mode: number; diffs: Array<{ class: string; cost: number }> } => {
    if (!byClass || typeof byClass !== 'object') return { mode: 0, diffs: [] };
    const counts: Record<number, number> = {};
    for (const v of Object.values(byClass)) {
      if (typeof v === 'number') counts[v] = (counts[v] ?? 0) + 1;
    }
    const mode = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] != null)
      ? Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0])
      : 0;
    const diffs = Object.entries(byClass)
      .filter(([, cost]) => typeof cost === 'number' && cost !== mode)
      .map(([cls, cost]) => ({ class: cls, cost: cost as number }));
    return { mode, diffs };
  };

  /** Per-rarity display: default recruit cost, classes that differ; default promotion cost, classes that differ. */
  const getHopeDisplayForRarity = (rarity: 4 | 5 | 6): {
    defaultRecruit: number;
    recruitDiffs: Array<{ class: string; cost: number }>;
    defaultPromo: number;
    promoDiffs: Array<{ class: string; cost: number }>;
  } => {
    const defaultRecruitByRarity: Record<number, number> = { 4: 0, 5: 3, 6: 6 };
    const defaultPromo = 3;
    if (!isHopeCostsConfig || !selectedISTitleId || !isHopeCostsConfig[selectedISTitleId]) {
      return {
        defaultRecruit: defaultRecruitByRarity[rarity],
        recruitDiffs: [],
        defaultPromo,
        promoDiffs: []
      };
    }
    const bySquad = isHopeCostsConfig[selectedISTitleId];
    const squadKey = selectedSquadId ?? 'default';
    const entry = (bySquad[squadKey] ?? bySquad['default']) as Record<string, unknown> | undefined;
    if (!entry) {
      return {
        defaultRecruit: defaultRecruitByRarity[rarity],
        recruitDiffs: [],
        defaultPromo,
        promoDiffs: []
      };
    }
    const r = String(rarity);
    const recruitByClass = entry[r] as Record<string, number> | undefined;
    const recruit = modeAndDiffs(recruitByClass);
    const promEntry = entry.promotionCost as Record<string, Record<string, number>> | undefined;
    const promoByClass = promEntry?.[r];
    const promo = modeAndDiffs(promoByClass);
    const effectiveRecruit = (recruitByClass && Object.keys(recruitByClass).length > 0)
      ? recruit.mode
      : defaultRecruitByRarity[rarity];
    const effectivePromo = (promoByClass && Object.keys(promoByClass).length > 0)
      ? promo.mode
      : defaultPromo;
    return {
      defaultRecruit: effectiveRecruit,
      recruitDiffs: recruit.diffs,
      defaultPromo: effectivePromo,
      promoDiffs: promo.diffs
    };
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
  }, [selectedOperators, currentHope, teamSize, user, allOperators, isInitialLoad]);

  // Fetch squad recommendation when user is logged in and IS has squads (one request per IS; minimal backend load)
  // Use user?.email so we don't refetch when the user object reference changes (e.g. auth context re-render)
  const userKey = user?.email ?? null;
  useEffect(() => {
    if (!userKey || !IS_SQUADS_BY_TITLE[selectedISTitleId]) {
      setSquadRecommendation(null);
      return;
    }
    let cancelled = false;
    setSquadRecommendationLoading(true);
    setSquadRecommendation(null);
    apiFetch(`/api/integrated-strategies/squad-recommendation?isId=${encodeURIComponent(selectedISTitleId)}`)
      .then((res) => {
        if (cancelled || !res.ok) return res.json().catch(() => ({}));
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setSquadRecommendation({
          top12AvgByClass: data.top12AvgByClass ?? {},
          recommendedSquad: data.recommendedSquad ?? null
        });
      })
      .catch(() => {
        if (!cancelled) setSquadRecommendation(null);
      })
      .finally(() => {
        if (!cancelled) setSquadRecommendationLoading(false);
      });
    return () => { cancelled = true; };
  }, [userKey, selectedISTitleId]);

  const loadPreferences = async () => {
    try {
      const hopeCostsUrl = user ? '/api/integrated-strategies/config' : '/api/config/is-hope-costs';
      const [prefsResponse, weightResponse, hopeCostsResponse] = await Promise.all([
        apiFetch('/api/team/preferences'),
        apiFetch('/api/config/is-niche-weight-pools'),
        apiFetch(hopeCostsUrl)
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
        const pools = {
          important: weightData.important ?? DEFAULT_WEIGHT_POOLS.important,
          optional: weightData.optional ?? DEFAULT_WEIGHT_POOLS.optional,
          good: weightData.good ?? DEFAULT_WEIGHT_POOLS.good,
          synergyCoreBonus: weightData.synergyCoreBonus ?? DEFAULT_WEIGHT_POOLS.synergyCoreBonus ?? 15,
          synergyScaleFactor: weightData.synergyScaleFactor ?? DEFAULT_WEIGHT_POOLS.synergyScaleFactor ?? 1,
          firstRecruitPotentialMultiplier: weightData.firstRecruitPotentialMultiplier ?? DEFAULT_WEIGHT_POOLS.firstRecruitPotentialMultiplier ?? 0
        };
        setWeightPoolsConfig(pools);
        console.log('[IS Team Builder] Weight pools loaded:', pools);
      }
      if (hopeCostsResponse.ok) {
        const hopeData = await hopeCostsResponse.json();
        setIsHopeCostsConfig(Object.keys(hopeData).length > 0 ? hopeData : null);
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
          if (loadOnlyHope) {
            if (data.currentHope !== undefined) setCurrentHope(data.currentHope);
            return;
          }
          
          // Restore everything (hope, costs, and operators)
          if (data.currentHope !== undefined) {
            setCurrentHope(data.currentHope);
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

  const addOperator = async (operatorId: string, isPromotion: boolean = false, fromRecommendation: boolean = false, isAutoPromoteOnRecruit: boolean = false) => {
    const operator = allOperators[operatorId];
    if (!operator) return;

    // Calculate hope cost if this is from a recommendation (always recruit cost for first add; promotion cost only when explicitly promoting)
    let hopeCostToDeduct = 0;
    if (fromRecommendation) {
      if (isPromotion) {
        hopeCostToDeduct = getPromotionCostForOperator(operator);
      } else {
        hopeCostToDeduct = getHopeCostForOperator(operator);
      }
    }

    const autoPromote = isAutoPromoteOnRecruit || (!isPromotion && getAutoPromoteClasses().includes(operator.class ?? ''));

    setSelectedOperators(prev => {
      const existing = prev.find(s => s.operatorId === operatorId);
      
      if (existing) {
        // Operator already selected
        if (existing.selectionCount === 1 && isPromotion) {
          // Promotion: second selection (user clicked Promote)
          return prev.map(s => 
            s.operatorId === operatorId 
              ? { ...s, selectionCount: 2 }
              : s
          );
        }
        return prev;
      } else {
        // First selection (recruit): use selectionCount 2 if this class is auto-promoted on recruitment
        return [...prev, { operatorId, operator, selectionCount: autoPromote ? 2 : 1 }];
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
          undefined,
          trashOperators,
          teamSize,
          weightPoolsConfig,
          allSynergies,
          { t, interpolate, translateClass, getNicheName },
          { config: isHopeCostsConfig, isId: selectedISTitleId, squadId: selectedSquadId, autoPromoteClasses: getAutoPromoteClasses() },
          onlyGlobalOperators
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
      <div className="is-title-selection" aria-label={t('isTeamBuilder.selectTitle')}>
        {IS_TITLES.map((title) => (
          <button
            key={title.id}
            type="button"
            className={`is-title-option ${selectedISTitleId === title.id ? 'selected' : ''}`}
            onClick={() => {
              setSelectedISTitleId(title.id);
              setSelectedSquadId(null);
            }}
            title={title.label}
            aria-pressed={selectedISTitleId === title.id}
          >
            <img src={getImageUrl(title.image)} alt={title.label} />
          </button>
        ))}
      </div>
      {IS_SQUADS_BY_TITLE[selectedISTitleId] && (
        <>
          {squadRecommendationLoading && (
            <div className="squad-recommendation-loading" role="progressbar" aria-label={t('isTeamBuilder.squadRecommendationLoading')}>
              <div className="squad-recommendation-loading-bar" />
            </div>
          )}
          <div className="is-squad-selection" aria-label={t('isTeamBuilder.selectSquad')}>
            {(() => {
              const recommendedSquadId = squadRecommendation?.recommendedSquad && !squadRecommendationLoading ? squadRecommendation.recommendedSquad.squadId : null;
              const isRecommendedNone = recommendedSquadId === 'default';
              return (
                <>
                  <div className={`squad-option-cell ${isRecommendedNone ? 'squad-option-cell-recommended' : ''}`}>
                    <button
                      type="button"
                      className={`is-squad-option ${selectedSquadId === null ? 'selected' : ''}`}
                      onClick={() => setSelectedSquadId(null)}
                      title={t('isTeamBuilder.noSquad')}
                      aria-pressed={selectedSquadId === null}
                    >
                      <span className="is-squad-option-label">{t('isTeamBuilder.noSquad')}</span>
                    </button>
                  </div>
                  {IS_SQUADS_BY_TITLE[selectedISTitleId].map((squad) => {
                    const isRecommended = recommendedSquadId === squad.id;
                    return (
                      <div key={squad.id} className={`squad-option-cell ${isRecommended ? 'squad-option-cell-recommended' : ''}`}>
                        <button
                          type="button"
                          className={`is-squad-option ${selectedSquadId === squad.id ? 'selected' : ''}`}
                          onClick={() => setSelectedSquadId(selectedSquadId === squad.id ? null : squad.id)}
                          title={squad.label}
                          aria-pressed={selectedSquadId === squad.id}
                        >
                          <img src={getImageUrl(squad.image)} alt={squad.label} />
                        </button>
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>
        </>
      )}
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
            {([6, 5, 4] as const).map(r => {
              const { defaultRecruit, recruitDiffs, defaultPromo, promoDiffs } = getHopeDisplayForRarity(r);
              const stars = '★'.repeat(r);
              return (
                <div key={r} className="hope-requirement hope-requirement-row">
                  <span className="hope-stars">{stars}</span>
                  <span className="hope-cost hope-cost-block">
                    <span className="hope-cost-label">{t('isTeamBuilder.recruitLabel')}:</span>
                    <span className="hope-cost-value">
                      {defaultRecruit} {t('isTeamBuilder.hope')}
                      {recruitDiffs.length > 0 && (
                        <span className="hope-cost-diffs">
                          {' '}({recruitDiffs.map(d => `${translateClass(d.class)} ${d.cost}`).join(', ')})
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="hope-cost hope-cost-block">
                    <span className="hope-cost-label">{t('isTeamBuilder.promotionCost')}:</span>
                    <span className="hope-cost-value">
                      {defaultPromo} {t('isTeamBuilder.hope')}
                      {promoDiffs.length > 0 && (
                        <span className="hope-cost-diffs">
                          {' '}({promoDiffs.map(d => `${translateClass(d.class)} ${d.cost}`).join(', ')})
                        </span>
                      )}
                    </span>
                  </span>
                </div>
              );
            })}
            <div className="hope-requirement">
              <span className="hope-stars">{t('isTeamBuilder.starsAndBelow')}</span>
              <span className="hope-cost">0 {t('isTeamBuilder.hope')}</span>
            </div>
            <div className="hope-requirement">
              <span className="hope-stars">{t('isTeamBuilder.tempRecruitment')}</span>
              <span className="hope-cost">0 {t('isTeamBuilder.hope')}</span>
            </div>
          </div>
          {getAutoPromoteClasses().length > 0 && (
            <p className="hope-autopromote-line">
              {t('isTeamBuilder.autoPromoteClassesLabel')}: {getAutoPromoteClasses().map(c => translateClass(c)).join(', ')}
            </p>
          )}
        </div>
        <div className="hope-cost-footer">
          <span className="hope-cost-source">{t('isTeamBuilder.hopeCostFromConfig')}</span>
          {user && (
            <Link to="/integrated-strategies/settings" className="hope-settings-btn">
              {t('isTeamBuilder.hopePromotionSettings')}
            </Link>
          )}
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
                <label className="toggle-container" title={t('isTeamBuilder.onlyGlobalOperatorsTitle')}>
                  <input
                    type="checkbox"
                    checked={onlyGlobalOperators}
                    onChange={(e) => {
                      setOnlyGlobalOperators(e.target.checked);
                      setRecommendation(null);
                    }}
                    className="toggle-checkbox"
                  />
                  <span className="toggle-slider"></span>
                  <span className="toggle-label">{t('isTeamBuilder.onlyGlobalOperators')}</span>
                </label>
              </div>
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
                        
                        // Add all operators of the required classes to raised operators (optionally global-only)
                        const classArray = Array.from(requiredClasses);
                        const operatorsToAdd = Object.keys(allOperators).filter(id => {
                          const operator = allOperators[id];
                          if (!operator || !classArray.includes(operator.class)) return false;
                          if (onlyGlobalOperators && !operator.global) return false;
                          return true;
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
                      {t('isTeamBuilder.hopeCost')}: {getHopeCostForOperator(recommendation.recommendedOperator)}
                    </div>
                  </div>
                </div>

                <div className="recommendation-actions">
                  <button
                    onClick={() => {
                      addOperator(recommendation.recommendedOperator!.id, recommendation.isPromotion || false, true, recommendation.isAutoPromoteOnRecruit || false);
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

      {import.meta.env.DEV && (
        <p style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
          <Link to="/config/is-niche-weights" style={{ color: 'var(--text-muted)' }}>Dev: IS niche weight pools</Link>
          {' · '}
          <Link to="/config/is-hope-costs" style={{ color: 'var(--text-muted)' }}>Dev: IS hope &amp; promotion costs</Link>
        </p>
      )}

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