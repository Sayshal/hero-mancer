/**
 * @module EquipmentUI
 * @description Handles equipment selection UI rendering using Handlebars templates
 */

import { HM } from '../hero-mancer.js';
import { EventRegistry } from '../utils/event-registry.mjs';
import { EquipmentManager } from './equipment-manager.mjs';

/**
 * Renders equipment selection UI using Handlebars templates.
 */
export class EquipmentUI {
  /**
   * Template path for equipment container.
   * @type {string}
   */
  static CONTAINER_TEMPLATE = 'modules/hero-mancer/templates/equipment/equipment-container.hbs';

  /**
   * Template path for individual equipment choice.
   * @type {string}
   */
  static CHOICE_TEMPLATE = 'modules/hero-mancer/templates/equipment/equipment-choice.hbs';

  /**
   * Render the complete equipment selection UI.
   * @param {HTMLElement} container - Container element to render into
   * @returns {Promise<HTMLElement>} Rendered container
   */
  static async render(container) {
    HM.log(3, 'EquipmentUI: Rendering equipment selection');
    try {
      await EquipmentManager.initializeLookup();
      const equipmentData = await EquipmentManager.fetchEquipmentData();
      const context = await this.#buildContext(equipmentData);
      const html = await foundry.applications.handlebars.renderTemplate(this.CONTAINER_TEMPLATE, context);
      container.innerHTML = html;
      this.#attachListeners(container);
      HM.log(3, 'EquipmentUI: Rendering complete');
      return container;
    } catch (error) {
      HM.log(1, `EquipmentUI: Render failed - ${error.message}`);
      container.innerHTML = `<p class="error">${game.i18n.localize('hm.errors.equipment-rendering')}</p>`;
      return container;
    }
  }

  /**
   * Render equipment for a specific type only.
   * @param {HTMLElement} container - Container element
   * @param {string} type - Type to render (class or background)
   * @returns {Promise<HTMLElement>} Updated container
   */
  static async renderType(container, type) {
    HM.log(3, `EquipmentUI: Rendering ${type} equipment`);
    const section = container.querySelector(`.${type}-equipment-section`);
    if (!section) {
      HM.log(2, `EquipmentUI: Section not found for ${type}`);
      return container;
    }
    const equipmentData = await EquipmentManager.fetchEquipmentData();
    const entries = equipmentData[type] || [];
    const wealth = EquipmentManager.getWealthFormula(type);
    const sectionContext = { type, label: game.i18n.localize(`hm.app.equipment.${type}-equipment`), entries: await this.#processEntriesForTemplate(entries), wealth, hasWealth: !!wealth };
    const html = await foundry.applications.handlebars.renderTemplate(this.CHOICE_TEMPLATE, sectionContext);
    section.innerHTML = html;
    this.#attachListeners(section);
    return container;
  }

  /**
   * Update equipment summary for review tab.
   * @param {HTMLElement} summaryElement - Summary container element
   * @returns {Promise<void>}
   */
  static async updateSummary(summaryElement) {
    const selections = this.collectSelections(document.querySelector('#equipment-container'));
    const context = { items: selections.filter((s) => !s.isWealth).map((s) => ({ name: s.name, count: s.count, img: s.img })), hasWealth: selections.some((s) => s.isWealth) };
    const html = await foundry.applications.handlebars.renderTemplate('modules/hero-mancer/templates/equipment/equipment-summary.hbs', context);
    summaryElement.innerHTML = html;
  }

  /**
   * Collect current equipment selections from the form.
   * @param {HTMLElement} container - Equipment container
   * @returns {object[]} Array of selected equipment
   */
  static collectSelections(container) {
    if (!container) return [];
    const selections = [];
    container.querySelectorAll('select[data-equipment-select]').forEach((select) => {
      if (select.disabled) return;
      const value = select.value;
      if (!value) return;
      const option = select.querySelector(`option[value="${value}"]`);
      const count = parseInt(select.dataset.count) || 1;
      selections.push({ uuid: value, name: option?.textContent || value, count, type: select.dataset.type });
    });
    container.querySelectorAll('[data-linked-item]').forEach((element) => {
      const parentOption = element.closest('[data-or-option]');
      if (parentOption?.classList.contains('disabled')) return;
      if (element.disabled) return;
      const uuid = element.dataset.uuid;
      if (!uuid) return;
      selections.push({
        uuid,
        name: element.dataset.name || element.textContent?.trim() || uuid,
        count: parseInt(element.dataset.count) || 1,
        type: 'linked'
      });
    });
    container.querySelectorAll('input[data-wealth-checkbox]:checked').forEach((checkbox) => {
      selections.push({ isWealth: true, type: checkbox.dataset.type, formula: checkbox.dataset.formula });
    });
    return selections;
  }

  /**
   * Build template context from equipment data.
   * @param {object} equipmentData - Raw equipment data
   * @returns {Promise<object>} Template context
   */
  static async #buildContext(equipmentData) {
    const buildSectionData = async (type) => {
      const entries = equipmentData[type] || [];
      const wealth = EquipmentManager.getWealthFormula(type);
      const processedEntries = await this.#processEntriesForTemplate(entries);
      const hasData = processedEntries.length > 0 || !!wealth;
      return { hasData, label: game.i18n.localize(`hm.app.equipment.${type}-equipment`), entries: processedEntries, wealth, hasWealth: !!wealth };
    };
    const classSectionData = await buildSectionData('class');
    const backgroundSectionData = await buildSectionData('background');
    return { classSectionData, backgroundSectionData };
  }

