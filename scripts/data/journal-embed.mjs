import { MODULE } from '../constants.mjs';
import { safeEnrichHTML } from '../utils/html-text.mjs';
import { log } from '../utils/logger.mjs';

/** Embed a JournalEntry / JournalEntryPage into a host container with a fallback cascade. */
export class JournalPageEmbed {
  /**
   * @param {HTMLElement} container Host element.
   * @param {object} [options] `editable`, `height`, `width`, `scrollable`.
   */
  constructor(container, options = {}) {
    this.container = container;
    this.options = foundry.utils.mergeObject({ editable: false, height: 'auto', width: '100%', scrollable: true }, options);
    this.pageId = null;
  }

  /**
   * Render a journal entry into the container.
   * @param {string} pageId Compendium-scoped uuid.
   * @param {object} [opts] Render options.
   * @param {?string} [opts.itemName] Document name for page matching.
   * @param {?string} [opts.baseSpecies] Lower-cased fallback species.
   * @param {?string} [opts.docType] Source-doc type.
   * @returns {Promise<?JournalPageEmbed>} Self when rendered.
   */
  async render(pageId, opts = {}) {
    const { itemName = null, baseSpecies = null, docType = null } = opts;
    this.pageId = pageId;
    this.#showLoadingIndicator();
    try {
      const { page, entry } = await this.#loadJournalDocument(pageId, itemName, baseSpecies);
      if (!page) {
        this.#showErrorMessage(_loc('HEROMANCER.App.Journal.PageNotFound'));
        return null;
      }
      this.container.innerHTML = '';
      this.#prepareContainer();
      const pages = this.#selectPages(page, entry, docType);
      for (const p of pages) {
        const section = document.createElement('div');
        section.className = 'journal-page-content';
        section.dataset.pageId = p.id;
        section.dataset.pageType = p.type;
        await this.#renderPageInto(section, p);
        this.container.appendChild(section);
      }
      this.pageId = page.id;
      return this;
    } catch (error) {
      log(1, `Error rendering journal page ${pageId}: ${error.message}`, error);
      this.#showErrorMessage(`${_loc('HEROMANCER.App.Journal.RenderError')}: ${error.message}`);
      return null;
    }
  }

  /**
   * Render a synthesized page document (one with no compendium entry, e.g. a subclass page built from an item) via its sheet.
   * @param {object} page Transient JournalEntryPage document.
   * @returns {Promise<boolean>} True when the sheet rendered; container untouched on failure.
   */
  async renderSyntheticPage(page) {
    const section = document.createElement('div');
    section.className = 'journal-page-content';
    section.dataset.pageType = page.type;
    if (!(await this.#renderSheetInto(section, page))) return false;
    this.#prepareContainer();
    this.container.replaceChildren(section);
    return true;
  }

  /**
   * Decide which pages to render based on docType.
   * @param {object} page Matched page.
   * @param {?object} entry Parent journal entry.
   * @param {?string} docType Source-doc type.
   * @returns {object[]} Pages to render.
   */
  #selectPages(page, entry, docType) {
    if (docType === 'subclass') return [page];
    if (!entry || entry.pages.size <= 1) return [page];
    const sorted = entry.pages.contents.toSorted((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    if (docType === 'class') return sorted.filter((p) => p.type !== 'subclass');
    return sorted;
  }

  /** Replace the container with a spinner while loading. */
  #showLoadingIndicator() {
    this.container.innerHTML = Handlebars.partials.hmJournalEmbedStatus({ loading: true, message: _loc('HEROMANCER.App.JournalLoading') });
  }

  /** @param {string} message Error text. */
  #showErrorMessage(message) {
    this.container.innerHTML = Handlebars.partials.hmJournalEmbedStatus({ loading: false, message });
  }

  /**
   * Resolve a page id (full uuid) to a JournalEntryPage.
   * @param {string} pageId Page uuid.
   * @param {?string} itemName Document name.
   * @param {?string} baseSpecies Fallback species.
   * @returns {Promise<{page: ?object, entry: ?object}>} Resolved page and entry.
   */
  async #loadJournalDocument(pageId, itemName, baseSpecies) {
    if (!pageId?.includes('.')) return { page: null, entry: null };
    const uuidToLoad = pageId.startsWith('Compendium.') ? pageId : `Compendium.${pageId}`;
    const journalDoc = await fromUuid(uuidToLoad);
    if (!journalDoc) return { page: null, entry: null };
    if (journalDoc.documentName === 'JournalEntryPage') return { page: journalDoc, entry: null };
    if (journalDoc.documentName === 'JournalEntry' && journalDoc.pages.size > 0) {
      const matched = await this.#findMatchingPage(journalDoc.pages, itemName, baseSpecies);
      return { page: matched ?? journalDoc.pages.contents[0], entry: journalDoc };
    }
    return { page: null, entry: null };
  }

