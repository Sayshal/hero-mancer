import { replacementCompanions } from '../integrations/tashas-cauldron.mjs';
import { stripHtml, stripNoiseParenthetical } from '../utils/html-text.mjs';
import { advancementKey, splitAdvancementKey } from './advancement-draft.mjs';

/** @type {Set<string>} Advancement types handled by HM directly; never rendered as choosers. */
const HM_OWNED = new Set(['HitPoints', 'Subclass']);

/** @type {Set<string>} Advancement types that auto-apply (no UI). */
const AUTO = new Set(['ScaleValue']);

/** @type {Object<string, Function>} Per-type renderer registry; each entry returns a chooser spec or null. */
const RENDERERS = { AbilityScoreImprovement: asiSpec, ItemChoice: itemChoiceSpec, ItemGrant: itemGrantSpec, Trait: traitSpec, Size: sizeSpec };

/** @type {Object<string, number>} Display sort weight per origin */
const ORIGIN_ORDER = { background: 0, race: 1, class: 2, subclass: 3 };

/** @type {string[]} Core dnd5e advancement types, subclasses before their parents so a module type resolves to its nearest core ancestor. */
const CORE_ADVANCEMENT_TYPES = ['ItemChoice', 'ItemGrant', 'AbilityScoreImprovement', 'HitPoints', 'ModifyItem', 'ScaleValue', 'Size', 'Subclass', 'Trait'];

/**
 * Core dnd5e type of an advancement instance or source entry, resolving module-defined subclasses (e.g. an ItemGrant variant) to their core ancestor.
 * @param {object} adv Advancement instance or source data.
 * @returns {?string} Core type name, or the raw type when it extends no core type.
 */
export function advancementType(adv) {
  const raw = adv?.type ?? adv?.constructor?.typeName ?? adv?.constructor?.metadata?.name;
  if (!raw || CORE_ADVANCEMENT_TYPES.includes(raw)) return raw ?? null;
  const cls = CONFIG.DND5E.advancementTypes[raw]?.documentClass ?? adv.constructor;
  return CORE_ADVANCEMENT_TYPES.find((core) => cls?.prototype instanceof dnd5e.documents.advancement[`${core}Advancement`]) ?? raw;
}

/**
 * Whether a class/subclass advancement applies given the class's original-vs-multiclass status.
 * @param {?string} classRestriction Advancement `classRestriction` (`''`/`'primary'`/`'secondary'`).
 * @param {boolean} isOriginalClass True for the original/primary class, false for a multiclassed class.
 * @returns {boolean} True when the advancement applies.
 */
export function classAdvApplies(classRestriction, isOriginalClass) {
  if (classRestriction === 'primary' && !isOriginalClass) return false;
  if (classRestriction === 'secondary' && isOriginalClass) return false;
  return true;
}

/**
 * Whether a class Item is the actor's original (primary) class.
 * @param {?object} item Class Item.
 * @returns {boolean} True only for the original class.
 */
export function isOriginalClassItem(item) {
  return item?.system?.isOriginalClass === true;
}

/**
 * Level at which an owned non-class item's advancements fire during a class level-up, mirroring dnd5e `createLevelChangeSteps`.
 * @param {object} item Embedded item.
 * @param {object} scope Level scope.
 * @param {?object} scope.classItem Class item being levelled.
 * @param {number} scope.classLevel Class level being gained.
 * @param {number} scope.characterLevel Character level being gained.
 * @returns {?number} Scope level, or null when the item is linked to a different class.
 */
export function ownedItemScopeLevel(item, { classItem, classLevel, characterLevel }) {
  const rootClass = classLinkedRoot(item);
  if (!rootClass) return characterLevel;
  return rootClass.id === classItem?.id ? classLevel : null;
}

/**
 * Class item an embedded item's advancements are linked to, via its dnd5e advancement root.
 * @param {object} item Embedded item.
 * @returns {?object} Root class item (a subclass root resolves to its class), or null when the item keys to character level.
 */
export function classLinkedRoot(item) {
  const root = item.system?.advancementRootItem;
  if (!['class', 'subclass'].includes(root?.type) || !item.system?.advancementClassLinked) return null;
  return root.class ?? root;
}

/**
 * Numeric level list for an advancement.
 * @param {object} adv Advancement instance.
 * @returns {number[]} Levels the advancement applies at.
 */
export function advancementLevels(adv) {
  const raw = adv.levels?.length ? adv.levels : adv.level !== undefined ? [adv.level] : [];
  return raw.map(Number).filter((n) => Number.isFinite(n));
}

