import { applyItemLinks } from '../utils/item-link.mjs';

/**
 * @typedef {object} TileBadge
 * @property {string} [label] Optional badge label (e.g. `AC`).
 * @property {string} value Badge value (e.g. `15`).
 * @property {string} kind One of `damage` | `ac` | `stealth` | `count` | `tag`.
 */

/**
 * @typedef {object} TileContentRow
 * @property {string} label Item label inside an AND-grouped tile.
 * @property {?string} [icon] Optional row icon.
 * @property {?number} [qty] Quantity of this content row.
 */

/**
 * @typedef {object} EquipmentTileSpec
 * @property {string} value Underlying form value (typically a UUID).
 * @property {string} label Display name.
 * @property {string} type Item bucket: `weapon` | `armor` | `pack` | `tool` | `other`.
 * @property {?string} [icon] Image source.
 * @property {?string} [cost] Display cost (e.g. `5 gp`).
 * @property {?number} [count] Quantity multiplier.
 * @property {TileBadge[]} [badges] Smart badges shown below the name.
 * @property {TileContentRow[]} [contents] AND-inside-OR rows.
 * @property {boolean} [disabled] Renders disabled and skipped during navigation.
 */

/**
 * @typedef {object} EquipmentTileOpts
 * @property {Function} [onChange] Called with `(value, tileElement)` after a commit.
 */

/** Vanilla equipment-tile group: radiogroup of trading-card option tiles. */
export class EquipmentTile {
  /** @type {WeakMap<HTMLElement, EquipmentTile>} */
  static #instances = new WeakMap();

  /**
   * Attach to a single shell rendered from `templates/components/equipment-tile.hbs`.
   * @param {HTMLElement} root Wrapper element with `[data-equipment-tile-group]`.
   * @param {EquipmentTileOpts} [opts] Behavior overrides.
   * @returns {EquipmentTile} New or pre-existing instance.
   */
  static attach(root, opts = {}) {
    const existing = EquipmentTile.#instances.get(root);
    if (existing) return existing;
    return new EquipmentTile(root, opts);
  }

  /**
   * Attach to every `[data-equipment-tile-group]` within a scope.
   * @param {Element|Document} scope Container to query.
   * @param {EquipmentTileOpts} [opts] Behavior overrides applied to each instance.
   * @returns {EquipmentTile[]} One instance per group found.
   */
  static attachAll(scope, opts = {}) {
    return Array.from(scope.querySelectorAll('[data-equipment-tile-group]')).map((el) => EquipmentTile.attach(el, opts));
  }

