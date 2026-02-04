import { HM, MODULE, StatRoller, needsReload, needsRerender, rerenderHM } from '../utils/index.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Dice rolling settings application. */
export class DiceRolling extends HandlebarsApplicationMixin(ApplicationV2) {
  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'hero-mancer-settings-dice-rolling',
    classes: ['hm-app'],
    tag: 'form',
    form: {
      handler: DiceRolling.formHandler,
      closeOnSubmit: true,
      submitOnChange: false
    },
    position: { height: 'auto', width: 800 },
    window: { contentClasses: ['standard-form'], icon: 'fa-solid fa-dice', resizable: false }
  };

  /** @override */
  static PARTS = {
    form: { template: 'modules/hero-mancer/templates/settings/dice-rolling.hbs', id: 'body', classes: ['standard-form'], scrollable: [''] },
    footer: { template: 'modules/hero-mancer/templates/settings/settings-footer.hbs', id: 'footer', classes: ['hm-compendiums-footer'] }
  };

  /** @override */
  get title() {
    return `${MODULE.NAME} | ${game.i18n.localize('hm.settings.dice-rolling.menu.name')}`;
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const settings = [
      'allowedMethods',
      'customRollFormula',
      'chainedRolls',
      'rollDelay',
      'customStandardArray',
      'statGenerationSwapMode',
      'customPointBuyTotal',
      'abilityScoreDefault',
      'abilityScoreMin',
      'abilityScoreMax'
    ];
    for (const key of settings) context[key] = game.settings.get(MODULE.ID, key);
    return context;
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    this._setupDelaySlider();
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
    if (!slider || !output) return;
    const newSlider = slider.cloneNode(true);
    slider.parentNode.replaceChild(newSlider, slider);
    newSlider.addEventListener('input', (e) => {
      output.textContent = `${e.target.value}ms`;
    });
  }

  /**
   * Processes form submission for dice rolling settings
   * @param {Event} _event - The form submission event
   * @param {HTMLFormElement} form - The form element
   * @param {object} formData - The processed form data
   * @returns {Promise<boolean|void>} Returns false if validation fails
   * @static
   * @async
   */
  static async formHandler(_event, form, formData) {
    const allowedMethods = { standardArray: form.elements.standardArray?.checked ?? false, manual: form.elements.manual?.checked ?? false, pointBuy: form.elements.pointBuy?.checked ?? false };
    if (!Object.values(allowedMethods).some((value) => value)) {
      ui.notifications.error('hm.settings.dice-rolling.need-roll-method', { localize: true, permanent: true });
      return false;
    }
    formData.object.abilityScoreDefault = formData.object.abilityScoreDefault || 8;
    formData.object.abilityScoreMin = formData.object.abilityScoreMin || 8;
    formData.object.abilityScoreMax = formData.object.abilityScoreMax || 15;
    const abilityScoreSettings = { min: parseInt(formData.object.abilityScoreMin), max: parseInt(formData.object.abilityScoreMax), default: parseInt(formData.object.abilityScoreDefault) };
    if (abilityScoreSettings.min > abilityScoreSettings.default || abilityScoreSettings.default > abilityScoreSettings.max || abilityScoreSettings.min > abilityScoreSettings.max) {
      ui.notifications.error('hm.settings.ability-scores.invalid-range', { localize: true, permanent: true });
      return false;
    }
    HM.ABILITY_SCORES = { DEFAULT: abilityScoreSettings.default, MIN: abilityScoreSettings.min, MAX: abilityScoreSettings.max };
    if (allowedMethods.standardArray && formData.object.customStandardArray) {
      const standardArrayResult = DiceRolling._validateStandardArray(formData.object.customStandardArray, abilityScoreSettings.min, abilityScoreSettings.max);
      if (standardArrayResult.modified) {
        formData.object.customStandardArray = standardArrayResult.value;
        ui.notifications.warn(standardArrayResult.message);
      }
    }
    if (allowedMethods.pointBuy && !DiceRolling._validatePointBuy(formData.object.customPointBuyTotal, abilityScoreSettings.min)) return false;
    const changedSettings = {};
    const currentAllowedMethods = game.settings.get(MODULE.ID, 'allowedMethods');
    if (JSON.stringify(currentAllowedMethods) !== JSON.stringify(allowedMethods)) {
      game.settings.set(MODULE.ID, 'allowedMethods', allowedMethods);
      changedSettings.allowedMethods = true;
    }
    const otherSettings = [
      'customRollFormula',
      'chainedRolls',
      'rollDelay',
      'customStandardArray',
      'statGenerationSwapMode',
      'customPointBuyTotal',
      'abilityScoreDefault',
      'abilityScoreMin',
      'abilityScoreMax'
    ];
    for (const setting of otherSettings) {
      const currentValue = game.settings.get(MODULE.ID, setting);
      const newValue = formData.object[setting];
      if (JSON.stringify(currentValue) !== JSON.stringify(newValue)) {
        game.settings.set(MODULE.ID, setting, newValue);
        changedSettings[setting] = true;
      }
    }
    if (needsReload(changedSettings)) HM.reloadConfirm({ world: true });
    else if (needsRerender(changedSettings)) rerenderHM();
    ui.notifications.info('hm.settings.dice-rolling.saved', { localize: true });
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
    if (outOfRangeValues.length === 0) return { value: standardArrayString, modified: false };
    const fixedArray = standardArrayValues.map((val) => Math.max(min, Math.min(max, val)));
    return { value: fixedArray.join(','), modified: true, message: game.i18n.format('hm.settings.ability-scores.standard-array-fixed', { original: outOfRangeValues.join(', '), min: min, max: max }) };
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
      ui.notifications.error(game.i18n.format('hm.settings.ability-scores.invalid-point-buy', { min: min, totalNeeded: minTotalCost }), { permanent: true });
      return false;
    }
    return true;
  }
}