/**
 * Apply an advancement through the actor's current instance of it, then reset the actor so later reads see the result.
 * @param {object} actor Actor (or clone) that owns the advancement.
 * @param {object} adv Advancement to apply; re-resolved by item and advancement id.
 * @param {number} level Level to apply at.
 * @param {object} data Apply data.
 * @param {object} [options] Apply options.
 * @returns {Promise<object>} The advancement instance that was applied.
 */
export async function applyAdvancement(actor, adv, level, data, options = {}) {
  const current = actor.items.get(adv.item.id)?.advancement.byId[adv.id] ?? adv;
  await current.apply(level, data, options);
  actor.reset();
  return current;
}

/**
 * Map an HM draft pick to the data shape `Advancement#apply` expects.
 * @param {object} adv Advancement instance.
 * @param {object} data HM draft pick data.
 * @returns {object} Apply-ready data.
 */
export function advancementApplyData(adv, data) {
  const type = advancementType(adv);
  if (type === 'ItemChoice' && (Array.isArray(data?.added) || data?.ability)) {
    const out = {};
    if (Array.isArray(data.added)) out.selected = data.added;
    if (data.replace) out.replace = data.replace;
    if (data.ability) out.ability = data.ability;
    return out;
  }
  if (type === 'ItemGrant') {
    const selected = Array.isArray(data?.selected) ? (grantChoiceSpec(adv, data)?.selected ?? data.selected) : null;
    return { ...(selected && { selected }), ...(data?.ability && { ability: data.ability }) };
  }
  if (type === 'AbilityScoreImprovement' && data?.type === 'feat' && data.feat) return { ...data, uuid: data.feat };
  if (type === 'Size') return { size: data?.size || adv.configuration.sizes.first() || 'med' };
  return data;
}

/**
 * Detect an ASI feat pick that applied without granting a feat item, i.e. its uuid failed to resolve at apply time.
 * @param {object} adv Advancement just applied.
 * @param {object} data HM draft pick data.
 * @returns {boolean} True when a feat was picked but no item landed.
 */
export function featGrantMissing(adv, data) {
  if (adv?.constructor?.typeName !== 'AbilityScoreImprovement') return false;
  if (data?.type !== 'feat' || !data.feat) return false;
  return foundry.utils.isEmpty(adv.value?.feat);
}

/**
 * Uuids of an ItemChoice pick that the system reversed after apply because their prerequisites failed.
 * @param {object} adv Advancement just applied.
 * @param {object} data Apply-ready data.
 * @param {number} level Level applied.
 * @returns {string[]} Dropped uuids.
 */
export function droppedChoicePicks(adv, data, level) {
  if (adv?.constructor?.typeName !== 'ItemChoice' || !Array.isArray(data?.selected)) return [];
  const kept = new Set(Object.values(adv.value?.added?.[level] ?? {}));
  return data.selected.filter((uuid) => !kept.has(uuid));
}

/**
 * Emit chooser rows across class, subclass, and optional extra docs.
 * @param {?object} classDoc Full class Document.
 * @param {number} targetLevel Class level cap.
 * @param {object} [context] Context shared with renderers.
 * @param {?object} [context.subclassDoc] Full subclass Document.
 * @param {Array<{doc: object, origin: 'race'|'background'}>} [context.extraDocs] Extra docs to walk.
 * @param {number} [context.characterLevel] Character level scope for race/background rows.
 * @param {'creation'|'level_up'} [mode] Render mode axis.
 * @returns {Array<object>} Ordered chooser rows.
 */
export function buildAdvancementRows(classDoc, targetLevel, context = {}, mode = 'creation') {
  if (!classDoc || targetLevel < 1) return [];
  const characterLevel = context.characterLevel ?? targetLevel;
  const draft = context.draft?.advancements ?? {};
  const list = [...advancementList(classDoc).map((a) => ({ adv: a, origin: 'class' })), ...advancementList(context.subclassDoc).map((a) => ({ adv: a, origin: 'subclass' }))];
  for (const { doc, origin } of context.extraDocs ?? []) for (const adv of advancementList(doc)) list.push({ adv, origin });
  const isOriginalClass = context.isOriginalClass ?? true;
  const freshSubclass = !!context.subclassDoc && !context.subclassDoc.isEmbedded;
  const rows = [];
  for (const { adv, origin } of list) {
    const type = advancementType(adv);
    if (!type || HM_OWNED.has(type)) continue;
    const classScoped = origin === 'class' || origin === 'subclass';
    if (!classAdvApplies(adv.classRestriction, classScoped ? isOriginalClass : true)) continue;
    const levels = advancementLevels(adv);
    for (const lvl of levels) {
      if (!isRowInScope(origin, lvl, targetLevel, characterLevel, mode, freshSubclass)) continue;
      rows.push(advancementRow(adv, lvl, { origin, draft, context }));
    }
  }
  rows.sort((a, b) => a.level - b.level || ORIGIN_ORDER[a.origin] - ORIGIN_ORDER[b.origin]);
  return rows;
}

