import { MODULE } from '../constants.mjs';
import { log } from '../utils/logger.mjs';
import { createCharacter } from './character.mjs';
import * as savedOptions from './saved-options.mjs';

/**
 * Subscribe the submitter-side replay handler to the approval-approved hook.
 * @returns {void}
 */
export function registerApprovalReplay() {
  Hooks.on(MODULE.HOOKS.APPROVAL_APPROVED, onApproved);
}

/**
 * Resolve an actor uuid and open its sheet, retrying briefly to survive cross-client document replication lag.
 * @param {string} actorUuid Newly-created actor uuid.
 * @returns {Promise<void>}
 */
async function openSheetWhenAvailable(actorUuid) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const actor = fromUuidSync(actorUuid) ?? (await fromUuid(actorUuid).catch(() => null));
    if (actor?.sheet) {
      actor.sheet.render(true);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  log(1, `approval replay: timed out waiting for actor ${actorUuid} to replicate`);
}

/**
 * Submitter-side: receive an approval socket.
 * @param {{pageId: string, payload: ?object, characterName: ?string, actorUuid: ?string}} hookPayload Hook payload from the approval socket.
 * @returns {Promise<void>}
 */
async function onApproved({ payload, characterName, actorUuid }) {
  if (!payload) {
    await Promise.all([savedOptions.clear('approval-replay'), game.user.unsetFlag(MODULE.ID, MODULE.FLAGS.LAST_REJECTION)]);
    ui.notifications.info('HEROMANCER.Approval.Replay.GMEdited', { localize: true, format: { name: characterName || _loc('HEROMANCER.Approval.Unnamed') } });
    if (actorUuid) await openSheetWhenAvailable(actorUuid);
    return;
  }
  try {
    payload.startDraft = { ...(payload.startDraft ?? {}), player: payload.startDraft?.player || game.user.id };
    const actor = await createCharacter({ payload });
    if (!actor) {
      ui.notifications.error('HEROMANCER.Approval.Replay.Failed', { localize: true });
      log(1, 'approval replay produced no actor');
      return;
    }
    await Promise.all([savedOptions.clear('approval-replay'), game.user.unsetFlag(MODULE.ID, MODULE.FLAGS.LAST_REJECTION)]);
    ui.notifications.info('HEROMANCER.Approval.Replay.Created', { localize: true, format: { name: actor.name } });
    actor.sheet?.render(true);
  } catch (err) {
    log(1, 'approval replay threw:', err);
    ui.notifications.error('HEROMANCER.Approval.Replay.Failed', { localize: true });
  }
}
