import { HMPrompt } from '../apps/dialog.mjs';
import { MODULE } from '../constants.mjs';
import { SOCKET_EVENTS, emitSocketEvent, onSocketEvent } from '../sockets.mjs';
import { publishApprovalEvent } from './approval-chat.mjs';
import { createCharacter } from './character.mjs';
import { clearPendingForUser } from './submission-lock.mjs';

/** Foundry page-flag key under `flags['hero-mancer']`. */
const SUBMISSION_FLAG = 'submission';

/**
 * @typedef {object} SubmissionPayload
 * @property {string} characterName Display name from the start tab.
 * @property {object} startDraft Camel-cased start-tab draft (`characterName`, `characterArt`, `level`).
 * @property {object} identityDraft Identity-tab uuid map (`{class, species, background, subclass}`).
 * @property {object} abilitiesDraft Abilities-tab snapshot keyed by ability id.
 * @property {object} advancementDraft Per-advancement pick map (output of `readAdvancementDraft`).
 * @property {object} [equipmentDraft] Equipment selections (shape per F-phase).
 * @property {boolean} [skipSpellHandoff] When true, stamps the actor flag that suppresses the Spell Book post-create handoff.
 */

/**
 * @typedef {object} SubmissionFlagData
 * @property {string} characterName Display name (also used as page name).
 * @property {string} submitterUserId Foundry user id of the player who submitted.
 * @property {string} submitterUserName User display name at submit time.
 * @property {number} timestamp ms since epoch.
 * @property {string} payload JSON-serialized `SubmissionPayload`. Stored as a string so Foundry's schema cleaner does not walk flat-dotted equipment-draft keys into conflicting paths.
 * @property {'pending'|'approved'|'rejected'} status Resolution state.
 * @property {string} [resolvedBy] User id of resolving GM (archive-only).
 * @property {number} [resolvedAt] ms since epoch of resolution (archive-only).
 * @property {string} [rejectionReason] Free-text reason (archive-only when rejected).
 */

/**
 * Decode a stored flag payload back into a SubmissionPayload object. Tolerates legacy object-shaped flags.
 * @param {string|object} payload Stored payload.
 * @returns {object} Decoded SubmissionPayload.
 */
export function decodePayload(payload) {
  if (!payload) return {};
  if (typeof payload !== 'string') return payload;
  try {
    return JSON.parse(payload);
  } catch (err) {
    ATLAS.log(1, 'decodePayload failed:', err);
    return {};
  }
}

/**
 * Ensure the pending-approvals journal exists. Runs only on the active GM.
 * @returns {Promise<?JournalEntry>} The pending journal, or null if not the active GM.
 */
export async function bootstrapApprovalJournal() {
  if (game.user !== game.users.activeGM) return null;
  const existing = findApprovalJournal();
  if (existing) return existing;
  ATLAS.log(3, `Creating world journal "${MODULE.APPROVAL.PENDING_JOURNAL_NAME}".`);
  return JournalEntry.create({ name: MODULE.APPROVAL.PENDING_JOURNAL_NAME, ownership: { default: 0 } });
}

/**
 * Look up the pending-approvals journal by name.
 * @returns {?JournalEntry} The journal, or null if absent.
 */
export function findApprovalJournal() {
  return game.journal.getName(MODULE.APPROVAL.PENDING_JOURNAL_NAME) ?? null;
}

/**
 * Look up the approval archive journal by name.
 * @returns {?JournalEntry} The archive journal, or null if not yet created.
 */
export function findArchiveJournal() {
  return game.journal.getName(MODULE.APPROVAL.ARCHIVE_JOURNAL_NAME) ?? null;
}

/**
 * Get-or-create the archive journal.
 * @returns {Promise<?JournalEntry>} The archive journal, or null if not the active GM.
 */
export async function ensureArchiveJournal() {
  if (game.user !== game.users.activeGM) return null;
  const existing = findArchiveJournal();
  if (existing) return existing;
  ATLAS.log(3, `Creating world journal "${MODULE.APPROVAL.ARCHIVE_JOURNAL_NAME}".`);
  return JournalEntry.create({ name: MODULE.APPROVAL.ARCHIVE_JOURNAL_NAME, ownership: { default: 0 } });
}

