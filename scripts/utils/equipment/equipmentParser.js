import { EquipmentDataService, EquipmentRenderer, HM } from '../../utils/index.js';

/**
 * Parses, manages, and renders equipment data for character creation
 * Handles equipment selection UI, lookup item indexing, and equipment data collection
 * @class
 */
export class EquipmentParser {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /**
   * Set of item IDs that have been combined in UI display
   * @type {Set<string>}
   * @static
   */
  static combinedItemIds = new Set();

  /**
   * Set of items that have been rendered in the UI
   * @type {Set<string>}
   * @static
   */
  static renderedItems = new Set();

  /**
   * Lookup map of categorized items
   * @type {Object<string, Object>}
   * @static
   */
  static lookupItems;

  /**
   * Track if lookup items have been initialized
   * @type {boolean}
   * @static
   */
  static lookupItemsInitialized = false;

  /**
   * Map of item IDs to UUIDs
   * @type {Map<string, string>}
   * @static
   */
  static itemUuidMap = new Map();

  /**
   * Track instance of parser.
   * @type {EquipmentParser}
   * @static
   */
  static _instance = null;

  /* -------------------------------------------- */
  /*  Instance Properties                         */
  /* -------------------------------------------- */

  /**
   * Parsed equipment data for class and background
   * @type {object|null}
   */
  equipmentData;

  /**
   * ID of the selected class
   * @type {string}
   */
  classId;

  /**
   * UUID of the selected class
   * @type {string}
   */
  classUUID;

  /**
   * ID of the selected background
   * @type {string}
   */
  backgroundId;

  /**
   * UUID of the selected background
   * @type {string}
   */
  backgroundUUID;

  /**
   * Set of proficiencies the character has
   * @type {Set<string>}
   */
  proficiencies;

  /**
   * Renderer service instance
   * @type {EquipmentRenderer}
   */
  renderer;

  /**
   * Data service instance
   * @type {EquipmentDataService}
   */
  dataService;

  /* -------------------------------------------- */
  /*  Constructor                                 */
  /* -------------------------------------------- */

  /**
   * Creates a new EquipmentParser instance
   * @param {boolean} [private=false] - Internal flag for singleton creation
   */
  constructor(isPrivate = false) {
    // Enforce singleton pattern
    if (!isPrivate && EquipmentParser._instance) {
      HM.log(3, 'EquipmentParser: Returning existing instance');
      return EquipmentParser._instance;
    }

    HM.log(3, 'EquipmentParser: Creating new parser instance');

    // Initialize basic properties
    this.equipmentData = null;
    this.classId = HM.SELECTED.class.id;
    this.classUUID = HM.SELECTED.class.uuid;
    this.backgroundId = HM.SELECTED.background.id;
    this.backgroundUUID = HM.SELECTED.background.uuid;
    this.proficiencies = new Set();

    // Initialize services
    this.renderer = new EquipmentRenderer(this);
    this.dataService = new EquipmentDataService(this);

    HM.log(3, `Initialized with class=${this.classId} and background=${this.backgroundId}`);
  }

  /* -------------------------------------------- */
  /*  Public Methods                              */
  /* -------------------------------------------- */

  /**
   * Retrieves and combines equipment data from class and background selections
   * @async
   * @returns {Promise<Object>} Object containing class and background equipment data
   * @throws {Error} If data fetching fails
   */
  async fetchEquipmentData() {
    HM.log(3, 'Fetching equipment data');
    try {
      this.equipmentData = await this.dataService.fetchEquipmentData();
      HM.log(3, `Retrieved data with ${this.equipmentData?.class?.length || 0} class items and ${this.equipmentData?.background?.length || 0} background items`);
      return this.equipmentData;
    } catch (error) {
      HM.log(1, `Failed to fetch equipment data: ${error.message}`);
      this.equipmentData = { class: [], background: [] };
      return this.equipmentData;
    }
  }

