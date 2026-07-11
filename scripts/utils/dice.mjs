import { MODULE } from '../constants.mjs';

/**
 * Evaluate a roll formula, prompting for manual entry only when the user configured physical dice, and animating digital rolls via Dice So Nice.
 * @param {string} formula Roll formula.
 * @param {object} [options] Evaluation options.
 * @param {boolean} [options.publish] When the caller will post the roll to chat, skip the local animation so Dice So Nice animates once via the message.
 * @returns {Promise<Roll>} Evaluated roll.
 */
export async function evaluateRoll(formula, { publish = false } = {}) {
  const roll = new Roll(formula);
  const allowInteractive = Roll.identifyFulfillableTerms(roll.terms).length > 0;
  await roll.evaluate({ allowInteractive });
  if (!allowInteractive && !publish && MODULE.COMPAT?.DSN) await game.dice3d?.showForRoll(roll, game.user, true);
  return roll;
}
