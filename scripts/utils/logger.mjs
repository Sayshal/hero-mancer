import { MODULE } from '../constants.mjs';

const PREFIX_STYLE = 'color: #ef4444; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-shadow: 0 0 1px #000;';
const PREFIX_STYLE_WARN = PREFIX_STYLE.replace('#ef4444', '#fb923c');
const PREFIX_STYLE_VERBOSE = PREFIX_STYLE.replace('#ef4444', '#a78bfa');
const SEPARATOR_STYLE = 'color: #9ca3af;';

/**
 * Log a message at the given level. Console output is gated by `MODULE.LOG_LEVEL`.
 * @param {number} level Log level (1=error, 2=warning, 3=verbose).
 * @param {...*} args Content to log.
 * @returns {void}
 */
export function log(level, ...args) {
  if (MODULE.LOG_LEVEL <= 0 || level > MODULE.LOG_LEVEL) return;
  switch (level) {
    case 1:
      console.error(`%c${MODULE.ID}%c |`, PREFIX_STYLE, SEPARATOR_STYLE, ...args);
      break;
    case 2:
      console.warn(`%c${MODULE.ID}%c |`, PREFIX_STYLE_WARN, SEPARATOR_STYLE, ...args);
      break;
    default:
      console.debug(`%c${MODULE.ID}%c |`, PREFIX_STYLE_VERBOSE, SEPARATOR_STYLE, ...args);
      break;
  }
}

/**
 * Read the configured log level from settings into `MODULE.LOG_LEVEL`.
 * @returns {void}
 */
export function initializeLogger() {
  MODULE.LOG_LEVEL = parseInt(game.settings.get(MODULE.ID, MODULE.SETTINGS.LOGGING_LEVEL)) || 0;
}
