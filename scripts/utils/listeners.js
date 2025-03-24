import { CharacterArtPicker, DropdownHandler, EquipmentParser, HeroMancer, HM, MandatoryFields, SavedOptions, StatRoller, SummaryManager } from './index.js';

/**
 * Manages event listeners and UI updates for the HeroMancer application.
 * Handles ability scores, equipment selection, character details, and UI summaries.
 * @class
 */
export class Listeners {
  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Initializes all listeners for the application
   * @param {HTMLElement} html - The root element to attach listeners to
   * @param {object} context - The application context
   * @param {number[]} selectedAbilities - Array of selected ability scores
   * @returns {Promise<void>}
   * @static
   */
  static async initializeListeners(html, context, selectedAbilities) {
    this.initializeAbilityListeners(context, selectedAbilities);
    this.initializeSelectionListeners();
    this.initializeCharacterListeners();
    this.initializeRollMethodListener(html);
    this.initializeTokenCustomizationListeners();
    this.initializePlayerCustomizationListeners();
    this.restoreFormOptions(html);
  }

  /**
   * Initializes ability score related listeners and UI updates
   * @param {object} context - The application context
   * @param {number[]} selectedAbilities - Array of selected ability scores
   * @static
   */
  static initializeAbilityListeners(context, selectedAbilities) {
    const abilityDropdowns = document.querySelectorAll('.ability-dropdown');
    // Initialize with actual dropdown values instead of empty strings
    const selectedValues = Array.from(abilityDropdowns).map((dropdown) => dropdown.value);
    const totalPoints = StatRoller.getTotalPoints();
    const diceRollingMethod = game.settings.get(HM.ID, 'diceRollingMethod');

    // Clean up existing listeners first to prevent duplicates
    abilityDropdowns.forEach((dropdown, i) => {
      // Add data-index attribute for reliable index reference
      dropdown.dataset.index = i;

      if (dropdown._abilityChangeHandler) {
        dropdown.removeEventListener('change', dropdown._abilityChangeHandler);
      }

      dropdown._abilityChangeHandler = (event) => {
        const index = parseInt(dropdown.dataset.index, 10);

        if (diceRollingMethod === 'manualFormula') {
          const value = event.target.value;
          selectedValues[index] = value;
          const scoreInput = event.target.parentElement.querySelector('.ability-score');

          // Both dropdown and input should reference the selected ability
          event.target.setAttribute('name', `abilities[${value}]`);
          scoreInput.setAttribute('name', `abilities[${value}].score`);

          // Existing code for disabling options
          abilityDropdowns.forEach((otherDropdown, otherIndex) => {
            Array.from(otherDropdown.options).forEach((option) => {
              if (option.value && option.value !== '') {
                option.disabled = selectedValues.includes(option.value) && selectedValues[otherIndex] !== option.value;
              }
            });
          });
        } else if (diceRollingMethod === 'standardArray') {
          const newValue = event.target.value;

          // Update our tracking array
          selectedValues[index] = newValue;

          // Apply standard array mode without unnecessary logging
          requestAnimationFrame(() => {
            DropdownHandler.handleStandardArrayMode(abilityDropdowns, selectedValues);
          });
        } else {
          // Handle point buy case
          selectedValues[index] = event.target.value || '';
          DropdownHandler.refreshAbilityDropdownsState(abilityDropdowns, selectedValues, totalPoints, diceRollingMethod === 'pointBuy' ? 'pointBuy' : 'manualFormula');
        }
      };

      dropdown.addEventListener('change', dropdown._abilityChangeHandler);
    });

    if (diceRollingMethod === 'pointBuy') {
      this.updateRemainingPointsDisplay(context.remainingPoints);
      this.updatePlusButtonState(selectedAbilities, context.remainingPoints);
      this.updateMinusButtonState(selectedAbilities);
    } else if (diceRollingMethod === 'standardArray') {
      // Only log once during initial setup
      HM.log(3, 'Initializing standard array dropdowns');

      // Ensure DOM is fully populated before initializing standard array mode
      requestAnimationFrame(() => {
        // Re-collect current values to ensure we have the latest
        const currentValues = Array.from(abilityDropdowns).map((dropdown) => dropdown.value);
        DropdownHandler.handleStandardArrayMode(abilityDropdowns, currentValues);
      });
    } else if (diceRollingMethod === 'manualFormula') {
      // Add dedicated change handlers for Manual Formula mode dropdowns
      document.querySelectorAll('.ability-dropdown').forEach((dropdown) => {
        const scoreInput = dropdown.parentElement.querySelector('.ability-score');

        // Add change handler for ability summary updates
        if (dropdown._abilitySummaryHandler) {
          dropdown.removeEventListener('change', dropdown._abilitySummaryHandler);
        }

        dropdown._abilitySummaryHandler = () => {
          requestAnimationFrame(() => {
            SummaryManager.updateAbilitiesSummary();
          });
        };

        dropdown.addEventListener('change', dropdown._abilitySummaryHandler);

        // Also add handler for score inputs
        if (scoreInput && !scoreInput._abilitySummaryHandler) {
          scoreInput._abilitySummaryHandler = () => {
            requestAnimationFrame(() => {
              SummaryManager.updateAbilitiesSummary();
            });
          };

          scoreInput.addEventListener('change', scoreInput._abilitySummaryHandler);
          scoreInput.addEventListener('input', scoreInput._abilitySummaryHandler);
        }
      });
    }
  }