  /**
   * Renders starting wealth options for class or background
   * @async
   * @param {HTMLElement} sectionContainer - Container element to render into
   * @param {string} type - Selection type ('class'|'background')
   * @throws {Error} If wealth option rendering fails
   */
  async renderWealthOption(sectionContainer, type = 'class') {
    HM.log(3, `Rendering wealth option for ${type}`);

    try {
      const itemUUID = HM.SELECTED[type].uuid;
      if (!itemUUID) {
        HM.log(3, `No UUID for ${type}, skipping`);
        return;
      }

      const item = await fromUuidSync(itemUUID);
      if (!item) {
        HM.log(3, `Could not find item for UUID ${itemUUID}`);
        return;
      }

      const rulesVersion = item?.system?.source?.rules;
      const isModernRules = rulesVersion === '2024';
      const wealthValue = item.system.wealth;

      if (!wealthValue) {
        HM.log(3, `No wealth value found for ${type}`);
        return;
      }

      // Create wealth option container as a table
      const wealthTable = document.createElement('table');
      wealthTable.classList.add('wealth-option-container');

      // Create checkbox row
      const checkboxRow = document.createElement('tr');
      const checkboxCell = document.createElement('td');
      const emptyCell = document.createElement('td');

      // Create checkbox and label
      const wealthCheckbox = document.createElement('input');
      wealthCheckbox.type = 'checkbox';
      wealthCheckbox.id = `use-starting-wealth-${type}`;
      wealthCheckbox.name = `use-starting-wealth-${type}`;

      const wealthLabel = document.createElement('label');
      wealthLabel.htmlFor = `use-starting-wealth-${type}`;
      wealthLabel.innerHTML = game.i18n.localize('hm.app.equipment.use-starting-wealth');

      checkboxCell.appendChild(wealthCheckbox);
      checkboxCell.appendChild(document.createTextNode(' '));
      checkboxCell.appendChild(wealthLabel);
      checkboxRow.appendChild(checkboxCell);
      checkboxRow.appendChild(emptyCell);
      wealthTable.appendChild(checkboxRow);

      // Create wealth roll row (hidden initially)
      const rollRow = document.createElement('tr');
      rollRow.classList.add('wealth-roll-container');
      // Force hiding using both style and attribute
      rollRow.style.display = 'none';
      rollRow.setAttribute('hidden', 'true');

      const rollCell = document.createElement('td');
      rollCell.colSpan = 2;

      const wealthInput = document.createElement('input');
      wealthInput.type = 'text';
      wealthInput.id = `starting-wealth-amount-${type}`;
      wealthInput.name = `starting-wealth-amount-${type}`;
      wealthInput.placeholder = game.i18n.localize('hm.app.equipment.wealth-placeholder');

      rollCell.appendChild(wealthInput);

      if (isModernRules) {
        // For 2024 rules, show flat value without roll button
        wealthInput.value = `${wealthValue} ${CONFIG.DND5E.currencies.gp.abbreviation}`;
        wealthInput.readOnly = true;
      } else {
        // Legacy rules with dice roll
        wealthInput.readOnly = true;

        const rollButton = document.createElement('button');
        rollButton.type = 'button';
        rollButton.innerHTML = '<i class="fa-solid fa-dice"></i>';
        rollButton.title = game.i18n.localize('hm.app.equipment.roll-wealth');
        rollButton.classList.add('wealth-roll-button');
        rollCell.appendChild(rollButton);

        // Add roll button event listener (unchanged)
        rollButton.addEventListener('click', async () => {
          const formula = wealthValue;
          const roll = new Roll(formula);
          await roll.evaluate();
          wealthInput.value = `${roll.total} ${CONFIG.DND5E.currencies.gp.abbreviation}`;
          wealthInput.dispatchEvent(new Event('change', { bubbles: true }));

          // Chat message logic (unchanged)
          if (game.settings.get(HM.ID, 'publishWealthRolls')) {
            const characterNameInput = document.getElementById('character-name');
            const characterName = characterNameInput?.value || game.user.name;
            const typeLabel = game.i18n.localize(`TYPES.Item.${type}`);

            await roll.toMessage({
              flavor: game.i18n.format('hm.app.equipment.wealth-roll-message', {
                name: characterName,
                type: typeLabel,
                result: roll.total
              }),
              speaker: ChatMessage.getSpeaker()
            });
          }
        });
      }

      rollRow.appendChild(rollCell);
      wealthTable.appendChild(rollRow);

      // Update checkbox change handler
      wealthCheckbox.addEventListener('change', (event) => {
        this.handleWealthCheckboxChange(event, sectionContainer, rollRow, wealthInput, isModernRules, wealthValue);
      });

      sectionContainer.appendChild(wealthTable);

      // Force a redraw to ensure styles are applied
      setTimeout(() => {
        if (!wealthCheckbox.checked) {
          rollRow.style.display = 'none';
          rollRow.setAttribute('hidden', 'true');
        }
      }, 0);

      HM.log(3, `Rendered wealth option for ${type} with value ${wealthValue}`);
    } catch (error) {
      HM.log(1, `Error rendering wealth option: ${error.message}`);
    }
  }

  /**
   * Handle wealth checkbox change event
   * @param {Event} event - Change event
   * @param {HTMLElement} sectionContainer - Section container
   * @param {HTMLElement} wealthRollContainer - Wealth roll container
   * @param {HTMLInputElement} wealthInput - Wealth input field
   * @param {boolean} isModernRules - Whether using 2024 rules
   * @param {string|number} wealthValue - Wealth value
   * @private
   */
  handleWealthCheckboxChange(event, sectionContainer, wealthRollRow, wealthInput, isModernRules, wealthValue) {
    HM.log(3, `Wealth checkbox changed to ${event.target.checked}`);
    const isChecked = event.target.checked;

    // Update equipment tables in a single pass
    const equipmentTables = sectionContainer.querySelectorAll('table.equipment-item');
    const selectors = 'select, input[type="checkbox"], label, h4';

    equipmentTables.forEach((el) => {
      el.classList.toggle('disabled', isChecked);
      el.querySelectorAll(selectors).forEach((input) => {
        input.disabled = isChecked;
      });
    });

    // Display/hide wealth roll container
    if (isChecked) {
      wealthRollRow.style.display = 'table-row';
      wealthRollRow.removeAttribute('hidden');
    } else {
      wealthRollRow.style.display = 'none';
      wealthRollRow.setAttribute('hidden', 'true');
    }

    // Reset wealth input if unchecked
    if (!isChecked) {
      wealthInput.value = isModernRules ? `${wealthValue} ${CONFIG.DND5E.currencies.gp.abbreviation}` : '';
    }
  }

  /**
   * Renders equipment selection UI for specified or all types
   * @async
   * @param {?string} type - Optional type to render ('class'|'background'). If null, renders all
   * @returns {Promise<HTMLElement>} Container element with rendered equipment choices
   */
  async generateEquipmentSelectionUI(type = null) {
    // Reset tracking sets at the beginning of rendering
    EquipmentParser.renderedItems = new Set();
    EquipmentParser.combinedItemIds = new Set();

    HM.log(3, `Generating UI for ${type || 'all types'}`);
    const result = await this.renderer.generateEquipmentSelectionUI(type);
    HM.log(3, 'UI generation complete');
    return result;
  }

