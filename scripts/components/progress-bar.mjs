/**
 * @typedef {object} ProgressBarOpts
 * @property {Function} [percentFormatter] Maps a 0..1 fraction to the percent label string. Default: `Math.round(p * 100) + '%'`.
 */

const STATES = ['incomplete', 'complete', 'invalid'];

/** Validation-state-driven progress indicator with per-tab and global size variants. */
export class ProgressBar {
  /** @type {WeakMap<HTMLElement, ProgressBar>} */
  static #instances = new WeakMap();

  /**
   * Attach to a single shell rendered from `templates/components/progress-bar.hbs`.
   * @param {HTMLElement} root Wrapper element with `[data-progress]`.
   * @param {ProgressBarOpts} [opts] Behavior overrides.
   * @returns {ProgressBar} New or pre-existing instance.
   */
  static attach(root, opts = {}) {
    const existing = ProgressBar.#instances.get(root);
    if (existing) return existing;
    return new ProgressBar(root, opts);
  }

  /**
   * Attach to every `[data-progress]` within a scope.
   * @param {Element|Document} scope Container to query.
   * @param {ProgressBarOpts} [opts] Behavior overrides applied to each instance.
   * @returns {ProgressBar[]} One instance per shell found.
   */
  static attachAll(scope, opts = {}) {
    return Array.from(scope.querySelectorAll('[data-progress]')).map((el) => ProgressBar.attach(el, opts));
  }

  /**
   * @param {HTMLElement} root Wrapper element.
   * @param {ProgressBarOpts} opts Behavior overrides.
   */
  constructor(root, opts) {
    this.root = root;
    this.opts = { percentFormatter: (p) => `${Math.round(p * 100)}%`, ...opts };
    this.fill = root.querySelector('[data-fill]');
    this.percent = root.querySelector('[data-percent]');
    this.max = Number(root.getAttribute('aria-valuemax')) || 1;
    this.#syncPercent();
    ProgressBar.#instances.set(root, this);
  }

  /** @returns {number} Current value. */
  get value() {
    return Number(this.root.getAttribute('aria-valuenow')) || 0;
  }

  /** @returns {string} Current state class fragment (`incomplete` | `complete` | `invalid`). */
  get state() {
    return STATES.find((s) => this.root.classList.contains(`is-${s}`)) ?? 'incomplete';
  }

  /**
   * Update value (and optionally state) atomically.
   * @param {number} value New value in 0..max.
   * @param {string} [state] One of `incomplete` | `complete` | `invalid`.
   */
  set(value, state) {
    const clamped = Math.max(0, Math.min(this.max, Number(value) || 0));
    this.root.setAttribute('aria-valuenow', String(clamped));
    this.fill.style.setProperty('--hero-mancer-pb-value', String(clamped));
    if (state) this.setState(state);
    this.#syncPercent();
  }

  /**
   * Replace just the visual state.
   * @param {string} state One of `incomplete` | `complete` | `invalid`.
   */
  setState(state) {
    if (!STATES.includes(state)) return;
    STATES.forEach((s) => this.root.classList.toggle(`is-${s}`, s === state));
  }

  /**
   * Update the upper bound.
   * @param {number} max New maximum.
   */
  setMax(max) {
    this.max = Number(max) || 1;
    this.root.setAttribute('aria-valuemax', String(this.max));
    this.fill.style.setProperty('--hero-mancer-pb-max', String(this.max));
    this.#syncPercent();
  }

  /** Detach the WeakMap entry. */
  destroy() {
    ProgressBar.#instances.delete(this.root);
  }

  /** Refresh the percent text from current value/max. */
  #syncPercent() {
    if (!this.percent) return;
    const fraction = this.max > 0 ? this.value / this.max : 0;
    this.percent.textContent = this.opts.percentFormatter(fraction);
  }
}
