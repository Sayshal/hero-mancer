import { HeroMancer, HeroMancerUI, MODULE, StatRoller } from './index.js';
import { log } from './logger.mjs';

/**
 * Centralized form validation utilities
 * @class
 */
export class FormValidation {
  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Checks if a form field contains valid content
   * @param {HTMLElement} element - The form field to check
   * @returns {boolean} Whether the field has valid content
   */
  static isFieldComplete(element) {
    if (!element || !(element instanceof HTMLElement)) {
      log(2, 'FormValidation.isFieldComplete called with invalid element', element);
      return false;
    }

    try {
      const type = this.#determineElementType(element);
      const value = element?.value ?? '';
      const checked = element?.checked ?? false;
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
      log(1, 'Error in FormValidation.isFieldComplete:', error);
      return false;
    }
  }

  /**
   * Checks if an ability score field is complete based on the current roll method
   * @param {HTMLElement} element - The ability input element
   * @param {HTMLElement} abilityBlock - The parent ability block element
   * @returns {boolean} Whether the field is complete
   */
  static isAbilityFieldComplete(element, abilityBlock) {
    if (!element || !(element instanceof HTMLElement)) {
      log(2, 'FormValidation.isAbilityFieldComplete called with invalid element', element);
      return false;
    }
    if (!abilityBlock || !(abilityBlock instanceof HTMLElement)) {
      log(2, 'FormValidation.isAbilityFieldComplete called with invalid abilityBlock', abilityBlock);
      return false;
    }

    try {
      if (element.classList.contains('ability-dropdown') && !abilityBlock.classList.contains('point-buy')) return this.#isStandardArrayComplete(element);
      else if (element.type === 'hidden' && abilityBlock.classList.contains('point-buy')) return this.#isPointBuyComplete(element);
      else return this.#isManualEntryComplete(abilityBlock);
    } catch (error) {
      log(1, 'Error in FormValidation.isAbilityFieldComplete:', error);
      return false;
    }
  }

  /**
   * Finds the label element associated with a form field
   * @param {HTMLElement} element - The form element to find a label for
   * @returns {HTMLElement|null} The associated label element or null if not found
   */
  static findAssociatedLabel(element) {
    if (!element || !(element instanceof HTMLElement)) {
      log(2, 'FormValidation.findAssociatedLabel called with invalid element', element);
      return null;
    }

    try {
      if (element.localName === 'prose-mirror') {
        const fieldset = element.closest('fieldset');
        return fieldset ? fieldset.querySelector('legend') : null;
      }
      const container = element.closest(
        '.form-row, .art-selection-row, .customization-row, .ability-block, .form-group, .trait-group, .personality-group, .description-group, .notes-group'
      );

      if (!container) return null;
      return container.querySelector('label, span.ability-label');
    } catch (error) {
      log(1, 'Error in FormValidation.findAssociatedLabel:', error);
      return null;
    }
  }

  /**
   * Adds a visual indicator to show field completion status
   * @param {HTMLElement} labelElement - The label element to modify
   * @param {boolean} [isComplete] - Whether the associated field is complete
   */
  static addIndicator(labelElement, isComplete = false) {
    if (!labelElement || !(labelElement instanceof HTMLElement)) {
      log(2, 'FormValidation.addIndicator called with invalid labelElement', labelElement);
      return;
    }
    isComplete = !!isComplete;

    try {
      const existingIcon = labelElement.querySelector('.mandatory-indicator');
      if (existingIcon) {
        const currentIsComplete = existingIcon.classList.contains('fa-circle-check');
        if (currentIsComplete === isComplete) return;
        existingIcon.remove();
      }

      const icon = document.createElement('i');
      if (isComplete) {
        icon.className = 'fa-solid fa-circle-check mandatory-indicator complete';
        icon.setAttribute('title', game.i18n.localize('hm.app.mandatory.completed'));
      } else {
        icon.className = 'fa-solid fa-triangle-exclamation mandatory-indicator incomplete';
        icon.setAttribute('title', game.i18n.localize('hm.app.mandatory.incomplete'));
      }
      labelElement.prepend(icon);
    } catch (error) {
      log(1, 'Error in FormValidation.addIndicator:', error);
    }
  }

  /**
   * Validates the form against mandatory field requirements
   * Updates UI to indicate incomplete fields and controls submit button state
   * @param {HTMLElement} form - The form element to check
   * @returns {Promise<boolean>} True if all mandatory fields are valid
   */
  static async checkMandatoryFields(form) {
    try {
      if (!form) {
        log(2, 'No form provided to checkMandatoryFields');
        return true;
      }

      let mandatoryFields;
      try {
        mandatoryFields = game.settings.get(MODULE.ID, 'mandatoryFields') || [];
      } catch (error) {
        log(1, `Error fetching mandatory fields: ${error.message}`);
        mandatoryFields = [];
      }

      HeroMancerUI.updateTabIndicators(form);
      if (!mandatoryFields.length) return true;
      const fieldStatus = FormValidation._evaluateFieldStatus(form, mandatoryFields);
      await FormValidation._updateFieldIndicators(fieldStatus);
      const submitButton = form.querySelector('.hm-app-footer-submit');
      if (submitButton) {
        const isValid = fieldStatus.missingFields.length === 0;
        FormValidation._updateSubmitButton(submitButton, isValid, fieldStatus.missingFields);
      }
      return fieldStatus.missingFields.length === 0;
    } catch (error) {
      log(1, `Error in checkMandatoryFields: ${error.message}`);
      return true;
    }
  }

