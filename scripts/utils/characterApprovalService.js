import { ActorCreationService, HeroMancer, MODULE, SavedOptions } from './index.js';
import { log } from './logger.mjs';

/**
 * Service for handling character approval workflow when players lack ACTOR_CREATE permission
 * @class
 */
export class CharacterApprovalService {
  static SOCKET_NAME = `module.${MODULE.ID}`;

  static EVENTS = { SUBMIT_CHARACTER: 'submitCharacter', CHARACTER_APPROVED: 'characterApproved', CHARACTER_REJECTED: 'characterRejected' };

  static #socketCallback = null;

  /**
   * Initialize socket listeners for character approval workflow
   * @static
   * @returns {void}
   */
  static registerSocketListeners() {
    if (this.#socketCallback) game.socket.off(this.SOCKET_NAME, this.#socketCallback);
    this.#socketCallback = (data) => {
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
    }
  }

  /**
   * Submit character data for GM approval
   * @param {object} characterData - The character data to submit
   * @param {object} user - The user submitting the character
   * @returns {Promise<void>}
   * @static
   */
  static async submitForApproval(characterData, user) {
    await user.setFlag(MODULE.ID, 'pendingCharacterSubmission', { characterData, timestamp: Date.now() });
    log(3, `Submitting character for approval from ${user.name}`);
    game.socket.emit(this.SOCKET_NAME, { type: this.EVENTS.SUBMIT_CHARACTER, userId: user.id, userName: user.name, characterData });
    ui.notifications.info('hm.approval.submitted', { localize: true });
  }

  /**
   * Create actor for a player (GM only)
   * @param {object} characterData - The character data
   * @param {string} targetUserId - The ID of the user to create the actor for
   * @returns {Promise<object|null>} The created actor or null on failure
   * @static
   */
  static async createActorForPlayer(characterData, targetUserId) {
    if (!game.user.isGM) return null;
    const targetUser = game.users.get(targetUserId);
    if (!targetUser) return null;
    return await ActorCreationService.createCharacterForPlayer(characterData, targetUser);
  }

  /**
   * Handle incoming character submission (GM only)
   * @param {object} data - The submission data
   * @private
   * @static
   */
  static async #handleCharacterSubmission(data) {
    log(3, `Received character submission from ${data.userName}`);
    ui.notifications.info(game.i18n.format('hm.approval.gm-received', { name: data.userName }));
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
    const raceInfo = await this.#getItemInfoFromSelection(formData.race);
    const classInfo = await this.#getItemInfoFromSelection(formData.class);
    const backgroundInfo = await this.#getItemInfoFromSelection(formData.background);
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
    const content = await foundry.applications.handlebars.renderTemplate('modules/hero-mancer/templates/approval-review.hbs', context);
    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.format('hm.approval.review-title', { name: userName }), icon: 'fa-solid fa-user-check' },
      content,
      buttons: [
        { action: 'approve', label: game.i18n.localize('hm.approval.approve'), icon: 'fas fa-check', default: true },
        { action: 'reject', label: game.i18n.localize('hm.approval.reject'), icon: 'fas fa-times' }
      ],
      rejectClose: false,
      position: { width: 700 }
    });
    if (result === 'approve') await this.#approveCharacter(userId, characterData);
    else if (result === 'reject') await this.#rejectCharacter(userId, userName);
  }

  /**
   * Get item info from a selection string by looking up the UUID
   * @param {string} selectionString - Selection string like "id [uuid] (packId)"
   * @returns {Promise<{name: string, uuid: string}>} The item info
   * @private
   * @static
   */
  static async #getItemInfoFromSelection(selectionString) {
    if (!selectionString) return { name: game.i18n.format('hm.unknown', { type: 'selection' }), uuid: null };
    const uuidMatch = selectionString.match(/\[(.*?)]/);
    if (uuidMatch && uuidMatch[1]) {
      const item = await fromUuid(uuidMatch[1]);
      if (item) return { name: item.name, uuid: uuidMatch[1] };
    }
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
    return fields.filter((f) => formData[f.key]).map((f) => ({ label: game.i18n.localize(f.label), value: formData[f.key] }));
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
    return fields.filter((f) => formData[f.key]).map((f) => ({ label: game.i18n.localize(f.label), value: formData[f.key] }));
  }

  /**
   * Approve a character submission
   * @param {string} userId - The user's ID
   * @param {object} characterData - The character data
   * @private
   * @static
   */
  static async #approveCharacter(userId, characterData) {
    log(3, `Approving character for user ${userId}`);
    const actor = await this.createActorForPlayer(characterData, userId);
    if (actor) {
      const targetUser = game.users.get(userId);
      if (targetUser) await targetUser.unsetFlag(MODULE.ID, 'pendingCharacterSubmission');
      game.socket.emit(this.SOCKET_NAME, { type: this.EVENTS.CHARACTER_APPROVED, userId, actorId: actor.id, actorName: actor.name, characterData });
      ui.notifications.info(game.i18n.format('hm.approval.gm-approved', { name: actor.name }));
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
    const targetUser = game.users.get(userId);
    if (targetUser) await targetUser.unsetFlag(MODULE.ID, 'pendingCharacterSubmission');
    game.socket.emit(this.SOCKET_NAME, { type: this.EVENTS.CHARACTER_REJECTED, userId });
    ui.notifications.info(game.i18n.format('hm.approval.gm-rejected', { name: userName }));
  }

  /**
   * Handle approval notification (player side)
   * @param {object} data - The approval data
   * @private
   * @static
   */
  static async #handleApprovalNotification(data) {
    ui.notifications.clear();
    ui.notifications.info(game.i18n.format('hm.approval.player-approved', { name: data.actorName }));
    if (data.characterData) {
      await ActorCreationService.continueCharacterCreation(data.actorId, data.characterData);
      await SavedOptions.resetOptions();
    } else {
      const actor = game.actors.get(data.actorId);
      if (actor) actor.sheet.render(true);
    }
  }

  /**
   * Handle rejection notification (player side)
   * @private
   * @static
   */
  static async #handleRejectionNotification() {
    ui.notifications.warn('hm.approval.player-rejected-resume', { localize: true });
    new HeroMancer().render(true);
  }
}
