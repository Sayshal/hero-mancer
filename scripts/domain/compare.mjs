/** @type {Set<string>} */
export const CATEGORIES = new Set(['background', 'species', 'class', 'subclass', 'feat']);

/** @type {Map<string, Set<string>>} */
const pins = new Map();

/**
 * List pinned uuids for a category.
 * @param {string} category Pin category.
 * @returns {string[]} Pinned uuids in insertion order.
 */
export function getPins(category) {
  return [...(pins.get(category) ?? [])];
}

/**
 * Count pinned uuids for a category.
 * @param {string} category Pin category.
 * @returns {number} Pin count.
 */
export function pinCount(category) {
  return pins.get(category)?.size ?? 0;
}

/**
 * Check whether a uuid is pinned in a category.
 * @param {string} category Pin category.
 * @param {string} uuid Compendium uuid.
 * @returns {boolean} True when pinned.
 */
export function hasPin(category, uuid) {
  return !!pins.get(category)?.has(uuid);
}

/**
 * Toggle `uuid` in `category`.
 * @param {string} category Pin category.
 * @param {string} uuid Compendium uuid.
 * @returns {'added'|'removed'|'invalid'} Outcome.
 */
export function togglePin(category, uuid) {
  if (!CATEGORIES.has(category) || !uuid) return 'invalid';
  let set = pins.get(category);
  if (!set) {
    set = new Set();
    pins.set(category, set);
  }
  if (set.has(uuid)) {
    set.delete(uuid);
    return 'removed';
  }
  set.add(uuid);
  return 'added';
}

/**
 * Remove a single pin from a category.
 * @param {string} category Pin category.
 * @param {string} uuid Compendium uuid.
 * @returns {boolean} True when removed.
 */
export function removePin(category, uuid) {
  return !!pins.get(category)?.delete(uuid);
}

/**
 * Clear pins for one category, or all categories when omitted.
 * @param {string} [category] Pin category.
 */
export function clearPins(category) {
  if (category) pins.get(category)?.clear();
  else pins.clear();
}
