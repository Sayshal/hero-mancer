/**
 * @module EquipmentCollection
 * @description Collects equipment selections from form and processes for actor creation
 */

import { HM } from '../hero-mancer.js';

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
    HM.log(3, 'EquipmentCollection: Collecting selections');
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
        HM.log(3, `EquipmentCollection: ${type} using wealth, skipping equipment`);
        continue;
      }
      await this.#processSection(section, equipment, type);
    }
    HM.log(3, `EquipmentCollection: Collected ${equipment.length} items`);
    return equipment;
  }

  /**
   * Process wealth selections and convert to currency items.
   * @param {Event} event - Form submission event
   * @returns {Promise<object[]>} Currency items to add
   */
  static async processWealth(event) {
    HM.log(3, 'EquipmentCollection: Processing wealth');
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
        HM.log(3, `EquipmentCollection: Rolled ${formula} = ${goldAmount} GP for ${type}`);
        wealthItems.push({ type: 'currency', source: type, currency: 'gp', amount: goldAmount, formula, rollTotal: roll.total });
      } catch (error) {
        HM.log(1, `EquipmentCollection: Failed to roll wealth - ${error.message}`);
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
    HM.log(3, `EquipmentCollection: Processing ${type} section`);
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
      if (item) for (let i = 0; i < count; i++) equipment.push(this.#createEquipmentEntry(item, select));
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
      if (item) for (let i = 0; i < count; i++) equipment.push(this.#createEquipmentEntry(item, checkbox));
    }
  }

  /**
   * Process linked items that are always included.
   * @param {HTMLElement} section - Section element
   * @param {object[]} equipment - Array to add items to
   */
  static async #processLinkedItems(section, equipment) {
    const linkedItems = section.querySelectorAll('[data-linked-item]:not(.disabled)');
    for (const element of linkedItems) {
      const orOption = element.closest('[data-or-option]');
      if (orOption && orOption.classList.contains('disabled')) continue;
      const uuid = element.dataset.uuid;
      const count = parseInt(element.dataset.count) || 1;
      const item = await this.#resolveItem(uuid);
      if (item) for (let i = 0; i < count; i++) equipment.push(this.#createEquipmentEntry(item, element));
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
      let item = fromUuidSync(uuid);
      if (!item) item = await fromUuid(uuid);
      return item;
    } catch (error) {
      HM.log(2, `EquipmentCollection: Failed to resolve ${uuid} - ${error.message}`);
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
    const entry = { uuid: item.uuid, name: item.name, img: item.img, type: item.type, system: foundry.utils.deepClone(item.system) };
    const favoriteCheckbox = sourceElement.closest('tr')?.querySelector('.favorite-checkbox');
    if (favoriteCheckbox?.checked) entry.favorite = true;
    return entry;
  }
}
