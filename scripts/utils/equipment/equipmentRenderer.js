import { HM } from '../index.js';
import { AndItemRenderer, BaseItemRenderer, FocusItemRenderer, LinkedItemRenderer, OrItemRenderer, ToolItemRenderer } from './index.js';

/**
 * Manages rendering of equipment selection UI components
 */
export class EquipmentRenderer {
  /**
   * Creates a new EquipmentRenderer instance
   * @param {Object} parser - The parent EquipmentParser instance
   */
  constructor(parser) {
    this.parser = parser;
    this._renderInProgress = false;

    // Initialize specialized renderers
    this.baseRenderer = new BaseItemRenderer(this);
    this.renderers = {
      OR: new OrItemRenderer(this),
      AND: new AndItemRenderer(this),
      linked: new LinkedItemRenderer(this),
      focus: new FocusItemRenderer(this),
      tool: new ToolItemRenderer(this)
    };
  }

  /**
   * Renders equipment selection UI for specified or all types
   * @async
   * @param {?string} type - Optional type to render ('class'|'background'). If null, renders all
   * @returns {Promise<HTMLElement>} Container element with rendered equipment choices
   */
  async generateEquipmentSelectionUI(type = null) {
    if (!type || !this._renderInProgress) {
      this._renderInProgress = true;
      this.parser.constructor.renderedItems = new Set();
      this.parser.constructor.combinedItemIds = new Set();
    }

    try {
      // Ensure equipment data is loaded
      this.parser.equipmentData = null;
      await this.parser.constructor.initializeLookupItems();
      await this.parser.fetchEquipmentData();

      let container = this.getOrCreateContainer();
      const typesToRender = type ? [type] : Object.keys(this.parser.equipmentData);

      for (const currentType of typesToRender) {
        await this.renderEquipmentSection(container, currentType);
      }

      return container;
    } catch (error) {
      HM.log(1, 'Failed to render equipment choices:', error);
      return this.createFallbackContainer();
    } finally {
      if (!type) {
        this._renderInProgress = false;
      }
    }
  }

  /**
   * Gets existing container or creates a new one
   * @returns {HTMLElement} Container element
   */
  getOrCreateContainer() {
    let container = document.querySelector('.equipment-choices');
    if (!container) {
      container = document.createElement('div');
      container.classList.add('equipment-choices');
    }
    return container;
  }

  /**
   * Creates a fallback container for error states
   * @returns {HTMLElement} Fallback container
   */
  createFallbackContainer() {
    const fallbackContainer = document.createElement('div');
    fallbackContainer.classList.add('equipment-choices', 'error-state');

    const errorMessage = document.createElement('div');
    errorMessage.classList.add('error-message');
    errorMessage.innerHTML = `<p>${game.i18n.localize('hm.errors.equipment-rendering')}</p>`;
    fallbackContainer.appendChild(errorMessage);

    return fallbackContainer;
  }

  /**
   * Renders a section for class or background equipment
   * @async
   * @param {HTMLElement} container - Main container
   * @param {string} type - Section type ('class'|'background')
   * @returns {Promise<void>}
   */
  async renderEquipmentSection(container, type) {
    try {
      const items = this.parser.equipmentData[type] || [];
      const sectionContainer = this.getOrCreateSectionContainer(container, type);

      // Add the section header
      this.addSectionHeader(sectionContainer, type);

      // Add wealth option if applicable
      if ((type === 'class' || type === 'background') && HM.SELECTED[type].id) {
        await this.parser.renderWealthOption(sectionContainer, type).catch((error) => {
          HM.log(1, `Error rendering ${type} wealth option: ${error.message}`);
        });
      }

      // If no equipment items, show empty notice
      if (!items.length) {
        await this.renderEmptyNotice(sectionContainer, type);
        return;
      }

      // Pre-fetch all item documents in parallel
      const itemDocs = await this.preFetchItemDocuments(items);

      // Process all items with their pre-fetched documents
      await this.renderItemElements(sectionContainer, itemDocs);
    } catch (error) {
      HM.log(1, 'Error processing equipment section:', error);
      const errorMessage = document.createElement('div');
      errorMessage.classList.add('error-message');
      errorMessage.textContent = game.i18n.localize('hm.errors.equipment-rendering');
      container.appendChild(errorMessage);
    }
  }

