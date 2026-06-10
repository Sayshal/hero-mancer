import { HeroMancer } from './apps/hero-mancer.mjs';
import { PendingApprovals } from './apps/pending-approvals.mjs';
import { showWizardSplash } from './components/wizard-splash.mjs';
import { MODULE } from './constants.mjs';
import * as documentLoader from './data/document-loader.mjs';
import { groupByTopLevelFolder } from './data/folder-grouper.mjs';
import { findRelatedJournalPage } from './data/journal-finder.mjs';
import { buildProficiencyCategories } from './data/proficiency-extractor.mjs';
import * as approval from './domain/approval.mjs';
import { identityIndexesReady, preloadIdentityDocs } from './domain/identity-tab.mjs';
import { openLevelUp } from './domain/level-up.mjs';
import * as savedOptions from './domain/saved-options.mjs';

/**
 * Open the wizard. When compendium indexes aren't cached yet, show a blurred progress splash while they build, then reveal the fully-rendered window.
 * @param {object} seed Initial draft seed.
 * @returns {Promise<void>}
 */
async function launchWizard(seed) {
  if (identityIndexesReady()) {
    new HeroMancer({ seed }).render({ force: true });
    return;
  }
  const splash = showWizardSplash();
  try {
    await preloadIdentityDocs((done, total) => splash.setProgress(done, total)).catch(() => {});
    await new HeroMancer({ seed }).render({ force: true });
  } finally {
    await splash.reveal();
  }
}

/** Public API surface for Hero Mancer. */
export const HeroMancerAPI = {
  /**
   * Open the Hero Mancer wizard for the current user.
   * @param {object} [opts] Launch options.
   * @param {string} [opts.initialName] Pre-fill the character name field.
   */
  openWizard({ initialName = '' } = {}) {
    void launchWizard({ characterName: initialName });
  },

  /**
   * Open the Hero Mancer wizard on behalf of a specific player (GM-only).
   * @param {string} userId Target user ID.
   * @returns {Promise<void>}
   */
  async openWizardForPlayer(userId) {
    void userId;
    throw new Error('openWizardForPlayer is not yet implemented.');
  },

  /**
   * Open Hero Mancer in level-up mode for an existing character.
   * @param {object} actor Character actor.
   * @returns {?HeroMancer} App instance, or null when the actor is not a character.
   */
  openLevelUp(actor) {
    return openLevelUp(actor);
  },

  /**
   * Open the GM-side pending approvals queue.
   * @returns {PendingApprovals} The rendered application instance.
   */
  openPendingApprovals() {
    const id = `${MODULE.ID}-pending-approvals`;
    const existing = foundry.applications.instances.get(id);
    if (existing) {
      existing.bringToFront?.();
      return existing;
    }
    const app = new PendingApprovals();
    app.render({ force: true });
    return app;
  },

  /**
   * Submit a character payload for GM approval programmatically.
   * @param {object} payload Wizard drafts plus opt-out flags.
   * @returns {Promise<?string>} Page id when the caller is the active GM, null when routed via socket.
   */
  submitForApproval(payload) {
    return approval.submitForApproval(payload);
  },

  /**
   * Read the current pending submissions queue.
   * @returns {JournalEntryPage[]} Pages sorted ascending by submission timestamp.
   */
  getPendingSubmissions() {
    return approval.getPendingSubmissions();
  },

  /**
   * Save a wizard draft for the current user.
   * @param {object} draft Field map to persist.
   * @returns {Promise<*>} setFlag result.
   */
  async saveDraft(draft) {
    return savedOptions.save(draft);
  },

  /**
   * Read the saved wizard draft for the current user.
   * @returns {Promise<?object>} Saved draft or null.
   */
  async getSavedDraft() {
    return savedOptions.load();
  },

  /**
   * Clear the saved wizard draft for the current user.
   * @param {string} [reason] Caller context tag for the verbose log.
   * @returns {Promise<*>} unsetFlag result.
   */
  async clearSavedDraft(reason) {
    return savedOptions.clear(reason);
  },

  /**
   * Diagnostic snapshot of module state.
   * @returns {{version: ?string, enabled: boolean, compat: ?object, lastSeenVersion: ?string}} Module info.
   */
  getInfo() {
    return {
      version: game.modules.get(MODULE.ID)?.version ?? null,
      enabled: game.modules.get(MODULE.ID)?.active ?? false,
      compat: MODULE.COMPAT ?? null,
      lastSeenVersion: game.user.getFlag(MODULE.ID, MODULE.FLAGS.LAST_SEEN_VERSION) ?? null
    };
  },

  /**
   * Reindex documents of the given Foundry Item subtype via dnd5e's CompendiumBrowser.
   * @param {string} type Foundry Item subtype (`race`, `class`, `background`, `subclass`, `feat`).
   * @returns {Promise<{entries: object[]}>} Reindex result.
   */
  async reindexCompendiums(type) {
    return documentLoader.reindex(type);
  },

  /**
   * Read cached entries for a type, optionally grouped by top-level folder.
   * @param {string} type Foundry Item subtype.
   * @param {object} [opts] Options.
   * @param {boolean} [opts.grouped] Return grouped output instead of a flat list.
   * @returns {Array} Flat entry list or grouped `[{folderName, docs}]` array.
   */
  getCompendiumEntries(type, { grouped = false } = {}) {
    const entries = documentLoader.getEntries(type);
    return grouped ? groupByTopLevelFolder(entries) : entries;
  },

  /**
   * Resolve a journal page describing a Document.
   * @param {object} doc Document.
   * @returns {Promise<?string>} Page uuid or null.
   */
  async findJournalPage(doc) {
    return findRelatedJournalPage(doc);
  },

  /**
   * Compute template-ready proficiency categories from a list of documents.
   * @param {object[]} docs Race / class / background / subclass documents.
   * @returns {Array<{label: string, icon: string, items: object[]}>} Render-ready categories.
   */
  buildProficiencies(docs) {
    return buildProficiencyCategories(docs);
  }
};

/**
 * Create and install the global HEROMANCER namespace and attach the API to the module record.
 * @returns {void}
 */
export function createGlobalNamespace() {
  globalThis.HEROMANCER = { api: HeroMancerAPI };
  game.modules.get(MODULE.ID).api = HeroMancerAPI;
}
