import { HM, MODULE } from '../utils/index.js';
import { log } from './logger.mjs';

/**
 * Handles image selection for character, token, and player art
 * @class
 */
export class CharacterArtPicker {
  /**
   * Gets the root directory for art selection
   * @returns {string} The configured root directory path
   * @static
   */
  static get rootDirectory() {
    return game.settings.get(MODULE.ID, 'artPickerRoot');
  }

  /**
   * Sets the root directory for art selection
   * @param {string} path - The path to set as root directory
   * @static
   */
  static set rootDirectory(path) {
    if (!path) return;
    game.settings.set(MODULE.ID, 'artPickerRoot', path);
  }

  /**
   * Opens a file picker to select character portrait art
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _target - The element that triggered the event
   * @returns {boolean|void} Result of Tokenizer handling, if applicable
   * @static
   */
  static selectCharacterArt(event, _target) {
    if (HM.COMPAT?.TOKENIZER && game.settings.get(MODULE.ID, 'tokenizerCompatibility') && !event.shiftKey) return CharacterArtPicker.handleTokenizer(event, 'character');
    const rootDir = CharacterArtPicker.rootDirectory;
    const inputField = document.getElementById('character-art-path');
    if (!inputField) return;
    const pickerConfig = {
      type: 'image',
      current: inputField.value || rootDir,
      root: rootDir,
      callback: (path) => {
        inputField.value = path;
        inputField.dispatchEvent(new Event('change', { bubbles: true }));
        if (document.getElementById('link-token-art')?.checked) {
          const tokenInput = document.getElementById('token-art-path');
          if (tokenInput) {
            tokenInput.value = path;
            tokenInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }
    };
    new foundry.applications.apps.FilePicker.implementation(pickerConfig).render(true);
  }

  /**
   * Opens a file picker to select token art
   * @param {Event} event - The triggering event
   * @param {HTMLElement} _target - The element that triggered the event
   * @returns {boolean|void} Result of Tokenizer handling, if applicable
   * @static
   */
  static selectTokenArt(event, _target) {
    if (HM.COMPAT?.TOKENIZER && game.settings.get(MODULE.ID, 'tokenizerCompatibility') && !event.shiftKey) return CharacterArtPicker.handleTokenizer(event, 'token');
    const rootDir = CharacterArtPicker.rootDirectory;
    const inputField = document.getElementById('token-art-path');
    if (!inputField) return;
    const pickerConfig = {
      type: 'image',
      current: inputField.value || rootDir,
      root: rootDir,
      callback: (path) => {
        inputField.value = path;
        inputField.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    new foundry.applications.apps.FilePicker.implementation(pickerConfig).render(true);
  }

  /**
   * Opens a file picker to select player avatar art
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _target - The element that triggered the event
   * @static
   */
  static selectPlayerAvatar(_event, _target) {
    const rootDir = CharacterArtPicker.rootDirectory;
    const inputField = document.getElementById('player-avatar-path');
    if (!inputField) return;
    const pickerConfig = {
      type: 'image',
      current: inputField.value || rootDir,
      root: rootDir,
      callback: (path) => {
        inputField.value = path;
        inputField.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    new foundry.applications.apps.FilePicker.implementation(pickerConfig).render(true);
  }

  /**
   * Handles integration with the Tokenizer module for character and token art
   * @param {Event} event - The triggering event
   * @param {string} type - The type of art being processed ('character' or 'token')
   * @returns {boolean} Success status of the Tokenizer interaction
   * @static
   */
  static handleTokenizer(event, type) {
    event.preventDefault();
    const inputField = document.getElementById(`${type}-art-path`);
    if (!inputField) return false;
    const characterName = document.getElementById('character-name')?.value || game.user.name;
    const tokenizer = game.modules.get('vtta-tokenizer')?.api || window.Tokenizer;
    if (!tokenizer) {
      log(1, 'Tokenizer API not found');
      return false;
    }
    tokenizer.launch({ name: characterName, type: 'pc' }, (response) => {
      if (type === 'character' && response.avatarFilename) {
        inputField.value = response.avatarFilename;
        inputField.dispatchEvent(new Event('change', { bubbles: true }));
        if ((document.getElementById('link-token-art')?.checked || type === 'token') && response.tokenFilename) {
          const tokenInput = document.getElementById('token-art-path');
          if (tokenInput) {
            tokenInput.value = response.tokenFilename;
            tokenInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      } else if (type === 'token' && response.tokenFilename) {
        inputField.value = response.tokenFilename;
        inputField.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    return true;
  }
}
