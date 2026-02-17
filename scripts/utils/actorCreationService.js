/* global Actor */
import { CharacterApprovalService, EquipmentCollection, EquipmentManager, HeroMancer, HM, MODULE, SavedOptions, SummaryMessage } from './index.js';
import { log } from './logger.mjs';

/**
 * Service class that handles character creation in the Hero Mancer
 * @class
 */
export class ActorCreationService {
  static ADVANCEMENT_DELAY = { transitionDelay: 300, renderTimeout: 3000, retryAttempts: 3 };

  /**
   * Main handler for character creation
   * @param {Event} event - Form submission event
   * @param {object} formData - Processed form data
   * @returns {Promise<Actor|void>} Created actor or void if operation didn't complete
   * @static
   */
  static async createCharacter(event, formData) {
    const canCreateActor = game.user.can('ACTOR_CREATE') || game.user.isGM;
    if (!canCreateActor) return await this.#submitForApproval(event, formData);
    const targetUser = this.#determineTargetUser(formData);
    log(3, `Starting character creation for ${targetUser.name} (GM: ${game.user.isGM})`);
    if (!this.#validateMandatoryFields(formData.object)) return;
    const { useClassWealth, useBackgroundWealth, startingWealth } = await this.#processWealthOptions(formData.object);
    const equipmentSelections = await this.#collectEquipment(event, useClassWealth, useBackgroundWealth);
    const characterData = this.#extractCharacterData(formData.object);
    if (!this.#validateCharacterData(characterData)) return;
    const actor = await this.#createAndSetupActor(formData.object, characterData, targetUser);
    await this.#processItemsAndAdvancements(actor, characterData, equipmentSelections, event, startingWealth);
    return actor;
  }

  /**
   * Create a character for another player (GM only) - creates actor without advancements
   * @param {object} characterData - The stored character data
   * @param {object} targetUser - The user to create the character for
   * @returns {Promise<Actor|void>} Created actor or void if operation didn't complete
   * @static
   */
  static async createCharacterForPlayer(characterData, targetUser) {
    if (!game.user.isGM) return;
    const formData = characterData.formData || {};
    if (!this.#validateMandatoryFields(formData)) return;
    const extractedCharacterData = this.#extractCharacterData(formData);
    if (!this.#validateCharacterData(extractedCharacterData)) return;
    return await this.#createActorDocumentForPlayer(formData, extractedCharacterData.abilities, targetUser);
  }

  /**
   * Continue character creation with advancements (called on player's client after GM approval)
   * @param {string} actorId - The ID of the actor to continue creating
   * @param {object} characterData - The stored character data
   * @returns {Promise<Actor|void>} Completed actor or void if operation didn't complete
   * @static
   */
  static async continueCharacterCreation(actorId, characterData) {
    log(3, `Continuing creation with advancements for actor ${actorId}`);
    const actor = game.actors.get(actorId);
    if (!actor) return;
    const formData = characterData.formData || {};
    const { startingWealth } = await this.#processWealthOptions(formData);
    const extractedCharacterData = this.#extractCharacterData(formData);
    const { backgroundItem, raceItem, classItem } = await this.#fetchCompendiumItems(extractedCharacterData.backgroundData, extractedCharacterData.raceData, extractedCharacterData.classData);
    if (!backgroundItem || !raceItem || !classItem) return;
    const expectedItems = { background: { name: backgroundItem.name, type: 'background' }, race: { name: raceItem.name, type: 'race' }, class: { name: classItem.name, type: 'class' } };
    if (startingWealth) await this.#updateActorCurrency(actor, startingWealth);
    const orderedItems = this.#getOrderedAdvancementItems(backgroundItem, raceItem, classItem);
    await this.#processAdvancements(orderedItems, actor, expectedItems);
    return actor;
  }

  /**
   * Submit character for GM approval when player lacks ACTOR_CREATE permission
   * @param {Event} _event - Form submission event (unused)
   * @param {object} formData - Processed form data
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #submitForApproval(_event, formData) {
    if (!this.#validateMandatoryFields(formData.object)) {
      ui.notifications.warn('hm.errors.mandatory-fields-incomplete', { localize: true });
      return;
    }
    const characterData = this.#extractCharacterData(formData.object);
    if (!this.#validateCharacterData(characterData)) return;
    await SavedOptions.saveOptions(formData.object);
    const submissionData = { formData: formData.object, timestamp: Date.now() };
    await CharacterApprovalService.submitForApproval(submissionData, game.user);
    if (HM.heroMancer) await HM.heroMancer.close();
  }

  /**
   * Creates actor document with ownership for a target player (GM use only)
   * @param {object} formData - Form data containing character details
   * @param {object} abilities - Processed ability scores
   * @param {object} targetUser - The user to assign ownership to
   * @returns {Promise<Actor>} The created actor
   * @private
   * @static
   */
  static async #createActorDocumentForPlayer(formData, abilities, targetUser) {
    const actorName = formData['character-name'] || targetUser.name;
    const actorData = this.#buildActorData(formData, abilities, actorName);
    actorData.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER, [targetUser.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
    ui.notifications.info('hm.actortab-button.creating', { localize: true });
    const actor = await Actor.create(actorData);
    await targetUser.update({ character: actor.id });
    return actor;
  }

  /**
   * Determines the target user for the character
   * @param {object} formData - Form data containing player selection
   * @returns {object} The target user object
   * @private
   * @static
   */
  static #determineTargetUser(formData) {
    const targetUserId = game.user.isGM ? formData.object.player : null;
    return game.users.get(targetUserId) || game.user;
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
   * @param {object} targetUser - The target user for this character
   * @returns {Promise<Actor>} The created actor
   * @private
   * @static
   */
  static async #createAndSetupActor(formData, characterData, targetUser) {
    const actor = await this.#createActorDocument(formData, characterData.abilities, targetUser.id);
    await this.#assignCharacterToUser(actor, targetUser, formData);
    if (game.settings.get(MODULE.ID, 'enablePlayerCustomization')) await this.#updatePlayerCustomization(targetUser, formData);
    return actor;
  }

  /**
   * Processes items and advancements for the created actor
   * @param {object} actor - The created actor
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
    const expectedItems = { background: { name: backgroundItem.name, type: 'background' }, race: { name: raceItem.name, type: 'race' }, class: { name: classItem.name, type: 'class' } };
    await this.#processEquipmentAndFavorites(actor, equipment, event, startingWealth);
    const orderedItems = this.#getOrderedAdvancementItems(backgroundItem, raceItem, classItem);
    await this.#processAdvancements(orderedItems, actor, expectedItems);
  }

  /**
   * Gets advancement items in the configured order
   * @param {object} backgroundItem - Background item
   * @param {object} raceItem - Race item
   * @param {object} classItem - Class item
   * @returns {Array<object>} Items ordered according to GM settings
   * @private
   * @static
   */
  static #getOrderedAdvancementItems(backgroundItem, raceItem, classItem) {
    const orderConfig = game.settings.get(MODULE.ID, 'advancementOrder');
    const itemMap = { background: backgroundItem, race: raceItem, class: classItem };
    const ordered = orderConfig.filter((config) => itemMap[config.id]).sort((a, b) => a.order - b.order);
    log(3, `Advancement order resolved as [${ordered.map((c) => c.id).join(', ')}]`);
    return ordered.map((config) => itemMap[config.id]);
  }

  /**
   * Validates that all mandatory fields are filled in
   * @param {object} formData - Form data to validate
   * @returns {boolean} True if validation passed, false otherwise
   * @private
   * @static
   */
  static #validateMandatoryFields(formData) {
    const mandatoryFields = game.settings.get(MODULE.ID, 'mandatoryFields') || [];
    const fieldMappings = { name: 'character-name', race: 'race', class: 'class', background: 'background' };
    const missingFields = { basic: [], abilities: [], background: [] };
    for (const field of mandatoryFields) {
      if (field === 'abilities') continue;
      const formField = fieldMappings[field] || field;
      const value = formData[formField];
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        if (['bond', 'ideal', 'flaw', 'trait'].includes(field)) missingFields.background.push(field);
        else missingFields.basic.push(field);
      }
    }
    return Object.values(missingFields).flat().length === 0;
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
    const missing = [
      [backgroundData, 'background'],
      [raceData, 'race'],
      [classData, 'class']
    ].find(([data]) => !data?.uuid);
    if (missing) {
      ui.notifications.error(game.i18n.format('hm.errors.select-required', { type: missing[1] }));
      return false;
    }
    return true;
  }

