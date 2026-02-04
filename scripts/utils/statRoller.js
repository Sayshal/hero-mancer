import { FormValidation, HeroMancer, HeroMancerUI, HM, MODULE } from './index.js';
import { log } from './logger.mjs';

const { DialogV2 } = foundry.applications.api;

/**
 * Handles ability score rolling functionality for character creation
 * @class
 */
export class StatRoller {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  static chainRollEnabled = false;

  static isRolling = false;

  static #isSwapping = false;

  static #abilityDropdownValues = new Map();

  static #lastHandledChanges = new Map();

  /* -------------------------------------------- */
  /*  Getters                                     */
  /* -------------------------------------------- */

  /**
   * Gets available roll methods with localized names
   * @returns {object} Object with roll method localizations
   */
  get rollMethods() {
    return {
      pointBuy: game.i18n.localize('hm.app.abilities.methods.pointBuy'),
      standardArray: game.i18n.localize('hm.app.abilities.methods.standardArray'),
      manualFormula: game.i18n.localize('hm.app.abilities.methods.manual')
    };
  }

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Initiates the stat rolling process
   * @param {HTMLElement} form - The form containing the ability score input
   * @returns {Promise<void>}
   * @throws {Error} If form validation fails or rolling encounters an error
   * @static
   */
  static async rollAbilityScore(form) {
    if (this.isRolling) {
      log(2, 'Rolling already in progress, please wait');
      return;
    }

    try {
      const rollData = this.#prepareRollData(form);
      if (!rollData) return;
      if (rollData.hasExistingValue) await this.#handleExistingValue(rollData);
      else if (rollData.chainedRolls) await this.rollAllStats(rollData.rollFormula);
      else await this.rollSingleAbilityScore(rollData.rollFormula, rollData.index, rollData.input);
    } catch (error) {
      log(1, 'Error while rolling stat:', error);
      ui.notifications.error('hm.errors.roll-failed', { localize: true });
      this.isRolling = false;
    }
  }

