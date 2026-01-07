import { ActorCreationService, HM } from './index.js';

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

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Initialize socket listeners for character approval workflow
   * @static
   * @returns {void}
   */
  static registerSocketListeners() {
    game.socket.on(this.SOCKET_NAME, (data) => {
      HM.log(3, 'Socket event received:', data);
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
    });
    HM.log(3, 'Character approval socket listeners registered');
  }

  /**
   * Submit character data for GM approval
   * @param {object} characterData - The character data to submit
   * @param {User} user - The user submitting the character
   * @returns {Promise<void>}
   * @static
   */
  static async submitForApproval(characterData, user) {
    HM.log(3, 'Submitting character for GM approval:', { characterData, userId: user.id });

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
    HM.log(3, 'Character submission sent to GMs');
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
      HM.log(1, 'Only GMs can create actors for other players');
      return null;
    }

    const targetUser = game.users.get(targetUserId);
    if (!targetUser) {
      HM.log(1, 'Target user not found:', targetUserId);
      return null;
    }

    try {
      HM.log(3, 'GM creating actor for player:', { targetUserId, characterData });
      const actor = await ActorCreationService.createCharacterForPlayer(characterData, targetUser);
      return actor;
    } catch (error) {
      HM.log(1, 'Error creating actor for player:', error);
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
    HM.log(3, 'GM received character submission:', data);

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

    // Build summary content
    const characterName = formData['character-name'] || game.i18n.localize('hm.approval.unnamed');
    const raceLabel = formData.race?.split(' ')[0] || game.i18n.localize('hm.unknown');
    const classLabel = formData.class?.split(' ')[0] || game.i18n.localize('hm.unknown');
    const backgroundLabel = formData.background?.split(' ')[0] || game.i18n.localize('hm.unknown');

    const content = `
      <div class="hm-approval-review">
        <p><strong>${game.i18n.localize('hm.approval.player')}:</strong> ${userName}</p>
        <p><strong>${game.i18n.localize('hm.approval.character-name')}:</strong> ${characterName}</p>
        <p><strong>${game.i18n.localize('hm.app.race.select-label')}:</strong> ${raceLabel}</p>
        <p><strong>${game.i18n.localize('hm.app.class.select-label')}:</strong> ${classLabel}</p>
        <p><strong>${game.i18n.localize('hm.app.background.select-label')}:</strong> ${backgroundLabel}</p>
      </div>
    `;

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
      rejectClose: false
    });

    if (result === 'approve') {
      await this.#approveCharacter(userId, characterData);
    } else if (result === 'reject') {
      await this.#rejectCharacter(userId, userName);
    }
  }

  /**
   * Approve a character submission
   * @param {string} userId - The user's ID
   * @param {object} characterData - The character data
   * @private
   * @static
   */
  static async #approveCharacter(userId, characterData) {
    HM.log(3, 'Approving character for user:', userId);

    try {
      // Create the actor
      const actor = await this.createActorForPlayer(characterData, userId);

      if (actor) {
        // Clear the pending submission flag
        const targetUser = game.users.get(userId);
        if (targetUser) {
          await targetUser.unsetFlag(HM.ID, 'pendingCharacterSubmission');
        }

        // Notify the player
        game.socket.emit(this.SOCKET_NAME, {
          type: this.EVENTS.CHARACTER_APPROVED,
          userId,
          actorId: actor.id,
          actorName: actor.name
        });

        ui.notifications.info(game.i18n.format('hm.approval.gm-approved', { name: actor.name }));
      }
    } catch (error) {
      HM.log(1, 'Error approving character:', error);
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
    HM.log(3, 'Rejecting character for user:', userId);

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
  static #handleApprovalNotification(data) {
    HM.log(3, 'Character approved:', data);
    ui.notifications.info(game.i18n.format('hm.approval.player-approved', { name: data.actorName }));

    // Open the actor sheet
    const actor = game.actors.get(data.actorId);
    if (actor) {
      actor.sheet.render(true);
    }
  }

  /**
   * Handle rejection notification (player side)
   * @param {object} data - The rejection data
   * @private
   * @static
   */
  static #handleRejectionNotification(data) {
    HM.log(3, 'Character rejected:', data);
    ui.notifications.warn(game.i18n.localize('hm.approval.player-rejected'));
  }
}
