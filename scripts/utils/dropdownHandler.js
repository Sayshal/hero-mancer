import { HM, Listeners, StatRoller } from './index.js';

/**
 * Constants for dropdown modes
 * @constant {object}
 */
const MODES = {
  POINT_BUY: 'pointBuy',
  MANUAL_FORMULA: 'manualFormula',
  STANDARD_ARRAY: 'standardArray'
};

/**
 * Cache implementation for document storage
 * @class
 */
class DocumentCache {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @type {Map<string, Array>} */
  static cache = new Map();

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Generate cache key from context and documents key
   * @param {object} context - Application context
   * @param {string} documentsKey - Document collection key
   * @returns {string} Cache key
   * @static
   */
  static getKey(context, documentsKey) {
    return `${context.id}-${documentsKey}`;
  }

  /**
   * Retrieve documents from cache
   * @param {object} context - Application context
   * @param {string} documentsKey - Document collection key
   * @returns {Array|undefined} Cached documents
   * @static
   */
  static get(context, documentsKey) {
    const result = this.cache.get(this.getKey(context, documentsKey));
    return result;
  }

  /**
   * Store documents in cache
   * @param {object} context - Application context
   * @param {string} documentsKey - Document collection key
   * @param {Array} docs - Documents to cache
   * @static
   */
  static set(context, documentsKey, docs) {
    this.cache.set(this.getKey(context, documentsKey), docs);
  }

  /**
   * Check if documents exist in cache
   * @param {object} context - Application context
   * @param {string} documentsKey - Document collection key
   * @returns {boolean} Whether documents are cached
   * @static
   */
  static has(context, documentsKey) {
    return this.cache.has(this.getKey(context, documentsKey));
  }
}

/**
 * Handles dropdown interactions and updates throughout the application
 * @class
 */
export class DropdownHandler {
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
   * Retrieves documents from cache or context
   * @param {object} context - Application context
   * @param {string} documentsKey - Key for document collection
   * @returns {Array|null} Array of documents if found
   * @static
   */
  static getDocumentsFromCacheOrContext(context, documentsKey) {
    if (DocumentCache.has(context, documentsKey)) {
      return DocumentCache.get(context, documentsKey);
    }

    if (!context[documentsKey] || !Array.isArray(context[documentsKey])) {
      HM.log(1, `${HM.ID} | No documents found for type: ${documentsKey}`);
      return null;
    }

    const docs = context[documentsKey].flatMap((folder) => folder.docs || folder);
    DocumentCache.set(context, documentsKey, docs);
    return docs;
  }

  /**
   * Updates ability score dropdowns based on mode and selections
   * @param {NodeList} abilityDropdowns - List of ability dropdown elements
   * @param {number[]} selectedAbilities - Currently selected ability scores
   * @param {number} totalPoints - Total points allowed for Point Buy
   * @param {string} mode - Dice rolling method ('pointBuy', 'manualFormula')
   * @param {number[]} standardArray - Array of standard ability scores
   * @static
   */
  static refreshAbilityDropdownsState(abilityDropdowns, selectedAbilities, totalPoints, mode, standardArray) {
    try {
      if (!Array.isArray(selectedAbilities) || !Number.isInteger(totalPoints)) {
        throw new Error('Invalid input parameters');
      }

      // Collect all dropdown updates first, then apply them in a batch
      const dropdownUpdates = [];
      const selectedValues = Array.from(abilityDropdowns).map((dropdown) => dropdown.value);

      switch (mode) {
        case MODES.POINT_BUY:
          this.processPointBuyDropdownUpdates(abilityDropdowns, selectedAbilities, totalPoints, dropdownUpdates);
          break;
        case MODES.MANUAL_FORMULA:
          this.handleManualFormulaMode(abilityDropdowns, selectedAbilities, dropdownUpdates);
          break;
        case MODES.STANDARD_ARRAY:
          // Create an array of current dropdown values

          this.handleStandardArrayMode(abilityDropdowns, selectedValues);
          break;
        default:
          throw new Error(`Unsupported mode: ${mode}`);
      }

      // Apply all updates in one batch
      requestAnimationFrame(() => {
        dropdownUpdates.forEach((update) => update());

        if (mode === MODES.POINT_BUY) {
          const pointsSpent = StatRoller.calculateTotalPointsSpent(selectedAbilities);
          const remainingPoints = totalPoints - pointsSpent;

          // Directly update the remaining points display
          Listeners.updateRemainingPointsDisplay(remainingPoints);
        }
      });
    } catch (error) {
      HM.log(1, `Error in refreshAbilityDropdownsState: ${error.message}`);
    }
  }

  /**
   * Handles point buy mode updates
   * @param {NodeList} abilityDropdowns - Ability dropdown elements
   * @param {number[]} selectedAbilities - Selected ability scores
   * @param {number} totalPoints - Total available points
   * @static
   */
  static processPointBuyDropdownUpdates(abilityDropdowns, selectedAbilities, totalPoints, dropdownUpdates) {
    const pointsSpent = StatRoller.calculateTotalPointsSpent(selectedAbilities);
    const remainingPoints = totalPoints - pointsSpent;

    abilityDropdowns.forEach((dropdown) => {
      const currentValue = parseInt(dropdown.value, 10) || HM.ABILITY_SCORES.DEFAULT;

      // Add the update to our batch rather than executing immediately
      dropdownUpdates.push(() => {
        this.updateDropdownSelectionAvailability(dropdown, currentValue, remainingPoints);
      });
    });
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

  /**
   * Handles manual formula mode updates
   * @param {NodeList} abilityDropdowns Ability dropdown elements
   * @param {number[]} selectedAbilities Selected ability scores
   */
  static handleManualFormulaMode(abilityDropdowns, selectedAbilities, dropdownUpdates) {
    const selectedValues = new Set(selectedAbilities);

    abilityDropdowns.forEach((dropdown) => {
      const currentValue = dropdown.value;

      // Add the update to our batch rather than executing immediately
      dropdownUpdates.push(() => {
        dropdown.querySelectorAll('option').forEach((option) => {
          const optionValue = option.value;
          option.disabled = selectedValues.has(optionValue) && optionValue !== currentValue && parseInt(optionValue, 10) >= HM.ABILITY_SCORES.MIN;
        });
      });
    });
  }
}