  /**
   * Extract equipment description from document HTML
   * @param {Document} document - The document to extract equipment info from
   * @returns {string|null} - HTML string with equipment description or null if not found
   */
  extractEquipmentDescription(document) {
    HM.log(3, `Extracting from ${document?.name || 'unknown document'}`);
    const result = this.dataService.extractEquipmentDescription(document);
    HM.log(3, `Extraction ${result ? 'succeeded' : 'failed'}`);
    return result;
  }

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Get the singleton instance of EquipmentParser
   * @returns {EquipmentParser} The shared parser instance
   */
  static getInstance() {
    if (!this._instance) {
      this._instance = new this(true);
    }

    // Always update IDs to current selection
    if (this._instance) {
      this._instance.classId = HM.SELECTED.class.id;
      this._instance.classUUID = HM.SELECTED.class.uuid;
      this._instance.backgroundId = HM.SELECTED.background.id;
      this._instance.backgroundUUID = HM.SELECTED.background.uuid;
    }

    return this._instance;
  }

  /**
   * Collects equipment selections from the HTML form
   * @param {Event} event - The form submission event
   * @param {object} options - Collection options
   * @param {boolean} [options.includeClass=true] - Whether to include class equipment
   * @param {boolean} [options.includeBackground=true] - Whether to include background equipment
   * @returns {Promise<Array<object>>} An array of equipment items
   * @static
   */
  static async collectEquipmentSelections(event, options = { includeClass: true, includeBackground: true }) {
    HM.log(3, 'Collecting selections with options', options);

    const equipment = [];
    const equipmentContainer = event.target?.querySelector('#equipment-container');

    if (!equipmentContainer) {
      HM.log(3, 'No equipment container found');
      return equipment;
    }

    // Get equipment sections based on options
    const equipmentSections = this.getEquipmentSectionsToProcess(equipmentContainer, options);
    HM.log(3, `Processing ${equipmentSections.length} equipment sections`);

    // Process all sections in parallel
    await Promise.all(
      equipmentSections.map(async (section) => {
        await this.processEquipmentSection(section, equipment);
      })
    );

    HM.log(3, `Collected ${equipment.length} total equipment items`);
    return equipment;
  }

  /**
   * Gets the equipment sections to process based on options
   * @param {HTMLElement} equipmentContainer - The equipment container element
   * @param {object} options - The processing options
   * @returns {HTMLElement[]} Array of section elements to process
   * @static
   * @private
   */
  static getEquipmentSectionsToProcess(equipmentContainer, options) {
    HM.log(3, 'Finding equipment sections');

    const allSections = Array.from(equipmentContainer.querySelectorAll('.equipment-choices > div'));
    HM.log(3, `Found ${allSections.length} total sections`);

    const equipmentSections = allSections.filter((section) => {
      const isClassSection = section.classList.contains('class-equipment-section');
      const isBackgroundSection = section.classList.contains('background-equipment-section');

      if (isClassSection && !options.includeClass) {
        HM.log(3, 'Skipping class section (not included in options)');
        return false;
      }
      if (isBackgroundSection && !options.includeBackground) {
        HM.log(3, 'Skipping background section (not included in options)');
        return false;
      }
      return true;
    });

    HM.log(3, `Using ${equipmentSections.length} sections after filtering`);
    return equipmentSections;
  }

  /**
   * Process a single equipment section to extract items
   * @param {HTMLElement} section - The section element to process
   * @param {Array<object>} equipment - The array to add equipment items to
   * @returns {Promise<void>}
   * @static
   * @private
   */
  static async processEquipmentSection(section, equipment) {
    HM.log(3, `Processing section ${section.className}`);

    // Get wealth checkbox for this section
    const sectionType = section.classList.contains('class-equipment-section') ? 'class' : 'background';
    const wealthChecked = section.querySelector(`input[id="use-starting-wealth-${sectionType}"]`)?.checked || false;

    if (wealthChecked) {
      HM.log(3, `Wealth is checked for ${sectionType}, skipping equipment selection`);
      return;
    }

    // Process dropdowns and checkboxes in parallel
    await Promise.all([this.processDropdowns(section, equipment, wealthChecked), this.processCheckboxes(section, equipment, wealthChecked)]);
  }

  /**
   * Process dropdown selections in a section
   * @param {HTMLElement} section - The section element
   * @param {Array<object>} equipment - The array to add equipment to
   * @param {boolean} wealthChecked - Whether wealth option is checked
   * @returns {Promise<void>}
   * @static
   * @private
   */
  static async processDropdowns(section, equipment, wealthChecked) {
    HM.log(3, 'Processing dropdowns');

    // Get all enabled dropdowns
    const dropdowns = Array.from(section.querySelectorAll('select')).filter(
      (dropdown) => !dropdown.disabled && !dropdown.closest('.disabled') && (!wealthChecked || !dropdown.closest('.equipment-item'))
    );

    HM.log(3, `Found ${dropdowns.length} active dropdowns to process`);

    const dropdownPromises = dropdowns.map(async (dropdown) => {
      // Get value (could be IDs or UUIDs)
      const value = dropdown.value || document.getElementById(`${dropdown.id}-default`)?.value;
      if (!value) return;

      try {
        // Try to find the items - value could be single ID/UUID or comma-separated list
        let items = await this.findItemsFromDropdownValue(dropdown, value);
        if (!items.length) return;

        // Process each item
        for (const item of items) {
          await this.processDropdownSelectedItem(dropdown, value, item, equipment);
        }
      } catch (error) {
        HM.log(1, `Error processing dropdown ${dropdown.id}: ${error.message}`);
      }
    });

    await Promise.all(dropdownPromises);
  }

