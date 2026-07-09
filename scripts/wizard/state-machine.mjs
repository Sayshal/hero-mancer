import { MODULE } from '../constants.mjs';

const { STATES, EVENTS } = MODULE.WIZARD;

/**
 * Creation-flow transitions: full submit + optional approval queue + actor-create.
 * @type {Object<string, Object<string, string>>}
 */
const TRANSITIONS_CREATION = {
  [STATES.IDLE]: { [EVENTS.OPEN]: STATES.EDITING },
  [STATES.EDITING]: { [EVENTS.TAB_CHANGE]: STATES.EDITING, [EVENTS.SAVE_DRAFT]: STATES.EDITING, [EVENTS.SUBMIT]: STATES.VALIDATING, [EVENTS.CANCEL]: STATES.IDLE, [EVENTS.ERROR]: STATES.ERROR },
  [STATES.VALIDATING]: { [EVENTS.COMPLETE]: STATES.SUBMITTING, [EVENTS.CANCEL]: STATES.EDITING, [EVENTS.ERROR]: STATES.ERROR },
  [STATES.SUBMITTING]: { [EVENTS.COMPLETE]: STATES.SUBMITTED_PENDING_APPROVAL, [EVENTS.APPROVAL_RECEIVED]: STATES.APPROVED, [EVENTS.CANCEL]: STATES.EDITING, [EVENTS.ERROR]: STATES.ERROR },
  [STATES.SUBMITTED_PENDING_APPROVAL]: { [EVENTS.APPROVAL_RECEIVED]: STATES.APPROVED, [EVENTS.REJECTION_RECEIVED]: STATES.REJECTED, [EVENTS.CANCEL]: STATES.EDITING, [EVENTS.ERROR]: STATES.ERROR },
  [STATES.APPROVED]: { [EVENTS.COMPLETE]: STATES.CREATING, [EVENTS.ERROR]: STATES.ERROR },
  [STATES.REJECTED]: { [EVENTS.OPEN]: STATES.EDITING, [EVENTS.CANCEL]: STATES.IDLE, [EVENTS.ERROR]: STATES.ERROR },
  [STATES.CREATING]: { [EVENTS.COMPLETE]: STATES.RUNNING_ADVANCEMENTS, [EVENTS.ERROR]: STATES.ERROR },
  [STATES.RUNNING_ADVANCEMENTS]: { [EVENTS.COMPLETE]: STATES.DONE, [EVENTS.ERROR]: STATES.ERROR },
  [STATES.DONE]: { [EVENTS.CANCEL]: STATES.IDLE },
  [STATES.ERROR]: { [EVENTS.CANCEL]: STATES.IDLE, [EVENTS.OPEN]: STATES.EDITING }
};

/**
 * Level-up transitions: no approval queue, no actor create — advancements apply directly to the existing actor.
 * @type {Object<string, Object<string, string>>}
 */
const TRANSITIONS_LEVEL_UP = {
  [STATES.IDLE]: { [EVENTS.OPEN]: STATES.EDITING },
  [STATES.EDITING]: { [EVENTS.TAB_CHANGE]: STATES.EDITING, [EVENTS.SAVE_DRAFT]: STATES.EDITING, [EVENTS.SUBMIT]: STATES.VALIDATING, [EVENTS.CANCEL]: STATES.IDLE, [EVENTS.ERROR]: STATES.ERROR },
  [STATES.VALIDATING]: { [EVENTS.COMPLETE]: STATES.RUNNING_ADVANCEMENTS, [EVENTS.CANCEL]: STATES.EDITING, [EVENTS.ERROR]: STATES.ERROR },
  [STATES.RUNNING_ADVANCEMENTS]: { [EVENTS.COMPLETE]: STATES.DONE, [EVENTS.ERROR]: STATES.ERROR },
  [STATES.DONE]: { [EVENTS.CANCEL]: STATES.IDLE },
  [STATES.ERROR]: { [EVENTS.CANCEL]: STATES.IDLE, [EVENTS.OPEN]: STATES.EDITING }
};

/** @type {Object<string, Object<string, Object<string, string>>>} Mode -> transitions table. */
const MODE_TABLES = { creation: TRANSITIONS_CREATION, level_up: TRANSITIONS_LEVEL_UP };

/** Hand-rolled finite state machine for the Hero Mancer wizard. */
export class WizardStateMachine {
  /** @type {string} */
  #state = STATES.IDLE;

