import { hasPendingFlag, isEligible, sendLevelUpToActor, sendLevelUpToGroup } from './level-up-broadcast.mjs';
import { openLevelUp } from './level-up.mjs';

/** Per-host injection target spec for character sheets (icon-only buttons). */
const CHARACTER_HOSTS = [
  { hook: 'renderCharacterActorSheet', selector: '.sheet-header-buttons', buttonClasses: ['gold-button'] },
  { hook: 'renderTidy5eCharacterSheetQuadrone', selector: '[data-tidy-sheet-part="sheet-header-actions-container"]', buttonClasses: ['button', 'button-icon-only', 'button-gold'] }
];

/** Per-host injection target spec for group sheets. The Tidy variant pairs the icon with a text label to match its siblings. */
const GROUP_HOSTS = [
  { hook: 'renderGroupActorSheet', selector: '.sheet-header-buttons', buttonClasses: ['gold-button'], textLabel: false },
  { hook: 'renderTidy5eGroupSheetQuadrone', selector: '[data-tidy-sheet-part="sheet-header-actions-container"]', buttonClasses: ['button', 'button-gold', 'flexshrink'], textLabel: true }
];

/** Wire actor-sheet + group-sheet render hooks for dnd5e v5 + Tidy5e Quadrone. */
export function registerLevelUpSheetButton() {
  for (const spec of CHARACTER_HOSTS) Hooks.on(spec.hook, (app, element) => syncCharacterButton(app, element, spec));
  for (const spec of GROUP_HOSTS) Hooks.on(spec.hook, (app, element) => syncGroupButton(app, element, spec));
}

/**
 * GMs get a direct Level Up button plus a Send button; players see the Level Up button, glowing when the actor has a pending grant.
 * @param {object} app Character sheet application.
 * @param {HTMLElement} element Sheet root.
 * @param {{selector: string, buttonClasses: string[]}} spec Host injection spec.
 * @returns {void}
 */
function syncCharacterButton(app, element, spec) {
  element.querySelectorAll('[data-hm-level-up]').forEach((b) => b.remove());
  const actor = app.actor;
  if (!isEligible(actor)) return;
  const host = element.querySelector(spec.selector);
  if (!host) return;
  const flagged = hasPendingFlag(actor);
  if (game.user.isGM) {
    host.appendChild(makeButton(spec, { aria: 'DND5E.LevelActionIncrease', tooltip: 'HEROMANCER.LevelUp.SheetButton.Tooltip', icon: 'fa-angles-up', onClick: () => openLevelUp(actor) }));
    if (!flagged) {
      host.appendChild(
        makeButton(spec, { aria: 'HEROMANCER.LevelUp.SheetButton.SendLabel', tooltip: 'HEROMANCER.LevelUp.SheetButton.SendTooltip', icon: 'fa-paper-plane', onClick: () => sendLevelUpToActor(actor) })
      );
    }
    return;
  }
  if (!flagged && !app.isEditMode) return;
  host.appendChild(makeButton(spec, { aria: 'DND5E.LevelActionIncrease', tooltip: 'HEROMANCER.LevelUp.SheetButton.Tooltip', icon: 'fa-angles-up', glow: flagged, onClick: () => openLevelUp(actor) }));
}

/**
 * GMs see a Send button on group sheets. Eligibility per member is resolved when the dialog opens.
 * @param {object} app Group sheet application.
 * @param {HTMLElement} element Sheet root.
 * @param {{selector: string, buttonClasses: string[], textLabel: boolean}} spec Host injection spec.
 * @returns {void}
 */
function syncGroupButton(app, element, spec) {
  element.querySelectorAll('[data-hm-level-up]').forEach((b) => b.remove());
  if (!game.user.isGM || app.actor.type !== 'group') return;
  const host = element.querySelector(spec.selector);
  if (!host) return;
  host.appendChild(
    makeButton(spec, {
      aria: 'HEROMANCER.LevelUp.SheetButton.SendLabel',
      tooltip: 'HEROMANCER.LevelUp.SheetButton.SendGroupTooltip',
      icon: 'fa-paper-plane',
      text: spec.textLabel,
      onClick: () => sendLevelUpToGroup(app.actor)
    })
  );
}

/**
 * Build a sheet-injected button.
 * @param {{buttonClasses: string[]}} spec Host injection spec.
 * @param {{aria: string, tooltip: string, icon: string, onClick: Function, glow?: boolean, text?: boolean}} config Button config (aria/tooltip are lang keys).
 * @returns {HTMLButtonElement} Configured button.
 */
function makeButton(spec, { aria, tooltip, icon, onClick, glow, text }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.hmLevelUp = '';
  btn.classList.add('hm-sheet-level-up-button', ...spec.buttonClasses);
  const label = _loc(aria);
  btn.setAttribute('aria-label', label);
  btn.dataset.tooltip = _loc(tooltip);
  btn.innerHTML = text ? `<i class="fa-solid ${icon}"></i> ${foundry.utils.escapeHTML(label)}` : `<i class="fa-solid ${icon}" inert></i>`;
  if (glow) btn.classList.add('is-glowing');
  btn.addEventListener('click', onClick);
  return btn;
}
