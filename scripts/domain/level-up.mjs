import { HeroMancer } from '../apps/hero-mancer.mjs';
import { MODULE } from '../constants.mjs';
import * as documentLoader from '../data/document-loader.mjs';
import { log } from '../utils/logger.mjs';
import { commitClone } from './actor-commit.mjs';
import { advancementApplyData, advancementLevels, classAdvApplies, isOriginalClassItem } from './advancement-chooser.mjs';
import { markAdvancementRowError } from './advancements-tab.mjs';
import { applySubclassFromIdentity } from './character.mjs';

/**
 * Snapshot an actor's current class roster as a level-up seed.
 * @param {object} actor Character actor.
 * @returns {{actorUuid: string, classes: Array<{id: string, uuid: string, name: string, level: number, subclassUuid: ?string}>, totalLevel: number}} Roster.
 */
export function snapshotActorClasses(actor) {
  const classes = [];
  let totalLevel = 0;
  for (const item of actor.items) {
    if (item.type !== 'class') continue;
    const level = Number(item.system?.levels) || 0;
    const identifier = item.system?.identifier ?? null;
    const sourceRules = item.system?.source?.rules ?? null;
    totalLevel += level;
    const subclassUuid = actor.items.find((i) => i.type === 'subclass' && i.system?.classIdentifier === identifier)?.uuid ?? null;
    classes.push({ id: item.id, uuid: item.uuid, name: item.name, identifier, level, img: item.img, subclassUuid, sourceRules });
  }
  return { actorUuid: actor.uuid, classes, totalLevel };
}

/**
 * Open Hero Mancer in level-up mode for an existing character.
 * @param {object} actor Character actor.
 * @returns {?HeroMancer} App instance, or null when actor isn't a character.
 */
export function openLevelUp(actor) {
  if (!actor || actor.type !== 'character') {
    ui.notifications.warn('HEROMANCER.LevelUp.NotCharacter', { localize: true });
    return null;
  }
  const id = `${MODULE.ID}-wizard-levelup-${actor.id}`;
  const app = foundry.applications.instances.get(id) ?? new HeroMancer({ id, mode: 'level_up', actor, levelUpDraft: { roster: snapshotActorClasses(actor) } });
  app.render({ force: true });
  Hooks.callAll(MODULE.HOOKS.LEVEL_UP_STARTED, { actor, app });
  return app;
}

/** @type {Set<string>} Advancement types whose grants/values dnd5e can populate from configuration alone (no user data). */
const AUTO_APPLY_TYPES = new Set(['ItemGrant', 'Size', 'Trait']);

/**
 * Apply a level-up to an existing actor atomically.
 * @param {object} args Apply inputs.
 * @param {object} args.actor Target character actor.
 * @param {string} args.pickedUuid Picked class uuid from the level-up tab.
 * @param {boolean} args.isMulticlass True when the pick is a multiclass tile (new class, level 1).
 * @param {?string} [args.pickedSubclass] Picked subclass uuid when the picked class hits its subclass-grant level.
 * @param {{rolls: Object<string|number, string|number>}} args.hpDraft HP-tab draft.
 * @param {Object<string, Object<number, object>>} args.advancementDraft Advancement-tab pick map.
 * @param {?HTMLElement} [args.wizardElement] Wizard root for per-row error stamping.
 * @returns {Promise<?{actor: object, newLevel: number, classItem: object}>} Result on success, null on rollback.
 */
export async function applyLevelUp({ actor, pickedUuid, isMulticlass, pickedSubclass = null, hpDraft, advancementDraft, wizardElement = null }) {
  if (!actor || !pickedUuid) return null;
  const clone = actor.clone({}, { keepId: true });
  let classItem = null;
  let newLevel = 0;
  try {
    if (isMulticlass) {
      const classDoc = await documentLoader.getFullDocument(pickedUuid);
      if (!classDoc) throw new Error('multiclass class doc not resolvable');
      const classData = classDoc.toObject();
      classData._id = foundry.utils.randomID();
      classData.system = { ...classData.system, levels: 1 };
      clone.updateSource({ items: [classData] });
      classItem = clone.items.get(classData._id);
      newLevel = 1;
    } else {
      classItem = clone.items.find((i) => i.type === 'class' && i.uuid === pickedUuid) ?? clone.items.find((i) => i.type === 'class' && i.flags?.core?.sourceId === pickedUuid);
      if (!classItem) {
        const live = actor.items.find((i) => i.type === 'class' && i.uuid === pickedUuid);
        classItem = live ? clone.items.get(live.id) : null;
      }
      if (!classItem) throw new Error('existing class item not found on clone');
      newLevel = (Number(classItem.system?.levels) || 0) + 1;
      classItem.updateSource({ 'system.levels': newLevel });
    }
    const characterLevel = (actor.system?.details?.level ?? 0) + 1;
    if (pickedSubclass) await applySubclassFromIdentity(classItem, pickedSubclass, newLevel);
    await applySubclassPicks(clone, advancementDraft, newLevel, wizardElement);
    await applyAutoAdvancementsAtLevel(clone, newLevel, characterLevel, classItem);
    await applyHitPoints(classItem, newLevel, hpDraft);
    const ok = await applyNonSubclassPicks(clone, advancementDraft, wizardElement);
    if (!ok) throw new Error('advancement application aborted');
    await commitClone(actor, clone);
  } catch (err) {
    log(1, 'applyLevelUp aborted (no actor mutation):', err);
    return null;
  }
  Hooks.callAll(MODULE.HOOKS.LEVEL_UP_COMPLETED, { actor, newLevel });
  return { actor, newLevel };
}

