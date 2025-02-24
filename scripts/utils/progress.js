import { HM } from '../hero-mancer.js';

/**
 * Manages progress bar for Hero Mancer
 * @class
 */
export class ProgressBar {
  /**
   * Updates the header progress bar and title
   * @param {HTMLElement} element - The application element
   * @param {number} completedSections - Number of completed sections
   * @param {number} totalSections - Total number of sections
   */
  static updateHeader(element, completedSections, totalSections) {
    if (!element || typeof completedSections !== 'number' || typeof totalSections !== 'number') return;

    const headerElement = element.querySelector('.window-header');
    if (!headerElement) return;

    const progressPercentage = Math.min((completedSections / totalSections) * 100, 100);

    // Update header background gradient
    this.#updateHeaderGradient(headerElement, progressPercentage);

    // Update title text
    this.#updateHeaderTitle(headerElement, progressPercentage);
  }

  /**
   * Updates the header gradient based on progress
   * @param {HTMLElement} headerElement - The header element
   * @param {number} progressPercentage - Current progress percentage
   * @private
   */
  static #updateHeaderGradient(headerElement, progressPercentage) {
    // Starting color: rgb(69, 99, 181) - blue
    // End color: rgb(75, 181, blue: 69) - green
    const startColor = { red: 69, green: 99, blue: 181 };
    const endColor = { red: 75, green: 181, blue: 69 };

    const currentRed = Math.floor(startColor.red + (progressPercentage / 100) * (endColor.red - startColor.red));
    const currentGreen = Math.floor(startColor.green + (progressPercentage / 100) * (endColor.green - startColor.green));
    const currentBlue = Math.floor(startColor.blue + (progressPercentage / 100) * (endColor.blue - startColor.blue));

    const progressColor = `rgb(${currentRed}, ${currentGreen}, ${currentBlue})`;
    const gradient = `linear-gradient(to right,
      ${progressColor} 0%,
      ${progressColor} ${progressPercentage}%,
      rgba(0, 0, 0, 0.5) ${progressPercentage}%,
      rgba(0, 0, 0, 0.5) 100%
    )`;

    headerElement.style.background = gradient;
  }

  /**
   * Updates the header title with progress percentage
   * @param {HTMLElement} headerElement - The header element
   * @param {number} progressPercentage - Current progress percentage
   * @private
   */
  static #updateHeaderTitle(headerElement, progressPercentage) {
    const titleElement = headerElement.querySelector('.window-title');
    if (!titleElement) return;

    const originalTitle = titleElement.dataset.baseTitle || titleElement.textContent;
    titleElement.dataset.baseTitle = originalTitle;
    titleElement.textContent = `${originalTitle} (${Math.round(progressPercentage)}% Complete)`;
  }

  /**
   * Clears the progress bar styling from the header
   * @param {HTMLElement} element - The application element
   */
  static clearHeader(element) {
    const headerElement = element?.querySelector('.window-header');
    if (!headerElement) return;

    headerElement.style.background = '';

    const titleElement = headerElement.querySelector('.window-title');
    if (titleElement && titleElement.dataset.baseTitle) {
      titleElement.textContent = titleElement.dataset.baseTitle;
      delete titleElement.dataset.baseTitle;
    }
  }

  /**
   * Updates progress based on form data
   * @param {HTMLElement} element - The application element
   * @param {FormData} formData - The form data
   */
  static updateProgress(element, form) {
    if (!element || !form) return;

    try {
      const [filledCount, totalFields] = this.#processFormData(form);
      const percentage = (filledCount / totalFields) * 100;

      HM.log(3, `Progress Update: ${filledCount}/${totalFields} fields filled (${percentage.toFixed(2)}%)`);

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

      return percentage;
    } catch (err) {
      HM.log(1, 'Error processing form progress:', err);
      return 0;
    }
  }

  /**
   * Processes form data to determine completion
   * @param {HTMLElement} form - The form element
   * @returns {[number, number]} - Array containing [filledFields, totalFields]
   * @private
   */
  static #processFormData(form) {
    let totalFields = 0;
    let filledCount = 0;

    // Process named form elements
    const namedInputs = form.querySelectorAll('[name]');
    namedInputs.forEach((input) => {
      if (input.disabled || input.closest('.equipment-section')?.classList.contains('disabled')) {
        return;
      }

      totalFields++;
      let isFilled = false;

      if (input.type === 'checkbox') {
        isFilled = input.checked;
      } else if (input.type === 'select-one') {
        isFilled = Boolean(input.value);
      } else {
        isFilled = this.#isFieldFilled(input.name, input.value, form);
      }

      // Log field state
      HM.log(3, 'Field status check:', {
        name: input.name,
        type: input.type || input.tagName.toLowerCase(),
        value: input.value,
        checked: input.checked,
        isFilled: isFilled
      });

      if (isFilled) filledCount++;
    });

    // Process equipment container inputs
    const equipmentContainer = form.querySelector('.equipment-container');
    if (equipmentContainer) {
      const equipmentInputs = equipmentContainer.querySelectorAll('input[type="checkbox"], select');
      equipmentInputs.forEach((input) => {
        if (input.disabled || input.closest('.equipment-section')?.classList.contains('disabled')) {
          return;
        }

        totalFields++;
        let isFilled = false;

        if (input.type === 'checkbox') {
          isFilled = input.checked;
        } else if (input.type === 'select-one') {
          isFilled = Boolean(input.value);
        }

        // Log equipment field state
        HM.log(3, 'Equipment field status:', {
          name: input.name,
          type: input.type,
          value: input.value,
          checked: input.checked,
          isFilled: isFilled
        });

        if (isFilled) filledCount++;
      });
    }

    HM.log(3, `Progress Update: ${filledCount}/${totalFields} fields filled (${((filledCount / totalFields) * 100).toFixed(2)}%)`, {
      totalFields,
      filledCount
    });

    return [filledCount, totalFields];
  }

  /**
   * Checks if a field is considered filled
   * @param {string} key - Field key
   * @param {any} value - Field value
   * @param {HTMLElement} form - The form element
   * @returns {boolean} - Whether the field is considered filled
   * @private
   */
  static #isFieldFilled(key, value, form) {
    // Handle starting wealth toggle first
    if (key === 'use-starting-wealth') {
      return true; // Always count this as filled since it's a boolean toggle
    }

    // Handle abilities fields
    if (key.match(/^abilities\[.*]$/)) {
      const isFilled = this.#isAbilityFieldFilled(value, form);
      HM.log(3, `Ability field "${key}" filled: ${isFilled}`);
      return isFilled;
    }

    // Handle ring effects field
    if (key === 'ring.effects') {
      const effectCheckboxes = form.querySelectorAll('input[name="ring.effects"]');
      const anyChecked = Array.from(effectCheckboxes).some((checkbox) => checkbox.checked);
      HM.log(3, `Ring effects field check - any checked: ${anyChecked}`, {
        total: effectCheckboxes.length,
        checked: Array.from(effectCheckboxes).filter((c) => c.checked).length
      });
      return anyChecked;
    }

    if (key === 'starting-wealth-amount') {
      // Only check if parent checkbox is checked
      const useStartingWealth = form.querySelector('[name="use-starting-wealth"]');
      if (useStartingWealth?.checked) {
        return value && value.trim() !== '';
      }
      return true; // Don't count it if checkbox isn't checked
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
   */
  static #isAbilityFieldFilled(value, form) {
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
