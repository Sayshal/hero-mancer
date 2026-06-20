/**
 * @typedef {object} TabValidation
 * @property {boolean} valid Whether every mandatory field on this tab is satisfied.
 * @property {string[]} missing Lang keys describing missing mandatory fields.
 * @property {number} progress Fractional completion 0..1 for the per-tab progress bar.
 * @property {number} [weight] Number of decisions this tab contributes to the global bar (0 = nothing to do yet, excluded).
 * @property {boolean} [hideBar] Skip rendering a progress bar for this tab.
 */

/**
 * @typedef {object} WizardValidation
 * @property {boolean} valid Whether every tab is valid.
 * @property {Object<string, TabValidation>} tabs Per-tab results keyed by tab id.
 * @property {string[]} missing Flat list of missing-field lang keys across all tabs.
 */

import { MODULE } from '../constants.mjs';
import { getEntries } from '../data/document-loader.mjs';
import { buildStandardArrayPool, pointBuyCost } from '../domain/ability-scores.mjs';
import { checkMulticlassPrereq } from '../domain/multiclass-prereqs.mjs';

/** Friendly biography-field localization keys; reused for enforce-biography missing-field tooltips. */
const BIOGRAPHY_FIELD_LABELS = {
  alignment: 'DND5E.Alignment',
  faith: 'DND5E.Faith',
  gender: 'DND5E.Gender',
  age: 'DND5E.Age',
  eyes: 'DND5E.Eyes',
  hair: 'DND5E.Hair',
  skin: 'DND5E.Skin',
  height: 'DND5E.Height',
  weight: 'DND5E.Weight',
  traits: 'DND5E.PersonalityTraits',
  ideals: 'DND5E.Ideals',
  bonds: 'DND5E.Bonds',
  flaws: 'DND5E.Flaws',
  appearance: 'DND5E.Appearance',
  backstory: 'DND5E.Biography'
};

/**
 * Validate the wizard form against built-in mandatory rules.
 * @param {HTMLElement} root Wizard root element.
 * @param {'creation'|'level_up'} [mode] Active wizard mode — gates which per-tab validators run.
 * @param {?Object<string, number>} [abilityScores] Effective scores (base + ASI bonuses) for multiclass-prereq checks; falls back to the raw inputs.
 * @returns {WizardValidation} Aggregated result.
 */
export function validateWizard(root, mode = 'creation', abilityScores = null) {
  const tabs =
    mode === 'level_up'
      ? { 'level-up': validateLevelUp(root), hp: validateHp(root), advancements: validateAdvancements(root) }
      : {
          start: validateStart(root),
          identity: validateIdentity(root, abilityScores),
          abilities: validateAbilities(root),
          equipment: { valid: true, missing: [], progress: 0, hideBar: true },
          hp: validateHp(root),
          biography: validateBiography(root),
          advancements: validateAdvancements(root),
          finalize: { valid: true, missing: [], progress: 0, hideBar: true }
        };
  const missing = Object.values(tabs).flatMap((t) => t.missing);
  return { valid: Object.values(tabs).every((t) => t.valid), tabs, missing };
}

/**
 * Mandatory-field check for the Level-up tab — a class tile must be picked.
 * @param {HTMLElement} root Wizard root.
 * @returns {TabValidation} Result.
 */
function validateLevelUp(root) {
  const missing = [];
  const checked = root.querySelector('[data-tab="level-up"] input[name="levelUp.pickedClass"]:checked');
  if (!checked) missing.push('HEROMANCER.App.TabNames.level-up');
  const subclassCb = root.querySelector('[data-tab="level-up"] [data-combobox][data-name="levelUp.pickedSubclass"]');
  let total = 1;
  let filled = checked ? 1 : 0;
  if (subclassCb) {
    total++;
    if (subclassCb.dataset.value) filled++;
    else missing.push('TYPES.Item.subclass');
  }
  return { valid: missing.length === 0, missing, progress: filled / total, weight: total };
}

/**
 * Mandatory-field check for the Start tab.
 * @param {HTMLElement} root Wizard root.
 * @returns {TabValidation} Result.
 */
function validateStart(root) {
  const missing = [];
  const name = root.querySelector('#character-name')?.value?.trim();
  if (!name) missing.push('DND5E.Name');
  const levelInput = root.querySelector('#character-level');
  const level = Number(levelInput?.value);
  const levelValid = Number.isFinite(level) && level >= 1 && level <= 20;
  if (!levelValid) missing.push('HEROMANCER.App.Start.LevelLabel');
  let total = 1;
  let filled = name ? 1 : 0;
  if (game.settings.get(MODULE.ID, MODULE.SETTINGS.ENFORCE_ART)) {
    const charArt = root.querySelector('input[name="character-art"]')?.value?.trim();
    const linked = !!root.querySelector('input[name="link-token-art"]')?.checked;
    const tokenArt = root.querySelector('input[name="token-art"]')?.value?.trim();
    total++;
    if (charArt) filled++;
    else missing.push('HEROMANCER.App.Start.CharacterArtLabel');
    if (!linked) {
      total++;
      if (tokenArt) filled++;
      else missing.push('HEROMANCER.App.Start.TokenArtLabel');
    }
  }
  return { valid: missing.length === 0, missing, progress: filled / total, weight: total };
}

