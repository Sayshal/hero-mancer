import { log } from './logger.mjs';

/**
 * Utility class for finding and handling journal pages
 * @class
 */
export class JournalPageFinder {
  /**
   * Finds a journal page related to the document
   * @param {object} doc - The document to find a journal page for
   * @returns {Promise<string|null>} Journal page ID or null if none found
   * @static
   */
  static async findRelatedJournalPage(doc) {
    if (!doc) return null;
    try {
      const docType = doc.type;
      const docName = doc.name;
      const docUuid = doc.uuid;
      if (!docType || !docName) return null;
      const moduleId = this.#extractModuleId(doc);
      if (moduleId === 'dnd5e' && ['background', 'race', 'species'].includes(docType)) return null;
      const journalPacks = game.packs.filter((p) => p.metadata.type === 'JournalEntry');
      return await this.#searchCompendiumsForPage(journalPacks, docName, docType, docUuid);
    } catch (error) {
      log(2, `Error finding journal page for ${doc?.name}:`, error);
      return null;
    }
  }

  /**
   * Extracts the module ID from a document
   * @param {object} doc - The document to extract module ID from
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
   * @param {object[]} packs - Journal packs to search through
   * @param {string} itemName - Item name to find
   * @param {string} itemType - Item type (race, class, background)
   * @param {string} [itemUuid] - Optional UUID of the original item for module matching
   * @returns {Promise<string|null>} - Journal page UUID or null
   * @private
   */
  static async #searchCompendiumsForPage(packs, itemName, itemType, itemUuid) {
    if (!packs?.length || !itemName) return null;
    const normalizedItemName = itemName.toLowerCase();
    const baseRaceName = this._getBaseRaceName(itemName);
    const modulePrefix = this.#extractModulePrefixFromUuid(itemUuid);
    const prioritizedPacks = this.#prioritizeJournalPacks(packs, modulePrefix);
    const startTime = performance.now();
    const packsToSearch = modulePrefix ? prioritizedPacks.filter((pack) => pack.collection.startsWith(modulePrefix)) : prioritizedPacks;
    if (modulePrefix && packsToSearch.length === 0) return null;
    for (const pack of packsToSearch) {
      const result = await this.#searchSingleCompendium(pack, normalizedItemName, baseRaceName);
      if (result) {
        const searchTime = Math.round(performance.now() - startTime);
        if (searchTime > 3500) log(2, `Journal search for "${itemName}" took ${searchTime}ms`);
        if (modulePrefix) {
          const resultModulePrefix = this.#extractModulePrefixFromUuid(result);
          if (resultModulePrefix !== modulePrefix) continue;
        }
        return result;
      }
    }
    return null;
  }

  /**
   * Extract module prefix from item UUID
   * @param {string} itemUuid - Item UUID
   * @returns {string|null} - Module prefix or null
   * @private
   */
  static #extractModulePrefixFromUuid(itemUuid) {
    if (!itemUuid) return null;
    const compendiumMatch = itemUuid.match(/^Compendium\.([^.]+)\./);
    if (compendiumMatch && compendiumMatch[1]) return compendiumMatch[1];
    const collectionMatch = itemUuid.match(/^([^.]+)\./);
    if (collectionMatch && collectionMatch[1]) return collectionMatch[1];
    return null;
  }

  /**
   * Prioritize journal packs for more efficient searching
   * @param {object[]} packs - All available packs
   * @param {string|null} modulePrefix - Module prefix for prioritization
   * @returns {object[]} - Prioritized array of packs
   * @private
   */
  static #prioritizeJournalPacks(packs, modulePrefix) {
    if (!modulePrefix) return [...packs];
    const exactMatches = packs.filter((p) => p.collection.startsWith(modulePrefix));
    if (exactMatches.length > 0) return exactMatches;
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
   * @param {object} pack - The pack to search
   * @param {string} normalizedItemName - Normalized item name
   * @param {string|null} baseRaceName - Base race name for special cases
   * @returns {Promise<string|null>} - Journal page UUID or null
   * @private
   */
  static async #searchSingleCompendium(pack, normalizedItemName, baseRaceName) {
    try {
      const index = await pack.getIndex();
      for (const entry of index) {
        if (this.#isArtHandout(entry.name)) continue;
        if (!entry.pages?.length) continue;
        const exactMatch = entry.pages.find((p) => p.name.toLowerCase() === normalizedItemName);
        if (exactMatch) return `Compendium.${pack.collection}.${entry._id}.JournalEntryPage.${exactMatch._id}`;
        if (baseRaceName) {
          const baseMatch = entry.pages.find((p) => p.name.toLowerCase() === baseRaceName.toLowerCase());
          if (baseMatch) return `Compendium.${pack.collection}.${entry._id}.JournalEntryPage.${baseMatch._id}`;
        }
      }
      return null;
    } catch (error) {
      log(2, `Error searching journal pack ${pack.metadata.label}:`, error);
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
    const specialRaces = ['elf', 'gnome', 'tiefling', 'dwarf', 'halfling'];
    const lowerName = raceName.toLowerCase();
    if (!specialRaces.some((race) => lowerName.includes(race))) return null;
    if (raceName.includes(',')) return raceName.split(',')[0].trim();
    for (const race of specialRaces) if (lowerName.includes(race) && raceName.includes(' ')) return race.charAt(0).toUpperCase() + race.slice(1);
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
   * @param {boolean} [options.editable] - Whether the journal page is editable
   * @param {string|number} [options.height] - Height of the embedded content
   * @param {string|number} [options.width] - Width of the embedded content
   * @param {boolean} [options.scrollable] - Whether the content is scrollable
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = foundry.utils.mergeObject({ editable: false, height: 'auto', width: '100%', scrollable: true }, options);
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
    this.pageId = pageId;
    this.#showLoadingIndicator();
    try {
      const journalData = await this.#loadJournalDocument(pageId, itemName);
      if (!journalData.page) {
        this.#showErrorMessage('Journal page not found');
        return null;
      }
      await this.#renderPageContent(journalData.page);
      this.pageId = journalData.page.id;
      return this;
    } catch (error) {
      log(1, `Error rendering journal page ${pageId}: ${error.message}`, error);
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
   * @returns {Promise<{journalDoc: object|null, page: object|null}>} Loaded documents
   * @private
   */
  async #loadJournalDocument(pageId, itemName) {
    let journalDoc = null;
    let page = null;
    if (pageId.includes('.')) {
      const uuidToLoad = pageId.startsWith('Compendium.') ? pageId : `Compendium.${pageId}`;
      journalDoc = await fromUuid(uuidToLoad);
      if (journalDoc?.documentName === 'JournalEntry') {
        if (journalDoc.pages.size > 0) page = (await this.#findMatchingPage(journalDoc.pages, itemName)) || journalDoc.pages.contents[0];
      } else if (journalDoc?.documentName === 'JournalEntryPage') page = journalDoc;
    }
    return { journalDoc, page };
  }

  /**
   * Render the content of a journal page
   * @param {object} page - The page to render
   * @returns {Promise<void>}
   * @private
   */
  async #renderPageContent(page) {
    if (page.type === 'text' && page.text?.content) {
      await this.#renderTextPageContent(page);
      return;
    }
    await this.#renderPageWithSheet(page);
  }

  /**
   * Render a text page directly
   * @param {object} page - The page to render
   * @returns {Promise<void>}
   * @private
   */
  async #renderTextPageContent(page) {
    this.container.innerHTML = '';
    const contentDiv = document.createElement('div');
    contentDiv.classList.add('journal-page-content');
    contentDiv.innerHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(page.text.content);
    this.container.appendChild(contentDiv);
  }

  /**
   * Render a page using its sheet
   * @param {object} page - The page to render
   * @returns {Promise<void>}
   * @private
   */
  async #renderPageWithSheet(page) {
    try {
      const sheetClass = page._getSheetClass();
      this.sheet = new sheetClass({ document: page, editable: this.options.editable });
      let isV13Sheet = this.sheet instanceof foundry.applications.api.ApplicationV2;
      if (isV13Sheet) await this.#renderV13Sheet(page);
      else await this.#renderLegacySheet();
    } catch {
      this.#renderFallbackContent(page);
    }
  }

  /**
   * Render a V13+ ApplicationV2 style sheet using direct template rendering
   * @param {object} page - The page to render
   * @returns {Promise<void>}
   * @private
   */
  async #renderV13Sheet(page) {
    this.#prepareContainer();
    try {
      const context = await this.sheet._prepareContext({ editable: false });
      const viewTemplate = `systems/dnd5e/templates/journal/page-${page.type}-view.hbs`;
      const html = await foundry.applications.handlebars.renderTemplate(viewTemplate, context);
      this.container.innerHTML = html;
    } catch {
      await this.#renderPageDirectly(page);
    }
  }

  /**
   * Render a legacy style sheet (V12 and earlier)
   * @returns {Promise<void>}
   * @private
   */
  async #renderLegacySheet() {
    this.#prepareContainer();
    const data = await this.sheet.getData();
    const view = await this.sheet._renderInner(data);
    this.container.innerHTML = '';
    this.#appendSheetContent(view);
    this.#activateSheetListeners();
    if (this.sheet.toc) this._renderHeadings();
    this.sheet._callHooks('render', $(this.container), data);
  }

  /**
   * Render a page directly without using its sheet
   * @param {object} page - The page to render
   * @returns {Promise<void>}
   * @private
   */
  async #renderPageDirectly(page) {
    try {
      this.container.innerHTML = '';
      const pageContainer = document.createElement('div');
      pageContainer.classList.add('journal-page-content', 'class-page-content');
      const title = document.createElement('h1');
      title.textContent = page.name;
      pageContainer.appendChild(title);
      if (page.text?.content) {
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = await foundry.applications.ux.TextEditor.implementation.enrichHTML(page.text.content);
        pageContainer.appendChild(contentDiv);
      } else if (page.system) {
        const infoDiv = document.createElement('div');
        infoDiv.innerHTML = '<p>Class information would be displayed here.</p>';
        pageContainer.appendChild(infoDiv);
      }
      this.container.appendChild(pageContainer);
    } catch {
      this.#renderFallbackContent(page);
    }
  }

  /**
   * Prepare the container for sheet rendering
   * @private
   */
  #prepareContainer() {
    this.container.classList.add('journal-page-embed');
    if (this.options.scrollable) this.container.classList.add('scrollable');
  }

  /**
   * Append sheet content to the container
   * @param {jQuery|HTMLElement|DocumentFragment|string} view - Content to append
   * @private
   */
  #appendSheetContent(view) {
    if (view instanceof jQuery) view.appendTo(this.container);
    else if (view instanceof HTMLElement || view instanceof DocumentFragment) this.container.appendChild(view);
    else if (typeof view === 'string') this.container.innerHTML = view;
    else this.container.innerHTML = `<div class="notification error">${game.i18n.localize('hm.app.errors.unexpected-format')}</div>`;
  }

  /**
   * Activate sheet listeners
   * @private
   */
  #activateSheetListeners() {
    if (!this.sheet) return;
    let isV13Sheet = this.sheet instanceof foundry.applications.api.ApplicationV2;
    if (isV13Sheet) return;
    this.sheet._activateCoreListeners($(this.container));
    this.sheet.activateListeners($(this.container));
  }

  /**
   * Render fallback content when sheet rendering fails
   * @param {object} page - The page that failed to render
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
   * Normalize item name for matching
   * @param {string} itemName - Item name to normalize
   * @returns {string} Normalized name
   * @private
   */
  #normalizeItemName(itemName) {
    return itemName?.toLowerCase()?.trim() || '';
  }

  /**
   * Find a matching page for an item
   * @param {object} pages - Collection of pages to search
   * @param {string} itemName - Item name to match against
   * @returns {Promise<object|null>} Matching page or null
   * @private
   */
  async #findMatchingPage(pages, itemName) {
    if (!pages?.size || !itemName) return null;
    const normalizedItemName = this.#normalizeItemName(itemName);
    const matchStrategies = [
      (page) => page.name === itemName,
      (page) => page.name.toLowerCase() === normalizedItemName,
      (page) => {
        const baseRaceName = JournalPageFinder._getBaseRaceName(itemName);
        return baseRaceName && page.name.toLowerCase() === baseRaceName.toLowerCase();
      },
      (page) => page.name.toLowerCase().includes(normalizedItemName),
      (page) => normalizedItemName.includes(page.name.toLowerCase())
    ];
    for (const strategy of matchStrategies) {
      const matchingPage = pages.find(strategy);
      if (matchingPage) return matchingPage;
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
