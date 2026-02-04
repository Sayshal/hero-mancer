/**
 * @module EquipmentUI
 * @description Handles equipment selection UI rendering using Handlebars templates
 */

import { HM } from '../hero-mancer.js';
import { log } from '../utils/logger.mjs';
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
    log(3, 'EquipmentUI: Rendering equipment selection');
    try {
      await EquipmentManager.initializeLookup();
      const equipmentData = await EquipmentManager.fetchEquipmentData();
      const context = await this.#buildContext(equipmentData);
      const html = await foundry.applications.handlebars.renderTemplate(this.CONTAINER_TEMPLATE, context);
      container.innerHTML = html;
      this.#attachListeners(container);
      log(3, 'EquipmentUI: Rendering complete');
      return container;
    } catch (error) {
      log(1, `EquipmentUI: Render failed - ${error.message}`);
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
    log(3, `EquipmentUI: Rendering ${type} equipment`);
    const equipmentData = await EquipmentManager.fetchEquipmentData();
    const entries = equipmentData[type] || [];
    const wealth = EquipmentManager.getWealthFormula(type);
    const isModernRules = EquipmentManager.isModernRules(type);
    const hasData = entries.length > 0 || !!wealth;
    let section = container.querySelector(`.${type}-equipment-section`);
    if (!hasData) {
      if (section) section.remove();
      return container;
    }
    if (!section) {
      section = document.createElement('fieldset');
      section.classList.add(`${type}-equipment-section`, 'equipment-section');
      container.appendChild(section);
    }
    const typeName = fromUuidSync(HM.SELECTED[type]?.uuid)?.name || type;
    const sectionContext = { type, label: game.i18n.format('hm.app.equipment.type-equipment', { type: typeName }), entries: await this.#processEntriesForTemplate(entries), wealth, hasWealth: !!wealth, isModernRules };
    const html = await foundry.applications.handlebars.renderTemplate(this.CHOICE_TEMPLATE, sectionContext);
    section.innerHTML = html;
    this.#attachListeners(container);
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
      if (element.disabled) return;
      if (element.closest('[hidden]')) return;
      if (element.closest('.disabled')) return;
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
      const isModernRules = EquipmentManager.isModernRules(type);
      const typeName = fromUuidSync(HM.SELECTED[type]?.uuid)?.name || type;
      return { hasData, label: game.i18n.format('hm.app.equipment.type-equipment', { type: typeName }), entries: processedEntries, wealth, hasWealth: !!wealth, isModernRules };
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
      textLabel: entry.label?.replace(/<[^>]*>/g, '') || '',
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
    EventRegistry.cleanup(container);

    // Wealth checkbox — use delegation on container to survive DOM replacement
    EventRegistry.on(container, 'change', (event) => {
      const checkbox = event.target.closest('[data-wealth-checkbox]');
      if (!checkbox) return;
      const type = checkbox.dataset.type;
      const isChecked = checkbox.checked;
      const isModern = checkbox.dataset.modern === 'true';
      const formula = checkbox.dataset.formula;
      const section = container.querySelector(`.${type}-equipment-entries`);
      const equipmentSection = checkbox.closest('.equipment-section') || container;
      const rollRow = equipmentSection.querySelector('.wealth-roll-container');
      const wealthInput = container.querySelector(`#starting-wealth-amount-${type}`);
      if (section) {
        section.classList.toggle('disabled', isChecked);
        section.querySelectorAll('select, input').forEach((input) => {
          if (input !== checkbox) input.disabled = isChecked;
        });
      }

      if (rollRow) rollRow.hidden = !isChecked;

      if (wealthInput) {
        if (isChecked && isModern) {
          wealthInput.value = `${formula} ${CONFIG.DND5E.currencies.gp.abbreviation}`;
        } else if (!isChecked) {
          wealthInput.value = '';
        }
      }
    });

    // Wealth roll button — use delegation on container
    EventRegistry.on(container, 'click', async (event) => {
      const button = event.target.closest('.wealth-roll-button');
      if (!button) return;
      const formula = button.dataset.formula;
      const type = button.dataset.type;
      const wealthInput = container.querySelector(`#starting-wealth-amount-${type}`);
      if (!formula || !wealthInput) return;

      const roll = new Roll(formula);
      await roll.evaluate();
      wealthInput.value = `${roll.total} ${CONFIG.DND5E.currencies.gp.abbreviation}`;
      const hiddenInput = container.querySelector(`[name="starting-wealth-rolled-${type}"]`);
      if (hiddenInput) hiddenInput.value = roll.total;

      if (game.settings.get(HM.ID, 'publishWealthRolls')) {
        const characterName = document.getElementById('character-name')?.value || game.user.name;
        const typeLabel = game.i18n.localize(`TYPES.Item.${type}`);
        await roll.toMessage({
          flavor: game.i18n.format('hm.app.equipment.wealth-roll-message', { name: characterName, type: typeLabel, result: roll.total }),
          speaker: ChatMessage.getSpeaker()
        });
      }
    });

    // OR select — toggle child controls based on selection
    EventRegistry.on(container, 'change', (event) => {
      const select = event.target.closest('[data-or-select]');
      if (!select) return;
      const groupId = select.dataset.orGroup;
      const selectedChildId = select.value;
      container.querySelectorAll(`[data-or-child][data-or-parent="${groupId}"]`).forEach((child) => {
        const isSelected = child.dataset.orChild === selectedChildId;
        if (child.tagName === 'INPUT') {
          child.disabled = !isSelected;
        } else {
          child.hidden = !isSelected;
          child.querySelectorAll('select, input').forEach((input) => {
            input.disabled = !isSelected;
          });
        }
      });
    });

    // Inject content link icons after labels in form-groups with selects
    container.querySelectorAll('[data-equipment-select], [data-or-select]').forEach((select) => {
      const formGroup = select.closest('.form-group');
      if (!formGroup || formGroup.querySelector(':scope > .content-link.item-icon')) return;
      const uuid = this.#resolveSelectUuid(select, container);
      if (!uuid) return;
      const label = formGroup.querySelector(':scope > label');
      if (!label) return;
      label.after(this.#createItemLink(uuid));
    });

    // Update content link icon when any select changes
    EventRegistry.on(container, 'change', (event) => {
      const select = event.target.closest('[data-equipment-select], [data-or-select]');
      if (!select) return;
      const formGroup = select.closest('.form-group');
      const anchor = formGroup?.querySelector(':scope > .content-link.item-icon');
      if (!anchor) return;
      const uuid = this.#resolveSelectUuid(select, container);
      if (uuid) {
        anchor.dataset.uuid = uuid;
        anchor.hidden = false;
      } else {
        anchor.hidden = true;
      }
    });

    log(3, 'EquipmentUI: Event listeners attached');
  }

  /**
   * Resolve the UUID for the currently selected option of a select.
   * Category selects have UUIDs as option values directly.
   * OR selects have entry IDs — look up UUID from associated hidden inputs.
   * @param {HTMLSelectElement} select - Select element
   * @param {HTMLElement} container - Equipment container
   * @returns {string|null} UUID or null
   */
  static #resolveSelectUuid(select, container) {
    if (select.dataset.equipmentSelect !== undefined) return select.value || null;
    if (select.dataset.orSelect !== undefined) {
      const childId = select.value;
      const input = container.querySelector(`input[data-linked-item][data-or-child="${childId}"]`);
      if (input) return input.dataset.uuid;
      const childDiv = container.querySelector(`div[data-or-child="${childId}"]`);
      const firstLinked = childDiv?.querySelector('input[data-linked-item]');
      if (firstLinked) return firstLinked.dataset.uuid;
    }
    return null;
  }

  /**
   * Create a content link icon element for an item UUID.
   * @param {string} uuid - Item UUID
   * @returns {HTMLAnchorElement} Content link anchor
   */
  static #createItemLink(uuid) {
    const anchor = document.createElement('a');
    anchor.classList.add('content-link', 'item-icon');
    anchor.draggable = true;
    anchor.dataset.link = '';
    anchor.dataset.uuid = uuid;
    anchor.dataset.tooltip = 'Item';
    const icon = document.createElement('i');
    icon.classList.add('fa-solid', 'fa-suitcase');
    icon.inert = true;
    anchor.appendChild(icon);
    return anchor;
  }
}
