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
   * @returns {Promise<void>}
   * @static
   */
  static async loadRollTablesForBackground(background) {
    if (!background) {
      HM.log(2, 'No background provided for table initialization');
      TableManager.updateRollButtonsAvailability(null);
      return;
    }

    HM.log(3, `Loading tables for background: ${background.name} (${background.id})`);
    this.currentTables.delete(background.id);

    try {
      const description = background.system.description.value;
      const uuidPattern = /@UUID\[Compendium\.(.*?)\.(.*?)\.RollTable\.(.*?)]/g;
      const matches = [...description.matchAll(uuidPattern)];

      if (!matches.length) {
        HM.log(2, 'No RollTable UUIDs found in background description, hiding UI elements.');
        TableManager.updateRollButtonsAvailability(null);
        return;
      }

      // Load each table and track which types we found
      const foundTableTypes = new Set();
      const tables = await Promise.all(
        matches.map(async (match) => {
          const uuid = `Compendium.${match[1]}.${match[2]}.RollTable.${match[3]}`;
          try {
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
            HM.log(1, `Error loading table with UUID ${uuid}:`, error);
            return null;
          }
        })
      );
      HM.log(3, 'Loaded tables:', { tables });

      const validTables = tables.filter((table) => table !== null);
      if (validTables.length) {
        // Process all table resets in parallel
        await Promise.all(
          validTables.map(async (table) => {
            try {
              await table.resetResults();
            } catch (error) {
              HM.log(1, `Error resetting table ${table.id}:`, error);
            }
          })
        );

        this.currentTables.set(background.id, validTables);
      }

      // Update UI based on which table types were found
      TableManager.updateRollButtonsAvailability(foundTableTypes);
    } catch (error) {
      HM.log(1, 'Error initializing tables for background:', error);
      TableManager.updateRollButtonsAvailability(null);
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

    // Collect all DOM updates
    const updates = [];

    Object.entries(typeToFieldMap).forEach(([tableType, fieldName]) => {
      const container = document.querySelector(`.personality-group textarea[name="${fieldName}"]`);
      const rollButton = document.querySelector(`.personality-group button[data-table="${fieldName}"]`);

      if (container && rollButton) {
        const hasTable = foundTableTypes?.has(tableType);
        const newPlaceholder = game.i18n.localize(hasTable ? `hm.app.finalize.${fieldName}-placeholder` : `hm.app.finalize.${fieldName}-placeholder-alt`);
        const newDisplay = hasTable ? 'block' : 'none';

        // Only queue updates if values are changing
        if (container.placeholder !== newPlaceholder) {
          updates.push(() => (container.placeholder = newPlaceholder));
        }

        if (rollButton.style.display !== newDisplay) {
          updates.push(() => (rollButton.style.display = newDisplay));
        }
      }
    });

    // Apply all updates at once
    if (updates.length) {
      requestAnimationFrame(() => updates.forEach((update) => update()));
    }
  }

  /**
   * Rolls on a background characteristic table and returns result
   * @param {string} backgroundId - Background document ID
   * @param {string} characteristicType - Type of characteristic to roll for
   * @returns {Promise<string|null>} The roll result or null if unavailable
   * @static
   */
  static async rollOnBackgroundCharacteristicTable(backgroundId, characteristicType) {
    const tables = this.currentTables.get(backgroundId);

    if (!tables) {
      HM.log(2, `No tables found for background ID: ${backgroundId}`);
      return null;
    }

    // Better table matching logic with more debugging
    const table = tables.find((t) => {
      const tableName = t.name.toLowerCase();
      const searchTerm = characteristicType.toLowerCase();
      const isMatch = tableName.includes(searchTerm) || (searchTerm === 'traits' && tableName.includes('personality'));

      HM.log(3, `Checking table match: "${t.name}" for type "${characteristicType}" - Match: ${isMatch}`);
      return isMatch;
    });

    if (!table) {
      HM.log(2, `No matching table found for type: ${characteristicType}`);
      return null;
    }

    // Check if table has available results
    const availableResults = table.results.filter((r) => !r.drawn);
    if (!availableResults.length) {
      HM.log(2, `All results have been drawn from table: ${table.name}`);
      return null;
    }

    HM.log(3, `Drawing from table: ${table.name} (${availableResults.length} available results)`);

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

      return result.results[0]?.text || null;
    } catch (error) {
      HM.log(1, `Error rolling for characteristic on table ${table.name}:`, error);
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
    const tables = this.currentTables.get(backgroundId);
    if (!tables) return true;

    const table = tables.find((t) => {
      const tableName = t.name.toLowerCase();
      const searchTerm = characteristicType.toLowerCase();
      return tableName.includes(searchTerm) || (searchTerm === 'traits' && tableName.includes('personality'));
    });
    if (!table) return true;

    // Check if there are any undrawn results left
    const availableResults = table.results.filter((r) => !r.drawn);
    return availableResults.length === 0;
  }

  /**
   * Resets tables to make all results available again
   * @param {string} backgroundId - Background document ID
   * @returns {Promise<void>}
   * @static
   */
  static async resetTables(backgroundId) {
    const tables = this.currentTables.get(backgroundId);
    if (!tables) return;

    try {
      await Promise.all(tables.map((table) => table.resetResults()));
    } catch (error) {
      HM.log(1, 'Error resetting tables:', error);
    }
  }

  /* -------------------------------------------- */
  /*  Static Protected Methods                    */
  /* -------------------------------------------- */

  /**
   * Extracts roll table UUIDs from description text
   * @param {string} description - Description text to parse
   * @returns {string[]} Array of table UUIDs
   * @static
   * @protected
   */
  static _parseTableUuidsFromDescription(description) {
    const uuidPattern = /@UUID\[(.*?)]/g;
    const matches = [...description.matchAll(uuidPattern)];
    return matches
      .map((match) => {
        try {
          const parsed = foundry.utils.parseUuid(match[1]);
          // Only return IDs for RollTable documents
          return parsed.type === 'RollTable' ? parsed.id : null;
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
  }
}