  /**
   * Find items from a dropdown value
   * @param {HTMLSelectElement} dropdown - The dropdown element
   * @param {string} value - The dropdown value
   * @returns {Promise<Array<Object>>} Array of found items
   * @static
   * @private
   */
  static async findItemsFromDropdownValue(dropdown, value) {
    let items = [];

    // Check for comma-separated values (2024 format)
    if (value.includes(',')) {
      items = await this.findItemsFromCommaSeparatedValue(dropdown, value);
    } else {
      // Regular single item lookup
      const item = await this.findItemInPacks(value);
      if (item) items = [item];
    }

    HM.log(3, `Found ${items.length} items for value "${value}"`);
    return items;
  }

  /**
   * Find items from a comma-separated value
   * @param {HTMLSelectElement} dropdown - The dropdown element
   * @param {string} value - The comma-separated value
   * @returns {Promise<Array<object>>} Array of found items
   * @static
   * @private
   */
  static async findItemsFromCommaSeparatedValue(dropdown, value) {
    HM.log(3, `Processing comma-separated value "${value}"`);

    let items = [];
    // Get UUIDs from option content
    const selectedOption = dropdown.querySelector(`option[value="${value}"]`);

    if (selectedOption) {
      const contentLinks = selectedOption.querySelectorAll('a.content-link');
      if (contentLinks.length) {
        // Get items from content links
        items = await Promise.all(Array.from(contentLinks).map((link) => fromUuidSync(link.dataset.uuid)));
        HM.log(3, `Found ${items.length} items from content links`);
      }
    }

    // If no content links, try using IDs directly
    if (!items.length) {
      const ids = value.split(',').filter((id) => id.trim());
      items = await Promise.all(ids.map(async (id) => await this.findItemInPacks(id)));
      HM.log(3, `Found ${items.length} items from direct IDs`);
    }

    // Filter out nulls
    return items.filter((item) => item);
  }

  /**
   * Process a selected item from a dropdown
   * @param {HTMLSelectElement} dropdown - The dropdown element
   * @param {string} value - The dropdown value
   * @param {object} item - The item to process
   * @param {Array<object>} equipment - The array to add equipment to
   * @returns {Promise<void>}
   * @static
   * @private
   */
  static async processDropdownSelectedItem(dropdown, value, item, equipment) {
    HM.log(3, `Processing item ${item.name}`);

    const selectedOption = dropdown.querySelector(`option[value="${value}"]`);
    const optionText = selectedOption?.textContent || '';
    const favoriteCheckbox = dropdown.closest('.equipment-item')?.querySelector('.equipment-favorite-checkbox');
    const isFavorite = favoriteCheckbox?.checked || false;

    // Determine quantity
    const quantity = this.determineItemQuantity(item, optionText);
    HM.log(3, `Determined quantity ${quantity} for ${item.name}`);

    const itemData = item || item?.toObject();
    if (itemData.type === 'container') {
      await this.processContainerItem(item, quantity, equipment);
    } else {
      equipment.push({
        ...itemData,
        system: {
          ...itemData.system,
          quantity: quantity,
          equipped: true
        },
        favorite: isFavorite
      });
      HM.log(3, `Added ${item.name} (qty: ${quantity}) to equipment`);
    }
  }

  /**
   * Determine the quantity of an item from option text
   * @param {Object} item - The item document
   * @param {string} optionText - The option text
   * @returns {number} The determined quantity (defaults to 1 if not found)
   * @static
   * @private
   */
  static determineItemQuantity(item, optionText) {
    HM.log(3, `Determining quantity for ${item.name} from "${optionText}"`);

    // Try to find quantity in option text for this specific item
    let quantity = 1;
    const itemNamePattern = new RegExp(`(\\d+)\\s*(?:×|x)?\\s*${item.name}`, 'i');
    const quantityMatch = optionText.match(itemNamePattern);

    if (quantityMatch) {
      quantity = parseInt(quantityMatch[1]);
      HM.log(3, `Found specific match: ${quantity}`);
    } else {
      // Fallback patterns
      const startQuantityMatch = optionText.match(/^(\d+)\s+(.+)$/i);
      const endQuantityMatch = optionText.match(/(.+)\s+\((\d+)\)$/i);
      const midQuantityMatch = optionText.match(/(.+?)\s+[x×](\d+)/i);

      if (startQuantityMatch) {
        quantity = parseInt(startQuantityMatch[1]);
        HM.log(3, `Found start match: ${quantity}`);
      } else if (endQuantityMatch) {
        quantity = parseInt(endQuantityMatch[2]);
        HM.log(3, `Found end match: ${quantity}`);
      } else if (midQuantityMatch) {
        quantity = parseInt(midQuantityMatch[2]);
        HM.log(3, `Found middle match: ${quantity}`);
      }
    }

    return quantity;
  }

