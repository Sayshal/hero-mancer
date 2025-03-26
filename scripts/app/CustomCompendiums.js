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

    const selectedPacks = (await game.settings.get(HM.ID, `${type}Packs`)) || [];
    await this.#renderCompendiumDialog(type, validPacks, selectedPacks);
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
      // Update settings for all types
      for (const type of types) {
        const validPacks = await CustomCompendiums.#collectValidPacks(type, false);
        const selectedPacks = (await game.settings.get(HM.ID, `${type}Packs`)) || [];

        // Filter selected packs to ensure they're valid
        const validSelectedPacks = selectedPacks.filter((packId) => Array.from(validPacks).some((pack) => pack.packId === packId));

        await game.settings.set(HM.ID, `${type}Packs`, validSelectedPacks);
      }

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
        }
      } catch (error) {
        HM.log(1, `Failed to retrieve index from pack ${pack.metadata.label}:`, error);
      }
    }

    this.#validPacksCache.set(type, validPacks);
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

    // Generate content HTML
    let content = `
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
      content += `
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

    content += '</div>';

    // Create and render dialog
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

            // If nothing is selected, select all packs
            if (selectedValues.length === 0) {
              const allPackIds = Array.from(validPacks).map((pack) => pack.packId);
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
          }
        }
      ],
      rejectClose: false,
      modal: false,
      position: { width: 400 }
    });

    const rendered = await dialog.render(true);
    this.#setupCompendiumDialogListeners(rendered.element);
    return rendered;
  }

  /**
   * Formats source names for better readability
   * @param {string} source - The raw source identifier
   * @returns {string} Formatted source name
   * @private
   */
  static #formatSourceName(source) {
    return source === 'dnd5e' ? 'SRD' : (
        source
          .replace('dnd-', '')
          .replace(/-/g, ' ')
          .split(' ')
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
      );
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
