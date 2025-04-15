import { ActorCreationService, CharacterArtPicker, CharacterRandomizer, DOMManager, FormValidation, HM, ProgressBar, SavedOptions, StatRoller } from '../utils/index.js';

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
      nosubmit: HeroMancer.noSubmit,
      randomizeCharacterName: HeroMancer.randomizeCharacterName,
      randomize: HeroMancer.randomize,
      openCompendiumSettings: (event) => HeroMancer.openMenu(event, 'customCompendiumMenu'),
      openCustomizationSettings: (event) => HeroMancer.openMenu(event, 'customizationMenu'),
      openDiceRollingSettings: (event) => HeroMancer.openMenu(event, 'diceRollingMenu'),
      openMandatoryFieldsSettings: (event) => HeroMancer.openMenu(event, 'mandatoryFieldsMenu'),
      openTroubleshooterSettings: (event) => HeroMancer.openMenu(event, 'troubleshootingMenu'),
      previousTab: HeroMancer.navigatePreviousTab,
      nextTab: HeroMancer.navigateNextTab
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
      minimizable: true,
      controls: [
        {
          icon: 'fa-solid fa-atlas',
          label: 'hm.settings.configure-compendiums',
          action: 'openCompendiumSettings',
          dataset: { menu: 'customCompendiumMenu' }
        },
        {
          icon: 'fa-solid fa-palette',
          label: 'hm.settings.configure-customization',
          action: 'openCustomizationSettings',
          dataset: { menu: 'customizationMenu' }
        },
        {
          icon: 'fa-solid fa-dice',
          label: 'hm.settings.configure-rolling',
          action: 'openDiceRollingSettings',
          dataset: { menu: 'diceRollingMenu' }
        },
        {
          icon: 'fa-solid fa-list-check',
          label: 'hm.settings.configure-mandatory',
          action: 'openMandatoryFieldsSettings',
          dataset: { menu: 'mandatoryFieldsMenu' }
        },
        {
          icon: 'fa-solid fa-bug',
          label: 'hm.settings.troubleshooter.generate-report',
          action: 'openTroubleshooterSettings',
          dataset: { menu: 'troubleshootingMenu' }
        }
      ]
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
    biography: { template: 'modules/hero-mancer/templates/tab-biography.hbs', classes: ['hm-app-tab-content'] },
    finalize: { template: 'modules/hero-mancer/templates/tab-finalize.hbs', classes: ['hm-app-tab-content'] },
    footer: { template: 'modules/hero-mancer/templates/app-footer.hbs', classes: ['hm-app-footer'] }
  };

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  /**
   * Flag to prevent rendering conflicts when updates are in progress
   * @private
   * @type {boolean}
   */
  #isRendering;

  get title() {
    return `${HM.NAME} | ${game.user.name}`;
  }

  /* -------------------------------------------- */
  /*  Protected Methods                           */
  /* -------------------------------------------- */

  /**
   * Prepares the main context data for the character creation application
   * Initializes abilities, processes compatibility settings, and prepares all tab data
   * @param {object} options - Application render options
   * @returns {object} Complete context for character creation rendering
   * @protected
   * @override
   */
  _prepareContext(options) {
    try {
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
    } catch (error) {
      HM.log(1, 'Error preparing context:', error);
      return {
        raceDocs: [],
        classDocs: [],
        backgroundDocs: [],
        tabs: {},
        players: []
      };
    }
  }

  /**
   * Prepares context data for a specific part/tab of the application
   * Handles specific logic for each tab section
   * @param {string} partId - ID of the template part being rendered
   * @param {object} context - Shared context from _prepareContext
   * @returns {object} Modified context for the specific part
   * @protected
   * @override
   */
  _preparePartContext(partId, context) {
    let abilitiesCount, diceRollMethod;
    try {
      // Set tab data for all parts that have a tab
      if (context.tabs?.[partId]) {
        context.tab = context.tabs[partId];
      }

      // Navigation buttons logic
      const tabOrder = ['start', 'background', 'race', 'class', 'abilities', 'equipment', 'biography', 'finalize'].filter((tab) => !(HM.COMPAT?.ELKAN && tab === 'equipment'));
      const currentTabIndex = tabOrder.indexOf(this.tabGroups['hero-mancer-tabs']);

      switch (partId) {
        case 'start':
          context.playerCustomizationEnabled = game.settings.get(HM.ID, 'enablePlayerCustomization');
          context.tokenCustomizationEnabled = game.settings.get(HM.ID, 'enableTokenCustomization');
          context.token = this.#getTokenConfig();
          context.isGM = game.user.isGM;
          break;
        case 'abilities':
          abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;
          diceRollMethod = StatRoller.getDiceRollingMethod();
          HeroMancer.selectedAbilities = Array(abilitiesCount).fill(HM.ABILITY_SCORES.DEFAULT);
          context.abilities = StatRoller.buildAbilitiesContext();
          context.rollStat = this.rollStat;
          context.rollMethods = StatRoller.rollMethods;
          context.diceRollMethod = diceRollMethod;
          context.allowedMethods = game.settings.get(HM.ID, 'allowedMethods');
          context.standardArray = StatRoller.getStandardArrayValues(diceRollMethod);
          context.selectedAbilities = HeroMancer.selectedAbilities;
          context.totalPoints = StatRoller.getTotalPoints();
          context.pointsSpent = StatRoller.calculateTotalPointsSpent(HeroMancer.selectedAbilities);
          context.remainingPoints = context.totalPoints - context.pointsSpent;
          context.chainedRolls = game.settings.get(HM.ID, 'chainedRolls');
          break;
        case 'biography':
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
        case 'footer':
          context.randomizeButton = game.settings.get(HM.ID, 'enableRandomize');
          context.navigationButtons = game.settings.get(HM.ID, 'enableNavigationButtons');
          context.isFirstTab = currentTabIndex === 0;
          context.isLastTab = currentTabIndex === tabOrder.length - 1;
          context.previousTabName = currentTabIndex > 0 ? game.i18n.localize(`hm.app.tab-names.${tabOrder[currentTabIndex - 1]}`) : '';
          context.nextTabName = currentTabIndex < tabOrder.length - 1 ? game.i18n.localize(`hm.app.tab-names.${tabOrder[currentTabIndex + 1]}`) : '';
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
        biography: { icon: 'fa-solid fa-book-open' },
        finalize: { icon: 'fa-solid fa-flag-checkered' }
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
   * @param {ApplicationRenderContext} _context Prepared context data
   * @param {RenderOptions} _options Provided render options
   * @returns {void}
   * @protected
   * @override
   */
  async _onFirstRender(_context, _options) {
    // Initialize empty equipment sections
    const equipmentContainer = this.element.querySelector('#equipment-container');
    if (equipmentContainer && !HM.COMPAT.ELKAN) {
      // Create empty section containers to preserve layout
      ['class', 'background'].forEach((type) => {
        const section = document.createElement('div');
        section.className = `${type}-equipment-section`;
        equipmentContainer.appendChild(section);
      });
    }

    // Restore any saved options
    await DOMManager.restoreFormOptions(this.element);
    DOMManager.updateTabIndicators(this.element);

    // Perform initial summaries
    requestAnimationFrame(() => {
      if (HM.SELECTED.race?.uuid || HM.SELECTED.class?.uuid) {
        DOMManager.updateClassRaceSummary();
      }
      if (HM.SELECTED.background?.uuid) {
        DOMManager.updateBackgroundSummary();
      }
      DOMManager.updateAbilitiesSummary();
      DOMManager.updateEquipmentSummary();
    });
  }

  /**
   * Actions performed after any render of the Application.
   * @param {ApplicationRenderContext} _context Prepared context data
   * @param {RenderOptions} options Provided render options
   * @returns {void}
   * @protected
   * @override
   */
  async _onRender(_context, options) {
    if (this.#isRendering) return;
    try {
      this.#isRendering = true;

      DOMManager.updateReviewTab();

      // Check if this is a partial render of just the abilities tab
      const isAbilitiesPartialRender = options.parts && Array.isArray(options.parts) && options.parts.length === 1 && options.parts[0] === 'abilities';
      const isFooterPartialRender = options.parts && Array.isArray(options.parts) && options.parts.length === 1 && options.parts[0] === 'footer';

      if (isFooterPartialRender) {
        // For footer-only render, update submit button status
        const mandatoryFields = game.settings.get(HM.ID, 'mandatoryFields') || [];
        if (mandatoryFields.length > 0) {
          const submitButton = this.element.querySelector('.hm-app-footer-submit');
          if (submitButton) {
            // Get field status from main form
            const fieldStatus = FormValidation._evaluateFieldStatus(this.element, mandatoryFields);
            const isValid = fieldStatus.missingFields.length === 0;
            FormValidation._updateSubmitButton(submitButton, isValid, fieldStatus.missingFields);
          }
        }
        return;
      }

      if (isAbilitiesPartialRender) {
        // For abilities-only render, just initialize abilities tab
        const abilitiesTab = this.element.querySelector('.tab[data-tab="abilities"]');
        if (abilitiesTab) {
          await DOMManager.initializeAbilities(this.element);
        }

        // Check mandatory fields only for the abilities tab
        const abilitiesFields = this.element.querySelector('.tab[data-tab="abilities"]');
        if (abilitiesFields) {
          await FormValidation.checkMandatoryFields(abilitiesFields);
        }

        // Early return to avoid reinitializing other components
        return;
      }

      // For full render or other partial renders, proceed with normal initialization

      // Check if we need to re-init roll method listeners
      const abilitiesTab = this.element.querySelector('.tab[data-tab="abilities"]');
      if (abilitiesTab) {
        await DOMManager.initializeAbilities(this.element);
      }

      // Re-initialize DOM event handlers after rendering
      await DOMManager.initialize(this.element);

      // Check mandatory fields
      await FormValidation.checkMandatoryFields(this.element);

      DOMManager.updateTabIndicators(this.element);
      DOMManager.updateReviewTab();
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
   * Clean up embedded journals before closing
   * @returns {Promise<boolean>} True if cleanup was successful
   * @protected
   * @override
   */
  async _preClose() {
    // Perform cleanup before the application is removed from DOM
    await super._preClose();
    HM.log(3, 'Preparing to close application');

    // Close any active journal embeds
    const embedContainers = this.element.querySelectorAll('.journal-container, .journal-embed-container');
    for (const container of embedContainers) {
      try {
        // Get the data attribute that might store the embed instance
        const embedInstanceId = container.dataset.embedId;
        if (embedInstanceId && this[embedInstanceId]) {
          this[embedInstanceId].close();
        }
        container.innerHTML = '';
      } catch (error) {
        HM.log(2, `Error closing journal embed: ${error.message}`);
      }
    }

    // Clean up all DOM interactions with a single call
    DOMManager.cleanup();

    return true;
  }

  /**
   * Override the changeTab method to update the navigation buttons
   * @param {string} tabName - The name of the tab to activate
   * @param {string} groupName - The name of the tab group to activate
   * @param {object} options - Additional options
   * @override
   */
  changeTab(tabName, groupName, options = {}) {
    super.changeTab(tabName, groupName, options);

    // Re-render only the footer to update navigation buttons
    this.render(false, { parts: ['footer'] });

    // Update tab indicators
    DOMManager.updateTabIndicators(this.element);
  }

  /* -------------------------------------------- */
  /*  Private Instance Methods                    */
  /* -------------------------------------------- */

  /**
   * Gets token configuration data
   * @returns {Object} Token configuration object with display modes, bar modes, etc.
   * @private
   * @throws {Error} If token configuration cannot be retrieved
   */
  #getTokenConfig() {
    try {
      const trackedAttrs = TokenDocument.implementation._getConfiguredTrackedAttributes('character');
      if (!trackedAttrs) {
        throw new Error('Could not retrieve tracked attributes from TokenDocument');
      }

      // Create display mode mappings
      const displayModes = this.#createDisplayModes();

      // Prepare bar attributes mapping
      const barAttributes = this.#createBarAttributesMapping(trackedAttrs);

      // Prepare ring effects mapping
      const ringEffects = this.#createRingEffectsMapping();

      return {
        displayModes,
        barModes: displayModes,
        barAttributes,
        ring: { effects: ringEffects }
      };
    } catch (error) {
      HM.log(1, 'Error generating token config:', error);
      return {
        displayModes: {},
        barModes: {},
        barAttributes: {},
        ring: { effects: {} }
      };
    }
  }

  /**
   * Creates display modes mapping
   * @returns {Object} Display modes object
   * @private
   */
  #createDisplayModes() {
    return Object.entries(CONST.TOKEN_DISPLAY_MODES).reduce((obj, [key, value]) => {
      obj[value] = game.i18n.localize(`TOKEN.DISPLAY_${key}`);
      return obj;
    }, {});
  }

  /**
   * Creates bar attributes mapping from tracked attributes
   * @param {Object} trackedAttrs - Tracked attributes configuration
   * @returns {Object} Bar attributes mapping
   * @private
   */
  #createBarAttributesMapping(trackedAttrs) {
    return {
      '': game.i18n.localize('None'),
      ...trackedAttrs.bar.reduce((obj, path) => {
        const pathStr = path.join('.');
        obj[pathStr] = pathStr;
        return obj;
      }, {})
    };
  }

  /**
   * Creates ring effects mapping
   * @returns {Object} Ring effects mapping
   * @private
   */
  #createRingEffectsMapping() {
    return Object.entries(CONFIG.Token.ring.ringClass.effects)
      .filter(([name]) => name !== 'DISABLED' && name !== 'ENABLED' && CONFIG.Token.ring.effects[name])
      .reduce((obj, [name]) => {
        obj[name] = game.i18n.localize(CONFIG.Token.ring.effects[name]);
        return obj;
      }, {});
  }

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Action handler for resetting options
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The DOM element that triggered the reset
   * @returns {Promise<boolean>} Success status of the reset operation
   * @async
   * @static
   */
  static async resetOptions(_event, target) {
    try {
      const form = target.ownerDocument.getElementById('hero-mancer-app');
      const success = await SavedOptions.resetOptions(form);

      if (success) {
        // First update any summaries
        DOMManager.updateClassRaceSummary();

        // Re-render the entire application
        const app = HM.heroMancer;
        if (app) {
          await app.render(true);

          // Reinitialize all event handlers after render
          requestAnimationFrame(async () => {
            await DOMManager.initialize(app.element);

            // Force update descriptions for main dropdowns
            ['class', 'race', 'background'].forEach((type) => {
              const dropdown = app.element.querySelector(`#${type}-dropdown`);
              if (dropdown && dropdown.value) {
                const id = dropdown.value.split(' ')[0];
                DOMManager.updateDescription(type, id, app.element.querySelector(`#${type}-description`));
              }
            });
          });
        }

        ui.notifications.info('hm.app.optionsReset', { localize: true });
      }

      return success;
    } catch (error) {
      HM.log(1, 'Error resetting options:', error);
      ui.notifications.error('hm.errors.reset-options-failed', { localize: true });
      return false;
    }
  }

  /**
   * Rolls an ability score using the configured dice rolling method
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} form - The form element containing ability score data
   * @returns {Promise<number|null>} The rolled value or null if rolling failed
   * @async
   * @static
   */
  static async rollStat(_event, form) {
    try {
      return await StatRoller.rollAbilityScore(form);
    } catch (error) {
      HM.log(1, 'Error rolling ability score:', error);
      ui.notifications.error('hm.errors.ability-roll-failed', { localize: true });
      return null;
    }
  }

  /**
   * Action handler for form submission cancellation
   * Restores original player colors and optionally closes the application
   * @param {Event} event - The triggering event
   * @param {object} [options={}] - Options to pass to close method
   * @returns {Promise<void>}
   * @async
   * @static
   */
  static async noSubmit(event, options = {}) {
    try {
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
    } catch (error) {
      HM.log(1, 'Error during form cancellation:', error);
    }
  }

  /**
   * Randomize character name and update the name input field
   * @param {Event} event - The triggering event
   * @returns {string|null} The generated name or null if generation failed
   * @static
   */
  static randomizeCharacterName(event) {
    try {
      event.preventDefault();
      const nameInput = document.getElementById('character-name');

      if (!nameInput) {
        HM.log(2, 'Could not find character name input element');
        return null;
      }

      // Set the random name
      const randomName = CharacterRandomizer.generateRandomName();
      nameInput.value = randomName;
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));

      HM.log(3, `Generated random name: ${randomName}`);
      return randomName;
    } catch (error) {
      HM.log(1, 'Error generating random character name:', error);
      return null;
    }
  }

  /**
   * Handle randomizing the entire character
   * @param {Event} event - The triggering event
   * @returns {Promise<boolean>} Success status of the randomization
   * @async
   * @static
   */
  static async randomize(event) {
    try {
      event.preventDefault();

      // Re-render the entire application
      await HM.heroMancer.render(true);

      // Get the form element
      const form = event.currentTarget.closest('form');
      if (!form) {
        HM.log(2, 'Could not find form element when randomizing character');
        return false;
      }

      // Use the CharacterRandomizer utility to randomize all character aspects
      return await CharacterRandomizer.randomizeAll(form);
    } catch (error) {
      HM.log(1, 'Error randomizing character:', error);
      ui.notifications.error('hm.errors.randomize-failed', { localize: true });
      return false;
    }
  }

  /**
   * Opens a specific settings menu
   * @param {PointerEvent} event - The triggering event
   * @param {string} menuKey - The settings menu key
   * @returns {boolean} Whether the menu was successfully opened
   * @static
   */
  static openMenu(event, menuKey) {
    try {
      event.preventDefault();

      if (!menuKey) {
        HM.log(1, 'No menu key provided');
        return false;
      }

      // Open the requested settings menu
      const menuId = `${HM.ID}.${menuKey}`;
      const menuConfig = game.settings.menus.get(menuId);

      if (menuConfig) {
        const MenuClass = menuConfig.type;
        new MenuClass().render(true);
        return true;
      } else {
        HM.log(1, `Menu '${menuId}' not found`);
        return false;
      }
    } catch (error) {
      HM.log(1, `Error opening menu ${menuKey}:`, error);
      return false;
    }
  }

  /**
   * Navigate to the previous tab
   * @param {Event} event - The triggering event
   * @returns {void}
   * @static
   */
  static navigatePreviousTab(event) {
    event.preventDefault();
    const app = HM.heroMancer;
    if (!app) return;

    const tabGroup = 'hero-mancer-tabs';
    const currentTab = app.tabGroups[tabGroup];
    const tabOrder = ['start', 'background', 'race', 'class', 'abilities', 'equipment', 'biography', 'finalize'];

    // Skip equipment if ELKAN compatibility is enabled
    const filteredTabs = HM.COMPAT?.ELKAN ? tabOrder.filter((tab) => tab !== 'equipment') : tabOrder;

    const currentIndex = filteredTabs.indexOf(currentTab);
    if (currentIndex > 0) {
      const previousTab = filteredTabs[currentIndex - 1];
      app.changeTab(previousTab, tabGroup);
    }
  }

  /**
   * Navigate to the next tab
   * @param {Event} event - The triggering event
   * @returns {void}
   * @static
   */
  static navigateNextTab(event) {
    event.preventDefault();
    const app = HM.heroMancer;
    if (!app) return;

    const tabGroup = 'hero-mancer-tabs';
    const currentTab = app.tabGroups[tabGroup];
    const tabOrder = ['start', 'background', 'race', 'class', 'abilities', 'equipment', 'biography', 'finalize'];

    // Skip equipment if ELKAN compatibility is enabled
    const filteredTabs = HM.COMPAT?.ELKAN ? tabOrder.filter((tab) => tab !== 'equipment') : tabOrder;

    const currentIndex = filteredTabs.indexOf(currentTab);
    if (currentIndex < filteredTabs.length - 1) {
      const nextTab = filteredTabs[currentIndex + 1];
      app.changeTab(nextTab, tabGroup);
    }
  }

  /**
   * Main form submission handler for character creation
   * Validates input, creates actor, and applies advancements
   * @param {Event} event - The form submission event
   * @param {HTMLFormElement} _form - The form element
   * @param {FormDataExtended} formData - The processed form data
   * @returns {Promise<Actor|null>} The created actor or null if creation failed
   * @async
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
        throw new Error(`Failed to save options: ${error.message}`);
      }
      return null;
    }

    // Delegate to ActorCreationService
    try {
      return await ActorCreationService.createCharacter(event, formData);
    } catch (error) {
      HM.log(1, 'Character creation failed:', error);
      ui.notifications.error('hm.errors.character-creation-failed', { localize: true });
      return null;
    }
  }
}
