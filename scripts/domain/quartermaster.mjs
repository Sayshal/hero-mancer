import { MODULE } from '../constants.mjs';

const CompendiumBrowser = dnd5e.applications.CompendiumBrowser;

const lookup = new Map();
let initialized = false;

/** @type {Set<string>} System fields needed to bucket items by category. */
const INDEX_FIELDS = new Set(['system.type.value', 'system.type.baseItem', 'system.type.subtype', 'system.armor.type', 'system.properties', 'system.price.value', 'system.weight.value']);

/** @type {Set<string>} Foundry Item subtypes that contribute to the equipment lookup. */
const ITEM_TYPES = new Set(['weapon', 'equipment', 'tool']);

/**
 * Build the category-keyed item index from dnd5e's source-configured packs.
 * @returns {Promise<void>}
 */
export async function initLookup() {
  if (initialized) return;
  const results = await CompendiumBrowser.fetch(Item, { types: ITEM_TYPES, indexFields: new Set(INDEX_FIELDS) });
  for (const entry of results) {
    if (isMagicItem(entry) || isNaturalWeapon(entry) || isCreatureIntrinsic(entry)) continue;
    indexEntry(entry);
  }
  indexFocusItems();
  for (const list of lookup.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  initialized = true;
}

/**
 * Populate `focus:{key}` buckets from `CONFIG.DND5E.focusTypes` — dnd5e maintains these by explicit uuid, not by item-type metadata.
 */
function indexFocusItems() {
  const types = CONFIG.DND5E?.focusTypes ?? {};
  const exclusionList = new Set((game.settings.get(MODULE.ID, MODULE.SETTINGS.EXCLUSION_LIST) ?? {}).equipment ?? []);
  for (const [focusKey, entry] of Object.entries(types)) {
    const itemIds = entry?.itemIds ?? {};
    for (const uuid of Object.values(itemIds)) {
      if (exclusionList.has(uuid)) continue;
      const doc = fromUuidSync(uuid);
      if (!doc) continue;
      bucket(`focus:${focusKey}`, { uuid, name: doc.name, img: doc.img });
    }
  }
}

/**
 * Return the cached option list for a category key, building it if missing.
 * @param {string} categoryType One of `weapon`/`armor`/`tool`/`focus`.
 * @param {string} key Sub-key (e.g. `simpleM`, `light`, `smith`, `arcane`); group keys `sim`/`mar` expand to martial+ranged variants.
 * @returns {Array<{uuid:string,name:string,img:?string}>} Sorted options.
 */
export function getCategoryOptions(categoryType, key) {
  const expand = WEAPON_GROUP_EXPANSION[key];
  if (categoryType === 'weapon' && expand) {
    const merged = expand.flatMap((k) => lookup.get(`weapon:${k}`) ?? []);
    return merged.sort((a, b) => a.name.localeCompare(b.name));
  }
  return lookup.get(`${categoryType}:${key}`) ?? [];
}

const WEAPON_GROUP_EXPANSION = { sim: ['simpleM', 'simpleR'], mar: ['martialM', 'martialR'] };

/**
 * Collect proficiencies from each doc's Trait advancements, preserving choice structure.
 * @param {...object} docs Source documents (race / class / background / subclass etc.).
 * @returns {{granted: Set<string>, choices: Array<{count:number, pool:Set<string>}>}} Structured proficiency record.
 */
export function collectProficiencies(...docs) {
  const granted = new Set();
  const choices = [];
  for (const doc of docs) {
    const list = doc?.system?.advancement ?? [];
    for (const adv of list) {
      if (adv?.type !== 'Trait') continue;
      const cfg = adv.configuration;
      if (!cfg) continue;
      if (cfg.grants) for (const g of cfg.grants) granted.add(g);
      if (Array.isArray(cfg.choices)) {
        for (const c of cfg.choices) {
          if (!c?.pool?.size && !c?.pool?.length) continue;
          choices.push({ count: c.count ?? 1, pool: new Set(c.pool) });
        }
      }
    }
  }
  return { granted, choices };
}

/**
 * Flatten the structured proficiency record into a single Set (granted ∪ all choice pools).
 * @param {{granted: Set<string>, choices: Array<{pool:Set<string>}>}} profs Structured record.
 * @returns {Set<string>} Union of every prof key the character has or could pick.
 */
export function flattenProficiencies(profs) {
  const out = new Set(profs?.granted ?? []);
  for (const c of profs?.choices ?? []) {
    for (const p of c.pool) {
      out.add(p);
      if (p.endsWith(':*')) out.add(p.slice(0, -2));
    }
  }
  return out;
}

/**
 * Drop options the character has no proficiency for. Empty `profs` is treated as a no-op pass-through.
 * @param {Array<{uuid:string}>} options Category options from `getCategoryOptions`.
 * @param {string} categoryType `weapon`/`armor`/`tool`/`focus`.
 * @param {Set<string>|{granted:Set<string>,choices:Array}} profs Proficiency keys.
 * @returns {Array<{uuid:string}>} Filtered options (input untouched).
 */
export function filterByProficiency(options, categoryType, profs) {
  const flat = profs instanceof Set ? profs : flattenProficiencies(profs);
  if (!flat.size) return options;
  return options.filter((opt) => hasProficiency(opt, categoryType, flat));
}

/**
 * Test whether the character is proficient with a specific item option.
 * @param {{uuid:string}} option Pool option from `getCategoryOptions`.
 * @param {string} categoryType `weapon`/`armor`/`tool`/`focus`.
 * @param {Set<string>} profs Collected proficiency keys.
 * @returns {boolean} True when proficient, or when the item's category lacks a queryable type.
 */
function hasProficiency(option, categoryType, profs) {
  if (categoryType === 'focus') return true;
  const doc = fromUuidSync(option.uuid);
  if (!doc) return true;
  const t = doc.system?.type;
  const value = t?.value;
  const baseItem = t?.baseItem;
  if (!value) return true;
  if (categoryType === 'weapon') {
    const profKey = CONFIG.DND5E.weaponProficienciesMap?.[value];
    if (profKey && profs.has(`weapon:${profKey}`)) return true;
    return !!(baseItem && profs.has(`weapon:${baseItem}`));
  }
  if (categoryType === 'armor') {
    const profKey = CONFIG.DND5E.armorProficienciesMap?.[value];
    if (profKey === true) return true;
    if (profKey && profs.has(`armor:${profKey}`)) return true;
    return !!(baseItem && profs.has(`armor:${baseItem}`));
  }
  if (categoryType === 'tool') {
    if (profs.has(`tool:${value}`)) return true;
    return !!(baseItem && profs.has(`tool:${baseItem}`));
  }
  return true;
}

/**
 * Bucket an index entry into the lookup under its category key.
 * @param {object} entry CompendiumBrowser index entry.
 */
function indexEntry(entry) {
  const sys = entry.system ?? {};
  const baseItem = sys.type?.baseItem ?? null;
  const item = { uuid: entry.uuid, name: entry.name, img: entry.img, baseItem };
  if (entry.type === 'weapon') {
    const t = sys.type?.value;
    if (t) bucket(`weapon:${t}`, item);
    return;
  }
  if (entry.type === 'equipment') {
    const t = sys.type?.value;
    if (['light', 'medium', 'heavy', 'shield'].includes(t)) bucket(`armor:${t}`, item);
    return;
  }
  if (entry.type === 'tool') {
    const t = sys.type?.value;
    if (t) bucket(`tool:${t}`, item);
  }
}

/**
 * Push an item into a lookup bucket, creating it on first write.
 * @param {string} key Lookup bucket key (e.g. `weapon:simpleM`).
 * @param {object} item Normalized `{uuid,name,img}` payload.
 */
function bucket(key, item) {
  const list = lookup.get(key);
  if (list) list.push(item);
  else lookup.set(key, [item]);
}

/**
 * True when an index entry carries the `mgc` (magical) property.
 * @param {object} entry Index entry.
 * @returns {boolean} True when filtered out.
 */
function isMagicItem(entry) {
  const props = entry.system?.properties;
  if (!props) return false;
  if (props instanceof Set) return props.has('mgc');
  if (Array.isArray(props)) return props.includes('mgc');
  return false;
}

/**
 * True when an index entry is a natural weapon (e.g. Unarmed Strike) — has no `baseItem`.
 * @param {object} entry Index entry.
 * @returns {boolean} True when filtered out.
 */
function isNaturalWeapon(entry) {
  if (entry.type !== 'weapon') return false;
  const t = entry.system?.type;
  return t?.value === 'natural' || !t?.baseItem;
}

/**
 * Skip "creature intrinsic" weapons.
 * @param {object} entry Index entry.
 * @returns {boolean} True when the entry looks like a creature intrinsic, not player gear.
 */
function isCreatureIntrinsic(entry) {
  if (entry.type !== 'weapon') return false;
  const price = Number(entry.system?.price?.value) || 0;
  const weight = Number(entry.system?.weight?.value) || 0;
  return price === 0 && weight === 0;
}
