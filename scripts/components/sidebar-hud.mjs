import { getClassColor } from './class-color.mjs';
import { ImagePortrait } from './image-portrait.mjs';
import { DEFAULT_PALETTE } from './sidebar-hud-snapshot.mjs';

/** Live HUD block at the top of the wizard sidebar */
export class SidebarHud {
  /** @type {?HTMLElement} */
  #root = null;

  /** @type {?HTMLElement} */
  #portraitHost = null;

  /** @type {ImagePortrait} */
  #portrait = new ImagePortrait();

  /** @type {string} */
  #lastClassImg = '';

  /** @type {string} */
  #lastTokenSrc = '';

  /** @type {string} */
  #lastCurrency = '';

  /** @type {?number} */
  #shimmerTimer = null;

  /**
   * Attach to the wizard root.
   * @param {HTMLElement} wizardElement Wizard root.
   * @returns {Promise<void>}
   */
  async attach(wizardElement) {
    this.#root = wizardElement.querySelector('[data-hm-hud]');
    if (!this.#root) return;
    this.#portraitHost = this.#root.querySelector('[data-hm-hud-portrait]');
    if (this.#portraitHost) await this.#portrait.mount(this.#portraitHost);
  }

  /**
   * Push a snapshot to the HUD.
   * @param {object} snapshot HUD snapshot from `buildHudSnapshot`.
   * @returns {Promise<void>}
   */
  async update(snapshot) {
    if (!this.#root) return;
    this.#applyPalette(snapshot.classImg);
    if (snapshot.portraitImg) this.#portrait.setTexture(snapshot.portraitImg);
    this.#patchToken(snapshot.tokenImg);
    this.#patchName(snapshot.name);
    this.#patchIdentity(snapshot);
    this.#patchHpChip(snapshot.hp);
    this.#patchAc(snapshot.ac);
    this.#patchCurrency(snapshot.currency);
    this.#patchAbilities(snapshot.stats?.abilities ?? null);
    this.#patchStatsGrid(snapshot.stats ?? {});
    this.#syncBannerVisibility(snapshot);
    this.#root.classList.toggle('is-empty', !!snapshot.isEmpty);
  }

  /**
   * Apply the class-color palette to CSS vars. Async because extraction reads canvas pixels.
   * @param {?string} classImg Class icon URL.
   */
  #applyPalette(classImg) {
    const key = classImg ?? '';
    if (key === this.#lastClassImg) return;
    this.#lastClassImg = key;
    if (!classImg) {
      this.#writePalette(DEFAULT_PALETTE);
      return;
    }
    getClassColor(classImg).then((palette) => {
      if (this.#lastClassImg !== key || !this.#root) return;
      this.#writePalette(palette ?? DEFAULT_PALETTE);
    });
  }

  /**
   * Write palette CSS vars onto the HUD root.
   * @param {{primary:string, secondary:string}} palette Palette.
   */
  #writePalette(palette) {
    if (!this.#root) return;
    this.#root.style.setProperty('--hm-hud-primary', palette.primary);
    this.#root.style.setProperty('--hm-hud-secondary', palette.secondary);
  }

  /**
   * Hide the banner + overlay when nothing meaningful to show.
   * @param {object} snapshot Snapshot.
   */
  #syncBannerVisibility(snapshot) {
    const banner = this.#root.querySelector('[data-hm-hud-banner]');
    const overlay = this.#root.querySelector('[data-hm-hud-overlay]');
    const token = this.#root.querySelector('[data-hm-hud-token]');
    const acVisible = Number.isFinite(snapshot.ac?.value);
    const currencyVisible = !!snapshot.currency?.available;
    const hasCustomToken = !!snapshot.tokenImg && !snapshot.tokenImg.endsWith('character.svg');
    const stats = snapshot.stats ?? {};
    const anyStat = stats.initiative || stats.speed || stats.profBonus || stats.hitDie || stats.saves || stats.senses;
    const hasClass = !!snapshot.classes?.length;
    const seeBanner = !!snapshot.name?.trim() || hasClass || !!snapshot.speciesName || !!snapshot.backgroundName || snapshot.hp?.available || acVisible || currencyVisible || anyStat || hasCustomToken;
    if (banner) banner.hidden = !seeBanner;
    if (overlay) overlay.hidden = !seeBanner;
    if (token) token.hidden = !seeBanner;
  }

  /**
   * Patch the extended stats grid (init/speed/prof/hit-die/saves/senses). Empty rows hidden.
   * @param {object} stats Stats from snapshot.
   */
  #patchStatsGrid(stats) {
    const map = {
      initiative: ['initiative', stats.initiative],
      speed: ['speed', stats.speed],
      prof: ['prof', stats.profBonus],
      'hit-die': ['hit-die', stats.hitDie],
      saves: ['saves', stats.saves],
      senses: ['senses', stats.senses]
    };
    for (const [rowKey, [attr, value]] of Object.entries(map)) {
      const row = this.#root.querySelector(`[data-hm-hud-row="${rowKey}"]`);
      if (!row) continue;
      const dd = row.querySelector(`[data-hm-hud-${attr}]`);
      if (value) {
        if (dd) dd.textContent = value;
        row.hidden = false;
      } else {
        if (dd) dd.textContent = '';
        row.hidden = true;
      }
    }
  }

  /** Tear down + clear timers. */
  destroy() {
    if (this.#shimmerTimer) clearTimeout(this.#shimmerTimer);
    this.#shimmerTimer = null;
    this.#portrait.destroy();
    this.#root = null;
    this.#portraitHost = null;
  }

  /**
   * Swap the token badge src.
   * @param {string} url Token image URL.
   */
  #patchToken(url) {
    if (!url || url === this.#lastTokenSrc) return;
    this.#lastTokenSrc = url;
    const img = this.#root.querySelector('[data-hm-hud-token]');
    if (img) img.src = url;
  }

  /**
   * Patch the name field. Hidden when empty.
   * @param {string} name Character name (may be empty).
   */
  #patchName(name) {
    const row = this.#root.querySelector('[data-hm-hud-name-row]');
    const el = this.#root.querySelector('[data-hm-hud-name]');
    const trimmed = (name ?? '').trim();
    if (el) {
      el.textContent = trimmed;
      this.#fitName(el);
    }
    this.#syncNameRow(row);
  }

  /**
   * Shrink the name font-size until it fits on one line.
   * @param {HTMLElement} el Name element.
   */
  #fitName(el) {
    el.style.fontSize = '';
    if (!el.offsetParent) return;
    const max = 1.15;
    const min = 0.7;
    let size = max;
    while (size > min && el.scrollWidth > el.clientWidth) {
      size -= 0.05;
      el.style.fontSize = `${size.toFixed(2)}em`;
    }
  }

  /**
   * Show the name row when either name or level is set.
   * @param {?HTMLElement} row Name row element.
   */
  #syncNameRow(row) {
    if (!row) row = this.#root.querySelector('[data-hm-hud-name-row]');
    if (!row) return;
    const name = row.querySelector('[data-hm-hud-name]');
    row.hidden = !(name && name.textContent.trim());
  }

