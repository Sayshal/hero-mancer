/**
 * @module EquipmentCollection
 * @description Collects equipment selections from form and processes for actor creation
 */

import { HM } from '../hero-mancer.js';
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
    log(3, 'EquipmentCollection: Collecting selections');
    const container = event.target?.querySelector('#equipment-container');
    if (!container) return [];
    const equipment = [];
    for (const type of ['class', 'background']) {
      if (type === 'class' && !options.includeClass) continue;
      if (type === 'background' && !options.includeBackground) continue;
      const section = container.querySelector(`.${type}-equipment-section`);
      if (!section) continue;
      const wealthCheckbox = section.querySelector(`[data-wealth-checkbox][data-type="${type}"]`);
      if (wealthCheckbox?.checked) {
        log(3, `EquipmentCollection: ${type} using wealth, skipping equipment`);
        continue;
      }
      await this.#processSection(section, equipment, type);
    }
    log(3, `EquipmentCollection: Collected ${equipment.length} items`);
    return equipment;
  }

  /**
   * Process wealth selections and convert to currency items.
   * @param {Event} event - Form submission event
   * @returns {Promise<object[]>} Currency items to add
   */
  static async processWealth(event) {
    log(3, 'EquipmentCollection: Processing wealth');
    const container = event.target?.querySelector('#equipment-container');
    if (!container) return [];
    const wealthItems = [];
    for (const checkbox of container.querySelectorAll('[data-wealth-checkbox]:checked')) {
      const formula = checkbox.dataset.formula;
      const type = checkbox.dataset.type;
      if (!formula) continue;
      try {
        const roll = await new Roll(formula).evaluate();
        const goldAmount = roll.total;
        log(3, `EquipmentCollection: Rolled ${formula} = ${goldAmount} GP for ${type}`);
        wealthItems.push({ type: 'currency', source: type, currency: 'gp', amount: goldAmount, formula, rollTotal: roll.total });
      } catch (error) {
        log(1, `EquipmentCollection: Failed to roll wealth - ${error.message}`);
      }
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
    const checkbox = container?.querySelector(`[data-wealth-checkbox][data-type="${type}"]`);
    return checkbox?.checked || false;
  }

  /**
   * Process a single equipment section.
   * @param {HTMLElement} section - Section element
   * @param {object[]} equipment - Array to add items to
   * @param {string} type - Section type
   */
  static async #processSection(section, equipment, type) {
    log(3, `EquipmentCollection: Processing ${type} section`);
    await this.#processSelects(section, equipment);
    await this.#processCheckboxes(section, equipment);
    await this.#processLinkedItems(section, equipment);
  }

  /**
   * Process select elements in a section.
   * @param {HTMLElement} section - Section element
   * @param {object[]} equipment - Array to add items to
   */
  static async #processSelects(section, equipment) {
    const selects = section.querySelectorAll('select[data-equipment-select]:not(:disabled)');
    for (const select of selects) {
      const value = select.value;
      if (!value) continue;
      if (select.closest('.disabled')) continue;
      const count = parseInt(select.dataset.count) || 1;
      const item = await this.#resolveItem(value);
      if (item) {
        const entry = this.#createEquipmentEntry(item, select);
        entry.system.quantity = count;
        equipment.push(entry);
      }
    }
  }

  /**
   * Process checkbox elements for optional items.
   * @param {HTMLElement} section - Section element
   * @param {object[]} equipment - Array to add items to
   */
  static async #processCheckboxes(section, equipment) {
    const checkboxes = section.querySelectorAll('input[type="checkbox"][data-equipment-item]:checked:not(:disabled)');
    for (const checkbox of checkboxes) {
      if (checkbox.closest('.disabled')) continue;
      const uuid = checkbox.dataset.uuid;
      const count = parseInt(checkbox.dataset.count) || 1;
      const item = await this.#resolveItem(uuid);
      if (item) {
        const entry = this.#createEquipmentEntry(item, checkbox);
        entry.system.quantity = count;
        equipment.push(entry);
      }
    }
  }

  /**
   * Process linked items that are always included.
   * @param {HTMLElement} section - Section element
   * @param {object[]} equipment - Array to add items to
   */
  static async #processLinkedItems(section, equipment) {
    const linkedItems = section.querySelectorAll('[data-linked-item]:not(:disabled)');
    for (const element of linkedItems) {
      if (element.type === 'checkbox' && !element.checked) continue;
      if (element.closest('[hidden]')) continue;
      if (element.closest('.disabled')) continue;
      const uuid = element.dataset.uuid;
      const count = parseInt(element.dataset.count) || 1;
      const item = await this.#resolveItem(uuid);
      if (item) {
        const entry = this.#createEquipmentEntry(item, element);
        entry.system.quantity = count;
        equipment.push(entry);
      }
    }
  }

  /**
   * Resolve an item from UUID.
   * @param {string} uuid - Item UUID
   * @returns {Promise<object|null>} Item document or null
   */
  static async #resolveItem(uuid) {
    if (!uuid) return null;
    try {
      return await fromUuid(uuid);
    } catch (error) {
      log(2, `EquipmentCollection: Failed to resolve ${uuid} - ${error.message}`);
      return null;
    }
  }

  /**
   * Create an equipment entry for actor creation.
   * @param {object} item - Item document
   * @param {HTMLElement} sourceElement - Source form element
   * @returns {object} Equipment entry
   */
  static #createEquipmentEntry(item, sourceElement) {
    return { uuid: item.uuid, name: item.name, img: item.img, type: item.type, system: foundry.utils.deepClone(item.system) };
  }
}
