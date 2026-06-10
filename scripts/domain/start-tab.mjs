import { MODULE } from '../constants.mjs';
import { buildBirthdayContext } from '../integrations/calendaria.mjs';
import { CULTURE_KEYS, STYLE_KEYS } from '../utils/randomizer-grammar.mjs';
import { getEffectiveStartingLevel } from './subclass.mjs';

/**
 * Build the start-tab context for the wizard.
 * @param {object} [draft] Saved draft values for the start tab.
 * @returns {object} Render-ready start-tab context.
 */
export function buildStartContext(draft = {}) {
  const isGM = game.user.isGM;
  const playerCustomizationEnabled = game.settings.get(MODULE.ID, MODULE.SETTINGS.ENABLE_PLAYER_CUSTOMIZATION);
  const tokenCustomizationEnabled = game.settings.get(MODULE.ID, MODULE.SETTINGS.ENABLE_TOKEN_CUSTOMIZATION);
  const value = withDefaults(draft);
  const out = {
    isGM,
    canPickArt: game.user.hasPermission('FILES_BROWSE'),
    canTokenize: !!MODULE.COMPAT?.TOKENIZER && game.settings.get(MODULE.ID, MODULE.SETTINGS.TOKENIZER_COMPATIBILITY) && game.user.hasPermission('FILES_UPLOAD'),
    playerCustomizationEnabled,
    tokenCustomizationEnabled,
    value,
    level: buildLevelContext(draft, isGM),
    randomNameStyles: buildRandomNameStyles(),
    randomNameCultures: buildRandomNameCultures()
  };
  if (isGM) out.playerAssignment = buildPlayerAssignmentCombo(value.player);
  const diceAppearance = buildDiceAppearanceContext(value);
  if (diceAppearance) out.diceAppearance = diceAppearance;
  const birthday = buildBirthdayContext(value.birthday);
  if (birthday) out.birthday = birthday;
  return out;
}

/**
 * Build the dice-appearance sub-context. Returns null when DSN is not active.
 * @param {object} value Draft with defaults applied.
 * @returns {?{appearanceJson:string, hasCustom:boolean, customLabel:string, buttonLabel:string}} Context for the dice button + status line.
 */
function buildDiceAppearanceContext(value) {
  if (!MODULE.COMPAT?.DSN) return null;
  const appearanceJson = (value.diceAppearance || '').trim();
  let parsed = null;
  if (appearanceJson) {
    try {
      parsed = JSON.parse(appearanceJson);
    } catch {
      parsed = null;
    }
  }
  const hasCustom = !!parsed?.global;
  const colorsetId = parsed?.global?.colorset || '';
  const Utils = game.dice3d?.exports?.Utils;
  let colorsetLabel = '';
  if (colorsetId && Utils?.prepareColorsetList) colorsetLabel = Utils.prepareColorsetList()?.[colorsetId]?.label || colorsetId;
  const customLabel = hasCustom
    ? colorsetLabel
      ? _loc('HEROMANCER.App.Start.DiceAppearance.StatusCustomWithColorset', { colorset: colorsetLabel })
      : _loc('HEROMANCER.App.Start.DiceAppearance.StatusCustom')
    : _loc('HEROMANCER.App.Start.DiceAppearance.StatusDefault');
  const buttonLabel = hasCustom ? _loc('HEROMANCER.App.Start.DiceAppearance.Edit') : _loc('HEROMANCER.App.Start.DiceAppearance.Set');
  return { appearanceJson, hasCustom, customLabel, buttonLabel };
}

/** @returns {Array<{value:string,label:string,selected:boolean}>} Name-style select options. */
function buildRandomNameStyles() {
  return STYLE_KEYS.map((value) => ({ value, label: _loc(`HEROMANCER.App.Start.RandomNameStyle.${value}`), selected: value === 'all' }));
}

/** @returns {Array<{value:string,label:string,selected:boolean}>} Culture select options: `all` then cultures sorted by label. */
function buildRandomNameCultures() {
  const cultures = CULTURE_KEYS.map((value) => ({ value, label: _loc(`HEROMANCER.App.Start.RandomNameCulture.${value}`), selected: false })).sort((a, b) => a.label.localeCompare(b.label));
  return [{ value: 'all', label: _loc('HEROMANCER.App.Start.RandomNameCulture.all'), selected: true }, ...cultures];
}

/**
 * Build the starting-level sub-context: editable input for GM/override-enabled, read-only tile otherwise.
 * @param {object} draft Raw draft for the start tab.
 * @param {boolean} isGM Whether the current user is a GM.
 * @returns {{value:number, default:number, editable:boolean}} Level context.
 */
function buildLevelContext(draft, isGM) {
  const campaign = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.STARTING_LEVEL)) || 1;
  const allowOverride = game.settings.get(MODULE.ID, MODULE.SETTINGS.ALLOW_PLAYER_LEVEL_OVERRIDE);
  return { value: getEffectiveStartingLevel(draft), default: campaign, editable: isGM || allowOverride };
}

/**
 * Apply default values for any missing draft fields.
 * @param {object} draft Saved draft values.
 * @returns {object} Draft with defaults filled in.
 */
function withDefaults(draft) {
  return {
    characterName: '',
    player: '',
    characterArt: '',
    linkTokenArt: false,
    tokenArt: '',
    playerColor: game.user.color?.css ?? '#ff0000',
    playerPronouns: '',
    ringEnabled: false,
    ringColor: '',
    backgroundColor: '',
    diceAppearance: '',
    tokenizerPrototype: '',
    tokenizerLayers: '',
    birthday: null,
    ...draft
  };
}

/**
 * Build a combobox context for the GM player-assignment picker.
 * @param {string} selected Currently assigned user id.
 * @returns {object} Combobox partial context.
 */
function buildPlayerAssignmentCombo(selected) {
  const noPlayer = { value: '', label: _loc('HEROMANCER.App.Start.PlayerAssignmentPlaceholder'), iconClass: 'fa-solid fa-user-slash' };
  const players = game.users.filter((u) => !u.isGM).map((u) => ({ value: u.id, label: u.name, iconClass: 'fa-solid fa-user' }));
  return { id: 'player-assignment', name: 'player', value: selected, placeholder: _loc('HEROMANCER.App.Start.PlayerAssignmentPlaceholder'), searchable: true, options: [noPlayer, ...players] };
}
