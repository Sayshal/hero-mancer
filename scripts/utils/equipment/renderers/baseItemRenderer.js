import { HM } from '../../index.js';

/**
 * Base class for equipment item renderers
 */
export class BaseItemRenderer {
  /**
   * Creates a new BaseItemRenderer
   * @param {Object} renderer - The parent EquipmentRenderer instance
   */
  constructor(renderer) {
    this.renderer = renderer;
    this.parser = renderer.parser;
    HM.log(3, `BaseItemRenderer: Initialized with parser ${this.parser?.constructor.name}`);
  }

  /**
   * Adds a label to equipment item as a table header row
   * @param {HTMLElement} container - Table container
   * @param {Object} item - Equipment item
   * @returns {Promise<void>}
   */
  async addItemLabel(container, item) {
    // Validate inputs
    if (!container || !item) {
      HM.log(2, 'Invalid container or item provided to addItemLabel');
      return;
    }

    // Skip if item is in a group or linked
    if (item.group || item.type === 'linked') {
      HM.log(3, `Skipping label for grouped or linked item ${item?._id}`);
      return;
    }

    if (item.key) {
      try {
        // Create table header row and cell
        const headerRow = document.createElement('tr');
        const headerCell = document.createElement('th');
        headerCell.colSpan = 2; // Span both columns

        // Create and populate the label element
        const labelElement = document.createElement('h4');
        labelElement.classList.add('parent-label');

        // Get item document and extract label
        const itemDoc = await this.resolveItemDocument(item.key);
        const labelText = itemDoc ? item.label || `${item.count || ''} ${itemDoc.name}` : item.label || game.i18n.localize('hm.app.equipment.choose-one');

        labelElement.innerHTML = labelText;

        // Assemble and append to container
        headerCell.appendChild(labelElement);
        headerRow.appendChild(headerCell);
        container.appendChild(headerRow);

        HM.log(3, `Added table header with label "${labelText}" for item ${item._id}`);
      } catch (error) {
        HM.log(1, `Error adding label for item ${item._source?.key}: ${error.message}`);
      }
    }
  }

  /**
   * Resolves an item document from a UUID
   * @param {string} key - Item UUID or key
   * @returns {Promise<Object|null>} Resolved document or null
   * @private
   */
  async resolveItemDocument(key) {
    if (!key) return null;

    try {
      // Try sync method first for performance
      let itemDoc = await fromUuidSync(key);

      // If sync method fails, try async method
      if (!itemDoc) {
        try {
          itemDoc = await fromUuid(key);
        } catch (err) {
          HM.log(1, `Error resolving UUID ${key}: ${err.message}`);
          return null;
        }
      }

      return itemDoc;
    } catch (error) {
      HM.log(1, `Failed to resolve item document for ${key}: ${error.message}`);
      return null;
    }
  }

  /**
   * Adds a favorite star to item in the appropriate table cell
   * @param {HTMLElement} container - Table container
   * @param {Object} item - Equipment item
   * @returns {HTMLElement} Created favorite checkbox
   */
  addFavoriteStar(container, item) {
    if (container.innerHTML === '') {
      HM.log(3, `Skipping empty container for item ${item?._id}`);
      return;
    }

    // Create elements
    const favoriteContainer = document.createElement('div');
    favoriteContainer.classList.add('equipment-favorite-container');

    const favoriteLabel = document.createElement('label');
    favoriteLabel.classList.add('equipment-favorite-label');
    favoriteLabel.title = game.i18n.localize('hm.app.equipment.add-favorites');

    const favoriteCheckbox = document.createElement('input');
    favoriteCheckbox.type = 'checkbox';
    favoriteCheckbox.classList.add('equipment-favorite-checkbox');

    // Extract display name and set identifiers
    let itemName = this.extractItemName(container, item);
    favoriteCheckbox.dataset.itemName = itemName;
    this.setFavoriteIdentifiers(favoriteCheckbox, container, item);

    // Create the star icon with event listener
    const starIcon = document.createElement('i');
    starIcon.classList.add('fa-bookmark', 'equipment-favorite-star', 'fa-thin');

    favoriteCheckbox.addEventListener('change', function () {
      if (this.checked) {
        starIcon.classList.remove('fa-thin');
        starIcon.classList.add('fa-solid');
      } else {
        starIcon.classList.remove('fa-solid');
        starIcon.classList.add('fa-thin');
      }
    });

    // Assemble components
    favoriteLabel.appendChild(favoriteCheckbox);
    favoriteLabel.appendChild(starIcon);
    favoriteContainer.appendChild(favoriteLabel);

    // Find an appropriate star cell to place the star
    const starCell = this.findStarCell(container);
    if (starCell) {
      starCell.appendChild(favoriteContainer);
    } else {
      // Create a new row if necessary
      const row = document.createElement('tr');
      const emptyCell = document.createElement('td');
      const newStarCell = document.createElement('td');
      newStarCell.appendChild(favoriteContainer);
      row.appendChild(emptyCell);
      row.appendChild(newStarCell);
      container.appendChild(row);
    }

    HM.log(3, `Added favorite star in table for "${itemName}" with ID ${favoriteCheckbox.id}`);
    return favoriteCheckbox;
  }

