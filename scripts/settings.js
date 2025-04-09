import { CharacterArtPicker, CustomCompendiums, Customization, DiceRolling, HM, MandatoryFields, StatRoller, Troubleshooter } from './utils/index.js';

/**
 * Main registration function that initializes all module settings.
 * Calls specialized registration functions for different setting categories.
 * @function
 * @returns {void}
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
 * Registers core settings that control basic module functionality
 * @function
 * @returns {void}
 */
function registerCoreSettings() {
  game.settings.register(HM.ID, 'enable', {
    name: 'hm.settings.enable.name',
    hint: 'hm.settings.enable.hint',
    default: true,
    type: Boolean,
    scope: 'client',
    config: true,
    requiresReload: true
  });

  game.settings.register(HM.ID, 'enableNavigationButtons', {
    name: 'hm.settings.nav-buttons.name',
    hint: 'hm.settings.nav-buttons.name',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(HM.ID, 'loggingLevel', {
    name: 'hm.settings.logger.name',
    hint: 'hm.settings.logger.hint',
    scope: 'client',
    config: true,
    type: String,
    choices: {
      0: 'hm.settings.logger.choices.off',
      1: 'hm.settings.logger.choices.errors',
      2: 'hm.settings.logger.choices.warnings',
      3: 'hm.settings.logger.choices.verbose'
    },
    default: 2,
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
    type: Boolean,
    default: true
  });

  game.settings.register(HM.ID, 'diceRollingMethod', {
    scope: 'client',
    config: false,
    type: String,
    default: 'standardArray'
  });

  HM.log(3, 'Core settings registered.');
}

/**
 * Registers custom compendium settings and related configuration
 * @function
 * @returns {void}
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
    type: Array,
    default: []
  });

  game.settings.register(HM.ID, 'racePacks', {
    name: 'hm.settings.race-packs.name',
    scope: 'world',
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(HM.ID, 'backgroundPacks', {
    name: 'hm.settings.background-packs.name',
    scope: 'world',
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(HM.ID, 'itemPacks', {
    name: 'hm.settings.item-packs.name',
    scope: 'world',
    config: false,
    type: Array,
    default: []
  });

  HM.log(3, 'Compendium settings registered.');
}

/**
 * Registers customization settings for appearance and character options
 * @function
 * @returns {void}
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
    type: String,
    filePicker: 'folder',
    default: '/',
    onChange: (value) => {
      CharacterArtPicker.rootDirectory = value;
    }
  });

  game.settings.register(HM.ID, 'enablePlayerCustomization', {
    name: 'hm.settings.player-customization.name',
    hint: 'hm.settings.player-customization.hint',
    default: false,
    type: Boolean,
    scope: 'world',
    config: false,
    requiresReload: true
  });

  game.settings.register(HM.ID, 'enableTokenCustomization', {
    name: 'hm.settings.token-customization.name',
    hint: 'hm.settings.token-customization.hint',
    default: false,
    type: Boolean,
    scope: 'world',
    config: false,
    requiresReload: true
  });

  game.settings.register(HM.ID, 'alignments', {
    name: 'hm.settings.alignments.name',
    hint: 'hm.settings.alignments.hint',
    scope: 'world',
    config: false,
    type: String,
    default: 'Lawful Good, Neutral Good, Chaotic Good, Lawful Neutral, True Neutral, Chaotic Neutral, Lawful Evil, Neutral Evil, Chaotic Evil',
    restricted: true
  });

  game.settings.register(HM.ID, 'deities', {
    name: 'hm.settings.deities.name',
    hint: 'hm.settings.deities.hint',
    scope: 'world',
    config: false,
    type: String,
    default: 'Aphrodite,Apollo,Ares,Artemis,Athena,Demeter,Dionysus,Hades,Hecate,Hephaestus,Hera,Hercules,Hermes,Hestia,Nike,Pan,Poseidon,Tyche,Zeus',
    restricted: true
  });

  game.settings.register(HM.ID, 'eye-colors', {
    name: 'hm.settings.eye-colors.name',
    hint: 'hm.settings.eye-colors.hint',
    scope: 'world',
    config: false,
    type: String,
    default: 'Blue,Green,Brown,Hazel,Gray,Amber,Black',
    restricted: true
  });

  game.settings.register(HM.ID, 'hair-colors', {
    name: 'hm.settings.hair-colors.name',
    hint: 'hm.settings.hair-colors.hint',
    scope: 'world',
    config: false,
    type: String,
    default: 'Black,Brown,Blonde,Red,Gray,White,Chestnut,Auburn',
    restricted: true
  });

  game.settings.register(HM.ID, 'skin-tones', {
    name: 'hm.settings.skin-tones.name',
    hint: 'hm.settings.skin-tones.hint',
    scope: 'world',
    config: false,
    type: String,
    default: 'Pale,Fair,Light,Medium,Tan,Dark,Brown,Black',
    restricted: true
  });

  game.settings.register(HM.ID, 'genders', {
    name: 'hm.settings.genders.name',
    hint: 'hm.settings.genders.hint',
    scope: 'world',
    config: false,
    type: String,
    default: 'Male,Female,Non-Binary,Genderfluid,Agender',
    restricted: true
  });

  game.settings.register(HM.ID, 'enableRandomize', {
    name: 'hm.settings.randomize.name',
    hint: 'hm.settings.randomize.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false
  });

  HM.log(3, 'Customization settings registered.');
}

/**
 * Registers dice rolling settings for ability score generation
 * @function
 * @returns {void}
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
    type: Object,
    default: {
      standardArray: true,
      pointBuy: true,
      manual: true
    }
  });

  game.settings.register(HM.ID, 'customRollFormula', {
    name: 'hm.settings.custom-roll-formula.name',
    hint: 'hm.settings.custom-roll-formula.hint',
    scope: 'world',
    config: false,
    type: String,
    restricted: true,
    default: '4d6kh3'
  });

  game.settings.register(HM.ID, 'customPointBuyTotal', {
    name: 'hm.settings.custom-point-buy-total.name',
    hint: 'hm.settings.custom-point-buy-total.hint',
    scope: 'world',
    config: false,
    type: Number,
    default: 0
  });

  game.settings.register(HM.ID, 'chainedRolls', {
    name: 'hm.settings.chained-rolls.name',
    hint: 'hm.settings.chained-rolls.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(HM.ID, 'rollDelay', {
    name: 'hm.settings.roll-delay.name',
    hint: 'hm.settings.roll-delay.hint',
    scope: 'world',
    config: false,
    type: Number,
    range: {
      min: 100,
      max: 2000,
      step: 100
    },
    default: 500
  });

  game.settings.register(HM.ID, 'customStandardArray', {
    name: 'hm.settings.custom-standard-array.name',
    hint: 'hm.settings.custom-standard-array.hint',
    scope: 'world',
    config: false,
    type: String,
    restricted: true,
    default: '15,14,13,12,10,8',
    onChange: (value) => StatRoller.validateAndSetCustomStandardArray(value || StatRoller.getStandardArrayDefault())
  });

  game.settings.register(HM.ID, 'abilityScoreDefault', {
    name: 'hm.settings.ability-scores.default.name',
    hint: 'hm.settings.ability-scores.default.hint',
    scope: 'world',
    config: false,
    type: Number,
    default: 8,
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
    type: Number,
    default: 8,
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
    type: Number,
    default: 15,
    range: {
      min: 10,
      max: 20,
      step: 1
    }
  });

  game.settings.register(HM.ID, 'standardArraySwapMode', {
    name: 'hm.settings.standard-array-swap-mode.name',
    hint: 'hm.settings.standard-array-swap-mode.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false
  });

  HM.log(3, 'Dice Rolling settings registered.');
}

/**
 * Registers mandatory fields settings
 * @function
 * @returns {void}
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
    type: Array,
    default: []
  });

  HM.log(3, 'Mandatory Field settings registered.');
}

/**
 * Registers troubleshooting settings
 * @function
 * @returns {void}
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
 * Registers compatibility settings for other modules
 * @function
 * @returns {void}
 */
function registerCompatibilitySettings() {
  if (game.modules.get('elkan5e')?.active) {
    game.settings.register(HM.ID, 'elkanCompatibility', {
      name: 'hm.settings.elkan.name',
      hint: 'hm.settings.elkan.hint',
      scope: 'client',
      config: true,
      type: Boolean,
      default: false,
      requiresReload: true
    });
  }

  HM.log(3, 'Compatibility settings registered.');
}
