/**
 * TypeScript Types for Operator Lists
 */

export type Rating = "SS" | "S" | "A" | "B" | "C" | "D" | "F";

// Operator entry can be:
// - string: description (backwards compatible, means always has niche)
// - [string, string]: [description, level] where level is "" (always), "E2" (elite 2), or a module code
export type OperatorEntry = string | [string, string];

export interface OperatorList {
  niche: string; // Name of the niche (e.g., "DPS", "Tank", "Healing")
  description?: string; // Description of what this niche represents
  operators: Partial<Record<Rating, Record<string, OperatorEntry>>>; // Dictionary mapping ratings to operator entries
  relatedNiches?: string[]; // Array of related niche names to link to
  lastUpdated?: string; // ISO date string
}

export interface OperatorListCollection {
  [niche: string]: OperatorList;
}

