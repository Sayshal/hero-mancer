import { HM } from './index.js';

/**
 * Centralized form validation utilities
 * @class
 */
export class FormValidation {
  /**
   * Checks if a form field contains valid content
   * @param {HTMLElement} element - The form field to check
   * @returns {boolean} Whether the field has valid content
   */
  static isFieldComplete(element) {
    // Input validation
    if (!element || !(element instanceof HTMLElement)) {
      HM.log(2, 'FormValidation.isFieldComplete called with invalid element', element);
      return false;
    }

    try {
      // Extract element properties with null/undefined checks
      const type = this.#determineElementType(element);
      const value = element?.value ?? '';
      const checked = element?.checked ?? false;

      // Handle different input types
      switch (type) {
        case 'checkbox':
          return checked;
        case 'text':
        case 'textarea':
          return this.#isTextFieldComplete(value);
        case 'color-picker':
          return this.#isColorFieldComplete(value);
        case 'select-one':
          return this.#isSelectFieldComplete(value);
        case 'prose-mirror':
          return this.#isProseMirrorComplete(element, value);
        default:
          return this.#isTextFieldComplete(value);
      }
    } catch (error) {
      HM.log(1, 'Error in FormValidation.isFieldComplete:', error);
      return false;
    }
  }

  /**
   * Determines the type of an element for validation purposes
   * @param {HTMLElement} element - The element to check
   * @returns {string} The determined element type
   * @private
   */
  static #determineElementType(element) {
    if (!element) return '';

    if (element.localName === 'prose-mirror') return 'prose-mirror';
    if (element.classList.contains('color-picker')) return 'color-picker';

