import { CharacterArtPicker, CustomCompendiums, Customization, DiceRolling, HM, MandatoryFields, StatRoller, Troubleshooter } from './utils/index.js';

const { ArrayField, BooleanField, NumberField, ObjectField, StringField } = foundry.data.fields;

/**
 * Main registration function that initializes all module settings.
 * Calls specialized registration functions for different setting categories.
 */
export function registerSettings() {
  HM.log(3, 'Registering module settings.');

  // Register core settings
  registerCoreSettings();

  // Register menus and their related settings
  registerCompendiumSettings();
  registerCustomizationSettings();
  registerDiceRollingSettings();
  registerMandatoryFieldsSettings();
  registerTroubleshootingSettings();

  // Register compatibility settings
  registerCompatibilitySettings();
}

/**
 * Registers core settings that control basic module functionality.
 */
function registerCoreSettings() {
  game.settings.register(HM.ID, 'enable', {
    name: 'hm.settings.enable.name',
    hint: 'hm.settings.enable.hint',
    type: new BooleanField({ initial: true }),
    scope: 'client',
    config: true,
    requiresReload: true
  });

  game.settings.register(HM.ID, 'compactButton', {
    name: 'hm.settings.compact-button.name',
    hint: 'hm.settings.compact-button.hint',
    type: new BooleanField({ initial: true }),
    scope: 'client',
    config: true,
    requiresReload: true
  });

  game.settings.register(HM.ID, 'enableNavigationButtons', {
    name: 'hm.settings.nav-buttons.name',
    hint: 'hm.settings.nav-buttons.hint',
    scope: 'world',
    config: true,
    type: new BooleanField({ initial: true })
  });

  game.settings.register(HM.ID, 'loggingLevel', {
    name: 'hm.settings.logger.name',
    hint: 'hm.settings.logger.hint',
    scope: 'client',
    config: true,
    type: new StringField({
      initial: '2',
      choices: {
        0: 'hm.settings.logger.choices.off',
        1: 'hm.settings.logger.choices.errors',
        2: 'hm.settings.logger.choices.warnings',
        3: 'hm.settings.logger.choices.verbose'
      }
    }),
    onChange: (value) => {
      const logMessage = `hm.settings.logger.level.${value}`;
      if (value !== '0') {
        HM.log(3, logMessage);
      }
    }
  });

  game.settings.register(HM.ID, 'publishWealthRolls', {
    name: 'hm.settings.publish-wealth-rolls.name',
    hint: 'hm.settings.publish-wealth-rolls.hint',
    scope: 'world',
    config: true,
    type: new BooleanField({ initial: true })
  });

  game.settings.register(HM.ID, 'diceRollingMethod', {
    scope: 'client',
    config: false,
    type: new StringField({ initial: 'standardArray' })
  });

  HM.log(3, 'Core settings registered.');
}

/**
 * Registers custom compendium settings and related configuration.
 */
function registerCompendiumSettings() {
  game.settings.registerMenu(HM.ID, 'customCompendiumMenu', {
    name: 'hm.settings.custom-compendiums.menu.name',
    hint: 'hm.settings.custom-compendiums.menu.hint',
    icon: 'fa-solid fa-atlas',
    label: 'hm.settings.configure-compendiums',
    type: CustomCompendiums,
    restricted: true,
    requiresReload: true
  });

  game.settings.register(HM.ID, 'classPacks', {
    name: 'hm.settings.class-packs.name',
    scope: 'world',
    config: false,
    type: new ArrayField(new StringField())
  });

  game.settings.register(HM.ID, 'racePacks', {
    name: 'hm.settings.race-packs.name',
    scope: 'world',
    config: false,
    type: new ArrayField(new StringField())
  });

  game.settings.register(HM.ID, 'backgroundPacks', {
    name: 'hm.settings.background-packs.name',
    scope: 'world',
    config: false,
    type: new ArrayField(new StringField())
  });

  game.settings.register(HM.ID, 'itemPacks', {
    name: 'hm.settings.item-packs.name',
    scope: 'world',
    config: false,
    type: new ArrayField(new StringField())
  });

  HM.log(3, 'Compendium settings registered.');
}

/**
 * Registers customization settings for appearance and character options.
 */
