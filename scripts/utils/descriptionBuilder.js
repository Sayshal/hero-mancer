import { HM } from './index.js';

/**
 * Utility class for finding and handling journal pages
 * @class
 */
export class JournalPageFinder {
  /**
   * Finds a journal page related to the document
   * @param {Object} doc - The document to find a journal page for
   * @returns {Promise<string|null>} Journal page ID or null if none found
   * @static
   */
  static async findRelatedJournalPage(doc) {
    if (!doc) return null;

    try {
      // Extract essential document information
      const docType = doc.type; // class, race, background
      const docName = doc.name;
      const docUuid = doc.uuid;

      if (!docType || !docName) {
        HM.log(2, 'Insufficient data to find journal page for document: missing type or name');
        return null;
      }

      // Extract module ID from document pack or UUID
      const moduleId = this.#extractModuleId(doc);

      // Skip journal page search for SRD backgrounds and races - they don't have journal pages
      if (moduleId === 'dnd5e' && ['background', 'race', 'species'].includes(docType)) {
        return null;
      }

      // Search compendiums for matching journal pages
      const journalPacks = game.packs.filter((p) => p.metadata.type === 'JournalEntry');
      return await this.#searchCompendiumsForPage(journalPacks, docName, docType, docUuid);
    } catch (error) {
      HM.log(2, `Error finding journal page for ${doc?.name}:`, error);
      return null;
    }
  }

  /**
   * Extracts the module ID from a document
   * @param {Object} doc - The document to extract module ID from
   * @returns {string|null} Module ID or null if can't be determined
   * @private
   */
  static #extractModuleId(doc) {
    let moduleId = null;

    if (doc.pack) {
      const packMatch = doc.pack.match(/^([^.]+)\./);
      if (packMatch) moduleId = packMatch[1];
    } else if (doc.uuid) {
      const uuidMatch = doc.uuid.match(/^Compendium\.([^.]+)\./);
      if (uuidMatch) moduleId = uuidMatch[1];
    }

