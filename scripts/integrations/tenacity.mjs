import { MODULE } from '../constants.mjs';

/**
 * Read a configured mote amount, returning 0 when Tenacity is inactive.
 * @param {string} settingKey Settings key from `MODULE.SETTINGS`.
 * @returns {number} Configured amount, 0 when disabled or unavailable.
 */
function moteAmount(settingKey) {
  if (!MODULE.COMPAT?.TENACITY) return 0;
  return Math.max(0, Number(game.settings.get(MODULE.ID, settingKey)) || 0);
}

/**
 * Whether Hero Mancer grants creation motes itself, which suppresses Tenacity's own starting-mote grant.
 * @returns {boolean} `true` when the creation amount is configured above zero.
 */
export function grantsCreationMotes() {
  return moteAmount(MODULE.SETTINGS.TENACITY_CREATION_MOTES) > 0;
}

/**
 * Grant the configured milestone motes to an actor.
 * @param {object} actor Target character actor.
 * @param {'creation'|'levelUp'} milestone Which configured amount to grant.
 * @returns {Promise<number>} Motes actually granted (Tenacity clamps to the actor's cap).
 */
export async function grantMilestoneMotes(actor, milestone) {
  const amount = moteAmount(milestone === 'creation' ? MODULE.SETTINGS.TENACITY_CREATION_MOTES : MODULE.SETTINGS.TENACITY_LEVEL_UP_MOTES);
  if (!actor || !amount) return 0;
  try {
    return (await TENACITY.grant(actor, { amount, reason: `hero-mancer-${milestone}` })) ?? 0;
  } catch (err) {
    ATLAS.log(2, 'grantMilestoneMotes failed:', err);
    return 0;
  }
}