function registerCustomizationSettings() {
  game.settings.registerMenu(HM.ID, 'customizationMenu', {
    name: 'hm.settings.customization.menu.name',
    hint: 'hm.settings.customization.menu.hint',
    icon: 'fa-solid fa-palette',
    label: 'hm.settings.configure-customization',
    type: Customization,
    restricted: true
  });

  game.settings.register(HM.ID, 'artPickerRoot', {
    name: 'hm.settings.art-picker-root.name',
    hint: 'hm.settings.art-picker-root.hint',
    scope: 'world',
    config: false,
    restricted: true,
    type: new StringField({ initial: '/' }),
    filePicker: 'folder',
    onChange: (value) => {
      CharacterArtPicker.rootDirectory = value;
    }
  });

  game.settings.register(HM.ID, 'enablePlayerCustomization', {
    name: 'hm.settings.player-customization.name',
    hint: 'hm.settings.player-customization.hint',
    type: new BooleanField({ initial: false }),
    scope: 'world',
    config: false,
    requiresReload: true
  });

  game.settings.register(HM.ID, 'enableTokenCustomization', {
    name: 'hm.settings.token-customization.name',
    hint: 'hm.settings.token-customization.hint',
    type: new BooleanField({ initial: false }),
    scope: 'world',
    config: false,
    requiresReload: true
  });

  game.settings.register(HM.ID, 'alignments', {
    name: 'hm.settings.alignments.name',
    hint: 'hm.settings.alignments.hint',
    scope: 'world',
    config: false,
    type: new StringField({ initial: 'Lawful Good, Neutral Good, Chaotic Good, Lawful Neutral, True Neutral, Chaotic Neutral, Lawful Evil, Neutral Evil, Chaotic Evil' }),
    restricted: true
  });

  game.settings.register(HM.ID, 'deities', {
    name: 'hm.settings.deities.name',
    hint: 'hm.settings.deities.hint',
    scope: 'world',
    config: false,
    type: new StringField({ initial: 'Aphrodite,Apollo,Ares,Artemis,Athena,Demeter,Dionysus,Hades,Hecate,Hephaestus,Hera,Hercules,Hermes,Hestia,Nike,Pan,Poseidon,Tyche,Zeus' }),
    restricted: true
  });

  game.settings.register(HM.ID, 'eyeColors', {
    name: 'hm.settings.eye-colors.name',
    hint: 'hm.settings.eye-colors.hint',
    scope: 'world',
    config: false,
    type: new StringField({ initial: 'Blue,Green,Brown,Hazel,Gray,Amber,Black' }),
    restricted: true
  });

  game.settings.register(HM.ID, 'hairColors', {
    name: 'hm.settings.hair-colors.name',
    hint: 'hm.settings.hair-colors.hint',
    scope: 'world',
    config: false,
    type: new StringField({ initial: 'Black,Brown,Blonde,Red,Gray,White,Chestnut,Auburn' }),
    restricted: true
  });

  game.settings.register(HM.ID, 'skinTones', {
    name: 'hm.settings.skin-tones.name',
    hint: 'hm.settings.skin-tones.hint',
    scope: 'world',
    config: false,
    type: new StringField({ initial: 'Pale,Fair,Light,Medium,Tan,Dark,Brown,Black' }),
    restricted: true
  });

  game.settings.register(HM.ID, 'genders', {
    name: 'hm.settings.genders.name',
    hint: 'hm.settings.genders.hint',
    scope: 'world',
    config: false,
    type: new StringField({ initial: 'Male,Female,Non-Binary,Genderfluid,Agender' }),
    restricted: true
  });

  game.settings.register(HM.ID, 'enableRandomize', {
    name: 'hm.settings.randomize.name',
    hint: 'hm.settings.randomize.hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: false })
  });

  game.settings.register(HM.ID, 'enableAlignmentFaithInputs', {
    name: 'hm.settings.alignment-faith-inputs.name',
    hint: 'hm.settings.alignment-faith-inputs.hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: false })
  });

  game.settings.register(HM.ID, 'advancementOrder', {
    name: 'hm.settings.advancement-order.name',
    scope: 'world',
    config: false,
    type: new ArrayField(new ObjectField()),
    default: [
      { id: 'background', label: 'hm.app.tab-names.background', order: 10, sortable: true },
      { id: 'race', label: 'hm.app.tab-names.race', order: 20, sortable: true },
      { id: 'class', label: 'hm.app.tab-names.class', order: 30, sortable: true }
    ]
  });

  HM.log(3, 'Customization settings registered.');
}

/**
 * Registers dice rolling settings for ability score generation.
 */