    return moduleId;
  }

  /**
   * Search compendiums for matching journal page
   * @param {CompendiumCollection[]} packs - Journal packs to search through
   * @param {string} itemName - Item name to find
   * @param {string} itemType - Item type (race, class, background)
   * @param {string} [itemUuid] - Optional UUID of the original item for module matching
   * @returns {Promise<string|null>} - Journal page UUID or null
   * @private
   */
  static async #searchCompendiumsForPage(packs, itemName, itemType, itemUuid) {
    if (!packs?.length || !itemName) {
      HM.log(3, 'Invalid search parameters for journal page');
      return null;
    }

    const normalizedItemName = itemName.toLowerCase();
    const baseRaceName = this._getBaseRaceName(itemName);
    const modulePrefix = this.#extractModulePrefixFromUuid(itemUuid);

    // Prioritize and filter packs for more efficient searching
    const prioritizedPacks = this.#prioritizeJournalPacks(packs, modulePrefix);

    // Track performance for heavy operations
    const startTime = performance.now();

    try {
      // If we have a module prefix, only search packs from that module
      const packsToSearch = modulePrefix ? prioritizedPacks.filter((pack) => pack.collection.startsWith(modulePrefix)) : prioritizedPacks;

      // If we filtered out all packs but still have a modulePrefix, log it
      if (modulePrefix && packsToSearch.length === 0) {
        HM.log(3, `No matching journal packs found for module prefix: ${modulePrefix}`);
        return null;
      }

      // Search through each pack until a match is found
      for (const pack of packsToSearch) {
        const result = await this.#searchSingleCompendium(pack, normalizedItemName, baseRaceName);
        if (result) {
          const searchTime = Math.round(performance.now() - startTime);
          if (searchTime > 3500) {
            HM.log(2, `Journal search for "${itemName}" took ${searchTime}ms`);
          }

          // Verify module match
          if (modulePrefix) {
            const resultModulePrefix = this.#extractModulePrefixFromUuid(result);
            if (resultModulePrefix !== modulePrefix) {
              HM.log(3, `Found journal page in wrong module: ${resultModulePrefix} vs expected ${modulePrefix}`);
              continue; // Skip this result and keep searching
            }
          }

          return result;
        }
      }

      HM.log(3, `No matching journal page found for ${itemType} "${itemName}" after searching ${packsToSearch.length} packs`);
      return null;
    } catch (error) {
      HM.log(2, `Error during journal page search for ${itemName}:`, error);
      return null;
    }
  }

  /**
   * Extract module prefix from item UUID
   * @param {string} itemUuid - Item UUID
   * @returns {string|null} - Module prefix or null
   * @private
   */
  static #extractModulePrefixFromUuid(itemUuid) {
    if (!itemUuid) return null;

    // Handle standard Compendium UUID format
    const compendiumMatch = itemUuid.match(/^Compendium\.([^.]+)\./);
    if (compendiumMatch && compendiumMatch[1]) {
      return compendiumMatch[1];
    }

    // Handle direct collection format (pack.collection.documentId)
    const collectionMatch = itemUuid.match(/^([^.]+)\./);
    if (collectionMatch && collectionMatch[1]) {
      return collectionMatch[1];
    }

    return null;
  }

  /**
   * Prioritize journal packs for more efficient searching
   * @param {CompendiumCollection[]} packs - All available packs
   * @param {string|null} modulePrefix - Module prefix for prioritization
   * @returns {CompendiumCollection[]} - Prioritized array of packs
   * @private
   */
  static #prioritizeJournalPacks(packs, modulePrefix) {
    if (!modulePrefix) return [...packs];

    // First prioritize exact module matches
    const exactMatches = packs.filter((p) => p.collection.startsWith(modulePrefix));

    // If we have exact matches, only use those
    if (exactMatches.length > 0) {
      return exactMatches;
    }

    // Otherwise, sort with preference to PHB packs which are likely to have content
    return [...packs].sort((a, b) => {
      const aIsPHB = a.collection.includes('dnd-players-handbook');
      const bIsPHB = b.collection.includes('dnd-players-handbook');
      if (aIsPHB && !bIsPHB) return -1;
      if (!aIsPHB && bIsPHB) return 1;
      return 0;
    });
  }

  /**
   * Search a single compendium for matching journal pages
   * @param {CompendiumCollection} pack - The pack to search
   * @param {string} normalizedItemName - Normalized item name
   * @param {string|null} baseRaceName - Base race name for special cases
   * @returns {Promise<string|null>} - Journal page UUID or null
   * @private
   */
  static async #searchSingleCompendium(pack, normalizedItemName, baseRaceName) {
    try {
      // Get the index which now includes pages data
      const index = await pack.getIndex();

      for (const entry of index) {
        // Skip art handouts
        if (this.#isArtHandout(entry.name)) continue;

        // If the index doesn't have pages data or it's empty, skip
        if (!entry.pages?.length) continue;

        // Check for exact name match in the journal pages from the index
        const exactMatch = entry.pages.find((p) => p.name.toLowerCase() === normalizedItemName);
        if (exactMatch) {
          HM.log(3, `Found exact match page "${exactMatch.name}" in journal "${entry.name}"`);
          return `Compendium.${pack.collection}.${entry._id}.JournalEntryPage.${exactMatch._id}`;
        }

        // If this is a special race, try matching the base race name
        if (baseRaceName) {
          const baseMatch = entry.pages.find((p) => p.name.toLowerCase() === baseRaceName.toLowerCase());
          if (baseMatch) {
            HM.log(3, `Found base race match page "${baseMatch.name}" in journal "${entry.name}"`);
            return `Compendium.${pack.collection}.${entry._id}.JournalEntryPage.${baseMatch._id}`;
          }
        }
      }

      return null;
    } catch (error) {
      HM.log(2, `Error searching journal pack ${pack.metadata.label}:`, error);
      return null;
    }
  }

  /**
   * Check if entry appears to be an art handout
   * @param {string} name - Entry name
   * @returns {boolean} - True if appears to be an art handout
   * @private
   */
  static #isArtHandout(name) {
    if (!name) return false;
    const lowerName = name.toLowerCase();
    return lowerName.includes('art') || lowerName.includes('handout');
  }

  /**
   * Get the base race name for special races
   * @param {string} raceName - Full race name
   * @returns {string|null} - Base race name or null
   * @private
   */
  static _getBaseRaceName(raceName) {
    if (!raceName) return null;

    // List of special races that need special handling
    const specialRaces = ['elf', 'gnome', 'tiefling', 'dwarf', 'halfling'];
    const lowerName = raceName.toLowerCase();

    // Only proceed for special races
    if (!specialRaces.some((race) => lowerName.includes(race))) {
      return null;
    }

    // Handle comma format: "Elf, High" -> "Elf"
    if (raceName.includes(',')) {
      return raceName.split(',')[0].trim();
    }

    // Handle space format by extracting the first word for known races
    for (const race of specialRaces) {
      if (lowerName.includes(race) && raceName.includes(' ')) {
        // Capitalize the first letter of the race
        return race.charAt(0).toUpperCase() + race.slice(1);
      }
    }

    return null;
  }
}

