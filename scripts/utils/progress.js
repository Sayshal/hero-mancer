import { HeroMancer, StatRoller } from '../utils/index.js';

/**
 * Manages progress bar for Hero Mancer
 * @class
 */
export class ProgressBar {
  /**
   * Updates progress based on form data
   * @param {HTMLElement} element - The application element
   * @param {HTMLFormElement} form - The form data
   * @returns {number} The calculated completion percentage
   * @static
   */
  static calculateAndUpdateProgress(element, form) {
    if (!element || !form) return 0;
    const progressData = this.calculateProgress(form);
    this.updateProgressUI(element, progressData.percentage);
    return progressData.percentage;
  }

  /**
   * Calculates completion percentage from form data
   * @param {HTMLFormElement} form - The form data
   * @returns {object} Progress calculation data
   */
  static calculateProgress(form) {
    const [filledCount, totalFields, unfilledFields, filledFields] = this.#calculateCompletionFromForm(form);
    const percentage = totalFields ? (filledCount / totalFields) * 100 : 0;
    return { filledCount, totalFields, percentage, unfilledFields, filledFields };
  }

  /**
   * Updates the UI with calculated progress
   * @param {HTMLElement} element - The application element
   * @param {number} percentage - The calculated percentage
   */
  static updateProgressUI(element, percentage) {
    if (!element) return;
    requestAnimationFrame(() => {
      const hmHeader = element.querySelector('.hm-app-header');
      if (hmHeader) hmHeader.style.setProperty('--progress-percent', `${percentage}%`);
      const progressText = element.querySelector('.wizard-progress-text');
      if (progressText) progressText.textContent = `${Math.round(percentage)}%`;
    });
  }

  /**
   * Processes form data to determine completion
   * @param {HTMLElement} form - The form element
   * @returns {Array} Array containing [filledFields, totalFields, unfilledFields, filledFields]
   * @private
   * @static
   */
  static #calculateCompletionFromForm(form) {
    const results = { totalFields: 0, filledCount: 0, unfilledFields: [], filledFields: [] };
    this.#processNamedInputs(form, results);
    this.#processEquipmentInputs(form, results);
    return [results.filledCount, results.totalFields, results.unfilledFields, results.filledFields];
  }

  /**
   * Process named form elements for progress calculation
   * @param {HTMLElement} form - The form element
   * @param {object} results - The results object to update
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
   * @param {object} results - The results object to update
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

  static IGNORED_FIELDS = new Set([
    'ring.effects',
    'ring.enabled',
    'ring.color',
    'backgroundColor',
    'player',
    'starting-wealth-rolled-class',
    'starting-wealth-amount-class',
    'starting-wealth-rolled-background',
    'starting-wealth-amount-background'
  ]);

  /**
   * Checks if an input should be skipped during progress calculation.
   * @param {HTMLElement} input - The input element to check
   * @returns {boolean} Whether to skip this input
   * @private
   * @static
   */
  static #shouldSkipInput(input) {
    return input.disabled || input.closest('.equipment-section')?.classList.contains('disabled') || input.name.startsWith('use-starting-wealth') || this.IGNORED_FIELDS.has(input.name);
  }

  /**
   * Checks if an equipment input should be skipped
   * @param {HTMLElement} input - The input element
   * @returns {boolean} Whether to skip this input
   * @private
   * @static
   */
  static #shouldSkipEquipmentInput(input) {
    return input.disabled || input.closest('.equipment-section')?.classList.contains('disabled') || input.name?.startsWith('use-starting-wealth') || this.IGNORED_FIELDS.has(input.name);
  }

  /**
   * Updates results object with field status
   * @param {HTMLElement} input - The input element
   * @param {boolean} isFilled - Whether the field is filled
   * @param {object} results - The results object to update
   * @private
   * @static
   */
  static #updateFieldResults(input, isFilled, results) {
    const fieldInfo = { name: input.name || 'equipment-item', type: input.type, value: input.value, element: input };
    if (input.id && !input.name) fieldInfo.id = input.id;
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
    if (input.type === 'checkbox') return input.checked;
    else if (input.type === 'select-one') return Boolean(input.value);
    else return this.#isFormFieldPopulated(input.name, input.value, form);
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
    if (key && key.match(/^abilities\[.*]$/)) return this.#isAbilityScoreFieldPopulated(value, form);
    if (key === 'starting-wealth-amount') return true;
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
    if (isPointBuy) return this.#isPointBuyComplete();
    return this.#isAbilityValueFilled(value);
  }

  /**
   * Checks if point buy ability scores are complete
   * @returns {boolean} Whether point buy is complete
   * @private
   * @static
   */
  static #isPointBuyComplete() {
    const total = StatRoller.getTotalPoints();
    const spent = StatRoller.calculateTotalPointsSpent(HeroMancer.selectedAbilities);
    return spent >= total;
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
    const stringValue = String(value);
    return stringValue.replace(/,/g, '').trim() !== '';
  }
}
