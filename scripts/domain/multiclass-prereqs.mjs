import { MODULE } from '../constants.mjs';

/**
 * Read the world's configured multiclass threshold (default 13).
 * @returns {number} Minimum ability score.
 */
export function getMulticlassThreshold() {
  return Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.MULTICLASS_THRESHOLD)) || 0;
}

/**
 * Resolve the multiclass-prereq spec from a class doc or index entry's `system.primaryAbility`.
 * @param {object} source Full classDoc / index entry / plain `{primaryAbility}` carrier.
 * @returns {?{abilities: string[], all: boolean}} Prereq, or null when no data is known.
 */
export function getMulticlassPrereq(source) {
  const pa = source?.system?.primaryAbility ?? source?.primaryAbility;
  const value = pa?.value;
  if (!value || (value.size === 0 && value.length === 0)) return null;
  return { abilities: [...value], all: pa.all !== false };
}

/**
 * Check whether an actor's ability scores satisfy a class's multiclass prereq.
 * @param {object} source Class doc / index entry / plain prereq carrier.
 * @param {Object<string, number>} abilityScores Map of ability key -> score (e.g. `{str: 14, dex: 10, ...}`).
 * @returns {{passes: boolean, prereq: ?{abilities: string[], all: boolean}, failed: string[]}} Result.
 */
export function checkMulticlassPrereq(source, abilityScores) {
  const prereq = getMulticlassPrereq(source);
  if (!prereq) return { passes: true, prereq: null, failed: [] };
  const threshold = getMulticlassThreshold();
  if (threshold <= 0) return { passes: true, prereq, failed: [] };
  const failed = prereq.abilities.filter((key) => (Number(abilityScores?.[key]) || 0) < threshold);
  const passes = prereq.all ? failed.length === 0 : failed.length < prereq.abilities.length;
  return { passes, prereq, failed };
}

/**
 * Build a tooltip line explaining the full prereq.
 * @param {{abilities: string[], all: boolean}} prereq Resolved prereq.
 * @returns {string} Label like "STR 13 and CHA 13" / "STR 13 or DEX 13".
 */
export function formatPrereqLabel(prereq) {
  const threshold = getMulticlassThreshold();
  const parts = prereq.abilities.map((key) => `${abilityAbbr(key)} ${threshold}`);
  const joiner = prereq.all ? _loc('HEROMANCER.LevelUp.Prereq.JoinerAnd') : _loc('HEROMANCER.LevelUp.Prereq.JoinerOr');
  return parts.join(` ${joiner} `);
}

/**
 * Chip label listing failed ability deltas like `Charisma 13 (Current: 10)`.
 * @param {string[]} failed Keys of failing abilities.
 * @param {Object<string, number>} abilityScores Current scores.
 * @returns {string} Chip text.
 */
export function formatPrereqChipLabel(failed, abilityScores) {
  const threshold = getMulticlassThreshold();
  return failed.map((key) => _loc('HEROMANCER.LevelUp.Prereq.RequiresPart', { ability: abilityLabel(key), threshold, current: Number(abilityScores?.[key]) || 0 })).join(', ');
}

/**
 * Read the dnd5e ability abbreviation for a key.
 * @param {string} key Ability key (`str`, `dex`, ...).
 * @returns {string} Abbreviation like `STR`.
 */
function abilityAbbr(key) {
  return CONFIG.DND5E?.abilities?.[key]?.abbreviation ?? key.toUpperCase();
}

/**
 * Read the dnd5e ability full label for a key.
 * @param {string} key Ability key (`str`, `dex`, ...).
 * @returns {string} Label like `Strength`.
 */
function abilityLabel(key) {
  return CONFIG.DND5E?.abilities?.[key]?.label ?? key.toUpperCase();
}
