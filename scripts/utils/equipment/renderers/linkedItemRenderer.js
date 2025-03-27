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
    HM.log(3, `LinkedItemRenderer.render: Processing item ${item?._id}`);

    if (!item?._source?.key) {
      HM.log(1, `LinkedItemRenderer.render: Invalid item - missing _source.key for item ${item?._id}`);
      return null;
    }

    // Check if we should skip rendering
    if (this.shouldSkipRendering(item)) {
      HM.log(3, `LinkedItemRenderer.render: Skipping rendering for item ${item._id}`);
      return null;
    }

    // Create the linked item's UI components
    const components = this.createLinkedItemComponents(item);

    // Assemble the components and add to container
    this.assembleLinkedItemUI(itemContainer, components, item);

    // Mark as rendered and add favorite star
    HM.log(3, `LinkedItemRenderer.render: Successfully rendered linked item ${item._id}`);
    this.parser.constructor.renderedItems.add(item._id);
    this.addFavoriteStar(itemContainer, item);

    return itemContainer;
  }

  /**
   * Create UI components for a linked item
   * @param {Object} item - The linked item
   * @returns {Object} Created components
   * @private
   */
  createLinkedItemComponents(item) {
    HM.log(3, `LinkedItemRenderer.createLinkedItemComponents: Creating components for ${item._id}`);

    // Create elements
    const labelElement = document.createElement('label');
    const linkedCheckbox = document.createElement('input');
    linkedCheckbox.type = 'checkbox';
    linkedCheckbox.id = item._source.key;
    linkedCheckbox.value = item?.uuid || item._source.key;
    linkedCheckbox.checked = true;

    // Process display label
    const displayLabel = this.formatDisplayLabel(item);
    HM.log(3, `LinkedItemRenderer.createLinkedItemComponents: Formatted display label "${displayLabel}"`);

    return { labelElement, linkedCheckbox, displayLabel };
  }

  /**
   * Assemble linked item UI components
   * @param {HTMLElement} itemContainer - Container element
   * @param {Object} components - UI components
   * @param {Object} item - Linked item
   * @private
   */
  assembleLinkedItemUI(itemContainer, components, item) {
    const { labelElement, linkedCheckbox, displayLabel } = components;

    // Set the label content
    const finalLabel = displayLabel?.trim() || game.i18n.localize('hm.app.equipment.unknown-choice');
    labelElement.innerHTML = finalLabel;
    labelElement.prepend(linkedCheckbox);

    // Add to container
    itemContainer.appendChild(labelElement);
    HM.log(3, `LinkedItemRenderer.assembleLinkedItemUI: Added linked item UI for ${item._id}`);
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
        HM.log(3, `LinkedItemRenderer.shouldSkipRendering: Item ${item._id} is in OR group, skipping`);
        return true;
      }
    }

    // Check if already rendered or should use dropdown
    const alreadyCombined = this.parser.constructor.combinedItemIds.has(item._source.key);
    const shouldUseDropdown = this.renderer.shouldItemUseDropdownDisplay(item);
    const alreadyRendered = this.parser.constructor.renderedItems.has(item._id);

    const result = alreadyCombined || shouldUseDropdown || alreadyRendered;

    if (result) {
      HM.log(3, `LinkedItemRenderer.shouldSkipRendering: Item ${item._id} skipped - combined: ${alreadyCombined}, dropdown: ${shouldUseDropdown}, rendered: ${alreadyRendered}`);
    }

    return result;
  }

  /**
   * Format the display label for a linked item
   * @param {Object} item - Equipment item
   * @returns {string} Formatted label
   */
  formatDisplayLabel(item) {
    HM.log(3, `LinkedItemRenderer.formatDisplayLabel: Formatting label for ${item._id}`);

    let displayLabel = item.label;

    if (item.label?.includes('<a class')) {
      // Handle labels with content links
      const countMatch = item.label.match(/^(\d+)&times;/);
      if (countMatch) {
        const displayCount = countMatch[1];
        displayLabel = item.label.replace(/^\d+&times;\s*/, '').replace('</i>', `</i>${displayCount} `);
        HM.log(3, `LinkedItemRenderer.formatDisplayLabel: Processed content link with count ${displayCount}`);
      }
    } else {
      // Handle plain text labels
      const displayCount = item._source.count > 1 || item._source.count !== null ? item._source.count : '';
      if (displayCount && !displayLabel.includes(displayCount)) {
        displayLabel = `${displayCount} ${displayLabel}`;
        HM.log(3, `LinkedItemRenderer.formatDisplayLabel: Added count ${displayCount} to label`);
      }
    }

    return displayLabel;
  }
}
