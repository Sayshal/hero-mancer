import { HM } from '../utils/index.js';

/**
 * Handles image selection for character, token, and player art
 * @class
 */
export class CharacterArtPicker {
  /* -------------------------------------------- */
  /*  Static Getters & Setters                    */
  /* -------------------------------------------- */

  /**
   * Gets the root directory for art selection
   * @returns {string} The configured root directory path
   * @static
   */
  static get rootDirectory() {
    return game.settings.get(HM.ID, 'artPickerRoot');
  }

  /**
   * Sets the root directory for art selection
   * @param {string} path - The path to set as root directory
   * @static
   */
  static set rootDirectory(path) {
    if (!path) {
      HM.log(2, 'Attempted to set rootDirectory to empty path');
      return;
    }
    game.settings.set(HM.ID, 'artPickerRoot', path);
    HM.log(3, `rootDirectory setting updated to: ${path}`);
  }

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Opens a file picker to select character portrait art
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _target - The element that triggered the event
   * @static
   */
  static selectCharacterArt(event, _target) {
    try {
      // Handle Tokenizer if active and shift key is not pressed
      // Handle Tokenizer if active, enabled in settings, and shift key is not pressed
      if (HM.COMPAT?.TOKENIZER && game.settings.get(HM.ID, 'tokenizerCompatibility') && !event.shiftKey) {
        return CharacterArtPicker.handleTokenizer(event, 'character');
      }

      // Original file picker logic
      const rootDir = CharacterArtPicker.rootDirectory;
      const inputField = document.getElementById('character-art-path');

      if (!inputField) {
        HM.log(2, 'Character art input field not found');
        return;
      }

      const currentPath = inputField.value || rootDir;

      HM.log(3, 'Creating FilePicker with paths:', {
        currentPath,
        rootDir
      });

      const pickerConfig = {
        type: 'image',
        current: currentPath,
        root: rootDir,
        callback: (path) => {
          try {
            // Update character art path
            inputField.value = path;
            inputField.dispatchEvent(new Event('change', { bubbles: true }));

            // Update portrait preview
            const portraitImg = document.querySelector('.character-portrait img');
            if (portraitImg) {
              portraitImg.src = path;
            }

            // Update token art if linked
            if (document.getElementById('link-token-art')?.checked) {
              const tokenInput = document.getElementById('token-art-path');
              if (tokenInput) {
                tokenInput.value = path;
                tokenInput.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          } catch (error) {
            HM.log(1, 'Error updating character art:', error);
          }
        }
      };

      const filepicker = new FilePicker(pickerConfig);
      filepicker.render(true);
    } catch (error) {
      HM.log(1, 'Error opening character art picker:', error);
      ui.notifications.error('hm.errors.art-picker-failed', { localize: true });
    }
  }

  /**
   * Opens a file picker to select token art
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _target - The element that triggered the event
   * @static
   */
  static selectTokenArt(event, _target) {
    try {
      // Handle Tokenizer if active and shift key is not pressed
      if (HM.COMPAT?.TOKENIZER && game.settings.get(HM.ID, 'tokenizerCompatibility') && !event.shiftKey) {
        return CharacterArtPicker.handleTokenizer(event, 'token');
      }

      // Original file picker logic remains unchanged
      const rootDir = CharacterArtPicker.rootDirectory;
      const inputField = document.getElementById('token-art-path');

      if (!inputField) {
        HM.log(2, 'Token art input field not found');
        return;
      }

      const currentPath = inputField.value || rootDir;

      HM.log(3, 'Creating FilePicker with paths:', {
        currentPath,
        rootDir
      });

      const pickerConfig = {
        type: 'image',
        current: currentPath,
        root: rootDir,
        callback: (path) => {
          try {
            inputField.value = path;
            inputField.dispatchEvent(new Event('change', { bubbles: true }));
          } catch (error) {
            HM.log(1, 'Error updating token art:', error);
          }
        }
      };

      const filepicker = new FilePicker(pickerConfig);
      filepicker.render(true);
    } catch (error) {
      HM.log(1, 'Error opening token art picker:', error);
      ui.notifications.error('hm.errors.token-art-picker-failed', { localize: true });
    }
  }

  /**
   * Opens a file picker to select player avatar art
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} _target - The element that triggered the event
   * @static
   */
  static selectPlayerAvatar(_event, _target) {
    try {
      const rootDir = CharacterArtPicker.rootDirectory;
      const inputField = document.getElementById('player-avatar-path');

      if (!inputField) {
        HM.log(2, 'Player avatar input field not found');
        return;
      }

      const currentPath = inputField.value || rootDir;

      HM.log(3, 'Creating FilePicker with paths:', {
        currentPath,
        rootDir
      });

      const pickerConfig = {
        type: 'image',
        current: currentPath,
        root: rootDir,
        callback: (path) => {
          try {
            inputField.value = path;
            inputField.dispatchEvent(new Event('change', { bubbles: true }));
          } catch (error) {
            HM.log(1, 'Error updating player avatar:', error);
          }
        }
      };

      const filepicker = new FilePicker(pickerConfig);
      filepicker.render(true);
    } catch (error) {
      HM.log(1, 'Error opening player avatar picker:', error);
      ui.notifications.error('hm.errors.avatar-picker-failed', { localize: true });
    }
  }

  /**
   * Handles integration with the Tokenizer module for character and token art
   * @static
   * @param {Event} event - The triggering event
   * @param {string} type - The type of art being processed ('character' or 'token')
   * @returns {boolean} Success status of the Tokenizer interaction
   */
  static handleTokenizer(event, type) {
    try {
      event.preventDefault();

      const inputField = document.getElementById(`${type}-art-path`);
      if (!inputField) {
        HM.log(2, `${type} art input field not found`);
        return false;
      }

      const characterName = document.getElementById('character-name')?.value || game.user.name;

      const options = {
        name: characterName,
        type: 'pc'
      };

      // Get Tokenizer API
      const tokenizer = game.modules.get('vtta-tokenizer')?.api || window.Tokenizer;
      if (!tokenizer) {
        HM.log(1, 'Tokenizer API not found');
        return false;
      }

      // Launch Tokenizer
      tokenizer.launch(options, (response) => {
        try {
          HM.log(3, 'Tokenizer response:', response);

          if (type === 'character' && response.avatarFilename) {
            // Update character art
            inputField.value = response.avatarFilename;
            inputField.dispatchEvent(new Event('change', { bubbles: true }));

            // Update portrait preview
            const portraitImg = document.querySelector('.character-portrait img');
            if (portraitImg) {
              portraitImg.src = response.avatarFilename;
            }

            // Update token if linked or if tokenFilename was returned
            if ((document.getElementById('link-token-art')?.checked || type === 'token') && response.tokenFilename) {
              const tokenInput = document.getElementById('token-art-path');
              if (tokenInput) {
                tokenInput.value = response.tokenFilename;
                tokenInput.dispatchEvent(new Event('change', { bubbles: true }));
              }
            }
          } else if (type === 'token' && response.tokenFilename) {
            // Update token art
            inputField.value = response.tokenFilename;
            inputField.dispatchEvent(new Event('change', { bubbles: true }));
          }
        } catch (error) {
          HM.log(1, `Error processing Tokenizer response for ${type}:`, error);
        }
      });

      return true;
    } catch (error) {
      HM.log(1, `Error handling Tokenizer for ${type}:`, error);
      return false;
    }
  }
}
