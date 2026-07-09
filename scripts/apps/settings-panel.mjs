import { MODULE } from '../constants.mjs';
import { pickFromBrowser } from '../data/compendium-picker.mjs';
import { getPointBuyCostMap } from '../domain/ability-scores.mjs';
import { HMDialog } from './dialog.mjs';

/** Per-category config for the exclusions tab: unified-setting bucket key, label tab id, FA icon, and browsed Item subtypes. */
const EXCLUSION_BUCKETS = [
  { bucket: 'race', labelId: 'species', icon: 'fa-solid fa-feather-alt', types: new Set(['race']) },
  { bucket: 'background', labelId: 'background', icon: 'fa-solid fa-scroll', types: new Set(['background']) },
  { bucket: 'class', labelId: 'class', icon: 'fa-solid fa-chess-knight', types: new Set(['class']) },
  { bucket: 'subclass', labelId: 'subclass', icon: 'fa-solid fa-sitemap', types: new Set(['subclass']) },
  { bucket: 'feat', labelId: 'feat', icon: 'fa-solid fa-medal', types: new Set(['feat']), additional: { category: { feat: 1 } } },
  { bucket: 'equipment', labelId: 'items', icon: 'fa-solid fa-box-open', itemsTab: true }
];

/** Per-tab catalogue: ordered setting key list + display type + per-field metadata. */
const TAB_SETTINGS = {
  abilities: [
    {
      group: 'HEROMANCER.Settings.SettingsPanel.Group.General',
      settings: [
        { key: 'ALLOWED_METHODS', type: 'allowedMethods', nameKey: 'HEROMANCER.Settings.AllowedMethods.Name', hintKey: 'HEROMANCER.Settings.AllowedMethods.Hint' },
        { key: 'ALLOWED_HP_METHODS', type: 'allowedHpMethods', nameKey: 'HEROMANCER.Settings.AllowedHPMethods.Name', hintKey: 'HEROMANCER.Settings.AllowedHPMethods.Hint' },
        { key: 'ALLOW_REROLLS', type: 'boolean' },
        { key: 'MAX_REROLL_ATTEMPTS', type: 'number' }
      ]
    },
    {
      group: 'HEROMANCER.Settings.SettingsPanel.Group.StandardArray',
      settings: [{ key: 'STANDARD_ARRAY_VALUES', type: 'string' }]
    },
    {
      group: 'HEROMANCER.Settings.SettingsPanel.Group.PointBuy',
      settings: [
        { key: 'CUSTOM_POINT_BUY_TOTAL', type: 'number' },
        { key: 'POINT_BUY_COST_MAP', type: 'costMap' }
      ]
    },
    {
      group: 'HEROMANCER.Settings.SettingsPanel.Group.ManualRoll',
      settings: [{ key: 'CUSTOM_ROLL_FORMULA', type: 'string' }]
    },
    {
      group: 'HEROMANCER.Settings.SettingsPanel.Group.ScoreLimits',
      settings: [
        { key: 'ABILITY_SCORE_DEFAULT', type: 'number' },
        { key: 'ABILITY_SCORE_MIN', type: 'number' },
        { key: 'ABILITY_SCORE_MAX', type: 'number' },
        { key: 'MULTICLASS_THRESHOLD', type: 'number' },
        { key: 'DISABLE_MULTICLASS', type: 'boolean' }
      ]
    },
    {
      group: 'DND5E.HitPoints',
      settings: [
        { key: 'HP_L1_MAX_DIE', type: 'boolean' },
        { key: 'HP_REROLL_ONES', type: 'boolean' }
      ]
    }
  ],
  'wizard-flow': [
    {
      group: 'DND5E.Level',
      settings: [
        { key: 'STARTING_LEVEL', type: 'number' },
        { key: 'ALLOW_PLAYER_LEVEL_OVERRIDE', type: 'boolean' }
      ]
    },
    {
      group: 'DND5E.CurrencyGP',
      settings: [
        { key: 'BONUS_GOLD_FORMULA', type: 'string' },
        { key: 'REFUND_UNCHOSEN_GOLD', type: 'boolean' }
      ]
    },
    {
      group: 'HEROMANCER.Settings.SettingsPanel.Group.MagicItems',
      settings: [
        { key: 'SHOP_INCLUDE_MAGIC_ITEMS', type: 'boolean' },
        { key: 'SHOP_MAX_MAGIC_RARITY', type: 'select' }
      ]
    },
    {
      group: 'HEROMANCER.Settings.SettingsPanel.Group.Identity',
      settings: [
        { key: 'ADVANCEMENT_ORDER', type: 'advancementOrder' },
        { key: 'LOCK_IDENTITY_RULESET', type: 'boolean' }
      ]
    },
    {
      group: 'HEROMANCER.Settings.SettingsPanel.Group.CustomBackground',
      settings: [
        { key: 'DISABLE_CUSTOM_BACKGROUND', type: 'boolean' },
        { key: 'CUSTOM_BG_ABILITY_CHOICES', type: 'number' },
        { key: 'CUSTOM_BG_ABILITY_POINTS', type: 'number' },
        { key: 'CUSTOM_BG_ABILITY_CAP', type: 'number' },
        { key: 'CUSTOM_BG_SKILL_COUNT', type: 'number' },
        { key: 'CUSTOM_BG_TOOL_COUNT', type: 'number' },
        { key: 'CUSTOM_BG_FEAT_COUNT', type: 'number' },
        { key: 'CUSTOM_BG_BUDGET', type: 'number' }
      ]
    },
    {
      group: 'HEROMANCER.Settings.SettingsPanel.Group.Content',
      settings: [
        { key: 'ENABLE_RANDOMIZE', type: 'boolean' },
        { key: 'TRIM_SOURCE_PARENTHETICAL', type: 'boolean' },
        { key: 'CUSTOM_FOCUS_ITEMS', type: 'focusItems' }
      ]
    }
  ],
  enforcement: [
    {
      group: 'HEROMANCER.Settings.SettingsPanel.Group.RequiredFields',
      settings: [
        { key: 'ENFORCE_BIOGRAPHY', type: 'boolean' },
        { key: 'ENFORCE_ART', type: 'boolean' }
      ]
    },
    {
      group: 'HEROMANCER.Settings.SettingsPanel.Group.Approval',
      settings: [
        { key: 'REQUIRE_APPROVAL_FOR_PLAYERS', type: 'boolean' },
        { key: 'KEEP_APPROVAL_ARCHIVE', type: 'boolean' }
      ]
    }
  ],
  'player-experience': [
    {
      group: 'HEROMANCER.Settings.SettingsPanel.Group.Customization',
      settings: [
        { key: 'ENABLE_PLAYER_CUSTOMIZATION', type: 'boolean' },
        { key: 'ENABLE_TOKEN_CUSTOMIZATION', type: 'boolean' },
        { key: 'ENABLE_DICE_SO_NICE', type: 'boolean', requiresModule: 'dice-so-nice' }
      ]
    },
    {
      group: 'HEROMANCER.Settings.SettingsPanel.Group.Publishing',
      settings: [
        { key: 'PUBLISH_WEALTH_ROLLS', type: 'boolean' },
        { key: 'PUBLISH_HP_ROLLS', type: 'boolean' },
        { key: 'PUBLISH_CREATION_SUMMARY', type: 'select' },
        { key: 'PUBLISH_LEVEL_UP_BROADCAST', type: 'select' }
      ]
    }
  ],
  advanced: [
    {
      group: 'HEROMANCER.Settings.SettingsPanel.Group.Behavior',
      settings: [
        { key: 'HIDE_OTHER_CREATE_ACTOR_OPTIONS', type: 'boolean' },
        { key: 'SHOW_WELCOME', type: 'boolean' },
        { key: 'DISABLE_WELCOME_POPUP', type: 'boolean' }
      ]
    },
    {
      group: 'HEROMANCER.Settings.SettingsPanel.Group.Content',
      settings: [{ key: 'ART_PICKER_ROOT', type: 'filePicker' }]
    },
    {
      group: 'HEROMANCER.Settings.SettingsPanel.Group.Tools',
      settings: [
        { key: 'TROUBLESHOOTING_MENU', type: 'menu', icon: 'fa-bug', buttonLabelKey: 'HEROMANCER.Settings.Troubleshooter.Menu.Label' },
        { key: 'TOKENIZER_COMPATIBILITY', type: 'boolean', requiresModule: 'tokenizer-2' }
      ]
    }
  ],
  exclusions: [{ settings: [{ key: 'EXCLUSION_LIST', type: 'exclusions' }] }]
};

