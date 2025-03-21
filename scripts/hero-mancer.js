import { registerSettings } from './settings.js';
import { CustomCompendiums, DiceRolling, DocumentService, EquipmentParser, HtmlManipulator, StatRoller } from './utils/index.js';

/**
 * Main Hero Mancer class, define some statics that will be used everywhere in the module.
 * @class
 */
export class HM {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  static ID = 'hero-mancer';

  static NAME = 'Hero Mancer';

  static DOCS = { race: null, class: null, background: null };

  static COMPAT = {};

  static ABILITY_SCORES = {};

  static LOG_LEVEL = 0;

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  static init() {
    this.initSettings();
    this.LOG_LEVEL = parseInt(game.settings.get(this.ID, 'loggingLevel'));
    this.DOCS = { ...this.DOCS }; // Clone default structure
    this.ABILITY_SCORES = {
      DEFAULT: game.settings.get(this.ID, 'abilityScoreDefault') || 8,
      MIN: game.settings.get(this.ID, 'abilityScoreMin') || 8,
      MAX: game.settings.get(this.ID, 'abilityScoreMax') || 15
    };
    HM.log(3, `Ability score configuration: Default=${this.ABILITY_SCORES.DEFAULT}, Min=${this.ABILITY_SCORES.MIN}, Max=${this.ABILITY_SCORES.MAX}`);

    // Logging setup
    if (this.LOG_LEVEL > 0) {
      const logMessage = `Logging level set to ${
        this.LOG_LEVEL === 1 ? 'Errors'
        : this.LOG_LEVEL === 2 ? 'Warnings'
        : 'Verbose'
      }`;
      HM.log(3, logMessage); // Log at verbose level
    }
  }

  /* Register Settings */
  static initSettings() {
    console.log(`${HM.ID} | Registering module settings.`);
    registerSettings();

    Hooks.once('renderSettingConfig', () => {
      this.customCompendiums = new CustomCompendiums();
      this.diceRolling = new DiceRolling();
    });
  }

  /**
   * Custom logger.
   * @param {number} level 0-3 to define log level to catch. 0 = disabled.
   * @param {any} args Strings, variables to log to console.
   */
  static log(level, ...args) {
    if (this.LOG_LEVEL > 0 && level <= this.LOG_LEVEL) {
      switch (level) {
        case 1:
          console.error(`${HM.ID} |`, ...args);
          break;
        case 2:
          console.warn(`${HM.ID} |`, ...args);
          break;
        case 3:
        default:
          console.debug(`${HM.ID} |`, ...args);
          break;
      }
    }
  }

  /**
   * Prepares and caches game documents
   * @throws {Error} If document preparation fails
   * @async
   */
  static async loadAndEnrichDocuments() {
    HM.log(3, 'Preparing documents for Hero Mancer');

    try {
      const [raceDocs, classDocs, backgroundDocs] = await Promise.all([
        DocumentService.prepareDocumentsByType('race'),
        DocumentService.prepareDocumentsByType('class'),
        DocumentService.prepareDocumentsByType('background')
      ]);

      // Store in HM.documents
      this.documents = { race: raceDocs, class: classDocs, background: backgroundDocs };

      // Handle different structures for collection
      const allDocs = [...(raceDocs?.flatMap((folder) => folder.docs) || []), ...(classDocs || []), ...(backgroundDocs || [])];

      // Enrich descriptions
      await Promise.all(
        allDocs.map(async (doc) => {
          if (doc?.description) {
            try {
              doc.enrichedDescription = await TextEditor.enrichHTML(doc.description);
              doc.enrichedDescription = doc.enrichedDescription
                .replace(/<h3/g, '<h2')
                .replace(/<\/h3/g, '</h2')
                .replace(/<\/ h3/g, '</ h2');
            } catch (error) {
              HM.log(1, `Failed to enrich description for '${doc.name}':`, error);
            }
          }
        })
      );

      HM.log(3, 'Document preparation complete', { doc: this.documents, allDocs: allDocs });
    } catch (error) {
      HM.log(1, 'Failed to prepare documents:', error.message);
      throw error;
    }
  }
}

HM.SELECTED = {
  class: { value: '', id: '', uuid: '' },
  race: { value: '', id: '', uuid: '' },
  background: { value: '', id: '', uuid: '' }
};

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.on('init', () => {
  HM.init();
  CONFIG.Item.compendiumIndexFields = ['_id', 'name', 'pack', 'system.description.value', 'system.identifier', 'system.properties', 'system.type.value', 'type', 'uuid'];
});

Hooks.once('ready', async () => {
  if (!game.settings.get(HM.ID, 'enable')) return;
  for (const pack of game.packs.filter((p) => p.documentName === 'Item')) {
    await pack.getIndex();
  }
  if (game.modules.get('elkan5e')?.active && game.settings.get(HM.ID, 'elkanCompatibility')) {
    HM.COMPAT = { ELKAN: true };
    HM.log(3, 'Elkan Detected: Compatibility auto-enabled.');
  }
  await HM.loadAndEnrichDocuments();

  // Load compendium selections
  CustomCompendiums.classPacks = game.settings.get(HM.ID, 'classPacks');
  CustomCompendiums.racePacks = game.settings.get(HM.ID, 'racePacks');
  CustomCompendiums.backgroundPacks = game.settings.get(HM.ID, 'backgroundPacks');
  CustomCompendiums.itemPacks = game.settings.get(HM.ID, 'itemPacks');

  HM.log(3, {
    class: CustomCompendiums.classPacks,
    race: CustomCompendiums.racePacks,
    background: CustomCompendiums.backgroundPacks,
    items: CustomCompendiums.itemPacks
  });
  if (!HM.COMPAT.ELKAN) await EquipmentParser.initializeLookupItems(); // Completely disable EquipmentParser if Elkan is enabled.

  const customArraySetting = game.settings.get(HM.ID, 'customStandardArray') || StatRoller.getStandardArrayDefault();
  if (!customArraySetting || customArraySetting.trim() === '') {
    await game.settings.set(HM.ID, 'customStandardArray', StatRoller.getStandardArrayDefault());
    HM.log(3, 'Custom Standard Array was reset to default values due to invalid length.');
  }
});

Hooks.on('renderActorDirectory', () => {
  HtmlManipulator.registerButton();
});
