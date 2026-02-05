import { ActorCreationService, CharacterArtPicker, CharacterRandomizer, FormValidation, HeroMancerUI, HM, MODULE, ProgressBar, SavedOptions, StatRoller } from '../utils/index.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Main HeroMancer application for character creation.
 * @extends ApplicationV2
 */
export class HeroMancer extends HandlebarsApplicationMixin(ApplicationV2) {
  static selectedAbilities = [];

  static ORIGINAL_PLAYER_COLORS = new Map();

  /** @override */
  static DEFAULT_OPTIONS = {
    id: `${MODULE.ID}-app`,
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
    position: { height: '850', width: 800 },
    window: {
      contentClasses: ['standard-form'],
      icon: 'fa-solid fa-egg',
      resizable: false,
      minimizable: true,
      controls: [
        { icon: 'fa-solid fa-atlas', label: 'hm.settings.configure-compendiums', action: 'openCompendiumSettings', dataset: { menu: 'customCompendiumMenu' } },
        { icon: 'fa-solid fa-palette', label: 'hm.settings.configure-customization', action: 'openCustomizationSettings', dataset: { menu: 'customizationMenu' } },
        { icon: 'fa-solid fa-dice', label: 'hm.settings.configure-rolling', action: 'openDiceRollingSettings', dataset: { menu: 'diceRollingMenu' } },
        { icon: 'fa-solid fa-list-check', label: 'hm.settings.configure-mandatory', action: 'openMandatoryFieldsSettings', dataset: { menu: 'mandatoryFieldsMenu' } },
        { icon: 'fa-solid fa-bug', label: 'hm.settings.troubleshooter.generate-report', action: 'openTroubleshooterSettings', dataset: { menu: 'troubleshootingMenu' } }
      ]
    }
  };

  /** @override */
  static PARTS = {
    header: { template: 'modules/hero-mancer/templates/app-header.hbs', classes: ['hm-app-header'] },
    tabs: { template: 'modules/hero-mancer/templates/app-nav.hbs', classes: ['hm-app-nav'] },
    start: { template: 'modules/hero-mancer/templates/tab-start.hbs', classes: ['hm-app-tab-content'] },
    background: { template: 'modules/hero-mancer/templates/tabs/selection.hbs', classes: ['hm-app-tab-content'] },
    race: { template: 'modules/hero-mancer/templates/tabs/selection.hbs', classes: ['hm-app-tab-content'] },
    class: { template: 'modules/hero-mancer/templates/tabs/selection.hbs', classes: ['hm-app-tab-content'] },
    abilities: { template: 'modules/hero-mancer/templates/tab-abilities.hbs', classes: ['hm-app-tab-content'] },
    equipment: { template: 'modules/hero-mancer/templates/tab-equipment.hbs', classes: ['hm-app-tab-content'] },
    biography: { template: 'modules/hero-mancer/templates/tab-biography.hbs', classes: ['hm-app-tab-content'] },
    finalize: { template: 'modules/hero-mancer/templates/tab-finalize.hbs', classes: ['hm-app-tab-content'] },
    footer: { template: 'modules/hero-mancer/templates/app-footer.hbs', classes: ['hm-app-footer'] }
  };

  #isRendering;

  /** @override */
  get title() {
    return `${MODULE.NAME} | ${game.user.name}`;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    game.users.forEach((user) => {
      HeroMancer.ORIGINAL_PLAYER_COLORS.set(user.id, user.color.css);
    });
    if (HM.COMPAT?.ELKAN) options.parts = options.parts.filter((part) => part !== 'equipment');
    return {
      ...context,
      raceDocs: HM.documents.race || [],
      classDocs: HM.documents.class || [],
      backgroundDocs: HM.documents.background || [],
      tabs: this._getTabs(HeroMancer.getTabOrder()),
      players: game.users.map((user) => ({ id: user.id, name: user.name, color: user.color.css }))
    };
  }