  /**
   * Process checkboxes in a section
   * @param {HTMLElement} section - The section element
   * @param {Array<object>} equipment - The array to add equipment to
   * @param {boolean} wealthChecked - Whether wealth option is checked
   * @returns {Promise<void>}
   * @static
   * @private
   */
  static async processCheckboxes(section, equipment, wealthChecked) {
    HM.log(3, 'Processing checkboxes');

    // Get all checked and enabled checkboxes
    const checkboxes = Array.from(section.querySelectorAll('input[type="checkbox"]')).filter((cb) => {
      return (
        cb.checked &&
        !cb.id.includes('use-starting-wealth') &&
        !cb.classList.contains('equipment-favorite-checkbox') &&
        !cb.disabled &&
        !cb.closest('.disabled') &&
        (!wealthChecked || !cb.closest('.equipment-item'))
      );
    });

    HM.log(3, `Found ${checkboxes.length} checked checkboxes to process`);

    const checkboxPromises = checkboxes.map(async (checkbox) => {
      try {
        await this.processCheckedCheckbox(checkbox, equipment);
      } catch (error) {
        HM.log(1, `Error processing checkbox: ${error.message}`);
      }
    });

    await Promise.all(checkboxPromises);
  }

  /**
   * Process a checked checkbox
   * @param {HTMLInputElement} checkbox - The checkbox element
   * @param {Array<object>} equipment - The array to add equipment to
   * @returns {Promise<void>}
   * @static
   * @private
   */
  static async processCheckedCheckbox(checkbox, equipment) {
    HM.log(3, `Processing checkbox ${checkbox.id}`);

    // Get the actual label text
    const labelElement = checkbox.parentElement;
    const fullLabel = labelElement.textContent.trim();

    const itemIds = checkbox.id.split(',').filter((id) => id);
    // Split on '+' and trim each part
    const entries = fullLabel.split('+').map((entry) => entry.trim());
    const favoriteCheckbox = checkbox.closest('.equipment-item')?.querySelector('.equipment-favorite-checkbox');
    const isFavorite = favoriteCheckbox?.checked || false;

    // Fetch all items in parallel
    const items = await Promise.all(
      itemIds.map(async (itemId) => {
        return {
          itemId,
          item: await this.findItemInPacks(itemId)
        };
      })
    );

    HM.log(3, `Found ${items.filter((i) => i.item).length}/${items.length} items for checkbox ${checkbox.id}`);

    // Process each found item
    for (const { itemId, item } of items) {
      if (!item) {
        HM.log(1, `Could not find item for ID: ${itemId}`);
        continue;
      }

      // Search all entries for this item's quantity
      let quantity = 1;

      for (const entry of entries) {
        const itemPattern = new RegExp(`(\\d+)\\s+${item.name}`, 'i');
        const match = entry.match(itemPattern);

        if (match) {
          quantity = parseInt(match[1]);
          break;
        }
      }

      const itemData = item?.toObject() || item;
      if (itemData.type === 'container') {
        await this.processContainerItem(item, quantity, equipment);
      } else {
        equipment.push({
          ...itemData,
          system: {
            ...itemData.system,
            quantity: quantity,
            equipped: true
          },
          favorite: isFavorite
        });
        HM.log(3, `Added ${item.name} (qty: ${quantity}) to equipment`);
      }
    }
  }

