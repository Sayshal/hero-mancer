import { HM, StatRoller } from '../utils/index.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class DiceRolling extends HandlebarsApplicationMixin(ApplicationV2) {
  /* -------------------------------------------- */
  /*  Static Properties                           */
  /* -------------------------------------------- */

  static DEFAULT_OPTIONS = {
    id: 'hero-mancer-settings-dice-rolling',
    classes: ['hm-app'],
    tag: 'form',
    form: {
      handler: DiceRolling.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    position: {
      height: 'auto',
      width: '550'
    },
    window: {
      icon: 'fa-solid fa-dice',
      resizable: false
    }
  };

  static PARTS = {
    form: {
      template: 'modules/hero-mancer/templates/settings/dice-rolling.hbs',
      id: 'body',
      classes: ['hm-dice-rolling-popup']
    },
    footer: {
      template: 'modules/hero-mancer/templates/settings/settings-footer.hbs',
      id: 'footer',
      classes: ['hm-compendiums-footer']
    }
  };

  /* -------------------------------------------- */
  /*  Getters                                     */
  /* -------------------------------------------- */

  get title() {
    return `${HM.NAME} | ${game.i18n.localize('hm.settings.dice-rolling.menu.name')}`;
  }

  /* -------------------------------------------- */
  /*  Protected Methods                           */
  /* -------------------------------------------- */

  /**
   * Prepares context data for the dice rolling settings application
   * @param {object} _options - Application render options
   * @returns {Promise<object>} Context data for template rendering with dice rolling settings
   * @protected
   */
  _prepareContext(_options) {
    try {
      const settingsToFetch = [
        { key: 'allowedMethods', defaultValue: {} },
        { key: 'customRollFormula', defaultValue: '4d6kh3' },
        { key: 'chainedRolls', defaultValue: false },
        { key: 'rollDelay', defaultValue: 500 },
        { key: 'customStandardArray', defaultValue: '15,14,13,12,10,8' },
        { key: 'customPointBuyTotal', defaultValue: 27 },
        { key: 'abilityScoreDefault', defaultValue: 8 },
        { key: 'abilityScoreMin', defaultValue: 8 },
        { key: 'abilityScoreMax', defaultValue: 15 }
      ];

      const context = {};

      for (const setting of settingsToFetch) {
        try {
          let value = game.settings.get(HM.ID, setting.key);
          context[setting.key] = value || setting.defaultValue;
        } catch (settingError) {
          HM.log(2, `Error fetching setting "${setting.key}": ${settingError.message}`);
          context[setting.key] = setting.defaultValue;
        }
      }

      return context;
    } catch (error) {
      HM.log(1, `Error preparing dice rolling context: ${error.message}`);
      ui.notifications.error('hm.settings.dice-rolling.error-context', { localize: true });
      return this._getDefaultContext();
    }
  }

  /**
   * Provides default context values when context preparation fails
   * @returns {object} Default context values for the template
   * @private
   */
  _getDefaultContext() {
    return {
      allowedMethods: {},
      customRollFormula: '4d6kh3',
      chainedRolls: false,
      rollDelay: 500,
      customStandardArray: '15,14,13,12,10,8',
      customPointBuyTotal: 27,
      abilityScoreDefault: 8,
      abilityScoreMin: 8,
      abilityScoreMax: 15
    };
  }

  /**
   * Actions to perform after the application renders
   * Sets up event listeners for the roll delay slider
   * @param {object} _context - The rendered context data
   * @param {object} _options - The render options
   * @returns {void}
   * @protected
   * @override
   */
  _onRender(_context, _options) {
    try {
      this._setupDelaySlider();
    } catch (error) {
      HM.log(1, `Error in _onRender: ${error.message}`);
    }
  }

  /**
   * Sets up the roll delay slider and its value display
   * @returns {void}
   * @private
   */
  _setupDelaySlider() {
    const html = this.element;
    if (!html) return;

    const slider = html.querySelector('input[type="range"]');
    const output = html.querySelector('.delay-value');

    if (!slider || !output) {
      HM.log(2, 'Could not find slider or output elements');
      return;
    }

    // Remove any existing listeners to prevent duplicates
    const newSlider = slider.cloneNode(true);
    slider.parentNode.replaceChild(newSlider, slider);

    // Add the event listener to the new slider
    newSlider.addEventListener('input', (e) => {
      output.textContent = `${e.target.value}ms`;
    });
  }

  /* -------------------------------------------- */
  /*  Static Public Methods                       */
  /* -------------------------------------------- */

  /**
   * Processes form submission for dice rolling settings
   * Validates and saves settings for ability score generation methods
   * @param {Event} _event - The form submission event
   * @param {HTMLFormElement} form - The form element
   * @param {FormDataExtended} formData - The processed form data
   * @returns {Promise<boolean|void>} Returns false if validation fails
   * @static
   * @async
   */
  static async formHandler(_event, form, formData) {
    try {
      // Validate basic form requirements
      const allowedMethods = DiceRolling._extractAllowedMethods(form);
      if (!DiceRolling._validateAllowedMethods(allowedMethods)) return false;

      // Validate and prepare ability score settings
      const abilityScoreSettings = DiceRolling._prepareAbilityScoreSettings(formData);
      if (!DiceRolling._validateAbilityScoreSettings(abilityScoreSettings)) return false;

      // Update global ability score constants
      DiceRolling._updateAbilityScoreConstants(abilityScoreSettings);

      // Validate standard array if enabled
      if (allowedMethods.standardArray && formData.object.customStandardArray) {
        const standardArrayResult = DiceRolling._validateStandardArray(formData.object.customStandardArray, abilityScoreSettings.min, abilityScoreSettings.max);

        if (standardArrayResult.modified) {
          formData.object.customStandardArray = standardArrayResult.value;
          ui.notifications.warn(standardArrayResult.message);
        }
      }

      // Validate point buy if enabled
      if (allowedMethods.pointBuy && !DiceRolling._validatePointBuy(formData.object.customPointBuyTotal, abilityScoreSettings.min)) {
        return false;
      }

      // Save all settings
      DiceRolling._saveSettings(formData, allowedMethods);

      HM.reloadConfirm({ world: true });
      ui.notifications.info('hm.settings.dice-rolling.saved', { localize: true });
    } catch (error) {
      HM.log(1, `Error in formHandler: ${error.message}`);
      ui.notifications.error('hm.settings.dice-rolling.error-saving', { localize: true });
    }
  }

  /* -------------------------------------------- */
  /*  Static Private Methods                      */
  /* -------------------------------------------- */

  /**
   * Extracts allowed ability score generation methods from form
   * @param {HTMLFormElement} form - The form element
   * @returns {object} Object containing boolean flags for each method
   * @static
   * @private
   */
  static _extractAllowedMethods(form) {
    return {
      standardArray: form.elements.standardArray?.checked ?? false,
      manual: form.elements.manual?.checked ?? false,
      pointBuy: form.elements.pointBuy?.checked ?? false
    };
  }

  /**
   * Validates that at least one ability score generation method is selected
   * @param {object} allowedMethods - Object containing boolean flags for each method
   * @returns {boolean} True if validation passes, false otherwise
   * @static
   * @private
   */
  static _validateAllowedMethods(allowedMethods) {
    if (!Object.values(allowedMethods).some((value) => value)) {
      ui.notifications.error('hm.settings.dice-rolling.need-roll-method', { localize: true });
      return false;
    }
    return true;
  }

  /**
   * Prepares ability score settings with defaults
   * @param {FormDataExtended} formData - The processed form data
   * @returns {object} Object containing min, max, and default ability score values
   * @static
   * @private
   */
  static _prepareAbilityScoreSettings(formData) {
    // Apply default values for empty fields
    formData.object.abilityScoreDefault = formData.object.abilityScoreDefault || 8;
    formData.object.abilityScoreMin = formData.object.abilityScoreMin || 8;
    formData.object.abilityScoreMax = formData.object.abilityScoreMax || 15;

    // Parse to integers after ensuring defaults
    return {
      min: parseInt(formData.object.abilityScoreMin),
      max: parseInt(formData.object.abilityScoreMax),
      default: parseInt(formData.object.abilityScoreDefault)
    };
  }

  /**
   * Validates ability score settings
   * @param {object} settings - Object containing min, max, and default ability score values
   * @returns {boolean} True if validation passes, false otherwise
   * @static
   * @private
   */
  static _validateAbilityScoreSettings(settings) {
    if (settings.min > settings.default || settings.default > settings.max || settings.min > settings.max) {
      ui.notifications.error('hm.settings.ability-scores.invalid-range', { localize: true });
      return false;
    }
    return true;
  }

  /**
   * Updates global ability score constants
   * @param {object} settings - Object containing min, max, and default ability score values
   * @returns {void}
   * @static
   * @private
   */
  static _updateAbilityScoreConstants(settings) {
    HM.ABILITY_SCORES = {
      DEFAULT: settings.default,
      MIN: settings.min,
      MAX: settings.max
    };
  }

  /**
   * Validates and fixes standard array if needed
   * @param {string} standardArrayString - Comma-separated string of ability scores
   * @param {number} min - Minimum allowed ability score
   * @param {number} max - Maximum allowed ability score
   * @returns {object} Result object with value, modified flag, and message
   * @static
   * @private
   */
  static _validateStandardArray(standardArrayString, min, max) {
    const standardArrayValues = standardArrayString.split(',').map(Number);
    const outOfRangeValues = standardArrayValues.filter((val) => val < min || val > max);

    if (outOfRangeValues.length === 0) {
      return { value: standardArrayString, modified: false };
    }

    // Fix values instead of erroring
    const fixedArray = standardArrayValues.map((val) => Math.max(min, Math.min(max, val)));

    return {
      value: fixedArray.join(','),
      modified: true,
      message: game.i18n.format('hm.settings.ability-scores.standard-array-fixed', {
        original: outOfRangeValues.join(', '),
        min: min,
        max: max
      })
    };
  }

  /**
   * Validates point buy total allows viable builds with min/max settings
   * @param {number|string} pointBuyTotal - The point buy total value
   * @param {number} min - Minimum allowed ability score
   * @returns {boolean} True if validation passes, false otherwise
   * @static
   * @private
   */
  static _validatePointBuy(pointBuyTotal, min) {
    const pointBuyTotalNumber = parseInt(pointBuyTotal);
    const minPointCost = StatRoller.getPointBuyCostForScore(min);
    const abilityCount = Object.keys(CONFIG.DND5E.abilities).length;
    const minTotalCost = minPointCost * abilityCount;

    if (pointBuyTotalNumber < minTotalCost && pointBuyTotalNumber !== 0) {
      ui.notifications.error(
        game.i18n.format('hm.settings.ability-scores.invalid-point-buy', {
          min: min,
          totalNeeded: minTotalCost
        })
      );
      return false;
    }
    return true;
  }

  /**
   * Saves all settings to game.settings
   * @param {FormDataExtended} formData - The processed form data
   * @param {object} allowedMethods - Object containing boolean flags for each method
   * @returns {Promise<void>}
   * @static
   * @private
   */
  static _saveSettings(formData, allowedMethods) {
    const settings = ['customRollFormula', 'chainedRolls', 'rollDelay', 'customStandardArray', 'customPointBuyTotal', 'abilityScoreDefault', 'abilityScoreMin', 'abilityScoreMax'];

    for (const setting of settings) {
      game.settings.set(HM.ID, setting, formData.object[setting]);
    }

    game.settings.set(HM.ID, 'allowedMethods', allowedMethods);
  }
}
