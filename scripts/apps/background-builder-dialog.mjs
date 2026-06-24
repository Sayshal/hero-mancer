import { MODULE } from '../constants.mjs';
import { buildFeatBrowserContext, initFeatIndex } from '../domain/feat-browser.mjs';
import { AdvancementFeatDialog } from './advancement-feat-dialog.mjs';
import { HMDialog } from './dialog.mjs';

/**
 * Get or create the unlocked world compendium that stores custom backgrounds.
 * @returns {Promise<object>} The pack collection.
 */
async function ensureCustomPack() {
  let pack = game.packs.get('world.hero-mancer-2');
  if (!pack) {
    pack = await foundry.documents.collections.CompendiumCollection.createCompendium({
      type: 'Item',
      label: _loc('HEROMANCER.App.Identity.CustomBackground.PackLabel'),
      name: 'hero-mancer-2'
    });
  }
  if (pack.locked) await pack.configure({ locked: false });
  return pack;
}

/**
 * Get or create the custom-backgrounds folder inside the pack.
 * @param {object} pack Target pack collection.
 * @returns {Promise<string>} Folder id.
 */
async function ensureCustomFolder(pack) {
  const name = _loc('HEROMANCER.App.Identity.CustomBackground.FolderName');
  const existing = pack.folders.find((f) => f.name === name);
  if (existing) return existing.id;
  const folder = await Folder.create({ name, type: 'Item' }, { pack: pack.collection });
  return folder.id;
}

/**
 * Resolve a tool-proficiency trait key to its base-item uuid for content-link display.
 * @param {string} key Tool trait key (e.g. `tool:art:smith`).
 * @returns {?string} Base-item uuid, or null when the tool has no linked item.
 */
function toolItemUuid(key) {
  const baseId = CONFIG.DND5E.tools?.[key.split(':').pop()]?.id;
  return baseId ? dnd5e.documents.Trait.getBaseItemUUID(baseId) : null;
}

/**
 * Join a list with Oxford-comma conjunction ("A", "A and B", "A, B, and C").
 * @param {string[]} items Display strings.
 * @returns {string} Joined phrase.
 */