/**
 * Chooser rows from the actor's already-owned items, scoped to the levelled class's level when class-linked and to character level otherwise.
 * @param {object} actor Level-up actor.
 * @param {object} scope Level scope.
 * @param {?object} scope.classItem Class item being levelled.
 * @param {number} scope.classLevel Class level being gained.
 * @param {number} scope.characterLevel Character level being gained.
 * @param {Object<string, Object<number, object>>} draft Advancement-pick map.
 * @returns {Array<object>} Chooser rows; class-linked rows carry origin `class`, the rest `feature`.
 */
export function buildOwnedItemRows(actor, scope, draft) {
  const rows = [];
  for (const item of actor.items) {
    if (item.type === 'class' || item.type === 'subclass' || item.type === 'race' || item.type === 'background') continue;
    const scopeLevel = ownedItemScopeLevel(item, scope);
    if (scopeLevel === null) continue;
    const classLinked = !!classLinkedRoot(item);
    for (const adv of Object.values(item.advancement?.byId ?? {})) {
      const type = advancementType(adv);
      if (!type || HM_OWNED.has(type)) continue;
      if (adv.appliesToClass === false) continue;
      if (!advancementLevels(adv).includes(scopeLevel)) continue;
      const row = advancementRow(adv, scopeLevel, { origin: classLinked ? 'class' : 'feature', draft });
      row.classLevelCap = classLinked ? scope.classLevel : null;
      row.title = nestedTitle(item.name, adv, scopeLevel);
      row.icon = adv.img ?? item.img ?? row.icon;
      rows.push(row);
    }
  }
  return rows;
}

/**
 * Build a single chooser row from one advancement at one level.
 * @param {object} adv Advancement instance.
 * @param {number} lvl Level being applied.
 * @param {object} args Row inputs.
 * @param {string} args.origin Row origin (`class`/`subclass`/`race`/`background`).
 * @param {Object<string, Object<number, object>>} [args.draft] Stored picks keyed by `[draftKey][level]`.
 * @param {object} [args.context] Renderer context.
 * @param {?string} [args.originId] Id of the advancement that granted this row's item, for nested rows.
 * @returns {object} Row record.
 */
function advancementRow(adv, lvl, { origin, draft = {}, context = {}, originId = null }) {
  const type = advancementType(adv);
  const id = adv.id ?? adv._id;
  const sourceUuid = adv.item?.uuid ?? null;
  const key = advancementKey(sourceUuid, id, originId);
  const title = stripNoiseParenthetical(stripHtml(adv.titleForLevel?.(lvl) ?? adv.name ?? type));
  const auto = AUTO.has(type) || !RENDERERS[type];
  const value = draft[key]?.[lvl] ?? {};
  const spec = auto ? null : RENDERERS[type](adv, lvl, value, context);
  const grants = type === 'ItemGrant' ? resolveItemGrantEntries(adv) : null;
  const scale = type === 'ScaleValue' ? resolveScaleDelta(adv, lvl) : null;
  return {
    advancementKey: key,
    sourceUuid,
    level: lvl,
    type,
    title,
    icon: adv.img ?? null,
    spec,
    auto,
    origin,
    grants,
    scale,
    source: adv.item?.name ?? null,
    parentIdentifier: adv.item?.identifier ?? null
  };
}

/** @type {number} Max grant-recursion depth, guarding feat→feat cycles. */
const NESTED_DEPTH_CAP = 3;

/**
 * Recurse into items granted by ItemGrant/ItemChoice rows and surface those items' own choice advancements as nested rows, spliced in after their granting parent.
 * @param {Array<object>} rows Rows to walk (top-level rows from `buildAdvancementRows`).
 * @param {object} args Recursion inputs.
 * @param {Object<string, Object<number, object>>} [args.draft] Advancement-pick map.
 * @param {number} [args.characterLevel] Character-level scope for nested rows.
 * @param {Set<string>} [seen] Granted uuids already descended into on this branch.
 * @param {number} [depth] Current recursion depth.
 * @returns {Promise<Array<object>>} Rows with nested rows interleaved after each granting parent.
 */
