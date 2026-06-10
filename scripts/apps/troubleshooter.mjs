import { MODULE } from '../constants.mjs';
import { HMDialog } from './dialog.mjs';

/** Diagnostic report generator — dumps environment, active modules, HM settings, and any open-wizard form data to a copyable / downloadable text report for bug reports. */
export class Troubleshooter extends HMDialog {
  static DEFAULT_OPTIONS = {
    id: `${MODULE.ID}-troubleshooter`,
    classes: ['hm-troubleshooter'],
    window: { title: 'HEROMANCER.Settings.Troubleshooter.Title', icon: 'fa-solid fa-bug' },
    position: { width: 760, height: 'auto' },
    actions: {
      exportReport: Troubleshooter.#onExport,
      copyReport: Troubleshooter.#onCopy,
      openDiscord: Troubleshooter.#onDiscord,
      openGithub: Troubleshooter.#onGithub
    }
  };

  /** @inheritdoc */
  static RESIZABLE = false;

  static PARTS = {
    header: HMDialog.HEADER_PART,
    main: { template: MODULE.TEMPLATES.MENUS.TROUBLESHOOTER }
  };

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return { ...context, output: Troubleshooter.generateReport() };
  }

  /**
   * Build the full plaintext diagnostic report.
   * @returns {string} Section-delimited report text.
   */
  static generateReport() {
    const lines = [];
    const header = (text) => lines.push('', `/////////////// ${text} ///////////////`, '');
    header('Game Information');
    lines.push(`Foundry: ${game.version}`);
    lines.push(`System: ${game.system.id} v${game.system.version}`);
    lines.push(`Language: ${game.settings.get('core', 'language')}`);
    lines.push(`Hero Mancer: ${game.modules.get(MODULE.ID)?.version ?? 'unknown'}`);
    header('Modules');
    const modules = game.modules.map((module) => `${module.title}: ${module.version}${module.active ? '' : ' (disabled)'}`).sort();
    lines.push(...(modules.length ? modules : ['None']));
    header('Hero Mancer Settings');
    for (const [, setting] of game.settings.settings) {
      if (setting.namespace !== MODULE.ID) continue;
      const value = game.settings.get(MODULE.ID, setting.key);
      lines.push(`${setting.key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
    }
    const formData = Troubleshooter.#collectWizardForm();
    if (formData.length) {
      header('Wizard Form Data');
      lines.push(...formData);
    }
    return lines.join('\n');
  }

  /**
   * Snapshot the open wizard's named form fields, if the wizard is rendered.
   * @returns {string[]} `name: value` lines, or empty when no wizard is open.
   */
  static #collectWizardForm() {
    const root = document.getElementById(`${MODULE.ID}-wizard`);
    if (!root) return [];
    const out = [];
    for (const el of root.querySelectorAll('input[name], select[name], textarea[name]')) {
      if (el.type === 'checkbox') out.push(`${el.name}: ${el.checked}`);
      else if (el.type === 'radio') {
        if (el.checked) out.push(`${el.name}: ${el.value}`);
      } else {
        let value = String(el.value ?? '');
        if (value.length > 100) value = `${value.slice(0, 97)}...`;
        out.push(`${el.name}: ${value}`);
      }
    }
    return out;
  }

  /** Download the report as a timestamped text file. */
  static #onExport() {
    const stamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    foundry.utils.saveDataToFile(Troubleshooter.generateReport(), 'text/plain', `hero-mancer-troubleshooter-${stamp}.txt`);
  }

  /** Copy the report to the clipboard. */
  static async #onCopy() {
    await game.clipboard.copyPlainText(Troubleshooter.generateReport());
    ui.notifications.info('HEROMANCER.Settings.Troubleshooter.CopySuccess', { localize: true });
  }

  /** Open the support Discord. */
  static #onDiscord() {
    window.open(MODULE.LINKS.DISCORD, '_blank');
  }

  /** Open the GitHub issues page. */
  static #onGithub() {
    window.open(MODULE.LINKS.BUGS, '_blank');
  }
}