/**
 * A class for embedding journal pages inside other applications.
 */
export class JournalPageEmbed {
  /**
   * @param {HTMLElement} container - The container element where the journal page will be embedded
   * @param {object} options - Configuration options
   * @param {boolean} [options.editable=false] - Whether the journal page is editable
   * @param {string|number} [options.height='auto'] - Height of the embedded content
   * @param {string|number} [options.width='100%'] - Width of the embedded content
   * @param {boolean} [options.scrollable=true] - Whether the content is scrollable
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = foundry.utils.mergeObject(
      {
        editable: false,
        height: 'auto',
        width: '100%',
        scrollable: true
      },
      options
    );

    this.sheet = null;
    this.pageId = null;
  }

  /**
   * Render a journal page inside the container
   * @param {string} pageId - The ID of the journal page to embed
   * @param {string} [itemName] - Optional name of the item (class/race/background) to match
   * @returns {Promise<JournalPageEmbed|null>} This instance or null if rendering failed
   */
  async render(pageId, itemName = null) {
    // Log that we're attempting to render a journal page
    HM.log(3, `Attempting to render journal page ${pageId}${itemName ? ` for ${itemName}` : ''}`);

    // Show loading indicator
    this.#showLoadingIndicator();

    try {
      // Load the journal document
      const journalData = await this.#loadJournalDocument(pageId, itemName);

      if (!journalData.page) {
        HM.log(2, `Journal page ${pageId} not found`);
        this.#showErrorMessage('Journal page not found');
        return null;
      }

      // Render the content based on page type
      await this.#renderPageContent(journalData.page);

      this.pageId = journalData.page.id;
      return this;
    } catch (error) {
      HM.log(1, `Error rendering journal page ${pageId}: ${error.message}`, error);
      this.#showErrorMessage(`Error rendering journal page: ${error.message}`);
      return null;
    }
  }

