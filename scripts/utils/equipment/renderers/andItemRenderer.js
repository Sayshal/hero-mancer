import { HM } from '../../index.js';
import { BaseItemRenderer } from '../index.js';

/**
 * Renderer for AND equipment blocks
 */
export class AndItemRenderer extends BaseItemRenderer {
  /**
   * Render an AND equipment block
   * @param {object} item - AND block data
   * @param {HTMLElement} itemContainer - Container element
   * @returns {Promise<HTMLElement>} Rendered container
   */
  async render(item, itemContainer) {
    HM.log(3, `Processing AND block: ${item._id}`, { item, itemContainer });

    const processedIds = new Set();

    // Add label if group exists
    if (item.group) {
      const andLabelElement = document.createElement('h4');
      andLabelElement.classList.add('parent-label');
      andLabelElement.innerHTML = `${item.label || game.i18n.localize('hm.app.equipment.choose-all')}`;
      itemContainer.appendChild(andLabelElement);
    }

    // Check for item children
    if (!item?.children?.length) {
      this.addFavoriteStar(itemContainer, item);
      return itemContainer;
    }

    // Process grouped items (weapon/ammo/container combinations)
    const { filteredLinkedItems, lookupItems } = await this.categorizeChildren(item);

    // Render grouped items (weapons + ammo, etc)
    await this.renderGroupedItems(filteredLinkedItems, processedIds, itemContainer);

    // Render lookup items (e.g. weapon categories)
    await this.renderLookupItems(lookupItems, itemContainer);

    this.addFavoriteStar(itemContainer, item);
    return itemContainer;
  }

  /**
   * Categorize children into different types
   * @param {Object} item - AND block item
   * @returns {Promise<Object>} Categorized items
   */
  async categorizeChildren(item) {
    // Find lookup items (weapon category selectors)
    const lookupItems = item.children.filter((child) => child.type === 'weapon' && ['sim', 'mar', 'simpleM', 'simpleR', 'martialM', 'martialR'].includes(child.key));

    // Find and categorize linked items
    const linkedItems = await Promise.all(
      item.children
        .filter((child) => child.type === 'linked')
        .map(async (child) => {
          const shouldGroup = await this.shouldGroupWithOthers(child);
          return shouldGroup ? child : null;
        })
    );

    const filteredLinkedItems = linkedItems.filter((item) => item !== null);

    return { filteredLinkedItems, lookupItems };
  }

  /**
   * Check if an item should be grouped with others
   * @param {Object} item - Equipment item
   * @returns {Promise<boolean>} True if should be grouped
   */
  async shouldGroupWithOthers(item) {
    const doc = await fromUuidSync(item._source?.key);

    if (!doc) return false;

    // Check if it's a weapon with ammo property
    if (doc?.type === 'weapon' && doc?.system?.properties && Array.from(doc.system.properties).includes('amm')) {
      return true;
    }

    // Check if it's ammunition
    if (doc?.system?.type?.value === 'ammo') {
      return true;
    }

    // Check if it's a container (but not a pack)
    if (doc?.type === 'container') {
      const identifier = doc?.system?.identifier?.toLowerCase();
      return !identifier || !identifier.includes('pack');
    }

    return false;
  }

  /**
   * Render grouped items (weapons, ammo, containers)
   * @param {Array<Object>} filteredLinkedItems - Linked items to group
   * @param {Set<string>} processedIds - IDs that have been processed
   * @param {HTMLElement} itemContainer - Container element
   */
  async renderGroupedItems(filteredLinkedItems, processedIds, itemContainer) {
    const groupedItems = [];
    const processedItems = new Set();

    // Create groups of related items
    for (const child of filteredLinkedItems) {
      if (processedItems.has(child._source?.key)) continue;

      const relatedItems = await Promise.all(
        filteredLinkedItems.map(async (item) => {
          if (processedItems.has(item._source?.key) || item._source?.key === child._source?.key) return null;

          // Check if these two items should be grouped
          const result = await this.areItemsRelated(child, item);
          return result ? item : null;
        })
      );

      const validRelatedItems = relatedItems.filter((item) => item !== null);

      if (validRelatedItems.length > 0) {
        groupedItems.push([child, ...validRelatedItems]);
        validRelatedItems.forEach((item) => processedItems.add(item._source?.key));
        processedItems.add(child._source?.key);
      } else if (!processedItems.has(child._source?.key)) {
        groupedItems.push([child]);
        processedItems.add(child._source?.key);
      }
    }

    // Render each group
    for (const group of groupedItems) {
      await this.renderItemGroup(group, processedIds, itemContainer);
    }
  }

