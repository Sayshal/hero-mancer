import { MODULE } from '../constants.mjs';
import { log } from '../utils/logger.mjs';
import { launchWizard } from './wizard-launch.mjs';

/** Query name registered on `CONFIG.queries` for the GM-triggered wizard open. */
export const OPEN_WIZARD_QUERY = `${MODULE.ID}.openWizard`;

/**
 * Register the `CONFIG.queries` handler that opens the wizard on a client when a GM asks.
 * Runs on every client so any user can be a query recipient.
 * @returns {void}
 */
export function registerOpenForPlayer() {
  CONFIG.queries[OPEN_WIZARD_QUERY] = handleOpenWizardQuery;
}

/**
 * Recipient-side query handler: open the wizard locally when a GM requests it.
 * @param {object} data Query payload.
 * @param {object} [data.seed] Initial draft seed forwarded to the wizard.
 * @param {string} data.senderUserId User id of the GM that issued the query.
 * @returns {Promise<{opened: boolean}>} Result reported back to the caller.
 */
async function handleOpenWizardQuery({ seed = {}, senderUserId } = {}) {
  if (!game.users.get(senderUserId)?.isGM) return { opened: false };
  await launchWizard(seed);
  return { opened: true };
}

/**
 * GM-only: open the Hero Mancer wizard on a target player's client. Opens locally when the GM targets themselves.
 * @param {string} userId Target user id.
 * @param {object} [opts] Launch options.
 * @param {string} [opts.initialName] Pre-fill the character name field.
 * @returns {Promise<void>} Resolves once the wizard is open (or the local render is dispatched).
 * @throws {Error} When the caller is not a GM, the target is unknown or offline, or the recipient declines.
 */
export async function openWizardForPlayer(userId, { initialName = '' } = {}) {
  if (!game.user.isGM) {
    ui.notifications.warn('HEROMANCER.App.OpenForPlayer.NotGM', { localize: true });
    throw new Error('openWizardForPlayer requires a GM user.');
  }
  const target = game.users.get(userId);
  if (!target) {
    ui.notifications.warn('HEROMANCER.App.OpenForPlayer.UnknownUser', { localize: true });
    throw new Error(`openWizardForPlayer: no user with id "${userId}".`);
  }
  const seed = { characterName: initialName };
  if (target.id === game.user.id) {
    await launchWizard(seed);
    return;
  }
  if (!target.active) {
    ui.notifications.warn(game.i18n.format('HEROMANCER.App.OpenForPlayer.Offline', { name: target.name }));
    throw new Error(`openWizardForPlayer: user "${target.name}" is not connected.`);
  }
  let result;
  try {
    result = await target.query(OPEN_WIZARD_QUERY, { seed, senderUserId: game.user.id });
  } catch (error) {
    log(1, 'openWizardForPlayer query failed:', error);
    ui.notifications.error(game.i18n.format('HEROMANCER.App.OpenForPlayer.Failed', { name: target.name }));
    throw error;
  }
  if (!result?.opened) {
    ui.notifications.error(game.i18n.format('HEROMANCER.App.OpenForPlayer.Failed', { name: target.name }));
    throw new Error(`openWizardForPlayer: "${target.name}" did not open the wizard.`);
  }
  ui.notifications.info(game.i18n.format('HEROMANCER.App.OpenForPlayer.Sent', { name: target.name }));
}
