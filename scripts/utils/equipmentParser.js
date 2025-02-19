import { HM } from '../hero-mancer.js';

export class EquipmentParser {
  /** @type {Set<string>} Set of valid simple melee weapons. */
  static simpleM = new Set();

  /** @type {Set<string>} Set of valid simple ranged weapons.*/
  static simpleR = new Set();

  /** @type {Set<string>} Set of valid martial melee weapons. */
  static martialM = new Set();

  /** @type {Set<string>} Set of valid martial ranged weapons. */
  static martialR = new Set();

  /** @type {Set<string>} Set of valid musical instruments. */
  static music = new Set();

  /** @type {Set<string>} Set of valid shields. */
  static shield = new Set();

  /** @type {Set<string>} Set of valid armor types. */
  static armor = new Set();

  /** @type {Set<string>} Set of valid foci. */
  static focus = new Set();

  /** @type {Map<string, any>} Cache for storing content lookup results */
  static contentCache = new Map();

  /** @type {Set<string>} Tracks rendered equipment items to prevent duplicates */
  static renderedItems = new Set();

  /** @type {Set<string>} Tracks combined item IDs for multi-item equipment */
  static combinedItemIds = new Set();

  /**
   * Retrieves all selected compendium packs from settings.
   * Combines item packs, class packs, background packs, and race packs into a single array.
   * @async
   * @static
   * @returns {Promise<string[]>} Array of compendium pack IDs
   */
  static async getSelectedItemPacks() {
    const itemPacks = (await game.settings.get('hero-mancer', 'itemPacks')) || [];
    const classPacks = (await game.settings.get('hero-mancer', 'classPacks')) || [];
    const backgroundPacks = (await game.settings.get('hero-mancer', 'backgroundPacks')) || [];
    const racePacks = (await game.settings.get('hero-mancer', 'racePacks')) || [];

    return [...itemPacks, ...classPacks, ...backgroundPacks, ...racePacks];
  }

  /**
   * Initializes the content cache by loading indices from all Item-type compendium packs
   * @static
   * @async
   * @throws {Error} If pack index loading fails
   */
  static async initializeContentCache() {
    const selectedPacks = await this.getSelectedItemPacks();
    const packs = selectedPacks.map((id) => game.packs.get(id)).filter((p) => p?.documentName === 'Item');
    await Promise.all(packs.map((p) => p.getIndex({ fields: ['system.contents', 'uuid'] })));
    HM.log(3, `EquipmentParser cache initialized with ${this.contentCache.size} entries`);
  }

  constructor() {
    this.equipmentData = null;
    this.classId = HM.CONFIG.SELECT_STORAGE.class.selectedId;
    this.backgroundId = HM.CONFIG.SELECT_STORAGE.background.selectedId;
    this.proficiencies = new Set();
    EquipmentParser.initializeContentCache();
  }

  /**
   * Searches all selectedPacks for a document by ID
   * @async
   * @param {string} itemId Item ID to search for
   * @returns {Promise<Item|null>} Found item document or null
   */
  async findItemInCompendiums(itemId) {
    const selectedPacks = await EquipmentParser.getSelectedItemPacks();
    for (const packId of selectedPacks) {
      const pack = game.packs.get(packId);
      if (pack?.documentName === 'Item') {
        const item = await pack.getDocument(itemId);
        if (item) return item;
      }
    }
    return null;
  }

  /**
   * Fetches starting equipment and proficiencies for a given selection type
   * @async
   * @param {('class'|'background')} type Selection type to fetch equipment for
   * @returns {Promise<Array<object>>} Starting equipment array
   * @throws {Error} If compendium lookup fails
   */
  async getStartingEquipment(type) {
    const { selectedId } = HM.CONFIG.SELECT_STORAGE[type] || {};
    HM.log(3, `START getStartingEquipment - type: ${type}, selectedId: ${selectedId}`);

    if (!selectedId) {
      HM.log(2, `No selection found for type: ${type}. Ignore this warning if first-render.`);
      return [];
    }

    const doc = await this.findItemInCompendiums(selectedId);
    HM.log(3, `Found doc for ${type}:`, doc?.name);

    if (doc) {
      this.proficiencies = await this.getProficiencies(doc.system.advancement || []);

      // Handle default startingEquipment if it exists and has items
      if (doc.system?.startingEquipment?.length > 0) {
        HM.log(3, `Found startingEquipment for ${doc.name}:`, doc.system.startingEquipment);
        return doc.system.startingEquipment;
      }

      // Parse from description if no startingEquipment items
      if (type === 'background' || type === 'class') {
        return await this.parseEquipmentFromDescription(doc);
      }
    } else {
      HM.log(2, `No document found for type ${type} with selectedId ${selectedId}`, { doc: doc });
    }

    HM.log(3, `END getStartingEquipment - type: ${type} - returning empty array`);
    return [];
  }

  async parseEquipmentFromDescription(doc) {
    HM.log(3, `Attempting to parse equipment from description for ${doc.name}`);
    const description = doc.system.description.value;
    const equipmentMatch = description.match(/<strong>Equipment:<\/strong>([^<]+)/);

    if (!equipmentMatch) {
      HM.log(2, `No equipment section found in description for ${doc.name}`);
      return [];
    }

    const equipment = equipmentMatch[1].trim();
    const items = equipment
      .split(/,|\sand\s/)
      .map((i) => i.trim())
      .filter((i) => i.length > 0); // Filter out empty strings
    HM.log(3, 'Raw equipment items:', items);

    // Clean and normalize each item name
    const cleanedItems = items.map((item) => {
      const cleaned = item
        .replace(/^(a|an|the)\s+/i, '') // Remove articles
        .replace(/\s+of\s+(?:your\s+)?choice$/i, '') // Remove "of choice"
        .trim();

      // Extract quantity if present
      const quantityMatch = cleaned.match(/^(\d+)\s+(.+)$/);
      return {
        name: quantityMatch ? quantityMatch[2] : cleaned,
        count: quantityMatch ? parseInt(quantityMatch[1]) : null
      };
    });

    HM.log(3, 'Cleaned items for search:', cleanedItems);

    const itemPacks = await game.settings.get('hero-mancer', 'itemPacks');
    const matches = [];

    for (const item of cleanedItems) {
      let bestMatch = null;
      let bestScore = 0;

      for (const packId of itemPacks) {
        const pack = game.packs.get(packId);
        if (!pack?.documentName === 'Item') continue;

        const index = await pack.getIndex();

        for (const entry of index) {
          const searchTerms = [item.name.toLowerCase(), ...item.name.toLowerCase().split(/\s+/)];

          for (const term of searchTerms) {
            // Skip very short terms
            if (term.length < 3) continue;

            const score = this.calculateSimilarity(term, entry.name.toLowerCase());
            if (score > bestScore && score > 0.4) {
              // 40% similarity threshold
              bestScore = score;
              bestMatch = entry;
            }
          }
        }
      }

      if (bestMatch) {
        HM.log(3, `Found match for "${item.name}": "${bestMatch.name}" (score: ${bestScore.toFixed(2)})`);
        matches.push({
          type: 'linked',
          count: item.count,
          key: bestMatch.uuid,
          requiresProficiency: false,
          _id: foundry.utils.randomID(16),
          group: '',
          sort: matches.length * 100000 + 100000,
          _source: {
            key: bestMatch.uuid
          }
        });
      } else {
        HM.log(2, `No match found for item: "${item.name}"`);
      }
    }

    if (matches.length > 0) {
      HM.log(3, `Returning ${matches.length} parsed equipment items for ${doc.name}:`, matches);
      return matches;
    }

    return [];
  }

