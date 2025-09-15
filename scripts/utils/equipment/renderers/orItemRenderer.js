import { BaseItemRenderer, HM } from '../../index.js';

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

    // Create header row for OR block
    const headerRow = document.createElement('tr');
    const headerCell = document.createElement('th');
    headerCell.colSpan = 2;
    headerRow.appendChild(headerCell);
    itemContainer.appendChild(headerRow);

    // Add OR block header label to header cell
    await this.addOrBlockHeader(item, headerCell);

    // Create select row
    const selectRow = document.createElement('tr');
    const selectCell = document.createElement('td');
    const starCell = document.createElement('td');
    selectRow.appendChild(selectCell);
    selectRow.appendChild(starCell);
    itemContainer.appendChild(selectRow);

    // Create select element and add to select cell
    const select = this.createSelectElement(item);
    selectCell.appendChild(select);

    // Create hidden default selection field
    const defaultSelection = this.createDefaultSelectionField(select);
    selectCell.appendChild(defaultSelection);

    this.setupSelectChangeListener(select, defaultSelection);

    // Handle specialized rendering
    const isWeaponShieldChoice = this.isWeaponShieldChoice(item);
    const isMultiCountChoice = this.isMultiCountChoice(item);
    const isMultiQuantityChoice = this.isMultiQuantityChoice(item) && this.findWeaponTypeChild(item);

    if (isWeaponShieldChoice) {
      await this.setupWeaponShieldChoice(item, select, itemContainer);
      return itemContainer;
    } else if (isMultiCountChoice) {
      await this.setupMultiCountChoice(item, select, itemContainer);
      return itemContainer;
    } else if (isMultiQuantityChoice) {
      await this.setupMultiQuantityChoice(item, select, itemContainer);
    } else {
      await this.renderStandardOrChoice(item, select);
      this.addFavoriteStar(itemContainer, item);
    }

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
   * Add a header label to an OR block
   * @param {Object} item - OR block item
   * @param {HTMLElement} container - Container element
   */
  async addOrBlockHeader(item, headerCell) {
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

    headerCell.appendChild(labelElement);
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
   * Check if this is a multi-count choice where both options have same count > 1
   * @param {Object} item - OR block item
   * @returns {boolean} True if multi-count choice
   */
  isMultiCountChoice(item) {
    // Need at least 2 children to compare
    if (!item?.children?.length || item.children.length < 2) return false;

    // Check for linked item with count > 1
    const linkedWithCount = item.children.find((child) => child.type === 'linked' && child.count && child.count > 1);

    // Check for weapon type with count > 1
    const weaponWithCount = item.children.find(
      (child) => child.type === 'weapon' && ['simpleM', 'simpleR', 'martialM', 'martialR', 'sim', 'mar'].includes(child.key) && child.count && child.count > 1
    );

    // Both must exist and have the same count
    return linkedWithCount && weaponWithCount && linkedWithCount.count === weaponWithCount.count;
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
   * Set up weapon-shield choice UI using tables
   * @param {Object} item - OR block item
   * @param {HTMLSelectElement} select - Primary select element
   * @param {HTMLElement} container - Table container
   */
  async setupWeaponShieldChoice(item, select, container) {
    // Remove any existing content to start fresh
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Keep the header row if it exists
    const headerRow = document.createElement('tr');
    const headerCell = document.createElement('th');
    headerCell.colSpan = 2;

    const headerLabel = document.createElement('h4');
    headerLabel.classList.add('parent-label');
    headerLabel.innerHTML = item.label || game.i18n.localize('hm.app.equipment.choose-one');

    headerCell.appendChild(headerLabel);
    headerRow.appendChild(headerCell);
    container.appendChild(headerRow);

    // Get weapon options for both selects
    const weaponLookupKey = this.getWeaponLookupKey(item);
    const weaponOptions = this.getWeaponOptions(weaponLookupKey);

    // Create first select row
    const firstRow = document.createElement('tr');
    const firstCell = document.createElement('td');
    const firstStarCell = document.createElement('td');

    select.setAttribute('data-item-name', 'Primary Weapon');
    firstCell.appendChild(select);
    firstRow.appendChild(firstCell);
    firstRow.appendChild(firstStarCell);
    container.appendChild(firstRow);

    // Create second select with its own row
    const secondSelect = document.createElement('select');
    secondSelect.id = `${item._source?.key || item._id || Date.now()}-second`;
    secondSelect.setAttribute('data-item-name', 'Secondary Weapon/Shield');

    const secondRow = document.createElement('tr');
    const secondCell = document.createElement('td');
    const secondStarCell = document.createElement('td');

    secondCell.appendChild(secondSelect);
    secondRow.appendChild(secondCell);
    secondRow.appendChild(secondStarCell);
    container.appendChild(secondRow);

    // Populate selects with options
    this.populateWeaponDropdown(select, weaponOptions);
    this.populateSecondDropdown(secondSelect, weaponOptions);

    // Create favorite stars with proper data attributes
    this.createDynamicFavoriteStar(firstStarCell, 'Primary Weapon', select);
    this.createDynamicFavoriteStar(secondStarCell, 'Secondary Weapon/Shield', secondSelect);

    // Add change listener
    select.addEventListener('change', () => {
      this.populateSecondDropdown(secondSelect, weaponOptions);
    });
  }

  /**
   * Set up multi-count choice UI
   * @param {Object} item - OR block item
   * @param {HTMLSelectElement} select - Primary select element
   * @param {HTMLElement} container - Table container
   */
  async setupMultiCountChoice(item, select, container) {
    // Clear container
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Create header row
    const headerRow = document.createElement('tr');
    const headerCell = document.createElement('th');
    headerCell.colSpan = 2;

    const headerLabel = document.createElement('h4');
    headerLabel.classList.add('parent-label');
    headerLabel.innerHTML = item.label;

    headerCell.appendChild(headerLabel);
    headerRow.appendChild(headerCell);
    container.appendChild(headerRow);

    // Get count for items
    const weaponChild = item.children.find((child) => child.type === 'weapon');
    const linkedChild = item.children.find((child) => child.type === 'linked');
    const count = weaponChild?.count || linkedChild?.count || 1;

    // Get all available options
    const options = [];

    // Add linked item option
    if (linkedChild) {
      try {
        const linkedDoc = await fromUuidSync(linkedChild._source?.key);
        if (linkedDoc) {
          options.push({
            value: linkedChild._source.key,
            text: linkedDoc.name
          });
        }
      } catch (error) {
        HM.log(1, `Error getting linked item: ${error.message}`);
      }
    }

    // Add weapon type options
    if (weaponChild) {
      const weaponOptions = Array.from(this.parser.constructor.lookupItems[weaponChild.key]?.items || []);
      weaponOptions.sort((a, b) => a.name.localeCompare(b.name));

      for (const weapon of weaponOptions) {
        options.push({
          value: weapon.uuid || weapon._id,
          text: weapon.name
        });
      }
    }

    // Create a dropdown for each count
    for (let i = 0; i < count; i++) {
      const rowIndex = i + 1;
      const selectRow = document.createElement('tr');
      const selectCell = document.createElement('td');
      const starCell = document.createElement('td');

      // Create select element (reuse first one)
      const itemSelect = i === 0 ? select : document.createElement('select');
      itemSelect.id = i === 0 ? select.id : `${select.id}-item${i}`;
      itemSelect.setAttribute('data-item-name', `Item ${rowIndex}`);

      // Populate options
      itemSelect.innerHTML = '';
      options.forEach((option, index) => {
        const optElement = document.createElement('option');
        optElement.value = option.value;
        optElement.innerHTML = option.text;
        if (index === 0) optElement.selected = true;
        itemSelect.appendChild(optElement);
      });

      // Add to DOM
      selectCell.appendChild(itemSelect);
      selectRow.appendChild(selectCell);
      selectRow.appendChild(starCell);
      container.appendChild(selectRow);

      // Add favorite star
      this.createDynamicFavoriteStar(starCell, `Item ${rowIndex}`, itemSelect);
    }
  }

  /**
   * Creates a dynamic favorite star UI element for equipment items
   * @param {HTMLElement} starCell - The table cell where the favorite star will be placed
   * @param {string} displayName - The display name to use for the item in favorites
   * @param {HTMLSelectElement} selectElement - The select element containing equipment options
   * @returns {HTMLInputElement} The checkbox element for the favorite star
   */
  createDynamicFavoriteStar(starCell, displayName, selectElement) {
    const favoriteContainer = document.createElement('div');
    favoriteContainer.classList.add('equipment-favorite-container');

    const favoriteLabel = document.createElement('label');
    favoriteLabel.classList.add('equipment-favorite-label');
    favoriteLabel.title = game.i18n.localize('hm.app.equipment.add-favorites');

    const favoriteCheckbox = document.createElement('input');
    favoriteCheckbox.type = 'checkbox';
    favoriteCheckbox.classList.add('equipment-favorite-checkbox');
    favoriteCheckbox.dataset.itemName = displayName;
    favoriteCheckbox.dataset.itemUuids = selectElement.value; // Initial value
    favoriteCheckbox.id = `fav-${selectElement.id}`;

    const starIcon = document.createElement('i');
    starIcon.classList.add('fa-bookmark', 'equipment-favorite-star', 'fa-thin');

    // Add change handlers for checkbox
    favoriteCheckbox.addEventListener('change', function () {
      if (this.checked) {
        starIcon.classList.remove('fa-thin');
        starIcon.classList.add('fa-solid');
      } else {
        starIcon.classList.remove('fa-solid');
        starIcon.classList.add('fa-thin');
      }
    });

    // Add change handlers for select to update UUID
    selectElement.addEventListener('change', function (event) {
      favoriteCheckbox.dataset.itemUuids = event.target.value;
    });

    favoriteLabel.appendChild(favoriteCheckbox);
    favoriteLabel.appendChild(starIcon);
    favoriteContainer.appendChild(favoriteLabel);
    starCell.appendChild(favoriteContainer);

    return favoriteCheckbox;
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

    // Create second select with its own row and star cell
    const secondSelect = document.createElement('select');
    secondSelect.id = `${item._source?.key || item._id || Date.now()}-second`;
    secondSelect.style.display = 'none'; // Initially hidden
    secondSelect.setAttribute('data-item-name', 'Secondary Weapon');

    const secondRow = document.createElement('tr');
    const secondCell = document.createElement('td');
    const secondStarCell = document.createElement('td');

    // Create and add the second label
    const secondLabel = document.createElement('label');
    secondLabel.htmlFor = secondSelect.id;
    secondLabel.innerHTML = game.i18n.localize('hm.app.equipment.choose-second-weapon');
    secondLabel.style.display = 'none'; // Initially hidden
    secondLabel.classList.add('second-weapon-label');

    secondCell.appendChild(secondLabel);
    secondCell.appendChild(secondSelect);
    secondRow.appendChild(secondCell);
    secondRow.appendChild(secondStarCell);
    container.appendChild(secondRow);

    // Add favorite button for second select
    const secondFavoriteContainer = this.createDynamicFavoriteStar(secondStarCell, 'Secondary Weapon', secondSelect);
    secondStarCell.appendChild(secondFavoriteContainer);

    // Handle visibility of the second select
    select.addEventListener('change', (event) => {
      const isWeaponSelection = event.target.value !== this.extractLinkedItemId(item);
      secondLabel.style.display = isWeaponSelection ? 'block' : 'none';
      secondSelect.style.display = isWeaponSelection ? 'block' : 'none';
      secondStarCell.style.display = isWeaponSelection ? 'table-cell' : 'none';

      if (isWeaponSelection) {
        this.populateWeaponTypeDropdown(secondSelect, weaponTypeChild);
      }
    });
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
      await this.addFocusOptions(select, focusItem, nonFocusItems, renderedItemNames);
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
   * @param {HTMLSelectElement} select - Select element
   * @param {Object} focusItem - Focus item
   * @param {Array<Object>} nonFocusItems - Non-focus items
   * @param {Set<string>} renderedItemNames - Set of rendered item names
   */
  async addFocusOptions(select, focusItem, nonFocusItems, renderedItemNames) {
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
