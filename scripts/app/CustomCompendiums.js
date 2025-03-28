import { HM } from '../utils/index.js';

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
      width: '400'
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

  static #validPacksCache = new Map();

  /* -------------------------------------------- */
  /*  Getters                                     */
  /* -------------------------------------------- */

  get title() {
    return `${HM.NAME} | ${game.i18n.localize('hm.settings.custom-compendiums.menu.name')}`;
  }

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Manages the compendium selection and handles validation.
   * @async
   * @param {string} type - The type of compendium to manage (class, race, background, or item)
   * @returns {Promise<boolean>} - Whether the compendium management was successful
   * @throws {Error} If the compendium type is invalid or if no valid packs can be loaded
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

      const selectedPacks = (await game.settings.get(HM.ID, `${type}Packs`)) || [];
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
   * Validates and updates compendium selections for all document types,
   * then prompts for a world reload to apply changes
   * @async
   * @param {Event} _event - The form submission event
   * @param {HTMLFormElement} _form - The form element
   * @param {FormDataExtended} _formData - The processed form data
   * @returns {Promise<boolean>} Whether the settings were successfully saved
   * @static
   */
  static async formHandler(_event, _form, _formData) {
    const types = ['class', 'race', 'background', 'item'];
    const settingsUpdates = [];

    try {
      // Prepare all settings updates
      for (const type of types) {
        try {
          const validPacks = await CustomCompendiums.#collectValidPacks(type, false);
          const selectedPacks = (await game.settings.get(HM.ID, `${type}Packs`)) || [];

          // Filter selected packs to ensure they're valid
          const validSelectedPacks = selectedPacks.filter((packId) => Array.from(validPacks).some((pack) => pack.packId === packId));

          settingsUpdates.push({
            type,
            packs: validSelectedPacks
          });
        } catch (error) {
          HM.log(1, `Error processing ${type} packs:`, error);
          // Continue with other types even if one fails
        }
      }

      // Apply all valid updates
      let successCount = 0;
      for (const update of settingsUpdates) {
        try {
          await game.settings.set(HM.ID, `${update.type}Packs`, update.packs);
          successCount++;
        } catch (error) {
          HM.log(1, `Failed to update ${update.type} pack settings:`, error);
        }
      }

      // If at least some settings were updated, consider it a success
      if (successCount > 0) {
        HM.reloadConfirm({ world: true });
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
   * @throws {Error} If the type is invalid or if compendium access fails
   * @private
   */
  static async #collectValidPacks(type, useCache = true) {
    // Validate input
    if (!type || !['class', 'race', 'background', 'item'].includes(type)) {
      throw new Error(`Invalid document type: ${type}`);
    }

    // Return cached results if available
    if (useCache && this.#validPacksCache.has(type)) {
      return this.#validPacksCache.get(type);
    }

    const validPacks = new Set();
    const processingErrors = [];

    // Log processing start
    HM.log(3, `Collecting valid ${type} packs from available compendiums`);

    // Process each pack
    for (const pack of game.packs) {
      if (pack.metadata.type !== 'Item') continue;

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

    // Log results summary
    HM.log(3, `Found ${validPacks.size} valid ${type} packs`);

    // Report errors if any
    if (processingErrors.length > 0) {
      HM.log(2, `Encountered ${processingErrors.length} errors while processing compendium packs`);
    }

    // Cache and return results
    this.#validPacksCache.set(type, validPacks);
    return validPacks;
  }

  /**
   * Renders a dialog for selecting compendium packs with grouped organization
   * @async
   * @param {string} type - The type of compendium ('class', 'race', 'background', 'item')
   * @param {Set} validPacks - Set of valid pack objects
   * @param {Array<string>} selectedPacks - Array of currently selected pack IDs
   * @returns {Promise<DialogV2|null>} The rendered dialog or null if rendering failed
   * @private
   */
  static async #renderCompendiumDialog(type, validPacks, selectedPacks) {
    try {
      // Prepare dialog data
      const dialogData = this.#prepareCompendiumDialogData(validPacks, selectedPacks);

      // Generate dialog content
      const contentHTML = this.#generateCompendiumDialogContent(dialogData);

      // Create dialog configuration
      const dialogConfig = this.#createCompendiumDialogConfig(type, contentHTML);

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
   * Prepares data structure for compendium dialog
   * @param {Set} validPacks - Set of valid pack objects
   * @param {Array<string>} selectedPacks - Array of currently selected pack IDs
   * @returns {Object} Prepared dialog data
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
      sourceGroups,
      allSelected
    };
  }

  /**
   * Generates HTML content for compendium dialog
   * @param {Object} dialogData - Prepared dialog data
   * @returns {string} HTML content for dialog
   * @private
   */
  static #generateCompendiumDialogContent(dialogData) {
    const { sourceGroups, allSelected } = dialogData;

    // Create container
    const container = document.createElement('div');

    // Create global header with "Select All" checkbox
    container.appendChild(this.#createGlobalHeader(allSelected));

    // Add each source group
    for (const [source, group] of sourceGroups) {
      container.appendChild(this.#createSourceGroup(source, group));
    }

    return container.outerHTML;
  }

  /**
   * Creates global header with Select All checkbox
   * @param {boolean} allSelected - Whether all items are selected
   * @returns {HTMLElement} Global header element
   * @private
   */
  static #createGlobalHeader(allSelected) {
    const globalHeader = document.createElement('div');
    globalHeader.className = 'hm-compendium-global-header';

    const globalLabel = document.createElement('label');
    globalLabel.className = 'checkbox';

    const globalCheckbox = document.createElement('input');
    globalCheckbox.type = 'checkbox';
    globalCheckbox.className = 'hm-select-all-global';
    globalCheckbox.checked = allSelected;

    globalLabel.append(globalCheckbox, game.i18n.localize('hm.settings.custom-compendiums.select-all'));
    globalHeader.appendChild(globalLabel);

    return globalHeader;
  }

  /**
   * Creates a source group element
   * @param {string} source - Source identifier
   * @param {Object} group - Group data
   * @returns {HTMLElement} Source group element
   * @private
   */
  static #createSourceGroup(source, group) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'hm-compendium-group';

    // Add separator
    groupDiv.appendChild(document.createElement('hr'));

    // Create group header with "Select All" checkbox
    const groupHeader = document.createElement('div');
    groupHeader.className = 'hm-compendium-group-header';

    const groupLabel = document.createElement('label');
    groupLabel.className = 'checkbox';

    const groupCheckbox = document.createElement('input');
    groupCheckbox.type = 'checkbox';
    groupCheckbox.className = 'hm-select-all';
    groupCheckbox.dataset.source = source;
    groupCheckbox.checked = group.allSelected;

    groupLabel.append(groupCheckbox, group.name);
    groupHeader.appendChild(groupLabel);
    groupDiv.appendChild(groupHeader);

    // Create group items container
    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'hm-compendium-group-items';

    // Add each pack checkbox
    for (const pack of group.packs) {
      itemsContainer.appendChild(this.#createPackCheckbox(pack, source));
    }

    groupDiv.appendChild(itemsContainer);
    return groupDiv;
  }

  /**
   * Creates a pack checkbox element
   * @param {Object} pack - Pack data
   * @param {string} source - Source identifier
   * @returns {HTMLElement} Pack checkbox element
   * @private
   */
  static #createPackCheckbox(pack, source) {
    const itemLabel = document.createElement('label');
    itemLabel.className = 'checkbox hm-compendium-item';

    const itemCheckbox = document.createElement('input');
    itemCheckbox.type = 'checkbox';
    itemCheckbox.name = 'compendiumMultiSelect';
    itemCheckbox.value = pack.value;
    itemCheckbox.dataset.source = source;
    itemCheckbox.checked = pack.selected;

    itemLabel.append(itemCheckbox, pack.label);
    return itemLabel;
  }

  /**
   * Creates dialog configuration
   * @param {string} type - Compendium type
   * @param {string} contentHTML - Dialog content HTML
   * @returns {Object} Dialog configuration
   * @private
   */
  static #createCompendiumDialogConfig(type, contentHTML) {
    return {
      window: {
        title: game.i18n.format('hm.settings.custom-compendiums.title', { type }),
        icon: this.#getCompendiumTypeIcon(type)
      },
      content: contentHTML,
      classes: ['hm-compendiums-popup-dialog'],
      buttons: [this.#createDialogDoneButton(type)],
      rejectClose: false,
      modal: false,
      position: { width: 'auto' }
    };
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
            await game.settings.set(HM.ID, `${type}Packs`, allPackIds);

            ui.notifications.info(
              game.i18n.format('hm.settings.custom-compendiums.all-selected', {
                type: game.i18n.localize(`hm.settings.custom-compendiums.${type}`)
              })
            );
          } else {
            await game.settings.set(HM.ID, `${type}Packs`, selectedValues);

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
   * @throws {Error} If source is invalid or empty
   * @private
   */
  static #formatSourceName(source) {
    // Validate input
    if (!source || typeof source !== 'string') {
      HM.log(2, `Invalid source name format: ${source}`);
      return 'Unknown Source';
    }

    // Handle special cases
    if (source === 'dnd5e') return 'SRD';

    // Process regular source names
    return source
      .replace('dnd-', '')
      .replace(/-/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
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

        // Update all checkboxes
        allItemCheckboxes.forEach((input) => {
          input.checked = isChecked;
        });

        // Update all group "select all" checkboxes
        groupSelectAlls.forEach((input) => {
          input.checked = isChecked;
        });
      });
    }

    // Group "Select All" checkboxes
    groupSelectAlls.forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const source = event.target.dataset.source;
        const isChecked = event.target.checked;

        // Get all checkboxes for this source (cache the NodeList for better performance)
        const sourceCheckboxes = element.querySelectorAll(`input[data-source="${source}"][name="compendiumMultiSelect"]`);

        // Update all checkboxes in this group
        sourceCheckboxes.forEach((input) => {
          input.checked = isChecked;
        });

        // Update global "select all" checkbox
        this.#updateGlobalSelectAll(element, allItemCheckboxes, globalSelectAll);
      });
    });

    // Individual checkboxes
    allItemCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const source = event.target.dataset.source;

        // Get all checkboxes and select-all for this source (cache the selectors)
        const sourceCheckboxes = element.querySelectorAll(`input[data-source="${source}"][name="compendiumMultiSelect"]`);
        const selectAllCheckbox = element.querySelector(`.hm-select-all[data-source="${source}"]`);

        // Check if all source checkboxes are checked
        const allChecked = Array.from(sourceCheckboxes).every((input) => input.checked);

        // Update group select-all checkbox
        if (selectAllCheckbox) {
          selectAllCheckbox.checked = allChecked;
        }

        // Update global "select all" checkbox
        this.#updateGlobalSelectAll(element, allItemCheckboxes, globalSelectAll);
      });
    });
  }

  /**
   * Updates the global "Select All" checkbox state based on individual checkbox states
   * @param {HTMLElement} element - The dialog's DOM element
   * @param {NodeList} [allCheckboxes=null] - Cached NodeList of all checkboxes for better performance
   * @param {HTMLElement} [globalSelectAllElement=null] - Cached global select-all element
   * @returns {void}
   * @private
   */
  static #updateGlobalSelectAll(element, allCheckboxes = null, globalSelectAllElement = null) {
    // Use cached elements if provided, otherwise query the DOM
    const globalSelectAll = globalSelectAllElement || element.querySelector('.hm-select-all-global');
    if (!globalSelectAll) return;

    const checkboxes = allCheckboxes || element.querySelectorAll('input[name="compendiumMultiSelect"]');
    const allChecked = Array.from(checkboxes).every((input) => input.checked);

    globalSelectAll.checked = allChecked;
  }

  /**
   * Returns the appropriate FontAwesome icon class for the given compendium type
   * @param {string} type - The type of compendium ('class', 'race', 'background', 'item')
   * @returns {string} The FontAwesome icon class
   * @static
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
