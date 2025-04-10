import { DOMManager, EquipmentParser, HeroMancer, HM } from './index.js';

/**
 * Service class that handles character creation in the Hero Mancer
 * @class
 */
export class ActorCreationService {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /**
   * Timing configuration for advancement processing
   * @type {object}
   * @static
   */
  static ADVANCEMENT_DELAY = { transitionDelay: 300, renderTimeout: 3000, retryAttempts: 3 };

  /* -------------------------------------------- */
  /*  Public Methods                              */
  /* -------------------------------------------- */

  /**
   * Main handler for character creation
   * @param {Event} event - Form submission event
   * @param {FormDataExtended} formData - Processed form data
   * @returns {Promise<Actor|void>} Created actor or void if operation didn't complete
   * @static
   */
  static async createCharacter(event, formData) {
    HM.log(3, 'Starting character creation');
    const targetUser = this.#determineTargetUser(formData);

    try {
      // Validate and collect data
      if (!this.#validateMandatoryFields(formData.object)) return;

      const { useClassWealth, useBackgroundWealth, startingWealth } = await this.#processWealthOptions(formData.object);
      const equipmentSelections = await this.#collectEquipment(event, useClassWealth, useBackgroundWealth);

      const characterData = this.#extractCharacterData(formData.object);
      if (!this.#validateCharacterData(characterData)) return;

      // Create actor and process advancements
      const actor = await this.#createAndSetupActor(formData.object, characterData, targetUser);
      await this.#processItemsAndAdvancements(actor, characterData, equipmentSelections, event, startingWealth);

      HM.log(3, 'Character creation completed successfully');
      return actor;
    } catch (error) {
      HM.log(1, 'Error in character creation:', error);
      ui.notifications.error('hm.errors.form-submission', { localize: true });
    }
  }

  /* -------------------------------------------- */
  /*  Character Creation Data Processing          */
  /* -------------------------------------------- */

  /**
   * Determines the target user for the character
   * @param {FormDataExtended} formData - Form data containing player selection
   * @returns {User} The target user object
   * @private
   * @static
   */
  static #determineTargetUser(formData) {
    const targetUserId = game.user.isGM ? formData.object.player : null;
    const targetUser = game.users.get(targetUserId) || game.user;
    HM.log(3, `Target user - ${targetUser.name}`);
    return targetUser;
  }

  /**
   * Extracts and validates character data from form
   * @param {object} formData - Form data containing character details
   * @returns {object} Extracted character data
   * @private
   * @static
   */
  static #extractCharacterData(formData) {
    const { backgroundData, raceData, classData } = this.#extractItemData(formData);
    const abilities = this.#processAbilityScores(formData);

    return { backgroundData, raceData, classData, abilities };
  }

