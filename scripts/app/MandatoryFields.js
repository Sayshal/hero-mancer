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
      width: 500
    },
    window: {
      contentClasses: ['standard-form'],
      icon: 'fa-solid fa-list-check',
      resizable: false
    }
  };

  static PARTS = {
    form: {
      template: 'modules/hero-mancer/templates/settings/mandatory-fields.hbs',
      id: 'body',
      classes: ['standard-form'],
      scrollable: ['']
    },
    footer: {
      template: 'modules/hero-mancer/templates/settings/settings-footer.hbs',
      id: 'footer',
      classes: ['hm-compendiums-footer']
    }
  };

  get title() {
    return `${HM.NAME} | ${game.i18n.localize('hm.settings.mandatory-fields.menu.name')}`;
  }

  /* -------------------------------------------- */
  /*  Protected Methods                           */
  /* -------------------------------------------- */

  /**
   * Prepares context data for the mandatory fields configuration
   * @param {object} options - Application render options
   * @returns {Promise<object>} Context data for template rendering
   * @protected
   * @override
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    try {
      const fieldCategories = this.getAllFormFields();
      const mandatoryFields = game.settings.get(HM.ID, 'mandatoryFields') || [];
      const playerCustomizationEnabled = game.settings.get(HM.ID, 'enablePlayerCustomization');
      const tokenCustomizationEnabled = game.settings.get(HM.ID, 'enableTokenCustomization');

      // Process each category to add mandatory status
      const processedFields = {};
      for (const [category, fields] of Object.entries(fieldCategories)) {
        processedFields[category] = fields.map((field) => {
          const isInitialSetup = mandatoryFields.length === 0;
          return {
            key: field.key,
            label: field.label,
            mandatory: isInitialSetup ? field.default : mandatoryFields.includes(field.key)
          };
        });
      }

      return {
        ...context,
        fields: processedFields,
        playerCustomizationEnabled,
        tokenCustomizationEnabled
      };
    } catch (error) {
      HM.log(1, `Error preparing context: ${error.message}`);
      ui.notifications.error('hm.settings.mandatory-fields.error-context', { localize: true });
      return { ...context, fields: {}, playerCustomizationEnabled: false, tokenCustomizationEnabled: false };
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
    const playerCustomizationEnabled = game.settings.get(HM.ID, 'enablePlayerCustomization');
    const tokenCustomizationEnabled = game.settings.get(HM.ID, 'enableTokenCustomization');

    // Single abilities checkbox for the whole tab
    const abilityFields = [{ key: 'abilities', label: game.i18n.localize('hm.settings.mandatory-fields.groups.abilities'), default: false }];

    // Combine basic + player fields into one category
    const playerFields = [
      { key: 'character-name', label: game.i18n.localize('hm.app.start.name-label'), default: true },
      { key: 'character-art', label: game.i18n.localize('hm.app.start.character-art-label'), default: false },
      { key: 'token-art', label: game.i18n.localize('hm.app.start.token-art-label'), default: false }
    ];
    if (playerCustomizationEnabled) {
      playerFields.push(
        { key: 'player-color', label: game.i18n.localize('hm.app.start.player-color'), default: false },
        { key: 'player-pronouns', label: game.i18n.localize('hm.app.start.player-pronouns'), default: false },
        { key: 'player-avatar', label: game.i18n.localize('hm.app.start.player-avatar'), default: false }
      );
    }

    return {
      player: playerFields,
      token: tokenCustomizationEnabled
        ? [
            { key: 'displayName', label: game.i18n.localize('TOKEN.FIELDS.displayName.label'), default: false },
            { key: 'displayBars', label: game.i18n.localize('TOKEN.FIELDS.displayBars.label'), default: false },
            { key: 'bar1.attribute', label: game.i18n.localize('TOKEN.FIELDS.bar1.attribute.label'), default: false },
            { key: 'bar2.attribute', label: game.i18n.localize('TOKEN.FIELDS.bar2.attribute.label'), default: false }
          ]
        : [],
      abilities: abilityFields,
      characteristics: [
        { key: 'alignment', label: game.i18n.localize('DND5E.Alignment'), default: false },
        { key: 'gender', label: game.i18n.localize('DND5E.Gender'), default: false },
        { key: 'eyes', label: game.i18n.localize('DND5E.Eyes'), default: false },
        { key: 'height', label: game.i18n.localize('DND5E.Height'), default: false },
        { key: 'faith', label: game.i18n.localize('DND5E.Faith'), default: false },
        { key: 'hair', label: game.i18n.localize('DND5E.Hair'), default: false },
        { key: 'skin', label: game.i18n.localize('DND5E.Skin'), default: false },
        { key: 'age', label: game.i18n.localize('DND5E.Age'), default: false },
        { key: 'weight', label: game.i18n.localize('DND5E.Weight'), default: false }
      ],
      identity: [
        { key: 'traits', label: game.i18n.localize('hm.app.biography.personality-traits'), default: false },
        { key: 'ideals', label: game.i18n.localize('DND5E.Ideals'), default: false },
        { key: 'bonds', label: game.i18n.localize('DND5E.Bonds'), default: false },
        { key: 'flaws', label: game.i18n.localize('DND5E.Flaws'), default: false },
        { key: 'appearance', label: game.i18n.localize('hm.app.biography.physical-description'), default: false },
        { key: 'backstory', label: game.i18n.localize('hm.app.biography.backstory'), default: false }
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

      const hasChanged = JSON.stringify([...currentMandatoryFields].sort()) !== JSON.stringify([...mandatoryFields].sort());
      const changedSettings = hasChanged ? { mandatoryFields: true } : {};

      if (hasChanged) {
        MandatoryFields._saveMandatoryFields(mandatoryFields);

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
    const checkboxes = form.querySelectorAll('input[type="checkbox"]');
    return Array.from(checkboxes)
      .filter((checkbox) => checkbox.checked)
      .map((checkbox) => checkbox.name);
  }

  /**
   * Saves collected mandatory fields to game settings
   * @param {string[]} mandatoryFields - Array of field names to save
   * @static
   * @protected
   */
  static _saveMandatoryFields(mandatoryFields) {
    game.settings.set(HM.ID, 'mandatoryFields', mandatoryFields);
  }
}