  /**
   * Get or create a container for a specific section
   * @param {HTMLElement} container - Main container
   * @param {string} type - Section type
   * @returns {HTMLElement} Section container
   */
  getOrCreateSectionContainer(container, type) {
    let sectionContainer = container.querySelector(`.${type}-equipment-section`);
    if (sectionContainer) {
      HM.log(3, `${type}-equipment-section already exists. Clearing and reusing.`);
      sectionContainer.innerHTML = '';
    } else {
      sectionContainer = document.createElement('div');
      sectionContainer.classList.add(`${type}-equipment-section`);
      container.appendChild(sectionContainer);
    }
    return sectionContainer;
  }

  /**
   * Add a header for an equipment section
   * @param {HTMLElement} container - Section container
   * @param {string} type - Section type
   */
  addSectionHeader(container, type) {
    // Get the localized placeholder text for the current type
    const placeholderText = game.i18n.localize(`hm.app.${type}.select-placeholder`);
    const dropdown = document.querySelector(`#${type}-dropdown`);
    const dropdownText = dropdown?.selectedOptions?.[0]?.innerHTML || type;
    const isPlaceholder = dropdown && dropdownText === placeholderText;

    // Add a header for the section
    const header = document.createElement('h3');
    header.innerHTML =
      isPlaceholder ?
        game.i18n.format('hm.app.equipment.type-equipment', { type: type.charAt(0).toUpperCase() + type.slice(1) })
      : game.i18n.format('hm.app.equipment.type-equipment', { type: dropdownText });
    container.appendChild(header);
  }

  /**
   * Render empty notice for sections with no equipment
   * @param {HTMLElement} container - Section container
   * @param {string} type - Section type
   */
  async renderEmptyNotice(container, type) {
    const emptyNotice = document.createElement('div');
    emptyNotice.classList.add('equipment-empty-notice');

    // Get localized message
    const message = game.i18n.format('hm.errors.missing-equipment', { type });

    // Create the notice with warning icon
    emptyNotice.innerHTML = `<div class="equipment-missing-warning"><i class="fa-solid fa-triangle-exclamation warning-icon"></i><p>${message}</p></div>`;

    // Try to extract equipment description from document if available
    const storedData = HM.SELECTED[type] || {};
    const uuid = storedData.uuid;

    if (uuid) {
      const doc = await fromUuidSync(uuid);

      if (doc) {
        HM.log(3, `Attempting to extract equipment info from ${type} document:`, doc.name);

        // Log the structure to help debugging
        HM.log(3, 'Document structure:', {
          id: doc.id,
          name: doc.name,
          hasDescription: !!doc.system?.description?.value,
          descriptionLength: doc.system?.description?.value?.length || 0
        });

        const equipmentDescription = this.parser.dataService.extractEquipmentDescription(doc);
        const divider = document.createElement('hr');
        const extractedInfo = document.createElement('div');
        extractedInfo.classList.add('extracted-equipment-info');
        emptyNotice.appendChild(divider);

        if (equipmentDescription) {
          HM.log(3, `Successfully extracted equipment description for ${type}`);
          extractedInfo.innerHTML = `<h4>${game.i18n.localize('hm.equipment.extracted-info')}</h4>${equipmentDescription}`;
          emptyNotice.appendChild(extractedInfo);
        } else {
          extractedInfo.innerHTML = `<h4>${game.i18n.localize('hm.equipment.extracted-info')}</h4>${game.i18n.localize('hm.equipment.no-equipment-notice')}`;
          emptyNotice.appendChild(extractedInfo);
          HM.log(2, `No equipment description could be extracted from ${type} document`);

          // Check if the document likely has equipment info but couldn't be extracted
          const description = doc.system?.description?.value || '';
          if (description.toLowerCase().includes(game.i18n.localize('TYPES.Item.equipment').toLowerCase())) {
            const noExtractionNote = document.createElement('p');
            noExtractionNote.classList.add('equipment-extraction-failed');
            noExtractionNote.innerHTML = `${game.i18n.localize('hm.warnings.equipment-extraction-failed')}`;
            emptyNotice.appendChild(noExtractionNote);
          }
        }
      }
    }

    container.appendChild(emptyNotice);
  }

  /**
   * Pre-fetch all item documents in parallel
   * @param {Array<Object>} items - Equipment items
   * @returns {Promise<Array<Object>>} Items with their documents
   */
  async preFetchItemDocuments(items) {
    return Promise.all(
      items.map(async (item) => {
        if (!item.key) return { item, doc: null };
        try {
          const doc = await fromUuidSync(item.key);
          return { item, doc };
        } catch (error) {
          HM.log(1, `Error pre-fetching item document for ${item.key}:`, error);
          return { item, doc: null };
        }
      })
    );
  }