/**
 * Submit a draft for GM approval. Player-side: emits socket → active GM creates the page.
 * GM-side: creates the page directly.
 * @param {SubmissionPayload} payload Wizard drafts plus opt-out flags.
 * @returns {Promise<?string>} Page id (GM caller) or null (player caller — page id arrives via document broadcast).
 */
export async function submitForApproval(payload) {
  await game.user.unsetFlag(MODULE.ID, MODULE.FLAGS.LAST_REJECTION);
  const flagData = buildFlagData(payload);
  Hooks.callAll(MODULE.HOOKS.APPROVAL_SUBMITTED, { flagData });
  publishApprovalEvent({ variant: 'submitted', characterName: flagData.characterName, submitterUserId: flagData.submitterUserId, submitterName: flagData.submitterUserName });
  if (game.user === game.users.activeGM) {
    const page = await createSubmissionPage(flagData);
    return page?.id ?? null;
  }
  emitSocketEvent(SOCKET_EVENTS.SUBMIT_CHARACTER, { flagData });
  return null;
}

/**
 * Count pending submissions without materializing the sorted list.
 * @returns {number} Number of pages on the pending journal (zero if journal absent).
 */
export function getPendingCount() {
  return findApprovalJournal()?.pages.size ?? 0;
}

/**
 * Read archived pages from the archive journal, most-recently-resolved first.
 * @returns {JournalEntryPage[]} Pages sorted descending by `resolvedAt`.
 */
export function getArchivedSubmissions() {
  const journal = findArchiveJournal();
  if (!journal) return [];
  return [...journal.pages.contents].sort((a, b) => {
    const ta = a.getFlag(MODULE.ID, SUBMISSION_FLAG)?.resolvedAt ?? 0;
    const tb = b.getFlag(MODULE.ID, SUBMISSION_FLAG)?.resolvedAt ?? 0;
    return tb - ta;
  });
}

/**
 * Delete the archive journal in its entirety. Active-GM-only.
 * @returns {Promise<boolean>} True when the journal existed and was removed.
 */
export async function clearArchive() {
  if (game.user !== game.users.activeGM) return false;
  const journal = findArchiveJournal();
  if (!journal) return false;
  await journal.delete();
  return true;
}

/**
 * Move an archived submission back into the pending queue, clearing its resolution. Active-GM-only.
 * @param {string} pageId Archive-journal page id.
 * @returns {Promise<?string>} The new pending page id, or null on no-op.
 */
export async function restoreFromArchive(pageId) {
  if (game.user !== game.users.activeGM) return null;
  const page = findArchiveJournal()?.pages.get(pageId);
  const journal = findApprovalJournal();
  if (!page || !journal) return null;
  const flag = page.getFlag(MODULE.ID, SUBMISSION_FLAG) ?? {};
  const flagData = {
    characterName: flag.characterName,
    submitterUserId: flag.submitterUserId,
    submitterUserName: flag.submitterUserName,
    timestamp: flag.timestamp,
    payload: flag.payload,
    status: 'pending'
  };
  const [restored] = await journal.createEmbeddedDocuments('JournalEntryPage', [
    { name: page.name, type: 'text', text: { content: page.text.content, format: page.text.format }, flags: { [MODULE.ID]: { [SUBMISSION_FLAG]: flagData } } }
  ]);
  await page.delete();
  return restored?.id ?? null;
}

/**
 * Read pending pages from the world journal, oldest-first.
 * @returns {JournalEntryPage[]} Pages sorted ascending by submission timestamp.
 */
export function getPendingSubmissions() {
  const journal = findApprovalJournal();
  if (!journal) return [];
  return [...journal.pages.contents].sort((a, b) => {
    const ta = a.getFlag(MODULE.ID, SUBMISSION_FLAG)?.timestamp ?? 0;
    const tb = b.getFlag(MODULE.ID, SUBMISSION_FLAG)?.timestamp ?? 0;
    return ta - tb;
  });
}

/**
 * Open a prompt asking the GM for a rejection reason. Shared between the queue-row quick-reject and the wizard review-mode reject action.
 * @returns {Promise<?string>} The reason text, or null when the GM cancelled.
 */