  /**
   * Find an appropriate cell for the favorite star
   * @param {HTMLElement} container - Table container
   * @returns {HTMLElement|null} Star cell or null
   */
  findStarCell(container) {
    // Look for the last row with an empty second cell
    const rows = container.querySelectorAll('tr');
    if (rows.length === 0) return null;

    // Skip header row
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.cells.length > 1 && !row.cells[1].hasChildNodes()) {
        return row.cells[1];
      }
    }

    // If no empty cell found, use the last row's second cell
    const lastRow = rows[rows.length - 1];
    return lastRow.cells.length > 1 ? lastRow.cells[1] : null;
  }

  /**
   * Extract item name from container or item data
   * @param {HTMLElement} container - Item container
   * @param {Object} item - Item data
   * @returns {string} Item name
   */
  extractItemName(container, item) {
    // Validate inputs
    if (!container || !item) {
      HM.log(2, 'Invalid container or item in extractItemName');
      return '';
    }

    let itemName = '';

    try {
      // Try to get name from DOM elements first
      const itemHeader = container.querySelector('h4');
      const itemLabel = container.querySelector('label');

      if (itemHeader && itemHeader.textContent) {
        itemName = itemHeader.textContent.trim();
      } else if (itemLabel && itemLabel.textContent) {
        itemName = itemLabel.textContent.trim();
      } else {
        // Fall back to item data
        itemName = item.name || item.label || '';
      }

      // Clean up the name - remove checkbox symbols
      const cleanedName = itemName.replace(/^\s*☐\s*|\s*☑\s*/g, '').trim();

      HM.log(3, `Extracted name "${cleanedName}" for item ${item?._id}`);
      return cleanedName;
    } catch (error) {
      HM.log(1, `Error extracting item name: ${error.message}`);
      // Fallback to any available identifier
      return item.name || item.label || item._id || 'Unknown Item';
    }
  }

  /**
   * Set identifiers for favorite checkbox
   * @param {HTMLElement} checkbox - Favorite checkbox
   * @param {HTMLElement} container - Item container
   * @param {Object} item - Item data
   */
  setFavoriteIdentifiers(checkbox, container, item) {
    // Validate inputs
    if (!checkbox || !container) {
      HM.log(2, 'Missing checkbox or container in setFavoriteIdentifiers');
      return;
    }

    // Try identifiers in order of precedence
    if (this.trySetCombinedItemIdentifiers(checkbox, container, item)) {
      return;
    }

    if (this.trySetContentUuidIdentifiers(checkbox, container, item)) {
      return;
    }

    if (this.trySetSourceKeyIdentifiers(checkbox, item)) {
      return;
    }

    // Fallback to item ID
    this.setItemIdIdentifier(checkbox, item);
  }

  /**
   * Try to set identifiers for combined items
   * @param {HTMLElement} checkbox - Favorite checkbox
   * @param {HTMLElement} container - Item container
   * @param {Object} item - Item data
   * @returns {boolean} True if identifiers were set
   * @private
   */
  trySetCombinedItemIdentifiers(checkbox, container, item) {
    const parentCheckbox = container.querySelector('input[type="checkbox"]');
    if (parentCheckbox && parentCheckbox.id && parentCheckbox.id.includes(',')) {
      // This is a combined item with multiple UUIDs in the ID
      checkbox.dataset.itemUuids = parentCheckbox.id;
      checkbox.id = parentCheckbox.id;
      HM.log(3, `Using combined IDs for item ${item?._id}: ${parentCheckbox.id}`);
      return true;
    }
    return false;
  }

  /**
   * Try to set identifiers from UUIDs in content
   * @param {HTMLElement} checkbox - Favorite checkbox
   * @param {HTMLElement} container - Item container
   * @param {Object} item - Item data
   * @returns {boolean} True if identifiers were set
   * @private
   */
  trySetContentUuidIdentifiers(checkbox, container, item) {
    // Check for data-uuid attributes in the container
    const uuids = this.extractUUIDsFromContent(container.innerHTML);

    if (uuids.length > 0) {
      // Store all UUIDs for multi-item favorites
      checkbox.dataset.itemUuids = uuids.join(',');
      checkbox.id = uuids.join(',');
      HM.log(3, `Using ${uuids.length} UUIDs from content for item ${item?._id}`);
      return true;
    }
    return false;
  }

  /**
   * Try to set identifiers from source key
   * @param {HTMLElement} checkbox - Favorite checkbox
   * @param {Object} item - Item data
   * @returns {boolean} True if identifiers were set
   * @private
   */
  trySetSourceKeyIdentifiers(checkbox, item) {
    if (item._source?.key) {
      // For linked items that have a source key
      const sourceKey = item._source.key;
      checkbox.dataset.itemUuids = sourceKey;
      checkbox.id = sourceKey;
      HM.log(3, `Using source key for item ${item?._id}: ${sourceKey}`);
      return true;
    }
    return false;
  }

  /**
   * Set identifier from item ID
   * @param {HTMLElement} checkbox - Favorite checkbox
   * @param {Object} item - Item data
   * @private
   */
  setItemIdIdentifier(checkbox, item) {
    // Fallback for other items
    const itemId = item?._id || '';
    checkbox.dataset.itemId = itemId;
    checkbox.id = itemId;
    HM.log(3, `Using item ID for item ${item?._id}`);
  }

  /**
   * Extract UUIDs from HTML content
   * @param {string} content - HTML content
   * @returns {string[]} Array of UUIDs
   */
  extractUUIDsFromContent(content) {
    const uuidRegex = /data-uuid="([^"]+)"/g;
    const uuids = [];
    let match;

    while ((match = uuidRegex.exec(content)) !== null) {
      uuids.push(match[1]);
    }

    HM.log(3, `Found ${uuids.length} UUIDs in content`);
    return uuids;
  }

  /**
   * Gets label for lookup key from CONFIG
   * @param {string} key - Lookup key
   * @returns {string} Label for key
   */
  getLookupKeyLabel(key) {
    const label = this.parser.constructor.lookupItems[key]?.label;
    HM.log(3, `Key "${key}" has label "${label}"`);
    return label;
  }
}
