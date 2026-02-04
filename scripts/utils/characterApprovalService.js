import { ActorCreationService, HM, SavedOptions } from './index.js';
import { log } from './logger.mjs';

/**
 * Service for handling character approval workflow when players lack ACTOR_CREATE permission
 * @class
 */
export class CharacterApprovalService {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /**
   * Socket event namespace
   * @static
   * @type {string}
   */
  static SOCKET_NAME = `module.${HM.ID}`;

  /**
   * Socket event types
   * @static
   * @type {object}
   */
  static EVENTS = {
    SUBMIT_CHARACTER: 'submitCharacter',
    CHARACTER_APPROVED: 'characterApproved',
    CHARACTER_REJECTED: 'characterRejected'
  };

  /**
   * Socket callback reference for cleanup
   * @static
   * @type {Function|null}
   * @private
   */
  static #socketCallback = null;

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Initialize socket listeners for character approval workflow
   * @static
   * @returns {void}
   */
  static registerSocketListeners() {
    // Clean up existing listener if re-registering
    if (this.#socketCallback) {
      game.socket.off(this.SOCKET_NAME, this.#socketCallback);
    }

    this.#socketCallback = (data) => {
      log(3, 'Socket event received:', data);
      switch (data.type) {
        case this.EVENTS.SUBMIT_CHARACTER:
          if (game.user.isGM) this.#handleCharacterSubmission(data);
          break;
        case this.EVENTS.CHARACTER_APPROVED:
          if (data.userId === game.user.id) this.#handleApprovalNotification(data);
          break;
        case this.EVENTS.CHARACTER_REJECTED:
          if (data.userId === game.user.id) this.#handleRejectionNotification(data);
          break;
      }
    };

    game.socket.on(this.SOCKET_NAME, this.#socketCallback);
    log(3, 'Character approval socket listeners registered');
  }

  /**
   * Unregister socket listeners for cleanup
   * @static
   * @returns {void}
   */
  static unregisterSocketListeners() {
    if (this.#socketCallback) {
      game.socket.off(this.SOCKET_NAME, this.#socketCallback);
      this.#socketCallback = null;
      log(3, 'Character approval socket listeners unregistered');
    }
  }

  /**
   * Submit character data for GM approval
   * @param {object} characterData - The character data to submit
   * @param {User} user - The user submitting the character
   * @returns {Promise<void>}
   * @static
   */
  static async submitForApproval(characterData, user) {
    log(3, 'Submitting character for GM approval:', { characterData, userId: user.id });

    // Store the pending submission in user flags
    await user.setFlag(HM.ID, 'pendingCharacterSubmission', {
      characterData,
      timestamp: Date.now()
    });

    // Emit socket event to notify GMs
    game.socket.emit(this.SOCKET_NAME, {
      type: this.EVENTS.SUBMIT_CHARACTER,
      userId: user.id,
      userName: user.name,
      characterData
    });

    ui.notifications.info(game.i18n.localize('hm.approval.submitted'));
    log(3, 'Character submission sent to GMs');
  }

  /**
   * Create actor for a player (GM only)
   * @param {object} characterData - The character data
   * @param {string} targetUserId - The ID of the user to create the actor for
   * @returns {Promise<Actor|null>} The created actor or null on failure
   * @static
   */
  static async createActorForPlayer(characterData, targetUserId) {
    if (!game.user.isGM) {
      log(1, 'Only GMs can create actors for other players');
      return null;
    }

    const targetUser = game.users.get(targetUserId);
    if (!targetUser) {
      log(1, 'Target user not found:', targetUserId);
      return null;
    }

    try {
      log(3, 'GM creating actor for player:', { targetUserId, characterData });
      const actor = await ActorCreationService.createCharacterForPlayer(characterData, targetUser);
      return actor;
    } catch (error) {
      log(1, 'Error creating actor for player:', error);
      return null;
    }
  }

  /* -------------------------------------------- */
  /*  Private Methods                             */
  /* -------------------------------------------- */

  /**
   * Handle incoming character submission (GM only)
   * @param {object} data - The submission data
   * @private
   * @static
   */
  static async #handleCharacterSubmission(data) {
    log(3, 'GM received character submission:', data);

    // Show notification to GM
    ui.notifications.info(game.i18n.format('hm.approval.gm-received', { name: data.userName }));

    // Show review dialog
    await this.#showReviewDialog(data);
  }

  /**
   * Show the character review dialog for GM
   * @param {object} data - The submission data
   * @private
   * @static
   */
  static async #showReviewDialog(data) {
    const { characterData, userId, userName } = data;
    const formData = characterData.formData || {};

    // Get proper item names from UUIDs
    const raceInfo = await this.#getItemInfoFromSelection(formData.race);
    const classInfo = await this.#getItemInfoFromSelection(formData.class);
    const backgroundInfo = await this.#getItemInfoFromSelection(formData.background);

    // Prepare template context
    const context = {
      characterName: formData['character-name'] || game.i18n.localize('hm.approval.unnamed'),
      portraitPath: formData['character-art'] || 'icons/svg/mystery-man.svg',
      raceName: raceInfo.name,
      className: classInfo.name,
      backgroundName: backgroundInfo.name,
      userName,
      abilities: this.#extractAbilityScores(formData),
      physical: this.#getPhysicalData(formData),
      hasPhysical: this.#getPhysicalData(formData).length > 0,
      personality: this.#getPersonalityData(formData),
      hasPersonality: this.#getPersonalityData(formData).length > 0,
      backstory: formData.backstory || null
    };

    // Render template
    const content = await renderTemplate('modules/hero-mancer/templates/approval-review.hbs', context);

    const result = await foundry.applications.api.DialogV2.wait({
      window: {
        title: game.i18n.format('hm.approval.review-title', { name: userName }),
        icon: 'fa-solid fa-user-check'
      },
      content,
      buttons: [
        {
          action: 'approve',
          label: game.i18n.localize('hm.approval.approve'),
          icon: 'fas fa-check',
          default: true
        },
        {
          action: 'reject',
          label: game.i18n.localize('hm.approval.reject'),
          icon: 'fas fa-times'
        }
      ],
      rejectClose: false,
      position: { width: 700 }
    });

    if (result === 'approve') {
      await this.#approveCharacter(userId, characterData);
    } else if (result === 'reject') {
      await this.#rejectCharacter(userId, userName);
    }
  }

