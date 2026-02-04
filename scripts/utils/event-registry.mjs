/**
 * @module EventRegistry
 * @description Centralized event listener and mutation observer management with automatic cleanup via WeakMap.
 */

import { log } from './logger.mjs';

/**
 * Centralized registry for DOM event listeners and mutation observers.
 * Uses WeakMap for automatic garbage collection when elements are removed.
 */
export class EventRegistry {
  /** @type {WeakMap<HTMLElement, Map<string, Set<Function>>>} */
  static #listeners = new WeakMap();

  /** @type {WeakMap<HTMLElement, Map<string, MutationObserver>>} */
  static #observers = new WeakMap();

  /** @type {Set<HTMLElement>} - Track elements for explicit cleanup */
  static #trackedElements = new Set();

  /**
   * Add and track an event listener on an element.
   * @param {HTMLElement} element - Target element
   * @param {string} eventType - Event type ('click', 'change', etc.)
   * @param {Function} callback - Event handler
   * @returns {Function} The callback for chaining
   */
  static on(element, eventType, callback) {
    if (!element || !(element instanceof Element)) {
      log(2, 'EventRegistry.on: Invalid element provided');
      return callback;
    }
    if (!eventType || typeof eventType !== 'string') {
      log(2, `EventRegistry.on: Invalid event type "${eventType}"`);
      return callback;
    }
    if (typeof callback !== 'function') {
      log(2, 'EventRegistry.on: Callback must be a function');
      return callback;
    }

    if (!this.#listeners.has(element)) this.#listeners.set(element, new Map());
    const elementEvents = this.#listeners.get(element);
    if (!elementEvents.has(eventType)) elementEvents.set(eventType, new Set());
    elementEvents.get(eventType).add(callback);
    this.#trackedElements.add(element);
    element.addEventListener(eventType, callback);
    return callback;
  }

  /**
   * Remove a specific event listener from an element.
   * @param {HTMLElement} element - Target element
   * @param {string} eventType - Event type
   * @param {Function} callback - Event handler to remove
   */
  static off(element, eventType, callback) {
    if (!element || !this.#listeners.has(element)) return;
    const elementEvents = this.#listeners.get(element);
    if (!elementEvents?.has(eventType)) return;
    const callbacks = elementEvents.get(eventType);
    if (callbacks.has(callback)) {
      element.removeEventListener(eventType, callback);
      callbacks.delete(callback);
    }
    if (callbacks.size === 0) elementEvents.delete(eventType);
    if (elementEvents.size === 0) {
      this.#listeners.delete(element);
      this.#trackedElements.delete(element);
    }
  }

  /**
   * Create and track a mutation observer on an element.
   * @param {HTMLElement} element - Element to observe
   * @param {string} id - Unique observer ID for this element
   * @param {object} options - Observer configuration
   * @param {Function} callback - Handler function
   * @returns {MutationObserver|null} The created observer or null if failed
   */
  static observe(element, id, options, callback) {
    if (!element || !(element instanceof Element)) {
      log(2, `EventRegistry.observe: Invalid element for observer "${id}"`);
      return null;
    }
    if (!id || typeof id !== 'string') {
      log(2, 'EventRegistry.observe: Observer ID must be a non-empty string');
      return null;
    }
    if (typeof callback !== 'function') {
      log(2, `EventRegistry.observe: Callback must be a function for observer "${id}"`);
      return null;
    }

    if (!this.#observers.has(element)) this.#observers.set(element, new Map());
    const elementObservers = this.#observers.get(element);
    if (elementObservers.has(id)) elementObservers.get(id).disconnect();
    const observer = new MutationObserver(callback);
    observer.observe(element, options);
    elementObservers.set(id, observer);
    this.#trackedElements.add(element);
    return observer;
  }

  /**
   * Disconnect a specific observer from an element.
   * @param {HTMLElement} element - Target element
   * @param {string} id - Observer ID to disconnect
   */
  static unobserve(element, id) {
    if (!element || !this.#observers.has(element)) return;
    const elementObservers = this.#observers.get(element);
    if (!elementObservers?.has(id)) return;
    elementObservers.get(id).disconnect();
    elementObservers.delete(id);
    if (elementObservers.size === 0) this.#observers.delete(element);
  }

  /**
   * Clean up all listeners and observers for a specific element.
   * @param {HTMLElement} element - Element to clean up
   */
  static cleanup(element) {
    if (!element) return;
    if (this.#listeners.has(element)) {
      const elementEvents = this.#listeners.get(element);
      elementEvents.forEach((callbacks, eventType) => {
        callbacks.forEach((callback) => {
          element.removeEventListener(eventType, callback);
        });
      });
      this.#listeners.delete(element);
    }
    if (this.#observers.has(element)) {
      const elementObservers = this.#observers.get(element);
      elementObservers.forEach((observer) => {
        observer.disconnect();
      });
      this.#observers.delete(element);
    }
    this.#trackedElements.delete(element);
  }

  /**
   * Clean up all tracked listeners and observers.
   * Call this when the application closes.
   */
  static cleanupAll() {
    for (const element of this.#trackedElements) this.cleanup(element);
    this.#trackedElements.clear();
  }
}
