import { MODULE } from '../constants.mjs';
import {
  approveSubmission,
  clearArchive,
  decodePayload,
  findArchiveJournal,
  getArchivedSubmissions,
  getPendingSubmissions,
  promptRejectionReason,
  rejectSubmission,
  restoreFromArchive
} from '../domain/approval.mjs';
import { HMDialog, HMPrompt } from './dialog.mjs';
import { HeroMancer } from './hero-mancer.mjs';

const SUBMISSION_FLAG = 'submission';

/** GM-side queue browser for pending character submissions. */
export class PendingApprovals extends HMDialog {
  static DEFAULT_OPTIONS = {
    id: `${MODULE.ID}-pending-approvals`,
    classes: ['hm-pending-approvals'],
    window: { title: 'HEROMANCER.Approval.Queue.Title', icon: 'fa-solid fa-clipboard-check' },
    position: { width: 720, height: 'auto' },
    actions: {
      review: PendingApprovals.#onReview,
      quickApprove: PendingApprovals.#onQuickApprove,
      quickReject: PendingApprovals.#onQuickReject,
      toggleArchive: PendingApprovals.#onToggleArchive,
      restoreArchive: PendingApprovals.#onRestoreArchive,
      clearArchive: PendingApprovals.#onClearArchive
    }
  };

  static PARTS = {
    header: HMDialog.HEADER_PART,
    list: { template: MODULE.TEMPLATES.APPROVALS.LIST }
  };

  #showArchive = false;

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const archiveEnabled = game.settings.get(MODULE.ID, MODULE.SETTINGS.KEEP_APPROVAL_ARCHIVE);
    const showArchive = this.#showArchive && archiveEnabled;
    return {
      ...context,
      rows: showArchive ? this.#buildArchiveRows() : this.#buildPendingRows(),
      showArchive,
      archiveEnabled,
      archiveExists: !!findArchiveJournal(),
      canClearArchive: showArchive && !!findArchiveJournal() && game.user === game.users.activeGM,
      headerControls: archiveEnabled
        ? [
            {
              action: 'toggleArchive',
              icon: showArchive ? 'fa-solid fa-clipboard-list' : 'fa-solid fa-box-archive',
              label: showArchive ? 'HEROMANCER.Approval.Queue.ViewPending' : 'HEROMANCER.Approval.Queue.ViewArchive'
            }
          ]
        : []
    };
  }

  /**
   * Build the row context for each pending page.
   * @returns {Array<object>} Pending entries newest-after-oldest with no outcome.
   */
  #buildPendingRows() {
    return getPendingSubmissions().map((page) => {
      const flagData = page.getFlag(MODULE.ID, SUBMISSION_FLAG) ?? {};
      const payload = decodePayload(flagData.payload);
      return {
        id: page.id,
        characterName: flagData.characterName ?? page.name,
        submitterUserName: flagData.submitterUserName ?? '-',
        level: payload?.startDraft?.level ?? 1,
        timestamp: flagData.timestamp ? foundry.utils.timeSince(flagData.timestamp) : '-',
        outcome: null
      };
    });
  }

  /**
   * Build the row context for each archived page; newest resolution first; carries outcome chip.
   * @returns {Array<object>} Archive entries with outcome + resolvedAt.
   */
  #buildArchiveRows() {
    return getArchivedSubmissions().map((page) => {
      const flagData = page.getFlag(MODULE.ID, SUBMISSION_FLAG) ?? {};
      const payload = decodePayload(flagData.payload);
      const outcome = flagData.status ?? null;
      return {
        id: page.id,
        characterName: flagData.characterName ?? page.name,
        submitterUserName: flagData.submitterUserName ?? '-',
        level: payload?.startDraft?.level ?? 1,
        timestamp: flagData.resolvedAt ? foundry.utils.timeSince(flagData.resolvedAt) : '-',
        outcome,
        outcomeLabel: outcome ? _loc(`HEROMANCER.Approval.Queue.outcome-${outcome}`) : ''
      };
    });
  }

  /**
   * Per-row Review action. Opens the per-submission review window when available.
   * @param {Event} _event Click event.
   * @param {HTMLElement} target Action element.
   * @returns {void}
   */
  static #onReview(_event, target) {
    const pageId = target.closest('[data-page-id]')?.dataset.pageId;
    if (!pageId) return;
    const id = `${MODULE.ID}-wizard-review-${pageId}`;
    const existing = foundry.applications.instances.get(id);
    if (existing) {
      existing.bringToFront?.();
      return;
    }
    const page = getPendingSubmissions().find((p) => p.id === pageId);
    const flagData = page?.getFlag(MODULE.ID, SUBMISSION_FLAG);
    const payload = decodePayload(flagData?.payload);
    new HeroMancer({ reviewMode: { pageId, payload, submitterUserId: flagData?.submitterUserId } }).render({ force: true });
  }

  /**
   * Per-row quick-approve action. Approves the submission as-submitted without opening the wizard.
   * @param {Event} _event Click event.
   * @param {HTMLElement} target Action element.
   * @returns {Promise<void>}
   */
  static async #onQuickApprove(_event, target) {
    const pageId = target.closest('[data-page-id]')?.dataset.pageId;
    if (!pageId) return;
    await approveSubmission(pageId);
    ui.notifications.info('HEROMANCER.Approval.Review.ApprovedToast', { localize: true });
  }

  /**
   * Per-row quick-reject action. Prompts for a reason and rejects the submission.
   * @param {Event} _event Click event.
   * @param {HTMLElement} target Action element.
   * @returns {Promise<void>}
   */
  static async #onQuickReject(_event, target) {
    const pageId = target.closest('[data-page-id]')?.dataset.pageId;
    if (!pageId) return;
    const reason = await promptRejectionReason();
    if (reason === null) return;
    await rejectSubmission(pageId, reason);
    ui.notifications.info('HEROMANCER.Approval.Review.RejectedToast', { localize: true });
  }

  /**
   * Per-row restore action. Moves an archived submission back into the pending queue.
   * @param {Event} _event Click event.
   * @param {HTMLElement} target Action element.
   * @returns {Promise<void>}
   */
  static async #onRestoreArchive(_event, target) {
    const pageId = target.closest('[data-page-id]')?.dataset.pageId;
    if (!pageId) return;
    await restoreFromArchive(pageId);
    ui.notifications.info('HEROMANCER.Approval.Queue.RestoredToast', { localize: true });
  }

  /**
   * Flip between pending and archive views.
   * @returns {void}
   */
  static #onToggleArchive() {
    this.#showArchive = !this.#showArchive;
    this.render(false);
  }

  /**
   * Confirm + delete the archive journal wholesale.
   * @returns {Promise<void>}
   */
  static async #onClearArchive() {
    const confirmed = await HMPrompt.confirm({ window: { title: 'HEROMANCER.Approval.Queue.ClearArchive.Title' }, body: _loc('HEROMANCER.Approval.Queue.ClearArchive.Body'), modal: true });
    if (!confirmed) return;
    await clearArchive();
  }
}
