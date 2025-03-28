import { HM } from '../index.js';
import { AndItemRenderer, BaseItemRenderer, FocusItemRenderer, LinkedItemRenderer, OrItemRenderer, ToolItemRenderer } from './index.js';

/**
 * Manages rendering of equipment selection UI components
 * @class
 */
export class EquipmentRenderer {
  /**
   * Creates a new EquipmentRenderer instance
   * @param {Object} parser - The parent EquipmentParser instance
   */
  constructor(parser) {
    HM.log(3, 'EquipmentRenderer: Initializing renderer');
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
    HM.log(3, 'EquipmentRenderer: Initialized specialized renderers');
  }

  /**
   * Renders equipment selection UI for specified or all types
   * @async
   * @param {?string} type - Optional type to render ('class'|'background'). If null, renders all
   * @returns {Promise<HTMLElement>} Container element with rendered equipment choices
   */
  async generateEquipmentSelectionUI(type = null) {
    HM.log(3, `Rendering UI for ${type || 'all types'}`);

    // Reset tracking sets if rendering all types or if not already rendering
    if (!type || !this._renderInProgress) {
      this._renderInProgress = true;
      this.parser.constructor.renderedItems = new Set();
      this.parser.constructor.combinedItemIds = new Set();
      HM.log(3, 'Reset tracking sets');
    }

    try {
      // Ensure equipment data is loaded and lookup items are initialized
      await this.prepareRenderingData();

      // Get or create the main container
      let container = this.getOrCreateContainer();

      // Determine which types to render
      const typesToRender = type ? [type] : Object.keys(this.parser.equipmentData);
      HM.log(3, `Will render ${typesToRender.length} types: ${typesToRender.join(', ')}`);

      // Render each section
      for (const currentType of typesToRender) {
        await this.renderEquipmentSection(container, currentType);
      }

      HM.log(3, 'UI rendering complete');
      return container;
    } catch (error) {
      HM.log(1, `Failed to render: ${error.message}`);
      return this.createFallbackContainer();
    } finally {
      if (!type) {
        this._renderInProgress = false;
      }
    }
  }

  /**
   * Prepare data needed for rendering
   * @async
   * @returns {Promise<void>}
   * @private
   */
  async prepareRenderingData() {
    HM.log(3, 'Preparing data for rendering');

    try {
      // Clear existing data
      this.parser.equipmentData = null;

      // Step 1: Initialize lookup items
      try {
        await this.parser.constructor.initializeLookupItems();
      } catch (error) {
        HM.log(1, `Failed to initialize lookup items: ${error.message}`);
        throw new Error('Failed to initialize equipment lookup data');
      }

      // Step 2: Fetch equipment data
      try {
        await this.parser.fetchEquipmentData();
        if (!this.parser.equipmentData) {
          throw new Error('Equipment data is null after fetching');
        }
      } catch (error) {
        HM.log(1, `Failed to fetch equipment data: ${error.message}`);
        throw new Error('Failed to load equipment data');
      }

      HM.log(3, `Data prepared with ${this.parser.equipmentData?.class?.length || 0} class items and ${this.parser.equipmentData?.background?.length || 0} background items`);
    } catch (error) {
      HM.log(1, `Failed to prepare rendering data: ${error.message}`);
      throw error; // Propagate error for proper handling upstream
    }
  }

  /**
   * Gets existing container or creates a new one
   * @returns {HTMLElement} Container element
   */
  getOrCreateContainer() {
    HM.log(3, 'Getting container');

    let container = document.querySelector('.equipment-choices');
    if (!container) {
      container = document.createElement('div');
      container.classList.add('equipment-choices');
      HM.log(3, 'Created new container');
    } else {
      HM.log(3, 'Using existing container');
    }

    return container;
  }