  /**
   * Checks if a specific tab has incomplete mandatory fields
   * @param {string} tabId - The ID of the tab to check
   * @param {HTMLElement} form - The form element
   * @returns {boolean} Whether the tab has any incomplete mandatory fields
   */
  static hasIncompleteTabFields(tabId, form) {
    try {
      if (!form || !tabId) return false;
      const tabElement = form.querySelector(`.tab[data-tab="${tabId}"]`);
      if (!tabElement) return false;
      const mandatoryFields = game.settings.get(MODULE.ID, 'mandatoryFields') || [];
      if (!mandatoryFields.length) return false;
      for (const fieldName of mandatoryFields) {
        // Tab-level abilities check
        if (fieldName === 'abilities') {
          if (tabId === 'abilities' && !FormValidation.#isAbilitiesTabComplete(form)) return true;
          continue;
        }
        const element = tabElement.querySelector(`[name="${fieldName}"]`);
        if (!element) continue;
        if (!FormValidation.isFieldComplete(element)) return true;
      }
      return false;
    } catch (error) {
      log(1, `Error checking tab mandatory fields: ${error.message}`);
      return false;
    }
  }

  /* -------------------------------------------- */
  /*  Static Protected Methods                    */
  /* -------------------------------------------- */

  /**
   * Evaluates the status of all mandatory fields
   * @param {HTMLElement} form - The form element
   * @param {string[]} mandatoryFields - Array of mandatory field names
   * @returns {object} Status information for fields
   * @protected
   */
  static _evaluateFieldStatus(form, mandatoryFields) {
    const fieldStatus = { fields: [], missingFields: [] };

    for (const field of mandatoryFields) {
      // Tab-level abilities check
      if (field === 'abilities') {
        const isComplete = FormValidation.#isAbilitiesTabComplete(form);
        const abilitiesTab = form.querySelector('.tab[data-tab="abilities"]') || (form.matches?.('.tab[data-tab="abilities"]') ? form : null);
        if (!abilitiesTab) continue;
        const label = abilitiesTab.querySelector('legend') || abilitiesTab.querySelector('h2');
        const data = { element: abilitiesTab, field, isComplete, label };
        fieldStatus.fields.push(data);
        if (!isComplete) fieldStatus.missingFields.push(field);
        continue;
      }

      const element = form.querySelector(`[name="${field}"]`);
      if (!element) continue;
      if (!element.classList.contains('mandatory-field')) element.classList.add('mandatory-field');

      const isComplete = FormValidation.isFieldComplete(element);
      const label = FormValidation.findAssociatedLabel(element);
      const data = { element, field, isComplete, label };
      fieldStatus.fields.push(data);
      if (!isComplete) fieldStatus.missingFields.push(field);
    }

    return fieldStatus;
  }

  /**
   * Updates UI indicators for field status
   * @param {object} fieldStatus - Status information for fields
   * @returns {Promise<void>}
   * @protected
   */
  static async _updateFieldIndicators(fieldStatus) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        fieldStatus.fields.forEach((data) => {
          if (data.element) data.element.classList.toggle('complete', data.isComplete);
          if (data.label) FormValidation.addIndicator(data.label, data.isComplete);
        });

        resolve();
      });
    });
  }

  /**
   * Updates submit button state based on validation
   * @param {HTMLElement} submitButton - The submit button element
   * @param {boolean} isValid - Whether all mandatory fields are valid
   * @param {string[]} missingFields - Array of missing field names
   * @returns {void}
   * @protected
   */
  static _updateSubmitButton(submitButton, isValid, missingFields) {
    submitButton.disabled = !isValid;
    if (!isValid) submitButton['data-tooltip'] = game.i18n.format('hm.errors.missing-mandatory-fields', { fields: missingFields.join(', ') });
  }

  /* -------------------------------------------- */
  /*  Static Private Methods                      */
  /* -------------------------------------------- */

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
   * Checks if the abilities tab is fully complete based on the active roll method
   * @param {HTMLElement} form - The form element
   * @returns {boolean} Whether all abilities are complete
   * @private
   */
  static #isAbilitiesTabComplete(form) {
    const abilitiesTab = form.querySelector('.tab[data-tab="abilities"]') || (form.matches?.('.tab[data-tab="abilities"]') ? form : null);
    if (!abilitiesTab) return false;

    const isPointBuy = abilitiesTab.querySelector('.ability-container.point-buy');
    if (isPointBuy) {
      const total = StatRoller.getTotalPoints();
      const spent = StatRoller.calculateTotalPointsSpent(HeroMancer.selectedAbilities);
      return spent >= total;
    }

    // Standard Array or Manual — check all ability blocks
    const blocks = abilitiesTab.querySelectorAll('.ability-block');
    for (const block of blocks) {
      const dropdown = block.querySelector('.ability-dropdown');
      if (dropdown && !dropdown.value) return false;
      const scoreInput = block.querySelector('.ability-score');
      if (scoreInput && !scoreInput.value) return false;
    }
    return blocks.length > 0;
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
}
