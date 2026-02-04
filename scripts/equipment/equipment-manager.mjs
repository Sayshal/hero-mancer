/**
 * @module EquipmentManager
 * @description Manages equipment data parsing using DnD5e's EquipmentEntryData
 */

import { MODULE } from '../constants.mjs';
import { HM } from '../hero-mancer.js';
import { log } from '../utils/logger.mjs';

/**
 * Manages equipment parsing and data retrieval for character creation.
 * Leverages DnD5e's EquipmentEntryData for parsing and label generation.
 */
export class EquipmentManager {
  static #cache = new Map();
  static #itemLookup = new Map();
  static #lookupInitialized = false;
  static proficiencies = new Set();

  /**
   * Fetch equipment data for class and background.
   * @returns {Promise<{class: object[], background: object[]}>} Equipment data by type
   */
  static async fetchEquipmentData() {
    const [classEquipment, backgroundEquipment] = await Promise.all([this.#getEquipmentForType('class'), this.#getEquipmentForType('background')]);
    log(3, `Fetched ${classEquipment.length} class entries, ${backgroundEquipment.length} background entries`);
    return { class: classEquipment, background: backgroundEquipment };
  }

  /**
   * Parse equipment entries from document's startingEquipment.
   * The document's system.startingEquipment already contains EquipmentEntryData instances.
   * @param {object[]} equipmentEntries - Equipment entries from document (already EquipmentEntryData)
   * @returns {Promise<object[]>} Processed equipment entries with labels and options
   */
  static async parseEquipmentEntries(equipmentEntries) {
    if (!equipmentEntries?.length) return [];
    const topLevel = equipmentEntries.filter((e) => !e.group);
    return Promise.all(topLevel.map((entry) => this.#processEntry(entry, equipmentEntries)));
  }

  /**
   * Get dropdown options for a category type.
   * @param {string} type - Category type (weapon, armor, tool, focus)
   * @param {string} [key] - Specific key within category
   * @returns {Promise<object[]>} Array of {uuid, name, img} options
   */
  static async getCategoryOptions(type, key) {
    const cacheKey = `${type}:${key || 'all'}`;
    if (this.#itemLookup.has(cacheKey)) return this.#itemLookup.get(cacheKey);
    if (type === 'weapon' && key) {
      const options = this.#getWeaponOptionsFromLookup(key);
      if (options.length) {
        this.#itemLookup.set(cacheKey, options);
        return options;
      }
    }
    const options = await this.#buildCategoryOptions(type, key);
    this.#itemLookup.set(cacheKey, options);
    return options;
  }

  /**
   * Get weapon options from pre-built lookup.
   * @param {string} key - Weapon key
   * @returns {object[]} Array of options
   */
  static #getWeaponOptionsFromLookup(key) {
    const keyMap = { sim: ['simpleM', 'simpleR'], mar: ['martialM', 'martialR'], simpleM: ['simpleM'], simpleR: ['simpleR'], martialM: ['martialM'], martialR: ['martialR'] };
    const weaponTypes = keyMap[key] || [key];
    const options = [];
    for (const weaponType of weaponTypes) {
      const cached = this.#itemLookup.get(`weapon:${weaponType}`);
      if (cached) options.push(...cached);
    }
    options.sort((a, b) => a.name.localeCompare(b.name));
    return options;
  }

  /**
   * Get wealth formula for a source type.
   * @param {string} type - Source type (class or background)
   * @returns {string|null} Wealth formula or null
   */
  static getWealthFormula(type) {
    const uuid = HM.SELECTED[type]?.uuid;
    if (!uuid) return null;
    const doc = fromUuidSync(uuid);
    return doc?.system?.wealth || null;
  }

  /**
   * Check if a source type uses modern (2024) rules.
   * @param {string} type - Source type (class or background)
   * @returns {boolean} True if the document uses 2024 rules
   */
  static isModernRules(type) {
    const uuid = HM.SELECTED[type]?.uuid;
    if (!uuid) return false;
    const doc = fromUuidSync(uuid);
    return doc?.system?.source?.rules === '2024';
  }

  /**
   * Convert wealth formulas from form data to currency.
   * @param {object} formData - Form data containing wealth checkbox states
   * @returns {Promise<object>} Currency object with gp, sp, cp values
   */
  static async convertWealthToCurrency(formData) {
    const currency = { gp: 0, sp: 0, cp: 0 };
    for (const type of ['class', 'background']) {
      if (!formData[`use-starting-wealth-${type}`]) continue;
      const preRolled = parseInt(formData[`starting-wealth-rolled-${type}`]);
      if (!isNaN(preRolled) && preRolled > 0) {
        currency.gp += preRolled;
        continue;
      }
      const formula = this.getWealthFormula(type);
      if (!formula) continue;
      const roll = await new Roll(formula).evaluate();
      currency.gp += roll.total;
      if (game.settings.get(MODULE.ID, 'publishWealthRolls')) {
        roll.toMessage({
          flavor: game.i18n.format('hm.app.equipment.wealth-roll', { type: game.i18n.localize(`hm.app.equipment.${type}`) }),
          speaker: { alias: game.user.name }
        });
      }
    }
    log(3, `Wealth converted to ${currency.gp} gp, ${currency.sp} sp, ${currency.cp} cp`);
    return currency;
  }

  /**
   * Clear all cached data.
   * @param {boolean} [clearLookup] - Whether to also clear the item lookup
   */
  static clearCache(clearLookup = false) {
    this.#cache.clear();
    this.proficiencies.clear();
    if (clearLookup) {
      this.#itemLookup.clear();
      this.#lookupInitialized = false;
    }
  }

  /**
   * Initialize item lookup data from configured packs.
   * @returns {Promise<void>}
   */
  static async initializeLookup() {
    if (this.#lookupInitialized) return;
    const itemPacks = game.settings.get(MODULE.ID, 'itemPacks') || [];
    log(3, `Initializing item lookup from ${itemPacks.length} packs`);
    for (const packId of itemPacks) {
      const pack = game.packs.get(packId);
      if (!pack || pack.documentName !== 'Item') continue;
      const index = await pack.getIndex({ fields: ['system.type.value', 'system.type.baseItem', 'system.type.subtype', 'system.armor.type', 'system.properties', 'img'] });
      for (const entry of index) {
        if (this.#isMagicItem(entry)) continue;
        if (this.#isNaturalWeapon(entry)) continue;
        this.#indexItem(entry, packId);
      }
    }
    for (const items of this.#itemLookup.values()) items.sort((a, b) => a.name.localeCompare(b.name));
    this.#lookupInitialized = true;
    log(3, `Item lookup initialized with ${this.#itemLookup.size} categories`);
  }

  /**
   * Get equipment for a specific type (class or background).
   * @param {string} type - Source type
   * @returns {Promise<object[]>} Processed equipment entries
   */
  static async #getEquipmentForType(type) {
    const storedData = HM.SELECTED[type];
    if (!storedData?.uuid) return [];
    if (this.#cache.has(storedData.uuid)) {
      log(3, `Cache hit for ${type} equipment (${storedData.uuid})`);
      return this.#cache.get(storedData.uuid);
    }
    const doc = fromUuidSync(storedData.uuid);
    if (!doc) return [];
    this.#extractProficiencies(doc.system?.advancement || []);
    const equipmentEntries = doc.system?.startingEquipment || [];
    const processed = await this.parseEquipmentEntries(equipmentEntries);
    this.#cache.set(storedData.uuid, processed);
    return processed;
  }

  /**
   * Process a single equipment entry.
   * @param {object} entry - Equipment entry
   * @param {object[]} allEntries - All entries for children lookup
   * @returns {Promise<object>} Processed entry
   */
  static async #processEntry(entry, allEntries) {
    const { EquipmentEntryData } = dnd5e.dataModels.item.startingEquipment;
    const rawLabel = entry.generateLabel();
    const enrichedLabel = await foundry.applications.ux.TextEditor.implementation.enrichHTML(rawLabel, { async: true });
    const processed = {
      id: entry._id,
      type: entry.type,
      key: entry.key,
      count: entry.count || 1,
      requiresProficiency: entry.requiresProficiency,
      label: enrichedLabel,
      isGrouping: entry.type in EquipmentEntryData.GROUPING_TYPES,
      isChoice: entry.type in EquipmentEntryData.OPTION_TYPES,
      children: []
    };

    if (processed.isGrouping) {
      const childEntries = allEntries.filter((e) => e.group === entry._id);
      processed.children = await Promise.all(childEntries.map((child) => this.#processEntry(child, allEntries)));
    }

    if (processed.isChoice && entry.type !== 'linked' && entry.type !== 'currency') {
      processed.keyOptions = entry.keyOptions;
      processed.categoryLabel = entry.categoryLabel;
      if (entry.availableOptions?.size) processed.dnd5eOptions = Array.from(entry.availableOptions);
    }

    if (entry.type === 'linked') {
      const linkedDoc = fromUuidSync(entry.key);
      processed.linkedItem = linkedDoc
        ? { uuid: entry.key, name: linkedDoc.name, img: linkedDoc.img, link: `<a class="content-link" draggable="true" data-link data-uuid="${entry.key}" data-tooltip="${linkedDoc.type ?? 'Item'}"><i class="fa-solid fa-suitcase" inert></i>${linkedDoc.name}</a>` }
        : null;
    }
    return processed;
  }

  /**
   * Build dropdown options for a category.
   * @param {string} type - Category type
   * @param {string} [key] - Specific key
   * @returns {Promise<object[]>} Array of item options
   */
  static async #buildCategoryOptions(type, key) {
    const options = [];
    const itemPacks = game.settings.get(MODULE.ID, 'itemPacks') || [];
    for (const packId of itemPacks) {
      const pack = game.packs.get(packId);
      if (!pack || pack.documentName !== 'Item') continue;
      const index = await pack.getIndex({ fields: ['system.type.value', 'system.type.baseItem', 'system.type.subtype', 'system.armor.type', 'system.properties', 'img'] });
      for (const entry of index) {
        if (this.#isMagicItem(entry)) continue;
        if (this.#isNaturalWeapon(entry)) continue;
        if (this.#matchesCategory(entry, type, key)) options.push({ uuid: `Compendium.${packId}.Item.${entry._id}`, name: entry.name, img: entry.img });
      }
    }
    options.sort((a, b) => a.name.localeCompare(b.name));
    return options;
  }

  /**
   * Check if an item matches a category.
   * @param {object} item - Index entry
   * @param {string} type - Category type
   * @param {string} [key] - Specific key
   * @returns {boolean} True if item matches
   */
  static #matchesCategory(item, type, key) {
    switch (type) {
      case 'weapon':
        if (item.type !== 'weapon') return false;
        if (!key) return true;
        return this.#matchesWeaponKey(item, key);
      case 'armor':
        if (item.type !== 'equipment') return false;
        if (!key) return ['light', 'medium', 'heavy'].includes(item.system?.type?.value);
        return item.system?.type?.value === key;
      case 'tool':
        if (item.type !== 'tool') return false;
        if (!key) return true;
        return item.system?.type?.value === key;
      case 'focus': {
        if (item.type !== 'equipment') return false;
        const focusConfig = CONFIG.DND5E.focusTypes?.[key];
        if (focusConfig?.itemIds) {
          const itemIds = Object.values(focusConfig.itemIds);
          if (itemIds.some((id) => id === item._id || id.endsWith(item._id))) return true;
        }
        const properties = item.system?.properties;
        const isFocus = properties instanceof Set ? properties.has('foc') : Array.isArray(properties) ? properties.includes('foc') : false;
        return isFocus;
      }
      default:
        return false;
    }
  }

  /**
   * Check if item matches weapon key.
   * @param {object} item - Index entry
   * @param {string} key - Weapon key
   * @returns {boolean} True if weapon matches key
   */
  static #matchesWeaponKey(item, key) {
    const weaponType = item.system?.type?.value;
    if (!weaponType) return false;
    const keyMap = { sim: ['simpleM', 'simpleR'], mar: ['martialM', 'martialR'], simpleM: ['simpleM'], simpleR: ['simpleR'], martialM: ['martialM'], martialR: ['martialR'] };
    const validTypes = keyMap[key] || [key];
    return validTypes.includes(weaponType);
  }

  /**
   * Check if an item is magical (has 'mgc' property).
   * @param {object} item - Index entry
   * @returns {boolean} True if item is magical
   */
  static #isMagicItem(item) {
    const properties = item.system?.properties;
    if (!properties) return false;
    if (properties instanceof Set) return properties.has('mgc');
    if (Array.isArray(properties)) return properties.includes('mgc');
    return false;
  }

  /**
   * Check if an item is a natural/non-equippable weapon (e.g. Unarmed Strike).
   * @param {object} item - Index entry
   * @returns {boolean} True if item is a natural weapon
   */
  static #isNaturalWeapon(item) {
    if (item.type !== 'weapon') return false;
    return item.system?.type?.value === 'natural' || !item.system?.type?.baseItem;
  }

  /**
   * Index an item for lookup.
   * @param {object} entry - Index entry
   * @param {string} packId - Pack ID
   */
  static #indexItem(entry, packId) {
    const uuid = `Compendium.${packId}.Item.${entry._id}`;
    const itemData = { uuid, name: entry.name, img: entry.img };
    if (entry.type === 'weapon') {
      const weaponType = entry.system?.type?.value;
      if (weaponType) {
        const key = `weapon:${weaponType}`;
        if (!this.#itemLookup.has(key)) this.#itemLookup.set(key, []);
        this.#itemLookup.get(key).push(itemData);
      }
    } else if (entry.type === 'equipment' && ['light', 'medium', 'heavy', 'shield'].includes(entry.system?.type?.value)) {
      const armorType = entry.system.type.value;
      const key = `armor:${armorType}`;
      if (!this.#itemLookup.has(key)) this.#itemLookup.set(key, []);
      this.#itemLookup.get(key).push(itemData);
    } else if (entry.type === 'tool') {
      const toolType = entry.system?.type?.value;
      if (toolType) {
        const key = `tool:${toolType}`;
        if (!this.#itemLookup.has(key)) this.#itemLookup.set(key, []);
        this.#itemLookup.get(key).push(itemData);
      }
    } else if (entry.type === 'equipment' && entry.system?.type?.value === 'focus') {
      const focusSubtype = entry.system?.type?.subtype;
      if (focusSubtype) {
        const key = `focus:${focusSubtype}`;
        if (!this.#itemLookup.has(key)) this.#itemLookup.set(key, []);
        this.#itemLookup.get(key).push(itemData);
      }
    }
  }

  /**
   * Extract proficiencies from advancement data.
   * @param {object[]} advancements - Advancement configurations
   */
  static #extractProficiencies(advancements) {
    for (const advancement of advancements) {
      const grants = advancement.configuration?.grants;
      if (grants) for (const grant of grants) this.proficiencies.add(grant);
    }
  }
}