  /**
   * Creates a fallback container for error states
   * @returns {HTMLElement} Fallback container
   */
  createFallbackContainer() {
    HM.log(3, 'Creating fallback container');

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
    HM.log(3, `Rendering ${type} section`);

    try {
      const items = this.parser.equipmentData[type] || [];
      const sectionContainer = this.getOrCreateSectionContainer(container, type);

      await this.renderSectionComponents(sectionContainer, type, items);

      HM.log(3, `${type} section rendered successfully`);
    } catch (error) {
      HM.log(1, `Error rendering ${type} section: ${error.message}`);
      this.renderSectionError(container);
    }
  }

  /**
   * Render all components of a section
   * @param {HTMLElement} sectionContainer - Section container
   * @param {string} type - Section type ('class'|'background')
   * @param {Array<Object>} items - Equipment items to render
   * @returns {Promise<void>}
   * @private
   */
  async renderSectionComponents(sectionContainer, type, items) {
    // Add the section header
    this.addSectionHeader(sectionContainer, type);

    // Add wealth option if applicable
    await this.renderWealthOption(sectionContainer, type);

    // Handle empty items case
    if (!items.length) {
      HM.log(3, `No equipment items for ${type}`);
      await this.renderEmptyNotice(sectionContainer, type);
      return;
    }

    // Render items
    await this.renderSectionItems(sectionContainer, items);
  }

  /**
   * Render wealth option for a section if applicable
   * @param {HTMLElement} sectionContainer - Section container
   * @param {string} type - Section type
   * @returns {Promise<void>}
   * @private
   */
  async renderWealthOption(sectionContainer, type) {
    if ((type === 'class' || type === 'background') && HM.SELECTED[type].id) {
      try {
        await this.parser.renderWealthOption(sectionContainer, type);
      } catch (error) {
        HM.log(1, `Error rendering wealth option: ${error.message}`);
        // Continue rendering even if wealth option fails
      }
    }
  }

  /**
   * Render items for a section
   * @param {HTMLElement} sectionContainer - Section container
   * @param {Array<Object>} items - Equipment items to render
   * @returns {Promise<void>}
   * @private
   */
  async renderSectionItems(sectionContainer, items) {
    HM.log(3, `Rendering ${items.length} items`);

    // Create a document fragment for better performance
    const fragment = document.createDocumentFragment();

    try {
      // Pre-fetch all item documents in parallel
      const itemDocs = await this.preFetchItemDocuments(items);
      HM.log(3, `Pre-fetched ${itemDocs.length} item documents`);

      // Process all items with their pre-fetched documents
      const processedItems = new Set();
      const failedItems = [];

      for (const { item, doc } of itemDocs) {
        if (!item || processedItems.has(item._id || item.key)) {
          continue;
        }

        processedItems.add(item._id || item.key);

        // Update item with document info if available
        if (doc) {
          item.name = doc.name;
        } else if (item.key) {
          item.name = item.key;
        }

        try {
          const itemElement = await this.buildEquipmentUIElement(item);
          if (itemElement) {
            fragment.appendChild(itemElement);
            HM.log(3, `Added element for ${item.name || item.key || 'unnamed item'}`);
          }
        } catch (error) {
          HM.log(1, `Failed to create element for ${item.name || item.key}: ${error.message}`);
          failedItems.push(item.name || item.key || game.i18n.localize('hm.app.equipment.unnamed'));
        }
      }

      // Add failed items notice if needed
      if (failedItems.length > 0) {
        this.addFailedItemsNotice(fragment, failedItems);
      }

      // Add all items to the container at once
      sectionContainer.appendChild(fragment);
    } catch (error) {
      HM.log(1, `Error in renderSectionItems: ${error.message}`);
      // Add error notice to the container
      const errorEl = document.createElement('div');
      errorEl.classList.add('equipment-error');
      errorEl.textContent = game.i18n.localize('hm.errors.equipment-rendering');
      sectionContainer.appendChild(errorEl);
    }
  }

  /**
   * Render an error message in a section
   * @param {HTMLElement} container - Container element
   * @private
   */
  renderSectionError(container) {
    HM.log(3, 'Rendering section error');

    const errorMessage = document.createElement('div');
    errorMessage.classList.add('error-message');
    errorMessage.textContent = game.i18n.localize('hm.errors.equipment-rendering');
    container.appendChild(errorMessage);
  }

