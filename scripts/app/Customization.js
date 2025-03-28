import { CharacterArtPicker, HM } from '../utils/index.js';

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

  /* -------------------------------------------- */
  /*  Getters                                     */
  /* -------------------------------------------- */

  get title() {
    return `${HM.NAME} | ${game.i18n.localize('hm.settings.customization.menu.name')}`;
  }

  /* -------------------------------------------- */
  /*  Protected Methods                           */
  /* -------------------------------------------- */

  static async selectArtPickerRoot(event, target) {
    const inputField = target.closest('.flex.items-center').querySelector('input[name="artPickerRoot"]');
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
  }

  /**
   * Prepares context data for the customization settings application
   * @param {object} _options - Application render options
   * @returns {Promise<object>} Context data for template rendering with customization settings
   * @protected
   */
  async _prepareContext(_options) {
    const context = {
      alignments: game.settings.get(HM.ID, 'alignments'),
      deities: game.settings.get(HM.ID, 'deities'),
      eyeColors: game.settings.get(HM.ID, 'eyeColors'),
      hairColors: game.settings.get(HM.ID, 'hairColors'),
      skinTones: game.settings.get(HM.ID, 'skinTones'),
      genders: game.settings.get(HM.ID, 'genders'),
      enableRandomize: game.settings.get(HM.ID, 'enableRandomize'),
      artPickerRoot: game.settings.get(HM.ID, 'artPickerRoot'),
      enablePlayerCustomization: game.settings.get(HM.ID, 'enablePlayerCustomization'),
      enableTokenCustomization: game.settings.get(HM.ID, 'enableTokenCustomization')
    };

    return context;
  }

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Processes form submission for customization settings
   * Validates and saves settings for character customization options
   * @param {Event} _event - The form submission event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - The processed form data
   * @returns {Promise<boolean|void>} Returns false if validation fails
   * @static
   */
  static async formHandler(_event, form, formData) {
    try {
      const settings = ['alignments', 'deities', 'eyeColors', 'hairColors', 'skinTones', 'genders', 'enableRandomize', 'artPickerRoot', 'enablePlayerCustomization', 'enableTokenCustomization'];

      for (const setting of settings) {
        await game.settings.set(HM.ID, setting, formData.object[setting]);
      }

      // Update CharacterArtPicker root directory
      CharacterArtPicker.rootDirectory = formData.object.artPickerRoot;

      HM.reloadConfirm({ world: true });

      ui.notifications.info('hm.settings.customization.saved', { localize: true });
    } catch (error) {
      HM.log(1, `Error in formHandler: ${error}`);
      ui.notifications.error('hm.settings.customization.error-saving', { localize: true });
    }
  }
}
