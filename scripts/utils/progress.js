import { HM } from '../utils/index.js';

/**
 * Manages progress bar for Hero Mancer
 * @class
 */
export class ProgressBar {
  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Updates progress based on form data
   * @param {HTMLElement} element - The application element
   * @param {HTMLFormElement} form - The form data
   * @returns {number} The calculated completion percentage
   * @static
   */
  static calculateAndUpdateProgress(element, form) {
    if (!element || !form) return 0;

    try {
      const progressData = this.calculateProgress(form);
      this.updateProgressUI(element, progressData.percentage);
      return progressData.percentage;
    } catch (err) {
      HM.log(1, 'Error processing form progress:', err);
      return 0;
    }
  }

  /**
   * Calculates completion percentage from form data
   * @param {HTMLFormElement} form - The form data
   * @returns {Object} Progress calculation data
   */
  static calculateProgress(form) {
    const [filledCount, totalFields, unfilledFields, filledFields] = this.#calculateCompletionFromForm(form);
    const percentage = totalFields ? (filledCount / totalFields) * 100 : 0;

    HM.log(3, `Progress Update: ${filledCount}/${totalFields} fields filled (${percentage.toFixed(2)}%)`, {
      Filled: filledFields,
      Empty: unfilledFields
    });

    return {
      filledCount,
      totalFields,
      percentage,
      unfilledFields,
      filledFields
    };
  }

  /**
   * Updates the UI with calculated progress
   * @param {HTMLElement} element - The application element
   * @param {number} percentage - The calculated percentage
   */
  static updateProgressUI(element, percentage) {
    if (!element) return;

    requestAnimationFrame(() => {
      // Update progress bar
      const hmHeader = element.querySelector('.hm-app-header');
      if (hmHeader) {
        hmHeader.style.setProperty('--progress-percent', `${percentage}%`);
      }

      // Update progress text
      const progressText = element.querySelector('.wizard-progress-text');
      if (progressText) {
        progressText.textContent = `${Math.round(percentage)}%`;
      }
    });
  }

  /* -------------------------------------------- */
  /*  Static Private Methods                      */
  /* -------------------------------------------- */

  /**
   * Processes form data to determine completion
   * @param {HTMLElement} form - The form element
   * @returns {[number, number, Array, Array]} - Array containing [filledFields, totalFields, unfilledFields, filledFields]
   * @private
   * @static
   */
  static #calculateCompletionFromForm(form) {
    const results = {
      totalFields: 0,
      filledCount: 0,
      unfilledFields: [],
      filledFields: []
    };

    this.#processNamedInputs(form, results);
    this.#processEquipmentInputs(form, results);

