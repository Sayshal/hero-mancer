/**
 * @typedef {object} AbilityBlockOpts
 * @property {Function} [onChange] Called with `({ ability, method, value, formula })` after a commit.
 * @property {Function} [costFn] Maps a value to its point-buy cost (used by `setMethod('pointBuy')`).
 * @property {Function} [modifierFn] Maps a value to its ability modifier. Default: `Math.floor((v - 10) / 2)`.
 */

const METHODS = ['standardArray', 'pointBuy', 'manualFormula'];

/** Per-ability score editor with three input modes. */
export class AbilityBlock {
  /** @type {WeakMap<HTMLElement, AbilityBlock>} */
  static #instances = new WeakMap();

  /**
   * Attach to a single shell rendered from `templates/components/ability-block.hbs`.
   * @param {HTMLElement} root Wrapper element with `[data-ability-block]`.
   * @param {AbilityBlockOpts} [opts] Behavior overrides.
   * @returns {AbilityBlock} New or pre-existing instance.
   */
  static attach(root, opts = {}) {
    const existing = AbilityBlock.#instances.get(root);
    if (existing) return existing;
    return new AbilityBlock(root, opts);
  }

  /**
   * Attach to every `[data-ability-block]` within a scope.
   * @param {Element|Document} scope Container to query.
   * @param {AbilityBlockOpts} [opts] Behavior overrides applied to each instance.
   * @returns {AbilityBlock[]} One instance per shell found.
   */
  static attachAll(scope, opts = {}) {
    return Array.from(scope.querySelectorAll('[data-ability-block]')).map((el) => AbilityBlock.attach(el, opts));
  }

  /**
   * @param {HTMLElement} root Wrapper element.
   * @param {AbilityBlockOpts} opts Behavior overrides.
   */
  constructor(root, opts) {
    this.root = root;
    this.opts = { modifierFn: (v) => Math.floor((v - 10) / 2), ...opts };
    this.ability = root.dataset.ability;
    this.min = Number(root.dataset.min ?? 8);
    this.max = Number(root.dataset.max ?? 15);
    this.valueInput = root.querySelector('[data-value-input]');
    this.modifierEl = root.querySelector('[data-modifier]');
    this.valueDisplays = root.querySelectorAll('[data-value-display]');
    this.costEl = root.querySelector('[data-cost]');
    this.formulaInput = root.querySelector('[data-formula]');
    this.modes = Object.fromEntries(Array.from(root.querySelectorAll('[data-mode]')).map((el) => [el.dataset.mode, el]));
    this.#bind();
    this.#applyHue();
    if (this.valueInput?.value !== '' && this.valueInput?.value != null) this.root.dataset.rolled = '1';
    AbilityBlock.#instances.set(root, this);
  }