/**
 * Flatten a tab's catalogue (grouped or flat) into a plain ordered row list.
 * @param {string} tabId Tab id key into TAB_SETTINGS.
 * @returns {Array<object>} Setting rows.
 */
function tabRows(tabId) {
  return (TAB_SETTINGS[tabId] ?? []).flatMap((entry) => entry.settings ?? [entry]);
}

/** GM-only tabbed dashboard for Hero Mancer settings. */
export class SettingsPanel extends HMDialog {
  static DEFAULT_OPTIONS = {
    id: `${MODULE.ID}-settings-panel`,
    classes: ['hm-settings-panel'],
    tag: 'form',
    form: {
      handler: SettingsPanel.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    window: { title: 'HEROMANCER.Settings.SettingsPanel.Menu.Name', icon: 'fa-solid fa-cog' },
    position: { width: 720, height: 720 },
    actions: {
      resetTab: SettingsPanel.#onResetTab,
      reorderUp: SettingsPanel.#onReorderUp,
      reorderDown: SettingsPanel.#onReorderDown,
      pickFolder: SettingsPanel.#onPickFolder,
      pickFocusItem: SettingsPanel.#onPickFocusItem,
      removeFocusItem: SettingsPanel.#onRemoveFocusItem,
      addCostRow: SettingsPanel.#onAddCostRow,
      removeCostRow: SettingsPanel.#onRemoveCostRow,
      openMenu: SettingsPanel.#onOpenMenu,
      browseExclusion: SettingsPanel.#onBrowseExclusion
    }
  };

  static PARTS = {
    header: HMDialog.HEADER_PART,
    nav: { template: MODULE.TEMPLATES.MENUS.SETTINGS_PANEL.NAV },
    abilities: { template: MODULE.TEMPLATES.MENUS.SETTINGS_PANEL.ABILITIES, scrollable: [''] },
    'wizard-flow': { template: MODULE.TEMPLATES.MENUS.SETTINGS_PANEL.WIZARD_FLOW, scrollable: [''] },
    enforcement: { template: MODULE.TEMPLATES.MENUS.SETTINGS_PANEL.ENFORCEMENT, scrollable: [''] },
    'player-experience': { template: MODULE.TEMPLATES.MENUS.SETTINGS_PANEL.PLAYER_EXPERIENCE, scrollable: [''] },
    advanced: { template: MODULE.TEMPLATES.MENUS.SETTINGS_PANEL.ADVANCED, scrollable: [''] },
    exclusions: { template: MODULE.TEMPLATES.MENUS.SETTINGS_PANEL.EXCLUSIONS, scrollable: [''] },
    footer: { template: MODULE.TEMPLATES.MENUS.SETTINGS_PANEL.FOOTER }
  };

  static TABS = {
    primary: {
      tabs: [
        { id: 'abilities', icon: 'fa-solid fa-dice-d20' },
        { id: 'wizard-flow', icon: 'fa-solid fa-arrows-turn-to-dots' },
        { id: 'enforcement', icon: 'fa-solid fa-shield-halved' },
        { id: 'exclusions', icon: 'fa-solid fa-eye-slash' },
        { id: 'player-experience', icon: 'fa-solid fa-user-gear' },
        { id: 'advanced', icon: 'fa-solid fa-wrench' }
      ],
      initial: 'abilities',
      labelPrefix: 'HEROMANCER.Settings.SettingsPanel.Tabs'
    }
  };

  /** @inheritdoc */
  constructor(options = {}) {
    super(options);
    if (options.initialTab && TAB_SETTINGS[options.initialTab]) this.tabGroups.primary = options.initialTab;
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    for (const list of this.element.querySelectorAll('[data-reorder]')) {
      list.addEventListener('dragstart', SettingsPanel.#onReorderDragStart);
      list.addEventListener('dragover', SettingsPanel.#onReorderDragOver);
      list.addEventListener('drop', SettingsPanel.#onReorderDrop);
      list.addEventListener('dragend', SettingsPanel.#onReorderDragEnd);
    }
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const tabs = this._prepareTabs('primary');
    return {
      ...context,
      tabs,
      abilities: { groups: this.#buildSettingsContext('abilities') },
      wizardFlow: { groups: this.#buildSettingsContext('wizard-flow') },
      enforcement: { groups: this.#buildSettingsContext('enforcement') },
      playerExperience: { groups: this.#buildSettingsContext('player-experience') },
      advanced: { groups: this.#buildSettingsContext('advanced') },
      exclusions: { groups: this.#buildSettingsContext('exclusions') }
    };
  }

  /**
   * Build the grouped render context for a single tab. Flat tabs collapse to one unlabeled group.
   * @param {string} tabId Tab id key into TAB_SETTINGS.
   * @returns {Array<{label: ?string, settings: object[]}>} Renderer-ready setting groups.
   */
  #buildSettingsContext(tabId) {
    const entry = TAB_SETTINGS[tabId] ?? [];
    const groups = entry[0]?.settings ? entry : [{ settings: entry }];
    return groups.map((g) => ({
      label: g.group ?? null,
      settings: g.settings.filter((row) => !row.requiresModule || game.modules.get(row.requiresModule)?.active).map((row) => this.#buildFieldContext(row))
    }));
  }

  /**
   * Decorate a single TAB_SETTINGS row with current value + field metadata.
   * @param {{key: string, type: string}} row Row spec.
   * @returns {object} Field render context.
   */
  #buildFieldContext(row) {
    const settingKey = MODULE.SETTINGS[row.key];
    if (row.type === 'exclusions') {
      const exclusions = game.settings.get(MODULE.ID, settingKey) ?? {};
      return {
        key: settingKey,
        type: 'exclusions',
        rows: EXCLUSION_BUCKETS.map(({ bucket, labelId, icon }) => ({
          bucket,
          icon,
          label: _loc(`HEROMANCER.Settings.CompendiumExclusionList.Tabs.${labelId}`),
          countLabel: _loc('HEROMANCER.Settings.CompendiumExclusionList.HiddenCount', { count: (exclusions[bucket] ?? []).length })
        }))
      };
    }
    if (row.type === 'menu') {
      const menu = game.settings.menus.get(`${MODULE.ID}.${settingKey}`);
      return {
        key: settingKey,
        type: 'menu',
        name: row.nameKey ?? menu?.name ?? '',
        hint: row.hintKey ?? menu?.hint ?? null,
        icon: row.icon ?? menu?.icon ?? 'fa-gear',
        buttonLabel: row.buttonLabelKey ?? 'HEROMANCER.Settings.SettingsPanel.Menu.Label'
      };
    }
    const config = game.settings.settings.get(`${MODULE.ID}.${settingKey}`);
    const value = game.settings.get(MODULE.ID, settingKey);
    const ctx = { key: settingKey, name: row.nameKey ?? config?.name ?? '', hint: row.hintKey ?? config?.hint ?? null, type: row.type, value };
    const field = config?.type;
    if (row.type === 'number' && field) {
      ctx.min = field.min ?? null;
      ctx.max = field.max ?? null;
      ctx.step = field.step ?? 1;
    }
    if (row.type === 'select' && field?.choices) ctx.choices = Object.entries(field.choices).map(([v, label]) => ({ value: v, label, selected: String(v) === String(value) }));
    if (row.type === 'allowedMethods') {
      const v = value || {};
      ctx.methods = [
        { key: 'standardArray', label: 'HEROMANCER.Settings.SettingsPanel.AllowedMethods.StandardArray', checked: v.standardArray !== false },
        { key: 'pointBuy', label: 'HEROMANCER.Settings.SettingsPanel.AllowedMethods.PointBuy', checked: v.pointBuy !== false },
        { key: 'manualFormula', label: 'HEROMANCER.Settings.SettingsPanel.AllowedMethods.Manual', checked: v.manualFormula !== false },
        { key: 'manualEntry', label: 'HEROMANCER.Settings.SettingsPanel.AllowedMethods.ManualEntry', checked: v.manualEntry !== false }
      ];
    }
    if (row.type === 'allowedHpMethods') {
      const v = value || {};
      ctx.methods = [
        { key: 'average', label: 'HEROMANCER.Settings.HPMethod.Choices.average', checked: v.average !== false },
        { key: 'max', label: 'HEROMANCER.Settings.HPMethod.Choices.max', checked: v.max !== false },
        { key: 'manual', label: 'HEROMANCER.Settings.HPMethod.Choices.manual', checked: v.manual !== false }
      ];
    }
    if (row.type === 'advancementOrder') {
      const rows = Array.isArray(value) && value.length ? value : (config?.default ?? []);
      ctx.rows = [...rows].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((r) => ({ id: r.id, label: r.label }));
    }
    if (row.type === 'costMap') {
      ctx.rows = Object.entries(getPointBuyCostMap())
        .map(([score, cost]) => ({ score: Number(score), cost: Number(cost) }))
        .filter((r) => Number.isFinite(r.score) && Number.isFinite(r.cost))
        .sort((a, b) => a.score - b.score);
    }
    if (row.type === 'focusItems') {
      const stored = value && typeof value === 'object' ? value : {};
      ctx.focusTypes = Object.entries(CONFIG.DND5E?.focusTypes ?? {}).map(([typeKey, cfg]) => ({
        key: typeKey,
        label: _loc(cfg.label ?? typeKey),
        items: (Array.isArray(stored[typeKey]) ? stored[typeKey] : []).map((uuid) => {
          const doc = fromUuidSync(uuid);
          return { uuid, name: doc?.name ?? uuid, img: doc?.img ?? null, missing: !doc };
        })
      }));
    }
    return ctx;
  }

  /**
   * Move a reorder row up by one.
   * @param {Event} _event Click event.
   * @param {HTMLElement} target Button element.
   */
  static #onReorderUp(_event, target) {
    SettingsPanel.#swapReorderRow(target, -1);
  }

  /**
   * Move a reorder row down by one.
   * @param {Event} _event Click event.
   * @param {HTMLElement} target Button element.
   */
  static #onReorderDown(_event, target) {
    SettingsPanel.#swapReorderRow(target, 1);
  }

  /**
   * Mark the grabbed reorder row and prime the drag payload.
   * @param {DragEvent} event Dragstart event.
   */
  static #onReorderDragStart(event) {
    const row = event.target.closest('[data-row-id]');
    if (!row) return;
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', row.dataset.rowId);
  }

  /**
   * Highlight the row the grabbed item would drop onto.
   * @param {DragEvent} event Dragover event.
   */
  static #onReorderDragOver(event) {
    event.preventDefault();
    const list = event.currentTarget;
    const dragging = list.querySelector('.is-dragging');
    const target = event.target.closest('[data-row-id]');
    for (const row of list.querySelectorAll('.is-drag-over')) row.classList.remove('is-drag-over');
    if (dragging && target && target !== dragging) target.classList.add('is-drag-over');
  }

  /**
   * Move the grabbed row to the drop position and resync index names.
   * @param {DragEvent} event Drop event.
   */
  static #onReorderDrop(event) {
    event.preventDefault();
    const list = event.currentTarget;
    const dragging = list.querySelector('.is-dragging');
    const target = event.target.closest('[data-row-id]');
    if (!dragging || !target || target === dragging) return;
    const rows = Array.from(list.querySelectorAll('[data-row-id]'));
    const after = rows.indexOf(dragging) < rows.indexOf(target);
    list.insertBefore(dragging, after ? target.nextElementSibling : target);
    SettingsPanel.#reindexReorderRows(list);
  }

  /**
   * Clear drag-state classes once the gesture ends.
   * @param {DragEvent} event Dragend event.
   */
  static #onReorderDragEnd(event) {
    const list = event.currentTarget;
    list.querySelector('.is-dragging')?.classList.remove('is-dragging');
    for (const row of list.querySelectorAll('.is-drag-over')) row.classList.remove('is-drag-over');
  }

  /**
   * Swap a reorder row with its neighbor and resync hidden-input index names.
   * @param {HTMLElement} button Up/down button inside a row.
   * @param {number} delta -1 or +1.
   */
  static #swapReorderRow(button, delta) {
    const row = button.closest('[data-row-id]');
    const list = row?.parentElement;
    if (!row || !list) return;
    const target = delta < 0 ? row.previousElementSibling : row.nextElementSibling;
    if (!target) return;
    if (delta < 0) list.insertBefore(row, target);
    else list.insertBefore(target, row);
    SettingsPanel.#reindexReorderRows(list);
  }

  /**
   * Rewrite hidden-input `name` attrs to match new DOM order.
   * @param {HTMLElement} list `<ol data-reorder>` element.
   */
  static #reindexReorderRows(list) {
    const key = list.dataset.reorder;
    const items = list.querySelectorAll('[data-row-id]');
    items.forEach((li, i) => {
      const idInput = li.querySelector('input[type="hidden"][name$=".id"]');
      const labelInput = li.querySelector('input[type="hidden"][name$=".label"]');
      if (idInput) idInput.name = `${key}.${i}.id`;
      if (labelInput) labelInput.name = `${key}.${i}.label`;
    });
  }

  /**
   * Open dnd5e's CompendiumBrowser with current items pre-checked, then rebuild the focus-type list from the submitted selection.
   * @param {Event} event Click event.
   * @param {HTMLElement} target Button element with data-focus-type.
   */
  static async #onPickFocusItem(event, target) {
    event?.preventDefault();
    event?.stopPropagation();
    const focusType = target.dataset.focusType;
    if (!focusType) return;
    const details = target.closest('details');
    const list = details?.querySelector(`[data-focus-list="${focusType}"]`);
    if (!list) return;
    const existing = Array.from(list.querySelectorAll('[data-uuid]')).map((li) => li.dataset.uuid);
    const result = await SettingsPanel.#openFocusPicker(existing);
    if (!result) return;
    const rows = await Promise.all(
      Array.from(result).map(async (uuid) => {
        const doc = await fromUuid(uuid);
        return doc ? SettingsPanel.#buildFocusRow(uuid, doc) : null;
      })
    );
    list.replaceChildren(...rows.filter(Boolean));
    SettingsPanel.#syncFocusCount(details);
  }

  /**
   * Spawn dnd5e CompendiumBrowser locked to physical item types, pre-seeded with `existing` uuids checked. Resolves to the submitted Set or null on cancel.
   * @param {string[]} existing Uuids to pre-check.
   * @returns {Promise<?Set<string>>} Final selection set, or null if the browser closed without submit.
   */
  static async #openFocusPicker(existing) {
    const physicalTypes = new Set(Object.keys(Item.implementation.compendiumBrowserTypes().physical.children));
    const selection = await pickFromBrowser({ types: physicalTypes, preselected: existing, min: 1 });
    return selection?.size ? selection : null;
  }

