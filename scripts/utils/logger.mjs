/**
 * Hero Mancer Module Logger
 * @module Logger
 */

const MODULE_ID = 'hero-mancer';

/**
 * Current logging level (0=disabled, 1=errors, 2=warnings, 3=verbose)
 * @type {number}
 */
let logLevel = 0;

/**
 * Simple logging function with module ID prefix and colored styling.
 * @param {number} level - Log level (1=error, 2=warning, 3=verbose)
 * @param {...*} args - Content to log to console
 */
export function log(level, ...args) {
  if (logLevel > 0 && level <= logLevel) {
    switch (level) {
      case 1:
        console.error(`%c${MODULE_ID}%c |`, 'color: #ef4444; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-shadow: 0 0 1px #000;', 'color: #9ca3af;', ...args);
        break;
      case 2:
        console.warn(`%c${MODULE_ID}%c |`, 'color: #fb923c; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-shadow: 0 0 1px #000;', 'color: #9ca3af;', ...args);
        break;
      default:
        console.debug(`%c${MODULE_ID}%c |`, 'color: #a78bfa; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-shadow: 0 0 1px #000;', 'color: #9ca3af;', ...args);
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
    const level = game.settings.get(MODULE_ID, 'loggingLevel');
    logLevel = parseInt(level) || 0;
  } catch (error) {
    console.error(`${MODULE_ID} | Error initializing logger:`, error);
    logLevel = 1;
  }
}

/**
 * Direct setter for log level, used by settings onChange handler.
 * @param {number} value - The new log level
 */
export function setLogLevel(value) {
  logLevel = value;
}
