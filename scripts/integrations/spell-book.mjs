const MODULE_ID = 'spell-book';

/**
 * Whether the Spell Book module is installed and active.
 * @returns {boolean} `true` if the module is registered and currently active.
 */
export function isSpellBookActive() {
  return !!game.modules.get(MODULE_ID)?.active;
}
