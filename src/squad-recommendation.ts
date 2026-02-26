/**
 * Squad recommendation: pick top 2N per IS class pair (N from each class) by best team score (niches in combination),
 * then score squads by hope costs and autopromote.
 */

import type { OperatorsData } from './data-cache';
import { getIsNicheWeightPools } from './data-cache';
import { getPoolRawScore, type ISNicheWeightPools } from './is-scoring';
import { getNichesForOperator } from './niche-list-utils';
import { getOperatorTierInNiche } from './team-builder';

const CLASSES = ['Vanguard', 'Guard', 'Defender', 'Sniper', 'Caster', 'Medic', 'Supporter', 'Specialist'];
/** IS groups: (Vanguard, Guard), (Defender, Supporter), (Sniper, Medic), (Caster, Specialist). */
const CLASS_PAIRS: [string, string][] = [
  ['Vanguard', 'Guard'],
  ['Defender', 'Supporter'],
  ['Sniper', 'Medic'],
  ['Caster', 'Specialist'],
];
const TOP_N_PER_CLASS = 3;
const TRASH_NICHE_PENALTY = 1000;

function getAllWeightPoolNiches(weightPools: ISNicheWeightPools): string[] {
  const set = new Set<string>();
  for (const pool of [weightPools.important, weightPools.optional, weightPools.good]) {
    for (const n of pool?.niches ?? []) set.add(n);
  }
  return [...set];
}

/**
 * Team score: niches in combination. For each niche, use the best tier in the team (not sum).
 * So a second operator covering the same niche doesn't double-count.
 */
function computeTeamScore(
  teamIds: string[],
  weightPools: ISNicheWeightPools,
  getTier: (operatorId: string, niche: string) => number
): number {
  const niches = getAllWeightPoolNiches(weightPools);
  let score = 0;
  for (const niche of niches) {
    let maxTier = 0;
    for (const id of teamIds) {
      const t = getTier(id, niche);
      if (t > maxTier) maxTier = t;
    }
    score += maxTier * getPoolRawScore(niche, weightPools);
  }
  for (const id of teamIds) {
    if (getNichesForOperator(id).includes('trash-operators')) score -= TRASH_NICHE_PENALTY;
  }
  return score;
}

/**
 * Greedy: add up to n operators from candidateIds to existingTeam; each step adds the one that maximizes team score.
 */
function greedyAddToTeam(
  candidateIds: string[],
  n: number,
  existingTeam: string[],
  weightPools: ISNicheWeightPools,
  getTier: (operatorId: string, niche: string) => number
): string[] {
  const team = [...existingTeam];
  const remaining = new Set(candidateIds.filter((id) => !team.includes(id)));
  for (let i = 0; i < n && remaining.size > 0; i++) {
    let bestId: string | null = null;
    let bestScore = -Infinity;
    for (const id of remaining) {
      const nextTeam = [...team, id];
      const s = computeTeamScore(nextTeam, weightPools, getTier);
      if (s > bestScore) {
        bestScore = s;
        bestId = id;
      }
    }
    if (bestId === null) break;
    team.push(bestId);
    remaining.delete(bestId);
  }
  return team;
}

/**
 * Best team of 2n from a pair: n from classA, n from classB. Tries both orders (A then B, B then A), returns higher score.
 */
function selectBestPairTeam(
  candidatesA: string[],
  candidatesB: string[],
  n: number,
  weightPools: ISNicheWeightPools,
  getTier: (operatorId: string, niche: string) => number
): { team: string[]; teamA: string[]; teamB: string[]; score: number } {
  const nA = Math.min(n, candidatesA.length);
  const nB = Math.min(n, candidatesB.length);
  if (nA === 0 && nB === 0) return { team: [], teamA: [], teamB: [], score: 0 };

  // Order A then B: greedy n from A, then greedy n from B
  const teamAB = greedyAddToTeam(candidatesB, nB, greedyAddToTeam(candidatesA, nA, [], weightPools, getTier), weightPools, getTier);
  const scoreAB = computeTeamScore(teamAB, weightPools, getTier);
  const teamA1 = teamAB.filter((id) => candidatesA.includes(id));
  const teamB1 = teamAB.filter((id) => candidatesB.includes(id));

  // Order B then A: greedy n from B, then greedy n from A
  const teamBA = greedyAddToTeam(candidatesA, nA, greedyAddToTeam(candidatesB, nB, [], weightPools, getTier), weightPools, getTier);
  const scoreBA = computeTeamScore(teamBA, weightPools, getTier);
  const teamA2 = teamBA.filter((id) => candidatesA.includes(id));
  const teamB2 = teamBA.filter((id) => candidatesB.includes(id));

  if (scoreAB >= scoreBA) {
    return { team: teamAB, teamA: teamA1, teamB: teamB1, score: scoreAB };
  }
  return { team: teamBA, teamA: teamA2, teamB: teamB2, score: scoreBA };
}

