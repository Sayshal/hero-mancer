import { CharacterArtPicker, HM, MODULE, needsReload, needsRerender, rerenderHM } from '../utils/index.js';
import { log } from '../utils/logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const DragDropClass = foundry.applications.ux.DragDrop.implementation;

/** Character customization settings application. */
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
      width: 800
    },
    window: {
      contentClasses: ['standard-form'],
      icon: 'fa-solid fa-palette',
      resizable: false
    },
    actions: {
      selectArtPickerRoot: Customization.selectArtPickerRoot
    },
    dragDrop: [
      {
        dragSelector: '.advancement-order-item',
        dropSelector: '.advancement-order-list'
      }
    ]
  };

  static PARTS = {
    form: {
      template: 'modules/hero-mancer/templates/settings/customization.hbs',
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

  /** @returns {string} Window title */
  get title() {
    return `${MODULE.NAME} | ${game.i18n.localize('hm.settings.customization.menu.name')}`;
  }

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  config = [];

  /* -------------------------------------------- */
  /*  Protected Methods                           */
  /* -------------------------------------------- */

  /**
   * Initialize the advancement order configuration from settings or defaults
   */
  initializeConfig() {
    const defaults = [
      { id: 'background', label: 'hm.app.tab-names.background', order: 10, sortable: true },
      { id: 'race', label: 'hm.app.tab-names.race', order: 20, sortable: true },
      { id: 'class', label: 'hm.app.tab-names.class', order: 30, sortable: true }
    ];
    try {
      let config = game.settings.get(MODULE.ID, 'advancementOrder');
      if (!config || !Array.isArray(config) || config.length === 0) {
        config = defaults;
      } else {
        config = config.map((item) => ({
          ...item,
          sortable: item.sortable !== undefined ? item.sortable : true
        }));
      }
      this.config = foundry.utils.deepClone(config);
    } catch (error) {
      log(1, 'Error initializing advancement order configuration:', error);
      this.config = defaults;
    }
  }

  /**
   * Get the current valid advancement order configuration
   * @returns {Array} The current advancement order configuration or default if invalid
   * @static
   */
  static getValidConfiguration() {
    try {
      const config = game.settings.get(MODULE.ID, 'advancementOrder');
      if (!config || !Array.isArray(config) || config.length === 0) {
        return [
          { id: 'background', label: 'hm.app.tab-names.background', order: 10, sortable: true },
          { id: 'race', label: 'hm.app.tab-names.race', order: 20, sortable: true },
          { id: 'class', label: 'hm.app.tab-names.class', order: 30, sortable: true }
        ];
      }
      return config;
    } catch (error) {
      log(1, 'Error retrieving advancement order configuration, using defaults:', error);
      return [
        { id: 'background', label: 'hm.app.tab-names.background', order: 10, sortable: true },
        { id: 'race', label: 'hm.app.tab-names.race', order: 20, sortable: true },
        { id: 'class', label: 'hm.app.tab-names.class', order: 30, sortable: true }
      ];
    }
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this._setDraggableAttributes();
    this._setupDragDrop();
  }

  /**
   * Set up drag and drop handlers for advancement reordering
   * @private
   */
  _setupDragDrop() {
    this.options.dragDrop.forEach((dragDropOptions) => {
      dragDropOptions.permissions = {
        dragstart: () => true,
        drop: () => true
      };
      dragDropOptions.callbacks = {
        dragstart: this._onDragStart.bind(this),
        dragover: this._onDragOver.bind(this),
        drop: this._onDrop.bind(this)
      };
      const dragDropHandler = new DragDropClass(dragDropOptions);
      dragDropHandler.bind(this.element);
    });
  }

  /**
   * Set draggable attributes on advancement items
   * @private
   */
  _setDraggableAttributes() {
    const items = this.element.querySelectorAll('.advancement-order-item');
    items.forEach((item) => {
      const li = item.closest('li');
      const isSortable = !li.classList.contains('not-sortable');
      item.setAttribute('draggable', isSortable ? 'true' : 'false');
    });
  }

  /**
   * Handle drag start event
   * @param {DragEvent} event - The drag event
   * @returns {boolean} Whether drag start was successful
   * @private
   */
  _onDragStart(event) {
    const li = event.currentTarget.closest('li');
    if (!li || li.classList.contains('not-sortable')) return false;
    event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'advancement-order', index: li.dataset.index }));
    li.classList.add('dragging');
    return true;
  }

  /**
   * Handle drag over event to show drop position
   * @param {DragEvent} event - The drag event
   * @private
   */
  _onDragOver(event) {
    event.preventDefault();
    const list = this.element.querySelector('.advancement-order-list');
    if (!list) return;
    const draggingItem = list.querySelector('.dragging');
    if (!draggingItem) return;
    const items = Array.from(list.querySelectorAll('li:not(.dragging)'));
    if (!items.length) return;
    const targetItem = this._getDragTarget(event, items);
    if (!targetItem) return;
    const rect = targetItem.getBoundingClientRect();
    const dropAfter = event.clientY > rect.top + rect.height / 2;
    this._removeDropPlaceholders();
    const placeholder = document.createElement('div');
    placeholder.classList.add('drop-placeholder');
    if (dropAfter) targetItem.after(placeholder);
    else targetItem.before(placeholder);
  }

  /**
   * Find the target element for dropping
   * @param {DragEvent} event - The drag event
   * @param {Array<HTMLElement>} items - List of potential drop targets
   * @returns {HTMLElement|null} The target element
   * @private
   */
  _getDragTarget(event, items) {
    return (
      items.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = event.clientY - (box.top + box.height / 2);
        if (closest === null || Math.abs(offset) < Math.abs(closest.offset)) return { element: child, offset };
        return closest;
      }, null)?.element || null
    );
  }

  /**
   * Handle drop event to reorder advancements
   * @param {DragEvent} event - The drop event
   * @returns {boolean} Whether drop was successful
   * @private
   */
  _onDrop(event) {
    try {
      event.preventDefault();
      const dataString = event.dataTransfer.getData('text/plain');
      if (!dataString) return false;
      const data = JSON.parse(dataString);
      if (!data || data.type !== 'advancement-order') return false;
      const sourceIndex = parseInt(data.index);
      if (isNaN(sourceIndex)) return false;
      const list = this.element.querySelector('.advancement-order-list');
      const items = Array.from(list.querySelectorAll('li:not(.dragging)'));
      const targetItem = this._getDragTarget(event, items);
      if (!targetItem) return false;
      const targetIndex = parseInt(targetItem.dataset.index);
      if (isNaN(targetIndex)) return false;
      const rect = targetItem.getBoundingClientRect();
      const dropAfter = event.clientY > rect.top + rect.height / 2;
      let newIndex = dropAfter ? targetIndex + 1 : targetIndex;
      if (sourceIndex < newIndex) newIndex--;
      const [movedItem] = this.config.splice(sourceIndex, 1);
      this.config.splice(newIndex, 0, movedItem);
      this.config.forEach((item, idx) => {
        item.order = (idx + 1) * 10;
      });
      this.render(false);
      return true;
    } catch (error) {
      log(1, 'Error handling drop:', error);
      return false;
    } finally {
      this._cleanupDragElements();
    }
  }

  /**
   * Remove all drop placeholders
   * @private
   */
  _removeDropPlaceholders() {
    this.element.querySelectorAll('.drop-placeholder').forEach((el) => el.remove());
  }

  /**
   * Clean up visual elements after dragging
   * @private
   */
  _cleanupDragElements() {
    this.element.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging'));
    this._removeDropPlaceholders();
  }

  /**
   * Prepares context data for the customization settings application
   * @param {object} options - Application render options
   * @returns {Promise<object>} Context data for template rendering with customization settings
   * @protected
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    try {
      const settingsToFetch = [
        'alignments',
        'deities',
        'eyeColors',
        'hairColors',
        'skinTones',
        'genders',
        'enableRandomize',
        'artPickerRoot',
        'enablePlayerCustomization',
        'enableTokenCustomization',
        'enableAlignmentFaithInputs'
      ];

      // Add tokenizerCompatibility only if the module is active
      const tokenizerModuleActive = !!game.modules.get('vtta-tokenizer')?.active;
      if (tokenizerModuleActive) {
        settingsToFetch.push('tokenizerCompatibility');
      }

      context.tokenizerModuleActive = tokenizerModuleActive;

      for (const setting of settingsToFetch) {
        try {
          context[setting] = game.settings.get(MODULE.ID, setting);
        } catch {
          context[setting] = game.settings.settings.get(`${MODULE.ID}.${setting}`).default;
        }
      }

      // Advancement order
      if (!Array.isArray(this.config) || this.config.length === 0) this.initializeConfig();
      context.advancementConfig = this.config.map((item) => ({
        ...item,
        localizedLabel: game.i18n.localize(item.label),
        sortable: item.sortable !== undefined ? item.sortable : true
      }));

      return context;
    } catch (error) {
      log(1, `Error preparing context: ${error.message}`);
      ui.notifications.warn('hm.settings.customization.error-context', { localize: true });
      return context;
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
      const inputField = target.closest('.form-fields').querySelector('input[name="artPickerRoot"]');
      if (!inputField) throw new Error('Could not find artPickerRoot input field');

      const currentPath = inputField.value || '/';
      const pickerConfig = {
        type: 'folder',
        current: currentPath,
        callback: (path) => {
          inputField.value = path;
          inputField.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };

      const filepicker = new foundry.applications.apps.FilePicker.implementation(pickerConfig);
      filepicker.render(true);
    } catch (error) {
      log(1, `Error selecting art picker root: ${error.message}`);
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
    const settings = [
      'alignments',
      'deities',
      'eyeColors',
      'hairColors',
      'skinTones',
      'genders',
      'enableRandomize',
      'artPickerRoot',
      'enablePlayerCustomization',
      'enableTokenCustomization',
      'enableAlignmentFaithInputs'
    ];

    if (HM.COMPAT.TOKENIZER) settings.push('tokenizerCompatibility');

    // Get default values from game settings
    const defaults = {};
    const resetSettings = [];

    for (const setting of settings) {
      try {
        defaults[setting] = game.settings.settings.get(`${MODULE.ID}.${setting}`).default;
      } catch {
        defaults[setting] = null;
      }

      const value = formData.object[setting];
      const isEmpty = typeof value === 'string' && value.trim() === '';
      if (isEmpty) resetSettings.push(setting);
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
   * @param {object} formData - The processed form data
   * @returns {boolean|void} Returns false if validation fails
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
          const currentValue = game.settings.get(MODULE.ID, setting);
          let newValue;

          if (resetSettings.includes(setting)) {
            newValue = defaults[setting];
          } else {
            newValue = formData.object[setting];
          }

          // Check if the value actually changed
          if (JSON.stringify(currentValue) !== JSON.stringify(newValue)) {
            game.settings.set(MODULE.ID, setting, newValue);
            changedSettings[setting] = true;
          }
        } catch (error) {
          log(1, `Error saving setting "${setting}": ${error.message}`);
          ui.notifications.warn(game.i18n.format('hm.settings.customization.save-error', { setting }));
        }
      }

      // Update CharacterArtPicker root directory
      const newRootDirectory = formData.object.artPickerRoot || defaults.artPickerRoot;
      if (CharacterArtPicker.rootDirectory !== newRootDirectory) {
        CharacterArtPicker.rootDirectory = newRootDirectory;
      }

      // Save advancement order from DOM
      try {
        const form = _form;
        const advancementElements = Array.from(form.querySelectorAll('.advancement-item:not(.not-sortable)'));
        if (advancementElements.length) {
          const currentConfig = Customization.getValidConfiguration();
          const orderMap = {};
          advancementElements.forEach((el, idx) => {
            const itemId = el.dataset.itemId;
            if (itemId) orderMap[itemId] = idx;
          });
          const updatedConfig = currentConfig.map((item) => ({ ...item }));
          updatedConfig.sort((a, b) => {
            const orderA = orderMap[a.id] !== undefined ? orderMap[a.id] : a.order;
            const orderB = orderMap[b.id] !== undefined ? orderMap[b.id] : b.order;
            return orderA - orderB;
          });
          updatedConfig.forEach((item, idx) => {
            item.order = (idx + 1) * 10;
          });
          game.settings.set(MODULE.ID, 'advancementOrder', updatedConfig);
        }
      } catch (error) {
        log(1, `Error saving advancement order: ${error.message}`);
      }

      // Show warnings for reset settings
      if (resetSettings.length > 0) {
        const names = resetSettings.map((s) => game.i18n.localize(`hm.settings.${s}.name`));
        ui.notifications.warn(game.i18n.format('hm.settings.reset-to-default', { setting: names.join(', ') }));
      }

      // Handle reloads and re-renders based on what changed
      if (needsReload(changedSettings)) {
        HM.reloadConfirm({ world: true });
      } else if (needsRerender(changedSettings)) {
        rerenderHM();
      }

      ui.notifications.info('hm.settings.customization.saved', { localize: true });
    } catch (error) {
      log(1, `Error in formHandler: ${error.message}`);
      ui.notifications.error('hm.settings.customization.error-saving', { localize: true });
      return false;
    }
  }
}