/**
 * Apply every Subclass-type pick before non-subclass picks so subclass-level advancements resolve against the just-created subclass item.
 * @param {object} actor Target actor.
 * @param {Object<string, Object<number, object>>} draft Advancement pick map.
 * @param {number} newLevel Level being applied this run.
 * @param {?HTMLElement} wizardElement Wizard root for error stamping.
 * @returns {Promise<void>}
 */
async function applySubclassPicks(actor, draft, newLevel, wizardElement) {
  for (const [advId, byLevel] of Object.entries(draft ?? {})) {
    const adv = findAdvancement(actor, advId);
    if (!adv || adv.constructor?.typeName !== 'Subclass') continue;
    const data = byLevel?.[newLevel] ?? byLevel?.[String(newLevel)];
    if (!data) continue;
    try {
      await adv.apply(newLevel, data);
    } catch (err) {
      if (wizardElement) markAdvancementRowError(wizardElement, advId, newLevel, err?.message ?? String(err));
      throw err;
    }
  }
}

/**
 * Fire auto-applying advancements for the level just gained.
 * @param {object} actor Target actor.
 * @param {number} newLevel Class level being applied.
 * @param {number} characterLevel Character level being gained.
 * @param {object} classItem Class item being levelled (its subclass is matched by identifier).
 * @returns {Promise<void>}
 */
async function applyAutoAdvancementsAtLevel(actor, newLevel, characterLevel, classItem) {
  const classId = classItem?.id ?? null;
  const classIdentifier = classItem?.system?.identifier ?? null;
  const classIsOriginal = isOriginalClassItem(classItem);
  for (const item of actor.items) {
    let scopeLevel;
    let isOriginalClass = true;
    if (item.type === 'race' || item.type === 'background') scopeLevel = characterLevel;
    else if (item.id === classId) {
      scopeLevel = newLevel;
      isOriginalClass = classIsOriginal;
    } else if (item.type === 'subclass' && (!item.system?.classIdentifier || item.system?.classIdentifier === classIdentifier)) {
      scopeLevel = newLevel;
      isOriginalClass = classIsOriginal;
    } else continue;
    for (const adv of Object.values(item.advancement?.byId ?? {})) {
      const type = adv.constructor?.typeName;
      if (!AUTO_APPLY_TYPES.has(type)) continue;
      if (!classAdvApplies(adv.classRestriction, isOriginalClass)) continue;
      if (!advancementLevels(adv).includes(scopeLevel)) continue;
      await adv.apply(scopeLevel, {}, { initial: true });
    }
  }
}

/**
 * Apply the HP advancement on the picked class item at the new level using the HP-tab draft row.
 * @param {object} classItem Class item being levelled.
 * @param {number} newLevel Level being applied this run.
 * @param {{rolls: Object<string|number, string|number>}} hpDraft HP-tab draft.
 * @returns {Promise<void>}
 */
async function applyHitPoints(classItem, newLevel, hpDraft) {
  const hpAdv = Object.values(classItem.advancement?.byId ?? {}).find((a) => a.constructor?.typeName === 'HitPoints');
  if (!hpAdv) return;
  const bucket = hpDraft?.rolls?.levelup ?? {};
  const raw = bucket[newLevel] ?? bucket[String(newLevel)];
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return;
  await hpAdv.apply(newLevel, { [newLevel]: value });
}

/**
 * Walk the advancement draft and apply every non-subclass pick at the new level.
 * @param {object} actor Target actor.
 * @param {Object<string, Object<number, object>>} draft Advancement pick map.
 * @param {?HTMLElement} wizardElement Wizard root for error stamping.
 * @returns {Promise<boolean>} True when every pick applied.
 */
async function applyNonSubclassPicks(actor, draft, wizardElement) {
  for (const [advId, byLevel] of Object.entries(draft ?? {})) {
    const adv = findAdvancement(actor, advId);
    if (!adv) continue;
    if (adv.constructor?.typeName === 'Subclass') continue;
    for (const [levelStr, data] of Object.entries(byLevel)) {
      const level = Number(levelStr);
      try {
        await adv.apply(level, advancementApplyData(adv, data));
      } catch (err) {
        const reason = err?.message ?? String(err);
        if (wizardElement) markAdvancementRowError(wizardElement, advId, level, reason);
        log(1, `Advancement ${advId} L${level} apply failed:`, err);
        return false;
      }
    }
  }
  return true;
}

/**
 * Locate an Advancement by id across every embedded item on the actor.
 * @param {object} actor Target actor.
 * @param {string} advancementId Advancement id.
 * @returns {?object} Matching advancement, or null when no item carries it.
 */
function findAdvancement(actor, advancementId) {
  for (const item of actor.items) {
    const adv = item.advancement?.byId?.[advancementId];
    if (adv) return adv;
  }
  return null;
}
