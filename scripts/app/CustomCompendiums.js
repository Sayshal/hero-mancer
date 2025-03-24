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
    let selectedPacks = await game.settings.get(HM.ID, `${type}Packs`);

    // If no packs are selected, return empty array
    if (!selectedPacks) {
      return [];
    }

    // Get all available packs that contain valid documents
    const availablePacks = Array.from(validPacks).map((pack) => pack.packId);

    // Filter out any invalid packs
    const validSelectedPacks = selectedPacks.filter((packId) => {
      if (!availablePacks.includes(packId)) {
        HM.log(2, `Removing invalid ${type} compendium pack: ${packId}`);
        return false;
      }
      return true;
    });

    // If all selected packs were invalid, fall back to SRD packs
    if (validSelectedPacks.length === 0) {
      const srdPacks = Array.from(validPacks)
        .filter((pack) => pack.packName.includes('SRD'))
        .map((pack) => pack.packId);

      if (srdPacks.length > 0) {
        HM.log(2, `Falling back to SRD packs for ${type}`);
        await this.setSelectedPacksByType(type, srdPacks);
        return srdPacks;
      }

      // If no SRD packs, use all available packs
      HM.log(2, `No SRD packs found for ${type}, using all available packs`);
      await this.setSelectedPacksByType(type, availablePacks);
      return availablePacks;
    }

    // Update settings to remove invalid packs
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

      CustomCompendiums.#validPacksCache.clear();

      HM.reloadConfirm({ world: true });

      ui.notifications.info('hm.settings.custom-compendiums.form-saved', { localize: true });
    } catch (error) {
      HM.log(1, 'Error in form submission:', error);
      ui.notifications.error('hm.settings.custom-compendiums.error-saving', { localize: true });
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
    // Group packs by source
    const packsBySource = {};

    Array.from(validPacks).forEach((pack) => {
      // Extract source from packId (e.g., "dnd5e.items" -> "dnd5e")
      const source = pack.packId.split('.')[0];
      let sourceName;

      // Handle world source differently
      if (source.toLowerCase() === 'world') {
        sourceName = this.#formatSourceName(pack.packName.split(' ')[0]);
      } else {
        sourceName = this.#formatSourceName(source);
      }

      // Create source group if it doesn't exist
      if (!packsBySource[source]) {
        packsBySource[source] = {
          name: sourceName,
          packs: []
        };
      }

      packsBySource[source].packs.push({
        value: pack.packId,
        label: pack.packName,
        selected: selectedPacks.includes(pack.packId)
      });
    });

    // Add global "Select All" checkbox
    const allSelected = Array.from(validPacks).every((pack) => selectedPacks.includes(pack.packId));
    // Create a DocumentFragment
    const fragment = document.createDocumentFragment();
    const container = document.createElement('div');
    fragment.appendChild(container);

    // Add global header
    const globalHeader = document.createElement('div');
    globalHeader.className = 'hm-compendium-global-header';
    globalHeader.innerHTML = `
  <label class="checkbox">
    <input type="checkbox" class="hm-select-all-global" ${allSelected ? 'checked' : ''}>
    ${game.i18n.localize('hm.settings.custom-compendiums.select-all')}
  </label>
`;
    container.appendChild(globalHeader);

    // Add each source group
    Object.entries(packsBySource).forEach(([source, data]) => {
      const allGroupSelected = data.packs.every((pack) => pack.selected);

      const groupDiv = document.createElement('div');
      groupDiv.className = 'hm-compendium-group';

      // Add divider
      groupDiv.appendChild(document.createElement('hr'));

      // Add group header
      const headerDiv = document.createElement('div');
      headerDiv.className = 'hm-compendium-group-header';
      headerDiv.innerHTML = `
    <label class="checkbox">
      <input type="checkbox" class="hm-select-all" data-source="${source}" ${allGroupSelected ? 'checked' : ''}>
      ${data.name}
    </label>
  `;
      groupDiv.appendChild(headerDiv);

      // Add group items container
      const itemsDiv = document.createElement('div');
      itemsDiv.className = 'hm-compendium-group-items';

      // Add each pack as an item
      data.packs.forEach((pack) => {
        const label = document.createElement('label');
        label.className = 'checkbox hm-compendium-item';
        label.innerHTML = `
      <input type="checkbox" name="compendiumMultiSelect" value="${pack.value}" data-source="${source}" ${pack.selected ? 'checked' : ''}>
      ${pack.label}
    `;
        itemsDiv.appendChild(label);
      });

      groupDiv.appendChild(itemsDiv);
      container.appendChild(groupDiv);
    });

    // Return the HTML string from the fragment
    const content = container.outerHTML;

    const typeIcon = this.#getCompendiumTypeIcon(type);
    // Create dialog
    const dialog = new DialogV2({
      window: { title: game.i18n.format('hm.settings.custom-compendiums.title', { type }), icon: typeIcon },
      content: content,
      classes: ['hm-compendiums-popup-dialog'],
      buttons: [
        {
          action: 'ok',
          label: game.i18n.localize('hm.app.done'),
          icon: 'fas fa-check',
          default: 'true',
          callback: async (event, button, dialog) => {
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

    // Render dialog and set up listeners
    const rendered = await dialog.render(true);
    this.#setupCompendiumDialogListeners(rendered.element);
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
}
