import { EquipmentParser, HeroMancer, HM, MandatoryFields, StatRoller, SummaryManager } from './index.js';

/**
 * Centralized DOM event and observer management
 * @class
 */
export class DOMManager {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @type {Map<HTMLElement, Map<string, Function[]>>} */
  static #listeners = new Map();

  /** @type {Map<string, MutationObserver>} */
  static #observers = new Map();

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Add and track an event listener
   * @param {HTMLElement} element - Target element
   * @param {string} eventType - Event type ('click', 'change', etc.)
   * @param {Function} callback - Event handler
   * @returns {Function} The callback for reference
   */
  static on(element, eventType, callback) {
    if (!element) return callback;

    if (!this.#listeners.has(element)) {
      this.#listeners.set(element, new Map());
    }

    const elementEvents = this.#listeners.get(element);
    if (!elementEvents.has(eventType)) {
      elementEvents.set(eventType, []);
    }

    elementEvents.get(eventType).push(callback);
    element.addEventListener(eventType, callback);

    return callback;
  }

  /**
   * Create and track a mutation observer
   * @param {string} id - Unique observer ID
   * @param {HTMLElement} element - Element to observe
   * @param {MutationObserverInit} options - Observer configuration
   * @param {Function} callback - Handler function
   * @returns {MutationObserver} The created observer
   */
  static observe(id, element, options, callback) {
    if (this.#observers.has(id)) {
      this.#observers.get(id).disconnect();
    }

    const observer = new MutationObserver(callback);
    observer.observe(element, options);
    this.#observers.set(id, observer);

    return observer;
  }