  /**
   * Search for an item in the available packs
   * @param {string} itemId - The item ID or UUID to search for
   * @returns {Promise<object|null>} The found item or null
   * @static
   * @private
   */
  static async findItemInPacks(itemId) {
    HM.log(3, `Searching for item ${itemId}`);

    if (!itemId) return null;

    // Check if this is a comma-separated list of IDs
    if (itemId.includes(',')) {
      const ids = itemId.split(',').filter((id) => id.trim());
      HM.log(3, `Processing comma-separated list with ${ids.length} IDs`);

      // For equipment groups, we should return a collection of items
      const items = [];

      for (const id of ids) {
        // Try to find the item
        const item = await this.findItemInPacks(id.trim());
        if (item) items.push(item);
      }

      // Return first item for backward compatibility
      const result = items.length > 0 ? items[0] : null;
      HM.log(3, `Found ${items.length} items in comma-separated list, returning ${result?.name || 'null'}`);
      return result;
    }

    try {
      // Check if it's a valid UUID
      let parsed;
      try {
        parsed = foundry.utils.parseUuid(itemId);
      } catch (e) {
        // Not a valid UUID format
      }

      // If it's not a valid UUID, try to find a UUID for this ID
      if (!parsed && !itemId.includes('.')) {
        const result = await this.findUuidForId(itemId);
        if (result) return result;
      }

      // Regular UUID lookup
      const indexItem = fromUuidSync(itemId);
      if (indexItem) {
        const packId = indexItem.pack;
        const pack = game.packs.get(packId);
        if (pack) {
          const fullItem = await pack.getDocument(indexItem._id);
          HM.log(3, `Found full item ${itemId}`);
          return fullItem;
        }
      }

      HM.log(2, `Could not find item ${itemId} in any pack`);
      return null;
    } catch (error) {
      HM.log(1, `Error finding item ${itemId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Find a UUID for a given item ID by checking select options
   * @param {string} itemId - The item ID to find a UUID for
   * @returns {Promise<Object|null>} The found item or null if not found
   * @static
   * @private
   */
  static async findUuidForId(itemId) {
    HM.log(3, `Looking for UUID for ID ${itemId}`);

    // Look through the select options to find matching UUID
    const selectOptions = Array.from(document.querySelectorAll('select option'));
    for (const option of selectOptions) {
      if (option.value.split(',').includes(itemId)) {
        // Find content links within this option
        const links = option.querySelectorAll('a.content-link');
        for (const link of links) {
          const uuid = link.dataset.uuid;
          if (uuid) {
            HM.log(3, `Found UUID ${uuid} for ID ${itemId}`);
            const item = await fromUuidSync(uuid);
            if (item) {
              return item;
            }
          }
        }
      }
    }

    HM.log(3, `No UUID found for ID ${itemId}`);
    return null;
  }

  /**
   * Process a container item and its contents
   * @param {Object} containerItem - The container item document
   * @param {number} quantity - The container quantity
   * @param {Array<Object>} equipment - The array to add equipment to
   * @returns {Promise<void>}
   * @static
   * @private
   */
  static async processContainerItem(containerItem, quantity, equipment) {
    HM.log(3, `Processing container ${containerItem.name} with quantity ${quantity}`);

    if (!containerItem) return;

    try {
      const packId = containerItem.pack;
      const pack = game.packs.get(packId);

      if (pack) {
        const fullContainer = await pack.getDocument(containerItem._id);
        if (fullContainer) {
          const containerData = await CONFIG.Item.documentClass.createWithContents([fullContainer], {
            keepId: true,
            transformAll: async (doc) => {
              const transformed = doc.toObject();
              if (doc.id === fullContainer.id) {
                transformed.system = transformed.system || {};
                transformed.system.quantity = quantity;
                transformed.system.currency = fullContainer.system?.currency;
                transformed.system.equipped = true;
              }
              return transformed;
            }
          });

          if (containerData?.length) {
            equipment.push(...containerData);
            HM.log(3, `Added container ${fullContainer.name} and its contents to equipment`);
          }
        }
      }
    } catch (error) {
      HM.log(1, `Error processing container ${containerItem?.name || containerItem?._id}: ${error.message}`);
    }
  }

  /**
   * Retrieves all selected compendium packs from settings.
   * Combines item packs, class packs, background packs, and race packs into a single array.
   * @returns {Promise<string[]>} Array of compendium pack IDs
   * @static
   */
  static getSelectedPacks() {
    HM.log(3, 'Retrieving selected packs');

    const itemPacks = game.settings.get(HM.ID, 'itemPacks') || [];
    const classPacks = game.settings.get(HM.ID, 'classPacks') || [];
    const backgroundPacks = game.settings.get(HM.ID, 'backgroundPacks') || [];
    const racePacks = game.settings.get(HM.ID, 'racePacks') || [];

    const result = [...itemPacks, ...classPacks, ...backgroundPacks, ...racePacks];
    HM.log(3, `Retrieved ${result.length} total packs`);
    return result;
  }

  /**
   * Initializes and categorizes equipment lookup items from compendiums
   * @static
   * @async
   * @throws {Error} If initialization or categorization fails
   */
  static async initializeLookupItems() {
    HM.log(3, 'Beginning lookup item initialization');
    const startTime = performance.now();

    if (this.lookupItemsInitialized) {
      HM.log(3, 'Already initialized, skipping');
      return;
    }

    this.lookupItemsInitialized = true;
    this.itemUuidMap = new Map();

    const selectedPacks = this.getSelectedPacks();

    try {
      const allItems = await this.#collectAllItems(selectedPacks);
      if (!allItems?.length) {
        HM.log(1, 'No items collected from compendiums');
        return;
      }

      const categories = this.initializeItemCategories();
      await this.categorizeItems(allItems, categories);

      // Create aggregated categories
      const aggregatedCategories = this.createAggregatedCategories(categories);

      // Combine all categories
      const allCategories = { ...categories, ...aggregatedCategories };

      // Store the item sets directly
      Object.entries(allCategories).forEach(([key, value]) => {
        this[key] = value.items;
      });

      // Store the complete lookup structure
      this.lookupItems = allCategories;

      const endTime = performance.now();
      HM.log(3, `Completed in ${(endTime - startTime).toFixed(0)}ms`);
    } catch (error) {
      const endTime = performance.now();
      HM.log(1, `Failed after ${(endTime - startTime).toFixed(0)}ms: ${error.message}`);
    }

    Hooks.callAll('heroMancer.EquipmentDataReady', this.lookupItems);
  }

  /**
   * Initialize item categories object
   * @returns {Object} Categories object
   * @static
   * @private
   */
  static initializeItemCategories() {
    HM.log(3, 'Initializing category structure');

    // Create categories for all item types we care about
    return {
      // Weapons
      simpleM: { items: new Set(), label: game.i18n.localize('DND5E.WeaponSimpleM') },
      simpleR: { items: new Set(), label: game.i18n.localize('DND5E.WeaponSimpleR') },
      martialM: { items: new Set(), label: game.i18n.localize('DND5E.WeaponMartialM') },
      martialR: { items: new Set(), label: game.i18n.localize('DND5E.WeaponMartialR') },

      // Tools
      art: { items: new Set(), label: game.i18n.localize('DND5E.ToolArtisans') },
      game: { items: new Set(), label: game.i18n.localize('DND5E.ToolGamingSet') },
      music: { items: new Set(), label: game.i18n.localize('DND5E.ToolMusicalInstrument') },

      // Armor types
      light: { items: new Set(), label: game.i18n.localize('DND5E.EquipmentLight') },
      medium: { items: new Set(), label: game.i18n.localize('DND5E.EquipmentMedium') },
      heavy: { items: new Set(), label: game.i18n.localize('DND5E.EquipmentHeavy') },
      shield: { items: new Set(), label: game.i18n.localize('DND5E.EquipmentShield') },

      // Other
      focus: { items: new Set(), label: game.i18n.localize('DND5E.Item.Property.Focus') }
    };
  }

  /**
   * Categorize items into their appropriate categories
   * @param {Array<object>} allItems - All collected items
   * @param {Object} categories - Categories object
   * @returns {Promise<number>} Number of categorized items
   * @static
   * @private
   */
  static async categorizeItems(allItems, categories) {
    HM.log(3, `Categorizing ${allItems.length} items`);

    // Process in chunks to avoid overwhelming the event loop
    const CHUNK_SIZE = 200;
    const chunks = [];

    for (let i = 0; i < allItems.length; i += CHUNK_SIZE) {
      chunks.push(allItems.slice(i, i + CHUNK_SIZE));
    }

    HM.log(3, `Processing ${chunks.length} chunks of up to ${CHUNK_SIZE} items each`);
    let categorizedCount = 0;

    await Promise.all(
      chunks.map(async (chunk) => {
        chunk.forEach((item) => {
          const itemType = item.type;
          const subType = item.system?.type?.value;

          // Categorize based on item type and subtype
          if (itemType === 'weapon') {
            const weaponType = subType;
            if (categories[weaponType]) {
              categories[weaponType].items.add(item);
              categorizedCount++;
            }
          } else if (itemType === 'equipment') {
            // Check if it's an armor type
            if (Object.keys(CONFIG.DND5E.armorTypes).includes(subType)) {
              categories[subType].items.add(item);
              categorizedCount++;
            }
          } else if (itemType === 'tool') {
            const toolType = subType;
            if (categories[toolType]) {
              categories[toolType].items.add(item);
              categorizedCount++;
            }
          } else if (itemType === 'consumable' && subType === 'focus') {
            categories.focus.items.add(item);
            categorizedCount++;
          }
        });
      })
    );

    HM.log(3, `Categorized ${categorizedCount} items`);
    return categorizedCount;
  }

  /**
   * Create aggregated categories from base categories
   * @param {Object} categories - Base categories object
   * @returns {Object} Aggregated categories
   * @static
   * @private
   */
  static createAggregatedCategories(categories) {
    HM.log(3, 'Creating aggregated categories');

    return {
      // Weapon proficiency groups
      sim: {
        items: new Set([...categories.simpleM.items, ...categories.simpleR.items]),
        label: game.i18n.format('DND5E.WeaponCategory', { category: game.i18n.localize('DND5E.WeaponSimpleProficiency') })
      },
      mar: {
        items: new Set([...categories.martialM.items, ...categories.martialR.items]),
        label: game.i18n.format('DND5E.WeaponCategory', { category: game.i18n.localize('DND5E.WeaponMartialProficiency') })
      },

      // Tool category
      tool: {
        items: new Set([...categories.art.items, ...categories.game.items, ...categories.music.items]),
        label: game.i18n.localize('TYPES.Item.tool')
      },
      // Armor category
      armor: {
        items: new Set([...categories.light.items, ...categories.medium.items, ...categories.heavy.items]),
        label: game.i18n.localize('DND5E.Armor')
      }
    };
  }

  /**
   * Processes starting wealth form data into currency amounts
   * @param {Object} formData - Form data containing wealth options
   * @returns {Object<string, number>|null} Currency amounts or null if invalid
   * @throws {Error} If currency conversion fails
   * @static
   */
  static async convertWealthStringToCurrency(formData) {
    HM.log(3, 'Converting wealth string to currency');

    try {
      // Check both possible wealth sources
      const useClassWealth = formData['use-starting-wealth-class'];
      const useBackgroundWealth = formData['use-starting-wealth-background'];

      // Determine which wealth to use (or none)
      if (!useClassWealth && !useBackgroundWealth) {
        HM.log(3, 'No wealth source checked');
        return null;
      }

      // Get the appropriate wealth amount
      let wealthAmount;
      if (useClassWealth) {
        wealthAmount = formData['starting-wealth-amount-class'];
        HM.log(3, `Using class wealth: ${wealthAmount}`);
      } else if (useBackgroundWealth) {
        wealthAmount = formData['starting-wealth-amount-background'];
        HM.log(3, `Using background wealth: ${wealthAmount}`);
      }

      if (!wealthAmount || typeof wealthAmount !== 'string') {
        HM.log(3, 'No valid wealth amount found');
        return this.initializeCurrencies(); // Return empty currencies
      }

      const currencies = this.initializeCurrencies();
      const parsedCurrencies = this.parseCurrenciesFromWealthString(wealthAmount, currencies);

      // Validate result has some value
      const hasValue = Object.values(parsedCurrencies).some((val) => val > 0);
      if (!hasValue) {
        HM.log(2, `Wealth string "${wealthAmount}" couldn't be parsed into currency values`);
      }

      HM.log(3, 'Parsed currencies', parsedCurrencies);
      return parsedCurrencies;
    } catch (error) {
      HM.log(1, `Error converting wealth string: ${error.message}`);
      return this.initializeCurrencies(); // Return empty currencies on error
    }
  }

