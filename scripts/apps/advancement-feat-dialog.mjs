import { FeatBrowser } from '../components/feat-browser.mjs';
import { MODULE } from '../constants.mjs';
import * as compare from '../domain/compare.mjs';
import { CompareDialog } from './compare-dialog.mjs';
import { HMDialog } from './dialog.mjs';

/** AppV2 modal that wraps the existing feat-browser partial as a standalone window for ASI feat-mode picks. */
export class AdvancementFeatDialog extends HMDialog {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    classes: ['hm-feat-dialog'],
    tag: 'form',
    window: { title: 'HEROMANCER.App.Advancements.FeatDialog.Title', icon: 'fa-solid fa-magnifying-glass' },
    position: { width: 720, height: 720 },
    actions: { selectFeat: AdvancementFeatDialog.#onSelectFeat, togglePin: AdvancementFeatDialog.#onTogglePin, openCompare: AdvancementFeatDialog.#onOpenCompare }
  };

  /** @inheritdoc */
  static PARTS = {
    header: HMDialog.HEADER_PART,
    body: { template: MODULE.TEMPLATES.DIALOGS.FEAT, templates: [MODULE.TEMPLATES.COMPONENTS.FEAT_BROWSER] }
  };

  /**
   * @param {object} args Dialog inputs.
   * @param {Function} args.buildContext Builds a fresh feat-browser context (called on every render).
   * @param {object} args.filters Shared filter state (mutated on user interaction).
   * @param {HTMLInputElement} args.hiddenInput Row's serialized-pick hidden input.
   * @param {Function} [args.onCommit] Optional callback after commit.
   * @param {object} [options] AppV2 options.
   */
  constructor({ buildContext, filters, hiddenInput, onCommit }, options = {}) {
    super(options);
    this.buildContext = buildContext;
    this.filters = filters;
    this.hiddenInput = hiddenInput;
    this.onCommit = onCommit;
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return { ...context, featBrowser: this.buildContext() };
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element.querySelector('[data-feat-browser]');
    if (root) FeatBrowser.attach(root, context.featBrowser);
    this.#wirePopoverOutsideClose();
    this.#wireFilters();
  }

  /** Close the filter popover when the user clicks outside it. */
  #wirePopoverOutsideClose() {
    if (this.element.dataset.popoverOutsideWired === '1') return;
    this.element.dataset.popoverOutsideWired = '1';
    document.addEventListener('pointerdown', (event) => {
      const live = this.element?.querySelector?.('[data-feat-browser-filter-menu]');
      if (!live?.open) return;
      if (event.target === live || live.contains(event.target)) return;
      live.open = false;
    });
  }

  /** Persist filter changes to the shared state. */
  #wireFilters() {
    if (this.element.dataset.filtersWired === '1') return;
    this.element.dataset.filtersWired = '1';
    this.element.addEventListener('input', (event) => {
      if (event.target?.matches?.('[data-feat-browser-search]')) this.filters.search = event.target.value;
    });
    this.element.addEventListener('change', (event) => {
      const t = event.target;
      if (t?.matches?.('[data-feat-browser-qualify]')) this.filters.qualify = t.checked;
      else if (t?.matches?.('[data-feat-browser-grants-asi]')) this.filters.grantsAsi = t.checked;
      else if (t?.matches?.('[data-feat-browser-grants-spell]')) this.filters.grantsSpell = t.checked;
    });
    this.element.addEventListener('click', (event) => {
      const t = event.target;
      const subBtn = t.closest?.('[data-feat-browser-filter]');
      if (subBtn) this.filters.subtype = subBtn.dataset.featBrowserFilter;
      const rulesBtn = t.closest?.('[data-feat-browser-rules]');
      if (rulesBtn) this.filters.rules = rulesBtn.dataset.featBrowserRules;
      const bookBtn = t.closest?.('[data-feat-browser-book]');
      if (bookBtn) this.filters.book = bookBtn.dataset.featBrowserBook;
      const actionBtn = t.closest?.('[data-feat-browser-action]');
      if (actionBtn) this.filters.action = actionBtn.dataset.featBrowserAction;
      const abilityBtn = t.closest?.('[data-feat-browser-ability]');
      if (abilityBtn) this.filters.ability = abilityBtn.dataset.featBrowserAbility;
    });
  }

  /**
   * Commit a feat pick: write `{type: 'feat', feat: uuid}` to the row's hidden input + close.
   * @this {AdvancementFeatDialog}
   * @param {PointerEvent} _event Click event.
   * @param {HTMLElement} target Action element carrying `data-uuid`.
   * @returns {Promise<void>}
   */
  static async #onSelectFeat(_event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;
    this.hiddenInput.value = JSON.stringify({ type: 'feat', assignments: {}, feat: uuid });
    this.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    this.onCommit?.();
    this.close();
  }

  /**
   * Toggle a compare pin on a feat tile + re-render the dialog so the pin chip + compare-button counts update.
   * @this {AdvancementFeatDialog}
   * @param {PointerEvent} _event Pointer event.
   * @param {HTMLElement} target Action target.
   */
  static #onTogglePin(_event, target) {
    const category = target.dataset.category;
    const uuid = target.dataset.uuid;
    if (!category || !uuid) return;
    const outcome = compare.togglePin(category, uuid);
    if (outcome === 'invalid') return;
    const isPinned = compare.hasPin(category, uuid);
    target.classList.toggle('is-pinned', isPinned);
    target.setAttribute('aria-label', _loc(isPinned ? 'HEROMANCER.Compare.Unpin' : 'HEROMANCER.Compare.Pin'));
    const count = compare.pinCount(category);
    const compareBtn = this.element.querySelector('.hm-feat-browser-compare');
    if (compareBtn) {
      compareBtn.disabled = count < 2;
      compareBtn.setAttribute('aria-label', _loc('HEROMANCER.Compare.Open', { count }));
    }
    const existing = foundry.applications.instances.get(`${MODULE.ID}-compare-${category}`);
    if (existing) existing.render();
  }

  /**
   * Open the compare dialog for the active category (feats).
   * @this {AdvancementFeatDialog}
   * @param {PointerEvent} _event Pointer event.
   * @param {HTMLElement} target Action target.
   */
  static #onOpenCompare(_event, target) {
    const category = target.dataset.category;
    if (!compare.CATEGORIES.has(category)) return;
    if (compare.pinCount(category) < 2) {
      ui.notifications.info('HEROMANCER.Compare.NeedTwo', { localize: true });
      return;
    }
    new CompareDialog({ category }).render({ force: true });
  }
}