  /**
   * Get item info from a selection string by looking up the UUID
   * @param {string} selectionString - Selection string like "id [uuid] (packId)"
   * @returns {Promise<{name: string, uuid: string}>}
   * @private
   * @static
   */
  static async #getItemInfoFromSelection(selectionString) {
    if (!selectionString) return { name: game.i18n.localize('hm.unknown'), uuid: null };

    try {
      // Extract UUID from the selection string
      const uuidMatch = selectionString.match(/\[(.*?)]/);
      if (uuidMatch && uuidMatch[1]) {
        const item = await fromUuid(uuidMatch[1]);
        if (item) return { name: item.name, uuid: uuidMatch[1] };
      }
    } catch (error) {
      log(2, 'Error fetching item info:', error);
    }

    // Fallback to ID parsing
    const idPart = selectionString.split(' ')[0];
    return { name: idPart, uuid: null };
  }

  /**
   * Extract ability scores from form data with modifiers
   * @param {object} formData - Form data object
   * @returns {object} Ability scores keyed by abbreviation with score and mod
   * @private
   * @static
   */
  static #extractAbilityScores(formData) {
    const abilities = {};
    const abilityKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

    for (const key of abilityKeys) {
      const score = formData[`abilities[${key}]-score`] || formData[`abilities[${key}]`] || '—';
      const numScore = parseInt(score);
      const mod = isNaN(numScore) ? '—' : Math.floor((numScore - 10) / 2);
      const modStr = typeof mod === 'number' ? (mod >= 0 ? `+${mod}` : `${mod}`) : mod;

      abilities[key] = { score, mod: modStr };
    }

    return abilities;
  }

  /**
   * Get physical description data for template
   * @param {object} formData - Form data object
   * @returns {Array<{label: string, value: string}>} Physical field data
   * @private
   * @static
   */
  static #getPhysicalData(formData) {
    const fields = [
      { key: 'gender', label: 'DND5E.Gender' },
      { key: 'age', label: 'DND5E.Age' },
      { key: 'height', label: 'DND5E.Height' },
      { key: 'weight', label: 'DND5E.Weight' },
      { key: 'eyes', label: 'DND5E.Eyes' },
      { key: 'hair', label: 'DND5E.Hair' },
      { key: 'skin', label: 'DND5E.Skin' },
      { key: 'alignment', label: 'DND5E.Alignment' },
      { key: 'faith', label: 'DND5E.Faith' }
    ];

    return fields
      .filter((f) => formData[f.key])
      .map((f) => ({
        label: game.i18n.localize(f.label),
        value: formData[f.key]
      }));
  }

  /**
   * Get personality traits data for template
   * @param {object} formData - Form data object
   * @returns {Array<{label: string, value: string}>} Personality field data
   * @private
   * @static
   */
  static #getPersonalityData(formData) {
    const fields = [
      { key: 'traits', label: 'DND5E.PersonalityTraits' },
      { key: 'ideals', label: 'DND5E.Ideals' },
      { key: 'bonds', label: 'DND5E.Bonds' },
      { key: 'flaws', label: 'DND5E.Flaws' }
    ];

    return fields
      .filter((f) => formData[f.key])
      .map((f) => ({
        label: game.i18n.localize(f.label),
        value: formData[f.key]
      }));
  }

  /**
   * Approve a character submission
   * @param {string} userId - The user's ID
   * @param {object} characterData - The character data
   * @private
   * @static
   */
  static async #approveCharacter(userId, characterData) {
    log(3, 'Approving character for user:', userId);

    try {
      // Create the actor (without advancements - those will be processed on player's client)
      const actor = await this.createActorForPlayer(characterData, userId);

      if (actor) {
        // Clear the pending submission flag
        const targetUser = game.users.get(userId);
        if (targetUser) {
          await targetUser.unsetFlag(HM.ID, 'pendingCharacterSubmission');
        }

        // Notify the player and send character data for advancement processing
        game.socket.emit(this.SOCKET_NAME, {
          type: this.EVENTS.CHARACTER_APPROVED,
          userId,
          actorId: actor.id,
          actorName: actor.name,
          characterData
        });

        ui.notifications.info(game.i18n.format('hm.approval.gm-approved', { name: actor.name }));
      }
    } catch (error) {
      log(1, 'Error approving character:', error);
      ui.notifications.error(game.i18n.localize('hm.approval.error'));
    }
  }

  /**
   * Reject a character submission
   * @param {string} userId - The user's ID
   * @param {string} userName - The user's name
   * @private
   * @static
   */
  static async #rejectCharacter(userId, userName) {
    log(3, 'Rejecting character for user:', userId);

    // Clear the pending submission flag
    const targetUser = game.users.get(userId);
    if (targetUser) {
      await targetUser.unsetFlag(HM.ID, 'pendingCharacterSubmission');
    }

    // Notify the player
    game.socket.emit(this.SOCKET_NAME, {
      type: this.EVENTS.CHARACTER_REJECTED,
      userId
    });

    ui.notifications.info(game.i18n.format('hm.approval.gm-rejected', { name: userName }));
  }

  /**
   * Handle approval notification (player side)
   * @param {object} data - The approval data
   * @private
   * @static
   */
  static async #handleApprovalNotification(data) {
    log(3, 'Character approved, continuing creation:', data);
    ui.notifications.info(game.i18n.format('hm.approval.player-approved', { name: data.actorName }));

    // Continue character creation with advancements on player's client
    if (data.characterData) {
      await ActorCreationService.continueCharacterCreation(data.actorId, data.characterData);

      // Clear saved options now that character is fully created
      await SavedOptions.resetOptions();
    } else {
      // Fallback: just open the actor sheet if no character data provided
      const actor = game.actors.get(data.actorId);
      if (actor) {
        actor.sheet.render(true);
      }
    }
  }

  /**
   * Handle rejection notification (player side)
   * @param {object} data - The rejection data
   * @private
   * @static
   */
  static async #handleRejectionNotification(data) {
    log(3, 'Character rejected, reopening Hero Mancer:', data);
    ui.notifications.warn(game.i18n.localize('hm.approval.player-rejected-resume'));

    // Reopen Hero Mancer so player can make changes
    const { HeroMancer } = await import('../app/HeroMancer.js');
    new HeroMancer().render(true);
  }
}