    return [results.filledCount, results.totalFields, results.unfilledFields, results.filledFields];
  }

  /**
   * Process named form elements for progress calculation
   * @param {HTMLElement} form - The form element
   * @param {Object} results - The results object to update
   * @private
   * @static
   */
  static #processNamedInputs(form, results) {
    const namedInputs = form.querySelectorAll('[name]');

    namedInputs.forEach((input) => {
      if (this.#shouldSkipInput(input)) return;

      results.totalFields++;
      const isFilled = this.#checkInputFilled(input, form);

      this.#updateFieldResults(input, isFilled, results);
    });
  }

  /**
   * Process equipment inputs for progress calculation
   * @param {HTMLElement} form - The form element
   * @param {Object} results - The results object to update
   * @private
   * @static
   */
  static #processEquipmentInputs(form, results) {
    const equipmentContainer = form.querySelector('.equipment-container');
    if (!equipmentContainer) return;

    const equipmentInputs = equipmentContainer.querySelectorAll('input[type="checkbox"], select');

    equipmentInputs.forEach((input) => {
      if (this.#shouldSkipEquipmentInput(input)) return;

      results.totalFields++;
      const isFilled = input.type === 'checkbox' ? input.checked : Boolean(input.value);

      this.#updateFieldResults(input, isFilled, results);
    });
  }

  /**
   * Checks if an input should be skipped in progress calculation
   * @param {HTMLElement} input - The input element
   * @returns {boolean} Whether to skip this input
   * @private
   * @static
   */
  static #shouldSkipInput(input) {
    return (
      input.disabled || input.closest('.equipment-section')?.classList.contains('disabled') || input.name.startsWith('use-starting-wealth') || input.name === 'ring.effects' || input.name === 'player'
    );
  }

  /**
   * Checks if an equipment input should be skipped
   * @param {HTMLElement} input - The input element
   * @returns {boolean} Whether to skip this input
   * @private
   * @static
   */
  static #shouldSkipEquipmentInput(input) {
    return (
      input.disabled ||
      input.closest('.equipment-section')?.classList.contains('disabled') ||
      input.className.includes('equipment-favorite-checkbox') ||
      input.name?.startsWith('use-starting-wealth') ||
      input.name === 'ring.effects'
    );
  }

  /**
   * Updates results object with field status
   * @param {HTMLElement} input - The input element
   * @param {boolean} isFilled - Whether the field is filled
   * @param {Object} results - The results object to update
   * @private
   * @static
   */
  static #updateFieldResults(input, isFilled, results) {
    const fieldInfo = {
      name: input.name || 'equipment-item',
      type: input.type,
      value: input.value,
      element: input
    };

    if (input.id && !input.name) {
      fieldInfo.id = input.id;
    }

    if (isFilled) {
      results.filledCount++;
      results.filledFields.push(fieldInfo);
    } else {
      results.unfilledFields.push(fieldInfo);
    }
  }

  /**
   * Checks if an input is considered filled
   * @param {HTMLElement} input - The input element
   * @param {HTMLElement} form - The form element
   * @returns {boolean} Whether the input is filled
   * @private
   * @static
   */
  static #checkInputFilled(input, form) {
    if (input.type === 'checkbox') {
      return input.checked;
    } else if (input.type === 'select-one') {
      return Boolean(input.value);
    } else {
      return this.#isFormFieldPopulated(input.name, input.value, form);
    }
  }

  /**
   * Checks if a field is considered filled
   * @param {string} key - Field key
   * @param {any} value - Field value
   * @param {HTMLElement} form - The form element
   * @returns {boolean} - Whether the field is considered filled
   * @private
   * @static
   */
  static #isFormFieldPopulated(key, value, form) {
    // Handle abilities fields
    if (key && key.match(/^abilities\[.*]$/)) {
      return this.#isAbilityScoreFieldPopulated(value, form);
    }

    // Handle starting-wealth-amount field
    if (key === 'starting-wealth-amount') {
      return true; // Always consider filled
    }

    // Normal field handling - ensure we have a valid value
    return value !== null && value !== undefined && value !== '' && value !== false;
  }

  /**
   * Checks if an ability field is considered filled
   * @param {any} value - Field value
   * @param {HTMLElement} form - The form element
   * @returns {boolean} - Whether the ability field is considered filled
   * @private
   * @static
   */
  static #isAbilityScoreFieldPopulated(value, form) {
    if (!form) return false;

    const rollMethodSelect = form.querySelector('#roll-method');
    if (!rollMethodSelect) return false;

    const isPointBuy = rollMethodSelect.value === 'pointBuy';

    if (isPointBuy) {
      return this.#isPointBuyComplete(form);
    }

    return this.#isAbilityValueFilled(value);
  }

  /**
   * Checks if point buy ability scores are complete
   * @param {HTMLElement} form - The form element
   * @returns {boolean} - Whether point buy is complete
   * @private
   * @static
   */
  static #isPointBuyComplete(form) {
    const remainingPointsElement = form.querySelector('#remaining-points');
    if (!remainingPointsElement) return false;

    const remainingPointsText = remainingPointsElement.textContent || '0';
    const remainingPoints = parseInt(remainingPointsText, 10);

    if (isNaN(remainingPoints)) return false;

    const isComplete = remainingPoints === 0;
    HM.log(3, `Point Buy ability check - remaining points: ${remainingPoints}, filled: ${isComplete}`);

    return isComplete;
  }

  /**
   * Checks if an ability value is filled
   * @param {any} value - The ability value
   * @returns {boolean} - Whether the value is filled
   * @private
   * @static
   */
  static #isAbilityValueFilled(value) {
    if (value === null || value === undefined || value === '') return false;

    // Check if it's just commas or whitespace
    const stringValue = String(value);
    const isOnlyCommas = stringValue.replace(/,/g, '').trim() === '';

    const isFilled = !isOnlyCommas;
    HM.log(3, `Standard ability check - value: ${value}, only commas: ${isOnlyCommas}, filled: ${isFilled}`);

    return isFilled;
  }
}
