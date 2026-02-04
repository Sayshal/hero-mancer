import { log } from './logger.mjs';

/**
 * Manages RollTable interactions for character backgrounds and characteristics.
 * @class
 */
export class TableManager {
  static currentTables = new Map();

  static tableTypes = ['Personality Traits', 'Ideals', 'Bonds', 'Flaws'];

  /**
   * Loads and initializes roll tables for a selected background
   * @param {object} background - Background document
   * @returns {Promise<boolean>} Success status
   * @static
   */
  static async loadRollTablesForBackground(background) {
    if (!background) {
      TableManager.updateRollButtonsAvailability(null);
      return false;
    }

    this.currentTables.delete(background.id);

    if (!background.system?.description?.value) {
      TableManager.updateRollButtonsAvailability(null);
      return false;
    }

    const description = background.system.description.value;
    const tableMatches = this.#findTableUuidsInDescription(description);
    if (!tableMatches.length) {
      TableManager.updateRollButtonsAvailability(null);
      return false;
    }
    const tableResults = await this.#loadAndResetTables(tableMatches);
    if (!tableResults.tables.length) {
      TableManager.updateRollButtonsAvailability(null);
      return false;
    }
    log(3, `Loaded ${tableResults.tables.length} tables for background "${background.name}" (types: ${[...tableResults.foundTableTypes].join(', ')})`);
    this.currentTables.set(background.id, tableResults.tables);
    TableManager.updateRollButtonsAvailability(tableResults.foundTableTypes);
    return true;
  }