  /**
   * Open the browser for an exclusion category, pre-checked with its current set, then write the returned uuids to the unified setting and refresh the row count.
   * @this {SettingsPanel}
   * @param {Event} _event Click event.
   * @param {HTMLElement} target Button element with `data-bucket`.
   * @returns {Promise<void>}
   */
  static async #onBrowseExclusion(_event, target) {
    const config = EXCLUSION_BUCKETS.find((entry) => entry.bucket === target.dataset.bucket);
    if (!config) return;
    const settingKey = MODULE.SETTINGS.EXCLUSION_LIST;
    const exclusions = game.settings.get(MODULE.ID, settingKey) ?? {};
    const selection = await pickFromBrowser({ types: config.types, additional: config.additional, preselected: exclusions[config.bucket] ?? [], max: Infinity, itemsTab: config.itemsTab });
    if (!selection) return;
    if (selection.size) exclusions[config.bucket] = [...selection];
    else delete exclusions[config.bucket];
    await game.settings.set(MODULE.ID, settingKey, exclusions);
    const badge = target.closest('.hm-sp-exclusion-row')?.querySelector('.hm-sp-exclusion-count');
    if (badge) badge.textContent = _loc('HEROMANCER.Settings.CompendiumExclusionList.HiddenCount', { count: selection.size });
  }

  /**
   * Render a focus-list row from the shared partial.
   * @param {string} uuid Item uuid.
   * @param {Item|object} doc Resolved item document.
   * @returns {HTMLLIElement} Row element ready to append to a focus list.
   */
  static #buildFocusRow(uuid, doc) {
    return SettingsPanel.#rowFromPartial(Handlebars.partials.hmSettingsPanelFocusRow({ uuid, name: doc.name ?? uuid, img: doc.img ?? '', missing: false }));
  }

  /**
   * Parse a rendered row partial into its root element.
   * @param {string} html Rendered partial markup.
   * @returns {HTMLElement} Root element of the parsed markup.
   */
  static #rowFromPartial(html) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  }

  /**
   * Remove a row from its focus-type list and update the count badge.
   * @param {Event} _event Click event.
   * @param {HTMLElement} target Trash button inside a row.
   */
  static #onRemoveFocusItem(_event, target) {
    const row = target.closest('.hm-sp-focus-row');
    const details = row?.closest('details');
    row?.remove();
    SettingsPanel.#syncFocusCount(details);
  }

  /**
   * Refresh the per-focus-type count badge from current DOM rows.
   * @param {?HTMLElement} details `<details>` element.
   */
  static #syncFocusCount(details) {
    if (!details) return;
    const list = details.querySelector('[data-focus-list]');
    const badge = details.querySelector('.hm-sp-focus-count');
    if (list && badge) badge.textContent = String(list.querySelectorAll('[data-uuid]').length);
  }

  /**
   * Append an empty score/cost row to the cost-map list and focus the new score input.
   * @param {Event} _event Click event.
   * @param {HTMLElement} target Add button inside the cost-map fieldset.
   */
  static #onAddCostRow(_event, target) {
    const fieldset = target.closest('[data-setting]');
    const list = fieldset?.querySelector('[data-cost-map-list]');
    if (!list) return;
    const row = SettingsPanel.#buildCostRow('', '', list.querySelectorAll('[data-cost-row]').length);
    list.appendChild(row);
    row.querySelector('input[name$=".score"]')?.focus();
  }

  /**
   * Remove a row from a cost-map list.
   * @param {Event} _event Click event.
   * @param {HTMLElement} target Trash button inside a row.
   */
  static #onRemoveCostRow(_event, target) {
    target.closest('[data-cost-row]')?.remove();
  }

  /**
   * Render a cost-map row from the shared partial.
   * @param {number|string} score Score key.
   * @param {number|string} cost Point cost.
   * @param {number} index Row index for the name attribute.
   * @returns {HTMLLIElement} Row element ready to append to a cost-map list.
   */
  static #buildCostRow(score, cost, index) {
    return SettingsPanel.#rowFromPartial(Handlebars.partials.hmSettingsPanelCostRow({ score, cost, index }));
  }

  /**
   * Open Foundry's FilePicker in folder mode and write the selection back to a target text input.
   * @param {Event} _event Click event.
   * @param {HTMLElement} target Button element with data-target = sibling input name.
   */
  static async #onPickFolder(_event, target) {
    const name = target.dataset.target;
    const input = target.closest('.hm-sp-filepicker')?.querySelector(`input[name="${name}"]`);
    if (!input) return;
    const picker = new foundry.applications.apps.FilePicker.implementation({
      type: 'folder',
      current: input.value || '/',
      callback: (path) => {
        input.value = path;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    picker.render(true);
  }

  /**
   * Open a registered sub-menu (e.g. Compendium Exclusion List) by setting key.
   * @param {Event} _event Click event.
   * @param {HTMLElement} target Button element with data-menu-key.
   */
  static #onOpenMenu(_event, target) {
    const settingKey = target.dataset.menuKey;
    const menu = game.settings.menus.get(`${MODULE.ID}.${settingKey}`);
    if (!menu?.type) return;
    const windowId = this.window.windowId;
    new menu.type().render({ force: true, ...(windowId && { window: { windowId } }) });
  }

  /** Reset every setting on the active tab to its registered default — in DOM only; user still must Save. */
  static #onResetTab() {
    const tabId = this.tabGroups.primary;
    const form = this.element;
    for (const row of tabRows(tabId)) {
      if (row.type === 'menu' || row.type === 'exclusions') continue;
      if (row.requiresModule && !game.modules.get(row.requiresModule)?.active) continue;
      const settingKey = MODULE.SETTINGS[row.key];
      const config = game.settings.settings.get(`${MODULE.ID}.${settingKey}`);
      const def = config?.type?.initial ?? config?.default ?? null;
      SettingsPanel.#writeFieldToDom(form, settingKey, row.type, def);
    }
  }

  /**
   * Write a value back into the DOM for a single field, mirroring field-type rendering.
   * @param {HTMLFormElement} form Form element.
   * @param {string} settingKey Setting key.
   * @param {string} type Field type.
   * @param {*} value Default value.
   */
  static #writeFieldToDom(form, settingKey, type, value) {
    if (type === 'boolean') {
      const input = form.querySelector(`input[type="checkbox"][name="${settingKey}"]`);
      if (input) input.checked = !!value;
    } else if (type === 'number' || type === 'string' || type === 'filePicker') {
      const input = form.querySelector(`input[name="${settingKey}"]`);
      if (input) input.value = value ?? '';
    } else if (type === 'select') {
      const select = form.querySelector(`select[name="${settingKey}"]`);
      if (select) select.value = value ?? '';
    } else if (type === 'allowedMethods') {
      const v = value || {};
      for (const m of ['standardArray', 'pointBuy', 'manualFormula', 'manualEntry']) {
        const input = form.querySelector(`input[name="allowedMethods.${m}"]`);
        if (input) input.checked = v[m] !== false;
      }
    } else if (type === 'allowedHpMethods') {
      const v = value || {};
      for (const m of ['average', 'max', 'manual']) {
        const input = form.querySelector(`input[name="allowedHpMethods.${m}"]`);
        if (input) input.checked = v[m] !== false;
      }
    } else if (type === 'advancementOrder') {
      const list = form.querySelector(`[data-reorder="${settingKey}"]`);
      if (!list || !Array.isArray(value)) return;
      const sorted = [...value].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const byId = new Map(Array.from(list.querySelectorAll('[data-row-id]')).map((li) => [li.dataset.rowId, li]));
      for (const entry of sorted) {
        const li = byId.get(entry.id);
        if (li) list.appendChild(li);
      }
      SettingsPanel.#reindexReorderRows(list);
    } else if (type === 'focusItems') {
      const fieldset = form.querySelector(`[data-setting="${settingKey}"]`);
      const lists = fieldset?.querySelectorAll('[data-focus-list]') ?? [];
      for (const list of lists) {
        list.replaceChildren();
        SettingsPanel.#syncFocusCount(list.closest('details'));
      }
    } else if (type === 'costMap') {
      const list = form.querySelector(`[data-cost-map-list="${settingKey}"]`);
      if (!list) return;
      const rows = Object.entries(getPointBuyCostMap())
        .map(([score, cost]) => ({ score: Number(score), cost: Number(cost) }))
        .filter((r) => Number.isFinite(r.score) && Number.isFinite(r.cost))
        .sort((a, b) => a.score - b.score);
      list.replaceChildren(...rows.map((r, i) => SettingsPanel.#buildCostRow(r.score, r.cost, i)));
    }
  }

  /**
   * Persist every setting on the form.
   * @param {SubmitEvent} _event Submit event.
   * @param {HTMLFormElement} form Form element.
   * @param {?object} formData Foundry FormDataExtended built from the form.
   * @returns {Promise<void>}
   */
  static async formHandler(_event, form, formData) {
    const raw = formData?.object ?? new foundry.applications.ux.FormDataExtended(form).object;
    const data = foundry.utils.expandObject(raw);
    const writes = [];
    for (const tabId of Object.keys(TAB_SETTINGS)) {
      for (const row of tabRows(tabId)) {
        if (row.type === 'menu' || row.type === 'exclusions') continue;
        if (row.requiresModule && !game.modules.get(row.requiresModule)?.active) continue;
        const settingKey = MODULE.SETTINGS[row.key];
        writes.push(SettingsPanel.#persistField(settingKey, row.type, data, form).catch((err) => ATLAS.log(1, `SettingsPanel: save failed for ${settingKey}:`, err)));
      }
    }
    await Promise.allSettled(writes);
    ui.notifications.info('HEROMANCER.Settings.SettingsPanel.Saved', { localize: true });
  }

  /**
   * Coerce a single field's raw form value and write to game.settings.
   * @param {string} settingKey Setting key.
   * @param {string} type Field type.
   * @param {object} data Form data object (FormDataExtended.object).
   * @param {HTMLFormElement} form Form element (for advancementOrder DOM read).
   * @returns {Promise<void>}
   */
  static async #persistField(settingKey, type, data, form) {
    let value = data[settingKey];
    if (type === 'boolean') {
      value = !!value;
    } else if (type === 'number') {
      if (value === undefined || value === '' || value === null) return;
      value = Number(value);
      if (!Number.isFinite(value)) return;
    } else if (type === 'allowedMethods') {
      const flat = data.allowedMethods || {};
      value = { standardArray: !!flat.standardArray, pointBuy: !!flat.pointBuy, manualFormula: !!flat.manualFormula, manualEntry: !!flat.manualEntry };
    } else if (type === 'allowedHpMethods') {
      const flat = data.allowedHpMethods || {};
      value = { average: !!flat.average, max: !!flat.max, manual: !!flat.manual };
    } else if (type === 'advancementOrder') {
      const list = form.querySelector(`[data-reorder="${settingKey}"]`);
      const items = list ? Array.from(list.querySelectorAll('[data-row-id]')) : [];
      value = items.map((li, i) => ({ id: li.dataset.rowId, label: li.querySelector('input[name$=".label"]')?.value ?? '', order: (i + 1) * 10, sortable: true }));
    } else if (type === 'focusItems') {
      const fieldset = form.querySelector(`[data-setting="${settingKey}"]`);
      const lists = fieldset?.querySelectorAll('[data-focus-list]') ?? [];
      value = {};
      for (const list of lists) {
        const uuids = Array.from(list.querySelectorAll('[data-uuid]'))
          .map((li) => li.dataset.uuid)
          .filter(Boolean);
        if (uuids.length) value[list.dataset.focusList] = uuids;
      }
    } else if (type === 'costMap') {
      const list = form.querySelector(`[data-cost-map-list="${settingKey}"]`);
      const rows = list ? Array.from(list.querySelectorAll('[data-cost-row]')) : [];
      value = {};
      for (const li of rows) {
        const score = Number(li.querySelector('input[name$=".score"]')?.value);
        const cost = Number(li.querySelector('input[name$=".cost"]')?.value);
        if (!Number.isFinite(score) || !Number.isFinite(cost)) continue;
        value[String(score)] = cost;
      }
    } else if (value === undefined) {
      return;
    }
    return game.settings.set(MODULE.ID, settingKey, value);
  }
}
