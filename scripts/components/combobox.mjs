/**
 * @typedef {object} ComboboxOption Single combobox option spec.
 * @property {string} value Underlying form value.
 * @property {string} label Display text.
 * @property {?string} [icon] Image source for the option icon.
 * @property {?string} [iconClass] FontAwesome (or other) class string for the option icon.
 * @property {?string} [description] Tooltip body, applied via `data-tooltip`.
 * @property {?string} [badge] Optional inline badge text.
 * @property {boolean} [disabled] Renders as `aria-disabled` and skipped during navigation.
 */

/**
 * @typedef {object} ComboboxGroup Grouped block of combobox options.
 * @property {string} label Group heading.
 * @property {ComboboxOption[]} options Options inside the group.
 */

/**
 * @typedef {object} ComboboxOpts Combobox behavior overrides.
 * @property {Function} [onChange] Called with `(value, optionElement)` after a commit.
 * @property {Function} [filter] Custom matcher `(query, optionElement) => boolean`.
 */

/** Vanilla combobox with grouped, searchable, keyboard-navigable listbox. */
export class Combobox {
  /** @type {WeakMap<HTMLElement, Combobox>} */
  static #instances = new WeakMap();

  /**
   * Attach to a single shell rendered from `templates/components/combobox.hbs`.
   * @param {HTMLElement} root Wrapper element with `[data-combobox]`.
   * @param {ComboboxOpts} [opts] Behavior overrides.
   * @returns {Combobox} New or pre-existing instance.
   */
  static attach(root, opts = {}) {
    const existing = Combobox.#instances.get(root);
    if (existing) return existing;
    return new Combobox(root, opts);
  }

  /**
   * Attach to every `[data-combobox]` shell within a scope.
   * @param {Element|Document} scope Container to query.
   * @param {ComboboxOpts} [opts] Behavior overrides applied to each instance.
   * @returns {Combobox[]} One instance per shell found.
   */
  static attachAll(scope, opts = {}) {
    return Array.from(scope.querySelectorAll('[data-combobox]')).map((el) => Combobox.attach(el, opts));
  }

  /**
   * Close any open combobox dropdowns within a scope.
   * @param {Element|Document} scope Search root.
   */
  static closeAll(scope) {
    for (const root of scope.querySelectorAll('[data-combobox]')) {
      const inst = Combobox.#instances.get(root);
      if (inst?._open) inst.close();
    }
  }

