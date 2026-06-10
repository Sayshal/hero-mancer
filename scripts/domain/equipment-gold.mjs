/**
 * Detect whether a source document uses 2024 rules.
 * @param {object} sourceDoc Class or background document.
 * @returns {boolean} True if document uses 2024 rules.
 */
export function isModernRules(sourceDoc) {
  const rules = sourceDoc?.system?.source?.rules;
  if (rules === '2024') return true;
  if (rules) return false;
  return dnd5e.settings.rulesVersion === 'modern';
}

/**
 * Parse a class or background's starting gold data.
 * @param {object} sourceDoc Class or background document.
 * @returns {{wealth: {formula: string|null, average: number|null, isFormula: boolean}, currencyByGroup: Map<string, {key: string, count: number, _id: string}>}} Parsed wealth formula plus per-branch currency grants.
 */
export function parseStartingGold(sourceDoc) {
  return { wealth: parseWealthField(sourceDoc?.system?.wealth), currencyByGroup: collectCurrencyEntries(sourceDoc?.system?.startingEquipment) };
}

/**
 * Resolve the currency grant attached to a given OR-option group id.
 * @param {string} groupId Equipment entry id (an OR-option's `_id`, typically an AND group).
 * @param {object} sourceDoc Class or background document.
 * @returns {?{key: string, count: number}} Currency grant for the option, or null if none.
 */
export function goldForOrOption(groupId, sourceDoc) {
  const entries = sourceDoc?.system?.startingEquipment;
  if (!entries?.length || !groupId) return null;
  const hit = entries.find((e) => e.type === 'currency' && e.group === groupId);
  return hit ? { key: hit.key, count: hit.count ?? 0 } : null;
}

/**
 * Interpret a FormulaField value: flat integer or dice formula.
 * @param {string|number|undefined} raw Raw wealth value.
 * @returns {{formula: string|null, average: number|null, isFormula: boolean}} Normalized wealth info.
 */
function parseWealthField(raw) {
  const empty = { formula: null, average: null, isFormula: false };
  if (raw === undefined || raw === null || raw === '') return empty;
  const str = String(raw).trim();
  if (!str) return empty;
  const flat = Number(str);
  if (Number.isFinite(flat)) return { formula: str, average: flat, isFormula: false };
  const avg = rollFormulaAverage(str);
  return { formula: str, average: avg, isFormula: true };
}

/**
 * Average a dice formula via min/max evaluation.
 * @param {string} formula Dice expression.
 * @returns {number|null} Average roll value, or null if formula is invalid.
 */
function rollFormulaAverage(formula) {
  try {
    const lo = new Roll(formula).evaluateSync({ minimize: true, strict: false }).total;
    const hi = new Roll(formula).evaluateSync({ maximize: true, strict: false }).total;
    return (lo + hi) / 2;
  } catch {
    return null;
  }
}

/**
 * Build a Map keyed by parent group id → currency entry.
 * @param {object[]} entries Raw `system.startingEquipment` array.
 * @returns {Map<string, {key: string, count: number, _id: string}>} Map of parent group id to currency entry.
 */
function collectCurrencyEntries(entries) {
  const map = new Map();
  if (!entries?.length) return map;
  for (const entry of entries) {
    if (entry.type !== 'currency') continue;
    if (!entry.group) continue;
    map.set(entry.group, { key: entry.key, count: entry.count ?? 0, _id: entry._id });
  }
  return map;
}
