/**
 * @module HeroMancerUI
 * @description UI management for the HeroMancer application - handles initialization,
 * event binding, summary updates, review tab, and form state.
 */

import { DocumentService, EquipmentManager, EquipmentUI, EventRegistry, FormValidation, HeroMancer, HM, JournalPageEmbed, SavedOptions, StatRoller, TableManager } from './index.js';

/**
 * Centralized UI management for the HeroMancer application.
 * @class
 */
export class HeroMancerUI {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @type {boolean} */
  static _isUpdatingEquipment = false;

  /** @type {Promise|null} */
  static _abilityUpdatePromise = null;

  /** @type {boolean} */
  static _pendingAbilityUpdate = false;

  /** @type {boolean} */
  static _updatingAbilities = false;

  /** @type {boolean} */
  static #equipmentUpdateInProgress = false;

  /** @type {Promise|null} */
  static #pendingEquipmentUpdate = null;

  /** @type {number|null} */
  static #colorSchemeHookId = null;

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Clean up all registered listeners, observers, and internal state.
   * @returns {boolean} True if cleanup was successful
   */
  static cleanup() {
    this._isUpdatingEquipment = false;
    this._abilityUpdatePromise = null;
    this._pendingAbilityUpdate = false;
    this._updatingAbilities = false;
    this.#equipmentUpdateInProgress = false;
    this.#pendingEquipmentUpdate = null;
    if (this.#colorSchemeHookId) {
      Hooks.off('colorSchemeChange', this.#colorSchemeHookId);
      this.#colorSchemeHookId = null;
    }
    EventRegistry.cleanupAll();
    EquipmentManager.clearCache();
    HM.log(3, 'HeroMancerUI: cleanup complete');
    return true;
  }

  /**
   * Initialize all event handlers for the application
   * @param {HTMLElement} element - Root element
   * @returns {Promise<boolean>} Success status
   */
  static async initialize(element) {
    if (!element) {
      HM.log(1, 'Cannot initialize HeroMancerUI: No element provided');
      return false;
    }
    try {
      this.initializeEquipmentContainer(element);
      this.initializeDropdowns(element);
      this.initializeAbilities(element);
      this.initializeEquipment(element);
      this.initializeCharacterDetails(element);
      this.initializeFormValidation(element);
      this.initializeTokenCustomization(element);
      await this.initializeRollButtons(element);
      this.initializePortrait();
    } catch (error) {
      HM.log(1, 'Error during HeroMancerUI initialization:', error);
      return false;
    }
  }

  /**
   * Initialize dropdown-related handlers
   * @param {HTMLElement} element - Application root element
   * @returns {Promise<void>}
   */
  static async initializeDropdowns(element) {
    const dropdownTypes = ['race', 'class', 'background'];
    const dropdowns = this.#getDropdownElements(element, dropdownTypes);
    for (const [type, dropdown] of Object.entries(dropdowns)) {
      if (!dropdown) continue;
      EventRegistry.on(dropdown, 'change', async (event) => {
        await this.#handleDropdownChange(element, type, event);
      });
    }
  }

  /**
   * Initialize ability score related handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeAbilities(element) {
    this.#initializeRollMethodSelector(element);
    this.#initializeAbilityDropdowns(element);
    this.#initializeAbilityScoreInputs(element);
    StatRoller.initializeAbilityDropdownTracking();
  }

  /**
   * Initialize equipment-related handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeEquipment(element) {
    const equipmentContainer = element.querySelector('#equipment-container');
    if (!equipmentContainer || HM.COMPAT.ELKAN) return;
    EventRegistry.observe(equipmentContainer, 'equipment-container', { childList: true, subtree: true, attributes: true }, (mutations) => {
      let needsUpdate = false;
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const newCheckboxes = node.querySelectorAll?.('.equipment-favorite-checkbox') || [];
              newCheckboxes.forEach((checkbox) => {
                EventRegistry.on(checkbox, 'change', () => {
                  this.updateEquipmentSummary();
                });
              });
              if (node.querySelector('select') || node.querySelector('input[type="checkbox"]')) needsUpdate = true;
            }
          });
        }
        if (mutation.type === 'attributes' && mutation.attributeName === 'checked' && mutation.target.classList.contains('equipment-favorite-checkbox')) needsUpdate = true;
      }
      if (needsUpdate) this.updateEquipmentSummary();
    });
    this.attachEquipmentListeners(equipmentContainer);
  }

  /**
   * Initialize equipment container with full equipment UI.
   * @param {HTMLElement} element - Root element
   * @returns {Promise<void>}
   */
  static async initializeEquipmentContainer(element) {
    const equipmentContainer = element.querySelector('#equipment-container');
    if (!equipmentContainer || HM.COMPAT.ELKAN) return;

    try {
      await EquipmentUI.render(equipmentContainer);
      this.attachEquipmentListeners(equipmentContainer);
    } catch (error) {
      HM.log(1, 'Failed to initialize equipment container:', error);
      equipmentContainer.innerHTML = `<p class="error">${game.i18n.localize('hm.errors.equipment-rendering')}</p>`;
    }
  }

  /**
   * Attach listeners to equipment elements
   * @param {HTMLElement} container - Equipment container
   */
  static attachEquipmentListeners(container) {
    if (!container) return;
    const selects = container.querySelectorAll('select');
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    selects.forEach((select) => {
      EventRegistry.on(select, 'change', () => this.updateEquipmentSummary());
    });
    checkboxes.forEach((checkbox) => {
      EventRegistry.on(checkbox, 'change', () => this.updateEquipmentSummary());
    });
  }

  /**
   * Initialize character detail handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeCharacterDetails(element) {
    const nameInput = element.querySelector('#character-name');
    if (nameInput) EventRegistry.on(nameInput, 'input', () => this.updateTitle(element));
    const tokenArtCheckbox = element.querySelector('#link-token-art');
    if (tokenArtCheckbox) {
      EventRegistry.on(tokenArtCheckbox, 'change', () => {
        const tokenArtRow = element.querySelector('#token-art-row');
        if (tokenArtRow) tokenArtRow.style.display = tokenArtCheckbox.checked ? 'none' : 'flex';
      });
    }
    if (game.user.isGM) {
      const playerElement = element.querySelector('#player-assignment');
      if (playerElement) {
        EventRegistry.on(playerElement, 'change', (event) => {
          const playerId = event.currentTarget.value;
          const colorPicker = element.querySelector('#player-color');
          if (colorPicker) colorPicker.value = HeroMancer.ORIGINAL_PLAYER_COLORS.get(playerId);
        });
      }
    }
  }

  /**
   * Initialize form validation handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeFormValidation(element) {
    const mandatoryFields = game.settings.get(HM.ID, 'mandatoryFields') || [];
    if (mandatoryFields.length === 0) return;
    const formElements = element.querySelectorAll('input, select, textarea, color-picker');
    formElements.forEach((formElement) => {
      EventRegistry.on(formElement, 'change', async () => {
        FormValidation.checkMandatoryFields(element);
      });
      if (formElement.tagName.toLowerCase() === 'input' || formElement.tagName.toLowerCase() === 'textarea') {
        EventRegistry.on(formElement, 'input', async () => {
          FormValidation.checkMandatoryFields(element);
        });
      }
    });
    const proseMirrorElements = element.querySelectorAll('prose-mirror');
    proseMirrorElements.forEach((editor, index) => {
      const editorContent = editor.querySelector('.editor-content.ProseMirror');
      if (editorContent) {
        EventRegistry.observe(editorContent, `prose-mirror-${index}`, { childList: true, characterData: true, subtree: true }, async () => {
          FormValidation.checkMandatoryFields(element);
        });
      }
    });
  }

  /**
   * Initialize token customization handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeTokenCustomization(element) {
    const ringEnabled = game.settings.get(HM.ID, 'enableTokenCustomization');
    if (!ringEnabled) return;
    const ringEnabledElement = element.querySelector('input[name="ring.enabled"]');
    const ringOptions = element.querySelectorAll(
      ['.customization-row:has(color-picker[name="ring.color"])', '.customization-row:has(color-picker[name="backgroundColor"])', '.customization-row.ring-effects'].join(', ')
    );

    if (!ringEnabledElement || !ringOptions.length) return;
    ringOptions.forEach((option) => {
      option.style.display = ringEnabledElement.checked ? 'flex' : 'none';
    });
    EventRegistry.on(ringEnabledElement, 'change', (event) => {
      if (!event.currentTarget.checked) {
        element.querySelectorAll('color-picker[name="ring.color"], color-picker[name="backgroundColor"]').forEach((picker) => {
          picker.value = '';
          picker.dispatchEvent(new Event('change', { bubbles: true }));
        });
        element.querySelectorAll('input[name="ring.effects"]').forEach((checkbox) => {
          checkbox.checked = false;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }
      ringOptions.forEach((option) => {
        option.style.display = event.currentTarget.checked ? 'flex' : 'none';
      });
    });
  }

  /**
   * Initialize character portrait with default image
   * @static
   */
  static initializePortrait() {
    const portraitContainer = document.querySelector('.character-portrait');
    if (portraitContainer) {
      const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
      const randomAbility = abilities[Math.floor(Math.random() * 6)];
      const defaultImage = `systems/dnd5e/icons/svg/abilities/${randomAbility}.svg`;
      const portraitImg = portraitContainer.querySelector('img');
      if (portraitImg) {
        portraitImg.src = defaultImage;
        let versionCheck = foundry.utils.isNewerVersion(game.version, '12.343');
        let isDarkMode;
        if (versionCheck) isDarkMode = game.settings?.get('core', 'uiConfig').colorScheme.applications;
        else isDarkMode = game.settings?.get('core', 'colorScheme') === 'dark';
        this.applyDarkModeToImage(portraitImg, isDarkMode, true);
      }

      const nameInput = document.querySelector('#character-name');
      const artInput = document.querySelector('#character-art-path');
      const portraitName = document.querySelector('.header-section h2');
      const updatePortrait = () => {
        if (portraitName) portraitName.innerHTML = nameInput?.value || game.user.name;
        if (portraitImg && artInput) {
          portraitImg.src = artInput.value || defaultImage;
          const isDarkMode = game.settings.get('core', 'uiConfig').colorScheme.applications;
          const isStillDefaultImage = !artInput.value || artInput.value.includes('/abilities/');
          this.applyDarkModeToImage(portraitImg, isDarkMode, isStillDefaultImage);
        }
      };

      EventRegistry.on(nameInput, 'change', updatePortrait);
      EventRegistry.on(artInput, 'change', updatePortrait);
      updatePortrait();
      if (this.#colorSchemeHookId) Hooks.off('colorSchemeChange', this.#colorSchemeHookId);

      this.#colorSchemeHookId = Hooks.on('colorSchemeChange', (scheme) => {
        if (portraitImg) {
          const isDefaultImage = portraitImg.src.includes('/abilities/');
          this.applyDarkModeToImage(portraitImg, scheme === 'dark', isDefaultImage);
        }
      });
    }
  }

