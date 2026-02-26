/**
 * Squad recommendation: average IS teambuilder score of user's top 6 per class, then score squads
 * by hope costs and autopromote. No extra DB: uses one account fetch + in-memory operators and hope config.
 */

import type { OperatorsData } from './data-cache';
import { getIsNicheWeightPools } from './data-cache';
import { computeOperatorISScoreStandalone } from './is-scoring';
import { getNichesForOperator } from './niche-list-utils';
import { getOperatorTierInNiche } from './team-builder';

const CLASSES = ['Vanguard', 'Guard', 'Defender', 'Sniper', 'Caster', 'Medic', 'Supporter', 'Specialist'];
const TOP_N_PER_CLASS = 6;

export interface SquadRecommendationResult {
  top12AvgByClass: Record<string, number>;
  recommendedSquad: { isId: string; squadId: string; reason: string } | null;
}

/**
 * Compute average IS teambuilder score of user's top 6 operators per class.
 * Uses same scoring as IS team builder: weight pools (important/optional/good), tier per niche, trash penalty, wantToUse bonus.
 */
export function computeTop12AvgByClass(
  ownedOperatorIds: string[],
  wantToUseIds: string[],
  operatorsData: OperatorsData
): Record<string, number> {
  const wantSet = new Set(wantToUseIds);
  const weightPools = getIsNicheWeightPools();
  const byClass: Record<string, number[]> = {};
  for (const cls of CLASSES) byClass[cls] = [];

  for (const id of ownedOperatorIds) {
    const op = operatorsData[id];
    if (!op || typeof op !== 'object') continue;
    const cls = op.class as string | undefined;
    if (!cls || !CLASSES.includes(cls)) continue;
    const score = computeOperatorISScoreStandalone(
      id,
      wantSet.has(id),
      weightPools,
      getNichesForOperator,
      (operatorId, niche) => getOperatorTierInNiche(operatorId, niche, true)
    );
    byClass[cls].push(score);
  }

  const result: Record<string, number> = {};
  for (const cls of CLASSES) {
    const arr = (byClass[cls] ?? []).sort((a, b) => b - a).slice(0, TOP_N_PER_CLASS);
    result[cls] = arr.length > 0 ? arr.reduce((s, n) => s + n, 0) / arr.length : 0;
  }
  console.log('[squad-recommendation] avg per class (IS teambuilder score):', result);
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