  /**
   * Initializes selection listeners and updates storage
   * @static
   */
  static initializeSelectionListeners() {
    const classDropdown = document.querySelector('#class-dropdown');
    const backgroundDropdown = document.querySelector('#background-dropdown');
    const raceDropdown = document.querySelector('#race-dropdown');

    HM.log(3, `Elkan5e compatibility mode: ${HM.COMPAT.ELKAN}`);

    // Handle equipment initialization if not in ELKAN compatibility mode
    if (!HM.COMPAT.ELKAN) {
      this.#initializeEquipmentUI();
    }

    // Set up class dropdown handler
    if (classDropdown) {
      // Store our handler logic, whether adding a new listener or integrating with existing
      const classHandler = async (event) => {
        const value = event.target.value;
        HM.SELECTED.class = {
          value,
          id: value.split(' ')[0],
          uuid: value.match(/\[(.*?)]/)?.[1]
        };

        HM.log(3, `Class updated: ${JSON.stringify(HM.SELECTED.class)}`);

        // Call SummaryManager to update abilities highlighting
        SummaryManager.updateAbilitiesSummary();

        // Update equipment only if not in ELKAN mode
        if (!HM.COMPAT.ELKAN) {
          const equipmentContainer = document.querySelector('#equipment-container');
          const updateEquipment = new EquipmentParser(HM.SELECTED.class.id, HM.SELECTED.background.id);
          await this.#refreshEquipmentSectionUI(updateEquipment, equipmentContainer, 'class');
        }

        // Manually update the description for Elkan content
        this.updateDescriptionElement('class', HM.SELECTED.class.id);
      };

      if (classDropdown._dropdownHandlerInitialized) {
        // If already set up by DropdownHandler, store our logic and preserve the existing handler
        const existingHandler = classDropdown._changeHandler;
        classDropdown._changeHandler = async (event) => {
          await existingHandler(event); // Run original handler first
          await classHandler(event); // Then run our logic
        };
        // Re-attach with the combined handler
        classDropdown.removeEventListener('change', existingHandler);
        classDropdown.addEventListener('change', classDropdown._changeHandler);
      } else {
        // Regular initialization if DropdownHandler hasn't been here yet
        if (classDropdown._changeHandler) {
          classDropdown.removeEventListener('change', classDropdown._changeHandler);
        }
        classDropdown._changeHandler = classHandler;
        classDropdown.addEventListener('change', classDropdown._changeHandler);
        classDropdown._listenerInitialized = true;
      }
    }

    // Set up background dropdown handler
    if (backgroundDropdown) {
      // Store our handler logic, whether adding a new listener or integrating with existing
      const backgroundHandler = async (event) => {
        const value = event.target.value;
        HM.SELECTED.background = {
          value,
          id: value.split(' ')[0],
          uuid: value.match(/\[(.*?)]/)?.[1]
        };

        HM.log(3, `Background updated: ${JSON.stringify(HM.SELECTED.background)}`);

        SummaryManager.updateBackgroundSummary(event.target);
        await SummaryManager.processBackgroundSelectionChange(HM.SELECTED.background);

        // Update equipment only if not in ELKAN mode
        if (!HM.COMPAT.ELKAN) {
          const equipmentContainer = document.querySelector('#equipment-container');
          const updateEquipment = new EquipmentParser(HM.SELECTED.class.id, HM.SELECTED.background.id);
          await this.#refreshEquipmentSectionUI(updateEquipment, equipmentContainer, 'background');
        }

        // Manually update the description
        this.updateDescriptionElement('background', HM.SELECTED.background.id);
      };

      if (backgroundDropdown._dropdownHandlerInitialized) {
        // If already set up by DropdownHandler, store our logic and preserve the existing handler
        const existingHandler = backgroundDropdown._changeHandler;
        backgroundDropdown._changeHandler = async (event) => {
          await existingHandler(event); // Run original handler first
          await backgroundHandler(event); // Then run our logic
        };
        // Re-attach with the combined handler
        backgroundDropdown.removeEventListener('change', existingHandler);
        backgroundDropdown.addEventListener('change', backgroundDropdown._changeHandler);
      } else {
        // Regular initialization if DropdownHandler hasn't been here yet
        if (backgroundDropdown._changeHandler) {
          backgroundDropdown.removeEventListener('change', backgroundDropdown._changeHandler);
        }
        backgroundDropdown._changeHandler = backgroundHandler;
        backgroundDropdown.addEventListener('change', backgroundDropdown._changeHandler);
        backgroundDropdown._listenerInitialized = true;
      }
    }

    // Set up race dropdown handler
    if (raceDropdown) {
      // Store our handler logic, whether adding a new listener or integrating with existing
      const raceHandler = async (event) => {
        const value = event.target.value;
        HM.SELECTED.race = {
          value,
          id: value.split(' ')[0],
          uuid: value.match(/\[(.*?)]/)?.[1]
        };

        HM.log(3, `Race updated: ${JSON.stringify(HM.SELECTED.race)}`);

        // Race-specific summary updates
        SummaryManager.updateClassRaceSummary();

        // Manually update the description
        this.updateDescriptionElement('race', HM.SELECTED.race.id);
      };

      if (raceDropdown._dropdownHandlerInitialized) {
        // If already set up by DropdownHandler, store our logic and preserve the existing handler
        const existingHandler = raceDropdown._changeHandler;
        raceDropdown._changeHandler = async (event) => {
          await existingHandler(event); // Run original handler first
          await raceHandler(event); // Then run our logic
        };
        // Re-attach with the combined handler
        raceDropdown.removeEventListener('change', existingHandler);
        raceDropdown.addEventListener('change', raceDropdown._changeHandler);
      } else {
        // Regular initialization if DropdownHandler hasn't been here yet
        if (raceDropdown._changeHandler) {
          raceDropdown.removeEventListener('change', raceDropdown._changeHandler);
        }
        raceDropdown._changeHandler = raceHandler;
        raceDropdown.addEventListener('change', raceDropdown._changeHandler);
        raceDropdown._listenerInitialized = true;
      }
    }

    // Initialize descriptions for current values if available
    if (classDropdown && classDropdown.value) {
      const classId = classDropdown.value.split(' ')[0];
      HM.log(3, `Setting initial class description for ID: ${classId}`);
      this.updateDescriptionElement('class', classId);
    }

    if (backgroundDropdown && backgroundDropdown.value) {
      const backgroundId = backgroundDropdown.value.split(' ')[0];
      HM.log(3, `Setting initial background description for ID: ${backgroundId}`);
      this.updateDescriptionElement('background', backgroundId);
    }

    if (raceDropdown && raceDropdown.value) {
      const raceId = raceDropdown.value.split(' ')[0];
      HM.log(3, `Setting initial race description for ID: ${raceId}`);
      this.updateDescriptionElement('race', raceId);
    }

    HM.log(3, 'Selection Listeners Initialized');
  }

