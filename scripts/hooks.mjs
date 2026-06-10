import { HeroMancerAPI } from './api.mjs';
import { MODULE } from './constants.mjs';
import { clearCaches } from './data/document-loader.mjs';
import { clearShopIndex } from './domain/equipment-shop.mjs';
import { clearFeatIndex } from './domain/feat-browser.mjs';

/** Settings that should not trigger a wizard re-render when they change. */
const RERENDER_SKIP = new Set([`${MODULE.ID}.${MODULE.SETTINGS.WIZARD_POSITION}`]);

/**
 * Wire every non-lifecycle Hero Mancer hook subscription. Called from the module `init` hook.
 * @returns {void}
 */
export function registerHooks() {
  Hooks.on('clientSettingChanged', (key) => onSettingChanged(key));
  Hooks.on('createSetting', (setting) => onSettingChanged(setting?.key));
  Hooks.on('updateSetting', (setting) => onSettingChanged(setting?.key));
  Hooks.on('renderActorDirectory', (_app, element) => injectSidebarButton(element));
  Hooks.on('renderApplicationV2', (app, element) => {
    const expected = _loc('DOCUMENT.Create', { type: _loc('DOCUMENT.Actor') });
    if (app.title !== expected) return;
    injectCreateActorButton(element);
  });
  Hooks.on('updateUser', (user, changes) => {
    if (user.id === game.user.id && 'character' in changes) refreshLaunchGlow();
  });
}

/**
 * Route a changed setting key to the matching wizard-refresh handler.
 * @param {?string} key Namespaced setting key.
 */
function onSettingChanged(key) {
  if (key === 'dnd5e.packSourceConfiguration') {
    onSourceConfigChange();
    return;
  }
  onHMSettingChange(key);
}

/**
 * Re-render open wizards when a Hero Mancer setting changes.
 * @param {?string} key Namespaced setting key (`hero-mancer.<key>`).
 */
function onHMSettingChange(key) {
  if (!key?.startsWith(`${MODULE.ID}.`)) return;
  if (RERENDER_SKIP.has(key)) return;
  rerenderOpenHMApps(key);
}

/** Drop every compendium index and refresh the open wizard when dnd5e pack sources change. */
function onSourceConfigChange() {
  clearCaches();
  clearShopIndex();
  clearFeatIndex();
  foundry.applications.instances.get(`${MODULE.ID}-wizard`)?.refreshForSourceChange();
}

/**
 * Inject the Hero Mancer launch button into the Actor Directory header.
 * @param {HTMLElement} element Actor Directory root.
 * @returns {void}
 */
function injectSidebarButton(element) {
  const root = element?.tagName ? element : element?.[0];
  if (!root) return;
  if (root.querySelector('[data-hm-launch]')) {
    refreshLaunchGlow();
    return;
  }
  const headerActions = root.querySelector('header.directory-header .header-actions');
  const header = root.querySelector('header.directory-header');
  if (!headerActions && !header) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.hmLaunch = '';
  btn.classList.add('hm-launch-button');
  btn.classList.toggle('is-glowing', !game.user.character);
  btn.setAttribute('data-tooltip', '');
  btn.setAttribute('aria-label', _loc('HEROMANCER.App.Launch.ShortLabel'));
  btn.innerHTML = '<i class="fa-solid fa-egg" aria-hidden="true"></i>';
  btn.addEventListener('click', () => HeroMancerAPI.openWizard());
  if (headerActions) headerActions.prepend(btn);
  else header.appendChild(btn);
}

/** Pulse the launch egg only while the user has no assigned character; calm it once one is assigned. */
function refreshLaunchGlow() {
  for (const btn of document.querySelectorAll('[data-hm-launch].hm-launch-button')) btn.classList.toggle('is-glowing', !game.user.character);
}

/**
 * Inject a Hero Mancer button into the native Create-Actor DialogV2.
 * @param {HTMLElement} element Dialog root.
 * @returns {void}
 */