  /** @type {'creation'|'level_up'} */
  #mode = 'creation';

  /** @type {Object<string, Object<string, string>>} */
  #transitions = TRANSITIONS_CREATION;

  /** @type {Set<Function>} */
  #onTransition = new Set();

  /** @type {Map<string, Set<Function>>} */
  #onEnter = new Map();

  /** @type {Map<string, Set<Function>>} */
  #onLeave = new Map();

  /**
   * @param {'creation'|'level_up'} [mode] Pick which transition table governs this machine.
   */
  constructor(mode = 'creation') {
    this.#mode = mode;
    this.#transitions = MODE_TABLES[mode] ?? TRANSITIONS_CREATION;
  }

  /**
   * Current state id.
   * @returns {string} The active state.
   */
  get state() {
    return this.#state;
  }

  /**
   * Mode axis governing the transition table.
   * @returns {'creation'|'level_up'} Active mode.
   */
  get mode() {
    return this.#mode;
  }

  /**
   * Send an event. Throws if the event is not valid in the current state.
   * @param {string} event Event id from `MODULE.WIZARD.EVENTS`.
   * @param {*} [payload] Optional payload forwarded to listeners.
   * @returns {string} The new state id.
   */
  send(event, payload) {
    const from = this.#state;
    const to = this.#transitions[from]?.[event];
    if (!to) throw new Error(`hero-mancer FSM: invalid event "${event}" in state "${from}"`);
    ATLAS.log(3, `FSM ${from} --${event}--> ${to}`);
    this.#fire(this.#onLeave.get(from), from, to, event, payload);
    this.#state = to;
    this.#onTransition.forEach((cb) => this.#safe(cb, from, to, event, payload));
    this.#fire(this.#onEnter.get(to), from, to, event, payload);
    return to;
  }

  /**
   * Whether `event` is currently valid (no throw).
   * @param {string} event Event id.
   * @returns {boolean} True if the event would transition.
   */
  can(event) {
    return Boolean(this.#transitions[this.#state]?.[event]);
  }

  /**
   * Subscribe to every transition. Callback signature: (from, to, event, payload).
   * @param {Function} cb Listener.
   * @returns {Function} Unsubscribe.
   */
  onTransition(cb) {
    this.#onTransition.add(cb);
    return () => this.#onTransition.delete(cb);
  }

  /**
   * Subscribe to entering a specific state.
   * @param {string} state State id.
   * @param {Function} cb Listener.
   * @returns {Function} Unsubscribe.
   */
  onEnter(state, cb) {
    return this.#register(this.#onEnter, state, cb);
  }

  /**
   * Subscribe to leaving a specific state.
   * @param {string} state State id.
   * @param {Function} cb Listener.
   * @returns {Function} Unsubscribe.
   */
  onLeave(state, cb) {
    return this.#register(this.#onLeave, state, cb);
  }

  /** Force back to idle, dropping current state. Listeners NOT fired. */
  reset() {
    this.#state = STATES.IDLE;
  }

  /**
   * Register a per-state listener and return its unsubscribe.
   * @param {Map<string, Set<Function>>} map Listener bucket map.
   * @param {string} state State id.
   * @param {Function} cb Listener.
   * @returns {Function} Unsubscribe.
   */
  #register(map, state, cb) {
    let set = map.get(state);
    if (!set) {
      set = new Set();
      map.set(state, set);
    }
    set.add(cb);
    return () => set.delete(cb);
  }

  /**
   * Fire every callback in `set` with isolation (per-listener try/catch).
   * @param {Set<Function>|undefined} set Listener bucket.
   * @param {string} from Previous state.
   * @param {string} to New state.
   * @param {string} event Event id.
   * @param {*} payload Optional payload.
   * @returns {void}
   */
  #fire(set, from, to, event, payload) {
    if (!set) return;
    set.forEach((cb) => this.#safe(cb, from, to, event, payload));
  }

  /**
   * Invoke `cb` and catch/log throws so one bad listener cannot poison others.
   * @param {Function} cb Listener.
   * @param {...*} args Args to forward.
   * @returns {void}
   */
  #safe(cb, ...args) {
    try {
      cb(...args);
    } catch (err) {
      ATLAS.log(1, 'FSM listener threw:', err);
    }
  }
}