  /**
   * Get or create a container for a specific section
   * @param {HTMLElement} container - Main container
   * @param {string} type - Section type
   * @returns {HTMLElement} Section container
   */
  getOrCreateSectionContainer(container, type) {
    HM.log(3, `Getting container for ${type}`);

    let sectionContainer = container.querySelector(`.${type}-equipment-section`);
    if (sectionContainer) {
      HM.log(3, `Reusing existing ${type} section`);
      sectionContainer.innerHTML = '';
    } else {
      sectionContainer = document.createElement('div');
      sectionContainer.classList.add(`${type}-equipment-section`);
      container.appendChild(sectionContainer);
      HM.log(3, `Created new ${type} section`);
    }

    return sectionContainer;
  }

  /**
   * Add a header for an equipment section
   * @param {HTMLElement} container - Section container
   * @param {string} type - Section type
   */
  addSectionHeader(container, type) {
    HM.log(3, `Adding header for ${type}`);

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
    HM.log(3, `Added header with text "${header.textContent}"`);
  }

  /**
   * Render empty notice for sections with no equipment
   * @param {HTMLElement} container - Section container
   * @param {string} type - Section type
   */
  async renderEmptyNotice(container, type) {
    HM.log(3, `Rendering empty notice for ${type}`);

    const emptyNotice = document.createElement('div');
    emptyNotice.classList.add('equipment-empty-notice');

    // Get localized message
    const message = game.i18n.format('hm.errors.missing-equipment', { type });

    // Create the notice with warning icon
    emptyNotice.innerHTML = `<div class="equipment-missing-warning"><i class="fa-solid fa-triangle-exclamation warning-icon"></i><p>${message}</p></div>`;

    // Try to extract equipment description from document
    await this.tryExtractEquipmentInfo(emptyNotice, type);

    container.appendChild(emptyNotice);
    HM.log(3, `Empty notice rendered for ${type}`);
  }

  /**
   * Try to extract equipment info from document and add to notice
   * @param {HTMLElement} emptyNotice - Empty notice element
   * @param {string} type - Section type
   * @returns {Promise<void>}
   * @private
   */
  async tryExtractEquipmentInfo(emptyNotice, type) {
    HM.log(3, `Attempting to extract info for ${type}`);

    const storedData = HM.SELECTED[type] || {};
    const uuid = storedData.uuid;

    if (!uuid) {
      HM.log(3, `No UUID for ${type}, skipping extraction`);
      return;
    }

    const doc = await fromUuidSync(uuid);
    if (!doc) {
      HM.log(3, `Document not found for UUID ${uuid}`);
      return;
    }

    HM.log(3, `Found document ${doc.name}, attempting extraction`);

    // Create divider and container
    const divider = document.createElement('hr');
    const extractedInfo = document.createElement('div');
    extractedInfo.classList.add('extracted-equipment-info');
    emptyNotice.appendChild(divider);

    const equipmentDescription = this.parser.dataService.extractEquipmentDescription(doc);

    if (equipmentDescription) {
      HM.log(3, `Successfully extracted equipment for ${type}`);
      extractedInfo.innerHTML = `<h4>${game.i18n.localize('hm.equipment.extracted-info')}</h4>${equipmentDescription}`;
      emptyNotice.appendChild(extractedInfo);
    } else {
      this.handleFailedExtraction(extractedInfo, doc, emptyNotice);
    }
  }

  /**
   * Handle case where equipment extraction failed
   * @param {HTMLElement} extractedInfo - Container for extracted info
   * @param {Object} doc - Document that was examined
   * @param {HTMLElement} emptyNotice - Parent container
   * @private
   */
  handleFailedExtraction(extractedInfo, doc, emptyNotice) {
    HM.log(3, `No description extracted from ${doc.name}`);

    extractedInfo.innerHTML = `<h4>${game.i18n.localize('hm.equipment.extracted-info')}</h4>${game.i18n.localize('hm.equipment.no-equipment-notice')}`;
    emptyNotice.appendChild(extractedInfo);

    // Check if the document likely has equipment info but couldn't be extracted
    const description = doc.system?.description?.value || '';
    if (description.toLowerCase().includes(game.i18n.localize('TYPES.Item.equipment').toLowerCase())) {
      const noExtractionNote = document.createElement('p');
      noExtractionNote.classList.add('equipment-extraction-failed');
      noExtractionNote.innerHTML = `${game.i18n.localize('hm.warnings.equipment-extraction-failed')}`;
      emptyNotice.appendChild(noExtractionNote);
      HM.log(3, 'Document contains equipment text but extraction failed');
    }
  }

