import { HM, JournalPageFinder } from './index.js';

/**
 * Service for managing game document preparation and processing
 * @class
 */
export class DocumentService {
  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Loads and initializes all document types required for Hero Mancer
   * @returns {Promise<void>}
   * @static
   */
  static async loadAndInitializeDocuments() {
    try {
      HM.log(3, 'Starting document initialization');
      const startTime = performance.now();

      // Initialize HM.documents if it doesn't exist
      if (!HM.documents) {
        HM.documents = {};
      }

      // Load all document types in parallel
      const [raceResults, classResults, backgroundResults] = await Promise.allSettled([
        this.#fetchTypeDocumentsFromCompendiums('race'),
        this.#fetchTypeDocumentsFromCompendiums('class'),
        this.#fetchTypeDocumentsFromCompendiums('background')
      ]);

      // Process race documents
      if (raceResults.status === 'fulfilled') {
        HM.documents.race = this.#organizeDocumentsByTopLevelFolder(raceResults.value.documents, 'race');
        HM.log(3, `Loaded ${HM.documents.race.reduce((total, group) => total + group.docs.length, 0)} race documents in ${HM.documents.race.length} groups`);
      } else {
        HM.log(1, 'Failed to load race documents:', raceResults.reason);
        HM.documents.race = [];
      }

      // Process class documents
      if (classResults.status === 'fulfilled') {
        HM.documents.class = this.#organizeDocumentsByTopLevelFolder(classResults.value.documents, 'class');
        HM.log(3, `Loaded ${HM.documents.class.reduce((total, group) => total + group.docs.length, 0)} class documents in ${HM.documents.class.length} groups`);
      } else {
        HM.log(1, 'Failed to load class documents:', classResults.reason);
        HM.documents.class = [];
      }

      // Process background documents
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
      const result = type === 'race' || type === 'species' ? this.#organizeRacesByFolderName(data.documents) : this.#getFlatDocuments(data.documents);

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
      // Check if we should hide compendium sources
      const hideCompendiumSource = game.settings.get(HM.ID, 'hideCompendiumSource');

      return documents
        .map((doc) => {
          // Prepare the display name based on the setting
          const displayName = hideCompendiumSource ? doc.name : `${doc.name} (${doc.packName || 'Unknown'})`;

          return {
            id: doc.id,
            name: displayName,
            // Keep the original name for sorting purposes
            sortName: `${doc.name} (${doc.packName || 'Unknown'})`,
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
   * Organizes classes into groups based on their top-level folder name or source
   * @param {Array} documents - Class documents to organize
   * @returns {Array} Grouped class documents
   * @private
   */
  static #organizeClassesByTopLevelFolder(documents) {
    return this.#organizeDocumentsByTopLevelFolder(documents, 'class');
  }

  /**
   * Organizes backgrounds into groups based on their top-level folder name or source
   * @param {Array} documents - Background documents to organize
   * @returns {Array} Grouped background documents
   * @private
   */
  static #organizeBackgroundsByTopLevelFolder(documents) {
    return this.#organizeDocumentsByTopLevelFolder(documents, 'background');
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
      // If user selected specific packs, validate and filter them
      if (selectedPacks.length > 0) {
        const validPacks = [];
        const invalidPackIds = [];

        // Check each selected pack to see if it exists and is available
        for (const packId of selectedPacks) {
          const pack = game.packs.get(packId);
          if (pack && pack.metadata.type === 'Item') {
            validPacks.push(pack);
          } else {
            invalidPackIds.push(packId);
            HM.log(2, `Pack ${packId} is either missing or not an Item pack. It will be skipped.`);
          }
        }

        // If we found invalid packs, update the settings to remove them
        if (invalidPackIds.length > 0) {
          const updatedPacks = selectedPacks.filter((id) => !invalidPackIds.includes(id));
          HM.log(2, `Removing ${invalidPackIds.length} invalid packs from ${type}Packs setting.`);

          // Update the setting (wrapped in try/catch as this might fail if user lacks permissions)
          try {
            game.settings.set(HM.ID, `${type}Packs`, updatedPacks);
          } catch (e) {
            HM.log(1, `Failed to update ${type}Packs setting: ${e.message}`);
          }
        }

        // If we have valid packs, return them
        if (validPacks.length > 0) {
          return validPacks;
        }

        // Otherwise log a warning that we're using fallback
        HM.log(2, `No valid packs found in ${type}Packs settings. Falling back to all available Item packs.`);
      }

      // Fall back to all Item packs if no valid selected packs
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

        const packName = this.#translateSystemFolderName(pack.metadata.label, pack.metadata.id);
        const { description, enrichedDescription, journalPageId } = await this.#findDescription(doc);

        return {
          doc,
          packName,
          uuid: doc.uuid,
          packId: pack.metadata.id,
          description,
          enrichedDescription,
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
        .map(({ doc, packName, packId, description, enrichedDescription, journalPageId, folderName, uuid, system }) => ({
          doc: doc,
          id: doc.id,
          name: doc.name,
          description,
          enrichedDescription,
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
    if (!doc) return;

    try {
      // Use JournalPageFinder from descriptionBuilder.js to find a journal page
      const journalPageId = await JournalPageFinder.findRelatedJournalPage(doc);

      // If we found a journal page, return its ID
      if (journalPageId) {
        return {
          description: game.i18n.localize('hm.app.journal-description-placeholder'),
          journalPageId
        };
      }

      // Get the raw description
      const rawDescription = doc.system?.description?.value || game.i18n.localize('hm.app.no-description');

      // Enrich the description HTML
      let enrichedDescription = await TextEditor.enrichHTML(rawDescription, { async: true });

      // Apply the h3->h2 transformations
      enrichedDescription = enrichedDescription
        .replace(/<h3/g, '<h2')
        .replace(/<\/h3/g, '</h2')
        .replace(/<\/ h3/g, '</ h2');

      // Return both raw and enriched descriptions
      return {
        description: rawDescription,
        enrichedDescription: enrichedDescription
      };
    } catch (error) {
      HM.log(1, `Error generating description for ${doc?.name}:`, error);

      // Return basic description even on error
      const rawDescription = doc.system?.description?.value || game.i18n.localize('hm.app.no-description');
      return {
        description: rawDescription
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
  /**
   * Gets the top-level folder name from a pack's folder hierarchy
   * @param {CompendiumCollection} pack - Pack to analyze
   * @returns {string|null} Top-level folder name or null if no folder
   * @private
   */
  static #getPackTopLevelFolderName(pack) {
    if (!pack || !pack.folder) {
      return null;
    }

    try {
      let topLevelFolder;
      if (pack.folder.depth !== 1) {
        // Get the top-most parent folder
        const parentFolders = pack.folder.getParentFolders();
        topLevelFolder = parentFolders.at(-1)?.name;
      } else {
        // This folder is already top-level
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
   * @param {CompendiumCollection} pack - The pack this document comes from
   * @returns {string} Organization name to use
   * @private
   */
  static #determineOrganizationName(docData, pack) {
    try {
      // Try pack's top-level folder first
      const packTopLevelFolder = this.#getPackTopLevelFolderName(pack);
      if (packTopLevelFolder) {
        // Translate folder name using the merged function
        const translatedName = this.#translateSystemFolderName(packTopLevelFolder);
        HM.log(3, `Using pack top-level folder "${translatedName}" for ${docData.name}`);
        return translatedName;
      }

      // Fall back to pack name if no folder structure, also using the merged function
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
    if (!name || typeof name !== 'string') {
      return id || 'Unknown Source';
    }

    // Combined mapping for all name translations with special logic
    const nameTranslations = {
      // System folder names
      'D&D Legacy Content': 'SRD 2014',
      'D&D Modern Content': 'SRD 5.1',

      // Pack name patterns with localization keys
      'Forge': () => game.i18n.localize('hm.app.document-service.common-labels.forge'),
      'DDB': () => game.i18n.localize('hm.app.document-service.common-labels.dndbeyond-importer'),
      'Elkan': () => {
        // Special check for Elkan5e module
        if (!game.modules.get('elkan5e')?.active) return null;
        return game.i18n.localize('hm.app.document-service.common-labels.elkan5e');
      }
    };

    // Check for direct matches first
    if (nameTranslations[name]) {
      const result = typeof nameTranslations[name] === 'function' ? nameTranslations[name]() : nameTranslations[name];
      if (result) return result;
    }

    // Check for partial matches in name or ID
    for (const [key, value] of Object.entries(nameTranslations)) {
      // Skip system folder names for partial matching
      if (['D&D Legacy Content', 'D&D Modern Content'].includes(key)) continue;

      // Special case for Forge which might be in the ID instead of label
      const matchesName = name.includes(key);
      const matchesId = key === 'Forge' && id?.includes(key);

      if (matchesName || matchesId) {
        const result = typeof value === 'function' ? value() : value;
        if (result) return result;
      }
    }

    // Special case for homebrew pattern
    if (/[./_-]home[\s_-]?brew[./_-]/i.test(name)) {
      return game.i18n.localize('hm.app.document-service.common-labels.homebrew');
    }

    // Return the original name if no translation found
    return name;
  }

  /**
   * Organizes documents into groups based on pack top-level folder
   * @param {Array} documents - Documents to organize
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

      // Check if we should hide compendium sources
      const hideCompendiumSource = game.settings.get(HM.ID, 'hideCompendiumSource');

      // Organize documents into groups
      const organizationGroups = new Map();

      // First pass: create groups and assign documents
      for (const docData of documents) {
        if (!docData || !docData.doc) {
          HM.log(2, `Skipping invalid document data in ${documentType} organization - missing doc property`);
          continue;
        }

        // Get the pack for this document
        const pack = game.packs.get(docData.packId);
        if (!pack) {
          HM.log(2, `Could not find pack ${docData.packId} for document ${docData.name}`);
          continue;
        }

        const organizationName = this.#determineOrganizationName(docData, pack);

        HM.log(3, `Document "${docData.name}" assigned to group "${organizationName}"`);

        // Create group if it doesn't exist yet
        if (!organizationGroups.has(organizationName)) {
          organizationGroups.set(organizationName, {
            folderName: organizationName,
            docs: []
          });
        }

        // Prepare display name based on setting
        const displayName = hideCompendiumSource ? docData.name : `${docData.name} (${docData.packName})`;

        // Add document to its group
        organizationGroups.get(organizationName).docs.push({
          id: docData.id,
          name: docData.name,
          displayName: displayName,
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

      // Second pass: sort documents within each group
      for (const group of organizationGroups.values()) {
        group.docs.sort((a, b) => a.name.localeCompare(b.name));
      }

      // Convert map to sorted array
      const result = Array.from(organizationGroups.values()).sort((a, b) => a.folderName.localeCompare(b.folderName));

      HM.log(3, `Organized ${documentType} into ${result.length} groups: ${result.map((g) => `${g.folderName} (${g.docs.length})`).join(', ')}`);

      return result;
    } catch (error) {
      HM.log(1, `Error organizing ${documentType} by pack top-level folder:`, error);
      return [];
    }
  }
}
