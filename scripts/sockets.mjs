import { MODULE } from './constants.mjs';
import { log } from './utils/logger.mjs';

const CHANNEL = `module.${MODULE.ID}`;

/** @enum {string} Socket event types broadcast on the module channel */
export const SOCKET_EVENTS = {
  SUBMIT_CHARACTER: 'submitCharacter',
  CHARACTER_APPROVED: 'characterApproved',
  CHARACTER_REJECTED: 'characterRejected',
  PENDING_CHANGED: 'pendingChanged',
  SPELL_SETUP_REQUEST: 'spellSetupRequest',
  SPELL_SETUP_COMPLETE: 'spellSetupComplete',
  SPELL_SETUP_CANCELED: 'spellSetupCanceled'
};

const handlers = new Map();
let dispatcher = null;

/**
 * Dispatch incoming socket payload to registered handlers for that event type.
 * @param {{type: string}} data Payload received from peers.
 * @returns {void}
 */
function dispatch(data) {
  if (!data || typeof data.type !== 'string') return;
  const set = handlers.get(data.type);
  if (!set) return;
  for (const handler of set) {
    try {
      handler(data);
    } catch (error) {
      log(1, `Socket handler for "${data.type}" threw:`, error);
    }
  }
}

/**
 * Install the single dispatching listener on the module channel.
 * @returns {void}
 */
export function registerSocket() {
  if (dispatcher) game.socket.off(CHANNEL, dispatcher);
  dispatcher = dispatch;
  game.socket.on(CHANNEL, dispatcher);
}

/**
 * Register a handler for a specific socket event type.
 * @param {string} type Event type from `SOCKET_EVENTS`.
 * @param {Function} handler Handler invoked with the payload.
 * @returns {Function} Unsubscribe function.
 */
export function onSocketEvent(type, handler) {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type).add(handler);
  return () => {
    const set = handlers.get(type);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) handlers.delete(type);
  };
}

/**
 * Broadcast a payload on the module channel.
 * @param {string} type Event type from `SOCKET_EVENTS`.
 * @param {object} [payload] Additional fields merged with `{type}`.
 * @returns {void}
 */
export function emitSocketEvent(type, payload = {}) {
  game.socket.emit(CHANNEL, { type, ...payload });
}
