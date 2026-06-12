import { applyItemLinks } from '../utils/item-link.mjs';

/** Renders the feat list in scroll-loaded batches and wires its search/filter controls; pick + pin clicks delegate to the parent app's actions. */
export class FeatBrowser {
  /** @type {WeakMap<HTMLElement, FeatBrowser>} */
  static #instances = new WeakMap();

  /** @type {number} Feats rendered into the DOM per batch (initial render + each scroll-load). */
  static BATCH_SIZE = 50;

  /** @type {number} Distance in px from the list bottom at which the next batch loads. */
  static SCROLL_MARGIN = 50;

  /** @type {boolean} True while an inline-filter relayout is queued for the next frame. */
  #layoutScheduled = false;

  /** @type {object[]} Feats matching the current filters. */
  #filtered = [];

  /** @type {number} Count of `#filtered` already rendered into the list. */
  #renderedCount = 0;

  /**
   * @param {HTMLElement} root Browser root with `[data-feat-browser]`.
   * @param {{feats:object[]}} [data] Feat records, held in JS for windowed rendering.
   * @returns {FeatBrowser} New or cached instance.
   */
  static attach(root, data) {
    return FeatBrowser.#instances.get(root) ?? new FeatBrowser(root, data);
  }

  /**
   * @param {HTMLElement} root Browser root.
   * @param {{feats:object[]}} [data] Feat records.
   */
  constructor(root, data = {}) {
    this.root = root;
    this.feats = data.feats ?? [];
    this.tilesList = root.querySelector('[data-feat-browser-tiles]');
    this.searchInput = root.querySelector('[data-feat-browser-search]');
    this.filterButtons = Array.from(root.querySelectorAll('[data-feat-browser-filter]'));
    this.rulesButtons = Array.from(root.querySelectorAll('[data-feat-browser-rules]'));
    this.bookButtons = Array.from(root.querySelectorAll('[data-feat-browser-book]'));
    this.actionButtons = Array.from(root.querySelectorAll('[data-feat-browser-action]'));
    this.abilityButtons = Array.from(root.querySelectorAll('[data-feat-browser-ability]'));
    this.qualifyToggles = Array.from(root.querySelectorAll('[data-feat-browser-qualify]'));
    this.grantsAsiToggles = Array.from(root.querySelectorAll('[data-feat-browser-grants-asi]'));
    this.grantsSpellToggles = Array.from(root.querySelectorAll('[data-feat-browser-grants-spell]'));
    this.emptyEl = root.querySelector('[data-feat-browser-empty]');
    this.activeFilter = this.filterButtons.find((b) => b.classList.contains('is-active'))?.dataset.featBrowserFilter ?? 'all';
    this.activeRules = this.rulesButtons.find((b) => b.classList.contains('is-active'))?.dataset.featBrowserRules ?? 'all';
    this.activeBook = this.bookButtons.find((b) => b.classList.contains('is-active'))?.dataset.featBrowserBook ?? 'all';
    this.activeAction = this.actionButtons.find((b) => b.classList.contains('is-active'))?.dataset.featBrowserAction ?? 'all';
    this.activeAbility = this.abilityButtons.find((b) => b.classList.contains('is-active'))?.dataset.featBrowserAbility ?? 'all';
    this.inlineBar = root.querySelector('[data-feat-browser-inline]');
    this.#bind();
    this.#apply();
    this.#layoutInline();
    FeatBrowser.#instances.set(root, this);
  }