  /**
   * Patch class/subclass/species/bg identity rows. Rows hidden when empty.
   * @param {object} snapshot Snapshot.
   */
  #patchIdentity(snapshot) {
    const hasClass = !!snapshot.classes?.length;
    const classRow = this.#root.querySelector('[data-hm-hud-class]');
    if (classRow) {
      const nameEl = classRow.querySelector('[data-hm-hud-class-name]');
      if (hasClass) {
        if (nameEl) nameEl.textContent = snapshot.classLineText ?? '';
        classRow.hidden = false;
      } else {
        if (nameEl) nameEl.textContent = '';
        classRow.hidden = true;
      }
    }
    const levelEl = this.#root.querySelector('[data-hm-hud-class-level]');
    if (levelEl) {
      if (hasClass) {
        levelEl.textContent = _loc('DND5E.LevelNumber', { level: snapshot.totalLevel });
        levelEl.hidden = false;
      } else {
        levelEl.textContent = '';
        levelEl.hidden = true;
      }
    }
    this.#syncNameRow();
    const originRow = this.#root.querySelector('[data-hm-hud-origin]');
    if (originRow) {
      const parts = [snapshot.backgroundName, snapshot.speciesName].filter(Boolean);
      if (parts.length) {
        originRow.textContent = parts.join(' · ');
        originRow.hidden = false;
      } else {
        originRow.textContent = '';
        originRow.hidden = true;
      }
    }
  }

  /**
   * Patch the HP chip — shows max HP, hidden when class not picked.
   * @param {{current:number, max:number, available:boolean}} hp HP snapshot.
   */
  #patchHpChip(hp) {
    const chip = this.#root.querySelector('[data-hm-hud-hp-chip]');
    const value = this.#root.querySelector('[data-hm-hud-hp-value]');
    if (!chip) return;
    if (!hp?.available) {
      chip.hidden = true;
      if (value) value.textContent = '';
      return;
    }
    chip.hidden = false;
    if (value) value.textContent = String(hp.max);
  }

  /**
   * Patch the ability-score grid.
   * @param {?Array<{key:string, score:number, mod:string}>} rows Ability rows.
   */
  #patchAbilities(rows) {
    const wrap = this.#root.querySelector('[data-hm-hud-abilities]');
    if (!wrap) return;
    if (!rows || !rows.length) {
      wrap.hidden = true;
      wrap.replaceChildren();
      return;
    }
    wrap.hidden = false;
    const existing = wrap.children;
    if (existing.length !== rows.length || wrap.dataset.abilityKeys !== rows.map((r) => r.key).join(',')) {
      wrap.replaceChildren(...rows.map((row) => this.#buildAbilityCell(row)));
      wrap.dataset.abilityKeys = rows.map((r) => r.key).join(',');
    } else {
      for (let i = 0; i < rows.length; i++) this.#fillAbilityCell(existing[i], rows[i]);
    }
  }

  /**
   * Build a single ability cell DOM node.
   * @param {{key:string, label:string, score:number, mod:string}} row Ability row.
   * @returns {HTMLElement} New cell.
   */
  #buildAbilityCell(row) {
    const cell = document.createElement('div');
    cell.className = 'hm-hud-ability';
    cell.dataset.ability = row.key;
    const dt = document.createElement('dt');
    const score = document.createElement('dd');
    score.className = 'hm-hud-ability-score';
    const mod = document.createElement('dd');
    mod.className = 'hm-hud-ability-mod';
    cell.append(dt, score, mod);
    this.#fillAbilityCell(cell, row);
    return cell;
  }

  /**
   * Update text inside an existing ability cell.
   * @param {HTMLElement} cell Cell element.
   * @param {{label:string, score:number, mod:string}} row Ability row.
   */
  #fillAbilityCell(cell, row) {
    const dt = cell.querySelector('dt');
    const score = cell.querySelector('.hm-hud-ability-score');
    const mod = cell.querySelector('.hm-hud-ability-mod');
    if (dt) dt.textContent = row.label;
    if (score) score.textContent = String(row.score);
    if (mod) mod.textContent = row.mod;
  }

  /**
   * Patch the AC chip.
   * @param {{value:?number}} ac AC snapshot.
   */
  #patchAc(ac) {
    const chip = this.#root.querySelector('[data-hm-hud-ac-chip]');
    const el = this.#root.querySelector('[data-hm-hud-ac]');
    const v = ac?.value;
    if (chip) chip.hidden = !Number.isFinite(v);
    if (el) el.textContent = Number.isFinite(v) ? String(v) : '';
  }

  /**
   * Patch currency + fire shimmer pulse on change.
   * @param {{gp:number, formatted:string}} currency Currency snapshot.
   */
  #patchCurrency(currency) {
    const chip = this.#root.querySelector('[data-hm-hud-currency-chip]');
    const el = this.#root.querySelector('[data-hm-hud-currency]');
    const available = !!currency?.available;
    if (chip) chip.hidden = !available;
    if (!el) return;
    if (!available) {
      el.textContent = '';
      this.#lastCurrency = '';
      return;
    }
    const next = currency.formatted ?? '';
    if (next !== this.#lastCurrency) {
      el.textContent = next;
      if (this.#lastCurrency) {
        el.classList.remove('is-shimmer');
        void el.offsetWidth;
        el.classList.add('is-shimmer');
        if (this.#shimmerTimer) clearTimeout(this.#shimmerTimer);
        this.#shimmerTimer = setTimeout(() => el.classList.remove('is-shimmer'), 900);
      }
      this.#lastCurrency = next;
    }
  }
}
