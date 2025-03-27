import { HM } from '../../index.js';
import { BaseItemRenderer } from '../index.js';

/**
 * Renderer for focus equipment items
 */
export class FocusItemRenderer extends BaseItemRenderer {
  /**
   * Render a focus equipment item
   * @param {object} item - Focus item data
   * @param {HTMLElement} itemContainer - Container element
   * @returns {Promise<HTMLElement|null>} Rendered container or null
   */
  async render(item, itemContainer) {
    HM.log(3, `FocusItemRenderer.render: Processing focus item ${item?._id}`);

    // Validate that we have required data
    if (!this.validateFocusItem(item)) {
      return null;
    }

    // Skip if this should be displayed as part of a dropdown
    if (this.renderer.shouldItemUseDropdownDisplay(item)) {
      HM.log(3, `FocusItemRenderer.render: Item ${item._id} should use dropdown display, skipping direct rendering`);
      return null;
    }

    // Get focus configuration
    const focusType = item.key;
    const focusConfig = CONFIG.DND5E.focusTypes[focusType];

    if (!focusConfig) {
      HM.log(2, `FocusItemRenderer.render: No focus configuration found for type: ${focusType}`);
      return null;
    }

    // Create select element with options
    const select = await this.createFocusSelect(item, focusConfig);

    // Verify we have options
    if (select.options.length === 0) {
      HM.log(1, `FocusItemRenderer.render: No valid focus items found for type: ${focusType}`);
      return null;
    }

    // Add label and select to container
    this.assembleFocusUI(itemContainer, select, focusConfig);

    // Add favorite star
    this.addFavoriteStar(itemContainer, item);

    HM.log(3, `FocusItemRenderer.render: Successfully rendered focus item ${item._id}`);
    return itemContainer;
  }

  /**
   * Validate that we have a proper focus item
   * @param {Object} item - Focus item to validate
   * @returns {boolean} True if valid
   * @private
   */
  validateFocusItem(item) {
    if (!item?.key) {
      HM.log(1, `FocusItemRenderer.validateFocusItem: Invalid focus item - missing key for item ${item?._id}`);
      return false;
    }
    return true;
  }

  /**
   * Assemble focus UI components
   * @param {HTMLElement} itemContainer - Container element
   * @param {HTMLSelectElement} select - Select element with options
   * @param {Object} focusConfig - Focus configuration
   * @private
   */
  assembleFocusUI(itemContainer, select, focusConfig) {
    HM.log(3, 'FocusItemRenderer.assembleFocusUI: Assembling focus UI components');

    const label = document.createElement('h4');
    label.htmlFor = select.id;
    label.innerHTML = `${focusConfig.label}`;

    itemContainer.appendChild(label);
    itemContainer.appendChild(select);

    HM.log(3, `FocusItemRenderer.assembleFocusUI: Added label "${focusConfig.label}" and select with ${select.options.length} options`);
  }

  /**
   * Create select element for focus items
   * @param {Object} item - Focus item
   * @param {Object} focusConfig - Focus configuration
   * @returns {Promise<HTMLSelectElement>} Select element
   * @private
   */
  async createFocusSelect(item, focusConfig) {
    HM.log(3, `FocusItemRenderer.createFocusSelect: Creating select for focus type ${item.key}`);

    const select = document.createElement('select');
    select.id = `${item.key}-focus`;

    const itemPacks = (await game.settings.get(HM.ID, 'itemPacks')) || [];
    HM.log(3, `FocusItemRenderer.createFocusSelect: Found ${itemPacks.length} item packs`);

    // Add options for each focus item
    const focusEntries = Object.entries(focusConfig.itemIds);
    HM.log(3, `FocusItemRenderer.createFocusSelect: Processing ${focusEntries.length} focus options`);

    for (const [focusName, itemId] of focusEntries) {
      await this.addFocusOption(select, focusName, itemId, itemPacks);
    }

    HM.log(3, `FocusItemRenderer.createFocusSelect: Created select with ${select.options.length} options`);
    return select;
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
    HM.log(3, `FocusItemRenderer.addFocusOption: Adding option for ${focusName}`);

    // Try to get UUID for this item
    let uuid = await this.findFocusItemUuid(focusName, itemId, itemPacks);

    if (!uuid) {
      HM.log(2, `FocusItemRenderer.addFocusOption: No UUID found for focus: ${focusName}`);
      return;
    }

    // Create option element
    const option = document.createElement('option');
    option.value = uuid;
    option.innerHTML = focusName.charAt(0).toUpperCase() + focusName.slice(1);

    // Select first option by default
    if (select.options.length === 0) {
      option.selected = true;
    }

    select.appendChild(option);
    HM.log(3, `FocusItemRenderer.addFocusOption: Added option "${focusName}" with UUID ${uuid}`);
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
    HM.log(3, `FocusItemRenderer.findFocusItemUuid: Looking for UUID for ${focusName}`);

    // Check if we already have a UUID
    let uuid = itemId.uuid || this.parser.constructor.itemUuidMap.get(itemId);

    if (uuid) {
      HM.log(3, `FocusItemRenderer.findFocusItemUuid: Found existing UUID ${uuid} for ${focusName}`);
      return uuid;
    }

    // Search packs for matching item by name
    for (const packId of itemPacks) {
      const pack = game.packs.get(packId);
      if (!pack) continue;

      const index = await pack.getIndex();
      const matchingItem = index.find((i) => i.name.toLowerCase() === focusName.toLowerCase());

      if (matchingItem) {
        uuid = matchingItem.uuid;
        HM.log(3, `FocusItemRenderer.findFocusItemUuid: Found item by name "${matchingItem.name}" with UUID ${uuid}`);
        return uuid;
      }
    }

    HM.log(2, `FocusItemRenderer.findFocusItemUuid: No matching item found for focus: ${focusName}`);
    return null;
  }
}