  /** Wire search, dropdowns, filter chips, and qualifying toggle. */
  #bind() {
    this.searchInput?.addEventListener('input', () => this.#apply());
    for (const btn of this.filterButtons) btn.addEventListener('click', () => this.#onChipFilter(btn, this.filterButtons, 'featBrowserFilter', 'activeFilter'));
    for (const btn of this.rulesButtons) btn.addEventListener('click', () => this.#onChipFilter(btn, this.rulesButtons, 'featBrowserRules', 'activeRules'));
    for (const btn of this.bookButtons) btn.addEventListener('click', () => this.#onChipFilter(btn, this.bookButtons, 'featBrowserBook', 'activeBook'));
    for (const btn of this.actionButtons) btn.addEventListener('click', () => this.#onChipFilter(btn, this.actionButtons, 'featBrowserAction', 'activeAction'));
    for (const btn of this.abilityButtons) btn.addEventListener('click', () => this.#onChipFilter(btn, this.abilityButtons, 'featBrowserAbility', 'activeAbility'));
    this.#wireToggleGroup(this.qualifyToggles);
    this.#wireToggleGroup(this.grantsAsiToggles);
    this.#wireToggleGroup(this.grantsSpellToggles);
    this.tilesList?.addEventListener('scroll', () => this.#onScroll(), { passive: true });
    if (this.inlineBar) {
      let lastWidth = -1;
      new ResizeObserver((entries) => {
        const width = Math.round(entries[entries.length - 1].contentRect.width);
        if (width === lastWidth) return;
        lastWidth = width;
        this.#scheduleLayout();
      }).observe(this.root);
    }
  }

  /** Coalesce inline-filter relayouts to at most one per frame. */
  #scheduleLayout() {
    if (this.#layoutScheduled) return;
    this.#layoutScheduled = true;
    requestAnimationFrame(() => {
      this.#layoutScheduled = false;
      this.#layoutInline();
    });
  }

  /**
   * Wire a checkbox filter that may appear both inline and in the popover: mirror the checked state across copies, then re-filter.
   * @param {HTMLInputElement[]} toggles Every copy of the toggle.
   */
  #wireToggleGroup(toggles) {
    for (const toggle of toggles)
      toggle.addEventListener('change', () => {
        for (const other of toggles) other.checked = toggle.checked;
        this.#apply();
      });
  }

  /** Keep the inline filter groups to a single row: show groups left-to-right while they fit, sending the rest to the popover. */
  #layoutInline() {
    if (!this.inlineBar) return;
    const groups = Array.from(this.inlineBar.querySelectorAll('[data-inline-group]'));
    if (!groups.length) return;
    this.inlineBar.hidden = false;
    for (const g of groups) g.hidden = false;
    const gap = parseFloat(getComputedStyle(this.inlineBar).columnGap) || 0;
    const available = this.inlineBar.clientWidth;
    let used = 0;
    let overflowed = false;
    for (const [i, group] of groups.entries()) {
      used += (i ? gap : 0) + group.offsetWidth;
      if (used > available) overflowed = true;
      group.hidden = overflowed;
      const section = this.root.querySelector(`[data-popover-section="${group.dataset.inlineGroup}"]`);
      if (section) section.hidden = !overflowed;
    }
    this.inlineBar.hidden = groups.every((g) => g.hidden);
  }

  /**
   * Activate the clicked chip in its group and re-apply.
   * @param {HTMLElement} btn Clicked chip.
   * @param {HTMLElement[]} group Sibling chips.
   * @param {string} datasetKey Dataset key carrying the value.
   * @param {string} stateKey Instance property holding active value.
   */
  #onChipFilter(btn, group, datasetKey, stateKey) {
    this[stateKey] = btn.dataset[datasetKey] ?? 'all';
    for (const b of group) b.classList.toggle('is-active', b === btn);
    this.#apply();
  }

  /** Re-filter the feats against the current controls and render the first batch. */
  #apply() {
    if (!this.tilesList) return;
    const query = (this.searchInput?.value ?? '').trim().toLowerCase();
    const subtype = this.activeFilter;
    const rules = this.activeRules;
    const book = this.activeBook;
    const action = this.activeAction;
    const ability = this.activeAbility;
    const qualifyingOnly = this.qualifyToggles.some((t) => t.checked);
    const grantsAsiOnly = this.grantsAsiToggles.some((t) => t.checked);
    const grantsSpellOnly = this.grantsSpellToggles.some((t) => t.checked);
    this.#filtered = this.feats.filter((feat) => {
      if (query && !(feat.name ?? '').toLowerCase().includes(query)) return false;
      if (subtype !== 'all' && feat.subtype !== subtype) return false;
      if (rules !== 'all' && feat.rules !== rules) return false;
      if (book !== 'all' && feat.book !== book) return false;
      if (action !== 'all' && !feat.actionBuckets?.has?.(action)) return false;
      if (ability !== 'all' && !feat.abilityIncreases?.has?.(ability)) return false;
      if (qualifyingOnly && !feat.qualifies) return false;
      if (grantsAsiOnly && !feat.hasASI) return false;
      if (grantsSpellOnly && !feat.grantsSpell) return false;
      return true;
    });
    this.tilesList.replaceChildren();
    this.#renderedCount = 0;
    this.tilesList.scrollTop = 0;
    this.#renderNextBatch();
    if (this.emptyEl) this.emptyEl.hidden = this.#filtered.length > 0;
  }

  /** Append the next batch of filtered feats to the list. */
  #renderNextBatch() {
    if (this.#renderedCount >= this.#filtered.length) return;
    const end = Math.min(this.#renderedCount + FeatBrowser.BATCH_SIZE, this.#filtered.length);
    const html = this.#filtered
      .slice(this.#renderedCount, end)
      .map((feat) => Handlebars.partials.hmFeatTile(feat))
      .join('');
    this.tilesList.insertAdjacentHTML('beforeend', html);
    this.#renderedCount = end;
    applyItemLinks(this.tilesList);
  }

  /** Load the next batch once the user scrolls within `SCROLL_MARGIN` of the list bottom. */
  #onScroll() {
    if (this.#renderedCount >= this.#filtered.length) return;
    const { scrollTop, scrollHeight, clientHeight } = this.tilesList;
    if (scrollTop + clientHeight >= scrollHeight - FeatBrowser.SCROLL_MARGIN) this.#renderNextBatch();
  }
}
