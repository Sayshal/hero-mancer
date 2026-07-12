import { MODULE } from '../constants.mjs';
import { openRestoreChooser } from './rejection-handler.mjs';

const VARIANT_ICON = { submitted: 'fa-clipboard-check', approved: 'fa-circle-check', rejected: 'fa-circle-xmark' };

/**
 * Resolve whisper recipients: every GM plus the submitting player, deduped.
 * @param {string} submitterUserId Foundry user id of the submitter.
 * @returns {string[]} Recipient user ids.
 */
function recipients(submitterUserId) {
  const ids = new Set(game.users.filter((user) => user.isGM).map((user) => user.id));
  if (submitterUserId) ids.add(submitterUserId);
  return [...ids];
}

/**
 * Whisper a themed approval-lifecycle card to all GMs + the submitting player. Created once on the acting client (submitter for submit, active GM for approve/reject).
 * @param {object} event Event descriptor.
 * @param {string} event.variant Lifecycle stage: submitted, approved, or rejected.
 * @param {string} event.characterName Submitted character name.
 * @param {string} event.submitterUserId Foundry user id of the submitter.
 * @param {string} [event.submitterName] Display name of the submitter.
 * @param {string} [event.reason] Rejection reason, when rejected.
 * @param {string} [event.actorUuid] Created actor uuid, when approved after a GM edit.
 * @param {string} [event.payload] Submission payload JSON, stored on the rejected card so the player can re-open + restore it after a refresh.
 * @returns {Promise<void>}
 */
export async function publishApprovalEvent({ variant, characterName, submitterUserId, submitterName, reason, actorUuid, payload }) {
  try {
    const name = foundry.utils.escapeHTML(characterName || _loc('HEROMANCER.Approval.Unnamed'));
    const player = foundry.utils.escapeHTML(submitterName || game.users.get(submitterUserId)?.name || '');
    const anchorDoc = variant === 'approved' && actorUuid ? await fromUuid(actorUuid) : null;
    const content = await foundry.applications.handlebars.renderTemplate(MODULE.TEMPLATES.CHAT.APPROVAL_EVENT, {
      variant,
      icon: VARIANT_ICON[variant],
      headline: _loc(`HEROMANCER.Chat.Approval.${variant}`, { name, player }),
      reason: reason ? foundry.utils.escapeHTML(reason) : null,
      review: variant === 'submitted',
      rejected: variant === 'rejected',
      actorAnchorHtml: anchorDoc?.toAnchor({ name: _loc('HEROMANCER.Chat.CharacterSummary.ViewSheet'), classes: ['hm-chat-summary-link'] }).outerHTML ?? null
    });
    const messageData = { content, whisper: recipients(submitterUserId), speaker: { alias: MODULE.NAME } };
    if (variant === 'rejected') messageData.flags = { [MODULE.ID]: { rejection: { payload: payload ?? null, reason: reason ?? null } } };
    await ChatMessage.create(messageData);
  } catch (err) {
    ATLAS.log(1, 'Failed to post approval-event card:', err);
  }
}

/** Wire per-viewer visibility + the GM Review button on approval-event cards. */
export function registerApprovalChat() {
  Hooks.on('renderChatMessageHTML', (_message, element) => {
    const root = element?.tagName ? element : element?.[0];
    const card = root?.querySelector('[data-hm-approval]');
    if (!card) return;
    const isGM = game.user.isGM;
    for (const el of card.querySelectorAll('.hm-approval-gm-only')) if (!isGM) el.remove();
    for (const el of card.querySelectorAll('.hm-approval-player-only')) if (isGM) el.remove();
    card.querySelector('[data-hm-action="review-queue"]')?.addEventListener('click', openQueue);
  });
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-hm-action="open-wizard"]');
    if (!btn) return;
    const message = game.messages.get(btn.closest('[data-message-id]')?.dataset.messageId);
    const rejection = message?.getFlag(MODULE.ID, 'rejection');
    openRestoreChooser(rejection?.payload, rejection?.reason);
  });
}

/**
 * Open or focus the Pending Approvals queue.
 * @returns {Promise<void>}
 */
async function openQueue() {
  const id = `${MODULE.ID}-pending-approvals`;
  const existing = foundry.applications.instances.get(id);
  if (existing) return existing.bringToFront();
  const { PendingApprovals } = await import('../apps/pending-approvals.mjs');
  new PendingApprovals().render({ force: true });
}
