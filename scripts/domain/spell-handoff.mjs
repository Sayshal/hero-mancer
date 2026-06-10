import { HMPrompt } from '../apps/dialog.mjs';
import { MODULE } from '../constants.mjs';
import { isSpellBookActive } from '../integrations/spell-book.mjs';
import { SOCKET_EVENTS, emitSocketEvent, onSocketEvent } from '../sockets.mjs';

const waitingDialogs = new Map();

/**
 * Wire the post-create handoff.
 * @returns {void}
 */
export function registerSpellHandoff() {
  Hooks.on(MODULE.HOOKS.CREATED, ({ actor }) => maybeFireSpellHandoff(actor));
  onSocketEvent(SOCKET_EVENTS.SPELL_SETUP_REQUEST, handleSetupRequest);
  onSocketEvent(SOCKET_EVENTS.SPELL_SETUP_COMPLETE, handleSetupComplete);
  onSocketEvent(SOCKET_EVENTS.SPELL_SETUP_CANCELED, handleSetupCanceled);
}

/**
 * Inspect the freshly-created actor and route the handoff for spellcasters.
 * @param {Actor} actor Newly-created actor.
 * @returns {void}
 */
export function maybeFireSpellHandoff(actor) {
  if (!actor || !isSpellcaster(actor)) return;
  if (actor.getFlag(MODULE.ID, MODULE.FLAGS.SKIP_SPELL_HANDOFF)) return;
  if (!isSpellBookActive()) {
    ui.notifications.warn('HEROMANCER.Integrations.SpellBook.Missing', { localize: true });
    return;
  }
  if (!SPELLBOOK.api.hasConfiguredCompendiums()) {
    const key = game.user.isGM ? 'gm' : 'player';
    ui.notifications[game.user.isGM ? 'warn' : 'info'](`HEROMANCER.Integrations.SpellBook.NoCompendiums.${key}`, { localize: true, permanent: true });
    return;
  }
  if (game.user.isGM) runGmSetup(actor);
  else awaitGmSetup(actor);
}

/**
 * Whether the actor has at least one class with a spellcasting progression.
 * @param {Actor} actor Target actor.
 * @returns {boolean} `true` if any class entry exposes spellcasting.
 */
function isSpellcaster(actor) {
  return Object.keys(actor.spellcastingClasses ?? {}).length > 0;
}

/**
 * GM is the current user — open ClassRules locally.
 * @param {Actor} actor Newly-created spellcaster.
 * @returns {void}
 */
function runGmSetup(actor) {
  const owner = findPlayerOwner(actor);
  if (owner) {
    SPELLBOOK.api.openClassRulesForActor(actor, { onSave: () => emitSocketEvent(SOCKET_EVENTS.SPELL_SETUP_COMPLETE, { actorUuid: actor.uuid, recipientUserId: owner.id }) });
    return;
  }
  SPELLBOOK.api.openClassRulesForActor(actor, { onSave: () => SPELLBOOK.api.openSpellBookForActor(actor) });
}

/**
 * Find the first non-GM user with OWNER-level permission on the actor.
 * @param {Actor} actor Target actor.
 * @returns {?object} Owner user document, or null when no non-GM owner is assigned.
 */
function findPlayerOwner(actor) {
  const ownership = actor.ownership ?? {};
  for (const [userId, level] of Object.entries(ownership)) {
    if (userId === 'default') continue;
    if (level < CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) continue;
    const user = game.users.get(userId);
    if (user && !user.isGM) return user;
  }
  return null;
}

/**
 * Player is the current user — show waiting dialog and ask the GM to configure.
 * @param {Actor} actor Newly-created spellcaster.
 * @returns {void}
 */
function awaitGmSetup(actor) {
  if (!findActiveGm()) {
    ui.notifications.warn('HEROMANCER.Integrations.SpellBook.NoGM', { localize: true, permanent: true });
    return;
  }
  const dialog = createWaitingDialog(actor);
  waitingDialogs.set(actor.uuid, dialog);
  dialog.render({ force: true });
  emitSocketEvent(SOCKET_EVENTS.SPELL_SETUP_REQUEST, { actorUuid: actor.uuid, requesterUserId: game.user.id });
}

/**
 * First active GM, sorted by user id (deterministic across clients), or null.
 * @returns {?object} The chosen GM user document, or null.
 */
