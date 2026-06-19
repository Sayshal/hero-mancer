import { stripHtml, stripNoiseParenthetical } from '../utils/html-text.mjs';

/** @type {Set<string>} Advancement types handled by HM directly; never rendered as choosers. */
const HM_OWNED = new Set(['HitPoints', 'Subclass']);

/** @type {Set<string>} Advancement types that auto-apply (no UI). */
const AUTO = new Set(['ItemGrant', 'ScaleValue', 'Size']);

/** @type {Object<string, Function>} Per-type renderer registry; each entry returns a chooser spec or null. */
const RENDERERS = { AbilityScoreImprovement: asiSpec, ItemChoice: itemChoiceSpec, Trait: traitSpec };

/** @type {Object<string, number>} Display sort weight per origin */
const ORIGIN_ORDER = { background: 0, race: 1, class: 2, subclass: 3 };

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
 * Numeric level list for an advancement.
 * @param {object} adv Advancement instance.
 * @returns {number[]} Levels the advancement applies at.
 */
export function advancementLevels(adv) {
  const raw = adv.levels?.length ? adv.levels : adv.level !== undefined ? [adv.level] : [];
  return raw.map(Number).filter((n) => Number.isFinite(n));
}

/**
 * Map an HM draft pick to the data shape `Advancement#apply` expects.
 * @param {object} adv Advancement instance.
 * @param {object} data HM draft pick data.
 * @returns {object} Apply-ready data.
 */
export function advancementApplyData(adv, data) {
  const type = adv?.constructor?.typeName;
  if (type === 'ItemChoice' && Array.isArray(data?.added)) return { ...data, selected: data.added };
  if (type === 'AbilityScoreImprovement' && data?.type === 'feat' && data.feat) return { ...data, uuid: data.feat };
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
  const rows = [];
  for (const { adv, origin } of list) {
    const type = adv.type ?? adv.constructor?.typeName ?? adv.constructor?.metadata?.name;
    if (!type || HM_OWNED.has(type)) continue;
    const classScoped = origin === 'class' || origin === 'subclass';
    if (!classAdvApplies(adv.classRestriction, classScoped ? isOriginalClass : true)) continue;
    const levels = advancementLevels(adv);
    for (const lvl of levels) {
      if (!isRowInScope(origin, lvl, targetLevel, characterLevel, mode)) continue;
      rows.push(advancementRow(adv, lvl, { origin, draft, context }));
    }
  }
  rows.sort((a, b) => a.level - b.level || ORIGIN_ORDER[a.origin] - ORIGIN_ORDER[b.origin]);
  return rows;
}

/**
 * Build a single chooser row from one advancement at one level.
 * @param {object} adv Advancement instance.
 * @param {number} lvl Level being applied.
 * @param {object} args Row inputs.
 * @param {string} args.origin Row origin (`class`/`subclass`/`race`/`background`).
 * @param {Object<string, Object<number, object>>} [args.draft] Stored picks keyed by `[advancementId][level]`.
 * @param {object} [args.context] Renderer context.
 * @returns {object} Row record.
 */
