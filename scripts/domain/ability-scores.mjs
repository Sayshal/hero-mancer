import { MODULE } from '../constants.mjs';
import { evaluateRoll } from '../utils/dice.mjs';

const METHODS = ['standardArray', 'pointBuy', 'manualFormula'];

/** @type {Object<string, string>} FontAwesome fallback per ability key for stats dnd5e doesn't ship an SVG icon for. */
const ABILITY_ICON_FA_FALLBACKS = { hon: 'fa-solid fa-handshake', san: 'fa-solid fa-brain' };

/**
 * Resolve the active point-buy cost map: stored override when populated, otherwise the 5e default table.
 * @returns {Object<string|number, number>} Score → cost.
 */
export function getPointBuyCostMap() {
  const stored = game.settings.get(MODULE.ID, MODULE.SETTINGS.POINT_BUY_COST_MAP);
  if (stored && typeof stored === 'object' && Object.keys(stored).length > 0) return stored;
  return { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
}

/**
 * Raw point-buy cost lookup: cost map (stored or default) → 1.x extended formula for out-of-range scores.
 * @param {number} value Ability score.
 * @returns {number} Raw point cost (may be negative).
 */
function pointBuyCostRaw(value) {
  const map = getPointBuyCostMap();
  const key = String(value);
  if (map[key] != null) return Number(map[key]);
  if (value < 8) return -(8 - value);
  if (value > 15) return 9 + (value - 15) * 2;
  return 0;
}

/**
 * Compute the point-buy cost of a single ability score, rebased when MIN > 8 so each ability starts at MIN for free.
 * @param {number} value Ability score.
 * @param {number} [min] Configured MIN; rebases the table when above 8.
 * @returns {number} Point cost.
 */
export function pointBuyCost(value, min = 8) {
  const raw = pointBuyCostRaw(value);
  return min > 8 ? raw - pointBuyCostRaw(min) : raw;
}

/**
 * Extract the abilities a class benefits from: primary, spellcasting, and L1 saving-throw grants.
 * @param {?object} classDoc Full class Document.
 * @returns {Set<string>} Lower-cased ability keys.
 */
export function getPrimaryAbilities(classDoc) {
  const out = new Set();
  if (!classDoc) return out;
  const sys = classDoc.system ?? {};
  for (const k of sys.primaryAbility?.value ?? []) out.add(String(k).toLowerCase());
  if (sys.spellcasting?.ability) out.add(String(sys.spellcasting.ability).toLowerCase());
  const traits = classDoc.advancement?.byType?.Trait ?? [];
  for (const t of traits) {
    if (t.level !== 1) continue;
    for (const grant of t.configuration?.grants ?? []) {
      if (typeof grant === 'string' && grant.startsWith('saves:')) out.add(grant.split(':')[1].toLowerCase());
    }
  }
  return out;
}

/**
 * Roll an ability formula and return the integer result.
 * @param {string} formula Roll formula (e.g. `4d6kh3`).
 * @returns {Promise<number>} Total rolled.
 */
export async function rollAbilityFormula(formula) {
  const roll = await evaluateRoll(formula);
  return Math.floor(roll.total);
}

/**
 * Read the standard array values from settings, padded/truncated to ability count, sorted descending.
 * @param {number} abilityCount Number of abilities to fill.
 * @returns {number[]} Standard array values, high to low.
 */
function getStandardArray(abilityCount) {
  const raw = game.settings.get(MODULE.ID, MODULE.SETTINGS.STANDARD_ARRAY_VALUES) ?? '15,14,13,12,10,8';
  const parsed = String(raw)
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Number.isFinite);
  while (parsed.length < abilityCount) parsed.push(11);
  return parsed.slice(0, abilityCount).sort((a, b) => b - a);
}

/**
 * Build a value→count multiset for the standard array (used for duplicate-aware UI and validation).
 * @param {number} abilityCount Number of abilities.
 * @returns {Map<string, number>} Pool keyed by stringified value.
 */
export function buildStandardArrayPool(abilityCount) {
  const pool = new Map();
  for (const v of getStandardArray(abilityCount)) {
    const key = String(v);
    pool.set(key, (pool.get(key) ?? 0) + 1);
  }
  return pool;
}

