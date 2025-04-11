import { BaseItemRenderer, HM } from '../../index.js';

/**
 * Renderer for focus equipment items
 */
export class FocusItemRenderer extends BaseItemRenderer {
  /**
   * Render a focus equipment item as a table
   * @param {object} item - Focus item data
   * @param {HTMLElement} itemContainer - Table container
   * @returns {Promise<HTMLElement|null>} Rendered container or null
   */
  async render(item, itemContainer) {
    HM.log(3, `Processing focus item ${item?._id}`);

    try {
      // Validation logic
      if (!this.validateFocusItem(item)) {
        return null;
      }

      if (this.renderer.shouldItemUseDropdownDisplay(item)) {
        HM.log(3, `Item ${item._id} should use dropdown display, skipping direct rendering`);
        return null;
      }

      const focusType = item.key;
      const focusConfig = CONFIG.DND5E.focusTypes[focusType];

      if (!focusConfig) {
        HM.log(2, `No focus configuration found for type: ${focusType}`);
        return null;
      }

      try {
        // Create header row
        const headerRow = document.createElement('tr');
        const headerCell = document.createElement('th');
        headerCell.colSpan = 2;

        const label = document.createElement('h4');
        label.innerHTML = `${focusConfig.label}`;
        headerCell.appendChild(label);
        headerRow.appendChild(headerCell);
        itemContainer.appendChild(headerRow);

        // Create select row
        const select = await this.createFocusSelect(item, focusConfig);
        if (!select || select.options.length === 0) {
          HM.log(1, `No valid focus items found for type: ${focusType}`);
          return null;
        }

        const selectRow = document.createElement('tr');
        const selectCell = document.createElement('td');
        const starCell = document.createElement('td');

        selectCell.appendChild(select);
        selectRow.appendChild(selectCell);
        selectRow.appendChild(starCell);
        itemContainer.appendChild(selectRow);

        // Add favorite star
        this.addFavoriteStar(itemContainer, item);

        HM.log(3, `Successfully rendered focus item ${item._id} as table`);
        return itemContainer;
      } catch (selectError) {
        HM.log(1, `Error creating focus select: ${selectError.message}`);
        return null;
      }
    } catch (error) {
      HM.log(1, `Critical error rendering focus item: ${error.message}`);
      return null;
    }
  }

  /**
   * Validate that we have a proper focus item
   * @param {Object} item - Focus item to validate
   * @returns {boolean} True if valid
   * @private
   */
  validateFocusItem(item) {
    if (!item?.key) {
      HM.log(1, `Invalid focus item - missing key for item ${item?._id}`);
      return false;
    }
    return true;
  }

  /**
   * Create select element for focus items
   * @param {Object} item - Focus item
   * @param {Object} focusConfig - Focus configuration
   * @returns {Promise<HTMLSelectElement>} Select element
   * @private
   */
  async createFocusSelect(item, focusConfig) {
    HM.log(3, `Creating select for focus type ${item.key}`);

    try {
      // Create select element
      const select = document.createElement('select');
      select.id = `${item.key}-focus`;

      // Get item packs
      const itemPacks = await this.getItemPacks();

      // Get and add options
      await this.addFocusOptionsToSelect(select, focusConfig, itemPacks);

      HM.log(3, `Created select with ${select.options.length} options`);
      return select;
    } catch (error) {
      HM.log(1, `Failed to create focus select: ${error.message}`);
      return document.createElement('select'); // Return empty select as fallback
    }
  }

  /**
   * Get item packs from settings
   * @returns {Promise<string[]>} Array of item pack IDs
   * @private
   */
  async getItemPacks() {
    try {
      const itemPacks = (await game.settings.get(HM.ID, 'itemPacks')) || [];
      HM.log(3, `Found ${itemPacks.length} item packs`);
      return itemPacks;
    } catch (error) {
      HM.log(2, `Error retrieving item packs: ${error.message}`);
      return [];
    }
  }

  /**
   * Add focus options to a select element
   * @param {HTMLSelectElement} select - Select element
   * @param {Object} focusConfig - Focus configuration
   * @param {string[]} itemPacks - Item packs
   * @returns {Promise<void>}
   * @private
   */
  async addFocusOptionsToSelect(select, focusConfig, itemPacks) {
    if (!focusConfig.itemIds || typeof focusConfig.itemIds !== 'object') {
      HM.log(2, 'No item IDs in focus configuration');
      return;
    }

    // Add options for each focus item
    const focusEntries = Object.entries(focusConfig.itemIds);
    HM.log(3, `Processing ${focusEntries.length} focus options`);

    for (const [focusName, itemId] of focusEntries) {
      await this.addFocusOption(select, focusName, itemId, itemPacks);
    }
  }

