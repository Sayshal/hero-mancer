import { MODULE } from '../constants.mjs';

/**
 * Subscribe submission-lock state to the approval hooks.
 * @returns {void}
 */
export function registerSubmissionLock() {
  Hooks.on(MODULE.HOOKS.APPROVAL_SUBMITTED, onSubmitted);
  Hooks.on(MODULE.HOOKS.APPROVAL_APPROVED, onResolved);
  Hooks.on(MODULE.HOOKS.APPROVAL_REJECTED, onResolved);
}

/**
 * Read the current user's pending submission, if any. Holds the full submission flag data so it doubles as the durable copy a GM ingests on connect.
 * @returns {?object} Stored submission flag data, or null when unlocked.
 */
export function getPendingSubmission() {
  return game.user.getFlag(MODULE.ID, MODULE.FLAGS.PENDING_SUBMISSION) ?? null;
}

/**
 * Persist the submitter's full submission on their own user flag, then re-render any open wizard.
 * @param {{flagData: object}} payload Approval submission hook payload.
 * @returns {Promise<void>}
 */
async function onSubmitted({ flagData }) {
  await game.user.setFlag(MODULE.ID, MODULE.FLAGS.PENDING_SUBMISSION, flagData ?? { timestamp: Date.now() });
  rerenderWizard();
}

/**
 * Clear the current user's pending submission, then re-render any open wizard.
 * @returns {Promise<void>}
 */
async function onResolved() {
  await game.user.unsetFlag(MODULE.ID, MODULE.FLAGS.PENDING_SUBMISSION);
  rerenderWizard();
}

/**
 * Clear the pending-submission lock on a specific user, so a GM resolving an offline submitter frees them.
 * @param {?string} userId Submitter user id.
 * @returns {Promise<void>}
 */
export async function clearPendingForUser(userId) {
  if (!userId) return;
  if (userId === game.user.id) return onResolved();
  if (!game.user.isGM) return;
  await game.users.get(userId)?.unsetFlag(MODULE.ID, MODULE.FLAGS.PENDING_SUBMISSION);
}

/**
 * Clear every user's pending-submission lock (active GM only); used when approvals are turned off.
 * @returns {Promise<void>}
 */
export async function clearAllPending() {
  if (game.user !== game.users.activeGM) return;
  for (const user of game.users) {
    if (user.getFlag(MODULE.ID, MODULE.FLAGS.PENDING_SUBMISSION)) await user.unsetFlag(MODULE.ID, MODULE.FLAGS.PENDING_SUBMISSION);
  }
}

/**
 * Re-render the wizard instance, if one is currently open.
 * @returns {void}
 */
function rerenderWizard() {
  const wizard = foundry.applications.instances.get(`${MODULE.ID}-wizard`);
  wizard?.render(false);
}
