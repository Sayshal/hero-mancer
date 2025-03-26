import { HM } from '../../index.js';
import { BaseItemRenderer } from '../index.js';

/**
 * Renderer for tool equipment items
 */
export class ToolItemRenderer extends BaseItemRenderer {
  /**
   * Render a tool equipment item
   * @param {object} item - Tool item data
   * @param {HTMLElement} itemContainer - Container element
   * @returns {Promise<HTMLElement|null>} Rendered container or null
   */
  async render(item, itemContainer) {
    HM.log(3, `Processing Tool: ${item._id}`, { item, itemContainer });

    if (!item?.key) {
      HM.log(1, 'Invalid tool item:', item);
      return null;
    }

    if (this.renderer.shouldItemUseDropdownDisplay(item)) {
      return null;
    }

    const toolType = item.key;
    const toolConfig = CONFIG.DND5E.toolTypes[toolType];

    if (!toolConfig) {
      HM.log(2, `No tool configuration found for type: ${toolType}`);
      return null;
    }

    const select = this.createToolSelect(item, toolType);

    if (select.options.length === 0) {
      HM.log(2, `No valid tool items found for type: ${toolType}`);
      return null;
    }

    const label = document.createElement('h4');
    label.htmlFor = select.id;
    label.innerHTML = `${toolConfig}`;

    itemContainer.appendChild(label);
    itemContainer.appendChild(select);

    this.addFavoriteStar(itemContainer, item);
    return itemContainer;
  }

  /**
   * Create select element for tool items
   * @param {Object} item - Tool item
   * @param {string} toolType - Tool type
   * @returns {HTMLSelectElement} Select element
   */
  createToolSelect(item, toolType) {
    const select = document.createElement('select');
    select.id = `${item.key}-tool`;

    // Get tools of this specific type
    const toolItems = Array.from(this.parser.constructor.lookupItems[toolType].items || []);
    toolItems.sort((a, b) => a.name.localeCompare(b.name));

    for (const tool of toolItems) {
      const option = document.createElement('option');
      option.value = tool.uuid || tool._source?.key;
      option.innerHTML = tool.name;

      if (select.options.length === 0) {
        option.selected = true;
      }

      select.appendChild(option);
    }

    return select;
  }
}