export function promptRejectionReason() {
  return HMPrompt.wait({
    window: { title: 'HEROMANCER.Approval.Review.RejectDialog.Title', icon: 'fa-solid fa-circle-xmark' },
    template: MODULE.TEMPLATES.DIALOGS.REJECT_REASON,
    modal: true,
    close: () => null,
    buttons: [
      {
        action: 'reject',
        label: 'HEROMANCER.Approval.Review.RejectDialog.Confirm',
        icon: 'fa-solid fa-circle-xmark',
        default: true,
        callback: (_event, _target, dialog) => dialog.element.querySelector('textarea[name="reason"]')?.value ?? ''
      },
      { action: null, label: 'COMMON.Cancel', icon: 'fa-solid fa-xmark' }
    ]
  });
}

/**
 * Approve a pending submission. GM-only — non-GM callers return null.
 * @param {string} pageId Pending-journal page id.
 * @returns {Promise<?string>} The resolved page id, or null on no-op.
 */
export async function approveSubmission(pageId) {
  if (game.user !== game.users.activeGM) return null;
  const page = findApprovalJournal()?.pages.get(pageId);
  if (!page) return null;
  const flagData = page.getFlag(MODULE.ID, SUBMISSION_FLAG);
  const submitterUserId = flagData?.submitterUserId;
  const payload = decodePayload(flagData?.payload);
  payload.startDraft = { ...(payload.startDraft ?? {}), player: payload.startDraft?.player || submitterUserId };
  const actor = await createCharacter({ payload });
  if (!actor) {
    ui.notifications.error('HEROMANCER.Approval.Replay.Failed', { localize: true });
    return null;
  }
  emitSocketEvent(SOCKET_EVENTS.CHARACTER_APPROVED, { pageId, recipientUserId: submitterUserId, payload: null, characterName: actor.name, actorUuid: actor.uuid });
  publishApprovalEvent({ variant: 'approved', characterName: actor.name, submitterUserId, actorUuid: actor.uuid });
  await clearPendingForUser(submitterUserId);
  await resolveSubmission(page, { outcome: 'approved' });
  return pageId;
}

/**
 * Approve a pending submission after the GM has edited it in the review wizard.
 * @param {string} pageId Pending-journal page id.
 * @param {string} characterName Final character name (post-GM-edit) for the submitter's toast.
 * @param {string} actorUuid Uuid of the GM-created actor so the submitter can auto-open its sheet.
 * @returns {Promise<?string>} The resolved page id, or null on no-op.
 */
export async function approveSubmissionAfterEdit(pageId, characterName, actorUuid) {
  if (game.user !== game.users.activeGM) return null;
  const page = findApprovalJournal()?.pages.get(pageId);
  if (!page) return null;
  const flagData = page.getFlag(MODULE.ID, SUBMISSION_FLAG);
  emitSocketEvent(SOCKET_EVENTS.CHARACTER_APPROVED, { pageId, recipientUserId: flagData?.submitterUserId, payload: null, characterName, actorUuid });
  publishApprovalEvent({ variant: 'approved', characterName, submitterUserId: flagData?.submitterUserId, actorUuid });
  await clearPendingForUser(flagData?.submitterUserId);
  await resolveSubmission(page, { outcome: 'approved' });
  return pageId;
}

/**
 * Reject a pending submission with a reason. GM-only — non-GM callers return null.
 * @param {string} pageId Pending-journal page id.
 * @param {string} [reason] Free-text rejection reason shown to the submitter.
 * @returns {Promise<?string>} The resolved page id, or null on no-op.
 */
export async function rejectSubmission(pageId, reason = '') {
  if (game.user !== game.users.activeGM) return null;
  const page = findApprovalJournal()?.pages.get(pageId);
  if (!page) return null;
  const flagData = page.getFlag(MODULE.ID, SUBMISSION_FLAG);
  emitSocketEvent(SOCKET_EVENTS.CHARACTER_REJECTED, { pageId, recipientUserId: flagData?.submitterUserId, reason, payload: flagData?.payload });
  publishApprovalEvent({ variant: 'rejected', characterName: flagData?.characterName, submitterUserId: flagData?.submitterUserId, reason, payload: flagData?.payload });
  await clearPendingForUser(flagData?.submitterUserId);
  await resolveSubmission(page, { outcome: 'rejected', rejectionReason: reason });
  return pageId;
}

/**
 * Build the structured submission flag data from a wizard payload.
 * @param {SubmissionPayload} payload Wizard drafts.
 * @returns {SubmissionFlagData} Flag-ready data.
 */