  /**
   * Process entries for template rendering.
   * @param {object[]} entries - Processed equipment entries
   * @returns {Promise<object[]>} Template-ready entries
   */
  static async #processEntriesForTemplate(entries) {
    const processed = [];
    for (const entry of entries) {
      const templateEntry = await this.#processEntryForTemplate(entry);
      if (templateEntry) processed.push(templateEntry);
    }
    if (processed.length === 1 && processed[0].isAnd && processed[0].children?.length) return processed[0].children;
    return processed;
  }

  /**
   * Process a single entry for template.
   * @param {object} entry - Equipment entry
   * @returns {Promise<object|null>} Template-ready entry
   */
  static async #processEntryForTemplate(entry) {
    const typeUpper = entry.type?.toUpperCase();
    const typeLower = entry.type?.toLowerCase();
    const base = {
      id: entry.id,
      type: entry.type,
      label: entry.label,
      count: entry.count,
      isOr: typeUpper === 'OR',
      isAnd: typeUpper === 'AND',
      isLinked: typeLower === 'linked',
      isCategory: ['weapon', 'armor', 'tool', 'focus'].includes(typeLower),
      isCurrency: typeLower === 'currency'
    };
    if (entry.isGrouping && entry.children?.length) {
      base.children = await this.#processEntriesForTemplate(entry.children);
      base.hasChildren = base.children.length > 0;
    }
    if (entry.type === 'linked' && entry.linkedItem) {
      base.linkedItem = entry.linkedItem;
      base.requiresProficiency = entry.requiresProficiency;
    }
    if (base.isCategory) {
      if (entry.dnd5eOptions?.length) base.options = await this.#resolveDnd5eOptions(entry.dnd5eOptions);
      else base.options = await EquipmentManager.getCategoryOptions(entry.type, entry.key);
      base.hasOptions = base.options.length > 0;
      base.categoryKey = entry.key;
      if (entry.requiresProficiency) {
        base.options = base.options.filter((opt) => {
          return this.#checkProficiency(opt, entry.type);
        });
      }
      if (base.count > 1) {
        base.multiSelect = true;
        base.selectInstances = Array.from({ length: base.count }, (_, i) => ({ index: i + 1 }));
      }
    }
    return base;
  }

  /**
   * Resolve DnD5e option references to full item data.
   * @param {string[]} options - Array of UUIDs or keys
   * @returns {Promise<object[]>} Resolved options
   */
  static async #resolveDnd5eOptions(options) {
    const resolved = options
      .map((opt) => {
        const doc = fromUuidSync(opt);
        return doc ? { uuid: opt, name: doc.name, img: doc.img } : null;
      })
      .filter(Boolean);
    resolved.sort((a, b) => a.name.localeCompare(b.name));
    return resolved;
  }

  /**
   * Check if user has proficiency for an item.
   * @param {object} _item - Item option
   * @param {string} _type - Category type
   * @returns {boolean} True if user has proficiency
   * @todo REVISIT THIS
   */
  static #checkProficiency(_item, _type) {
    // For now, return true - full proficiency checking requires more context
    // This can be enhanced later
    return true;
  }

  /**
   * Attach event listeners to rendered elements.
   * @param {HTMLElement} container - Container element
   */
  static #attachListeners(container) {
    container.querySelectorAll('[data-wealth-checkbox]').forEach((checkbox) => {
      EventRegistry.on(checkbox, 'change', (event) => {
        const type = event.target.dataset.type;
        const section = container.querySelector(`.${type}-equipment-entries`);
        if (section) {
          section.classList.toggle('disabled', event.target.checked);
          section.querySelectorAll('select, input').forEach((input) => {
            if (input !== event.target) input.disabled = event.target.checked;
          });
        }
      });
    });

    container.querySelectorAll('[data-or-choice]').forEach((radio) => {
      EventRegistry.on(radio, 'change', (event) => {
        const groupId = event.target.dataset.orGroup;
        const selectedValue = event.target.value;
        container.querySelectorAll(`[data-or-option="${groupId}"]`).forEach((option) => {
          const isSelected = option.dataset.optionValue === selectedValue;
          option.classList.toggle('disabled', !isSelected);
          option.querySelectorAll('select, input:not([data-or-choice])').forEach((input) => {
            input.disabled = !isSelected;
          });
        });
      });
    });

    container.querySelectorAll('select[data-equipment-select]').forEach((select) => {
      EventRegistry.on(select, 'change', (event) => {
        const hiddenInput = container.querySelector(`#${event.target.id}-default`);
        if (hiddenInput) hiddenInput.value = event.target.value;
      });
    });

    // Initialize OR group disabled states for all child inputs
    const processedGroups = new Set();
    container.querySelectorAll('[data-or-choice]').forEach((radio) => {
      const groupId = radio.dataset.orGroup;
      if (processedGroups.has(groupId)) return;
      processedGroups.add(groupId);
      const checkedRadio = container.querySelector(`[data-or-choice][data-or-group="${groupId}"]:checked`);
      if (checkedRadio) checkedRadio.dispatchEvent(new Event('change'));
    });

    HM.log(3, 'EquipmentUI: Event listeners attached');
  }
}
