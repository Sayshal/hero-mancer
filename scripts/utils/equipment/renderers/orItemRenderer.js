import { HM } from '../../index.js';
import { BaseItemRenderer } from '../index.js';

/**
 * Renderer for OR choice equipment blocks
 */
export class OrItemRenderer extends BaseItemRenderer {
  /**
   * Render an OR equipment block
   * @param {object} item - OR block data
   * @param {HTMLElement} itemContainer - Container element
   * @returns {Promise<HTMLElement>} Rendered container
   */
  async render(item, itemContainer) {
    HM.log(3, `Processing OR block: ${item._id}`);

    if (!this.validateOrItem(item)) {
      return itemContainer;
    }

    await this.addOrBlockHeader(item, itemContainer);

    const select = this.createSelectElement(item);
    itemContainer.appendChild(select);

    const defaultSelection = this.createDefaultSelectionField(select);
    itemContainer.appendChild(defaultSelection);

    this.setupSelectChangeListener(select, defaultSelection);
    await this.setupSpecializedRendering(item, select, itemContainer);

    this.addFavoriteStar(itemContainer, item);
    return itemContainer;
  }

  /**
   * Validate if an OR item has required properties
   * @param {Object} item - Item to validate
   * @returns {boolean} True if valid
   */
  validateOrItem(item) {
    if (!item?.children?.length) {
      HM.log(1, 'Invalid OR block item:', item);
      return false;
    }

    if (!item._source) {
      HM.log(1, 'Missing _source property on OR block item:', item);
      return false;
    }

    return true;
  }

  /**
   * Set up change event listener for select element
   * @param {HTMLSelectElement} select - Select element
   * @param {HTMLInputElement} defaultSelection - Hidden input for default value
   */
  setupSelectChangeListener(select, defaultSelection) {
    select.addEventListener('change', (event) => {
      defaultSelection.value = event.target.value;
    });
  }

  /**
   * Set up specialized rendering based on item type
   * @param {Object} item - OR block item
   * @param {HTMLSelectElement} select - Primary select element
   * @param {HTMLElement} itemContainer - Container element
   * @returns {Promise<void>}
   */
  async setupSpecializedRendering(item, select, itemContainer) {
    if (this.isWeaponShieldChoice(item)) {
      await this.setupWeaponShieldChoice(item, select, itemContainer);
    } else if (this.isMultiQuantityChoice(item) && this.findWeaponTypeChild(item)) {
      await this.setupMultiQuantityChoice(item, select, itemContainer);
    } else {
      await this.renderStandardOrChoice(item, select);
    }
  }

  /**
   * Add a header label to an OR block
   * @param {Object} item - OR block item
   * @param {HTMLElement} container - Container element
   */
  async addOrBlockHeader(item, container) {
    const labelElement = document.createElement('h4');
    labelElement.classList.add('parent-label');

    // Check for weapon-or-lookup case
    const hasLinkedItem = item.children.some((child) => child.type === 'linked');
    const hasWeaponLookup = item.children.some((child) => child.type === 'weapon' && ['simpleM', 'simpleR', 'martialM', 'martialR', 'sim', 'mar'].includes(child.key));

    if (hasLinkedItem && hasWeaponLookup) {
      const linkedItem = item.children.find((child) => child.type === 'linked');
      const weaponItem = item.children.find((child) => child.type === 'weapon' && ['simpleM', 'simpleR', 'martialM', 'martialR', 'sim', 'mar'].includes(child.key));

      if (linkedItem && weaponItem) {
        try {
          const itemDoc = await fromUuidSync(linkedItem._source?.key);
          if (itemDoc) {
            const lookupLabel = this.getLookupKeyLabel(weaponItem.key);
            labelElement.innerHTML = `${itemDoc.name} or any ${lookupLabel}`;
          } else {
            labelElement.innerHTML = `${item.label || game.i18n.localize('hm.app.equipment.choose-one')}`;
          }
        } catch (error) {
          HM.log(2, `Error getting name for linked item in OR block: ${error.message}`);
          labelElement.innerHTML = `${item.label || game.i18n.localize('hm.app.equipment.choose-one')}`;
        }
      } else {
        labelElement.innerHTML = `${item.label || game.i18n.localize('hm.app.equipment.choose-one')}`;
      }
    } else {
      labelElement.innerHTML = `${item.label || game.i18n.localize('hm.app.equipment.choose-one')}`;
    }

    container.appendChild(labelElement);
  }