  /**
   * Updates description element with content from HM.documents collection
   * @param {string} type - Type of dropdown (class, race, background)
   * @param {string} id - ID of selected item
   * @static
   */
  static updateDescriptionElement(type, id) {
    HM.log(3, `Updating ${type} description for ID: ${id}`);

    try {
      // Find the description element
      const descriptionEl = document.querySelector(`#${type}-description`);
      if (!descriptionEl) {
        HM.log(1, `${type} description element not found`);
        return;
      }

      // For race documents, they're organized in folders
      if (type === 'race') {
        let foundDoc = null;

        // HM.documents.race is an array of folders
        HM.log(3, `Searching through ${HM.documents.race.length} race folders`);

        for (const folder of HM.documents.race) {
          const doc = folder.docs.find((d) => d.id === id);
          if (doc) {
            foundDoc = doc;
            HM.log(3, `Found race doc in folder ${folder.folderName}: ${doc.name}`);
            break;
          }
        }

        if (foundDoc) {
          HM.log(3, 'Loaded race description successfully.');
          descriptionEl.innerHTML = foundDoc.enrichedDescription || '';
        } else {
          if (!id) return;
          HM.log(1, `No matching race doc found for ID: ${id}`);
          descriptionEl.innerHTML = game.i18n.localize('hm.app.no-description');
        }
      } else {
        const docsArray = HM.documents[type] || [];
        HM.log(3, `Looking for ${type} doc with ID ${id} among ${docsArray.length} docs`);

        const doc = docsArray.find((d) => d.id === id);

        if (doc) {
          HM.log(3, `Found matching ${type} doc: ${doc.name}`);

          if (doc.enrichedDescription) {
            HM.log(3, `Loaded ${type} description successfully.`);
            descriptionEl.innerHTML = doc.enrichedDescription;
          } else {
            HM.log(2, `No enriched description for ${type} doc`);
            descriptionEl.innerHTML = game.i18n.localize('hm.app.no-description');
          }
        } else {
          if (!id) return;
          HM.log(1, `No matching ${type} doc found for ID: ${id}`);
          descriptionEl.innerHTML = game.i18n.localize('hm.app.no-description');
        }
      }
    } catch (error) {
      HM.log(1, `Error updating ${type} description: ${error}`);
      const descriptionEl = document.querySelector(`#${type}-description`);
      if (descriptionEl) {
        descriptionEl.innerHTML = game.i18n.localize('hm.app.no-description');
      }
    }
  }