function buildFlagData(payload) {
  return {
    characterName: payload?.characterName || payload?.startDraft?.characterName || _loc('HEROMANCER.Approval.Unnamed'),
    submitterUserId: game.user.id,
    submitterUserName: game.user.name,
    timestamp: Date.now(),
    status: 'pending',
    payload: JSON.stringify(payload ?? {})
  };
}

/**
 * Create a JournalEntryPage on the pending journal carrying the submission flag data.
 * @param {SubmissionFlagData} flagData Flag payload built by `buildFlagData`.
 * @returns {Promise<?JournalEntryPage>} Created page, or null on bootstrap-missing.
 */
async function createSubmissionPage(flagData) {
  const journal = findApprovalJournal();
  if (!journal) {
    ATLAS.log(1, 'Pending-approvals journal missing; cannot create submission page.');
    return null;
  }
  const duplicate = journal.pages.find((p) => {
    const existing = p.getFlag(MODULE.ID, SUBMISSION_FLAG);
    return existing?.submitterUserId === flagData.submitterUserId && existing?.timestamp === flagData.timestamp;
  });
  if (duplicate) return duplicate;
  const content = await buildPageBody(flagData);
  const [page] = await journal.createEmbeddedDocuments('JournalEntryPage', [
    { name: flagData.characterName, type: 'text', text: { content, format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML }, flags: { [MODULE.ID]: { [SUBMISSION_FLAG]: flagData } } }
  ]);
  return page ?? null;
}

/**
 * Render the human-readable page body.
 * @param {SubmissionFlagData} flagData Flag payload.
 * @returns {Promise<string>} HTML string.
 */
async function buildPageBody({ characterName, submitterUserName, timestamp, payload }) {
  const decoded = decodePayload(payload);
  const when = new Date(timestamp).toLocaleString();
  const level = decoded?.startDraft?.level ?? 1;
  const id = decoded?.identityDraft ?? {};
  const classes = Array.isArray(id.classes) && id.classes.length ? id.classes : id.class ? [{ uuid: id.class, level }] : [];
  const classNames = await Promise.all(
    classes.map(async (c) => {
      const [className, subclassName] = await Promise.all([resolveName(c.uuid), c.subclassUuid ? resolveName(c.subclassUuid) : null]);
      const label = subclassName ? _loc('HEROMANCER.Chat.ClassLabel', { subclass: subclassName, class: className }) : className;
      return `${label} (${c.level ?? level})`;
    })
  );
  const classLine = classNames.length > 1 ? classNames.join(' | ') : (classNames[0] ?? '-');
  const [species, bg] = await Promise.all([resolveName(id.species), resolveName(id.background)]);
  return foundry.applications.handlebars.renderTemplate(MODULE.TEMPLATES.APPROVALS.PAGE_BODY, { characterName, submitterUserName, when, level, classLine, species, bg });
}

/**
 * Resolve a document uuid to a display name, falling back to the uuid string.
 * @param {?string} uuid Source uuid.
 * @returns {Promise<string>} Name or fallback.
 */
async function resolveName(uuid) {
  if (!uuid) return '-';
  const doc = await fromUuid(uuid);
  return doc?.name ?? uuid;
}

/**
 * Resolve a pending page: archive it (with outcome flag) when `keepApprovalArchive` is on,
 * else delete it. Archive journal is lazily materialized on first archive write.
 * @param {JournalEntryPage} page Page being resolved.
 * @param {{outcome: 'approved'|'rejected', rejectionReason?: string}} extra Resolution metadata.
 * @returns {Promise<void>}
 */
async function resolveSubmission(page, { outcome, rejectionReason }) {
  if (!game.settings.get(MODULE.ID, MODULE.SETTINGS.KEEP_APPROVAL_ARCHIVE)) {
    await page.delete();
    return;
  }
  const archive = await ensureArchiveJournal();
  if (!archive) {
    await page.delete();
    return;
  }
  const existingFlag = page.getFlag(MODULE.ID, SUBMISSION_FLAG) ?? {};
  const newFlag = { ...existingFlag, status: outcome, resolvedBy: game.user.id, resolvedAt: Date.now(), ...(rejectionReason ? { rejectionReason } : {}) };
  await archive.createEmbeddedDocuments('JournalEntryPage', [
    { name: page.name, type: 'text', text: { content: page.text.content, format: page.text.format }, flags: { [MODULE.ID]: { [SUBMISSION_FLAG]: newFlag } } }
  ]);
  await page.delete();
}