  /**
   * Validates that required Race, Background, and Class items are present on the actor
   * @param {object} actor - The actor to validate
   * @param {object} expectedItems - Expected items with their names and types
   * @returns {object} Validation results with success status and any errors
   * @private
   * @static
   */
  static #validateRequiredItems(actor, expectedItems) {
    const validation = { success: true, errors: [], warnings: [] };
    const actorItems = actor.items;
    for (const [type, expected] of Object.entries(expectedItems)) {
      const items = actorItems.filter((item) => item.type === type);
      if (items.length === 0) {
        validation.errors.push(game.i18n.format(`hm.validation.missing-${type}`, { expected: expected?.name ?? '?' }));
        validation.success = false;
      } else if (items.length > 1) {
        validation.warnings.push(game.i18n.format('hm.validation.multiple-items', { type: game.i18n.localize(`hm.app.tab-names.${type}`), items: items.map((i) => i.name).join(', ') }));
      } else if (expected && items[0].name !== expected.name) {
        validation.warnings.push(game.i18n.format('hm.validation.item-mismatch', { type: game.i18n.localize(`hm.app.tab-names.${type}`), expected: expected.name, actual: items[0].name }));
      }
    }
    return validation;
  }

  /**
   * Processes starting wealth options from form data
   * @param {object} formData - Form data containing wealth options
   * @returns {Promise<{useClassWealth: boolean, useBackgroundWealth: boolean, startingWealth: object|null}>} Wealth options
   * @private
   * @static
   */
  static async #processWealthOptions(formData) {
    const useClassWealth = formData['use-starting-wealth-class'];
    const useBackgroundWealth = formData['use-starting-wealth-background'];
    const useStartingWealth = useClassWealth || useBackgroundWealth;
    const startingWealth = useStartingWealth ? await EquipmentManager.convertWealthToCurrency(formData) : null;
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
    const backgroundEquipment = !useBackgroundWealth ? await EquipmentCollection.collectSelections(event, { includeClass: false, includeBackground: true }) : [];
    const classEquipment = !useClassWealth ? await EquipmentCollection.collectSelections(event, { includeClass: true, includeBackground: false }) : [];
    return [...backgroundEquipment, ...classEquipment];
  }

  /**
   * Processes equipment items, favorites, and currency
   * @param {object} actor - The actor to update
   * @param {Array<object>} equipment - Equipment items to add
   * @param {Event} _event - Form submission event
   * @param {object} startingWealth - Starting wealth to set
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #processEquipmentAndFavorites(actor, equipment, _event, startingWealth) {
    log(3, `Processing ${equipment.length} equipment items, startingWealth: ${!!startingWealth}`);
    await this.#createEquipmentItems(actor, equipment);
    if (startingWealth) await this.#updateActorCurrency(actor, startingWealth);
  }

  /**
   * Creates equipment items on the actor
   * @param {object} actor - The actor to update
   * @param {Array<object>} equipment - Equipment data to create
   * @returns {Promise<Array<object>>} Created items
   * @private
   * @static
   */
  static async #createEquipmentItems(actor, equipment) {
    if (!equipment.length) return [];
    const fullyLoadedEquipment = await Promise.all(
      equipment.map(async (item) => {
        if (item.pack && (!item.system?.activities || Object.keys(item.system).length < 5)) {
          const pack = game.packs.get(item.pack);
          if (pack) {
            const fullItem = await pack.getDocument(item._id);
            if (fullItem) return { ...fullItem.toObject(), system: { ...fullItem.system, quantity: item.system?.quantity || 1, equipped: item.system?.equipped || true } };
          }
        }
        return item;
      })
    );
    return await actor.createEmbeddedDocuments('Item', fullyLoadedEquipment, { keepId: true });
  }

  /**
   * Updates actor currency with starting wealth
   * @param {object} actor - The actor to update
   * @param {object} currencyData - Currency data to set
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #updateActorCurrency(actor, currencyData) {
    await actor.update({ system: { currency: currencyData } });
  }

  /**
   * Extracts item IDs, pack IDs, and UUIDs from form selections
   * @param {object} formData - Form data with selections
   * @returns {object} Object containing background, race, and class data
   * @private
   * @static
   */
  static #extractItemData(formData) {
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
        if (parts.length >= 4 && parts[3] === 'Item') packId = `${parts[1]}.${parts[2]}`;
      }
      return itemId ? { itemId, packId, uuid } : null;
    };
    return { backgroundData: extractIds(formData.background), raceData: extractIds(formData.race), classData: extractIds(formData.class) };
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
    for (const key in formData) {
      const abilityMatch = key.match(/^abilities\[(\w+)]-score$/) || key.match(/^abilities\[(\w+)]$/);
      if (abilityMatch) {
        const abilityKey = abilityMatch[1];
        abilities[abilityKey] = parseInt(formData[key], 10) || game.settings.get(MODULE.ID, 'abilityScoreDefault');
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
    const actorName = formData['character-name'] || game.user.name;
    const actorData = this.#buildActorData(formData, abilities, actorName);
    if (game.user.isGM && targetUserId) actorData.ownership = this.#buildOwnershipData(targetUserId);
    ui.notifications.info('hm.actortab-button.creating', { localize: true });
    return await Actor.create(actorData);
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
      system: { abilities: Object.fromEntries(Object.entries(abilities).map(([key, value]) => [key, { value }])), details: this.#buildCharacterDetails(formData) }
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
    return { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER, [targetUserId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
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
      biography: { value: formData.backstory || '' }
    };
  }

  /**
   * Transforms form data into a token configuration object
   * @param {object} formData - Form data containing token settings
   * @returns {object} Token data object for Foundry VTT
   * @private
   * @static
   */
  static #transformTokenData(formData) {
    const tokenData = this.#createBaseTokenData(formData);
    if (game.settings.get(MODULE.ID, 'enableTokenCustomization')) this.#addTokenCustomizationData(tokenData, formData);
    return tokenData;
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
      texture: { src: formData['token-art'] || formData['character-art'] || 'icons/svg/mystery-man.svg', scaleX: 1, scaleY: 1 },
      sight: { enabled: true },
      disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
      actorLink: true
    };
  }

  /**
   * Adds customization data to the token configuration
   * @param {object} tokenData - Token data to enhance
   * @param {object} formData - Form data with token settings
   * @private
   * @static
   */
  static #addTokenCustomizationData(tokenData, formData) {
    if (formData.displayName) tokenData.displayName = parseInt(formData.displayName);
    if (formData.displayBars) tokenData.displayBars = parseInt(formData.displayBars);
    tokenData.bar1 = { attribute: formData['bar1.attribute'] || null };
    tokenData.bar2 = { attribute: formData['bar2.attribute'] || null };
    tokenData.ring = {
      enabled: formData['ring.enabled'] || false,
      colors: { ring: formData['ring.color'] || null, background: formData.backgroundColor || null },
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
    const backgroundItem = await game.packs.get(backgroundData.packId)?.getDocument(backgroundData.itemId);
    const raceItem = await game.packs.get(raceData.packId)?.getDocument(raceData.itemId);
    const classItem = await game.packs.get(classData.packId)?.getDocument(classData.itemId);
    const missing = [
      [backgroundItem, 'background'],
      [raceItem, 'race'],
      [classItem, 'class']
    ].find(([item]) => !item);
    if (missing) {
      ui.notifications.error(game.i18n.format('hm.errors.item-not-found', { type: missing[1] }), { permanent: true });
      return {};
    }
    return { backgroundItem, raceItem, classItem };
  }

  /**
   * Processes character advancement for class, race, and background
   * @param {Array<object>} items - Items to process for advancement
   * @param {object} actor - The actor to apply advancements to
   * @param {object} expectedItems - Expected items for validation
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #processAdvancements(items, actor, expectedItems = {}) {
    if (!Array.isArray(items) || !items.length) return;
    const { itemsWithAdvancements, itemsWithoutAdvancements } = this.#categorizeItemsByAdvancements(items);
    if (itemsWithAdvancements.length) await this.#runAdvancementManagers(itemsWithAdvancements, actor, expectedItems);
    if (itemsWithoutAdvancements.length) await this.#addItemsWithoutAdvancements(actor, itemsWithoutAdvancements);
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker(), content: SummaryMessage.generate(actor), flags: { 'hero-mancer': { type: 'character-summary' } } });
  }

  /**
   * Categorizes items by whether they have advancements
   * @param {Array<object>} items - Items to categorize
   * @returns {object} Object with two arrays of items
   * @private
   * @static
   */
  static #categorizeItemsByAdvancements(items) {
    const itemsWithAdvancements = [];
    const itemsWithoutAdvancements = [];
    for (const item of items) {
      const hasAdvancements = item.advancement?.byId && Object.keys(item.advancement.byId).length > 0;
      (hasAdvancements ? itemsWithAdvancements : itemsWithoutAdvancements).push(item);
    }
    return { itemsWithAdvancements, itemsWithoutAdvancements };
  }

  /**
   * Adds items without advancements directly to actor
   * @param {object} actor - Actor to add items to
   * @param {Array<object>} items - Items to add
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #addItemsWithoutAdvancements(actor, items) {
    const itemData = items.map((item) => {
      const data = item.toObject();
      data._stats = data._stats || {};
      data._stats.compendiumSource = item.uuid || null;
      return data;
    });
    await actor.createEmbeddedDocuments('Item', itemData);
  }

  /**
   * Runs advancement managers for items with advancements
   * @param {Array<object>} items - Items with advancements
   * @param {object} actor - Actor to apply advancements to
   * @param {object} expectedItems - Expected items for validation
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #runAdvancementManagers(items, actor, expectedItems = {}) {
    if (!items.length) return;
    ui.notifications.clear();
    let currentManager = null;
    const results = { success: [], failure: [] };
    try {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        log(3, `Running advancement ${i + 1}/${items.length} for "${item.name}"`);
        currentManager = await this.#createAdvancementManager(actor, item);
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error(`Advancement for ${item.name} timed out`));
          }, this.ADVANCEMENT_DELAY.renderTimeout * 300);
          Hooks.once('dnd5e.advancementManagerComplete', async () => {
            clearTimeout(timeout);
            await new Promise((resolve) => setTimeout(resolve, this.ADVANCEMENT_DELAY.transitionDelay));
            currentManager = null;
            results.success.push(item.name);
            resolve();
          });
          currentManager.render(true);
        });
      }
      await this.#reportAdvancementResults(results, actor);
      const validation = this.#validateRequiredItems(actor, expectedItems);
      if (!validation.success) ui.notifications.error(validation.errors.join('\n'), { permanent: true });
      if (validation.warnings.length > 0) ui.notifications.warn(validation.warnings.join('\n'));
    } finally {
      if (currentManager) await currentManager.close().catch(() => null);
      actor.sheet.render(true);
    }
  }

  /**
   * Reports advancement processing results
   * @param {object} results - Object with success/failure arrays
   * @param {object} actor - Actor to apply advancements to
   * @private
   * @static
   */
  static async #reportAdvancementResults(results, actor) {
    if (results.failure.length === 0) ui.notifications.info('hm.info.all-advancements-complete', { localize: true });
    else ui.notifications.warn(game.i18n.format('hm.warnings.some-advancements-failed', { failed: results.failure.join(', '), succeeded: results.success.join(', ') }));
    if (HM.COMPAT.CPR) await chrisPremades.utils.actorUtils.updateAll(actor);
  }

  /**
   * Creates advancement manager with retry capability
   * @param {object} actor - Actor to apply advancements to
   * @param {object} item - Item to process
   * @param {number} retryCount - Current retry attempt
   * @returns {Promise<object>} Advancement manager
   * @private
   * @static
   */
  static async #createAdvancementManager(actor, item, retryCount = 0) {
    try {
      const itemData = item.toObject();
      itemData._stats = itemData._stats || {};
      itemData._stats.compendiumSource = item.uuid || null;
      const manager = await Promise.race([
        dnd5e.applications.advancement.AdvancementManager.forNewItem(actor, itemData),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Manager creation timed out')), this.ADVANCEMENT_DELAY.renderTimeout);
        })
      ]);
      if (!manager) throw new Error('Failed to create manager');
      return manager;
    } catch (error) {
      if (retryCount < this.ADVANCEMENT_DELAY.retryAttempts - 1) {
        log(2, `Retry ${retryCount + 1}/${this.ADVANCEMENT_DELAY.retryAttempts} for ${item.name}`);
        return this.#createAdvancementManager(actor, item, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Assigns the character to the appropriate user
   * @param {object} actor - The created actor
   * @param {object} targetUser - The target user
   * @param {object} formData - Form data containing player assignment
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #assignCharacterToUser(actor, targetUser, formData) {
    if (game.user.isGM && formData.player && formData.player !== game.user.id) await game.users.get(formData.player).update({ character: actor.id });
    else await targetUser.update({ character: actor.id });
  }

  /**
   * Updates player customization settings
   * @param {object} targetUser - The user to update
   * @param {object} formData - Form data containing customization settings
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #updatePlayerCustomization(targetUser, formData) {
    await targetUser.update({ color: formData['player-color'], pronouns: formData['player-pronouns'], avatar: formData['player-avatar'] });
    for (const [userId, originalColor] of HeroMancer.ORIGINAL_PLAYER_COLORS.entries()) {
      if (userId !== targetUser.id) {
        const user = game.users.get(userId);
        if (user) await user.update({ color: originalColor });
      }
    }
  }
}
