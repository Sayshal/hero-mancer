import { HM, JournalPageFinder, MODULE } from './index.js';
import { log } from './logger.mjs';

/**
 * Service for managing game document preparation and processing
 * Uses index-first loading for performance, with lazy loading of full documents.
 * @class
 */
export class DocumentService {
  static #documentCache = new Map();
  static #descriptionCache = new Map();

  /**
   * Get a fully loaded document by UUID, with caching
   * @param {string} uuid - Document UUID
   * @returns {Promise<object | null>} Full document or null
   * @static
   */
  static async getFullDocument(uuid) {
    if (!uuid) return null;
    if (this.#documentCache.has(uuid)) return this.#documentCache.get(uuid);
    try {
      const doc = await fromUuid(uuid);
      if (doc) this.#documentCache.set(uuid, doc);
      return doc;
    } catch (error) {
      log(1, `Error loading document ${uuid}:`, error);
      return null;
    }
  }

  /**
   * Get enriched description for a document, with caching and lazy loading
   * @param {string} uuid - Document UUID
   * @returns {Promise<{description: string, enrichedDescription: string, journalPageId: string|null}>} Description data object
   * @static
   */
  static async getDocumentDescription(uuid) {
    if (!uuid) return { description: '', enrichedDescription: '', journalPageId: null };
    if (this.#descriptionCache.has(uuid)) return this.#descriptionCache.get(uuid);
    try {
      const doc = await this.getFullDocument(uuid);
      if (!doc) return { description: '', enrichedDescription: '', journalPageId: null };
      const result = await this.#findDescription(doc);
      this.#descriptionCache.set(uuid, result);
      return result;
    } catch (error) {
      log(1, `Error getting description for ${uuid}:`, error);
      return { description: '', enrichedDescription: '', journalPageId: null };
    }
  }

  /**
   * Clear document and description caches
   * @static
   */
  static clearCaches() {
    this.#documentCache.clear();
    this.#descriptionCache.clear();
  }

  /**
   * Loads and initializes all document types required for Hero Mancer
   * @returns {Promise<void>}
   * @static
   */
  static async loadAndInitializeDocuments() {
    try {
      log(3, 'Loading documents from compendiums');
      if (!HM.documents) HM.documents = {};
      const [raceResults, classResults, backgroundResults] = await Promise.allSettled([
        this.#fetchTypeDocumentsFromCompendiums('race'),
        this.#fetchTypeDocumentsFromCompendiums('class'),
        this.#fetchTypeDocumentsFromCompendiums('background')
      ]);
      if (raceResults.status === 'fulfilled') {
        HM.documents.race = this.#organizeDocumentsByTopLevelFolder(raceResults.value.documents);
      } else {
        log(1, 'Failed to load race documents:', raceResults.reason);
        HM.documents.race = [];
      }
      if (classResults.status === 'fulfilled') {
        HM.documents.class = this.#organizeDocumentsByTopLevelFolder(classResults.value.documents);
      } else {
        log(1, 'Failed to load class documents:', classResults.reason);
        HM.documents.class = [];
      }
      if (backgroundResults.status === 'fulfilled') {
        HM.documents.background = this.#organizeDocumentsByTopLevelFolder(backgroundResults.value.documents);
      } else {
        log(1, 'Failed to load background documents:', backgroundResults.reason);
        HM.documents.background = [];
      }
      const counts = { race: HM.documents.race?.length || 0, class: HM.documents.class?.length || 0, background: HM.documents.background?.length || 0 };
      log(3, `Loaded ${counts.race} race groups, ${counts.class} class groups, ${counts.background} background groups`);
    } catch (error) {
      log(1, 'Critical error during document initialization:', error);
      ui.notifications.error('hm.errors.document-loading-failed', { localize: true });
    }
  }

  /**
   * Fetches and prepares documents based on the specified type for dropdown use
   * @param {'race'|'class'|'background'|'species'} type - Document type to register
   * @returns {Promise<{types: Array, dropdownHtml: string}>} Prepared documents data
   * @static
   */
  static async prepareDocumentsByType(type) {
    if (!type || !['race', 'class', 'background', 'species'].includes(type)) {
      ui.notifications.error('hm.errors.invalid-document-type', { localize: true });
      return { types: [], dropdownHtml: '' };
    }
    try {
      const data = await this.#fetchTypeDocumentsFromCompendiums(type);
      if (!data.documents || !Array.isArray(data.documents)) return { types: [], dropdownHtml: '' };
      const result = type === 'race' || type === 'species' ? this.#organizeRacesByFolderName(data.documents) : this.#getFlatDocuments(data.documents);
      const promises = [];
      Hooks.callAll('heroMancer.documentsReady', type, result, promises);
      await Promise.all(promises);
      return result;
    } catch (error) {
      log(1, `Error preparing documents of type ${type}:`, error);
      ui.notifications.error(game.i18n.format('hm.errors.document-preparation-failed', { type: type, error: error.message }));
      return { types: [], dropdownHtml: '' };
    }
  }

  /**
   * Gets flat list of documents with minimal processing
   * @param {Array} documents - Documents to process
   * @returns {Array} Processed documents
   * @private
   */
  static #getFlatDocuments(documents) {
    if (!documents?.length) return [];
    return documents
      .map((doc) => ({
        id: doc.id,
        name: doc.name,
        sortName: doc.name,
        description: doc.description,
        enrichedDescription: doc.enrichedDescription,
        journalPageId: doc.journalPageId,
        packName: doc.packName,
        packId: doc.packId,
        uuid: doc.uuid
      }))
      .sort((a, b) => a.sortName.localeCompare(b.sortName));
  }

  /**
   * Organizes races into groups based on their top-level folder name or source
   * @param {Array} documents - Race documents to organize
   * @returns {Array} Grouped race documents
   * @private
   */
  static #organizeRacesByFolderName(documents) {
    return this.#organizeDocumentsByTopLevelFolder(documents);
  }

