import { MODULE } from '../constants.mjs';
import { WizardStateMachine } from './state-machine.mjs';

/** Tabs that always appear before the reorderable advancement tabs. */
const FIXED_LEADING = ['start'];

/** Tabs that always appear after the reorderable advancement tabs. */
const FIXED_TRAILING = ['abilities', 'equipment', 'quartermaster', 'biography', 'finalize'];

/** Tabs whose order is controlled by the `advancementOrder` setting. */
const REORDERABLE = ['background', 'race', 'class'];

const { STATES, EVENTS } = MODULE.WIZARD;

/** States in which every tab is locked (no navigation, no edits). */
const LOCKED_STATES = new Set([STATES.VALIDATING, STATES.SUBMITTING, STATES.SUBMITTED_PENDING_APPROVAL, STATES.APPROVED, STATES.CREATING, STATES.RUNNING_ADVANCEMENTS, STATES.DONE, STATES.ERROR]);

/**
 * Build the tab id list from the `advancementOrder` setting.
 * @returns {string[]} Ordered tab ids.
 */
function computeTabOrder() {
  const config = game.settings.get(MODULE.ID, MODULE.SETTINGS.ADVANCEMENT_ORDER);
  const reordered =
    Array.isArray(config) && config.length > 0
      ? [...config]
          .sort((a, b) => a.order - b.order)
          .map((entry) => entry.id)
          .filter((id) => REORDERABLE.includes(id))
      : [...REORDERABLE];
  return [...FIXED_LEADING, ...reordered, ...FIXED_TRAILING];
}

/** Drives wizard tab state. */
export class TabController {
  /** @type {WizardStateMachine} */
  #fsm;

  /** @type {string} */
  #active;

  /** @type {string[]} */
  #order;

  /** @type {boolean} */
  #locked = false;

  /** @type {Set<Function>} */
  #onChange = new Set();

  /** @type {Function[]} */
  #unsubs = [];

  /**
   * @param {WizardStateMachine} fsm Wizard state machine.
   */
  constructor(fsm) {
    this.#fsm = fsm;
    this.#order = computeTabOrder();
    this.#active = this.#order[0];
    this.#unsubs.push(fsm.onTransition((_from, to) => this.#syncLock(to)));
    this.#syncLock(fsm.state);
  }

  /**
   * Active tab id list snapshot.
   * @returns {string[]} Copy of the current ordered tab ids.
   */
  get order() {
    return [...this.#order];
  }

  /**
   * Current active tab id.
   * @returns {string} Tab id.
   */
  get active() {
    return this.#active;
  }

  /**
   * Whether navigation is currently locked.
   * @returns {boolean} True when every tab is read-only.
   */
  get locked() {
    return this.#locked;
  }

  /**
   * Activate `tabId` if valid and not locked. Emits an FSM `tab_change` event when allowed.
   * @param {string} tabId Target tab id.
   * @returns {boolean} True if the active tab actually changed (or already matched and is valid).
   */
  setActive(tabId) {
    if (this.#locked) return false;
    if (!this.#order.includes(tabId)) return false;
    if (tabId === this.#active) return true;
    const prev = this.#active;
    this.#active = tabId;
    if (this.#fsm.can(EVENTS.TAB_CHANGE)) {
      this.#fsm.send(EVENTS.TAB_CHANGE, { from: prev, to: tabId });
    }
    this.#fire(prev, tabId);
    return true;
  }

  /**
   * Move to the next tab.
   * @returns {boolean} False if already on the last tab.
   */
  next() {
    const idx = this.#order.indexOf(this.#active);
    if (idx < 0 || idx >= this.#order.length - 1) return false;
    return this.setActive(this.#order[idx + 1]);
  }

  /**
   * Move to the previous tab.
   * @returns {boolean} False if already on the first tab.
   */
  prev() {
    const idx = this.#order.indexOf(this.#active);
    if (idx <= 0) return false;
    return this.setActive(this.#order[idx - 1]);
  }

  /**
   * Whether the active tab is the first one.
   * @returns {boolean} True if active is at index 0.
   */
  isFirst() {
    return this.#order.indexOf(this.#active) === 0;
  }

  /**
   * Whether the active tab is the last one.
   * @returns {boolean} True if active is at the final index.
   */
  isLast() {
    return this.#order.indexOf(this.#active) === this.#order.length - 1;
  }

  /**
   * Index of `tabId` in the current order.
   * @param {string} tabId Tab id.
   * @returns {number} Zero-based index, or -1 if not found.
   */
  indexOf(tabId) {
    return this.#order.indexOf(tabId);
  }

  /**
   * Recompute the tab order from settings + compat flags.
   * @returns {void}
   */
  refreshOrder() {
    this.#order = computeTabOrder();
    if (!this.#order.includes(this.#active)) {
      const prev = this.#active;
      this.#active = this.#order[0];
      this.#fire(prev, this.#active);
    }
  }

  /**
   * Subscribe to active-tab changes. Callback signature: (prev, next).
   * @param {Function} cb Listener.
   * @returns {Function} Unsubscribe.
   */
  onChange(cb) {
    this.#onChange.add(cb);
    return () => this.#onChange.delete(cb);
  }

  /** Detach all FSM and external listeners. */
  destroy() {
    this.#unsubs.forEach((unsub) => unsub());
    this.#unsubs.length = 0;
    this.#onChange.clear();
  }

  /**
   * Update the lock flag from the current FSM state.
   * @param {string} state State id.
   * @returns {void}
   */
  #syncLock(state) {
    this.#locked = LOCKED_STATES.has(state);
  }

  /**
   * Notify all active-tab subscribers, isolating throws.
   * @param {string} prev Previous tab id.
   * @param {string} next New tab id.
   * @returns {void}
   */
  #fire(prev, next) {
    this.#onChange.forEach((cb) => {
      try {
        cb(prev, next);
      } catch (err) {
        ATLAS.log(1, 'TabController onChange threw:', err);
      }
    });
  }
}
