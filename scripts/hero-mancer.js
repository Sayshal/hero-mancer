import { registerSettings } from './settings.js';
import { API, DocumentService, EquipmentParser, HeroMancer, StatRoller } from './utils/index.js';

/**
 * Main Hero Mancer class, define some statics that will be used everywhere in the module.
 * @class
 */
export class HM {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /**
   * Module identifier used for settings and prefixing
   * @static
   * @type {string}
   */
  static ID = 'hero-mancer';

  /**
   * Display name of the module
   * @static
   * @type {string}
   */
  static NAME = 'Hero Mancer';

  /**
   * Compatibility flags for other modules
   * @static
   * @type {Object}
   */
  static COMPAT = {};

  /**
   * Configuration for ability score limits
   * @static
   * @type {Object}
   * @property {number} DEFAULT - Default ability score value
   * @property {number} MIN - Minimum allowed ability score
   * @property {number} MAX - Maximum allowed ability score
   */
  static ABILITY_SCORES = {};

  /**
   * Current logging level (0=disabled, 1=errors, 2=warnings, 3=verbose)
   * @static
   * @type {number}
   */
  static LOG_LEVEL = 0;

  /**
   * Stores the currently selected character options
   * @static
   * @type {Object}
   * @property {Object} class - Selected class
   * @property {string} class.value - Default value of selected class
   * @property {string} class.id - ID of selected class
   * @property {string} class.uuid - UUID of class document
   * @property {Object} race - Selected race
   * @property {string} race.value - Default value of selected race
   * @property {string} race.id - ID of selected race
   * @property {string} race.uuid - UUID of race document
   * @property {Object} background - Selected background
   * @property {string} background.value - Default value of selected background
   * @property {string} background.id - ID of selected background
   * @property {string} background.uuid - UUID of background document
   */
  static SELECTED = {
    class: { value: '', id: '', uuid: '' },
    race: { value: '', id: '', uuid: '' },
    background: { value: '', id: '', uuid: '' }
  };