  /**
   * Create select element for an OR choice
   * @param {Object} item - OR block item
   * @returns {HTMLSelectElement} Select element
   */
  createSelectElement(item) {
    const select = document.createElement('select');
    select.id = item._source?.key || item._id || `or-select-${Date.now()}`;
    return select;
  }

  /**
   * Create hidden field for default selection
   * @param {HTMLSelectElement} select - Select element
   * @returns {HTMLInputElement} Hidden input
   */
  createDefaultSelectionField(select) {
    const defaultSelection = document.createElement('input');
    defaultSelection.type = 'hidden';
    defaultSelection.id = `${select.id}-default`;
    return defaultSelection;
  }

  /**
   * Check if this is a weapon-shield choice
   * @param {Object} item - Equipment item
   * @returns {boolean} True if weapon-shield choice
   */
  isWeaponShieldChoice(item) {
    const andGroup = item.children.find((child) => child.type === 'AND');
    if (!andGroup) return false;

    const hasWeapon = andGroup.children?.some((child) => child.type === 'weapon' && ['martialM', 'mar', 'simpleM', 'sim'].includes(child.key));

    const hasShield = andGroup.children?.some((child) => child.type === 'armor' && child._source?.key?.includes('shield'));

    return hasWeapon && hasShield;
  }

  /**
   * Check if this is a multi-quantity choice
   * @param {Object} item - Equipment item
   * @returns {boolean} True if multi-quantity
   */
  isMultiQuantityChoice(item) {
    let quantityChoices = 0;

    if (!item?.children?.length) {
      HM.log(1, 'Invalid item passed to isMultiQuantityChoice', { item: item });
      return false;
    }

    for (const child of item.children) {
      if (child.count && child.count > 1) {
        quantityChoices++;
      }
    }
    return quantityChoices > 1;
  }

  /**
   * Find weapon type child in an item
   * @param {Object} item - Parent item
   * @returns {Object|null} Weapon child or null
   */
  findWeaponTypeChild(item) {
    return item.children.find((child) => child.type === 'weapon' && ['simpleM', 'simpleR', 'martialM', 'martialR', 'sim', 'mar'].includes(child.key));
  }

  /**
   * Extract linked item ID from an item
   * @param {Object} item - Equipment item
   * @returns {string|null} Linked item ID
   */
  extractLinkedItemId(item) {
    // Validate input
    if (!item || !Array.isArray(item.children)) {
      HM.log(2, 'Invalid item or missing children array');
      return null;
    }

    const linkedItem = item.children.find((child) => child && typeof child === 'object' && child.type === 'linked');

    // Validate linked item has source and key
    if (linkedItem && linkedItem._source && linkedItem._source.key) {
      return linkedItem._source.key;
    }

    HM.log(3, `No valid linked item found in ${item.name || 'unnamed item'}`);
    return null;
  }

  /**
   * Set up weapon-shield choice UI
   * @param {Object} item - OR block item
   * @param {HTMLSelectElement} select - Primary select element
   * @param {HTMLElement} container - Container element
   */
  async setupWeaponShieldChoice(item, select, container) {
    const { dropdownContainer, secondSelect } = this.createSecondaryDropdown(item, container);
    const weaponLookupKey = this.getWeaponLookupKey(item);
    const weaponOptions = this.getWeaponOptions(weaponLookupKey);

    this.populateWeaponDropdown(select, weaponOptions);
    this.populateSecondDropdown(secondSelect, weaponOptions);

    select.addEventListener('change', () => this.populateSecondDropdown(secondSelect, weaponOptions));
  }

  /**
   * Create secondary dropdown for weapon-shield choice
   * @param {Object} item - OR block item
   * @param {HTMLElement} container - Container element
   * @returns {Object} Created dropdown elements
   */
  createSecondaryDropdown(item, container) {
    const dropdownContainer = document.createElement('div');
    dropdownContainer.classList.add('dual-weapon-selection');

    const secondSelect = document.createElement('select');
    secondSelect.id = `${item._source?.key || item._id || Date.now()}-second`;

    dropdownContainer.appendChild(secondSelect);
    container.appendChild(dropdownContainer);

    return { dropdownContainer, secondSelect };
  }

  /**
   * Get weapon lookup key from item
   * @param {Object} item - OR block item
   * @returns {string} Weapon lookup key
   */
  getWeaponLookupKey(item) {
    const andGroup = item.children.find((child) => child.type === 'AND');
    const weaponChild = andGroup.children.find((child) => child.type === 'weapon' && ['martialM', 'mar', 'simpleM', 'sim'].includes(child.key));
    return weaponChild.key;
  }