function listJoin(items) {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Build the rich background description: a summary block of the granted options (feats + tools as `@UUID` links) followed by the author's flavor text.
 * @param {object} parts Selections.
 * @param {string[]} parts.abilities Chosen ability keys.
 * @param {string[]} parts.skills Chosen skill trait keys.
 * @param {string[]} parts.tools Chosen tool trait keys.
 * @param {Array<{uuid:string, name:string}>} parts.feats Chosen feats.
 * @param {number} parts.gold Starting gold.
 * @param {string} parts.flavor Author flavor text.
 * @returns {string} HTML description.
 */
function buildDescription({ abilities, skills, tools, feats, gold, flavor }) {
  const L = (key) => _loc(`HEROMANCER.App.Identity.CustomBackground.Description.${key}`);
  const { keyLabel } = dnd5e.documents.Trait;
  const ref = (uuid, label) => (uuid ? `@UUID[${uuid}]{${label}}` : label);
  const abil = abilities.map((a) => ref(CONFIG.DND5E.abilities[a]?.reference, _loc(CONFIG.DND5E.abilities[a]?.label ?? a)));
  const skill = skills.map((s) => {
    const key = s.split(':')[1];
    return ref(CONFIG.DND5E.skills[key]?.reference, _loc(CONFIG.DND5E.skills[key]?.label ?? key));
  });
  const feat = feats.map((f) => `@UUID[${f.uuid}]{${f.name}}`);
  const tool = tools.map((key) => {
    const uuid = toolItemUuid(key);
    const label = keyLabel(key) ?? key;
    return uuid ? `@UUID[${uuid}]{${label}}` : label;
  });
  const out = [];
  if (abil.length) out.push(`<p><strong>${L('Abilities')}:</strong> ${listJoin(abil)}</p>`);
  if (feat.length) out.push(`<p><strong>${L('Feat')}:</strong> ${listJoin(feat)}</p>`);
  if (skill.length) out.push(`<p><strong>${L('Skills')}:</strong> ${listJoin(skill)}</p>`);
  if (tool.length) out.push(`<p><strong>${L('Tool')}:</strong> ${listJoin(tool)}</p>`);
  out.push(`<p><strong>${L('Equipment')}:</strong> ${gold} GP</p>`);
  if (flavor) out.push(`<p>${foundry.utils.escapeHTML(flavor)}</p>`);
  return out.join('');
}

/** Builder for a custom background; on submit creates a Background Item and reports it via `onCreate`. */
export class BackgroundBuilderDialog extends HMDialog {
  /** @inheritdoc */
  static DEFAULT_OPTIONS = {
    classes: ['hm-background-builder'],
    tag: 'form',
    window: { title: 'HEROMANCER.App.Identity.CustomBackground.Title', icon: 'fa-solid fa-wand-magic-sparkles' },
    position: { width: 600, height: 'auto' },
    actions: { create: BackgroundBuilderDialog.#onCreate, cancel: BackgroundBuilderDialog.#onCancel }
  };

  /** @inheritdoc */
  static PARTS = {
    header: HMDialog.HEADER_PART,
    body: { template: MODULE.TEMPLATES.DIALOGS.BACKGROUND_BUILDER },
    footer: { template: MODULE.TEMPLATES.DIALOGS.BACKGROUND_BUILDER_FOOTER }
  };

  /** @type {object} GM-configured limits, read from settings in `_prepareContext`. */
  #limits = {};

  /** @type {Map<string, Item>} Chosen feats keyed by uuid → Document. */
  #feats = new Map();

  /** @type {object} Persisted feat-browser filter state, defaulted to origin feats. */
  #featFilters = { subtype: 'origin' };

  /**
   * @param {object} args Dialog inputs.
   * @param {Function} args.onCreate Called with the created Background Item.
   * @param {object} [options] AppV2 options.
   */
  constructor({ onCreate }, options = {}) {
    super(options);
    this.onCreate = onCreate;
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const get = (key) => Number(game.settings.get(MODULE.ID, MODULE.SETTINGS[key]));
    const abilities = Object.entries(CONFIG.DND5E.abilities)
      .filter(([, cfg]) => cfg.improvement !== false)
      .map(([key, cfg]) => ({ value: key, label: cfg.label }));
    this.#limits = {
      abilityChoices: Math.min(get('CUSTOM_BG_ABILITY_CHOICES'), abilities.length),
      abilityPoints: get('CUSTOM_BG_ABILITY_POINTS'),
      abilityCap: get('CUSTOM_BG_ABILITY_CAP'),
      skillCount: get('CUSTOM_BG_SKILL_COUNT'),
      toolCount: get('CUSTOM_BG_TOOL_COUNT'),
      featCount: get('CUSTOM_BG_FEAT_COUNT'),
      budget: get('CUSTOM_BG_BUDGET')
    };
    const skills = Object.entries(CONFIG.DND5E.skills)
      .map(([key, cfg]) => ({ value: `skills:${key}`, label: cfg.label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    await initFeatIndex();
    return {
      ...context,
      abilities,
      skills,
      tools: await this.#toolOptions(),
      abilityChoices: this.#limits.abilityChoices,
      abilityPoints: this.#limits.abilityPoints,
      abilityCap: this.#limits.abilityCap,
      skillCount: this.#limits.skillCount,
      toolCount: this.#limits.toolCount,
      featCount: this.#limits.featCount,
      showTool: this.#limits.toolCount > 0,
      showFeat: this.#limits.featCount > 0
    };
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#wireLimits();
    this.#wireTool();
    this.#wireFeats();
  }

  /** Disable unchosen ability/skill checkboxes once their per-section limit is reached. */
  #wireLimits() {
    const apply = (name, limit) => {
      const boxes = [...this.element.querySelectorAll(`input[name="${name}"]`)];
      const checked = boxes.filter((b) => b.checked).length;
      boxes.forEach((b) => (b.disabled = !b.checked && checked >= limit));
    };
    for (const [name, limit] of [
      ['abilities', this.#limits.abilityChoices],
      ['skills', this.#limits.skillCount]
    ]) {
      this.element.querySelectorAll(`input[name="${name}"]`).forEach((b) => b.addEventListener('change', () => apply(name, limit)));
      apply(name, limit);
    }
  }

  /** Wire the tool multi-select: cap at the configured count and render chosen tools as content-link chips. */
  #wireTool() {
    const ms = this.element.querySelector('multi-select[name="tool"]');
    if (!ms) return;
    ms.addEventListener('change', () => this.#refreshTools(ms));
    this.element.querySelector('[data-bg-tools]')?.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-bg-tool-remove]');
      if (!remove) return;
      ms.value = ms.value.filter((v) => v !== remove.dataset.key);
      this.#refreshTools(ms);
    });
    this.#refreshTools(ms);
  }

  /**
   * Disable the add-dropdown at the tool limit and rebuild the chosen-tool content-link chips.
   * @param {HTMLElement} ms Tool multi-select element.
   */
  async #refreshTools(ms) {
    const select = ms.querySelector('select');
    if (select) select.disabled = (ms.value?.length ?? 0) >= this.#limits.toolCount;
    const list = this.element.querySelector('[data-bg-tools]');
    if (!list) return;
    const chips = await Promise.all((ms.value ?? []).map((key) => this.#toolChip(key)));
    list.replaceChildren(...chips);
  }

  /**
   * Build a removable content-link chip for one chosen tool, falling back to a plain label when it has no linked item.
   * @param {string} key Tool trait key.
   * @returns {Promise<HTMLLIElement>} Chip element.
   */
  async #toolChip(key) {
    const li = document.createElement('li');
    li.className = 'hm-bg-feat-line';
    const uuid = toolItemUuid(key);
    const doc = uuid ? await fromUuid(uuid) : null;
    const label = doc ? doc.toAnchor().outerHTML : `<span>${foundry.utils.escapeHTML(dnd5e.documents.Trait.keyLabel(key) ?? key)}</span>`;
    li.innerHTML = `
    ${label}
      <a class="hm-bg-remove" role="button" tabindex="0" data-bg-tool-remove data-key="${key}" aria-label="${_loc('HEROMANCER.App.Identity.CustomBackground.Remove')}">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </a>`;
    return li;
  }

  /** Wire the feat-picker button and the remove buttons on chosen feats. */
  #wireFeats() {
    this.element.querySelector('[data-bg-feat-add]')?.addEventListener('click', () => this.#openFeatPicker());
    this.element.querySelector('[data-bg-feats]')?.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-bg-feat-remove]');
      if (remove) {
        this.#feats.delete(remove.dataset.uuid);
        this.#refreshFeats();
      }
    });
    this.#refreshFeats();
  }

  /** Open the shared feat browser; it stays open so several feats can be added, and closes once the limit is reached. */
  #openFeatPicker() {
    if (this.#feats.size >= this.#limits.featCount) return;
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    const dialog = new AdvancementFeatDialog({
      keepOpen: true,
      buildContext: () => buildFeatBrowserContext({ filters: this.#featFilters }),
      filters: this.#featFilters,
      hiddenInput: hidden,
      onCommit: async () => {
        const uuid = JSON.parse(hidden.value || '{}').feat;
        if (!uuid || this.#feats.has(uuid)) return;
        const doc = await fromUuid(uuid);
        if (!doc) return;
        this.#feats.set(uuid, doc);
        this.#refreshFeats();
        if (this.#feats.size >= this.#limits.featCount) dialog.close();
      }
    });
    dialog.render({ force: true });
  }

  /** Rebuild the chosen-feats list and toggle the add button at the configured count. */
  #refreshFeats() {
    const list = this.element.querySelector('[data-bg-feats]');
    if (list) {
      list.replaceChildren();
      for (const [uuid, doc] of this.#feats) {
        const li = document.createElement('li');
        li.className = 'hm-bg-feat-line';
        li.innerHTML = `
        ${doc.toAnchor().outerHTML}
          <a class="hm-bg-remove" role="button" tabindex="0" data-bg-feat-remove data-uuid="${uuid}" aria-label="${_loc('HEROMANCER.App.Identity.CustomBackground.Remove')}">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </a>`;
        list.append(li);
      }
    }
    const btn = this.element.querySelector('[data-bg-feat-add]');
    if (btn) btn.disabled = this.#feats.size >= this.#limits.featCount;
  }

  /** @returns {Promise<Array<{label:string, options:Array<{value:string, label:string}>}>>} Tool-proficiency keys grouped by category. */
  async #toolOptions() {
    const choices = await dnd5e.documents.Trait.choices('tool', { prefixed: true });
    const groups = new Map();
    for (const o of choices.asOptions().filter((o) => o.value && !o.rule && o.selectable !== false)) {
      const label = o.group ?? '';
      if (!groups.has(label)) groups.set(label, { label, options: [] });
      groups.get(label).options.push({ value: o.value, label: o.label });
    }
    return [...groups.values()];
  }

  /**
   * Validate the form and build the background. Keeps the dialog open on validation failure.
   * @this {BackgroundBuilderDialog}
   * @param {SubmitEvent} event Submit event.
   */
  static async #onCreate(event) {
    event.preventDefault();
    const data = this.#readForm();
    if (!data) return;
    const item = await this.#createBackground(data);
    this.onCreate?.(item);
    this.close();
  }

  /**
   * @this {BackgroundBuilderDialog}
   * @param {PointerEvent} _event Click event.
   */
  static #onCancel(_event) {
    this.close();
  }

  /** @returns {?object} Validated builder selections, or null when incomplete (a warning is shown). */
  #readForm() {
    const root = this.element;
    const abilities = [...root.querySelectorAll('input[name="abilities"]:checked')].map((c) => c.value);
    const skills = [...root.querySelectorAll('input[name="skills"]:checked')].map((c) => c.value);
    const tools = [...(root.querySelector('multi-select[name="tool"]')?.value ?? [])];
    const feats = [...this.#feats.keys()];
    const name = root.querySelector('input[name="name"]')?.value?.trim();
    const flavor = root.querySelector('textarea[name="description"]')?.value?.trim() ?? '';
    const errors = [];
    if (abilities.length !== this.#limits.abilityChoices) errors.push(_loc('HEROMANCER.App.Identity.CustomBackground.Errors.Abilities', { count: this.#limits.abilityChoices }));
    if (skills.length !== this.#limits.skillCount) errors.push(_loc('HEROMANCER.App.Identity.CustomBackground.Errors.Skills', { count: this.#limits.skillCount }));
    if (tools.length !== this.#limits.toolCount) errors.push(_loc('HEROMANCER.App.Identity.CustomBackground.Errors.Tool', { count: this.#limits.toolCount }));
    if (feats.length !== this.#limits.featCount) errors.push(_loc('HEROMANCER.App.Identity.CustomBackground.Errors.Feat', { count: this.#limits.featCount }));
    if (errors.length) {
      ui.notifications.warn(errors.join(' '));
      return null;
    }
    return { name, abilities, skills, tools, feats, flavor };
  }

  /**
   * Assemble and persist the Background Item from validated selections.
   * @param {object} data Validated selections.
   * @param {string} data.name Background name; empty falls back to the default.
   * @param {string[]} data.abilities Chosen ability keys.
   * @param {string[]} data.skills Chosen skill trait keys.
   * @param {string[]} data.tools Chosen tool trait keys.
   * @param {string[]} data.feats Chosen origin feat uuids.
   * @param {string} data.flavor Author flavor text appended to the description.
   * @returns {Promise<Item>} Created Background Item.
   */
  async #createBackground({ name, abilities, skills, tools, feats, flavor }) {
    const pack = await ensureCustomPack();
    const folder = await ensureCustomFolder(pack);
    const finalName = name || _loc('HEROMANCER.App.Identity.CustomBackground.DefaultName');
    const fixed = Object.fromEntries(Object.keys(CONFIG.DND5E.abilities).map((k) => [k, 0]));
    const locked = Object.keys(CONFIG.DND5E.abilities).filter((k) => !abilities.includes(k));
    const advancement = [
      { type: 'AbilityScoreImprovement', configuration: { cap: this.#limits.abilityCap, points: this.#limits.abilityPoints, fixed, locked }, value: {} },
      { type: 'Trait', configuration: { mode: 'default', allowReplacements: false, grants: [...skills, ...tools], choices: [] }, value: { chosen: [] } }
    ];
    if (feats.length) advancement.push({ type: 'ItemGrant', configuration: { items: feats.map((uuid) => ({ optional: false, uuid })), optional: false, spell: null }, value: {} });
    const featList = feats.map((uuid) => ({ uuid, name: this.#feats.get(uuid)?.name ?? uuid }));
    const description = buildDescription({ abilities, skills, tools, feats: featList, gold: this.#limits.budget, flavor });
    const data = {
      name: finalName,
      type: 'background',
      folder,
      img: 'icons/skills/trades/academics-merchant-scribe.webp',
      system: {
        identifier: finalName.slugify({ strict: true }),
        description: { value: description },
        source: { book: MODULE.NAME, rules: '', revision: 1 },
        wealth: String(this.#limits.budget),
        advancement
      }
    };
    return Item.implementation.create(data, { pack: pack.collection });
  }
}