  /**
   * Render equipment items to a section container
   * @param {HTMLElement} container - Section container
   * @param {Array<Object>} itemDocs - Items with their documents
   */
  async renderItemElements(container, itemDocs) {
    const processedItems = new Set();
    const failedItems = [];

    for (const { item, doc } of itemDocs) {
      if (!item || processedItems.has(item._id || item.key)) {
        continue;
      }

      processedItems.add(item._id || item.key);

      // Update item with document info
      if (doc) {
        item.name = doc.name;
      } else if (item.key) {
        item.name = item.key;
      }

      try {
        const itemElement = await this.buildEquipmentUIElement(item);
        if (itemElement) {
          container.appendChild(itemElement);
        }
      } catch (error) {
        HM.log(1, `Failed to create equipment element for ${item.name || item.key}:`, error);
        failedItems.push(item.name || item.key || game.i18n.localize('hm.app.equipment.unnamed'));
      }
    }

    // Add error message for failed items
    if (failedItems.length > 0) {
      const errorMessage = document.createElement('div');
      errorMessage.classList.add('equipment-error');
      errorMessage.textContent = game.i18n.format('hm.app.equipment.failed-to-load', { count: failedItems.length });
      container.appendChild(errorMessage);
    }
  }

  /**
   * Build a UI element for an equipment item
   * @param {Object} item - Equipment item
   * @returns {Promise<HTMLElement|null>} Created element or null
   */
  async buildEquipmentUIElement(item) {
    if (!item) {
      HM.log(2, 'Null or undefined item passed to buildEquipmentUIElement');
      return null;
    }

    if (this.hasItemBeenRendered(item)) {
      return null;
    }

    try {
      HM.log(3, 'Creating equipment element:', {
        type: item.type,
        key: item.key,
        _source: item._source,
        children: item.children
      });

      const itemContainer = document.createElement('div');
      itemContainer.classList.add('equipment-item');

      // Add label if appropriate
      await this.baseRenderer.addItemLabel(itemContainer, item);

      // First check if this is part of an OR choice
      if (item.group) {
        const parentItem = this.parser.equipmentData.class.find((p) => p._id === item.group) || this.parser.equipmentData.background.find((p) => p._id === item.group);
        if (parentItem?.type === 'OR') {
          return null;
        }
      }

      // Use appropriate renderer based on item type
      let result;
      const renderer = this.renderers[item.type];

      if (renderer) {
        result = await renderer.render(item, itemContainer);
      } else {
        // Skip weapon/armor types that don't have dedicated renderers
        if (['weapon', 'armor'].includes(item.type)) {
          return null;
        }

        // Create fallback for unknown types
        const errorElement = document.createElement('div');
        errorElement.classList.add('equipment-item-error');
        errorElement.textContent = game.i18n.localize('hm.app.equipment.unknown-choice');
        itemContainer.appendChild(errorElement);
        result = itemContainer;
      }

      if (!result || result.innerHTML === '') {
        return null;
      }

      this.parser.constructor.renderedItems.add(item._id);
      return result;
    } catch (error) {
      HM.log(1, 'Critical error creating equipment element:', error);
      return null;
    }
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
   * Determine if item should be rendered as dropdown
   * @param {object} item - Equipment item
   * @returns {boolean} True if should render as dropdown
   */
  shouldItemUseDropdownDisplay(item) {
    if (item.group) {
      const parentItem = this.parser.equipmentData.class.find((p) => p._source.key === item.group) || this.parser.equipmentData.background.find((p) => p._source.key === item.group);
      return parentItem?.type === 'OR';
    }

    // Check for combined items that should be rendered in a dropdown
    if (item.type === 'AND' && item.children?.length > 1) {
      const parent = this.parser.equipmentData.class.find((p) => p._source.key === item.group) || this.parser.equipmentData.background.find((p) => p._source.key === item.group);
      if (parent?.type === 'OR') {
        return true;
      }
    }

    // Check if item is already part of a combined selection
    if (this.parser.constructor.combinedItemIds.has(item._source.key)) {
      return true;
    }

    // Top-level OR blocks should be dropdowns
    return item.type === 'OR';
  }
}
