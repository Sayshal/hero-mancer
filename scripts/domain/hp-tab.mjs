import { MODULE } from '../constants.mjs';

/** @type {string[]} HP methods in default-preference order; the first enabled one is the fallback. */
const HP_METHODS = ['average', 'max', 'manual'];

/**
 * Pull the per-level HP values applied to a class item via dnd5e's `HitPointsAdvancement`. Resolves `"max"` / `"avg"` to numbers using the item's hit die.
 * @param {object} classItem Class Item5e on the actor.
 * @returns {Object<string, number>} Map of level → resolved HP roll value.
 */
export function readLockedRolls(classItem) {
  const out = {};
  const die = parseHitDie(classItem);
  if (!die || !classItem?.advancement?.byId) return out;
  const hpAdv = Object.values(classItem.advancement.byId).find((a) => a.constructor?.typeName === 'HitPoints');
  const value = hpAdv?.value;
  if (!value) return out;
  for (const [lvl, raw] of Object.entries(value)) {
    if (raw === 'max') out[lvl] = die;
    else if (raw === 'avg') out[lvl] = averageRoll(die);
    else {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) out[lvl] = n;
    }
  }
  return out;
}

/**
 * Parse the hit-die size from a class document.
 * @param {object} classDoc Full class Document.
 * @returns {number} Die size (4/6/8/10/12), or 0 when unresolvable.
 */
export function parseHitDie(classDoc) {
  const raw = classDoc?.system?.hd?.denomination ?? classDoc?.system?.hitDice ?? '';
  const m = String(raw).match(/d(\d+)/i);
  return m ? Number(m[1]) : 0;
}

/** @type {Object<string, string>} Active Effect keys dnd5e folds into max HP, mapped to their bonus bucket. */
const HP_BONUS_KEYS = { 'system.attributes.hp.bonuses.level': 'level', 'system.attributes.hp.bonuses.overall': 'overall' };

/**
 * Roll data for resolving HP bonus formulas at the projected class and character levels.
 * @param {object} args Inputs.
 * @param {?object} args.actor Level-up actor; null at creation.
 * @param {Array<{classDoc:?object, level:number}>} args.classRoster Per-class levels after this run.
 * @param {number} args.characterLevel Character level after this run.
 * @returns {object} Roll data.
 */
export function hpBonusRollData({ actor, classRoster, characterLevel }) {
  const rollData = actor?.getRollData() ?? {};
  const classes = { ...rollData.classes };
  for (const slot of classRoster) {
    const identifier = slot.classDoc?.system?.identifier;
    if (identifier) classes[identifier] = { ...classes[identifier], levels: slot.level };
  }
  return { ...rollData, classes, details: { ...rollData.details, level: characterLevel } };
}

/**
 * Sum the per-level and flat max-HP bonuses dnd5e will apply after this run: the actor's own (level-up) plus transfer effects on newly granted items.
 * @param {object} args Inputs.
 * @param {string[]} args.uuids Items this run grants or picks.
 * @param {?object} args.actor Level-up actor; null at creation.
 * @param {object} args.rollData Roll data from `hpBonusRollData`.
 * @returns {Promise<{level: number, overall: number}>} Bonus per level and flat bonus.
 */
export async function computeHpBonus({ uuids, actor, rollData }) {
  const bonus = { level: 0, overall: 0 };
  if (actor && actor._source.system.attributes.hp.max !== null) return bonus;
  const { simplifyBonus } = dnd5e.utils;
  if (actor) {
    bonus.level += simplifyBonus(actor.system.attributes.hp.bonuses.level, rollData);
    bonus.overall += simplifyBonus(actor.system.attributes.hp.bonuses.overall, rollData);
  }
  for (const doc of await Promise.all(uuids.map((uuid) => fromUuid(uuid)))) {
    for (const effect of doc?.effects ?? []) {
      if (!effect.transfer || effect.disabled) continue;
      for (const change of effect.system.changes ?? []) {
        const bucket = HP_BONUS_KEYS[change.key];
        if (bucket && change.type === 'add') bonus[bucket] += simplifyBonus(change.value, rollData);
      }
    }
  }
  return bonus;
}

/**
 * 5e average roll for a hit die: `floor(die / 2) + 1`.
 * @param {number} die Die size.
 * @returns {number} Average value.
 */
export function averageRoll(die) {
  return die ? Math.floor(die / 2) + 1 : 0;
}

