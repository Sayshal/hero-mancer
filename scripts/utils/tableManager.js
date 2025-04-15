import { HM } from './index.js';

/**
 * Manages RollTable interactions for character backgrounds and characteristics.
 * @class
 */
export class TableManager {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  static currentTables = new Map();

  static tableTypes = ['Personality Traits', 'Ideals', 'Bonds', 'Flaws'];

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Loads and initializes roll tables for a selected background
   * @param {object} background - Background document
   * @returns {Promise<boolean>} Success status
   * @static
   */
  static async loadRollTablesForBackground(background) {
    if (!background) {
      HM.log(2, 'No background provided for table initialization');
      TableManager.updateRollButtonsAvailability(null);
      return false;
    }

    HM.log(3, `Loading tables for background: ${background.name} (${background.id})`);
    this.currentTables.delete(background.id);

    try {
      // Validate background has required properties
      if (!background.system?.description?.value) {
        HM.log(2, 'Background document missing required properties');
        TableManager.updateRollButtonsAvailability(null);
        return false;
      }

      const description = background.system.description.value;
      const tableMatches = this.#findTableUuidsInDescription(description);

      if (!tableMatches.length) {
        HM.log(2, 'No RollTable UUIDs found in background description, hiding UI elements.');
        TableManager.updateRollButtonsAvailability(null);
        return false;
      }

      const tableResults = await this.#loadAndResetTables(tableMatches);
      if (!tableResults.tables.length) {
        HM.log(2, 'No valid tables were loaded');
        TableManager.updateRollButtonsAvailability(null);
        return false;
      }

      // Store valid tables
      this.currentTables.set(background.id, tableResults.tables);

      // Update UI based on which table types were found
      TableManager.updateRollButtonsAvailability(tableResults.foundTableTypes);
      return true;
    } catch (error) {
      HM.log(1, 'Error initializing tables for background:', error);
      TableManager.updateRollButtonsAvailability(null);
      return false;
    }
  }