  /**
   * Initialize currencies object with zeros
   * @returns {Object<string, number>} Currencies object with zero values
   * @static
   * @private
   */
  static initializeCurrencies() {
    // Initialize currencies object with zeros using CONFIG
    const currencies = {};
    Object.keys(CONFIG.DND5E.currencies).forEach((key) => {
      currencies[key] = 0;
    });
    return currencies;
  }

  /**
   * Parse currencies from a wealth string
   * @param {string} wealthAmount - The wealth string to parse
   * @param {Object<string, number>} currencies - The currencies object to update
   * @returns {Object<string, number>} Updated currencies object
   * @static
   * @private
   */
  static parseCurrenciesFromWealthString(wealthAmount, currencies) {
    // Build regex pattern from abbreviations in CONFIG
    const abbrs = Object.values(CONFIG.DND5E.currencies)
      .map((c) => c.abbreviation)
      .join('|');
    const regex = new RegExp(`(\\d+)\\s*(${abbrs})`, 'gi');

    // Process the wealth amount
    const matches = wealthAmount.match(regex);
    if (!matches) return null;

    matches.forEach((match) => {
      const [num, currency] = match.toLowerCase().split(/\s+/);
      const value = parseInt(num);

      if (!isNaN(value)) {
        // Find the currency key that matches this abbreviation
        const currKey = Object.entries(CONFIG.DND5E.currencies).find(([_, data]) => data.abbreviation.toLowerCase() === currency)?.[0];

        if (currKey) {
          currencies[currKey] += value; // Add to existing amount
          HM.log(3, `Added ${value} to ${currKey}`);
        } else {
          currencies.gp += value; // Default to gold if currency not recognized
          HM.log(3, `Unrecognized currency '${currency}', defaulting to gp: ${value}`);
        }
      }
    });

    return currencies;
  }