/**
 * Mandatory-field check for the Identity tab.
 * @param {HTMLElement} root Wizard root.
 * @param {?Object<string, number>} [abilityScoresOverride] Effective scores (base + ASI) for the multiclass-prereq check.
 * @returns {TabValidation} Result.
 */
function validateIdentity(root, abilityScoresOverride = null) {
  const missing = [];
  let total = 0;
  let filled = 0;
  for (const key of ['background', 'species']) {
    total++;
    const cb = root.querySelector(`[data-combobox][data-name="identity.${key}"]`);
    if (cb?.dataset.value) filled++;
    else missing.push(`HEROMANCER.App.TabNames.${key}`);
  }
  const rosterRows = [...root.querySelectorAll('[data-tab="identity"] [data-mc-row]')];
  const effectiveLevel = Number(root.querySelector('#character-level')?.value) || Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.STARTING_LEVEL)) || 1;
  const abilityScores = abilityScoresOverride ?? readAbilityScoreInputs(root);
  let assignedTotal = 0;
  for (const row of rosterRows) {
    total++;
    const slotId = row.dataset.slotId;
    const isPrimary = row.dataset.primary === 'true';
    const uuid = row.querySelector('[data-combobox]')?.dataset.value ?? '';
    const level = Number(row.querySelector('[data-mc-level]')?.value) || 0;
    assignedTotal += level;
    if (!uuid) {
      missing.push(isPrimary ? 'HEROMANCER.App.TabNames.class' : 'HEROMANCER.App.Identity.Multiclass.AddMissing');
      continue;
    }
    filled++;
    if (!isPrimary) {
      const entry = getEntries('class').find((e) => e.uuid === uuid);
      const prereq = entry ? checkMulticlassPrereq(entry, abilityScores) : { passes: true };
      if (!prereq.passes) missing.push('HEROMANCER.App.Identity.Multiclass.PrereqFailed');
    }
    const subclassCb = root.querySelector(`[data-tab="identity"] [data-combobox][data-name="identity.classes.${slotId}.subclassUuid"]`);
    if (subclassCb) {
      total++;
      if (subclassCb.dataset.value) filled++;
      else missing.push('TYPES.Item.subclass');
    }
  }
  if (rosterRows.length && assignedTotal !== effectiveLevel) missing.push('HEROMANCER.App.Identity.Multiclass.BalanceMismatch');
  return { valid: missing.length === 0, missing, progress: total ? filled / total : 0, weight: total };
}

/**
 * Read all live ability score values from hidden inputs in the abilities tab.
 * @param {HTMLElement} root Wizard root.
 * @returns {Object<string, number>} Score map keyed by ability key.
 */
function readAbilityScoreInputs(root) {
  const out = {};
  for (const input of root.querySelectorAll('[data-tab="abilities"] [data-ability-block] input[type="hidden"][name^="abilities."][name$=".value"]')) {
    const parts = input.name.split('.');
    if (parts.length >= 3) out[parts[1]] = Number(input.value) || 0;
  }
  return out;
}

/**
 * Mandatory-field check for the Abilities tab — every block has a value within bounds.
 * @param {HTMLElement} root Wizard root.
 * @returns {TabValidation} Result.
 */
function validateAbilities(root) {
  const method = root.querySelector('[data-abilities-method]')?.value ?? 'pointBuy';
  const blocks = [...root.querySelectorAll('[data-ability-block]')];
  if (!blocks.length) return { valid: true, missing: [], progress: 0, weight: 0 };
  const result =
    method === 'pointBuy'
      ? validatePointBuy(root, blocks)
      : method === 'standardArray'
        ? validateStandardArray(root, blocks)
        : method === 'manualEntry'
          ? validateManualEntry(blocks)
          : validateManualFormula(blocks);
  return { ...result, weight: blocks.length };
}

/**
 * Point-buy completion: cost spent must equal the configured total budget.
 * @param {HTMLElement} root Wizard root.
 * @param {HTMLElement[]} blocks Ability-block elements.
 * @returns {TabValidation} Result.
 */
function validatePointBuy(root, blocks) {
  const total = Number(root.querySelector('[data-pb-tracker] strong + span')?.textContent?.replace(/[^0-9]/g, '') || 27);
  const min = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.ABILITY_SCORE_MIN) ?? 8);
  const used = blocks.reduce((sum, b) => sum + pointBuyCost(Number(b.querySelector('[data-value-input]')?.value || 0), min), 0);
  const valid = used === total;
  return { valid, missing: valid ? [] : ['HEROMANCER.App.Validation.PointBuy'], progress: Math.min(1, used / total) };
}

