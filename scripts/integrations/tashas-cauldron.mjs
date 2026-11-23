/** @type {Object<string, string[]>} Tasha's replacement features that bring companion features with them, keyed by replacement uuid. */
const COMPANIONS = {
  'Compendium.dnd-tashas-cauldron.tcoe-character-options.Item.tcoeranDeftExplo': ['Compendium.dnd-tashas-cauldron.tcoe-character-options.Item.tcoeCanny0000000']
};

/**
 * Companion features granted alongside a Tasha's replacement feature.
 * @param {string} uuid Replacement feature uuid.
 * @returns {string[]} Companion feature uuids; empty when the replacement stands alone.
 */
export function replacementCompanions(uuid) {
  return COMPANIONS[uuid] ?? [];
}
