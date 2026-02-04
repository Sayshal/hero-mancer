/**
 * @module HeroMancerUI
 * @description UI management for the HeroMancer application - handles initialization,
 * event binding, summary updates, review tab, and form state.
 */

import { DocumentService, EquipmentManager, EquipmentUI, EventRegistry, FormValidation, HeroMancer, HM, JournalPageEmbed, MODULE, SavedOptions, StatRoller, TableManager } from './index.js';
import { log } from './logger.mjs';

/**
 * Centralized UI management for the HeroMancer application.
 * @class
 */
export class HeroMancerUI {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @type {boolean} */
  static #equipmentUpdateInProgress = false;

  /** @type {Promise|null} */
  static #pendingEquipmentUpdate = null;

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Clean up all registered listeners, observers, and internal state.
   * @returns {boolean} True if cleanup was successful
   */
  static cleanup() {
    this.#equipmentUpdateInProgress = false;
    this.#pendingEquipmentUpdate = null;
    EventRegistry.cleanupAll();
    EquipmentManager.clearCache();
    log(3, 'HeroMancerUI: cleanup complete');
    return true;
  }

  /**
   * Initialize all event handlers for the application
   * @param {HTMLElement} element - Root element
   * @returns {Promise<boolean>} Success status
   */
  static async initialize(element) {
    if (!element) {
      log(1, 'Cannot initialize HeroMancerUI: No element provided');
      return false;
    }
    try {
      this.initializeEquipmentContainer(element);
      this.initializeDropdowns(element);
      this.initializeAbilities(element);
      this.initializeCharacterDetails(element);
      this.initializeFormValidation(element);
      this.initializeTokenCustomization(element);
      await this.initializeRollButtons(element);
    } catch (error) {
      log(1, 'Error during HeroMancerUI initialization:', error);
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
   * Initialize equipment container with full equipment UI.
   * @param {HTMLElement} element - Root element
   * @returns {Promise<void>}
   */
  static async initializeEquipmentContainer(element) {
    const equipmentContainer = element.querySelector('#equipment-container');
    if (!equipmentContainer || HM.COMPAT.ELKAN) return;

    try {
      await EquipmentUI.render(equipmentContainer);
    } catch (error) {
      log(1, 'Failed to initialize equipment container:', error);
      equipmentContainer.innerHTML = `<p class="error">${game.i18n.localize('hm.errors.equipment-rendering')}</p>`;
    }
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
    const mandatoryFields = game.settings.get(MODULE.ID, 'mandatoryFields') || [];
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
    const ringEnabled = game.settings.get(MODULE.ID, 'enableTokenCustomization');
    if (!ringEnabled) return;
    const ringEnabledElement = element.querySelector('input[name="ring.enabled"]');
    const ringOptions = element.querySelectorAll(
      ['.form-group:has(color-picker[name="ring.color"])', '.form-group:has(color-picker[name="backgroundColor"])', '.form-group.ring-effects'].join(', ')
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
        const textarea = event.currentTarget.closest('.personality-group').querySelector('textarea');
        const backgroundId = HM.SELECTED.background.id;
        if (!backgroundId) {
          ui.notifications.warn(game.i18n.localize('hm.warnings.select-background'));
          return;
        }
        const result = await TableManager.rollOnBackgroundCharacteristicTable(backgroundId, tableType);
        log(3, 'Roll result:', result);
        if (result) {
          textarea.value = textarea.value ? `${textarea.value} ${result}` : result;
          textarea.dispatchEvent(new Event('change', { bubbles: true }));
          if (TableManager.areAllTableResultsDrawn(backgroundId, tableType)) button.disabled = true;
        }
      });
    });
  }

  /**
   * Updates ability highlights based on class primary abilities
   * @static
   */
  static updateAbilityHighlights() {
    this.#processAbilityHighlights();
  }

  /**
   * Updates the character size field based on race advancements
   * @param {string} raceUuid UUID of the selected race
   * @static
   */
  static async updateRaceSize(raceUuid) {
    try {
      if (!raceUuid) {
        log(3, 'No race UUID provided for size update');
        return;
      }
      const sizeInput = document.getElementById('size');
      if (!sizeInput) {
        log(2, 'Could not find size input element');
        return;
      }
      const race = fromUuidSync(raceUuid);
      if (!race) {
        log(2, `Could not find race with UUID: ${raceUuid}`);
        sizeInput.value = '';
        sizeInput.placeholder = game.i18n.localize('hm.app.biography.size-placeholder');
        return;
      }
      log(3, `Processing race: ${race.name}`, race);
      let sizesArray = [];
      let hint = '';
      if (race.advancement?.byType?.Size?.length) {
        const sizeAdvancement = race.advancement.byType.Size[0];
        log(3, 'Found Size advancement:', sizeAdvancement);
        if (sizeAdvancement.configuration?.sizes) {
          if (sizeAdvancement.configuration.sizes instanceof Set) {
            sizesArray = Array.from(sizeAdvancement.configuration.sizes);
            log(3, `Converted sizes Set to Array: ${sizesArray.join(', ')}`);
          } else if (Array.isArray(sizeAdvancement.configuration.sizes)) {
            sizesArray = sizeAdvancement.configuration.sizes;
          }
          hint = sizeAdvancement.hint || '';
        }
      }
      if (!sizesArray.length) {
        log(2, `No size advancement found for race: ${race.name}`, { advancement: race.advancement });
        sizeInput.value = '';
        sizeInput.placeholder = game.i18n.localize('hm.app.biography.size-placeholder');
        return;
      }
      const sizeLabels = sizesArray.map((size) => {
        return CONFIG.DND5E.actorSizes[size]?.label || size;
      });
      log(3, `Size labels for ${race.name}: ${sizeLabels.join(', ')}`);
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
      log(3, `Updated size input with value: "${sizeText}"`);
      if (hint) {
        sizeInput.title = hint;
        log(3, `Added size hint from race: "${hint}"`);
      }
    } catch (error) {
      log(1, `Error updating race size: ${error.message}`, error);
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
      const mandatoryFields = game.settings.get(MODULE.ID, 'mandatoryFields') || [];
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
      log(1, `Error updating tab indicators: ${error.message}`);
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
      log(2, `Cannot update ${type} description: No description element provided`);
      return;
    }

    log(3, `Updating ${type} description for ID: ${id}`);
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
      log(1, `Error updating ${type} description: ${error.message}`, error);
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
    } catch (error) {
      log(1, `Error in updateEquipment for ${type}:`, error);
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
      log(2, `Error getting document: ${error}`);
    }
    let characterDescription = characterName;
    const components = [race, background, charClass].filter((c) => c);
    if (components.length > 0) {
      characterDescription += `, ${game.i18n.format('hm.app.title', { components: components.join(' ') })}`;
      characterDescription += '.';
    }

    const newTitle = `${MODULE.NAME} | ${characterDescription}`;

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
        log(2, 'Finalize tab not found');
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
      log(1, 'Error updating review tab:', error);
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
      if (!dropdowns[type]) log(2, `${type} dropdown not found`);
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
      log(3, `${type} reset to default`);
      const currentTab = element.querySelector(`.tab[data-tab="${type}"]`);
      if (!currentTab) {
        log(1, `Could not find tab for ${type}`);
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
    log(3, `${type} updated:`, HM.SELECTED[type]);
    const currentTab = element.querySelector(`.tab[data-tab="${type}"]`);
    if (!currentTab) {
      log(1, `Could not find tab for ${type}`);
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
      log(1, `Could not find journal container for ${type}`);
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
    if (type === 'class') this.updateAbilityHighlights();
    if (type === 'background') await this.processBackgroundSelectionChange(HM.SELECTED.background);
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
      log(3, `Roll method changed to: ${method}`);
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
    game.settings.set(MODULE.ID, 'diceRollingMethod', method);
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
        const diceRollingMethod = game.settings.get(MODULE.ID, 'diceRollingMethod');
        StatRoller.handleAbilityDropdownChange(event, diceRollingMethod);
        this.updateAbilityHighlights();
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
      const update = foundry.utils.debounce(() => this.updateAbilityHighlights(), 100);
      EventRegistry.on(input, 'change', update);
      EventRegistry.on(input, 'input', update);
    });
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
      log(1, 'Error getting class primary abilities:', error);
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
    log(3, `Found journal page ID ${descData.journalPageId} for ${doc.name}`);
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
        log(3, `Successfully rendered journal page for ${doc.name}`);
        return;
      }
      throw new Error('Failed to render journal page');
    } catch (error) {
      log(2, `Failed to render journal page ${descData.journalPageId} for ${doc.name}: ${error.message}`);
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
      log(2, `Error fetching document ${uuid}:`, error);
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

      // Deduplicate entries by name, merge sources into a tooltip string
      const dedup = (set) => {
        const map = new Map();
        for (const { name, source } of set) {
          if (!map.has(name)) map.set(name, new Set());
          map.get(name).add(source);
        }
        return Array.from(map.entries()).map(([name, sources]) => ({ name, tooltip: Array.from(sources).join(', ') }));
      };

      const categories = [];
      const addCategory = (set, labelKey, icon) => {
        if (set.size > 0) categories.push({ label: game.i18n.localize(labelKey), icon, items: dedup(set) });
      };
      addCategory(proficiencyData.armor, 'DND5E.TraitArmorProf', 'fa-solid fa-shield-halved');
      addCategory(proficiencyData.weapons, 'DND5E.TraitWeaponProf', 'fa-solid fa-hand-fist');
      addCategory(proficiencyData.tools, 'DND5E.TraitToolProf', 'fa-solid fa-screwdriver-wrench');
      addCategory(proficiencyData.savingThrows, 'DND5E.ClassSaves', 'fa-solid fa-dice-d20');
      addCategory(proficiencyData.skills, 'DND5E.Skills', 'fa-solid fa-star');
      addCategory(proficiencyData.languages, 'DND5E.Languages', 'fa-solid fa-language');

      log(3, 'Final proficiency data collected:', categories);
      container.innerHTML = await foundry.applications.handlebars.renderTemplate('modules/hero-mancer/templates/review/proficiencies-review.hbs', { categories });
    } catch (error) {
      log(1, 'Error updating proficiencies review:', error);
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
        log(2, `${type} document not found`);
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
      log(1, `Error extracting ${type} proficiencies:`, error);
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
      log(1, `Error categorizing grant "${grant}":`, error);
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

    // Checked linked-item checkboxes — UUID from data-uuid, name from the label's content-link
    for (const checkbox of section.querySelectorAll('input[type="checkbox"][data-linked-item]:checked')) {
      if (checkbox.closest('[hidden]')) continue;
      const uuid = checkbox.dataset.uuid;
      if (!uuid?.includes('Compendium')) continue;
      const label = section.querySelector(`label[for="${checkbox.id}"]`);
      const link = label?.querySelector('.content-link');
      const name = link?.textContent?.trim() || 'Unknown Item';
      const count = parseInt(checkbox.dataset.count) || 1;
      items.push({ uuid, name: count > 1 ? `${name} ×${count}` : name, source: type });
    }

    // Category selects (data-equipment-select) — skip selects inside hidden OR containers
    for (const select of section.querySelectorAll('select[data-equipment-select]')) {
      if (select.closest('[hidden]')) continue;
      const uuid = select.value;
      if (!uuid?.includes('Compendium')) continue;
      const name = select.options[select.selectedIndex]?.textContent?.trim() || 'Unknown Item';
      const count = parseInt(select.dataset.count) || 1;
      items.push({ uuid, name: count > 1 ? `${name} ×${count}` : name, source: type });
    }

    // OR selects (data-or-select) — resolve selected child to items
    for (const select of section.querySelectorAll('select[data-or-select]')) {
      const selectedValue = select.value;
      const group = select.dataset.orGroup;

      // Pattern A: single hidden input with data-or-child (e.g. Chain Mail, Dungeoneer's Pack)
      const hiddenInput = section.querySelector(`input[data-or-child="${selectedValue}"][data-or-parent="${group}"]:not([disabled])`);
      if (hiddenInput) {
        const uuid = hiddenInput.value || hiddenInput.dataset.uuid;
        if (uuid?.includes('Compendium')) {
          const count = parseInt(hiddenInput.dataset.count) || 1;
          const name = select.options[select.selectedIndex]?.textContent?.trim() || 'Unknown Item';
          items.push({ uuid, name: count > 1 ? `${name} ×${count}` : name, source: type });
        }
        continue;
      }

      // Pattern B: container div with data-or-child holding multiple linked items
      const container = section.querySelector(`div[data-or-child="${selectedValue}"][data-or-parent="${group}"]:not([hidden])`);
      if (!container) continue;
      for (const input of container.querySelectorAll('input[type="hidden"][data-linked-item]')) {
        const uuid = input.value || input.dataset.uuid;
        if (!uuid?.includes('Compendium')) continue;
        const count = parseInt(input.dataset.count) || 1;
        const item = fromUuidSync(uuid);
        const name = item?.name || 'Unknown Item';
        items.push({ uuid, name: count > 1 ? `${name} ×${count}` : name, source: type });
      }
      // Category selects inside visible containers are handled by the loop above
    }

    // Currency labels (bare labels without a for attribute inside equipment-entries)
    for (const label of section.querySelectorAll('.equipment-entries > label')) {
      if (label.closest('[hidden]')) continue;
      const text = label.textContent?.trim();
      if (text) items.push({ uuid: null, name: text, source: type, isCurrency: true });
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
      return Promise.all(items.map(async (item) => {
        if (item.isCurrency || !item.uuid) return { ...item, link: item.name };
        return { ...item, link: await foundry.applications.ux.TextEditor.implementation.enrichHTML(`@UUID[${item.uuid}]{${item.name}}`) };
      }));
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
      log(2, `Error getting background name: ${error.message}`);
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
      log(2, `Error getting class name: ${error.message}`);
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
