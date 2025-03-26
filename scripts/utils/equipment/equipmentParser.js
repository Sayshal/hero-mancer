import { HM } from '../../utils/index.js';
import { EquipmentDataService, EquipmentRenderer } from './index.js';

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
   * Lookup items by category
   * @type {Object}
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
   * Initializes properties and preloads compendium indices
   */
  constructor() {
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
  }

  /* -------------------------------------------- */
  /*  Public Methods                              */
  /* -------------------------------------------- */

  /**
   * Retrieves and combines equipment data from class and background selections
   * @async
   * @returns {Promise<void>}
   */
  async fetchEquipmentData() {
    this.equipmentData = await this.dataService.fetchEquipmentData();
  }

  /**
   * Searches all selectedPacks for a document by ID
   * @async
   * @param {string} itemId - Item ID to search for
   * @returns {Promise<Item|null>} Found item document or null
   */
  async findItemDocumentById(itemId) {
    return this.dataService.findItemDocumentById(itemId);
  }

  /**
   * Extracts granted proficiencies from advancement data
   * @async
   * @param {Array<object>} advancements - Array of advancement configurations
   * @returns {Promise<Set<string>>} Set of granted proficiency strings
   */
  async extractProficienciesFromAdvancements(advancements) {
    return this.dataService.extractProficienciesFromAdvancements(advancements);
  }

  /**
   * Fetches starting equipment and proficiencies for a given selection type
   * @async
   * @param {'class'|'background'} type - Selection type to fetch equipment for
   * @returns {Promise<Array<object>>} Starting equipment array
   */
  async getStartingEquipment(type) {
    return this.dataService.getStartingEquipment(type);
  }

  /**
   * Renders starting wealth options for class or background
   * @async
   * @param {HTMLElement} sectionContainer - Container element to render into
   * @param {string} type - Selection type ('class'|'background')
   * @throws {Error} If wealth option rendering fails
   */
  async renderWealthOption(sectionContainer, type = 'class') {
    try {
      const itemUUID = HM.SELECTED[type].uuid;
      if (!itemUUID) return;

      const item = await fromUuidSync(itemUUID);
      if (!item) return;

      const rulesVersion = item?.system?.source?.rules;
      const isModernRules = rulesVersion === '2024';
      const wealthValue = item.system.wealth;

      if (!wealthValue) return;

      const wealthContainer = document.createElement('div');
      wealthContainer.classList.add('wealth-option-container');

      const wealthCheckbox = document.createElement('input');
      wealthCheckbox.type = 'checkbox';
      wealthCheckbox.id = `use-starting-wealth-${type}`;
      wealthCheckbox.name = `use-starting-wealth-${type}`;

      const wealthLabel = document.createElement('label');
      wealthLabel.htmlFor = `use-starting-wealth-${type}`;
      wealthLabel.innerHTML = game.i18n.localize('hm.app.equipment.use-starting-wealth');

      const wealthRollContainer = document.createElement('div');
      wealthRollContainer.classList.add('wealth-roll-container');
      wealthRollContainer.style.display = 'none';

      const wealthInput = document.createElement('input');
      wealthInput.type = 'text';
      wealthInput.id = `starting-wealth-amount-${type}`;
      wealthInput.name = `starting-wealth-amount-${type}`;
      wealthInput.placeholder = game.i18n.localize('hm.app.equipment.wealth-placeholder');

      if (isModernRules) {
        // For 2024 rules, we show flat value without roll button
        wealthInput.value = `${wealthValue} ${CONFIG.DND5E.currencies.gp.abbreviation}`;
        wealthInput.readOnly = true;
      } else {
        // Legacy rules with dice roll
        wealthInput.readOnly = true;

        const rollButton = document.createElement('button');
        rollButton.type = 'button';
        rollButton.innerHTML = game.i18n.localize('hm.app.equipment.roll-wealth');
        rollButton.classList.add('wealth-roll-button');

        rollButton.addEventListener('click', async () => {
          const formula = wealthValue;
          const roll = new Roll(formula);
          await roll.evaluate();
          wealthInput.value = `${roll.total} ${CONFIG.DND5E.currencies.gp.abbreviation}`;
          wealthInput.dispatchEvent(new Event('change', { bubbles: true }));
        });

        wealthRollContainer.appendChild(rollButton);
      }

      wealthCheckbox.addEventListener('change', (event) => {
        const equipmentElements = sectionContainer.querySelectorAll('.equipment-item');
        equipmentElements.forEach((el) => {
          if (event.target.checked) {
            el.classList.add('disabled');
            el.querySelectorAll('select, input[type="checkbox"]:not(.equipment-favorite-checkbox), label').forEach((input) => {
              input.disabled = true;
            });
            // Also disable favorite checkboxes
            el.querySelectorAll('.equipment-favorite-checkbox').forEach((fav) => {
              fav.disabled = true;
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
          wealthInput.value = isModernRules ? `${wealthValue} ${CONFIG.DND5E.currencies.gp.abbreviation}` : '';
        }
      });

      wealthContainer.appendChild(wealthCheckbox);
      wealthContainer.appendChild(wealthLabel);
      wealthRollContainer.appendChild(wealthInput);
      wealthContainer.appendChild(wealthRollContainer);

      sectionContainer.appendChild(wealthContainer);

      HM.log(3, `Rendered wealth options for ${type}`);
    } catch (error) {
      HM.log(1, `Error rendering wealth option: ${error}`);
    }
  }

  /**
   * Renders equipment selection UI for specified or all types
   * @async
   * @param {?string} type - Optional type to render ('class'|'background'). If null, renders all
   * @returns {Promise<HTMLElement>} Container element with rendered equipment choices
   */
  async generateEquipmentSelectionUI(type = null) {
    return this.renderer.generateEquipmentSelectionUI(type);
  }

  /**
   * Extract equipment description from document HTML
   * @param {Document} document - The document to extract equipment info from
   * @returns {string|null} - HTML string with equipment description or null if not found
   */
  extractEquipmentDescription(document) {
    return this.dataService.extractEquipmentDescription(document);
  }

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

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
    const equipment = [];
    const equipmentContainer = event.target?.querySelector('#equipment-container');
    if (!equipmentContainer) return equipment;

    async function findItemInPacks(itemId) {
      if (!itemId) return null;

      // Check if this is a comma-separated list of IDs
      if (itemId.includes(',')) {
        const ids = itemId.split(',').filter((id) => id.trim());

        // For equipment groups, we should return a collection of items
        const items = [];

        for (const id of ids) {
          // Try to find the item
          const item = await findItemInPacks(id.trim());
          if (item) items.push(item);
        }

        // Return first item for backward compatibility
        return items.length > 0 ? items[0] : null;
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
        HM.log(1, `Error finding item ${itemId}:`, error);
        return null;
      }
    }

    async function processContainerItem(containerItem, quantity) {
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
        HM.log(1, `Error processing container ${containerItem?.name || containerItem?._id}:`, error);
      }
    }

    // Get all appropriate sections based on options
    const allSections = Array.from(equipmentContainer.querySelectorAll('.equipment-choices > div'));
    HM.log(
      3,
      `Found ${allSections.length} total equipment sections:`,
      allSections.map((s) => s.className)
    );

    const equipmentSections = allSections.filter((section) => {
      const isClassSection = section.classList.contains('class-equipment-section');
      const isBackgroundSection = section.classList.contains('background-equipment-section');

      HM.log(3, `Section "${section.className}": isClass=${isClassSection}, isBackground=${isBackgroundSection}`);

      if (isClassSection && !options.includeClass) {
        HM.log(3, `Skipping class section because options.includeClass=${options.includeClass}`);
        return false;
      }
      if (isBackgroundSection && !options.includeBackground) {
        HM.log(3, `Skipping background section because options.includeBackground=${options.includeBackground}`);
        return false;
      }
      return true;
    });

    HM.log(3, `After filtering, using ${equipmentSections.length} equipment sections`);

    // Process all sections in parallel
    await Promise.all(
      equipmentSections.map(async (section) => {
        HM.log(3, 'Processing section:', section.className);

        // Get wealth checkbox for this section
        const sectionType = section.classList.contains('class-equipment-section') ? 'class' : 'background';
        const wealthChecked = section.querySelector(`input[id="use-starting-wealth-${sectionType}"]`)?.checked || false;

        // Process dropdowns in parallel - skip if wealth is checked or elements are disabled
        const dropdowns = Array.from(section.querySelectorAll('select')).filter(
          (dropdown) => !dropdown.disabled && !dropdown.closest('.disabled') && (!wealthChecked || !dropdown.closest('.equipment-item'))
        );

        const dropdownPromises = dropdowns.map(async (dropdown) => {
          // Get value (could be IDs or UUIDs)
          const value = dropdown.value || document.getElementById(`${dropdown.id}-default`)?.value;
          if (!value) return;

          try {
            // Try to find the items - value could be single ID/UUID or comma-separated list
            let items = [];

            // Check for comma-separated values (2024 format)
            if (value.includes(',')) {
              // Get UUIDs from option content
              const selectedOption = dropdown.querySelector(`option[value="${value}"]`);
              if (selectedOption) {
                const contentLinks = selectedOption.querySelectorAll('a.content-link');
                if (contentLinks.length) {
                  // Get items from content links
                  items = await Promise.all(Array.from(contentLinks).map((link) => fromUuidSync(link.dataset.uuid)));
                }
              }

              // If no content links, try using IDs directly
              if (!items.length) {
                const ids = value.split(',').filter((id) => id.trim());
                items = await Promise.all(ids.map(async (id) => await findItemInPacks(id)));
              }

              // Filter out nulls
              items = items.filter((item) => item);
            } else {
              // Regular single item lookup
              const item = await findItemInPacks(value);
              if (item) items = [item];
            }

            if (!items.length) return;

            // Process each item
            for (const item of items) {
              const selectedOption = dropdown.querySelector(`option[value="${value}"]`);
              const optionText = selectedOption?.textContent || '';
              const favoriteCheckbox = dropdown.closest('.equipment-item')?.querySelector('.equipment-favorite-checkbox');
              const isFavorite = favoriteCheckbox?.checked || false;

              // Try to find quantity in option text for this specific item
              let quantity = 1;
              const itemNamePattern = new RegExp(`(\\d+)\\s*(?:×|x)?\\s*${item.name}`, 'i');
              const quantityMatch = optionText.match(itemNamePattern);

              if (quantityMatch) {
                quantity = parseInt(quantityMatch[1]);
              } else {
                // Fallback patterns
                const startQuantityMatch = optionText.match(/^(\d+)\s+(.+)$/i);
                const endQuantityMatch = optionText.match(/(.+)\s+\((\d+)\)$/i);
                const midQuantityMatch = optionText.match(/(.+?)\s+[x×](\d+)/i);

                if (startQuantityMatch) quantity = parseInt(startQuantityMatch[1]);
                else if (endQuantityMatch) quantity = parseInt(endQuantityMatch[2]);
                else if (midQuantityMatch) quantity = parseInt(midQuantityMatch[2]);
              }

              HM.log(3, `Processing item ${item.name} with quantity ${quantity}`, { item: item });

              const itemData = item.toObject();
              if (itemData.type === 'container') {
                await processContainerItem(item, quantity);
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
              }
            }
          } catch (error) {
            HM.log(1, `Error processing dropdown ${dropdown.id}:`, error);
          }
        });

        await Promise.all(dropdownPromises);

        // Process checkboxes in parallel - skip if wealth is checked or elements are disabled
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

        const checkboxPromises = checkboxes.map(async (checkbox) => {
          try {
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
                  item: await findItemInPacks(itemId)
                };
              })
            );

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

              const itemData = item.toObject();
              if (itemData.type === 'container') {
                await processContainerItem(item, quantity);
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
                HM.log(3, `Added item to equipment: ${item.name} (qty: ${quantity})`);
              }
            }
          } catch (error) {
            HM.log(1, 'Error processing checkbox:', error);
          }
        });

        await Promise.all(checkboxPromises);
      })
    );

    return equipment;
  }

  /**
   * Retrieves all selected compendium packs from settings.
   * Combines item packs, class packs, background packs, and race packs into a single array.
   * @async
   * @returns {Promise<string[]>} Array of compendium pack IDs
   * @static
   */
  static async getSelectedPacks() {
    const itemPacks = (await game.settings.get(HM.ID, 'itemPacks')) || [];
    const classPacks = (await game.settings.get(HM.ID, 'classPacks')) || [];
    const backgroundPacks = (await game.settings.get(HM.ID, 'backgroundPacks')) || [];
    const racePacks = (await game.settings.get(HM.ID, 'racePacks')) || [];

    return [...itemPacks, ...classPacks, ...backgroundPacks, ...racePacks];
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

    const selectedPacks = await this.getSelectedPacks();

    try {
      const allItems = await this.#collectAllItems(selectedPacks);
      if (!allItems?.length) {
        HM.log(1, 'No items collected from compendiums');
        return;
      }

      // Create categories for all item types we care about
      const categories = {
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

      // Process in chunks to avoid overwhelming the event loop
      const CHUNK_SIZE = 200;
      const chunks = [];

      for (let i = 0; i < allItems.length; i += CHUNK_SIZE) {
        chunks.push(allItems.slice(i, i + CHUNK_SIZE));
      }

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

      // Create aggregated categories
      const aggregatedCategories = {
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

      // Combine all categories
      const allCategories = { ...categories, ...aggregatedCategories };

      // Store the item sets directly
      Object.entries(allCategories).forEach(([key, value]) => {
        this[key] = value.items;
      });

      // Store the complete lookup structure
      this.lookupItems = allCategories;
      const endTime = performance.now();
      HM.log(3, `Equipment lookup initialized in ${(endTime - startTime).toFixed(0)}ms. ${categorizedCount} items categorized.`, { lookup: this.lookupItems });
    } catch (error) {
      const endTime = performance.now();
      HM.log(1, `Equipment lookup initialization failed after ${(endTime - startTime).toFixed(0)}ms:`, error);
    }
  }

  /**
   * Processes starting wealth form data into currency amounts
   * @param {object} formData - Form data containing wealth options
   * @returns {object|null} Currency amounts or null if invalid
   * @static
   */
  static async convertWealthStringToCurrency(formData) {
    // Check both possible wealth sources
    const useClassWealth = formData['use-starting-wealth-class'];
    const useBackgroundWealth = formData['use-starting-wealth-background'];

    // Determine which wealth to use (or none)
    if (!useClassWealth && !useBackgroundWealth) {
      return null;
    }

    // Get the appropriate wealth amount
    let wealthAmount;
    if (useClassWealth) {
      wealthAmount = formData['starting-wealth-amount-class'];
    } else if (useBackgroundWealth) {
      wealthAmount = formData['starting-wealth-amount-background'];
    }

    if (!wealthAmount) return null;

    // Initialize currencies object with zeros using CONFIG
    const currencies = {};
    Object.keys(CONFIG.DND5E.currencies).forEach((key) => {
      currencies[key] = 0;
    });

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
        } else {
          currencies.gp += value; // Default to gold if currency not recognized
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
    const startTime = performance.now();
    const skipTypes = ['race', 'feat', 'background', 'class', 'natural', 'spell'];
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

      // Process all items from all packs in parallel
      const itemProcessingResults = await Promise.all(
        packIndices.map(async (index) => {
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
          return { packItems, processedCount, skippedCount };
        })
      );
      HM.log(3, 'Collection finished:', { itemProcessingResults });

      // Combine results
      const items = [];
      let totalProcessed = 0;
      let totalSkipped = 0;

      for (const result of itemProcessingResults) {
        items.push(...result.packItems);
        totalProcessed += result.processedCount;
        totalSkipped += result.skippedCount;
      }

      const endTime = performance.now();
      HM.log(3, `Items collected in ${(endTime - startTime).toFixed(0)}ms. Processed: ${totalProcessed}, Included: ${items.length}, Skipped: ${totalSkipped}`);
      return items;
    } catch (error) {
      const endTime = performance.now();
      HM.log(1, `Item collection failed after ${(endTime - startTime).toFixed(0)}ms:`, error);
      return [];
    }
  }
}
