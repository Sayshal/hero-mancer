import { HM, HeroMancer, Listeners, SummaryManager } from './index.js';

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
      HM.log(2, 'Rolling already in progress, please wait');
      return;
    }

    try {
      const rollFormula = await this.getAbilityScoreRollFormula();
      const chainedRolls = await game.settings.get(HM.ID, 'chainedRolls');
      const index = form.getAttribute('data-index');
      const input = this.getAbilityInput(index);
      const hasExistingValue = !this.chainRollEnabled && input?.value?.trim() !== '';

      if (hasExistingValue) {
        await this.#promptForAbilityScoreReroll(rollFormula, chainedRolls, index, input);
      } else if (chainedRolls) {
        await this.rollAllStats(rollFormula);
      } else {
        await this.rollSingleAbilityScore(rollFormula, index, input);
      }
    } catch (error) {
      HM.log(1, 'Error while rolling stat:', error);
      ui.notifications.error('hm.errors.roll-failed', { localize: true });
      this.isRolling = false;
    }
  }

  /**
   * Gets the roll formula from settings or sets default
   * @returns {Promise<string>} The roll formula to use
   * @static
   */
  static async getAbilityScoreRollFormula() {
    let formula = game.settings.get(HM.ID, 'customRollFormula');
    if (!formula?.trim()) {
      formula = '4d6kh3';
      await game.settings.set(HM.ID, 'customRollFormula', formula);
      HM.log(2, 'Roll formula was empty. Resetting to default:', formula);
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
    const block = document.getElementById(`ability-block-${index}`);
    return block?.querySelector('.ability-score');
  }

  /**
   * Checks if any ability scores have existing values
   * @returns {boolean} True if any ability scores have values
   * @static
   */
  static hasExistingValues() {
    return Array.from(document.querySelectorAll('.ability-score')).some((input) => input.value?.trim() !== '');
  }

  /**
   * Performs a single ability score roll
   * @param {string} rollFormula - The formula to use for rolling
   * @param {string} index - The ability block index
   * @param {HTMLElement} input - The ability score input element
   * @returns {Promise<void>}
   * @static
   */
  static async rollSingleAbilityScore(rollFormula, index, input) {
    try {
      const roll = new Roll(rollFormula);
      await roll.evaluate();

      // Apply min/max constraints to roll result
      const { MIN, MAX } = HM.ABILITY_SCORES;
      const constrainedResult = Math.max(MIN, Math.min(MAX, roll.total));

      // Log original and constrained values if different
      if (roll.total !== constrainedResult) {
        HM.log(3, `Roll result: ${roll.total} (constrained to ${constrainedResult})`);
      } else {
        HM.log(3, 'Roll result:', roll.total);
      }

      if (input) {
        input.value = constrainedResult;
        input.focus();
      } else {
        HM.log(2, `No input field found for ability index ${index}.`);
      }
      this.chainRollEnabled = false;
    } catch (error) {
      HM.log(1, `Failed to roll ${rollFormula}:`, error);
      ui.notifications.error('hm.errors.roll-failed', { localize: true });
    }
  }

  /**
   * Rolls all ability scores in sequence
   * @param {string} rollFormula - The formula to use for rolling
   * @returns {Promise<void>}
   * @static
   */
  static async rollAllStats(rollFormula) {
    const blocks = document.querySelectorAll('.ability-block');
    const delay = game.settings.get(HM.ID, 'rollDelay') || 500;
    this.isRolling = true;
    const { MIN, MAX } = HM.ABILITY_SCORES;

    try {
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        try {
          const roll = new Roll(rollFormula);
          await roll.evaluate();

          // Apply min/max constraints
          const constrainedResult = Math.max(MIN, Math.min(MAX, roll.total));

          const input = block.querySelector('.ability-score');
          if (input) {
            input.value = constrainedResult;
            input.focus();

            const diceIcon = block.querySelector('.fa-dice-d6');
            if (diceIcon) {
              diceIcon.classList.add('rolling');
              setTimeout(() => diceIcon.classList.remove('rolling'), delay - 100);
            }
          }

          if (i < blocks.length - 1) {
            await new Promise((resolve) => {
              setTimeout(resolve, delay);
            });
          }
        } catch (error) {
          HM.log(1, `Error rolling for ability ${i}:`, error);
          // Continue with the next ability
        }
      }
      SummaryManager.updateAbilitiesSummary();
    } catch (error) {
      HM.log(1, 'Error in chain rolling:', error);
      ui.notifications.error('hm.errors.roll-failed', { localize: true });
    } finally {
      this.isRolling = false;
      this.chainRollEnabled = false;
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
   * @static
   */
  static validateAndSetCustomStandardArray(value) {
    const abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;

    if (!/^(\d+,)*\d+$/.test(value)) {
      ui.notifications.warn('hm.settings.custom-standard-array.invalid-format', { localize: true });
      return;
    }

    let scores = value.split(',').map(Number);
    if (scores.length < abilitiesCount) {
      scores = this.getStandardArrayDefault().split(',').map(Number);
      ui.notifications.info('hm.settings.custom-standard-array.reset-default', { localize: true });
    }

    // Check values against min/max
    const { MIN, MAX } = HM.ABILITY_SCORES;
    const outOfRangeValues = scores.filter((val) => val < MIN || val > MAX);

    if (outOfRangeValues.length > 0) {
      // Only show the warning if there are actual values to adjust
      if (outOfRangeValues.some((val) => val !== 0 && !isNaN(val))) {
        ui.notifications.warn(
          game.i18n.format('hm.settings.ability-scores.standard-array-fixed', {
            original: outOfRangeValues.join(', '),
            min: MIN,
            max: MAX
          })
        );
      }

      // Adjust values to stay within constraints
      scores = scores.map((val) => Math.max(MIN, Math.min(MAX, val)));
    }

    game.settings.set(HM.ID, 'customStandardArray', scores.sort((a, b) => b - a).join(','));
  }

  /**
   * Generates a standard array of ability scores
   * @param {number} extraAbilities - Number of additional abilities beyond the base six
   * @returns {number[]} Array of ability scores in descending order
   * @static
   */
  static getStandardArray(extraAbilities) {
    // Use default D&D 5e standard array adjusted for constraints
    const standardArray = [15, 14, 13, 12, 10, 8];
    const extraValues = Array(extraAbilities).fill(11);

    // Apply min/max constraints
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
    const customTotal = game.settings.get(HM.ID, 'customPointBuyTotal');
    const abilitiesCount = Object.keys(CONFIG.DND5E.abilities).length;
    const extraPoints = Math.max(0, abilitiesCount - 6) * 3;
    const defaultTotal = 27 + extraPoints;

    // Only use customTotal if it's greater than 0 (indicating it was set)
    // and different from the default calculation
    if (customTotal > 0 && customTotal !== defaultTotal) {
      return customTotal;
    }

    return defaultTotal;
  }

  /**
   * Gets the point cost for a given ability score
   * @param {number} score - The ability score (8-15)
   * @returns {number} Point cost for the score
   * @static
   */
  static getPointBuyCostForScore(score) {
    const costs = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };

    // Handle scores outside the standard scale but within our min/max
    const { MIN, MAX } = HM.ABILITY_SCORES;

    // For scores lower than standard minimum
    if (score < 8 && score >= MIN) {
      // Negative costs for lower scores (saves points)
      return -1 * (8 - score);
    }

    // For scores higher than standard maximum
    if (score > 15 && score <= MAX) {
      // Exponential cost increase for higher scores
      return 9 + (score - 15) * 2;
    }

    return costs[score] ?? 0;
  }

  /**
   * Calculates total points spent on ability scores
   * @param {number[]} scores - Array of selected ability scores
   * @returns {number} Total points spent
   * @static
   */
  static calculateTotalPointsSpent(scores) {
    const { MIN } = HM.ABILITY_SCORES;
    let total = 0;

    scores.forEach((score) => {
      // When MIN is higher than standard 8, adjust total calculation
      if (MIN > 8) {
        // Calculate cost as if starting from standard minimum
        const standardMinCost = this.getPointBuyCostForScore(MIN) - this.getPointBuyCostForScore(8);
        total += this.getPointBuyCostForScore(score) - standardMinCost;
      } else {
        total += this.getPointBuyCostForScore(score);
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
    return Object.entries(CONFIG.DND5E.abilities).map(([key, value]) => ({
      key,
      abbreviation: value.abbreviation.toUpperCase(),
      fullKey: value.fullKey.toUpperCase(),
      currentScore: HM.ABILITY_SCORES.DEFAULT
    }));
  }

  /**
   * Gets available roll methods with localized names
   * @returns {Object} Object with roll method localizations
   * @static
   */
  static getRollMethods() {
    return {
      pointBuy: game.i18n.localize('hm.app.abilities.methods.pointBuy'),
      standardArray: game.i18n.localize('hm.app.abilities.methods.standardArray'),
      manualFormula: game.i18n.localize('hm.app.abilities.methods.manual')
    };
  }

  /**
   * Gets and validates the current dice rolling method
   * @returns {string} The validated dice rolling method
   * @static
   */
  static getDiceRollingMethod() {
    let diceRollingMethod = game.settings.get(HM.ID, 'diceRollingMethod');

    // Get allowed methods configuration
    const allowedMethods = game.settings.get(HM.ID, 'allowedMethods');

    // Map settings keys to method names
    const methodMapping = {
      standardArray: 'standardArray',
      pointBuy: 'pointBuy',
      manual: 'manualFormula'
    };

    // Create array of allowed method names
    const validMethods = Object.entries(allowedMethods)
      .filter(([key, enabled]) => enabled)
      .map(([key]) => methodMapping[key])
      .filter(Boolean);

    // Select first allowed method if current isn't valid
    if (!diceRollingMethod || !validMethods.includes(diceRollingMethod)) {
      diceRollingMethod = validMethods[0];
      game.settings.set(HM.ID, 'diceRollingMethod', diceRollingMethod).catch((err) => HM.log(1, 'Failed to update diceRollingMethod setting:', err));

      HM.log(3, `Invalid dice rolling method - falling back to '${diceRollingMethod}'`);
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

    // Only use the provided method, don't call getDiceRollingMethod again
    if (diceRollingMethod === 'standardArray') {
      const customArray = game.settings.get(HM.ID, 'customStandardArray');
      if (customArray) {
        const parsedArray = customArray.split(',').map(Number);
        if (parsedArray.length >= abilitiesCount) {
          return parsedArray.map((val) => Math.max(MIN, Math.min(MAX, val)));
        }
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
    const index = parseInt(element.getAttribute('data-ability-index'), 10);
    if (isNaN(index)) return;
    const adjustment = parseInt(element.getAttribute('data-adjust'), 10) || 0;
    Listeners.changeAbilityScoreValue(index, adjustment, HeroMancer.selectedAbilities);
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
    const dialog = new DialogV2({
      window: {
        title: game.i18n.localize('hm.dialogs.reroll.title'),
        icon: 'fas fa-dice-d6'
      },
      content: this.#getRerollDialogContent(),
      classes: ['hm-reroll-dialog'],
      buttons: this.#getRerollDialogButtons(rollFormula, chainedRolls, index, input),
      rejectClose: false,
      modal: true,
      position: { width: 400 }
    });

    dialog.render(true);
  }

  /**
   * Gets the content for the reroll dialog
   * @returns {string} The HTML content for the dialog
   * @private
   * @static
   */
  static #getRerollDialogContent() {
    // Only show the chain roll checkbox if chain rolls are enabled in settings
    const chainedRolls = game.settings.get(HM.ID, 'chainedRolls');
    const chainRollCheckbox =
      chainedRolls ?
        `
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
        async callback(event, button, dialog) {
          const chainRollCheckbox = button.form.elements.chainRoll;
          StatRoller.chainRollEnabled = chainRollCheckbox?.checked ?? false;

          dialog.close();

          if (StatRoller.chainRollEnabled && chainedRolls) {
            await StatRoller.rollAllStats(rollFormula);
          } else {
            await StatRoller.rollSingleAbilityScore(rollFormula, index, input);
          }
        }
      },
      {
        action: 'cancel',
        label: game.i18n.localize('hm.dialogs.reroll.cancel'),
        icon: 'fas fa-times'
      }
    ];
  }
}
