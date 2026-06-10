import { MODULE } from '../constants.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Shared Hero Mancer chrome.  */
export class HMDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ['hero-mancer', 'hm-dialog'],
    window: { frame: false, positioned: true }
  };

  /** @type {object} Shared header part. */
  static HEADER_PART = { template: MODULE.TEMPLATES.DIALOGS.HEADER };

  /** @type {boolean} Inject the custom corner resize handle. */
  static RESIZABLE = true;

  /** @inheritdoc */
  async _preparePartContext(partId, context, options) {
    const partContext = await super._preparePartContext(partId, context, options);
    if (partId === 'header') {
      partContext.title ??= this.title;
      partContext.icon ??= this.options.window.icon ?? null;
    }
    return partContext;
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#ensureResizeHandle();
    this.#enableDragging();
  }

  /** @inheritdoc */
  _attachFrameListeners() {
    super._attachFrameListeners();
    this.element.addEventListener('mousedown', () => this.bringToFront());
    this.element.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const t = event.target;
      if (t?.matches?.('input, textarea, [contenteditable="true"]') || t?.closest?.('[data-combobox] [aria-expanded="true"]')) return;
      this.close();
    });
  }

  /** @inheritdoc */
  bringToFront() {
    if (!this.element) return;
    this.position.zIndex = ++ApplicationV2._maxZ;
    this.element.style.zIndex = String(this.position.zIndex);
    ui.activeWindow = this;
  }

  /** @inheritdoc */
  async close(options = {}) {
    await this.#fadeOut();
    return super.close({ animate: false, ...options });
  }

  /** @inheritdoc */
  _onResize() {}

  /** Position-persistence hook. */
  _persistPosition() {}

  /** Wire drag-to-move on the header strip; idempotent across re-renders. */
  #enableDragging() {
    const handle = this.element?.querySelector('[data-drag-handle]');
    if (!handle || handle.dataset.dragWired === '1') return;
    handle.dataset.dragWired = '1';
    const resizable = this.constructor.RESIZABLE ? { selector: '.hm-dialog-resize-handle' } : false;
    const drag = new foundry.applications.ux.Draggable.implementation(this, this.element, handle, resizable);
    const origDown = drag._onDragMouseDown.bind(drag);
    drag._onDragMouseDown = (event) => {
      if (event.target.closest('button, a, input, select, [data-action], .hm-dialog-resize-handle')) return;
      origDown(event);
    };
    const origUp = drag._onDragMouseUp.bind(drag);
    drag._onDragMouseUp = (event) => {
      origUp(event);
      this._persistPosition();
    };
    if (!resizable) return;
    const origResizeUp = drag._onResizeMouseUp.bind(drag);
    drag._onResizeMouseUp = (event) => {
      origResizeUp(event);
      this._persistPosition();
    };
  }

  /** Add `is-closing` and await the opacity transition so the window fades out instead of cutting. */
  async #fadeOut() {
    const el = this.element;
    if (!el) return;
    el.classList.add('is-closing');
    await new Promise((resolve) => {
      const done = () => {
        el.removeEventListener('transitionend', done);
        resolve();
      };
      el.addEventListener('transitionend', done, { once: true });
      setTimeout(done, 250);
    });
  }

  /** Inject a corner resize handle (frame:false has none) when the window is resizable. Idempotent. */
  #ensureResizeHandle() {
    if (!this.constructor.RESIZABLE || !this.element) return;
    if (this.element.querySelector(':scope > .hm-dialog-resize-handle')) return;
    const handle = document.createElement('div');
    handle.className = 'hm-dialog-resize-handle';
    handle.setAttribute('aria-label', _loc('HEROMANCER.Dialog.Resize'));
    this.element.appendChild(handle);
  }
}