  /**
   * Public API for equipment selection functionality
   * @static
   * @type {Object}
   */
  static API = API;

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Initialize the Hero Mancer module
   * @static
   * @returns {void}
   */
  static init() {
    registerSettings();
    this.LOG_LEVEL = parseInt(game.settings.get(this.ID, 'loggingLevel'));
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

  /**
   * Custom logger with caller context information
   * @static
   * @param {number} level - Log level (1=error, 2=warning, 3=verbose)
   * @param {...any} args - Content to log to console
   * @returns {void}
   */
  static log(level, ...args) {
    // Get calling context using Error stack trace
    const stack = new Error().stack.split('\n');
    let callerInfo = '';

    if (stack.length > 2) {
      const callerLine = stack[2].trim();
      const callerMatch = callerLine.match(/at\s+([^.]+)\.(\w+)/);
      if (callerMatch) {
        callerInfo = `[${callerMatch[1]}.${callerMatch[2]}] : `;
      }
    }

    // Prepend caller info to first argument if it's a string
    if (typeof args[0] === 'string') {
      args[0] = callerInfo + args[0];
    } else {
      // Insert caller info as first argument
      args.unshift(callerInfo);
    }

    const now = new Date();
    const logEntry = {
      type:
        level === 1 ? 'error'
        : level === 2 ? 'warn'
        : 'debug',
      timestamp: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`,
      level,
      content: args
    };

    if (!window.console_logs) window.console_logs = [];
    window.console_logs.push(logEntry);

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
   * Shows a confirmation dialog for reloading the world/application
   * @static
   * @async
   * @param {Object} [options={}] - Configuration options
   * @param {boolean} [options.world=false] - Whether to reload the entire world (true) or just the client (false)
   * @returns {Promise<void>} - Resolves after the reload is triggered or canceled
   * @throws {Error} - If the dialog cannot be displayed
   */
  static async reloadConfirm({ world = false } = {}) {
    const reload = await foundry.applications.api.DialogV2.confirm({
      id: 'reload-world-confirm',
      modal: true,
      rejectClose: false,
      window: { title: 'SETTINGS.ReloadPromptTitle' },
      position: { width: 400 },
      content: `<p>${game.i18n.localize('SETTINGS.ReloadPromptBody')}</p>`
    });
    if (!reload) return;
    if (world && game.user.can('SETTINGS_MODIFY')) game.socket.emit('reload');
    foundry.utils.debouncedReload();
  }

  /**
   * Check and set compatibility flags for other modules
   * @static
   * @returns {void}
   */
  static checkModuleCompatibility() {
    // Reset compatibility flags
    HM.COMPAT = {};

    // Elkan compatibility
    if (game.modules.get('elkan5e')?.active && game.settings.get(HM.ID, 'elkanCompatibility')) {
      HM.COMPAT = { ELKAN: true };
      HM.log(3, 'Elkan Detected: Compatibility auto-enabled.');
    }

    // Cauldron of Plentiful Resources compatibility
    if (game.modules.get('chris-premades')?.active) {
      HM.COMPAT = { CPR: true };
      HM.log(3, 'CPR Detected: Compatibility auto-enabled.');
    }

    // Tokenizer compatibility
    if (game.modules.get('vtta-tokenizer')?.active) {
      HM.COMPAT.TOKENIZER = true;
      HM.log(3, 'Tokenizer Detected: Compatibility auto-enabled.');
    }
  }
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.on('init', () => {
  HM.init();
  CONFIG.Item.compendiumIndexFields = [
    '_id',
    'name',
    'pack',
    'system.description.value',
    'system.identifier',
    'system.item',
    'system.properties',
    'system.source.rules',
    'system.startingEquipment',
    'system.type.value',
    'system.wealth',
    'type',
    'uuid'
  ];
  CONFIG.JournalEntry.compendiumIndexFields = ['_id', 'name', 'pages', 'type', 'uuid'];
});

Hooks.once('ready', async () => {
  if (!game.settings.get(HM.ID, 'enable')) return;

  HM.checkModuleCompatibility();
  await DocumentService.loadAndInitializeDocuments();

  if (!HM.COMPAT.ELKAN) await EquipmentParser.initializeLookupItems(); // Completely disable EquipmentParser if Elkan is enabled.

  const customArraySetting = game.settings.get(HM.ID, 'customStandardArray') || StatRoller.getStandardArrayDefault();
  if (!customArraySetting || customArraySetting.trim() === '') {
    game.settings.set(HM.ID, 'customStandardArray', StatRoller.getStandardArrayDefault());
    HM.log(3, 'Custom Standard Array was reset to default values due to invalid length.');
  }

  globalThis.heroMancer = HM.API;
  Hooks.callAll('heroMancer.Ready', this);
});

Hooks.on('renderActorDirectory', () => {
  if (!game.settings.get(HM.ID, 'enable')) return;
  // Find header actions container
  const headerActions = document.querySelector('section[class*="actors-sidebar"] header[class*="directory-header"] div[class*="header-actions"]');
  if (!headerActions) return;

  // Don't create duplicate buttons
  if (headerActions.querySelector('.hm-actortab-button')) return;

  // Create button (initially disabled)
  const button = document.createElement('button');
  button.type = 'button';
  button.classList.add('hm-actortab-button');
  button.setAttribute('title', game.i18n.localize('hm.actortab-button.hint'));
  button.innerHTML = `<i class="fa-solid fa-egg" style="color: var(--user-color)"></i> ${game.i18n.localize('hm.actortab-button.name')}`;

  button.addEventListener('click', () => {
    if (HM.heroMancer) {
      HM.heroMancer.close();
      HM.heroMancer = null;
    }

    HM.heroMancer = new HeroMancer();
    HM.heroMancer.render(true);
  });

  // Insert button before the create folder button
  const createFolderButton = headerActions.querySelector('button[class*="create-folder"]');
  headerActions.insertBefore(button, createFolderButton);
});
