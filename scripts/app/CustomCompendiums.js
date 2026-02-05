import { HM, MODULE, needsReload, needsRerender, rerenderHM } from '../utils/index.js';
import { log } from '../utils/logger.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Compendium selection settings application. */
export class CustomCompendiums extends HandlebarsApplicationMixin(ApplicationV2) {
  static EXCLUDED_TYPES = ['class', 'race', 'background', 'npc', 'character', 'subclass', 'rolltable', 'journal'];

  static DEFAULT_OPTIONS = {
    id: 'hero-mancer-settings-custom-compendiums',
    classes: ['hm-app', 'hm-compendiums-settings'],
    tag: 'form',
    form: {
      handler: CustomCompendiums.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    position: { height: 'auto', width: 'auto' },
    window: { icon: 'fa-solid fa-atlas', resizable: false }
  };

  static PARTS = {
    form: { template: 'modules/hero-mancer/templates/settings/custom-compendiums.hbs', id: 'body' },
    footer: { template: 'modules/hero-mancer/templates/settings/settings-footer.hbs', id: 'footer', classes: ['hm-compendiums-footer'] }
  };

  static #validPacksCache = new Map();

  static PACKS = { class: [], background: [], race: [], item: [] };

  static TYPES = [
    { type: 'class', label: 'hm.settings.custom-compendiums.class', icon: 'fa-solid fa-chess-rook', settingKey: 'classPacks' },
    { type: 'race', label: 'hm.settings.custom-compendiums.race', icon: 'fa-solid fa-feather-alt', settingKey: 'racePacks' },
    { type: 'background', label: 'hm.settings.custom-compendiums.background', icon: 'fa-solid fa-scroll', settingKey: 'backgroundPacks' },
    { type: 'item', label: 'hm.settings.custom-compendiums.item', icon: 'fa-solid fa-shield-halved', settingKey: 'itemPacks' }
  ];

  /** @returns {string} Window title */
  get title() {
    return `${MODULE.NAME} | ${game.i18n.localize('hm.settings.custom-compendiums.menu.name')}`;
  }

  /** Load saved pack selections on first render. */
  _onFirstRender() {
    for (const { type, settingKey } of CustomCompendiums.TYPES) {
      CustomCompendiums.PACKS[type] = game.settings.get(MODULE.ID, settingKey);
    }
  }

  /**
   * Prepare context data for the inline compendium grid.
   * @returns {Promise<object>} Template context data
   */
  async _prepareContext() {
    const columns = [];
    for (const { type, label, icon, settingKey } of CustomCompendiums.TYPES) {
      const validPacks = await CustomCompendiums.#collectValidPacks(type);
      const selectedPacks = game.settings.get(MODULE.ID, settingKey) || [];
      const dialogData = CustomCompendiums.#prepareCompendiumDialogData(validPacks, selectedPacks);
      columns.push({ type, label: game.i18n.localize(label), icon, sourceGroups: dialogData.sourceGroups });
    }
    return { columns };
  }

  /**
   * Set up select-all checkbox listeners after render.
   * @param {object} context - The render context
   * @param {object} options - The render options
   */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#setupCheckboxListeners(this.element);
  }

  /**
   * Form submission handler for compendium configuration.
   * @param {Event} _event - The form submission event
   * @param {HTMLFormElement} form - The form element
   * @param {object} _formData - The processed form data
   * @returns {Promise<boolean>} Whether the form was submitted successfully
   */
  static async formHandler(_event, form, _formData) {
    const changedSettings = {};
    let successCount = 0;
    try {
      for (const { type, settingKey } of CustomCompendiums.TYPES) {
        const checked = Array.from(form.querySelectorAll(`input[name="${settingKey}"]:checked`)).map((el) => el.value);
        const original = CustomCompendiums.PACKS[type];
        const selectedPacks = checked.length > 0 ? checked : Array.from(form.querySelectorAll(`input[name="${settingKey}"]`)).map((el) => el.value);
        if (JSON.stringify(original) !== JSON.stringify(selectedPacks)) {
          await game.settings.set(MODULE.ID, settingKey, selectedPacks);
          changedSettings[settingKey] = true;
          successCount++;
        }
      }

      if (successCount > 0) {
        if (needsReload(changedSettings)) HM.reloadConfirm({ world: true });
        else if (needsRerender(changedSettings)) rerenderHM();
        ui.notifications.info('hm.settings.custom-compendiums.form-saved', { localize: true });
        return true;
      }

      return true;
    } catch (error) {
      log(1, 'Error in form submission:', error);
      ui.notifications.error('hm.settings.custom-compendiums.error-saving', { localize: true });
      return false;
    } finally {
      CustomCompendiums.#validPacksCache.clear();
    }
  }

