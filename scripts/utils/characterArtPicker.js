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
  static selectCharacterArt(_event, _target) {
    try {
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
  static selectTokenArt(_event, _target) {
    try {
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

  /* -------------------------------------------- */
  /*  Static Protected Methods                    */
  /* -------------------------------------------- */

  /**
   * Toggles visibility of token art row based on checkbox state
   * @returns {void}
   * @protected
   * @static
   */
  static _toggleTokenArtRowVisibility() {
    try {
      const tokenArtRow = document.getElementById('token-art-row');
      const linkCheckbox = document.getElementById('link-token-art');

      if (!tokenArtRow || !linkCheckbox) {
        HM.log(2, 'Token art row or link checkbox not found');
        return;
      }

      const isLinked = linkCheckbox.checked;
      tokenArtRow.style.display = isLinked ? 'none' : 'flex';

      if (isLinked) {
        const tokenInput = document.getElementById('token-art-path');
        const characterInput = document.getElementById('character-art-path');

        if (tokenInput && characterInput) {
          tokenInput.value = characterInput.value;
          tokenInput.dispatchEvent(new Event('change', { bubbles: true }));
          HM.log(3, 'Token art path updated due to linking');
        }
      }
    } catch (error) {
      HM.log(1, 'Error toggling token art row visibility:', error);
    }
  }
}