  /**
   * @param {HTMLElement} root Group element.
   * @param {EquipmentTileOpts} opts Behavior overrides.
   */
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    this.hidden = root.querySelector('input[type="hidden"]');
    this.#bind();
    this.#syncPickers();
    applyItemLinks(this.root);
    EquipmentTile.#instances.set(root, this);
  }

  /** Wire delegated DOM listeners on the group element. */
  #bind() {
    this.root.addEventListener('click', (e) => this.#onClick(e));
    this.root.addEventListener('keydown', (e) => this.#onKey(e));
  }

  /**
   * Programmatically select by value.
   * @param {string} value Target tile value.
   * @returns {boolean} True when a tile matched and was committed.
   */
  select(value) {
    const tile = this.#tileByValue(value);
    if (!tile) return false;
    this.#commit(tile);
    return true;
  }

  /** Clear current selection and fire change. */
  clear() {
    this.#tiles().forEach((t) => {
      t.removeAttribute('data-selected');
      t.setAttribute('aria-checked', 'false');
      t.tabIndex = -1;
    });
    const first = this.#enabledTiles()[0];
    if (first) first.tabIndex = 0;
    this.hidden.value = '';
    this.root.dataset.value = '';
    this.#fireChange();
  }

  /** Disable interaction. */
  disable() {
    this.root.classList.add('is-disabled');
    this.#tiles().forEach((t) => {
      t.disabled = true;
    });
  }

  /** Re-enable interaction. */
  enable() {
    this.root.classList.remove('is-disabled');
    this.#tiles().forEach((t) => {
      if (t.getAttribute('aria-disabled') !== 'true') t.disabled = false;
    });
  }

  /** Detach the WeakMap entry. */
  destroy() {
    EquipmentTile.#instances.delete(this.root);
  }

  /** @returns {HTMLElement[]} All tile buttons. */
  #tiles() {
    return Array.from(this.root.querySelectorAll('[data-equipment-tile]'));
  }

  /** @returns {HTMLElement[]} Enabled tile buttons (navigation targets). */
  #enabledTiles() {
    return this.#tiles().filter((t) => !t.disabled && t.getAttribute('aria-disabled') !== 'true');
  }

  /**
   * @param {string} value Form value.
   * @returns {?HTMLElement} Tile with matching `data-value`, or null.
   */
  #tileByValue(value) {
    return this.#tiles().find((t) => t.dataset.value === value) ?? null;
  }

  /**
   * Commit a tile selection and fire change.
   * @param {HTMLElement} tile Target tile element.
   */
  #commit(tile) {
    if (!tile || tile.disabled || tile.getAttribute('aria-disabled') === 'true') return;
    if (this.#mode() === 'check') {
      const turnOn = !tile.hasAttribute('data-selected');
      if (turnOn) {
        const max = Number(this.root.dataset.max) || 0;
        if (max > 0) {
          const current = this.#tiles().filter((t) => t.hasAttribute('data-selected')).length;
          if (current >= max) return;
        }
      }
      tile.toggleAttribute('data-selected', turnOn);
      tile.setAttribute('aria-pressed', turnOn ? 'true' : 'false');
      const selected = this.#tiles()
        .filter((t) => t.hasAttribute('data-selected'))
        .map((t) => t.dataset.value);
      this.hidden.value = selected.join(',');
      this.root.dataset.value = this.hidden.value;
      tile.focus({ preventScroll: true });
      this.#fireChange(tile);
      return;
    }
    this.#tiles().forEach((t) => {
      const sel = t === tile;
      t.toggleAttribute('data-selected', sel);
      t.setAttribute('aria-checked', sel ? 'true' : 'false');
      t.tabIndex = sel ? 0 : -1;
    });
    this.hidden.value = tile.dataset.value;
    this.root.dataset.value = tile.dataset.value;
    this.#syncPickers();
    tile.focus({ preventScroll: true });
    this.#fireChange(tile);
  }

  /** Show the picker block whose `data-and-pickers` matches the current radio value; hide the rest. */
  #syncPickers() {
    if (this.#mode() === 'check') return;
    const current = this.root.dataset.value ?? '';
    for (const block of this.root.querySelectorAll(':scope > [data-and-pickers]')) block.hidden = block.dataset.andPickers !== current;
  }

  /** @returns {string} Group selection mode: `radio` (default) or `check`. */
  #mode() {
    return this.root.dataset.mode === 'check' ? 'check' : 'radio';
  }

  /**
   * Fire onChange callback and dispatch a bubbling `change` on the hidden input.
   * @param {?HTMLElement} [tile] Selected tile element.
   */
  #fireChange(tile = null) {
    this.opts.onChange?.(this.hidden.value, tile);
    this.hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Move focus by a relative step within the enabled tile set.
   * @param {HTMLElement} from Currently focused tile.
   * @param {number} delta Step amount.
   */
  #moveFocus(from, delta) {
    const list = this.#enabledTiles();
    if (!list.length) return;
    const idx = list.indexOf(from);
    const next = (idx + delta + list.length) % list.length;
    list[next].focus({ preventScroll: true });
  }

  /**
   * Commit on tile click.
   * @param {MouseEvent} e Click event.
   */
  #onClick(e) {
    if (e.target.closest('[data-item-link]')) return;
    const tile = e.target.closest('[data-equipment-tile]');
    if (tile) this.#commit(tile);
  }

  /**
   * Keyboard navigation: arrows cycle, Home/End jump, Space/Enter commit.
   * @param {KeyboardEvent} e Keydown event.
   */
  #onKey(e) {
    const tile = e.target.closest('[data-equipment-tile]');
    if (!tile) return;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        this.#moveFocus(tile, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        this.#moveFocus(tile, -1);
        break;
      case 'Home': {
        e.preventDefault();
        const first = this.#enabledTiles()[0];
        if (first) first.focus({ preventScroll: true });
        break;
      }
      case 'End': {
        e.preventDefault();
        const list = this.#enabledTiles();
        if (list.length) list[list.length - 1].focus({ preventScroll: true });
        break;
      }
      case ' ':
      case 'Enter':
        e.preventDefault();
        this.#commit(tile);
        break;
    }
  }
}
