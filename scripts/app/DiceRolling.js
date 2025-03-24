import { HM, StatRoller } from '../utils/index.js';

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

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
  async _prepareContext(_options) {
    const context = {
      allowedMethods: await game.settings.get(HM.ID, 'allowedMethods'),
      customRollFormula: game.settings.get(HM.ID, 'customRollFormula') || '4d6kh3',
      chainedRolls: game.settings.get(HM.ID, 'chainedRolls'),
      rollDelay: game.settings.get(HM.ID, 'rollDelay'),
      customStandardArray: game.settings.get(HM.ID, 'customStandardArray') || '15,14,13,12,10,8',
      customPointBuyTotal: game.settings.get(HM.ID, 'customPointBuyTotal') || 27,
      abilityScoreDefault: game.settings.get(HM.ID, 'abilityScoreDefault') || 8,
      abilityScoreMin: game.settings.get(HM.ID, 'abilityScoreMin') || 8,
      abilityScoreMax: game.settings.get(HM.ID, 'abilityScoreMax') || 15
    };

    return context;
  }

  /**
   * Actions to perform after the application renders
   * Sets up event listeners for the roll delay slider
   * @param {object} _context - The rendered context data
   * @param {object} _options - The render options
   * @protected
   */
  _onRender(_context, _options) {
    const html = this.element;
    const slider = html.querySelector('input[type="range"]');
    const output = html.querySelector('.delay-value');

    slider.addEventListener('input', (e) => {
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
   */
  static async formHandler(_event, form, formData) {
    try {
      // First handle allowed methods
      const allowedMethods = {
        standardArray: form.elements.standardArray?.checked ?? false,
        manual: form.elements.manual?.checked ?? false,
        pointBuy: form.elements.pointBuy?.checked ?? false
      };

      if (!Object.values(allowedMethods).some((value) => value)) {
        ui.notifications.error('hm.settings.dice-rolling.need-roll-method', { localize: true });
        return false;
      }

      // Apply default values for empty fields
      formData.object.abilityScoreDefault = formData.object.abilityScoreDefault || 8;
      formData.object.abilityScoreMin = formData.object.abilityScoreMin || 8;
      formData.object.abilityScoreMax = formData.object.abilityScoreMax || 15;

      // Parse to integers after ensuring defaults
      const min = parseInt(formData.object.abilityScoreMin);
      const max = parseInt(formData.object.abilityScoreMax);
      const defaultScore = parseInt(formData.object.abilityScoreDefault);

      // Validate ability score ranges
      if (min > defaultScore || defaultScore > max || min > max) {
        ui.notifications.error('hm.settings.ability-scores.invalid-range', { localize: true });
        return false;
      }

      // Update ABILITY_SCORES first before any standard array validation
      HM.ABILITY_SCORES = {
        DEFAULT: defaultScore,
        MIN: min,
        MAX: max
      };

      // Validate and fix standard array if needed
      if (allowedMethods.standardArray && formData.object.customStandardArray) {
        const standardArrayValues = formData.object.customStandardArray.split(',').map(Number);
        const outOfRangeValues = standardArrayValues.filter((val) => val < min || val > max);

        if (outOfRangeValues.length > 0) {
          // Fix values instead of erroring
          const fixedArray = standardArrayValues.map((val) => Math.max(min, Math.min(max, val)));
          formData.object.customStandardArray = fixedArray.join(',');

          ui.notifications.warn(
            game.i18n.format('hm.settings.ability-scores.standard-array-fixed', {
              original: outOfRangeValues.join(', '),
              min: min,
              max: max
            })
          );
        }
      }

      // Validate point buy total allows viable builds with min/max settings
      if (allowedMethods.pointBuy) {
        const pointBuyTotal = parseInt(formData.object.customPointBuyTotal);
        const minPointCost = StatRoller.getPointBuyCostForScore(min);
        const abilityCount = Object.keys(CONFIG.DND5E.abilities).length;
        const minTotalCost = minPointCost * abilityCount;

        if (pointBuyTotal < minTotalCost && pointBuyTotal !== 0) {
          ui.notifications.error(
            game.i18n.format('hm.settings.ability-scores.invalid-point-buy', {
              min: min,
              totalNeeded: minTotalCost
            })
          );
          return false;
        }
      }

      const settings = ['customRollFormula', 'chainedRolls', 'rollDelay', 'customStandardArray', 'customPointBuyTotal', 'abilityScoreDefault', 'abilityScoreMin', 'abilityScoreMax'];

      for (const setting of settings) {
        await game.settings.set(HM.ID, setting, formData.object[setting]);
      }

      await game.settings.set(HM.ID, 'allowedMethods', allowedMethods);

      // Don't call validateAndSetCustomStandardArray separately, we already fixed it above

      HM.reloadConfirm({ world: true });

      ui.notifications.info('hm.settings.dice-rolling.saved', { localize: true });
    } catch (error) {
      HM.log(1, `Error in formHandler: ${error}`);
      ui.notifications.error('hm.settings.dice-rolling.error-saving', { localize: true });
    }
  }
}