  /**
   * Check if two items are related and should be grouped
   * @param {Object} item1 - First item
   * @param {Object} item2 - Second item
   * @returns {Promise<boolean>} True if related
   */
  async areItemsRelated(item1, item2) {
    const doc1 = await fromUuidSync(item1._source?.key);
    const doc2 = await fromUuidSync(item2._source?.key);

    if (!doc1 || !doc2) return false;

    // Check if one is a weapon and one is ammo
    const isWeaponAndAmmo = (doc1.type === 'weapon' && doc2.system?.type?.value === 'ammo') || (doc2.type === 'weapon' && doc1.system?.type?.value === 'ammo');

    // Check if one is a container and one is a storable item
    const isContainerAndItem = (doc1.type === 'container' && doc2.type !== 'container') || (doc2.type === 'container' && doc1.type !== 'container');

    return isWeaponAndAmmo || isContainerAndItem;
  }

  /**
   * Render a group of related items
   * @param {Array<Object>} group - Group of items
   * @param {Set<string>} processedIds - Processed IDs
   * @param {HTMLElement} itemContainer - Container element
   */
  async renderItemGroup(group, processedIds, itemContainer) {
    let combinedLabel = '';
    const combinedIds = [];

    for (const child of group) {
      if (processedIds.has(child._source?.key)) continue;
      processedIds.add(child._source?.key);

      const linkedItem = await fromUuidSync(child._source?.key);
      if (!linkedItem) continue;

      const count = child._source?.count > 1 || child._source?.count !== null ? child._source?.count : '';
      combinedIds.push(child._source?.key);

      if (combinedLabel) combinedLabel += ', ';
      combinedLabel += `${count ? `${count} ` : ''}${linkedItem.name}`.trim();

      // Add to tracking sets immediately
      this.parser.constructor.renderedItems.add(child._id);
      this.parser.constructor.combinedItemIds.add(child._source?.key);

      child.specialGrouping = true;
      child.rendered = true;
    }

    if (combinedLabel && group.length > 1) {
      // Create heading and label for grouped items
      const h4 = document.createElement('h4');
      h4.innerHTML = `${combinedLabel}`;

      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = combinedIds.join(',');
      checkbox.checked = true;

      label.innerHTML = `${combinedLabel}`;
      label.prepend(checkbox);

      itemContainer.appendChild(h4);
      itemContainer.appendChild(label);
    } else {
      // If only one item or empty group, reset tracking
      for (const child of group) {
        child.rendered = false;
        child.specialGrouping = false;
        this.parser.constructor.renderedItems.delete(child._id);
        this.parser.constructor.combinedItemIds.delete(child._source?.key);
      }
    }
  }

  /**
   * Render lookup items (weapon categories, etc)
   * @param {Array<Object>} lookupItems - Lookup items
   * @param {HTMLElement} itemContainer - Container element
   */
  async renderLookupItems(lookupItems, itemContainer) {
    for (const lookupItem of lookupItems) {
      const lookupLabel = this.getLookupKeyLabel(lookupItem.key);
      const header = document.createElement('h4');
      header.innerHTML = lookupLabel;
      itemContainer.appendChild(header);

      const select = document.createElement('select');
      select.id = lookupItem._source.key;

      // Determine the lookup key to use
      const lookupKey =
        lookupItem.key === 'sim' ? 'sim'
        : lookupItem.key === 'simpleM' ? 'simpleM'
        : lookupItem.key === 'simpleR' ? 'simpleR'
        : lookupItem.key;

      // Get and sort lookup options
      const lookupOptions = Array.from(this.parser.constructor.lookupItems[lookupKey].items || []);
      lookupOptions.sort((a, b) => a.name.localeCompare(b.name));

      // Add options to select
      lookupOptions.forEach((weapon) => {
        const option = document.createElement('option');
        option.value = weapon?._source?.key;
        option.innerHTML = weapon.name;
        select.appendChild(option);
      });

      itemContainer.appendChild(select);
    }
  }
}