export async function expandNestedRows(rows, { draft = {}, characterLevel = 1 } = {}, seen = new Set(), depth = 0) {
  const out = [];
  for (const row of rows) {
    out.push(row);
    if (depth >= NESTED_DEPTH_CAP) continue;
    for (const uuid of grantedUuids(row)) {
      if (seen.has(uuid)) continue;
      const doc = await fromUuid(uuid);
      const nested = doc ? nestedItemRows(doc, row, { draft, characterLevel }) : [];
      if (!nested.length) continue;
      out.push(...(await expandNestedRows(nested, { draft, characterLevel }, new Set([...seen, uuid]), depth + 1)));
    }
  }
  return out;
}

/**
 * Uuids of items a row hands the player: ItemGrant grants or an ItemChoice's current picks.
 * @param {object} row Built advancement row.
 * @returns {string[]} Granted/selected item uuids.
 */
export function grantedUuids(row) {
  if (row.type === 'ItemGrant') return row.spec?.kind === 'grant-choice' ? [...row.spec.selected] : (row.grants ?? []).map((g) => g.uuid).filter(Boolean);
  if (row.spec?.kind === 'item-choice') return (row.spec.selected ?? []).filter(Boolean);
  if (row.spec?.kind === 'asi' && row.spec.feat) return [row.spec.feat];
  return [];
}

/**
 * Build rows for a granted item's own choice advancements, inheriting the granting row's origin/group placement.
 * @param {object} doc Full granted-item Document.
 * @param {object} parentRow Granting row.
 * @param {{draft:object, characterLevel:number}} args Recursion inputs.
 * @returns {Array<object>} Nested rows.
 */
function nestedItemRows(doc, parentRow, { draft, characterLevel }) {
  const rows = [];
  const cap = parentRow.classLevelCap && doc.system?.advancementClassLinked ? parentRow.classLevelCap : characterLevel;
  for (const adv of advancementList(doc)) {
    const type = advancementType(adv);
    if (!type || HM_OWNED.has(type)) continue;
    if (!classAdvApplies(adv.classRestriction, true)) continue;
    if (!RENDERERS[type] && !AUTO.has(type)) continue;
    const levels = advancementLevels(adv);
    for (const lvl of levels) {
      if (lvl < 0 || lvl > cap) continue;
      const row = advancementRow(adv, lvl, { origin: parentRow.origin, draft, originId: splitAdvancementKey(parentRow.advancementKey).advancementId });
      row.classKey = parentRow.classKey ?? null;
      row.classLevelCap = parentRow.classLevelCap ?? null;
      row.displayLevel = parentRow.displayLevel ?? parentRow.level;
      row.icon = adv.img ?? doc.img ?? parentRow.icon ?? null;
      row.title = nestedTitle(doc.name, adv, lvl);
      rows.push(row);
    }
  }
  return rows;
}

/**
 * Compose a nested row's title as `<item>: <inner title>`, falling back to the item name when the advancement is untitled.
 * @param {string} itemName Granting item's name.
 * @param {object} adv Advancement instance.
 * @param {number} lvl Level being applied.
 * @returns {string} Display title.
 */
function nestedTitle(itemName, adv, lvl) {
  const inner = stripNoiseParenthetical(stripHtml(adv.titleForLevel?.(lvl) ?? adv.name ?? ''));
  return inner ? `${itemName}: ${inner}` : itemName;
}

/**
 * Whether a (origin, level) pair belongs in the current chooser scope.
 * @param {string} origin Row origin.
 * @param {number} lvl Advancement level.
 * @param {number} targetLevel Class level cap.
 * @param {number} characterLevel Character level cap.
 * @param {'creation'|'level_up'} mode Render mode axis.
 * @param {boolean} [freshSubclass] True when the subclass is being picked this run, so its rows below the new level are in scope too.
 * @returns {boolean} True when the row should render.
 */
function isRowInScope(origin, lvl, targetLevel, characterLevel, mode, freshSubclass = false) {
  if (origin === 'race' || origin === 'background') {
    if (mode === 'level_up') return lvl === characterLevel;
    return lvl >= 0 && lvl <= characterLevel;
  }
  if (mode === 'level_up' && !(origin === 'subclass' && freshSubclass)) return lvl === targetLevel;
  return lvl >= 1 && lvl <= targetLevel;
}