  /**
   * Helper method to apply or remove dark mode treatment to images
   * @param {HTMLImageElement} imgElement - The image element
   * @param {boolean} isDarkMode - Whether dark mode is active
   * @param {boolean} isDefaultImage - Whether the image is a default ability icon
   */
  static applyDarkModeToImage(imgElement, isDarkMode, isDefaultImage) {
    if (isDarkMode && isDefaultImage) imgElement.style.filter = 'invert(1)';
    else imgElement.style.filter = 'none';
  }

  /**
   * Initialize roll buttons for background characteristics
   */
  static async initializeRollButtons() {
    const rollButtons = document.querySelectorAll('.roll-btn');
    const backgroundSelect = document.querySelector('#background-dropdown');
    if (rollButtons.length) {
      requestAnimationFrame(() => {
        rollButtons.forEach((button) => (button.disabled = true));
      });
    }
    if (backgroundSelect) {
      EventRegistry.on(backgroundSelect, 'change', (event) => {
        const backgroundId = event.target.value.split(' (')[0];
        requestAnimationFrame(() => {
          rollButtons.forEach((button) => (button.disabled = !backgroundId));
        });
      });
    }
    rollButtons.forEach((button) => {
      EventRegistry.on(button, 'click', async (event) => {
        const tableType = event.currentTarget.dataset.table;
        const textarea = event.currentTarget.closest('.input-with-roll').querySelector('textarea');
        const backgroundId = HM.SELECTED.background.id;
        if (!backgroundId) {
          ui.notifications.warn(game.i18n.localize('hm.warnings.select-background'));
          return;
        }
        const result = await TableManager.rollOnBackgroundCharacteristicTable(backgroundId, tableType);
        HM.log(3, 'Roll result:', result);
        if (result) {
          textarea.value = textarea.value ? `${textarea.value} ${result}` : result;
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
          if (TableManager.areAllTableResultsDrawn(backgroundId, tableType)) button.disabled = true;
        }
      });
    });
  }

  /**
   * Updates the background summary text and formatting
   * @returns {Promise<void>}
   * @static
   */
  static async updateBackgroundSummary() {
    const summary = document.querySelector('.background-summary');
    if (!summary) return;
    try {
      const backgroundData = this.#getBackgroundData();
      const content = game.i18n.format('hm.app.finalize.summary.background', { article: backgroundData.article, background: backgroundData.link });
      summary.innerHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(content);
    } catch (error) {
      HM.log(1, 'Error updating background summary:', error);
      const fallbackContent = game.i18n.format('hm.app.finalize.summary.background', {
        article: game.i18n.localize('hm.app.equipment.article-plural'),
        background: game.i18n.localize('hm.app.background.adventurer')
      });
      summary.innerHTML = fallbackContent;
    }
  }

  /**
   * Updates the class and race summary text
   * @returns {Promise<void>}
   * @static
   */
  static async updateClassRaceSummary() {
    const summary = document.querySelector('.class-race-summary');
    if (!summary) return;
    try {
      const raceLink = this.#getSelectionLink('race');
      const classLink = this.#getSelectionLink('class');
      const content = game.i18n.format('hm.app.finalize.summary.classRace', { race: raceLink, class: classLink });
      summary.innerHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(content);
    } catch (error) {
      HM.log(1, 'Error updating class/race summary:', error);
      const fallbackContent = game.i18n.format('hm.app.finalize.summary.classRace', {
        race: game.i18n.format('hm.unknown', { type: 'race' }),
        class: game.i18n.format('hm.unknown', { type: 'class' })
      });
      summary.innerHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(fallbackContent);
    }
  }

  /**
   * Updates the equipment summary with selected items
   * @returns {void}
   * @static
   */
  static updateEquipmentSummary() {
    if (this._isUpdatingEquipment) return;
    this._isUpdatingEquipment = true;
    try {
      const summary = document.querySelector('.equipment-summary');
      if (!summary) return;
      const equipmentContainer = document.querySelector('#equipment-container');
      if (!equipmentContainer || HM.COMPAT.ELKAN) {
        summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
        return;
      }
      const selectedEquipment = this.#collectEquipmentItems();
      if (!selectedEquipment.length) {
        summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
        return;
      }
      this.#formatAndDisplayEquipmentSummary(summary, selectedEquipment);
    } catch (error) {
      HM.log(1, 'Error updating equipment summary:', error);
      const summary = document.querySelector('.equipment-summary');
      if (summary) summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
    } finally {
      this._isUpdatingEquipment = false;
    }
  }

