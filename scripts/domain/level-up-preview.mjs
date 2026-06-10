import { stripHtml } from '../utils/html-text.mjs';
import { advancementList } from './advancement-chooser.mjs';
import { averageRoll, parseHitDie } from './hp-tab.mjs';
import { getSubclassThreshold } from './subclass.mjs';

/**
 * Build a level-up preview for the picked class at the target new level.
 * @param {object} args Inputs.
 * @param {object} args.actor Target actor.
 * @param {object} args.classDoc Resolved picked-class document.
 * @param {number} args.newLevel The level being gained (1 for multiclass-first; currentClassLevel+1 for level-existing).
 * @param {boolean} args.isMulticlass Whether the pick is a new class (vs leveling an existing one).
 * @returns {object} Preview context (hp/features/spellcasting/asi/subclass rows).
 */
export function buildLevelUpPreview({ actor, classDoc, newLevel, isMulticlass }) {
  const advs = advancementList(classDoc);
  const newLevelAdvs = advs.filter((a) => advHasLevel(a, newLevel));
  const conMod = abilityMod(actor?.system?.abilities?.con?.value);
  const die = parseHitDie(classDoc);
  return {
    available: true,
    isMulticlass,
    className: classDoc.name,
    classImg: classDoc.img ?? null,
    newLevel,
    hp: buildHpRow(die, conMod, newLevel === 1),
    features: buildFeatureRows(newLevelAdvs),
    spellcasting: buildSpellcastingRow(classDoc, newLevel),
    asi: hasType(newLevelAdvs, 'AbilityScoreImprovement'),
    subclass: getSubclassThreshold(classDoc) === newLevel
  };
}

/**
 * Whether an advancement carries a given level in its `levels[]` or `level` field.
 * @param {object} adv Advancement instance.
 * @param {number} level Target level.
 * @returns {boolean} `true` when the advancement fires at `level`.
 */
function advHasLevel(adv, level) {
  if (adv.levels?.length) return adv.levels.includes(level);
  return adv.level === level;
}

/**
 * Whether any advancement in the set is of a given type.
 * @param {Array<object>} advs Advancement list.
 * @param {string} type Type name (e.g. `AbilityScoreImprovement`).
 * @returns {boolean} `true` when at least one entry matches.
 */
function hasType(advs, type) {
  return advs.some((a) => (a.type ?? a.constructor?.typeName) === type);
}

/**
 * Build the HP gain row. Level 1 of a class always shows the max die (PHB rule for first character level; treated the same here for any first level of a new class). Level 2+ shows the average.
 * @param {number} die Hit-die size.
 * @param {number} conMod Constitution modifier.
 * @param {boolean} isFirstLevel `true` when the picked class is being taken at its first level.
 * @returns {object} HP row.
 */
function buildHpRow(die, conMod, isFirstLevel) {
  if (!die) return { available: false };
  const avg = averageRoll(die);
  return { available: true, die, dieLabel: `d${die}`, conMod, isFirstLevel, base: isFirstLevel ? die : avg, total: Math.max(1, (isFirstLevel ? die : avg) + conMod) };
}

/**
 * Map ItemGrant + ScaleValue advancement rows at the new level into preview chips.
 * @param {Array<object>} advs Advancements that fire at the new level.
 * @returns {Array<{type: string, title: string, items: Array<{uuid: string, name: string, img: ?string}>}>} Feature rows.
 */
function buildFeatureRows(advs) {
  const rows = [];
  for (const adv of advs) {
    const type = adv.type ?? adv.constructor?.typeName;
    if (!type) continue;
    if (type === 'ItemGrant') {
      const items = resolveGrantItems(adv);
      rows.push({ type, title: stripHtml(adv.title ?? type), items });
    } else if (type === 'ScaleValue') {
      rows.push({ type, title: stripHtml(adv.title ?? type), items: [] });
    }
  }
  return rows;
}

/**
 * Resolve ItemGrant entries to {uuid, name, img} triples, dropping uuids that can't resolve.
 * @param {object} adv ItemGrant advancement instance.
 * @returns {Array<{uuid: string, name: string, img: ?string}>} Resolved items.
 */
function resolveGrantItems(adv) {
  const items = adv.configuration?.items ?? [];
  const out = [];
  for (const entry of items) {
    const uuid = entry?.uuid;
    if (!uuid) continue;
    const doc = fromUuidSync(uuid);
    if (!doc) continue;
    out.push({ uuid, name: doc.name, img: doc.img ?? null });
  }
  return out;
}

/**
 * Build a one-line spellcasting summary if the class is a caster.
 * @param {object} classDoc Picked class doc.
 * @param {number} newLevel Level being gained.
 * @returns {?{progression: string, level: number}} Summary, or null when not a caster.
 */
function buildSpellcastingRow(classDoc, newLevel) {
  const progression = classDoc.system?.spellcasting?.progression ?? 'none';
  if (progression === 'none') return null;
  return { progression, level: newLevel };
}

/**
 * Standard 5e ability modifier.
 * @param {?(string|number)} score Ability score.
 * @returns {number} Modifier (floor((score-10)/2)).
 */
function abilityMod(score) {
  const n = Number(score);
  return Number.isFinite(n) ? Math.floor((n - 10) / 2) : 0;
}