  /**
   * Set up select-all checkbox listeners on the form element.
   * @param {HTMLElement} element - The form element
   */
  #setupCheckboxListeners(element) {
    const groupSelectAlls = element.querySelectorAll('.hm-select-all');
    groupSelectAlls.forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const { type, source } = event.target.dataset;
        const isChecked = event.target.checked;
        const sourceCheckboxes = element.querySelectorAll(`input[data-type="${type}"][data-source="${source}"][name]`);
        sourceCheckboxes.forEach((input) => (input.checked = isChecked));
      });
    });

    const allItemCheckboxes = element.querySelectorAll('input[name$="Packs"]');
    allItemCheckboxes.forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const { type, source } = event.target.dataset;
        const sourceCheckboxes = element.querySelectorAll(`input[data-type="${type}"][data-source="${source}"][name]`);
        const selectAll = element.querySelector(`.hm-select-all[data-type="${type}"][data-source="${source}"]`);
        if (selectAll) selectAll.checked = Array.from(sourceCheckboxes).every((input) => input.checked);
      });
    });
  }

  /**
   * Collects valid packs of a specified type from available compendiums.
   * @param {string} type - The type of documents to collect
   * @param {boolean} [useCache] - Whether to use cached results
   * @returns {Promise<Set>} A set of valid pack objects
   */
  static async #collectValidPacks(type, useCache = true) {
    if (!type || !['class', 'race', 'background', 'item'].includes(type)) throw new Error(`Invalid document type: ${type}`);
    if (useCache && this.#validPacksCache.has(type)) return this.#validPacksCache.get(type);
    const validPacks = new Set();
    for (const pack of game.packs) {
      if (pack.metadata.type !== 'Item') continue;
      if (HM.COMPAT.CPR) {
        if (pack.metadata.id.includes('chris-premades') || pack.metadata.packageName === 'chris-premades') continue;
      }

      try {
        const index = await pack.getIndex();
        let hasValidDocs = false;
        if (type === 'item') hasValidDocs = index.some((doc) => !this.EXCLUDED_TYPES.includes(doc.type));
        else hasValidDocs = index.some((doc) => doc.type === type);
        if (hasValidDocs) {
          validPacks.add({ packName: pack.metadata.label, packId: pack.metadata.id, type: pack.metadata.type });
        }
      } catch (error) {
        log(1, `Failed to retrieve index from pack ${pack.metadata.label}: ${error.message}`, error);
      }
    }

    this.#validPacksCache.set(type, validPacks);
    return validPacks;
  }

  /**
   * Prepares data for the compendium selection template.
   * @param {Set} validPacks - Set of valid pack objects
   * @param {Array<string>} selectedPacks - Array of currently selected pack IDs
   * @returns {object} Data object for the template
   */
  static #prepareCompendiumDialogData(validPacks, selectedPacks) {
    const validPacksArray = Array.from(validPacks);
    const selectedPacksSet = new Set(selectedPacks);
    const sourceGroups = new Map();
    validPacksArray.forEach((pack) => {
      const source = this.#determinePackOrganizationName(pack);
      const isSelected = selectedPacksSet.has(pack.packId);
      if (!sourceGroups.has(source)) sourceGroups.set(source, { name: source, packs: [], allSelected: true });
      const group = sourceGroups.get(source);
      group.packs.push({ value: pack.packId, label: pack.packName, selected: isSelected });
      if (!isSelected) group.allSelected = false;
    });

    return { sourceGroups: Object.fromEntries(sourceGroups) };
  }

  /**
   * Gets the top-level folder name from a pack's folder hierarchy.
   * @param {object} pack - Pack to analyze
   * @returns {string|null} Top-level folder name or null
   */
  static #getPackTopLevelFolderName(pack) {
    if (!pack?.folder) return null;
    let topLevelFolder;
    if (pack.folder.depth !== 1) {
      const parentFolders = pack.folder.getParentFolders();
      topLevelFolder = parentFolders.at(-1)?.name;
    } else {
      topLevelFolder = pack.folder.name;
    }
    return topLevelFolder || null;
  }

  /**
   * Translates system folder names to user-friendly names.
   * @param {string} name - Folder name to translate
   * @param {string} [id] - Optional pack ID for additional context
   * @returns {string} Translated name
   */
  static #translateSystemFolderName(name, id = null) {
    if (!name || typeof name !== 'string') {
      return id || 'Unknown Source';
    }

    const nameTranslations = {
      'D&D Legacy Content': 'SRD 5.1',
      'D&D Modern Content': 'SRD 5.2',
      Forge: () => game.i18n.localize('hm.app.document-service.common-labels.forge'),
      DDB: () => game.i18n.localize('hm.app.document-service.common-labels.dndbeyond-importer'),
      Elkan: () => {
        if (!game.modules.get('elkan5e')?.active) return null;
        return game.i18n.localize('hm.app.document-service.common-labels.elkan5e');
      }
    };

    if (nameTranslations[name]) {
      const result = typeof nameTranslations[name] === 'function' ? nameTranslations[name]() : nameTranslations[name];
      if (result) return result;
    }

    for (const [key, value] of Object.entries(nameTranslations)) {
      if (['D&D Legacy Content', 'D&D Modern Content'].includes(key)) continue;
      const matchesName = name.includes(key);
      const matchesId = key === 'Forge' && id?.includes(key);
      if (matchesName || matchesId) {
        const result = typeof value === 'function' ? value() : value;
        if (result) return result;
      }
    }

    if (/[./_-]home[\s_-]?brew[./_-]/i.test(name)) return game.i18n.localize('hm.app.document-service.common-labels.homebrew');
    return name;
  }

  /**
   * Determines the organization name for a pack.
   * @param {object} pack - Pack object with packId and packName
   * @returns {string} Organization name
   */
  static #determinePackOrganizationName(pack) {
    const actualPack = game.packs.get(pack.packId);
    if (!actualPack) return this.#translateSystemFolderName(pack.packName);
    const packTopLevelFolder = this.#getPackTopLevelFolderName(actualPack);
    if (packTopLevelFolder) return this.#translateSystemFolderName(packTopLevelFolder);
    return this.#translateSystemFolderName(pack.packName, pack.packId);
  }
}
