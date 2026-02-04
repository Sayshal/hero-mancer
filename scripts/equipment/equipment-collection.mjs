/**
 * @module EquipmentCollection
 * @description Collects equipment selections from form and processes for actor creation
 */

import { log } from '../utils/logger.mjs';

/**
 * Collects and processes equipment selections for character creation.
 */
export class EquipmentCollection {
  /**
   * Collect equipment selections from form submission.
   * @param {Event} event - Form submission event
   * @param {object} [options] - Collection options
   * @param {boolean} [options.includeClass] - Include class equipment
   * @param {boolean} [options.includeBackground] - Include background equipment
   * @returns {Promise<object[]>} Array of equipment items to add to actor
   */
  static async collectSelections(event, options = { includeClass: true, includeBackground: true }) {
    const container = event.target?.querySelector('#equipment-container');
    if (!container) return [];
    const equipment = [];
    for (const type of ['class', 'background']) {
      if (type === 'class' && !options.includeClass) continue;
      if (type === 'background' && !options.includeBackground) continue;
      const section = container.querySelector(`.${type}-equipment-section`);
      if (!section) continue;
      const wealthCheckbox = section.querySelector(`[data-wealth-checkbox][data-type="${type}"]`);
      if (wealthCheckbox?.checked) continue;
      await this.#processSection(section, equipment);
    }
    log(3, `Collected ${equipment.length} equipment selections`);
    return equipment;
  }

  /**
   * Process wealth selections and convert to currency items.
   * @param {Event} event - Form submission event
   * @returns {Promise<object[]>} Currency items to add
   */
  static async processWealth(event) {
    const container = event.target?.querySelector('#equipment-container');
    if (!container) return [];
    const wealthItems = [];
    for (const checkbox of container.querySelectorAll('[data-wealth-checkbox]:checked')) {
      const formula = checkbox.dataset.formula;
      const type = checkbox.dataset.type;
      if (!formula) continue;
      const roll = await new Roll(formula).evaluate();
      wealthItems.push({ type: 'currency', source: type, currency: 'gp', amount: roll.total, formula, rollTotal: roll.total });
    }
    return wealthItems;
  }

  /**
   * Check if wealth is selected for a type.
   * @param {HTMLElement} container - Equipment container
   * @param {string} type - Source type (class or background)
   * @returns {boolean} True if wealth checkbox is checked
   */
  static isWealthSelected(container, type) {
    return container?.querySelector(`[data-wealth-checkbox][data-type="${type}"]`)?.checked || false;
  }

  /**
   * Process all equipment elements in a section (selects, checkboxes, linked items).
   * @param {HTMLElement} section - Section element
   * @param {object[]} equipment - Array to add items to
   */
  static async #processSection(section, equipment) {
    const elements = [
      ...section.querySelectorAll('select[data-equipment-select]:not(:disabled)'),
      ...section.querySelectorAll('input[type="checkbox"][data-equipment-item]:checked:not(:disabled)'),
      ...section.querySelectorAll('[data-linked-item]:not(:disabled)')
    ];
    for (const el of elements) {
      if (el.closest('.disabled') || el.closest('[hidden]')) continue;
      if (el.type === 'checkbox' && !el.checked) continue;
      const uuid = el.dataset.uuid || el.value;
      if (!uuid) continue;
      const count = parseInt(el.dataset.count) || 1;
      const item = await fromUuid(uuid);
      if (!item) continue;
      equipment.push({ uuid: item.uuid, name: item.name, img: item.img, type: item.type, system: { ...foundry.utils.deepClone(item.system), quantity: count } });
    }
  }
}
