import { MODULE } from '../utils/index.js';
import { log } from './logger.mjs';

/**
 * Manages saved character creation data across sessions
 * @class
 */
export class SavedOptions {
  /**
   * Flag name used for storing options
   * @static
   */
  static FLAG = 'saved-options';

  /**
   * Saves form data to user flags
   * @param {object} formData - Form data to save
   * @returns {Promise<object|null>} Result of setting the flag or null on failure
   * @static
   */
  static async saveOptions(formData) {
    try {
      if (!game.user || !formData) return null;
      const data = { ...formData };
      log(3, `Saving ${Object.keys(data).length} form options`);
      return await game.user.setFlag(MODULE.ID, this.FLAG, data);
    } catch (error) {
      log(1, 'Error saving options:', error);
      ui.notifications?.error('hm.errors.save-options-failed', { localize: true });
      return null;
    }
  }

  /**
   * Loads saved options from user flags
   * @returns {Promise<object>} The saved options or empty object if none
   * @static
   */
  static async loadOptions() {
    try {
      if (!game.user) return {};
      const data = await game.user.getFlag(MODULE.ID, this.FLAG);
      log(3, `Loaded ${data ? Object.keys(data).length : 0} saved options`);
      return data || {};
    } catch (error) {
      log(1, 'Error loading options:', error);
      return {};
    }
  }

  /**
   * Resets saved options and optionally resets form elements
   * @param {HTMLElement} [formElement] - Optional form element to reset
   * @returns {Promise<boolean>} Success status
   * @static
   */
  static async resetOptions(formElement = null) {
    try {
      if (!game.user) return false;
      await game.user.setFlag(MODULE.ID, this.FLAG, null);
      if (!formElement) return true;
      if (!(formElement instanceof HTMLElement)) return false;
      this.#resetFormElements(formElement);
      return true;
    } catch (error) {
      log(1, 'Error resetting options:', error);
      ui.notifications?.error('hm.errors.reset-options-failed', { localize: true });
      return false;
    }
  }

  /**
   * Reset all elements in a form
   * @param {HTMLElement} formElement - The form to reset
   * @private
   * @static
   */
  static #resetFormElements(formElement) {
    const formElements = formElement.querySelectorAll('select, input, color-picker');
    formElements.forEach((elem) => {
      this.#resetSingleElement(elem);
    });
  }

  /**
   * Reset a single form element
   * @param {HTMLElement} elem - The element to reset
   * @private
   * @static
   */
  static #resetSingleElement(elem) {
    if (elem.type === 'checkbox') {
      elem.checked = false;
    } else if (elem.tagName.toLowerCase() === 'color-picker' || elem.type === 'color') {
      elem.value = '#000000';
    } else {
      elem.value = '';
    }
    elem.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