  /** Wire DOM listeners for all three modes. */
  #bind() {
    this.root.addEventListener('click', (e) => this.#onStepClick(e));
    this.root.addEventListener('keydown', (e) => this.#onStepKey(e));
    if (this.formulaInput) this.formulaInput.addEventListener('input', () => this.#onFormulaInput());
    const standardArrayHidden = this.modes.standardArray?.querySelector('input[type="hidden"]');
    standardArrayHidden?.addEventListener('change', () => this.#onStandardArrayChange(standardArrayHidden.value));
    const poolCombo = this.modes.manualFormula?.querySelector('[data-combobox] input[type="hidden"]');
    poolCombo?.addEventListener('change', () => this.#onStandardArrayChange(poolCombo.value));
  }

  /** @returns {string} Current method. */
  get method() {
    return this.root.dataset.method;
  }

  /** @returns {number} Current numeric value. */
  get value() {
    return Number(this.valueInput.value) || 0;
  }

  /** @returns {string} Current manual formula. */
  get formula() {
    return this.formulaInput?.value ?? '';
  }

  /**
   * Switch active input mode. Hides inactive mode shells; shows the requested one.
   * @param {string} method One of `standardArray`, `pointBuy`, `manualFormula`.
   */
  setMethod(method) {
    if (!METHODS.includes(method)) return;
    this.root.dataset.method = method;
    for (const [name, el] of Object.entries(this.modes)) el.hidden = name !== method;
  }

  /**
   * Mark the block as participating in the manualFormula pool. Gates combobox enable state via the `data-mf-pool` attribute.
   * @param {boolean} active Whether pool mode is on.
   */
  setPoolMode(active) {
    this.root.dataset.mfPool = active ? '1' : '';
  }

  /** @returns {boolean} Whether pool mode is active (manualFormula only). */
  get poolMode() {
    return this.root.dataset.mfPool === '1';
  }

  /**
   * Programmatically set the numeric value (pointBuy / standardArray modes).
   * @param {number} v New value.
   */
  setValue(v) {
    const num = Number(v) || 0;
    const value = this.method === 'manualFormula' ? num : Math.max(this.min, Math.min(this.max, num));
    this.valueInput.value = String(value);
    this.valueDisplays.forEach((el) => (el.textContent = String(value)));
    this.root.dataset.rolled = '1';
    this.#applyHue();
    this.#refreshModifier();
    this.#fireChange();
  }

  /** Blank the value (used when switching to a method that starts empty). */
  clear() {
    this.valueInput.value = '';
    this.valueDisplays.forEach((el) => (el.textContent = ''));
    this.root.dataset.rolled = '';
    this.#applyHue();
    this.#refreshModifier();
  }

  /**
   * Update the displayed point-buy cost (parent computes from total budget).
   * @param {number} cost New cost figure.
   */
  setCost(cost) {
    if (this.costEl) this.costEl.textContent = String(cost);
  }

  /**
   * Update min/max bounds (e.g. when settings change at runtime).
   * @param {number} min New minimum.
   * @param {number} max New maximum.
   */
  setBounds(min, max) {
    this.min = min;
    this.max = max;
    this.root.dataset.min = String(min);
    this.root.dataset.max = String(max);
    this.#applyHue();
  }

  /** Disable all interactive controls. */
  disable() {
    this.root.classList.add('is-disabled');
    this.root.querySelectorAll('button, input').forEach((el) => {
      el.disabled = true;
    });
  }

  /** Re-enable interactive controls. */
  enable() {
    this.root.classList.remove('is-disabled');
    this.root.querySelectorAll('button, input').forEach((el) => {
      el.disabled = false;
    });
  }

  /** Detach the WeakMap entry. */
  destroy() {
    AbilityBlock.#instances.delete(this.root);
  }

  /** Recompute the modifier display from current value. */
  #refreshModifier() {
    if (!this.modifierEl) return;
    const raw = this.valueInput.value;
    if (raw === '' || raw == null) {
      this.modifierEl.textContent = '—';
      return;
    }
    const m = this.opts.modifierFn(Number(raw));
    this.modifierEl.textContent = `${m >= 0 ? '+' : ''}${m}`;
  }

  /** Set the `--hero-mancer-ab-hue` custom property based on value position within bounds. */
  #applyHue() {
    const range = this.max - this.min;
    const t = range > 0 ? (this.value - this.min) / range : 0.5;
    const hue = Math.max(0, Math.min(1, t)) * 120;
    this.root.style.setProperty('--hero-mancer-ab-hue', String(Math.round(hue)));
  }

  /** Fire change callback and a bubbling `change` on the value input. */
  #fireChange() {
    this.opts.onChange?.({ ability: this.ability, method: this.method, value: this.value, formula: this.formula });
    this.valueInput.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Handle ± click in pointBuy mode.
   * @param {MouseEvent} e Click event.
   */
  #onStepClick(e) {
    const step = e.target.closest('[data-pb-step]');
    if (!step || this.method !== 'pointBuy') return;
    e.preventDefault();
    this.setValue(this.value + Number(step.dataset.pbStep));
  }

  /**
   * Handle ArrowUp/ArrowDown on the value display in pointBuy mode. Honors disabled state on the matching step button so budget caps apply.
   * @param {KeyboardEvent} e Keydown event.
   */
  #onStepKey(e) {
    if (this.method !== 'pointBuy') return;
    if (!e.target.closest('[data-pb-step], [data-value-display]')) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault();
      if (this.root.querySelector('[data-pb-step="1"]')?.disabled) return;
      this.setValue(this.value + 1);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault();
      if (this.root.querySelector('[data-pb-step="-1"]')?.disabled) return;
      this.setValue(this.value - 1);
    }
  }

  /** Sync formula → bubble change. Value input stays untouched in this mode. */
  #onFormulaInput() {
    this.#fireChange();
  }

  /**
   * Mirror standardArray / manualFormula-pool combobox selections into the value input. Empty input clears the block.
   * @param {string} v Combobox value (numeric string, or empty for clear).
   */
  #onStandardArrayChange(v) {
    if (this.method !== 'standardArray' && this.method !== 'manualFormula') return;
    const isEmpty = v === '' || v == null;
    const num = isEmpty ? null : Number(v);
    if (!isEmpty && !Number.isFinite(num)) return;
    const text = isEmpty ? '' : String(num);
    this.valueInput.value = text;
    this.valueDisplays.forEach((el) => (el.textContent = text));
    this.root.dataset.rolled = isEmpty ? '' : '1';
    this.#applyHue();
    this.#refreshModifier();
    this.#fireChange();
  }
}
