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
  }

  /**
   * Validates if item can be rendered
   * @param {Object} item - Equipment item
   * @returns {boolean} True if item can be rendered
   */
  canRender(item) {
    return item && !this.hasItemBeenRendered(item);
  }

  /**
   * Creates a basic container for an equipment item
   * @param {object} item - Equipment item
   * @returns {HTMLElement} Container element
   */
  createItemContainer(item) {
    const itemContainer = document.createElement('div');
    itemContainer.classList.add('equipment-item');
    return itemContainer;
  }

  /**
   * Adds a label to an equipment item container
   * @param {HTMLElement} container - Container element
   * @param {Object} item - Equipment item
   */
  async addItemLabel(container, item) {
    if (!item.group) {
      const labelElement = document.createElement('h4');
      labelElement.classList.add('parent-label');

      let shouldAddLabel = false;

      if (item.key) {
        try {
          let itemDoc = await fromUuidSync(item.key);

          // If fromUuidSync fails, try regular fromUuid
          if (!itemDoc) {
            try {
              itemDoc = await fromUuid(item.key);
            } catch (err) {
              HM.log(1, `Error getting document for item ${item._source?.key}: ${err.message}`);
            }
          }

          if (itemDoc) {
            labelElement.innerHTML = `${item.label || `${item.count || ''} ${itemDoc.name}`}`;
            shouldAddLabel = true;
          } else {
            HM.log(1, `No document found for item key: ${item.key}`, { item, labelElement });
            labelElement.innerHTML = `${item.label || game.i18n.localize('hm.app.equipment.choose-one')}`;
            shouldAddLabel = true;
          }
        } catch (error) {
          HM.log(1, `Error getting label for item ${item._source?.key}: ${error.message}`, { item, labelElement });
          labelElement.innerHTML = `${item.label || game.i18n.localize('hm.app.equipment.choose-one')}`;
          shouldAddLabel = true;
        }
      }

      if (shouldAddLabel) {
        container.appendChild(labelElement);
      }
    }
  }

  /**
   * Adds a favorite star to an item container
   * @param {HTMLElement} container - Container element
   * @param {Object} item - Equipment item
   * @returns {HTMLElement} Created favorite checkbox
   */
  addFavoriteStar(container, item) {
    if (container.innerHTML === '') return;

    const favoriteContainer = document.createElement('div');
    favoriteContainer.classList.add('equipment-favorite-container');

    const favoriteLabel = document.createElement('label');
    favoriteLabel.classList.add('equipment-favorite-label');
    favoriteLabel.title = 'Add to favorites';

    const favoriteCheckbox = document.createElement('input');
    favoriteCheckbox.type = 'checkbox';
    favoriteCheckbox.classList.add('equipment-favorite-checkbox');

    // Extract display name
    let itemName = this.extractItemName(container, item);
    favoriteCheckbox.dataset.itemName = itemName;

    // Set UUID or ID information
    this.setFavoriteIdentifiers(favoriteCheckbox, container, item);

    // Create the star icon
    const starIcon = document.createElement('i');
    starIcon.classList.add('fa-bookmark', 'equipment-favorite-star', 'fa-thin');

    // Add event listener for star toggle
    favoriteCheckbox.addEventListener('change', function () {
      if (this.checked) {
        starIcon.classList.remove('fa-thin');
        starIcon.classList.add('fa-solid');
      } else {
        starIcon.classList.remove('fa-solid');
        starIcon.classList.add('fa-thin');
      }
    });

    // Assemble the components
    favoriteLabel.appendChild(favoriteCheckbox);
    favoriteLabel.appendChild(starIcon);
    favoriteContainer.appendChild(favoriteLabel);

    this.appendFavoriteToContainer(container, favoriteContainer);

    return favoriteCheckbox;
  }

  /**
   * Extract item name from container or item data
   * @param {HTMLElement} container - Item container
   * @param {Object} item - Item data
   * @returns {string} Item name
   */
  extractItemName(container, item) {
    let itemName = '';
    const itemHeader = container.querySelector('h4');
    const itemLabel = container.querySelector('label');

    if (itemHeader && itemHeader.textContent) {
      itemName = itemHeader.textContent.trim();
    } else if (itemLabel && itemLabel.textContent) {
      itemName = itemLabel.textContent.trim();
    } else {
      itemName = item.name || item.label || '';
    }

    // Clean up the name
    return itemName.replace(/^\s*☐\s*|\s*☑\s*/g, '').trim();
  }

  /**
   * Set identifiers for favorite checkbox
   * @param {HTMLElement} checkbox - Favorite checkbox
   * @param {HTMLElement} container - Item container
   * @param {Object} item - Item data
   */
  setFavoriteIdentifiers(checkbox, container, item) {
    // Check for combined items first (these have comma-separated UUIDs in the ID)
    const parentCheckbox = container.querySelector('input[type="checkbox"]');
    if (parentCheckbox && parentCheckbox.id && parentCheckbox.id.includes(',')) {
      // This is a combined item with multiple UUIDs in the ID
      checkbox.dataset.itemUuids = parentCheckbox.id;
      checkbox.id = parentCheckbox.id;
      return;
    }

    // Check for data-uuid attributes in the container
    const uuids = this.extractUUIDsFromContent(container.innerHTML);

    if (uuids.length > 0) {
      // Store all UUIDs for multi-item favorites
      checkbox.dataset.itemUuids = uuids.join(',');
      checkbox.id = uuids.join(',');
    } else if (item._source?.key) {
      // For linked items that have a source key
      const sourceKey = item._source.key;
      checkbox.dataset.itemUuids = sourceKey;
      checkbox.id = sourceKey;
    } else {
      // Fallback for other items
      const itemId = item._id || '';
      checkbox.dataset.itemId = itemId;
      checkbox.id = itemId;
    }
  }

  /**
   * Append favorite container to the item container
   * @param {HTMLElement} container - Item container
   * @param {HTMLElement} favoriteContainer - Favorite container
   */
  appendFavoriteToContainer(container, favoriteContainer) {
    if (container.querySelector('label')) {
      container.querySelector('label').insertAdjacentElement('afterend', favoriteContainer);
    } else if (container.querySelector('h4')) {
      container.querySelector('h4').insertAdjacentElement('afterend', favoriteContainer);
    } else if (container.querySelector('select')) {
      container.querySelector('select').insertAdjacentElement('afterend', favoriteContainer);
    } else {
      container.appendChild(favoriteContainer);
    }
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

    return uuids;
  }

  /**
   * Checks if an item has been rendered
   * @param {Object} item - Equipment item
   * @returns {boolean} True if already rendered
   */
  hasItemBeenRendered(item) {
    return this.parser.constructor.renderedItems.has(item._id);
  }

  /**
   * Creates an error element for failed rendering
   * @returns {HTMLElement} Error element
   */
  createErrorElement() {
    const errorElement = document.createElement('div');
    errorElement.classList.add('equipment-item-error');
    errorElement.textContent = game.i18n.localize('hm.app.equipment.unknown-choice');
    return errorElement;
  }

  /**
   * Gets label for lookup key from CONFIG
   * @param {string} key - Lookup key
   * @returns {string} Label for key
   */
  getLookupKeyLabel(key) {
    return this.parser.constructor.lookupItems[key]?.label;
  }
}