  /**
   * Pre-fetch all item documents in parallel
   * @param {Array<Object>} items - Equipment items
   * @returns {Promise<Array<Object>>} Items with their documents
   */
  async preFetchItemDocuments(items) {
    HM.log(3, `Pre-fetching ${items.length} documents`);

    // Track progress
    let fetched = 0;
    const total = items.length;
    const updateProgress = () => {
      fetched++;
      if (fetched % 10 === 0 || fetched === total) {
        HM.log(3, `Fetched ${fetched}/${total} documents`);
      }
    };

    try {
      const results = await Promise.all(
        items.map(async (item) => {
          if (!item.key) {
            HM.log(3, `Item has no key: ${item._id || 'unknown'}`);
            updateProgress();
            return { item, doc: null };
          }

          try {
            const doc = await fromUuidSync(item.key);
            updateProgress();
            return { item, doc };
          } catch (error) {
            HM.log(1, `Error fetching document for ${item.key}: ${error.message}`);
            updateProgress();
            return { item, doc: null };
          }
        })
      );

      // Log summary of results
      const successCount = results.filter((r) => r.doc !== null).length;
      HM.log(3, `Successfully fetched ${successCount}/${total} documents`);

      return results;
    } catch (error) {
      HM.log(1, `Fatal error in document fetching: ${error.message}`);
      // Return partial results if available
      return items.map((item) => ({ item, doc: null }));
    }
  }

  /**
   * Render equipment items to a section container
   * @param {HTMLElement} container - Section container
   * @param {Array<Object>} itemDocs - Items with their documents
   */
  async renderItemElements(container, itemDocs) {
    HM.log(3, `Rendering ${itemDocs.length} item elements`);

    const processedItems = new Set();
    const failedItems = [];

    for (const { item, doc } of itemDocs) {
      if (!item || processedItems.has(item._id || item.key)) {
        continue;
      }

      processedItems.add(item._id || item.key);

      // Update item with document info if available
      if (doc) {
        item.name = doc.name;
      } else if (item.key) {
        item.name = item.key;
      }

      try {
        const itemElement = await this.buildEquipmentUIElement(item);
        if (itemElement) {
          container.appendChild(itemElement);
          HM.log(3, `Added element for ${item.name || item.key || 'unnamed item'}`);
        }
      } catch (error) {
        HM.log(1, `Failed to create element for ${item.name || item.key}: ${error.message}`);
        failedItems.push(item.name || item.key || game.i18n.localize('hm.app.equipment.unnamed'));
      }
    }

    this.addFailedItemsNotice(container, failedItems);
  }

  /**
   * Add notice about failed items if any
   * @param {HTMLElement} container - Container element
   * @param {Array<string>} failedItems - List of failed item names
   * @private
   */
  addFailedItemsNotice(container, failedItems) {
    if (failedItems.length === 0) return;

    HM.log(3, `Adding notice for ${failedItems.length} failed items`);

    const errorMessage = document.createElement('div');
    errorMessage.classList.add('equipment-error');
    errorMessage.textContent = game.i18n.format('hm.app.equipment.failed-to-load', { count: failedItems.length });
    container.appendChild(errorMessage);
  }

