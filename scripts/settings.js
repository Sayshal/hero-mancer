import { CharacterArtPicker, CustomCompendiums, DiceRolling, HM, MandatoryFields, StatRoller } from './utils/index.js';

/**
 * Main registration function that initializes all module settings.
 * Sets up core, world, dice, and compendium settings and handles
 * the ready hook for standard array initialization.
 * @function
 */
export function registerSettings() {
  game.settings.register(HM.CONFIG.ID, 'enable', {
    name: 'hm.settings.enable.name',
    hint: 'hm.settings.enable.hint',
    default: true,
    type: Boolean,
    scope: 'client',
    config: true,
    requiresReload: true
  });

  game.settings.register(HM.CONFIG.ID, 'artPickerRoot', {
    name: 'hm.settings.art-picker-root.name',
    hint: 'hm.settings.art-picker-root.hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: String,
    filePicker: 'folder',
    default: '/',
    onChange: (value) => {
      CharacterArtPicker.rootDirectory = value;
    }
  });

  game.settings.register(HM.CONFIG.ID, 'enablePlayerCustomization', {
    name: 'hm.settings.player-customization.name',
    hint: 'hm.settings.player-customization.hint',
    default: false,
    type: Boolean,
    scope: 'world',
    config: true,
    requiresReload: true
  });

  game.settings.register(HM.CONFIG.ID, 'enableTokenCustomization', {
    name: 'hm.settings.token-customization.name',
    hint: 'hm.settings.token-customization.hint',
    default: false,
    type: Boolean,
    scope: 'world',
    config: true,
    requiresReload: true
  });

  game.settings.registerMenu(HM.CONFIG.ID, 'customCompendiumMenu', {
    name: 'hm.settings.custom-compendiums.menu.name',
    hint: 'hm.settings.custom-compendiums.menu.hint',
    icon: 'fa-solid fa-atlas',
    label: 'hm.settings.configure-compendiums',
    type: CustomCompendiums,
    restricted: true,
    requiresReload: true
  });

  game.settings.registerMenu(HM.CONFIG.ID, 'diceRollingMenu', {
    name: 'hm.settings.dice-rolling.menu.name',
    hint: 'hm.settings.dice-rolling.menu.hint',
    icon: 'fa-solid fa-dice',
    label: 'hm.settings.configure-rolling',
    type: DiceRolling,
    restricted: true
  });

  game.settings.registerMenu(HM.CONFIG.ID, 'mandatoryFieldsMenu', {
    name: 'hm.settings.mandatory-fields.menu.name',
    hint: 'hm.settings.mandatory-fields.menu.hint',
    icon: 'fa-solid fa-list-check',
    label: 'hm.settings.configure-mandatory',
    type: MandatoryFields,
    restricted: true
  });

  game.settings.register(HM.CONFIG.ID, 'alignments', {
    name: 'hm.settings.alignments.name',
    hint: 'hm.settings.alignments.hint',
    scope: 'world',
    config: true,
    type: String,
    default: 'Lawful Good, Neutral Good, Chaotic Good, Lawful Neutral, True Neutral, Chaotic Neutral, Lawful Evil, Neutral Evil, Chaotic Evil',
    restricted: true
  });

  game.settings.register(HM.CONFIG.ID, 'deities', {
    name: 'hm.settings.deities.name',
    hint: 'hm.settings.deities.hint',
    scope: 'world',
    config: true,
    type: String,
    default: 'Aphrodite,Apollo,Ares,Artemis,Athena,Demeter,Dionysus,Hades,Hecate,Hephaestus,Hera,Hercules,Hermes,Hestia,Nike,Pan,Poseidon,Tyche,Zeus',
    restricted: true
  });

  game.settings.register(HM.CONFIG.ID, 'loggingLevel', {
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

  if (game.modules.get('elkan5e')?.active) {
    game.settings.register(HM.CONFIG.ID, 'elkanCompatibility', {
      name: 'hm.settings.elkan.name',
      hint: 'hm.settings.elkan.hint',
      scope: 'client',
      config: true,
      type: Boolean,
      default: false,
      requiresReload: true
    });
  }

  /** These settings are within menus so their order is based on their class structure. */

  game.settings.register(HM.CONFIG.ID, 'diceRollingMethod', {
    scope: 'client',
    config: false,
    type: String,
    default: 'standardArray'
  });

  game.settings.register(HM.CONFIG.ID, 'allowedMethods', {
    scope: 'world',
    config: false,
    type: Object,
    default: {
      standardArray: true,
      pointBuy: true,
      manual: true
    }
  });

  game.settings.register(HM.CONFIG.ID, 'customRollFormula', {
    name: 'hm.settings.custom-roll-formula.name',
    hint: 'hm.settings.custom-roll-formula.hint',
    scope: 'world',
    config: false,
    type: String,
    restricted: true,
    default: '4d6kh3'
  });

  game.settings.register(HM.CONFIG.ID, 'customPointBuyTotal', {
    name: 'hm.settings.custom-point-buy-total.name',
    hint: 'hm.settings.custom-point-buy-total.hint',
    scope: 'world',
    config: false,
    type: Number,
    default: 0
  });

  game.settings.register(HM.CONFIG.ID, 'chainedRolls', {
    name: 'hm.settings.chained-rolls.name',
    hint: 'hm.settings.chained-rolls.hint',
    scope: 'world',
    config: false,
    type: Boolean,
    default: false
  });

  game.settings.register(HM.CONFIG.ID, 'rollDelay', {
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

  game.settings.register(HM.CONFIG.ID, 'customStandardArray', {
    name: 'hm.settings.custom-standard-array.name',
    hint: 'hm.settings.custom-standard-array.hint',
    scope: 'world',
    config: false,
    type: String,
    restricted: true,
    default: StatRoller.getStandardArrayDefault(),
    onChange: (value) => StatRoller.validateAndSetCustomStandardArray(value || StatRoller.getStandardArrayDefault())
  });

  game.settings.register(HM.CONFIG.ID, 'classPacks', {
    name: 'hm.settings.class-packs.name',
    scope: 'world',
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(HM.CONFIG.ID, 'racePacks', {
    name: 'hm.settings.race-packs.name',
    scope: 'world',
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(HM.CONFIG.ID, 'backgroundPacks', {
    name: 'hm.settings.background-packs.name',
    scope: 'world',
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(HM.CONFIG.ID, 'itemPacks', {
    name: 'hm.settings.item-packs.name',
    scope: 'world',
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(HM.CONFIG.ID, 'mandatoryFields', {
    name: 'hm.settings.mandatory-fields.name',
    scope: 'world',
    config: false,
    type: Array,
    default: []
  });
}
