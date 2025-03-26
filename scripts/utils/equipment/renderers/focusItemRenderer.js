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
    HM.log(3, `Processing Focus Item: ${item._id}`, { item, itemContainer });

    if (!item?.key) {
      HM.log(1, 'Invalid focus item:', item);
      return null;
    }

    if (this.renderer.shouldItemUseDropdownDisplay(item)) {
      return null;
    }

    const focusType = item.key;
    const focusConfig = CONFIG.DND5E.focusTypes[focusType];

    if (!focusConfig) {
      HM.log(2, `No focus configuration found for type: ${focusType}`);
      return null;
    }

    const select = this.createFocusSelect(item, focusConfig);

    if (select.options.length === 0) {
      HM.log(1, `No valid focus items found for type: ${focusType}`);
      return null;
    }

    const label = document.createElement('h4');
    label.htmlFor = select.id;
    label.innerHTML = `${focusConfig.label}`;

    itemContainer.appendChild(label);
    itemContainer.appendChild(select);

    this.addFavoriteStar(itemContainer, item);
    return itemContainer;
  }

  /**
   * Create select element for focus items
   * @param {Object} item - Focus item
   * @param {Object} focusConfig - Focus configuration
   * @returns {HTMLSelectElement} Select element
   */
  createFocusSelect(item, focusConfig) {
    const select = document.createElement('select');
    select.id = `${item.key}-focus`;

    const itemPacks = game.settings.get(HM.ID, 'itemPacks');

    for (const [focusName, itemId] of Object.entries(focusConfig.itemIds)) {
      this.addFocusOption(select, focusName, itemId, itemPacks);
    }

    return select;
  }

  /**
   * Add a focus option to the select element
   * @param {HTMLSelectElement} select - Select element
   * @param {string} focusName - Focus name
   * @param {string} itemId - Item ID
   * @param {string[]} itemPacks - Item packs
   */
  async addFocusOption(select, focusName, itemId, itemPacks) {
    let uuid = itemId.uuid || this.parser.constructor.itemUuidMap.get(itemId);

    if (!uuid) {
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
        return;
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
}
