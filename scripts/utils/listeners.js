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
    this.initializeEquipmentListeners();
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
    const selectedValues = Array.from(abilityDropdowns).map(() => '');
    const totalPoints = StatRoller.getTotalPoints();
    const diceRollingMethod = game.settings.get(HM.CONFIG.ID, 'diceRollingMethod');

    abilityDropdowns.forEach((dropdown, index) => {
      dropdown.addEventListener('change', (event) => {
        if (diceRollingMethod === 'manualFormula') {
          const selectedValue = event.target.value;
          selectedValues[index] = selectedValue;
          const scoreInput = event.target.parentElement.querySelector('.ability-score');

          // Both dropdown and input should reference the selected ability
          event.target.setAttribute('name', `abilities[${selectedValue}]`);
          scoreInput.setAttribute('name', `abilities[${selectedValue}].score`);

          // Existing code for disabling options
          abilityDropdowns.forEach((otherDropdown, otherIndex) => {
            Array.from(otherDropdown.options).forEach((option) => {
              if (option.value && option.value !== '') {
                option.disabled = selectedValues.includes(option.value) && selectedValues[otherIndex] !== option.value;
              }
            });
          });
        } else if (diceRollingMethod === 'standardArray') {
          // Get previous value to update counts
          const previousValue = selectedValues[index];
          const newValue = event.target.value;

          // Update our tracking array
          selectedValues[index] = newValue;

          requestAnimationFrame(() => {
            HM.log(3, 'Initializing standard array dropdowns');
            // Force a second application of the standard array handling
            DropdownHandler.handleStandardArrayMode(abilityDropdowns, selectedValues);
          });
        } else {
          // Handle point buy case
          selectedValues[index] = event.target.value || '';
          DropdownHandler.refreshAbilityDropdownsState(abilityDropdowns, selectedValues, totalPoints, diceRollingMethod === 'pointBuy' ? 'pointBuy' : 'manualFormula');
        }
      });
    });

    if (diceRollingMethod === 'pointBuy') {
      this.updateRemainingPointsDisplay(context.remainingPoints);
      this.updatePlusButtonState(selectedAbilities, context.remainingPoints);
      this.updateMinusButtonState(selectedAbilities);
    } else if (diceRollingMethod === 'standardArray') {
      DropdownHandler.handleStandardArrayMode(abilityDropdowns, selectedValues);
    }
  }

  /**
   * Initializes equipment selection listeners and renders initial equipment choices
   * @static
   */
  static initializeEquipmentListeners() {
    const equipmentContainer = document.querySelector('#equipment-container');
    const classDropdown = document.querySelector('#class-dropdown');
    const backgroundDropdown = document.querySelector('#background-dropdown');
    const raceDropdown = document.querySelector('#race-dropdown');

    // Create a new instance for this render cycle
    const equipment = new EquipmentParser(classDropdown?.value, backgroundDropdown?.value);

    if (equipmentContainer) {
      // Clear any existing content
      equipmentContainer.innerHTML = '';

      equipment
        .generateEquipmentSelectionUI()
        .then((choices) => equipmentContainer.appendChild(choices))
        .catch((error) => HM.log(1, 'Error rendering equipment choices:', error));
    }

    // Create and store new handler functions
    if (classDropdown) {
      // Clean up existing handler first
      if (classDropdown._equipmentChangeHandler) {
        classDropdown.removeEventListener('change', classDropdown._equipmentChangeHandler);
      }

      classDropdown._equipmentChangeHandler = async (event) => {
        const selectedValue = event.target.value;

        HM.CONFIG.SELECT_STORAGE.class = {
          selectedValue,
          selectedId: selectedValue.split(' ')[0],
          selectedUUID: selectedValue.match(/\[(.*?)]/)?.[1]
        };

        // Create a new parser for this update
        const updateEquipment = new EquipmentParser(HM.CONFIG.SELECT_STORAGE.class.selectedId, HM.CONFIG.SELECT_STORAGE.background.selectedId);

        await this.#refreshEquipmentSectionUI(updateEquipment, equipmentContainer, 'class');
      };

      classDropdown.addEventListener('change', classDropdown._equipmentChangeHandler);
    }

    if (backgroundDropdown) {
      // Clean up existing handler first
      if (backgroundDropdown._equipmentChangeHandler) {
        backgroundDropdown.removeEventListener('change', backgroundDropdown._equipmentChangeHandler);
      }

      backgroundDropdown._equipmentChangeHandler = async (event) => {
        const selectedValue = event.target.value;

        HM.CONFIG.SELECT_STORAGE.background = {
          selectedValue,
          selectedId: selectedValue.split(' ')[0],
          selectedUUID: selectedValue.match(/\[(.*?)]/)?.[1]
        };

        // Create a new parser for this update
        const updateEquipment = new EquipmentParser(HM.CONFIG.SELECT_STORAGE.class.selectedId, HM.CONFIG.SELECT_STORAGE.background.selectedId);

        await this.#refreshEquipmentSectionUI(updateEquipment, equipmentContainer, 'background');
        SummaryManager.updateBackgroundSummary(event.target);
        await SummaryManager.processBackgroundSelectionChange(HM.CONFIG.SELECT_STORAGE.background);
      };

      backgroundDropdown.addEventListener('change', backgroundDropdown._equipmentChangeHandler);
    }

    if (raceDropdown) {
      // Clean up existing handler first
      if (raceDropdown._raceChangeHandler) {
        raceDropdown.removeEventListener('change', raceDropdown._raceChangeHandler);
      }

      raceDropdown._raceChangeHandler = async (event) => {
        const selectedValue = event.target.value;

        HM.CONFIG.SELECT_STORAGE.race = {
          selectedValue,
          selectedId: selectedValue.split(' ')[0],
          selectedUUID: selectedValue.match(/\[(.*?)]/)?.[1]
        };

        // Additional race-specific updates if needed
        SummaryManager.updateClassRaceSummary();
      };

      raceDropdown.addEventListener('change', raceDropdown._raceChangeHandler);
    }
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
        characterNameInput.removeEventListener('blur', characterNameInput._titleUpdateHandler);
      }

      characterNameInput._titleUpdateHandler = (event) => {
        requestAnimationFrame(() => {
          this.updateTitleFromFormState();
        });
      };

      characterNameInput.addEventListener('blur', characterNameInput._titleUpdateHandler);
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

    // Check if we have SELECT_STORAGE data
    if (HM.CONFIG.SELECT_STORAGE) {
      // Get document names from UUIDs
      try {
        if (HM.CONFIG.SELECT_STORAGE.race?.selectedUUID) {
          const raceDoc = fromUuidSync(HM.CONFIG.SELECT_STORAGE.race.selectedUUID);
          race = raceDoc?.name || '';
        }

        if (HM.CONFIG.SELECT_STORAGE.class?.selectedUUID) {
          const classDoc = fromUuidSync(HM.CONFIG.SELECT_STORAGE.class.selectedUUID);
          charClass = classDoc?.name || '';
        }

        if (HM.CONFIG.SELECT_STORAGE.background?.selectedUUID) {
          const backgroundDoc = fromUuidSync(HM.CONFIG.SELECT_STORAGE.background.selectedUUID);
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

    const newTitle = `${HM.CONFIG.TITLE} | ${characterDescription}`;

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
    HM.log(3, 'Initializing roll method listener');
    if (!html) {
      HM.log(3, 'HTML element is undefined');
      return;
    }

    const rollSelect = document.getElementById('roll-method');
    if (!rollSelect) {
      HM.log(3, 'Roll method select element not found');
      return;
    }

    rollSelect.addEventListener('change', async (event) => {
      const method = event.target.value;
      HM.log(3, `Roll method changed to: ${method}`);

      await game.settings.set(HM.CONFIG.ID, 'diceRollingMethod', method);
      HM.log(3, 'Updated diceRollingMethod setting');

      HeroMancer.selectedAbilities = Array(Object.keys(CONFIG.DND5E.abilities).length).fill(8);
      HM.log(3, 'Reset abilities array:', HeroMancer.selectedAbilities);

      this.initializeAbilityListeners(
        {
          remainingPoints: StatRoller.getTotalPoints()
        },
        HeroMancer.selectedAbilities
      );
      HM.log(3, 'Reinitialized ability listeners');

      const app = HM.heroMancer;
      if (app) {
        HM.log(3, 'Triggering re-render');
        app.render({ parts: ['abilities'] });
      } else {
        HM.log(3, 'App instance not found for re-render');
      }
    });
  }

  /**
   * Initializes token customization listeners and visual state updates
   * @static
   */
  static initializeTokenCustomizationListeners() {
    const ringEnabled = game.settings.get(HM.CONFIG.ID, 'enableTokenCustomization');
    if (!ringEnabled) return;

    const ringEnabledElement = document.querySelector('input[name="ring.enabled"]');
    const ringOptions = document.querySelectorAll(
      ['.customization-row:has(color-picker[name="ring.color"])', '.customization-row:has(color-picker[name="backgroundColor"])', '.customization-row.ring-effects'].join(', ')
    );

    if (!ringEnabledElement || !ringOptions.length) {
      HM.log(2, 'Token customization elements not found');
      return;
    }

    // Initial state
    HM.log(3, 'Setting initial token ring states');
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
    const playerCustomization = game.settings.get(HM.CONFIG.ID, 'enablePlayerCustomization');
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
    const mandatoryFields = game.settings.get(HM.CONFIG.ID, 'mandatoryFields') || [];
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
          HM.log(3, `Field input: ${element.name || element.id}`);
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
      } else {
        elem.value = value;
      }
    }

    // Second pass to handle ability dropdowns
    const diceRollingMethod = game.settings.get(HM.CONFIG.ID, 'diceRollingMethod');
    if (diceRollingMethod === 'standardArray') {
      const abilityDropdowns = html.querySelectorAll('.ability-dropdown');
      const selectedValues = Array.from(abilityDropdowns).map((dropdown) => dropdown.value);

      // Update available options based on current selections
      DropdownHandler.handleStandardArrayMode(abilityDropdowns, selectedValues);
    }

    // Update summaries after restoring options
    requestAnimationFrame(() => {
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
      HM.log(2, 'selectedAbilities must be an array');
      return;
    }
    const abilityScoreElement = document.getElementById(`ability-score-${index}`);
    const currentScore = parseInt(abilityScoreElement.innerHTML, 10);
    const newScore = Math.min(15, Math.max(8, currentScore + change));

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

    document.querySelectorAll('.plus-button').forEach((button, index) => {
      const currentScore = selectedAbilities[index];
      const pointCostForNextIncrease = StatRoller.getPointBuyCostForScore(currentScore + 1) - StatRoller.getPointBuyCostForScore(currentScore);
      const shouldDisable = currentScore >= 15 || remainingPoints < pointCostForNextIncrease;

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

    document.querySelectorAll('.minus-button').forEach((button, index) => {
      const currentScore = selectedAbilities[index];
      const shouldDisable = currentScore <= 8;

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
    try {
      // Reset rendered flags on all items before updating
      if (EquipmentParser.lookupItems) {
        Object.values(EquipmentParser.lookupItems).forEach((itemSet) => {
          itemSet.forEach((item) => {
            delete item.rendered;
            delete item.isSpecialCase;
            delete item.specialGrouping;
          });
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
