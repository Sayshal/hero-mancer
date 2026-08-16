import { MODULE } from '../constants.mjs';
import { findApprovalJournal } from '../domain/approval.mjs';

const MODULE_ID = 'dont-forget';

/**
 * Whether the Don't Forget module is installed and active.
 * @returns {boolean} `true` if the module is registered and currently active.
 */
export function isDontForgetActive() {
  return !!game.modules.get(MODULE_ID)?.active;
}

/**
 * Build the Don't Forget `source` tag identifying review reminders for a pending page.
 * @param {string} pageId Pending-journal page id.
 * @returns {string} Source tag.
 */
function sourceForPage(pageId) {
  return `${MODULE.ID}:${pageId}`;
}

/**
 * Collect every review reminder created for a pending page, across all users.
 * @param {string} pageId Pending-journal page id.
 * @returns {object[]} Matching reminder records.
 */
function findReminders(pageId) {
  const source = sourceForPage(pageId);
  return Object.values(DONTFORGET.api.getAllReminders()).filter((r) => r.source === source);
}

/**
 * Drop a review reminder on every GM user. Skips users that already carry an open one for this page.
 * @param {{page: object, flagData: object}} event Approval-received payload.
 * @returns {Promise<void>}
 */
async function onApprovalReceived({ page, flagData }) {
  const source = sourceForPage(page.id);
  const existing = findReminders(page.id);
  const label = _loc('HEROMANCER.Approval.Reminder.Review', { name: flagData?.characterName ?? page.name, submitter: flagData?.submitterUserName ?? '' });
  for (const user of game.users.filter((u) => u.isGM)) {
    if (existing.some((r) => r.userId === user.id && !r.isDone)) continue;
    await DONTFORGET.api.createReminder(user.id, { label, source });
  }
}

/**
 * Complete every review reminder for a resolved submission.
 * @param {{pageId: string}} event Approval-resolved payload.
 * @returns {Promise<void>}
 */
async function onApprovalResolved({ pageId }) {
  const source = sourceForPage(pageId);
  for (const reminder of findReminders(pageId)) await DONTFORGET.api.completeReminder(reminder.id, source);
}

/**
 * Delete every still-open review reminder for a page that vanished without being resolved.
 * @param {string} pageId Pending-journal page id.
 * @returns {Promise<void>}
 */
async function clearReminders(pageId) {
  const source = sourceForPage(pageId);
  for (const reminder of findReminders(pageId)) {
    if (reminder.isDone) continue;
    await DONTFORGET.api.deleteReminder(reminder.id, reminder.userId, source);
  }
}

/**
 * Drop reminders when a pending page is deleted outside the approval flow.
 * @param {object} page Deleted page.
 * @returns {Promise<void>}
 */
async function onPageDeleted(page) {
  if (page.parent !== findApprovalJournal()) return;
  await clearReminders(page.id);
}

/**
 * Drop reminders when the pending journal is deleted wholesale.
 * @param {object} journal Deleted journal.
 * @returns {Promise<void>}
 */
async function onJournalDeleted(journal) {
  if (journal.name !== MODULE.APPROVAL.PENDING_JOURNAL_NAME) return;
  for (const page of journal.pages) await clearReminders(page.id);
}

/**
 * Wire the approval-lifecycle reminder mirror. Active-GM-only writes.
 * @returns {void}
 */
export function registerDontForgetReminders() {
  if (!isDontForgetActive()) return;
  Hooks.on(MODULE.HOOKS.APPROVAL_RECEIVED, (event) => {
    if (game.user === game.users.activeGM) onApprovalReceived(event);
  });
  Hooks.on(MODULE.HOOKS.APPROVAL_RESOLVED, (event) => {
    if (game.user === game.users.activeGM) onApprovalResolved(event);
  });
  Hooks.on('deleteJournalEntryPage', (page) => {
    if (game.user === game.users.activeGM) onPageDeleted(page);
  });
  Hooks.on('deleteJournalEntry', (journal) => {
    if (game.user === game.users.activeGM) onJournalDeleted(journal);
  });
}