function findActiveGm() {
  return game.users.filter((u) => u.isGM && u.active).sort((a, b) => a.id.localeCompare(b.id))[0] ?? null;
}

/**
 * Build a non-modal prompt telling the player their spellbook is being configured.
 * @param {Actor} actor Pending spellcaster.
 * @returns {HMPrompt} Configured prompt instance.
 */
function createWaitingDialog(actor) {
  return new HMPrompt({
    window: { title: 'HEROMANCER.Integrations.SpellBook.Waiting.Title', icon: 'fa-solid fa-hourglass-half' },
    body: _loc('HEROMANCER.Integrations.SpellBook.Waiting.Body', { name: actor.name }),
    buttons: [{ action: 'cancel', label: 'HEROMANCER.Integrations.SpellBook.Waiting.Cancel', icon: 'fa-solid fa-xmark', callback: () => waitingDialogs.delete(actor.uuid) }]
  });
}

/**
 * GM-side: only the chosen GM acts; opens ClassRules.
 * @param {{actorUuid: string, requesterUserId: string}} payload Request payload.
 * @returns {void}
 */
function handleSetupRequest({ actorUuid, requesterUserId }) {
  if (!game.user.isGM) return;
  if (findActiveGm()?.id !== game.user.id) return;
  const actor = fromUuidSync(actorUuid);
  if (!actor) {
    emitSocketEvent(SOCKET_EVENTS.SPELL_SETUP_CANCELED, { actorUuid, recipientUserId: requesterUserId });
    return;
  }
  SPELLBOOK.api.openClassRulesForActor(actor, {
    onSave: () => emitSocketEvent(SOCKET_EVENTS.SPELL_SETUP_COMPLETE, { actorUuid, recipientUserId: requesterUserId }),
    onCancel: () => emitSocketEvent(SOCKET_EVENTS.SPELL_SETUP_CANCELED, { actorUuid, recipientUserId: requesterUserId })
  });
}

/**
 * Player-side: GM finished — close the waiting dialog and open the Spell Book.
 * @param {{actorUuid: string, recipientUserId: string}} payload Completion payload.
 * @returns {Promise<void>}
 */
async function handleSetupComplete({ actorUuid, recipientUserId }) {
  if (recipientUserId !== game.user.id) return;
  await closeWaitingDialog(actorUuid);
  await waitForClassRulesFlag(actorUuid);
  const actor = fromUuidSync(actorUuid);
  if (!actor) return;
  await SPELLBOOK.api.openSpellBookForActor(actor);
}

/**
 * Close and forget the per-actor waiting dialog if one is registered.
 * @param {string} actorUuid Target actor uuid.
 * @returns {Promise<void>}
 */
async function closeWaitingDialog(actorUuid) {
  const dialog = waitingDialogs.get(actorUuid);
  if (!dialog) return;
  waitingDialogs.delete(actorUuid);
  await dialog.close();
}

/**
 * Resolve once the actor's `flags.spell-book.classRules` is populated.
 * @param {string} actorUuid Target actor uuid.
 * @param {number} [timeoutMs] Max wait in ms before resolving anyway (default 2000).
 * @returns {Promise<void>}
 */
function waitForClassRulesFlag(actorUuid, timeoutMs = 2000) {
  if (fromUuidSync(actorUuid)?.getFlag('spell-book', 'classRules')) return Promise.resolve();
  return new Promise((resolve) => {
    const hookId = Hooks.on('updateActor', (updated) => {
      if (updated?.uuid !== actorUuid) return;
      if (!updated.getFlag('spell-book', 'classRules')) return;
      Hooks.off('updateActor', hookId);
      clearTimeout(timer);
      resolve();
    });
    const timer = setTimeout(() => {
      Hooks.off('updateActor', hookId);
      resolve();
    }, timeoutMs);
  });
}

/**
 * Player-side: GM closed ClassRules without saving — close the waiting dialog and toast.
 * @param {{actorUuid: string, recipientUserId: string}} payload Cancel payload.
 * @returns {Promise<void>}
 */
async function handleSetupCanceled({ actorUuid, recipientUserId }) {
  if (recipientUserId !== game.user.id) return;
  await closeWaitingDialog(actorUuid);
  ui.notifications.info('HEROMANCER.Integrations.SpellBook.Canceled', { localize: true });
}