  /**
   * Updates the abilities summary based on class preferences and highest scores
   * @returns {Promise<void>}
   * @static
   */
  static async updateAbilitiesSummary() {
    const currentClassUUID = HM.SELECTED.class?.uuid;
    if (this._abilityUpdatePromise) {
      this._pendingAbilityUpdate = true;
      return;
    }
    try {
      this._abilityUpdatePromise = (async () => {
        new Promise((resolve) => setTimeout(resolve, 10));
        if (currentClassUUID !== HM.SELECTED.class?.uuid) return;
        if (this._updatingAbilities) return;
        this._updatingAbilities = true;
        try {
          this.#processAbilityHighlights();
          this.#updateAbilitySummaryContent();
        } catch (error) {
          HM.log(1, 'Error updating abilities summary:', error);
        } finally {
          setTimeout(() => (this._updatingAbilities = false), 50);
        }
      })();
      await this._abilityUpdatePromise;
    } finally {
      this._abilityUpdatePromise = null;
      if (this._pendingAbilityUpdate) {
        this._pendingAbilityUpdate = false;
        requestAnimationFrame(() => this.updateAbilitiesSummary());
      }
    }
  }

  /**
   * Updates the character size field based on race advancements
   * @param {string} raceUuid UUID of the selected race
   * @static
   */
  static async updateRaceSize(raceUuid) {
    try {
      if (!raceUuid) {
        HM.log(3, 'No race UUID provided for size update');
        return;
      }
      const sizeInput = document.getElementById('size');
      if (!sizeInput) {
        HM.log(2, 'Could not find size input element');
        return;
      }
      const race = fromUuidSync(raceUuid);
      if (!race) {
        HM.log(2, `Could not find race with UUID: ${raceUuid}`);
        sizeInput.value = '';
        sizeInput.placeholder = game.i18n.localize('hm.app.biography.size-placeholder');
        return;
      }
      HM.log(3, `Processing race: ${race.name}`, race);
      let sizesArray = [];
      let hint = '';
      if (race.advancement?.byType?.Size?.length) {
        const sizeAdvancement = race.advancement.byType.Size[0];
        HM.log(3, 'Found Size advancement:', sizeAdvancement);
        if (sizeAdvancement.configuration?.sizes) {
          if (sizeAdvancement.configuration.sizes instanceof Set) {
            sizesArray = Array.from(sizeAdvancement.configuration.sizes);
            HM.log(3, `Converted sizes Set to Array: ${sizesArray.join(', ')}`);
          } else if (Array.isArray(sizeAdvancement.configuration.sizes)) {
            sizesArray = sizeAdvancement.configuration.sizes;
          }
          hint = sizeAdvancement.hint || '';
        }
      }
      if (!sizesArray.length) {
        HM.log(2, `No size advancement found for race: ${race.name}`, { advancement: race.advancement });
        sizeInput.value = '';
        sizeInput.placeholder = game.i18n.localize('hm.app.biography.size-placeholder');
        return;
      }
      const sizeLabels = sizesArray.map((size) => {
        return CONFIG.DND5E.actorSizes[size]?.label || size;
      });
      HM.log(3, `Size labels for ${race.name}: ${sizeLabels.join(', ')}`);
      const or = game.i18n.localize('hm.app.list-or');
      let sizeText = '';
      if (sizeLabels.length === 1) {
        sizeText = sizeLabels[0];
      } else if (sizeLabels.length === 2) {
        sizeText = `${sizeLabels[0]} ${or} ${sizeLabels[1]}`;
      } else if (sizeLabels.length > 2) {
        const lastLabel = sizeLabels.pop();
        sizeText = `${sizeLabels.join(', ')}, ${or} ${lastLabel}`;
      }
      sizeInput.value = sizeText;
      HM.log(3, `Updated size input with value: "${sizeText}"`);
      if (hint) {
        sizeInput.title = hint;
        HM.log(3, `Added size hint from race: "${hint}"`);
      }
    } catch (error) {
      HM.log(1, `Error updating race size: ${error.message}`, error);
      const sizeInput = document.getElementById('size');
      if (sizeInput) {
        sizeInput.value = '';
        sizeInput.placeholder = game.i18n.localize('hm.app.biography.size-placeholder');
      }
    }
  }

  /**
   * Process background selection changes to load relevant tables
   * @param {object} selectedBackground - Selected background data
   * @static
   */
  static async processBackgroundSelectionChange(selectedBackground) {
    if (!selectedBackground?.value) return;
    const uuid = HM.SELECTED.background.uuid;
    const background = fromUuidSync(uuid);
    if (background) {
      TableManager.loadRollTablesForBackground(background);
      const rollButtons = document.querySelectorAll('.roll-btn');
      rollButtons.forEach((button) => (button.disabled = false));
    }
  }

  /**
   * Updates tab indicators based on mandatory field completion
   * @param {HTMLElement} form - The form element
   * @returns {void}
   * @static
   */
  static updateTabIndicators(form) {
    try {
      if (!form) return;
      const mandatoryFields = game.settings.get(HM.ID, 'mandatoryFields') || [];
      if (!mandatoryFields.length) return;
      const tabs = form.querySelectorAll('.hero-mancer-tabs a.item');
      if (!tabs.length) return;
      const operations = [];
      for (const tab of tabs) {
        const tabId = tab.dataset.tab;
        if (!tabId) continue;
        const hasIncompleteFields = FormValidation.hasIncompleteTabFields(tabId, form);
        let indicator = tab.querySelector('.tab-mandatory-indicator');
        if (hasIncompleteFields) {
          if (!indicator) {
            operations.push(() => {
              indicator = document.createElement('i');
              indicator.className = 'fa-solid fa-triangle-exclamation tab-mandatory-indicator';
              const iconElement = tab.querySelector('i:not(.tab-mandatory-indicator)');
              if (iconElement) {
                if (!iconElement.querySelector('.tab-mandatory-indicator')) {
                  iconElement.style.position = 'relative';
                  iconElement.appendChild(indicator);
                }
              } else if (!tab.querySelector('.tab-mandatory-indicator')) {
                tab.appendChild(indicator);
              }
            });
          }
        } else if (indicator) {
          operations.push(() => indicator.remove());
        }
      }

      if (operations.length > 0) requestAnimationFrame(() => operations.forEach((op) => op()));
    } catch (error) {
      HM.log(1, `Error updating tab indicators: ${error.message}`);
    }
  }

