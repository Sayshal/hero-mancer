import { HM } from '../../index.js';
import { BaseItemRenderer } from '../index.js';

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
    HM.log(3, `Processing Linked item: ${item._id}`, { item, itemContainer });

    if (!item?._source?.key) {
      HM.log(1, 'Invalid linked item:', item);
      return null;
    }

    if (this.shouldSkipRendering(item)) {
      return null;
    }

    // Create elements
    const labelElement = document.createElement('label');
    const linkedCheckbox = document.createElement('input');
    linkedCheckbox.type = 'checkbox';
    linkedCheckbox.id = item._source.key;
    linkedCheckbox.value = item._source.key;
    linkedCheckbox.checked = true;

    // Process display label
    const displayLabel = this.formatDisplayLabel(item);

    labelElement.innerHTML = `${displayLabel?.trim() || game.i18n.localize('hm.app.equipment.unknown-choice')}`;
    labelElement.prepend(linkedCheckbox);
    itemContainer.appendChild(labelElement);

    this.parser.constructor.renderedItems.add(item._id);
    this.addFavoriteStar(itemContainer, item);

    return itemContainer;
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
      if (parentItem?.type === 'OR') {
        return true;
      }
    }

    // Check if already rendered or should use dropdown
    return this.parser.constructor.combinedItemIds.has(item._source.key) || this.renderer.shouldItemUseDropdownDisplay(item) || this.parser.constructor.renderedItems.has(item._id);
  }

  /**
   * Format the display label for a linked item
   * @param {Object} item - Equipment item
   * @returns {string} Formatted label
   */
  formatDisplayLabel(item) {
    let displayLabel = item.label;

    if (item.label?.includes('<a class')) {
      const countMatch = item.label.match(/^(\d+)&times;/);
      if (countMatch) {
        const displayCount = countMatch[1];
        displayLabel = item.label.replace(/^\d+&times;\s*/, '').replace('</i>', `</i>${displayCount} `);
      }
    } else {
      const displayCount = item._source.count > 1 || item._source.count !== null ? item._source.count : '';
      if (displayCount && !displayLabel.includes(displayCount)) {
        displayLabel = `${displayCount} ${displayLabel}`;
      }
    }

    return displayLabel;
  }
}
