import { applyItemLinks } from '../utils/item-link.mjs';

/** Slide-in side panel that resolves `category`/`choice` equipment picks. */
export class EquipmentDetailPanel {
  /** @type {WeakMap<HTMLElement, EquipmentDetailPanel>} Per-root instance cache (returns same instance for an unchanged morph). */
  static #instances = new WeakMap();

  /** @type {WeakMap<HTMLElement, EquipmentDetailPanel>} Per-scope owner — when a fresh panel root attaches, the previous owner's scope listeners get unbound. */
  static #scopeOwners = new WeakMap();

  /**
   * @param {HTMLElement} root Panel root with `[data-equipment-detail-panel]`.
   * @returns {EquipmentDetailPanel} New or cached instance.
   */
  static attach(root) {
    const existing = EquipmentDetailPanel.#instances.get(root);
    if (existing) return existing;
    return new EquipmentDetailPanel(root);
  }

  /**
   * Attach every panel under `scope`.
   * @param {Element|Document} scope Container to query.
   * @returns {EquipmentDetailPanel[]} One instance per panel.
   */
  static attachAll(scope) {
    return Array.from(scope.querySelectorAll('[data-equipment-detail-panel]')).map((el) => EquipmentDetailPanel.attach(el));
  }

  /** @param {HTMLElement} root Panel root. */
  constructor(root) {
    this.root = root;
    this.titleEl = root.querySelector('[data-detail-title]');
    this.searchInput = root.querySelector('[data-detail-search]');
    this.list = root.querySelector('[data-detail-list]');
    this.emptyEl = root.querySelector('[data-detail-empty]');
    this.scope = root.closest('form') ?? document.body;
    this.activeName = null;
    this.activeTrigger = null;
    const prevOwner = EquipmentDetailPanel.#scopeOwners.get(this.scope);
    if (prevOwner && prevOwner !== this) prevOwner.#unbindScope();
    this.#bind();
    EquipmentDetailPanel.#instances.set(root, this);
    EquipmentDetailPanel.#scopeOwners.set(this.scope, this);
  }

  /** Wire delegated listeners on the form scope + panel root. */
  #bind() {
    this.scopeClickHandler = (e) => this.#onScopeClick(e);
    this.scopeKeyHandler = (e) => this.#onScopeKey(e);
    this.scope.addEventListener('click', this.scopeClickHandler);
    this.scope.addEventListener('keydown', this.scopeKeyHandler);
    this.root.addEventListener('click', (e) => this.#onPanelClick(e));
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
    this.searchInput?.addEventListener('input', () => this.#filter());
  }

  /** Drop the previous scope listeners — called when a fresh panel attaches after a re-render. */
  #unbindScope() {
    if (this.scopeClickHandler) this.scope.removeEventListener('click', this.scopeClickHandler);
    if (this.scopeKeyHandler) this.scope.removeEventListener('keydown', this.scopeKeyHandler);
    this.scopeClickHandler = null;
    this.scopeKeyHandler = null;
  }