/**
 * Convert an HP-tab value into the form dnd5e stores on a HitPoints advancement (`"max"`, `"avg"`, or the rolled number).
 * @param {object} hpAdv HitPoints advancement.
 * @param {number} value Hit-die value from the HP tab.
 * @param {?string} method HP-tab method (`average`, `max`, `manual`).
 * @param {number} level Class level being applied.
 * @returns {number|string} Advancement value.
 */
export function hpAdvancementValue(hpAdv, value, method, level) {
  const die = hpAdv.hitDieValue;
  if (value === die && (method !== 'manual' || level === 1)) return 'max';
  if (method === 'average' && value === averageRoll(die)) return 'avg';
  return value;
}

/**
 * @param {?(string|number)} score Ability score.
 * @returns {number} Standard 5e modifier.
 */
function abilityMod(score) {
  const n = Number(score);
  return Number.isFinite(n) ? Math.floor((n - 10) / 2) : 0;
}

/**
 * Build the HP-tab context: a flat `cards[]` (one per level) plus header chips.
 * @param {object} args Builder inputs.
 * @param {object} [args.draft] Saved hp draft (`{rolls:{[slotId]:{[lvl]:number}}, attempts:{[slotId]:{[lvl]:number}}}`).
 * @param {Array<object>} args.roster Per-slot inputs (`{slotId, level, classDoc, isPrimary, startLevel, lockedRolls?}`).
 * @param {?(string|number)} args.conScore Constitution score.
 * @param {'creation'|'level_up'} [args.mode] Render mode axis.
 * @param {object} [args.rerollPolicy] Reroll gating policy (`{allowRerolls?, maxRerollAttempts?}`).
 * @param {boolean} [args.l1MaxDie] When true (RAW), the primary class's level 1 is locked to max die regardless of method.
 * @param {{level: number, overall: number}} [args.hpBonus] Per-level and flat max-HP bonuses from `computeHpBonus`.
 * @returns {object} Render context with `cards` + header data.
 */
export function buildHpContext({ draft = {}, roster = [], conScore, mode = 'creation', rerollPolicy = {}, l1MaxDie = true, hpBonus = { level: 0, overall: 0 } }) {
  const allowed = game.settings.get(MODULE.ID, MODULE.SETTINGS.ALLOWED_HP_METHODS) ?? { average: true, max: true, manual: true };
  const enabledMethods = HP_METHODS.filter((m) => allowed[m] !== false);
  const method = enabledMethods.includes(draft.method) ? draft.method : (enabledMethods[0] ?? 'average');
  const conMod = abilityMod(conScore);
  const allowRerolls = rerollPolicy.allowRerolls !== false;
  const maxAttempts = Number(rerollPolicy.maxRerollAttempts) || 0;
  const slots = sortRoster(roster);
  const cards = [];
  const perClassMap = new Map();
  let total = 0;
  let allFilled = true;
  for (const slot of slots) {
    const die = parseHitDie(slot.classDoc);
    if (!die || !slot.classDoc) continue;
    const slotRolls = draft.rolls?.[slot.slotId] ?? {};
    const slotAttempts = draft.attempts?.[slot.slotId] ?? {};
    const lockedRolls = slot.lockedRolls ?? {};
    const endLevel = Math.max(1, Math.min(20, Number(slot.level) || 1));
    const startLevel = Math.max(1, Math.min(endLevel, Number(slot.startLevel) || 1));
    let classSubtotal = 0;
    let classLevels = 0;
    for (let lvl = startLevel; lvl <= endLevel; lvl++) {
      const card = buildCard({ slot, die, conMod, levelBonus: hpBonus.level, method, lvl, slotRolls, slotAttempts, lockedRolls, allowRerolls, maxAttempts, l1MaxDie });
      card.characterLevel = cards.length + 1;
      cards.push(card);
      classLevels++;
      classSubtotal += card.total;
      total += card.total;
      if (!card.hasValue) allFilled = false;
    }
    if (classLevels > 0) {
      const key = `${slot.classDoc.name}|d${die}`;
      const existing = perClassMap.get(key);
      if (existing) {
        existing.count += classLevels;
        existing.classTotal += classSubtotal;
      } else {
        perClassMap.set(key, { className: slot.classDoc.name, dieLabel: `d${die}`, count: classLevels, classTotal: classSubtotal });
      }
    }
  }
  const perClassChips = [...perClassMap.values()];
  const hitDieGroups = perClassChips
    .map((c) => {
      const die = Number(c.dieLabel.slice(1));
      return { className: c.className, die, dieLabel: c.dieLabel, count: c.count, icons: Array.from({ length: c.count }, () => ({ die, dieLabel: c.dieLabel })) };
    })
    .sort((a, b) => b.die - a.die || a.className.localeCompare(b.className));
  if (cards.length) total += hpBonus.overall;
  const available = cards.length > 0;
  const cols = cards.length > 16 ? 5 : Math.min(4, Math.max(1, cards.length));
  const methodOptions = enabledMethods.map((m) => ({ value: m, label: _loc(`HEROMANCER.Settings.HPMethod.Choices.${m}`), active: m === method }));
  return { available, cards, total, conMod, overallBonus: hpBonus.overall, method, methodOptions, isManual: method === 'manual', allFilled, mode, perClassChips, hitDieGroups, gridCols: cols };
}

