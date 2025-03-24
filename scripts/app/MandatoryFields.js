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
   * @returns {Promise<object>} Context data for template rendering
   * @protected
   * @override
   */
  async _prepareContext(_options) {
    const fieldCategories = await this.getAllFormFields();
    const mandatoryFields = game.settings.get(HM.ID, 'mandatoryFields') || [];

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
      playerCustomizationEnabled: game.settings.get(HM.ID, 'enablePlayerCustomization'),
      tokenCustomizationEnabled: game.settings.get(HM.ID, 'enableTokenCustomization')
    };
  }

  /* -------------------------------------------- */
  /*  Public Methods                              */
  /* -------------------------------------------- */

  /**
   * Retrieves all configurable form fields organized by category
   * @returns {object} Object containing categorized form fields
   */
  getAllFormFields() {
    const abilityFields = Object.entries(CONFIG.DND5E.abilities).map(([key, ability]) => ({
      key: `abilities[${key}]`,
      label: game.i18n.format('DND5E.ABILITY.SECTIONS.Score', { ability: ability.label }),
      default: false
    }));

    return {
      basic: [
        { key: 'name', label: `${game.i18n.localize('hm.app.start.name-label')}`, default: true },
        { key: 'character-art', label: `${game.i18n.localize('hm.app.start.character-art-label')}`, default: false },
        { key: 'token-art', label: `${game.i18n.localize('hm.app.start.token-art-label')}`, default: false }
      ],
      player:
        game.settings.get(HM.ID, 'enablePlayerCustomization') ?
          [
            { key: 'player-color', label: `${game.i18n.localize('hm.app.start.player-color')}`, default: false },
            { key: 'player-pronouns', label: `${game.i18n.localize('hm.app.start.player-pronouns')}`, default: false },
            { key: 'player-avatar', label: `${game.i18n.localize('hm.app.start.player-avatar')}`, default: false }
          ]
        : [],
      token:
        game.settings.get(HM.ID, 'enableTokenCustomization') ?
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
  }

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Processes form submission for mandatory field settings
   * @param {Event} _event - The form submission event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} _formData - The processed form data
   * @returns {Promise<void>}
   * @static
   */
  static async formHandler(_event, form, _formData) {
    try {
      const checkboxes = form.querySelectorAll('input[type="checkbox"]');
      const mandatoryFields = Array.from(checkboxes)
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.name);

      await game.settings.set(HM.ID, 'mandatoryFields', mandatoryFields);

      HM.reloadConfirm({ world: true });

      ui.notifications.info('hm.settings.mandatory-fields.saved', { localize: true });
    } catch (error) {
      HM.log(1, 'Error in MandatoryFields formHandler:', error);
      ui.notifications.error('hm.settings.mandatory-fields.error-saving', { localize: true });
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
    const mandatoryFields = game.settings.get(HM.ID, 'mandatoryFields') || [];
    const submitButton = form.querySelector('.hm-app-footer-submit');

    if (!submitButton || !mandatoryFields.length) return true;

    // Track missing fields for validation result
    const missingFields = [];

    // Create a promise that resolves after UI updates
    await new Promise((resolve) => {
      requestAnimationFrame(() => {
        // Process all mandatory fields in one pass
        mandatoryFields.forEach((field) => {
          const element = form.querySelector(`[name="${field}"]`);
          if (!element) return;

          // Add mandatory class if not already present
          if (!element.classList.contains('mandatory-field')) {
            element.classList.add('mandatory-field');
          }

          // Determine field completion status
          let isComplete = false;
          let label = null;

          if (field.startsWith('abilities[')) {
            const abilityBlock = element.closest('.ability-block');
            label = abilityBlock?.querySelector('.ability-label') || abilityBlock?.querySelector('label');
            isComplete = FormValidation.isAbilityFieldComplete(element, abilityBlock);
          } else {
            isComplete = FormValidation.isFieldComplete(element);
            label = FormValidation.findAssociatedLabel(element);
          }

          // Update UI to reflect completion status
          if (label) {
            FormValidation.addIndicator(label, isComplete);
          }

          element.classList.toggle('complete', isComplete);

          // Track missing fields
          if (!isComplete) {
            missingFields.push(field);
          }
        });

        // Update submit button state
        const isValid = missingFields.length === 0;
        submitButton.disabled = !isValid;

        if (!isValid) {
          submitButton['data-tooltip'] = game.i18n.format('hm.errors.missing-mandatory-fields', {
            fields: missingFields.join(', ')
          });
        }

        // Resolve the promise after UI updates
        resolve();
      });
    });

    return missingFields.length === 0;
  }
}
