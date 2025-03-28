import { FormValidation, HM } from '../utils/index.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class MandatoryFields extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  static DEFAULT_OPTIONS = {
    id: 'hero-mancer-settings-mandatory-fields',
    classes: ['hm-app'],
    tag: 'form',
    form: {
      handler: MandatoryFields.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    position: {
      height: 'auto',
      width: 'auto'
    },
    window: {
      icon: 'fa-solid fa-list-check',
      resizable: false
    }
  };

  static PARTS = {
    form: {
      template: 'modules/hero-mancer/templates/settings/mandatory-fields.hbs',
      id: 'body',
      classes: ['hm-mandatory-fields-popup']
    },
    footer: {
      template: 'modules/hero-mancer/templates/settings/settings-footer.hbs',
      id: 'footer',
      classes: ['hm-mandatory-footer']
    }
  };

  // Cache for form fields to prevent repeated DOM operations
  static #formFieldsCache = null;

  /* -------------------------------------------- */
  /*  Getters                                     */
  /* -------------------------------------------- */

  get title() {
    return `${HM.NAME} | ${game.i18n.localize('hm.settings.mandatory-fields.menu.name')}`;
  }

  /* -------------------------------------------- */
  /*  Protected Methods                           */
  /* -------------------------------------------- */

  /**
   * Prepares context data for the mandatory fields configuration
   * Loads current field settings and organizes them by category
   * @param {object} _options - Application render options
   * @returns {object} Context data for template rendering
   * @protected
   * @override
   */
  _prepareContext(_options) {
    try {
      let fieldCategories;
      let mandatoryFields;
      let playerCustomizationEnabled;
      let tokenCustomizationEnabled;

      try {
        fieldCategories = this.getAllFormFields();
      } catch (error) {
        HM.log(1, `Error fetching form fields: ${error.message}`);
        fieldCategories = {};
      }

      try {
        mandatoryFields = game.settings.get(HM.ID, 'mandatoryFields') || [];
      } catch (error) {
        HM.log(1, `Error fetching mandatory fields: ${error.message}`);
        mandatoryFields = [];
      }

      try {
        playerCustomizationEnabled = game.settings.get(HM.ID, 'enablePlayerCustomization');
      } catch (error) {
        HM.log(2, `Error fetching player customization setting: ${error.message}`);
        playerCustomizationEnabled = false;
      }

      try {
        tokenCustomizationEnabled = game.settings.get(HM.ID, 'enableTokenCustomization');
      } catch (error) {
        HM.log(2, `Error fetching token customization setting: ${error.message}`);
        tokenCustomizationEnabled = false;
      }

      // Process each category to add mandatory status
      const processedFields = {};
      for (const [category, fields] of Object.entries(fieldCategories)) {
        processedFields[category] = fields.map((field) => {
          // If there are saved mandatory fields, use those
          // Otherwise, use the default values
          const isInitialSetup = mandatoryFields.length === 0;
          return {
            key: field.key,
            label: field.label,
            mandatory: isInitialSetup ? field.default : mandatoryFields.includes(field.key)
          };
        });
      }

      return {
        fields: processedFields,
        playerCustomizationEnabled,
        tokenCustomizationEnabled
      };
    } catch (error) {
      HM.log(1, `Error preparing context: ${error.message}`);
      ui.notifications.error('hm.settings.mandatory-fields.error-context', { localize: true });
      return { fields: {}, playerCustomizationEnabled: false, tokenCustomizationEnabled: false };
    }
  }

  /* -------------------------------------------- */
  /*  Public Methods                              */
  /* -------------------------------------------- */

  /**
   * Retrieves all configurable form fields organized by category
   * Uses caching to prevent repeated generation of the same data
   * @returns {object} Object containing categorized form fields
   */
  getAllFormFields() {
    try {
      // Return cached fields if available and settings haven't changed
      if (MandatoryFields.#formFieldsCache) {
        const cachedPlayerSetting = MandatoryFields.#formFieldsCache.playerCustomizationEnabled;
        const cachedTokenSetting = MandatoryFields.#formFieldsCache.tokenCustomizationEnabled;

        const currentPlayerSetting = game.settings.get(HM.ID, 'enablePlayerCustomization');
        const currentTokenSetting = game.settings.get(HM.ID, 'enableTokenCustomization');

        // Only use cache if customization settings haven't changed
        if (cachedPlayerSetting === currentPlayerSetting && cachedTokenSetting === currentTokenSetting) {
          return MandatoryFields.#formFieldsCache.fields;
        }
      }

      // Get current customization settings
      const playerCustomizationEnabled = game.settings.get(HM.ID, 'enablePlayerCustomization');
      const tokenCustomizationEnabled = game.settings.get(HM.ID, 'enableTokenCustomization');

      // Generate ability fields
      const abilityFields = Object.entries(CONFIG.DND5E.abilities).map(([key, ability]) => ({
        key: `abilities[${key}]`,
        label: game.i18n.format('DND5E.ABILITY.SECTIONS.Score', { ability: ability.label }),
        default: false
      }));

      // Generate all field categories
      const fields = {
        basic: [
          { key: 'name', label: `${game.i18n.localize('hm.app.start.name-label')}`, default: true },
          { key: 'character-art', label: `${game.i18n.localize('hm.app.start.character-art-label')}`, default: false },
          { key: 'token-art', label: `${game.i18n.localize('hm.app.start.token-art-label')}`, default: false }
        ],
        player:
          playerCustomizationEnabled ?
            [
              { key: 'player-color', label: `${game.i18n.localize('hm.app.start.player-color')}`, default: false },
              { key: 'player-pronouns', label: `${game.i18n.localize('hm.app.start.player-pronouns')}`, default: false },
              { key: 'player-avatar', label: `${game.i18n.localize('hm.app.start.player-avatar')}`, default: false }
            ]
          : [],
        token:
          tokenCustomizationEnabled ?
            [
              { key: 'displayName', label: `${game.i18n.localize('TOKEN.CharShowNameplate')}`, default: false },
              { key: 'displayBars', label: `${game.i18n.localize('TOKEN.ResourceDisplay')}`, default: false },
              { key: 'bar1.attribute', label: `${game.i18n.localize('TOKEN.ResourceBar1A')}`, default: false },
              { key: 'bar2.attribute', label: `${game.i18n.localize('TOKEN.ResourceBar2A')}`, default: false },
              { key: 'ring.enabled', label: `${game.i18n.localize('TOKEN.FIELDS.ring.enabled.label')}`, default: false },
              { key: 'ring.color', label: `${game.i18n.localize('TOKEN.FIELDS.ring.colors.ring.label')}`, default: false },
              { key: 'backgroundColor', label: `${game.i18n.localize('DND5E.TokenRings.BackgroundColor')}`, default: false },
              { key: 'ring.effects', label: `${game.i18n.localize('TOKEN.FIELDS.ring.effects.label')}`, default: false }
            ]
          : [],
        core: [
          { key: 'background', label: `${game.i18n.localize('hm.app.background.select-label')}`, default: true },
          { key: 'race', label: `${game.i18n.localize('hm.app.race.select-label')}`, default: true },
          { key: 'class', label: `${game.i18n.localize('hm.app.class.select-label')}`, default: true }
        ],
        abilities: abilityFields,
        details: [
          { key: 'alignment', label: `${game.i18n.localize('DND5E.Alignment')}`, default: false },
          { key: 'faith', label: `${game.i18n.localize('DND5E.Faith')}`, default: false }
        ],
        physical: [
          { key: 'eyes', label: `${game.i18n.localize('DND5E.Eyes')}`, default: false },
          { key: 'hair', label: `${game.i18n.localize('DND5E.Hair')}`, default: false },
          { key: 'skin', label: `${game.i18n.localize('DND5E.Skin')}`, default: false },
          { key: 'height', label: `${game.i18n.localize('DND5E.Height')}`, default: false },
          { key: 'weight', label: `${game.i18n.localize('DND5E.Weight')}`, default: false },
          { key: 'age', label: `${game.i18n.localize('DND5E.Age')}`, default: false },
          { key: 'gender', label: `${game.i18n.localize('DND5E.Gender')}`, default: false },
          { key: 'appearance', label: `${game.i18n.localize('hm.app.finalize.physical-description')}`, default: false }
        ],
        personality: [
          { key: 'traits', label: `${game.i18n.localize('hm.app.finalize.personality-traits')}`, default: false },
          { key: 'ideals', label: `${game.i18n.localize('DND5E.Ideals')}`, default: false },
          { key: 'bonds', label: `${game.i18n.localize('DND5E.Bonds')}`, default: false },
          { key: 'flaws', label: `${game.i18n.localize('DND5E.Flaws')}`, default: false },
          { key: 'backstory', label: `${game.i18n.localize('hm.app.finalize.backstory')}`, default: false }
        ]
      };

      // Store in cache with customization settings for cache validation
      MandatoryFields.#formFieldsCache = {
        fields,
        playerCustomizationEnabled,
        tokenCustomizationEnabled
      };

      return fields;
    } catch (error) {
      HM.log(1, `Error generating form fields: ${error.message}`);
      // Clear cache on error
      MandatoryFields.#formFieldsCache = null;
      throw error;
    }
  }

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Processes form submission for mandatory field settings
   * @param {Event} _event - The form submission event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} _formData - The processed form data
   * @returns {Promise<boolean>} Returns false if errors occur
   * @static
   */
  static async formHandler(_event, form, _formData) {
    try {
      if (!form) {
        throw new Error('Form element is missing');
      }

      const mandatoryFields = MandatoryFields._collectMandatoryFields(form);

      MandatoryFields._saveMandatoryFields(mandatoryFields);

      HM.reloadConfirm({ world: true });
      ui.notifications.info('hm.settings.mandatory-fields.saved', { localize: true });
      return true;
    } catch (error) {
      HM.log(1, `Error in MandatoryFields formHandler: ${error.message}`);
      ui.notifications.error('hm.settings.mandatory-fields.error-saving', { localize: true });
      return false;
    }
  }

  /**
   * Collects selected mandatory fields from form checkboxes
   * @param {HTMLFormElement} form - The form element
   * @returns {string[]} Array of selected field names
   * @static
   * @private
   */
  static _collectMandatoryFields(form) {
    try {
      const checkboxes = form.querySelectorAll('input[type="checkbox"]');
      return Array.from(checkboxes)
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.name);
    } catch (error) {
      HM.log(2, `Error collecting mandatory fields: ${error.message}`);
      throw error;
    }
  }

  /**
   * Saves collected mandatory fields to game settings
   * @param {string[]} mandatoryFields - Array of field names to save
   * @returns {void}
   * @static
   * @private
   */
  static _saveMandatoryFields(mandatoryFields) {
    try {
      game.settings.set(HM.ID, 'mandatoryFields', mandatoryFields);
    } catch (error) {
      HM.log(1, `Error saving mandatory fields: ${error.message}`);
      throw error;
    }
  }

  /**
   * Validates the form against mandatory field requirements
   * Updates UI to indicate incomplete fields and controls submit button state
   * @param {HTMLElement} form - The form element to check
   * @returns {Promise<boolean>} True if all mandatory fields are valid
   * @static
   */
  static async checkMandatoryFields(form) {
    try {
      if (!form) {
        HM.log(2, 'No form provided to checkMandatoryFields');
        return true;
      }

      let mandatoryFields;
      try {
        mandatoryFields = game.settings.get(HM.ID, 'mandatoryFields') || [];
      } catch (error) {
        HM.log(1, `Error fetching mandatory fields: ${error.message}`);
        mandatoryFields = [];
      }

      const submitButton = form.querySelector('.hm-app-footer-submit');

      // Early return if no submit button or no mandatory fields
      if (!submitButton || !mandatoryFields.length) return true;

      // Get all elements and field status in one pass to minimize DOM operations
      const fieldStatus = MandatoryFields._evaluateFieldStatus(form, mandatoryFields);

      // Update UI based on field status
      await MandatoryFields._updateFieldIndicators(fieldStatus);

      // Update submit button state
      const isValid = fieldStatus.missingFields.length === 0;
      MandatoryFields._updateSubmitButton(submitButton, isValid, fieldStatus.missingFields);

      return isValid;
    } catch (error) {
      HM.log(1, `Error in checkMandatoryFields: ${error.message}`);
      return true; // Default to allowing submission on error
    }
  }

  /**
   * Evaluates the status of all mandatory fields
   * @param {HTMLElement} form - The form element
   * @param {string[]} mandatoryFields - Array of mandatory field names
   * @returns {object} Status information for fields
   * @static
   * @private
   */
  static _evaluateFieldStatus(form, mandatoryFields) {
    // Collect all form elements and their status in one operation
    const fieldStatus = {
      fields: [],
      missingFields: []
    };

    // Use a Map for quick element lookups when processing
    const elementMap = new Map();

    // First collect all elements to minimize DOM operations
    mandatoryFields.forEach((field) => {
      const element = form.querySelector(`[name="${field}"]`);
      if (!element) return;

      // Add mandatory class if not already present
      if (!element.classList.contains('mandatory-field')) {
        element.classList.add('mandatory-field');
      }

      elementMap.set(field, {
        element,
        field,
        abilityField: field.startsWith('abilities['),
        isComplete: false,
        label: null
      });
    });

    // Then process all elements efficiently
    elementMap.forEach((data, field) => {
      let isComplete = false;
      let label = null;

      if (data.abilityField) {
        const abilityBlock = data.element.closest('.ability-block');
        label = abilityBlock?.querySelector('.ability-label') || abilityBlock?.querySelector('label');
        isComplete = FormValidation.isAbilityFieldComplete(data.element, abilityBlock);
      } else {
        isComplete = FormValidation.isFieldComplete(data.element);
        label = FormValidation.findAssociatedLabel(data.element);
      }

      // Update with completion status
      data.isComplete = isComplete;
      data.label = label;

      fieldStatus.fields.push(data);

      if (!isComplete) {
        fieldStatus.missingFields.push(field);
      }
    });

    return fieldStatus;
  }

  /**
   * Updates UI indicators for field status
   * @param {object} fieldStatus - Status information for fields
   * @returns {Promise<void>}
   * @static
   * @private
   */
  static async _updateFieldIndicators(fieldStatus) {
    // Use requestAnimationFrame to batch DOM updates
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        fieldStatus.fields.forEach((data) => {
          // Update element class
          data.element.classList.toggle('complete', data.isComplete);

          // Add indicator to label if present
          if (data.label) {
            FormValidation.addIndicator(data.label, data.isComplete);
          }
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
   * @static
   * @private
   */
  static _updateSubmitButton(submitButton, isValid, missingFields) {
    submitButton.disabled = !isValid;

    if (!isValid) {
      submitButton['data-tooltip'] = game.i18n.format('hm.errors.missing-mandatory-fields', {
        fields: missingFields.join(', ')
      });
    }
  }
}
