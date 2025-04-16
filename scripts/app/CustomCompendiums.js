import { HM, needsReload, needsRerender, rerenderHM } from '../utils/index.js';

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class CustomCompendiums extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  static EXCLUDED_TYPES = ['class', 'race', 'background', 'npc', 'character', 'subclass', 'rolltable', 'journal'];

  static DEFAULT_OPTIONS = {
    id: 'hero-mancer-settings-custom-compendiums',
    classes: ['hm-app'],
    tag: 'form',
    form: {
      handler: CustomCompendiums.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    actions: {
      classes: () => CustomCompendiums.manageCompendium('class'),
      races: () => CustomCompendiums.manageCompendium('race'),
      backgrounds: () => CustomCompendiums.manageCompendium('background'),
      items: () => CustomCompendiums.manageCompendium('item')
    },
    position: {
      height: 'auto',
      width: '600'
    },
    window: {
      icon: 'fa-solid fa-atlas',
      resizable: false
    }
  };

  static PARTS = {
    form: {
      template: 'modules/hero-mancer/templates/settings/custom-compendiums.hbs',
      id: 'body',
      classes: ['hm-compendiums-popup']
    },
    footer: {
      template: 'modules/hero-mancer/templates/settings/settings-footer.hbs',
      id: 'footer',
      classes: ['hm-compendiums-footer']
    }
  };

  static DIALOG_TEMPLATE = 'modules/hero-mancer/templates/settings/custom-compendiums-dialog.hbs';

  static #validPacksCache = new Map();

  static PACKS = { class: [], background: [], race: [], item: [] };

  get title() {
    return `${HM.NAME} | ${game.i18n.localize('hm.settings.custom-compendiums.menu.name')}`;
  }

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Actions performed after the first render of the Application.
   * @param {ApplicationRenderContext} _context Prepared context data
   * @param {RenderOptions} _options Provided render options
   * @returns {void}
   * @protected
   * @override
   */
  _onFirstRender() {
    HM.log(1, 'Squeeb', CustomCompendiums.PACKS);
    CustomCompendiums.PACKS.class = game.settings.get(HM.ID, 'classPacks');
    CustomCompendiums.PACKS.background = game.settings.get(HM.ID, 'backgroundPacks');
    CustomCompendiums.PACKS.race = game.settings.get(HM.ID, 'racePacks');
    CustomCompendiums.PACKS.item = game.settings.get(HM.ID, 'itemPacks');
    HM.log(1, 'Squeeb', CustomCompendiums.PACKS);
  }

  /**
   * Manages the compendium selection and handles validation.
   * @async
   * @param {string} type - The type of compendium to manage
   * @returns {Promise<boolean>} - Whether the compendium management was successful
   */
  static async manageCompendium(type) {
    try {
      if (!['class', 'race', 'background', 'item'].includes(type)) {
        throw new Error(`Invalid compendium type: ${type}`);
      }

      const validPacks = await this.#collectValidPacks(type);

      if (!validPacks || validPacks.size === 0) {
        ui.notifications.warn('hm.settings.custom-compendiums.no-valid-packs', { localize: true });
        return false;
      }

      const selectedPacks = game.settings.get(HM.ID, `${type}Packs`) || [];
      const result = await this.#renderCompendiumDialog(type, validPacks, selectedPacks);
      return !!result;
    } catch (error) {
      HM.log(1, `Error managing ${type} compendium:`, error);
      ui.notifications.error(`hm.settings.custom-compendiums.error-managing-${type}`, { localize: true });
      return false;
    }
  }

  /**
   * Form submission handler for compendium configuration
   * @async
   * @param {Event} _event - The form submission event
   * @param {HTMLFormElement} _form - The form element
   * @param {FormDataExtended} _formData - The processed form data
   * @returns {Promise<boolean>} Whether the settings were successfully saved
   */
  static async formHandler(_event, _form, _formData) {
    const types = ['class', 'race', 'background', 'item'];
    const settingsUpdates = [];
    const changedSettings = {};

    try {
      // Prepare all settings updates
      for (const type of types) {
        try {
          const validPacks = await CustomCompendiums.#collectValidPacks(type, false);
          const selectedPacks = game.settings.get(HM.ID, `${type}Packs`) || [];
          const validSelectedPacks = selectedPacks.filter((packId) => Array.from(validPacks).some((pack) => pack.packId === packId));

          settingsUpdates.push({ type, packs: validSelectedPacks });
        } catch (error) {
          HM.log(1, `Error processing ${type} packs:`, error);
        }
      }

      // Apply all valid updates
      let successCount = 0;
      for (const update of settingsUpdates) {
        try {
          // Compare against the original values stored in CustomCompendiums.PACKS
          const originalValue = CustomCompendiums.PACKS[update.type];

          // Check if the setting actually changed from the original value
          if (JSON.stringify(originalValue) !== JSON.stringify(update.packs)) {
            game.settings.set(HM.ID, `${update.type}Packs`, update.packs);
            changedSettings[`${update.type}Packs`] = true;
            successCount++;
          }
        } catch (error) {
          HM.log(1, `Failed to update ${update.type} pack settings:`, error);
        }
      }

      if (successCount > 0) {
        // Handle reloads and re-renders based on what changed
        if (needsReload(changedSettings)) {
          HM.reloadConfirm({ world: true });
        } else if (needsRerender(changedSettings)) {
          rerenderHM();
        }

        ui.notifications.info('hm.settings.custom-compendiums.form-saved', { localize: true });
        return true;
      } else {
        throw new Error('No compendium settings were successfully updated');
      }
    } catch (error) {
      HM.log(1, 'Error in form submission:', error);
      ui.notifications.error('hm.settings.custom-compendiums.error-saving', { localize: true });
      return false;
    } finally {
      CustomCompendiums.#validPacksCache.clear();
    }
  }

  /* -------------------------------------------- */
  /*  Static Private Methods                      */
  /* -------------------------------------------- */

  /**
   * Collects valid packs of a specified type from available compendiums.
   * @async
   * @param {string} type - The type of documents to collect
   * @param {boolean} [useCache=true] - Whether to use cached results
   * @returns {Promise<Set>} A set of valid pack objects
   * @private
   */
  static async #collectValidPacks(type, useCache = true) {
    if (!type || !['class', 'race', 'background', 'item'].includes(type)) {
      throw new Error(`Invalid document type: ${type}`);
    }

    if (useCache && this.#validPacksCache.has(type)) {
      return this.#validPacksCache.get(type);
    }

    const validPacks = new Set();
    const processingErrors = [];

    HM.log(3, `Collecting valid ${type} packs from available compendiums`);

    for (const pack of game.packs) {
      if (pack.metadata.type !== 'Item') continue;

      // Skip CPR compendiums - they contain stub documents
      if (HM.COMPAT.CPR) {
        if (pack.metadata.id.includes('chris-premades') || pack.metadata.packageName === 'chris-premades') {
          HM.log(3, `Skipping CPR pack: ${pack.metadata.label}`);
          continue;
        }
      }

      try {
        const index = await pack.getIndex();
        let hasValidDocs = false;

        if (type === 'item') {
          hasValidDocs = index.some((doc) => !this.EXCLUDED_TYPES.includes(doc.type));
        } else {
          hasValidDocs = index.some((doc) => doc.type === type);
        }

        if (hasValidDocs) {
          validPacks.add({
            packName: pack.metadata.label,
            packId: pack.metadata.id,
            type: pack.metadata.type
          });
          HM.log(3, `Found valid ${type} pack: ${pack.metadata.label}`);
        }
      } catch (error) {
        const errorMsg = `Failed to retrieve index from pack ${pack.metadata.label}: ${error.message}`;
        processingErrors.push(errorMsg);
        HM.log(1, errorMsg, error);
      }
    }

    HM.log(3, `Found ${validPacks.size} valid ${type} packs`);

    if (processingErrors.length > 0) {
      HM.log(2, `Encountered ${processingErrors.length} errors while processing compendium packs`);
    }

    this.#validPacksCache.set(type, validPacks);
    return validPacks;
  }

  /**
   * Prepares data for the compendium selection dialog template
   * @param {Set} validPacks - Set of valid pack objects
   * @param {Array<string>} selectedPacks - Array of currently selected pack IDs
   * @returns {Object} Data object for the template
   * @private
   */
  static #prepareCompendiumDialogData(validPacks, selectedPacks) {
    const validPacksArray = Array.from(validPacks);
    const selectedPacksSet = new Set(selectedPacks);

    // Group packs by source
    const sourceGroups = new Map();
    validPacksArray.forEach((pack) => {
      const source = pack.packId.split('.')[0];
      const isSelected = selectedPacksSet.has(pack.packId);

      if (!sourceGroups.has(source)) {
        sourceGroups.set(source, {
          name: this.#formatSourceName(source),
          packs: [],
          allSelected: true
        });
      }

      const group = sourceGroups.get(source);
      group.packs.push({ value: pack.packId, label: pack.packName, selected: isSelected });

      if (!isSelected) group.allSelected = false;
    });

    // Check if all packs are selected
    const allSelected = validPacksArray.every((pack) => selectedPacksSet.has(pack.packId));

    return {
      sourceGroups: Object.fromEntries(sourceGroups),
      allSelected
    };
  }

  /**
   * Renders a dialog for selecting compendium packs using a template
   * @async
   * @param {string} type - The type of compendium
   * @param {Set} validPacks - Set of valid pack objects
   * @param {Array<string>} selectedPacks - Array of currently selected pack IDs
   * @returns {Promise<DialogV2|null>} The rendered dialog or null if rendering failed
   * @private
   */
  static async #renderCompendiumDialog(type, validPacks, selectedPacks) {
    try {
      // Prepare dialog data
      const dialogData = this.#prepareCompendiumDialogData(validPacks, selectedPacks);

      // Render template
      const content = await renderTemplate(this.DIALOG_TEMPLATE, dialogData);

      // Create dialog configuration
      const dialogConfig = {
        window: {
          title: game.i18n.format('hm.settings.custom-compendiums.title', {
            type: this.#getLocalizedTypeName(type)
          }),
          icon: this.#getCompendiumTypeIcon(type)
        },
        content: content,
        classes: ['hm-compendiums-popup-dialog'],
        buttons: [this.#createDialogDoneButton(type)],
        rejectClose: false,
        modal: false,
        position: { width: 'auto', height: 'auto' }
      };

      // Render dialog
      const dialog = new DialogV2(dialogConfig);
      const rendered = await dialog.render(true);

      // Set up event listeners
      this.#setupCompendiumDialogListeners(rendered.element);
      return rendered;
    } catch (error) {
      HM.log(1, `Error rendering compendium dialog for ${type}:`, error);
      ui.notifications.error('hm.settings.custom-compendiums.dialog-error', { localize: true });
      return null;
    }
  }

  /**
   * Sets up event listeners for compendium dialog checkboxes
   * @param {HTMLElement} element - The dialog's DOM element
   * @returns {void}
   * @private
   */
  static #setupCompendiumDialogListeners(element) {
    // Cache frequently used selectors
    const allItemCheckboxes = element.querySelectorAll('input[name="compendiumMultiSelect"]');
    const globalSelectAll = element.querySelector('.hm-select-all-global');
    const groupSelectAlls = element.querySelectorAll('.hm-select-all');

    // Global "Select All" checkbox
    if (globalSelectAll) {
      globalSelectAll.addEventListener('change', (event) => {
        const isChecked = event.target.checked;
        allItemCheckboxes.forEach((input) => (input.checked = isChecked));
        groupSelectAlls.forEach((input) => (input.checked = isChecked));
      });
    }

    // Group "Select All" checkboxes
    groupSelectAlls.forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const source = event.target.dataset.source;
        const isChecked = event.target.checked;
        const sourceCheckboxes = element.querySelectorAll(`input[data-source="${source}"][name="compendiumMultiSelect"]`);
        sourceCheckboxes.forEach((input) => (input.checked = isChecked));
        this.#updateGlobalSelectAll(element, allItemCheckboxes, globalSelectAll);
      });
    });

    // Individual checkboxes
    allItemCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const source = event.target.dataset.source;
        const sourceCheckboxes = element.querySelectorAll(`input[data-source="${source}"][name="compendiumMultiSelect"]`);
        const selectAllCheckbox = element.querySelector(`.hm-select-all[data-source="${source}"]`);

        const allChecked = Array.from(sourceCheckboxes).every((input) => input.checked);
        if (selectAllCheckbox) selectAllCheckbox.checked = allChecked;

        this.#updateGlobalSelectAll(element, allItemCheckboxes, globalSelectAll);
      });
    });
  }

  /**
   * Updates the global "Select All" checkbox state
   * @param {HTMLElement} element - The dialog's DOM element
   * @param {NodeList} [allCheckboxes=null] - Cached NodeList of all checkboxes
   * @param {HTMLElement} [globalSelectAllElement=null] - Cached global select-all element
   * @returns {void}
   * @private
   */
  static #updateGlobalSelectAll(element, allCheckboxes = null, globalSelectAllElement = null) {
    const globalSelectAll = globalSelectAllElement || element.querySelector('.hm-select-all-global');
    if (!globalSelectAll) return;

    const checkboxes = allCheckboxes || element.querySelectorAll('input[name="compendiumMultiSelect"]');
    const allChecked = Array.from(checkboxes).every((input) => input.checked);

    globalSelectAll.checked = allChecked;
  }

  /**
   * Creates the Done button configuration for dialog
   * @param {string} type - Compendium type
   * @returns {Object} Button configuration
   * @private
   */
  static #createDialogDoneButton(type) {
    return {
      action: 'ok',
      label: game.i18n.localize('hm.app.done'),
      icon: 'fas fa-check',
      default: 'true',
      callback: async (event, button) => {
        try {
          const selectedValues = Array.from(button.form.querySelectorAll('input[name="compendiumMultiSelect"]:checked')).map((input) => input.value);

          // If nothing is selected, select all packs
          if (selectedValues.length === 0) {
            const allPackIds = Array.from(this.#validPacksCache.get(type)).map((pack) => pack.packId);
            game.settings.set(HM.ID, `${type}Packs`, allPackIds);

            ui.notifications.info(
              game.i18n.format('hm.settings.custom-compendiums.all-selected', {
                type: game.i18n.localize(`hm.settings.custom-compendiums.${type}`)
              })
            );
          } else {
            game.settings.set(HM.ID, `${type}Packs`, selectedValues);

            ui.notifications.info(
              game.i18n.format('hm.settings.custom-compendiums.saved', {
                type: game.i18n.localize(`hm.settings.custom-compendiums.${type}`)
              })
            );
          }
          return true;
        } catch (error) {
          HM.log(1, `Error saving ${type} compendium selections:`, error);
          ui.notifications.error('hm.settings.custom-compendiums.save-error', { localize: true });
          return false;
        }
      }
    };
  }

  /**
   * Formats source names for better readability
   * @param {string} source - The raw source identifier
   * @returns {string} Formatted source name
   * @private
   */
  static #formatSourceName(source) {
    if (!source || typeof source !== 'string') {
      HM.log(2, `Invalid source name format: ${source}`);
      return 'Unknown Source';
    }

    if (source === 'dnd5e') return 'SRD';

    return source
      .replace('dnd-', '')
      .replace(/-/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Gets the localized name for a compendium type
   * @param {string} type - The type of compendium
   * @returns {string} The localized type name
   * @private
   */
  static #getLocalizedTypeName(type) {
    const localizationKey = `hm.settings.custom-compendiums.types.${type}`;

    if (game.i18n.has(localizationKey)) {
      return game.i18n.localize(localizationKey);
    }

    const directKey = `hm.settings.custom-compendiums.${type}`;
    if (game.i18n.has(directKey)) {
      return game.i18n.localize(directKey);
    }

    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  /**
   * Returns the appropriate icon for the given compendium type
   * @param {string} type - The type of compendium
   * @returns {string} The FontAwesome icon class
   * @private
   */
  static #getCompendiumTypeIcon(type) {
    switch (type) {
      case 'class':
        return 'fa-solid fa-chess-rook';
      case 'race':
        return 'fa-solid fa-feather-alt';
      case 'background':
        return 'fa-solid fa-scroll';
      case 'item':
        return 'fa-solid fa-shield-halved';
      default:
        return 'fa-solid fa-atlas';
    }
  }
}
