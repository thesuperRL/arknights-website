/**
 * Utilities for "peak" operator level: module > E2 > base.
 * Used to rank operators at their peak only (one entry per operator, best level).
 */

import { Rating } from './niche-list-types';

const RATING_ORDER: Rating[] = ['SS', 'S', 'A', 'B', 'C', 'D', 'F'];
const RATING_RANK: Record<string, number> = Object.fromEntries(
  RATING_ORDER.map((r, i) => [r, i])
);

/** Level rank for comparison: higher = better (module > E2 > base). */
export function levelRank(level: string): number {
  if (!level || level.trim() === '') return 0;
  if (level === 'E2') return 1;
  return 2; // module code
}

export interface OperatorListEntryLike {
  operatorId: string;
  rating: string;
  level: string;
  [key: string]: unknown;
}

/** Keep only the peak entry per operatorId (best level, then best rating). */
export function keepPeakEntriesOnly<T extends OperatorListEntryLike>(entries: T[]): T[] {
  const byOp = new Map<string, T>();
  for (const entry of entries) {
    const existing = byOp.get(entry.operatorId);
    const entryLevelRank = levelRank(entry.level);
    const existingLevelRank = existing ? levelRank(existing.level) : -1;
    const entryRatingRank = RATING_RANK[entry.rating] ?? 999;
    const existingRatingRank = existing ? (RATING_RANK[existing.rating] ?? 999) : 999;
    const better =
      !existing ||
      entryLevelRank > existingLevelRank ||
      (entryLevelRank === existingLevelRank && entryRatingRank < existingRatingRank);
    if (better) {
      byOp.set(entry.operatorId, entry);
    }
  }
  return Array.from(byOp.values());
}

export interface InstanceLike {
  tier: string;
  level: string;
  [key: string]: unknown;
}

/** Keep only the peak instance (best level, then best tier). */
export function keepPeakInstanceOnly<T extends InstanceLike>(instances: T[]): T[] {
  if (instances.length <= 1) return instances;
  let best = instances[0];
  for (let i = 1; i < instances.length; i++) {
    const cur = instances[i];
    const curLevel = levelRank(cur.level);
    const bestLevel = levelRank(best.level);
    const curTier = RATING_RANK[cur.tier] ?? 999;
    const bestTier = RATING_RANK[best.tier] ?? 999;
    if (
      curLevel > bestLevel ||
      (curLevel === bestLevel && curTier < bestTier)
    ) {
      best = cur;
    }
  }
  return [best];
}
