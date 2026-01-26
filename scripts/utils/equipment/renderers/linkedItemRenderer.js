import { BaseItemRenderer, HM } from '../../index.js';

/**
 * Renderer for linked equipment items
 */
export class LinkedItemRenderer extends BaseItemRenderer {
  /**
   * Render a linked equipment item
   * @param {object} item - Linked item data
   * @param {HTMLElement} itemContainer - Container element
   * @returns {Promise<HTMLElement|null>} Rendered container or null
   */
  async render(item, itemContainer) {
    try {
      HM.log(3, `Processing item ${item?._id}`);

      if (!item?._source?.key && !item?.key) {
        HM.log(1, `Invalid item - missing _source.key && .key for item ${item?._id}`);
        return null;
      }

      if (this.shouldSkipRendering(item)) {
        HM.log(3, `Skipping rendering for item ${item._id}`);
        return null;
      }

      // Create header row if needed
      if (item.label) {
        const headerRow = document.createElement('tr');
        const headerCell = document.createElement('th');
        headerCell.colSpan = 2;

        const headerContent = document.createElement('h4');
        headerContent.innerHTML = item.label;
        headerCell.appendChild(headerContent);
        headerRow.appendChild(headerCell);
        itemContainer.appendChild(headerRow);
      }

      // Create components and assemble them
      const components = this.createLinkedItemComponents(item);
      // This is the line we need to add - assemble the components
      this.assembleLinkedItemUI(components.labelElement, components.linkedCheckbox, this.formatDisplayLabel(item));

      // Create checkbox row
      const checkboxRow = document.createElement('tr');
      const checkboxCell = document.createElement('td');
      const starCell = document.createElement('td');

      checkboxCell.appendChild(components.labelElement);
      checkboxRow.appendChild(checkboxCell);
      checkboxRow.appendChild(starCell);
      itemContainer.appendChild(checkboxRow);

      HM.log(3, `Successfully rendered linked item ${item._id}`);
      this.parser.constructor.renderedItems.add(item._id);
      this.addFavoriteStar(itemContainer, item);

      return itemContainer;
    } catch (error) {
      HM.log(1, `Error rendering linked item ${item?._id}: ${error.message}`);
      return null;
    }
  }

  /**
   * Create UI components for a linked item
   * @param {Object} item - The linked item
   * @returns {Object} Created components
   * @private
   */
  createLinkedItemComponents(item) {
    HM.log(3, `Creating components for ${item._id}`);

    // Create elements
    const labelElement = document.createElement('label');
    const linkedCheckbox = document.createElement('input');
    linkedCheckbox.type = 'checkbox';
    linkedCheckbox.id = item._source.key;
    linkedCheckbox.value = item?.uuid || item._source.key;
    linkedCheckbox.checked = true;

    // Process display label
    const displayLabel = this.formatDisplayLabel(item);
    HM.log(3, `Formatted display label "${displayLabel}"`);

    return { labelElement, linkedCheckbox, displayLabel };
  }

  /**
   * Assemble linked item UI components
   * @param {HTMLElement} itemContainer - Container element
   * @param {Object} components - UI components
   * @param {Object} item - Linked item
   * @private
   */
  assembleLinkedItemUI(labelElement, linkedCheckbox, displayLabel) {
    // Set the label content
    const finalLabel = displayLabel?.trim() || game.i18n.localize('hm.app.equipment.unknown-choice');
    labelElement.innerHTML = finalLabel;
    labelElement.prepend(linkedCheckbox);

    HM.log(3, `Assembled linked item UI with label "${finalLabel}"`);
  }

  /**
   * Check if item rendering should be skipped
   * @param {Object} item - Equipment item
   * @returns {boolean} True if rendering should be skipped
   */
  shouldSkipRendering(item) {
    // Check if in OR group
    if (item.group) {
      const equipmentData = this.parser.equipmentData;
      const parentItem = equipmentData.class.find((p) => p._id === item.group) || equipmentData.background.find((p) => p._id === item.group);

      if (parentItem?.type === 'OR') return true;
    }

    // Direct Boolean checks without extra variables
    return this.parser.constructor.combinedItemIds.has(item._source.key) || this.renderer.shouldItemUseDropdownDisplay(item) || this.parser.constructor.renderedItems.has(item._id);
  }

  /**
   * Format the display label for a linked item
   * @param {Object} item - Equipment item
   * @returns {string} Formatted label
   */
  formatDisplayLabel(item) {
    if (!item) return game.i18n.localize('hm.app.equipment.unknown-choice');

    HM.log(3, `Formatting label for ${item._id}`);
    let displayLabel = item.label || '';

    try {
      if (typeof displayLabel !== 'string') {
        displayLabel = String(displayLabel || '');
      }

      if (displayLabel.includes('<a class')) {
        // Handle labels with content links
        const countMatch = displayLabel.match(/^(\d+)&times;/);
        if (countMatch) {
          const displayCount = countMatch[1];
          displayLabel = displayLabel.replace(/^\d+&times;\s*/, '').replace('</i>', `</i>${displayCount} `);
        }
      } else {
        // Handle plain text labels - only show count if greater than 1
        const displayCount = item._source?.count > 1 ? item._source.count : '';
        if (displayCount && !displayLabel.includes(String(displayCount))) {
          displayLabel = `${displayCount} ${displayLabel}`;
        }
      }

      return displayLabel;
    } catch (error) {
      HM.log(2, `Error formatting label for ${item._id}: ${error.message}`);
      return item.label || game.i18n.localize('hm.app.equipment.unknown-choice');
    }
  }
}
