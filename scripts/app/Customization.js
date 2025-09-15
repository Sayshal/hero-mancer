import { CharacterArtPicker, HM, needsReload, needsRerender, rerenderHM } from '../utils/index.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class Customization extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  static DEFAULT_OPTIONS = {
    id: 'hero-mancer-settings-customization',
    classes: ['hm-app'],
    tag: 'form',
    form: {
      handler: Customization.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    position: {
      height: 'auto',
      width: '550'
    },
    window: {
      icon: 'fa-solid fa-palette',
      resizable: false
    },
    actions: {
      selectArtPickerRoot: Customization.selectArtPickerRoot
    }
  };

  static PARTS = {
    form: {
      template: 'modules/hero-mancer/templates/settings/customization.hbs',
      id: 'body',
      classes: ['hm-customization-popup']
    },
    footer: {
      template: 'modules/hero-mancer/templates/settings/settings-footer.hbs',
      id: 'footer',
      classes: ['hm-compendiums-footer']
    }
  };

  get title() {
    return `${HM.NAME} | ${game.i18n.localize('hm.settings.customization.menu.name')}`;
  }

  /* -------------------------------------------- */
  /*  Protected Methods                           */
  /* -------------------------------------------- */

  /**
   * Prepares context data for the customization settings application
   * @param {object} _options - Application render options
   * @returns {object} Context data for template rendering with customization settings
   * @protected
   */
  _prepareContext(_options) {
    try {
      const settingsToFetch = [
        'alignments',
        'deities',
        'eye-colors',
        'hair-colors',
        'skin-tones',
        'genders',
        'enableRandomize',
        'artPickerRoot',
        'enablePlayerCustomization',
        'enableTokenCustomization'
      ];

      // Add tokenizerCompatibility only if the module is active
      const tokenizerModuleActive = !!game.modules.get('vtta-tokenizer')?.active;
      if (tokenizerModuleActive) {
        settingsToFetch.push('tokenizerCompatibility');
      }

      const context = {};
      context.tokenizerModuleActive = tokenizerModuleActive;

      for (const setting of settingsToFetch) {
        try {
          context[setting] = game.settings.get(HM.ID, setting);
        } catch (settingError) {
          HM.log(2, `Error fetching setting "${setting}": ${settingError.message}`);
          context[setting] = game.settings.settings.get(`${HM.ID}.${setting}`).default;
        }
      }

      return context;
    } catch (error) {
      HM.log(1, `Error preparing context: ${error.message}`);
      ui.notifications.error('hm.settings.customization.error-context', { localize: true });
      return {};
    }
  }

  /**
   * Handles the selection of the art picker root directory
   * Opens a FilePicker dialog to select a folder path for character art
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} target - The target element that triggered the action
   * @returns {Promise<void>} A promise that resolves when the directory selection is complete
   * @static
   */
  static async selectArtPickerRoot(_event, target) {
    try {
      const inputField = target.closest('.flex.items-center').querySelector('input[name="artPickerRoot"]');
      if (!inputField) throw new Error('Could not find artPickerRoot input field');

      const currentPath = inputField.value || '/';
      HM.log(3, 'Creating FilePicker for folder selection:', { currentPath });

      const pickerConfig = {
        type: 'folder',
        current: currentPath,
        callback: (path) => {
          inputField.value = path;
          inputField.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      const filepicker = new FilePicker(pickerConfig);
      filepicker.render(true);
    } catch (error) {
      HM.log(1, `Error selecting art picker root: ${error.message}`);
      ui.notifications.error('hm.settings.customization.error-art-picker', { localize: true });
    }
  }

  /**
   * Validates form data before saving customization settings
   * @param {object} formData - The processed form data
   * @returns {object} Object containing validation results and defaults
   * @static
   * @private
   */
  static _validateFormData(formData) {
    const settings = ['alignments', 'deities', 'eye-colors', 'hair-colors', 'skin-tones', 'genders', 'enableRandomize', 'artPickerRoot', 'enablePlayerCustomization', 'enableTokenCustomization'];
    if (HM.COMPAT.TOKENIZER) settings.push('tokenizerCompatibility');

    // Get default values from game settings
    const defaults = {};
    const resetSettings = [];

    for (const setting of settings) {
      try {
        defaults[setting] = game.settings.settings.get(`${HM.ID}.${setting}`).default;

        // Check for empty string values
        const value = formData.object[setting];
        const isEmpty = typeof value === 'string' && value.trim() === '';

        if (isEmpty) {
          resetSettings.push(setting);
        }
      } catch (error) {
        HM.log(2, `Error validating setting "${setting}": ${error.message}`);
        defaults[setting] = null;
      }
    }

    return { defaults, resetSettings, settings };
  }

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Processes form submission for customization settings
   * Validates and saves settings for character customization options
   * @param {Event} _event - The form submission event
   * @param {HTMLFormElement} _form - The form element
   * @param {FormDataExtended} formData - The processed form data
   * @returns {Promise<boolean|void>} Returns false if validation fails
   * @static
   */
  static formHandler(_event, _form, formData) {
    try {
      // Validate form data
      const validation = Customization._validateFormData(formData);
      const changedSettings = {};

      // Apply settings
      const { defaults, resetSettings, settings } = validation;

      // Apply settings (using defaults for resetSettings)
      for (const setting of settings) {
        try {
          const currentValue = game.settings.get(HM.ID, setting);
          let newValue;

          if (resetSettings.includes(setting)) {
            newValue = defaults[setting];
          } else {
            newValue = formData.object[setting];
          }

          // Check if the value actually changed
          if (JSON.stringify(currentValue) !== JSON.stringify(newValue)) {
            game.settings.set(HM.ID, setting, newValue);
            changedSettings[setting] = true;
          }
        } catch (error) {
          HM.log(1, `Error saving setting "${setting}": ${error.message}`);
          ui.notifications.warn(game.i18n.format('hm.settings.customization.save-error', { setting }));
        }
      }

      // Update CharacterArtPicker root directory
      const newRootDirectory = formData.object.artPickerRoot || defaults.artPickerRoot;
      if (CharacterArtPicker.rootDirectory !== newRootDirectory) {
        CharacterArtPicker.rootDirectory = newRootDirectory;
      }

      // Show warnings for reset settings
      if (resetSettings.length > 0) {
        for (const setting of resetSettings) {
          let settingName = game.i18n.localize(`hm.settings.${setting}.name`);
          ui.notifications.warn(game.i18n.format('hm.settings.reset-to-default', { setting: settingName }));
        }
      }

      // Handle reloads and re-renders based on what changed
      if (needsReload(changedSettings)) {
        HM.reloadConfirm({ world: true });
      } else if (needsRerender(changedSettings)) {
        rerenderHM();
      }

      ui.notifications.info('hm.settings.customization.saved', { localize: true });
    } catch (error) {
      HM.log(1, `Error in formHandler: ${error.message}`);
      ui.notifications.error('hm.settings.customization.error-saving', { localize: true });
      return false;
    }
  }
}
