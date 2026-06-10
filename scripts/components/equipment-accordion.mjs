/**
 * @typedef {object} EquipmentAccordionOpts
 * @property {Function} [onOpen] Called after the open transition completes.
 * @property {Function} [onClose] Called after the close transition completes.
 * @property {boolean} [focusOnOpen] Move focus into the body's first tabbable element on open. Default true.
 */

/** Inline disclosure region for tile sub-pickers, with smooth height animation. */
export class EquipmentAccordion {
  /** @type {WeakMap<HTMLElement, EquipmentAccordion>} */
  static #instances = new WeakMap();

  /**
   * Attach to a single shell rendered from `templates/components/equipment-accordion.hbs`.
   * @param {HTMLElement} root Wrapper element with `[data-equipment-accordion]`.
   * @param {EquipmentAccordionOpts} [opts] Behavior overrides.
   * @returns {EquipmentAccordion} New or pre-existing instance.
   */
  static attach(root, opts = {}) {
    const existing = EquipmentAccordion.#instances.get(root);
    if (existing) return existing;
    return new EquipmentAccordion(root, opts);
  }

  /**
   * Attach to every `[data-equipment-accordion]` within a scope.
   * @param {Element|Document} scope Container to query.
   * @param {EquipmentAccordionOpts} [opts] Behavior overrides applied to each instance.
   * @returns {EquipmentAccordion[]} One instance per shell found.
   */
  static attachAll(scope, opts = {}) {
    return Array.from(scope.querySelectorAll('[data-equipment-accordion]')).map((el) => EquipmentAccordion.attach(el, opts));
  }

  /**
   * @param {HTMLElement} root Wrapper element.
   * @param {EquipmentAccordionOpts} opts Behavior overrides.
   */
  constructor(root, opts) {
    this.root = root;
    this.opts = { focusOnOpen: true, ...opts };
    this.body = root.querySelector('[data-body]');
    this.closeBtn = root.querySelector('[data-close]');
    this.label = root.querySelector('.hm-accordion-label');
    this._open = !root.hidden;
    this.closeBtn?.addEventListener('click', () => this.close());
    root.addEventListener('keydown', (e) => this.#onKey(e));
    EquipmentAccordion.#instances.set(root, this);
  }

  /** @returns {boolean} True when open. */
  get isOpen() {
    return this._open;
  }

  /**
   * Open the region with optional new content.
   * @param {string|Node|Function} [content] Replacement body content. String → innerHTML; Node → replace; Function called with `body` for direct render.
   * @returns {Promise<void>} Resolves after the height transition.
   */
  async open(content) {
    if (content !== undefined) this.#setBody(content);
    if (this._open) {
      this.#refit();
      return;
    }
    this._open = true;
    this.root.hidden = false;
    this.root.classList.add('is-open');
    await this.#animate(0, this.root.scrollHeight);
    this.root.style.maxHeight = '';
    if (this.opts.focusOnOpen) this.#focusFirst();
    this.opts.onOpen?.(this);
  }

  /**
   * Close the region.
   * @returns {Promise<void>} Resolves after the height transition.
   */
  async close() {
    if (!this._open) return;
    this._open = false;
    await this.#animate(this.root.scrollHeight, 0);
    this.root.style.maxHeight = '';
    this.root.hidden = true;
    this.root.classList.remove('is-open');
    this.opts.onClose?.(this);
  }

  /**
   * Toggle open/closed.
   * @returns {Promise<void>} Resolves when the resulting transition completes.
   */
  toggle() {
    return this._open ? this.close() : this.open();
  }

  /**
   * Replace body content without changing open state. Refits height when open.
   * @param {string|Node|Function} content New body content.
   */
  update(content) {
    this.#setBody(content);
    if (this._open) this.#refit();
  }

  /**
   * Update the visible label.
   * @param {string} text New heading text.
   */
  setLabel(text) {
    if (this.label) this.label.textContent = text;
  }

  /** Detach the WeakMap entry. */
  destroy() {
    EquipmentAccordion.#instances.delete(this.root);
  }

  /**
   * Replace body slot content.
   * @param {string|Node|Function} content New content.
   */
  #setBody(content) {
    if (typeof content === 'function') {
      content(this.body);
      return;
    }
    if (content instanceof Node) {
      this.body.replaceChildren(content);
      return;
    }
    this.body.innerHTML = String(content);
  }

  /** Smoothly refit max-height to current scrollHeight (after content swap while open). */
  #refit() {
    const start = this.root.getBoundingClientRect().height;
    const end = this.root.scrollHeight;
    if (Math.abs(start - end) < 1) return;
    this.#animate(start, end).then(() => {
      this.root.style.maxHeight = '';
    });
  }

  /**
   * Animate `max-height` between two pixel values.
   * @param {number} from Start height in px.
   * @param {number} to End height in px.
   * @returns {Promise<void>} Resolves on `transitionend` or after a fallback timeout.
   */
  #animate(from, to) {
    return new Promise((resolve) => {
      this.root.style.maxHeight = `${from}px`;
      requestAnimationFrame(() => {
        this.root.style.maxHeight = `${to}px`;
        const done = () => {
          this.root.removeEventListener('transitionend', done);
          resolve();
        };
        this.root.addEventListener('transitionend', done, { once: true });
        setTimeout(done, 400);
      });
    });
  }

  /** Focus the first tabbable element inside the body. */
  #focusFirst() {
    const sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const target = this.body.querySelector(sel);
    target?.focus({ preventScroll: false });
  }

  /**
   * Close on Escape.
   * @param {KeyboardEvent} e Keydown event.
   */
  #onKey(e) {
    if (e.key === 'Escape' && this._open) {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  }
}
