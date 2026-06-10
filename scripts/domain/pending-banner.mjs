import { PendingApprovals } from '../apps/pending-approvals.mjs';
import { MODULE } from '../constants.mjs';
import { findApprovalJournal, getPendingCount } from './approval.mjs';

/**
 * Subscribe the GM pending-submission banner to ready + journal hooks.
 * @returns {void}
 */
export function registerPendingBanner() {
  if (!game.user.isGM) return;
  refresh();
  Hooks.on('createJournalEntryPage', onPageChange);
  Hooks.on('deleteJournalEntryPage', onPageChange);
}

/**
 * Re-evaluate the banner when a pending-journal page is created or removed.
 * @param {JournalEntryPage} page Mutated page.
 * @returns {void}
 */
function onPageChange(page) {
  if (page.parent !== findApprovalJournal()) return;
  refresh();
}

/**
 * Mount or update the banner based on current pending count; remove when count drops to 0.
 * @returns {void}
 */
function refresh() {
  const count = getPendingCount();
  const existing = document.querySelector('.hm-pending-banner');
  if (!count) {
    existing?.remove();
    return;
  }
  const message = _locP('HEROMANCER.Approval.Banner', count);
  if (existing) {
    const body = existing.querySelector('.hm-banner-body strong');
    if (body) body.textContent = message;
    return;
  }
  mount(message);
}

/**
 * Build the banner DOM and append it to document.body.
 * @param {string} message Localized banner headline text.
 * @returns {Promise<void>}
 */
async function mount(message) {
  const banner = document.createElement('aside');
  banner.className = 'hero-mancer hm-banner hm-pending-banner';
  banner.innerHTML = await foundry.applications.handlebars.renderTemplate(MODULE.TEMPLATES.COMPONENTS.BANNER, { icon: 'fa-solid fa-clipboard-check', title: message, open: true });
  if (document.querySelector('.hm-pending-banner')) return;
  banner.querySelector('.hm-banner-open').addEventListener('click', openQueue);
  banner.querySelector('.hm-banner-dismiss').addEventListener('click', () => banner.remove());
  document.body.appendChild(banner);
}

/**
 * Open the pending-approvals queue browser.
 * @returns {void}
 */
function openQueue() {
  const id = `${MODULE.ID}-pending-approvals`;
  const existing = foundry.applications.instances.get(id);
  if (existing) existing.bringToFront?.();
  else new PendingApprovals().render({ force: true });
}
