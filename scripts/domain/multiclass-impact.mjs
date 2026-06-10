import { advancementList } from './advancement-chooser.mjs';

/**
 * Build the plain-language impact summary of taking a new multiclass class at level 1.
 * @param {object} args Inputs.
 * @param {object} args.actor Target actor.
 * @param {object} args.classDoc Resolved picked-class document (not yet on actor).
 * @returns {object} Impact context (spell/next-asi/casting-ability rows).
 */
export function buildMulticlassImpact({ actor, classDoc }) {
  return {
    available: true,
    className: classDoc.name,
    classImg: classDoc.img,
    spell: buildSpellRow(actor, classDoc),
    nextAsi: buildNextAsiRow(actor, classDoc),
    castingAbility: buildCastingAbilityRow(actor, classDoc)
  };
}

/**
 * Compute spell slot stacking impact for the picked class, comparing pre vs post caster level.
 * @param {object} actor Target actor.
 * @param {object} classDoc Picked class doc.
 * @returns {?object} Spell row, or null when no spellcasting impact (neither side casts).
 */
function buildSpellRow(actor, classDoc) {
  const existing = collectActorClasses(actor);
  const pending = [...existing, { progression: classDoc.system.spellcasting.progression, levels: 1 }];
  const oldLeveled = computeLeveledCasterLevel(existing);
  const newLeveled = computeLeveledCasterLevel(pending);
  const oldPact = computePactCasterLevel(existing);
  const newPact = computePactCasterLevel(pending);
  const added = diffSlots(slotsForCasterLevel(oldLeveled), slotsForCasterLevel(newLeveled));
  const pact = pactDelta(oldPact, newPact);
  if (!added.length && !pact) return null;
  return { oldCasterLevel: oldLeveled, newCasterLevel: newLeveled, added, pact, multiclassStacks: oldLeveled > 0 && newLeveled > oldLeveled };
}

/**
 * Collect existing class spellcasting progression + level pairs from an actor.
 * @param {object} actor Target actor.
 * @returns {Array<{progression: string, levels: number}>} One entry per class item.
 */
function collectActorClasses(actor) {
  const out = [];
  for (const item of actor.items) {
    if (item.type !== 'class') continue;
    out.push({ progression: item.system.spellcasting.progression, levels: item.system.levels });
  }
  return out;
}

/**
 * Sum leveled-caster contributions across classes per `CONFIG.DND5E.spellcasting.spell.progression` divisors.
 * @param {Array<{progression: string, levels: number}>} classes Class progression entries.
 * @returns {number} Aggregate leveled caster level.
 */
function computeLeveledCasterLevel(classes) {
  const progModels = CONFIG.DND5E.spellcasting.spell.progression;
  let total = 0;
  for (const { progression, levels } of classes) {
    const model = progModels[progression];
    if (!model?.divisor) continue;
    const raw = levels / model.divisor;
    total += model.roundUp ? Math.ceil(raw) : Math.floor(raw);
  }
  return total;
}

/**
 * Sum pact-caster levels (warlock progression is per-class, not aggregated with leveled).
 * @param {Array<{progression: string, levels: number}>} classes Class progression entries.
 * @returns {number} Pact caster level.
 */
function computePactCasterLevel(classes) {
  let total = 0;
  for (const { progression, levels } of classes) if (progression === 'pact') total += levels;
  return total;
}

/**
 * Resolve the leveled slot row for a given caster level via `CONFIG.DND5E.SPELL_SLOT_TABLE`.
 * @param {number} level Caster level (1-based; 0 yields empty row).
 * @returns {Array<number>} Slot counts per spell level (index 0 = L1 slots).
 */
function slotsForCasterLevel(level) {
  if (level < 1) return [];
  const table = CONFIG.DND5E.SPELL_SLOT_TABLE;
  return [...(table[Math.min(level, table.length) - 1] ?? [])];
}

/**
 * Per-slot-level delta between two slot rows.
 * @param {Array<number>} oldRow Pre-impact slots.
 * @param {Array<number>} newRow Post-impact slots.
 * @returns {Array<{level: number, levelLabel: string, count: number, isNew: boolean}>} Newly-gained slots (positive deltas only).
 */
