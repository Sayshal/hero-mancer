import { EquipmentParser, HeroMancer, HM, MandatoryFields, StatRoller, TableManager } from './index.js';

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
    // Add error handling for invalid element
    if (!element) {
      HM.log(1, `Cannot add ${eventType} event listener: Invalid element provided`);
      return callback;
    }

    // Check for valid event type
    if (!eventType || typeof eventType !== 'string') {
      HM.log(1, `Cannot add event listener: Invalid event type "${eventType}"`);
      return callback;
    }

    // Ensure callback is a function
    if (typeof callback !== 'function') {
      HM.log(1, `Cannot add ${eventType} event listener: Callback must be a function`);
      return callback;
    }

    if (!this.#listeners.has(element)) {
      this.#listeners.set(element, new Map());
    }

    const elementEvents = this.#listeners.get(element);
    if (!elementEvents.has(eventType)) {
      elementEvents.set(eventType, []);
    }

    elementEvents.get(eventType).push(callback);

    try {
      element.addEventListener(eventType, callback);
    } catch (error) {
      HM.log(1, `Failed to add ${eventType} event listener:`, error);
    }

    return callback;
  }

  /**
   * Create and track a mutation observer
   * @param {string} id - Unique observer ID
   * @param {HTMLElement} element - Element to observe
   * @param {MutationObserverInit} options - Observer configuration
   * @param {Function} callback - Handler function
   * @returns {MutationObserver|null} The created observer or null if failed
   */
  static observe(id, element, options, callback) {
    // Validate parameters
    if (!id || typeof id !== 'string') {
      HM.log(1, 'Observer ID must be a non-empty string');
      return null;
    }

    if (!element || !(element instanceof Element)) {
      HM.log(1, `Cannot create observer "${id}": Invalid element provided`);
      return null;
    }

    if (typeof callback !== 'function') {
      HM.log(1, `Cannot create observer "${id}": Callback must be a function`);
      return null;
    }

    // Clean up existing observer with the same ID
    if (this.#observers.has(id)) {
      try {
        this.#observers.get(id).disconnect();
        HM.log(3, `Disconnected existing observer with ID "${id}"`);
      } catch (error) {
        HM.log(2, `Error disconnecting observer "${id}":`, error);
      }
    }

    try {
      // Create and configure the observer
      const observer = new MutationObserver(callback);
      observer.observe(element, options);
      this.#observers.set(id, observer);
      HM.log(3, `Created observer "${id}" for element`, element);
      return observer;
    } catch (error) {
      HM.log(1, `Failed to create observer "${id}":`, error);
      return null;
    }
  }

  /**
   * Clean up all registered listeners and observers
   * @returns {boolean} True if cleanup was successful
   */
  static cleanup() {
    let cleanupSuccess = true;

    // Clean up event listeners
    try {
      this.#listeners.forEach((events, element) => {
        if (!element) return;

        events.forEach((callbacks, type) => {
          callbacks.forEach((callback) => {
            try {
              element.removeEventListener(type, callback);
            } catch (error) {
              HM.log(2, `Failed to remove ${type} event listener:`, error);
              cleanupSuccess = false;
            }
          });
        });
      });
      this.#listeners.clear();
      HM.log(3, 'DOMManager: cleaned up all event listeners');
    } catch (error) {
      HM.log(1, 'Error during event listener cleanup:', error);
      cleanupSuccess = false;
    }

    // Clean up observers
    try {
      this.#observers.forEach((observer, id) => {
        try {
          observer.disconnect();
        } catch (error) {
          HM.log(2, `Failed to disconnect observer "${id}":`, error);
          cleanupSuccess = false;
        }
      });
      this.#observers.clear();
      HM.log(3, 'DOMManager: cleaned up all observers');
    } catch (error) {
      HM.log(1, 'Error during observer cleanup:', error);
      cleanupSuccess = false;
    }

    return cleanupSuccess;
  }

  /**
   * Initialize all event handlers for the application
   * @param {HTMLElement} element - Root element
   * @returns {Promise<boolean>} Success status
   */
  static async initialize(element) {
    if (!element) {
      HM.log(1, 'Cannot initialize DOMManager: No element provided');
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
      HM.log(1, 'Error during DOMManager initialization:', error);
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

    // Process each dropdown type
    for (const [type, dropdown] of Object.entries(dropdowns)) {
      if (!dropdown) continue;

      this.on(dropdown, 'change', async (event) => {
        try {
          await this.#handleDropdownChange(element, type, event);
        } catch (error) {
          HM.log(1, `Error handling ${type} dropdown change:`, error);
        }
      });
    }
  }

  /**
   * Initialize ability score related handlers
   * @param {HTMLElement} element - Application root element
   * @returns {Promise<void>}
   */
  static initializeAbilities(element) {
    // Initialize roll method selector
    this.#initializeRollMethodSelector(element);

    // Initialize ability dropdowns
    this.#initializeAbilityDropdowns(element);

    // Initialize ability score inputs
    this.#initializeAbilityScoreInputs(element);
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
                  this.updateEquipmentSummary();
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
        this.updateEquipmentSummary();
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
      this.on(select, 'change', () => this.updateEquipmentSummary());
    });

    checkboxes.forEach((checkbox) => {
      this.on(checkbox, 'change', () => this.updateEquipmentSummary());
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
        MandatoryFields.checkMandatoryFields(element);
      });

      // Input event for text inputs
      if (formElement.tagName.toLowerCase() === 'input' || formElement.tagName.toLowerCase() === 'textarea') {
        this.on(formElement, 'input', async () => {
          MandatoryFields.checkMandatoryFields(element);
        });
      }
    });

    // ProseMirror editors
    const proseMirrorElements = element.querySelectorAll('prose-mirror');
    proseMirrorElements.forEach((editor, index) => {
      const editorContent = editor.querySelector('.editor-content.ProseMirror');
      if (editorContent) {
        this.observe(`prose-mirror-${index}`, editorContent, { childList: true, characterData: true, subtree: true }, async () => {
          MandatoryFields.checkMandatoryFields(element);
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

        // Check if dark mode is active and apply inversion if needed
        const isDarkMode = game.settings.get('core', 'colorScheme') === 'dark';
        this.applyDarkModeToImage(portraitImg, isDarkMode, true);
      }

      // Add name and art path update handling
      const nameInput = document.querySelector('#character-name');
      const artInput = document.querySelector('#character-art-path');
      const portraitName = document.querySelector('.header-section h2');

      const updatePortrait = () => {
        if (portraitName) {
          portraitName.innerHTML = nameInput?.value || game.user.name;
        }
        if (portraitImg && artInput) {
          const isDefaultImage = portraitImg.src.includes('/abilities/');
          portraitImg.src = artInput.value || defaultImage;

          // Only apply dark mode treatment for default images
          const isDarkMode = game.settings.get('core', 'colorScheme') === 'dark';
          const isStillDefaultImage = !artInput.value || artInput.value.includes('/abilities/');
          this.applyDarkModeToImage(portraitImg, isDarkMode, isStillDefaultImage);
        }
      };

      this.on(nameInput, 'change', updatePortrait);
      this.on(artInput, 'change', updatePortrait);
      updatePortrait();

      // Listen for color scheme changes
      Hooks.on('colorSchemeChange', (scheme) => {
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
    if (isDarkMode && isDefaultImage) {
      imgElement.style.filter = 'invert(1)';
    } else {
      imgElement.style.filter = 'none';
    }
  }

  /**
   * Updates character portrait with provided image path
   * @param {string} imagePath - Path to character image
   * @static
   */
  static updateCharacterPortrait(imagePath) {
    const portraitImg = document.querySelector('.character-portrait img');
    if (portraitImg) {
      portraitImg.src = imagePath;
    }
  }

  /**
   * Initialize roll buttons for background characteristics
   * @param {HTMLElement} element - Application root element
   */
  static async initializeRollButtons() {
    const rollButtons = document.querySelectorAll('.roll-btn');
    const backgroundSelect = document.querySelector('#background-dropdown');

    // Batch disable all buttons initially
    if (rollButtons.length) {
      requestAnimationFrame(() => {
        rollButtons.forEach((button) => (button.disabled = true));
      });
    }

    backgroundSelect?.addEventListener('change', (event) => {
      const backgroundId = event.target.value.split(' (')[0];

      // Batch button updates
      requestAnimationFrame(() => {
        rollButtons.forEach((button) => (button.disabled = !backgroundId));
      });
    });

    rollButtons.forEach((button) => {
      button.addEventListener('click', async (event) => {
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

          if (TableManager.areAllTableResultsDrawn(backgroundId, tableType)) {
            button.disabled = true;
          }
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

      // Format and update summary
      const content = game.i18n.format('hm.app.finalize.summary.background', {
        article: backgroundData.article,
        background: backgroundData.link
      });

      summary.innerHTML = await TextEditor.enrichHTML(content);
    } catch (error) {
      HM.log(1, 'Error updating background summary:', error);

      // Fallback content
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
      // Get race and class links
      const raceLink = this.#getRaceLink();
      const classLink = this.#getClassLink();

      // Update summary with enriched HTML
      const content = game.i18n.format('hm.app.finalize.summary.classRace', {
        race: raceLink,
        class: classLink
      });

      summary.innerHTML = await TextEditor.enrichHTML(content);
    } catch (error) {
      HM.log(1, 'Error updating class/race summary:', error);

      // Fallback content
      const fallbackContent = game.i18n.format('hm.app.finalize.summary.classRace', {
        race: game.i18n.format('hm.unknown', { type: 'race' }),
        class: game.i18n.format('hm.unknown', { type: 'class' })
      });

      summary.innerHTML = await TextEditor.enrichHTML(fallbackContent);
    }
  }

  /**
   * Updates the equipment summary with selected items
   * @returns {void}
   * @static
   */
  static updateEquipmentSummary() {
    // Check if we're already processing an update
    if (this._isUpdatingEquipment) return;
    this._isUpdatingEquipment = true;

    try {
      const summary = document.querySelector('.equipment-summary');
      if (!summary) return;

      // If in ELKAN mode or no container, use default message
      const equipmentContainer = document.querySelector('#equipment-container');
      if (!equipmentContainer || HM.COMPAT.ELKAN) {
        summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
        return;
      }

      // Collect and process equipment
      const selectedEquipment = this.#collectEquipmentItems();

      if (!selectedEquipment.length) {
        summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
        return;
      }

      // Format and display equipment summary
      this.#formatAndDisplayEquipmentSummary(summary, selectedEquipment);
    } catch (error) {
      HM.log(1, 'Error updating equipment summary:', error);

      // Fallback to default message on error
      const summary = document.querySelector('.equipment-summary');
      if (summary) {
        summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
      }
    } finally {
      // Release the lock when done
      this._isUpdatingEquipment = false;
    }
  }

  /**
   * Updates the abilities summary based on class preferences and highest scores
   * @returns {Promise<void>}
   * @static
   */
  static async updateAbilitiesSummary() {
    // Store current class UUID for comparison
    const currentClassUUID = HM.SELECTED.class?.uuid;

    // Don't use a simple flag - we need a more robust approach
    if (this._abilityUpdatePromise) {
      // Store that we need another update after this one finishes
      this._pendingAbilityUpdate = true;
      return;
    }

    try {
      // Create a new update promise
      this._abilityUpdatePromise = (async () => {
        // Add a small delay to ensure the class selection is fully processed
        new Promise((resolve) => setTimeout(resolve, 10));

        // First, ensure the class UUID hasn't changed during our delay
        if (currentClassUUID !== HM.SELECTED.class?.uuid) {
          return; // Another update will happen
        }

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
      // Clear the promise reference
      this._abilityUpdatePromise = null;

      // If another update was requested while we were processing
      if (this._pendingAbilityUpdate) {
        this._pendingAbilityUpdate = false;
        // Request another update
        requestAnimationFrame(() => this.updateAbilitiesSummary());
      }
    }
  }

  /**
   * Process background selection changes to load relevant tables
   * @param {object} selectedBackground - Selected background data
   * @static
   */
  static async processBackgroundSelectionChange(selectedBackground) {
    if (!selectedBackground?.value) {
      return;
    }

    const uuid = HM.SELECTED.background.uuid;

    try {
      const background = await fromUuidSync(uuid);
      if (background) {
        TableManager.loadRollTablesForBackground(background);

        const rollButtons = document.querySelectorAll('.roll-btn');
        rollButtons.forEach((button) => (button.disabled = false));
      }
    } catch (error) {
      HM.log(1, `Error loading background with UUID ${uuid}:`, error);
    }
  }

  /**
   * Generates a formatted chat message summarizing the created character
   * @returns {string} HTML content for chat message
   * @static
   */
  static generateCharacterSummaryChatMessage() {
    try {
      // Get character name and summary sections
      const characterName = this.#getCharacterName();
      const summaries = this.#collectSummaryContent();

      // Generate formatted HTML message
      return this.#buildSummaryMessageHTML(characterName, summaries);
    } catch (error) {
      HM.log(1, 'Error generating character summary message:', error);

      // Return basic fallback message on error
      const fallbackName = document.querySelector('#character-name')?.value || game.user.name;
      return `<div class="character-summary"><h2>${fallbackName}</h2><p>${game.i18n.localize('hm.app.character-created')}</p></div>`;
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
    if (!equipmentContainer) return Promise.resolve();

    // If update already in progress, queue this one
    if (this.#equipmentUpdateInProgress) {
      return new Promise((resolve) => {
        this.#pendingEquipmentUpdate = { element, type, resolve };
      });
    }

    this.#equipmentUpdateInProgress = true;

    // Create and return the promise without using async in the executor
    return new Promise((resolve) => {
      // Reset the render tracking
      EquipmentParser.renderedItems = new Set();

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

      // Use the promise chain approach instead
      const equipment = EquipmentParser.getInstance();
      equipment
        .generateEquipmentSelectionUI(type)
        .then(() => {
          this.attachEquipmentListeners(equipmentContainer);
        })
        .catch((error) => {
          HM.log(1, `Error in updateEquipment for ${type}:`, error);
        })
        .finally(() => {
          this.#equipmentUpdateInProgress = false;
          resolve();

          // Process any pending update
          if (this.#pendingEquipmentUpdate) {
            const { element, type, resolve: pendingResolve } = this.#pendingEquipmentUpdate;
            this.#pendingEquipmentUpdate = null;
            this.updateEquipment(element, type).then(pendingResolve);
          }
        });
    });
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

  /**
   * Updates the display of remaining points in the abilities tab
   * @param {number} remainingPoints - The number of points remaining to spend
   * @static
   */
  static updateRemainingPointsDisplay(remainingPoints) {
    const abilitiesTab = document.querySelector(".tab[data-tab='abilities']");
    if (!abilitiesTab?.classList.contains('active')) return;

    const remainingPointsElement = document.getElementById('remaining-points');
    const totalPoints = StatRoller.getTotalPoints();

    if (remainingPointsElement) {
      remainingPointsElement.innerHTML = remainingPoints;
      this.#updatePointsColor(remainingPointsElement, remainingPoints, totalPoints);
    }
  }

  /**
   * Adjusts ability score up or down within valid range and point limits
   * @param {number} index - The index of the ability score to adjust
   * @param {number} change - The amount to change the score by (positive or negative)
   * @param {number[]} selectedAbilities - Array of current ability scores
   * @static
   */
  static changeAbilityScoreValue(index, change, selectedAbilities) {
    if (!Array.isArray(selectedAbilities)) {
      HM.log(1, 'selectedAbilities must be an array');
      return;
    }
    const abilityScoreElement = document.getElementById(`ability-score-${index}`);
    const currentScore = parseInt(abilityScoreElement.innerHTML, 10);
    const { MIN, MAX } = HM.ABILITY_SCORES;
    const newScore = Math.min(MAX, Math.max(MIN, currentScore + change));
    const totalPoints = StatRoller.getTotalPoints();
    const pointsSpent = StatRoller.calculateTotalPointsSpent(selectedAbilities);

    if (change > 0 && pointsSpent + StatRoller.getPointBuyCostForScore(newScore) - StatRoller.getPointBuyCostForScore(currentScore) > totalPoints) {
      HM.log(2, 'Not enough points remaining to increase this score.');
      return;
    }

    if (newScore !== currentScore) {
      abilityScoreElement.innerHTML = newScore;
      selectedAbilities[index] = newScore;

      const updatedPointsSpent = StatRoller.calculateTotalPointsSpent(selectedAbilities);
      const remainingPoints = totalPoints - updatedPointsSpent;

      this.updateRemainingPointsDisplay(remainingPoints);
      this.updatePlusButtonState(selectedAbilities, remainingPoints);
      this.updateMinusButtonState(selectedAbilities);
    }
  }

  /**
   * Updates the state of plus buttons based on available points and maximum scores
   * @param {number[]} selectedAbilities - Array of current ability scores
   * @param {number} remainingPoints - Points available to spend
   * @static
   */
  static updatePlusButtonState(selectedAbilities, remainingPoints) {
    // Create a document fragment for batch processing
    const updates = [];
    const { MAX } = HM.ABILITY_SCORES;

    document.querySelectorAll('.plus-button').forEach((button, index) => {
      const currentScore = selectedAbilities[index];
      const pointCostForNextIncrease = StatRoller.getPointBuyCostForScore(currentScore + 1) - StatRoller.getPointBuyCostForScore(currentScore);
      const shouldDisable = currentScore >= MAX || remainingPoints < pointCostForNextIncrease;

      // Only update if the state actually changes
      if (button.disabled !== shouldDisable) {
        updates.push(() => (button.disabled = shouldDisable));
      }

      const inputElement = document.getElementById(`ability-${index}-input`);
      if (inputElement && inputElement.value !== String(currentScore)) {
        updates.push(() => (inputElement.value = currentScore));
      }
    });

    // Apply all updates in one batch
    if (updates.length) {
      requestAnimationFrame(() => updates.forEach((update) => update()));
    }
  }

  /**
   * Updates the state of minus buttons based on minimum allowed scores
   * @param {number[]} selectedAbilities - Array of current ability scores
   * @static
   */
  static updateMinusButtonState(selectedAbilities) {
    const updates = [];
    const { MIN } = HM.ABILITY_SCORES;

    document.querySelectorAll('.minus-button').forEach((button, index) => {
      const currentScore = selectedAbilities[index];
      const shouldDisable = currentScore <= MIN;

      // Only update if the state actually changes
      if (button.disabled !== shouldDisable) {
        updates.push(() => (button.disabled = shouldDisable));
      }

      const inputElement = document.getElementById(`ability-${index}-input`);
      if (inputElement && inputElement.value !== String(currentScore)) {
        updates.push(() => (inputElement.value = currentScore));
      }
    });

    // Apply all updates in one batch
    if (updates.length) {
      requestAnimationFrame(() => updates.forEach((update) => update()));
    }
  }

  /**
   * Retrieves dropdown element from DOM
   * @param {HTMLElement} html - Parent element
   * @param {string} type - Dropdown type
   * @returns {HTMLElement|null} Dropdown element if found
   * @static
   */
  static findDropdownElementByType(html, type) {
    const dropdown = html.querySelector(`#${type}-dropdown`);
    if (!dropdown) {
      HM.log(1, `Dropdown for ${type} not found.`);
    }
    return dropdown;
  }

  /**
   * Handles standard array mode dropdown updates
   * @param {NodeList} abilityDropdowns - Ability dropdown elements
   * @param {string[]} selectedValues - Currently selected values
   * @static
   */
  static handleStandardArrayMode(abilityDropdowns, selectedValues) {
    // Get the standard array from the first dropdown's options
    const valueOccurrences = {};
    const firstDropdown = abilityDropdowns[0];
    const availableOptions = Array.from(firstDropdown.options).filter((opt) => opt.value && opt.value !== '');

    // Count occurrences of each value in the standard array
    availableOptions.forEach((option) => {
      const value = option.value;
      if (value) valueOccurrences[value] = (valueOccurrences[value] || 0) + 1;
    });

    // Count current selections - use actual dropdown values if selected values are empty
    const selectedCounts = {};
    selectedValues.forEach((value, index) => {
      // If value is empty, get the actual dropdown value
      const effectiveValue = value || abilityDropdowns[index].value;
      if (effectiveValue) selectedCounts[effectiveValue] = (selectedCounts[effectiveValue] || 0) + 1;
    });

    // Update each dropdown
    abilityDropdowns.forEach((dropdown, index) => {
      const currentValue = selectedValues[index] || dropdown.value;
      const valuesToDisable = {};

      // For each selected value, determine how many instances to disable
      Object.entries(selectedCounts).forEach(([value, count]) => {
        valuesToDisable[value] = count;
        // Don't disable the current selection
        if (value === currentValue) {
          valuesToDisable[value]--;
        }
      });

      // Apply disabling to options
      Array.from(dropdown.options).forEach((option) => {
        const optionValue = option.value;
        if (!optionValue) return; // Skip empty option

        if (valuesToDisable[optionValue] > 0) {
          option.disabled = true;
          valuesToDisable[optionValue]--;
        } else {
          option.disabled = false;
        }
      });
    });
  }

  /**
   * Updates dropdown options based on point cost
   * @param {HTMLElement} dropdown - Dropdown element
   * @param {number} currentValue - Current selected value
   * @param {number} remainingPoints - Remaining points
   * @static
   */
  static updateDropdownSelectionAvailability(dropdown, currentValue, remainingPoints) {
    const { MIN, MAX } = HM.ABILITY_SCORES;

    dropdown.querySelectorAll('option').forEach((option) => {
      const optionValue = parseInt(option.value, 10);
      if (optionValue < MIN || optionValue > MAX) return;

      const optionCost = StatRoller.getPointBuyCostForScore(optionValue);
      const canAffordOption = optionCost <= remainingPoints + StatRoller.getPointBuyCostForScore(currentValue);

      option.disabled = !canAffordOption && optionValue !== currentValue;
    });
  }

  /* -------------------------------------------- */
  /*  Private Methods                             */
  /* -------------------------------------------- */

  /**
   * Updates the color of the remaining points display based on percentage remaining
   * @param {HTMLElement} element - The element to update
   * @param {number} remainingPoints - Current remaining points
   * @param {number} totalPoints - Total available points
   * @private
   * @static
   */
  static #updatePointsColor(element, remainingPoints, totalPoints) {
    if (!element) return;

    const percentage = (remainingPoints / totalPoints) * 100;
    const hue = Math.max(0, Math.min(120, (percentage * 120) / 100));
    element.style.color = `hsl(${hue}, 100%, 35%)`;
  }

  /**
   * Get dropdown elements for specified types
   * @param {HTMLElement} element - Root element
   * @param {string[]} types - Dropdown types to find
   * @returns {Object} Map of dropdown elements by type
   * @private
   */
  static #getDropdownElements(element, types) {
    const dropdowns = {};

    for (const type of types) {
      const selector = `#${type}-dropdown`;
      dropdowns[type] = element.querySelector(selector);

      if (!dropdowns[type]) {
        HM.log(2, `${type} dropdown not found`);
      }
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
    // Extract selection data
    const value = event.target.value;
    const id = value.split(' ')[0].trim();
    const uuid = value.match(/\[(.*?)]/)?.[1] || '';

    // Update selected data
    HM.SELECTED[type] = { value, id, uuid };
    HM.log(3, `${type} updated:`, HM.SELECTED[type]);

    // Update description
    const descEl = element.querySelector(`#${type}-description`);
    if (descEl) {
      this.updateDescription(type, id, descEl);
    }

    // Update UI based on dropdown type
    await this.#updateUIForDropdownType(element, type);
  }

  /**
   * Update UI components based on dropdown type
   * @param {HTMLElement} element - Root element
   * @param {string} type - Dropdown type
   * @private
   */
  static async #updateUIForDropdownType(element, type) {
    // Update summaries based on type
    if (type === 'race' || type === 'class') {
      this.updateClassRaceSummary();

      // Update abilities if class changes
      if (type === 'class') {
        this.updateAbilitiesSummary();
      }
    }

    if (type === 'background') {
      this.updateBackgroundSummary();
      await this.processBackgroundSelectionChange(HM.SELECTED.background);
    }

    // Update equipment if needed
    if (!HM.COMPAT.ELKAN && (type === 'class' || type === 'background')) {
      this.updateEquipment(element, type);
    }

    // Update application title
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
    // Update the setting
    game.settings.set(HM.ID, 'diceRollingMethod', method);

    // Reset abilities
    HeroMancer.selectedAbilities = Array(Object.keys(CONFIG.DND5E.abilities).length).fill(HM.ABILITY_SCORES.DEFAULT);

    // Force a re-render of just the abilities tab
    const app = HM.heroMancer;
    if (app) {
      // Store current method for detection
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
      // Add data-index attribute for reliable reference
      dropdown.dataset.index = index;

      this.on(dropdown, 'change', (event) => {
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
      // Use a single debounced handler for both input and change events
      const debouncedUpdate = this.debounce(() => this.updateAbilitiesSummary(), 100);
      this.on(input, 'change', debouncedUpdate);
      this.on(input, 'input', debouncedUpdate);
    });
  }

  /**
   * Get formatted race link for summary
   * @returns {string} Formatted race link or placeholder
   * @private
   */
  static #getRaceLink() {
    if (!HM.SELECTED.race?.uuid) {
      return game.i18n.format('hm.unknown', { type: 'race' });
    }

    const raceSelect = document.querySelector('#race-dropdown');
    let raceName = null;

    // Try to get race name from selected option
    if (raceSelect?.selectedIndex > 0) {
      raceName = raceSelect.options[raceSelect.selectedIndex].text;
    } else if (raceSelect) {
      // Find matching option by UUID
      for (let i = 0; i < raceSelect.options.length; i++) {
        if (raceSelect.options[i].value.includes(HM.SELECTED.race.uuid)) {
          raceName = raceSelect.options[i].text;
          break;
        }
      }
    }

    if (raceName) {
      return `@UUID[${HM.SELECTED.race.uuid}]`;
    }

    // Fallback to retrieving from UUID directly
    try {
      return `@UUID[${HM.SELECTED.race.uuid}]`;
    } catch (error) {
      HM.log(2, `Failed to resolve race UUID: ${HM.SELECTED.race.uuid}`, error);
      return game.i18n.format('hm.unknown', { type: 'race' });
    }
  }

  /**
   * Get formatted class link for summary
   * @returns {string} Formatted class link or placeholder
   * @private
   */
  static #getClassLink() {
    if (!HM.SELECTED.class?.uuid) {
      return game.i18n.format('hm.unknown', { type: 'class' });
    }

    const classSelect = document.querySelector('#class-dropdown');

    // Try to get class name from dropdown
    if (classSelect?.selectedIndex > 0) {
      return `@UUID[${HM.SELECTED.class.uuid}]`;
    }

    // Fallback to retrieving from UUID directly
    try {
      return `@UUID[${HM.SELECTED.class.uuid}]`;
    } catch (error) {
      HM.log(2, `Failed to resolve class UUID: ${HM.SELECTED.class.uuid}`, error);
      return game.i18n.format('hm.unknown', { type: 'class' });
    }
  }

  /**
   * Get background data for summary
   * @returns {Object} Background data including article and link
   * @private
   */
  static #getBackgroundData() {
    const backgroundSelect = document.querySelector('#background-dropdown');
    const selectedOption = backgroundSelect?.selectedIndex > 0 ? backgroundSelect.options[backgroundSelect.selectedIndex] : null;

    // Handle default/no selection case
    if (!selectedOption?.value || !HM.SELECTED.background?.uuid) {
      return {
        article: game.i18n.localize('hm.app.equipment.article-plural'),
        link: game.i18n.localize('hm.app.background.adventurer')
      };
    }

    const backgroundName = selectedOption.text;
    const article = /^[aeiou]/i.test(backgroundName) ? game.i18n.localize('hm.app.equipment.article-plural') : game.i18n.localize('hm.app.equipment.article');

    return {
      article: article,
      link: `@UUID[${HM.SELECTED.background.uuid}]`
    };
  }

  /**
   * Collect equipment items from the UI
   * @returns {Array} Array of selected equipment items
   * @private
   */
  static #collectEquipmentItems() {
    // Collect all equipment items at once
    const selectedEquipment = Array.from(document.querySelectorAll('#equipment-container select, #equipment-container input[type="checkbox"]:checked'))
      .map((el) => this.#extractEquipmentItemData(el))
      .filter(Boolean);

    // Sort items - favorites first, then by type priority
    const priorityTypes = ['weapon', 'armor', 'shield'];

    selectedEquipment.sort((a, b) => {
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;

      // If both have same favorite status, use the type priority
      const aIndex = priorityTypes.indexOf(a.type);
      const bIndex = priorityTypes.indexOf(b.type);
      return (bIndex === -1 ? -999 : bIndex) - (aIndex === -1 ? -999 : aIndex);
    });

    // Take up to 3 items
    return selectedEquipment.slice(0, 3);
  }

  /**
   * Extract equipment item data from a DOM element
   * @param {HTMLElement} el - DOM element (select or checkbox)
   * @returns {Object|null} Equipment item data or null if invalid
   * @private
   */
  static #extractEquipmentItemData(el) {
    // For selects
    if (el.tagName === 'SELECT') {
      const selectedOption = el.options[el.selectedIndex];
      if (!selectedOption || !selectedOption.value || !selectedOption.value.includes('Compendium')) {
        return null;
      }

      const favoriteCheckbox = el.closest('.equipment-item')?.querySelector('.equipment-favorite-checkbox');
      const isFavorite = favoriteCheckbox?.checked || false;

      return {
        type: selectedOption.dataset.tooltip?.toLowerCase() || '',
        uuid: selectedOption.value,
        text: selectedOption.textContent?.trim(),
        favorite: isFavorite
      };
    }
    // For checkboxes
    else {
      const link = el.parentElement?.querySelector('.content-link');
      const uuid = link?.dataset?.uuid;

      if (!link || !uuid || uuid.includes(',') || !uuid.includes('Compendium')) {
        return null;
      }

      const favoriteCheckbox = el.closest('.equipment-item')?.querySelector('.equipment-favorite-checkbox');
      const isFavorite = favoriteCheckbox?.checked || false;

      return {
        type: link.dataset.tooltip?.toLowerCase() || '',
        uuid: uuid,
        text: link.textContent?.trim(),
        favorite: isFavorite
      };
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

    // Format individual items
    const formattedItems = displayEquipment.map((item) => {
      const itemName = item.text;
      const article = /^[aeiou]/i.test(itemName) ? game.i18n.localize('hm.app.equipment.article-plural') : game.i18n.localize('hm.app.equipment.article');
      return `${article} @UUID[${item.uuid}]{${item.text}}`;
    });

    // Join items with appropriate separators
    const content = game.i18n.format('hm.app.finalize.summary.equipment', {
      items:
        formattedItems.slice(0, -1).join(game.i18n.localize('hm.app.equipment.separator')) + (formattedItems.length > 1 ? game.i18n.localize('hm.app.equipment.and') : '') + formattedItems.slice(-1)
    });

    summary.innerHTML = await TextEditor.enrichHTML(content);
  }

  /**
   * Process ability highlights based on class preferences
   * @returns {void}
   * @private
   */
  static #processAbilityHighlights() {
    // First, remove any existing highlights
    const previousHighlights = document.querySelectorAll('.primary-ability');
    previousHighlights.forEach((el) => {
      el.classList.remove('primary-ability');
      el.removeAttribute('data-tooltip');
    });

    // Get current roll method
    const rollMethodSelect = document.getElementById('roll-method');
    const abilitiesTab = document.querySelector(".tab[data-tab='abilities']");
    const rollMethod = abilitiesTab?.dataset.currentMethod || rollMethodSelect?.value || 'standardArray';

    // Gather class primary abilities
    const primaryAbilities = this.#getPrimaryAbilitiesForClass();
    if (!primaryAbilities.size) return;

    // Process each ability block
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

      // Get primary ability
      if (classItem?.system?.primaryAbility?.value?.length) {
        for (const ability of classItem.system.primaryAbility.value) {
          primaryAbilities.add(ability.toLowerCase());
        }
      }

      // Get spellcasting ability
      if (classItem?.system?.spellcasting?.ability) {
        primaryAbilities.add(classItem.system.spellcasting.ability.toLowerCase());
      }

      // Get saving throw proficiencies
      if (classItem?.advancement?.byType?.Trait) {
        const level1Traits = classItem.advancement.byType.Trait.filter((entry) => entry.level === 1 && entry.configuration.grants);

        for (const trait of level1Traits) {
          const grants = trait.configuration.grants;
          for (const grant of grants) {
            if (grant.startsWith('saves:')) {
              primaryAbilities.add(grant.split(':')[1].toLowerCase());
            }
          }
        }
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
    let score = 0;

    // Extract ability key and score based on roll method
    if (rollMethod === 'pointBuy') {
      const hiddenInput = block.querySelector('input[type="hidden"]');
      if (hiddenInput) {
        const nameMatch = hiddenInput.name.match(/abilities\[(\w+)]/);
        if (nameMatch && nameMatch[1]) {
          abilityKey = nameMatch[1].toLowerCase();
        }
      }
      score = parseInt(block.querySelector('.current-score')?.innerHTML) || 0;
    } else if (rollMethod === 'standardArray') {
      const dropdown = block.querySelector('.ability-dropdown');
      if (dropdown) {
        const nameMatch = dropdown.name.match(/abilities\[(\w+)]/);
        if (nameMatch && nameMatch[1]) {
          abilityKey = nameMatch[1].toLowerCase();
        }
        score = parseInt(dropdown.value) || 0;
      }
    } else if (rollMethod === 'manualFormula') {
      const dropdown = block.querySelector('.ability-dropdown');
      if (dropdown) {
        abilityKey = dropdown.value?.toLowerCase() || '';
        score = parseInt(block.querySelector('.ability-score')?.value) || 0;
      }
    }

    // If not a primary ability, exit early
    if (!abilityKey || !primaryAbilities.has(abilityKey)) return;

    // Get class info for tooltip
    const classUUID = HM.SELECTED.class?.uuid;
    const classItem = classUUID ? fromUuidSync(classUUID) : null;
    const className = classItem?.name || game.i18n.localize('hm.app.abilities.your-class');

    // Apply highlighting based on roll method
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
    const tooltipText = game.i18n.format('hm.app.abilities.primary-tooltip', {
      ability: abilityName,
      class: className
    });

    // For all methods, highlight the label
    const label = block.querySelector('.ability-label');
    if (label) {
      label.classList.add('primary-ability');
      label.setAttribute('data-tooltip', tooltipText);
    }

    // For standardArray, also highlight the dropdown
    if (rollMethod === 'standardArray') {
      const dropdown = block.querySelector('.ability-dropdown');
      if (dropdown) {
        dropdown.classList.add('primary-ability');
      }
    }

    // For manualFormula, always highlight the dropdown
    if (rollMethod === 'manualFormula') {
      const dropdown = block.querySelector('.ability-dropdown');
      if (dropdown) {
        dropdown.classList.add('primary-ability');
        dropdown.setAttribute('data-tooltip', tooltipText);
      }
    }
  }

  /**
   * Update the ability summary content in the UI
   * @private
   */
  static #updateAbilitySummaryContent() {
    // Get ability scores
    const abilityScores = this.#collectAbilityScores();
    if (Object.keys(abilityScores).length === 0) return;

    // Get primary abilities
    const primaryAbilities = this.#getPrimaryAbilitiesForClass();

    // Sort and select top abilities
    const selectedAbilities = this.#selectTopAbilities(abilityScores, primaryAbilities);

    // Update the summary HTML
    this.#updateSummaryHTML(selectedAbilities);
  }

  /**
   * Collect ability scores from UI
   * @returns {Object} Map of ability scores
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

      // Logic from earlier method to extract scores based on roll method
      if (rollMethod === 'pointBuy') {
        const hiddenInput = block.querySelector('input[type="hidden"]');
        if (hiddenInput) {
          const nameMatch = hiddenInput.name.match(/abilities\[(\w+)]/);
          if (nameMatch && nameMatch[1]) {
            abilityKey = nameMatch[1].toLowerCase();
          }
        }
        score = parseInt(block.querySelector('.current-score')?.innerHTML) || 0;
      } else if (rollMethod === 'standardArray') {
        const dropdown = block.querySelector('.ability-dropdown');
        if (dropdown) {
          const nameMatch = dropdown.name.match(/abilities\[(\w+)]/);
          if (nameMatch && nameMatch[1]) {
            abilityKey = nameMatch[1].toLowerCase();
          }
          score = parseInt(dropdown.value) || 0;
        }
      } else if (rollMethod === 'manualFormula') {
        const dropdown = block.querySelector('.ability-dropdown');
        if (dropdown) {
          abilityKey = dropdown.value?.toLowerCase() || '';
          score = parseInt(block.querySelector('.ability-score')?.value) || 0;
        }
      }

      if (abilityKey) {
        abilityScores[abilityKey] = score;
      }
    });

    return abilityScores;
  }

  /**
   * Select top abilities for summary
   * @param {Object} abilityScores - Map of ability scores
   * @param {Set<string>} primaryAbilities - Set of primary abilities
   * @returns {string[]} Selected ability keys
   * @private
   */
  static #selectTopAbilities(abilityScores, primaryAbilities) {
    // Sort abilities by preference and then by score
    const sortedAbilities = Object.entries(abilityScores)
      .sort(([abilityA, scoreA], [abilityB, scoreB]) => {
        // First sort by preferred status
        const preferredA = primaryAbilities.has(abilityA);
        const preferredB = primaryAbilities.has(abilityB);

        if (preferredA && !preferredB) return -1;
        if (!preferredA && preferredB) return 1;

        // Then sort by score
        return scoreB - scoreA;
      })
      .map(([ability]) => ability.toLowerCase());

    // Select the top 2 abilities
    const selectedAbilities = [];
    for (const ability of sortedAbilities) {
      if (selectedAbilities.length < 2 && !selectedAbilities.includes(ability)) {
        selectedAbilities.push(ability);
      }
    }

    // If we still need more abilities, add highest scoring ones
    if (selectedAbilities.length < 2) {
      for (const [ability, score] of Object.entries(abilityScores).sort(([, a], [, b]) => b - a)) {
        if (!selectedAbilities.includes(ability) && selectedAbilities.length < 2) {
          selectedAbilities.push(ability);
        }
      }
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
      const content = game.i18n.format('hm.app.finalize.summary.abilities', {
        first: `&Reference[${selectedAbilities[0]}]`,
        second: `&Reference[${selectedAbilities[1]}]`
      });
      abilitiesSummary.innerHTML = await TextEditor.enrichHTML(content);
    } else {
      abilitiesSummary.innerHTML = game.i18n.localize('hm.app.finalize.summary.abilitiesDefault');
    }
  }

  /**
   * Get character name for summary
   * @returns {string} Character name
   * @private
   */
  static #getCharacterName() {
    const nameInput = document.querySelector('#character-name');
    return nameInput?.value || game.user.name;
  }

  /**
   * Collect summary content from DOM
   * @returns {Object} Summary content by section
   * @private
   */
  static #collectSummaryContent() {
    return {
      classRace: document.querySelector('.class-race-summary')?.innerHTML || '',
      background: document.querySelector('.background-summary')?.innerHTML || '',
      abilities: document.querySelector('.abilities-summary')?.innerHTML || '',
      equipment: document.querySelector('.equipment-summary')?.innerHTML || ''
    };
  }

  /**
   * Build formatted HTML for summary message
   * @param {string} characterName - Character name
   * @param {Object} summaries - Summary content by section
   * @returns {string} Formatted HTML
   * @private
   */
  static #buildSummaryMessageHTML(characterName, summaries) {
    let message = `
    <div class="character-summary" style="line-height: 1.7; margin: 0.5em 0;">
      <h2 style="margin-bottom: 0.5em">${characterName}</h2>
      <hr style="margin: 0.5em 0">
  `;

    // Add each summary section if available
    if (summaries.classRace) {
      message += `<span class="summary-section class-race">${summaries.classRace}</span> `;
    }

    if (summaries.background) {
      message += `<span class="summary-section background">${summaries.background}</span> `;
    }

    if (summaries.abilities) {
      message += `<span class="summary-section abilities">${summaries.abilities}</span> `;
    }

    if (summaries.equipment) {
      message += `<span class="summary-section equipment">${summaries.equipment}</span>`;
    }

    message += '</div>';
    return message;
  }
}