export interface SquadRecommendationResult {
  top12AvgByClass: Record<string, number>;
  recommendedSquad: { isId: string; squadId: string; reason: string } | null;
}

/**
 * For each IS class pair, pick the best team of 2N (N from each class) by combined team score (niches in combination).
 * Assign (team score / 2N) to both classes in the pair.
 */
export function computeTop12AvgByClass(
  ownedOperatorIds: string[],
  _wantToUseIds: string[],
  operatorsData: OperatorsData
): Record<string, number> {
  const weightPools = getIsNicheWeightPools();
  const getTier = (operatorId: string, niche: string) => getOperatorTierInNiche(operatorId, niche, true);

  const byClass: Record<string, string[]> = {};
  for (const cls of CLASSES) byClass[cls] = [];

  for (const id of ownedOperatorIds) {
    const op = operatorsData[id];
    if (!op || typeof op !== 'object') continue;
    const cls = op.class as string | undefined;
    if (!cls || !CLASSES.includes(cls)) continue;
    byClass[cls].push(id);
  }

  const result: Record<string, number> = {};
  const topByClass: Record<string, string[]> = {};
  for (const [classA, classB] of CLASS_PAIRS) {
    const candidatesA = byClass[classA] ?? [];
    const candidatesB = byClass[classB] ?? [];
    const { team, teamA, teamB, score } = selectBestPairTeam(
      candidatesA,
      candidatesB,
      TOP_N_PER_CLASS,
      weightPools,
      getTier
    );
    const avg = team.length > 0 ? score / team.length : 0;
    result[classA] = avg;
    result[classB] = avg;
    topByClass[classA] = teamA;
    topByClass[classB] = teamB;
  }
  console.log('[squad-recommendation] avg per class (pair team score / 2N, niches in combination):', result);
  console.log('[squad-recommendation] top', TOP_N_PER_CLASS, 'per class in each pair (codes):', topByClass);
  return result;
}

/**
 * Score a squad entry: higher = better fit. Uses 6★ recruit hope and autopromote.
 * Benefit: strong classes with low hope or autopromote score higher.
 */
function scoreSquadEntry(
  entry: Record<string, unknown> | undefined,
  top12AvgByClass: Record<string, number>
): { score: number; reasonParts: string[] } {
  if (!entry || typeof entry !== 'object') return { score: 0, reasonParts: [] };
  const hope6 = (entry['6'] as Record<string, number> | undefined) ?? {};
  const autoPromoteClasses = (entry.autoPromoteClasses as string[] | undefined) ?? [];
  const autoSet = new Set(autoPromoteClasses);
  let score = 0;
  const lowHopeClasses: string[] = [];
  const autopromoteStrong: string[] = [];
  for (const cls of CLASSES) {
    const strength = top12AvgByClass[cls] ?? 0;
    if (strength <= 0) continue;
    const cost = typeof hope6[cls] === 'number' ? hope6[cls] : 6;
    const benefit = (6 - cost) * 0.5 + (autoSet.has(cls) ? 1.5 : 0);
    score += strength * benefit;
    if (cost < 6 && strength >= 3) lowHopeClasses.push(cls);
    if (autoSet.has(cls) && strength >= 3) autopromoteStrong.push(cls);
  }
  const reasonParts: string[] = [];
  if (autopromoteStrong.length > 0) reasonParts.push(`autopromotes ${autopromoteStrong.join(', ')}`);
  if (lowHopeClasses.length > 0) reasonParts.push(`lower hope for ${lowHopeClasses.join(', ')}`);
  const reason = reasonParts.length > 0 ? reasonParts.join('; ') : 'best fit for your roster';
  return { score, reasonParts: [reason] };
}

/**
 * Given merged hope config and top12AvgByClass for the user, pick the best squad for the given IS.
 */
export function recommendSquadForIS(
  isId: string,
  mergedConfig: Record<string, Record<string, Record<string, unknown>>>,
  top12AvgByClass: Record<string, number>
): { squadId: string; reason: string } | null {
  const squads = mergedConfig[isId];
  if (!squads || typeof squads !== 'object') return null;
  const squadIds = Object.keys(squads);
  if (squadIds.length === 0) return null;
  let best: { squadId: string; score: number; reason: string } | null = null;
  for (const squadId of squadIds) {
    const entry = squads[squadId];
    const { score, reasonParts } = scoreSquadEntry(entry as Record<string, unknown>, top12AvgByClass);
    const reason = reasonParts[0] ?? 'best fit for your roster';
    if (best === null || score > best.score) {
      best = { squadId, score, reason };
    }
  }
  return best ? { squadId: best.squadId, reason: best.reason } : null;
}