function advancementRow(adv, lvl, { origin, draft = {}, context = {} }) {
  const type = adv.type ?? adv.constructor?.typeName ?? adv.constructor?.metadata?.name;
  const id = adv.id ?? adv._id;
  const title = stripNoiseParenthetical(stripHtml(adv.titleForLevel?.(lvl) ?? adv.title ?? type));
  const auto = AUTO.has(type) || !RENDERERS[type];
  const value = draft[id]?.[lvl] ?? draft[id] ?? {};
  const spec = auto ? null : RENDERERS[type](adv, lvl, value, context);
  const grants = type === 'ItemGrant' ? resolveItemGrantEntries(adv) : null;
  const scale = type === 'ScaleValue' ? resolveScaleDelta(adv, lvl) : null;
  return { advancementId: id, level: lvl, type, title, icon: adv.icon ?? null, spec, auto, origin, grants, scale, source: adv.item?.name ?? null, parentIdentifier: adv.item?.identifier ?? null };
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
function grantedUuids(row) {
  if (row.type === 'ItemGrant') return (row.grants ?? []).map((g) => g.uuid).filter(Boolean);
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
  for (const adv of advancementList(doc)) {
    const type = adv.type ?? adv.constructor?.typeName ?? adv.constructor?.metadata?.name;
    if (!type || HM_OWNED.has(type)) continue;
    if (!classAdvApplies(adv.classRestriction, true)) continue;
    if (!RENDERERS[type] && !AUTO.has(type)) continue;
    const levels = advancementLevels(adv);
    for (const lvl of levels) {
      if (lvl < 0 || lvl > characterLevel) continue;
      const row = advancementRow(adv, lvl, { origin: parentRow.origin, draft });
      row.classKey = parentRow.classKey ?? null;
      row.displayLevel = parentRow.displayLevel ?? parentRow.level;
      row.icon = adv.icon ?? doc.img ?? parentRow.icon ?? null;
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
  const inner = stripNoiseParenthetical(stripHtml(adv.titleForLevel?.(lvl) ?? adv.title ?? ''));
  return inner ? `${itemName}: ${inner}` : itemName;
}

/**
 * Whether a (origin, level) pair belongs in the current chooser scope.
 * @param {string} origin Row origin.
 * @param {number} lvl Advancement level.
 * @param {number} targetLevel Class level cap.
 * @param {number} characterLevel Character level cap.
 * @param {'creation'|'level_up'} mode Render mode axis.
 * @returns {boolean} True when the row should render.
 */
function isRowInScope(origin, lvl, targetLevel, characterLevel, mode) {
  if (origin === 'race' || origin === 'background') {
    if (mode === 'level_up') return lvl === characterLevel;
    return lvl >= 0 && lvl <= characterLevel;
  }
  if (mode === 'level_up') return lvl === targetLevel;
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
  const accumulate = async (doc, levelCap, depth, isOriginalClass = true) => {
    if (!doc) return;
    for (const adv of advancementList(doc)) {
      if (!classAdvApplies(adv.classRestriction, isOriginalClass)) continue;
      const type = adv.type ?? adv.constructor?.typeName;
      const id = adv.id ?? adv._id;
      const levels = advancementLevels(adv).filter((lvl) => lvl >= 0 && lvl <= levelCap);
      if (!levels.length) continue;
      if (type === 'AbilityScoreImprovement') {
        for (const lvl of levels) {
          add(adv.configuration?.fixed);
          const pick = advancementDraft[id]?.[lvl];
          if (pick?.type === 'asi') add(pick.assignments);
          else if (pick?.type === 'feat' && pick.feat && depth < NESTED_DEPTH_CAP) await accumulate(await fromUuid(pick.feat), levelCap, depth + 1);
        }
      } else if (depth < NESTED_DEPTH_CAP) {
        for (const uuid of grantedAsiSources(adv, id, levels, advancementDraft)) await accumulate(await fromUuid(uuid), levelCap, depth + 1);
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
 * @param {string} advId Advancement id.
 * @param {number[]} levels In-scope levels for this advancement.
 * @param {Object<string, Object<number, object>>} draft Advancement-pick map.
 * @returns {string[]} Granted/selected item uuids.
 */
function grantedAsiSources(adv, advId, levels, draft) {
  const type = adv.type ?? adv.constructor?.typeName;
  if (type === 'ItemGrant') return (adv.configuration?.items ?? []).map((it) => it.uuid).filter(Boolean);
  if (type === 'ItemChoice') {
    const out = [];
    for (const lvl of levels) for (const uuid of Object.values(draft[advId]?.[lvl]?.added ?? {})) if (uuid) out.push(uuid);
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
  const spec = {
    kind: 'item-choice',
    count,
    pool,
    allowDrops: cfg.allowDrops !== false,
    selected: Object.values(value.added ?? {})
  };
  if (!pool.length && (cfg.type || spec.allowDrops)) {
    const restriction = cfg.restriction ?? {};
    spec.open = true;
    spec.restrictionType = cfg.type ?? null;
    spec.restrictionCategory = restriction.type || '';
    spec.restrictionSubtype = restriction.subtype || '';
    spec.restrictionLevel = restriction.level ?? '';
    spec.restrictionList = [...(restriction.list ?? [])];
    spec.featureLevel = level;
    spec.maxSpellLevel = cfg.type === 'spell' ? maxSpellSlotLevelFor(adv.item, level) : null;
  }
  return spec;
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
 * Build a Trait chooser spec for a single level slot.
 * @param {object} adv Advancement instance.
 * @param {number} level Level being applied.
 * @param {object} value Stored selection.
 * @param {object} _context Renderer context (unused).
 * @returns {object} Chooser spec.
 */
function traitSpec(adv, level, value, _context) {
  const cfg = adv.configuration ?? {};
  const slot = cfg.choices?.[level] ?? cfg.choices?.[0] ?? { count: 0, pool: new Set() };
  const pool = [...(slot.pool ?? [])];
  return {
    kind: 'trait',
    granted: [...(cfg.grants ?? [])],
    count: pool.length ? (slot.count ?? 0) : 0,
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
