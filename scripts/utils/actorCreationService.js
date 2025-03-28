import { DOMManager, EquipmentParser, HeroMancer, HM } from './index.js';

export class ActorCreationService {
  static ADVANCEMENT_DELAY = { transitionDelay: 300, renderTimeout: 3000, retryAttempts: 3 };

  /**
   * Main handler for character creation
   * @param {Event} event - Form submission event
   * @param {FormDataExtended} formData - Processed form data
   * @returns {Promise<Actor|void>} Created actor or void if operation didn't complete
   */
  static async createCharacter(event, formData) {
    HM.log(3, 'Starting character creation');
    const targetUserId = game.user.isGM ? formData.object.player : null;
    const targetUser = game.users.get(targetUserId) || game.user;
    HM.log(3, `Target user - ${targetUser.name}`);

    try {
      // Validate required fields
      HM.log(3, 'Validating mandatory fields');
      if (!this.#validateMandatoryFields(formData.object)) return;

      // Extract equipment and wealth settings
      HM.log(3, 'Processing wealth options');
      const { useStartingWealth, startingWealth } = await this.#processWealthOptions(formData.object);
      HM.log(3, 'Wealth options', { useStartingWealth, startingWealth });

      // Collect equipment items
      HM.log(3, 'Collecting equipment items');
      const equipmentSelections = await this.#collectEquipment(event, useStartingWealth);
      HM.log(3, `Collected ${equipmentSelections.length} equipment items`);

      // Parse selected items
      HM.log(3, 'Extracting item data');
      const { backgroundData, raceData, classData } = this.#extractItemData(formData.object);
      HM.log(3, 'Item data extracted', { backgroundData, raceData, classData });
      if (!this.#validateRequiredSelections(backgroundData, raceData, classData)) return;

      // Process ability scores
      HM.log(3, 'Processing ability scores');
      const abilities = this.#processAbilityScores(formData.object);
      HM.log(3, 'Processed abilities', abilities);

      // Create the actor
      HM.log(3, 'Creating actor document');
      const actor = await this.#createActorDocument(formData.object, abilities, targetUserId);
      HM.log(3, `Actor created with ID ${actor.id}`);

      // Fetch compendium items
      HM.log(3, 'Fetching compendium items');
      const { backgroundItem, raceItem, classItem } = await this.#fetchCompendiumItems(backgroundData, raceData, classData);
      if (!backgroundItem || !raceItem || !classItem) return;
      HM.log(3, 'Compendium items fetched successfully');

      // Add equipment, process favorites, update currency
      HM.log(3, 'Processing equipment and favorites');
      await this.#processEquipmentAndFavorites(actor, equipmentSelections, event, startingWealth);

      // Process advancements for class, race, background
      HM.log(3, 'Processing advancements');
      await this.#processAdvancements([classItem, raceItem, backgroundItem], actor);

      // Set character owner
      HM.log(3, 'Assigning character to user');
      await this.#assignCharacterToUser(actor, targetUser, formData.object);

      // Update player customization if enabled
      if (game.settings.get(HM.ID, 'enablePlayerCustomization')) {
        HM.log(3, 'Updating player customization');
        await this.#updatePlayerCustomization(targetUser, formData.object);
      }

      HM.log(3, 'Character creation completed successfully');
      return actor;
    } catch (error) {
      HM.log(1, 'Error in character creation:', error);
      ui.notifications.error('hm.errors.form-submission', { localize: true });
    }
  }

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
      name: 'character-name'
    };

    // Find missing required fields
    const missingFields = mandatoryFields.filter((field) => {
      // Check if there's a mapping for this field
      const formField = fieldMappings[field] || field;
      const value = formData[formField];
      return !value || (typeof value === 'string' && value.trim() === '');
    });

    if (missingFields.length > 0) {
      ui.notifications.error(
        game.i18n.format('hm.errors.missing-mandatory-fields', {
          fields: missingFields.join(', ')
        })
      );
      return false;
    }

    return true;
  }