  /**
   * Get sorted weapon options for lookup key
   * @param {string} weaponLookupKey - Weapon type key
   * @returns {Array<Object>} Sorted weapon options
   */
  getWeaponOptions(weaponLookupKey) {
    const weaponOptions = Array.from(this.parser.constructor.lookupItems[weaponLookupKey].items || []);
    return weaponOptions.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Populate weapon dropdown with options
   * @param {HTMLSelectElement} select - Select element
   * @param {Array<Object>} weaponOptions - Weapon options
   */
  populateWeaponDropdown(select, weaponOptions) {
    select.innerHTML = '';
    weaponOptions.forEach((weapon, index) => {
      const option = document.createElement('option');
      option.value = weapon?.uuid || weapon?._id || `weapon-${index}`;
      option.innerHTML = weapon.name;
      if (index === 0) option.selected = true;
      select.appendChild(option);
    });
  }

  /**
   * Populate second dropdown with weapons and shields
   * @param {HTMLSelectElement} secondSelect - Secondary select element
   * @param {Array<Object>} weaponOptions - Weapon options
   */
  populateSecondDropdown(secondSelect, weaponOptions) {
    secondSelect.innerHTML = '';

    // Add weapon options
    this.addOptionsToSelect(secondSelect, weaponOptions, (weapon, index) => ({
      value: weapon?.uuid || weapon?._id || `weapon-${index}`,
      text: weapon.name,
      selected: index === 0
    }));

    // Add shield options
    const shieldOptions = Array.from(this.parser.constructor.lookupItems.shield.items || []).sort((a, b) => a.name.localeCompare(b.name));

    this.addOptionsToSelect(secondSelect, shieldOptions, (shield) => ({
      value: shield?.uuid || shield?._id,
      text: shield.name,
      selected: false
    }));
  }

  /**
   * Add options to a select element using mapper function
   * @param {HTMLSelectElement} select - Select element
   * @param {Array<Object>} options - Option data
   * @param {Function} optionMapper - Function to map option data to HTML properties
   */
  addOptionsToSelect(select, options, optionMapper) {
    options.forEach((item, index) => {
      const { value, text, selected } = optionMapper(item, index);
      const option = document.createElement('option');
      option.value = value;
      option.innerHTML = text;
      if (selected) option.selected = true;
      select.appendChild(option);
    });
  }

  /**
   * Set up multi-quantity choice UI
   * @param {Object} item - OR block item
   * @param {HTMLSelectElement} select - Primary select element
   * @param {HTMLElement} container - Container element
   */
  async setupMultiQuantityChoice(item, select, container) {
    const weaponTypeChild = this.findWeaponTypeChild(item);
    const { dropdownContainer, secondSelect, secondLabel } = this.createMultiQuantityUI(item, container);

    select.addEventListener('change', (event) => this.handleMultiQuantityChange(event, secondLabel, secondSelect, weaponTypeChild, item));
  }

  /**
   * Create UI elements for multi-quantity choice
   * @param {Object} item - OR block item
   * @param {HTMLElement} container - Container element
   * @returns {Object} Created UI elements
   */
  createMultiQuantityUI(item, container) {
    const dropdownContainer = document.createElement('div');
    dropdownContainer.classList.add('dual-weapon-selection');

    const secondSelect = document.createElement('select');
    secondSelect.id = `${item._source.key}-second`;
    secondSelect.style.display = 'none';

    const secondLabel = document.createElement('label');
    secondLabel.htmlFor = secondSelect.id;
    secondLabel.innerHTML = game.i18n.localize('hm.app.equipment.choose-second-weapon');
    secondLabel.style.display = 'none';
    secondLabel.classList.add('second-weapon-label');

    dropdownContainer.appendChild(secondLabel);
    dropdownContainer.appendChild(secondSelect);
    container.appendChild(dropdownContainer);

    return { dropdownContainer, secondSelect, secondLabel };
  }

  /**
   * Handle change event for multi-quantity select
   * @param {Event} event - Change event
   * @param {HTMLLabelElement} secondLabel - Label for second select
   * @param {HTMLSelectElement} secondSelect - Second select element
   * @param {Object} weaponTypeChild - Weapon type child
   * @param {Object} item - Parent OR item
   * @returns {Promise<void>}
   */
  async handleMultiQuantityChange(event, secondLabel, secondSelect, weaponTypeChild, item) {
    const isWeaponSelection = event.target.value !== this.extractLinkedItemId(item);
    secondLabel.style.display = isWeaponSelection ? 'block' : 'none';
    secondSelect.style.display = isWeaponSelection ? 'block' : 'none';

    if (isWeaponSelection) {
      this.populateWeaponTypeDropdown(secondSelect, weaponTypeChild);
    }
  }

  /**
   * Populate dropdown with weapon options of specific type
   * @param {HTMLSelectElement} select - Select element
   * @param {Object} weaponTypeChild - Weapon type child
   */
  populateWeaponTypeDropdown(select, weaponTypeChild) {
    select.innerHTML = `<option value="">${game.i18n.localize('hm.app.equipment.select-weapon')}</option>`;

    const lookupOptions = Array.from(this.parser.constructor.lookupItems[weaponTypeChild.key] || []).sort((a, b) => a.name.localeCompare(b.name));

    lookupOptions.forEach((option) => {
      const optionElement = document.createElement('option');
      optionElement.value = option?.uuid || option._source.key;
      optionElement.innerHTML = option.name;
      select.appendChild(optionElement);
    });
  }

  /**
   * Render standard OR choice options
   * @param {Object} item - OR block item
   * @param {HTMLSelectElement} select - Select element
   */
  async renderStandardOrChoice(item, select) {
    const renderedItemNames = new Set();
    const nonFocusItems = item.children.filter((child) => child.type !== 'focus');
    const focusItem = item.children.find((child) => child.type === 'focus');

    if (focusItem) {
      await this.addFocusOptions(item, select, focusItem, nonFocusItems, renderedItemNames);
    }

    for (const child of nonFocusItems) {
      await this.renderChildOption(child, select, renderedItemNames);
    }
  }

  /**
   * Render appropriate option based on child type
   * @param {Object} child - Child item
   * @param {HTMLSelectElement} select - Select element
   * @param {Set<string>} renderedItemNames - Set of rendered item names
   * @returns {Promise<void>}
   */
  async renderChildOption(child, select, renderedItemNames) {
    if (child.type === 'AND') {
      await this.renderAndGroup(child, select, renderedItemNames);
    } else if (['linked', 'weapon', 'tool', 'armor'].includes(child.type)) {
      await this.renderIndividualItem(child, select, renderedItemNames);
    } else if (child.key && !child.type) {
      this.renderGenericOption(child, select, renderedItemNames);
    }
  }

  /**
   * Render generic option for items with key but no type
   * @param {Object} child - Child item
   * @param {HTMLSelectElement} select - Select element
   * @param {Set<string>} renderedItemNames - Set of rendered item names
   */
  renderGenericOption(child, select, renderedItemNames) {
    const optionElement = document.createElement('option');
    optionElement.value = child?.uuid || child?.key || child?._id;
    optionElement.innerHTML = child.label || child.name || child.key || game.i18n.localize('hm.app.equipment.unknown-choice');
    select.appendChild(optionElement);
    renderedItemNames.add(optionElement.innerHTML);
  }

  /**
   * Add focus options to select element
   * @param {Object} item - OR block item
   * @param {HTMLSelectElement} select - Select element
   * @param {Object} focusItem - Focus item
   * @param {Array<Object>} nonFocusItems - Non-focus items
   * @param {Set<string>} renderedItemNames - Set of rendered item names
   */
  async addFocusOptions(item, select, focusItem, nonFocusItems, renderedItemNames) {
    try {
      const focusType = focusItem.key;
      const focusConfig = CONFIG.DND5E.focusTypes[focusType];

      if (!focusConfig) {
        HM.log(2, `No focus configuration found for type: ${focusType}`);
        return;
      }

      const pouchItem = nonFocusItems.find((child) => child.type === 'linked' && child.label?.toLowerCase().includes(game.i18n.localize('hm.app.equipment.pouch').toLowerCase()));

      if (pouchItem) {
        this.addPouchOption(pouchItem, select, renderedItemNames);
      }

      this.addFocusTypeOptions(focusConfig, select);
    } catch (error) {
      HM.log(1, `Error adding focus options: ${error.message}`);
    }
  }

  /**
   * Add component pouch option to select
   * @param {Object} pouchItem - Pouch item
   * @param {HTMLSelectElement} select - Select element
   * @param {Set<string>} renderedItemNames - Set of rendered item names
   */
  addPouchOption(pouchItem, select, renderedItemNames) {
    pouchItem.rendered = true;
    renderedItemNames.add('Component Pouch');

    const pouchOption = document.createElement('option');
    pouchOption.value = pouchItem?.uuid || pouchItem?._source?.key;
    pouchOption.innerHTML = pouchItem.label || pouchItem.name;
    pouchOption.selected = true;
    select.appendChild(pouchOption);

    const defaultSelection = select.parentElement.querySelector(`#${select.id}-default`);
    if (defaultSelection) {
      defaultSelection.value = pouchItem._source.key;
    }
  }

  /**
   * Add focus type options to select element
   * @param {Object} focusConfig - Focus configuration
   * @param {HTMLSelectElement} select - Select element
   */
  addFocusTypeOptions(focusConfig, select) {
    Object.entries(focusConfig.itemIds).forEach(([focusName, itemId]) => {
      const option = document.createElement('option');
      option.value = itemId;
      option.innerHTML = focusName.charAt(0).toUpperCase() + focusName.slice(1);
      select.appendChild(option);
    });
  }

  /**
   * Render an AND group as an option
   * @param {Object} child - AND group
   * @param {HTMLSelectElement} select - Select element
   * @param {Set<string>} renderedItemNames - Set of rendered names
   */
  async renderAndGroup(child, select, renderedItemNames) {
    HM.log(3, 'Processing AND group', { child, select, renderedItemNames });

    let combinedLabel = '';
    const combinedIds = [];
    const lookupKeys = ['sim', 'mar', 'simpleM', 'simpleR', 'martialM', 'martialR', 'shield'];
    const processedIds = new Set();

    // Check if part of an OR choice
    const isPartOfOrChoice = this.isPartOfOrChoice(child);

    if (!child?.children?.length) {
      return;
    }

    for (const subChild of child.children) {
      try {
        if (processedIds.has(subChild._id)) continue;
        processedIds.add(subChild._id);

        if (lookupKeys.includes(subChild.key)) {
          if (combinedLabel) combinedLabel += ', ';
          const lookupLabel = this.getLookupKeyLabel(subChild.key);
          combinedLabel +=
            `${subChild.count > 1 || subChild.count !== null ? subChild.count : ''} <a class="content-link" draggable="true" data-uuid="${subChild.key}" data-source="andGroup">${lookupLabel}</a>`.trim();
          combinedIds.push(subChild._id);

          if (isPartOfOrChoice) {
            subChild.rendered = true;
            subChild.isSpecialCase = true;
          }
          continue;
        }

        // Handle normal linked items
        const subChildItem = await fromUuidSync(subChild.key);
        if (!subChildItem) throw new Error(`Item not found for UUID: ${subChild.key}`);

        if (combinedLabel) combinedLabel += ', ';
        combinedLabel += `${subChild.count > 1 || subChild.count !== null ? subChild.count : ''} <a class="content-link" draggable="true" data-uuid="${subChild.key}">${subChildItem.name}</a>`.trim();
        combinedIds.push(subChild?.uuid || subChild?._id);

        if (isPartOfOrChoice) {
          subChild.rendered = true;
          subChild.isSpecialCase = true;
        }
        this.parser.constructor.combinedItemIds.add(subChild._id);
      } catch (error) {
        HM.log(1, `Error processing sub-child in AND group for child ${child._id}: ${error.message}`);
        continue;
      }
    }

    if (combinedLabel && !renderedItemNames.has(combinedLabel)) {
      renderedItemNames.add(combinedLabel);
      const optionElement = document.createElement('option');
      optionElement.value = combinedIds.join(',');
      optionElement.innerHTML = combinedLabel;
      select.appendChild(optionElement);

      // Mark all items in the combination as rendered
      combinedIds.forEach((id) => {
        this.parser.constructor.renderedItems.add(id);
        this.parser.constructor.combinedItemIds.add(id);
      });

      if (isPartOfOrChoice) {
        child.rendered = true;
        child.isSpecialCase = true;
      }
    }
  }

  /**
   * Check if item is part of an OR choice
   * @param {Object} child - Item to check
   * @returns {boolean} True if part of OR choice
   */
  isPartOfOrChoice(child) {
    if (!child.group) return false;

    return this.parser.equipmentData.class.some((p) => p._id === child.group && p.type === 'OR') || this.parser.equipmentData.background.some((p) => p._id === child.group && p.type === 'OR');
  }

  /**
   * Render an individual item as an option
   * @param {Object} child - Item to render
   * @param {HTMLSelectElement} select - Select element
   * @param {Set<string>} renderedItemNames - Set of rendered names
   */
  async renderIndividualItem(child, select, renderedItemNames) {
    HM.log(3, 'Processing Individual Item', { child, select, renderedItemNames });

    if (child.type === 'linked') {
      if (this.parser.constructor.combinedItemIds.has(child._source.key)) return;

      const label = child.label.trim();
      const [, count, name] = label.match(/^(\d+)\s*(.+)$/) || [null, null, label];
      const displayName = name || label.replace(/\s*\(.*?\)\s*/g, '');
      const cleanDisplayName = displayName.replace(/\s*\(if proficient\)\s*/gi, '');

      if (renderedItemNames.has(displayName) || this.parser.constructor.combinedItemIds.has(child._source.key)) return;
      renderedItemNames.add(displayName);

      const optionElement = document.createElement('option');
      optionElement.value = child?.uuid || child._source.key;
      optionElement.innerHTML = `${count > 1 ? `${count} ${cleanDisplayName}` : cleanDisplayName}`;

      if (select.options.length === 0) {
        optionElement.selected = true;
        const defaultSelection = select.parentElement.querySelector(`#\\3${select.id}-default`);
        if (defaultSelection) {
          defaultSelection.value = child?.uuid || child._source?.key || child._id;
        }
      }

      if (child.requiresProficiency) {
        const requiredProficiency = `${child.type}:${child.key}`;
        if (!this.parser.proficiencies.has(requiredProficiency)) {
          optionElement.disabled = true;
          optionElement.innerHTML = `${optionElement.innerHTML} (${game.i18n.localize('hm.app.equipment.lacks-proficiency')})`;
        }
      }

      select.appendChild(optionElement);
    } else if (['weapon', 'armor', 'tool', 'shield'].includes(child.type)) {
      await this.renderLookupOptions(child, select, renderedItemNames);
    }
  }

  /**
   * Render lookup options for a select element
   * @param {Object} child - Item with lookup key
   * @param {HTMLSelectElement} select - Select element
   * @param {Set<string>} renderedItemNames - Set of rendered names
   */
  async renderLookupOptions(child, select, renderedItemNames) {
    HM.log(3, 'Processing Lookup Options', { child, select, renderedItemNames });

    try {
      const lookupOptions = Array.from(this.parser.constructor.lookupItems[child.key].items || []);
      lookupOptions.sort((a, b) => a.name.localeCompare(b.name));

      let defaultSelection = select.parentElement.querySelector(`#\\3${select.id}-default`);
      if (!defaultSelection) {
        defaultSelection = document.createElement('input');
        defaultSelection.type = 'hidden';
        defaultSelection.id = `${select.id}-default`;
        select.parentElement.appendChild(defaultSelection);
      }

      let shouldSelectFirst = select.options.length === 0;
      let isFirstEnabledOption = true;

      lookupOptions.forEach((option) => {
        if (renderedItemNames.has(option.name)) return;
        if (option.rendered && option.sort === child.sort && option.group === child.group) return;

        const uuid = option.uuid;
        if (!uuid) {
          HM.log(2, `No UUID found for item ${option.id}`, option);
          return;
        }

        option.rendered = true;
        option.group = child.group;
        option.sort = child.sort;
        option.key = child.key;

        renderedItemNames.add(option.name);

        const optionElement = document.createElement('option');
        optionElement.value = uuid;
        optionElement.innerHTML = option.name;
        let isEnabled = true;

        if (child.requiresProficiency) {
          const requiredProficiency = `${child.type}:${child.key}`;
          if (!this.parser.proficiencies.has(requiredProficiency)) {
            optionElement.disabled = true;
            optionElement.innerHTML = `${option.name} (${game.i18n.localize('hm.app.equipment.lacks-proficiency')})`;
            isEnabled = false;
          }
        }

        // Only set as selected if this is the first enabled option AND we should select first
        if (shouldSelectFirst && isFirstEnabledOption && !optionElement.disabled && isEnabled) {
          optionElement.selected = true;
          defaultSelection.value = uuid;
          select.value = uuid;
          isFirstEnabledOption = false;
        }

        select.appendChild(optionElement);
      });
    } catch (error) {
      HM.log(1, `Error retrieving lookup options for ${child.key}: ${error.message}`);
    }
  }
}
