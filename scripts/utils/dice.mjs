import { MODULE } from '../constants.mjs';

/**
 * Evaluate a roll formula, prompting for manual entry only when the user configured physical dice, and animating digital rolls via Dice So Nice.
 * @param {string} formula Roll formula.
 * @returns {Promise<Roll>} Evaluated roll.
 */
export async function evaluateRoll(formula) {
  const roll = new Roll(formula);
  const allowInteractive = Roll.identifyFulfillableTerms(roll.terms).length > 0;
  await roll.evaluate({ allowInteractive });
  if (!allowInteractive && MODULE.COMPAT?.DSN) await game.dice3d?.showForRoll(roll, game.user, true);
  return roll;
}