  /**
   * Processes starting wealth options from form data
   * @param {object} formData - Form data containing wealth options
   * @returns {Promise<{useStartingWealth: boolean, startingWealth: object|null}>}
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

    return { useStartingWealth, startingWealth };
  }

  /**
   * Collects equipment selections from the form
   * @param {Event} event - Form submission event
   * @param {boolean} useStartingWealth - Whether starting wealth is being used
   * @returns {Promise<Array<object>>} Equipment items to be created
   * @private
   * @static
   */
  static async #collectEquipment(event, useStartingWealth) {
    // Get background equipment (always collected)
    const backgroundEquipment = await EquipmentParser.collectEquipmentSelections(event, {
      includeClass: false,
      includeBackground: true
    });

    // Get class equipment (only if not using starting wealth)
    const classEquipment =
      !useStartingWealth ?
        await EquipmentParser.collectEquipmentSelections(event, {
          includeClass: true,
          includeBackground: false
        })
      : [];

    return [...backgroundEquipment, ...classEquipment];
  }

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
    // They can be in format abilities[str] or abilities[str].score
    for (const key in formData) {
      const abilityMatch = key.match(/^abilities\[(\w+)]\.score$/) || key.match(/^abilities\[(\w+)]$/);
      if (abilityMatch) {
        const abilityKey = abilityMatch[1];
        abilities[abilityKey] = formData[key] || 10;
      }
    }

    return abilities;
  }

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
    // Build actor data object
    const actorName = formData['character-name'] || game.user.name;
    const actorData = {
      name: actorName,
      img: formData['character-art'],
      prototypeToken: this.#transformTokenData(formData),
      type: 'character',
      system: {
        abilities: Object.fromEntries(Object.entries(abilities).map(([key, value]) => [key, { value }])),
        details: {
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
        }
      }
    };

    // Set ownership appropriately when character is created by GM
    if (game.user.isGM && targetUserId) {
      actorData.ownership = {
        default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
        [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER,
        [targetUserId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
      };
    }

    ui.notifications.info('hm.actortab-button.creating', { localize: true });
    const actor = await Actor.create(actorData);
    HM.log(3, 'Created Actor:', actor);

    return actor;
  }

  /**
   * Transforms form data into a token configuration object
   * @param {object} formData - Form data containing token settings
   * @returns {object} Token data object for Foundry VTT
   * @private
   * @static
   */
  static #transformTokenData(formData) {
    try {
      const tokenData = {
        texture: {
          src: formData['token-art'] || formData['character-art'] || 'icons/svg/mystery-man.svg',
          scaleX: 1,
          scaleY: 1
        },
        sight: { enabled: true },
        disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
        actorLink: true
      };

      if (game.settings.get(HM.ID, 'enableTokenCustomization')) {
        if (formData.displayName) tokenData.displayName = parseInt(formData.displayName);
        if (formData.displayBars) tokenData.displayBars = parseInt(formData.displayBars);

        tokenData.bar1 = { attribute: formData['bar1.attribute'] || null };
        tokenData.bar2 = { attribute: formData['bar2.attribute'] || null };

        tokenData.ring = {
          enabled: formData['ring.enabled'] || false,
          colors: {
            ring: formData['ring.color'] || null,
            background: formData.backgroundColor || null
          },
          effects: this.#calculateRingEffects(formData['ring.effects'])
        };
      }

      return tokenData;
    } catch (error) {
      HM.log(1, 'Error in #transformTokenData:', error);
      return CONFIG.Actor.documentClass.prototype.prototypeToken;
    }
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

  /**
   * Processes equipment items, favorites, and currency
   * @param {Actor} actor - The actor document
   * @param {Array<object>} equipment - Equipment items to add
   * @param {Event} event - Form submission event
   * @param {object} startingWealth - Starting wealth to set
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #processEquipmentAndFavorites(actor, equipment, event, startingWealth) {
    try {
      // Create equipment items
      const createdItems = equipment.length ? await actor.createEmbeddedDocuments('Item', equipment, { keepId: true }) : [];

      // Process favorites
      const favoriteCheckboxes = event.target.querySelectorAll('.equipment-favorite-checkbox:checked');
      if (favoriteCheckboxes.length > 0) {
        await this.#processFavorites(actor, favoriteCheckboxes, createdItems);
      }

      // Set starting wealth if provided
      if (startingWealth) {
        await actor.update({
          system: { currency: startingWealth }
        });
      }
    } catch (error) {
      HM.log(1, 'Error processing equipment:', error);
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
      const newFavorites = [];

      for (const checkbox of favoriteCheckboxes) {
        const itemName = checkbox.dataset.itemName;
        let itemUuids = [];

        if (checkbox.dataset.itemUuids) {
          itemUuids = checkbox.dataset.itemUuids.split(',');
        } else if (checkbox.id && checkbox.id.includes(',')) {
          itemUuids = checkbox.id.split(',');
        } else if (checkbox.dataset.itemId) {
          itemUuids = [checkbox.dataset.itemId];
        } else {
          continue;
        }

        for (const uuid of itemUuids) {
          try {
            let matchedItems = [];

            if (uuid.startsWith('Compendium.')) {
              const sourceItem = await fromUuid(uuid);
              if (sourceItem) {
                const matchedItem = createdItems.find((item) => item.name === sourceItem.name || (item.flags?.core?.sourceId && item.flags.core.sourceId.includes(sourceItem.id)));
                if (matchedItem) matchedItems = [matchedItem];
              }
            }

            for (const item of matchedItems) {
              newFavorites.push({
                type: 'item',
                id: `.Item.${item.id}`,
                sort: 100000 + newFavorites.length
              });
            }
          } catch (error) {
            HM.log(2, `Error processing UUID ${uuid}:`, error);
          }
        }
      }

      if (newFavorites.length > 0) {
        // Add new favorites without duplicates
        const combinedFavorites = [...currentActorFavorites];
        for (const newFav of newFavorites) {
          if (!combinedFavorites.some((fav) => fav.id === newFav.id)) {
            combinedFavorites.push(newFav);
          }
        }

        await actor.update({ 'system.favorites': combinedFavorites });
      }
    } catch (error) {
      HM.log(1, 'Error processing favorites:', error);
    }
  }

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

    // Separate items with and without advancements
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

    // Process items with advancements
    await this.#runAdvancementManagers(itemsWithAdvancements, actor);

    // Add items without advancements directly
    if (itemsWithoutAdvancements.length) {
      try {
        const itemData = itemsWithoutAdvancements.map((item) => item.toObject());
        await actor.createEmbeddedDocuments('Item', itemData);
      } catch (error) {
        HM.log(1, 'Error adding items without advancements:', error);
        ui.notifications.error(`Failed to add items: ${error.message}`);
      }
    }

    // Generate character summary
    try {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker(),
        content: DOMManager.generateCharacterSummaryChatMessage(),
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

    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        HM.log(3, `Processing advancements for ${item.name}`);

        try {
          currentManager = await this.#createAdvancementManager(actor, item);

          await new Promise((resolve) => {
            Hooks.once('dnd5e.advancementManagerComplete', async () => {
              HM.log(3, `Completed advancements for ${item.name}`);
              await new Promise((resolve) => {
                setTimeout(resolve, this.ADVANCEMENT_DELAY.transitionDelay);
              });
              currentManager = null;
              resolve();
            });

            currentManager.render(true);
          });
        } catch (error) {
          HM.log(1, `Error processing advancements for ${item.name}:`, error);
          ui.notifications.warn(
            game.i18n.format('hm.warnings.advancement-failed', {
              item: item.name
            })
          );
        }
      }
    } finally {
      if (currentManager) await currentManager.close().catch((e) => null);
      actor.sheet.render(true);
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