  /**
   * Validates that all required character elements are present
   * @param {object} characterData - Character data to validate
   * @returns {boolean} True if character data is valid
   * @private
   * @static
   */
  static #validateCharacterData(characterData) {
    return this.#validateRequiredSelections(characterData.backgroundData, characterData.raceData, characterData.classData);
  }

  /**
   * Creates the actor and sets up ownership and customization
   * @param {object} formData - Form data with character settings
   * @param {object} characterData - Processed character data
   * @param {User} targetUser - The target user for this character
   * @returns {Promise<Actor>} The created actor
   * @private
   * @static
   */
  static async #createAndSetupActor(formData, characterData, targetUser) {
    const actor = await this.#createActorDocument(formData, characterData.abilities, targetUser.id);
    await this.#assignCharacterToUser(actor, targetUser, formData);

    if (game.settings.get(HM.ID, 'enablePlayerCustomization')) {
      await this.#updatePlayerCustomization(targetUser, formData);
    }

    return actor;
  }

  /**
   * Processes items and advancements for the created actor
   * @param {Actor} actor - The created actor
   * @param {object} characterData - Character data containing selections
   * @param {Array<object>} equipment - Equipment items to create
   * @param {Event} event - Form submission event
   * @param {object} startingWealth - Starting wealth object
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #processItemsAndAdvancements(actor, characterData, equipment, event, startingWealth) {
    const { backgroundItem, raceItem, classItem } = await this.#fetchCompendiumItems(characterData.backgroundData, characterData.raceData, characterData.classData);

    if (!backgroundItem || !raceItem || !classItem) return;

    await this.#processEquipmentAndFavorites(actor, equipment, event, startingWealth);
    await this.#processAdvancements([classItem, raceItem, backgroundItem], actor);
  }

  /* -------------------------------------------- */
  /*  Field Validation                            */
  /* -------------------------------------------- */

  /**
   * Validates that all mandatory fields are filled in
   * @param {object} formData - Form data to validate
   * @returns {boolean} True if validation passed, false otherwise
   * @private
   * @static
   */
  static #validateMandatoryFields(formData) {
    const mandatoryFields = game.settings.get(HM.ID, 'mandatoryFields') || [];

    // Field name mappings (system field name -> form field name)
    const fieldMappings = {
      name: 'character-name',
      race: 'race',
      class: 'class',
      background: 'background'
    };

    // Group missing fields by category
    const missingFields = {
      basic: [],
      abilities: [],
      background: []
    };

    for (const field of mandatoryFields) {
      const formField = fieldMappings[field] || field;
      const value = formData[formField];

      if (!value || (typeof value === 'string' && value.trim() === '')) {
        // Categorize the missing field
        if (field.startsWith('abilities')) {
          missingFields.abilities.push(field);
        } else if (['bond', 'ideal', 'flaw', 'trait'].includes(field)) {
          missingFields.background.push(field);
        } else {
          missingFields.basic.push(field);
        }
      }
    }

    // Count total missing fields
    const totalMissing = Object.values(missingFields).flat().length;

    if (totalMissing > 0) {
      // Create a more specific error message based on categories
      let errorMsg = 'hm.errors.missing-mandatory-fields';

      if (missingFields.basic.length) {
        errorMsg = 'hm.errors.missing-basic-fields';
      } else if (missingFields.abilities.length) {
        errorMsg = 'hm.errors.missing-ability-fields';
      } else if (missingFields.background.length) {
        errorMsg = 'hm.errors.missing-background-fields';
      }

      ui.notifications.error(
        game.i18n.format(errorMsg, {
          fields: Object.values(missingFields).flat().join(', '),
          count: totalMissing
        })
      );

      return false;
    }

    return true;
  }

  /**
   * Validates that required character elements are selected
   * @param {object} backgroundData - Background selection data
   * @param {object} raceData - Race selection data
   * @param {object} classData - Class selection data
   * @returns {boolean} True if all selections are valid
   * @private
   * @static
   */
  static #validateRequiredSelections(backgroundData, raceData, classData) {
    if (!backgroundData?.uuid) {
      ui.notifications.warn('hm.errors.select-background', { localize: true });
      return false;
    }

    if (!raceData?.uuid) {
      ui.notifications.warn('hm.errors.select-race', { localize: true });
      return false;
    }

    if (!classData?.uuid) {
      ui.notifications.warn('hm.errors.select-class', { localize: true });
      return false;
    }

    return true;
  }

  /* -------------------------------------------- */
  /*  Wealth & Equipment Handling                 */
  /* -------------------------------------------- */

  /**
   * Processes starting wealth options from form data
   * @param {object} formData - Form data containing wealth options
   * @returns {Promise<{useClassWealth: boolean, useBackgroundWealth: boolean, startingWealth: object|null}>}
   * @private
   * @static
   */
  static async #processWealthOptions(formData) {
    const useClassWealth = formData['use-starting-wealth-class'];
    const useBackgroundWealth = formData['use-starting-wealth-background'];
    const useStartingWealth = useClassWealth || useBackgroundWealth;

    HM.log(3, 'Starting wealth checks:', { class: useClassWealth, background: useBackgroundWealth });

    const startingWealth = useStartingWealth ? await EquipmentParser.convertWealthStringToCurrency(formData) : null;

    HM.log(3, 'Starting wealth amount:', startingWealth);

    return { useClassWealth, useBackgroundWealth, startingWealth };
  }

  /**
   * Collects equipment selections from the form
   * @param {Event} event - The form submission event
   * @param {boolean} useClassWealth - Whether class starting wealth is being used
   * @param {boolean} useBackgroundWealth - Whether background starting wealth is being used
   * @returns {Promise<Array<object>>} An array of equipment items
   * @static
   */
  static async #collectEquipment(event, useClassWealth, useBackgroundWealth) {
    // Get background equipment if not using background wealth
    const backgroundEquipment =
      !useBackgroundWealth ?
        await EquipmentParser.collectEquipmentSelections(event, {
          includeClass: false,
          includeBackground: true
        })
      : [];

    // Get class equipment if not using class wealth
    const classEquipment =
      !useClassWealth ?
        await EquipmentParser.collectEquipmentSelections(event, {
          includeClass: true,
          includeBackground: false
        })
      : [];

    return [...backgroundEquipment, ...classEquipment];
  }

  /**
   * Processes equipment items, favorites, and currency
   * @param {Actor} actor - The actor to update
   * @param {Array<object>} equipment - Equipment items to add
   * @param {Event} event - Form submission event
   * @param {object} startingWealth - Starting wealth to set
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #processEquipmentAndFavorites(actor, equipment, event, startingWealth) {
    try {
      // Process equipment items
      const createdItems = await this.#createEquipmentItems(actor, equipment);

      // Process favorites if any are selected
      await this.#processFavoriteCheckboxes(actor, event, createdItems);

      // Set starting wealth if provided
      if (startingWealth) {
        await this.#updateActorCurrency(actor, startingWealth);
      }
    } catch (error) {
      HM.log(1, 'Error processing equipment:', error);
      ui.notifications.warn('hm.warnings.equipment-processing-failed', { localize: true });
    }
  }

  /**
   * Creates equipment items on the actor
   * @param {Actor} actor - The actor to update
   * @param {Array<object>} equipment - Equipment data to create
   * @returns {Promise<Array<Item>>} Created items
   * @private
   * @static
   */
  static async #createEquipmentItems(actor, equipment) {
    if (!equipment.length) return [];

    try {
      return await actor.createEmbeddedDocuments('Item', equipment, { keepId: true });
    } catch (error) {
      HM.log(1, 'Failed to create equipment items:', error);
      ui.notifications.warn('hm.warnings.equipment-creation-failed', { localize: true });
      return [];
    }
  }

  /**
   * Finds and processes favorite checkboxes from the form
   * @param {Actor} actor - The actor to update
   * @param {Event} event - Form submission event
   * @param {Array<Item>} createdItems - Items created on the actor
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #processFavoriteCheckboxes(actor, event, createdItems) {
    const favoriteCheckboxes = event.target.querySelectorAll('.equipment-favorite-checkbox:checked');
    if (favoriteCheckboxes.length > 0) {
      await this.#processFavorites(actor, favoriteCheckboxes, createdItems);
    }
  }

  /**
   * Updates actor currency with starting wealth
   * @param {Actor} actor - The actor to update
   * @param {object} currencyData - Currency data to set
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #updateActorCurrency(actor, currencyData) {
    try {
      await actor.update({
        system: { currency: currencyData }
      });
    } catch (error) {
      HM.log(1, 'Failed to update actor currency:', error);
      ui.notifications.warn('hm.warnings.currency-update-failed', { localize: true });
    }
  }

  /**
   * Processes equipment favorites from form checkboxes
   * @param {Actor} actor - The actor to update
   * @param {NodeList} favoriteCheckboxes - Favorite checkboxes
   * @param {Array<Item>} createdItems - Items created on the actor
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #processFavorites(actor, favoriteCheckboxes, createdItems) {
    try {
      const currentActorFavorites = actor.system.favorites || [];
      const newFavorites = await this.#collectNewFavorites(favoriteCheckboxes, createdItems);

      if (newFavorites.length > 0) {
        await this.#updateActorFavorites(actor, currentActorFavorites, newFavorites);
      }
    } catch (error) {
      HM.log(1, 'Error processing favorites:', error);
      ui.notifications.warn('hm.warnings.favorites-processing-failed', { localize: true });
    }
  }

  /**
   * Collects new favorites from selected checkboxes
   * @param {NodeList} favoriteCheckboxes - Selected favorite checkboxes
   * @param {Array<Item>} createdItems - Items created on the actor
   * @returns {Promise<Array<object>>} Favorite data objects
   * @private
   * @static
   */
  static async #collectNewFavorites(favoriteCheckboxes, createdItems) {
    const newFavorites = [];
    const processedUuids = new Set(); // To avoid duplicates

    for (const checkbox of favoriteCheckboxes) {
      const itemUuids = this.#extractItemUuids(checkbox);
      if (!itemUuids.length) continue;

      for (const uuid of itemUuids) {
        if (processedUuids.has(uuid)) continue;
        processedUuids.add(uuid);

        const favoriteItems = await this.#findMatchingCreatedItems(uuid, createdItems);
        for (const item of favoriteItems) {
          newFavorites.push({
            type: 'item',
            id: `.Item.${item.id}`,
            sort: 100000 + newFavorites.length
          });
        }
      }
    }

    return newFavorites;
  }

  /**
   * Extracts item UUIDs from a favorite checkbox
   * @param {HTMLElement} checkbox - Favorite checkbox element
   * @returns {Array<string>} Extracted UUIDs
   * @private
   * @static
   */
  static #extractItemUuids(checkbox) {
    if (checkbox.dataset.itemUuids) {
      return checkbox.dataset.itemUuids.split(',');
    } else if (checkbox.id && checkbox.id.includes(',')) {
      return checkbox.id.split(',');
    } else if (checkbox.dataset.itemId) {
      return [checkbox.dataset.itemId];
    }
    return [];
  }

  /**
   * Finds matching created items from source UUID
   * @param {string} uuid - Source item UUID
   * @param {Array<Item>} createdItems - Items created on the actor
   * @returns {Promise<Array<Item>>} Matching items
   * @private
   * @static
   */
  static async #findMatchingCreatedItems(uuid, createdItems) {
    if (!uuid.startsWith('Compendium.')) return [];

    try {
      const sourceItem = await fromUuid(uuid);
      if (!sourceItem) return [];

      return createdItems.filter((item) => item.name === sourceItem.name || (item.flags?.core?.sourceId && item.flags.core.sourceId.includes(sourceItem.id)));
    } catch (error) {
      HM.log(2, `Error processing UUID ${uuid}:`, error);
      return [];
    }
  }

  /**
   * Updates actor favorites with new favorites
   * @param {Actor} actor - The actor to update
   * @param {Array<object>} currentFavorites - Current actor favorites
   * @param {Array<object>} newFavorites - New favorites to add
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #updateActorFavorites(actor, currentFavorites, newFavorites) {
    // Add new favorites without duplicates
    const combinedFavorites = [...currentFavorites];
    for (const newFav of newFavorites) {
      if (!combinedFavorites.some((fav) => fav.id === newFav.id)) {
        combinedFavorites.push(newFav);
      }
    }

    await actor.update({ 'system.favorites': combinedFavorites });
  }

  /* -------------------------------------------- */
  /*  Data Extraction & Parsing                   */
  /* -------------------------------------------- */

  /**
   * Extracts item IDs, pack IDs, and UUIDs from form selections
   * @param {object} formData - Form data with selections
   * @returns {object} Object containing background, race, and class data
   * @private
   * @static
   */
  static #extractItemData(formData) {
    // Extract the ID and packId from strings like "id [uuid] (packId)"
    const extractIds = (itemString) => {
      const idMatch = itemString.match(/^([^\s[]+)/);
      const itemId = idMatch ? idMatch[1] : null;

      const uuidMatch = itemString.match(/\[(.*?)]/);
      const uuid = uuidMatch ? uuidMatch[1] : null;

      let packId = null;
      const packMatch = itemString.match(/\(([^)]+)\)/);
      if (packMatch) {
        packId = packMatch[1];
      } else if (uuid && uuid.startsWith('Compendium.')) {
        const parts = uuid.split('.');
        if (parts.length >= 4 && parts[3] === 'Item') {
          packId = `${parts[1]}.${parts[2]}`;
        }
      }

      return itemId ? { itemId, packId, uuid } : null;
    };

    return {
      backgroundData: extractIds(formData.background),
      raceData: extractIds(formData.race),
      classData: extractIds(formData.class)
    };
  }

  /**
   * Extracts and formats ability scores from form data
   * @param {object} formData - Form data containing ability scores
   * @returns {object} Formatted abilities object
   * @private
   * @static
   */
  static #processAbilityScores(formData) {
    const abilities = {};

    // Extract ability scores from form data
    // They can be in format abilities[str] or abilities[str]-score
    for (const key in formData) {
      const abilityMatch = key.match(/^abilities\[(\w+)]-score$/) || key.match(/^abilities\[(\w+)]$/);
      if (abilityMatch) {
        const abilityKey = abilityMatch[1];
        abilities[abilityKey] = formData[key] || game.settings.get(HM.ID, 'abilityScoreDefault');
      }
    }

    return abilities;
  }

  /* -------------------------------------------- */
  /*  Actor Document Creation                     */
  /* -------------------------------------------- */

  /**
   * Creates the initial actor document with basic character data
   * @param {object} formData - Form data containing character details
   * @param {object} abilities - Processed ability scores
   * @param {string|null} targetUserId - ID of the target user if GM is creating for another player
   * @returns {Promise<Actor>} The created actor
   * @private
   * @static
   */
  static async #createActorDocument(formData, abilities, targetUserId) {
    try {
      // Build basic actor data
      const actorName = formData['character-name'] || game.user.name;
      const actorData = this.#buildActorData(formData, abilities, actorName);

      // Set ownership appropriately when character is created by GM
      if (game.user.isGM && targetUserId) {
        actorData.ownership = this.#buildOwnershipData(targetUserId);
      }

      ui.notifications.info('hm.actortab-button.creating', { localize: true });

      const actor = await Actor.create(actorData);
      HM.log(3, 'Created Actor:', actor);

      return actor;
    } catch (error) {
      HM.log(1, 'Failed to create actor document:', error);
      ui.notifications.error('hm.errors.actor-creation-failed', { localize: true });
      throw error; // Rethrow to allow proper handling in the caller
    }
  }

  /**
   * Builds the actor data object for creation
   * @param {object} formData - Form data with character details
   * @param {object} abilities - Processed ability scores
   * @param {string} actorName - Character name
   * @returns {object} Actor data object
   * @private
   * @static
   */
  static #buildActorData(formData, abilities, actorName) {
    return {
      name: actorName,
      img: formData['character-art'],
      prototypeToken: this.#transformTokenData(formData),
      type: 'character',
      system: {
        abilities: Object.fromEntries(Object.entries(abilities).map(([key, value]) => [key, { value }])),
        details: this.#buildCharacterDetails(formData)
      }
    };
  }

  /**
   * Builds ownership data for the actor
   * @param {string} targetUserId - Target user ID
   * @returns {object} Ownership configuration object
   * @private
   * @static
   */
  static #buildOwnershipData(targetUserId) {
    return {
      default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
      [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
      [targetUserId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
    };
  }

  /**
   * Builds character details from form data
   * @param {object} formData - Form data with character details
   * @returns {object} Character details object
   * @private
   * @static
   */
  static #buildCharacterDetails(formData) {
    return {
      age: formData.age || '',
      alignment: formData.alignment || '',
      appearance: formData.appearance || '',
      bond: formData.bonds || '',
      eyes: formData.eyes || '',
      faith: formData.faith || '',
      flaw: formData.flaws || '',
      gender: formData.gender || '',
      hair: formData.hair || '',
      height: formData.height || '',
      ideal: formData.ideals || '',
      skin: formData.skin || '',
      trait: formData.traits || '',
      weight: formData.weight || '',
      biography: {
        value: formData.backstory || ''
      }
    };
  }

  /* -------------------------------------------- */
  /*  Token Configuration                         */
  /* -------------------------------------------- */

  /**
   * Transforms form data into a token configuration object
   * @param {object} formData - Form data containing token settings
   * @returns {object} Token data object for Foundry VTT
   * @private
   * @static
   */
  static #transformTokenData(formData) {
    try {
      const tokenData = this.#createBaseTokenData(formData);

      if (game.settings.get(HM.ID, 'enableTokenCustomization')) {
        this.#addTokenCustomizationData(tokenData, formData);
      }

      return tokenData;
    } catch (error) {
      HM.log(1, 'Error in #transformTokenData:', error);
      return CONFIG.Actor.documentClass.prototype.prototypeToken;
    }
  }

  /**
   * Creates base token data with essential properties
   * @param {object} formData - Form data with token settings
   * @returns {object} Base token data object
   * @private
   * @static
   */
  static #createBaseTokenData(formData) {
    return {
      texture: {
        src: formData['token-art'] || formData['character-art'] || 'icons/svg/mystery-man.svg',
        scaleX: 1,
        scaleY: 1
      },
      sight: { enabled: true },
      disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
      actorLink: true
    };
  }

  /**
   * Adds customization data to the token configuration
   * @param {object} tokenData - Token data to enhance
   * @param {object} formData - Form data with token settings
   * @returns {void}
   * @private
   * @static
   */
  static #addTokenCustomizationData(tokenData, formData) {
    // Display settings
    if (formData.displayName) tokenData.displayName = parseInt(formData.displayName);
    if (formData.displayBars) tokenData.displayBars = parseInt(formData.displayBars);

    // Resource bars
    tokenData.bar1 = { attribute: formData['bar1.attribute'] || null };
    tokenData.bar2 = { attribute: formData['bar2.attribute'] || null };

    // Ring configuration
    tokenData.ring = {
      enabled: formData['ring.enabled'] || false,
      colors: {
        ring: formData['ring.color'] || null,
        background: formData.backgroundColor || null
      },
      effects: this.#calculateRingEffects(formData['ring.effects'])
    };
  }

  /**
   * Calculates token ring effects based on selected options
   * @param {string[]} effectsArray - Effect names to apply
   * @returns {number} Bitwise flag for combined effects
   * @private
   * @static
   */
  static #calculateRingEffects(effectsArray) {
    const TRE = CONFIG.Token.ring.ringClass.effects;
    let effects = TRE.ENABLED;

    if (!effectsArray?.length) return TRE.DISABLED;

    effectsArray.forEach((effect) => {
      if (effect && TRE[effect]) effects |= TRE[effect];
    });

    return effects;
  }

  /* -------------------------------------------- */
  /*  Compendium Item Handling                    */
  /* -------------------------------------------- */

  /**
   * Fetches required compendium items for character creation
   * @param {object} backgroundData - Background selection data
   * @param {object} raceData - Race selection data
   * @param {object} classData - Class selection data
   * @returns {Promise<object>} Object containing the fetched items
   * @private
   * @static
   */
  static async #fetchCompendiumItems(backgroundData, raceData, classData) {
    try {
      // Fetch documents from compendiums
      const backgroundItem = await game.packs.get(backgroundData.packId)?.getDocument(backgroundData.itemId);
      const raceItem = await game.packs.get(raceData.packId)?.getDocument(raceData.itemId);
      const classItem = await game.packs.get(classData.packId)?.getDocument(classData.itemId);

      // Validate each item was retrieved successfully
      if (!backgroundItem) {
        ui.notifications.error('hm.errors.no-background', { localize: true });
        return {};
      }
      if (!raceItem) {
        ui.notifications.error('hm.errors.no-race', { localize: true });
        return {};
      }
      if (!classItem) {
        ui.notifications.error('hm.errors.no-class', { localize: true });
        return {};
      }

      return { backgroundItem, raceItem, classItem };
    } catch (error) {
      HM.log(1, 'Error fetching compendium items:', error);
      ui.notifications.error('hm.errors.fetch-fail', { localize: true });
      return {};
    }
  }

  /* -------------------------------------------- */
  /*  Advancement Processing                      */
  /* -------------------------------------------- */

  /**
   * Processes character advancement for class, race, and background
   * @param {Array<Item>} items - Items to process for advancement
   * @param {Actor} actor - The actor to apply advancements to
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #processAdvancements(items, actor) {
    if (!Array.isArray(items) || !items.length) {
      HM.log(2, 'No items provided for advancement');
      return;
    }

    try {
      // Separate items with and without advancements
      const { itemsWithAdvancements, itemsWithoutAdvancements } = this.#categorizeItemsByAdvancements(items);

      // Process items with advancements
      if (itemsWithAdvancements.length) {
        await this.#runAdvancementManagers(itemsWithAdvancements, actor);
      }

      // Add items without advancements directly
      if (itemsWithoutAdvancements.length) {
        await this.#addItemsWithoutAdvancements(actor, itemsWithoutAdvancements);
      }

      // Generate character summary
      await this.#createCharacterSummary(actor);
    } catch (error) {
      HM.log(1, 'Error in processAdvancements:', error);
      ui.notifications.error('hm.errors.advancement-processing-failed', { localize: true });
    }
  }

  /**
   * Categorizes items by whether they have advancements
   * @param {Array<Item>} items - Items to categorize
   * @returns {object} Object with two arrays of items
   * @private
   * @static
   */
  static #categorizeItemsByAdvancements(items) {
    const itemsWithAdvancements = [];
    const itemsWithoutAdvancements = [];

    for (const item of items) {
      const hasAdvancements = item.advancement?.byId && Object.keys(item.advancement.byId).length > 0;
      if (hasAdvancements) {
        itemsWithAdvancements.push(item);
      } else {
        itemsWithoutAdvancements.push(item);
        HM.log(3, `Adding ${item.name} directly - no advancements needed`);
      }
    }

    return { itemsWithAdvancements, itemsWithoutAdvancements };
  }

  /**
   * Adds items without advancements directly to actor
   * @param {Actor} actor - Actor to add items to
   * @param {Array<Item>} items - Items to add
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #addItemsWithoutAdvancements(actor, items) {
    try {
      const itemData = items.map((item) => item.toObject());
      await actor.createEmbeddedDocuments('Item', itemData);
    } catch (error) {
      HM.log(1, 'Error adding items without advancements:', error);
      ui.notifications.error(`Failed to add items: ${error.message}`);
      throw error;
    }
  }

  /**
   * Creates character summary chat message
   * @param {object} actor - Current actor data to derive chat details from
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #createCharacterSummary(actor) {
    try {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker(),
        content: DOMManager.generateCharacterSummaryChatMessage(actor),
        flags: {
          'hero-mancer': { type: 'character-summary' }
        }
      });
    } catch (error) {
      HM.log(1, 'Error creating summary chat message:', error);
    }
  }

  /**
   * Runs advancement managers for items with advancements
   * @param {Array<Item>} items - Items with advancements
   * @param {Actor} actor - Actor to apply advancements to
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #runAdvancementManagers(items, actor) {
    if (!items.length) return;

    let currentManager = null;
    const results = { success: [], failure: [] };

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        HM.log(3, `Processing advancements for ${item.name} (${i + 1}/${items.length})`);

        try {
          currentManager = await this.#createAdvancementManager(actor, item);

          // Add progress feedback
          ui.notifications.info(
            game.i18n.format('hm.info.advancement-progress', {
              item: item.name,
              current: i + 1,
              total: items.length
            }),
            { permanent: false }
          );

          await new Promise((resolve, reject) => {
            // Set timeout for overall process
            const timeout = setTimeout(() => {
              reject(new Error(`Advancement for ${item.name} timed out`));
            }, this.ADVANCEMENT_DELAY.renderTimeout * 300); // 15 minutes to choose advancements

            Hooks.once('dnd5e.advancementManagerComplete', async () => {
              clearTimeout(timeout);
              HM.log(3, `Completed advancements for ${item.name}`);

              await new Promise((resolve) => {
                setTimeout(resolve, this.ADVANCEMENT_DELAY.transitionDelay);
              });

              currentManager = null;
              results.success.push(item.name);
              resolve();
            });

            currentManager.render(true);
          });
        } catch (error) {
          results.failure.push(item.name);
          HM.log(1, `Error processing advancements for ${item.name}:`, error);
          ui.notifications.warn(
            game.i18n.format('hm.warnings.advancement-failed', {
              item: item.name
            })
          );

          // Continue with next item
          continue;
        }
      }

      // Report overall results and apply CPR effects if enabled
      this.#reportAdvancementResults(results, actor);
    } finally {
      if (currentManager) await currentManager.close().catch((e) => null);
      actor.sheet.render(true);
    }
  }

  /**
   * Reports advancement processing results
   * @param {object} results - Object with success/failure arrays
   * @param {Actor} actor - Actor to apply advancements to
   * @returns {void}
   * @private
   * @static
   */
  static #reportAdvancementResults(results, actor) {
    if (results.failure.length === 0) {
      ui.notifications.info('hm.info.all-advancements-complete', { localize: true });
    } else {
      ui.notifications.warn(
        game.i18n.format('hm.warnings.some-advancements-failed', {
          failed: results.failure.join(', '),
          succeeded: results.success.join(', ')
        })
      );
    }

    // Apply CPR effects if compatibility is enabled
    if (HM.COMPAT.CPR) {
      this.#applyCPREffects(actor);
    }
  }

  /**
   * Creates advancement manager with retry capability
   * @param {Actor} actor - Actor to apply advancements to
   * @param {Item} item - Item to process
   * @param {number} retryCount - Current retry attempt
   * @returns {Promise<object>} Advancement manager
   * @private
   * @static
   */
  static async #createAdvancementManager(actor, item, retryCount = 0) {
    try {
      const manager = await Promise.race([
        dnd5e.applications.advancement.AdvancementManager.forNewItem(actor, item.toObject()),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Manager creation timed out')), this.ADVANCEMENT_DELAY.renderTimeout);
        })
      ]);

      if (!manager) throw new Error('Failed to create manager');
      return manager;
    } catch (error) {
      if (retryCount < this.ADVANCEMENT_DELAY.retryAttempts - 1) {
        HM.log(2, `Retry ${retryCount + 1}/${this.ADVANCEMENT_DELAY.retryAttempts} for ${item.name}`);
        return this.#createAdvancementManager(actor, item, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Applies CPR effects to the actor if compatibility is enabled
   * @param {Actor} actor - The actor to apply automations to
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #applyCPREffects(actor) {
    if (!actor) return;

    try {
      HM.log(3, 'Applying CPR effects to actor');
      await chrisPremades.utils.actorUtils.updateAll(actor);
      ui.notifications.info('hm.info.cpr-effects-applied', { localize: true });
    } catch (error) {
      HM.log(1, 'Error applying CPR effects:', error);
    }
  }

  /* -------------------------------------------- */
  /*  User & Ownership Management                 */
  /* -------------------------------------------- */

  /**
   * Assigns the character to the appropriate user
   * @param {Actor} actor - The created actor
   * @param {User} targetUser - The target user
   * @param {object} formData - Form data containing player assignment
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #assignCharacterToUser(actor, targetUser, formData) {
    if (game.user.isGM && formData.player && formData.player !== game.user.id) {
      try {
        await game.users.get(formData.player).update({ character: actor.id });
        HM.log(3, `Character assigned to player: ${game.users.get(formData.player).name}`);
      } catch (error) {
        HM.log(1, 'Error assigning character to player:', error);
      }
    } else {
      // Set as active character for the target user
      await targetUser.update({ character: actor.id });
    }
  }

  /**
   * Updates player customization settings
   * @param {User} targetUser - The user to update
   * @param {object} formData - Form data containing customization settings
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #updatePlayerCustomization(targetUser, formData) {
    try {
      // Update target user with customization settings
      await targetUser.update({
        color: formData['player-color'],
        pronouns: formData['player-pronouns'],
        avatar: formData['player-avatar']
      });

      // Restore original colors for other users
      for (const [userId, originalColor] of HeroMancer.ORIGINAL_PLAYER_COLORS.entries()) {
        if (userId !== targetUser.id) {
          const user = game.users.get(userId);
          if (user) {
            await user.update({ color: originalColor });
          }
        }
      }
    } catch (error) {
      HM.log(1, `Error updating user ${targetUser.name}:`, error);
    }
  }
}
