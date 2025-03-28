import { HM } from '../utils/index.js';

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
      if (!game.user) {
        HM.log(1, 'Cannot save options: No active user');
        return null;
      }

      if (!formData) {
        HM.log(2, 'No form data provided to save');
        return null;
      }

      HM.log(3, 'Saving form data:', formData);
      const data = { ...formData };

      const result = await game.user.setFlag(HM.ID, this.FLAG, data);
      HM.log(3, 'Options saved successfully');
      return result;
    } catch (error) {
      HM.log(1, 'Error saving options:', error);
      ui.notifications?.error('Failed to save character options');
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
      if (!game.user) {
        HM.log(1, 'Cannot load options: No active user');
        return {};
      }

      const data = await game.user.getFlag(HM.ID, this.FLAG);

      if (data) {
        HM.log(3, `Loaded saved data for ${game.user.name}:`, data);
      } else {
        HM.log(3, 'No saved options found for current user');
      }

      return data || {};
    } catch (error) {
      HM.log(1, 'Error loading options:', error);
      // Return empty object on error to avoid breaking callers
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
      // Verify user exists
      if (!game.user) {
        HM.log(1, 'Cannot reset options: No active user');
        return false;
      }

      // Clear saved flags
      await game.user.setFlag(HM.ID, this.FLAG, null);
      HM.log(3, 'Cleared saved options flags');

      // If no form element provided, just clear flags
      if (!formElement) return true;

      // Validate form element
      if (!(formElement instanceof HTMLElement)) {
        HM.log(2, 'Invalid form element provided to resetOptions');
        return false;
      }

      this.#resetFormElements(formElement);
      return true;
    } catch (error) {
      HM.log(1, 'Error resetting options:', error);
      ui.notifications?.error('Failed to reset character options');
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
    try {
      // Reset all form elements
      const formElements = formElement.querySelectorAll('select, input, color-picker');
      HM.log(3, `Resetting ${formElements.length} form elements`);

      formElements.forEach((elem) => {
        try {
          this.#resetSingleElement(elem);
        } catch (elemError) {
          // Continue resetting other elements if one fails
          HM.log(2, `Error resetting element ${elem.name || elem.id || 'unnamed'}:`, elemError);
        }
      });
    } catch (error) {
      HM.log(1, 'Error in resetFormElements:', error);
      throw error; // Re-throw to be caught by resetOptions
    }
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
      // Set color-picker element to a valid default color
      elem.value = '#000000'; // Black
    } else {
      elem.value = '';
    }

    // Dispatch change event
    elem.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