/**
 * Sum ASI bonuses (fixed config + user picks) across class, subclass, race, background.
 * @param {object} args Inputs.
 * @param {?Array<{classDoc:?object, subclassDoc:?object, level:number}>} [args.classRoster] Per-class inputs. When provided, supersedes `classDoc`/`subclassDoc`/`effectiveLevel`.
 * @param {?object} [args.classDoc] Single-class fallback when `classRoster` is null.
 * @param {?object} [args.subclassDoc] Single-subclass fallback.
 * @param {?object} [args.speciesDoc] Full race Document.
 * @param {?object} [args.backgroundDoc] Full background Document.
 * @param {Object<string, Object<number, object>>} [args.advancementDraft] Draft pick map.
 * @param {number} [args.effectiveLevel] Class level cap for the single-class fallback.
 * @param {number} [args.characterLevel] Character level cap.
 * @returns {Promise<Object<string, number>>} Per-ability bonus map.
 */
export async function computeAsiBonus({
  classRoster = null,
  classDoc = null,
  subclassDoc = null,
  speciesDoc = null,
  backgroundDoc = null,
  advancementDraft = {},
  effectiveLevel = 1,
  characterLevel = effectiveLevel
} = {}) {
  const totals = Object.fromEntries(Object.keys(CONFIG.DND5E.abilities).map((k) => [k, 0]));
  const add = (map) => {
    for (const [k, v] of Object.entries(map ?? {})) totals[k] += Number(v) || 0;
  };
  const accumulate = async (doc, levelCap, depth, isOriginalClass = true, originId = null) => {
    if (!doc) return;
    for (const adv of advancementList(doc)) {
      if (!classAdvApplies(adv.classRestriction, isOriginalClass)) continue;
      const type = advancementType(adv);
      const id = adv.id ?? adv._id;
      const levels = advancementLevels(adv).filter((lvl) => lvl >= 0 && lvl <= levelCap);
      if (!levels.length) continue;
      const byLevel = advancementDraft[advancementKey(adv.item?.uuid ?? null, id, originId)] ?? advancementDraft[id];
      if (type === 'AbilityScoreImprovement') {
        for (const lvl of levels) {
          add(adv.configuration?.fixed);
          const pick = byLevel?.[lvl];
          if (pick?.type === 'asi') add(pick.assignments);
          else if (pick?.type === 'feat' && pick.feat && depth < NESTED_DEPTH_CAP) await accumulate(await fromUuid(pick.feat), levelCap, depth + 1, true, id);
        }
      } else if (depth < NESTED_DEPTH_CAP) {
        for (const uuid of grantedAsiSources(adv, levels, byLevel)) await accumulate(await fromUuid(uuid), levelCap, depth + 1, true, id);
      }
    }
  };
  const roster = classRoster && classRoster.length ? classRoster : classDoc ? [{ classDoc, subclassDoc, level: effectiveLevel, isPrimary: true }] : [];
  for (const slot of roster) {
    const isOriginalClass = slot.isPrimary !== false;
    await accumulate(slot.classDoc, slot.level, 0, isOriginalClass);
    await accumulate(slot.subclassDoc, slot.level, 0, isOriginalClass);
  }
  await accumulate(speciesDoc, characterLevel, 0);
  await accumulate(backgroundDoc, characterLevel, 0);
  return totals;
}

/**
 * Uuids of items an ItemGrant/ItemChoice hands the player, used to chase ASI carried by granted items.
 * @param {object} adv Advancement instance.
 * @param {number[]} levels In-scope levels for this advancement.
 * @param {?Object<number, object>} byLevel This advancement's picks keyed by level.
 * @returns {string[]} Granted/selected item uuids.
 */
function grantedAsiSources(adv, levels, byLevel) {
  const type = advancementType(adv);
  if (type === 'ItemGrant') return (adv.configuration?.items ?? []).map((it) => it.uuid).filter(Boolean);
  if (type === 'ItemChoice') {
    const out = [];
    for (const lvl of levels) for (const uuid of Object.values(byLevel?.[lvl]?.added ?? {})) if (uuid) out.push(uuid);
    return out;
  }
  return [];
}

/**
 * Build an Ability Score Improvement chooser spec.
 * @param {object} adv Advancement instance.
 * @param {number} _level Level being applied.
 * @param {object} value Stored selection.
 * @param {object} _context Renderer context (unused).
 * @returns {object} Chooser spec.
 */
