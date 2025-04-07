import { HM } from './index.js';

/**
 * Service for managing game document preparation and processing
 * @class
 */
export class DocumentService {
  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Fetches and prepares documents based on the specified type for dropdown use
   * @param {'race'|'class'|'background'|'species'} type - Document type to register
   * @returns {Promise<{types: Array, dropdownHtml: string}>}
   * @static
   */
  static async prepareDocumentsByType(type) {
    try {
      // Validate input type
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

      // Process the documents based on type
      const result = type === 'race' || type === 'species' ? this.#organizeRacesByTypeIdentifier(data.documents) : this.#getFlatDocuments(data.documents);

      /**
       * A hook event that fires after documents have been fetched and organized.
       * This allows modules to filter or modify the documents that will be displayed.
       *
       * @event heroMancer.documentsReady
       * @param {string} type - The document type being prepared
       * @param {Array} result - The processed document array
       * @param {Promise[]} promises - An array of Promises to await before continuing
       */
      const promises = [];
      Hooks.callAll('heroMancer.documentsReady', type, result, promises);
      await Promise.all(promises);

      return result;
    } catch (error) {
      HM.log(1, `Error preparing documents of type ${type}:`, error);
      ui.notifications.error(
        game.i18n.format('hm.errors.document-preparation-failed', {
          type: type,
          error: error.message
        })
      );
      return { types: [], dropdownHtml: '' };
    }
  }

  /* -------------------------------------------- */
  /*  Static Private Methods                      */
  /* -------------------------------------------- */

  /**
   * Organizes races into groups based on their type identifier
   * @param {Array} documents - Race documents to organize
   * @returns {Array} Grouped race documents
   * @private
   */
  static #organizeRacesByTypeIdentifier(documents) {
    if (!documents?.length) {
      HM.log(2, 'Invalid or empty documents array for race organization');
      return [];
    }

