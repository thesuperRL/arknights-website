/**
 * TypeScript Types for Operator Lists
 */

export interface OperatorList {
  niche: string; // Name of the niche (e.g., "DPS", "Tank", "Healing")
  description?: string; // Description of what this niche represents
  operators: string[]; // Array of operator IDs
  lastUpdated?: string; // ISO date string
}

export interface OperatorListCollection {
  [niche: string]: OperatorList;
}