  /**
   * Clean up all registered listeners and observers
   */
  static cleanup() {
    // Clean up event listeners
    this.#listeners.forEach((events, element) => {
      events.forEach((callbacks, type) => {
        callbacks.forEach((callback) => {
          element.removeEventListener(type, callback);
        });
      });
    });
    this.#listeners.clear();

    // Clean up observers
    this.#observers.forEach((observer) => observer.disconnect());
    this.#observers.clear();

    HM.log(3, 'DOMManager: cleaned up all event listeners and observers');
  }

  /**
   * Initialize all event handlers for the application
   * @param {HTMLElement} element - Root element
   */
  static initialize(element) {
    if (!element) return;

    this.initializeEquipmentContainer(element);
    this.initializeDropdowns(element);
    this.initializeAbilities(element);
    this.initializeEquipment(element);
    this.initializeCharacterDetails(element);
    this.initializeFormValidation(element);
    this.initializeTokenCustomization(element);
    this.initializeRollButtons(element);
  }

  /**
   * Initialize dropdown-related handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeDropdowns(element) {
    const dropdowns = {
      race: element.querySelector('#race-dropdown'),
      class: element.querySelector('#class-dropdown'),
      background: element.querySelector('#background-dropdown')
    };

    Object.entries(dropdowns).forEach(([type, dropdown]) => {
      if (!dropdown) return;

      this.on(dropdown, 'change', (event) => {
        // Update selection data
        const value = event.target.value;
        const id = value.split(' ')[0].trim();
        const uuid = value.match(/\[(.*?)]/)?.[1] || '';

        HM.SELECTED[type] = { value, id, uuid };
        HM.log(3, `${type} updated:`, HM.SELECTED[type]);

        // Update UI elements
        const descEl = element.querySelector(`#${type}-description`);
        if (descEl) {
          this.updateDescription(type, id, descEl);
        }

        // Update summaries
        if (type === 'race' || type === 'class') {
          SummaryManager.updateClassRaceSummary();

          // Update abilities if class changes
          if (type === 'class') {
            SummaryManager.updateAbilitiesSummary();
          }
        }

        if (type === 'background') {
          SummaryManager.updateBackgroundSummary();
          SummaryManager.processBackgroundSelectionChange(HM.SELECTED.background);
        }

        // Update equipment if needed
        if (!HM.COMPAT.ELKAN && (type === 'class' || type === 'background')) {
          this.updateEquipment(element, type);
        }

        // Update application title
        this.updateTitle(element);
      });
    });
  }

  /**
   * Initialize ability score related handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeAbilities(element) {
    const rollMethodSelect = element.querySelector('#roll-method');
    const abilityDropdowns = element.querySelectorAll('.ability-dropdown');
    const abilityScores = element.querySelectorAll('.ability-score');

    // Roll method listener with special handling
    if (rollMethodSelect) {
      // First, remove any existing listeners to avoid duplicates
      const oldListeners = this.#listeners.get(rollMethodSelect);
      if (oldListeners?.get('change')) {
        oldListeners.get('change').forEach((callback) => {
          rollMethodSelect.removeEventListener('change', callback);
        });
        oldListeners.delete('change');
      }

      this.on(rollMethodSelect, 'change', async (event) => {
        const method = event.target.value;
        HM.log(3, `Roll method changed to: ${method}`);

        // Update the setting
        await game.settings.set(HM.ID, 'diceRollingMethod', method);
        HeroMancer.selectedAbilities = Array(Object.keys(CONFIG.DND5E.abilities).length).fill(HM.ABILITY_SCORES.DEFAULT);

        // Force a re-render of just the abilities tab
        const app = HM.heroMancer;
        if (app) {
          // Store current method for detection
          element.dataset.lastRollMethod = method;
          await app.render({ parts: ['abilities'] });
        }
      });
    }

    // Ability dropdowns
    abilityDropdowns.forEach((dropdown, index) => {
      // Add data-index attribute for reliable reference
      dropdown.dataset.index = index;

      this.on(dropdown, 'change', (event) => {
        const diceRollingMethod = game.settings.get(HM.ID, 'diceRollingMethod');
        StatRoller.handleAbilityDropdownChange(event, diceRollingMethod);
        SummaryManager.updateAbilitiesSummary();
      });
    });

    // Ability score inputs
    abilityScores.forEach((input) => {
      this.on(input, 'change', () => SummaryManager.updateAbilitiesSummary());
      this.on(input, 'input', () => SummaryManager.updateAbilitiesSummary());
    });
  }

  /**
   * Initialize equipment-related handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeEquipment(element) {
    const equipmentContainer = element.querySelector('#equipment-container');
    if (!equipmentContainer || HM.COMPAT.ELKAN) return;

    // Use mutation observer to catch dynamically added elements
    this.observe('equipment-container', equipmentContainer, { childList: true, subtree: true, attributes: true }, (mutations) => {
      let needsUpdate = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Add listeners to newly added checkboxes
              const newCheckboxes = node.querySelectorAll?.('.equipment-favorite-checkbox') || [];
              newCheckboxes.forEach((checkbox) => {
                this.on(checkbox, 'change', () => {
                  SummaryManager.updateEquipmentSummary();
                });
              });

              // If we added elements that affect summary, flag for update
              if (node.querySelector('select') || node.querySelector('input[type="checkbox"]')) {
                needsUpdate = true;
              }
            }
          });
        }

        // If attribute changed on a favorite checkbox
        if (mutation.type === 'attributes' && mutation.attributeName === 'checked' && mutation.target.classList.contains('equipment-favorite-checkbox')) {
          needsUpdate = true;
        }
      }

      // Only update once if needed
      if (needsUpdate) {
        SummaryManager.updateEquipmentSummary();
      }
    });

    // Attach listeners to existing equipment items
    this.attachEquipmentListeners(equipmentContainer);
  }

  /**
   * Initialize empty equipment container structure
   * @param {HTMLElement} element - Root element
   */
  static initializeEquipmentContainer(element) {
    const equipmentContainer = element.querySelector('#equipment-container');
    if (!equipmentContainer || HM.COMPAT.ELKAN) return;

    // Clear any existing content
    equipmentContainer.innerHTML = '';
    const choicesContainer = document.createElement('div');
    choicesContainer.className = 'equipment-choices';

    // Add choices container to equipment container
    equipmentContainer.appendChild(choicesContainer);
  }

  /**
   * Attach listeners to equipment elements
   * @param {HTMLElement} container - Equipment container
   */
  static attachEquipmentListeners(container) {
    if (!container) return;

    // Add change listeners to selects and checkboxes
    const selects = container.querySelectorAll('select');
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');

    selects.forEach((select) => {
      this.on(select, 'change', () => SummaryManager.updateEquipmentSummary());
    });

    checkboxes.forEach((checkbox) => {
      this.on(checkbox, 'change', () => SummaryManager.updateEquipmentSummary());
    });
  }

  /**
   * Initialize character detail handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeCharacterDetails(element) {
    // Character name input
    const nameInput = element.querySelector('#character-name');
    if (nameInput) {
      this.on(nameInput, 'input', () => this.updateTitle(element));
    }

    // Token art checkbox
    const tokenArtCheckbox = element.querySelector('#link-token-art');
    if (tokenArtCheckbox) {
      this.on(tokenArtCheckbox, 'change', () => {
        const tokenArtRow = element.querySelector('.token-art-row');
        if (tokenArtRow) {
          tokenArtRow.style.display = tokenArtCheckbox.checked ? 'none' : 'flex';
        }
      });
    }

    // Player dropdown (GM only)
    if (game.user.isGM) {
      const playerElement = element.querySelector('#player-assignment');
      if (playerElement) {
        this.on(playerElement, 'change', (event) => {
          const playerId = event.currentTarget.value;
          const colorPicker = element.querySelector('#player-color');
          if (colorPicker) {
            colorPicker.value = HeroMancer.ORIGINAL_PLAYER_COLORS.get(playerId);
          }
        });
      }
    }

    // Portrait updates
    SummaryManager.initializePortrait();
  }

  /**
   * Initialize form validation handlers
   * @param {HTMLElement} element - Application root element
   */
  static initializeFormValidation(element) {
    const mandatoryFields = game.settings.get(HM.ID, 'mandatoryFields') || [];
    if (mandatoryFields.length === 0) return;

    // Form elements
    const formElements = element.querySelectorAll('input, select, textarea, color-picker');
    formElements.forEach((formElement) => {
      // Change event
      this.on(formElement, 'change', async () => {
        await MandatoryFields.checkMandatoryFields(element);
      });

      // Input event for text inputs
      if (formElement.tagName.toLowerCase() === 'input' || formElement.tagName.toLowerCase() === 'textarea') {
        this.on(formElement, 'input', async () => {
          await MandatoryFields.checkMandatoryFields(element);
        });
      }
    });

    // ProseMirror editors
    const proseMirrorElements = element.querySelectorAll('prose-mirror');
    proseMirrorElements.forEach((editor, index) => {
      const editorContent = editor.querySelector('.editor-content.ProseMirror');
      if (editorContent) {
        this.observe(`prose-mirror-${index}`, editorContent, { childList: true, characterData: true, subtree: true }, async () => {
          await MandatoryFields.checkMandatoryFields(element);
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

    // Initial state
    ringOptions.forEach((option) => {
      option.style.display = ringEnabledElement.checked ? 'flex' : 'none';
    });

    // Toggle on change
    this.on(ringEnabledElement, 'change', (event) => {
      if (!event.currentTarget.checked) {
        // Reset color pickers
        element.querySelectorAll('color-picker[name="ring.color"], color-picker[name="backgroundColor"]').forEach((picker) => {
          picker.value = '';
          picker.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Reset ring effect checkboxes
        element.querySelectorAll('input[name="ring.effects"]').forEach((checkbox) => {
          checkbox.checked = false;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        });
      }

      // Toggle visibility
      ringOptions.forEach((option) => {
        option.style.display = event.currentTarget.checked ? 'flex' : 'none';
      });
    });
  }

  /**
   * Initialize roll buttons for background traits
   * @param {HTMLElement} element - Application root element
   */
  static initializeRollButtons(element) {
    // This requires SummaryManager.initializeRollButtons() since it depends on TableManager
    SummaryManager.initializeRollButtons();
  }

  /* -------------------------------------------- */
  /*  Helper Methods                              */
  /* -------------------------------------------- */

  /**
   * Update description element with content
   * @param {string} type - Type of dropdown (class, race, background)
   * @param {string} id - ID of selected item
   * @param {HTMLElement} descriptionEl - Description element to update
   */
  static updateDescription(type, id, descriptionEl) {
    HM.log(3, `Updating ${type} description for ID: ${id}`);

    try {
      // For race documents, they're organized in folders
      if (type === 'race') {
        let foundDoc = null;

        for (const folder of HM.documents.race) {
          const doc = folder.docs.find((d) => d.id === id);
          if (doc) {
            foundDoc = doc;
            break;
          }
        }

        if (foundDoc) {
          descriptionEl.innerHTML = foundDoc.enrichedDescription || '';
        } else {
          if (!id) return;
          descriptionEl.innerHTML = game.i18n.localize('hm.app.no-description');
        }
      } else {
        const docsArray = HM.documents[type] || [];
        const doc = docsArray.find((d) => d.id === id);

        if (doc) {
          if (doc.enrichedDescription) {
            descriptionEl.innerHTML = doc.enrichedDescription;
          } else {
            descriptionEl.innerHTML = game.i18n.localize('hm.app.no-description');
          }
        } else {
          if (!id) return;
          descriptionEl.innerHTML = game.i18n.localize('hm.app.no-description');
        }
      }
    } catch (error) {
      HM.log(1, `Error updating ${type} description: ${error}`);
      descriptionEl.innerHTML = game.i18n.localize('hm.app.no-description');
    }
  }

  /**
   * Update equipment UI based on changed selections
   * @param {HTMLElement} element - Application root element
   * @param {string} type - Which selection changed ('class' or 'background')
   */
  static updateEquipment(element, type) {
    const equipmentContainer = element.querySelector('#equipment-container');
    if (!equipmentContainer) return;

    try {
      // Reset rendered flags
      if (EquipmentParser.lookupItems) {
        Object.values(EquipmentParser.lookupItems).forEach((category) => {
          if (category.items?.forEach) {
            category.items.forEach((item) => {
              delete item.rendered;
              delete item.isSpecialCase;
              delete item.specialGrouping;
            });
          }
        });
      }

      // Create equipment parser
      const equipment = new EquipmentParser(HM.SELECTED.class?.id, HM.SELECTED.background?.id);

      // Let it update just the requested section
      equipment
        .generateEquipmentSelectionUI(type)
        .then((choices) => {
          // Attach listeners to new elements
          this.attachEquipmentListeners(equipmentContainer);
        })
        .catch((error) => {
          HM.log(1, `Error updating ${type} equipment choices:`, error);
        });
    } catch (error) {
      HM.log(1, `Error in updateEquipment for ${type}:`, error);
    }
  }

  /**
   * Update application title based on form state
   * @param {HTMLElement} element - Application root element
   */
  static updateTitle(element) {
    if (!HM.heroMancer) return;

    // Get character name or default to user name
    const characterNameInput = element.querySelector('#character-name');
    const characterName = characterNameInput?.value?.trim() || game.user.name;

    // Character description components
    let race = '';
    let background = '';
    let charClass = '';

    // Get document names from UUIDs
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
   * Create a debounced update function
   * @param {Function} updateFn - Function to debounce
   * @param {number} delay - Delay in ms
   * @returns {Function} Debounced function
   */
  static debounce(updateFn, delay = 50) {
    let timeout = null;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        updateFn.apply(this, args);
      }, delay);
    };
  }
}