  /**
   * Show loading indicator in the container
   * @private
   */
  #showLoadingIndicator() {
    this.container.innerHTML = `
      <div class="journal-loading">
        <i class="fas fa-spinner fa-spin"></i>
        ${game.i18n.localize('hm.app.journal-loading')}
      </div>`;
  }

  /**
   * Show error message in the container
   * @param {string} message - Error message to display
   * @private
   */
  #showErrorMessage(message) {
    this.container.innerHTML = `
      <div class="notification error">${message}</div>`;
  }

  /**
   * Load journal document from pageId
   * @param {string} pageId - Journal page ID/reference
   * @param {string} [itemName] - Optional item name for matching
   * @returns {Promise<{journalDoc: JournalEntry|null, page: JournalEntryPage|null}>}
   * @private
   */
  async #loadJournalDocument(pageId, itemName) {
    let journalDoc = null;
    let page = null;

    // Check if this is a compendium reference
    if (pageId.includes('.')) {
      try {
        // Check if pageId already has the Compendium prefix
        const uuidToLoad = pageId.startsWith('Compendium.') ? pageId : `Compendium.${pageId}`;

        // Try to load it as a direct UUID
        journalDoc = await fromUuid(uuidToLoad);

        if (journalDoc?.documentName === 'JournalEntry') {
          // If we have a journal entry but need a specific page
          if (journalDoc.pages.size > 0) {
            page = (await this.#findMatchingPage(journalDoc.pages, itemName)) || journalDoc.pages.contents[0];
          }
        } else if (journalDoc?.documentName === 'JournalEntryPage') {
          // We already have a page
          page = journalDoc;
        }
      } catch (err) {
        HM.log(2, `Error loading compendium page: ${err.message}`);
        throw new Error(`Failed to load journal page: ${err.message}`);
      }
    }

    return { journalDoc, page };
  }

  /**
   * Render the content of a journal page
   * @param {JournalEntryPage} page - The page to render
   * @returns {Promise<void>}
   * @private
   */
  async #renderPageContent(page) {
    // For simple text pages, render the content directly
    if (page.type === 'text' && page.text?.content) {
      await this.#renderTextPageContent(page);
      return;
    }

    // For other page types, use the sheet approach
    await this.#renderPageWithSheet(page);
  }

  /**
   * Render a text page directly
   * @param {JournalEntryPage} page - The page to render
   * @returns {Promise<void>}
   * @private
   */
  async #renderTextPageContent(page) {
    this.container.innerHTML = '';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('journal-page-content');
    contentDiv.innerHTML = await TextEditor.enrichHTML(page.text.content);

    this.container.appendChild(contentDiv);
    HM.log(3, `Text page ${page.id} rendered directly`);
  }

  /**
   * Render a page using its sheet
   * @param {JournalEntryPage} page - The page to render
   * @returns {Promise<void>}
   * @private
   */
  async #renderPageWithSheet(page) {
    try {
      const sheetClass = page._getSheetClass();
      this.sheet = new sheetClass(page, { editable: this.options.editable });

      // Prepare the container
      this.#prepareContainer();

      // Render the sheet content
      const data = await this.sheet.getData();
      const view = await this.sheet._renderInner(data);

      // Clear and add the content
      this.container.innerHTML = '';
      this.#appendSheetContent(view);

      // Activate listeners
      this.#activateSheetListeners();

      // Handle TOC if applicable
      if (this.sheet.toc) {
        this._renderHeadings();
      }

      // Signal completion
      this.sheet._callHooks('render', $(this.container), data);

      HM.log(3, `Journal page ${this.pageId} rendered successfully with sheet`);
    } catch (error) {
      HM.log(1, `Error with sheet rendering: ${error.message}`);
      this.#renderFallbackContent(page);
    }
  }

  /**
   * Prepare the container for sheet rendering
   * @private
   */
  #prepareContainer() {
    this.container.classList.add('journal-page-embed');
    if (this.options.scrollable) {
      this.container.classList.add('scrollable');
    }
  }

  /**
   * Append sheet content to the container
   * @param {jQuery|HTMLElement|DocumentFragment|string} view - Content to append
   * @private
   */
  #appendSheetContent(view) {
    if (view instanceof jQuery) {
      view.appendTo(this.container);
    } else if (view instanceof HTMLElement || view instanceof DocumentFragment) {
      this.container.appendChild(view);
    } else if (typeof view === 'string') {
      this.container.innerHTML = view;
    } else {
      HM.log(2, 'Unexpected return type from _renderInner:', typeof view);
      this.container.innerHTML = `<div class="notification error">${game.i18n.localize('hm.app.errors.unexpected-format')}</div>`;
    }
  }

  /**
   * Activate sheet listeners
   * @private
   */
  #activateSheetListeners() {
    if (!this.sheet) return;
    this.sheet._activateCoreListeners($(this.container));
    this.sheet.activateListeners($(this.container));
  }

  /**
   * Render fallback content when sheet rendering fails
   * @param {JournalEntryPage} page - The page that failed to render
   * @private
   */
  #renderFallbackContent(page) {
    this.container.innerHTML = `
      <div class="notification warning">${game.i18n.format('hm.warnings.simplified-journal', { page: page.name })}</div>
      <h2>${page.name}</h2>
      <div class="journal-content">${page.text?.content || game.i18n.localize('hm.app.journal.no-content-found')}</div>
    `;
  }

  /**
   * Find a matching page for an item
   * @param {Collection} pages - Collection of pages to search
   * @param {string} itemName - Item name to match against
   * @returns {JournalEntryPage|null} - Matching page or null
   * @private
   */
  async #findMatchingPage(pages, itemName) {
    if (!pages?.size || !itemName) return null;

    const normalizedItemName = this.#normalizeItemName(itemName);

    HM.log(3, `Finding page matching "${itemName}" among ${pages.size} pages`);

    // Create a prioritized list of matching strategies
    const matchStrategies = [
      // 1. Exact case-sensitive match
      (page) => page.name === itemName,

      // 2. Case-insensitive exact match
      (page) => page.name.toLowerCase() === normalizedItemName,

      // 3. Base race match for special races
      (page) => {
        const baseRaceName = JournalPageFinder._getBaseRaceName(itemName);
        return baseRaceName && page.name.toLowerCase() === baseRaceName.toLowerCase();
      },

      // 4. Substantial partial matches
      (page) => {
        const pageName = page.name.toLowerCase();
        if (pageName.length < 3) return false; // Skip very short names

        // Either page contains item name or item name contains page name
        return (pageName.includes(normalizedItemName) && normalizedItemName.length > 3) || (normalizedItemName.includes(pageName) && pageName.length > 3);
      }
    ];

    // Filter out art handouts first
    const filteredPages = Array.from(pages).filter((page) => !page.name.toLowerCase().includes('handout') && !page.name.toLowerCase().includes('art'));

    if (filteredPages.length < pages.size) {
      HM.log(3, `Filtered out ${pages.size - filteredPages.length} art/handout pages`);
    }

    // Try each strategy in order until we find a match
    for (const strategy of matchStrategies) {
      const match = filteredPages.find(strategy);
      if (match) {
        HM.log(3, `Found matching page "${match.name}" for "${itemName}"`);
        return match;
      }
    }

    // If no match in filtered pages, try the full set as a last resort
    HM.log(3, 'No match in filtered pages, trying full set as fallback');
    for (const strategy of matchStrategies) {
      const match = Array.from(pages).find(strategy);
      if (match) {
        HM.log(3, `Found fallback match "${match.name}" for "${itemName}"`);
        return match;
      }
    }

    HM.log(3, `No matching page found for "${itemName}"`);
    return null;
  }

  /**
   * Normalize an item name for matching
   * @param {string} name - The item name to normalize
   * @returns {string} - Normalized name
   * @private
   */
  #normalizeItemName(name) {
    if (!name) return '';

    // Remove content in parentheses
    return name.split('(')[0].trim().toLowerCase();
  }

  /**
   * Render headings from the page's table of contents
   * @private
   */
  _renderHeadings() {
    if (!this.sheet?.toc || Object.keys(this.sheet.toc).length === 0) return;

    const headings = Object.values(this.sheet.toc);
    headings.forEach(({ element, slug }) => {
      if (element) element.dataset.anchor = slug;
    });
  }
}
