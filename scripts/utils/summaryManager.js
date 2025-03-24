import { HM, MutationObserverRegistry } from './index.js';

/**
 * Manages RollTable interactions for character backgrounds and characteristics.
 * @class
 */
class TableManager {
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

/**
 * Manages summary updates and UI interactions for the character creation process.
 * @class
 */
export class SummaryManager {
  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Initializes all summary-related event listeners and observers
   * @static
   */
  static initializeSummaryListeners() {
    // Clean up existing listeners and observers first
    // this.cleanup();

    const raceDropdown = document.querySelector('#race-dropdown');
    const classDropdown = document.querySelector('#class-dropdown');
    const backgroundDropdown = document.querySelector('#background-dropdown');
    const equipmentContainer = document.querySelector('#equipment-container');
    const rollMethodSelect = document.querySelector('#roll-method');

    this.initializePortrait();
    this.initializeRollButtons();

    HM.log(3, 'Found dropdowns:', { race: raceDropdown, class: classDropdown, background: backgroundDropdown });

    // Use a single debounced function for equipment updates to avoid multiple calls
    this._debouncedEquipmentUpdate = this._debouncedEquipmentUpdate || this._createDebouncedEquipmentUpdate();

    if (raceDropdown) {
      raceDropdown._summaryChangeHandler = (event) => {
        this.updateClassRaceSummary();
        this._debouncedEquipmentUpdate();
      };
      raceDropdown.addEventListener('change', raceDropdown._summaryChangeHandler);
    }

    if (classDropdown) {
      classDropdown._summaryChangeHandler = (event) => {
        this.updateClassRaceSummary();
        this._debouncedEquipmentUpdate();
      };
      classDropdown.addEventListener('change', classDropdown._summaryChangeHandler);
    }

    if (backgroundDropdown) {
      backgroundDropdown._summaryChangeHandler = (event) => {
        this.updateBackgroundSummary();
        this._debouncedEquipmentUpdate();
      };
      backgroundDropdown.addEventListener('change', backgroundDropdown._summaryChangeHandler);
    }

    if (rollMethodSelect) {
      rollMethodSelect._summaryChangeHandler = (event) => {
        HM.log(3, 'Roll method changed:', event.target.value);
        requestAnimationFrame(() => {
          this.updateAbilitiesSummary();
        });
      };
      rollMethodSelect.addEventListener('change', rollMethodSelect._summaryChangeHandler);
    }

    if (equipmentContainer) {
      MutationObserverRegistry.register('summary-equipment', equipmentContainer, { childList: true, subtree: true, attributes: true }, (mutations) => {
        let needsUpdate = false;

        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.addedNodes.length) {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const newCheckboxes = node.querySelectorAll?.('.equipment-favorite-checkbox') || [];
                newCheckboxes.forEach((checkbox) => {
                  if (!checkbox._favoriteChangeHandler) {
                    checkbox._favoriteChangeHandler = () => this._debouncedEquipmentUpdate();
                    checkbox.addEventListener('change', checkbox._favoriteChangeHandler);
                  }
                });

                // If we added elements that might affect the summary, flag for update
                if (node.querySelector('select') || node.querySelector('input[type="checkbox"]')) {
                  needsUpdate = true;
                }
              }
            });
          }

          // If attribute changed on a favorite checkbox
          if (mutation.type === 'attributes' && mutation.attributeName === 'checked' && mutation.target.classList.contains('equipment-favorite-checkbox')) {
            needsUpdate = true;
          }
        }