function asiSpec(adv, _level, value, _context) {
  const cfg = adv.configuration ?? {};
  const allowFeat = adv.allowFeat;
  return {
    kind: 'asi',
    allowFeat,
    mode: allowFeat ? (value.type ?? null) : 'asi',
    points: cfg.points ?? 0,
    cap: cfg.cap ?? 2,
    max: cfg.max ?? null,
    fixed: foundry.utils.deepClone(cfg.fixed ?? {}),
    locked: [...(cfg.locked ?? [])],
    assignments: foundry.utils.deepClone(value.assignments ?? {}),
    feat: value.feat ?? null
  };
}

/**
 * Build an ItemChoice chooser spec for a single level slot.
 * @param {object} adv Advancement instance.
 * @param {number} level Level being applied.
 * @param {object} value Stored selection.
 * @param {object} _context Renderer context (unused).
 * @returns {object} Chooser spec.
 */
function itemChoiceSpec(adv, level, value, _context) {
  const cfg = adv.configuration ?? {};
  const slot = cfg.choices?.[level] ?? {};
  const count = slot.count ?? 0;
  const pool = (cfg.pool ?? []).map((p) => p.uuid).filter(Boolean);
  const replaceableItems = slot.replacement ? itemChoiceReplaceable(adv, level) : [];
  const replaceTarget = replaceableItems.some((i) => i.id === value.replace) ? value.replace : null;
  const spec = {
    kind: 'item-choice',
    count,
    replacement: !!slot.replacement,
    replaceableItems,
    replaceTarget,
    effectiveCount: count + (replaceTarget ? 1 : 0),
    pool,
    allowDrops: cfg.allowDrops !== false,
    selected: Object.values(value.added ?? {}),
    abilities: spellAbilities(adv),
    ability: value.ability ?? '',
    abilityLocked: level > Math.min(...Object.keys(cfg.choices ?? {}).map(Number))
  };
  spec.open = !pool.length && !!(cfg.type || spec.allowDrops);
  spec.canBrowse = spec.allowDrops && pool.length > 0;
  if (spec.open || spec.canBrowse) {
    const restriction = cfg.restriction ?? {};
    spec.restrictionType = cfg.type ?? null;
    spec.restrictionCategory = restriction.type || '';
    spec.restrictionSubtype = restriction.subtype || '';
    spec.restrictionLevel = restriction.level ?? '';
    spec.restrictionList = [...(restriction.list ?? [])];
    spec.restrictionSchool = [...(restriction.school ?? [])];
    spec.featureLevel = level;
    spec.maxSpellLevel = cfg.type === 'spell' ? maxSpellSlotLevelFor(adv.item, level) : null;
  }
  return spec;
}

/**
 * Owned items from an ItemChoice's earlier-level picks that are eligible to be swapped out at this level.
 * @param {object} adv ItemChoice advancement instance (live actor copy in level-up; empty value at creation).
 * @param {number} level Level being applied.
 * @returns {Array<{id:string, uuid:string, name:string, img:?string}>} Replaceable owned items.
 */
function itemChoiceReplaceable(adv, level) {
  const added = adv.value?.added ?? {};
  const replaced = new Set(
    Object.values(adv.value?.replaced ?? {})
      .map((r) => r.original)
      .filter(Boolean)
  );
  const actor = adv.actor;
  const out = [];
  for (const [levelKey, entries] of Object.entries(added)) {
    if (Number(levelKey) >= level) continue;
    for (const [id, uuid] of Object.entries(entries ?? {})) {
      if (replaced.has(id)) continue;
      const doc = actor?.items?.get(id) ?? fromUuidSync(uuid);
      if (doc) out.push({ id, uuid, name: doc.name, img: doc.img ?? null });
    }
  }
  return out;
}

/**
 * Largest spell-slot level the owning class can cast at a given level.
 * @param {object} item Advancement's parent Item (class/subclass).
 * @param {number} level Level the feature is gained at.
 * @returns {number} Max castable spell level (falls back to the system max).
 */
function maxSpellSlotLevelFor(item, level) {
  const Actor5e = dnd5e.documents.Actor5e;
  const maxSpellLevel = Object.keys(CONFIG.DND5E.spellLevels).length - 1;
  const sc = item?.spellcasting;
  if (!sc?.type) return maxSpellLevel;
  const progression = Object.fromEntries(Object.keys(CONFIG.DND5E.spellcasting).map((k) => [k, 0]));
  const spells = Object.fromEntries(Array.fromRange(maxSpellLevel, 1).map((l) => [`spell${l}`, {}]));
  const spellcasting = foundry.utils.deepClone(sc);
  spellcasting.levels = level;
  Actor5e.computeClassProgression(progression, item, { spellcasting });
  Actor5e.prepareSpellcastingSlots(spells, sc.type, progression);
  return Object.values(spells).reduce((slot, s) => (s.max ? Math.max(slot, s.level || -1) : slot), 0) || maxSpellLevel;
}