  /**
   * Scope-level click handler — only reacts to picker triggers.
   * @param {MouseEvent} e Click event.
   */
  #onScopeClick(e) {
    const trig = e.target.closest('[data-picker-trigger]');
    if (trig && this.scope.contains(trig)) {
      e.preventDefault();
      this.#openForTrigger(trig);
      return;
    }
    if (!this.root.hidden && !e.target.closest('[data-equipment-detail-panel]')) this.close();
  }

  /**
   * Scope-level keydown — Enter/Space on a non-button picker trigger (`<span role="button">`).
   * @param {KeyboardEvent} e Keydown event.
   */
  #onScopeKey(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const trig = e.target.closest('[data-picker-trigger]');
    if (!trig || !this.scope.contains(trig)) return;
    e.preventDefault();
    this.#openForTrigger(trig);
  }

  /**
   * Panel-internal click handler — close button + option commit.
   * @param {MouseEvent} e Click event.
   */
  #onPanelClick(e) {
    if (e.target.closest('[data-detail-close]')) {
      e.preventDefault();
      this.close();
      return;
    }
    const opt = e.target.closest('[data-detail-option]');
    if (opt) {
      e.preventDefault();
      this.#pick(opt.dataset.value, opt);
    }
  }

  /**
   * Populate options from a trigger's payload and slide the panel open.
   * @param {HTMLElement} trig Picker chip button.
   */
  #openForTrigger(trig) {
    this.#resetActive();
    const sectionsJson = trig.dataset.pickerSections;
    if (sectionsJson) {
      this.#openMultiSection(trig, sectionsJson);
      return;
    }
    const name = trig.dataset.pickerName;
    const input = this.scope.querySelector(`input[type="hidden"][name="${CSS.escape(name)}"]`);
    if (!input) return;
    let options;
    try {
      options = JSON.parse(trig.dataset.pickerOptions ?? '[]');
    } catch {
      options = [];
    }
    const max = Math.max(1, Number(trig.dataset.pickerMax) || 1);
    this.activeName = name;
    this.activeTrigger = trig;
    this.activeOptions = options;
    this.activeMax = max;
    this.activeLabel = trig.dataset.pickerLabel ?? '';
    const currentValues = max > 1 ? (input.value ? input.value.split(',').filter(Boolean) : []) : input.value;
    this.#refreshMultiTitle(Array.isArray(currentValues) ? currentValues.length : 0);
    this.searchInput.value = '';
    this.#renderOptions(options, currentValues);
    if (max > 1) this.#applyMultiCapacityState(Array.isArray(currentValues) ? currentValues.length : 0);
    this.root.hidden = false;
    requestAnimationFrame(() => this.root.classList.add('is-open'));
    this.searchInput.focus({ preventScroll: true });
  }

  /**
   * Open the panel for an AND-bundle's multi-section payload (each section is its own labelled sub-picker).
   * @param {HTMLElement} trig Picker trigger element.
   * @param {string} sectionsJson JSON-encoded section list.
   */
  #openMultiSection(trig, sectionsJson) {
    let sections;
    try {
      sections = JSON.parse(sectionsJson);
    } catch {
      sections = [];
    }
    if (!sections.length) return;
    for (const sec of sections) {
      const input = this.scope.querySelector(`input[type="hidden"][name="${CSS.escape(sec.name)}"]`);
      sec.current = input?.value ?? '';
    }
    this.activeName = null;
    this.activeTrigger = trig;
    this.activeOptions = null;
    this.activeSections = sections;
    this.activeMax = sections.reduce((s, sec) => s + (sec.max || 1), 0);
    this.activeLabel = trig.dataset.pickerLabel ?? '';
    const filled = sections.reduce((n, sec) => n + (sec.current ? 1 : 0), 0);
    this.titleEl.textContent = `${this.activeLabel} (${filled}/${this.activeMax})`;
    this.searchInput.value = '';
    this.#renderSections(sections);
    this.root.hidden = false;
    requestAnimationFrame(() => this.root.classList.add('is-open'));
    this.searchInput.focus({ preventScroll: true });
  }

  /**
   * Render a multi-section option list with per-section headers and selection state.
   * @param {object[]} sections Section payloads (name, label, max, options, current).
   */
  #renderSections(sections) {
    const context = sections.map((sec, sIdx) => ({
      header: `${sec.label} (${sec.current ? 1 : 0}/${sec.max || 1})`,
      sectionIdx: String(sIdx),
      options: (sec.options ?? []).map((opt) =>
        this.#optionContext(opt, { selected: opt.value === sec.current, disabled: !!sec.current && opt.value !== sec.current, tooltipUuid: opt.value, hasItemLink: true, sectionIdx: String(sIdx) })
      )
    }));
    this.list.innerHTML = Handlebars.partials.hmEquipmentDetailList({ sections: context });
    this.emptyEl.hidden = sections.some((s) => s.options?.length);
    applyItemLinks(this.list);
  }

  /**
   * Normalize a picker option into the detail-list partial's option shape.
   * @param {{value:string,label:string,icon:?string}} opt Picker option.
   * @param {object} state Computed flags `{selected, disabled, tooltipUuid, hasItemLink, sectionIdx}`.
   * @returns {object} Option context for the partial.
   */
  #optionContext(opt, state) {
    const { selected, disabled, tooltipUuid, hasItemLink, sectionIdx } = state;
    return {
      value: opt.value,
      label: opt.label,
      searchLabel: opt.label.toLowerCase(),
      icon: opt.icon ?? null,
      sectionIdx: sectionIdx ?? null,
      tooltipUuid: tooltipUuid ?? null,
      selected: !!selected,
      disabled: !!disabled,
      hasItemLink: !!hasItemLink
    };
  }

  /**
   * Update the panel title to reflect current x/y for multi-pick, or fall back to the picker label.
   * @param {number} currentCount Number of currently-selected items.
   */
  #refreshMultiTitle(currentCount) {
    if ((this.activeMax || 1) > 1) this.titleEl.textContent = `${this.activeLabel} (${currentCount}/${this.activeMax})`;
    else this.titleEl.textContent = this.activeLabel;
  }

  /**
   * Toggle aria-disabled on non-selected options when at max capacity.
   * @param {number} currentCount Number of currently-selected items.
   */
  #applyMultiCapacityState(currentCount) {
    const atMax = currentCount >= (this.activeMax || 1);
    for (const btn of this.list.querySelectorAll('[data-detail-option]')) {
      const isSelected = btn.hasAttribute('data-selected');
      if (atMax && !isSelected) btn.setAttribute('aria-disabled', 'true');
      else btn.removeAttribute('aria-disabled');
    }
  }

  /**
   * Render the option list, marking the current value as pre-selected.
   * @param {Array<{value:string,label:string,icon:?string,uuid:?string,group:?string}>} options Picker options.
   * @param {string} currentValue Currently-stored value (uuid).
   */
  #renderOptions(options, currentValue) {
    const currentSet = Array.isArray(currentValue) ? new Set(currentValue) : new Set(currentValue ? [currentValue] : []);
    const ungrouped = [];
    const groups = new Map();
    for (const opt of options) {
      if (opt.group) {
        if (!groups.has(opt.group)) groups.set(opt.group, []);
        groups.get(opt.group).push(opt);
      } else ungrouped.push(opt);
    }
    const toContext = (opt) => {
      const tooltipUuid = opt.uuid ?? (opt.value.includes('.') ? opt.value : null);
      return this.#optionContext(opt, { selected: currentSet.has(opt.value), disabled: false, tooltipUuid, hasItemLink: !!tooltipUuid, sectionIdx: null });
    };
    const sections = [{ header: null, sectionIdx: null, options: ungrouped.map(toContext) }];
    for (const [label, opts] of groups) sections.push({ header: label, sectionIdx: null, options: opts.map(toContext) });
    this.list.innerHTML = Handlebars.partials.hmEquipmentDetailList({ sections });
    this.emptyEl.hidden = options.length > 0;
    applyItemLinks(this.list);
  }

  /** Filter rendered options by the search input value. */
  #filter() {
    const q = this.searchInput.value.trim().toLowerCase();
    let visible = 0;
    for (const btn of this.list.querySelectorAll('[data-detail-option]')) {
      const match = !q || btn.dataset.label.includes(q);
      btn.parentElement.hidden = !match;
      if (match) visible++;
    }
    this.emptyEl.hidden = visible > 0;
  }

  /**
   * Commit a pick: writes value to the active hidden input, updates the trigger chip, closes.
   * @param {string} value Selected option value (uuid).
   * @param {?HTMLElement} [optEl] The clicked option element, disambiguating sections that share a pool.
   */
  #pick(value, optEl = null) {
    if (this.activeSections) {
      this.#pickSection(value, optEl);
      return;
    }
    if (!this.activeName) return;
    const input = this.scope.querySelector(`input[type="hidden"][name="${CSS.escape(this.activeName)}"]`);
    if (!input) return;
    const max = this.activeMax || 1;
    if (max === 1) {
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const linkInput = input.parentElement?.querySelector('input[data-eq-adv-link]');
      if (linkInput) {
        const opt = this.activeOptions?.find((o) => o.value === value);
        linkInput.value = opt?.traitKey ?? '';
        linkInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      this.#updateTriggerLabel(value);
      this.close();
      return;
    }
    const current = new Set(input.value ? input.value.split(',').filter(Boolean) : []);
    if (current.has(value)) current.delete(value);
    else {
      if (current.size >= max) return;
      current.add(value);
    }
    input.value = [...current].join(',');
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const btn = this.list.querySelector(`[data-detail-option][data-value="${CSS.escape(value)}"]`);
    if (btn) {
      btn.toggleAttribute('data-selected', current.has(value));
      btn.setAttribute('aria-selected', current.has(value) ? 'true' : 'false');
    }
    this.#refreshMultiTitle(current.size);
    this.#applyMultiCapacityState(current.size);
    this.#updateMultiTriggerLabel([...current]);
  }

  /**
   * Toggle a section pick (one selection per section, max=1).
   * @param {string} value Selected option value.
   * @param {?HTMLElement} [btn] The clicked option button; required when sections share a pool so the right section resolves.
   */
  #pickSection(value, btn = null) {
    btn ??= this.list.querySelector(`[data-detail-option][data-value="${CSS.escape(value)}"]`);
    if (!btn || btn.getAttribute('aria-disabled') === 'true') return;
    const sIdx = Number(btn.dataset.sectionIdx);
    const sec = this.activeSections?.[sIdx];
    if (!sec) return;
    const input = this.scope.querySelector(`input[type="hidden"][name="${CSS.escape(sec.name)}"]`);
    if (!input) return;
    const wasSelected = sec.current === value;
    sec.current = wasSelected ? '' : value;
    input.value = sec.current;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    this.#refreshSectionDom(sIdx);
    const filled = this.activeSections.reduce((n, s) => n + (s.current ? 1 : 0), 0);
    this.titleEl.textContent = `${this.activeLabel} (${filled}/${this.activeMax})`;
    this.#updateSectionsTriggerLabel();
  }

  /**
   * Re-style a section's option buttons to match its current selection.
   * @param {number} sIdx Section index.
   */
  #refreshSectionDom(sIdx) {
    const sec = this.activeSections[sIdx];
    const header = this.list.querySelector(`.hm-detail-section-header[data-section-idx="${sIdx}"]`);
    if (header) header.textContent = `${sec.label} (${sec.current ? 1 : 0}/${sec.max || 1})`;
    for (const b of this.list.querySelectorAll(`[data-detail-option][data-section-idx="${sIdx}"]`)) {
      const isSelected = b.dataset.value === sec.current;
      b.toggleAttribute('data-selected', isSelected);
      b.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      if (sec.current && !isSelected) b.setAttribute('aria-disabled', 'true');
      else b.removeAttribute('aria-disabled');
    }
  }

  /** Update the trigger tile's name + icon to reflect aggregate section picks. */
  #updateSectionsTriggerLabel() {
    if (!this.activeTrigger) return;
    const labels = [];
    let firstIcon = null;
    for (const sec of this.activeSections) {
      if (!sec.current) continue;
      const opt = sec.options?.find((o) => o.value === sec.current);
      if (opt) {
        labels.push(opt.label);
        if (!firstIcon && opt.icon) firstIcon = opt.icon;
      }
    }
    const trigLabel = this.activeTrigger.querySelector('[data-trigger-label]');
    const trigIcon = this.activeTrigger.querySelector('[data-trigger-icon]');
    if (trigLabel) {
      trigLabel.textContent = labels.length ? labels.join(', ') : this.activeLabel || _loc('HEROMANCER.App.Equipment.DetailChoosePrompt');
      trigLabel.classList.toggle('is-placeholder', !labels.length);
    }
    if (trigIcon && firstIcon) {
      trigIcon.replaceChildren();
      const img = document.createElement('img');
      img.src = firstIcon;
      img.alt = '';
      trigIcon.appendChild(img);
    }
  }

  /**
   * Reflect a multi-pick selection on the trigger tile (label = joined names, icon = first selected).
   * @param {string[]} values Selected option values.
   */
  #updateMultiTriggerLabel(values) {
    if (!this.activeTrigger) return;
    const opts = (this.activeOptions ?? []).filter((o) => values.includes(o.value));
    const trigLabel = this.activeTrigger.querySelector('[data-trigger-label]');
    const trigIcon = this.activeTrigger.querySelector('[data-trigger-icon]');
    if (trigLabel) {
      const sorted = [...opts].sort((a, b) => a.label.localeCompare(b.label));
      trigLabel.textContent = sorted.length ? sorted.map((o) => o.label).join(', ') : _loc('HEROMANCER.App.Equipment.DetailChoosePrompt');
      trigLabel.classList.toggle('is-placeholder', !sorted.length);
    }
    if (trigIcon) {
      const firstIcon = opts.find((o) => o.icon)?.icon;
      if (firstIcon) {
        trigIcon.replaceChildren();
        const img = document.createElement('img');
        img.src = firstIcon;
        img.alt = '';
        trigIcon.appendChild(img);
      }
    }
  }

  /**
   * Reflect the new pick on the trigger chip (label + icon swap).
   * @param {string} value Selected option value.
   */
  #updateTriggerLabel(value) {
    if (!this.activeTrigger) return;
    const btn = this.list.querySelector(`[data-detail-option][data-value="${CSS.escape(value)}"]`);
    if (!btn) return;
    const label = btn.querySelector('.hm-detail-option-label')?.textContent ?? '';
    const imgSrc = btn.querySelector('img')?.src ?? '';
    const trigLabel = this.activeTrigger.querySelector('[data-trigger-label]');
    const trigIcon = this.activeTrigger.querySelector('[data-trigger-icon]');
    if (trigLabel) trigLabel.textContent = label;
    if (trigIcon && imgSrc) {
      trigIcon.replaceChildren();
      const img = document.createElement('img');
      img.src = imgSrc;
      img.alt = '';
      trigIcon.appendChild(img);
    }
    trigLabel?.classList.remove('is-placeholder');
  }

  /** Slide the panel out and clear active state. */
  close() {
    this.root.classList.remove('is-open');
    this.root.hidden = true;
    this.root.dispatchEvent(new CustomEvent('hm-drawer-close', { bubbles: true }));
    this.#resetActive();
  }

  /** Clear per-session active state without touching panel visibility — shared by close + switching triggers mid-open. */
  #resetActive() {
    this.activeName = null;
    this.activeTrigger = null;
    this.activeOptions = null;
    this.activeSections = null;
    this.activeMax = null;
    this.activeLabel = null;
  }
}