        // Only update once if needed
        if (needsUpdate) {
          this._debouncedEquipmentUpdate();
        }
      });
    }
  }

  /**
   * Creates a debounced version of updateEquipmentSummary
   * @returns {Function} Debounced update function
   * @private
   * @static
   */
  static _createDebouncedEquipmentUpdate() {
    let timeout = null;
    return () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        this.updateEquipmentSummary();
      }, 50); // Small delay to batch closely timed changes
    };
  }

  /**
   * Updates the background summary text and formatting
   * @returns {Promise<void>}
   * @static
   */
  static async updateBackgroundSummary() {
    const backgroundSelect = document.querySelector('#background-dropdown');
    const summary = document.querySelector('.background-summary');

    if (!summary || !backgroundSelect) return;

    const selectedOption = backgroundSelect.options[backgroundSelect.selectedIndex];

    // Handle default/no selection case
    if (!selectedOption?.value || selectedOption.value === '') {
      const article = game.i18n.localize('hm.app.equipment.article-plural');
      summary.innerHTML = game.i18n.format('hm.app.finalize.summary.background', {
        article: article,
        background: game.i18n.localize('hm.app.background.adventurer')
      });
      return;
    }

    const [itemId, packId] = selectedOption.value.split(' (');
    if (!itemId || !packId) return;

    const uuid = HM.SELECTED.background.uuid;
    const backgroundName = selectedOption.text;
    const article = /^[aeiou]/i.test(backgroundName) ? game.i18n.localize('hm.app.equipment.article-plural') : game.i18n.localize('hm.app.equipment.article');

    const content = game.i18n.format('hm.app.finalize.summary.background', {
      article: article,
      background: `@UUID[${uuid}]{${backgroundName}}`
    });
    summary.innerHTML = await TextEditor.enrichHTML(content);
  }

  /**
   * Updates the class and race summary text
   * @returns {Promise<void>}
   * @static
   */
  static async updateClassRaceSummary() {
    const raceSelect = document.querySelector('#race-dropdown');
    const classSelect = document.querySelector('#class-dropdown');
    const summary = document.querySelector('.class-race-summary');

    if (!summary || !raceSelect || !classSelect) return;

    // Get race details
    let raceLink = game.i18n.format('hm.unknown', { type: 'race' });
    if (HM.SELECTED.race?.uuid) {
      // Get the race name directly from the dropdown if possible
      const selectedRaceOption = raceSelect.selectedIndex > 0 ? raceSelect.options[raceSelect.selectedIndex] : null;

      // If dropdown selection doesn't match stored UUID, try to find matching option
      let raceName;
      if (selectedRaceOption) {
        raceName = selectedRaceOption.text;
      } else {
        // Look for option that contains the UUID
        for (let i = 0; i < raceSelect.options.length; i++) {
          if (raceSelect.options[i].value.includes(HM.SELECTED.race.uuid)) {
            raceName = raceSelect.options[i].text;
            break;
          }
        }
      }

      // If we found a name, create the link
      if (raceName) {
        raceLink = `@UUID[${HM.SELECTED.race.uuid}]{${raceName}}`;
      }
    }

    // Similar process for class
    let classLink = game.i18n.format('hm.unknown', { type: 'class' });
    if (HM.SELECTED.class?.uuid) {
      const className = classSelect.selectedIndex > 0 ? classSelect.options[classSelect.selectedIndex].text : 'unknown class';
      classLink = `@UUID[${HM.SELECTED.class.uuid}]{${className}}`;
    }

    const content = game.i18n.format('hm.app.finalize.summary.classRace', {
      race: raceLink,
      class: classLink
    });

    summary.innerHTML = await TextEditor.enrichHTML(content);
  }

  /**
   * Updates the equipment summary with selected items
   * @returns {Promise<void>}
   * @static
   */
  static async updateEquipmentSummary() {
    // Check if we're already processing an update
    if (this._isUpdatingEquipment) return;
    this._isUpdatingEquipment = true;

    try {
      const priorityTypes = ['weapon', 'armor', 'shield'];
      const equipmentContainer = document.querySelector('#equipment-container');

      // If no container or in ELKAN mode, exit early
      if (!equipmentContainer || HM.COMPAT.ELKAN) {
        const summary = document.querySelector('.equipment-summary');
        if (summary) {
          summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
        }
        return;
      }

      // Collect all equipment items at once
      const selectedEquipment = Array.from(document.querySelectorAll('#equipment-container select, #equipment-container input[type="checkbox"]:checked'))
        .map((el) => {
          // For selects
          if (el.tagName === 'SELECT') {
            const selectedOption = el.options[el.selectedIndex];
            if (!selectedOption || !selectedOption.value || !selectedOption.value.includes('Compendium')) return null;

            const favoriteCheckbox = el.closest('.equipment-item')?.querySelector('.equipment-favorite-checkbox');
            const isFavorite = favoriteCheckbox?.checked || false;

            return {
              type: selectedOption.dataset.tooltip?.toLowerCase() || '',
              uuid: selectedOption.value,
              text: selectedOption.textContent?.trim(),
              favorite: isFavorite
            };
          }
          // For checkboxes
          else {
            const link = el.parentElement?.querySelector('.content-link');
            const uuid = link?.dataset?.uuid;

            if (!link || !uuid || uuid.includes(',') || !uuid.includes('Compendium')) return null;

            const favoriteCheckbox = el.closest('.equipment-item')?.querySelector('.equipment-favorite-checkbox');
            const isFavorite = favoriteCheckbox?.checked || false;

            return {
              type: link.dataset.tooltip?.toLowerCase() || '',
              uuid: uuid,
              text: link.textContent?.trim(),
              favorite: isFavorite
            };
          }
        })
        .filter(Boolean);

      if (!selectedEquipment.length) {
        // No equipment? Update summary with default message
        const summary = document.querySelector('.equipment-summary');
        if (summary) {
          summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
        }
        return;
      }

      // Single log before sorting
      HM.log(
        3,
        'Before sorting:',
        selectedEquipment.map((item) => `${item.text} (favorite: ${item.favorite})`)
      );

      // Sort once - favorites first, then by type priority
      selectedEquipment.sort((a, b) => {
        if (a.favorite && !b.favorite) return -1;
        if (!a.favorite && b.favorite) return 1;

        // If both have same favorite status, use the type priority
        const aIndex = priorityTypes.indexOf(a.type);
        const bIndex = priorityTypes.indexOf(b.type);
        return (bIndex === -1 ? -999 : bIndex) - (aIndex === -1 ? -999 : aIndex);
      });

      // Single log after sorting
      HM.log(
        3,
        'After sorting:',
        selectedEquipment.map((item) => `${item.text} (favorite: ${item.favorite})`)
      );

      // Take up to 3 items
      const displayEquipment = selectedEquipment.slice(0, 3);

      const summary = document.querySelector('.equipment-summary');
      if (summary && displayEquipment.length) {
        const formattedItems = displayEquipment.map((item) => {
          const itemName = item.text;
          const article = /^[aeiou]/i.test(itemName) ? game.i18n.localize('hm.app.equipment.article-plural') : game.i18n.localize('hm.app.equipment.article');
          return `${article} @UUID[${item.uuid}]{${item.text}}`;
        });

        const content = game.i18n.format('hm.app.finalize.summary.equipment', {
          items:
            formattedItems.slice(0, -1).join(game.i18n.localize('hm.app.equipment.separator')) +
            (formattedItems.length > 1 ? game.i18n.localize('hm.app.equipment.and') : '') +
            formattedItems.slice(-1)
        });
        summary.innerHTML = await TextEditor.enrichHTML(content);
      } else if (summary) {
        summary.innerHTML = game.i18n.localize('hm.app.finalize.summary.equipmentDefault');
      }
    } finally {
      // Release the lock when done
      this._isUpdatingEquipment = false;
    }
  }

  /**
   * Updates the abilities summary based on class preferences and highest scores
   * @returns {Promise<void>}
   * @static
   */
  static async updateAbilitiesSummary() {
    const abilityBlocks = document.querySelectorAll('.ability-block');
    const abilityScores = {};
    const rollMethodSelect = document.getElementById('roll-method');
    const rollMethod = rollMethodSelect ? rollMethodSelect.value : 'standardArray'; // Default to standardArray if not found

    // First, remove any existing highlights
    document.querySelectorAll('.primary-ability').forEach((el) => {
      el.classList.remove('primary-ability');
    });

    // Get the primary abilities from the class item
    const primaryAbilities = new Set();
    try {
      const classUUID = HM.SELECTED.class.uuid;
      if (classUUID) {
        const classItem = fromUuidSync(classUUID);

        // Get primary ability
        if (classItem?.system?.primaryAbility?.value?.length) {
          for (const ability of classItem.system.primaryAbility.value) {
            primaryAbilities.add(ability.toLowerCase());
          }
        }

        // Get spellcasting ability
        if (classItem?.system?.spellcasting?.ability) {
          primaryAbilities.add(classItem.system.spellcasting.ability.toLowerCase());
        }

        // Get saving throw proficiencies from level 1 traits
        if (classItem?.advancement?.byType?.Trait) {
          const level1Traits = classItem.advancement.byType.Trait.filter((entry) => entry.level === 1 && entry.configuration.grants);

          for (const trait of level1Traits) {
            const grants = trait.configuration.grants;
            for (const grant of grants) {
              if (grant.startsWith('saves:')) {
                primaryAbilities.add(grant.split(':')[1].toLowerCase());
              }
            }
          }
        }

        HM.log(3, 'Primary abilities for class:', Array.from(primaryAbilities));
      }
    } catch (error) {
      HM.log(1, 'Error fetching class abilities:', error);
    }

    // Process each ability block
    abilityBlocks.forEach((block) => {
      let score = 0;
      let abilityKey = '';

      // Find which ability this block represents based on the roll method
      if (rollMethod === 'pointBuy') {
        const hiddenInput = block.querySelector('input[type="hidden"]');
        if (hiddenInput) {
          const nameMatch = hiddenInput.name.match(/abilities\[(\w+)]/);
          if (nameMatch && nameMatch[1]) {
            abilityKey = nameMatch[1].toLowerCase();
          }
        }
        score = parseInt(block.querySelector('.current-score')?.innerHTML) || 0;
      } else if (rollMethod === 'standardArray') {
        const dropdown = block.querySelector('.ability-dropdown');
        if (dropdown) {
          // Extract ability key from the dropdown name attribute
          const nameMatch = dropdown.name.match(/abilities\[(\w+)]/);
          if (nameMatch && nameMatch[1]) {
            abilityKey = nameMatch[1].toLowerCase();
          }
          score = parseInt(dropdown.value) || 0;
        }
      } else if (rollMethod === 'manualFormula') {
        const dropdown = block.querySelector('.ability-dropdown');
        if (dropdown && dropdown.value) {
          abilityKey = dropdown.value.toLowerCase();
        }
        score = parseInt(block.querySelector('.ability-score')?.value) || 0;
      }

      // Apply highlighting if this is a primary ability
      if (abilityKey && primaryAbilities.has(abilityKey)) {
        HM.log(3, `Highlighting ${rollMethod} ability: ${abilityKey} in block:`, block.id);
        const classUUID = HM.SELECTED.class.uuid;
        const classItem = classUUID ? fromUuidSync(classUUID) : null;
        const className = classItem?.name || game.i18n.localize('hm.app.abilities.your-class');
        // For standardArray and pointBuy, highlight the label
        const label = block.querySelector('.ability-label');
        if (label) {
          label.classList.add('primary-ability');
          // Add tooltip text as data attribute
          const abilityName = CONFIG.DND5E.abilities[abilityKey]?.label || abilityKey.toUpperCase();
          const tooltipText = game.i18n.format('hm.app.abilities.primary-tooltip', {
            ability: abilityName,
            class: className
          });
          label.setAttribute('data-tooltip', tooltipText);
        }

        // For standardArray, also highlight the dropdown
        if (rollMethod === 'standardArray') {
          const dropdown = block.querySelector('.ability-dropdown');
          if (dropdown) {
            dropdown.classList.add('primary-ability');
          }
        }

        // For manualFormula, highlight the dropdown only if it matches a primary ability
        if (rollMethod === 'manualFormula') {
          const dropdown = block.querySelector('.ability-dropdown');
          if (dropdown && dropdown.value && primaryAbilities.has(dropdown.value.toLowerCase())) {
            dropdown.classList.add('primary-ability');
          }
        }
      }

      // Store score for summary calculations
      if (abilityKey) {
        abilityScores[abilityKey] = score;
      }
    });

    // Sort abilities by preference and then by score
    const sortedAbilities = Object.entries(abilityScores)
      .sort(([abilityA, scoreA], [abilityB, scoreB]) => {
        // First sort by preferred status
        const preferredA = primaryAbilities.has(abilityA);
        const preferredB = primaryAbilities.has(abilityB);

        if (preferredA && !preferredB) return -1;
        if (!preferredA && preferredB) return 1;

        // Then sort by score
        return scoreB - scoreA;
      })
      .map(([ability]) => ability.toLowerCase());

    // Select the top 2 abilities
    const selectedAbilities = [];
    for (const ability of sortedAbilities) {
      if (selectedAbilities.length < 2 && !selectedAbilities.includes(ability)) {
        selectedAbilities.push(ability);
      }
    }

    // If we still need more abilities, add highest scoring ones
    if (selectedAbilities.length < 2) {
      for (const [ability, score] of Object.entries(abilityScores).sort(([, a], [, b]) => b - a)) {
        if (!selectedAbilities.includes(ability) && selectedAbilities.length < 2) {
          selectedAbilities.push(ability);
        }
      }
    }

    // Update the summary HTML
    const abilitiesSummary = document.querySelector('.abilities-summary');
    if (abilitiesSummary && selectedAbilities.length >= 2) {
      const content = game.i18n.format('hm.app.finalize.summary.abilities', {
        first: `&Reference[${selectedAbilities[0]}]`,
        second: `&Reference[${selectedAbilities[1]}]`
      });
      abilitiesSummary.innerHTML = await TextEditor.enrichHTML(content);
    } else if (abilitiesSummary) {
      abilitiesSummary.innerHTML = game.i18n.localize('hm.app.finalize.summary.abilitiesDefault');
    }
  }

  /**
   * Updates character portrait with provided image path
   * @param {string} imagePath - Path to character image
   * @instance
   */
  updateCharacterPortrait(imagePath) {
    const portraitImg = document.querySelector('.character-portrait img');
    if (portraitImg) {
      portraitImg.src = imagePath;
    }
  }

  /**
   * Initializes character portrait with default image
   * @static
   */
  static initializePortrait() {
    const portraitContainer = document.querySelector('.character-portrait');
    if (portraitContainer) {
      const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
      const randomAbility = abilities[Math.floor(Math.random() * 6)];
      const defaultImage = `systems/dnd5e/icons/svg/abilities/${randomAbility}.svg`;
      const portraitImg = portraitContainer.querySelector('img');

      if (portraitImg) {
        portraitImg.src = defaultImage;

        // Check if dark mode is active and apply inversion if needed
        const isDarkMode = game.settings.get('core', 'colorScheme') === 'dark';
        this.applyDarkModeToImage(portraitImg, isDarkMode, true);
      }

      // Add name and art path update handling
      const nameInput = document.querySelector('#character-name');
      const artInput = document.querySelector('#character-art-path');
      const portraitName = document.querySelector('.header-section h2');

      const updatePortrait = () => {
        if (portraitName) {
          portraitName.innerHTML = nameInput?.value || game.user.name;
        }
        if (portraitImg && artInput) {
          const isDefaultImage = portraitImg.src.includes('/abilities/');
          portraitImg.src = artInput.value || defaultImage;

          // Only apply dark mode treatment for default images
          const isDarkMode = game.settings.get('core', 'colorScheme') === 'dark';
          const isStillDefaultImage = !artInput.value || artInput.value.includes('/abilities/');
          this.applyDarkModeToImage(portraitImg, isDarkMode, isStillDefaultImage);
        }
      };

      nameInput?.addEventListener('change', updatePortrait);
      artInput?.addEventListener('change', updatePortrait);
      updatePortrait();

      // Listen for color scheme changes
      Hooks.on('colorSchemeChange', (scheme) => {
        if (portraitImg) {
          const isDefaultImage = portraitImg.src.includes('/abilities/');
          this.applyDarkModeToImage(portraitImg, scheme === 'dark', isDefaultImage);
        }
      });
    }
  }

  /**
   * Helper method to apply or remove dark mode treatment to images
   * @param {HTMLImageElement} imgElement - The image element
   * @param {boolean} isDarkMode - Whether dark mode is active
   * @param {boolean} isDefaultImage - Whether the image is a default ability icon
   */
  static applyDarkModeToImage(imgElement, isDarkMode, isDefaultImage) {
    if (isDarkMode && isDefaultImage) {
      imgElement.style.filter = 'invert(1)';
    } else {
      imgElement.style.filter = 'none';
    }
  }

  /**
   * Sets up roll buttons for background characteristics
   * @static
   */
  static initializeRollButtons() {
    const rollButtons = document.querySelectorAll('.roll-btn');
    const backgroundSelect = document.querySelector('#background-dropdown');

    // Batch disable all buttons initially
    if (rollButtons.length) {
      requestAnimationFrame(() => {
        rollButtons.forEach((button) => (button.disabled = true));
      });
    }

    backgroundSelect?.addEventListener('change', (event) => {
      const backgroundId = event.target.value.split(' (')[0];

      // Batch button updates
      requestAnimationFrame(() => {
        rollButtons.forEach((button) => (button.disabled = !backgroundId));
      });
    });

    rollButtons.forEach((button) => {
      button.addEventListener('click', async (event) => {
        const tableType = event.currentTarget.dataset.table;
        const textarea = event.currentTarget.closest('.input-with-roll').querySelector('textarea');
        const backgroundId = HM.SELECTED.background.id;

        if (!backgroundId) {
          ui.notifications.warn(game.i18n.localize('hm.warnings.select-background'));
          return;
        }

        const result = await TableManager.rollOnBackgroundCharacteristicTable(backgroundId, tableType);
        HM.log(3, 'Roll result:', result);

        if (result) {
          textarea.value = textarea.value ? `${textarea.value} ${result}` : result;
          textarea.dispatchEvent(new Event('change', { bubbles: true }));

          if (TableManager.areAllTableResultsDrawn(backgroundId, tableType)) {
            button.disabled = true;
          }
        }
      });
    });
  }

  /**
   * Processes background selection changes to load relevant tables
   * @param {object} selectedBackground - Selected background data
   * @returns {Promise<void>}
   * @static
   */
  static async processBackgroundSelectionChange(selectedBackground) {
    if (!selectedBackground?.value) {
      return;
    }

    const uuid = HM.SELECTED.background.uuid;

    try {
      const background = await fromUuid(uuid);
      if (background) {
        await TableManager.loadRollTablesForBackground(background);

        const rollButtons = document.querySelectorAll('.roll-btn');
        rollButtons.forEach((button) => (button.disabled = false));
      }
    } catch (error) {
      HM.log(1, `Error loading background with UUID ${uuid}:`, error);
    }
  }

  /**
   * Generates a formatted chat message summarizing the created character
   * @returns {string} HTML content for chat message
   * @static
   */
  static generateCharacterSummaryChatMessage() {
    const characterName = document.querySelector('#character-name')?.value || game.user.name;

    const summaries = {
      classRace: document.querySelector('.class-race-summary')?.innerHTML || '',
      background: document.querySelector('.background-summary')?.innerHTML || '',
      abilities: document.querySelector('.abilities-summary')?.innerHTML || '',
      equipment: document.querySelector('.equipment-summary')?.innerHTML || ''
    };

    let message = `
    <div class="character-summary" style="line-height: 1.7; margin: 0.5em 0;">
        <h2 style="margin-bottom: 0.5em">${characterName}</h2>
        <hr style="margin: 0.5em 0">
    `;

    if (summaries.classRace) {
      message += `<span class="summary-section class-race">${summaries.classRace}</span> `;
    }

    if (summaries.background) {
      message += `<span class="summary-section background">${summaries.background}</span> `;
    }

    if (summaries.abilities) {
      message += `<span class="summary-section abilities">${summaries.abilities}</span> `;
    }

    if (summaries.equipment) {
      message += `<span class="summary-section equipment">${summaries.equipment}</span>`;
    }

    message += '</div>';

    return message;
  }

  /**
   * Cleans up all event listeners and observers
   * @static
   */
  static cleanup() {
    MutationObserverRegistry.unregisterByPrefix('summary-');
    document.querySelectorAll('#race-dropdown, #class-dropdown, #background-dropdown').forEach((dropdown) => {
      if (dropdown._summaryChangeHandler) {
        dropdown.removeEventListener('change', dropdown._summaryChangeHandler);
        dropdown._summaryChangeHandler = null;
      }
    });

    document.querySelectorAll('.ability-block .ability-dropdown, .ability-block .ability-score').forEach((input) => {
      if (input._summarySummaryHandler) {
        input.removeEventListener('change', input._summarySummaryHandler);
        input._summarySummaryHandler = null;
      }
    });

    HM.log(3, 'SummaryManager: cleaned up observers and event listeners');
  }
}