  /**
   * Fetches documents from compendiums based on type
   * @param {'race'|'class'|'background'|'species'} type - Document type
   * @returns {Promise<{documents: Array}>} Array of processed documents
   * @private
   */
  static async #fetchTypeDocumentsFromCompendiums(type) {
    if (!['race', 'class', 'background', 'species'].includes(type)) throw new Error(`Invalid document type: ${type}`);
    const selectedPacks = game.settings.get(MODULE.ID, `${type}Packs`) || [];
    let packs = this.#getValidPacks(selectedPacks, type);
    log(3, `Fetching ${type} documents from ${packs.length} packs`);
    if (!packs.length) {
      ui.notifications.warn(game.i18n.format('hm.warnings.no-packs-found', { type: type }));
      return { documents: [] };
    }
    const results = await this.#processAllPacks(packs, type);
    return { documents: this.#sortDocumentsByNameAndPack(results.validPacks) };
  }

  /**
   * Get valid packs based on user selection or defaults
   * @param {string[]} selectedPacks - User-selected pack IDs
   * @param {string} type - Document type
   * @returns {object[]} Array of valid packs
   * @private
   */
  static #getValidPacks(selectedPacks, type) {
    if (selectedPacks.length > 0) {
      const validPacks = [];
      const invalidPackIds = [];
      for (const packId of selectedPacks) {
        const pack = game.packs.get(packId);
        if (pack && pack.metadata.type === 'Item') validPacks.push(pack);
        else invalidPackIds.push(packId);
      }
      if (invalidPackIds.length > 0) {
        const updatedPacks = selectedPacks.filter((id) => !invalidPackIds.includes(id));
        log(2, `Removing ${invalidPackIds.length} invalid packs from ${type}Packs setting.`);
        game.settings.set(MODULE.ID, `${type}Packs`, updatedPacks);
      }
      if (validPacks.length > 0) return validPacks;
    }
    return game.packs.filter((pack) => pack.metadata.type === 'Item');
  }

  /**
   * Process all packs to extract documents of specified type using index-first loading
   * @param {object[]} packs - Packs to process
   * @param {string} type - Document type to filter
   * @returns {Promise<{validPacks: Array, failedPacks: Array, processingErrors: Array}>} Processing results
   * @private
   */
  static async #processAllPacks(packs, type) {
    const validPacks = [];
    const failedPacks = [];
    const processingErrors = [];
    for (const pack of packs) {
      if (!pack?.metadata) continue;
      try {
        const index = await pack.getIndex({ fields: ['system.properties', 'folder'] });
        const typeEntries = index.filter((entry) => entry.type === type);
        if (!typeEntries.length) continue;
        const packDocuments = await this.#processPackIndexEntries(pack, typeEntries);
        validPacks.push(...packDocuments.filter(Boolean));
      } catch (error) {
        log(1, `Failed to retrieve index from pack ${pack.metadata.label}:`, error);
        processingErrors.push(error.message);
        failedPacks.push(pack.metadata.label);
      }
    }
    this.#reportPackProcessingErrors(failedPacks, processingErrors);
    return { validPacks, failedPacks, processingErrors };
  }

  /**
   * Process index entries from a single pack (no full document load)
   * @param {object} pack - The pack being processed
   * @param {object[]} entries - Index entries to process
   * @returns {Promise<Array>} Processed entries with minimal data
   * @private
   */
  static async #processPackIndexEntries(pack, entries) {
    const packName = this.#translateSystemFolderName(pack.metadata.label, pack.metadata.id);
    return entries
      .map((entry) => {
        if (!entry) return null;
        const folderName = entry.folder ? pack.folders.get(entry.folder)?.name : null;
        const hasSidekickFolder = folderName?.toLowerCase().includes('sidekick');
        const hasSidekickProperty = entry.system?.properties && new Set(entry.system.properties).has('sidekick');
        if (hasSidekickFolder || hasSidekickProperty) return null;
        const uuid = `Compendium.${pack.collection}.${entry._id}`;
        return {
          doc: null,
          packName,
          uuid,
          packId: pack.metadata.id,
          description: null,
          enrichedDescription: null,
          journalPageId: null,
          folderName,
          system: entry.system || null,
          id: entry._id,
          name: entry.name,
          img: entry.img
        };
      })
      .filter(Boolean);
  }

  /**
   * Report errors for failed pack processing
   * @param {string[]} failedPacks - Names of packs that failed
   * @param {string[]} processingErrors - Error messages
   * @private
   */
  static #reportPackProcessingErrors(failedPacks, processingErrors) {
    if (failedPacks.length === 0) return;
    const errorDetails = processingErrors.length ? ` (Errors: ${processingErrors.join(', ')})` : '';
    ui.notifications.error(game.i18n.format('hm.errors.failed-compendium-retrieval', { type: failedPacks.join(', '), details: errorDetails }));
    log(1, 'Failed pack retrieval details:', { failedPacks, processingErrors });
  }

  /**
   * Sorts document array by name and pack
   * @param {Array} documents - Documents to sort (index entries, not full docs)
   * @returns {Array} Sorted documents
   * @private
   */
  static #sortDocumentsByNameAndPack(documents) {
    if (!documents?.length) return [];
    return documents
      .map((entry) => ({
        doc: entry.doc,
        id: entry.id,
        name: entry.name,
        img: entry.img,
        description: entry.description,
        enrichedDescription: entry.enrichedDescription,
        journalPageId: entry.journalPageId,
        folderName: entry.folderName,
        packName: entry.packName,
        packId: entry.packId,
        uuid: entry.uuid,
        system: entry.system
      }))
      .sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name);
        return nameCompare || (a.packName || '').localeCompare(b.packName || '');
      });
  }

  /**
   * Finds and retrieves comprehensive description for a document
   * @param {object} doc - The document to find a description for
   * @returns {Promise<object>} Description and optional journal page ID
   * @private
   */
  static async #findDescription(doc) {
    if (!doc) return;
    try {
      const journalPageId = await JournalPageFinder.findRelatedJournalPage(doc);
      if (journalPageId) return { description: game.i18n.localize('hm.app.journal-description-placeholder'), journalPageId };
      const rawDescription = doc.system?.description?.value || game.i18n.localize('hm.app.no-description');
      let enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(rawDescription, { async: true });
      enrichedDescription = enrichedDescription
        .replace(/<h3/g, '<h2')
        .replace(/<\/h3/g, '</h2')
        .replace(/<\/ h3/g, '</ h2');
      return { description: rawDescription, enrichedDescription: enrichedDescription };
    } catch (error) {
      log(1, `Error generating description for ${doc?.name}:`, error);
      const rawDescription = doc.system?.description?.value || game.i18n.localize('hm.app.no-description');
      return { description: rawDescription };
    }
  }

  /**
   * Gets the top-level folder name from a pack's folder hierarchy
   * @param {object} pack - Pack to analyze
   * @returns {string|null} Top-level folder name or null if no folder
   * @private
   */
  static #getPackTopLevelFolderName(pack) {
    if (!pack || !pack.folder) return null;
    let topLevelFolder;
    if (pack.folder.depth !== 1) {
      const parentFolders = pack.folder.getParentFolders();
      topLevelFolder = parentFolders.at(-1)?.name;
    } else {
      topLevelFolder = pack.folder.name;
    }
    return topLevelFolder || null;
  }

  /**
   * Determines the best organization name for a document based on its pack's folder structure
   * @param {object} docData - Document data object
   * @param {object} pack - The pack this document comes from
   * @returns {string} Organization name to use
   * @private
   */
  static #determineOrganizationName(docData, pack) {
    const packTopLevelFolder = this.#getPackTopLevelFolderName(pack);
    if (packTopLevelFolder) return this.#translateSystemFolderName(packTopLevelFolder);
    return this.#translateSystemFolderName(docData.packName, pack.metadata.id);
  }

  /**
   * Translates system folder names and pack names to more user-friendly names
   * @param {string} name - Folder name or pack label to translate
   * @param {string} [id] - Optional pack ID for additional context
   * @returns {string} Translated name
   * @private
   */
  static #translateSystemFolderName(name, id = null) {
    if (!name || typeof name !== 'string') return id || 'Unknown Source';
    const nameTranslations = {
      'D&D Legacy Content': 'SRD 5.1',
      'D&D Modern Content': 'SRD 5.2',
      Forge: () => game.i18n.localize('hm.app.document-service.common-labels.forge'),
      DDB: () => game.i18n.localize('hm.app.document-service.common-labels.dndbeyond-importer'),
      Elkan: () => {
        if (!game.modules.get('elkan5e')?.active) return null;
        return game.i18n.localize('hm.app.document-service.common-labels.elkan5e');
      }
    };
    if (nameTranslations[name]) {
      const result = typeof nameTranslations[name] === 'function' ? nameTranslations[name]() : nameTranslations[name];
      if (result) return result;
    }
    for (const [key, value] of Object.entries(nameTranslations)) {
      if (['D&D Legacy Content', 'D&D Modern Content'].includes(key)) continue;
      const matchesName = name.includes(key);
      const matchesId = key === 'Forge' && id?.includes(key);
      if (matchesName || matchesId) {
        const result = typeof value === 'function' ? value() : value;
        if (result) return result;
      }
    }
    if (/[./_-]home[\s_-]?brew[./_-]/i.test(name)) return game.i18n.localize('hm.app.document-service.common-labels.homebrew');
    return name;
  }

  /**
   * Organizes documents into groups based on pack top-level folder
   * @param {Array} documents - Documents (or index entries) to organize
   * @returns {Array} Grouped documents
   * @private
   */
  static #organizeDocumentsByTopLevelFolder(documents) {
    if (!documents?.length) return [];
    const organizationGroups = new Map();
    for (const docData of documents) {
      if (!docData || !docData.uuid || !docData.name) continue;
      const pack = game.packs.get(docData.packId);
      if (!pack) continue;
      const organizationName = this.#determineOrganizationName(docData, pack);
      if (!organizationGroups.has(organizationName)) organizationGroups.set(organizationName, { folderName: organizationName, docs: [] });
      organizationGroups.get(organizationName).docs.push({
        id: docData.id,
        name: docData.name,
        displayName: docData.name,
        img: docData.img,
        packName: docData.packName,
        packId: docData.packId,
        journalPageId: docData.journalPageId,
        uuid: docData.uuid,
        description: docData.description,
        enrichedDescription: docData.enrichedDescription,
        folderName: docData.folderName,
        packTopLevelFolder: this.#getPackTopLevelFolderName(pack)
      });
    }
    for (const group of organizationGroups.values()) group.docs.sort((a, b) => a.name.localeCompare(b.name));
    return Array.from(organizationGroups.values()).sort((a, b) => a.folderName.localeCompare(b.folderName));
  }
}
