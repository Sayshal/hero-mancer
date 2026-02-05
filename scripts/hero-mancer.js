import { MODULE } from './constants.mjs';
import { migrateSettingKeys, registerSettings } from './settings.js';
import { API, CharacterApprovalService, DocumentService, EquipmentManager, HeroMancer, StatRoller } from './utils/index.js';
import { initializeLogger } from './utils/logger.mjs';

/**
 * Runtime state container for Hero Mancer.
 * @class
 */
export class HM {
  static COMPAT = {};
  static ABILITY_SCORES = {};
  static SELECTED = { class: { value: '', id: '', uuid: '' }, race: { value: '', id: '', uuid: '' }, background: { value: '', id: '', uuid: '' } };
  static API = API;

  /**
   * Shows a confirmation dialog for reloading the world/application
   * @static
   * @async
   * @param {object} [options] - Configuration options
   * @param {boolean} [options.world] - Whether to reload the entire world (true) or just the client (false)
   * @returns {Promise<void>} - Resolves after the reload is triggered or canceled
   * @throws {Error} - If the dialog cannot be displayed
   */
  static async reloadConfirm({ world = false } = {}) {
    const reload = await foundry.applications.api.DialogV2.confirm({
      id: 'reload-world-confirm',
      modal: true,
      rejectClose: false,
      window: { title: 'SETTINGS.ReloadPromptTitle' },
      position: { width: 400 },
      content: `<p>${game.i18n.localize('SETTINGS.ReloadPromptBody')}</p>`
    });
    if (!reload) return;
    if (world && game.user.can('SETTINGS_MODIFY')) game.socket.emit('reload');
    foundry.utils.debouncedReload();
  }
}

Hooks.on('init', async () => {
  registerSettings();
  initializeLogger();
  HM.ABILITY_SCORES = {
    DEFAULT: game.settings.get(MODULE.ID, 'abilityScoreDefault') || 8,
    MIN: game.settings.get(MODULE.ID, 'abilityScoreMin') || 8,
    MAX: game.settings.get(MODULE.ID, 'abilityScoreMax') || 15
  };
  await foundry.applications.handlebars.loadTemplates([
    'modules/hero-mancer/templates/tabs/selection.hbs',
    'modules/hero-mancer/templates/equipment/equipment-container.hbs',
    'modules/hero-mancer/templates/equipment/equipment-choice.hbs',
    'modules/hero-mancer/templates/equipment/equipment-entry.hbs',
    'modules/hero-mancer/templates/equipment/equipment-inline.hbs',
    'modules/hero-mancer/templates/equipment/equipment-summary.hbs'
  ]);
});

Hooks.once('ready', async () => {
  if (!game.settings.get(MODULE.ID, 'enable')) return;
  await migrateSettingKeys();
  HM.COMPAT = {};
  if (game.modules.get('elkan5e')?.active && game.settings.get(MODULE.ID, 'elkanCompatibility')) HM.COMPAT.ELKAN = true;
  if (game.modules.get('chris-premades')?.active) HM.COMPAT.CPR = true;
  if (game.modules.get('vtta-tokenizer')?.active) HM.COMPAT.TOKENIZER = true;
  CharacterApprovalService.registerSocketListeners();
  await DocumentService.loadAndInitializeDocuments();
  if (!HM.COMPAT.ELKAN) await EquipmentManager.initializeLookup();
  const customArraySetting = game.settings.get(MODULE.ID, 'customStandardArray') || StatRoller.getStandardArrayDefault();
  if (!customArraySetting || customArraySetting.trim() === '') {
    game.settings.set(MODULE.ID, 'customStandardArray', StatRoller.getStandardArrayDefault());
  }
  globalThis.heroMancer = HM.API;
  Hooks.callAll('heroMancer.Ready', this);
});

Hooks.on('renderActorDirectory', (_app, html) => {
  if (!game.settings.get(MODULE.ID, 'enable')) return;
  if (html.querySelector('.hm-actortab-button')) return;
  const headerActions = html.querySelector('.header-actions');
  if (!headerActions) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.classList.add('hm-actortab-button');
  button.setAttribute('data-tooltip', game.i18n.localize('hm.actortab-button.hint'));
  const compact = game.settings.get(MODULE.ID, 'compactButton');
  if (compact) button.innerHTML = `<i class="fa-solid fa-egg"></i>`;
  else {
    button.innerHTML = `<i class="fa-solid fa-egg"></i> ${game.i18n.localize('hm.actortab-button.name')}`;
    button.style.flexBasis = '100%';
  }
  button.addEventListener('click', () => {
    if (HM.heroMancer) {
      HM.heroMancer.close();
      HM.heroMancer = null;
    }
    HM.heroMancer = new HeroMancer();
    HM.heroMancer.render(true);
  });
  headerActions.appendChild(button);
});