  /**
   * Prepares data needed for rolling
   * @param {HTMLElement} form - The form containing the ability score input
   * @returns {Promise<object | null>} Roll data or null if invalid
   * @private
   * @static
   */
  static #prepareRollData(form) {
    const rollFormula = this.getAbilityScoreRollFormula();
    const chainedRolls = game.settings.get(MODULE.ID, 'chainedRolls');
    const index = form.getAttribute('data-index');
    const input = this.getAbilityInput(index);
    const hasExistingValue = !this.chainRollEnabled && input?.value?.trim() !== '';
    return { rollFormula, chainedRolls, index, input, hasExistingValue };
  }

  /**
   * Handle the case where there's an existing value in the input
   * @param {object} rollData - The prepared roll data
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #handleExistingValue(rollData) {
    await this.#promptForAbilityScoreReroll(rollData.rollFormula, rollData.chainedRolls, rollData.index, rollData.input);
  }

  /**
   * Gets the roll formula from settings or sets default
   * @returns {Promise<string>} The roll formula to use
   * @static
   */
  static getAbilityScoreRollFormula() {
    let formula = game.settings.get(MODULE.ID, 'customRollFormula');
    if (!formula?.trim()) {
      formula = '4d6kh3';
      game.settings.set(MODULE.ID, 'customRollFormula', formula);
      log(2, 'Roll formula was empty. Resetting to default:', formula);
    }
    return formula;
  }

  /**
   * Gets the ability score input element
   * @param {string} index - The ability block index
   * @returns {HTMLElement|null} The input element or null if not found
   * @static
   */
  static getAbilityInput(index) {
    if (!index) {
      log(2, 'Invalid ability index provided to getAbilityInput');
      return null;
    }

    const block = document.getElementById(`ability-block-${index}`);
    return block?.querySelector('.ability-score');
  }

  /**
   * Performs a single ability score roll
   * @param {string} rollFormula - The formula to use for rolling
   * @param {string} index - The ability block index
   * @param {HTMLElement} input - The ability score input element
   * @returns {Promise<boolean>} Success status
   * @static
   */
  static async rollSingleAbilityScore(rollFormula, index, input) {
    if (!rollFormula) {
      log(2, 'No roll formula provided for ability score roll');
      return false;
    }
    this.#updateRollingStatus(index, true);
    this.isRolling = true;
    try {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const rollResult = await this.#performRoll(rollFormula);
      if (!rollResult) return false;
      if (input) {
        input.value = rollResult;
        input.focus();
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      } else {
        log(2, `No input field found for ability index ${index}.`);
        return false;
      }
    } catch (error) {
      log(1, `Failed to roll ${rollFormula}:`, error);
      ui.notifications.error('hm.errors.roll-failed', { localize: true });
      return false;
    } finally {
      setTimeout(() => {
        this.#updateRollingStatus(index, false);
        this.isRolling = false;
        this.chainRollEnabled = false;
      }, 300);
    }
  }

  /**
   * Updates the visual status for rolling
   * @param {string} index - The ability block index
   * @param {boolean} isRolling - Whether rolling is in progress
   * @private
   * @static
   */
  static #updateRollingStatus(index, isRolling) {
    if (!index) return;
    const block = document.getElementById(`ability-block-${index}`);
    if (!block) return;
    const diceIcon = block.querySelector('.fa-dice-d6');
    if (diceIcon) {
      if (isRolling) diceIcon.classList.add('rolling');
      else diceIcon.classList.remove('rolling');
    }
  }

  /**
   * Performs a roll and constrains the result
   * @param {string} rollFormula - The formula to use for rolling
   * @returns {Promise<number|null>} The constrained roll result or null if failed
   * @private
   * @static
   */
  static async #performRoll(rollFormula) {
    try {
      const roll = new Roll(rollFormula);
      await roll.evaluate();
      if (game.dice3d && game.settings.get(MODULE.ID, 'enableDiceSoNice')) await game.dice3d.showForRoll(roll, game.user, false);
      const { MIN, MAX } = HM.ABILITY_SCORES;
      const constrainedResult = Math.max(MIN, Math.min(MAX, roll.total));
      if (roll.total !== constrainedResult) log(3, `Roll result: ${roll.total} (constrained to ${constrainedResult})`);
      else log(3, 'Roll result:', roll.total);
      return constrainedResult;
    } catch (error) {
      log(1, `Failed to evaluate roll formula "${rollFormula}":`, error);
      return null;
    }
  }

  /**
   * Rolls all ability scores in sequence
   * @param {string} rollFormula - The formula to use for rolling
   * @returns {Promise<boolean>} Success status
   * @static
   */
  static async rollAllStats(rollFormula) {
    if (!rollFormula) {
      log(2, 'No roll formula provided for ability score roll');
      return false;
    }
    this.isRolling = true;
    const blocks = this.#getAbilityBlocks();
    if (!blocks.length) {
      log(2, 'No ability blocks found for rolling');
      this.isRolling = false;
      return false;
    }
    try {
      await this.#rollAbilitiesSequentially(blocks, rollFormula);
      HeroMancerUI.updateAbilityHighlights();
      return true;
    } catch (error) {
      log(1, 'Error in chain rolling:', error);
      ui.notifications.error('hm.errors.roll-failed', { localize: true });
      return false;
    } finally {
      this.isRolling = false;
      this.chainRollEnabled = false;
    }
  }

  /**
   * Gets all ability blocks from the document
   * @returns {NodeList} Collection of ability blocks
   * @private
   * @static
   */
  static #getAbilityBlocks() {
    return document.querySelectorAll('.ability-block');
  }

  /**
   * Rolls abilities sequentially with animation
   * @param {NodeList} blocks - The ability blocks
   * @param {string} rollFormula - The formula to use for rolling
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #rollAbilitiesSequentially(blocks, rollFormula) {
    const delay = game.settings.get(MODULE.ID, 'rollDelay') || 500;
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const diceIcon = block.querySelector('.fa-dice-d6');
      const input = block.querySelector('.ability-score');
      if (diceIcon) diceIcon.classList.add('rolling');
      await new Promise((r) => setTimeout(r, 100));
      const roll = new Roll(rollFormula);
      await roll.evaluate();
      let diceAnimationPromise = Promise.resolve();
      if (game.dice3d && game.settings.get(MODULE.ID, 'enableDiceSoNice')) diceAnimationPromise = game.dice3d.showForRoll(roll, game.user, false);
      const { MIN, MAX } = HM.ABILITY_SCORES;
      const constrainedResult = Math.max(MIN, Math.min(MAX, roll.total));
      await diceAnimationPromise;
      if (input && constrainedResult !== null) {
        input.value = constrainedResult;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (diceIcon) diceIcon.classList.remove('rolling');
      if (i < blocks.length - 1) await new Promise((r) => setTimeout(r, Math.max(0, delay - 300)));
    }
  }

  /**
   * Gets the default standard array for ability scores
   * @returns {string} Comma-separated string of ability scores
   * @static
   */
  static getStandardArrayDefault() {
    const abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;
    const extraAbilities = Math.max(0, abilitiesCount - 6);
    return this.getStandardArray(extraAbilities).map(String).join(',');
  }

  /**
   * Validates and sets a custom standard array
   * @param {string} value - Comma-separated string of ability scores
   * @returns {boolean} Success status
   * @static
   */
  static validateAndSetCustomStandardArray(value) {
    if (!value) {
      log(2, 'Empty value provided for standard array');
      return false;
    }
    const abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;
    if (!/^(\d+,)*\d+$/.test(value)) {
      ui.notifications.warn('hm.settings.custom-standard-array.invalid-format', { localize: true });
      return false;
    }
    let scores = value.split(',').map((num) => {
      const parsed = parseInt(num.trim(), 10);
      return isNaN(parsed) ? 0 : parsed;
    });
    if (scores.length < abilitiesCount) {
      log(2, `Standard array too short: ${scores.length} values for ${abilitiesCount} abilities`);
      scores = this.getStandardArrayDefault().split(',').map(Number);
      ui.notifications.info('hm.settings.custom-standard-array.reset-default', { localize: true });
    }
    const { MIN, MAX } = HM.ABILITY_SCORES;
    const outOfRangeValues = scores.filter((val) => val < MIN || val > MAX);
    if (outOfRangeValues.length > 0) {
      if (outOfRangeValues.some((val) => val !== 0 && !isNaN(val))) {
        ui.notifications.warn(game.i18n.format('hm.settings.ability-scores.standard-array-fixed', { original: outOfRangeValues.join(', '), min: MIN, max: MAX }));
      }
      scores = scores.map((val) => Math.max(MIN, Math.min(MAX, val)));
    }
    const sortedScores = scores.sort((a, b) => b - a).join(',');
    game.settings.set(MODULE.ID, 'customStandardArray', sortedScores);
    return true;
  }

  /**
   * Generates a standard array of ability scores
   * @param {number} extraAbilities - Number of additional abilities beyond the base six
   * @returns {number[]} Array of ability scores in descending order
   * @static
   */
  static getStandardArray(extraAbilities) {
    const extraCount = Math.max(0, parseInt(extraAbilities) || 0);
    const standardArray = [15, 14, 13, 12, 10, 8];
    const extraValues = Array(extraCount).fill(11);
    const { MIN, MAX } = HM.ABILITY_SCORES;
    const adjustedArray = [...standardArray, ...extraValues].map((val) => Math.max(MIN, Math.min(MAX, val)));
    return adjustedArray.sort((a, b) => b - a);
  }

  /**
   * Calculates total points available for point buy
   * @returns {number} Total points available
   * @static
   */
  static getTotalPoints() {
    const customTotal = game.settings.get(MODULE.ID, 'customPointBuyTotal');
    const abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;
    const extraPoints = Math.max(0, abilitiesCount - 6) * 3;
    const defaultTotal = 27 + extraPoints;
    if (customTotal > 0 && customTotal !== defaultTotal) return customTotal;
    return defaultTotal;
  }

  /**
   * Gets the point cost for a given ability score
   * @param {number} score - The ability score
   * @returns {number} Point cost for the score
   * @static
   */
  static getPointBuyCostForScore(score) {
    const validScore = parseInt(score);
    if (isNaN(validScore)) {
      log(2, `Invalid ability score provided: ${score}`);
      return 0;
    }
    const costs = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
    const { MIN, MAX } = HM.ABILITY_SCORES;
    if (validScore < 8 && validScore >= MIN) return -1 * (8 - validScore);
    if (validScore > 15 && validScore <= MAX) return 9 + (validScore - 15) * 2;
    return costs[validScore] ?? 0;
  }

  /**
   * Calculates total points spent on ability scores
   * @param {number[]} scores - Array of selected ability scores
   * @returns {number} Total points spent
   * @static
   */
  static calculateTotalPointsSpent(scores) {
    if (!Array.isArray(scores)) {
      log(2, 'Invalid scores array provided to calculateTotalPointsSpent');
      return 0;
    }
    const { MIN } = HM.ABILITY_SCORES;
    let total = 0;
    scores.forEach((score) => {
      const validScore = parseInt(score);
      if (isNaN(validScore)) return;
      if (MIN > 8) {
        const standardMinCost = this.getPointBuyCostForScore(MIN) - this.getPointBuyCostForScore(8);
        total += this.getPointBuyCostForScore(validScore) - standardMinCost;
      } else {
        total += this.getPointBuyCostForScore(validScore);
      }
    });
    return total;
  }

  /**
   * Builds ability scores data for rendering context
   * @returns {Array<object>} Array of ability data objects
   * @static
   */
  static buildAbilitiesContext() {
    return Object.entries(CONFIG.DND5E.abilities).map(([key, value]) => {
      let abbreviation = value.abbreviation;
      let fullKey = value.fullKey;
      if (!abbreviation) {
        log(2, `Ability "${key}" is missing 'abbreviation' property. Using key as fallback. You should report this to the developer who added ${key}.`);
        abbreviation = key.substr(0, 3);
      }
      if (!fullKey) {
        log(2, `Hero Mancer: Ability "${key}" is missing 'fullKey' property. Using label as fallback. You should report this to the developer who added ${key}.`);
        fullKey = value.label || key;
      }
      return { key, abbreviation: abbreviation.toUpperCase(), fullKey: fullKey.toUpperCase(), label: value.label.toUpperCase(), currentScore: HM.ABILITY_SCORES.DEFAULT };
    });
  }

  /**
   * Gets and validates the current dice rolling method
   * @returns {string} The validated dice rolling method
   * @static
   */
  static getDiceRollingMethod() {
    let diceRollingMethod = game.settings.get(MODULE.ID, 'diceRollingMethod');
    const allowedMethods = game.settings.get(MODULE.ID, 'allowedMethods');
    const methodMapping = { standardArray: 'standardArray', pointBuy: 'pointBuy', manual: 'manualFormula' };
    const validMethods = Object.entries(allowedMethods)
      .filter(([, enabled]) => enabled)
      .map(([key]) => methodMapping[key])
      .filter(Boolean);
    if (!diceRollingMethod || !validMethods.includes(diceRollingMethod)) {
      diceRollingMethod = validMethods[0];
      game.settings.set(MODULE.ID, 'diceRollingMethod', diceRollingMethod).catch((err) => log(1, 'Failed to update diceRollingMethod setting:', err));
      log(3, `Invalid dice rolling method - falling back to '${diceRollingMethod}'`);
    }
    return diceRollingMethod;
  }

  /**
   * Gets the standard array for ability scores
   * @param {string} [diceRollingMethod] - Optional pre-validated dice rolling method
   * @returns {Array} Array of ability score values
   * @static
   */
  static getStandardArrayValues(diceRollingMethod) {
    const abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;
    const extraAbilities = abilitiesCount > 6 ? abilitiesCount - 6 : 0;
    const { MIN, MAX } = HM.ABILITY_SCORES;
    if (diceRollingMethod === 'standardArray') {
      const customArray = game.settings.get(MODULE.ID, 'customStandardArray');
      if (customArray) {
        const parsedArray = customArray.split(',').map(Number);
        if (parsedArray.length >= abilitiesCount) return parsedArray.map((val) => Math.max(MIN, Math.min(MAX, val)));
      }
    }
    const standardArray = this.getStandardArray(extraAbilities);
    return standardArray.map((val) => Math.max(MIN, Math.min(MAX, val)));
  }

  /**
   * Adjusts an ability score in response to UI interaction
   * @param {Event} _event - The triggering event
   * @param {HTMLElement} element - The button element
   * @static
   */
  static adjustScore(_event, element) {
    if (!element) return;
    const index = parseInt(element.getAttribute('data-ability-index'), 10);
    if (isNaN(index)) return;
    const adjustment = parseInt(element.getAttribute('data-adjust'), 10) || 0;
    StatRoller.changeAbilityScoreValue(index, adjustment, HeroMancer.selectedAbilities);
  }

  /**
   * Initialize tracking of ability dropdown values
   * @static
   */
  static initializeAbilityDropdownTracking() {
    this.#abilityDropdownValues.clear();
    document.querySelectorAll('.ability-dropdown').forEach((dropdown, i) => {
      this.#abilityDropdownValues.set(i, dropdown.value);
    });
  }

  /**
   * Handle ability dropdown change events
   * @param {Event} event - The change event
   * @param {string} diceRollingMethod - Current dice rolling method
   * @static
   */
  static handleAbilityDropdownChange(event, diceRollingMethod) {
    if (!event?.target) return;
    const dropdown = event.target;
    const index = parseInt(dropdown.dataset.index, 10);
    if (isNaN(index)) return;
    const newValue = dropdown.value;
    const lastChange = this.#lastHandledChanges.get(index);
    if (lastChange?.value === newValue && Date.now() - lastChange.time < 50) return;
    this.#lastHandledChanges.set(index, { value: newValue, time: Date.now() });
    const originalValue = this.#abilityDropdownValues.get(index) || '';
    const abilityDropdowns = document.querySelectorAll('.ability-dropdown');
    const selectedValues = Array.from(abilityDropdowns).map((d) => d.value);
    if (diceRollingMethod === 'manualFormula') {
      this.#handleManualFormulaDropdown(dropdown, abilityDropdowns, selectedValues, originalValue);
    } else if (diceRollingMethod === 'standardArray') {
      this.#handleStandardArrayDropdown(dropdown, index, abilityDropdowns, selectedValues, game.settings.get(MODULE.ID, 'statGenerationSwapMode'), originalValue);
    } else if (diceRollingMethod === 'pointBuy') {
      this.#handlePointBuyDropdown(dropdown, index, abilityDropdowns, selectedValues, this.getTotalPoints());
    }
    this.#abilityDropdownValues.set(index, newValue);
  }

  /**
   * Handle dropdown change for manual formula method
   * @param {HTMLElement} dropdown - The changed dropdown
   * @param {NodeList} abilityDropdowns - All ability dropdowns
   * @param {Array} selectedValues - Currently selected values
   * @param {string} originalValue - The previous value before change
   * @private
   * @static
   */
  static #handleManualFormulaDropdown(dropdown, abilityDropdowns, selectedValues, originalValue) {
    const value = dropdown.value;
    const index = parseInt(dropdown.dataset.index, 10);
    const scoreInput = dropdown.parentElement.querySelector('.ability-score');
    dropdown.setAttribute('name', `abilities[${value}]`);
    if (scoreInput) scoreInput.setAttribute('name', `abilities[${value}]-score`);
    if (this.#isSwapping) return;
    if (value) {
      const duplicateIndex = selectedValues.findIndex((val, i) => i !== index && val === value);
      if (duplicateIndex !== -1) {
        try {
          this.#isSwapping = true;
          abilityDropdowns[duplicateIndex].value = originalValue;
          selectedValues[duplicateIndex] = originalValue;
          this.#abilityDropdownValues.set(duplicateIndex, originalValue);
          this.#lastHandledChanges.set(duplicateIndex, { value: originalValue, time: Date.now() });
        } finally {
          setTimeout(() => {
            this.#isSwapping = false;
          }, 0);
        }
      }
    }
    this.updateAbilityDropdownsVisualState(abilityDropdowns, selectedValues);
  }

  /**
   * Handle dropdown change for standard array method
   * @param {HTMLElement} dropdown - The changed dropdown
   * @param {number} index - The dropdown index
   * @param {NodeList} abilityDropdowns - All ability dropdowns
   * @param {Array} selectedValues - Currently selected values
   * @param {boolean} swapMode - Should score swap with previously selected
   * @param {Map} originalValue - Index of current values before manipulation
   * @private
   * @static
   */
  static #handleStandardArrayDropdown(dropdown, index, abilityDropdowns, selectedValues, swapMode, originalValue) {
    if (this.#isSwapping) return;
    const newValue = dropdown.value;
    const standardArrayValues = this.getStandardArrayValues('standardArray');
    const availableOccurrences = {};
    standardArrayValues.forEach((val) => {
      availableOccurrences[val] = (availableOccurrences[val] || 0) + 1;
    });
    if (swapMode && newValue) {
      const duplicateIndex = selectedValues.findIndex((value, i) => i !== index && value === newValue);
      if (duplicateIndex !== -1) {
        try {
          this.#isSwapping = true;
          abilityDropdowns[duplicateIndex].value = originalValue;
          selectedValues[duplicateIndex] = originalValue;
          this.#abilityDropdownValues.set(duplicateIndex, originalValue);
          this.#lastHandledChanges.set(duplicateIndex, { value: originalValue, time: Date.now() });
        } finally {
          setTimeout(() => {
            this.#isSwapping = false;
          }, 0);
        }
      }
    } else if (newValue) {
      const currentSelectionCount = selectedValues.filter((v) => v === newValue).length;
      const maxAllowed = availableOccurrences[newValue] || 1;
      if (currentSelectionCount > maxAllowed) {
        const duplicateIndex = selectedValues.findIndex((value, i) => i !== index && value === newValue);
        if (duplicateIndex !== -1) {
          abilityDropdowns[duplicateIndex].value = '';
          selectedValues[duplicateIndex] = '';
          this.#abilityDropdownValues.set(duplicateIndex, '');
          this.#lastHandledChanges.set(duplicateIndex, { value: '', time: Date.now() });
        }
      }
    }
    selectedValues[index] = newValue;
    this.updateAbilityDropdownsVisualState(abilityDropdowns, selectedValues);
  }

  /**
   * Handle dropdown change for point buy method
   * @param {HTMLElement} dropdown - The changed dropdown
   * @param {number} index - The dropdown index
   * @param {NodeList} abilityDropdowns - All ability dropdowns
   * @param {Array} selectedValues - Currently selected values
   * @param {number} totalPoints - Total points available
   * @private
   * @static
   */
  static #handlePointBuyDropdown(dropdown, index, abilityDropdowns, selectedValues, totalPoints) {
    selectedValues[index] = dropdown.value || '';
    this.refreshAbilityDropdownsState(abilityDropdowns, selectedValues, totalPoints, 'pointBuy');
  }

  /* -------------------------------------------- */
  /*  Static Private Methods                      */
  /* -------------------------------------------- */

  /**
   * Shows the reroll confirmation dialog
   * @param {string} rollFormula - The formula to use for rolling
   * @param {boolean} chainedRolls - Whether chained rolls are enabled
   * @param {string} index - The ability block index
   * @param {HTMLElement} input - The ability score input element
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #promptForAbilityScoreReroll(rollFormula, chainedRolls, index, input) {
    const dialogConfig = this.#createRerollDialogConfig(rollFormula, chainedRolls, index, input);
    const dialog = new DialogV2(dialogConfig);
    dialog.render(true);
  }

  /**
   * Creates the configuration for the reroll dialog
   * @param {string} rollFormula - The formula to use for rolling
   * @param {boolean} chainedRolls - Whether chained rolls are enabled
   * @param {string} index - The ability block index
   * @param {HTMLElement} input - The ability score input element
   * @returns {object} Dialog configuration
   * @private
   * @static
   */
  static #createRerollDialogConfig(rollFormula, chainedRolls, index, input) {
    return {
      window: { title: game.i18n.localize('hm.dialogs.reroll.title'), icon: 'fas fa-dice-d6' },
      content: this.#getRerollDialogContent(chainedRolls),
      classes: ['hm-reroll-dialog'],
      buttons: this.#getRerollDialogButtons(rollFormula, chainedRolls, index, input),
      rejectClose: false,
      modal: true,
      position: { width: 400 }
    };
  }

  /**
   * Gets the content for the reroll dialog
   * @param {boolean} chainedRolls - Whether chained rolls are enabled
   * @returns {string} The HTML content for the dialog
   * @private
   * @static
   */
  static #getRerollDialogContent(chainedRolls) {
    const chainRollCheckbox = chainedRolls
      ? `
    <div class="form-group">
      <label class="checkbox">
        <input type="checkbox" name="chainRoll" ${this.chainRollEnabled ? 'checked' : ''}>
        ${game.i18n.localize('hm.dialogs.reroll.chain-roll-label')}
      </label>
    </div>
  `
      : '';

    return `
    <form class="dialog-form">
      <p>${game.i18n.localize('hm.dialogs.reroll.content')}</p>
      ${chainRollCheckbox}
    </form>
  `;
  }

  /**
   * Gets the button configuration for the reroll dialog
   * @param {string} rollFormula - The formula to use for rolling
   * @param {boolean} chainedRolls - Whether chained rolls are enabled
   * @param {string} index - The ability block index
   * @param {HTMLElement} input - The ability score input element
   * @returns {object[]} The button configurations
   * @private
   * @static
   */
  static #getRerollDialogButtons(rollFormula, chainedRolls, index, input) {
    return [
      {
        action: 'confirm',
        label: game.i18n.localize('hm.dialogs.reroll.confirm'),
        icon: 'fas fa-check',
        default: true,
        async callback(_event, button, dialog) {
          await StatRoller.#handleRerollConfirmation(button, dialog, rollFormula, chainedRolls, index, input);
        }
      },
      { action: 'cancel', label: game.i18n.localize('hm.dialogs.reroll.cancel'), icon: 'fas fa-times' }
    ];
  }

  /**
   * Handle confirmation of the reroll dialog
   * @param {HTMLElement} button - The clicked button
   * @param {DialogV2} dialog - The dialog instance
   * @param {string} rollFormula - The formula to use for rolling
   * @param {boolean} chainedRolls - Whether chained rolls are enabled
   * @param {string} index - The ability block index
   * @param {HTMLElement} input - The ability score input element
   * @returns {Promise<void>}
   * @private
   * @static
   */
  static async #handleRerollConfirmation(button, dialog, rollFormula, chainedRolls, index, input) {
    const chainRollCheckbox = button.form.elements.chainRoll;
    StatRoller.chainRollEnabled = chainRollCheckbox?.checked ?? false;
    dialog.close();
    if (StatRoller.chainRollEnabled && chainedRolls) await StatRoller.rollAllStats(rollFormula);
    else await StatRoller.rollSingleAbilityScore(rollFormula, index, input);
  }

  /* -------------------------------------------- */
  /*  Ability UI Methods                          */
  /* -------------------------------------------- */

  /**
   * Updates the display of remaining points in the abilities tab
   * @param {number} remainingPoints - The number of points remaining to spend
   * @static
   */
  static updateRemainingPointsDisplay(remainingPoints) {
    const abilitiesTab = document.querySelector(".tab[data-tab='abilities']");
    if (!abilitiesTab?.classList.contains('active')) return;
    const remainingPointsElement = document.getElementById('remaining-points');
    const totalPoints = this.getTotalPoints();
    if (remainingPointsElement) {
      remainingPointsElement.innerHTML = remainingPoints;
      this.#updatePointsColor(remainingPointsElement, remainingPoints, totalPoints);
    }
  }

  /**
   * Adjusts ability score up or down within valid range and point limits
   * @param {number} index - The index of the ability score to adjust
   * @param {number} change - The amount to change the score by (positive or negative)
   * @param {number[]} selectedAbilities - Array of current ability scores
   * @static
   */
  static changeAbilityScoreValue(index, change, selectedAbilities) {
    if (!Array.isArray(selectedAbilities)) {
      log(1, 'selectedAbilities must be an array');
      return;
    }
    const abilityScoreElement = document.getElementById(`ability-score-${index}`);
    const currentScore = parseInt(abilityScoreElement.innerHTML, 10);
    const { MIN, MAX } = HM.ABILITY_SCORES;
    const newScore = Math.min(MAX, Math.max(MIN, currentScore + change));
    const totalPoints = this.getTotalPoints();
    const pointsSpent = this.calculateTotalPointsSpent(selectedAbilities);
    if (change > 0 && pointsSpent + this.getPointBuyCostForScore(newScore) - this.getPointBuyCostForScore(currentScore) > totalPoints) {
      log(2, 'Not enough points remaining to increase this score.');
      return;
    }
    if (newScore !== currentScore) {
      abilityScoreElement.innerHTML = newScore;
      selectedAbilities[index] = newScore;
      const updatedPointsSpent = this.calculateTotalPointsSpent(selectedAbilities);
      const remainingPoints = totalPoints - updatedPointsSpent;
      this.updateRemainingPointsDisplay(remainingPoints);
      this.updatePlusButtonState(selectedAbilities, remainingPoints);
      this.updateMinusButtonState(selectedAbilities);
      const form = abilityScoreElement.closest('form') || abilityScoreElement.closest('.hm-app');
      if (form) FormValidation.checkMandatoryFields(form);
    }
  }

  /**
   * Updates the state of plus buttons based on available points and maximum scores
   * @param {number[]} selectedAbilities - Array of current ability scores
   * @param {number} remainingPoints - Points available to spend
   * @static
   */
  static updatePlusButtonState(selectedAbilities, remainingPoints) {
    const updates = [];
    const { MAX } = HM.ABILITY_SCORES;
    document.querySelectorAll('.plus-button').forEach((button, index) => {
      const currentScore = selectedAbilities[index];
      const pointCostForNextIncrease = this.getPointBuyCostForScore(currentScore + 1) - this.getPointBuyCostForScore(currentScore);
      const shouldDisable = currentScore >= MAX || remainingPoints < pointCostForNextIncrease;
      if (button.disabled !== shouldDisable) updates.push(() => (button.disabled = shouldDisable));
      const inputElement = document.getElementById(`ability-${index}-input`);
      if (inputElement && inputElement.value !== String(currentScore)) updates.push(() => (inputElement.value = currentScore));
    });
    if (updates.length) requestAnimationFrame(() => updates.forEach((update) => update()));
  }

  /**
   * Updates the state of minus buttons based on minimum allowed scores
   * @param {number[]} selectedAbilities - Array of current ability scores
   * @static
   */
  static updateMinusButtonState(selectedAbilities) {
    const updates = [];
    const { MIN } = HM.ABILITY_SCORES;
    document.querySelectorAll('.minus-button').forEach((button, index) => {
      const currentScore = selectedAbilities[index];
      const shouldDisable = currentScore <= MIN;
      if (button.disabled !== shouldDisable) updates.push(() => (button.disabled = shouldDisable));
      const inputElement = document.getElementById(`ability-${index}-input`);
      if (inputElement && inputElement.value !== String(currentScore)) updates.push(() => (inputElement.value = currentScore));
    });

    if (updates.length) requestAnimationFrame(() => updates.forEach((update) => update()));
  }

  /**
   * Updates the visual state of ability dropdowns based on selected values
   * @param {NodeList} abilityDropdowns - Ability dropdown elements
   * @param {string[]} selectedValues - Currently selected values
   * @static
   */
  static updateAbilityDropdownsVisualState(abilityDropdowns, selectedValues) {
    const valueOccurrences = {};
    if (abilityDropdowns.length > 0) {
      const firstDropdown = abilityDropdowns[0];
      Array.from(firstDropdown.options).forEach((option) => {
        if (option.value) valueOccurrences[option.value] = (valueOccurrences[option.value] || 0) + 1;
      });
    }
    const selectedCounts = {};
    selectedValues.forEach((value) => {
      if (!value) return;
      selectedCounts[value] = (selectedCounts[value] || 0) + 1;
    });
    abilityDropdowns.forEach((dropdown) => {
      Array.from(dropdown.options).forEach((option) => {
        option.disabled = false;
        option.classList.remove('hm-used-elsewhere');
        if (!option.value) return;
        const value = option.value;
        const maxOccurrences = valueOccurrences[value] || 0;
        const selectedCount = selectedCounts[value] || 0;
        const isUsedUp = selectedCount >= maxOccurrences;
        const isSelectedHere = dropdown.value === value;
        if (isUsedUp && !isSelectedHere) option.classList.add('hm-used-elsewhere');
      });
    });
  }

  /**
   * Refreshes the ability dropdown state for point buy method
   * @param {NodeList} abilityDropdowns - Ability dropdown elements
   * @param {string[]} selectedValues - Currently selected values
   * @param {number} _totalPoints - Total points available (unused)
   * @param {string} _method - Current roll method (unused)
   * @static
   */
  static refreshAbilityDropdownsState(abilityDropdowns, selectedValues, _totalPoints, _method) {
    this.updateAbilityDropdownsVisualState(abilityDropdowns, selectedValues);
  }

  /**
   * Updates the color of the remaining points display based on percentage remaining
   * @param {HTMLElement} element - The element to update
   * @param {number} remainingPoints - Current remaining points
   * @param {number} totalPoints - Total available points
   * @private
   * @static
   */
  static #updatePointsColor(element, remainingPoints, totalPoints) {
    if (!element) return;
    const percentage = (remainingPoints / totalPoints) * 100;
    const hue = Math.max(0, Math.min(120, (percentage * 120) / 100));
    element.style.color = `hsl(${hue}, 100%, 35%)`;
  }
}