/**
 * Build the abilities-tab context.
 * @param {object} [draft] Saved draft values for the abilities tab.
 * @param {?object} [classDoc] Currently selected class Document, used to highlight primary abilities.
 * @returns {object} Render-ready abilities-tab context.
 */
export function buildAbilitiesContext(draft = {}, classDoc = null) {
  const allowed = game.settings.get(MODULE.ID, MODULE.SETTINGS.ALLOWED_METHODS) ?? { standardArray: true, pointBuy: true, manualFormula: true };
  const enabledMethods = METHODS.filter((m) => allowed[m] !== false);
  const method = enabledMethods.includes(draft.method) ? draft.method : (enabledMethods[0] ?? 'pointBuy');
  const abilityKeys = Object.keys(CONFIG.DND5E.abilities ?? {});
  const min = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.ABILITY_SCORE_MIN) ?? 8);
  const max = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.ABILITY_SCORE_MAX) ?? 15);
  const dflt = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.ABILITY_SCORE_DEFAULT) ?? 10);
  const standardArrayPool = buildStandardArrayPool(abilityKeys.length);
  const customFormula = game.settings.get(MODULE.ID, MODULE.SETTINGS.CUSTOM_ROLL_FORMULA) ?? '4d6kh3';
  const customTotal = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.CUSTOM_POINT_BUY_TOTAL));
  const totalPoints = Number.isFinite(customTotal) ? customTotal : 27;
  const abilityValues = draft.abilities ?? {};
  const standardArrayUsed = new Map();
  for (const key of abilityKeys) {
    const raw = abilityValues[key]?.value;
    if (raw === '' || raw == null) continue;
    const v = String(raw);
    if (standardArrayPool.has(v)) standardArrayUsed.set(v, (standardArrayUsed.get(v) ?? 0) + 1);
  }
  const standardArrayUniqueOptions = [...standardArrayPool.entries()].map(([v, n]) => {
    const opt = { value: v, label: v };
    if (n > 1) opt.badge = `${standardArrayUsed.get(v) ?? 0}/${n}`;
    return opt;
  });
  const primary = getPrimaryAbilities(classDoc);
  const className = classDoc?.name ?? _loc('HEROMANCER.App.Abilities.YourClass');
  let usedPoints = 0;
  const gridCols = Math.max(2, Math.ceil(abilityKeys.length / 2));
  const blocks = abilityKeys.map((key) => {
    const cfg = CONFIG.DND5E.abilities[key];
    const raw = abilityValues[key]?.value;
    const isEmpty = raw === '' || raw == null;
    const numericValue = isEmpty ? dflt : Number(raw);
    const cost = isEmpty ? 0 : pointBuyCost(numericValue, min);
    if (method === 'pointBuy' && !isEmpty) usedPoints += cost;
    const isPrimary = primary.has(key);
    const modifier = isEmpty ? '—' : Math.floor((numericValue - 10) / 2);
    return {
      id: `ability-${key}`,
      ability: key,
      label: cfg.label,
      abbr: cfg.abbreviation,
      blurbKey: `HEROMANCER.App.Abilities.Blurbs.${key}`,
      iconPath: cfg.icon ? `/${cfg.icon}` : null,
      iconClass: cfg.icon ? null : (ABILITY_ICON_FA_FALLBACKS[key] ?? 'fa-solid fa-star'),
      method,
      value: isEmpty ? '' : numericValue,
      modifier,
      cost,
      min,
      max,
      isPrimary,
      primaryTooltip: isPrimary ? _loc('HEROMANCER.App.Abilities.PrimaryTooltip', { ability: _loc(cfg.label), class: className }) : '',
      formulaPlaceholder: customFormula,
      standardArray: { id: `ability-${key}-sa`, name: `abilities-sa.${key}`, value: isEmpty ? '' : String(raw), placeholder: '—', searchable: false, options: standardArrayUniqueOptions },
      manualFormulaPool: { id: `ability-${key}-mfp`, name: `abilities-mfp.${key}`, value: isEmpty ? '' : String(raw), placeholder: '—', searchable: false, options: [] }
    };
  });
  return {
    method,
    methodOptions: enabledMethods.map((m) => ({ value: m, label: _loc(`HEROMANCER.App.Abilities.Method.${m}`), active: m === method })),
    blocks,
    gridCols,
    pointBuy: { totalPoints, usedPoints, remaining: totalPoints - usedPoints },
    customFormula
  };
}