  /** @override */
  _preparePartContext(partId, context) {
    if (context.tabs?.[partId]) context.tab = context.tabs[partId];
    const tabOrder = HeroMancer.getTabOrder();
    const currentTabIndex = tabOrder.indexOf(this.tabGroups['hero-mancer-tabs']);
    switch (partId) {
      case 'start':
        context.playerCustomizationEnabled = game.settings.get(MODULE.ID, 'enablePlayerCustomization');
        context.tokenCustomizationEnabled = game.settings.get(MODULE.ID, 'enableTokenCustomization');
        context.token = this.#getTokenConfig();
        context.isGM = game.user.isGM;
        break;
      case 'race':
      case 'class':
      case 'background':
        context.tabName = partId;
        context.docs = context[`${partId}Docs`];
        context.selectLabelKey = `hm.app.${partId}.select-label`;
        context.selectPlaceholderKey = `hm.app.${partId}.select-placeholder`;
        context.noneKey = `hm.app.${partId}.none`;
        break;
      case 'abilities': {
        const abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;
        const diceRollMethod = StatRoller.getDiceRollingMethod();
        HeroMancer.selectedAbilities = Array(abilitiesCount).fill(HM.ABILITY_SCORES.DEFAULT);
        context.abilities = StatRoller.buildAbilitiesContext();
        context.rollStat = this.rollStat;
        context.rollMethods = StatRoller.rollMethods;
        context.diceRollMethod = diceRollMethod;
        context.allowedMethods = game.settings.get(MODULE.ID, 'allowedMethods');
        context.standardArray = StatRoller.getStandardArrayValues(diceRollMethod);
        context.selectedAbilities = HeroMancer.selectedAbilities;
        context.totalPoints = StatRoller.getTotalPoints();
        context.pointsSpent = StatRoller.calculateTotalPointsSpent(HeroMancer.selectedAbilities);
        context.remainingPoints = context.totalPoints - context.pointsSpent;
        context.chainedRolls = game.settings.get(MODULE.ID, 'chainedRolls');
        break;
      }
      case 'biography':
        context.alignments =
          game.settings
            .get(MODULE.ID, 'alignments')
            .split(',')
            .map((d) => d.trim()) || [];
        context.deities =
          game.settings
            .get(MODULE.ID, 'deities')
            .split(',')
            .map((d) => d.trim()) || [];
        context.enableAlignmentFaithInputs = game.settings.get(MODULE.ID, 'enableAlignmentFaithInputs');
        break;
      case 'footer':
        context.randomizeButton = game.settings.get(MODULE.ID, 'enableRandomize');
        context.navigationButtons = game.settings.get(MODULE.ID, 'enableNavigationButtons');
        context.isFirstTab = currentTabIndex === 0;
        context.isLastTab = currentTabIndex === tabOrder.length - 1;
        context.previousTabName = currentTabIndex > 0 ? game.i18n.localize(`hm.app.tab-names.${tabOrder[currentTabIndex - 1]}`) : '';
        context.nextTabName = currentTabIndex < tabOrder.length - 1 ? game.i18n.localize(`hm.app.tab-names.${tabOrder[currentTabIndex + 1]}`) : '';
        context.canCreateActor = game.user.can('ACTOR_CREATE') || game.user.isGM;
        break;
    }
    return context;
  }

  /** @override */
  _getTabs(parts) {
    const tabGroup = 'hero-mancer-tabs';
    if (!this.tabGroups[tabGroup]) this.tabGroups[tabGroup] = 'start';
    const tabConfigs = {
      start: { icon: 'fa-solid fa-play-circle' },
      background: { icon: 'fa-solid fa-scroll' },
      race: { icon: 'fa-solid fa-feather-alt' },
      class: { icon: 'fa-solid fa-chess-rook' },
      abilities: { icon: 'fa-solid fa-fist-raised' },
      equipment: { icon: 'fa-solid fa-shield-halved', skipIf: () => HM.COMPAT?.ELKAN },
      biography: { icon: 'fa-solid fa-book-open' },
      finalize: { icon: 'fa-solid fa-flag-checkered' }
    };
    const nonTabs = ['header', 'tabs', 'footer'];
    return parts.reduce((tabs, partId) => {
      if (nonTabs.includes(partId) || !tabConfigs[partId]) return tabs;
      const config = tabConfigs[partId];
      if (config.skipIf && config.skipIf()) return tabs;
      tabs[partId] = { id: partId, label: game.i18n.localize(`hm.app.tab-names.${partId}`), group: tabGroup, cssClass: this.tabGroups[tabGroup] === partId ? 'active' : '', icon: config.icon };
      return tabs;
    }, {});
  }

  /** @override */
  async _onFirstRender(_context, _options) {
    await HeroMancerUI.initializeEquipmentContainer(this.element);
    await HeroMancerUI.restoreFormOptions(this.element);
    HeroMancerUI.updateTabIndicators(this.element);
    requestAnimationFrame(() => {
      HeroMancerUI.updateAbilityHighlights();
    });
  }

