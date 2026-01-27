import { HM, JournalPageFinder } from './index.js';

/**
 * Service for managing game document preparation and processing
 * Uses index-first loading for performance, with lazy loading of full documents.
 * @class
 */
export class DocumentService {
  /**
   * Cache for fully loaded documents (keyed by UUID)
   * @type {Map<string, object>}
   * @private
   */
  static #documentCache = new Map();

  /**
   * Cache for enriched descriptions (keyed by UUID)
   * @type {Map<string, {description: string, enrichedDescription: string, journalPageId: string}>}
   * @private
   */
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
      HM.log(1, `Error loading document ${uuid}:`, error);
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
      HM.log(1, `Error getting description for ${uuid}:`, error);
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
    HM.log(3, 'DocumentService caches cleared');
  }

  /**
   * Loads and initializes all document types required for Hero Mancer
   * @returns {Promise<void>}
   * @static
   */
  static async loadAndInitializeDocuments() {
    try {
      HM.log(3, 'Starting document initialization');
      const startTime = performance.now();
      if (!HM.documents) HM.documents = {};
      const [raceResults, classResults, backgroundResults] = await Promise.allSettled([
        this.#fetchTypeDocumentsFromCompendiums('race'),
        this.#fetchTypeDocumentsFromCompendiums('class'),
        this.#fetchTypeDocumentsFromCompendiums('background')
      ]);
      if (raceResults.status === 'fulfilled') {
        HM.documents.race = this.#organizeDocumentsByTopLevelFolder(raceResults.value.documents, 'race');
        HM.log(3, `Loaded ${HM.documents.race.reduce((total, group) => total + group.docs.length, 0)} race documents in ${HM.documents.race.length} groups`);
      } else {
        HM.log(1, 'Failed to load race documents:', raceResults.reason);
        HM.documents.race = [];
      }
      if (classResults.status === 'fulfilled') {
        HM.documents.class = this.#organizeDocumentsByTopLevelFolder(classResults.value.documents, 'class');
        HM.log(3, `Loaded ${HM.documents.class.reduce((total, group) => total + group.docs.length, 0)} class documents in ${HM.documents.class.length} groups`);
      } else {
        HM.log(1, 'Failed to load class documents:', classResults.reason);
        HM.documents.class = [];
      }
      if (backgroundResults.status === 'fulfilled') {
        HM.documents.background = this.#organizeDocumentsByTopLevelFolder(backgroundResults.value.documents, 'background');
        HM.log(3, `Loaded ${HM.documents.background.reduce((total, group) => total + group.docs.length, 0)} background documents in ${HM.documents.background.length} groups`);
      } else {
        HM.log(1, 'Failed to load background documents:', backgroundResults.reason);
        HM.documents.background = [];
      }
      const totalTime = Math.round(performance.now() - startTime);
      HM.log(3, `Document initialization completed in ${totalTime}ms`);
    } catch (error) {
      HM.log(1, 'Critical error during document initialization:', error);
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
    try {
      if (!type || !['race', 'class', 'background', 'species'].includes(type)) {
        HM.log(2, `Invalid document type: ${type}`);
        ui.notifications.error('hm.errors.invalid-document-type', { localize: true });
        return { types: [], dropdownHtml: '' };
      }
      const data = await this.#fetchTypeDocumentsFromCompendiums(type);
      if (!data.documents || !Array.isArray(data.documents)) {
        HM.log(2, 'No documents found or invalid document data');
        return { types: [], dropdownHtml: '' };
      }
      const result = type === 'race' || type === 'species' ? this.#organizeRacesByFolderName(data.documents) : this.#getFlatDocuments(data.documents);
      const promises = [];
      Hooks.callAll('heroMancer.documentsReady', type, result, promises);
      await Promise.all(promises);
      return result;
    } catch (error) {
      HM.log(1, `Error preparing documents of type ${type}:`, error);
      ui.notifications.error(game.i18n.format('hm.errors.document-preparation-failed', { type: type, error: error.message }));
      return { types: [], dropdownHtml: '' };
    }
  }

  /* -------------------------------------------- */
  /*  Static Private Methods                      */
  /* -------------------------------------------- */

  /**
   * Gets flat list of documents with minimal processing
   * @param {Array} documents - Documents to process
   * @returns {Array} Processed documents
   * @private
   */
  static #getFlatDocuments(documents) {
    if (!documents?.length) return [];
    try {
      return documents
        .map((doc) => {
          const displayName = doc.name;
          return {
            id: doc.id,
            name: displayName,
            sortName: doc.name,
            description: doc.description,
            enrichedDescription: doc.enrichedDescription,
            journalPageId: doc.journalPageId,
            packName: doc.packName,
            packId: doc.packId,
            uuid: doc.uuid
          };
        })
        .sort((a, b) => a.sortName.localeCompare(b.sortName));
    } catch (error) {
      HM.log(1, 'Error processing flat documents:', error);
      return [];
    }
  }

  /**
   * Organizes races into groups based on their top-level folder name or source
   * @param {Array} documents - Race documents to organize
   * @returns {Array} Grouped race documents
   * @private
   */
  static #organizeRacesByFolderName(documents) {
    return this.#organizeDocumentsByTopLevelFolder(documents, 'race');
  }

  /**
   * Fetches documents from compendiums based on type
   * @param {'race'|'class'|'background'|'species'} type - Document type
   * @returns {Promise<{documents: Array}>} Array of processed documents
   * @private
   */
  static async #fetchTypeDocumentsFromCompendiums(type) {
    if (!['race', 'class', 'background', 'species'].includes(type)) throw new Error(`Invalid document type: ${type}`);
    const selectedPacks = game.settings.get(HM.ID, `${type}Packs`) || [];
    let packs = this.#getValidPacks(selectedPacks, type);
    if (!packs.length) {
      HM.log(2, `No valid packs found for type ${type}`);
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
    try {
      if (selectedPacks.length > 0) {
        const validPacks = [];
        const invalidPackIds = [];
        for (const packId of selectedPacks) {
          const pack = game.packs.get(packId);
          if (pack && pack.metadata.type === 'Item') {
            validPacks.push(pack);
          } else {
            invalidPackIds.push(packId);
            HM.log(2, `Pack ${packId} is either missing or not an Item pack. It will be skipped.`);
          }
        }
        if (invalidPackIds.length > 0) {
          const updatedPacks = selectedPacks.filter((id) => !invalidPackIds.includes(id));
          HM.log(2, `Removing ${invalidPackIds.length} invalid packs from ${type}Packs setting.`);
          try {
            game.settings.set(HM.ID, `${type}Packs`, updatedPacks);
          } catch (e) {
            HM.log(1, `Failed to update ${type}Packs setting: ${e.message}`);
          }
        }
        if (validPacks.length > 0) return validPacks;
        HM.log(2, `No valid packs found in ${type}Packs settings. Falling back to all available Item packs.`);
      }
      return game.packs.filter((pack) => pack.metadata.type === 'Item');
    } catch (error) {
      HM.log(1, `Error filtering packs for type ${type}:`, error);
      return [];
    }
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
      if (!pack?.metadata) {
        HM.log(2, 'Invalid pack encountered during processing');
        continue;
      }
      try {
        const startTime = performance.now();
        const index = await pack.getIndex({ fields: ['system.properties', 'folder'] });
        const endTime = performance.now();
        if (endTime - startTime > 500) HM.log(2, `Pack index slow for ${pack.metadata.label}: ${Math.round(endTime - startTime)}ms`);
        const typeEntries = index.filter((entry) => entry.type === type);
        if (!typeEntries.length) {
          HM.log(3, `No documents of type ${type} found in ${pack.metadata.label}`);
          continue;
        }
        const packDocuments = await this.#processPackIndexEntries(pack, typeEntries);
        validPacks.push(...packDocuments.filter(Boolean));
        HM.log(3, `Indexed ${typeEntries.length} ${type} entries from ${pack.metadata.label}`);
      } catch (error) {
        HM.log(1, `Failed to retrieve index from pack ${pack.metadata.label}:`, error);
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
    HM.log(1, 'Failed pack retrieval details:', { failedPacks, processingErrors });
  }

  /**
   * Sorts document array by name and pack
   * @param {Array} documents - Documents to sort (index entries, not full docs)
   * @returns {Array} Sorted documents
   * @private
   */
  static #sortDocumentsByNameAndPack(documents) {
    if (!documents?.length) return [];
    try {
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
    } catch (error) {
      HM.log(1, 'Error sorting documents:', error);
      return documents;
    }
  }

  /**
   * Finds and retrieves comprehensive description for a document by generating formatted content
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
      HM.log(1, `Error generating description for ${doc?.name}:`, error);
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
    try {
      let topLevelFolder;
      if (pack.folder.depth !== 1) {
        const parentFolders = pack.folder.getParentFolders();
        topLevelFolder = parentFolders.at(-1)?.name;
      } else {
        topLevelFolder = pack.folder.name;
      }
      return topLevelFolder || null;
    } catch (error) {
      HM.log(2, `Error getting pack top-level folder for ${pack.metadata.label}:`, error);
      return null;
    }
  }

  /**
   * Determines the best organization name for a document based on its pack's folder structure
   * @param {object} docData - Document data object
   * @param {object} pack - The pack this document comes from
   * @returns {string} Organization name to use
   * @private
   */
  static #determineOrganizationName(docData, pack) {
    try {
      const packTopLevelFolder = this.#getPackTopLevelFolderName(pack);
      if (packTopLevelFolder) {
        const translatedName = this.#translateSystemFolderName(packTopLevelFolder);
        HM.log(3, `Using pack top-level folder "${translatedName}" for ${docData.name}`);
        return translatedName;
      }
      const translatedPackName = this.#translateSystemFolderName(docData.packName, pack.metadata.id);
      HM.log(3, `Using translated pack name "${translatedPackName}" for ${docData.name}`);
      return translatedPackName;
    } catch (error) {
      HM.log(1, `Error determining organization name for ${docData.name || 'unknown document'}:`, error);
      return docData.packName || 'Unknown Source';
    }
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
   * @param {string} documentType - Type of documents being organized
   * @returns {Array} Grouped documents
   * @private
   */
  static #organizeDocumentsByTopLevelFolder(documents, documentType) {
    if (!documents?.length) {
      HM.log(2, `Invalid or empty documents array for ${documentType} organization`);
      return [];
    }
    try {
      HM.log(3, `Organizing ${documents.length} ${documentType} documents by pack top-level folder`);
      const organizationGroups = new Map();
      for (const docData of documents) {
        if (!docData || !docData.uuid || !docData.name) {
          HM.log(2, `Skipping invalid document data in ${documentType} organization - missing uuid or name`);
          continue;
        }
        const pack = game.packs.get(docData.packId);
        if (!pack) {
          HM.log(2, `Could not find pack ${docData.packId} for document ${docData.name}`);
          continue;
        }
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
      const result = Array.from(organizationGroups.values()).sort((a, b) => a.folderName.localeCompare(b.folderName));
      HM.log(3, `Organized ${documentType} into ${result.length} groups: ${result.map((g) => `${g.folderName} (${g.docs.length})`).join(', ')}`);
      return result;
    } catch (error) {
      HM.log(1, `Error organizing ${documentType} by pack top-level folder:`, error);
      return [];
    }
  }
}