function registerDiceRollingSettings() {
  game.settings.registerMenu(HM.ID, 'diceRollingMenu', {
    name: 'hm.settings.dice-rolling.menu.name',
    hint: 'hm.settings.dice-rolling.menu.hint',
    icon: 'fa-solid fa-dice',
    label: 'hm.settings.configure-rolling',
    type: DiceRolling,
    restricted: true
  });

  game.settings.register(HM.ID, 'allowedMethods', {
    scope: 'world',
    config: false,
    type: new ObjectField({
      initial: {
        standardArray: true,
        pointBuy: true,
        manual: true
      }
    })
  });

  game.settings.register(HM.ID, 'customRollFormula', {
    name: 'hm.settings.custom-roll-formula.name',
    hint: 'hm.settings.custom-roll-formula.hint',
    scope: 'world',
    config: false,
    type: new StringField({ initial: '4d6kh3' }),
    restricted: true
  });

  game.settings.register(HM.ID, 'customPointBuyTotal', {
    name: 'hm.settings.custom-point-buy-total.name',
    hint: 'hm.settings.custom-point-buy-total.hint',
    scope: 'world',
    config: false,
    type: new NumberField({ initial: 0, integer: true })
  });

  game.settings.register(HM.ID, 'chainedRolls', {
    name: 'hm.settings.chained-rolls.name',
    hint: 'hm.settings.chained-rolls.hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: false })
  });

  game.settings.register(HM.ID, 'rollDelay', {
    name: 'hm.settings.roll-delay.name',
    hint: 'hm.settings.roll-delay.hint',
    scope: 'world',
    config: false,
    type: new NumberField({ initial: 500, min: 100, max: 2000, step: 100, integer: true }),
    range: {
      min: 100,
      max: 2000,
      step: 100
    }
  });

  game.settings.register(HM.ID, 'customStandardArray', {
    name: 'hm.settings.custom-standard-array.name',
    hint: 'hm.settings.custom-standard-array.hint',
    scope: 'world',
    config: false,
    type: new StringField({ initial: '15,14,13,12,10,8' }),
    restricted: true,
    onChange: (value) => StatRoller.validateAndSetCustomStandardArray(value || StatRoller.getStandardArrayDefault())
  });

  game.settings.register(HM.ID, 'abilityScoreDefault', {
    name: 'hm.settings.ability-scores.default.name',
    hint: 'hm.settings.ability-scores.default.hint',
    scope: 'world',
    config: false,
    type: new NumberField({ initial: 8, min: 3, max: 20, step: 1, integer: true }),
    range: {
      min: 3,
      max: 20,
      step: 1
    }
  });

  game.settings.register(HM.ID, 'abilityScoreMin', {
    name: 'hm.settings.ability-scores.min.name',
    hint: 'hm.settings.ability-scores.min.hint',
    scope: 'world',
    config: false,
    type: new NumberField({ initial: 8, min: 3, max: 18, step: 1, integer: true }),
    range: {
      min: 3,
      max: 18,
      step: 1
    }
  });

  game.settings.register(HM.ID, 'abilityScoreMax', {
    name: 'hm.settings.ability-scores.max.name',
    hint: 'hm.settings.ability-scores.max.hint',
    scope: 'world',
    config: false,
    type: new NumberField({ initial: 15, min: 10, max: 20, step: 1, integer: true }),
    range: {
      min: 10,
      max: 20,
      step: 1
    }
  });

  game.settings.register(HM.ID, 'statGenerationSwapMode', {
    name: 'hm.settings.stat-generation-swap-mode.name',
    hint: 'hm.settings.stat-generation-swap-mode.hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: false })
  });

  HM.log(3, 'Dice Rolling settings registered.');
}

/**
 * Registers mandatory fields settings.
 */
function registerMandatoryFieldsSettings() {
  game.settings.registerMenu(HM.ID, 'mandatoryFieldsMenu', {
    name: 'hm.settings.mandatory-fields.menu.name',
    hint: 'hm.settings.mandatory-fields.menu.hint',
    icon: 'fa-solid fa-list-check',
    label: 'hm.settings.configure-mandatory',
    type: MandatoryFields,
    restricted: true
  });

  game.settings.register(HM.ID, 'mandatoryFields', {
    name: 'hm.settings.mandatory-fields.name',
    scope: 'world',
    config: false,
    type: new ArrayField(new StringField())
  });

  HM.log(3, 'Mandatory Field settings registered.');
}

/**
 * Registers troubleshooting settings.
 */