  /**
   * Find table UUIDs in a description string
   * @param {string} description - The background description text
   * @returns {Array} Array of UUID matches
   * @private
   * @static
   */
  static #findTableUuidsInDescription(description) {
    const uuidPattern = /@UUID\[Compendium\.(.*?)\.(.*?)\.RollTable\.(.*?)]/g;
    return [...description.matchAll(uuidPattern)];
  }

  /**
   * Load and reset tables based on matched UUIDs
   * @param {Array} matches - Array of UUID regex matches
   * @returns {Promise<object>} Object containing tables and types
   * @private
   * @static
   */
  static async #loadAndResetTables(matches) {
    const foundTableTypes = new Set();

    try {
      const loadPromises = matches.map((match) => this.#loadSingleTable(match, foundTableTypes));
      const tables = await Promise.all(loadPromises);
      const validTables = tables.filter((table) => table !== null);

      if (validTables.length) {
        await this.#resetTablesInParallel(validTables);
      }

      return { tables: validTables, foundTableTypes };
    } catch (error) {
      log(1, 'Error in table loading process:', error);
      return { tables: [], foundTableTypes };
    }
  }

  /**
   * Load a single table from a UUID match
   * @param {Array} match - Regex match containing UUID parts
   * @param {Set} foundTableTypes - Set to populate with found table types
   * @returns {Promise<object | null>} The loaded table or null
   * @private
   * @static
   */
  static async #loadSingleTable(match, foundTableTypes) {
    try {
      const uuid = `Compendium.${match[1]}.${match[2]}.RollTable.${match[3]}`;
      const table = await fromUuid(uuid);
      if (!table) return null;

      const tableName = table.name.toLowerCase();
      this.tableTypes.forEach((type) => {
        if (tableName.includes(type.toLowerCase()) || (type === 'Personality Traits' && tableName.includes('personality'))) {
          foundTableTypes.add(type);
        }
      });

      return table;
    } catch (error) {
      log(1, 'Error loading table from match:', error);
      return null;
    }
  }

  /**
   * Reset all tables in parallel with compendium unlock/lock handling
   * @param {Array} tables - Array of tables to reset
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #resetTablesInParallel(tables) {
    const lockedPacks = new Map();
    try {
      const packIds = new Set();
      tables.forEach((table) => {
        if (table?.pack) packIds.add(table.pack);
      });
      for (const packId of packIds) {
        const pack = game.packs.get(packId);
        if (pack && pack.locked) {
          lockedPacks.set(packId, true);
          await pack.configure({ locked: false });
        }
      }
      const resetPromises = tables.map(async (table) => {
        try {
          await table.resetResults();
        } catch (error) {
          log(1, `Error resetting table ${table.id}:`, error);
        }
      });
      await Promise.all(resetPromises);
    } catch (error) {
      log(1, 'Error in parallel table reset:', error);
    } finally {
      try {
        for (const [packId, wasLocked] of lockedPacks) {
          if (wasLocked) {
            const pack = game.packs.get(packId);
            if (pack && !pack.locked) {
              await pack.configure({ locked: true });
            }
          }
        }
      } catch (lockError) {
        log(1, 'Error re-locking packs:', lockError);
      }
    }
  }

  /**
   * Updates roll button availability based on found table types
   * @param {Set<string>|null} foundTableTypes - Set of found table types or null if none
   * @static
   */
  static updateRollButtonsAvailability(foundTableTypes) {
    const typeToFieldMap = {
      [game.i18n.localize('DND5E.PersonalityTraits')]: 'traits',
      [game.i18n.localize('DND5E.Ideals')]: 'ideals',
      [game.i18n.localize('DND5E.Bonds')]: 'bonds',
      [game.i18n.localize('DND5E.Flaws')]: 'flaws'
    };

    const domUpdates = {};
    Object.entries(typeToFieldMap).forEach(([tableType, fieldName]) => {
      const hasTable = foundTableTypes?.has(tableType);
      const newPlaceholder = game.i18n.localize(hasTable ? `hm.app.biography.${fieldName}-placeholder` : `hm.app.biography.${fieldName}-placeholder-alt`);
      const newDisplay = hasTable ? 'block' : 'none';
      if (!domUpdates[fieldName]) domUpdates[fieldName] = {};
      domUpdates[fieldName].placeholder = newPlaceholder;
      domUpdates[fieldName].display = newDisplay;
    });

    requestAnimationFrame(() => {
      Object.entries(domUpdates).forEach(([fieldName, updates]) => {
        const container = document.querySelector(`.personality-group textarea[name="${fieldName}"]`);
        const rollButton = document.querySelector(`.personality-group button[data-table="${fieldName}"]`);
        if (container) container.placeholder = updates.placeholder;
        if (rollButton) rollButton.style.display = updates.display;
      });
    });
  }

  /**
   * Rolls on a background characteristic table and returns result
   * @param {string} backgroundId - Background document ID
   * @param {string} characteristicType - Type of characteristic to roll for
   * @returns {Promise<string|null>} The roll result or null if unavailable
   * @static
   */
  static async rollOnBackgroundCharacteristicTable(backgroundId, characteristicType) {
    if (!backgroundId || !characteristicType) return null;

    const tables = this.currentTables.get(backgroundId);
    if (!tables || !tables.length) return null;

    const matchingTable = this.#findMatchingTable(tables, characteristicType);
    if (!matchingTable.table) return null;

    const availableResults = this.#getAvailableTableResults(matchingTable.table);
    if (availableResults.length === 0) return null;

    return this.#drawFromTable(matchingTable.table);
  }

  /**
   * Find a matching table for the given characteristic type
   * @param {Array} tables - Array of tables to search
   * @param {string} characteristicType - Type of characteristic to match
   * @returns {object} Object containing table and match info
   * @private
   * @static
   */
  static #findMatchingTable(tables, characteristicType) {
    const searchTerm = characteristicType.toLowerCase();
    for (const table of tables) {
      const tableName = table.name.toLowerCase();
      const isMatch = tableName.includes(searchTerm) || (searchTerm === 'traits' && tableName.includes('personality'));
      if (isMatch) return { table, isMatch };
    }
    return { table: null, isMatch: false };
  }

  /**
   * Get available (undrawn) results from a table
   * @param {object} table - The table to check
   * @returns {Array} Array of available results
   * @private
   * @static
   */
  static #getAvailableTableResults(table) {
    if (!table?.results) return [];
    return table.results.filter((r) => !r.drawn);
  }

  /**
   * Draw a result from a table
   * @param {object} table - The table to draw from
   * @returns {Promise<string|null>} The drawn result text or null
   * @private
   * @static
   */
  static async #drawFromTable(table) {
    let wasLocked = false;
    const pack = table.pack ? game.packs.get(table.pack) : null;

    try {
      if (pack?.locked) {
        wasLocked = true;
        await pack.configure({ locked: false });
      }

      const result = await table.draw({ displayChat: false });
      if (!result.results || !result.results.length) return null;

      await table.updateEmbeddedDocuments('TableResult', [
        {
          _id: result.results[0].id,
          drawn: true
        }
      ]);

      return result.results[0]?.description || null;
    } catch (error) {
      log(1, `Error drawing from table ${table.name}:`, error);
      return null;
    } finally {
      if (wasLocked && pack && !pack.locked) {
        try {
          await pack.configure({ locked: true });
        } catch (lockError) {
          log(1, 'Error re-locking pack:', lockError);
        }
      }
    }
  }

  /**
   * Checks if all results in a table have been drawn
   * @param {string} backgroundId - Background document ID
   * @param {string} characteristicType - Type of characteristic to check
   * @returns {boolean} True if all results are drawn
   * @static
   */
  static areAllTableResultsDrawn(backgroundId, characteristicType) {
    if (!backgroundId || !characteristicType) return true;

    const tables = this.currentTables.get(backgroundId);
    if (!tables || !tables.length) return true;

    const matchingTable = this.#findMatchingTable(tables, characteristicType);
    if (!matchingTable.table) return true;

    const availableResults = this.#getAvailableTableResults(matchingTable.table);
    return availableResults.length === 0;
  }
}
