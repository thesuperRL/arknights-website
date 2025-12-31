/**
 * TypeScript Types for Operator Lists
 */

export interface OperatorList {
  niche: string; // Name of the niche (e.g., "DPS", "Tank", "Healing")
  description?: string; // Description of what this niche represents
  operators: Record<string, string>; // Dictionary mapping operator IDs to notes (empty string if no note)
  relatedNiches?: string[]; // Array of related niche names to link to
  lastUpdated?: string; // ISO date string
}

export interface OperatorListCollection {
  [niche: string]: OperatorList;
}

