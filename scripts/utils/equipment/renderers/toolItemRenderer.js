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
    HM.log(3, `Processing tool item ${item?._id}`);

    // Validate that we have required data
    if (!this.validateToolItem(item)) {
      return null;
    }

    // Skip if this should be displayed as part of a dropdown
    if (this.renderer.shouldItemUseDropdownDisplay(item)) {
      HM.log(3, `Item ${item._id} should use dropdown display, skipping direct rendering`);
      return null;
    }

    // Get tool configuration and type
    const toolType = item.key;
    const toolConfig = this.getToolConfiguration(toolType);

    if (!toolConfig) {
      return null;
    }

    // Create select element with options
    const select = this.createToolSelect(item, toolType);

    // Verify we have options
    if (select.options.length === 0) {
      HM.log(2, `No valid tool items found for type: ${toolType}`);
      return null;
    }

    // Add label and select to container
    this.assembleToolUI(itemContainer, select, toolConfig);

    // Add favorite star
    this.addFavoriteStar(itemContainer, item);

    HM.log(3, `Successfully rendered tool item ${item._id}`);
    return itemContainer;
  }

  /**
   * Validate that we have a proper tool item
   * @param {Object} item - Tool item to validate
   * @returns {boolean} True if valid
   * @private
   */
  validateToolItem(item) {
    if (!item?.key) {
      HM.log(1, `Invalid tool item - missing key for item ${item?._id}`);
      return false;
    }
    return true;
  }

  /**
   * Get the tool configuration for a tool type
   * @param {string} toolType - Tool type
   * @returns {string|null} Tool configuration or null if not found
   * @private
   */
  getToolConfiguration(toolType) {
    const toolConfig = CONFIG.DND5E.toolTypes[toolType];

    if (!toolConfig) {
      HM.log(2, `No tool configuration found for type: ${toolType}`);
      return null;
    }

    HM.log(3, `Found configuration for tool type: ${toolType}`);
    return toolConfig;
  }

  /**
   * Assemble tool UI components
   * @param {HTMLElement} itemContainer - Container element
   * @param {HTMLSelectElement} select - Select element with options
   * @param {string} toolConfig - Tool configuration
   * @private
   */
  assembleToolUI(itemContainer, select, toolConfig) {
    HM.log(3, 'Assembling tool UI components');

    const label = document.createElement('h4');
    label.htmlFor = select.id;
    label.innerHTML = `${toolConfig}`;

    itemContainer.appendChild(label);
    itemContainer.appendChild(select);

    HM.log(3, `Added label "${toolConfig}" and select with ${select.options.length} options`);
  }

  /**
   * Create select element for tool items
   * @param {Object} item - Tool item
   * @param {string} toolType - Tool type
   * @returns {HTMLSelectElement} Select element
   * @private
   */
  createToolSelect(item, toolType) {
    HM.log(3, `Creating select for tool type ${toolType}`);

    const select = document.createElement('select');
    select.id = `${item.key}-tool`;

    // Get tools of this specific type
    const toolItems = Array.from(this.parser.constructor.lookupItems[toolType].items || []);
    toolItems.sort((a, b) => a.name.localeCompare(b.name));

    HM.log(3, `Found ${toolItems.length} tools of type ${toolType}`);

    // Add each tool as an option
    this.addToolSelectOptions(select, toolItems);

    HM.log(3, `Created select with ${select.options.length} options`);
    return select;
  }

  /**
   * Add tool options to the select element
   * @param {HTMLSelectElement} select - Select element
   * @param {Array<Object>} toolItems - Array of tool items
   * @private
   */
  addToolSelectOptions(select, toolItems) {
    for (const tool of toolItems) {
      const option = document.createElement('option');
      option.value = tool.uuid || tool._source?.key;
      option.innerHTML = tool.name;

      if (select.options.length === 0) {
        option.selected = true;
      }

      select.appendChild(option);
      HM.log(3, `Added option "${tool.name}" with value ${option.value}`);
    }
  }
}