  calculateSimilarity(str1, str2) {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;

    // Perfect substring match
    if (str2.includes(str1) || str1.includes(str2)) {
      return 0.9;
    }

    // Check word by word
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1.length > 2 && word2.length > 2) {
          if (word2.includes(word1) || word1.includes(word2)) {
            return 0.8;
          }
        }
      }
    }

    return 1.0 - this.levenshteinDistance(str1, str2) / maxLength;
  }

  levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1)
      .fill()
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] =
            1 +
            Math.min(
              dp[i - 1][j], // deletion
              dp[i][j - 1], // insertion
              dp[i - 1][j - 1] // substitution
            );
        }
      }
    }
    return dp[m][n];
  }

  /**
   * Extracts granted proficiencies from advancement data
   * @async
   * @param {Array<object>} advancements Array of advancement configurations
   * @returns {Promise<Set<string>>} Set of granted proficiency strings
   */
  async getProficiencies(advancements) {
    const proficiencies = new Set();

    for (const advancement of advancements) {
      if (advancement.configuration && advancement.configuration.grants) {
        for (const grant of advancement.configuration.grants) {
          proficiencies.add(grant);
        }
      }
    }
    HM.log(3, 'Collected proficiencies:', Array.from(proficiencies));
    return proficiencies;
  }

  /**
   * Retrieves and combines equipment data from class and background selections
   * @async
   */
  async fetchEquipmentData() {
    HM.log(3, 'Starting fetchEquipmentData...');
    const classEquipment = await this.getStartingEquipment('class');
    const backgroundEquipment = await this.getStartingEquipment('background');
    HM.log(3, 'Equipment fetched:', { class: classEquipment, background: backgroundEquipment });
    this.equipmentData = {
      class: classEquipment || [],
      background: backgroundEquipment || []
    };
    HM.log(3, 'equipmentData set:', this.equipmentData);
  }

  /**
   * Renders equipment selection UI for specified or all types
   * @async
   * @param {?string} type Optional type to render ('class'|'background'). If null, renders all
   * @returns {Promise<HTMLElement>} Container element with rendered equipment choices
   * @throws {Error} If rendering fails
   */
  async renderEquipmentChoices(type = null) {
    EquipmentParser.renderedItems = new Set();
    EquipmentParser.combinedItemIds = new Set();
    this.equipmentData = null;

    await EquipmentParser.initializeLookupItems();
    if (!EquipmentParser.lookupItems) {
      HM.log(1, 'Failed to initialize lookup items');
    }

    await this.fetchEquipmentData();
    if (!this.equipmentData) {
      HM.log(1, 'Failed to fetch equipment data');
    }

    HM.log(3, 'Rendering equipment choices:', { type: type, equipmentData: this.equipmentData });
    let container = document.querySelector('.equipment-choices');
    if (!container) {
      container = document.createElement('div');
      container.classList.add('equipment-choices');
    }

    const typesToRender = type ? [type] : Object.keys(this.equipmentData);

    for (const currentType of typesToRender) {
      const items = this.equipmentData[currentType] || [];

      // Check if the section for this type already exists, otherwise create it
      let sectionContainer = container.querySelector(`.${currentType}-equipment-section`);
      if (sectionContainer) {
        HM.log(3, `${currentType}-equipment-section already exists. Clearing and reusing.`);
        HM.log(3, 'Existing container:', sectionContainer);
        sectionContainer.innerHTML = ''; // Clear existing content if section exists
      } else {
        sectionContainer = document.createElement('div');
        sectionContainer.classList.add(`${currentType}-equipment-section`);
        container.appendChild(sectionContainer);
      }

      // Get the localized placeholder text for the current type
      const placeholderText = game.i18n.localize(`hm.app.${currentType}.select-placeholder`);
      const dropdown = document.querySelector(`#${currentType}-dropdown`);
      const dropdownText = dropdown.selectedOptions[0].innerHTML;
      const isPlaceholder = dropdownText === placeholderText;

      // Add a header for the section based on whether it's a placeholder
      const header = document.createElement('h3');
      /** TODO: Make this localization friendly. */
      header.innerHTML = isPlaceholder ? `${currentType.charAt(0).toUpperCase() + currentType.slice(1)} Equipment` : `${dropdownText} Equipment`;
      sectionContainer.appendChild(header);
      if (currentType === 'class' && this.classId) {
        await this.renderClassWealthOption(this.classId, sectionContainer);
      }
      for (const item of items) {
        const itemDoc = await fromUuidSync(item.key);
        HM.log(3, 'PROCESSING ITEM DEBUG:', { item: item, itemDoc: itemDoc });
        item.name = itemDoc?.name || item.key;
        const itemElement = await this.createEquipmentElement(item);

        if (itemElement) {
          sectionContainer.appendChild(itemElement);
        }
      }
    }
    return container;
  }

  /**
   * Creates and returns a DOM element for an equipment item
   * @async
   * @param {object} item Equipment item data
   * @returns {Promise<HTMLElement|null>} Equipment element or null if skipped/invalid
   */
  async createEquipmentElement(item) {
    if (!item) {
      HM.log(1, 'Null or undefined item passed to createEquipmentElement');
      return null;
    }

    if (this.isItemRendered(item)) {
      HM.log(3, `DEBUG: Skipping already rendered item: ${item._source.key}`, { item: item });
      return null;
    }

    HM.log(3, 'Creating equipment element:', {
      type: item.type,
      key: item.key,
      _source: item._source,
      children: item.children
    });

    const itemContainer = document.createElement('div');
    itemContainer.classList.add('equipment-item');

    if (!item.group) {
      const labelElement = document.createElement('h4');
      labelElement.classList.add('parent-label');

      let shouldAddLabel = false;

      if (item.key) {
        try {
          const itemDoc = await fromUuidSync(item.key);
          if (itemDoc) {
            labelElement.innerHTML = item.label || `${item.count || ''} ${itemDoc.name}`;
            shouldAddLabel = true;
          } else {
            HM.log(2, `No document found for item key: ${item.key}`, { item: item, labelElement: labelElement });
            labelElement.innerHTML = item.label || game.i18n.localize('hm.app.equipment.choose-one');
            shouldAddLabel = true;
          }
        } catch (error) {
          HM.log(1, `Error getting label for item ${item._source.key}: ${error.message}`, { item: item, labelElement: labelElement });
          labelElement.innerHTML = item.label || game.i18n.localize('hm.app.equipment.choose-one');
          shouldAddLabel = true;
        }
      }
      if (shouldAddLabel) {
        itemContainer.appendChild(labelElement);
      }
    }

    // First check if this is part of an OR choice
    if (item.group) {
      const parentItem = this.equipmentData.class.find((p) => p._id === item.group) || this.equipmentData.background.find((p) => p._id === item.group);
      if (parentItem?.type === 'OR') {
        return null;
      }
    }

    let result;
    switch (item.type) {
      case 'OR':
        HM.log(3, `DEBUG: Rendering OR block for item: ${item._source?.key}`, { item: item });
        result = await this.renderOrBlock(item, itemContainer);
        break;
      case 'AND':
        HM.log(3, `DEBUG: Rendering AND block for item: ${item._source?.key || item.type}`, { item: item });
        if (!item.group || this.isStandaloneAndBlock(item)) {
          result = await this.renderAndBlock(item, itemContainer);
        }
        break;
      case 'linked':
        HM.log(3, `DEBUG: Rendering linked item: ${item._source?.key}`, { item: item });
        result = await this.renderLinkedItem(item, itemContainer);
        break;
      case 'focus':
        HM.log(3, `DEBUG: Rendering focus item: ${item._source?.key}`, { item: item });
        result = await this.renderFocusItem(item, itemContainer);
        break;
      default:
        HM.log(3, `Unsupported item type: ${item.type}`, { item: item });
        return null;
    }

    if (result) {
      EquipmentParser.renderedItems.add(item._id);
    }

    return result;
  }

  /**
   * Checks if an AND block item is standalone (not part of an OR choice)
   * @param {object} item Equipment item to check
   * @returns {boolean} True if standalone
   */
  isStandaloneAndBlock(item) {
    return !this.equipmentData.class.some((p) => p._id === item.group && p.type === 'OR') && !this.equipmentData.background.some((p) => p._id === item.group && p.type === 'OR');
  }

  /**
   * Checks if an item has already been rendered
   * @param {object} item Item to check
   * @returns {boolean} True if item ID exists in renderedItems
   */
  isItemRendered(item) {
    return EquipmentParser.renderedItems.has(item._id);
  }

  /**
   * Detects special case of multi-option OR blocks with AND children
   * @param {object} item Item to check
   * @returns {boolean} True if special multi-option case
   */
  isSpecialMultiOptionCase(item) {
    return item.type === 'OR' && item.children.some((child) => child.type === 'AND' && child.children.length > 1) && item.children.some((entry) => entry.count && entry.count > 1);
  }

  /**
   * Renders special case multi-option equipment selections
   * @async
   * @param {object} item Multi-option item data
   * @returns {Promise<HTMLElement>} Container with multiple dropdowns
   * @throws {Error} If dropdown creation fails
   */
  async renderSpecialMultiOptionCase(item) {
    if (!item.children?.length) {
      HM.log(1, 'Invalid children array for special case item:', item);
      return null;
    }

    const itemContainer = document.createElement('div');
    itemContainer.classList.add('equipment-item');

    const labelElement = document.createElement('h4');
    labelElement.classList.add('parent-label');
    labelElement.innerHTML = item.label;
    itemContainer.appendChild(labelElement);

    const dropdown1 = await this.createDropdown(item, 'AND');
    const dropdown2 = await this.createDropdown(item, 'multiCount');
    itemContainer.appendChild(dropdown1);
    itemContainer.appendChild(dropdown2);

    return itemContainer;
  }

  /**
   * Creates a dropdown element for equipment selection
   * @async
   * @param {object} item Parent item data
   * @param {('AND'|'multiCount')} type Dropdown type
   * @returns {Promise<HTMLSelectElement>} Configured dropdown element
   * @throws {Error} If option creation fails
   */
  async createDropdown(item, type) {
    const dropdown = document.createElement('select');
    const group = item.children.find((child) => child.type === type && child.children.length > 1);

    if (!EquipmentParser.lookupItems[child.key]) {
      HM.log(1, `No lookup items found for key: ${child.key}`);
    }

    if (!group) {
      HM.log(1, `Required ${type} group not found for item:`, { item: item });
      return dropdown;
    } else {
      try {
        group.children.forEach((child) => {
          const lookupOptions = Array.from(EquipmentParser.lookupItems[child.key] || []);
          lookupOptions.sort((a, b) => a.name.localeCompare(b.name));

          lookupOptions.forEach((option) => {
            const optionElement = document.createElement('option');
            optionElement.value = option._id;
            optionElement.innerHTML = option.name;
            dropdown.appendChild(optionElement);
          });

          this.markAsRendered(child);
        });
      } catch (error) {
        HM.log(1, `Error in processing ${type} group for dropdown in special case: ${item._id}`, error);
      }
    }
    return dropdown;
  }

  /**
   * Marks an equipment entry as rendered in special case handling
   * @param {object} entry Equipment entry to mark
   */
  markAsRendered(entry) {
    entry.rendered = true;
    entry.isSpecialCase = true;
  }

  /**
   * Renders an OR-type equipment selection block
   * @async
   * @param {object} item OR block item data
   * @param {HTMLElement} itemContainer Container element
   * @returns {Promise<HTMLElement>} Modified container with selection elements
   */
  async renderOrBlock(item, itemContainer) {
    if (!item?.children?.length) {
      HM.log(1, 'Invalid OR block item:', item);
      return itemContainer;
    }

    if (!item._source) {
      HM.log(1, 'Missing _source property on OR block item:', item);
      return itemContainer;
    }

    HM.log(3, `Rendering OR block: ${item._id}`);

    const labelElement = document.createElement('h4');
    labelElement.classList.add('parent-label');
    labelElement.innerHTML = item.label || game.i18n.localize('hm.app.equipment.choose-one');
    itemContainer.appendChild(labelElement);

    const select = document.createElement('select');
    select.id = item._source?.key || item._id || `or-select-${Date.now()}`;

    const defaultSelection = document.createElement('input');
    defaultSelection.type = 'hidden';
    defaultSelection.id = `${select.id}-default`;
    itemContainer.appendChild(defaultSelection);

    // Create an event handler to track selections
    select.addEventListener('change', (event) => {
      defaultSelection.value = event.target.value;
    });

    itemContainer.appendChild(select);

    // Check for different types of specialized choices
    const isMultiQuantityChoice = this.isMultiQuantityChoice(item);
    const weaponTypeChild = this.findWeaponTypeChild(item);
    const hasFocusOption = item.children.some((child) => child.type === 'focus');
    const isWeaponShieldChoice = this.isWeaponShieldChoice(item);
    const hasDualWeaponOption = item.children.some((child) => child.type === 'weapon' && child.count === 2);
    let secondSelect = null;

    // Handle weapon-shield choice pattern
    if (isWeaponShieldChoice && hasDualWeaponOption) {
      const dropdownContainer = document.createElement('div');
      dropdownContainer.classList.add('dual-weapon-selection');

      secondSelect = document.createElement('select');
      secondSelect.id = `${item._source?.key || item._id || Date.now()}-second`;
      dropdownContainer.appendChild(secondSelect);
      itemContainer.appendChild(dropdownContainer);

      // Find the weapon child to determine which lookup key to use
      const andGroup = item.children.find((child) => child.type === 'AND');
      const weaponChild = andGroup.children.find((child) => child.type === 'weapon' && ['martialM', 'mar', 'simpleM', 'sim'].includes(child.key));
      const weaponLookupKey = weaponChild.key;

      // Populate first dropdown with weapons
      const weaponOptions = Array.from(EquipmentParser.lookupItems[weaponLookupKey] || []);
      weaponOptions.sort((a, b) => a.name.localeCompare(b.name));

      // Add weapons to first dropdown and select the first one
      weaponOptions.forEach((weapon, index) => {
        const option = document.createElement('option');
        option.value = weapon._id || weapon.uuid || `weapon-${index}`;
        option.innerHTML = weapon.name;
        if (index === 0) option.selected = true; // Select first weapon
        select.appendChild(option);
      });

      const populateSecondDropdown = () => {
        secondSelect.innerHTML = '';
        weaponOptions.forEach((weapon, index) => {
          const option = document.createElement('option');
          option.value = weapon._id || weapon.uuid || `weapon-${index}`;
          option.innerHTML = weapon.name;
          if (index === 0) option.selected = true; // Select first weapon
          secondSelect.appendChild(option);
        });

        // Add shield options
        const shieldOptions = Array.from(EquipmentParser.lookupItems.shield || []);
        shieldOptions.sort((a, b) => a.name.localeCompare(b.name));

        shieldOptions.forEach((shield) => {
          const option = document.createElement('option');
          option.value = shield._id || shield.uuid || `shield-${index}`;
          option.innerHTML = shield.name;
          secondSelect.appendChild(option);
        });
      };

      populateSecondDropdown();
      select.addEventListener('change', populateSecondDropdown);

      return itemContainer;
    }
    // Handle regular weapon quantity choices
    else if (isMultiQuantityChoice && weaponTypeChild) {
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
      itemContainer.appendChild(dropdownContainer);

      select.addEventListener('change', async (event) => {
        const isWeaponSelection = event.target.value !== this.findLinkedItemId(item);
        secondLabel.style.display = isWeaponSelection ? 'block' : 'none';
        secondSelect.style.display = isWeaponSelection ? 'block' : 'none';

        if (isWeaponSelection) {
          secondSelect.innerHTML = `<option value="">${game.i18n.localize('hm.app.equipment.select-weapon')}</option>`;
          const lookupOptions = Array.from(EquipmentParser.lookupItems[weaponTypeChild.key] || []);
          lookupOptions.sort((a, b) => a.name.localeCompare(b.name));

          lookupOptions.forEach((option) => {
            const optionElement = document.createElement('option');
            const itemQuantityMatch = child.label?.match(/^(\d+)\s+(.+)$/i);
            if (itemQuantityMatch) {
              optionElement.dataset.quantity = itemQuantityMatch[1];
              optionElement.innerHTML = child.label;
            } else {
              optionElement.dataset.quantity = child.count || 1;
              optionElement.innerHTML = child.count > 1 ? `${child.count} ${option.name}` : option.name;
            }
            optionElement.value = option._source.key;
            optionElement.innerHTML = option.name;
            secondSelect.appendChild(optionElement);
          });
        }
      });
    } else if (isMultiQuantityChoice && !weaponTypeChild) {
      HM.log(1, 'Multi-quantity choice missing weapon type child');
    }

    // Handle regular items and focus items separately
    const renderedItemNames = new Set();
    const nonFocusItems = item.children.filter((child) => child.type !== 'focus');
    const focusItem = item.children.find((child) => child.type === 'focus');

    // Handle focus option if present
    if (hasFocusOption && focusItem) {
      const focusType = focusItem.key;
      const focusConfig = CONFIG.DND5E.focusTypes[focusType];

      if (focusConfig) {
        const pouchItem = nonFocusItems.find((child) => child.type === 'linked' && child.label?.toLowerCase().includes('component pouch'));
        if (pouchItem) {
          pouchItem.rendered = true;
          renderedItemNames.add('Component Pouch');

          const pouchOption = document.createElement('option');
          pouchOption.value = pouchItem._source.key;
          pouchOption.innerHTML = pouchItem.label || pouchItem.name;
          pouchOption.selected = true;
          select.appendChild(pouchOption);
          defaultSelection.value = pouchItem._source.key;
        }

        // Add focus options
        Object.entries(focusConfig.itemIds).forEach(([focusName, itemId]) => {
          const option = document.createElement('option');
          option.value = itemId;
          option.innerHTML = focusName.charAt(0).toUpperCase() + focusName.slice(1);
          select.appendChild(option);
        });
      } else {
        HM.log(2, `No focus configuration found for type: ${focusType}`);
      }
    }

    for (const child of nonFocusItems) {
      HM.log(3, 'Processing nonFocusItem child:', {
        type: child.type,
        key: child.key,
        _source: child._source,
        label: child.label
      });
      if (child.type === 'AND') {
        await this.renderAndGroup(child, select, renderedItemNames);
      } else if (['linked', 'weapon', 'tool', 'armor'].includes(child.type)) {
        await this.renderIndividualItem(child, select, renderedItemNames);
      }
    }

    HM.log(3, `Completed OR block render: ${item._id}`);
    return itemContainer;
  }

  /**
   * Checks if item represents a weapon/shield choice combination
   * @param {object} item Equipment item to check
   * @returns {boolean} True if valid weapon/shield combination
   */
  isWeaponShieldChoice(item) {
    const andGroup = item.children.find((child) => child.type === 'AND');
    if (!andGroup) return false;

    const hasWeapon = andGroup.children?.some((child) => child.type === 'weapon' && ['martialM', 'mar', 'simpleM', 'sim'].includes(child.key));
    const hasShield = andGroup.children?.some((child) => child.type === 'armor' && child._source?.key?.includes('shield'));

    return hasWeapon && hasShield;
  }

  /**
   * Determines if item should be rendered as dropdown
   * @param {object} item Equipment item
   * @returns {boolean} True if should render as dropdown
   */
  shouldRenderAsDropdown(item) {
    HM.log(3, `Checking dropdown render for ${item._id}: type=${item.type}, group=${item.group}`);

    // Check for items that are part of an OR block
    if (item.group) {
      const parentItem = this.equipmentData.class.find((p) => p._source.key === item.group) || this.equipmentData.background.find((p) => p._source.key === item.group);
      return parentItem?.type === 'OR';
    }

    // Check for combined items that should be rendered in a dropdown
    if (item.type === 'AND' && item.children?.length > 1) {
      const parent = this.equipmentData.class.find((p) => p._source.key === item.group) || this.equipmentData.background.find((p) => p._source.key === item.group);
      if (parent?.type === 'OR') {
        return true;
      }
    }

    // Check if item is already part of a combined selection
    if (EquipmentParser.combinedItemIds.has(item._source.key)) {
      return true;
    }

    // Top-level OR blocks should be dropdowns
    return item.type === 'OR';
  }

  /**
   * Checks if item has multiple quantity choices
   * @param {object} item Equipment item
   * @returns {boolean} True if multiple quantities
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
   * Finds weapon type child in equipment item
   * @param {object} item Parent item
   * @returns {object|null} Weapon type child or null
   */
  findWeaponTypeChild(item) {
    return item.children.find((child) => child.type === 'weapon' && child.key === 'simpleM');
  }

  /**
   * Gets linked item ID from equipment item
   * @param {object} item Equipment item
   * @returns {string|null} Linked item ID
   */
  findLinkedItemId(item) {
    const linkedItem = item.children.find((child) => child.type === 'linked');
    return linkedItem ? linkedItem._source.key : null;
  }

  /**
   * Renders AND group equipment selection
   * @async
   * @param {object} child AND group item
   * @param {HTMLSelectElement} select Select element
   * @param {Set} renderedItemNames Tracking set
   */
  async renderAndGroup(child, select, renderedItemNames) {
    let combinedLabel = '';
    const combinedIds = [];
    const lookupKeys = ['sim', 'mar', 'simpleM', 'simpleR', 'martialM', 'martialR', 'shield'];
    const processedIds = new Set();

    // Mark all children as rendered if this is part of an OR choice
    const isPartOfOrChoice =
      (child.group && this.equipmentData.class.some((p) => p._id === child.group && p.type === 'OR')) ||
      this.equipmentData.background.some((p) => p._id === child.group && p.type === 'OR');

    if (!child?.children?.length) {
      HM.log(1, 'Invalid AND group child:', child);
      return;
    }

    for (const subChild of child.children) {
      try {
        if (processedIds.has(subChild._id)) continue;
        processedIds.add(subChild._id);
        if (lookupKeys.includes(subChild.key)) {
          if (combinedLabel) combinedLabel += ' + ';
          const lookupLabel = this.getLookupKeyLabel(subChild.key);
          combinedLabel += `${subChild.count > 1 || subChild.count !== null ? subChild.count : ''} ${lookupLabel}`.trim();
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

        if (combinedLabel) combinedLabel += ' + ';
        // Create proper HTML link
        combinedLabel +=
          `${subChild.count > 1 || subChild.count !== null ? subChild.count : ''} <a class="content-link" draggable="true" data-uuid="${subChild.key}">${subChildItem.name}</a>`.trim();
        combinedIds.push(subChild._id);

        if (isPartOfOrChoice) {
          subChild.rendered = true;
          subChild.isSpecialCase = true;
        }
        EquipmentParser.combinedItemIds.add(subChild._id);
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
        EquipmentParser.renderedItems.add(id);
        EquipmentParser.combinedItemIds.add(id);
      });

      if (isPartOfOrChoice) {
        child.rendered = true;
        child.isSpecialCase = true;
      }
    }

    HM.log(3, `Completed rendering AND group ${child._id}`);
  }

  /**
   * Gets label for weapon/armor lookup key
   * @param {string} key Lookup key (e.g. 'sim', 'mar', 'shield')
   * @returns {string} Human-readable label
   */
  getLookupKeyLabel(key) {
    /* TODO: Get this data from CONFIG.DND5E instead. */
    const labels = {
      sim: 'Simple Weapon',
      mar: 'Martial Weapon',
      simpleM: 'Simple Melee Weapon',
      simpleR: 'Simple Ranged Weapon',
      martialM: 'Martial Melee Weapon',
      martialR: 'Martial Ranged Weapon',
      shield: 'Shield'
    };
    return labels[key] || key;
  }

  /**
   * Renders individual equipment item as dropdown option
   * @async
   * @param {object} child Item to render
   * @param {HTMLSelectElement} select Select element to add option to
   * @param {Set<string>} renderedItemNames Set of already rendered names
   * @returns {Promise<void>}
   * @throws {Error} If item lookup fails
   */
  async renderIndividualItem(child, select, renderedItemNames) {
    if (child.type === 'linked') {
      if (EquipmentParser.combinedItemIds.has(child._source.key)) return;
      const label = child.label.trim();
      const [, count, name] = label.match(/^(\d+)\s*(.+)$/) || [null, null, label];
      const displayName = name || label.replace(/\s*\(.*?\)\s*/g, '');

      if (renderedItemNames.has(displayName) || EquipmentParser.combinedItemIds.has(child._source.key)) return;
      renderedItemNames.add(displayName);

      const optionElement = document.createElement('option');
      optionElement.value = child._source.key;
      optionElement.innerHTML = count > 1 || count !== null ? `${count} ${displayName}` : displayName;

      if (select.options.length === 0) {
        optionElement.selected = true;
        const defaultSelection = select.parentElement.querySelector(`#\\3${select.id}-default`);
        if (defaultSelection) {
          defaultSelection.value = child._source?.key || child._id;
        }
      }

      if (child.requiresProficiency) {
        const requiredProficiency = `${child.type}:${child.key}`;
        if (!this.proficiencies.has(requiredProficiency)) {
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
   * Renders lookup options for weapons/armor/tools
   * @async
   * @param {object} child Equipment child with lookup key
   * @param {HTMLSelectElement} select Select element
   * @param {Set<string>} renderedItemNames Tracking set
   * @returns {Promise<void>}
   */
  async renderLookupOptions(child, select, renderedItemNames) {
    try {
      const lookupOptions = Array.from(EquipmentParser.lookupItems[child.key] || []);
      lookupOptions.sort((a, b) => a.name.localeCompare(b.name));

      let defaultSelection = select.parentElement.querySelector(`#\\3${select.id}-default`);
      if (!defaultSelection) {
        defaultSelection = document.createElement('input');
        defaultSelection.type = 'hidden';
        defaultSelection.id = `${select.id}-default`; // Note: Using underscore instead of dash
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
          if (!this.proficiencies.has(requiredProficiency)) {
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

  /**
   * Renders an AND block of equipment items
   * @async
   * @param {object} item AND block item
   * @param {HTMLElement} itemContainer Container element
   * @returns {Promise<HTMLElement>} Modified container
   */
  async renderAndBlock(item, itemContainer) {
    HM.log(3, `Processing AND block: ${item._id}`);

    const processedIds = new Set();
    if (item.group) {
      const andLabelElement = document.createElement('h4');
      andLabelElement.classList.add('parent-label');
      andLabelElement.innerHTML = item.label || game.i18n.localize('hm.app.equipment.choose-all');
      itemContainer.appendChild(andLabelElement);
    }

    const hasWeaponAmmoContainer = async (items) => {
      const itemDocs = await Promise.all(
        items.map(async (item) => {
          const doc = await fromUuidSync(item._source?.key);
          HM.log(3, 'Got item doc:', doc);
          return doc;
        })
      );

      const hasWeapon = itemDocs.some((doc) => doc?.type === 'weapon' || (doc?.system?.properties && Array.from(doc.system.properties).includes('amm')));
      const hasAmmo = itemDocs.some((doc) => doc?.system?.type?.value === 'ammo');
      const hasContainer = itemDocs.some((doc) => doc?.type === 'container');

      const shouldGroup = hasWeapon || hasAmmo || hasContainer;
      HM.log(3, 'Group check result:', { hasWeapon: hasWeapon, hasAmmo: hasAmmo, hasContainer: hasContainer, shouldGroup: shouldGroup });
      return shouldGroup;
    };

    const lookupItems = item.children.filter((child) => child.type === 'weapon' && ['sim', 'mar', 'simpleM', 'simpleR', 'martialM', 'martialR'].includes(child.key));

    const linkedItems = await Promise.all(
      item.children
        .filter((child) => child.type === 'linked')
        .map(async (child) => {
          const shouldGroup = await hasWeaponAmmoContainer([child]);
          return shouldGroup ? child : null;
        })
    );

    const filteredLinkedItems = linkedItems.filter((item) => item !== null);
    const groupedItems = [];
    const processedItems = new Set();

    if (!item?.children?.length) {
      HM.log(1, 'Invalid AND block item:', item);
      return itemContainer;
    }

    for (const child of filteredLinkedItems) {
      if (processedItems.has(child._source?.key)) continue;

      const relatedItems = await Promise.all(
        filteredLinkedItems.map(async (item) => {
          if (processedItems.has(item._source?.key) || item._source?.key === child._source?.key) return null;
          const result = await hasWeaponAmmoContainer([child, item]);
          return result ? item : null;
        })
      );

      const validRelatedItems = relatedItems.filter((item) => item !== null);

      if (validRelatedItems.length > 0) {
        groupedItems.push([child, ...validRelatedItems]);
        validRelatedItems.forEach((item) => processedItems.add(item._source?.key));
        processedItems.add(child._source?.key);
      } else if (!processedItems.has(child._source?.key)) {
        groupedItems.push([child]);
        processedItems.add(child._source?.key);
      }
    }

    for (const group of groupedItems) {
      let combinedLabel = '';
      const combinedIds = [];

      for (const child of group) {
        if (processedIds.has(child._source?.key)) continue;
        processedIds.add(child._source?.key);

        const linkedItem = await fromUuidSync(child._source?.key);

        if (!linkedItem) continue;

        const count = child._source?.count > 1 || child._source?.count !== null ? child._source?.count : '';
        combinedIds.push(child._source?.key);

        if (combinedLabel) combinedLabel += ' + ';
        combinedLabel += `${count ? `${count} ` : ''}${linkedItem.name}`.trim();

        // Add to tracking sets immediately
        EquipmentParser.renderedItems.add(child._id);
        EquipmentParser.combinedItemIds.add(child._source?.key);

        child.specialGrouping = true;
        child.rendered = true;
      }

      if (combinedLabel && group.length > 1) {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = combinedIds.join(',');
        checkbox.checked = true;
        label.innerHTML = combinedLabel;
        label.prepend(checkbox);
        itemContainer.appendChild(label);
      } else {
        for (const child of group) {
          child.rendered = false;
          child.specialGrouping = false;
          EquipmentParser.renderedItems.delete(child._id);
          EquipmentParser.combinedItemIds.delete(child._source?.key);
        }
      }
    }

    for (const lookupItem of lookupItems) {
      const select = document.createElement('select');
      select.id = lookupItem._source.key;

      const lookupKey = lookupItem.key === 'sim' ? 'sim' : lookupItem.key === 'simpleM' ? 'simpleM' : lookupItem.key === 'simpleR' ? 'simpleR' : lookupItem.key;

      const lookupOptions = Array.from(EquipmentParser.lookupItems[lookupKey] || []);
      lookupOptions.sort((a, b) => a.name.localeCompare(b.name));

      lookupOptions.forEach((weapon) => {
        const option = document.createElement('option');
        option.value = weapon._source?.key;
        option.innerHTML = weapon.name;
        select.appendChild(option);
      });

      itemContainer.appendChild(select);
    }

    return itemContainer;
  }

  /**
   * Renders a linked equipment item
   * @param {object} item Linked item to render
   * @param {HTMLElement} itemContainer Container element
   * @returns {HTMLElement|null} Modified container or null if skipped
   */
  renderLinkedItem(item, itemContainer) {
    if (!item?.key) {
      HM.log(1, 'Invalid linked item:', item);
      return null;
    }

    if (item.group) {
      const parentItem = this.equipmentData.class.find((p) => p._id === item.group) || this.equipmentData.background.find((p) => p._id === item.group);
      if (parentItem?.type === 'OR') {
        return null;
      }
    }
    // Don't mark as rendered until we confirm the item should be displayed
    if (EquipmentParser.combinedItemIds.has(item._source.key)) {
      HM.log(3, 'Skipping item in combinedItems:', item._source.key);
      return null;
    }
    if (this.shouldRenderAsDropdown(item)) {
      HM.log(3, 'Skipping item that should be dropdown:', item._source.key);
      return null;
    }

    // Only check renderedItems if we've confirmed it's not part of a combination
    if (EquipmentParser.renderedItems.has(item._id)) {
      HM.log(3, 'Skipping previously rendered item:', item._id);
      return null;
    }

    // Create elements
    const labelElement = document.createElement('label');
    const linkedCheckbox = document.createElement('input');
    linkedCheckbox.type = 'checkbox';
    linkedCheckbox.id = item._source.key;
    linkedCheckbox.value = item._source.key;
    linkedCheckbox.checked = true;

    // Process display label
    let displayLabel = item.label;
    let displayCount = '';

    if (item.label?.includes('<a class')) {
      const countMatch = item.label.match(/^(\d+)&times;/);
      if (countMatch) {
        displayCount = countMatch[1];
        displayLabel = item.label.replace(/^\d+&times;\s*/, '').replace('</i>', `</i>${displayCount} `);
      }
    } else {
      displayCount = item._source.count > 1 || item._source.count !== null ? item._source.count : '';
    }

    labelElement.innerHTML = `${displayLabel?.trim() || game.i18n.localize('hm.app.equipment.unknown-choice')}`;
    labelElement.prepend(linkedCheckbox);
    itemContainer.appendChild(labelElement);

    // Only mark as rendered after successful creation
    EquipmentParser.renderedItems.add(item._id);

    HM.log(3, `Completed linked item render: ${item._id}`);
    return itemContainer;
  }

  /**
   * Renders arcane/divine focus equipment selection
   * @param {object} item Focus item data
   * @param {HTMLElement} itemContainer Container element
   * @returns {HTMLElement|null} Modified container or null if invalid
   */
  async renderFocusItem(item, itemContainer) {
    if (!item?.key) {
      HM.log(1, 'Invalid focus item:', item);
      return null;
    }

    if (this.shouldRenderAsDropdown(item)) return null;

    const focusType = item.key;
    const focusConfig = CONFIG.DND5E.focusTypes[focusType];

    if (!focusConfig) {
      HM.log(2, `No focus configuration found for type: ${focusType}`);
      return null;
    }

    const select = document.createElement('select');
    select.id = `${item.key}-focus`;

    const itemPacks = game.settings.get(HM.CONFIG.ID, 'itemPacks');

    for (const [focusName, itemId] of Object.entries(focusConfig.itemIds)) {
      let uuid = itemId.uuid || EquipmentParser.itemUuidMap.get(itemId);

      if (!uuid) {
        HM.log(3, `UUID lookup failed for ${focusName}, attempting name match`);

        for (const packId of itemPacks) {
          const pack = game.packs.get(packId);
          if (!pack) continue;

          const index = await pack.getIndex();
          const matchingItem = index.find((i) => i.name.toLowerCase() === focusName.toLowerCase());

          if (matchingItem) {
            uuid = matchingItem.uuid;
            HM.log(3, `Found matching item by name: ${matchingItem.name}`);
            break;
          }
        }

        if (!uuid) {
          HM.log(2, `No matching item found for focus: ${focusName}`);
          continue;
        }
      }

      const option = document.createElement('option');
      option.value = uuid;
      option.innerHTML = focusName.charAt(0).toUpperCase() + focusName.slice(1);

      if (select.options.length === 0) {
        option.selected = true;
      }

      select.appendChild(option);
    }

    if (select.options.length === 0) {
      HM.log(2, `No valid focus items found for type: ${focusType}`);
      return null;
    }

    const label = document.createElement('h4');
    label.htmlFor = select.id;
    label.innerHTML = focusConfig.label;

    itemContainer.appendChild(label);
    itemContainer.appendChild(select);

    HM.log(3, `Rendered focus item ${item.key}`);
    return itemContainer;
  }

  /**
   * Processes starting wealth form data into currency amounts
   * @static
   * @param {object} formData Form data containing wealth options
   * @returns {object|null} Currency amounts or null if invalid
   */
  static async processStartingWealth(formData) {
    if (game.settings.get('dnd5e', 'rulesVersion') !== 'legacy') {
      HM.log(3, 'USING MODERN RULES - NO STARTING WEALTH');
      return null;
    }

    if (!formData) {
      HM.log(1, 'Invalid form data for wealth processing');
      return null;
    }

    const useStartingWealth = formData['use-starting-wealth'];
    if (!useStartingWealth) return null;

    const wealthAmount = formData['starting-wealth-amount'];
    if (!wealthAmount) return null;

    const currencies = {
      pp: 0,
      gp: 0,
      ep: 0,
      sp: 0,
      cp: 0
    };

    const matches = wealthAmount.match(/(\d+)\s*([a-z]{2})/gi);

    if (!matches) return null;

    matches.forEach((match) => {
      const [amount, currency] = match.toLowerCase().split(/\s+/);
      const value = parseInt(amount);

      if (!isNaN(value)) {
        switch (currency) {
          case 'pp':
            currencies.pp = value;
            break;
          case 'gp':
            currencies.gp = value;
            break;
          case 'ep':
            currencies.ep = value;
            break;
          case 'sp':
            currencies.sp = value;
            break;
          case 'cp':
            currencies.cp = value;
            break;
          default:
            currencies.gp = value; // Default to gold if currency not recognized
        }
      }
    });

    HM.log(3, 'Processed starting wealth:', currencies);
    return currencies;
  }

  /**
   * Renders starting wealth options for class
   * @async
   * @param {string} classId Class document ID
   * @param {HTMLElement} sectionContainer Section container element
   * @throws {Error} If wealth option rendering fails
   */
  async renderClassWealthOption(classId, sectionContainer) {
    if (foundry.utils.isNewerVersion('4.0.0', game.system.version)) {
      return;
    } else if (game.settings.get('dnd5e', 'rulesVersion') !== 'legacy') {
      return;
    }

    try {
      const classDoc = await this.findItemInCompendiums(classId);
      if (!classDoc || !classDoc.system.wealth) return;

      const wealthContainer = document.createElement('div');
      wealthContainer.classList.add('wealth-option-container');

      const wealthCheckbox = document.createElement('input');
      wealthCheckbox.type = 'checkbox';
      wealthCheckbox.id = 'use-starting-wealth';
      wealthCheckbox.name = 'use-starting-wealth';

      const wealthLabel = document.createElement('label');
      wealthLabel.htmlFor = 'use-starting-wealth';
      wealthLabel.innerHTML = game.i18n.localize('hm.app.equipment.use-starting-wealth');

      const wealthRollContainer = document.createElement('div');
      wealthRollContainer.classList.add('wealth-roll-container');
      wealthRollContainer.style.display = 'none';

      const wealthInput = document.createElement('input');
      wealthInput.type = 'text';
      wealthInput.id = 'starting-wealth-amount';
      wealthInput.name = 'starting-wealth-amount';
      wealthInput.readOnly = true;
      wealthInput.placeholder = game.i18n.localize('hm.app.equipment.wealth-placeholder');

      const rollButton = document.createElement('button');
      rollButton.type = 'button';
      rollButton.innerHTML = game.i18n.localize('hm.app.equipment.roll-wealth');
      rollButton.classList.add('wealth-roll-button');

      rollButton.addEventListener('click', async () => {
        const formula = classDoc.system.wealth;
        const roll = new Roll(formula);
        await roll.evaluate();
        wealthInput.value = `${roll.total} gp`;
      });

      wealthCheckbox.addEventListener('change', (event) => {
        const equipmentElements = sectionContainer.querySelectorAll('.equipment-item');
        equipmentElements.forEach((el) => {
          if (event.target.checked) {
            el.classList.add('disabled');
            el.querySelectorAll('select, input[type="checkbox"], label').forEach((input) => {
              input.disabled = true;
            });
          } else {
            el.classList.remove('disabled');
            el.querySelectorAll('select, input[type="checkbox"], label').forEach((input) => {
              input.disabled = false;
            });
          }
        });
        wealthRollContainer.style.display = event.target.checked ? 'flex' : 'none';
        if (!event.target.checked) {
          wealthInput.value = '';
        }
      });

      wealthContainer.appendChild(wealthCheckbox);
      wealthContainer.appendChild(wealthLabel);
      wealthRollContainer.appendChild(wealthInput);
      wealthRollContainer.appendChild(rollButton);
      wealthContainer.appendChild(wealthRollContainer);

      sectionContainer.appendChild(wealthContainer);
    } catch (error) {
      HM.log(1, 'Error rendering wealth option:', error);
    }

    HM.log(3, `Rendered wealth options for class ${classId}`);
  }

  /**
   * Initializes and categorizes equipment lookup items from compendiums
   * @static
   * @async
   * @throws {Error} If initialization or categorization fails
   */
  static async initializeLookupItems() {
    const startTime = performance.now();

    if (this.lookupItemsInitialized) return;
    this.lookupItemsInitialized = true;
    this.itemUuidMap = new Map();

    const selectedPacks = await this.getSelectedItemPacks();

    try {
      const allItems = await this.collectAllItems(selectedPacks);
      if (!allItems?.length) {
        HM.log(1, 'No items collected from compendiums');
      }

      const categories = {
        simpleM: new Set(),
        simpleR: new Set(),
        martialM: new Set(),
        martialR: new Set(),
        music: new Set(),
        shield: new Set(),
        armor: new Set(),
        focus: new Set()
      };

      let categorizedCount = 0;
      for (const item of allItems) {
        const type = item.system?.type?.value || item.type;
        if (categories[type]) {
          categories[type].add(item);
          categorizedCount++;
        }
      }

      Object.assign(this, categories);
      this.lookupItems = {
        ...categories,
        sim: new Set([...categories.simpleM, ...categories.simpleR]),
        mar: new Set([...categories.martialM, ...categories.martialR])
      };

      const endTime = performance.now();
      HM.log(3, `Equipment lookup initialized in ${(endTime - startTime).toFixed(2)}ms. ${categorizedCount} items categorized.`);
    } catch (error) {
      const endTime = performance.now();
      HM.log(1, `Equipment lookup initialization failed after ${(endTime - startTime).toFixed(2)}ms:`, error);
    }
  }

  /**
   * Collects and filters equipment items from selected compendiums
   * @static
   * @async
   * @param {string[]} selectedPacks Array of selected compendium IDs
   * @returns {Promise<Array<object>>} Array of non-magical equipment items
   * @throws {Error} If item collection fails
   */
  static async collectAllItems(selectedPacks) {
    const startTime = performance.now();
    const items = [];
    const packs = selectedPacks.map((id) => game.packs.get(id)).filter((p) => p?.documentName === 'Item');
    const focusItemIds = new Set();

    // Collect focus item IDs
    Object.values(CONFIG.DND5E.focusTypes).forEach((config) => {
      if (config?.itemIds) {
        Object.values(config.itemIds).forEach((id) => focusItemIds.add(id));
      }
    });

    try {
      const packIndices = await Promise.all(packs.map((pack) => pack.getIndex()));
      let processedCount = 0;
      let skippedCount = 0;

      for (const index of packIndices) {
        for (const item of index) {
          const isMagic = Array.isArray(item.system?.properties) && item.system.properties.includes('mgc');

          this.itemUuidMap.set(item._id, item.uuid);
          processedCount++;

          if (item.system?.identifier === 'unarmed-strike' || isMagic) {
            skippedCount++;
            continue;
          }

          if (focusItemIds.has(item._id)) {
            item.system.type.value = 'focus';
          }

          items.push(item);
        }
      }

      const endTime = performance.now();
      HM.log(3, `Items collected in ${(endTime - startTime).toFixed(2)}ms. Processed: ${processedCount}, Included: ${items.length}, Skipped: ${skippedCount}`);
      return items;
    } catch (error) {
      const endTime = performance.now();
      HM.log(1, `Item collection failed after ${(endTime - startTime).toFixed(2)}ms:`, error);
    }
  }
}
