import { AbilityBlock } from '../components/ability-block.mjs';
import { Combobox } from '../components/combobox.mjs';
import { MODULE } from '../constants.mjs';
import * as documentLoader from '../data/document-loader.mjs';
import { generateName } from '../utils/randomizer-grammar.mjs';
import { buildStandardArrayPool, pointBuyCost } from './ability-scores.mjs';

/** @returns {Promise<void>} Resolve after two animation frames so listener-driven re-renders flush. */
const settle = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/**
 * Pick a uniformly random element.
 * @param {Array} arr Source array.
 * @returns {*} Random element, or undefined when empty.
 */
function pick(arr) {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;
}

/**
 * Set a control's value and fire a bubbling change.
 * @param {HTMLElement} el Form control.
 * @param {string} value New value.
 * @returns {void}
 */
function setValue(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/**
 * Available (non-disabled) option values for a combobox element.
 * @param {HTMLElement} combo Combobox root.
 * @returns {string[]} Selectable option values.
 */
function comboValues(combo) {
  return Array.from(combo.querySelectorAll('[role="option"]'))
    .filter((o) => o.getAttribute('aria-disabled') !== 'true' && o.dataset.value)
    .map((o) => o.dataset.value);
}

/**
 * Fill a new character with random selections, tab by tab.
 * @param {object} wizard HeroMancer instance.
 * @returns {Promise<void>}
 */
export async function randomizeAll(wizard) {
  try {
    randomizeName(wizard);
    await randomizeIdentity(wizard);
    await randomizeAbilities(wizard);
    randomizeHitPoints(wizard);
  } catch (err) {
    ATLAS.log(1, 'randomizeAll failed:', err);
    ui.notifications.error('HEROMANCER.App.Randomize.Failed', { localize: true });
  }
}

/**
 * Generate and set a random character name.
 * @param {object} wizard HeroMancer instance.
 * @returns {void}
 */
function randomizeName(wizard) {
  const input = wizard.element.querySelector('#character-name');
  const name = generateName({ culture: 'all', style: 'all' });
  if (input && name) setValue(input, name);
}

/**
 * Select a random background, species, class, then subclass (from the options the chosen class exposes), awaiting the re-render cascade between picks.
 * @param {object} wizard HeroMancer instance.
 * @returns {Promise<void>}
 */
async function randomizeIdentity(wizard) {
  for (const [sectionId, type] of [
    ['background', 'background'],
    ['species', 'race']
  ]) {
    const entry = pick(documentLoader.getEntries(type));
    const combo = wizard.element.querySelector(`[data-identity-section="${sectionId}"] [data-combobox]`);
    if (entry && combo) Combobox.attach(combo).select(entry.uuid);
  }
  await settle();
  const classEntry = pick(documentLoader.getEntries('class'));
  const classCombo = wizard.element.querySelector('[data-mc-row][data-primary="true"] [data-combobox]');
  if (classEntry && classCombo) Combobox.attach(classCombo).select(classEntry.uuid);
  await wizard.render({ parts: ['identity'] });
  await settle();
  await wizard.render({ parts: ['abilities', 'hp', 'equipment', 'advancements'] });
  await settle();
  const subCombo = wizard.element.querySelector('[data-mc-subclass-row] [data-combobox]');
  if (subCombo) {
    const value = pick(comboValues(subCombo));
    if (value) Combobox.attach(subCombo).select(value);
  }
}

/**
 * Assign random ability scores using the active generation method.
 * @param {object} wizard HeroMancer instance.
 * @returns {Promise<void>}
 */
async function randomizeAbilities(wizard) {
  const blocks = AbilityBlock.attachAll(wizard.element);
  if (!blocks.length) return;
  const method = blocks[0].method;
  if (method === 'pointBuy') {
    randomizePointBuy(blocks);
    return;
  }
  if (method === 'standardArray') {
    const pool = shuffle([...buildStandardArrayPool(blocks.length).entries()].flatMap(([value, count]) => Array(count).fill(value)));
    blocks.forEach((block, i) => {
      const combo = block.root.querySelector('[data-mode="standardArray"] [data-combobox]');
      if (combo && pool[i] != null) Combobox.attach(combo).select(pool[i]);
    });
    return;
  }
  wizard.element.querySelector('[data-action="rollAllAbilities"]')?.click();
  for (let i = 0; i < 40; i++) {
    await settle();
    if (comboValues(blocks[0].root.querySelector('[data-mode="manualFormula"] [data-combobox]')).length) break;
  }
  for (const block of blocks) {
    const combo = block.root.querySelector('[data-mode="manualFormula"] [data-combobox]');
    const value = combo && pick(comboValues(combo));
    if (value) Combobox.attach(combo).select(value);
  }
}

/**
 * Spend the point-buy budget by raising random affordable abilities one step at a time.
 * @param {AbilityBlock[]} blocks Ability blocks.
 * @returns {void}
 */
function randomizePointBuy(blocks) {
  const min = blocks[0].min;
  const budget = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.CUSTOM_POINT_BUY_TOTAL));
  const total = Number.isFinite(budget) ? budget : 27;
  blocks.forEach((b) => b.setValue(min));
  let spent = 0;
  let guard = 500;
  while (guard-- > 0) {
    const affordable = blocks.filter((b) => b.value < b.max && pointBuyCost(b.value + 1, min) - pointBuyCost(b.value, min) <= total - spent);
    if (!affordable.length) break;
    const block = pick(affordable);
    spent += pointBuyCost(block.value + 1, min) - pointBuyCost(block.value, min);
    block.setValue(block.value + 1);
  }
}

/**
 * Force an auto hit-point method (average / max) so HP fills without manual rolls or reroll prompts.
 * @param {object} wizard HeroMancer instance.
 * @returns {void}
 */
function randomizeHitPoints(wizard) {
  const select = wizard.element.querySelector('[data-hp-method]');
  if (!select) return;
  const auto = Array.from(select.options)
    .map((o) => o.value)
    .find((v) => v && v !== 'manual');
  if (auto && select.value !== auto) setValue(select, auto);
}

/**
 * Fisher-Yates shuffle (copy).
 * @param {Array} arr Source array.
 * @returns {Array} Shuffled copy.
 */
function shuffle(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
