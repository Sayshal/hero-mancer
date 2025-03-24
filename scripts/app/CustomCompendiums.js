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
   * @param {string} type The type of compendium to manage (class, race, or background)
   */
  static async manageCompendium(type) {
    const validPacks = await this.#collectValidPacks(type);

    if (validPacks.size === 0) {
      ui.notifications.warn('hm.settings.custom-compendiums.no-valid-packs', { localize: true });
      return;
    }

    const selectedPacks = await this.getSelectedPacksByType(type, validPacks);
    await this.#renderCompendiumDialog(type, validPacks, selectedPacks);
  }

  /**
   * Retrieves and validates the selected compendium packs for the given type, with fallback handling.
   * If selected packs are invalid or missing, attempts to fall back to SRD packs or all available packs.
   * @async
   * @param {string} type The type of compendium ('class', 'race', or 'background').
   * @param {Set} validPacks Set of valid pack objects containing packId and packName.
   * @returns {Promise<Array<string>>} A promise that resolves to an array of valid pack IDs.
   * If no valid packs are found, falls back to SRD packs or all available packs.
   * @throws {Error} Throws an error if type parameter is invalid.
   */
  static async getSelectedPacksByType(type, validPacks) {
    // Create a lookup map for faster validation
    const availablePackIds = new Set(Array.from(validPacks).map((pack) => pack.packId));

    // Get current settings
    const selectedPacks = (await game.settings.get(HM.ID, `${type}Packs`)) || [];

    // Handle empty selection case
    if (!selectedPacks.length) {
      return [];
    }

    // Filter valid packs
    const validSelectedPacks = selectedPacks.filter((packId) => {
      const isValid = availablePackIds.has(packId);
      if (!isValid) {
        HM.log(2, `Removing invalid ${type} compendium pack: ${packId}`);
      }
      return isValid;
    });

    // Handle case where all selected packs were invalid
    if (validSelectedPacks.length === 0) {
      return this.#handleEmptySelection(type, validPacks);
    }

    // Update settings if needed
    if (validSelectedPacks.length !== selectedPacks.length) {
      await this.setSelectedPacksByType(type, validSelectedPacks);
    }

    return validSelectedPacks;
  }

  /**
   * Saves the selected packs for the given type.
   * @async
   * @param {string} type The type of compendium.
   * @param {Array} selectedValues Array of selected pack IDs.
   */
  static async setSelectedPacksByType(type, selectedValues) {
    await game.settings.set(HM.ID, `${type}Packs`, selectedValues);
  }

  /**
   * Form submission handler for compendium configuration
   * Validates and updates compendium selections for all document types,
   * then prompts for a world reload to apply changes
   * @async
   * @param {Event} _event - The form submission event
   * @param {HTMLFormElement} _form - The form element
   * @param {FormDataExtended} _formData - The processed form data
   * @returns {Promise<void>}
   * @static
   */
  static async formHandler(_event, _form, _formData) {
    const types = ['class', 'race', 'background', 'item'];

    try {
      const packPromises = types.map((type) => CustomCompendiums.#collectValidPacks(type, false));
      const validPacks = await Promise.all(packPromises);
      const validPacksMap = new Map(types.map((type, index) => [type, validPacks[index]]));

      // Then update the settings
      const settingPromises = types.map((type) => {
        const packs = validPacksMap.get(type);
        return CustomCompendiums.getSelectedPacksByType(type, packs).then((selectedPacks) => game.settings.set(HM.ID, `${type}Packs`, selectedPacks));
      });
      await Promise.all(settingPromises);

      HM.reloadConfirm({ world: true });

      ui.notifications.info('hm.settings.custom-compendiums.form-saved', { localize: true });
    } catch (error) {
      HM.log(1, 'Error in form submission:', error);
      ui.notifications.error('hm.settings.custom-compendiums.error-saving', { localize: true });
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
   * @param {string} type The type of documents to collect
   * @param {boolean} useCache Whether to use cached results
   * @returns {Promise<Set>} A set of valid pack objects
   * @private
   */
  static async #collectValidPacks(type, useCache = true) {
    if (useCache && this.#validPacksCache.has(type)) {
      return this.#validPacksCache.get(type);
    }

    const validPacks = new Set();
    const failures = [];

    const indexPromises = game.packs.map(async (pack) => {
      if (pack.metadata.type !== 'Item') return;

      try {
        const index = await pack.getIndex();

        if (type === 'item') {
          const validDocs = index.filter((doc) => !this.EXCLUDED_TYPES.includes(doc.type));
          if (validDocs.length > 0) {
            validPacks.add({
              packName: pack.metadata.label,
              packId: pack.metadata.id,
              type: pack.metadata.type
            });
          }
        } else {
          const typeDocuments = index.filter((doc) => doc.type === type);
          if (typeDocuments.length > 0) {
            validPacks.add({
              packName: pack.metadata.label,
              packId: pack.metadata.id,
              type: pack.metadata.type
            });
          }
        }
      } catch (error) {
        HM.log(1, `Failed to retrieve index from pack ${pack.metadata.label}:`, error);
        failures.push(pack.metadata.label);
      }
    });

    await Promise.all(indexPromises);

    if (failures.length > 0) {
      HM.log(2, `Failed to retrieve indices from ${failures.length} packs.`);
    }

    return validPacks;
  }

  /**
   * Renders a dialog for selecting compendium packs with grouped organization
   * @async
   * @param {string} type - The type of compendium ('class', 'race', 'background', 'item')
   * @param {Set} validPacks - Set of valid pack objects
   * @param {Array<string>} selectedPacks - Array of currently selected pack IDs
   * @returns {Promise<void>}
   * @private
   */
  static async #renderCompendiumDialog(type, validPacks, selectedPacks) {
    const validPacksArray = Array.from(validPacks);
    const selectedPacksSet = new Set(selectedPacks);

    // Group packs by source
    const sourceGroups = this.#groupPacksBySource(validPacksArray, selectedPacksSet);

    // Generate the HTML content
    const content = this.#generateDialogHTML(sourceGroups, validPacksArray, selectedPacksSet);

    // Create and show the dialog
    const dialog = await this.#createCompendiumDialog(type, content);

    // Setup event listeners
    this.#setupCompendiumDialogListeners(dialog.element);
  }

  /**
   * Groups compendium packs by their source for organized display
   * @param {Array<object>} packs - Array of pack objects from validPacks
   * @param {Set<string>} selectedPacksSet - Set of currently selected pack IDs for fast lookup
   * @returns {Map<string, object>} Map where keys are source IDs and values are objects containing:
   *   - name {string} Formatted display name of the source
   *   - packs {Array<object>} Array of pack objects with value, label, and selected properties
   *   - allSelected {boolean} Whether all packs in this source are selected
   * @private
   */
  static #groupPacksBySource(packs, selectedPacksSet) {
    const sourceGroups = new Map();

    packs.forEach((pack) => {
      const source = pack.packId.split('.')[0];
      const isSelected = selectedPacksSet.has(pack.packId);

      if (!sourceGroups.has(source)) {
        sourceGroups.set(source, {
          name: this.#formatSourceName(source.toLowerCase() === 'world' ? pack.packName.split(' ')[0] : source),
          packs: [],
          allSelected: true
        });
      }

      const group = sourceGroups.get(source);
      group.packs.push({ value: pack.packId, label: pack.packName, selected: isSelected });

      if (!isSelected) group.allSelected = false;
    });

    return sourceGroups;
  }

  /**
   * Generates the complete HTML content for the compendium selection dialog
   * @param {Map<string, object>} sourceGroups - Map of source groups from #groupPacksBySource
   * @param {Array<object>} packs - Original array of pack objects from validPacks
   * @param {Set<string>} selectedPacksSet - Set of currently selected pack IDs
   * @returns {string} Complete HTML string for the dialog content
   * @private
   */
  static #generateDialogHTML(sourceGroups, packs, selectedPacksSet) {
    // Check if all packs are selected
    const allSelected = packs.every((pack) => selectedPacksSet.has(pack.packId));

    // Create header with "Select All" checkbox
    let html = `
    <div>
      <div class="hm-compendium-global-header">
        <label class="checkbox">
          <input type="checkbox" class="hm-select-all-global" ${allSelected ? 'checked' : ''}>
          ${game.i18n.localize('hm.settings.custom-compendiums.select-all')}
        </label>
      </div>
  `;

    // Add each source group
    for (const [source, group] of sourceGroups) {
      html += this.#renderSourceGroup(source, group);
    }

    return `${html}</div>`;
  }

  /**
   * Renders HTML for a single source group with its packs
   * @param {string} source - Source identifier (e.g., "dnd5e", "world")
   * @param {object} group - Source group object containing:
   *   - name {string} Formatted display name of the source
   *   - packs {Array<object>} Array of pack objects with value, label, and selected properties
   *   - allSelected {boolean} Whether all packs in this source are selected
   * @returns {string} HTML string for the source group
   * @private
   */
  static #renderSourceGroup(source, group) {
    return `
    <div class="hm-compendium-group">
      <hr>
      <div class="hm-compendium-group-header">
        <label class="checkbox">
          <input type="checkbox" class="hm-select-all" data-source="${source}" ${group.allSelected ? 'checked' : ''}>
          ${group.name}
        </label>
      </div>
      <div class="hm-compendium-group-items">
        ${group.packs
          .map(
            (pack) => `
          <label class="checkbox hm-compendium-item">
            <input type="checkbox" name="compendiumMultiSelect" value="${pack.value}"
                   data-source="${source}" ${pack.selected ? 'checked' : ''}>
            ${pack.label}
          </label>
        `
          )
          .join('')}
      </div>
    </div>
  `;
  }

  /**
   * Creates and renders the dialog for compendium pack selection
   * @param {string} type - The type of compendium being configured ('class', 'race', 'background', 'item')
   * @param {string} content - HTML content string for the dialog body
   * @returns {Promise<DialogV2>} Promise that resolves to the rendered dialog
   * @private
   */
  static async #createCompendiumDialog(type, content) {
    const dialog = new DialogV2({
      window: {
        title: game.i18n.format('hm.settings.custom-compendiums.title', { type }),
        icon: this.#getCompendiumTypeIcon(type)
      },
      content,
      classes: ['hm-compendiums-popup-dialog'],
      buttons: [
        {
          action: 'ok',
          label: game.i18n.localize('hm.app.done'),
          icon: 'fas fa-check',
          default: 'true',
          callback: async (event, button) => {
            const selectedValues = Array.from(button.form.querySelectorAll('input[name="compendiumMultiSelect"]:checked')).map((input) => input.value);

            await this.setSelectedPacksByType(type, selectedValues);

            ui.notifications.info(
              game.i18n.format('hm.settings.custom-compendiums.saved', {
                type: game.i18n.localize(`hm.settings.custom-compendiums.${type}`)
              })
            );
          }
        }
      ],
      rejectClose: false,
      modal: false,
      position: { width: 400 }
    });

    return dialog.render(true);
  }

  /**
   * Formats source names for better readability
   * @param {string} source - The raw source identifier
   * @returns {string} Formatted source name
   * @private
   */
  static #formatSourceName(source) {
    // Handle common source naming patterns
    return source
      .replace('dnd-', '')
      .replace('dnd5e', 'SRD')
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
    // Global "Select All" checkbox
    const globalSelectAll = element.querySelector('.hm-select-all-global');
    if (globalSelectAll) {
      globalSelectAll.addEventListener('change', (event) => {
        const isChecked = event.target.checked;

        // Update all checkboxes
        element.querySelectorAll('input[name="compendiumMultiSelect"]').forEach((input) => {
          input.checked = isChecked;
        });

        // Update all group "select all" checkboxes
        element.querySelectorAll('.hm-select-all').forEach((input) => {
          input.checked = isChecked;
        });
      });
    }

    // Group "Select All" checkboxes
    element.querySelectorAll('.hm-select-all').forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const source = event.target.dataset.source;
        const isChecked = event.target.checked;

        // Update all checkboxes in this group
        element.querySelectorAll(`input[data-source="${source}"][name="compendiumMultiSelect"]`).forEach((input) => {
          input.checked = isChecked;
        });

        // Update global "select all" checkbox
        this.#updateGlobalSelectAll(element);
      });
    });

    // Individual checkboxes
    element.querySelectorAll('input[name="compendiumMultiSelect"]').forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const source = event.target.dataset.source;

        // Update group "select all" checkbox
        const sourceCheckboxes = element.querySelectorAll(`input[data-source="${source}"][name="compendiumMultiSelect"]`);
        const selectAllCheckbox = element.querySelector(`.hm-select-all[data-source="${source}"]`);

        const allChecked = Array.from(sourceCheckboxes).every((input) => input.checked);
        selectAllCheckbox.checked = allChecked;

        // Update global "select all" checkbox
        this.#updateGlobalSelectAll(element);
      });
    });
  }

  /**
   * Updates the global "Select All" checkbox state based on individual checkbox states
   * @param {HTMLElement} element - The dialog's DOM element
   * @returns {void}
   * @private
   */
  static #updateGlobalSelectAll(element) {
    const globalSelectAll = element.querySelector('.hm-select-all-global');
    if (globalSelectAll) {
      const allCheckboxes = element.querySelectorAll('input[name="compendiumMultiSelect"]');
      const allChecked = Array.from(allCheckboxes).every((input) => input.checked);
      globalSelectAll.checked = allChecked;
    }
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

  /**
   * Handles empty selection case by finding appropriate fallback packs
   * First attempts to use SRD packs, then falls back to all available packs if needed
   * @param {string} type - The type of compendium ('class', 'race', 'background', 'item')
   * @param {Set<object>} validPacks - Set of valid pack objects
   * @returns {Promise<Array<string>>} Array of fallback pack IDs that will be used
   * @private
   */
  static async #handleEmptySelection(type, validPacks) {
    // Try SRD packs first
    const packsArray = Array.from(validPacks);
    const srdPacks = packsArray.filter((pack) => pack.packName.includes('SRD')).map((pack) => pack.packId);

    if (srdPacks.length > 0) {
      HM.log(2, `Falling back to SRD packs for ${type}`);
      await this.setSelectedPacksByType(type, srdPacks);
      return srdPacks;
    }

    // If no SRD packs, use all available packs
    const allPacks = packsArray.map((pack) => pack.packId);
    HM.log(2, `No SRD packs found for ${type}, using all available packs`);
    await this.setSelectedPacksByType(type, allPacks);
    return allPacks;
  }
}