  /**
   * @param {HTMLElement} root Wrapper element.
   * @param {ComboboxOpts} opts Behavior overrides.
   */
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    this.hidden = root.querySelector('input[type="hidden"]');
    this.trigger = root.querySelector('button[role="combobox"]');
    this.triggerLabel = root.querySelector('[data-trigger-label]');
    this.triggerIcon = root.querySelector('[data-trigger-icon]');
    this.triggerTags = root.querySelector('[data-trigger-tags]');
    this.panel = root.querySelector('[data-panel]');
    this.listbox = root.querySelector('[role="listbox"]');
    this.search = root.querySelector('[data-search]');
    this.empty = root.querySelector('.hm-combobox-empty');
    this._placeholder = this.triggerLabel.textContent;
    this._open = false;
    this._activeId = null;
    this._typeahead = '';
    this._typeaheadTimer = null;
    this._onDocPointerDown = this.#onDocPointerDown.bind(this);
    this.#bind();
    this.#syncFromMarkup();
    Combobox.#instances.set(root, this);
  }

  /** Wire all DOM listeners. */
  #bind() {
    this.trigger.addEventListener('click', () => this.toggle());
    this.trigger.addEventListener('keydown', (e) => this.#onTriggerKey(e));
    this.listbox.addEventListener('click', (e) => this.#onOptionClick(e));
    this.listbox.addEventListener('mousemove', (e) => this.#onOptionHover(e));
    this.listbox.addEventListener('keydown', (e) => this.#onListKey(e));
    if (this.search) {
      this.search.addEventListener('input', () => this.#applyFilter(this.search.value));
      this.search.addEventListener('keydown', (e) => this.#onSearchKey(e));
    }
  }

  /** Sync trigger contents from any pre-marked `[data-selected]` option. */
  #syncFromMarkup() {
    const preselected = this.listbox.querySelector('[data-selected]');
    this.#renderTrigger(preselected);
  }

  /**
   * Programmatically select by value.
   * @param {string} value Target option value.
   * @returns {boolean} True when an option matched and was committed.
   */
  select(value) {
    const opt = this.#optionByValue(value);
    if (!opt) return false;
    this.#commit(opt);
    return true;
  }

  /** Clear current selection and fire change. */
  clear() {
    this.#options().forEach((o) => {
      o.removeAttribute('data-selected');
      o.setAttribute('aria-selected', 'false');
    });
    this.hidden.value = '';
    this.root.dataset.value = '';
    this.#renderTrigger(null);
    this.#fireChange();
  }

  /**
   * Replace option list. Accepts grouped or flat input.
   * @param {ComboboxGroup[]|ComboboxOption[]} groups Grouped or flat options.
   */
  setOptions(groups) {
    const id = this.trigger.id.replace(/-trigger$/, '');
    const frag = document.createDocumentFragment();
    const value = this.root.dataset.value || '';
    const isFlat = !groups.length || !('options' in groups[0]);
    if (isFlat) {
      groups.forEach((o, i) => frag.appendChild(this.#renderOption(o, id, -1, i, value)));
    } else {
      groups.forEach((g, gi) => {
        const label = document.createElement('li');
        label.className = 'hm-combobox-group-label';
        label.setAttribute('role', 'presentation');
        label.id = `${id}-grp-${gi}`;
        label.textContent = g.label;
        frag.appendChild(label);
        const groupLi = document.createElement('li');
        groupLi.setAttribute('role', 'group');
        groupLi.setAttribute('aria-labelledby', label.id);
        groupLi.className = 'hm-combobox-group';
        const inner = document.createElement('ul');
        inner.setAttribute('role', 'presentation');
        inner.className = 'hm-combobox-group-list';
        g.options.forEach((o, oi) => inner.appendChild(this.#renderOption(o, id, gi, oi, value)));
        groupLi.appendChild(inner);
        frag.appendChild(groupLi);
      });
    }
    this.listbox.querySelectorAll(':scope > li:not(.hm-combobox-empty)').forEach((n) => n.remove());
    this.listbox.insertBefore(frag, this.empty);
    this.#syncFromMarkup();
    if (this._open) this.#applyFilter(this.search?.value ?? '');
  }

  /** Disable interaction and close the panel. */
  disable() {
    this.root.classList.add('is-disabled');
    this.trigger.disabled = true;
    this.close();
  }

  /** Re-enable interaction. */
  enable() {
    this.root.classList.remove('is-disabled');
    this.trigger.disabled = false;
  }

  /** Detach event listeners and forget the instance. */
  destroy() {
    document.removeEventListener('pointerdown', this._onDocPointerDown, true);
    Combobox.#instances.delete(this.root);
  }

  /** Open the panel. Uses the popover API + fixed positioning so the panel escapes all ancestor overflow. */
  open() {
    if (this._open || this.trigger.disabled) return;
    this._open = true;
    this.panel.hidden = false;
    if (this.panel.showPopover) this.panel.showPopover();
    this.#positionPanel();
    this.trigger.setAttribute('aria-expanded', 'true');
    this.root.classList.add('is-open');
    document.addEventListener('pointerdown', this._onDocPointerDown, true);
    this._onReposition ??= () => this.#positionPanel();
    window.addEventListener('scroll', this._onReposition, true);
    window.addEventListener('resize', this._onReposition);
    if (this.search) {
      this.search.value = '';
      this.#applyFilter('');
      this.search.focus({ preventScroll: true });
    } else {
      this.listbox.focus({ preventScroll: true });
    }
    const selected = this.listbox.querySelector('[data-selected]') ?? this.#firstEnabled();
    if (selected) this.#setActive(selected, { scroll: true });
  }

  /** Close the panel. */
  close() {
    if (!this._open) return;
    this._open = false;
    if (this.panel.hidePopover && this.panel.matches(':popover-open')) this.panel.hidePopover();
    this.panel.hidden = true;
    this.trigger.setAttribute('aria-expanded', 'false');
    this.root.classList.remove('is-open');
    document.removeEventListener('pointerdown', this._onDocPointerDown, true);
    if (this._onReposition) {
      window.removeEventListener('scroll', this._onReposition, true);
      window.removeEventListener('resize', this._onReposition);
    }
    this.#setActive(null);
  }

  /** Anchor the panel under the trigger using fixed coordinates so the popover escapes ancestor clipping. */
  #positionPanel() {
    const rect = this.trigger.getBoundingClientRect();
    const gap = 2;
    this.panel.style.position = 'fixed';
    this.panel.style.top = `${rect.bottom + gap}px`;
    this.panel.style.left = `${rect.left}px`;
    this.panel.style.width = `${rect.width}px`;
    const host = this.root.closest('.hm-dialog, .application');
    if (host) this.panel.style.maxHeight = `${host.getBoundingClientRect().height * 0.8}px`;
  }

  /** Toggle the panel open or closed. */
  toggle() {
    if (this._open) this.close();
    else this.open();
  }

  /**
   * Render a `<li role="option">` from the shared partial.
   * @param {ComboboxOption} o Option spec.
   * @param {string} id Combobox base id.
   * @param {number} gIdx Group index, `-1` for flat.
   * @param {number} oIdx Index within its group.
   * @param {string} selectedValue Current selection for pre-marking.
   * @returns {HTMLLIElement} Built option element.
   */
  #renderOption(o, id, gIdx, oIdx, selectedValue) {
    const category = this.root.dataset.pinning;
    const pinning = category ? { enabled: true, category, pinTooltip: _loc('HEROMANCER.Compare.Pin'), unpinTooltip: _loc('HEROMANCER.Compare.Unpin') } : { enabled: false };
    const template = document.createElement('template');
    template.innerHTML = Handlebars.partials.hmComboboxOption({ id, gIdx, oIdx, opt: o, selected: selectedValue, pinning }).trim();
    return template.content.firstElementChild;
  }

  /** @returns {HTMLElement[]} All option elements. */
  #options() {
    return Array.from(this.listbox.querySelectorAll('[role="option"]'));
  }

  /** @returns {HTMLElement[]} Visible, enabled options. */
  #visibleOptions() {
    return this.#options().filter((o) => !o.hidden && o.getAttribute('aria-disabled') !== 'true');
  }

  /** @returns {?HTMLElement} First navigable option. */
  #firstEnabled() {
    return this.#visibleOptions()[0] ?? null;
  }

  /**
   * @param {string} value Form value.
   * @returns {?HTMLElement} Option with matching `data-value`, or null.
   */
  #optionByValue(value) {
    return this.#options().find((o) => o.dataset.value === value) ?? null;
  }

  /**
   * Mark an option as the active descendant.
   * @param {?HTMLElement} opt Option to activate, or null to clear.
   * @param {object} [flags] Behavior flags.
   * @param {boolean} [flags.scroll] Scroll the option into view.
   */
  #setActive(opt, { scroll = false } = {}) {
    for (const o of this.listbox.querySelectorAll('.hm-combobox-option.is-active')) o.classList.remove('is-active');
    if (!opt) {
      this._activeId = null;
      this.trigger.removeAttribute('aria-activedescendant');
      this.search?.removeAttribute('aria-activedescendant');
      return;
    }
    opt.classList.add('is-active');
    this._activeId = opt.id;
    this.trigger.setAttribute('aria-activedescendant', opt.id);
    this.search?.setAttribute('aria-activedescendant', opt.id);
    if (scroll) opt.scrollIntoView({ block: 'nearest' });
  }

  /**
   * Commit a selection and fire change.
   * @param {HTMLElement} opt Target option element.
   */
  #commit(opt) {
    if (!opt || opt.getAttribute('aria-disabled') === 'true') return;
    this.#options().forEach((o) => {
      o.removeAttribute('data-selected');
      o.setAttribute('aria-selected', 'false');
    });
    opt.setAttribute('data-selected', '');
    opt.setAttribute('aria-selected', 'true');
    this.hidden.value = opt.dataset.value;
    this.root.dataset.value = opt.dataset.value;
    this.#renderTrigger(opt);
    this.close();
    this.trigger.focus({ preventScroll: true });
    this.#fireChange(opt);
  }

  /**
   * Update trigger label and icon to reflect a selection.
   * @param {?HTMLElement} opt Selected option, or null for placeholder state.
   */
  #renderTrigger(opt) {
    if (!opt) {
      this.triggerLabel.textContent = this._placeholder;
      this.triggerIcon.replaceChildren();
      this.triggerTags?.replaceChildren();
      this.root.classList.add('is-empty');
      return;
    }
    this.root.classList.remove('is-empty');
    this.triggerLabel.textContent = opt.dataset.label ?? opt.textContent.trim();
    const srcIcon = opt.querySelector('.hm-combobox-option-icon')?.firstElementChild;
    if (srcIcon) this.triggerIcon.replaceChildren(srcIcon.cloneNode(true));
    else this.triggerIcon.replaceChildren();
    const optTags = opt.querySelector('.hm-combobox-option-tags');
    if (this.triggerTags) this.triggerTags.replaceChildren(...(optTags ? [optTags.cloneNode(true)] : []));
  }

  /**
   * Fire onChange callback and dispatch a bubbling `change` on the hidden input.
   * @param {?HTMLElement} [opt] Selected option element.
   */
  #fireChange(opt = null) {
    this.opts.onChange?.(this.hidden.value, opt);
    this.hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Apply a search filter, hiding non-matching options and empty groups.
   * @param {string} query User-entered search.
   */
  #applyFilter(query) {
    const q = query.trim().toLowerCase();
    const matcher = this.opts.filter ?? this.#defaultMatcher;
    let visibleCount = 0;
    this.#options().forEach((opt) => {
      const match = matcher(q, opt);
      opt.hidden = !match;
      if (match) visibleCount++;
    });
    this.listbox.querySelectorAll('.hm-combobox-group-label').forEach((label) => {
      const group = label.nextElementSibling;
      if (!group) return;
      const anyVisible = group.querySelector('[role="option"]:not([hidden])');
      label.hidden = !anyVisible;
      group.hidden = !anyVisible;
    });
    this.empty.hidden = visibleCount > 0;
    const active = this._activeId && document.getElementById(this._activeId);
    if (!active || active.hidden) this.#setActive(this.#firstEnabled(), { scroll: true });
  }

  /**
   * Default substring match against `data-label`.
   * @param {string} q Lowercased query.
   * @param {HTMLElement} opt Option element under test.
   * @returns {boolean} True when the option matches.
   */
  #defaultMatcher(q, opt) {
    if (!q) return true;
    return (opt.dataset.keywords ?? opt.dataset.label ?? '').toLowerCase().includes(q);
  }

  /**
   * Move active option by a relative delta.
   * @param {number} delta Step amount.
   */
  #move(delta) {
    const list = this.#visibleOptions();
    if (!list.length) return;
    const current = this._activeId ? list.findIndex((o) => o.id === this._activeId) : -1;
    let next = current + delta;
    if (next < 0) next = 0;
    if (next >= list.length) next = list.length - 1;
    this.#setActive(list[next], { scroll: true });
  }

  /**
   * Move to an absolute index, supporting negative offsets.
   * @param {number} index Target index, negative counts from end.
   */
  #moveTo(index) {
    const list = this.#visibleOptions();
    if (!list.length) return;
    const idx = index < 0 ? list.length + index : index;
    this.#setActive(list[Math.max(0, Math.min(list.length - 1, idx))], { scroll: true });
  }

  /**
   * Type-ahead step: append a character and select the first match.
   * @param {string} ch Single character pressed.
   */
  #typeaheadStep(ch) {
    clearTimeout(this._typeaheadTimer);
    this._typeahead += ch.toLowerCase();
    this._typeaheadTimer = setTimeout(() => (this._typeahead = ''), 600);
    const list = this.#visibleOptions();
    const match = list.find((o) => (o.dataset.label ?? '').toLowerCase().startsWith(this._typeahead));
    if (match) {
      if (this._open) this.#setActive(match, { scroll: true });
      else this.#commit(match);
    }
  }

  /**
   * Close when a pointer-down occurs outside the root.
   * @param {PointerEvent} e Captured event.
   */
  #onDocPointerDown(e) {
    if (!this.root.contains(e.target)) this.close();
  }

  /**
   * Commit on option click. Skipped when the click originated from a pin-toggle button (compare feature) so it stays a pure pin action.
   * @param {MouseEvent} e Click event.
   */
  #onOptionClick(e) {
    if (e.target.closest('[data-pin-toggle]')) return;
    const opt = e.target.closest('[role="option"]');
    if (opt) this.#commit(opt);
  }

  /**
   * Track mouse hover as the active descendant.
   * @param {MouseEvent} e Mousemove event.
   */
  #onOptionHover(e) {
    const opt = e.target.closest('[role="option"]');
    if (opt && opt.id !== this._activeId) this.#setActive(opt);
  }

  /**
   * Trigger keys: open or type-ahead.
   * @param {KeyboardEvent} e Keydown event.
   */
  #onTriggerKey(e) {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Enter':
      case ' ':
        e.preventDefault();
        this.open();
        break;
      case 'Home':
      case 'End':
        e.preventDefault();
        this.open();
        this.#moveTo(e.key === 'Home' ? 0 : -1);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          this.#typeaheadStep(e.key);
        }
    }
  }

  /**
   * Listbox key handler.
   * @param {KeyboardEvent} e Keydown event.
   */
  #onListKey(e) {
    this.#handleNavKey(e);
  }

  /**
   * Search key handler — only navigation keys are intercepted; printable keys filter.
   * @param {KeyboardEvent} e Keydown event.
   */
  #onSearchKey(e) {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp', 'Enter', 'Escape', 'Tab'].includes(e.key)) {
      this.#handleNavKey(e);
    }
  }

  /**
   * Shared navigation key handling for listbox and search.
   * @param {KeyboardEvent} e Keydown event.
   */
  #handleNavKey(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.#move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.#move(-1);
        break;
      case 'PageDown':
        e.preventDefault();
        this.#move(10);
        break;
      case 'PageUp':
        e.preventDefault();
        this.#move(-10);
        break;
      case 'Home':
        e.preventDefault();
        this.#moveTo(0);
        break;
      case 'End':
        e.preventDefault();
        this.#moveTo(-1);
        break;
      case 'Enter': {
        e.preventDefault();
        const active = this._activeId && document.getElementById(this._activeId);
        if (active) this.#commit(active);
        break;
      }
      case 'Escape':
        if (this._open) {
          e.preventDefault();
          this.close();
          this.trigger.focus({ preventScroll: true });
        }
        break;
      case 'Tab':
        if (this._open) this.close();
        break;
    }
  }
}
