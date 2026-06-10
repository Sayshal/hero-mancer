import { HMPrompt } from '../apps/dialog.mjs';
import { HeroMancer } from '../apps/hero-mancer.mjs';
import { MODULE } from '../constants.mjs';
import * as savedOptions from './saved-options.mjs';

/**
 * Subscribe submitter-side rejection dialog + floating banner to the public approval hooks.
 * @returns {void}
 */
export function registerRejectionHandler() {
  Hooks.on(MODULE.HOOKS.APPROVAL_REJECTED, onRejected);
  Hooks.on(MODULE.HOOKS.WIZARD_OPENED, mountBannerIfPending);
}

/**
 * Stash the reason on the user flag for the banner, then open the restore chooser with the submission payload.
 * @param {{reason: string, payload: string}} message Hook payload from the rejection socket; `payload` is the submission JSON.
 * @returns {Promise<void>}
 */
async function onRejected({ reason, payload }) {
  await game.user.setFlag(MODULE.ID, MODULE.FLAGS.LAST_REJECTION, { reason, timestamp: Date.now() });
  openRestoreChooser(payload, reason);
}

/**
 * Open the rejection chooser on the submitter's client: restore the rejected submission into a fresh wizard, or start over.
 * @param {?string} payloadJson Submission payload JSON string (carries the per-tab drafts + rawDraft for the resume seed).
 * @param {?string} reason Rejection reason text.
 * @returns {void}
 */
export function openRestoreChooser(payloadJson, reason) {
  new HMPrompt({
    window: { title: 'HEROMANCER.Approval.RejectionNotice.Title', icon: 'fa-solid fa-circle-xmark' },
    template: MODULE.TEMPLATES.DIALOGS.REJECTION_NOTICE,
    context: { reason: reason ?? '' },
    buttons: [
      { action: 'restore', label: 'HEROMANCER.Approval.RejectionNotice.Restore', icon: 'fa-solid fa-pen-to-square', default: true, callback: () => restoreFromSubmission(payloadJson) },
      { action: 'start-over', label: 'HEROMANCER.Approval.RejectionNotice.StartOver', icon: 'fa-solid fa-trash', callback: startOver }
    ]
  }).render({ force: true });
}

/**
 * Open a fresh wizard seeded from the rejected submission so the resume restore rebuilds every tab.
 * @param {?string} payloadJson Submission payload JSON string.
 * @returns {void}
 */
function restoreFromSubmission(payloadJson) {
  let payload = null;
  try {
    payload = payloadJson ? JSON.parse(payloadJson) : null;
  } catch {
    payload = null;
  }
  new HeroMancer(payload ? { resumeSeed: payload } : {}).render({ force: true });
}

/**
 * Clear the saved draft and the rejection flag, drop any banner, and open a clean wizard.
 * @returns {Promise<void>}
 */
async function startOver() {
  await Promise.all([savedOptions.clear('rejection-start-over'), game.user.unsetFlag(MODULE.ID, MODULE.FLAGS.LAST_REJECTION)]);
  document.querySelector('.hm-rejection-banner')?.remove();
  new HeroMancer().render({ force: true });
}

/**
 * Mount the floating rejection banner above the freshly opened wizard when the flag is set.
 * @returns {Promise<void>}
 */
async function mountBannerIfPending() {
  const stored = game.user.getFlag(MODULE.ID, MODULE.FLAGS.LAST_REJECTION);
  if (!stored) return;
  if (document.querySelector('.hm-rejection-banner')) return;
  const banner = document.createElement('aside');
  banner.className = 'hero-mancer hm-banner hm-rejection-banner';
  banner.innerHTML = await foundry.applications.handlebars.renderTemplate(MODULE.TEMPLATES.COMPONENTS.BANNER, {
    icon: 'fa-solid fa-circle-xmark',
    title: _loc('HEROMANCER.Approval.RejectionBanner.Title'),
    reason: stored.reason ?? '',
    noReason: !stored.reason
  });
  banner.querySelector('.hm-banner-dismiss').addEventListener('click', dismissBanner);
  document.body.appendChild(banner);
  Hooks.once('closeHeroMancer', () => banner.remove());
}

/**
 * Dismiss the floating banner manually: clear the flag and unmount.
 * @returns {Promise<void>}
 */
async function dismissBanner() {
  await game.user.unsetFlag(MODULE.ID, MODULE.FLAGS.LAST_REJECTION);
  document.querySelector('.hm-rejection-banner')?.remove();
}