  /* -------------------------------------------- */
  /*  Static Private Methods                      */
  /* -------------------------------------------- */

  /**
   * Collects and filters equipment items from selected compendiums
   * @param {string[]} selectedPacks - Array of selected compendium IDs
   * @returns {Promise<Array<object>>} Array of non-magical equipment items
   * @throws {Error} If item collection fails
   * @private
   * @static
   */
  static async #collectAllItems(selectedPacks) {
    HM.log(3, `Collecting items from ${selectedPacks.length} packs`);
    const startTime = performance.now();

    try {
      // Pre-filter packs to avoid processing non-item packs
      const packs = selectedPacks.map((id) => game.packs.get(id)).filter((p) => p?.documentName === 'Item');

      if (packs.length === 0) {
        HM.log(3, 'No valid item packs found');
        return [];
      }

      const skipTypes = ['race', 'feat', 'background', 'class', 'natural', 'spell'];
      const focusItemIds = this.collectFocusItemIds();

      // Process packs in batches to reduce memory pressure
      const BATCH_SIZE = 3;
      const items = [];

      for (let i = 0; i < packs.length; i += BATCH_SIZE) {
        const batchPacks = packs.slice(i, i + BATCH_SIZE);
        const packIndices = await Promise.all(batchPacks.map((pack) => pack.getIndex()));

        // Process this batch in parallel
        const batchResults = await Promise.all(packIndices.map((index) => this.processPackIndex(index, skipTypes, focusItemIds)));

        // Add items from this batch
        batchResults.forEach((result) => items.push(...result.packItems));

        // Free memory between batches
        if (i + BATCH_SIZE < packs.length) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      const endTime = performance.now();
      HM.log(3, `Collected ${items.length} items in ${(endTime - startTime).toFixed(0)}ms`);
      return items;
    } catch (error) {
      const endTime = performance.now();
      HM.log(1, `Failed after ${(endTime - startTime).toFixed(0)}ms: ${error.message}`);
      return [];
    }
  }

  /**
   * Collect focus item IDs from CONFIG
   * @returns {Set<string>} Set of focus item IDs from the system configuration
   * @static
   * @private
   */
  static collectFocusItemIds() {
    const focusItemIds = new Set();

    // Collect focus item IDs
    Object.values(CONFIG.DND5E.focusTypes).forEach((config) => {
      if (config?.itemIds) {
        Object.values(config.itemIds).forEach((id) => focusItemIds.add(id));
      }
    });

    HM.log(3, `Collected ${focusItemIds.size} focus item IDs`);
    return focusItemIds;
  }

  /**
   * Process an individual pack index
   * @param {Array<Object>} index - The pack index
   * @param {Array<string>} skipTypes - Types to skip
   * @param {Set<string>} focusItemIds - IDs of focus items
   * @returns {Object} Processing results with packItems and counts
   * @static
   * @private
   */
  static async processPackIndex(index, skipTypes, focusItemIds) {
    const packItems = [];
    const skipItems = [];
    let processedCount = 0;
    let skippedCount = 0;

    for (const item of index) {
      const isMagic = Array.isArray(item.system?.properties) && item.system.properties.includes('mgc');

      this.itemUuidMap.set(item._id, item.uuid);

      if (skipTypes.includes(item.type) || skipTypes.includes(item.system?.type?.value) || item.system?.identifier === 'unarmed-strike' || isMagic) {
        skippedCount++;
        skipItems.push(item);
        continue;
      }

      if (focusItemIds.has(item._id)) {
        item.system.type.value = 'focus';
      }

      if (item.type === 'tool' && item.system?.type?.value) {
        const toolType = item.system.type.value;
        if (Object.keys(CONFIG.DND5E.toolTypes).includes(toolType)) {
          item.system.type.value = toolType;
        }
      }
      processedCount++;
      packItems.push(item);
    }

    HM.log(3, `Processed ${processedCount} items, skipped ${skippedCount} items`);
    return { packItems, processedCount, skippedCount };
  }
}