function diffSlots(oldRow, newRow) {
  const out = [];
  for (let i = 0; i < newRow.length; i++) {
    const before = oldRow[i] ?? 0;
    const delta = newRow[i] - before;
    if (delta > 0) out.push({ level: i + 1, levelLabel: spellLevelLabel(i + 1), count: delta, isNew: before === 0 });
  }
  return out;
}

/**
 * Resolve dnd5e's "1st Level" / "2nd Level" / "Cantrip" labels for a numeric spell level.
 * @param {number} level Numeric spell level.
 * @returns {string} Localized label.
 */
function spellLevelLabel(level) {
  return game.i18n.localize(CONFIG.DND5E.spellLevels[level]);
}

/**
 * Build a pact-slot delta row, or null when the pick doesn't add pact levels.
 * @param {number} oldLevel Pact caster level before pick.
 * @param {number} newLevel Pact caster level after pick.
 * @returns {?{summary: string}} Pact slot impact summary, or null when no pact change.
 */
function pactDelta(oldLevel, newLevel) {
  if (newLevel <= oldLevel) return null;
  const step = stepPactProgression(newLevel);
  if (!step) return null;
  const data = { slots: step.slots, level: spellLevelLabel(step.level) };
  const summary = oldLevel === 0 ? _locP('HEROMANCER.LevelUp.Impact.PactNew', step.slots, data) : _loc('HEROMANCER.LevelUp.Impact.PactUpdate', data);
  return { summary };
}

/**
 * Resolve the highest pact step `<=` a given level from `CONFIG.DND5E.pactCastingProgression`.
 * @param {number} level Pact caster level.
 * @returns {?{slots: number, level: number}} Step at or below `level`, or null when no step applies.
 */
function stepPactProgression(level) {
  let best = null;
  for (const [key, step] of Object.entries(CONFIG.DND5E.pactCastingProgression)) {
    const k = Number(key);
    if (k <= level && (best === null || k > best.k)) best = { k, step };
  }
  return best?.step ?? null;
}

/**
 * Locate the lowest-level ASI advancement on the picked class and translate it to a character-level milestone.
 * @param {object} actor Target actor (for current total level).
 * @param {object} classDoc Picked class doc.
 * @returns {?{classLevel: number, characterLevel: number}} ASI milestone, or null when class has no ASI.
 */
function buildNextAsiRow(actor, classDoc) {
  let min = Infinity;
  for (const adv of advancementList(classDoc)) {
    if ((adv.type ?? adv.constructor?.typeName) !== 'AbilityScoreImprovement') continue;
    const levels = adv.levels?.length ? adv.levels : [adv.level];
    for (const lvl of levels) if (lvl > 0 && lvl < min) min = lvl;
  }
  if (!Number.isFinite(min)) return null;
  return { classLevel: min, characterLevel: actor.system.details.level + min };
}

/**
 * Compare the picked class's casting ability to the actor's existing casting abilities and classify the relationship.
 * @param {object} actor Target actor.
 * @param {object} classDoc Picked class doc.
 * @returns {?{ability: string, label: string, kind: 'new'|'same'|'second', existing: Array<{ability: string, label: string, className: string}>}} Casting-ability row, or null when picked class isn't a caster.
 */
function buildCastingAbilityRow(actor, classDoc) {
  const ability = classDoc.system.spellcasting.ability;
  if (!ability) return null;
  const abilities = CONFIG.DND5E.abilities;
  const existing = [];
  for (const item of actor.items) {
    if (item.type !== 'class') continue;
    const a = item.system.spellcasting.ability;
    if (!a || item.system.spellcasting.progression === 'none') continue;
    existing.push({ ability: a, label: abilities[a].label, className: item.name });
  }
  const kind = !existing.length ? 'new' : existing.every((e) => e.ability === ability) ? 'same' : 'second';
  return { ability, label: abilities[ability].label, kind, existing };
}