  /**
   * Render a single page into a section: text-enrich, then sheet-template, then direct fallback.
   * @param {HTMLElement} target Section element.
   * @param {object} page Journal page.
   * @returns {Promise<void>} Resolves when rendered.
   */
  async #renderPageInto(target, page) {
    if (page.type === 'text' && page.text?.content) {
      target.innerHTML = await safeEnrichHTML(page.text.content, { secrets: false, relativeTo: page });
      return;
    }
    if (await this.#renderSheetInto(target, page)) return;
    await this.#renderDirectInto(target, page);
  }

  /**
   * Render a page via its dnd5e sheet template.
   * @param {HTMLElement} target Section element.
   * @param {object} page Journal page.
   * @returns {Promise<boolean>} True when rendered.
   */
  async #renderSheetInto(target, page) {
    try {
      const SheetClass = page._getSheetClass();
      const sheet = new SheetClass({ document: page, editable: this.options.editable });
      const context = await sheet._prepareContext({ editable: false });
      const viewTemplate = `systems/dnd5e/templates/journal/page-${page.type}-view.hbs`;
      target.innerHTML = await foundry.applications.handlebars.renderTemplate(viewTemplate, context);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fallback render: image, text without sheet, or empty placeholder.
   * @param {HTMLElement} target Section element.
   * @param {object} page Journal page.
   * @returns {Promise<void>} Resolves when rendered.
   */
  async #renderDirectInto(target, page) {
    const image = page.type === 'image' && page.src ? { src: page.src, alt: page.image?.caption ?? page.name } : null;
    const content = !image && page.text?.content ? await safeEnrichHTML(page.text.content) : null;
    target.innerHTML = await foundry.applications.handlebars.renderTemplate(MODULE.TEMPLATES.COMPONENTS.JOURNAL_PAGE_FALLBACK, {
      name: page.name,
      image,
      content,
      emptyMessage: _loc('HEROMANCER.App.Journal.NoContentFound')
    });
  }

  /** Tag the container for embed CSS hooks. */
  #prepareContainer() {
    this.container.classList.add('journal-page-embed');
    if (this.options.scrollable) this.container.classList.add('scrollable');
  }

  /**
   * Pick the best page in a JournalEntry by layered name match.
   * @param {object} pages Entry pages collection.
   * @param {?string} itemName Document name.
   * @param {?string} baseSpecies Fallback species.
   * @returns {Promise<?object>} Best matching page or null.
   */
  async #findMatchingPage(pages, itemName, baseSpecies) {
    if (!pages?.size || !itemName) return null;
    const normalized = itemName.toLowerCase().trim();
    const strategies = [
      (p) => p.name === itemName,
      (p) => p.name.toLowerCase() === normalized,
      (p) => baseSpecies && p.name.toLowerCase() === baseSpecies,
      (p) => p.name.toLowerCase().includes(normalized),
      (p) => normalized.includes(p.name.toLowerCase())
    ];
    for (const strategy of strategies) {
      const match = pages.find(strategy);
      if (match) return match;
    }
    return null;
  }
}
