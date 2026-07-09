import { MODULE } from '../constants.mjs';

/**
 * Compute `MODULE.COMPAT` from active modules and client settings.
 * @returns {{TOKENIZER: boolean, DSN: boolean, SPELL_BOOK: boolean, CALENDARIA: boolean}} Compat snapshot.
 */
export function computeCompatibility() {
  const tokenizer = game.modules.get('tokenizer-2');
  MODULE.COMPAT = {
    TOKENIZER: !!tokenizer?.active && !foundry.utils.isNewerVersion('1.1.0', tokenizer.version),
    DSN: !!game.modules.get('dice-so-nice')?.active && game.settings.get(MODULE.ID, MODULE.SETTINGS.ENABLE_DICE_SO_NICE),
    SPELL_BOOK: !!game.modules.get('spell-book')?.active,
    CALENDARIA: !!game.modules.get('calendaria')?.active
  };
  ATLAS.log(3, 'compat:', MODULE.COMPAT);
  return MODULE.COMPAT;
}