function injectCreateActorButton(element) {
  const root = element?.tagName ? element : element?.[0];
  if (!root || root.querySelector('[data-hm-launch]')) return;
  const list = root.querySelector('ol.unlist.card');
  if (!list) return;
  const replaceMode = !game.user.isGM && game.settings.get(MODULE.ID, MODULE.SETTINGS.HIDE_OTHER_CREATE_ACTOR_OPTIONS);
  const charLi = list.querySelector('li:has(input[value="character"])');
  const li = document.createElement('li');
  li.dataset.hmLaunch = '';
  if (!game.user.isGM) li.classList.add('hm-launch-feature');
  li.innerHTML = Handlebars.partials.hmCreateActorLaunchOption({});
  if (replaceMode && charLi) {
    charLi.replaceWith(li);
    for (const item of list.querySelectorAll('li:not([data-hm-launch])')) item.hidden = true;
  } else {
    list.appendChild(li);
  }
  const form = root.querySelector('form');
  form?.addEventListener(
    'submit',
    (e) => {
      const sel = form.querySelector('input[name="type"]:checked');
      if (sel?.value !== 'hm-launch') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const initialName = form.querySelector('input[name="name"]')?.value?.trim() || '';
      HeroMancerAPI.openWizard({ initialName });
      root.closest('dialog')?.close?.();
    },
    { capture: true }
  );
}

/**
 * Re-render the tabs a changed setting affects in any open wizard.
 * @param {string} key Namespaced setting key (`hero-mancer.<key>`).
 */
function rerenderOpenHMApps(key) {
  for (const [id, app] of foundry.applications.instances) if (id.startsWith(MODULE.ID) && typeof app.rerenderForSetting === 'function') app.rerenderForSetting(key);
}

/**
 * Register every component template as a Handlebars partial.
 * @returns {Promise<Function[]>} Resolves with the loaded template delegates.
 */
export function registerComponentPartials() {
  return foundry.applications.handlebars.loadTemplates({
    hmCombobox: MODULE.TEMPLATES.COMPONENTS.COMBOBOX,
    hmComboboxOption: MODULE.TEMPLATES.COMPONENTS.COMBOBOX_OPTION,
    hmEquipmentTile: MODULE.TEMPLATES.COMPONENTS.EQUIPMENT_TILE,
    hmEquipmentDetailPanel: MODULE.TEMPLATES.COMPONENTS.EQUIPMENT_DETAIL_PANEL,
    hmEquipmentDetailList: MODULE.TEMPLATES.COMPONENTS.EQUIPMENT_DETAIL_LIST,
    hmEquipmentBundleTooltip: MODULE.TEMPLATES.COMPONENTS.EQUIPMENT_BUNDLE_TOOLTIP,
    hmEquipmentShop: MODULE.TEMPLATES.COMPONENTS.EQUIPMENT_SHOP,
    hmFeatBrowser: MODULE.TEMPLATES.COMPONENTS.FEAT_BROWSER,
    hmFeatTile: MODULE.TEMPLATES.COMPONENTS.FEAT_TILE,
    hmEquipmentAccordion: MODULE.TEMPLATES.COMPONENTS.EQUIPMENT_ACCORDION,
    hmAbilityBlock: MODULE.TEMPLATES.COMPONENTS.ABILITY_BLOCK,
    hmProgressBar: MODULE.TEMPLATES.COMPONENTS.PROGRESS_BAR,
    hmMulticlassImpactPanel: MODULE.TEMPLATES.COMPONENTS.MULTICLASS_IMPACT_PANEL,
    hmReviewEquipment: MODULE.TEMPLATES.REVIEW.EQUIPMENT,
    hmSettingsPanelField: MODULE.TEMPLATES.MENUS.SETTINGS_PANEL.FIELD,
    hmSettingsPanelFocusRow: MODULE.TEMPLATES.MENUS.SETTINGS_PANEL.FOCUS_ROW,
    hmSettingsPanelCostRow: MODULE.TEMPLATES.MENUS.SETTINGS_PANEL.COST_ROW,
    hmJournalEmbedStatus: MODULE.TEMPLATES.COMPONENTS.JOURNAL_EMBED_STATUS,
    hmWizardSplash: MODULE.TEMPLATES.COMPONENTS.WIZARD_SPLASH,
    hmCreateActorLaunchOption: MODULE.TEMPLATES.COMPONENTS.CREATE_ACTOR_LAUNCH_OPTION
  });
}
