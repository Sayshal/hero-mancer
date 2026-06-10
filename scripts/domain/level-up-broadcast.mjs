import { HMPrompt } from '../apps/dialog.mjs';
import { MODULE } from '../constants.mjs';
import { log } from '../utils/logger.mjs';

/** Subscribe to LEVEL_UP_COMPLETED: clear the pending flag and post the completion broadcast on the committer's session. */
export function registerLevelUpBroadcast() {
  Hooks.on(MODULE.HOOKS.LEVEL_UP_COMPLETED, async ({ actor, newLevel }) => {
    if (!actor) return;
    await actor.unsetFlag(MODULE.ID, MODULE.FLAGS.LEVEL_UP_READY);
    await publishLevelUpComplete(actor, newLevel);
  });
}

/**
 * Open a GM confirm dialog and grant level-up to a single character actor.
 * @param {Actor} actor Character actor.
 * @returns {Promise<void>}
 */
export async function sendLevelUpToActor(actor) {
  if (!game.user.isGM || !actor) return;
  if (hasPendingFlag(actor)) {
    ui.notifications.warn('HEROMANCER.LevelUp.Broadcast.AlreadyPending', { localize: true, format: { actor: actor.name } });
    return;
  }
  if (!isEligible(actor)) return;
  const confirmed = await HMPrompt.confirm({
    window: { title: 'HEROMANCER.LevelUp.Dialog.GrantTitle' },
    body: _loc('HEROMANCER.LevelUp.Dialog.GrantBody', { actor: actor.name }),
    modal: true,
    yes: { label: 'HEROMANCER.LevelUp.Dialog.Confirm', default: true },
    no: { label: 'COMMON.Cancel' }
  });
  if (!confirmed) return;
  await actor.setFlag(MODULE.ID, MODULE.FLAGS.LEVEL_UP_READY, true);
  await publishGrant([actor]);
}

/**
 * Open a GM checklist dialog and batch-grant level-up to selected group members.
 * @param {Actor} groupActor Group actor.
 * @returns {Promise<void>}
 */
export async function sendLevelUpToGroup(groupActor) {
  if (!game.user.isGM || !groupActor) return;
  const members = collectMembers(groupActor);
  if (!members.length) return;
  const result = await HMPrompt.wait({
    window: { title: 'HEROMANCER.LevelUp.Dialog.GrantTitle' },
    template: MODULE.TEMPLATES.DIALOGS.LEVEL_UP_GRANT_LIST,
    context: { members: members.map(({ actor, reason }) => ({ id: actor.id, name: actor.name, img: actor.img ?? '', eligible: !reason, reason: reason ?? '' })) },
    modal: true,
    buttons: [
      { action: null, label: 'COMMON.Cancel' },
      { action: 'confirm', label: 'HEROMANCER.LevelUp.Dialog.Confirm', default: true, callback: (_e, _target, dialog) => collectCheckedIds(dialog.element) }
    ]
  });
  if (!result?.length) return;
  const granted = [];
  for (const id of result) {
    const actor = game.actors.get(id);
    if (!actor || !isEligible(actor)) continue;
    if (hasPendingFlag(actor)) {
      ui.notifications.warn('HEROMANCER.LevelUp.Broadcast.AlreadyPending', { localize: true, format: { actor: actor.name } });
      continue;
    }
    try {
      await actor.setFlag(MODULE.ID, MODULE.FLAGS.LEVEL_UP_READY, true);
      granted.push(actor);
    } catch (err) {
      log(1, `level-up flag set failed for ${actor.name}:`, err);
    }
  }
  if (granted.length) await publishGrant(granted);
}

/**
 * Post the per-actor completion chat. Called from LEVEL_UP_COMPLETED on the committer's session only.
 * @param {Actor} actor Actor that committed a level-up.
 * @param {number} newLevel Class level just gained.
 * @returns {Promise<void>}
 */
async function publishLevelUpComplete(actor, newLevel) {
  const level = Number(actor.system?.details?.level) || newLevel;
  await postChat([actor], _loc('HEROMANCER.LevelUp.Broadcast.Complete', { actor: actorAnchor(actor), level }));
}