  /**
   * Build a UI element for an equipment item
   * @param {Object} item - Equipment item
   * @returns {Promise<HTMLElement|null>} Created element or null
   */
  async buildEquipmentUIElement(item) {
    HM.log(3, `Building UI for ${item?.type || 'unknown'} item ${item?._id || 'unknown'}`);

    if (!item) {
      HM.log(2, 'Null or undefined item');
      return null;
    }

    if (this.hasItemBeenRendered(item)) {
      HM.log(3, `Item ${item._id} already rendered, skipping`);
      return null;
    }

    try {
      // Create container
      const itemContainer = document.createElement('div');
      itemContainer.classList.add('equipment-item');

      // Add label if appropriate
      await this.baseRenderer.addItemLabel(itemContainer, item);

      // Skip if part of an OR choice
      if (this.isPartOfOrChoice(item)) {
        HM.log(3, `Item ${item._id} is part of OR choice, skipping`);
        return null;
      }

      // Render with appropriate specialized renderer
      const renderedElement = await this.renderWithSpecializedRenderer(item, itemContainer);

      if (!renderedElement || renderedElement.innerHTML === '') {
        HM.log(3, `Item ${item._id} not rendered (empty result)`);
        return null;
      }

      this.parser.constructor.renderedItems.add(item._id);
      HM.log(3, `Successfully built UI for item ${item._id}`);
      return renderedElement;
    } catch (error) {
      HM.log(1, `Critical error: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if item is part of an OR choice
   * @param {Object} item - Equipment item
   * @returns {boolean} True if part of OR choice
   * @private
   */
  isPartOfOrChoice(item) {
    if (!item.group) return false;

    const parentItem = this.parser.equipmentData.class.find((p) => p._id === item.group) || this.parser.equipmentData.background.find((p) => p._id === item.group);

    return parentItem?.type === 'OR';
  }

  /**
   * Render an item with the appropriate specialized renderer
   * @param {Object} item - Equipment item
   * @param {HTMLElement} itemContainer - Container element
   * @returns {Promise<HTMLElement|null>} Rendered element or null
   * @private
   */
  async renderWithSpecializedRenderer(item, itemContainer) {
    HM.log(3, `Using ${item.type || 'unknown'} renderer for item ${item._id}`);

    let result;
    const renderer = this.renderers[item.type];

    if (renderer) {
      result = await renderer.render(item, itemContainer);
    } else {
      // Skip weapon/armor types that don't have dedicated renderers
      if (['weapon', 'armor'].includes(item.type)) {
        HM.log(3, `Skipping ${item.type} item ${item._id}`);
        return null;
      }

      // Create fallback for unknown types
      HM.log(2, `Unknown type ${item.type} for item ${item._id}`);
      const errorElement = document.createElement('div');
      errorElement.classList.add('equipment-item-error');
      errorElement.textContent = game.i18n.localize('hm.app.equipment.unknown-choice');
      itemContainer.appendChild(errorElement);
      result = itemContainer;
    }

    return result;
  }

  /**
   * Checks if an item has been rendered
   * @param {Object} item - Equipment item
   * @returns {boolean} True if already rendered
   */
  hasItemBeenRendered(item) {
    const result = this.parser.constructor.renderedItems.has(item._id);
    HM.log(3, `Item ${item?._id} rendered? ${result}`);
    return result;
  }

  /**
   * Determine if item should be rendered as dropdown
   * @param {object} item - Equipment item
   * @returns {boolean} True if should render as dropdown
   */
  shouldItemUseDropdownDisplay(item) {
    // No item or no ID means it can't be displayed
    if (!item || !item._id) {
      return false;
    }

    // Already in combined items set
    if (this.parser.constructor.combinedItemIds.has(item._source?.key)) {
      return true;
    }

    // Top-level OR items should always be dropdowns
    if (item.type === 'OR') {
      return true;
    }

    // Check for items in OR groups
    if (item.group) {
      const allItems = [...(this.parser.equipmentData.class || []), ...(this.parser.equipmentData.background || [])];
      const parent = allItems.find((p) => p._id === item.group || p._source?.key === item.group);

      // Parent is an OR type
      if (parent?.type === 'OR') {
        return true;
      }

      // AND item with multiple children in an OR group
      if (item.type === 'AND' && item.children?.length > 1 && parent?.type === 'OR') {
        return true;
      }
    }

    return false;
  }
}