    try {
      // Organize races into type groups
      const typeGroups = new Map();

      // First pass: create groups and assign documents
      for (const doc of documents) {
        const typeId = this.#extractRaceTypeIdentifier(doc);
        const typeName = this.#formatRaceTypeIdentifier(typeId);

        // Create group if it doesn't exist yet
        if (!typeGroups.has(typeName)) {
          typeGroups.set(typeName, {
            folderName: typeName,
            docs: []
          });
        }

        // Add document to its group
        typeGroups.get(typeName).docs.push({
          id: doc.id,
          name: doc.name,
          packName: doc.packName,
          packId: doc.packId,
          journalPageId: doc.journalPageId,
          uuid: doc.uuid,
          description: doc.system?.description?.value || game.i18n.localize('hm.app.no-description')
        });
      }

      // Second pass: sort documents within each group
      for (const group of typeGroups.values()) {
        group.docs.sort((a, b) => a.name.localeCompare(b.name));
      }

      // Convert map to sorted array
      return Array.from(typeGroups.values()).sort((a, b) => a.folderName.localeCompare(b.folderName));
    } catch (error) {
      HM.log(1, 'Error organizing races by type:', error);
      return [];
    }
  }

  /**
   * Formats race type identifier into proper display name
   * @param {string} identifier - Race type identifier
   * @returns {string} Formatted display name
   * @private
   */
  static #formatRaceTypeIdentifier(identifier) {
    // Input validation
    if (!identifier || typeof identifier !== 'string') {
      return 'Other';
    }

    try {
      return identifier
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    } catch (error) {
      HM.log(2, `Error formatting race type identifier "${identifier}":`, error);
      return 'Other';
    }
  }

  /**
   * Extracts race type identifier from document
   * @param {Object} doc - Document to extract type from
   * @returns {string} Type identifier
   * @private
   */
  static #extractRaceTypeIdentifier(doc) {
    if (!doc?.system) {
      return 'other';
    }

    const possiblePaths = [doc.system?.type?.subtype, doc.system?.type?.value, doc.system?.traits?.type?.value, doc.system?.details?.race, doc.system?.details?.species];

    // Return the first non-empty value, or 'other' if none found
    return possiblePaths.find((path) => path) || 'other';
  }

  /**
   * Gets flat list of documents with minimal processing
   * @param {Array} documents - Documents to process
   * @returns {Array} Processed documents
   * @private
   */
  static #getFlatDocuments(documents) {
    if (!documents?.length) {
      return [];
    }

    try {
      return documents
        .map((doc) => ({
          id: doc.id,
          name: `${doc.name} (${doc.packName || 'Unknown'})`,
          description: doc.description,
          journalPageId: doc.journalPageId,
          packName: doc.packName,
          packId: doc.packId,
          uuid: doc.uuid
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      HM.log(1, 'Error processing flat documents:', error);
      return [];
    }
  }

  /**
   * Fetches documents from compendiums based on type
   * @param {'race'|'class'|'background'|'species'} type - Document type
   * @returns {Promise<{documents: Array}>} Array of processed documents
   * @private
   */
  static async #fetchTypeDocumentsFromCompendiums(type) {
    // Validate type for safety
    if (!['race', 'class', 'background', 'species'].includes(type)) {
      throw new Error(`Invalid document type: ${type}`);
    }

    // Get user-selected packs or fall back to all item packs
    const selectedPacks = game.settings.get(HM.ID, `${type}Packs`) || [];
    let packs = this.#getValidPacks(selectedPacks, type);

    if (!packs.length) {
      HM.log(2, `No valid packs found for type ${type}`);
      ui.notifications.warn(game.i18n.format('hm.warnings.no-packs-found', { type: type }));
      return { documents: [] };
    }

    // Process packs to extract documents
    const results = await this.#processAllPacks(packs, type);

    return {
      documents: this.#sortDocumentsByNameAndPack(results.validPacks)
    };
  }

  /**
   * Get valid packs based on user selection or defaults
   * @param {string[]} selectedPacks - User-selected pack IDs
   * @param {string} type - Document type
   * @returns {CompendiumCollection[]} - Array of valid packs
   * @private
   */
  static #getValidPacks(selectedPacks, type) {
    try {
      // If user selected specific packs, filter to those
      if (selectedPacks.length > 0) {
        return game.packs.filter((pack) => selectedPacks.includes(pack.metadata.id));
      }

      // Otherwise, use all Item packs as fallback
      return game.packs.filter((pack) => pack.metadata.type === 'Item');
    } catch (error) {
      HM.log(1, `Error filtering packs for type ${type}:`, error);
      return [];
    }
  }

  /**
   * Process all packs to extract documents of specified type
   * @param {CompendiumCollection[]} packs - Packs to process
   * @param {string} type - Document type to filter
   * @returns {Promise<{validPacks: Array, failedPacks: Array, processingErrors: Array}>}
   * @private
   */
  static async #processAllPacks(packs, type) {
    const validPacks = [];
    const failedPacks = [];
    const processingErrors = [];

    // Process each pack sequentially for better control
    for (const pack of packs) {
      if (!pack?.metadata) {
        HM.log(2, 'Invalid pack encountered during processing');
        continue;
      }

      try {
        // Track fetch start time for performance monitoring
        const startTime = performance.now();
        const documents = await pack.getDocuments({ type });
        const endTime = performance.now();

        if (endTime - startTime > 1000) {
          HM.log(2, `Pack retrieval slow for ${pack.metadata.label}: ${Math.round(endTime - startTime)}ms`);
        }

        if (!documents?.length) {
          HM.log(3, `No documents of type ${type} found in ${pack.metadata.label}`);
          continue;
        }

        // Process all documents in this pack
        const packDocuments = await this.#processPackDocuments(pack, documents);
        validPacks.push(...packDocuments.filter(Boolean));
      } catch (error) {
        HM.log(1, `Failed to retrieve documents from pack ${pack.metadata.label}:`, error);
        processingErrors.push(error.message);
        failedPacks.push(pack.metadata.label);
      }
    }

    // Report errors if any packs failed
    this.#reportPackProcessingErrors(failedPacks, processingErrors);

    return { validPacks, failedPacks, processingErrors };
  }

  /**
   * Process documents from a single pack
   * @param {CompendiumCollection} pack - The pack being processed
   * @param {Document[]} documents - Documents to process
   * @returns {Promise<Array>} Processed documents
   * @private
   */
  static async #processPackDocuments(pack, documents) {
    // Process all documents in this pack with Promise.all
    return await Promise.all(
      documents.map(async (doc) => {
        if (!doc) return null;

        const packName = this.#determinePackName(pack.metadata.label, pack.metadata.id);
        const { description, journalPageId } = await this.#findDescription(doc);

        return {
          doc,
          packName,
          uuid: doc.uuid,
          packId: pack.metadata.id,
          description,
          journalPageId,
          folderName: doc.folder?.name || null,
          system: doc.system
        };
      })
    );
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

    ui.notifications.error(
      game.i18n.format('hm.errors.failed-compendium-retrieval', {
        type: failedPacks.join(', '),
        details: errorDetails
      })
    );

    HM.log(1, 'Failed pack retrieval details:', {
      failedPacks,
      processingErrors
    });
  }

  /**
   * Determines pack name based on id/label
   * @param {string} label - Pack label
   * @param {string} id - Pack id
   * @returns {string} Formatted pack name
   * @private
   */
  static #determinePackName(label, id) {
    if (!label || typeof label !== 'string') {
      return id || 'Unknown Pack';
    }

    // Use a mapping object for a more maintainable approach
    const packNameMap = {
      PHB: 'hm.app.document-service.phb',
      SRD: 'hm.app.document-service.srd',
      Forge: 'hm.app.document-service.forge',
      DDB: 'hm.app.document-service.dndbeyond-importer',
      Elkan: 'hm.app.document-service.elkan5e'
    };

    // Check for matches in the mapping object
    for (const [key, localizationKey] of Object.entries(packNameMap)) {
      // Special case for Forge which might be in the ID instead of label
      if ((key === 'Forge' && id?.includes(key)) || label.includes(key)) {
        // Extra check for Elkan5e module
        if (key === 'Elkan' && !game.modules.get('elkan5e')?.active) {
          continue;
        }
        return game.i18n.localize(localizationKey);
      }
    }

    // Special case for homebrew
    if (/[./_-]home[\s_-]?brew[./_-]/i.test(label)) {
      return game.i18n.localize('hm.app.document-service.homebrew');
    }

    return label;
  }

  /**
   * Sorts document array by name and pack
   * @param {Array} documents - Documents to sort
   * @returns {Array} Sorted documents
   * @private
   */
  static #sortDocumentsByNameAndPack(documents) {
    if (!documents?.length) {
      return [];
    }

    try {
      return documents
        .map(({ doc, packName, packId, description, journalPageId, folderName, uuid, system }) => ({
          id: doc.id,
          name: doc.name,
          description,
          journalPageId,
          folderName,
          packName,
          packId,
          uuid,
          system
        }))
        .sort((a, b) => {
          // Sort by name first, then by pack name if names are identical
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
   * @param {Object} doc - The document to find a description for
   * @returns {Promise<{description: string, journalPageId?: string}>} Description and optional journal page ID
   * @private
   */
  static async #findDescription(doc) {
    if (!doc) {
      return {
        description: game.i18n.localize('hm.app.no-description')
      };
    }

    try {
      // First check if there's a journal page we can use
      const journalPageId = await this.#findRelatedJournalPage(doc);

      // If we found a journal page, return its ID
      if (journalPageId) {
        return {
          description: game.i18n.localize('hm.app.journal-description-placeholder'),
          journalPageId
        };
      }

      // Fall back to the basic description from the document
      return {
        description: doc.system?.description?.value || game.i18n.localize('hm.app.no-description')
      };
    } catch (error) {
      HM.log(1, `Error generating description for ${doc?.name}:`, error);

      // Return basic description even on error
      return {
        description: doc.system?.description?.value || game.i18n.localize('hm.app.no-description')
      };
    }
  }

  /**
   * Finds a journal page related to the document
   * @param {Object} doc - The document to find a journal page for
   * @returns {Promise<string|null>} Journal page ID or null if none found
   * @private
   */
  static async #findRelatedJournalPage(doc) {
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
    const baseRaceName = this.#getBaseRaceName(itemName);
    const modulePrefix = this.#extractModulePrefixFromUuid(itemUuid);

    // Prioritize and filter packs for more efficient searching
    const prioritizedPacks = this.#prioritizeJournalPacks(packs, modulePrefix);

    // Track performance for heavy operations
    const startTime = performance.now();

    try {
      // Search through each pack until a match is found
      for (const pack of prioritizedPacks) {
        const result = await this.#searchSingleCompendium(pack, normalizedItemName, baseRaceName);
        if (result) {
          const searchTime = Math.round(performance.now() - startTime);
          if (searchTime > 3500) {
            HM.log(2, `Journal search for "${itemName}" took ${searchTime}ms`);
          }
          return result;
        }
      }

      HM.log(3, `No matching journal page found for ${itemType} "${itemName}" after searching all packs`);
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

    const uuidMatch = itemUuid.match(/^Compendium\.([^.]+)\./);
    return uuidMatch && uuidMatch[1] ? uuidMatch[1] : null;
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
      await pack.getIndex();

      for (const entry of pack.index) {
        // Skip art handouts
        if (this.#isArtHandout(entry.name)) continue;

        const journal = await pack.getDocument(entry._id);
        if (!journal?.pages?.size) continue;

        // First try exact name match
        const exactMatch = journal.pages.find((p) => p.name.toLowerCase() === normalizedItemName);

        if (exactMatch) {
          HM.log(3, `Found exact match page "${exactMatch.name}" in journal "${journal.name}"`);
          return `${pack.collection}.${journal.id}.JournalEntryPage.${exactMatch.id}`;
        }

        // If this is a special race, try matching the base race name
        if (baseRaceName) {
          const baseMatch = journal.pages.find((p) => p.name.toLowerCase() === baseRaceName.toLowerCase());

          if (baseMatch) {
            HM.log(3, `Found base race match page "${baseMatch.name}" in journal "${journal.name}"`);
            return `${pack.collection}.${journal.id}.JournalEntryPage.${baseMatch.id}`;
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
  static #getBaseRaceName(raceName) {
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