/**
 * Standard-array completion: every ability filled AND the picked multiset stays within the pool's per-value counts.
 * @param {HTMLElement} _root Wizard root.
 * @param {HTMLElement[]} blocks Ability-block elements.
 * @returns {TabValidation} Result.
 */
function validateStandardArray(_root, blocks) {
  const values = blocks.map((b) => b.querySelector('[data-combobox]')?.dataset?.value).filter(Boolean);
  const pool = buildStandardArrayPool(blocks.length);
  const used = new Map();
  for (const v of values) used.set(v, (used.get(v) ?? 0) + 1);
  const withinPool = [...used.entries()].every(([v, n]) => n <= (pool.get(v) ?? 0));
  const valid = values.length === blocks.length && withinPool;
  return { valid, missing: valid ? [] : ['HEROMANCER.App.Validation.StandardArray'], progress: values.length / blocks.length };
}

/**
 * Manual-formula completion: every block has been rolled (data-rolled set by component setValue path).
 * @param {HTMLElement[]} blocks Ability-block elements.
 * @returns {TabValidation} Result.
 */
function validateManualFormula(blocks) {
  const rolled = blocks.filter((b) => b.dataset.rolled === '1').length;
  const valid = rolled === blocks.length;
  return { valid, missing: valid ? [] : ['HEROMANCER.App.Validation.ManualFormula'], progress: rolled / blocks.length };
}

/**
 * Manual-entry completion: every block holds an integer within the configured MIN/MAX bounds.
 * @param {HTMLElement[]} blocks Ability-block elements.
 * @returns {TabValidation} Result.
 */
function validateManualEntry(blocks) {
  const min = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.ABILITY_SCORE_MIN) ?? 8);
  const max = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.ABILITY_SCORE_MAX) ?? 15);
  const filled = blocks.filter((b) => {
    const v = Number(b.querySelector('[data-value-input]')?.value);
    return Number.isFinite(v) && v >= min && v <= max;
  }).length;
  const valid = filled === blocks.length;
  return { valid, missing: valid ? [] : ['HEROMANCER.App.Validation.ManualEntry'], progress: filled / blocks.length };
}

/**
 * Mandatory-field check for the HP tab — every interactive card needs a positive value.
 * @param {HTMLElement} root Wizard root.
 * @returns {TabValidation} Result.
 */
function validateHp(root) {
  const cards = [...root.querySelectorAll('[data-tab="hp"] [data-hp-card]')];
  if (!cards.length) return { valid: true, missing: [], progress: 0, weight: 0 };
  const interactive = cards.filter((c) => c.dataset.mode !== 'locked');
  if (!interactive.length) return { valid: true, missing: [], progress: 1, weight: 0 };
  let filled = 0;
  for (const c of interactive) {
    const value = Number(c.querySelector('input[name^="hp.rolls."]')?.value);
    if (Number.isFinite(value) && value > 0) filled++;
  }
  const valid = filled === interactive.length;
  return { valid, missing: valid ? [] : ['DND5E.HitPoints'], progress: filled / interactive.length, weight: interactive.length };
}

/**
 * Mandatory-field check for the Advancements tab — every non-auto row has a complete pick.
 * @param {HTMLElement} root Wizard root.
 * @returns {TabValidation} Result; `remaining` extra field is the badge count.
 */
function validateAdvancements(root) {
  const rows = [...root.querySelectorAll('[data-tab="advancements"] [data-advancement-row]:not([data-auto])')];
  if (!rows.length) {
    const hasAnyRow = !!root.querySelector('[data-tab="advancements"] [data-advancement-row]');
    return { valid: true, missing: [], progress: hasAnyRow ? 1 : 0, remaining: 0, errors: [], weight: 0 };
  }
  let done = 0;
  const errors = [];
  for (const row of rows) {
    if (row.dataset.state === 'done') done++;
    else if (row.dataset.error === 'partial') errors.push({ advancementId: row.dataset.advancementId, level: Number(row.dataset.level), kind: 'partial' });
  }
  const remaining = rows.length - done;
  const valid = remaining === 0;
  return { valid, missing: valid ? [] : ['HEROMANCER.App.TabNames.advancements'], progress: done / rows.length, remaining, errors, weight: rows.length };
}

/**
 * Mandatory-field check for the Biography tab — currently no required fields.
 * @param {HTMLElement} root Wizard root.
 * @returns {TabValidation} Result.
 */
function validateBiography(root) {
  const fields = Object.keys(BIOGRAPHY_FIELD_LABELS);
  const enforce = game.settings.get(MODULE.ID, MODULE.SETTINGS.ENFORCE_BIOGRAPHY);
  const missing = [];
  let filled = 0;
  for (const f of fields) {
    const el = root.querySelector(`[name="biography.${f}"]`);
    const v = el?.value?.trim?.() ?? el?.textContent?.trim?.() ?? '';
    if (v) filled++;
    else if (enforce) missing.push(BIOGRAPHY_FIELD_LABELS[f]);
  }
  const progress = filled / fields.length;
  return { valid: missing.length === 0, missing, progress, weight: enforce ? fields.length : 0 };
}
