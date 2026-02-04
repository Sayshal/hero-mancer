import { MODULE } from '../utils/index.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Troubleshooter settings application. */
export class Troubleshooter extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'hero-mancer-troubleshooter',
    classes: ['hm-troubleshooter'],
    position: { width: 750, height: 'auto' },
    window: { icon: 'fa-solid fa-bug', resizable: false },
    tag: 'div',
    actions: {
      exportReport: Troubleshooter._onExportReport,
      copyToClipboard: Troubleshooter._onCopyToClipboard,
      openDiscord: Troubleshooter._onOpenDiscord,
      openGithub: Troubleshooter._onOpenGithub
    }
  };

  /** @override */
  static PARTS = { main: { template: 'modules/hero-mancer/templates/settings/troubleshooter.hbs', classes: ['hm-troubleshooter-content'] } };

  /** @override */
  get title() {
    return `${MODULE.NAME} | ${game.i18n.localize('hm.settings.troubleshooter.title')}`;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return { ...context, output: Troubleshooter.generateTextReport() };
  }

  /**
   * Generates a text-based troubleshooting report
   * @returns {string} The formatted troubleshooting report
   * @static
   */
  static generateTextReport() {
    const reportLines = [];
    const addLine = (text) => reportLines.push(text);
    const addHeader = (text) => {
      addLine('');
      addLine(`/////////////// ${text} ///////////////`);
      addLine('');
    };
    this._addGameInformation(addLine, addHeader);
    this._addModuleInformation(addLine, addHeader);
    this._addHeroMancerSettings(addLine, addHeader);
    this._addCompendiumConfiguration(addLine, addHeader);
    this._addMancerFormData(addLine, addHeader);
    return reportLines.join('\n');
  }

  /**
   * Exports the troubleshooting report to a text file
   * @returns {string} The filename of the exported report
   * @static
   */
  static exportTextReport() {
    const output = this.generateTextReport();
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `hero-mancer-troubleshooter-${timestamp}.txt`;
    const blob = new Blob([output], { type: 'text/plain' });
    foundry.utils.saveDataToFile(blob, 'text/plain', filename);
    return filename;
  }

  /**
   * Handles the export report button click
   * @param {Event} event - The triggering event
   * @static
   */
  static _onExportReport(event) {
    event.preventDefault();
    const filename = Troubleshooter.exportTextReport();
    ui.notifications.info(game.i18n.format('hm.settings.troubleshooter.export-success', { filename }));
  }

  /**
   * Handles the copy to clipboard button click
   * @param {Event} event - The triggering event
   * @static
   */
  static _onCopyToClipboard(event) {
    event.preventDefault();
    const text = Troubleshooter.generateTextReport();
    navigator.clipboard
      .writeText(text)
      .then(() => ui.notifications.info('hm.settings.troubleshooter.copy-success', { localize: true }))
      .catch(() => ui.notifications.error('hm.settings.troubleshooter.copy-error', { localize: true }));
  }

  /**
   * Handles the open Discord button click
   * @param {Event} event - The triggering event
   * @static
   */
  static _onOpenDiscord(event) {
    event.preventDefault();
    window.open('https://discord.gg/7HSEEyjMR4');
  }

  /**
   * Handles the open GitHub button click
   * @param {Event} event - The triggering event
   * @static
   */
  static _onOpenGithub(event) {
    event.preventDefault();
    window.open('https://github.com/Sayshal/hero-mancer/issues');
  }

  /**
   * Adds game information to the report
   * @param {Function} addLine - Function to add a line to the report
   * @param {Function} addHeader - Function to add a section header
   * @static
   * @private
   */
  static _addGameInformation(addLine, addHeader) {
    addHeader('Game Information');
    addLine(`Foundry: ${game.version}`);
    addLine(`System: ${game.system.id} v${game.system.version}`);
    addLine(`Language: ${game.settings.get('core', 'language')}`);
    addLine(`Hero Mancer Version: ${game.modules.get(MODULE.ID)?.version || 'unknown'}`);
  }

  /**
   * Adds module information to the report
   * @param {Function} addLine - Function to add a line to the report
   * @param {Function} addHeader - Function to add a section header
   * @static
   * @private
   */
  static _addModuleInformation(addLine, addHeader) {
    addHeader('Active Modules');
    const enabledModules = this.getEnabledModules()
      .map((module) => `${module.title}: ${module.version}`)
      .sort();
    if (enabledModules.length) enabledModules.forEach((text) => addLine(text));
    else addLine('No active modules found');
  }

  /**
   * Adds Hero Mancer settings to the report
   * @param {Function} addLine - Function to add a line to the report
   * @param {Function} addHeader - Function to add a section header
   * @static
   * @private
   */
  static _addHeroMancerSettings(addLine, addHeader) {
    addHeader('Hero Mancer Settings');
    const settings = this.collectSettings();
    if (Object.keys(settings).length) {
      for (const [key, value] of Object.entries(settings)) {
        const valueDisplay = typeof value === 'object' ? JSON.stringify(value) : value;
        addLine(`${key}: ${valueDisplay}`);
      }
    } else {
      addLine('No settings found');
    }
  }

  /**
   * Adds compendium configuration to the report
   * @param {Function} addLine - Function to add a line to the report
   * @param {Function} addHeader - Function to add a section header
   * @static
   * @private
   */
  static _addCompendiumConfiguration(addLine, addHeader) {
    addHeader('Compendium Configuration');
    const compendiums = this.getCompendiumInfo();
    for (const [type, packs] of Object.entries(compendiums)) {
      const typeName = type.charAt(0).toUpperCase() + type.slice(1);
      if (packs.length) {
        addLine(`${typeName} Packs:`);
        packs.forEach((pack) => {
          addLine(pack.error ? ` - [Missing Pack] ${pack.id}` : ` - ${pack.name} (${pack.id})`);
        });
      } else {
        addLine(`${typeName} Packs: None configured`);
      }
    }
  }

  /**
   * Adds Mancer form data to the report
   * @param {Function} addLine - Function to add a line to the report
   * @param {Function} addHeader - Function to add a section header
   * @static
   * @private
   */
  static _addMancerFormData(addLine, addHeader) {
    const mancerData = this.collectMancerFormData();
    if (!mancerData || !Object.keys(mancerData).length) return;
    addHeader('Hero Mancer Form Data');
    const formatMancerData = (data, prefix = '') => {
      for (const [key, value] of Object.entries(data)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        if (typeof value === 'object' && value !== null) {
          formatMancerData(value, fullKey);
        } else {
          let valueDisplay = String(value);
          if (valueDisplay.length > 100) valueDisplay = `${valueDisplay.substring(0, 97)}...`;
          addLine(`${fullKey}: ${valueDisplay}`);
        }
      }
    };
    formatMancerData(mancerData);
  }

  /**
   * Gets a list of all enabled modules
   * @returns {Array<object>} Array of enabled module data
   * @static
   */
  static getEnabledModules() {
    const enabledModules = [];
    game.modules.forEach((module, id) => {
      if (module.active) enabledModules.push({ id, title: module.title, version: module.version });
    });
    return enabledModules;
  }

  /**
   * Collects all Hero Mancer settings
   * @returns {object} Object containing all settings
   * @static
   */
  static collectSettings() {
    const settings = {};
    for (const [, setting] of game.settings.settings.entries()) if (setting.namespace === MODULE.ID) settings[setting.key] = game.settings.get(MODULE.ID, setting.key);
    return settings;
  }

  /**
   * Collects form data from an active Hero Mancer application
   * @returns {object|null} Object containing form data or null if app not found
   * @static
   */
  static collectMancerFormData() {
    const mancerApp = document.getElementById('hero-mancer-app');
    if (!mancerApp) return null;
    const formElements = mancerApp.querySelectorAll('[name]');
    if (!formElements.length) return null;
    const formData = {};
    const processName = (name, value) => {
      const match = name.match(/^([^[]+)\[([^\]]+)]$/);
      if (match) {
        const [, arrayName, key] = match;
        if (!formData[arrayName]) formData[arrayName] = {};
        formData[arrayName][key] = value;
      } else {
        formData[name] = value;
      }
    };
    formElements.forEach((element) => {
      const name = element.getAttribute('name');
      if (!name) return;
      let value;
      if (element.type === 'checkbox') {
        value = element.checked;
      } else if (element.type === 'radio') {
        if (!element.checked) return;
        value = element.value;
      } else if (element.tagName === 'SELECT') {
        value = element.value;
        const selectedOption = element.options[element.selectedIndex];
        if (selectedOption?.text) value = `${value} (${selectedOption.text})`;
      } else if (element.tagName === 'PROSE-MIRROR') {
        const content = element.querySelector('.editor-content');
        value = content ? content.textContent : '[Complex Content]';
      } else {
        value = element.value;
      }
      processName(name, value);
    });
    return formData;
  }

  /**
   * Gets information about configured compendium packs
   * @returns {object} Object containing compendium configuration
   * @static
   */
  static getCompendiumInfo() {
    const compendiums = {};
    for (const type of ['class', 'race', 'background', 'item']) {
      const packs = game.settings.get(MODULE.ID, `${type}Packs`) || [];
      compendiums[type] = packs.map((packId) => {
        const pack = game.packs.get(packId);
        return pack ? { id: packId, name: pack.metadata.label, system: pack.metadata.system, packageName: pack.metadata.packageName } : { id: packId, error: 'Pack not found' };
      });
    }
    return compendiums;
  }
}
