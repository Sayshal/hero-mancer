/** @enum {string} Tile bucket -> localization key. Prefers dnd5e/Foundry native keys, falls back to HM-local for buckets that have no native equivalent. */
const BUCKET_LANG = {
  weapon: 'TYPES.Item.weapon',
  armor: 'DND5E.Armor',
  tool: 'TYPES.Item.tool',
  focus: 'DND5E.ITEM.Property.Focus',
  gear: 'DND5E.ITEM.Property.Gear',
  pack: 'HEROMANCER.Components.EquipmentTile.TypePack',
  consumable: 'TYPES.Item.consumable',
  ammo: 'DND5E.CONSUMABLE.Type.Ammunition.Label',
  potion: 'DND5E.CONSUMABLE.Type.Potion.Label',
  scroll: 'DND5E.CONSUMABLE.Type.Scroll.Label',
  poison: 'DND5E.CONSUMABLE.Type.Poison.Label',
  food: 'DND5E.CONSUMABLE.Type.Food.Label',
  loot: 'TYPES.Item.loot',
  currency: 'HEROMANCER.Components.EquipmentTile.TypeCurrency',
  none: 'HEROMANCER.Components.EquipmentTile.TypeNone',
  other: 'DOCUMENT.Item'
};

/** @type {Set<string>} `categoryType` values that map 1:1 to a ribbon bucket; anything else falls through to `other`. */
const CATEGORY_BUCKETS = new Set(['weapon', 'armor', 'tool', 'focus']);

/**
 * Localize a tile bucket label, routing through dnd5e/Foundry native keys when available.
 * @param {string} bucket Tile bucket key.
 * @returns {string} Localized label.
 */
export function bucketLabel(bucket) {
  return _loc(BUCKET_LANG[bucket] ?? BUCKET_LANG.other);
}

/**
 * Map a parser `categoryType` to a tile-ribbon bucket.
 * @param {string} categoryType `weapon` / `armor` / `tool` / `focus`.
 * @returns {string} Ribbon bucket.
 */
export function bucketForCategoryType(categoryType) {
  return CATEGORY_BUCKETS.has(categoryType) ? categoryType : 'other';
}

/**
 * Resolve the tile-ribbon bucket for a `linked` parser node by peeking at its document type.
 * @param {string} uuid Compendium uuid.
 * @returns {string} Ribbon bucket.
 */
export function bucketForLinked(uuid) {
  const doc = fromUuidSync(uuid);
  return bucketForItem({ type: doc?.type, typeValue: doc?.system?.type?.value });
}

/**
 * Resolve the tile-ribbon bucket for an already-resolved item-like record (skips the `fromUuidSync` round-trip).
 * @param {{type:string, typeValue:?string}} item Item record (e.g. shop-cache entry).
 * @returns {string} Ribbon bucket.
 */
export function bucketForItem(item) {
  const t = item?.type;
  if (t === 'weapon') return 'weapon';
  if (t === 'tool') return 'tool';
  if (t === 'container') return 'pack';
  if (t === 'equipment') {
    if (['light', 'medium', 'heavy', 'shield'].includes(item.typeValue)) return 'armor';
    return 'gear';
  }
  if (t === 'consumable') {
    if (['ammo', 'potion', 'scroll', 'poison', 'food'].includes(item.typeValue)) return item.typeValue;
    return 'consumable';
  }
  if (t === 'loot') return 'loot';
  return 'other';
}
