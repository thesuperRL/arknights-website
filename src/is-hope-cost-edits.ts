/**
 * User hope/promotion overrides stored as a list of edits to save DB space.
 * Each edit is a delta from server defaults (hopeedit) or an autopromote flag.
 */

export interface HopeCostEdit {
  IS: string;
  Squad: string;
  rarity: string;
  class: string;
  /** true = recruit hope cost; false = promotion cost */
  isrecruit: boolean;
  /** Delta from default (positive or negative). Ignored when autopromote is true. */
  hopeedit: number;
  /** If true, this edit marks automatic promotion for this class; hopeedit is disregarded. */
  autopromote: boolean;
}

const RARITIES = ['4', '5', '6'] as const;
const DEFAULT_RECRUIT: Record<string, number> = { '4': 0, '5': 3, '6': 6 };
const DEFAULT_PROMO = 3;

type HopeCostsConfigLike = Record<string, Record<string, Record<string, unknown>>>;

function getDefaultRecruitHope(defaults: HopeCostsConfigLike | null, IS: string, Squad: string, rarity: string, className: string): number {
  const byClass = defaults?.[IS]?.[Squad]?.[rarity] as Record<string, number> | undefined;
  if (byClass && typeof byClass[className] === 'number') return byClass[className];
  return DEFAULT_RECRUIT[rarity] ?? 0;
}

function getDefaultPromotionHope(defaults: HopeCostsConfigLike | null, IS: string, Squad: string, rarity: string, className: string): number {
  const prom = defaults?.[IS]?.[Squad]?.promotionCost as Record<string, Record<string, number>> | undefined;
  const byClass = prom?.[rarity];
  if (byClass && typeof byClass[className] === 'number') return byClass[className];
  return DEFAULT_PROMO;
}

function ensureSquadEntry(config: HopeCostsConfigLike, IS: string, Squad: string): void {
  if (!config[IS]) config[IS] = {};
  if (!config[IS][Squad] || typeof config[IS][Squad] !== 'object') {
    config[IS][Squad] = {
      '4': {},
      '5': {},
      '6': {},
      promotionCost: { '4': {}, '5': {}, '6': {} },
      autoPromoteClasses: []
    };
  }
  const entry = config[IS][Squad] as Record<string, unknown>;
  for (const r of RARITIES) {
    if (!entry[r] || typeof entry[r] !== 'object') entry[r] = {};
  }
  if (!entry.promotionCost || typeof entry.promotionCost !== 'object') {
    entry.promotionCost = { '4': {}, '5': {}, '6': {} };
  }
  const prom = entry.promotionCost as Record<string, Record<string, number>>;
  for (const r of RARITIES) {
    if (!prom[r] || typeof prom[r] !== 'object') prom[r] = {};
  }
  if (!Array.isArray(entry.autoPromoteClasses)) entry.autoPromoteClasses = [];
}

/**
 * Apply a list of edits to the default config and return the merged config.
 */
export function applyEditsToHopeCosts(
  defaults: Record<string, unknown> | null,
  edits: HopeCostEdit[]
): Record<string, unknown> {
  const def = defaults as HopeCostsConfigLike | null;
  const result: HopeCostsConfigLike = def ? JSON.parse(JSON.stringify(def)) : {};
  for (const e of edits) {
    if (!e.IS || !e.Squad) continue;
    ensureSquadEntry(result, e.IS, e.Squad);
    const entry = result[e.IS][e.Squad] as Record<string, unknown>;
    if (e.autopromote) {
      const arr = entry.autoPromoteClasses as string[];
      if (!arr.includes(e.class)) arr.push(e.class);
      continue;
    }
    const defaultVal = e.isrecruit
      ? getDefaultRecruitHope(def, e.IS, e.Squad, e.rarity, e.class)
      : getDefaultPromotionHope(def, e.IS, e.Squad, e.rarity, e.class);
    const newVal = defaultVal + (e.hopeedit ?? 0);
    if (e.isrecruit) {
      const byClass = entry[e.rarity] as Record<string, number>;
      byClass[e.class] = newVal;
    } else {
      const prom = entry.promotionCost as Record<string, Record<string, number>>;
      if (!prom[e.rarity]) prom[e.rarity] = {};
      prom[e.rarity][e.class] = newVal;
    }
  }
  return result as Record<string, unknown>;
}

/**
 * Convert a full merged config into a list of edits (only values that differ from defaults).
 */
export function fullConfigToEdits(
  defaults: Record<string, unknown> | null,
  fullConfig: Record<string, unknown>
): HopeCostEdit[] {
  const def = defaults as HopeCostsConfigLike | null;
  const full = fullConfig as HopeCostsConfigLike;
  const edits: HopeCostEdit[] = [];
  if (!full || typeof full !== 'object') return edits;

  const CLASSES = ['Vanguard', 'Guard', 'Defender', 'Sniper', 'Caster', 'Medic', 'Supporter', 'Specialist'];

  for (const IS of Object.keys(full)) {
    const squads = full[IS];
    if (!squads || typeof squads !== 'object') continue;
    for (const Squad of Object.keys(squads)) {
      const entry = squads[Squad];
      if (!entry || typeof entry !== 'object') continue;
      const entryObj = entry as Record<string, unknown>;

      for (const rarity of RARITIES) {
        const byClass = entryObj[rarity] as Record<string, number> | undefined;
        if (byClass && typeof byClass === 'object') {
          for (const className of CLASSES) {
            const userVal = byClass[className];
            if (typeof userVal !== 'number') continue;
            const defaultVal = getDefaultRecruitHope(def, IS, Squad, rarity, className);
            if (userVal !== defaultVal) {
              edits.push({
                IS,
                Squad,
                rarity,
                class: className,
                isrecruit: true,
                hopeedit: userVal - defaultVal,
                autopromote: false
              });
            }
          }
        }

        const prom = entryObj.promotionCost as Record<string, Record<string, number>> | undefined;
        const promByRarity = prom?.[rarity];
        if (promByRarity && typeof promByRarity === 'object') {
          for (const className of CLASSES) {
            const userVal = promByRarity[className];
            if (typeof userVal !== 'number') continue;
            const defaultVal = getDefaultPromotionHope(def, IS, Squad, rarity, className);
            if (userVal !== defaultVal) {
              edits.push({
                IS,
                Squad,
                rarity,
                class: className,
                isrecruit: false,
                hopeedit: userVal - defaultVal,
                autopromote: false
              });
            }
          }
        }
      }

      const autoPromoteClasses = entryObj.autoPromoteClasses as string[] | undefined;
      if (Array.isArray(autoPromoteClasses) && autoPromoteClasses.length > 0) {
        for (const className of autoPromoteClasses) {
          if (typeof className === 'string') {
            edits.push({
              IS,
              Squad,
              rarity: '4',
              class: className,
              isrecruit: false,
              hopeedit: 0,
              autopromote: true
            });
          }
        }
      }
    }
  }
  return edits;
}

/** Stored shape in DB: { edits: HopeCostEdit[] }. Legacy rows may be full config object. */
export function isEditsFormat(override: unknown): override is { edits: HopeCostEdit[] } {
  return (
    override !== null &&
    typeof override === 'object' &&
    Array.isArray((override as Record<string, unknown>).edits)
  );
}
