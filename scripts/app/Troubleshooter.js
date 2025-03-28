import { HM } from '../utils/index.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class Troubleshooter extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'hero-mancer-troubleshooter',
    classes: ['hm-troubleshooter'],
    position: {
      width: 750,
      height: 'auto'
    },
    window: {
      icon: 'fa-solid fa-bug',
      resizable: false
    },
    tag: 'div',
    actions: {
      exportReport: Troubleshooter._onExportReport,
      copyToClipboard: Troubleshooter._onCopyToClipboard,
      openDiscord: Troubleshooter._onOpenDiscord,
      openGithub: Troubleshooter._onOpenGithub
    }
  };

  /** @override */
  static PARTS = {
    main: {
      template: 'modules/hero-mancer/templates/settings/troubleshooter.hbs',
      classes: ['hm-troubleshooter-content']
    }
  };

  /* -------------------------------------------- */
  /*  Getters                                     */
  /* -------------------------------------------- */

  get title() {
    return `${HM.NAME} | ${game.i18n.localize('hm.settings.troubleshooter.title')}`;
  }

  /* -------------------------------------------- */
  /*  Instance Methods                            */
  /* -------------------------------------------- */

  /**
   * Prepares context data for the troubleshooter application
   * @param {object} _options - Application render options
   * @returns {object} Context data for template rendering
   * @protected
   * @override
   */
  _prepareContext(_options) {
    try {
      return {
        output: Troubleshooter.generateTextReport()
      };
    } catch (error) {
      HM.log(1, `Error preparing troubleshooter context: ${error.message}`);
      ui.notifications.error('hm.settings.troubleshooter.error-context', { localize: true });
      return { output: game.i18n.localize('hm.settings.troubleshooter.error-report') };
    }
  }

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Generates a text-based troubleshooting report
   * @returns {string} The formatted troubleshooting report
   * @static
   */
  static generateTextReport() {
    try {
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
      this._addLogData(addLine, addHeader);

      return reportLines.join('\n');
    } catch (error) {
      HM.log(1, `Error generating text report: ${error.message}`);
      throw error;
    }
  }

  /**
   * Exports the troubleshooting report to a text file
   * @returns {string} The filename of the exported report
   * @static
   */
  static exportTextReport() {
    try {
      const output = this.generateTextReport();
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const filename = `hero-mancer-troubleshooter-${timestamp}.txt`;

      const blob = new Blob([output], { type: 'text/plain' });
      saveDataToFile(blob, { type: 'text/plain' }, filename);
      return filename;
    } catch (error) {
      HM.log(1, `Error exporting text report: ${error.message}`);
      ui.notifications.error('hm.settings.troubleshooter.export-error', { localize: true });
      throw error;
    }
  }

  /**
   * Handles the export report button click
   * @param {Event} event - The triggering event
   * @static
   */
  static _onExportReport(event) {
    try {
      event.preventDefault();
      Troubleshooter.exportTextReport()
        .then((filename) => {
          ui.notifications.info(game.i18n.format('hm.settings.troubleshooter.export-success', { filename }));
        })
        .catch((error) => {
          HM.log(1, `Error in export report handler: ${error.message}`);
        });
    } catch (error) {
      HM.log(1, `Error handling export report event: ${error.message}`);
    }
  }

  /**
   * Handles the copy to clipboard button click
   * @param {Event} event - The triggering event
   * @static
   */
  static _onCopyToClipboard(event) {
    try {
      event.preventDefault();
      Troubleshooter.generateTextReport()
        .then((text) => {
          navigator.clipboard
            .writeText(text)
            .then(() => {
              ui.notifications.info(game.i18n.localize('hm.settings.troubleshooter.copy-success'));
            })
            .catch((error) => {
              HM.log(1, `Error copying to clipboard: ${error.message}`);
              ui.notifications.error('hm.settings.troubleshooter.copy-error', { localize: true });
            });
        })
        .catch((error) => {
          HM.log(1, `Error generating report for clipboard: ${error.message}`);
        });
    } catch (error) {
      HM.log(1, `Error handling copy to clipboard event: ${error.message}`);
    }
  }

  /**
   * Handles the open Discord button click
   * @param {Event} event - The triggering event
   * @static
   */
  static _onOpenDiscord(event) {
    try {
      event.preventDefault();
      window.open('https://discord.gg/7HSEEyjMR4');
    } catch (error) {
      HM.log(1, `Error opening Discord link: ${error.message}`);
      ui.notifications.error('hm.settings.troubleshooter.link-error', { localize: true });
    }
  }

  /**
   * Handles the open GitHub button click
   * @param {Event} event - The triggering event
   * @static
   */
  static _onOpenGithub(event) {
    try {
      event.preventDefault();
      window.open('https://github.com/Sayshal/hero-mancer/issues');
    } catch (error) {
      HM.log(1, `Error opening GitHub link: ${error.message}`);
      ui.notifications.error('hm.settings.troubleshooter.link-error', { localize: true });
    }
  }

  /* -------------------------------------------- */
  /*  Report Section Generators                   */
  /* -------------------------------------------- */

  /**
   * Adds game information to the report
   * @param {Function} addLine - Function to add a line to the report
   * @param {Function} addHeader - Function to add a section header
   * @returns {void}
   * @static
   * @private
   */
  static _addGameInformation(addLine, addHeader) {
    try {
      addHeader('Game Information');
      addLine(`Foundry: ${game.version}`);
      addLine(`System: ${game.system.id} v${game.system.version}`);
      addLine(`Language: ${game.settings.get('core', 'language')}`);
      addLine(`Hero Mancer Version: ${game.modules.get(HM.ID)?.version || 'unknown'}`);
    } catch (error) {
      HM.log(1, `Error adding game information: ${error.message}`);
      addLine('[Error retrieving game information]');
    }
  }

  /**
   * Adds module information to the report
   * @param {Function} addLine - Function to add a line to the report
   * @param {Function} addHeader - Function to add a section header
   * @returns {void}
   * @static
   * @private
   */
  static _addModuleInformation(addLine, addHeader) {
    try {
      addHeader('Active Modules');
      const enabledModules = this.getEnabledModules()
        .map((module) => `${module.title}: ${module.version}`)
        .sort();

      if (enabledModules.length) {
        enabledModules.forEach((text) => addLine(text));
      } else {
        addLine('No active modules found');
      }
    } catch (error) {
      HM.log(1, `Error adding module information: ${error.message}`);
      addLine('[Error retrieving module information]');
    }
  }

  /**
   * Adds Hero Mancer settings to the report
   * @param {Function} addLine - Function to add a line to the report
   * @param {Function} addHeader - Function to add a section header
   * @returns {void}
   * @static
   * @private
   */
  static _addHeroMancerSettings(addLine, addHeader) {
    try {
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
    } catch (error) {
      HM.log(1, `Error adding Hero Mancer settings: ${error.message}`);
      addLine('[Error retrieving Hero Mancer settings]');
    }
  }

  /**
   * Adds compendium configuration to the report
   * @param {Function} addLine - Function to add a line to the report
   * @param {Function} addHeader - Function to add a section header
   * @returns {void}
   * @static
   * @private
   */
  static _addCompendiumConfiguration(addLine, addHeader) {
    try {
      addHeader('Compendium Configuration');
      const compendiums = this.getCompendiumInfo();

      for (const [type, packs] of Object.entries(compendiums)) {
        const typeName = type.charAt(0).toUpperCase() + type.slice(1);

        if (packs.length) {
          addLine(`${typeName} Packs:`);
          packs.forEach((pack) => {
            if (!pack.error) {
              addLine(` - ${pack.name} (${pack.id})`);
            } else {
              addLine(` - [Missing Pack] ${pack.id}`);
            }
          });
        } else {
          addLine(`${typeName} Packs: None configured`);
        }
      }
    } catch (error) {
      HM.log(1, `Error adding compendium configuration: ${error.message}`);
      addLine('[Error retrieving compendium configuration]');
    }
  }

  /**
   * Adds Mancer form data to the report
   * @param {Function} addLine - Function to add a line to the report
   * @param {Function} addHeader - Function to add a section header
   * @returns {void}
   * @static
   * @private
   */
  static _addMancerFormData(addLine, addHeader) {
    try {
      const mancerData = this.collectMancerFormData();
      if (mancerData && Object.keys(mancerData).length) {
        addHeader('Hero Mancer Form Data');

        const formatMancerData = (data, prefix = '') => {
          for (const [key, value] of Object.entries(data)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;

            if (typeof value === 'object' && value !== null) {
              formatMancerData(value, fullKey);
            } else {
              let valueDisplay = String(value);
              if (valueDisplay.length > 100) {
                valueDisplay = `${valueDisplay.substring(0, 97)}...`;
              }
              addLine(`${fullKey}: ${valueDisplay}`);
            }
          }
        };

        formatMancerData(mancerData);
      }
    } catch (error) {
      HM.log(1, `Error adding Mancer form data: ${error.message}`);
      addLine('[Error retrieving Mancer form data]');
    }
  }

  /**
   * Adds log data to the report
   * @param {Function} addLine - Function to add a line to the report
   * @param {Function} addHeader - Function to add a section header
   * @returns {void}
   * @static
   * @private
   */
  static _addLogData(addLine, addHeader) {
    try {
      const logData = window.console_logs || [];
      if (logData.length) {
        addHeader('Log Data');

        const logInfo = this.getLogLevelInfo();
        addLine(`Log Level: ${logInfo.level} (${logInfo.name})`);
        addLine('Recent logs:');

        const processedLogs = this.processLogs(logData);
        processedLogs.forEach((log) => {
          addLine(`${log.timestamp} [${log.type.toUpperCase()}] ${log.content}`);
        });
      }
    } catch (error) {
      HM.log(1, `Error adding log data: ${error.message}`);
      addLine('[Error retrieving log data]');
    }
  }

  /* -------------------------------------------- */
  /*  Static Utility Methods                      */
  /* -------------------------------------------- */

  /**
   * Gets information about the current log level
   * @returns {object} Object containing log level and name
   * @static
   */
  static getLogLevelInfo() {
    try {
      const level = HM.LOG_LEVEL;
      const name =
        level === 0 ? 'Disabled'
        : level === 1 ? 'Errors'
        : level === 2 ? 'Warnings'
        : 'Verbose';
      return { level, name };
    } catch (error) {
      HM.log(1, `Error getting log level info: ${error.message}`);
      return { level: 'unknown', name: 'Unknown' };
    }
  }

  /**
   * Gets a list of all enabled modules
   * @returns {Array<object>} Array of enabled module data
   * @static
   */
  static getEnabledModules() {
    try {
      const enabledModules = [];
      game.modules.forEach((module, id) => {
        if (module.active) {
          enabledModules.push({
            id,
            title: module.title,
            version: module.version
          });
        }
      });
      return enabledModules;
    } catch (error) {
      HM.log(1, `Error getting enabled modules: ${error.message}`);
      return [];
    }
  }

  /**
   * Collects all Hero Mancer settings
   * @returns {object} Object containing all settings
   * @static
   */
  static collectSettings() {
    try {
      const settings = {};
      for (const [key, setting] of game.settings.settings.entries()) {
        if (setting.namespace === HM.ID) {
          try {
            settings[setting.key] = game.settings.get(HM.ID, setting.key);
          } catch (error) {
            settings[setting.key] = `[Error: ${error.message}]`;
          }
        }
      }
      return settings;
    } catch (error) {
      HM.log(1, `Error collecting settings: ${error.message}`);
      return {};
    }
  }

  /**
   * Collects form data from an active Hero Mancer application
   * @returns {object|null} Object containing form data or null if app not found
   * @static
   */
  static collectMancerFormData() {
    try {
      const mancerApp = document.getElementById('hero-mancer-app');
      if (!mancerApp) return null;

      const formElements = mancerApp.querySelectorAll('[name]');
      if (!formElements.length) return null;

      const formData = {};

      // Helper to process array notation names (e.g., "abilities[str]")
      const processName = (name, value) => {
        const match = name.match(/^([^[]+)\[([^\]]+)]$/);
        if (match) {
          const [_, arrayName, key] = match;
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
          try {
            const selectedOption = element.options[element.selectedIndex];
            if (selectedOption && selectedOption.text) {
              value = `${value} (${selectedOption.text})`;
            }
          } catch (e) {
            /* Ignore errors */
          }
        } else if (element.tagName === 'PROSE-MIRROR') {
          try {
            const content = element.querySelector('.editor-content');
            value = content ? content.textContent : '[Complex Content]';
          } catch (e) {
            value = '[Complex Content]';
          }
        } else {
          value = element.value;
        }

        processName(name, value);
      });

      return formData;
    } catch (error) {
      HM.log(1, `Error collecting mancer form data: ${error.message}`);
      return null;
    }
  }

  /**
   * Gets information about configured compendium packs
   * @returns {object} Object containing compendium configuration
   * @static
   */
  static getCompendiumInfo() {
    try {
      const compendiums = {};
      for (const type of ['class', 'race', 'background', 'item']) {
        try {
          const packSetting = `${type}Packs`;
          const packs = game.settings.get(HM.ID, packSetting) || [];

          compendiums[type] = packs.map((packId) => {
            const pack = game.packs.get(packId);
            return pack ?
                {
                  id: packId,
                  name: pack.metadata.label,
                  system: pack.metadata.system,
                  packageName: pack.metadata.packageName
                }
              : { id: packId, error: 'Pack not found' };
          });
        } catch (error) {
          HM.log(1, `Error getting compendium info for ${type}: ${error.message}`);
          compendiums[type] = [];
        }
      }
      return compendiums;
    } catch (error) {
      HM.log(1, `Error getting compendium info: ${error.message}`);
      return {};
    }
  }

  /**
   * Processes log data for display in the report
   * @param {Array<object>} logs - Array of log objects
   * @returns {Array<object>} Processed log entries
   * @static
   */
  static processLogs(logs) {
    try {
      if (!Array.isArray(logs)) {
        HM.log(2, 'Logs parameter is not an array');
        return [];
      }

      return logs.map((log) => {
        try {
          if (!log.content || !Array.isArray(log.content)) {
            return {
              timestamp: log.timestamp || 'unknown',
              type: log.type || 'log',
              content: String(log.content || '[Invalid log entry]')
            };
          }

          const processedContent = log.content
            .map((item) => {
              if (typeof item === 'string') return item;
              if (Array.isArray(item)) return `Array(${item.length})`;
              if (typeof item === 'object' && item !== null) {
                const keys = Object.keys(item);
                const preview = keys
                  .slice(0, 3)
                  .map((key) => {
                    const value = item[key];
                    if (Array.isArray(value)) return `${key}: Array(${value.length})`;
                    if (typeof value === 'object' && value !== null) return `${key}: Object`;
                    return `${key}: ${value}`;
                  })
                  .join(', ');
                return `{${preview}${keys.length > 3 ? '...' : ''}}`;
              }
              return String(item);
            })
            .join(' ');

          return {
            timestamp: log.timestamp || 'unknown',
            type: log.type || 'log',
            content: processedContent
          };
        } catch (itemError) {
          HM.log(2, `Error processing log item: ${itemError.message}`);
          return {
            timestamp: log.timestamp || 'unknown',
            type: log.type || 'log',
            content: '[Error processing log entry]'
          };
        }
      });
    } catch (error) {
      HM.log(1, `Error processing logs: ${error.message}`);
      return [];
    }
  }
}
