/**
 * Hero Mancer Module Logger
 * @module Logger
 */

import { MODULE } from '../constants.mjs';

/**
 * Simple logging function with module ID prefix and colored styling.
 * @param {number} level - Log level (1=error, 2=warning, 3=verbose)
 * @param {...*} args - Content to log to console
 */
export function log(level, ...args) {
  if (MODULE.LOG_LEVEL > 0 && level <= MODULE.LOG_LEVEL) {
    switch (level) {
      case 1:
        console.error(`%c${MODULE.ID}%c |`, 'color: #ef4444; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-shadow: 0 0 1px #000;', 'color: #9ca3af;', ...args);
        break;
      case 2:
        console.warn(`%c${MODULE.ID}%c |`, 'color: #fb923c; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-shadow: 0 0 1px #000;', 'color: #9ca3af;', ...args);
        break;
      default:
        console.debug(`%c${MODULE.ID}%c |`, 'color: #a78bfa; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-shadow: 0 0 1px #000;', 'color: #9ca3af;', ...args);
        break;
    }
  }
}

/**
 * Initialize the logger with current game settings.
 * @returns {void}
 */
export function initializeLogger() {
  try {
    const level = game.settings.get(MODULE.ID, 'loggingLevel');
    MODULE.LOG_LEVEL = parseInt(level) || 0;
  } catch (error) {
    console.error(`${MODULE.ID} | Error initializing logger:`, error);
    MODULE.LOG_LEVEL = 1;
  }
}