/**
 * True when the actor has a pending level-up grant flag.
 * @param {?Actor} actor Candidate actor.
 * @returns {boolean} True when flagged.
 */
export function hasPendingFlag(actor) {
  return !!actor?.getFlag(MODULE.ID, MODULE.FLAGS.LEVEL_UP_READY);
}

/**
 * True when the actor can receive a fresh grant (PC, has level, below max).
 * @param {?Actor} actor Candidate actor.
 * @returns {boolean} True when eligible.
 */
export function isEligible(actor) {
  if (actor?.type !== 'character') return false;
  const level = Number(actor.system?.details?.level) || 0;
  return level > 0 && level < CONFIG.DND5E.maxLevel;
}

/**
 * Walk group members and classify each: `reason` is null for eligible rows, a localized string for ineligible.
 * @param {Actor} groupActor Group actor.
 * @returns {Array<{actor: Actor, reason: ?string}>} Per-member rows.
 */
function collectMembers(groupActor) {
  const out = [];
  for (const entry of groupActor.system?.members ?? []) {
    const actor = entry?.actor;
    if (!actor) continue;
    let reason = null;
    if (actor.type !== 'character') reason = _loc('HEROMANCER.LevelUp.Dialog.IneligibleNotCharacter');
    else if (hasPendingFlag(actor)) reason = _loc('HEROMANCER.LevelUp.Dialog.IneligiblePending');
    else if ((Number(actor.system?.details?.level) || 0) >= CONFIG.DND5E.maxLevel) reason = _loc('HEROMANCER.LevelUp.Dialog.IneligibleMax');
    out.push({ actor, reason });
  }
  return out;
}

/**
 * Read checked actor ids out of the rendered dialog form.
 * @param {HTMLElement} root Dialog root element.
 * @returns {string[]} Selected actor ids.
 */
function collectCheckedIds(root) {
  return Array.from(root?.querySelectorAll('input[type="checkbox"][name="actorId"]:checked') ?? [], (c) => c.value);
}

/**
 * Post the grant chat for one or more granted actors (single or consolidated).
 * @param {Actor[]} actors Granted actors.
 * @returns {Promise<void>}
 */
async function publishGrant(actors) {
  const gm = foundry.utils.escapeHTML(game.user.name);
  const content =
    actors.length === 1
      ? _loc('HEROMANCER.LevelUp.Broadcast.Grant', { gm, actor: actorAnchor(actors[0]) })
      : _loc('HEROMANCER.LevelUp.Broadcast.GrantGroup', { gm, actors: actors.map(actorAnchor).join(', ') });
  await postChat(actors, content);
}

/**
 * Build an enriched anchor for an actor name.
 * @param {Actor} actor Source actor.
 * @returns {string} Anchor element HTML.
 */
function actorAnchor(actor) {
  return actor.toAnchor({ name: actor.name, classes: ['hm-level-up-anchor'] }).outerHTML;
}

/**
 * Resolve whisper recipients: every GM + every OWNER-level user across the actor list.
 * @param {Actor[]} actors Source actors.
 * @returns {string[]} User ids.
 */
function collectWhisper(actors) {
  const ids = new Set();
  for (const u of game.users) if (u.isGM || actors.some((a) => a.testUserPermission(u, 'OWNER'))) ids.add(u.id);
  return Array.from(ids);
}

/**
 * Create a chat message honoring the broadcast mode (public / whisper-owners / off).
 * @param {Actor[]} actors Actors driving speaker + whisper resolution.
 * @param {string} content Message body HTML.
 * @returns {Promise<void>}
 */
async function postChat(actors, content) {
  const mode = game.settings.get(MODULE.ID, MODULE.SETTINGS.PUBLISH_LEVEL_UP_BROADCAST);
  if (mode === 'off') return;
  const msg = { content, speaker: ChatMessage.getSpeaker({ actor: actors[0] }) };
  if (mode === 'whisper-owners') msg.whisper = collectWhisper(actors);
  await ChatMessage.create(msg);
}
