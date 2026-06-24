import { MODULE } from '../constants.mjs';
import { createBirthdayNote } from '../integrations/calendaria.mjs';
import { log } from '../utils/logger.mjs';
import { commitClone } from './actor-commit.mjs';
import { advancementApplyData, advancementLevels, classAdvApplies, isOriginalClassItem } from './advancement-chooser.mjs';
import { markAdvancementRowError, reportFeatGrantFailure } from './advancements-tab.mjs';
import { collectSectionPicks, collectShopPicks } from './equipment-selections.mjs';
import { buildEquipmentContext } from './equipment-tab.mjs';
import { publishCharacterSummary } from './summary-message.mjs';

/**
 * Create a character actor from a serializable payload, then apply class + subclass + advancements + equipment.
 * @param {object} args Submission inputs.
 * @param {object} args.payload Serializable wizard snapshot (start, identity, abilities, advancement, biography, equipment, opt-out flags). Shape: `SubmissionPayload` in `domain/approval.mjs`.
 * @param {HTMLElement} [args.wizardElement] Optional wizard root for per-row advancement error stamping; absent on socket-replay path.
 * @param {?object} [args.originalPayload] Original player-submitted payload to stash on the actor flag when the GM edits before approving.
 * @returns {Promise<?Actor>} Created actor on success, null on failure (actor is rolled back).
 */
export async function createCharacter({ payload, wizardElement = null, originalPayload = null }) {
  const { startDraft, identityDraft, abilitiesDraft, advancementDraft = {}, biographyDraft = {}, equipmentDraft = {}, hpDraft = { rolls: {} }, skipSpellHandoff = false } = payload ?? {};
  const rosterInput = Array.isArray(identityDraft?.classes) ? identityDraft.classes : [];
  if (!rosterInput.length || !rosterInput[0]?.uuid) return null;
  const resolvedRoster = [];
  for (let i = 0; i < rosterInput.length; i++) {
    const slot = rosterInput[i];
    if (!slot.uuid) continue;
    const classDoc = await fromUuid(slot.uuid);
    if (!classDoc) continue;
    resolvedRoster.push({ slotId: slot.slotId ?? `slot-${i}`, classDoc, level: Math.max(0, Number(slot.level) || 0), subclassUuid: slot.subclassUuid ?? '', isPrimary: i === 0 });
  }
  if (!resolvedRoster.length) return null;
  const primary = resolvedRoster[0];
  const totalLevel = resolvedRoster.reduce((sum, s) => sum + s.level, 0);
  const backgroundDoc = identityDraft?.background ? await fromUuid(identityDraft.background) : null;
  const actor = await Actor.implementation.create(buildActorData({ startDraft, abilitiesDraft, biographyDraft, skipSpellHandoff, originalPayload }));
  if (!actor) return null;
  Hooks.callAll(MODULE.HOOKS.PRE_CREATE, { actor, draft: advancementDraft });
  try {
    const clone = actor.clone({}, { keepId: true });
    const itemsToInsert = [];
    const classItemIdsBySlot = new Map();
    for (const slot of resolvedRoster) {
      const data = slot.classDoc.toObject();
      data._id = foundry.utils.randomID();
      data.system = { ...data.system, levels: slot.level };
      itemsToInsert.push(data);
      classItemIdsBySlot.set(slot.slotId, data._id);
    }
    const details = { originalClass: classItemIdsBySlot.get(primary.slotId) };
    const speciesDoc = identityDraft?.species ? await fromUuid(identityDraft.species) : null;
    if (speciesDoc) {
      const speciesData = speciesDoc.toObject();
      speciesData._id = foundry.utils.randomID();
      itemsToInsert.push(speciesData);
      details.race = speciesData._id;
    }
    if (backgroundDoc) {
      const backgroundData = backgroundDoc.toObject();
      backgroundData._id = foundry.utils.randomID();
      itemsToInsert.push(backgroundData);
      details.background = backgroundData._id;
    }
    clone.updateSource({ items: itemsToInsert, system: { details } });
    for (const slot of resolvedRoster) {
      const itemId = classItemIdsBySlot.get(slot.slotId);
      const classItem = clone.items.get(itemId);
      if (!classItem) throw new Error(`class item insert failed on clone for slot ${slot.slotId}`);
      await applySubclassFromIdentity(classItem, slot.subclassUuid, slot.level);
      await applyHitPointsAcrossLevels(classItem, slot.level, hpDraft, slot.slotId);
    }
    const classLevelByItemId = Object.fromEntries([...classItemIdsBySlot.values()].map((id, idx) => [id, resolvedRoster[idx].level]));
    const autoProcessed = new Set();
    const appliedPicks = new Set();
    for (let round = 0; round < 10; round++) {
      const autoApplied = await applyAutoAdvancements(clone, { totalLevel, classLevelByItemId, processed: autoProcessed });
      const picks = await applyAdvancementPicks(clone, advancementDraft, wizardElement, appliedPicks);
      if (!picks.ok) throw new Error('advancement application aborted');
      if (!autoApplied && !picks.applied) break;
    }
    await commitClone(actor, clone);
    const equipmentContext = await buildEquipmentContext({ classDoc: primary.classDoc, backgroundDoc, draft: equipmentDraft });
    const picks = collectEquipmentPicks({ equipmentContext, draft: equipmentDraft });
    if (picks.length) await createEquipmentItems(actor, picks);
    await depositShopRemainder(actor, equipmentContext);
  } catch (err) {
    log(1, 'createCharacter rollback:', err);
    await actor.delete();
    return null;
  }
  await publishCharacterSummary(actor);
  await applyPlayerCustomization(startDraft);
  await assignToPlayer(actor, startDraft);
  if (startDraft?.birthday) await createBirthdayNote(actor, normalizeBirthday(startDraft.birthday));
  Hooks.callAll(MODULE.HOOKS.CREATED, { actor });
  return actor;
}