  /**
   * Restores saved form options to DOM elements
   * @param {HTMLElement} html - The form container element
   */
  static async restoreFormOptions(html) {
    const savedOptions = await SavedOptions.loadOptions();
    if (Object.keys(savedOptions).length === 0) return;
    for (const [key, value] of Object.entries(savedOptions)) {
      const selector = `[name="${key}"]`;
      const elem = html.querySelector(selector);
      if (!elem) continue;
      if (elem.type === 'checkbox') {
        elem.checked = value;
      } else if (elem.tagName === 'SELECT') {
        elem.value = value;
        elem.dispatchEvent(new Event('change'));
        this.updateClassRaceSummary();
      } else {
        elem.value = value;
      }
    }
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /**
   * Update description element with content
   * @param {string} type - Type of dropdown (class, race, background)
   * @param {string} id - ID of selected item
   * @param {HTMLElement} descriptionEl - Description element to update
   * @returns {Promise<void>}
   * @static
   */
  static async updateDescription(type, id, descriptionEl) {
    if (!descriptionEl) {
      HM.log(2, `Cannot update ${type} description: No description element provided`);
      return;
    }

    HM.log(3, `Updating ${type} description for ID: ${id}`);
    try {
      if (!id) {
        descriptionEl.innerHTML = '';
        return;
      }
      const doc = await this.#findDocumentById(type, id);
      if (!doc) {
        descriptionEl.innerHTML = game.i18n.localize('hm.app.no-description');
        return;
      }
      const descData = await DocumentService.getDocumentDescription(doc.uuid);
      if (descData.journalPageId) {
        await this.#renderJournalPage(doc, descData, descriptionEl);
        return;
      }
      this.#renderStandardDescription(doc, descData, descriptionEl);
    } catch (error) {
      HM.log(1, `Error updating ${type} description: ${error.message}`, error);
      descriptionEl.innerHTML = game.i18n.localize('hm.app.no-description');
    }
  }

  /**
   * Update equipment UI based on changed selections.
   * @param {HTMLElement} element - Application root element
   * @param {string} type - Which selection changed ('class' or 'background')
   * @returns {Promise<void>}
   */
  static async updateEquipment(element, type) {
    const equipmentContainer = element.querySelector('#equipment-container');
    if (!equipmentContainer || HM.COMPAT.ELKAN) return;

    if (this.#equipmentUpdateInProgress) {
      return new Promise((resolve) => {
        this.#pendingEquipmentUpdate = { element, type, resolve };
      });
    }

    this.#equipmentUpdateInProgress = true;

    try {
      // Clear cache for the changed type to force refresh
      EquipmentManager.clearCache();

      // Re-render the specific section
      await EquipmentUI.renderType(equipmentContainer, type);
      this.attachEquipmentListeners(equipmentContainer);
    } catch (error) {
      HM.log(1, `Error in updateEquipment for ${type}:`, error);
    } finally {
      this.#equipmentUpdateInProgress = false;

      if (this.#pendingEquipmentUpdate) {
        const { element: pendingElement, type: pendingType, resolve: pendingResolve } = this.#pendingEquipmentUpdate;
        this.#pendingEquipmentUpdate = null;
        this.updateEquipment(pendingElement, pendingType).then(pendingResolve);
      }
    }
  }

  /**
   * Update application title based on form state
   * @param {HTMLElement} element - Application root element
   */
  static updateTitle(element) {
    if (!HM.heroMancer) return;
    const characterNameInput = element.querySelector('#character-name');
    const characterName = characterNameInput?.value?.trim() || game.user.name;
    let race = '';
    let background = '';
    let charClass = '';
    try {
      if (HM.SELECTED.race?.uuid) {
        const raceDoc = fromUuidSync(HM.SELECTED.race.uuid);
        race = raceDoc?.name || '';
      }

      if (HM.SELECTED.class?.uuid) {
        const classDoc = fromUuidSync(HM.SELECTED.class.uuid);
        charClass = classDoc?.name || '';
      }

      if (HM.SELECTED.background?.uuid) {
        const backgroundDoc = fromUuidSync(HM.SELECTED.background.uuid);
        background = backgroundDoc?.name || '';
      }
    } catch (error) {
      HM.log(2, `Error getting document: ${error}`);
    }
    let characterDescription = characterName;
    const components = [race, background, charClass].filter((c) => c);
    if (components.length > 0) {
      characterDescription += `, ${game.i18n.format('hm.app.title', { components: components.join(' ') })}`;
      characterDescription += '.';
    }

    const newTitle = `${HM.NAME} | ${characterDescription}`;

    HM.heroMancer._updateFrame({
      window: {
        title: newTitle
      }
    });
  }

  /**
   * Updates the character review tab with data from all previous tabs
   * @returns {Promise<void>}
   * @static
   */
  static async updateReviewTab() {
    try {
      const finalizeTab = document.querySelector('.tab[data-tab="finalize"]');
      if (!finalizeTab) {
        HM.log(2, 'Finalize tab not found');
        return;
      }

      const basicInfoSection = finalizeTab.querySelector('.review-section[aria-labelledby="basic-info-heading"] .review-content');
      const abilitiesSection = finalizeTab.querySelector('.review-section[aria-labelledby="abilities-heading"] .abilities-grid');
      const equipmentSection = finalizeTab.querySelector('.review-section[aria-labelledby="equipment-heading"] .equipment-list');
      const bioSection = finalizeTab.querySelector('.review-section[aria-labelledby="biography-heading"] .bio-preview');
      const proficienciesSection = finalizeTab.querySelector('.review-section[aria-labelledby="proficiencies-heading"] .proficiencies-list');
      if (!basicInfoSection || !abilitiesSection || !equipmentSection || !bioSection) return;
      await this.#updateBasicInfoReview(basicInfoSection);
      await this.#updateAbilitiesReview(abilitiesSection);
      await this.#updateEquipmentReview(equipmentSection);
      await this.#updateBiographyReview(bioSection);
      if (proficienciesSection) await this.#updateProficienciesReview(proficienciesSection);
    } catch (error) {
      HM.log(1, 'Error updating review tab:', error);
    }
  }

  /* -------------------------------------------- */
  /*  Private Methods                             */
  /* -------------------------------------------- */

  /**
   * Get dropdown elements for specified types
   * @param {HTMLElement} element - Root element
   * @param {string[]} types - Dropdown types to find
   * @returns {object} Map of dropdown elements by type
   * @private
   */
  static #getDropdownElements(element, types) {
    const dropdowns = {};
    for (const type of types) {
      const selector = `#${type}-dropdown`;
      dropdowns[type] = element.querySelector(selector);
      if (!dropdowns[type]) HM.log(2, `${type} dropdown not found`);
    }
    return dropdowns;
  }

  /**
   * Handle dropdown change event
   * @param {HTMLElement} element - Root element
   * @param {string} type - Dropdown type
   * @param {Event} event - Change event
   * @private
   */
  static async #handleDropdownChange(element, type, event) {
    const value = event.target.value;
    if (!value) {
      HM.SELECTED[type] = { value: '', id: '', uuid: '' };
      HM.log(3, `${type} reset to default`);
      const currentTab = element.querySelector(`.tab[data-tab="${type}"]`);
      if (!currentTab) {
        HM.log(1, `Could not find tab for ${type}`);
        return;
      }
      const journalContainer = currentTab.querySelector('.journal-container');
      if (journalContainer) {
        journalContainer.innerHTML = '';
        journalContainer.removeAttribute('data-journal-id');
      }
      await this.#updateUIForDropdownType(element, type);
      return;
    }

