/**
 * TypeScript Types for Tier Lists
 */

export type TierRank = 'EX' | 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface TierListOperator {
  operatorId: string; // ID from operators JSON files
  notes?: string; // Optional notes about why they're in this tier
}

export interface TierList {
  niche: string; // Name of the niche (e.g., "DPS", "Tank", "Healing")
  description?: string; // Description of what this niche represents
  tiers: {
    [key in TierRank]?: TierListOperator[]; // Operators in each tier
  };
  lastUpdated?: string; // ISO date string
}

export interface TierListCollection {
  [niche: string]: TierList;
}

