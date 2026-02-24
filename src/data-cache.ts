/**
 * In-memory cache for static data (operators, config, special lists).
 * Loaded once at startup or on first use to avoid blocking the event loop under concurrent requests.
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', 'data');

export type OperatorNameLang = 'en' | 'cn' | 'tw' | 'jp' | 'kr';
export interface OperatorNames {
  name: string;
  cnName?: string;
  twName?: string;
  jpName?: string;
  krName?: string;
}

export interface OperatorNamesMap {
  [operatorId: string]: OperatorNames;
}

export interface OperatorsData {
  [operatorId: string]: Record<string, unknown>;
}

export interface IsNicheWeightPoolsConfig {
  important?: { rawScore: number; niches: string[] };
  optional?: { rawScore: number; niches: string[] };
  good?: { rawScore: number; niches: string[] };
  synergyCoreBonus?: number;
  synergyScaleFactor?: number;
}

let initPromise: Promise<void> | null = null;
let operatorsData: OperatorsData = {};
/** Per-rarity (1..6) operator maps, same shape as operators-{n}star.json */
let operatorsByRarity: Record<number, Record<string, Record<string, unknown>>> = {};
let operatorGlobalMap: Record<string, boolean> = {};
let operatorNamesMap: OperatorNamesMap = {};
let isNicheWeightPools: IsNicheWeightPoolsConfig | null = null;
let specialLists: {
  free: { operators?: Record<string, string> } | null;
  globalRange: { operators?: Record<string, string> } | null;
  trash: { operators?: Record<string, string> } | null;
  unconventional: { operators?: Record<string, string> } | null;
  lowRarity: { operators?: Record<string, string> } | null;
} = {
  free: null,
  globalRange: null,
  trash: null,
  unconventional: null,
  lowRarity: null,
};

function loadOperatorsAndMaps(): void {
  const merged: OperatorsData = {};
  const byRarity: Record<number, Record<string, Record<string, unknown>>> = { 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {} };
  const globalMap: Record<string, boolean> = {};
  const namesMap: OperatorNamesMap = {};
  for (const rarity of [1, 2, 3, 4, 5, 6]) {
    const opPath = path.join(DATA_DIR, `operators-${rarity}star.json`);
    if (!fs.existsSync(opPath)) continue;
    const content = fs.readFileSync(opPath, 'utf-8');
    const opData = JSON.parse(content) as Record<string, Record<string, unknown> & { global?: boolean; name?: string; cnName?: string; twName?: string; jpName?: string; krName?: string }>;
    for (const [id, op] of Object.entries(opData)) {
      if (op && typeof op === 'object') {
        merged[id] = op;
        byRarity[rarity][id] = op;
        globalMap[id] = op.global ?? true;
        if (typeof op.name === 'string') {
          namesMap[id] = {
            name: op.name,
            cnName: op.cnName,
            twName: op.twName,
            jpName: op.jpName,
            krName: op.krName,
          };
        }
      }
    }
  }
  operatorsData = merged;
  operatorsByRarity = byRarity;
  operatorGlobalMap = globalMap;
  operatorNamesMap = namesMap;
}

function loadIsNicheWeightPools(): void {
  const configPath = path.join(DATA_DIR, 'is-niche-weight-pools.json');
  if (!fs.existsSync(configPath)) {
    isNicheWeightPools = {
      important: { rawScore: 5, niches: [] },
      optional: { rawScore: 2, niches: [] },
      good: { rawScore: 0.5, niches: [] },
      synergyCoreBonus: 15,
      synergyScaleFactor: 1,
    };
    return;
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  isNicheWeightPools = JSON.parse(raw) as IsNicheWeightPoolsConfig;
}

function loadSpecialList(name: keyof typeof specialLists, filename: string): void {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return;
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    specialLists[name] = JSON.parse(content) as typeof specialLists[typeof name];
  } catch (e) {
    console.warn(`data-cache: failed to load ${filename}:`, (e as Error).message);
  }
}

function loadAll(): void {
  loadOperatorsAndMaps();
  loadIsNicheWeightPools();
  loadSpecialList('free', 'free.json');
  loadSpecialList('globalRange', 'global-range.json');
  loadSpecialList('trash', 'trash-operators.json');
  loadSpecialList('unconventional', 'unconventional-niches.json');
  loadSpecialList('lowRarity', 'low-rarity.json');
}

async function ensureInitialized(): Promise<void> {
  if (operatorsData && Object.keys(operatorsData).length > 0) return;
  if (initPromise) {
    await initPromise;
    return;
  }
  initPromise = new Promise((resolve) => {
    loadAll();
    resolve();
  });
  await initPromise;
}

/**
 * Call during server startup so first requests don't pay cold load.
 */
export async function initializeDataCache(): Promise<void> {
  await ensureInitialized();
}

/**
 * All operators merged from operators-1star through 6star. Empty until initialized.
 */
export function getOperatorsData(): OperatorsData {
  return operatorsData;
}

/**
 * Operators for a single rarity (1..6), same shape as operators-{n}star.json. Empty until initialized.
 */
export function getOperatorsByRarity(rarity: number): Record<string, Record<string, unknown>> {
  if (rarity >= 1 && rarity <= 6) return operatorsByRarity[rarity] ?? {};
  return {};
}

/**
 * Operator id -> global (boolean). Empty until initialized.
 */
export function getOperatorGlobalMap(): Record<string, boolean> {
  return operatorGlobalMap;
}

/**
 * Operator id -> names (en/cn/tw/jp/kr). Empty until initialized.
 */
export function getOperatorNamesMap(): OperatorNamesMap {
  return operatorNamesMap;
}

/**
 * IS niche weight pools config. Default object if file missing.
 */
export function getIsNicheWeightPools(): IsNicheWeightPoolsConfig {
  return isNicheWeightPools ?? {
    important: { rawScore: 5, niches: [] },
    optional: { rawScore: 2, niches: [] },
    good: { rawScore: 0.5, niches: [] },
    synergyCoreBonus: 15,
    synergyScaleFactor: 1,
  };
}

/**
 * Raw parsed special list by key. null if file missing or not loaded.
 */
export function getSpecialListFree(): { operators?: Record<string, string> } | null {
  return specialLists.free;
}
export function getSpecialListGlobalRange(): { operators?: Record<string, string> } | null {
  return specialLists.globalRange;
}
export function getSpecialListTrash(): { operators?: Record<string, string> } | null {
  return specialLists.trash;
}
export function getSpecialListUnconventional(): { operators?: Record<string, string> } | null {
  return specialLists.unconventional;
}
export function getSpecialListLowRarity(): { operators?: Record<string, string> } | null {
  return specialLists.lowRarity;
}

/**
 * Get operator name for language (for changelog).
 */
export function getOperatorNameForLanguage(
  op: OperatorNames | null,
  fallback: string,
  lang: OperatorNameLang
): string {
  if (!op) return fallback;
  switch (lang) {
    case 'cn':
      return (op.cnName && op.cnName.trim()) || op.name;
    case 'tw':
      return (op.twName && op.twName.trim()) || (op.cnName && op.cnName.trim()) || op.name;
    case 'jp':
      return (op.jpName && op.jpName.trim()) || op.name;
    case 'kr':
      return (op.krName && op.krName.trim()) || op.name;
    case 'en':
    default:
      return op.name;
  }
}