/**
 * Spellcasting abilities an ItemGrant/ItemChoice lets the player pick for its spells.
 * @param {object} adv Advancement instance.
 * @returns {string[]} Ability keys.
 */
function spellAbilities(adv) {
  return [...(adv.configuration?.spell?.ability ?? [])];
}

/**
 * Build an ItemGrant chooser spec. Returns null unless the grant offers a spellcasting ability choice.
 * @param {object} adv Advancement instance.
 * @param {number} _level Level being applied.
 * @param {object} value Stored selection.
 * @param {object} _context Renderer context (unused).
 * @returns {?object} Chooser spec, or null when there's no ability choice.
 */
function itemGrantSpec(adv, _level, value, _context) {
  const choice = grantChoiceSpec(adv, value);
  if (choice) return choice;
  const abilities = spellAbilities(adv);
  if (abilities.length < 2) return null;
  return { kind: 'spell-ability', abilities, ability: value.ability ?? '' };
}

/**
 * Build a grant-choice spec for an ItemGrant that swaps base features for replacements (Tasha's optional class features) or offers opt-in optional items.
 * @param {object} adv Advancement instance.
 * @param {object} value Stored selection.
 * @returns {?object} Chooser spec, or null when every item is granted unconditionally.
 */
function grantChoiceSpec(adv, value) {
  const cfg = adv.configuration ?? {};
  const groups = Object.entries(foundry.utils.flattenObject(cfg.replacements ?? {})).map(([base, replacement]) => ({ base, replacement, companions: replacementCompanions(replacement) }));
  const grouped = new Set(groups.flatMap((g) => [g.base, g.replacement, ...g.companions]));
  const rest = [...(cfg.items ?? [])].filter((i) => !grouped.has(i.uuid));
  const optional = cfg.optional ? rest.filter((i) => i.optional).map((i) => i.uuid) : [];
  if (!groups.length && !optional.length) return null;
  const fixed = rest.map((i) => i.uuid).filter((uuid) => !optional.includes(uuid));
  const picked = new Set(Array.isArray(value.selected) ? value.selected : groups.map((g) => g.base));
  const selected = [...fixed, ...optional.filter((uuid) => picked.has(uuid))];
  for (const group of groups) {
    if (picked.has(group.replacement)) selected.push(group.replacement, ...group.companions);
    else if (picked.has(group.base)) selected.push(group.base);
  }
  return { kind: 'grant-choice', groups, optional, fixed, selected };
}

/**
 * Advancement ids whose ItemGrant selection or Trait choices come from a draft pick, so the auto-apply pass only fills their fixed parts.
 * @param {Object<string, Object<number, object>>} draft Advancement pick map.
 * @returns {Set<string>} Advancement ids with an explicit `selected` or `chosen` pick.
 */
export function draftedAdvancementIds(draft) {
  const out = new Set();
  for (const [key, byLevel] of Object.entries(draft ?? {})) {
    if (Object.values(byLevel ?? {}).some((data) => Array.isArray(data?.selected) || Array.isArray(data?.chosen))) out.add(splitAdvancementKey(key).advancementId);
  }
  return out;
}

/**
 * Advancements that modules remove from dnd5e's own advancement flow through `dnd5e.preAdvancementManagerRender`.
 * @param {object} manager dnd5e AdvancementManager prepared for the same advancement run.
 * @returns {Set<string>} Advancement ids that hook listeners dropped.
 */
export function moduleSuppressedAdvancements(manager) {
  const stepIds = () => manager.steps.filter((s) => s.flow).map((s) => s.flow.advancement.id);
  const before = stepIds();
  Hooks.call('dnd5e.preAdvancementManagerRender', manager);
  const after = new Set(stepIds());
  return new Set(before.filter((id) => !after.has(id)));
}

/**
 * Apply the configuration-only value of an advancement; drafted ones get only their fixed Trait grants so the draft pick supplies the choices.
 * @param {object} actor Actor (clone) owning the advancement.
 * @param {object} adv Advancement instance.
 * @param {number} level Level to apply at.
 * @param {Set<string>} drafted Advancement ids with a draft pick.
 * @returns {Promise<?object>} The applied advancement instance, or null when nothing applied.
 */