  /**
   * Add a focus option to the select element
   * @param {HTMLSelectElement} select - Select element
   * @param {string} focusName - Focus name
   * @param {string} itemId - Item ID
   * @param {string[]} itemPacks - Item packs
   * @returns {Promise<void>}
   * @private
   */
  async addFocusOption(select, focusName, itemId, itemPacks) {
    HM.log(3, `Adding option for ${focusName}`);

    if (!select || !focusName) {
      HM.log(2, 'Invalid select or focus name');
      return;
    }

    try {
      // Try to get UUID for this item
      let uuid = await this.findFocusItemUuid(focusName, itemId, itemPacks);

      if (!uuid) {
        HM.log(2, `No UUID found for focus: ${focusName}`);
        return;
      }

      // Create option element
      const option = document.createElement('option');
      option.value = uuid;

      // Format the name properly
      try {
        option.innerHTML = this.formatFocusName(focusName);
      } catch (formatError) {
        HM.log(2, `Error formatting focus name: ${formatError.message}`);
        option.innerHTML = focusName || game.i18n.localize('hm.app.equipment.unknown-focus');
      }

      // Select first option by default
      if (select.options.length === 0) {
        option.selected = true;
      }

      select.appendChild(option);
      HM.log(3, `Added option "${option.innerHTML}" with UUID ${uuid}`);
    } catch (error) {
      HM.log(1, `Error adding focus option: ${error.message}`);
    }
  }

  /**
   * Format a focus name for display
   * @param {string} focusName - Raw focus name
   * @returns {string} Formatted focus name
   * @private
   */
  formatFocusName(focusName) {
    if (!focusName) return game.i18n.localize('hm.app.equipment.unknown-focus');
    return focusName.charAt(0).toUpperCase() + focusName.slice(1);
  }

  /**
   * Find UUID for a focus item
   * @param {string} focusName - Focus name
   * @param {string} itemId - Item ID
   * @param {string[]} itemPacks - Item packs
   * @returns {Promise<string|null>} Item UUID or null
   * @private
   */
  async findFocusItemUuid(focusName, itemId, itemPacks) {
    HM.log(3, `Looking for UUID for ${focusName}`);

    if (!focusName || !itemId) {
      HM.log(2, 'Missing focus name or item ID');
      return null;
    }

    try {
      // Check if we already have a UUID in the item itself
      if (itemId.uuid) {
        HM.log(3, `Found direct UUID ${itemId.uuid} for ${focusName}`);
        return itemId.uuid;
      }

      // Check if we have a UUID in our mapping
      const mappedUuid = this.parser.constructor.itemUuidMap.get(itemId);
      if (mappedUuid) {
        HM.log(3, `Found mapped UUID ${mappedUuid} for ${focusName}`);
        return mappedUuid;
      }

      // No valid item packs to search
      if (!Array.isArray(itemPacks) || itemPacks.length === 0) {
        HM.log(2, 'No item packs available to search');
        return null;
      }

      // Search packs for matching item by name
      const sanitizedFocusName = focusName.toLowerCase().trim();

      for (const packId of itemPacks) {
        if (!packId) continue;

        try {
          const pack = game.packs.get(packId);
          if (!pack) {
            HM.log(3, `Pack not found: ${packId}`);
            continue;
          }

          const index = await pack.getIndex();
          if (!index || index.length === 0) {
            HM.log(3, `Empty index for pack: ${packId}`);
            continue;
          }

          const matchingItem = index.find((i) => i.name && i.name.toLowerCase().trim() === sanitizedFocusName);

          if (matchingItem) {
            const uuid = matchingItem.uuid;
            HM.log(3, `Found item by name "${matchingItem.name}" with UUID ${uuid}`);

            // Cache this UUID for future use
            if (itemId && uuid) {
              this.parser.constructor.itemUuidMap.set(itemId, uuid);
            }

            return uuid;
          }
        } catch (packError) {
          HM.log(2, `Error searching pack ${packId}: ${packError.message}`);
          continue; // Continue with next pack despite error
        }
      }

      HM.log(2, `No matching item found for focus: ${focusName}`);
      return null;
    } catch (error) {
      HM.log(1, `Error finding focus item UUID: ${error.message}`);
      return null;
    }
  }
}
