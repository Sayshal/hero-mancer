import {
  ActorCreationService,
  CharacterArtPicker,
  DropdownHandler,
  EquipmentParser,
  EventDispatcher,
  HM,
  HtmlManipulator,
  Listeners,
  MandatoryFields,
  MutationObserverRegistry,
  ProgressBar,
  SavedOptions,
  StatRoller,
  SummaryManager
} from '../utils/index.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class HeroMancer extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  static selectedAbilities = [];

  static ORIGINAL_PLAYER_COLORS = new Map();

  /** @override */
  static DEFAULT_OPTIONS = {
    id: `${HM.ID}-app`,
    tag: 'form',
    form: {
      handler: HeroMancer.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    actions: {
      rollStat: HeroMancer.rollStat,
      adjustScore: StatRoller.adjustScore,
      selectCharacterArt: CharacterArtPicker.selectCharacterArt,
      selectTokenArt: CharacterArtPicker.selectTokenArt,
      selectPlayerAvatar: CharacterArtPicker.selectPlayerAvatar,
      resetOptions: HeroMancer.resetOptions,
      nosubmit: HeroMancer.noSubmit
    },
    classes: ['hm-app'],
    position: {
      height: 'auto',
      width: 'auto',
      top: '100'
    },
    window: {
      icon: 'fa-solid fa-egg',
      resizable: false,
      minimizable: true
    }
  };

  /** @override */
  static PARTS = {
    header: { template: 'modules/hero-mancer/templates/app-header.hbs', classes: ['hm-app-header'] },
    tabs: { template: 'modules/hero-mancer/templates/app-nav.hbs', classes: ['hm-app-nav'] },
    start: { template: 'modules/hero-mancer/templates/tab-start.hbs', classes: ['hm-app-tab-content'] },
    background: { template: 'modules/hero-mancer/templates/tab-background.hbs', classes: ['hm-app-tab-content'] },
    race: { template: 'modules/hero-mancer/templates/tab-race.hbs', classes: ['hm-app-tab-content'] },
    class: { template: 'modules/hero-mancer/templates/tab-class.hbs', classes: ['hm-app-tab-content'] },
    abilities: { template: 'modules/hero-mancer/templates/tab-abilities.hbs', classes: ['hm-app-tab-content'] },
    equipment: { template: 'modules/hero-mancer/templates/tab-equipment.hbs', classes: ['hm-app-tab-content'] },
    finalize: { template: 'modules/hero-mancer/templates/tab-finalize.hbs', classes: ['hm-app-tab-content'] },
    footer: { template: 'modules/hero-mancer/templates/app-footer.hbs', classes: ['hm-app-footer'] }
  };

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  #isRendering;

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  constructor(options = {}) {
    super(options);
  }

  /* -------------------------------------------- */
  /*  Getters & Setters                           */
  /* -------------------------------------------- */

  get title() {
    return `${HM.NAME} | ${game.user.name}`;
  }

  /* -------------------------------------------- */
  /*  Protected Methods                           */
  /* -------------------------------------------- */

  /**
   * Prepares the main context data for the character creation application
   * Initializes abilities, processes compatibility settings, and prepares all tab data
   * @async
   * @param {object} options - Application render options
   * @returns {Promise<object>} Complete context for character creation rendering
   * @protected
   * @override
   */
  async _prepareContext(options) {
    if (!HM.documents.race || !HM.documents.class || !HM.documents.background) {
      ui.notifications.info('hm.actortab-button.loading', { localize: true });
    }

    game.users.forEach((user) => {
      HeroMancer.ORIGINAL_PLAYER_COLORS.set(user.id, user.color.css);
    });

    // Handle ELKAN compatibility
    if (HM.COMPAT?.ELKAN) {
      options.parts = options.parts.filter((part) => part !== 'equipment');
    }

    // Prepare context with globally required data
    let context = {
      raceDocs: HM.documents.race || [],
      classDocs: HM.documents.class || [],
      backgroundDocs: HM.documents.background || [],
      tabs: this._getTabs(options.parts),
      players: game.users.map((user) => ({
        id: user.id,
        name: user.name,
        color: user.color.css
      }))
    };
    HM.log(3, 'Full Context:', context);
    return context;
  }

  /**
   * Prepares context data for a specific part/tab of the application
   * Handles specific logic for each tab section (start, race, class, etc.)
   * @param {string} partId - ID of the template part being rendered
   * @param {object} context - Shared context from _prepareContext
   * @returns {object} Modified context for the specific part
   * @protected
   * @override
   */
  _preparePartContext(partId, context) {
    const abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;
    HeroMancer.selectedAbilities = Array(abilitiesCount).fill(HM.ABILITY_SCORES.DEFAULT);

    // Get dice rolling method
    const diceRollMethod = StatRoller.getDiceRollingMethod();
    try {
      // Set tab data for all parts that have a tab
      if (context.tabs?.[partId]) {
        context.tab = context.tabs[partId];
      }

      switch (partId) {
        case 'start':
          context.playerCustomizationEnabled = game.settings.get(HM.ID, 'enablePlayerCustomization');
          context.tokenCustomizationEnabled = game.settings.get(HM.ID, 'enableTokenCustomization');
          context.token = this.#getTokenConfig();
          context.isGM = game.user.isGM;
          break;
        case 'abilities':
          context.abilities = StatRoller.buildAbilitiesContext();
          context.rollStat = this.rollStat;
          context.rollMethods = StatRoller.getRollMethods();
          context.diceRollMethod = diceRollMethod;
          context.allowedMethods = game.settings.get(HM.ID, 'allowedMethods');
          context.standardArray = StatRoller.getStandardArrayValues(diceRollMethod);
          context.selectedAbilities = HeroMancer.selectedAbilities;
          context.totalPoints = StatRoller.getTotalPoints();
          context.pointsSpent = StatRoller.calculateTotalPointsSpent(HeroMancer.selectedAbilities);
          context.remainingPoints = context.totalPoints - context.pointsSpent;
          context.chainedRolls = game.settings.get(HM.ID, 'chainedRolls');
          break;
        case 'finalize':
          context.alignments =
            game.settings
              .get(HM.ID, 'alignments')
              .split(',')
              .map((d) => d.trim()) || [];
          context.deities =
            game.settings
              .get(HM.ID, 'deities')
              .split(',')
              .map((d) => d.trim()) || [];
          break;
      }
      return context;
    } catch (error) {
      HM.log(1, `Error preparing context for part ${partId}:`, error);
      return context;
    }
  }

  /**
   * Generate the data for tab navigation using the ApplicationV2 structure.
   * @param {string[]} parts An array of parts that correspond to tabs
   * @returns {Record<string, Partial<ApplicationTab>>}
   * @protected
   * @override
   */
  _getTabs(parts) {
    try {
      const tabGroup = 'hero-mancer-tabs';
      if (!this.tabGroups[tabGroup]) {
        this.tabGroups[tabGroup] = 'start';
      }

      // Define tab configurations in a map
      const tabConfigs = {
        start: { icon: 'fa-solid fa-play-circle' },
        background: { icon: 'fa-solid fa-scroll' },
        race: { icon: 'fa-solid fa-feather-alt' },
        class: { icon: 'fa-solid fa-chess-rook' },
        abilities: { icon: 'fa-solid fa-fist-raised' },
        equipment: {
          icon: 'fa-solid fa-shield-halved',
          skipIf: () => HM.COMPAT?.ELKAN
        },
        finalize: { icon: 'fa-solid fa-check-circle' }
      };

      // Skip these parts as they're not tabs
      const nonTabs = ['header', 'tabs', 'footer'];

      return parts.reduce((tabs, partId) => {
        // Skip non-tab parts or unknown parts
        if (nonTabs.includes(partId) || !tabConfigs[partId]) return tabs;

        // Skip if specified by condition
        const config = tabConfigs[partId];
        if (config.skipIf && config.skipIf()) return tabs;

        tabs[partId] = {
          id: partId,
          label: game.i18n.localize(`hm.app.tab-names.${partId}`),
          group: tabGroup,
          cssClass: this.tabGroups[tabGroup] === partId ? 'active' : '',
          icon: config.icon
        };

        return tabs;
      }, {});
    } catch (error) {
      HM.log(1, 'Error generating tabs:', error);
      return {
        start: {
          id: 'start',
          label: game.i18n.localize('hm.app.tab-names.start'),
          group: 'hero-mancer-tabs',
          cssClass: 'active',
          icon: 'fa-solid fa-play-circle'
        }
      };
    }
  }

  /**
   * Actions performed after the first render of the Application.
   * @param {ApplicationRenderContext} context Prepared context data
   * @param {RenderOptions} options Provided render options
   * @protected
   * @override
   */
  _onFirstRender(context, options) {
    // Setup player dropdown - only needs to happen once
    if (game.user.isGM) {
      const playerElement = this.element?.querySelector('#player-assignment');
      if (playerElement) {
        playerElement.addEventListener('change', (event) => {
          const playerId = event.currentTarget.value;
          const colorPicker = this.element.querySelector('#player-color');
          if (colorPicker) {
            colorPicker.value = HeroMancer.ORIGINAL_PLAYER_COLORS.get(playerId);
          }
        });
      }
    }

    // Initialize one-time listeners
    SummaryManager.initializeSummaryListeners();
  }

  /**
   * Actions performed after any render of the Application.
   * @param {ApplicationRenderContext} context Prepared context data
   * @param {RenderOptions} _options Provided render options
   * @protected
   * @override
   */
  async _onRender(context, _options) {
    if (this.#isRendering) return;
    try {
      this.#isRendering = true;

      // Clean up existing listeners
      await HeroMancer.cleanupEventListeners(this);
      EventDispatcher.clearAll();

      // Initialize dropdowns
      ['class', 'race', 'background'].forEach((type) => {
        DropdownHandler.initializeDropdown({ type, html: this.element, context });
      });

      // Initialize listeners that need refreshing on each render
      Listeners.initializeListeners(this.element, context, HeroMancer.selectedAbilities);
      await MandatoryFields.checkMandatoryFields(this.element);
      Listeners.initializeFormValidationListeners(this.element);
    } finally {
      this.#isRendering = false;
    }
  }

  /**
   * Processes form changes and updates completion progress
   * @param {object} formConfig - Form configuration
   * @param {Event} event - Change event
   * @protected
   * @override
   */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);

    // Update progress bar if form element exists
    if (event.currentTarget && ProgressBar) {
      this.completionPercentage = ProgressBar.calculateAndUpdateProgress(this.element, event.currentTarget);
    }
  }

  /**
   * Actions to perform when the application is closed
   * Cleans up resources and references
   * @returns {Promise<void>}
   * @protected
   * @override
   */
  async _preClose() {
    // Perform cleanup before the application is removed from DOM
    await super._preClose();
    HM.log(3, 'Preparing to close application');

    // Clean up all listeners and observers
    await HeroMancer.cleanupEventListeners(this);
    EventDispatcher.clearAll();

    return true;
  }

  /**
   * Actions performed after closing the Application
   * @protected
   * @override
   */
  _onClose() {
    // Recreate button listener after application is fully closed
    HtmlManipulator.registerButton();

    // Clear the instance reference
    HM.heroMancer = null;

    super._onClose();
  }

  /* -------------------------------------------- */
  /*  Private Instance Methods                    */
  /* -------------------------------------------- */

  /**
   * Gets token configuration data
   * @returns {Object} Token configuration object
   * @private
   */
  #getTokenConfig() {
    try {
      const trackedAttrs = TokenDocument.implementation._getConfiguredTrackedAttributes('character');

      // Helper function to create display mode mappings
      const createDisplayModes = () => {
        return Object.entries(CONST.TOKEN_DISPLAY_MODES).reduce((obj, [key, value]) => {
          obj[value] = game.i18n.localize(`TOKEN.DISPLAY_${key}`);
          return obj;
        }, {});
      };

      // Both displayModes and barModes use the same mapping
      const displayModes = createDisplayModes();

      return {
        displayModes,
        barModes: displayModes,
        barAttributes: {
          '': game.i18n.localize('None'),
          ...trackedAttrs.bar.reduce((obj, path) => {
            const pathStr = path.join('.');
            obj[pathStr] = pathStr;
            return obj;
          }, {})
        },
        ring: {
          effects: Object.entries(CONFIG.Token.ring.ringClass.effects)
            .filter(([name]) => name !== 'DISABLED' && name !== 'ENABLED' && CONFIG.Token.ring.effects[name])
            .reduce((obj, [name]) => {
              obj[name] = game.i18n.localize(CONFIG.Token.ring.effects[name]);
              return obj;
            }, {})
        }
      };
    } catch (error) {
      HM.log(1, 'Error generating token config:', error);
      return { displayModes: {}, barModes: {}, barAttributes: {}, ring: { effects: {} } };
    }
  }

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Action handler for resetting options
   * @param {Event} event - The triggering event
   * @param {HTMLElement} target - The DOM element that triggered the reset
   * @static
   */
  static async resetOptions(event, target) {
    const form = target.ownerDocument.getElementById('hero-mancer-app');
    const success = await SavedOptions.resetOptions(form);

    if (success) {
      SummaryManager.updateClassRaceSummary();
      this.render(true);
      ui.notifications.info('hm.app.optionsReset', { localize: true });
    }
  }

  /**
   * Rolls an ability score using the configured dice rolling method
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} form - The form element containing ability score data
   * @static
   */
  static rollStat(_event, form) {
    StatRoller.rollAbilityScore(form);
  }

  /**
   * Cleans up all event handlers and observers when a HeroMancer instance is closed
   * @param {object} instance The HeroMancer instance being closed
   * @returns {Promise<void>}
   * @static
   */
  static cleanupEventListeners(instance) {
    if (!instance.element) return;

    const html = instance.element;
    const cleanupIssues = [];

    // Helper function to safely remove event listeners and properties
    const cleanElement = (element, handlers, name) => {
      if (!element) return;

      try {
        handlers.forEach(({ prop, event }) => {
          if (element[prop]) {
            if (event) element.removeEventListener(event, element[prop]);
            element[prop] = null;
          }
        });
      } catch (error) {
        HM.log(1, `Error cleaning up ${name}:`, error);
        cleanupIssues.push(name);
      }
    };

    // Helper for batch element cleanup
    const cleanElementSet = (selector, handlers, nameFormatter) => {
      try {
        const elements = html.querySelectorAll(selector);
        elements.forEach((el, i) => cleanElement(el, handlers, nameFormatter(i)));
      } catch (error) {
        HM.log(1, `Error cleaning up ${selector}:`, error);
        cleanupIssues.push(selector);
      }
    };

    // Clean dropdowns
    ['class', 'race', 'background'].forEach((type) => {
      cleanElement(
        html.querySelector(`#${type}-dropdown`),
        [{ prop: '_descriptionUpdateHandler' }, { prop: '_changeHandler', event: 'change' }, { prop: '_equipmentChangeHandler', event: 'change' }, { prop: '_summaryChangeHandler', event: 'change' }],
        `${type} dropdown`
      );
    });

    // Clean ability blocks
    cleanElementSet('.ability-block', [], (i) => `ability block ${i}`);

    // Handle nested elements in ability blocks
    html.querySelectorAll('.ability-block').forEach((block, i) => {
      cleanElement(block.querySelector('.ability-dropdown'), [{ prop: '_abilityChangeHandler', event: 'change' }], `ability dropdown ${i}`);

      cleanElement(block.querySelector('.ability-score'), [{ prop: '_abilityChangeHandler', event: 'change' }], `ability score ${i}`);

      const currentScore = block.querySelector('.current-score');
      if (currentScore?._summaryObserver) {
        currentScore._summaryObserver.disconnect();
        currentScore._summaryObserver = null;
      }
    });

    // Clean equipment container
    cleanElement(
      html.querySelector('#equipment-container'),
      [
        { prop: '_summaryChangeHandler', event: 'change' },
        { prop: '_summaryObserver', hasDisconnect: true }
      ],
      'equipment container'
    );

    // Clean prose mirror elements
    cleanElementSet(
      'prose-mirror',
      [
        { prop: '_summaryObserver', hasDisconnect: true },
        { prop: '_observer', hasDisconnect: true }
      ],
      (i) => `prose-mirror ${i}`
    );

    // Clean roll buttons
    cleanElementSet('.roll-btn', [{ prop: '_clickHandler', event: 'click' }], (i) => `roll button ${i}`);

    // Clean form validation handlers
    cleanElementSet(
      'input, select, textarea',
      [
        { prop: '_mandatoryFieldChangeHandler', event: 'change' },
        { prop: '_mandatoryFieldInputHandler', event: 'input' }
      ],
      (i) => `form element ${i}`
    );

    // Final cleanup for managers and registries
    [
      { fn: () => SummaryManager.cleanup(), name: 'SummaryManager' },
      { fn: () => MutationObserverRegistry.unregisterByPrefix('heromancer-'), name: 'MutationObserverRegistry' },
      { fn: () => EventDispatcher.clearAll(), name: 'EventDispatcher' }
    ].forEach(({ fn, name }) => {
      try {
        fn();
      } catch (error) {
        HM.log(1, `Error cleaning up ${name}:`, error);
        cleanupIssues.push(name);
      }
    });
  }

  /**
   * Delegates equipment selection collection to EquipmentParser
   * @param {Event} event - Form submission event
   * @param {object} [options] - Collection options (includeClass/includeBackground)
   * @returns {Promise<Array<object>>} Equipment items data
   * @static
   */
  static collectEquipmentSelections(event, options = { includeClass: true, includeBackground: true }) {
    return EquipmentParser.collectEquipmentSelections(event, options);
  }

  /**
   * Action handler for form submission cancellation
   * Restores original player colors and optionally closes the application
   * @param {Event} event - The triggering event
   * @param {object} options - Options to pass to close method
   * @static
   */
  static async noSubmit(event, options) {
    // Restore original player colors
    for (const [userId, originalColor] of HeroMancer.ORIGINAL_PLAYER_COLORS.entries()) {
      const user = game.users.get(userId);
      if (user) await user.update({ color: originalColor });
    }

    // Clear the map for next time
    HeroMancer.ORIGINAL_PLAYER_COLORS.clear();

    // Close if cancel button was clicked
    if (event.target.className === 'hm-app-footer-cancel') {
      HM.log(3, 'Closing HeroMancer application via noSubmit.');
      await HM.heroMancer.close(options);
    }
  }

  /**
   * Main form submission handler for character creation
   * Validates input, creates actor, and applies advancements
   * @param {Event} event - The form submission event
   * @param {HTMLFormElement} _form - The form element
   * @param {FormDataExtended} formData - The processed form data
   * @returns {Promise<void>}
   * @static
   */
  static async formHandler(event, _form, formData) {
    // Handle "Save for Later" action
    if (event.submitter?.dataset.action === 'saveOptions') {
      try {
        await HeroMancer.noSubmit(event);
        await SavedOptions.saveOptions(formData.object);
        ui.notifications.info('hm.app.optionsSaved', { localize: true });
      } catch (error) {
        HM.log(1, 'Error saving options:', error);
        ui.notifications.error('hm.errors.save-options-failed', { localize: true });
      }
      return;
    }

    // Delegate to ActorCreationService
    await ActorCreationService.createCharacter(event, formData);
  }
}
