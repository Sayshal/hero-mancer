import { HeroMancer, HM } from './index.js';

/**
 * Handles DOM manipulation for the HeroMancer UI elements
 * @class
 */
export class HtmlManipulator {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  /** @type {HTMLButtonElement|null} Reference to the created button */
  static button = null;

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Registers the HeroMancer button in the Actors tab header
   * @throws {Error} If required DOM elements are not found
   * @static
   */
  static registerButton() {
    // First clean up any existing button state but keep the button reference
    this.#removeButtonEventListeners();

    const headerActions = document.querySelector('section[class*="actors-sidebar"] header[class*="directory-header"] div[class*="header-actions"]');
    if (!headerActions) {
      throw new Error('Header actions element not found');
    }

    // Check if button already exists in the DOM
    let existingButton = headerActions.querySelector('.hm-actortab-button');

    if (existingButton) {
      // Use the existing button
      this.button = existingButton;
    } else {
      // Create and insert new button
      this.button = this.#createButton();
      const createFolderButton = headerActions.querySelector('button[class*="create-folder"]');
      headerActions.insertBefore(this.button, createFolderButton);

      // Only add the hint if we're creating a new button
      const hiddenHint = this.#createHiddenHint();
      headerActions.appendChild(hiddenHint);
    }

    // Add listener to the button (whether existing or new)
    this.#addButtonListener();
  }

  /* -------------------------------------------- */
  /*  Static Private Methods                      */
  /* -------------------------------------------- */

  /**
   * Creates the HeroMancer button element
   * @returns {HTMLButtonElement} The created button
   * @private
   * @static
   */
  static #createButton() {
    const buttonHint = game.i18n.localize('hm.actortab-button.hint');
    const buttonName = game.i18n.localize('hm.actortab-button.name');

    const button = document.createElement('button');
    button.type = 'button';
    button.classList.add('hm-actortab-button');
    button.setAttribute('title', buttonHint);
    button.setAttribute('aria-label', buttonName);
    button.setAttribute('aria-describedby', 'hm-button-hint');
    button.setAttribute('role', 'button');
    button.innerHTML = `<i class="fa-solid fa-egg" style="color: var(--user-color)"></i> ${buttonName}`;

    return button;
  }

  /**
   * Creates the hidden hint element for screen readers
   * @returns {HTMLSpanElement} The created hint element
   * @private
   * @static
   */
  static #createHiddenHint() {
    const buttonHint = game.i18n.localize('hm.actortab-button.hint');
    const hiddenHint = document.createElement('span');
    hiddenHint.id = 'hm-button-hint';
    hiddenHint.classList.add('sr-only');
    hiddenHint.textContent = buttonHint;
    return hiddenHint;
  }

  /**
   * Adds click event listener to the button
   * @private
   * @static
   */
  static #addButtonListener() {
    const clickHandler = () => {
      if (HM.heroMancer) {
        HM.log(3, 'Cleaning up existing instance');
        HM.heroMancer.close();
        HM.heroMancer = null;
      }

      HM.heroMancer = new HeroMancer();
      HM.heroMancer.render(true);
    };

    if (this.button) {
      HM.log(3, 'Adding click listener to button');
      this.button.addEventListener('click', clickHandler);
      this.button.clickHandler = clickHandler;
    } else {
      HM.log(1, 'Button element not found');
    }
  }

  /**
   * Removes event listeners from the button element
   * @private
   * @static
   */
  static #removeButtonEventListeners() {
    if (this.button?.clickHandler) {
      this.button.removeEventListener('click', this.button.clickHandler);
      this.button.clickHandler = null;
    }
  }
}
