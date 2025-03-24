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
    if (!element || !form) return;

    try {
      const [filledCount, totalFields, unfilledFields, filledFields] = this.#calculateCompletionFromForm(form);
      const percentage = (filledCount / totalFields) * 100;

      HM.log(3, `Progress Update: ${filledCount}/${totalFields} fields filled (${percentage.toFixed(2)}%)`, { Filled: filledFields, Empty: unfilledFields });

      // Batch DOM updates
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

      return percentage;
    } catch (err) {
      HM.log(1, 'Error processing form progress:', err);
      return 0;
    }
  }

  /* -------------------------------------------- */
  /*  Static Private Methods                      */
  /* -------------------------------------------- */

  /**
   * Processes form data to determine completion
   * @param {HTMLElement} form - The form element
   * @returns {[number, number]} - Array containing [filledFields, totalFields]
   * @private
   * @static
   */
  static #calculateCompletionFromForm(form) {
    let totalFields = 0;
    let filledCount = 0;
    let unfilledFields = [];
    let filledFields = [];

    // Process named form elements
    const namedInputs = form.querySelectorAll('[name]');
    namedInputs.forEach((input) => {
      // Skip if in disabled section or excluded field names
      if (
        input.disabled ||
        input.closest('.equipment-section')?.classList.contains('disabled') ||
        input.name.startsWith('use-starting-wealth') ||
        input.name === 'ring.effects' ||
        input.name === 'player'
      ) {
        return;
      }

      totalFields++;
      let isFilled = false;

      if (input.type === 'checkbox') {
        isFilled = input.checked;
      } else if (input.type === 'select-one') {
        isFilled = Boolean(input.value);
      } else {
        isFilled = this.#isFormFieldPopulated(input.name, input.value, form);
      }

      if (isFilled) {
        filledCount++;
        filledFields.push({
          name: input.name,
          type: input.type,
          value: input.value,
          element: input
        });
      } else {
        unfilledFields.push({
          name: input.name,
          type: input.type,
          value: input.value,
          element: input
        });
      }
    });

    // Process equipment container inputs
    const equipmentContainer = form.querySelector('.equipment-container');
    if (equipmentContainer) {
      const equipmentInputs = equipmentContainer.querySelectorAll('input[type="checkbox"], select');
      equipmentInputs.forEach((input) => {
        // Skip disabled, favorite, and excluded inputs
        if (
          input.disabled ||
          input.closest('.equipment-section')?.classList.contains('disabled') ||
          input.className.includes('equipment-favorite-checkbox') ||
          input.name.startsWith('use-starting-wealth') ||
          input.name === 'ring.effects'
        ) {
          return;
        }

        totalFields++;
        let isFilled = false;

        if (input.type === 'checkbox') {
          isFilled = input.checked;
        } else if (input.type === 'select-one') {
          isFilled = Boolean(input.value);
        }

        if (isFilled) {
          filledCount++;
          filledFields.push({
            name: input.name,
            type: input.type,
            value: input.value,
            element: input
          });
        } else {
          unfilledFields.push({
            name: input.name || 'equipment-item',
            type: input.type,
            value: input.value,
            id: input.id,
            element: input
          });
        }
      });
    }
    return [filledCount, totalFields, unfilledFields, filledFields];
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
    if (key.match(/^abilities\[.*]$/)) {
      const isFilled = this.#isAbilityScoreFieldPopulated(value, form);
      HM.log(3, `Ability field "${key}" filled: ${isFilled}`);
      return isFilled;
    }

    // Handle starting-wealth-amount field (this check is still needed if we encounter nested fields)
    if (key === 'starting-wealth-amount') {
      return true; // Always consider filled since we're ignoring this functionality
    }

    // Normal field handling
    const isFilled = value !== null && value !== '' && value !== false;
    return isFilled;
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
    const rollMethodSelect = form.querySelector('#roll-method');
    const isPointBuy = rollMethodSelect?.value === 'pointBuy';

    if (isPointBuy) {
      const remainingPointsElement = form.querySelector('#remaining-points');
      const remainingPoints = parseInt(remainingPointsElement?.textContent || '0');
      const isFilled = remainingPoints === 0;
      HM.log(3, `Point Buy ability check - remaining points: ${remainingPoints}, filled: ${isFilled}`);
      return isFilled;
    }

    const isOnlyCommas = String(value).replace(/,/g, '').trim() === '';
    const isFilled = !isOnlyCommas && value !== null && value !== '';
    HM.log(3, `Standard ability check - value: ${value}, only commas: ${isOnlyCommas}, filled: ${isFilled}`);
    return isFilled;
  }
}