function registerTroubleshootingSettings() {
  game.settings.registerMenu(HM.ID, 'troubleshootingMenu', {
    name: 'hm.settings.troubleshooter.menu.name',
    hint: 'hm.settings.troubleshooter.menu.hint',
    icon: 'fa-solid fa-bug',
    label: 'hm.settings.troubleshooter.generate-report',
    type: Troubleshooter,
    restricted: false
  });

  HM.log(3, 'Troubleshooter settings registered.');
}

/**
 * Registers compatibility settings for other modules.
 */
function registerCompatibilitySettings() {
  if (game.modules.get('elkan5e')?.active) {
    game.settings.register(HM.ID, 'elkanCompatibility', {
      name: 'hm.settings.elkan.name',
      hint: 'hm.settings.elkan.hint',
      scope: 'client',
      config: true,
      type: new BooleanField({ initial: false }),
      requiresReload: true
    });
  }

  if (game.modules.get('vtta-tokenizer')?.active) {
    game.settings.register(HM.ID, 'tokenizerCompatibility', {
      name: 'hm.settings.tokenizer.name',
      scope: 'world',
      config: false,
      type: new BooleanField({ initial: true }),
      requiresReload: true
    });
  }

  if (game.modules.get('dice-so-nice')?.active) {
    game.settings.register(HM.ID, 'enableDiceSoNice', {
      name: 'hm.settings.dicesonice.name',
      hint: 'hm.settings.dicesonice.hint',
      scope: 'client',
      config: true,
      type: new BooleanField({ initial: true })
    });
  }

  HM.log(3, 'Compatibility settings registered.');
}

export const RELOAD = new Set(['enable', 'classPacks', 'racePacks', 'backgroundPacks', 'itemPacks', 'elkanCompatibility', 'tokenizerCompatibility']);

export const RERENDER = new Set([
  'enableRandomize',
  'alignments',
  'deities',
  'eyeColors',
  'hairColors',
  'skinTones',
  'genders',
  'customStandardArray',
  'chainedRolls',
  'rollDelay',
  'customPointBuyTotal',
  'abilityScoreDefault',
  'abilityScoreMin',
  'abilityScoreMax',
  'statGenerationSwapMode',
  'mandatoryFields',
  'enableTokenCustomization',
  'enableNavigationButtons',
  'enablePlayerCustomization'
]);

/**
 * Checks if any modified settings require a reload.
 * @param {object} changedSettings - Object with setting keys that were changed
 * @returns {boolean} True if any changed setting requires a reload
 */
export function needsReload(changedSettings) {
  if (!changedSettings || typeof changedSettings !== 'object') return false;

  return Object.keys(changedSettings).some((key) => RELOAD.has(key));
}

/**
 * Checks if any modified settings require a re-render.
 * @param {object} changedSettings - Object with setting keys that were changed
 * @returns {boolean} True if any changed setting requires a re-render
 */
export function needsRerender(changedSettings) {
  if (!changedSettings || typeof changedSettings !== 'object') return false;

  return Object.keys(changedSettings).some((key) => RERENDER.has(key));
}

/**
 * Re-renders the Hero Mancer application if it exists and updates UI components.
 * @returns {Promise<void>}
 */
export async function rerenderHM() {
  if (!HM.heroMancer) return;
  const app = HM.heroMancer;
  await app.close();
}

/**
 * Mapping of old hyphenated setting keys to new camelCase keys.
 * @type {Object<string, string>}
 */
const SETTING_KEY_MIGRATIONS = {
  'eye-colors': 'eyeColors',
  'hair-colors': 'hairColors',
  'skin-tones': 'skinTones'
};

/**
 * Migrates old hyphenated setting keys to camelCase equivalents.
 * Reads values from the world settings storage, writes to the new keys, and deletes the old entries.
 * Should be called once during the ready hook.
 * @returns {Promise<void>}
 */
export async function migrateSettingKeys() {
  const storage = game.settings.storage.get('world');
  for (const [oldKey, newKey] of Object.entries(SETTING_KEY_MIGRATIONS)) {
    const fullOldKey = `${HM.ID}.${oldKey}`;
    const oldEntry = storage.find((s) => s.key === fullOldKey);
    if (!oldEntry) continue;
    const value = JSON.parse(oldEntry.value);
    await game.settings.set(HM.ID, newKey, value);
    await oldEntry.delete();
    HM.log(3, `Migrated setting '${oldKey}' → '${newKey}'`);
  }
}
