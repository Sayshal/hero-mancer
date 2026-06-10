import { MODULE } from '../constants.mjs';
import { HMDialog } from './dialog.mjs';

/** AppV2 modal for the ASI mode of an Ability Score Improvement advancement: per-ability stepper grid + commit-back-to-row hook. */
export class AdvancementAsiDialog extends HMDialog {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    classes: ['hm-asi-dialog'],
    tag: 'form',
    window: { title: 'HEROMANCER.App.Advancements.ASIDialog.Title', icon: 'fa-solid fa-arrow-up-from-bracket' },
    position: { width: 460 },
    actions: {
      asiAdjust: AdvancementAsiDialog.#onAsiAdjust,
      commit: AdvancementAsiDialog.#onCommit
    }
  };

  /** @inheritdoc */
  static RESIZABLE = false;

  /** @inheritdoc */
  static PARTS = {
    header: HMDialog.HEADER_PART,
    body: { template: MODULE.TEMPLATES.DIALOGS.ASI }
  };

  /**
   * @param {object} args Dialog inputs.
   * @param {object} args.spec Decorated ASI spec (`{assignments, fixed, locked, points, cap}`).
   * @param {Object<string, number>} args.baseScores Per-ability base score (post prior-ASI accumulation).
   * @param {HTMLInputElement} args.hiddenInput Row's serialized-pick hidden input; the dialog writes JSON to it on commit.
   * @param {Function} [args.onCommit] Optional callback after commit (e.g. trigger re-render).
   * @param {object} [options] AppV2 options.
   */
  constructor({ spec, baseScores, hiddenInput, onCommit }, options = {}) {
    super(options);
    this.spec = spec;
    this.baseScores = baseScores ?? {};
    this.hiddenInput = hiddenInput;
    this.onCommit = onCommit;
    this.assignments = { ...(spec.assignments ?? {}) };
    this.locked = new Set(Array.isArray(spec.locked) ? spec.locked : [...(spec.locked ?? [])]);
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const used = Object.values(this.assignments).reduce((s, v) => s + (Number(v) || 0), 0);
    const remaining = Math.max(0, this.spec.points - used);
    const inputs = Object.entries(CONFIG.DND5E.abilities).map(([key, cfg]) => {
      const fixed = Number(this.spec.fixed?.[key]) || 0;
      const value = Number(this.assignments[key]) || 0;
      const base = Number(this.baseScores[key]) || 0;
      const finalScore = base + fixed + value;
      const finalMod = Math.floor((finalScore - 10) / 2);
      const isDisabled = this.locked.has(key) || fixed > 0;
      return {
        key,
        label: _loc(cfg.label),
        value,
        fixed,
        finalScore,
        finalModLabel: this.#formatMod(finalMod),
        canIncrement: !isDisabled && value < this.spec.cap && remaining > 0 && finalScore < 20,
        canDecrement: !isDisabled && value > 0
      };
    });
    return { ...context, inputs, remaining, total: this.spec.points };
  }

  /**
   * Sign-prefixed modifier label.
   * @param {number} mod Numeric modifier.
   * @returns {string} Label like `+3` / `-1` / `+0`.
   */
  #formatMod(mod) {
    if (mod > 0) return `+${mod}`;
    if (mod < 0) return `${mod}`;
    return '+0';
  }

  /**
   * Step an ASI assignment by ±1 and re-render the dialog body.
   * @this {AdvancementAsiDialog}
   * @param {PointerEvent} _event Click event.
   * @param {HTMLElement} target Action element carrying `data-key` + `data-delta`.
   */
  static #onAsiAdjust(_event, target) {
    if (target.disabled) return;
    const key = target.dataset.key;
    const delta = Number(target.dataset.delta);
    if (!key || !Number.isFinite(delta)) return;
    this.assignments[key] = Math.max(0, (Number(this.assignments[key]) || 0) + delta);
    this.render();
  }

  /**
   * Serialize the current assignment map into the row's hidden input and close.
   * @this {AdvancementAsiDialog}
   * @returns {Promise<void>}
   */
  static async #onCommit() {
    this.hiddenInput.value = JSON.stringify({ type: 'asi', assignments: this.assignments, feat: null });
    this.hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    this.onCommit?.();
    this.close();
  }
}