/**
 * Coerce a birthday draft (which may carry string-typed form values) into integers for Calendaria.
 * @param {?object} birthday Birthday object from the start draft.
 * @returns {?{year:number, month:number, day:number}} Normalized birthday or null when incomplete.
 */
function normalizeBirthday(birthday) {
  const year = Number(birthday?.year);
  const month = Number(birthday?.month);
  const day = Number(birthday?.day);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

/** @type {string[]} Biography fields that map directly onto `actor.system.details` text fields. */
const DETAIL_TEXT_FIELDS = ['alignment', 'faith', 'gender', 'eyes', 'hair', 'skin', 'age', 'height', 'weight', 'ideals', 'bonds', 'flaws'];

/**
 * Build the minimal `Actor.create` payload from start + abilities + biography drafts.
 * @param {object} args Builder inputs.
 * @param {object} args.startDraft Camel-cased start-tab draft.
 * @param {{abilities: Object<string, Object<string, string>>}} args.abilitiesDraft Abilities snapshot.
 * @param {object} [args.biographyDraft] Biography-tab snapshot (flat keys).
 * @param {boolean} [args.skipSpellHandoff] Stamp the skip-spell-handoff flag on the actor.
 * @param {?object} [args.originalPayload] Original player-submitted payload to stash on the actor flag for audit.
 * @returns {object} Actor creation data.
 */
function buildActorData({ startDraft, abilitiesDraft, biographyDraft = {}, skipSpellHandoff = false, originalPayload = null }) {
  const abilities = {};
  for (const [key, fields] of Object.entries(abilitiesDraft?.abilities ?? {})) {
    const value = Number(fields?.value);
    if (Number.isFinite(value)) abilities[key] = { value };
  }
  const details = buildDetails(biographyDraft);
  const characterArt = startDraft?.characterArt?.trim() || undefined;
  const tokenSrc = startDraft?.linkTokenArt ? characterArt : startDraft?.tokenArt?.trim() || undefined;
  const data = {
    name: startDraft?.characterName?.trim() || _loc('HEROMANCER.Character.DefaultName'),
    type: 'character',
    img: characterArt,
    system: { abilities, details, attributes: { hp: { value: 0 } } }
  };
  if (tokenSrc) data.prototypeToken = { texture: { src: tokenSrc } };
  if (startDraft?.ringEnabled) {
    data.prototypeToken = data.prototypeToken ?? {};
    data.prototypeToken.ring = { enabled: true, colors: { ring: startDraft.ringColor || null, background: startDraft.backgroundColor || null } };
  }
  const flagBag = {};
  if (skipSpellHandoff) flagBag[MODULE.FLAGS.SKIP_SPELL_HANDOFF] = true;
  if (originalPayload) flagBag[MODULE.FLAGS.SUBMITTED_PAYLOAD] = JSON.stringify(originalPayload);
  if (Object.keys(flagBag).length) data.flags = { [MODULE.ID]: flagBag };
  const dsnAppearance = buildDsnAppearance(startDraft);
  if (dsnAppearance) {
    data.flags = data.flags ?? {};
    data.flags['dice-so-nice'] = { appearance: dsnAppearance };
  }
  applyTokenizerArt(data, startDraft);
  const ownership = buildOwnership(startDraft?.player);
  if (ownership) data.ownership = ownership;
  return data;
}

/**
 * Build the per-actor DSN appearance flag from the start-tab captured JSON snapshot, or null when DSN inactive / picker untouched.
 * @param {object} startDraft Camel-cased start-tab draft.
 * @returns {?object} DSN appearance payload as captured from the user's flag at the moment they saved DSN config, or null.
 */
function buildDsnAppearance(startDraft) {
  if (!MODULE.COMPAT?.DSN) return null;
  const raw = (startDraft?.diceAppearance || '').trim();
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return parsed?.global ? parsed : null;
}

/**
 * Merge Tokenizer 2's captured prototype-token patch and layer stack onto the actor payload.
 * @param {object} data Actor creation payload, mutated in place.
 * @param {object} startDraft Camel-cased start-tab draft.
 */
function applyTokenizerArt(data, startDraft) {
  if (!MODULE.COMPAT?.TOKENIZER) return;
  let patch = null;
  const patchRaw = (startDraft?.tokenizerPrototype || '').trim();
  if (patchRaw) {
    try {
      patch = JSON.parse(patchRaw);
    } catch {
      patch = null;
    }
  }
  if (patch) foundry.utils.mergeObject(data, foundry.utils.expandObject(patch));
  let layerStack = null;
  const layersRaw = (startDraft?.tokenizerLayers || '').trim();
  if (layersRaw) {
    try {
      layerStack = JSON.parse(layersRaw);
    } catch {
      layerStack = null;
    }
  }
  if (layerStack) {
    data.flags = data.flags ?? {};
    data.flags['tokenizer-2'] = { layerStack };
  }
}

/**
 * Map biography draft fields onto the dnd5e `system.details` shape.
 * @param {object} biographyDraft Biography-tab snapshot.
 * @returns {object} Detail subdocument with text fields, traits, appearance, and biography rich text.
 */
function buildDetails(biographyDraft) {
  const details = {};
  for (const key of DETAIL_TEXT_FIELDS) {
    const value = biographyDraft?.[key];
    if (value) details[key] = value;
  }
  if (biographyDraft?.traits) details.trait = biographyDraft.traits;
  const biography = {};
  if (biographyDraft?.backstory) biography.value = biographyDraft.backstory;
  if (biographyDraft?.appearance) biography.public = biographyDraft.appearance;
  if (Object.keys(biography).length) details.biography = biography;
  return details;
}

/**
 * Assign the created actor as the owning player's `User.character`: the assigned player, or the current user when unassigned (self-creation / submitter replay). Skips GMs.
 * @param {Actor} actor Newly-created actor.
 * @param {object} startDraft Camel-cased start-tab draft.
 * @returns {Promise<void>}
 */
async function assignToPlayer(actor, startDraft) {
  const user = game.users.get(startDraft?.player || game.user.id);
  if (!user || user.isGM || user.character?.id === actor.id) return;
  if (user.id !== game.user.id && !game.user.isGM) return;
  try {
    await user.update({ character: actor.id });
  } catch (err) {
    log(2, 'assignToPlayer failed:', err);
  }
}

/**
 * Apply Start-tab player-customization (color + pronouns) to the target User document: the assigned player, or the current user when unassigned.
 * @param {object} startDraft Camel-cased start-tab draft.
 * @returns {Promise<void>}
 */
async function applyPlayerCustomization(startDraft) {
  if (!game.settings.get(MODULE.ID, MODULE.SETTINGS.ENABLE_PLAYER_CUSTOMIZATION)) return;
  const targetUser = game.users.get(startDraft?.player) ?? game.user;
  if (!targetUser) return;
  const update = {};
  const color = startDraft?.playerColor?.trim();
  if (color && color !== targetUser.color?.css) update.color = color;
  const pronouns = startDraft?.playerPronouns?.trim();
  if (pronouns && pronouns !== targetUser.pronouns) update.pronouns = pronouns;
  if (!Object.keys(update).length) return;
  try {
    await targetUser.update(update);
  } catch (err) {
    log(2, 'applyPlayerCustomization failed:', err);
  }
}

/**
 * Build an actor ownership map granting OWNER to the assigned player when valid.
 * @param {?string} playerId Selected user id from the start-tab player assignment.
 * @returns {?Object<string, number>} Ownership map or null when no assignment.
 */
function buildOwnership(playerId) {
  if (!playerId) return null;
  const user = game.users.get(playerId);
  if (!user || user.isGM) return null;
  return { [playerId]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
}

/**
 * Apply any Subclass-type advancements on the class item using the subclass uuid picked on the Identity tab.
 * @param {Item} classItem Embedded class Item.
 * @param {?string} subclassUuid Subclass uuid from identity draft.
 * @param {number} effectiveLevel Character level — guards subclass apply when the threshold isn't reached.
 * @returns {Promise<void>}
 */
export async function applySubclassFromIdentity(classItem, subclassUuid, effectiveLevel) {
  if (!subclassUuid) return;
  for (const adv of Object.values(classItem.advancement.byId)) {
    if (adv.constructor?.typeName !== 'Subclass') continue;
    const level = adv.levels?.[0] ?? adv.level ?? 1;
    if (level > effectiveLevel) continue;
    await adv.apply(level, { uuid: subclassUuid });
  }
}

/** @type {Set<string>} Advancement types whose grants/values dnd5e can populate from configuration alone (no user data). */
const AUTO_APPLY_TYPES = new Set(['ItemGrant', 'Size', 'Trait', 'ScaleValue', 'ModifyItem']);

/**
 * Whether an advancement is a fixed-value Ability Score Improvement (preset bonuses, no player choice). dnd5e fills these from `configuration.fixed` on an `initial` apply, so they belong on the auto path.
 * @param {object} adv Advancement instance.
 * @returns {boolean} True for a fixed ASI.
 */
function isFixedAsi(adv) {
  return adv?.constructor?.typeName === 'AbilityScoreImprovement' && Object.values(adv.configuration?.fixed ?? {}).some((v) => v);
}

/**
 * Apply the HP advancement on a class item across every level up to its class level, using the per-slot HP-tab draft rolls.
 * @param {Item} classItem Embedded class item (on the clone).
 * @param {number} classLevel Class level for this item (1-20).
 * @param {{rolls: Object<string, Object<string|number, string|number>>}} hpDraft HP-tab draft keyed by slotId then level.
 * @param {string} slotId Identity-roster slot id; selects the per-class roll bucket.
 * @returns {Promise<void>}
 */
async function applyHitPointsAcrossLevels(classItem, classLevel, hpDraft, slotId) {
  const hpAdv = Object.values(classItem.advancement?.byId ?? {}).find((a) => a.constructor?.typeName === 'HitPoints');
  if (!hpAdv) return;
  const rolls = hpDraft?.rolls?.[slotId] ?? {};
  for (let level = 1; level <= classLevel; level++) {
    const raw = rolls[level] ?? rolls[String(level)];
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) continue;
    await hpAdv.apply(level, { [level]: value });
  }
}

/**
 * Walk every advancement on every embedded item, applying auto types within the correct scope.
 * @param {Actor} actor Newly-created actor.
 * @param {object} scope Level scope.
 * @param {number} scope.totalLevel Sum of all class levels (character level).
 * @param {Object<string, number>} scope.classLevelByItemId Map of class item id → class level.
 * @param {Set<string>} [scope.processed] Item ids already auto-applied; persisted across rounds so re-runs only touch items granted since.
 * @returns {Promise<boolean>} True when at least one auto advancement applied this call.
 */
async function applyAutoAdvancements(actor, { totalLevel, classLevelByItemId, processed = new Set() }) {
  const classLevelByIdentifier = {};
  const originalByIdentifier = {};
  for (const item of actor.items) {
    if (item.type !== 'class') continue;
    const id = item.system?.identifier;
    if (!id) continue;
    classLevelByIdentifier[id] = Number(item.system?.levels) || 0;
    originalByIdentifier[id] = isOriginalClassItem(item);
  }
  let appliedAny = false;
  for (let pass = 0; pass < 10; pass++) {
    const pending = actor.items.filter((item) => !processed.has(item.id));
    if (!pending.length) break;
    for (const item of pending) {
      processed.add(item.id);
      let cap;
      let isOriginalClass = true;
      if (item.type === 'class') {
        cap = classLevelByItemId[item.id] ?? totalLevel;
        isOriginalClass = isOriginalClassItem(item);
      } else if (item.type === 'subclass') {
        cap = classLevelByIdentifier[item.system?.classIdentifier] ?? totalLevel;
        isOriginalClass = originalByIdentifier[item.system?.classIdentifier] ?? false;
      } else cap = totalLevel;
      for (const adv of Object.values(item.advancement?.byId ?? {})) {
        const type = adv.constructor?.typeName;
        if (!AUTO_APPLY_TYPES.has(type) && !isFixedAsi(adv)) continue;
        if (!classAdvApplies(adv.classRestriction, isOriginalClass)) continue;
        for (const level of advancementLevels(adv)) {
          if (level < 0 || level > cap) continue;
          await adv.apply(level, {}, { initial: true });
          appliedAny = true;
        }
      }
    }
  }
  return appliedAny;
}

/** @type {Object<string, number>} Apply-order weight per parent-item type; advancements apply background-first so later origins see earlier grants. */
const ORIGIN_APPLY_ORDER = { background: 0, race: 1, class: 2, subclass: 3 };

/**
 * Walk the advancement draft and dispatch `Advancement#apply(level, data)` for each pick.
 * @param {Actor} actor Newly-created actor.
 * @param {Object<string, Object<number, object>>} draft Advancement-pick map.
 * @param {?HTMLElement} wizardElement Wizard root for error stamping; null on replay paths.
 * @param {Set<string>} [appliedSet] Advancement ids already applied; persisted across rounds so re-runs skip them.
 * @returns {Promise<{ok:boolean, applied:boolean}>} `ok` false on apply error; `applied` true when at least one pick applied this call.
 */
async function applyAdvancementPicks(actor, draft, wizardElement, appliedSet = new Set()) {
  let appliedAny = false;
  for (let pass = 0; pass < 10; pass++) {
    const ready = Object.entries(draft)
      .filter(([advId]) => !appliedSet.has(advId))
      .map(([advId, byLevel]) => ({ advId, byLevel, advancement: findAdvancement(actor, advId) }))
      .filter((e) => e.advancement)
      .sort((a, b) => (ORIGIN_APPLY_ORDER[a.advancement.item.type] ?? 9) - (ORIGIN_APPLY_ORDER[b.advancement.item.type] ?? 9));
    if (!ready.length) break;
    for (const { advId, byLevel, advancement } of ready) {
      appliedSet.add(advId);
      for (const [levelStr, data] of Object.entries(byLevel)) {
        const level = Number(levelStr);
        try {
          await advancement.apply(level, advancementApplyData(advancement, data));
        } catch (err) {
          const reason = err?.message ?? String(err);
          if (wizardElement) markAdvancementRowError(wizardElement, advId, level, reason);
          log(1, `Advancement ${advId} L${level} apply failed:`, err);
          return { ok: false, applied: appliedAny };
        }
        reportFeatGrantFailure(advancement, data, advId, level, wizardElement);
      }
      appliedAny = true;
    }
  }
  return { ok: true, applied: appliedAny };
}

/**
 * Locate an Advancement by id across every embedded item on the actor.
 * @param {Actor} actor Target actor.
 * @param {string} advancementId Advancement id.
 * @returns {?object} The matching advancement, or null when no item carries it.
 */
function findAdvancement(actor, advancementId) {
  for (const item of actor.items) {
    const adv = item.advancement?.byId?.[advancementId];
    if (adv) return adv;
  }
  return null;
}

/**
 * Aggregate equipment picks that share a uuid into single entries with summed quantity.
 * @param {object[]} picks Selected equipment entries, each `{uuid, quantity?, ...}`.
 * @returns {object[]} Deduped picks in first-seen order; quantity summed across duplicates.
 */
export function aggregateByUuid(picks) {
  const byKey = new Map();
  for (const pick of picks) {
    if (!pick?.uuid) continue;
    const qty = Number(pick.quantity) || 1;
    const key = `${pick.uuid} ${pick.stack ? 1 : 0}`;
    const existing = byKey.get(key);
    if (existing) existing.quantity += qty;
    else byKey.set(key, { ...pick, quantity: qty });
  }
  return Array.from(byKey.values());
}

/**
 * Resolve the granted stack size for a pick: shop purchases multiply the source stack quantity by the purchase count; grants stamp the pick quantity directly.
 * @param {number} sourceQuantity Source item `system.quantity`.
 * @param {{quantity:number, stack?:boolean}} pick Pick quantity plus shop-stack flag.
 * @returns {number} Final `system.quantity` to stamp.
 */
export function grantedQuantity(sourceQuantity, { quantity, stack = false }) {
  const qty = Number(quantity) || 1;
  return stack ? (Number(sourceQuantity) || 1) * qty : qty;
}

/**
 * Resolve a container Item's `system.contents` Promise to child item data ready for create.
 * @param {object} sourceDoc Container Item Document (must be `type === 'container'`).
 * @param {string} parentItemId The created-on-actor container Item id whose children will reference it.
 * @returns {Promise<object[]>} Array of child item creation data with `system.container` set.
 */
export async function expandContainerContents(sourceDoc, parentItemId) {
  if (sourceDoc?.type !== 'container') return [];
  const contents = await sourceDoc.system?.contents;
  if (!contents?.size) return [];
  return contents.map((child) => {
    const data = child.toObject();
    data.system.container = parentItemId;
    return data;
  });
}

/**
 * Collect every equipment pick from the equipment context + draft, across class / background grants + choices + shop cart.
 * @param {object} args Builder inputs.
 * @param {?object} args.equipmentContext Result of `buildEquipmentContext`.
 * @param {object} [args.draft] Equipment-tab draft (flat keys).
 * @returns {Array<{uuid:string, quantity:number}>} Flat picks list.
 */
export function collectEquipmentPicks({ equipmentContext = null, draft = {} } = {}) {
  const picks = [];
  for (const section of equipmentContext?.sections ?? []) picks.push(...collectSectionPicks(section, draft));
  picks.push(...collectShopPicks(equipmentContext?.shop));
  return picks;
}

/**
 * Create equipment items on an actor from a flat picks list. Containers + multi-quantity stacks + shop purchases all share this path.
 * @param {object} actor Target Actor.
 * @param {Array<{uuid:string, quantity:number}>} picks Pick list (typically from `collectEquipmentPicks`).
 * @returns {Promise<object[]>} Created embedded Item documents.
 */
export async function createEquipmentItems(actor, picks) {
  if (!actor || !picks?.length) return [];
  const aggregated = aggregateByUuid(picks);
  const resolved = [];
  for (const pick of aggregated) {
    let doc = fromUuidSync(pick.uuid);
    if (!doc?.toObject) doc = await fromUuid(pick.uuid);
    if (doc?.toObject) resolved.push({ doc, quantity: pick.quantity, stack: pick.stack });
  }
  const regularData = [];
  const containers = [];
  for (const entry of resolved) {
    if (entry.doc.type === 'container') containers.push(entry);
    else regularData.push(buildItemData(entry.doc, entry.quantity, entry.stack));
  }
  const created = [];
  if (regularData.length) {
    const docs = await actor.createEmbeddedDocuments('Item', regularData);
    created.push(...docs);
  }
  for (const { doc, quantity, stack } of containers) {
    const [parent] = await actor.createEmbeddedDocuments('Item', [buildItemData(doc, quantity, stack)]);
    if (!parent) continue;
    created.push(parent);
    const children = await expandContainerContents(doc, parent.id);
    if (children.length) {
      const childDocs = await actor.createEmbeddedDocuments('Item', children);
      created.push(...childDocs);
    }
  }
  return created;
}

/**
 * Build item creation data from a source document with the resolved stack size stamped onto `system.quantity`.
 * @param {object} doc Source Item Document.
 * @param {number} quantity Pick quantity (purchase count for shop stacks, absolute count for grants).
 * @param {boolean} [stack] Whether the pick is a shop purchase that multiplies the source stack quantity.
 * @returns {object} Item data for `createEmbeddedDocuments`.
 */
function buildItemData(doc, quantity, stack = false) {
  const data = doc.toObject();
  data.system = { ...data.system, quantity: grantedQuantity(data.system?.quantity, { quantity, stack }) };
  return data;
}

/**
 * Deposit any unspent gp from the equipment shop onto the actor as gp/sp currency.
 * @param {Actor} actor Newly-created actor.
 * @param {?object} equipmentContext Built equipment context with `shop.remaining`.
 * @returns {Promise<void>}
 */
async function depositShopRemainder(actor, equipmentContext) {
  const remaining = Number(equipmentContext?.shop?.remaining) || 0;
  if (remaining <= 0) return;
  let gp = Math.floor(remaining);
  let sp = Math.round((remaining - gp) * 10);
  if (sp >= 10) {
    gp += 1;
    sp -= 10;
  }
  const update = {};
  if (gp > 0) update['system.currency.gp'] = gp;
  if (sp > 0) update['system.currency.sp'] = sp;
  if (Object.keys(update).length) await actor.update(update);
}
