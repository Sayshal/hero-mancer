import { MODULE } from '../constants.mjs';
import { HMDialog } from './dialog.mjs';
import { PendingApprovals } from './pending-approvals.mjs';
import { SettingsPanel } from './settings-panel.mjs';

let shownThisSession = false;

/** First-run how-to dialog with role-tailored guidance. */
export class Welcome extends HMDialog {
  static DEFAULT_OPTIONS = {
    id: `${MODULE.ID}-welcome`,
    classes: ['hm-welcome'],
    window: { title: 'HEROMANCER.App.Welcome.Title', icon: 'fas fa-hat-wizard' },
    position: { width: 600, height: 'auto' },
    actions: {
      dismiss: Welcome.#onDismiss,
      openSources: Welcome.#onOpenSources,
      openSettings: Welcome.#onOpenSettings,
      openQueue: Welcome.#onOpenQueue,
      openActorDirectory: Welcome.#onOpenActorDirectory,
      openCreateActor: Welcome.#onOpenCreateActor
    }
  };

  /** @inheritdoc */
  static RESIZABLE = false;

  static PARTS = { header: HMDialog.HEADER_PART, main: { template: MODULE.TEMPLATES.MENUS.WELCOME } };

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return { ...context, isGM: game.user.isGM, links: MODULE.LINKS };
  }

  /** Open dnd5e's compendium-browser source configuration screen. */
  static #onOpenSources() {
    const windowId = this.window.windowId;
    new dnd5e.applications.settings.CompendiumBrowserSettingsConfig().render({ force: true, ...(windowId && { window: { windowId } }) });
  }

  /**
   * Open the Hero Mancer Settings panel, optionally jumping to a specific tab.
   * @param {PointerEvent} _event Click event from the dialog body.
   * @param {HTMLElement} target Anchor element carrying optional `data-tab`.
   */
  static #onOpenSettings(_event, target) {
    const tab = target?.dataset?.tab || null;
    const id = `${MODULE.ID}-settings-panel`;
    const existing = foundry.applications.instances.get(id);
    if (existing) {
      if (tab) existing.changeTab(tab, 'primary');
      existing.bringToFront();
      return;
    }
    const windowId = this.window.windowId;
    new SettingsPanel({ initialTab: tab }).render({ force: true, ...(windowId && { window: { windowId } }) });
  }

  /** Activate the Actors sidebar tab; expand the sidebar if collapsed. */
  static #onOpenActorDirectory() {
    ui.sidebar.changeTab('actors', 'primary');
    if (!ui.sidebar.expanded) ui.sidebar.expand();
  }

  /** Open the native Create Actor dialog with the Hero Mancer option pre-selected. */
  static #onOpenCreateActor() {
    Actor.implementation.createDialog();
    const expected = _loc('DOCUMENT.Create', { type: _loc('DOCUMENT.Actor') });
    const hookId = Hooks.on('renderApplicationV2', (app, element) => {
      if (app.title !== expected) return;
      Hooks.off('renderApplicationV2', hookId);
      const root = element?.tagName ? element : element?.[0];
      const radio = root?.querySelector('input[value="hm-launch"]');
      if (radio) radio.checked = true;
    });
  }

  /** Open the GM-side pending approvals queue. */
  static #onOpenQueue() {
    const id = `${MODULE.ID}-pending-approvals`;
    const existing = foundry.applications.instances.get(id);
    if (existing) {
      existing.bringToFront();
      return;
    }
    const windowId = this.window.windowId;
    new PendingApprovals().render({ force: true, ...(windowId && { window: { windowId } }) });
  }

  /** Dismiss action — honors checkbox state then closes. */
  static async #onDismiss() {
    const checkbox = this.element.querySelector('input[name="hideForever"]');
    if (checkbox?.checked) await game.settings.set(MODULE.ID, MODULE.SETTINGS.SHOW_WELCOME, false);
    this.close();
  }
}

/**
 * Show the welcome dialog on the first ready of each session when SHOW_WELCOME is on.
 * @returns {void}
 */
export function maybeShowWelcome() {
  if (shownThisSession) return;
  if (!game.settings.get(MODULE.ID, MODULE.SETTINGS.SHOW_WELCOME)) return;
  shownThisSession = true;
  new Welcome().render({ force: true });
}