/** Frameless prompt/confirm built on HMDialog chrome — a themed stand-in for Foundry's DialogV2, returning a Promise that resolves to the chosen button's result. */
export class HMPrompt extends HMDialog {
  static DEFAULT_OPTIONS = {
    classes: ['hm-prompt'],
    position: { width: 440, height: 'auto' },
    actions: { promptButton: HMPrompt.#onButton }
  };

  static PARTS = {
    header: HMDialog.HEADER_PART,
    main: { template: MODULE.TEMPLATES.DIALOGS.PROMPT }
  };

  /** @inheritdoc */
  static RESIZABLE = false;

  /** @type {object} Prompt config: `{content|template+context|body, buttons, modal, close}`. */
  #config;

  /** @type {?Function} Pending `wait()` promise resolver. */
  #resolve = null;

  /** @type {boolean} Guards against double-settling the promise. */
  #settled = false;

  /** @type {?HTMLElement} Modal backdrop element, when `modal` is set. */
  #backdrop = null;

  /**
   * @param {object} [config] Prompt config `{window, content, buttons, modal, close}`.
   * @param {object} [options] Extra AppV2 options.
   */
  constructor(config = {}, options = {}) {
    super({ ...options, window: { ...options.window, ...config.window } });
    this.#config = config;
  }

  /**
   * Render a prompt and resolve with the activated button's result (its callback return, else its action), or the `close` value on dismiss.
   * @param {object} config `{window, buttons, modal, close}` plus a body via `template`+`context`, plain `body`, or raw `content`.
   * @returns {Promise<*>} Resolved button result.
   */
  static wait(config = {}) {
    return new Promise((resolve) => {
      const dialog = new this(config, config.classes ? { classes: config.classes } : {});
      dialog.#resolve = resolve;
      dialog.render({ force: true });
    });
  }

  /**
   * Yes/No convenience wrapper resolving to a boolean.
   * @param {object} config `{window, content, modal, yes, no}` — `yes`/`no` accept `{label, icon, default}`.
   * @returns {Promise<boolean>} True when the affirmative button is chosen.
   */
  static async confirm(config = {}) {
    const { yes = {}, no = {}, ...rest } = config;
    const result = await this.wait({
      ...rest,
      close: () => false,
      buttons: [
        { action: true, label: yes.label ?? 'Yes', icon: yes.icon ?? 'fa-solid fa-check', default: yes.default ?? true },
        { action: false, label: no.label ?? 'No', icon: no.icon ?? 'fa-solid fa-xmark' }
      ]
    });
    return result === true;
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if (this.#config.template) context.content = await foundry.applications.handlebars.renderTemplate(this.#config.template, this.#config.context ?? {});
    else context.content = this.#config.content ?? '';
    context.body = this.#config.body ?? '';
    context.buttons = (this.#config.buttons ?? []).map((button, index) => ({ id: index, label: button.label, icon: button.icon ?? null, cssClass: button.default ? 'hm-primary' : '' }));
    return context;
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    this.bringToFront();
    if (!this.#config.modal) return;
    if (!this.#backdrop) {
      this.#backdrop = document.createElement('div');
      this.#backdrop.className = 'hm-prompt-backdrop';
      document.body.appendChild(this.#backdrop);
    }
    this.#backdrop.style.zIndex = String((this.position.zIndex ?? 100) - 1);
  }

  /** @inheritdoc */
  _onClose(options) {
    this.#backdrop?.remove();
    this.#backdrop = null;
    this.#settle(this.#config.close ? this.#config.close() : null);
    return super._onClose(options);
  }

  /**
   * Resolve the pending promise once with the given value.
   * @param {*} value Resolution value.
   */
  #settle(value) {
    if (this.#settled) return;
    this.#settled = true;
    this.#resolve?.(value);
  }

  /**
   * Run a clicked button's callback, resolve, and close.
   * @this {HMPrompt}
   * @param {PointerEvent} event Click event.
   * @param {HTMLElement} target Button element carrying `data-button-id`.
   */
  static async #onButton(event, target) {
    const button = this.#config.buttons?.[Number(target.dataset.buttonId)];
    if (!button) return;
    const value = button.callback ? await button.callback(event, target, this) : button.action;
    this.#settle(value);
    this.close();
  }
}