  /**
   * Find table UUIDs in a description string
   * @param {string} description - The background description text
   * @returns {Array} Array of UUID matches
   * @private
   * @static
   */
  static #findTableUuidsInDescription(description) {
    try {
      const uuidPattern = /@UUID\[Compendium\.(.*?)\.(.*?)\.RollTable\.(.*?)]/g;
      return [...description.matchAll(uuidPattern)];
    } catch (error) {
      HM.log(1, 'Error parsing description for table UUIDs:', error);
      return [];
    }
  }

  /**
   * Load and reset tables based on matched UUIDs
   * @param {Array} matches - Array of UUID regex matches
   * @returns {Promise<Object>} Object containing tables and types
   * @private
   * @static
   */
  static async #loadAndResetTables(matches) {
    const foundTableTypes = new Set();

    try {
      // Load each table in parallel
      const loadPromises = matches.map((match) => this.#loadSingleTable(match, foundTableTypes));
      const tables = await Promise.all(loadPromises);

      // Filter out failed loads
      const validTables = tables.filter((table) => table !== null);

      if (validTables.length) {
        // Reset all tables in parallel
        await this.#resetTablesInParallel(validTables);
      }

      return { tables: validTables, foundTableTypes };
    } catch (error) {
      HM.log(1, 'Error in table loading process:', error);
      return { tables: [], foundTableTypes };
    }
  }

  /**
   * Load a single table from a UUID match
   * @param {Array} match - Regex match containing UUID parts
   * @param {Set} foundTableTypes - Set to populate with found table types
   * @returns {Promise<Object|null>} The loaded table or null
   * @private
   * @static
   */
  static async #loadSingleTable(match, foundTableTypes) {
    try {
      const uuid = `Compendium.${match[1]}.${match[2]}.RollTable.${match[3]}`;
      const table = await fromUuid(uuid);

      if (!table) {
        HM.log(2, `Could not load table with UUID: ${uuid}`);
        return null;
      }

      // Check table type based on name
      const tableName = table.name.toLowerCase();
      this.tableTypes.forEach((type) => {
        if (tableName.includes(type.toLowerCase()) || (type === 'Personality Traits' && tableName.includes('personality'))) {
          foundTableTypes.add(type);
        }
      });

      return table;
    } catch (error) {
      HM.log(1, 'Error loading table from match:', error);
      return null;
    }
  }

  /**
   * Reset all tables in parallel
   * @param {Array} tables - Array of tables to reset
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #resetTablesInParallel(tables) {
    try {
      const resetPromises = tables.map(async (table) => {
        try {
          await table.resetResults();
        } catch (error) {
          HM.log(1, `Error resetting table ${table.id}:`, error);
          // Continue with other tables even if one fails
        }
      });

      await Promise.all(resetPromises);
    } catch (error) {
      HM.log(1, 'Error in parallel table reset:', error);
    }
  }

  /**
   * Updates roll button availability based on found table types
   * @param {Set<string>|null} foundTableTypes - Set of found table types or null if none
   * @static
   */
  static updateRollButtonsAvailability(foundTableTypes) {
    // Create mapping of localized table types to field names
    const typeToFieldMap = {
      [game.i18n.localize('DND5E.PersonalityTraits')]: 'traits',
      [game.i18n.localize('DND5E.Ideals')]: 'ideals',
      [game.i18n.localize('DND5E.Bonds')]: 'bonds',
      [game.i18n.localize('DND5E.Flaws')]: 'flaws'
    };

    // Collect all DOM updates to apply at once
    const domUpdates = {};

    // Pre-process all updates
    Object.entries(typeToFieldMap).forEach(([tableType, fieldName]) => {
      const hasTable = foundTableTypes?.has(tableType);
      const newPlaceholder = game.i18n.localize(hasTable ? `hm.app.biography.${fieldName}-placeholder` : `hm.app.biography.${fieldName}-placeholder-alt`);
      const newDisplay = hasTable ? 'block' : 'none';

      // Store updates to apply as a batch
      if (!domUpdates[fieldName]) domUpdates[fieldName] = {};
      domUpdates[fieldName].placeholder = newPlaceholder;
      domUpdates[fieldName].display = newDisplay;
    });

    // Apply all updates in a single animation frame
    requestAnimationFrame(() => {
      try {
        Object.entries(domUpdates).forEach(([fieldName, updates]) => {
          const container = document.querySelector(`.personality-group textarea[name="${fieldName}"]`);
          const rollButton = document.querySelector(`.personality-group button[data-table="${fieldName}"]`);

          if (container) {
            container.placeholder = updates.placeholder;
          }

          if (rollButton) {
            rollButton.style.display = updates.display;
          }
        });
      } catch (error) {
        HM.log(1, 'Error updating roll button availability:', error);
      }
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
    if (!backgroundId || !characteristicType) {
      HM.log(2, 'Missing required parameters for table roll');
      return null;
    }

    const tables = this.currentTables.get(backgroundId);
    if (!tables || !tables.length) {
      HM.log(2, `No tables found for background ID: ${backgroundId}`);
      return null;
    }

    try {
      // Find matching table
      const matchingTable = this.#findMatchingTable(tables, characteristicType);
      if (!matchingTable.table) {
        HM.log(2, `No matching table found for type: ${characteristicType}`);
        return null;
      }

      // Check for available results
      const availableResults = this.#getAvailableTableResults(matchingTable.table);
      if (availableResults.length === 0) {
        HM.log(2, `All results have been drawn from table: ${matchingTable.table.name}`);
        return null;
      }

      // Draw from the table and await the result
      const resultText = await this.#drawFromTable(matchingTable.table);
      return resultText;
    } catch (error) {
      HM.log(1, 'Error rolling on background characteristic table:', error);
      return null;
    }
  }

  /**
   * Find a matching table for the given characteristic type
   * @param {Array} tables - Array of tables to search
   * @param {string} characteristicType - Type of characteristic to match
   * @returns {Object} Object containing table and match info
   * @private
   * @static
   */
  static #findMatchingTable(tables, characteristicType) {
    const searchTerm = characteristicType.toLowerCase();

    for (const table of tables) {
      const tableName = table.name.toLowerCase();
      const isMatch = tableName.includes(searchTerm) || (searchTerm === 'traits' && tableName.includes('personality'));

      HM.log(3, `Checking table match: "${table.name}" for type "${characteristicType}" - Match: ${isMatch}`);

      if (isMatch) {
        return { table, isMatch };
      }
    }

    return { table: null, isMatch: false };
  }

  /**
   * Get available (undrawn) results from a table
   * @param {Object} table - The table to check
   * @returns {Array} Array of available results
   * @private
   * @static
   */
  static #getAvailableTableResults(table) {
    if (!table?.results) {
      return [];
    }

    return table.results.filter((r) => !r.drawn);
  }

  /**
   * Draw a result from a table
   * @param {Object} table - The table to draw from
   * @returns {Promise<string|null>} The drawn result text or null
   * @private
   * @static
   */
  static async #drawFromTable(table) {
    HM.log(3, `Drawing from table: ${table.name}`);

    try {
      // Set replacement to false to prevent duplicates
      const drawOptions = {
        displayChat: false,
        replacement: false
      };

      const result = await table.draw(drawOptions);
      HM.log(3, 'Draw result object:', result);

      if (!result.results || !result.results.length) {
        HM.log(2, 'Table draw returned no results');
        return null;
      }

      // Mark the result as drawn
      await table.updateEmbeddedDocuments('TableResult', [
        {
          _id: result.results[0].id,
          drawn: true
        }
      ]);

      // Return the actual text, not a Promise
      let resultText = result.results[0]?.text || null;
      HM.log(3, 'Resulting text:', resultText);
      return resultText;
    } catch (error) {
      HM.log(1, `Error drawing from table ${table.name}:`, error);
      return null;
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
    // Validate input parameters
    if (!backgroundId || !characteristicType) {
      HM.log(2, 'Missing required parameters for table check');
      return true; // Treat invalid input as "all drawn" to prevent further actions
    }

    // Get tables for the background
    const tables = this.currentTables.get(backgroundId);
    if (!tables || !tables.length) {
      return true; // No tables means no results available
    }

    try {
      // Find matching table
      const matchingTable = this.#findMatchingTable(tables, characteristicType);
      if (!matchingTable.table) {
        return true; // No matching table means no results available
      }

      // Check if there are any undrawn results left
      const availableResults = this.#getAvailableTableResults(matchingTable.table);
      return availableResults.length === 0;
    } catch (error) {
      HM.log(1, 'Error checking if all table results are drawn:', error);
      return true; // On error, assume all drawn to prevent problematic actions
    }
  }
}