  /** @override */
  async _onRender(context, options) {
    super._onRender(context, options);
    if (this.#isRendering) return;
    this.#isRendering = true;
    HeroMancerUI.updateReviewTab();
    const isAbilitiesPartialRender = options.parts && Array.isArray(options.parts) && options.parts.length === 1 && options.parts[0] === 'abilities';
    const isFooterPartialRender = options.parts && Array.isArray(options.parts) && options.parts.length === 1 && options.parts[0] === 'footer';
    if (isFooterPartialRender) {
      const mandatoryFields = game.settings.get(MODULE.ID, 'mandatoryFields') || [];
      if (mandatoryFields.length > 0) {
        const submitButton = this.element.querySelector('.hm-app-footer-submit');
        if (submitButton) {
          const fieldStatus = FormValidation._evaluateFieldStatus(this.element, mandatoryFields);
          const isValid = fieldStatus.missingFields.length === 0;
          FormValidation._updateSubmitButton(submitButton, isValid, fieldStatus.missingFields);
        }
      }
      this.#isRendering = false;
      return;
    }
    if (isAbilitiesPartialRender) {
      const abilitiesTab = this.element.querySelector('.tab[data-tab="abilities"]');
      if (abilitiesTab) await HeroMancerUI.initializeAbilities(this.element);
      const abilitiesFields = this.element.querySelector('.tab[data-tab="abilities"]');
      if (abilitiesFields) await FormValidation.checkMandatoryFields(abilitiesFields);
      this.#isRendering = false;
      return;
    }
    const abilitiesTab = this.element.querySelector('.tab[data-tab="abilities"]');
    if (abilitiesTab) await HeroMancerUI.initializeAbilities(this.element);
    await HeroMancerUI.initialize(this.element);
    await FormValidation.checkMandatoryFields(this.element);
    HeroMancerUI.updateTabIndicators(this.element);
    HeroMancerUI.updateReviewTab();
    this.#isRendering = false;
  }

  /** @override */
  _onChangeForm(formConfig, event) {
    super._onChangeForm(formConfig, event);
    if (event.currentTarget && ProgressBar) this.completionPercentage = ProgressBar.calculateAndUpdateProgress(this.element, event.currentTarget);
    HeroMancerUI.updateReviewTab();
  }

  /** @override */
  async _preClose() {
    await super._preClose();
    const embedContainers = this.element.querySelectorAll('.journal-container, .journal-embed-container');
    for (const container of embedContainers) {
      const embedInstanceId = container.dataset.embedId;
      if (embedInstanceId && this[embedInstanceId]) this[embedInstanceId].close();
      container.innerHTML = '';
    }
    HeroMancerUI.cleanup();
    return true;
  }

  /** @override */
  changeTab(tabName, groupName, options = {}) {
    super.changeTab(tabName, groupName, options);
    this.render(false, { parts: ['footer'] });
    HeroMancerUI.updateTabIndicators(this.element);
  }

  /**
   * Gets token configuration data
   * @returns {object} Token configuration object with display modes, bar modes, etc.
   * @private
   * @throws {Error} If token configuration cannot be retrieved
   */
  #getTokenConfig() {
    const trackedAttrs = foundry.documents.TokenDocument.implementation._getConfiguredTrackedAttributes('character');
    if (!trackedAttrs) return { displayModes: {}, barModes: {}, barAttributes: {}, ring: { effects: {} } };
    const displayModes = this.#createDisplayModes();
    const barAttributes = this.#createBarAttributesMapping(trackedAttrs);
    const ringEffects = this.#createRingEffectsMapping();
    return { displayModes, barModes: displayModes, barAttributes, ring: { effects: ringEffects } };
  }

  /**
   * Creates display modes mapping
   * @returns {object} Display modes object
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
   * @param {object} trackedAttrs - Tracked attributes configuration
   * @returns {object} Bar attributes mapping
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
   * @returns {object} Ring effects mapping
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

  /**
   * Build the tab order array using the advancement order setting
   * @returns {string[]} Ordered tab IDs with Elkan equipment filter applied
   * @static
   */
  static getTabOrder() {
    const advancementOrder = game.settings.get(MODULE.ID, 'advancementOrder');
    const orderedIds =
      Array.isArray(advancementOrder) && advancementOrder.length > 0 ? [...advancementOrder].sort((a, b) => a.order - b.order).map((item) => item.id) : ['background', 'race', 'class'];
    const tabOrder = ['start', ...orderedIds, 'abilities', 'equipment', 'biography', 'finalize'];
    return HM.COMPAT?.ELKAN ? tabOrder.filter((tab) => tab !== 'equipment') : tabOrder;
  }

