import { HM } from '../../index.js';
import { BaseItemRenderer } from './baseItemRenderer.js';

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
    HM.log(3, `Processing AND block ${item?._id}`);

    const processedIds = new Set();

    // Add label if group exists
    if (item.group) {
      this.addGroupLabel(itemContainer, item);
    }

    // Check for item children
    if (!item?.children?.length) {
      HM.log(3, `AND block ${item._id} has no children`);
      this.addFavoriteStar(itemContainer, item);
      return itemContainer;
    }

    // Process children by category
    const { filteredLinkedItems, lookupItems } = await this.categorizeChildren(item);
    HM.log(3, `Categorized children - ${filteredLinkedItems.length} linked items, ${lookupItems.length} lookup items`);

    // Render grouped items (weapons + ammo, etc)
    await this.renderGroupedItems(filteredLinkedItems, processedIds, itemContainer);

    // Render lookup items (e.g. weapon categories)
    await this.renderLookupItems(lookupItems, itemContainer);

    this.addFavoriteStar(itemContainer, item);
    HM.log(3, `Completed rendering AND block ${item._id}`);
    return itemContainer;
  }

  /**
   * Add a group label to container
   * @param {HTMLElement} itemContainer - Container element
   * @param {Object} item - AND block item
   * @private
   */
  addGroupLabel(itemContainer, item) {
    HM.log(3, `Adding label for AND block ${item._id}`);

    const andLabelElement = document.createElement('h4');
    andLabelElement.classList.add('parent-label');
    andLabelElement.innerHTML = `${item.label || game.i18n.localize('hm.app.equipment.choose-all')}`;
    itemContainer.appendChild(andLabelElement);

    HM.log(3, `Added label "${andLabelElement.innerHTML}"`);
  }

  /**
   * Categorize children into different types
   * @param {Object} item - AND block item
   * @returns {Promise<Object>} Categorized items
   */
  async categorizeChildren(item) {
    HM.log(3, `Categorizing children of AND block ${item._id}`);

    if (!item || !Array.isArray(item.children)) {
      HM.log(2, 'Invalid item or missing children array');
      return { filteredLinkedItems: [], lookupItems: [] };
    }

    try {
      // Find lookup items (weapon category selectors)
      const lookupItems = this.findLookupItems(item);
      HM.log(3, `Found ${lookupItems.length} lookup items`);

      // Find and categorize linked items
      const linkedItems = await this.findLinkedItems(item);
      const filteredLinkedItems = linkedItems.filter((linkedItem) => linkedItem !== null);

      HM.log(3, `Found ${filteredLinkedItems.length} linked items to be grouped`);
      return { filteredLinkedItems, lookupItems };
    } catch (error) {
      HM.log(1, `Error categorizing children: ${error.message}`);
      return { filteredLinkedItems: [], lookupItems: [] };
    }
  }

  /**
   * Find lookup items in the children
   * @param {Object} item - AND block item
   * @returns {Array<Object>} Array of lookup items
   * @private
   */
  findLookupItems(item) {
    const lookupItems = item.children.filter((child) => child.type === 'weapon' && ['sim', 'mar', 'simpleM', 'simpleR', 'martialM', 'martialR'].includes(child.key));

    HM.log(3, `Found ${lookupItems.length} weapon lookup items`);
    return lookupItems;
  }

  /**
   * Find linked items in the children
   * @param {Object} item - AND block item
   * @returns {Promise<Array<Object|null>>} Array of linked items
   * @private
   */
  async findLinkedItems(item) {
    HM.log(3, `Finding linked items in AND block ${item._id}`);

    const linkedItems = await Promise.all(
      item.children
        .filter((child) => child.type === 'linked')
        .map(async (child) => {
          const shouldGroup = await this.shouldGroupWithOthers(child);
          return shouldGroup ? child : null;
        })
    );

    HM.log(3, `Found ${linkedItems.filter((i) => i !== null).length} linked items that should be grouped`);
    return linkedItems;
  }

  /**
   * Check if an item should be grouped with others
   * @param {Object} item - Equipment item
   * @returns {Promise<boolean>} True if should be grouped
   */
  async shouldGroupWithOthers(item) {
    HM.log(3, `Checking if ${item?._id || 'unknown'} should be grouped`);

    if (!item || !item._source?.key) {
      HM.log(2, 'Invalid item or missing source key');
      return false;
    }

    try {
      const doc = await fromUuidSync(item._source.key);

      if (!doc) {
        HM.log(3, `No document found for ${item._id}`);
        return false;
      }

      // Check if it's a weapon with ammo property
      if (doc?.type === 'weapon' && doc?.system?.properties && Array.from(doc.system.properties).includes('amm')) {
        HM.log(3, `Item ${item._id} is a weapon with ammo property`);
        return true;
      }

      // Check if it's ammunition
      if (doc?.system?.type?.value === 'ammo') {
        HM.log(3, `Item ${item._id} is ammunition`);
        return true;
      }

      // Check if it's a container (but not a pack)
      if (doc?.type === 'container') {
        const identifier = doc?.system?.identifier?.toLowerCase() || '';
        const result = !identifier.includes('pack');
        HM.log(3, `Item ${item._id} is a container and should${result ? '' : ' not'} be grouped`);
        return result;
      }

      HM.log(3, `Item ${item._id} should not be grouped`);
      return false;
    } catch (error) {
      HM.log(2, `Error checking if item should be grouped: ${error.message}`);
      return false;
    }
  }

  /**
   * Render grouped items (weapons, ammo, containers)
   * @param {Array<Object>} filteredLinkedItems - Linked items to group
   * @param {Set<string>} processedIds - IDs that have been processed
   * @param {HTMLElement} itemContainer - Container element
   */
  async renderGroupedItems(filteredLinkedItems, processedIds, itemContainer) {
    HM.log(3, `Rendering groups from ${filteredLinkedItems.length} items`);

    if (filteredLinkedItems.length === 0) {
      return;
    }

    try {
      // Create a document fragment to minimize DOM operations
      const fragment = document.createDocumentFragment();

      const groupedItems = await this.createItemGroups(filteredLinkedItems);
      HM.log(3, `Created ${groupedItems.length} item groups`);

      // Render each group
      for (const group of groupedItems) {
        await this.renderItemGroup(group, processedIds, fragment);
      }

      // Add all groups to the container at once
      itemContainer.appendChild(fragment);
    } catch (error) {
      HM.log(1, `Error rendering grouped items: ${error.message}`);
    }
  }

  /**
   * Create groups of related items
   * @param {Array<Object>} filteredLinkedItems - Linked items to group
   * @returns {Promise<Array<Array<Object>>>} Array of item groups
   * @private
   */
  async createItemGroups(filteredLinkedItems) {
    HM.log(3, `Creating groups from ${filteredLinkedItems.length} items`);

    const groupedItems = [];
    const processedItems = new Set();

    // Create groups of related items
    for (const child of filteredLinkedItems) {
      if (processedItems.has(child._source?.key)) continue;

      const relatedItems = await this.findRelatedItems(child, filteredLinkedItems, processedItems);

      if (relatedItems.length > 0) {
        groupedItems.push([child, ...relatedItems]);
        relatedItems.forEach((item) => processedItems.add(item._source?.key));
        processedItems.add(child._source?.key);
      } else if (!processedItems.has(child._source?.key)) {
        groupedItems.push([child]);
        processedItems.add(child._source?.key);
      }
    }

    HM.log(3, `Created ${groupedItems.length} groups`);
    return groupedItems;
  }

  /**
   * Find items related to a specific item
   * @param {Object} child - Item to find relations for
   * @param {Array<Object>} filteredLinkedItems - All linked items
   * @param {Set<string>} processedItems - Already processed items
   * @returns {Promise<Array<Object>>} Related items
   * @private
   */
  async findRelatedItems(child, filteredLinkedItems, processedItems) {
    HM.log(3, `Finding items related to ${child?._id || 'unknown'}`);

    if (!child || !child._source?.key) {
      HM.log(2, 'Invalid child item');
      return [];
    }

    try {
      // Filter out already processed items and the current child
      const candidateItems = filteredLinkedItems.filter((item) => item && item._source?.key && !processedItems.has(item._source.key) && item._source.key !== child._source.key);

      if (candidateItems.length === 0) {
        return [];
      }

      // Pre-fetch document for main item to avoid multiple lookups
      const childDoc = await fromUuidSync(child._source.key);
      if (!childDoc) {
        HM.log(2, `Document not found for ${child._id}`);
        return [];
      }

      // Process all candidate items
      const relatedItems = [];

      for (const item of candidateItems) {
        const isRelated = await this.checkItemRelation(childDoc, item);
        if (isRelated) {
          relatedItems.push(item);
        }
      }

      HM.log(3, `Found ${relatedItems.length} items related to ${child._id}`);
      return relatedItems;
    } catch (error) {
      HM.log(1, `Error finding related items: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if an item is related to the specified document
   * @param {Object} childDoc - Main item document
   * @param {Object} item - Item to check
   * @returns {Promise<boolean>} True if related
   * @private
   */
  async checkItemRelation(childDoc, item) {
    try {
      const itemDoc = await fromUuidSync(item._source?.key);
      if (!itemDoc) return false;

      // Check if one is a weapon and one is ammo
      const isWeaponAndAmmo = (childDoc.type === 'weapon' && itemDoc.system?.type?.value === 'ammo') || (itemDoc.type === 'weapon' && childDoc.system?.type?.value === 'ammo');

      // Check if one is a container and one is a storable item
      const isContainerAndItem = (childDoc.type === 'container' && itemDoc.type !== 'container') || (itemDoc.type === 'container' && childDoc.type !== 'container');

      return isWeaponAndAmmo || isContainerAndItem;
    } catch (error) {
      return false;
    }
  }

  /**
   * Render a group of related items
   * @param {Array<Object>} group - Group of items
   * @param {Set<string>} processedIds - Processed IDs
   * @param {HTMLElement} itemContainer - Container element
   */
  async renderItemGroup(group, processedIds, itemContainer) {
    HM.log(3, `Rendering group with ${group.length} items`);

    const { combinedLabel, combinedIds } = await this.createGroupLabelAndIds(group, processedIds);

    if (combinedLabel && group.length > 1) {
      // Create header row
      const headerRow = document.createElement('tr');
      const headerCell = document.createElement('th');
      headerCell.colSpan = 2;

      const h4 = document.createElement('h4');
      h4.innerHTML = `${combinedLabel}`;
      headerCell.appendChild(h4);
      headerRow.appendChild(headerCell);
      itemContainer.appendChild(headerRow);

      // Create checkbox row
      const checkboxRow = document.createElement('tr');
      const checkboxCell = document.createElement('td');
      const starCell = document.createElement('td');

      // Create label and checkbox
      const label = document.createElement('label');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = combinedIds.join(',');
      checkbox.checked = true;

      // Assemble label properly
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(` ${combinedLabel}`));

      checkboxCell.appendChild(label);
      checkboxRow.appendChild(checkboxCell);
      checkboxRow.appendChild(starCell);
      itemContainer.appendChild(checkboxRow);

      HM.log(3, `Added heading and checkbox with ID ${checkbox.id}`);
    } else {
      // Reset tracking for empty groups
      this.resetGroupTracking(group);
    }
  }

  /**
   * Create label and ID list for a group
   * @param {Array<Object>} group - Group of items
   * @param {Set<string>} processedIds - Processed IDs
   * @returns {Promise<Object>} Label and ID list
   * @private
   */
  async createGroupLabelAndIds(group, processedIds) {
    HM.log(3, `Creating label for ${group.length} items`);

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

    HM.log(3, `Created label "${combinedLabel}" with ${combinedIds.length} IDs`);
    return { combinedLabel, combinedIds };
  }

  /**
   * Reset tracking for group items
   * @param {Array<Object>} group - Group of items
   * @private
   */
  resetGroupTracking(group) {
    HM.log(3, `Resetting tracking for ${group.length} items`);

    for (const child of group) {
      child.rendered = false;
      child.specialGrouping = false;
      this.parser.constructor.renderedItems.delete(child._id);
      this.parser.constructor.combinedItemIds.delete(child._source?.key);
    }
  }

  /**
   * Render lookup items (weapon categories, etc)
   * @param {Array<Object>} lookupItems - Lookup items
   * @param {HTMLElement} itemContainer - Container element
   */
  async renderLookupItems(lookupItems, itemContainer) {
    HM.log(3, `Rendering ${lookupItems.length} lookup items`);

    for (const lookupItem of lookupItems) {
      await this.renderLookupItem(lookupItem, itemContainer);
    }
  }

  /**
   * Render a single lookup item
   * @param {Object} lookupItem - Lookup item
   * @param {HTMLElement} itemContainer - Container element
   * @private
   */
  async renderLookupItem(lookupItem, itemContainer) {
    HM.log(3, `Rendering lookup item ${lookupItem._id}`);

    const lookupLabel = this.getLookupKeyLabel(lookupItem.key);
    const header = document.createElement('h4');
    header.innerHTML = lookupLabel;
    itemContainer.appendChild(header);

    const select = document.createElement('select');
    select.id = lookupItem._source.key;

    // Determine the lookup key to use
    const lookupKey = this.determineLookupKey(lookupItem.key);

    // Get and sort lookup options
    const lookupOptions = this.getLookupOptions(lookupKey);

    // Add options to select
    this.addLookupOptions(select, lookupOptions);

    itemContainer.appendChild(select);
    HM.log(3, `Added select with ${select.options.length} options for ${lookupKey}`);
  }

  /**
   * Determine the lookup key to use
   * @param {string} key - Original key
   * @returns {string} Resolved lookup key
   * @private
   */
  determineLookupKey(key) {
    if (key === 'sim') return 'sim';
    if (key === 'simpleM') return 'simpleM';
    if (key === 'simpleR') return 'simpleR';
    return key;
  }

  /**
   * Get sorted lookup options for a key
   * @param {string} lookupKey - Lookup key
   * @returns {Array<Object>} Sorted lookup options
   * @private
   */
  getLookupOptions(lookupKey) {
    const lookupOptions = Array.from(this.parser.constructor.lookupItems[lookupKey].items || []);
    lookupOptions.sort((a, b) => a.name.localeCompare(b.name));
    HM.log(3, `Found ${lookupOptions.length} options for key ${lookupKey}`);
    return lookupOptions;
  }

  /**
   * Add options to a lookup select
   * @param {HTMLSelectElement} select - Select element
   * @param {Array<Object>} lookupOptions - Lookup options
   * @private
   */
  addLookupOptions(select, lookupOptions) {
    lookupOptions.forEach((option) => {
      const optionElement = document.createElement('option');
      optionElement.value = option?.uuid || option?._source?.key;
      optionElement.innerHTML = option.name;
      select.appendChild(optionElement);
    });

    HM.log(3, `Added ${lookupOptions.length} options to select`);
  }
}