/**
 * Wire document hooks on the pending + archive journals; re-renders the queue browser when present.
 * @returns {void}
 */
export function registerApprovalDocumentHooks() {
  Hooks.on('createJournalEntryPage', refreshIfRelevantPage);
  Hooks.on('updateJournalEntryPage', refreshIfRelevantPage);
  Hooks.on('deleteJournalEntryPage', refreshIfRelevantPage);
  Hooks.on('deleteJournalEntry', refreshIfArchiveJournal);
}

/**
 * Re-render the queue browser when the changed page belongs to either approval journal.
 * @param {JournalEntryPage} page Mutated page.
 * @returns {void}
 */
function refreshIfRelevantPage(page) {
  const parent = page.parent;
  if (parent !== findApprovalJournal() && parent !== findArchiveJournal()) return;
  refreshQueueBrowser();
}

/**
 * Re-render the queue browser when the archive journal is deleted wholesale.
 * @param {JournalEntry} journal Deleted journal.
 * @returns {void}
 */
function refreshIfArchiveJournal(journal) {
  if (journal.name !== MODULE.APPROVAL.ARCHIVE_JOURNAL_NAME) return;
  refreshQueueBrowser();
}

/**
 * Re-render the pending-approvals app if it is currently open.
 * @returns {void}
 */
function refreshQueueBrowser() {
  foundry.applications.instances.get(`${MODULE.ID}-pending-approvals`)?.render(false);
}

/**
 * Active-GM recovery + migration: ingest durable player-flag submissions that never reached the journal (submitted while no GM was online), and clear legacy locks that carry no recoverable payload.
 * @returns {Promise<void>}
 */
export async function recoverPendingSubmissions() {
  if (game.user !== game.users.activeGM) return;
  for (const user of game.users) {
    const flagData = user.getFlag(MODULE.ID, MODULE.FLAGS.PENDING_SUBMISSION);
    if (!flagData) continue;
    if (!flagData.payload) {
      await user.unsetFlag(MODULE.ID, MODULE.FLAGS.PENDING_SUBMISSION);
      continue;
    }
    await createSubmissionPage(flagData);
  }
}

/**
 * Wire submit/approve/reject socket handlers. Called from the ready hook.
 * @returns {void}
 */
export function registerApprovalSockets() {
  onSocketEvent(SOCKET_EVENTS.SUBMIT_CHARACTER, handleSubmitFromPlayer);
  onSocketEvent(SOCKET_EVENTS.CHARACTER_APPROVED, handleApprovedOnSubmitter);
  onSocketEvent(SOCKET_EVENTS.CHARACTER_REJECTED, handleRejectedOnSubmitter);
}

/**
 * Active-GM-side: ingest a player's submission and create the page.
 * @param {{flagData: SubmissionFlagData}} payload Submission payload.
 * @returns {Promise<void>}
 */
async function handleSubmitFromPlayer({ flagData }) {
  if (game.user !== game.users.activeGM) return;
  if (!flagData) return;
  await createSubmissionPage(flagData);
}

/**
 * Submitter-side: receive approval and fire the public hook for the wizard-resume consumer.
 * @param {{recipientUserId: string, pageId: string, payload: SubmissionPayload}} message Approval payload.
 * @returns {void}
 */
function handleApprovedOnSubmitter({ recipientUserId, pageId, payload, characterName, actorUuid }) {
  if (recipientUserId !== game.user.id) return;
  Hooks.callAll(MODULE.HOOKS.APPROVAL_APPROVED, { pageId, payload, characterName, actorUuid });
}

/**
 * Submitter-side: receive rejection and fire the public hook for the rejection-dialog consumer.
 * @param {{recipientUserId: string, pageId: string, reason: string, payload: string}} message Rejection payload, including the submission JSON for restore.
 * @returns {void}
 */
function handleRejectedOnSubmitter({ recipientUserId, pageId, reason, payload }) {
  if (recipientUserId !== game.user.id) return;
  Hooks.callAll(MODULE.HOOKS.APPROVAL_REJECTED, { pageId, reason, payload });
}
