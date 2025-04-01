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

      let result;
      if (type === 'race' || type === 'species') {
        result = this.#organizeRacesByTypeIdentifier(data.documents);
      } else {
        result = this.#getFlatDocuments(data.documents);
      }

      /**
       * A hook event that fires after documents have been fetched and organized but before they're returned.
       * This allows modules to filter or modify the documents that will be displayed in Hero Mancer.
       *
       * @event heroMancer.documentsReady
       * @param {string} type - The document type being prepared ('race', 'class', 'background', or 'species')
       * @param {Array} result - The processed document array that will be returned and displayed
       * @param {Promise[]} promises - An array to which Promises can be pushed; Hero Mancer will await all these promises before continuing
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
    if (!doc || !doc.system) {
      return 'other';
    }

    const possiblePaths = [doc.system?.type?.subtype, doc.system?.type?.value, doc.system?.traits?.type?.value, doc.system?.details?.race, doc.system?.details?.species];

    // Return the first non-empty value, or 'other' if none found
    return possiblePaths.find((path) => path) || 'other';
  }

  /**
   * Organizes races into groups based on their type identifier
   * @param {Array} documents - Race documents to organize
   * @returns {Array} Grouped race documents
   * @private
   */
  static #organizeRacesByTypeIdentifier(documents) {
    if (!documents || !Array.isArray(documents)) {
      HM.log(2, 'Invalid documents array for race organization');
      return [];
    }

    try {
      // Create type groups
      const typeGroups = this.#createRaceTypeGroups(documents);

      // Sort documents within each group
      this.#sortRaceGroupContents(typeGroups);

      // Convert map to sorted array
      return this.#convertRaceGroupsToSortedArray(typeGroups);
    } catch (error) {
      HM.log(1, 'Error organizing races by type:', error);
      return [];
    }
  }

  /**
   * Creates a map of race type groups from documents
   * @param {Array} documents - Race documents to organize
   * @returns {Map} Map of race type groups
   * @private
   */
  static #createRaceTypeGroups(documents) {
    const typeGroups = new Map();

    documents.forEach((doc) => {
      const typeId = this.#extractRaceTypeIdentifier(doc);
      const typeName = this.#formatRaceTypeIdentifier(typeId);

      if (!typeGroups.has(typeName)) {
        typeGroups.set(typeName, {
          folderName: typeName,
          docs: []
        });
      }

      typeGroups.get(typeName).docs.push({
        id: doc.id,
        name: doc.name,
        packName: doc.packName,
        packId: doc.packId,
        uuid: doc.uuid,
        description: doc.system?.description?.value || game.i18n.localize('hm.app.no-description')
      });
    });

    return typeGroups;
  }

  /**
   * Sorts documents within each race type group
   * @param {Map} typeGroups - Map of race type groups
   * @private
   */
  static #sortRaceGroupContents(typeGroups) {
    typeGroups.forEach((group) => {
      group.docs.sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  /**
   * Converts a map of race type groups to a sorted array
   * @param {Map} typeGroups - Map of race type groups
   * @returns {Array} Sorted array of race type groups
   * @private
   */
  static #convertRaceGroupsToSortedArray(typeGroups) {
    return Array.from(typeGroups.values()).sort((a, b) => a.folderName.localeCompare(b.folderName));
  }

  /**
   * Gets flat list of documents with minimal processing
   * @param {Array} documents - Documents to process
   * @returns {Array} Processed documents
   * @private
   */
  static #getFlatDocuments(documents) {
    if (!documents || !Array.isArray(documents)) {
      return [];
    }

    try {
      return documents
        .map((doc) => ({
          id: doc.id,
          name: `${doc.name} (${doc.packName || 'Unknown'})`,
          description: doc.description,
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
   * @returns {Promise<{documents: Array}>}
   * @private
   */
  static async #fetchTypeDocumentsFromCompendiums(type) {
    // Validate type again for safety
    if (!['race', 'class', 'background', 'species'].includes(type)) {
      throw new Error(`Invalid document type: ${type}`);
    }

    const selectedPacks = game.settings.get(HM.ID, `${type}Packs`) || [];
    let packs;

    try {
      packs = selectedPacks.length > 0 ? game.packs.filter((pack) => selectedPacks.includes(pack.metadata.id)) : game.packs.filter((pack) => pack.metadata.type === 'Item');

      if (!packs.length) {
        HM.log(2, `No valid packs found for type ${type}`);
        ui.notifications.warn(
          game.i18n.format('hm.warnings.no-packs-found', {
            type: type
          })
        );
        return { documents: [] };
      }
    } catch (error) {
      HM.log(1, `Error filtering packs for type ${type}:`, error);
      return { documents: [] };
    }

    const validPacks = new Set();
    const failedPacks = [];
    const processingErrors = [];

    await Promise.all(
      packs.map(async (pack) => {
        if (!pack || !pack.metadata) {
          HM.log(2, 'Invalid pack encountered during processing');
          return;
        }

        try {
          // Track fetch start time for performance monitoring
          const startTime = performance.now();
          const documents = await pack.getDocuments({ type });
          const endTime = performance.now();

          if (endTime - startTime > 1000) {
            HM.log(2, `Pack retrieval slow for ${pack.metadata.label}: ${Math.round(endTime - startTime)}ms`);
          }

          if (!documents || !documents.length) {
            HM.log(3, `No documents of type ${type} found in ${pack.metadata.label}`);
            return;
          }

          documents.forEach((doc) => {
            if (!doc) return;

            const packName = this.#determinePackName(pack.metadata.label, pack.metadata.id);
            validPacks.add({
              doc,
              packName,
              uuid: doc.uuid,
              packId: pack.metadata.id,
              description: doc.system?.description?.value || game.i18n.localize('hm.app.no-description'),
              folderName: doc.folder?.name || null,
              system: doc.system
            });
          });
        } catch (error) {
          HM.log(1, `Failed to retrieve documents from pack ${pack.metadata.label}:`, error);
          processingErrors.push(error.message);
          failedPacks.push(pack.metadata.label);
        }
      })
    );

    // Report errors more comprehensively
    if (failedPacks.length > 0) {
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

    return {
      documents: this.#sortDocumentsByNameAndPack([...validPacks])
    };
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

    // Use a mapping object instead of if/else chain
    const packNameMap = {
      PHB: 'hm.app.document-service.phb',
      SRD: 'hm.app.document-service.srd',
      Forge: 'hm.app.document-service.forge',
      DDB: 'hm.app.document-service.dndbeyond-importer',
      Elkan: 'hm.app.document-service.elkan5e'
    };

    // Check for matches in the mapping object
    for (const [key, localizationKey] of Object.entries(packNameMap)) {
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
    if (!documents || !Array.isArray(documents)) {
      return [];
    }

    try {
      return documents
        .map(({ doc, packName, packId, description, folderName, uuid, system }) => ({
          id: doc.id,
          name: doc.name,
          description,
          folderName,
          packName,
          packId,
          uuid,
          system
        }))
        .sort((a, b) => {
          const nameCompare = a.name.localeCompare(b.name);
          return nameCompare || (a.packName || '').localeCompare(b.packName || '');
        });
    } catch (error) {
      HM.log(1, 'Error sorting documents:', error);
      return documents; // Return original unsorted array as fallback
    }
  }
}
