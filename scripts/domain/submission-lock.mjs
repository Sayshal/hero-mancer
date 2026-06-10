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
 * Read the current user's pending-submission marker, if any.
 * @returns {?{timestamp: number}} Stored marker, or null when unlocked.
 */
export function getPendingSubmission() {
  return game.user.getFlag(MODULE.ID, MODULE.FLAGS.PENDING_SUBMISSION) ?? null;
}

/**
 * Stash pending-submission state for the active user, then re-render any open wizard.
 * @param {{flagData: object}} payload Approval submission hook payload.
 * @returns {Promise<void>}
 */
async function onSubmitted({ flagData }) {
  await game.user.setFlag(MODULE.ID, MODULE.FLAGS.PENDING_SUBMISSION, { timestamp: flagData?.timestamp ?? Date.now() });
  rerenderWizard();
}

/**
 * Clear pending-submission state, then re-render any open wizard.
 * @returns {Promise<void>}
 */
async function onResolved() {
  await game.user.unsetFlag(MODULE.ID, MODULE.FLAGS.PENDING_SUBMISSION);
  rerenderWizard();
}

/**
 * Re-render the wizard instance, if one is currently open.
 * @returns {void}
 */
function rerenderWizard() {
  const wizard = foundry.applications.instances.get(`${MODULE.ID}-wizard`);
  wizard?.render(false);
}
