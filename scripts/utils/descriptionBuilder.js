import { HM } from './index.js';
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
        const baseRaceName = this.#getBaseRaceName(itemName);
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
   * Get the base race name for special races
   * @param {string} raceName - Full race name
   * @returns {string|null} - Base race name or null
   * @private
   */
  #getBaseRaceName(raceName) {
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