/**
 * Sort the roster: primary slot first, then non-primary slots alphabetical by class name.
 * @param {object[]} roster Per-slot inputs.
 * @returns {object[]} Sorted shallow copy.
 */
function sortRoster(roster) {
  const indexed = roster.map((s, i) => ({ s, i }));
  indexed.sort((a, b) => {
    if (a.s.isPrimary !== b.s.isPrimary) return a.s.isPrimary ? -1 : 1;
    if (a.s.isPrimary && b.s.isPrimary) return a.i - b.i;
    const an = String(a.s.classDoc?.name ?? '');
    const bn = String(b.s.classDoc?.name ?? '');
    return an.localeCompare(bn) || a.i - b.i;
  });
  return indexed.map((x) => x.s);
}

/**
 * Build a single card context for one (slot, level) pair.
 * @param {object} args Per-card inputs.
 * @param {object} args.slot Roster slot.
 * @param {number} args.die Hit-die size (4/6/8/10/12).
 * @param {number} args.conMod Constitution modifier.
 * @param {number} args.levelBonus Per-level max-HP bonus.
 * @param {string} args.method HP method (`max`/`average`/`manual`).
 * @param {number} args.lvl Character level for this card.
 * @param {Object<string, number>} args.slotRolls Existing manual rolls keyed by level.
 * @param {Object<string, number>} args.slotAttempts Existing reroll attempts keyed by level.
 * @param {Object<string, number>} args.lockedRolls Pre-locked level-up rolls keyed by level.
 * @param {boolean} args.allowRerolls Whether manual rerolls are permitted.
 * @param {number} args.maxAttempts Max reroll attempts (0 = unlimited).
 * @param {boolean} args.l1MaxDie When true, primary class L1 is locked to max die.
 * @returns {object} Card context.
 */
function buildCard({ slot, die, conMod, levelBonus, method, lvl, slotRolls, slotAttempts, lockedRolls, allowRerolls, maxAttempts, l1MaxDie }) {
  const isPrimaryL1 = slot.isPrimary !== false && lvl === 1 && l1MaxDie;
  const isLocked = Boolean(slot.locked);
  let value;
  let modeTag;
  let label;
  if (isLocked) {
    value = Number(lockedRolls[lvl]) || 0;
    modeTag = 'locked';
    label = 'applied';
  } else if (isPrimaryL1 || method === 'max') {
    value = die;
    modeTag = 'auto-max';
    label = 'max';
  } else if (method === 'manual') {
    const stored = Number(slotRolls[lvl]);
    value = Number.isFinite(stored) && stored > 0 ? stored : 0;
    modeTag = 'manual';
    label = 'roll';
  } else {
    value = averageRoll(die);
    modeTag = 'auto-average';
    label = 'average';
  }
  const hasValue = value > 0;
  const total = hasValue ? Math.max(1, value + conMod) + levelBonus : 0;
  const hearts = Array.from({ length: die }, (_, i) => ({ idx: i + 1, filled: i + 1 <= value }));
  const rowSize = Math.ceil(die / 2);
  const heartRows = [];
  for (let i = 0; i < hearts.length; i += rowSize) heartRows.push(hearts.slice(i, i + rowSize));
  const attempts = Number(slotAttempts[lvl]) || 0;
  const attemptsCapped = maxAttempts > 0 && attempts >= maxAttempts;
  const showRollBtn = modeTag === 'manual';
  const isRollable = showRollBtn && (!hasValue || (allowRerolls && !attemptsCapped));
  return {
    slotId: slot.slotId,
    level: lvl,
    className: slot.classDoc.name,
    classImg: slot.classDoc.img ?? null,
    dieLabel: `d${die}`,
    die,
    mode: modeTag,
    isLocked,
    label,
    value,
    total,
    conMod,
    conSign: conMod < 0 ? '-' : '+',
    conAbs: Math.abs(conMod),
    levelBonus,
    hasValue,
    hearts,
    heartRows,
    attempts,
    attemptsCapped,
    showRollBtn,
    rollDisabled: showRollBtn && !isRollable
  };
}