export async function applyAutomatic(actor, adv, level, drafted) {
  if (!drafted.has(adv.id)) return applyAdvancement(actor, adv, level, advancementApplyData(adv, {}), { initial: true });
  if (advancementType(adv) === 'Trait' && adv.configuration.grants?.size) return applyAdvancement(actor, adv, level, { chosen: [...adv.configuration.grants] });
  return null;
}

/**
 * Build a Size chooser spec. Returns null for single-size races so the row stays auto (dnd5e applies the lone size itself).
 * @param {object} adv Advancement instance.
 * @param {number} _level Level being applied.
 * @param {object} value Stored selection.
 * @param {object} _context Renderer context (unused).
 * @returns {?object} Chooser spec, or null when there's no real choice.
 */
function sizeSpec(adv, _level, value, _context) {
  const sizes = [...(adv.configuration?.sizes ?? [])];
  if (sizes.length < 2) return null;
  return { kind: 'size', sizes, selected: value.size ?? '' };
}

/**
 * Build a Trait chooser spec covering every choice group (each slot keeps its own pool).
 * @param {object} adv Advancement instance.
 * @param {number} _level Level being applied (unused; Trait choices are not level-keyed).
 * @param {object} value Stored selection.
 * @param {object} _context Renderer context (unused).
 * @returns {object} Chooser spec.
 */
function traitSpec(adv, _level, value, _context) {
  const cfg = adv.configuration ?? {};
  const groups = [...(cfg.choices ?? [])].map((c) => ({ count: c.count ?? 0, pool: [...(c.pool ?? [])] })).filter((g) => g.pool.length && g.count);
  const pool = [...new Set(groups.flatMap((g) => g.pool))];
  return {
    kind: 'trait',
    granted: [...(cfg.grants ?? [])],
    count: groups.reduce((sum, g) => sum + g.count, 0),
    groups,
    pool,
    mode: cfg.mode ?? 'default',
    allowReplacements: cfg.allowReplacements === true,
    chosen: [...(value.chosen ?? [])]
  };
}

/**
 * Normalize an advancement collection or array into a plain Array.
 * @param {?object} classDoc Full class Document.
 * @returns {Array<object>} Advancement instances.
 */
export function advancementList(classDoc) {
  if (!classDoc) return [];
  const adv = classDoc.system?.advancement?.contents ?? classDoc.system?.advancement ?? classDoc.advancement?.contents ?? [];
  return Array.isArray(adv) ? adv : (adv.contents ?? []);
}

/**
 * Resolve a ScaleValue advancement's prior + current display strings for plain-language preview ("Channel Divinity: 1 → 2"). Returns null when the value didn't change or can't be resolved.
 * @param {object} adv ScaleValue advancement instance.
 * @param {number} level Level being applied.
 * @returns {?{prior:?string, current:string}} Delta, or null when noop.
 */
function resolveScaleDelta(adv, level) {
  const current = adv.valueForLevel(level)?.display ?? null;
  if (!current) return null;
  const prior = level > 1 ? (adv.valueForLevel(level - 1)?.display ?? null) : null;
  if (prior === current) return null;
  return { prior, current };
}

/**
 * Resolve an ItemGrant advancement's `configuration.items` to display-ready entries with name + img + uuid for click-to-open links.
 * @param {object} adv ItemGrant advancement instance.
 * @returns {Array<{uuid:string, name:string, img:?string}>} Granted item entries; uuids that fail to resolve are dropped.
 */
function resolveItemGrantEntries(adv) {
  const items = adv.configuration?.items ?? [];
  const out = [];
  for (const entry of items) {
    const uuid = entry?.uuid;
    if (!uuid) continue;
    const doc = fromUuidSync(uuid);
    if (!doc) continue;
    out.push({ uuid, name: doc.name, img: doc.img ?? null, type: doc.type, featureValue: doc.system?.type?.value ?? null, typeLabel: grantTypeLabel(doc) });
  }
  return out;
}

/**
 * Human label for a granted item's type, preferring a feature subtype.
 * @param {object} doc Resolved item document.
 * @returns {string} Localized type label.
 */
function grantTypeLabel(doc) {
  if (doc.type === 'feat') {
    const t = doc.system?.type ?? {};
    const featureType = CONFIG.DND5E.featureTypes?.[t.value];
    const subtype = featureType?.subtypes?.[t.subtype];
    if (subtype) return _loc(subtype);
    if (featureType?.label) return _loc(featureType.label);
  }
  return _loc(CONFIG.Item.typeLabels?.[doc.type] ?? `TYPES.Item.${doc.type}`);
}