  /**
   * Action handler for resetting options
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The DOM element that triggered the reset
   * @returns {Promise<boolean>} Success status of the reset operation
   * @async
   * @static
   */
  static async resetOptions(_event, target) {
    const form = target.ownerDocument.getElementById('hero-mancer-app');
    const success = await SavedOptions.resetOptions(form);
    if (success) {
      HM.SELECTED.class = { value: '', id: '', uuid: '' };
      HM.SELECTED.race = { value: '', id: '', uuid: '' };
      HM.SELECTED.background = { value: '', id: '', uuid: '' };
      const app = HM.heroMancer;
      if (app) {
        await app.render(true);
      }
      ui.notifications.info('hm.app.optionsReset', { localize: true });
    }
    return success;
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
    return await StatRoller.rollAbilityScore(form);
  }

  /**
   * Action handler for form submission cancellation
   * Restores original player colors and optionally closes the application
   * @param {Event} event - The triggering event
   * @param {object} [options] - Options to pass to close method
   * @returns {Promise<void>}
   * @async
   * @static
   */
  static async noSubmit(event, options = {}) {
    for (const [userId, originalColor] of HeroMancer.ORIGINAL_PLAYER_COLORS.entries()) {
      const user = game.users.get(userId);
      if (user) await user.update({ color: originalColor });
    }
    HeroMancer.ORIGINAL_PLAYER_COLORS.clear();
    if (event.target.className === 'hm-app-footer-cancel') await HM.heroMancer.close(options);
  }

  /**
   * Randomize character name and update the name input field
   * @param {Event} event - The triggering event
   * @returns {string|null} The generated name or null if generation failed
   * @static
   */
  static randomizeCharacterName(event) {
    event.preventDefault();
    const nameInput = document.getElementById('character-name');
    if (!nameInput) return null;
    const randomName = CharacterRandomizer.generateRandomName();
    nameInput.value = randomName;
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    return randomName;
  }

  /**
   * Handle randomizing the entire character
   * @param {Event} event - The triggering event
   * @returns {Promise<boolean>} Success status of the randomization
   * @async
   * @static
   */
  static async randomize(event) {
    event.preventDefault();
    await HM.heroMancer.render(true);
    const form = document.getElementById('hero-mancer-app');
    if (!form) return false;
    return await CharacterRandomizer.randomizeAll(form);
  }

  /**
   * Opens a specific settings menu
   * @param {PointerEvent} event - The triggering event
   * @param {string} menuKey - The settings menu key
   * @returns {boolean} Whether the menu was successfully opened
   * @static
   */
  static openMenu(event, menuKey) {
    event.preventDefault();
    if (!menuKey) return false;
    const menuId = `${MODULE.ID}.${menuKey}`;
    const menuConfig = game.settings.menus.get(menuId);
    if (!menuConfig) return false;
    new menuConfig.type().render(true);
    return true;
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
    const tabOrder = HeroMancer.getTabOrder();
    const currentIndex = tabOrder.indexOf(currentTab);
    if (currentIndex > 0) {
      app.changeTab(tabOrder[currentIndex - 1], tabGroup);
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
    const tabOrder = HeroMancer.getTabOrder();
    const currentIndex = tabOrder.indexOf(currentTab);
    if (currentIndex < tabOrder.length - 1) {
      app.changeTab(tabOrder[currentIndex + 1], tabGroup);
    }
  }

  /**
   * Main form submission handler for character creation
   * @param {Event} event - The form submission event
   * @param {HTMLFormElement} _form - The form element
   * @param {object} formData - The processed form data
   * @returns {Promise<object|null>} The created actor or null if creation failed
   * @async
   * @static
   */
  static async formHandler(event, _form, formData) {
    ui.notifications.clear();
    if (event.submitter?.dataset.action === 'saveOptions') {
      await HeroMancer.noSubmit(event);
      await SavedOptions.saveOptions(formData.object);
      ui.notifications.info('hm.app.optionsSaved', { localize: true });
      return null;
    }
    return await ActorCreationService.createCharacter(event, formData);
  }
}
