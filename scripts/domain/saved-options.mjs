import { MODULE } from '../constants.mjs';
import { log } from '../utils/logger.mjs';

const FLAG = MODULE.FLAGS.WIZARD_DRAFT;

/**
 * Persist a draft to the active user's flag.
 * @param {Object<string, *>} draft Field map to store.
 * @returns {Promise<*>} Foundry's `setFlag` result, or null if no draft was passed.
 */
export async function save(draft) {
  if (!draft) return null;
  log(3, `saved-options.save: ${Object.keys(draft).length} field(s)`);
  return game.user.setFlag(MODULE.ID, FLAG, { json: JSON.stringify(draft) });
}

/**
 * Read the active user's draft.
 * @returns {Promise<?Object<string, *>>} Stored draft, or null when unset.
 */
export async function load() {
  const stored = game.user.getFlag(MODULE.ID, FLAG);
  if (!stored?.json) return null;
  const draft = JSON.parse(stored.json);
  log(3, `saved-options.load: ${draft ? Object.keys(draft).length : 0} field(s)`);
  return draft ?? null;
}

/**
 * Remove the active user's draft.
 * @param {string} [reason] Caller context tag included in the verbose log.
 * @returns {Promise<*>} Foundry's `unsetFlag` result.
 */
export async function clear(reason) {
  log(3, reason ? `saved-options.clear (${reason})` : 'saved-options.clear');
  return game.user.unsetFlag(MODULE.ID, FLAG);
}
