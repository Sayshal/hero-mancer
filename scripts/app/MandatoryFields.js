import { HM, needsReload, needsRerender, rerenderHM } from '../utils/index.js';

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

  get title() {
    return `${HM.NAME} | ${game.i18n.localize('hm.settings.mandatory-fields.menu.name')}`;
  }

  /* -------------------------------------------- */
  /*  Protected Methods                           */
  /* -------------------------------------------- */

  /**
   * Prepares context data for the mandatory fields configuration
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
          { key: 'character-name', label: `${game.i18n.localize('hm.app.start.name-label')}`, default: true },
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
          { key: 'appearance', label: `${game.i18n.localize('hm.app.biography.physical-description')}`, default: false }
        ],
        personality: [
          { key: 'traits', label: `${game.i18n.localize('hm.app.biography.personality-traits')}`, default: false },
          { key: 'ideals', label: `${game.i18n.localize('DND5E.Ideals')}`, default: false },
          { key: 'bonds', label: `${game.i18n.localize('DND5E.Bonds')}`, default: false },
          { key: 'flaws', label: `${game.i18n.localize('DND5E.Flaws')}`, default: false },
          { key: 'backstory', label: `${game.i18n.localize('hm.app.biography.backstory')}`, default: false }
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
      const currentMandatoryFields = game.settings.get(HM.ID, 'mandatoryFields') || [];

      // Compare current and new values
      const hasChanged = JSON.stringify(currentMandatoryFields.sort()) !== JSON.stringify(mandatoryFields.sort());
      const changedSettings = hasChanged ? { mandatoryFields: true } : {};

      if (hasChanged) {
        MandatoryFields._saveMandatoryFields(mandatoryFields);

        // Handle reloads and re-renders based on what changed
        if (needsReload(changedSettings)) {
          HM.reloadConfirm({ world: true });
        } else if (needsRerender(changedSettings)) {
          rerenderHM();
        }
      }

      ui.notifications.info('hm.settings.mandatory-fields.saved', { localize: true });
      return true;
    } catch (error) {
      HM.log(1, `Error in MandatoryFields formHandler: ${error.message}`);
      ui.notifications.error('hm.settings.mandatory-fields.error-saving', { localize: true });
      return false;
    }
  }

  /* -------------------------------------------- */
  /*  Static Protected Methods                    */
  /* -------------------------------------------- */

  /**
   * Collects selected mandatory fields from form checkboxes
   * @param {HTMLFormElement} form - The form element
   * @returns {string[]} Array of selected field names
   * @static
   * @protected
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
   * @protected
   */
  static _saveMandatoryFields(mandatoryFields) {
    try {
      game.settings.set(HM.ID, 'mandatoryFields', mandatoryFields);
    } catch (error) {
      HM.log(1, `Error saving mandatory fields: ${error.message}`);
      throw error;
    }
  }
}
