/**
 * Shared IS teambuilder scoring: weight pools and tier×rawScore formula.
 * Used by IntegratedStrategiesPage (frontend) and squad-recommendation (backend) so both call the same logic.
 */

export interface ISNicheWeightPools {
  important?: { rawScore: number; niches: string[] };
  optional?: { rawScore: number; niches: string[] };
  good?: { rawScore: number; niches: string[] };
  synergyCoreBonus?: number;
  synergyScaleFactor?: number;
  firstRecruitPotentialMultiplier?: number;
}

/**
 * Raw score for a niche from weight pools (important > optional > good). Same as IS teambuilder.
 */
export function getPoolRawScore(niche: string, weightPools: ISNicheWeightPools): number {
  const important = weightPools.important ?? { rawScore: 5, niches: [] };
  const optional = weightPools.optional ?? { rawScore: 2, niches: [] };
  const good = weightPools.good ?? { rawScore: 0.5, niches: [] };
  if (important.niches?.includes(niche)) return important.rawScore;
  if (optional.niches?.includes(niche)) return optional.rawScore;
  return good.rawScore;
}

const TRASH_NICHE_PENALTY = 1000;
const WANT_TO_USE_BONUS = 50;

/**
 * Standalone IS teambuilder-style score for one operator (no team/synergy/hope).
 * Sum of tier×rawScore per niche + wantToUse bonus; same formula as teambuilder.
 * getNiches and getTier are injected so this module has no Node/frontend deps.
 */
export function computeOperatorISScoreStandalone(
  operatorId: string,
  wantToUse: boolean,
  weightPools: ISNicheWeightPools,
  getNiches: (operatorId: string) => string[],
  getTier: (operatorId: string, niche: string) => number
): number {
  const niches = getNiches(operatorId);
  let score = 0;
  for (const niche of niches) {
    if (niche === 'trash-operators') {
      score -= TRASH_NICHE_PENALTY;
      continue;
    }
    const tier = getTier(operatorId, niche);
    const rawScore = getPoolRawScore(niche, weightPools);
    score += tier * rawScore;
  }
  if (wantToUse) score += WANT_TO_USE_BONUS;
  return score;
}