    const id = value.split(' ')[0].trim();
    const uuid = value.match(/\[(.*?)]/)?.[1] || '';
    HM.SELECTED[type] = { value, id, uuid };
    HM.log(3, `${type} updated:`, HM.SELECTED[type]);
    const currentTab = element.querySelector(`.tab[data-tab="${type}"]`);
    if (!currentTab) {
      HM.log(1, `Could not find tab for ${type}`);
      return;
    }
    const journalContainer = currentTab.querySelector('.journal-container');
    if (journalContainer) {
      let doc = null;
      for (const folder of HM.documents[type] || []) {
        const foundDoc = folder.docs.find((d) => d.id === id);
        if (foundDoc) {
          doc = foundDoc;
          break;
        }
      }

      if (doc) {
        const descData = await DocumentService.getDocumentDescription(doc.uuid);
        if (descData.journalPageId) {
          journalContainer.dataset.journalId = descData.journalPageId;
          const itemName = event.target.options[event.target.selectedIndex].text.split(' (')[0];
          const embed = new JournalPageEmbed(journalContainer);
          await embed.render(descData.journalPageId, itemName);
        } else {
          journalContainer.dataset.journalId = `fallback-${doc.id || 'description'}`;
          journalContainer.innerHTML = descData.enrichedDescription || descData.description || game.i18n.localize('hm.app.no-description');
        }
      } else {
        journalContainer.removeAttribute('data-journal-id');
        journalContainer.innerHTML = game.i18n.localize('hm.app.no-description');
      }
    } else {
      HM.log(1, `Could not find journal container for ${type}`);
    }
    await this.#updateUIForDropdownType(element, type);
    if (type === 'race' && uuid) await this.updateRaceSize(uuid);
  }

  /**
   * Update UI components based on dropdown type
   * @param {HTMLElement} element - Root element
   * @param {string} type - Dropdown type
   * @private
   */
  static async #updateUIForDropdownType(element, type) {
    if (type === 'race' || type === 'class') {
      this.updateClassRaceSummary();
      if (type === 'class') this.updateAbilitiesSummary();
    }
    if (type === 'background') {
      this.updateBackgroundSummary();
      await this.processBackgroundSelectionChange(HM.SELECTED.background);
    }
    if (!HM.COMPAT.ELKAN && (type === 'class' || type === 'background')) this.updateEquipment(element, type);
    this.updateTitle(element);
  }

  /**
   * Initialize roll method selector
   * @param {HTMLElement} element - Root element
   * @private
   */
  static #initializeRollMethodSelector(element) {
    const rollMethodSelect = element.querySelector('#roll-method');
    if (!rollMethodSelect) return;
    EventRegistry.on(rollMethodSelect, 'change', async (event) => {
      const method = event.target.value;
      HM.log(3, `Roll method changed to: ${method}`);
      this.#handleRollMethodChange(element, method);
    });
  }

  /**
   * Handle roll method change
   * @param {HTMLElement} element - Root element
   * @param {string} method - Selected roll method
   * @private
   */
  static #handleRollMethodChange(element, method) {
    game.settings.set(HM.ID, 'diceRollingMethod', method);
    HeroMancer.selectedAbilities = Array(Object.keys(CONFIG.DND5E.abilities).length).fill(HM.ABILITY_SCORES.DEFAULT);
    const app = HM.heroMancer;
    if (app) {
      element.dataset.lastRollMethod = method;
      app.render({ parts: ['abilities'] });
    }
  }

  /**
   * Initialize ability dropdowns
   * @param {HTMLElement} element - Root element
   * @private
   */
  static #initializeAbilityDropdowns(element) {
    const abilityDropdowns = element.querySelectorAll('.ability-dropdown');
    abilityDropdowns.forEach((dropdown, index) => {
      dropdown.dataset.index = index;
      EventRegistry.on(dropdown, 'change', (event) => {
        const diceRollingMethod = game.settings.get(HM.ID, 'diceRollingMethod');
        StatRoller.handleAbilityDropdownChange(event, diceRollingMethod);
        this.updateAbilitiesSummary();
      });
    });
  }

  /**
   * Initialize ability score inputs
   * @param {HTMLElement} element - Root element
   * @private
   */
  static #initializeAbilityScoreInputs(element) {
    const abilityScores = element.querySelectorAll('.ability-score');
    abilityScores.forEach((input) => {
      const update = foundry.utils.debounce(() => this.updateAbilitiesSummary(), 100);
      EventRegistry.on(input, 'change', update);
      EventRegistry.on(input, 'input', update);
    });
  }

  /**
   * Get formatted UUID link for a selection type
   * @param {'race'|'class'|'background'} type - The selection type
   * @returns {string} Formatted UUID link or placeholder
   * @private
   */
  static #getSelectionLink(type) {
    const selected = HM.SELECTED[type];
    if (!selected?.uuid) return game.i18n.format('hm.unknown', { type });
    return `@UUID[${selected.uuid}]`;
  }

  /**
   * Get background data for summary
   * @returns {object} Background data including article and link
   * @private
   */
  static #getBackgroundData() {
    const backgroundSelect = document.querySelector('#background-dropdown');
    const selectedOption = backgroundSelect?.selectedIndex > 0 ? backgroundSelect.options[backgroundSelect.selectedIndex] : null;
    if (!selectedOption?.value || !HM.SELECTED.background?.uuid) return { article: game.i18n.localize('hm.app.equipment.article-plural'), link: game.i18n.localize('hm.app.background.adventurer') };
    const backgroundName = selectedOption.text;
    const article = /^[aeiou]/i.test(backgroundName) ? game.i18n.localize('hm.app.equipment.article-plural') : game.i18n.localize('hm.app.equipment.article');
    return { article: article, link: `@UUID[${HM.SELECTED.background.uuid}]` };
  }

  /**
   * Collect equipment items from the UI
   * @returns {Array} Array of selected equipment items
   * @private
   */
  static #collectEquipmentItems() {
    const selectedEquipment = Array.from(document.querySelectorAll('#equipment-container select, #equipment-container input[type="checkbox"]:checked'))
      .map((el) => this.#extractEquipmentItemData(el))
      .filter(Boolean);
    const priorityTypes = ['weapon', 'armor', 'shield'];
    selectedEquipment.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      const aIndex = priorityTypes.indexOf(a.type);
      const bIndex = priorityTypes.indexOf(b.type);
      return (bIndex === -1 ? -999 : bIndex) - (aIndex === -1 ? -999 : aIndex);
    });
    return selectedEquipment.slice(0, 3);
  }

  /**
   * Extract equipment item data from a DOM element
   * @param {HTMLElement} el - DOM element (select or checkbox)
   * @returns {object | null} Equipment item data or null if invalid
   * @private
   */
  static #extractEquipmentItemData(el) {
    if (el.tagName === 'SELECT') {
      const selectedOption = el.options[el.selectedIndex];
      if (!selectedOption || !selectedOption.value || !selectedOption.value.includes('Compendium')) return null;
      const favoriteCheckbox = el.closest('.equipment-item')?.querySelector('.equipment-favorite-checkbox');
      const isFavorite = favoriteCheckbox?.checked || false;
      return { type: selectedOption.dataset.tooltip?.toLowerCase() || '', uuid: selectedOption.value, text: selectedOption.textContent?.trim(), favorite: isFavorite };
    } else {
      const link = el.parentElement?.querySelector('.content-link');
      const uuid = link?.dataset?.uuid;
      if (!link || !uuid || uuid.includes(',') || !uuid.includes('Compendium')) return null;
      const favoriteCheckbox = el.closest('.equipment-item')?.querySelector('.equipment-favorite-checkbox');
      const isFavorite = favoriteCheckbox?.checked || false;
      return { type: link.dataset.tooltip?.toLowerCase() || '', uuid: uuid, text: link.textContent?.trim(), favorite: isFavorite };
    }
  }

  /**
   * Format and display equipment summary
   * @param {HTMLElement} summary - Summary element to update
   * @param {Array} displayEquipment - Equipment items to display
   * @returns {Promise<void>}
   * @private
   */
  static async #formatAndDisplayEquipmentSummary(summary, displayEquipment) {
    if (!displayEquipment.length) {
      summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
      return;
    }
    const formattedItems = displayEquipment.map((item) => {
      const itemName = item.text;
      const article = /^[aeiou]/i.test(itemName) ? game.i18n.localize('hm.app.equipment.article-plural') : game.i18n.localize('hm.app.equipment.article');
      return `${article} @UUID[${item.uuid}]{${item.text}}`;
    });
    const content = game.i18n.format('hm.app.finalize.summary.equipment', {
      items:
        formattedItems.slice(0, -1).join(game.i18n.localize('hm.app.equipment.separator')) + (formattedItems.length > 1 ? game.i18n.localize('hm.app.equipment.and') : '') + formattedItems.slice(-1)
    });
    summary.innerHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(content);
  }

  /**
   * Process ability highlights based on class preferences
   * @returns {void}
   * @private
   */
  static #processAbilityHighlights() {
    const previousHighlights = document.querySelectorAll('.primary-ability');
    previousHighlights.forEach((el) => {
      el.classList.remove('primary-ability');
      el.removeAttribute('data-tooltip');
    });
    const rollMethodSelect = document.getElementById('roll-method');
    const abilitiesTab = document.querySelector(".tab[data-tab='abilities']");
    const rollMethod = abilitiesTab?.dataset.currentMethod || rollMethodSelect?.value || 'standardArray';
    const primaryAbilities = this.#getPrimaryAbilitiesForClass();
    if (!primaryAbilities.size) return;
    const abilityBlocks = document.querySelectorAll('.ability-block');
    abilityBlocks.forEach((block) => {
      this.#processAbilityBlock(block, primaryAbilities, rollMethod);
    });
  }

  /**
   * Get primary abilities for the selected class
   * @returns {Set<string>} Set of primary ability keys
   * @private
   */
  static #getPrimaryAbilitiesForClass() {
    const primaryAbilities = new Set();
    try {
      const classUUID = HM.SELECTED.class?.uuid;
      if (!classUUID) return primaryAbilities;
      const classItem = fromUuidSync(classUUID);
      if (!classItem) return primaryAbilities;
      if (classItem?.system?.primaryAbility?.value?.length) for (const ability of classItem.system.primaryAbility.value) primaryAbilities.add(ability.toLowerCase());
      if (classItem?.system?.spellcasting?.ability) primaryAbilities.add(classItem.system.spellcasting.ability.toLowerCase());
      if (classItem?.advancement?.byType?.Trait) {
        const level1Traits = classItem.advancement.byType.Trait.filter((entry) => entry.level === 1 && entry.configuration.grants);
        for (const trait of level1Traits) for (const grant of trait.configuration.grants) if (grant.startsWith('saves:')) primaryAbilities.add(grant.split(':')[1].toLowerCase());
      }
    } catch (error) {
      HM.log(1, 'Error getting class primary abilities:', error);
    }
    return primaryAbilities;
  }

  /**
   * Process an individual ability block
   * @param {HTMLElement} block - Ability block element
   * @param {Set<string>} primaryAbilities - Set of primary abilities
   * @param {string} rollMethod - Current roll method
   * @private
   */
  static #processAbilityBlock(block, primaryAbilities, rollMethod) {
    let abilityKey = '';
    if (rollMethod === 'pointBuy') {
      const hiddenInput = block.querySelector('input[type="hidden"]');
      if (hiddenInput) {
        const nameMatch = hiddenInput.name.match(/abilities\[(\w+)]/);
        if (nameMatch && nameMatch[1]) abilityKey = nameMatch[1].toLowerCase();
      }
    } else if (rollMethod === 'standardArray' || rollMethod === 'manualFormula') {
      const dropdown = block.querySelector('.ability-dropdown');
      if (dropdown) {
        if (rollMethod === 'standardArray') {
          const nameMatch = dropdown.name.match(/abilities\[(\w+)]/);
          if (nameMatch && nameMatch[1]) abilityKey = nameMatch[1].toLowerCase();
        } else {
          abilityKey = dropdown.value?.toLowerCase() || '';
        }
      }
    }
    if (!abilityKey || !primaryAbilities.has(abilityKey)) return;
    const classUUID = HM.SELECTED.class?.uuid;
    const classItem = classUUID ? fromUuidSync(classUUID) : null;
    const className = classItem?.name || game.i18n.localize('hm.app.abilities.your-class');
    this.#applyAbilityHighlight(block, abilityKey, className, rollMethod);
  }

  /**
   * Apply highlighting to ability elements
   * @param {HTMLElement} block - Ability block element
   * @param {string} abilityKey - Ability key
   * @param {string} className - Class name for tooltip
   * @param {string} rollMethod - Current roll method
   * @private
   */
  static #applyAbilityHighlight(block, abilityKey, className, rollMethod) {
    const abilityName = CONFIG.DND5E.abilities[abilityKey]?.label || abilityKey.toUpperCase();
    const tooltipText = game.i18n.format('hm.app.abilities.primary-tooltip', { ability: abilityName, class: className });
    const label = block.querySelector('.ability-label');
    if (label) {
      label.classList.add('primary-ability');
      label.setAttribute('data-tooltip', tooltipText);
    }
    if (rollMethod === 'standardArray' || rollMethod === 'manualFormula') {
      const dropdown = block.querySelector('.ability-dropdown');
      if (dropdown) {
        dropdown.classList.add('primary-ability');
        dropdown.setAttribute('data-tooltip', tooltipText);
      }
    }
    if (rollMethod === 'pointBuy') {
      const scoreElement = block.querySelector('.current-score');
      if (scoreElement) {
        scoreElement.classList.add('primary-ability');
        scoreElement.setAttribute('data-tooltip', tooltipText);
      }
    }
  }

  /**
   * Update the ability summary content in the UI
   * @private
   */
  static #updateAbilitySummaryContent() {
    const abilityScores = this.#collectAbilityScores();
    if (Object.keys(abilityScores).length === 0) return;
    const primaryAbilities = this.#getPrimaryAbilitiesForClass();
    const selectedAbilities = this.#selectTopAbilities(abilityScores, primaryAbilities);
    this.#updateSummaryHTML(selectedAbilities);
  }

  /**
   * Collect ability scores from UI
   * @returns {object} Map of ability scores
   * @private
   */
  static #collectAbilityScores() {
    const abilityScores = {};
    const rollMethodSelect = document.getElementById('roll-method');
    const abilitiesTab = document.querySelector(".tab[data-tab='abilities']");
    const rollMethod = abilitiesTab?.dataset.currentMethod || rollMethodSelect?.value || 'standardArray';
    const abilityBlocks = document.querySelectorAll('.ability-block');
    abilityBlocks.forEach((block) => {
      let abilityKey = '';
      let score = 0;
      if (rollMethod === 'pointBuy') {
        const hiddenInput = block.querySelector('input[type="hidden"]');
        if (hiddenInput) {
          const nameMatch = hiddenInput.name.match(/abilities\[(\w+)]/);
          if (nameMatch && nameMatch[1]) abilityKey = nameMatch[1].toLowerCase();
        }
        score = parseInt(block.querySelector('.current-score')?.innerHTML) || 0;
      } else if (rollMethod === 'standardArray') {
        const dropdown = block.querySelector('.ability-dropdown');
        if (dropdown) {
          const nameMatch = dropdown.name.match(/abilities\[(\w+)]/);
          if (nameMatch && nameMatch[1]) abilityKey = nameMatch[1].toLowerCase();
          score = parseInt(dropdown.value) || 0;
        }
      } else if (rollMethod === 'manualFormula') {
        const dropdown = block.querySelector('.ability-dropdown');
        if (dropdown) {
          abilityKey = dropdown.value?.toLowerCase() || '';
          score = parseInt(block.querySelector('.ability-score')?.value) || 0;
        }
      }
      if (abilityKey) abilityScores[abilityKey] = score;
    });

    return abilityScores;
  }

  /**
   * Select top abilities for summary
   * @param {object} abilityScores - Map of ability scores
   * @param {Set<string>} primaryAbilities - Set of primary abilities
   * @returns {string[]} Selected ability keys
   * @private
   */
  static #selectTopAbilities(abilityScores, primaryAbilities) {
    const sortedAbilities = Object.entries(abilityScores)
      .sort(([abilityA, scoreA], [abilityB, scoreB]) => {
        const preferredA = primaryAbilities.has(abilityA);
        const preferredB = primaryAbilities.has(abilityB);
        if (preferredA && !preferredB) return -1;
        if (!preferredA && preferredB) return 1;
        return scoreB - scoreA;
      })
      .map(([ability]) => ability.toLowerCase());
    const selectedAbilities = [];
    for (const ability of sortedAbilities) if (selectedAbilities.length < 2 && !selectedAbilities.includes(ability)) selectedAbilities.push(ability);
    if (selectedAbilities.length < 2) {
      for (const [ability] of Object.entries(abilityScores).sort(([, a], [, b]) => b - a)) if (!selectedAbilities.includes(ability) && selectedAbilities.length < 2) selectedAbilities.push(ability);
    }
    return selectedAbilities;
  }

  /**
   * Update the summary HTML
   * @param {string[]} selectedAbilities - Selected ability keys
   * @returns {Promise<void>}
   * @private
   */
  static async #updateSummaryHTML(selectedAbilities) {
    const abilitiesSummary = document.querySelector('.abilities-summary');
    if (!abilitiesSummary) return;
    if (selectedAbilities.length >= 2) {
      const content = game.i18n.format('hm.app.finalize.summary.abilities', { first: `&Reference[${selectedAbilities[0]}]`, second: `&Reference[${selectedAbilities[1]}]` });
      abilitiesSummary.innerHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(content);
    } else {
      abilitiesSummary.innerHTML = game.i18n.localize('hm.app.finalize.summary.abilitiesDefault');
    }
  }

  /**
   * Find a document by its ID and type
   * @param {string} type - Document type
   * @param {string} id - Document ID
   * @returns {object | null} - Document object or null if not found
   * @private
   * @static
   */
  static async #findDocumentById(type, id) {
    const docsArray = HM.documents[type] || [];
    for (const group of docsArray) {
      const foundDoc = group.docs?.find((d) => d.id === id);
      if (foundDoc) return foundDoc;
    }
    return null;
  }

  /**
   * Render a journal page in the description element
   * @param {object} doc - Document object with basic info
   * @param {object} descData - Description data from lazy loading
   * @param {HTMLElement} descriptionEl - Description element to update
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #renderJournalPage(doc, descData, descriptionEl) {
    HM.log(3, `Found journal page ID ${descData.journalPageId} for ${doc.name}`);
    const container = descriptionEl.querySelector('.journal-container') || document.createElement('div');
    if (!container.classList.contains('journal-container')) {
      container.classList.add('journal-container');
      descriptionEl.innerHTML = '';
      descriptionEl.appendChild(container);
    }
    const embed = new JournalPageEmbed(container, { scrollable: true, height: 'auto' });
    try {
      const result = await embed.render(descData.journalPageId, doc.name);
      if (result) {
        HM.log(3, `Successfully rendered journal page for ${doc.name}`);
        return;
      }
      throw new Error('Failed to render journal page');
    } catch (error) {
      HM.log(2, `Failed to render journal page ${descData.journalPageId} for ${doc.name}: ${error.message}`);
      descriptionEl.innerHTML = '<div class="notification error">Failed to load journal page content</div>';
      setTimeout(() => this.#renderStandardDescription(doc, descData, descriptionEl), 500);
    }
  }

  /**
   * Render standard text description
   * @param {object} _doc - Document object with basic info (unused)
   * @param {object} descData - Description data from lazy loading
   * @param {HTMLElement} descriptionEl - Description element to update
   * @private
   * @static
   */
  static #renderStandardDescription(_doc, descData, descriptionEl) {
    let contentContainer = descriptionEl.classList.contains('journal-container') ? descriptionEl : descriptionEl.querySelector('.journal-container');
    if (!contentContainer) {
      contentContainer = document.createElement('div');
      contentContainer.classList.add('description-content');
      descriptionEl.appendChild(contentContainer);
    }
    if (descData.enrichedDescription) contentContainer.innerHTML = descData.enrichedDescription;
    else contentContainer.innerHTML = descData.description || game.i18n.localize('hm.app.no-description');
  }

  /**
   * Updates the basic info section of the review tab
   * @param {HTMLElement} container - The container element
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #updateBasicInfoReview(container) {
    const characterName = document.querySelector('#character-name')?.value || game.user.name;
    const nameDisplay = document.querySelector('.character-name-display');
    if (nameDisplay) nameDisplay.textContent = characterName;
    await this.#updateReviewValueWithLink(container, '.race-value', HM.SELECTED.race?.uuid);
    await this.#updateReviewValueWithLink(container, '.class-value', HM.SELECTED.class?.uuid);
    await this.#updateReviewValueWithLink(container, '.background-value', HM.SELECTED.background?.uuid);
  }

  /**
   * Updates a review value with a document link if available
   * @param {HTMLElement} container - The container element
   * @param {string} selector - Selector for the value element
   * @param {string} uuid - Document UUID
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #updateReviewValueWithLink(container, selector, uuid) {
    const element = container.querySelector(selector);
    if (!element) return;
    if (!uuid) {
      element.textContent = game.i18n.localize('hm.unknown');
      return;
    }
    try {
      const doc = fromUuidSync(uuid);
      if (doc) {
        const linkHtml = `@UUID[${uuid}]{${doc.name}}`;
        element.innerHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(linkHtml);
      } else {
        element.textContent = game.i18n.localize('hm.unknown');
      }
    } catch (error) {
      HM.log(2, `Error fetching document ${uuid}:`, error);
      element.textContent = game.i18n.localize('hm.unknown');
    }
  }

  /**
   * Updates the abilities section of the review tab
   * @param {HTMLElement} container - The container element
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #updateAbilitiesReview(container) {
    const abilityScores = this.#collectAbilityScores();
    const abilities = Object.entries(CONFIG.DND5E.abilities).map(([key, ability]) => {
      const score = abilityScores[key] || 10;
      const mod = Math.floor((score - 10) / 2);
      return { abbreviation: ability.abbreviation.toUpperCase(), score, mod: Math.abs(mod), modSign: mod >= 0 ? '+' : '-' };
    });
    container.innerHTML = await foundry.applications.handlebars.renderTemplate('modules/hero-mancer/templates/review/abilities-review.hbs', { abilities });
  }

  /**
   * Updates the biography section of the review tab
   * @param {HTMLElement} container - The container element
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #updateBiographyReview(container) {
    const bioData = this.#collectBiographyData();
    const mainText = await this.#formatMainBiographyText(bioData);
    const backstory = bioData.backstory ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(bioData.backstory) : '';
    container.innerHTML = await foundry.applications.handlebars.renderTemplate('modules/hero-mancer/templates/review/biography-review.hbs', {
      mainText,
      personalityTraits: bioData.personalityTraits,
      ideals: bioData.ideals,
      bonds: bioData.bonds,
      flaws: bioData.flaws,
      physicalDescription: bioData.physicalDescription,
      backstory
    });
  }

  /**
   * Updates the proficiencies section of the review tab
   * Extracts proficiency data from selected race, class, and background
   * @param {HTMLElement} container The proficiencies list container
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #updateProficienciesReview(container) {
    try {
      container.innerHTML = '';
      const proficiencyData = { armor: new Set(), weapons: new Set(), tools: new Set(), savingThrows: new Set(), skills: new Set(), languages: new Set() };
      await this.#extractProficiencies('race', proficiencyData);
      await this.#extractProficiencies('class', proficiencyData);
      await this.#extractProficiencies('background', proficiencyData);
      const templateData = {
        armor: Array.from(proficiencyData.armor),
        weapons: Array.from(proficiencyData.weapons),
        tools: Array.from(proficiencyData.tools),
        savingThrows: Array.from(proficiencyData.savingThrows),
        skills: Array.from(proficiencyData.skills),
        languages: Array.from(proficiencyData.languages),
        hasProficiencies:
          proficiencyData.armor.size > 0 ||
          proficiencyData.weapons.size > 0 ||
          proficiencyData.tools.size > 0 ||
          proficiencyData.savingThrows.size > 0 ||
          proficiencyData.skills.size > 0 ||
          proficiencyData.languages.size > 0
      };
      HM.log(3, 'Final proficiency data collected:', templateData);
      container.innerHTML = await foundry.applications.handlebars.renderTemplate('modules/hero-mancer/templates/review/proficiencies-review.hbs', templateData);
    } catch (error) {
      HM.log(1, 'Error updating proficiencies review:', error);
      container.innerHTML = `<div class="error-message">${game.i18n.localize('hm.app.finalize.review.proficiencies-error')}</div>`;
    }
  }

  /**
   * Extracts proficiencies from a selected document type
   * @param {'race'|'class'|'background'} type - The selection type
   * @param {object} proficiencyData - The proficiency data object to populate
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #extractProficiencies(type, proficiencyData) {
    try {
      const selected = HM.SELECTED[type];
      if (!selected?.uuid) return;
      const doc = fromUuidSync(selected.uuid);
      if (!doc) {
        HM.log(2, `${type} document not found`);
        return;
      }
      if (doc.advancement?.byType?.Trait) {
        for (const trait of doc.advancement.byType.Trait) if (trait.configuration?.grants) for (const grant of trait.configuration.grants) this.#categorizeTraitGrant(grant, proficiencyData, doc.name);
      }
      if (type === 'race' && doc.system?.traits?.languages?.value) {
        for (const lang of doc.system.traits.languages.value) {
          const langConfig = CONFIG.DND5E.languages[lang];
          if (langConfig) proficiencyData.languages.add({ name: langConfig.label || lang, source: doc.name });
        }
      }
    } catch (error) {
      HM.log(1, `Error extracting ${type} proficiencies:`, error);
    }
  }

  /**
   * Categorizes a trait grant into the appropriate proficiency category
   * @param {string} grant The grant string to categorize
   * @param {object} proficiencyData The proficiency data object
   * @param {string} source The source of the proficiency
   * @private
   * @static
   */
  static #categorizeTraitGrant(grant, proficiencyData, source) {
    try {
      if (grant.startsWith('saves:')) {
        const ability = grant.split(':')[1];
        const abilityConfig = CONFIG.DND5E.abilities[ability];
        proficiencyData.savingThrows.add({ name: abilityConfig.label, source: source });
      } else if (grant.startsWith('skills:')) {
        const skill = grant.split(':')[1];
        const skillConfig = CONFIG.DND5E.skills[skill];
        proficiencyData.skills.add({ name: skillConfig.label, source: source });
      } else if (grant.startsWith('languages:')) {
        const langParts = grant.split(':');
        const langType = langParts[1]; // e.g., 'standard', 'exotic'
        const langConfig = CONFIG.DND5E.languages[langType];
        proficiencyData.languages.add({ name: langConfig.label, source: source });
      } else if (grant.startsWith('armor:')) {
        const armor = grant.split(':')[1];
        const armorConfig = CONFIG.DND5E.armorProficiencies?.[armor] || CONFIG.DND5E.armorTypes?.[armor];
        proficiencyData.armor.add({ name: armorConfig.label || armorConfig, source: source });
      } else if (grant.startsWith('weapon:')) {
        const weapon = grant.split(':')[1];
        const weaponConfig = CONFIG.DND5E.weaponProficiencies?.[weapon] || CONFIG.DND5E.weaponTypes?.[weapon];
        proficiencyData.weapons.add({ name: weaponConfig.label || weaponConfig, source: source });
      } else if (grant.startsWith('tool:')) {
        const toolParts = grant.split(':');
        const toolType = toolParts[1];
        let toolConfig = CONFIG.DND5E.toolProficiencies?.[toolType] || CONFIG.DND5E.toolIds?.[grant] || CONFIG.DND5E.toolTypes?.[toolType];
        proficiencyData.tools.add({ name: toolConfig?.label || toolConfig, source: source });
      }
    } catch (error) {
      HM.log(1, `Error categorizing grant "${grant}":`, error);
    }
  }

  /**
   * Gets equipment items by source type
   * @param {'background'|'class'} type - The equipment source type
   * @returns {Array<object>} Array of equipment items
   * @private
   * @static
   */
  static #getEquipmentByType(type) {
    const useStartingWealth = document.querySelector(`#use-starting-wealth-${type}`)?.checked || false;
    if (useStartingWealth) {
      const wealthAmount = document.querySelector(`#starting-wealth-amount-${type}`)?.value || '0 gp';
      return [{ uuid: 'special-starting-wealth', name: game.i18n.format('hm.app.finalize.review.starting-wealth', { amount: wealthAmount }), isStartingWealth: true }];
    }
    const section = document.querySelector(`.${type}-equipment-section`);
    if (!section) return [];
    const items = [];
    for (const select of section.querySelectorAll('select:not([disabled])')) {
      if (!select.value) continue;
      const itemName = select.options[select.selectedIndex]?.textContent || select.closest('table')?.querySelector('h4')?.textContent || 'Unknown Item';
      items.push({ uuid: select.value, name: itemName, source: type });
    }
    for (const checkbox of section.querySelectorAll('input[type="checkbox"]:not(.equipment-favorite-checkbox):not([disabled]):checked')) {
      if (!checkbox.value || !checkbox.value.includes('Compendium')) continue;
      const itemLink = checkbox.closest('label')?.querySelector('.content-link');
      const itemName = itemLink?.textContent || checkbox.closest('table')?.querySelector('h4')?.textContent || 'Unknown Item';
      items.push({ uuid: checkbox.value, name: itemName, source: type });
    }
    return items;
  }

  /**
   * Updates the equipment section of the review tab
   * @param {HTMLElement} container - The container element
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #updateEquipmentReview(container) {
    if (HM.COMPAT.ELKAN) {
      container.innerHTML = await foundry.applications.handlebars.renderTemplate('modules/hero-mancer/templates/review/equipment-review.hbs', { elkanMode: true });
      return;
    }
    const backgroundItems = this.#getEquipmentByType('background');
    const classItems = this.#getEquipmentByType('class');
    const backgroundName = (await this.#getBackgroundName()) || game.i18n.localize('DND5E.Background');
    const className = (await this.#getClassName()) || game.i18n.localize('TYPES.Item.class');
    const enrichItems = async (items) => {
      if (!items.length || items[0].isStartingWealth) return items;
      return Promise.all(items.map(async (item) => ({ ...item, link: await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${item.uuid}]{${item.name}}`) })));
    };
    container.innerHTML = await foundry.applications.handlebars.renderTemplate('modules/hero-mancer/templates/review/equipment-review.hbs', {
      elkanMode: false,
      backgroundHeader: game.i18n.format('hm.app.equipment.type-equipment', { type: backgroundName }),
      classHeader: game.i18n.format('hm.app.equipment.type-equipment', { type: className }),
      backgroundItems: await enrichItems(backgroundItems),
      classItems: await enrichItems(classItems)
    });
  }

  /**
   * Gets the name of the selected background
   * @returns {Promise<string>} The background name
   * @private
   * @static
   */
  static async #getBackgroundName() {
    if (!HM.SELECTED.background?.uuid) return '';
    try {
      const background = fromUuidSync(HM.SELECTED.background.uuid);
      return background?.name || '';
    } catch (error) {
      HM.log(2, `Error getting background name: ${error.message}`);
      return '';
    }
  }

  /**
   * Gets the name of the selected class
   * @returns {Promise<string>} The class name
   * @private
   * @static
   */
  static async #getClassName() {
    if (!HM.SELECTED.class?.uuid) return '';
    try {
      const classItem = fromUuidSync(HM.SELECTED.class.uuid);
      return classItem?.name || '';
    } catch (error) {
      HM.log(2, `Error getting class name: ${error.message}`);
      return '';
    }
  }

  /**
   * Collects biography data from form inputs
   * @returns {object} Biography data
   * @private
   * @static
   */
  static #collectBiographyData() {
    return {
      alignment: document.querySelector('#alignment')?.value || '',
      size: document.querySelector('#size')?.value || '',
      gender: document.querySelector('#gender')?.value || '',
      age: document.querySelector('#age')?.value || '',
      weight: document.querySelector('#weight')?.value || '',
      height: document.querySelector('#height')?.value || '',
      eyes: document.querySelector('#eyes')?.value || '',
      hair: document.querySelector('#hair')?.value || '',
      skin: document.querySelector('#skin')?.value || '',
      faith: document.querySelector('#faith')?.value || '',
      personalityTraits: document.querySelector('#personality')?.value || '',
      ideals: document.querySelector('#ideals')?.value || '',
      bonds: document.querySelector('#bonds')?.value || '',
      flaws: document.querySelector('#flaws')?.value || '',
      physicalDescription: document.querySelector('#description')?.value || '',
      backstory: document.querySelector('#backstory')?.value || ''
    };
  }

  /**
   * Formats the main biography text with localization
   * @param {object} bioData - Biography data
   * @returns {string} Formatted text
   * @private
   * @static
   */
  static async #formatMainBiographyText(bioData) {
    const adjectives = game.i18n.localize('hm.app.finalize.review.appearance-adjectives').split(',');
    const eyesAdjective = adjectives[Math.floor(Math.random() * adjectives.length)].trim();
    const skinAdjective = adjectives[Math.floor(Math.random() * adjectives.length)].trim();
    let formatString = 'hm.app.finalize.review.biography-format';
    const formatData = {
      alignment: bioData.alignment || game.i18n.localize('hm.unknown'),
      size: bioData.size || game.i18n.localize('hm.unknown'),
      gender: bioData.gender || game.i18n.localize('hm.unknown'),
      age: bioData.age || game.i18n.localize('hm.unknown'),
      weight: bioData.weight || game.i18n.localize('hm.unknown'),
      height: bioData.height || game.i18n.localize('hm.unknown'),
      eyesAdjective: eyesAdjective,
      eyes: bioData.eyes || game.i18n.localize('hm.unknown'),
      hair: bioData.hair || game.i18n.localize('hm.unknown'),
      skinAdjective: skinAdjective,
      skin: bioData.skin || game.i18n.localize('hm.unknown')
    };

    const includeFaith = bioData.faith && bioData.faith !== game.i18n.localize('None');
    formatString = includeFaith ? 'hm.app.finalize.review.biography-format-with-faith' : formatString;
    if (includeFaith) formatData.faith = bioData.faith;
    return game.i18n.format(formatString, formatData);
  }
}