    return element?.localName || element?.type || '';
  }

  /**
   * Checks if a text field has valid content
   * @param {string} value - The field value
   * @returns {boolean} Whether the field is complete
   * @private
   */
  static #isTextFieldComplete(value) {
    if (typeof value !== 'string') return false;
    return value && value.trim() !== '';
  }

  /**
   * Checks if a color picker has a valid selection
   * @param {string} value - The color value
   * @returns {boolean} Whether a color is selected
   * @private
   */
  static #isColorFieldComplete(value) {
    return value && value !== '#000000';
  }

  /**
   * Checks if a select field has a valid selection
   * @param {string} value - The selected value
   * @returns {boolean} Whether an option is selected
   * @private
   */
  static #isSelectFieldComplete(value) {
    return value && value !== '';
  }

  /**
   * Checks if a ProseMirror editor has content
   * @param {HTMLElement} element - The editor element
   * @param {string} value - The editor value
   * @returns {boolean} Whether the editor has content
   * @private
   */
  static #isProseMirrorComplete(element, value) {
    const emptyStates = ['', '<p></p>', '<p><br></p>', '<p><br class="ProseMirror-trailingBreak"></p>'];
    const proseMirrorValue = value || '';
    const editorContent = element.querySelector('.editor-content.ProseMirror')?.innerHTML || '';

    return !emptyStates.includes(proseMirrorValue) && proseMirrorValue.trim() !== '' && !emptyStates.includes(editorContent) && editorContent.trim() !== '';
  }

  /**
   * Checks if an ability score field is complete based on the current roll method
   * @param {HTMLElement} element - The ability input element
   * @param {HTMLElement} abilityBlock - The parent ability block element
   * @returns {boolean} Whether the field is complete
   */
  static isAbilityFieldComplete(element, abilityBlock) {
    // Input validation
    if (!element || !(element instanceof HTMLElement)) {
      HM.log(2, 'FormValidation.isAbilityFieldComplete called with invalid element', element);
      return false;
    }

    if (!abilityBlock || !(abilityBlock instanceof HTMLElement)) {
      HM.log(2, 'FormValidation.isAbilityFieldComplete called with invalid abilityBlock', abilityBlock);
      return false;
    }

    try {
      // Determine scoring method and delegate to appropriate handler
      if (element.classList.contains('ability-dropdown') && !abilityBlock.classList.contains('point-buy')) {
        return this.#isStandardArrayComplete(element);
      } else if (element.type === 'hidden' && abilityBlock.classList.contains('point-buy')) {
        return this.#isPointBuyComplete(element);
      } else {
        return this.#isManualEntryComplete(abilityBlock);
      }
    } catch (error) {
      HM.log(1, 'Error in FormValidation.isAbilityFieldComplete:', error);
      return false;
    }
  }

  /**
   * Checks if a standard array ability selection is complete
   * @param {HTMLElement} element - The dropdown element
   * @returns {boolean} Whether a value is selected
   * @private
   */
  static #isStandardArrayComplete(element) {
    return element.value && element.value !== '';
  }

  /**
   * Checks if a point buy ability score is valid
   * @param {HTMLElement} element - The hidden input element
   * @returns {boolean} Whether the score is valid
   * @private
   */
  static #isPointBuyComplete(element) {
    const score = parseInt(element.value);
    return !isNaN(score) && score >= 8;
  }

  /**
   * Checks if manual ability entry fields are complete
   * @param {HTMLElement} abilityBlock - The ability block container
   * @returns {boolean} Whether the manual entry is complete
   * @private
   */
  static #isManualEntryComplete(abilityBlock) {
    const dropdown = abilityBlock.querySelector('.ability-dropdown');
    const scoreInput = abilityBlock.querySelector('.ability-score');

    return dropdown?.value && scoreInput?.value && dropdown.value !== '' && scoreInput.value !== '';
  }

  /**
   * Finds the label element associated with a form field
   * @param {HTMLElement} element - The form element to find a label for
   * @returns {HTMLElement|null} The associated label element or null if not found
   */
  static findAssociatedLabel(element) {
    // Input validation
    if (!element || !(element instanceof HTMLElement)) {
      HM.log(2, 'FormValidation.findAssociatedLabel called with invalid element', element);
      return null;
    }

    try {
      // Handle special case for prose-mirror elements
      if (element.localName === 'prose-mirror') {
        const section = element.closest('.notes-section');
        return section ? section.querySelector('h2') : null;
      }

      // Find container and look for label inside
      const container = element.closest('.form-row, .art-selection-row, .customization-row, .ability-block, .form-group, .trait-group, .personality-group, .description-group, .notes-group');

      if (!container) {
        return null;
      }

      return container.querySelector('label, span.ability-label');
    } catch (error) {
      HM.log(1, 'Error in FormValidation.findAssociatedLabel:', error);
      return null;
    }
  }

  /**
   * Adds a visual indicator to show field completion status
   * @param {HTMLElement} labelElement - The label element to modify
   * @param {boolean} [isComplete=false] - Whether the associated field is complete
   */
  static addIndicator(labelElement, isComplete = false) {
    // Input validation
    if (!labelElement || !(labelElement instanceof HTMLElement)) {
      HM.log(2, 'FormValidation.addIndicator called with invalid labelElement', labelElement);
      return;
    }

    // Ensure isComplete is a boolean (using double negation for fast conversion)
    isComplete = !!isComplete;

    try {
      // Remove existing indicator if any
      const existingIcon = labelElement.querySelector('.mandatory-indicator');
      if (existingIcon) {
        // Only remove if the state changed
        const currentIsComplete = existingIcon.classList.contains('fa-circle-check');
        if (currentIsComplete === isComplete) {
          return; // No change needed
        }
        existingIcon.remove();
      }

      // Create new indicator
      const icon = document.createElement('i');
      if (isComplete) {
        icon.className = 'fa-duotone fa-solid fa-circle-check mandatory-indicator complete';
      } else {
        icon.className = 'fa-duotone fa-solid fa-diamond-exclamation mandatory-indicator incomplete';
      }
      labelElement.prepend(icon);
    } catch (error) {
      HM.log(1, 'Error in FormValidation.addIndicator:', error);
    }
  }
}