  /**
   * Initializes equipment UI elements
   * @private
   * @static
   */
  static #initializeEquipmentUI() {
    const equipmentContainer = document.querySelector('#equipment-container');
    const classDropdown = document.querySelector('#class-dropdown');
    const backgroundDropdown = document.querySelector('#background-dropdown');

    HM.log(3, `Equipment container found? ${!!equipmentContainer}`);
    HM.log(3, `Class dropdown value: ${classDropdown?.value}`);
    HM.log(3, `Background dropdown value: ${backgroundDropdown?.value}`);

    if (equipmentContainer) {
      equipmentContainer.innerHTML = '';

      // Create a new instance for this render cycle
      const classId = classDropdown?.value?.split(' ')[0];
      const backgroundId = backgroundDropdown?.value?.split(' ')[0];
      HM.log(3, `Creating EquipmentParser with class=${classId}, background=${backgroundId}`);

      const equipment = new EquipmentParser(classId, backgroundId);

      equipment
        .generateEquipmentSelectionUI()
        .then((choices) => {
          equipmentContainer.appendChild(choices);
        })
        .catch((error) => {
          HM.log(1, `Error rendering equipment choices: ${error}`);
        });
    }

    HM.log(3, 'Equipment UI Initialized');
  }

  /**
   * Initializes character-related listeners including token art and portrait updates
   * @static
   */
  static initializeCharacterListeners() {
    const tokenArtCheckbox = document.querySelector('#link-token-art');
    tokenArtCheckbox?.addEventListener('change', CharacterArtPicker._toggleTokenArtRowVisibility);

    this.initializeTitleListeners();
  }

  /**
   * Initializes listeners for updating the application title
   * @static
   */
  static initializeTitleListeners() {
    // Character name change listener
    const characterNameInput = document.querySelector('#character-name');
    if (characterNameInput) {
      // Remove any existing listener to prevent duplicates
      if (characterNameInput._titleUpdateHandler) {
        characterNameInput.removeEventListener('input', characterNameInput._titleUpdateHandler);
      }

      characterNameInput._titleUpdateHandler = (event) => {
        requestAnimationFrame(() => {
          this.updateTitleFromFormState();
        });
      };

      characterNameInput.addEventListener('input', characterNameInput._titleUpdateHandler);
    }

    const classDropdown = document.querySelector('#class-dropdown');
    const raceDropdown = document.querySelector('#race-dropdown');
    const backgroundDropdown = document.querySelector('#background-dropdown');
    const dropdowns = [classDropdown, raceDropdown, backgroundDropdown].filter((el) => el);

    dropdowns.forEach((dropdown) => {
      if (dropdown._titleUpdateHandler) {
        dropdown.removeEventListener('change', dropdown._titleUpdateHandler);
      }

      dropdown._titleUpdateHandler = (event) => {
        requestAnimationFrame(() => {
          this.updateTitleFromFormState();
        });
      };

      dropdown.addEventListener('change', dropdown._titleUpdateHandler);
    });

    this.updateTitleFromFormState();
  }

  /**
   * Updates the application title based on the current form state
   * @static
   */
  static updateTitleFromFormState() {
    if (!HM.heroMancer) return;

    // Get character name or default to user name
    const characterNameInput = document.querySelector('#character-name');
    const characterName = characterNameInput?.value?.trim() || game.user.name;

    // Character description components
    let race = '';
    let background = '';
    let charClass = '';

    // Check if we have SELECTED data
    if (HM.SELECTED) {
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
   * Initializes the ability score rolling method selector
   * @param {HTMLElement} html - The root element
   * @static
   */
  static initializeRollMethodListener(html) {
    if (!html) {
      HM.log(1, 'HTML element is undefined');
      return;
    }

    const rollSelect = document.getElementById('roll-method');
    if (!rollSelect) {
      HM.log(2, 'Roll method select element not found');
      return;
    }

    rollSelect.addEventListener('change', async (event) => {
      const method = event.target.value;
      HM.log(3, `Roll method changed to: ${method}`);

      await game.settings.set(HM.ID, 'diceRollingMethod', method);
      HeroMancer.selectedAbilities = Array(Object.keys(CONFIG.DND5E.abilities).length).fill(8);

      const app = HM.heroMancer;
      if (app) {
        // Re-render just the abilities tab
        await app.render({ parts: ['abilities'] });

        // After re-render, manually force summary update
        requestAnimationFrame(() => {
          // Important: Store current method in a data attribute for reference
          document.querySelector(".tab[data-tab='abilities']").dataset.currentMethod = method;
          SummaryManager.updateAbilitiesSummary();
        });
      } else {
        HM.log(1, 'App instance not found for re-render');
      }
    });
  }

  /**
   * Initializes token customization listeners and visual state updates
   * @static
   */
  static initializeTokenCustomizationListeners() {
    const ringEnabled = game.settings.get(HM.ID, 'enableTokenCustomization');
    if (!ringEnabled) return;

    const ringEnabledElement = document.querySelector('input[name="ring.enabled"]');
    const ringOptions = document.querySelectorAll(
      ['.customization-row:has(color-picker[name="ring.color"])', '.customization-row:has(color-picker[name="backgroundColor"])', '.customization-row.ring-effects'].join(', ')
    );

    if (!ringEnabledElement || !ringOptions.length) {
      HM.log(2, 'Token customization elements not found');
      return;
    }

    ringOptions.forEach((option) => {
      option.style.display = ringEnabledElement.checked ? 'flex' : 'none';
    });

    // Reset and toggle on change
    ringEnabledElement.addEventListener('change', (event) => {
      HM.log(3, 'Ring enabled changed:', event.currentTarget.checked);

      if (!event.currentTarget.checked) {
        // Reset color pickers
        document.querySelectorAll('color-picker[name="ring.color"], color-picker[name="backgroundColor"]').forEach((picker) => {
          picker.value = '';
          picker.dispatchEvent(new Event('change', { bubbles: true }));
        });

        // Reset ring effect checkboxes
        document.querySelectorAll('input[name="ring.effects"]').forEach((checkbox) => {
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
   * Initializes player customization listeners for color and display elements
   * @static
   */
  static initializePlayerCustomizationListeners() {
    const playerCustomization = game.settings.get(HM.ID, 'enablePlayerCustomization');
    if (!playerCustomization) return;

    const colorInput = document.querySelector('color-picker[name="player-color"]');
    if (!colorInput) return;

    // Apply the initial color value immediately
    const initialColor = colorInput.value || '#000000';
    if (initialColor) {
      game.user.update({
        color: initialColor
      });

      const colorElements = document.querySelectorAll('.hm-player-color');
      colorElements.forEach((el) => {
        el.style.color = initialColor;
      });
    }

    // Set up mutation observer to watch for value changes that might happen during rendering
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'value') {
          const newColor = colorInput.value || '#000000';

          game.user.update({
            color: newColor
          });

          const colorElements = document.querySelectorAll('.hm-player-color');
          colorElements.forEach((el) => {
            el.style.color = newColor;
          });
        }
      });
    });

    // Start observing the color-picker for attribute changes
    observer.observe(colorInput, { attributes: true });

    // Also keep the regular change event listener for user interactions
    colorInput.addEventListener('change', (e) => {
      const newColor = e.currentTarget.value || '#000000';

      game.user.update({
        color: newColor
      });

      const colorElements = document.querySelectorAll('.hm-player-color');
      colorElements.forEach((el) => {
        el.style.color = newColor;
      });
    });

    // Make sure to disconnect the observer when appropriate (e.g., when the application closes)
    // Store it on a class property so you can access it elsewhere
    this.colorObserver = observer;
  }

  /**
   * Initialize form validation listeners for mandatory fields
   * @param {HTMLElement} html - The root element containing form fields
   * @static
   */
  static initializeFormValidationListeners(html) {
    const mandatoryFields = game.settings.get(HM.ID, 'mandatoryFields') || [];
    if (mandatoryFields.length === 0) return;

    const formElements = html.querySelectorAll('input, select, textarea, color-picker');
    formElements.forEach((element) => {
      // Remove previous listeners to avoid duplication
      if (element._mandatoryFieldChangeHandler) {
        element.removeEventListener('change', element._mandatoryFieldChangeHandler);
      }
      if (element._mandatoryFieldInputHandler) {
        element.removeEventListener('input', element._mandatoryFieldInputHandler);
      }

      // Create and store the handler references
      element._mandatoryFieldChangeHandler = async (event) => {
        //  HM.log(3, `Field changed: ${element.name || element.id}`);
        await MandatoryFields.checkMandatoryFields(html);
      };

      element.addEventListener('change', element._mandatoryFieldChangeHandler);

      // Add input listener for real-time validation
      if (element.tagName.toLowerCase() === 'input' || element.tagName.toLowerCase() === 'textarea') {
        element._mandatoryFieldInputHandler = async (event) => {
          await MandatoryFields.checkMandatoryFields(html);
        };
        element.addEventListener('input', element._mandatoryFieldInputHandler);
      }
    });

    const proseMirrorElements = html.querySelectorAll('prose-mirror');
    proseMirrorElements.forEach((element, index) => {
      // Clean up previous observer if exists
      const observerId = `heromancer-prose-${element.name || index}`;
      MutationObserverRegistry.unregister(observerId);

      // Create handler for content changes
      const changeHandler = async () => {
        HM.log(3, `ProseMirror content changed: ${element.name || element.id}`);
        await MandatoryFields.checkMandatoryFields(html);
      };

      const editorContent = element.querySelector('.editor-content.ProseMirror');
      if (editorContent) {
        MutationObserverRegistry.register(observerId, editorContent, { childList: true, characterData: true, subtree: true }, changeHandler);
      }
    });
  }

  /**
   * Restores previously saved form options
   * @param {HTMLElement} html - The form element
   * @returns {Promise<void>}
   * @static
   */
  static async restoreFormOptions(html) {
    const savedOptions = await SavedOptions.loadOptions();
    if (Object.keys(savedOptions).length === 0) return;

    // First pass to restore all form elements
    for (const [key, value] of Object.entries(savedOptions)) {
      const elem = html.querySelector(`[name="${key}"]`);
      if (!elem) continue;

      if (elem.type === 'checkbox') {
        elem.checked = value;
      } else if (elem.tagName === 'SELECT') {
        elem.value = value;

        // Update HM.SELECTED for class, race, background
        if (key === 'class' || key === 'race' || key === 'background') {
          HM.SELECTED[key] = {
            value: value,
            id: value.split(' ')[0],
            uuid: value.match(/\[(.*?)]/)?.[1]
          };

          // Log to verify values are updated
          HM.log(3, `Restored ${key} SELECTED:`, HM.SELECTED[key]);
        }
      } else {
        elem.value = value;
      }
    }

    // Second pass to handle ability dropdowns
    const diceRollingMethod = game.settings.get(HM.ID, 'diceRollingMethod');
    if (diceRollingMethod === 'standardArray') {
      const abilityDropdowns = html.querySelectorAll('.ability-dropdown');
      const selectedValues = Array.from(abilityDropdowns).map((dropdown) => dropdown.value);

      // Update available options based on current selections
      DropdownHandler.handleStandardArrayMode(abilityDropdowns, selectedValues);
    }

    // Ensure equipment is initialized with proper values
    requestAnimationFrame(() => {
      if (HM.COMPAT.ELKAN) return; // Disable if Elkan enabled.
      const equipmentContainer = html.querySelector('#equipment-container');
      if (equipmentContainer) {
        // Force equipment refresh to use the newly updated HM.SELECTED
        const equipment = new EquipmentParser();
        equipment
          .generateEquipmentSelectionUI()
          .then((choices) => {
            equipmentContainer.innerHTML = '';
            equipmentContainer.appendChild(choices);
          })
          .catch((error) => HM.log(1, 'Error rendering equipment choices:', error));
      }

      // Update summaries after restoring options
      SummaryManager.updateClassRaceSummary();
    });
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

  /* -------------------------------------------- */
  /*  Static Private Methods                      */
  /* -------------------------------------------- */

  /**
   * Updates equipment section UI based on class or background changes
   * @param {EquipmentParser} equipment - The equipment parser instance
   * @param {HTMLElement} container - The container element for equipment choices
   * @param {'class'|'background'} type - The type of equipment section to update
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #refreshEquipmentSectionUI(equipment, container, type) {
    if (HM.COMPAT.ELKAN) return; // Disable if elkan enabled.
    try {
      // Reset rendered flags on all items before updating
      if (EquipmentParser.lookupItems) {
        Object.values(EquipmentParser.lookupItems).forEach((category) => {
          if (category.items && category.items.forEach) {
            category.items.forEach((item) => {
              delete item.rendered;
              delete item.isSpecialCase;
              delete item.specialGrouping;
            });
          }
        });
      }

      const updatedChoices = await equipment.generateEquipmentSelectionUI(type);
      const sectionClass = `${type}-equipment-section`;
      const existingSection = container.querySelector(`.${sectionClass}`);

      if (existingSection) {
        existingSection.replaceWith(updatedChoices.querySelector(`.${sectionClass}`));
      } else {
        container.appendChild(updatedChoices.querySelector(`.${sectionClass}`));
      }
    } catch (error) {
      HM.log(1, `Error updating ${type} equipment choices:`, error);
    }
  }

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
}

/**
 * Manages MutationObserver instances throughout the application
 * to ensure proper tracking and cleanup
 * @class
 */
export class MutationObserverRegistry {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @type {Map<string, MutationObserver>} */
  static #registry = new Map();

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Registers a new MutationObserver with a unique key
   * @param {string} key - Unique identifier for this observer
   * @param {HTMLElement} element - The DOM element to observe
   * @param {MutationObserverInit} config - Observer configuration options
   * @param {MutationCallback} callback - Callback function for mutations
   * @returns {MutationObserver} The created observer instance
   * @static
   */
  static register(key, element, config, callback) {
    // Clean up existing observer with this key if it exists
    this.unregister(key);

    try {
      // Create and store the new observer
      const observer = new MutationObserver(callback);
      observer.observe(element, config);
      this.#registry.set(key, observer);

      HM.log(3, `Registered observer: ${key}`);
      return observer;
    } catch (error) {
      HM.log(1, `Error registering observer for ${key}:`, error);
      return null;
    }
  }

  /**
   * Unregisters and disconnects a specific observer
   * @param {string} key - The key of the observer to unregister
   * @returns {boolean} Whether the observer was successfully unregistered
   * @static
   */
  static unregister(key) {
    if (this.#registry.has(key)) {
      try {
        const observer = this.#registry.get(key);
        observer.disconnect();
        this.#registry.delete(key);

        HM.log(3, `Unregistered observer: ${key}`);
        return true;
      } catch (error) {
        HM.log(1, `Error unregistering observer ${key}:`, error);
      }
    }
    return false;
  }

  /**
   * Unregisters all observers matching a prefix
   * @param {string} prefix - The prefix to match against observer keys
   * @returns {number} Number of observers unregistered
   * @static
   */
  static unregisterByPrefix(prefix) {
    let count = 0;
    for (const key of this.#registry.keys()) {
      if (key.startsWith(prefix)) {
        if (this.unregister(key)) {
          count++;
        }
      }
    }

    if (count > 0) {
      HM.log(3, `Unregistered ${count} observers with prefix: ${prefix}`);
    }
    return count;
  }

  /**
   * Unregisters and disconnects all observers
   * @returns {number} Number of observers unregistered
   * @static
   */
  static unregisterAll() {
    try {
      const count = this.#registry.size;

      const disconnectErrors = [];
      this.#registry.forEach((observer, key) => {
        try {
          observer.disconnect();
        } catch (error) {
          HM.log(1, `Error disconnecting observer ${key}:`, error);
          disconnectErrors.push(key);
        }
      });

      this.#registry.clear();

      if (disconnectErrors.length > 0) {
        HM.log(1, `Encountered errors disconnecting ${disconnectErrors.length} observers: ${disconnectErrors.join(', ')}`);
      }

      HM.log(3, `Unregistered all ${count} observers`);
      return count;
    } catch (error) {
      HM.log(1, 'Error unregistering all observers:', error);
      return 0;
    }
  }

  /**
   * Gets the observer instance by key
   * @param {string} key - The key of the observer to get
   * @returns {MutationObserver|null} The observer instance or null if not found
   * @static
   */
  static get(key) {
    return this.#registry.get(key) || null;
  }

  /**
   * Gets the total number of registered observers
   * @returns {number} Count of registered observers
   * @static
   */
  static get count() {
    return this.#registry.size;
  }
}
