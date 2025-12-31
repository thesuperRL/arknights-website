/**
 * TypeScript Types for Operator Lists
 */

export type Rating = "SS" | "S" | "A" | "B" | "C" | "D" | "F";

export interface OperatorList {
  niche: string; // Name of the niche (e.g., "DPS", "Tank", "Healing")
  description?: string; // Description of what this niche represents
  operators: Partial<Record<Rating, Record<string, string>>>; // Dictionary mapping ratings to name-description pairs
  relatedNiches?: string[]; // Array of related niche names to link to
  lastUpdated?: string; // ISO date string
}

export interface OperatorListCollection {
  [niche: string]: OperatorList;
}

