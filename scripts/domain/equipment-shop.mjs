import { MODULE } from '../constants.mjs';
import { bucketForItem, bucketLabel } from './equipment-buckets.mjs';
import { goldForOrOption, parseStartingGold } from './equipment-gold.mjs';

const CompendiumBrowser = dnd5e.applications.CompendiumBrowser;

/** @type {Set<string>} Item types eligible for the purchase shop. */
export const SHOP_ITEM_TYPES = new Set(['weapon', 'equipment', 'consumable', 'tool', 'container', 'loot']);

/** @type {Set<string>} System fields needed for shop bucketing, price display, and tile footers. */
const INDEX_FIELDS = new Set([
  'system.type.value',
  'system.type.baseItem',
  'system.type.subtype',
  'system.armor.type',
  'system.armor.value',
  'system.armor.dex',
  'system.properties',
  'system.price.value',
  'system.price.denomination',
  'system.damage.base.number',
  'system.damage.base.denomination',
  'system.damage.base.types',
  'system.damage.parts',
  'system.weight.value',
  'system.weight.units'
]);

/** @type {{cache: Map<string, ShopItem>, byCategory: Map<string, ShopItem[]>, ready: boolean}} */
const state = { cache: new Map(), byCategory: new Map(), ready: false };

/**
 * @typedef {object} ShopItem
 * @property {string} uuid Compendium uuid.
 * @property {string} name Display name.
 * @property {?string} img Icon path.
 * @property {string} type Foundry item type.
 * @property {string} category Shop category bucket key.
 * @property {number} costGp Item price normalized to gp.
 * @property {number} priceValue Raw price value (in original denomination).
 * @property {string} priceDenom Currency denomination as stored.
 */

/**
 * Build the shop item index from dnd5e source-configured packs.
 * @param {object} [opts] Build options.
 * @param {boolean} [opts.force] Force rebuild even when cached.
 * @returns {Promise<void>}
 */
export async function initShopIndex({ force = false } = {}) {
  if (state.ready && !force) return;
  state.cache.clear();
  state.byCategory.clear();
  const exclusionList = new Set((game.settings.get(MODULE.ID, MODULE.SETTINGS.EXCLUSION_LIST) ?? {}).equipment ?? []);
  const results = await CompendiumBrowser.fetch(Item, { types: SHOP_ITEM_TYPES, indexFields: new Set(INDEX_FIELDS) });
  for (const entry of results) {
    if (exclusionList.has(entry.uuid)) continue;
    if (isMagicItem(entry)) continue;
    if (isNaturalWeapon(entry)) continue;
    const item = normalizeEntry(entry);
    if (!item) continue;
    if (item.costGp <= 0) continue;
    state.cache.set(item.uuid, item);
    const list = state.byCategory.get(item.category);
    if (list) list.push(item);
    else state.byCategory.set(item.category, [item]);
  }
  for (const list of state.byCategory.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  state.ready = true;
}

/** Drop the cache so the next `initShopIndex` call rebuilds. */
export function clearShopIndex() {
  state.cache.clear();
  state.byCategory.clear();
  state.ready = false;
}

/**
 * Build the purchase-tab context for the wizard.
 * @param {object} args Builder inputs.
 * @param {object} [args.draft] Saved equipment draft (flat, `shop.cart.{uuid}` keys).
 * @param {?object} [args.classDoc] Selected class Document.
 * @param {?object} [args.backgroundDoc] Selected background Document.
 * @param {object[]} [args.sections] Per-source equipment-tab section contexts (for grant-refund calc).
 * @returns {object} Render-ready shop context.
 */
export async function buildShopContext({ draft = {}, classDoc, backgroundDoc, sections = [] }) {
  const pool = await collectGoldPool(draft, classDoc, backgroundDoc, sections);
  const cartLines = parseCart(draft);
  const cart = cartLines.map((line) => ({ ...line, lineGp: round2(line.qty * line.costGp), lineFormatted: formatCurrency(line.qty * line.costGp) }));
  const spent = round2(cart.reduce((s, l) => s + l.lineGp, 0));
  const remaining = round2(pool.total - spent);
  for (const line of cart) {
    const headroom = line.costGp > 0 ? Math.max(line.qty, line.qty + Math.floor((remaining + 0.0001) / line.costGp)) : line.qty + 99;
    line.qtyOptions = Array.from({ length: headroom + 1 }, (_, i) => ({ value: i, selected: i === line.qty }));
  }
  const { items, filters } = buildShopItems(remaining, new Set(cart.map((c) => c.uuid)));
  return {
    hasShop: pool.total > 0 || cart.length > 0,
    pool: { ...pool, formatted: formatCurrency(pool.total) },
    cart,
    spent,
    spentFormatted: formatCurrency(spent),
    remaining,
    remainingFormatted: formatCurrency(remaining),
    items,
    filters
  };
}

/**
 * Format a gp-denominated amount as `GP.SC` where the decimals are silver (tens) + copper (units).
 * @param {number} gp Amount in gold pieces.
 * @returns {string} Condensed currency number, or the free-cost placeholder when non-positive.
 */
export function formatCurrency(gp) {
  if (!Number.isFinite(gp) || gp <= 0.0001) return _loc('HEROMANCER.App.Equipment.Shop.Free');
  const totalCp = Math.round(gp * 100);
  const goldInt = Math.floor(totalCp / 100);
  const silverDigit = Math.floor(totalCp / 10) % 10;
  const copperDigit = totalCp % 10;
  return `${goldInt}.${silverDigit}${copperDigit}`;
}

/**
 * Convert an amount in any configured currency to gold pieces.
 * @param {number} amount Raw price value.
 * @param {string} denom Currency denomination key (cp/sp/ep/gp/pp or custom).
 * @returns {number} Gold-piece equivalent.
 */
export function toGold(amount, denom) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const conv = CONFIG.DND5E?.currencies?.[denom]?.conversion;
  if (!conv || !Number.isFinite(conv)) return amount;
  return amount / conv;
}

/**
 * Read a `ShopItem` from the cache.
 * @param {string} uuid Compendium uuid.
 * @returns {?ShopItem} Cached entry, or null when not indexed.
 */
export function getShopItem(uuid) {
  return state.cache.get(uuid) ?? null;
}

/**
 * Aggregate the gold available from per-source wealth toggles.
 * @param {object} draft Equipment-tab draft.
 * @param {?object} classDoc Class Document.
 * @param {?object} backgroundDoc Background Document.
 * @param {object[]} sections Per-source section contexts (for refund calc).
 * @returns {{total:number, sources:Array}} Pool breakdown.
 */
async function collectGoldPool(draft, classDoc, backgroundDoc, sections) {
  let total = 0;
  const bonus = await bonusGoldSource(draft);
  if (bonus && bonus.amount > 0) total += bonus.amount;
  for (const { tag, doc } of [
    { tag: 'class', doc: classDoc },
    { tag: 'background', doc: backgroundDoc }
  ]) {
    if (!doc) continue;
    if (draft[`${tag}.useWealth`]) {
      const { wealth } = parseStartingGold(doc);
      const rolled = Number(draft[`${tag}.wealthRolled`]) || 0;
      const amount = rolled > 0 ? rolled : Number(wealth.average) || 0;
      if (amount > 0) total += amount;
    }
    const picked = collectPickedCurrency(draft, tag, doc, sections);
    if (picked.amount > 0) total += picked.amount;
    if (!draft[`${tag}.useWealth`]) total += collectMandatoryCurrency(doc);
    const refund = await collectGrantRefund(draft, tag, sections);
    if (refund > 0) total += refund;
  }
  return { total: round2(total) };
}

/**
 * Sum the catalogue price of granted items the user has unchecked in a section's grants tile group, gated by the world setting.
 * @param {object} draft Equipment-tab draft (flat keys).
 * @param {string} tag Source tag (`class`/`background`).
 * @param {object[]} sections Per-source section context produced by `buildEquipmentContext`.
 * @returns {Promise<number>} Refund total in gp.
 */
async function collectGrantRefund(draft, tag, sections) {
  if (!game.settings.get(MODULE.ID, MODULE.SETTINGS.REFUND_UNCHOSEN_GOLD)) return 0;
  const section = sections.find((s) => s.tag === tag);
  if (!section || section.useWealth) return 0;
  const grantsGroup = section.groups?.find((g) => /\.grants$/.test(g.name));
  if (!grantsGroup) return 0;
  const validValues = new Set(grantsGroup.tiles.map((t) => t.value));
  const stored = draft[`${tag}.grants`];
  if (typeof stored !== 'string') return 0;
  const storedSet = new Set(stored.split(',').filter(Boolean));
  if (storedSet.size && ![...storedSet].some((v) => validValues.has(v))) return 0;
  let refund = 0;
  for (const tile of grantsGroup.tiles ?? []) {
    if (tile.disabled || storedSet.has(tile.value)) continue;
    const qty = tile.count && tile.count > 1 ? tile.count : 1;
    refund += (await valueOfItem(tile.value)) * qty;
  }
  return round2(refund);
}

/**
 * Build the Granted-Equipment tab "Roll bonus gold" section context: formula, current rolled value, and whether a roll button is needed.
 * @param {object} draft Equipment-tab draft.
 * @returns {Promise<?{formula:string, formulaSummary:?string, rolledValue:number, rolledFormatted:?string, canRoll:boolean, isFormula:boolean}>} Render-ready context, or null when no GM formula is configured.
 */
export async function buildBonusGoldContext(draft = {}) {
  const source = await bonusGoldSource(draft);
  if (!source) return null;
  const rolled = Number(draft.bonusGoldRolled) || 0;
  return {
    formula: source.formula.replace(/\s*=.*$/, ''),
    formulaSummary: source.formula,
    rolledValue: rolled,
    rolledFormatted: source.amount > 0 ? formatCurrency(source.amount) : null,
    canRoll: source.isFormula,
    isFormula: source.isFormula
  };
}

/**
 * Build the GM-configured bonus-gold pool entry.
 * @param {object} draft Equipment-tab draft.
 * @returns {Promise<?{tag:string, label:string, amount:number, amountFormatted:string, formula:string, isFormula:boolean}>} Bonus source, or null when no GM formula is set.
 */
async function bonusGoldSource(draft) {
  const formula = (game.settings.get(MODULE.ID, MODULE.SETTINGS.BONUS_GOLD_FORMULA) || '').trim();
  if (!formula) return null;
  const label = _loc('HEROMANCER.App.Equipment.BonusGoldName');
  const rolled = Number(draft.bonusGoldRolled) || 0;
  if (rolled > 0) return { tag: 'bonus', label, amount: rolled, amountFormatted: formatCurrency(rolled), formula: `${formula} = ${rolled}`, isFormula: false };
  let roll;
  try {
    roll = new Roll(formula);
  } catch {
    return null;
  }
  if (!roll.isDeterministic) return { tag: 'bonus', label, amount: 0, amountFormatted: formatCurrency(0), formula, isFormula: true };
  await roll.evaluate({ allowInteractive: false });
  const amount = Number(roll.total) || 0;
  return { tag: 'bonus', label, amount, amountFormatted: formatCurrency(amount), formula, isFormula: false };
}

/**
 * Gp value of an item by uuid: catalogue price plus any carried `system.currency` (e.g. a coin pouch's coins). A container's nested contents are not summed — a pack refunds its own price, not the worth of its contents.
 * @param {string} uuid Compendium uuid.
 * @returns {Promise<number>} Total gp value of one unit.
 */
export async function valueOfItem(uuid) {
  if (!uuid) return 0;
  const cached = state.cache.get(uuid);
  let value = cached?.costGp ?? 0;
  const doc = await fromUuid(uuid);
  if (!doc) return value;
  if (!cached) {
    const priceValue = Number(doc.system?.price?.value) || 0;
    value += toGold(priceValue, doc.system?.price?.denomination || 'gp');
  }
  const currency = doc.system?.currency ?? {};
  for (const [denom, amount] of Object.entries(currency)) value += toGold(Number(amount) || 0, denom);
  return value;
}

/**
 * Sum currency granted by OR-picks that resolved to a `none:<orId>` tile (first-option refund), `currency:<id>` tile, or `and:<id>` branch carrying an embedded currency entry.
 * @param {object} draft Equipment-tab draft (flat keys).
 * @param {string} tag Source tag (`class`/`background`).
 * @param {object} doc Source document.
 * @param {object[]} sections Per-source section contexts (carries `noneRefunds` map).
 * @returns {{amount:number, formula:?string}} Picked-currency total in gp and a human-readable summary formula.
 */
function collectPickedCurrency(draft, tag, doc, sections) {
  const entries = doc?.system?.startingEquipment ?? [];
  let amount = 0;
  const parts = [];
  const prefix = `${tag}.`;
  const section = sections.find((s) => s.tag === tag);
  const noneRefunds = section?.noneRefunds ?? {};
  for (const [key, value] of Object.entries(draft)) {
    if (!key.startsWith(prefix) || !value) continue;
    if (key.includes('.useWealth') || key.endsWith('.grants') || key.includes('.pick.')) continue;
    if (typeof value !== 'string') continue;
    if (value.startsWith('none:')) {
      const orId = value.slice('none:'.length);
      const refund = noneRefunds[orId];
      if (!refund || refund <= 0) continue;
      amount += refund;
      parts.push(formatCurrency(refund));
      continue;
    }
    if (!entries.length) continue;
    if (value.startsWith('currency:')) {
      const entryId = value.slice('currency:'.length);
      const entry = entries.find((e) => e.type === 'currency' && e._id === entryId);
      if (!entry) continue;
      const gp = toGold(entry.count ?? 0, entry.key);
      amount += gp;
      parts.push(`${entry.count} ${entry.key}`);
      continue;
    }
    if (value.startsWith('and:')) {
      const andId = value.slice('and:'.length);
      const grant = goldForOrOption(andId, doc);
      if (!grant) continue;
      const gp = toGold(grant.count ?? 0, grant.key);
      amount += gp;
      parts.push(`${grant.count} ${grant.key}`);
    }
  }
  return { amount: round2(amount), formula: parts.length ? parts.join(' + ') : null };
}

/**
 * Sum currency that is granted unconditionally: entries whose group chain reaches the root through AND groups only, never gated behind an OR pick.
 * @param {object} doc Source document.
 * @returns {number} Mandatory currency total in gp.
 */
function collectMandatoryCurrency(doc) {
  const entries = doc?.system?.startingEquipment ?? [];
  if (!entries.length) return 0;
  const byId = new Map(entries.map((e) => [e._id, e]));
  let amount = 0;
  for (const entry of entries) {
    if (entry.type !== 'currency' || !isAlwaysGranted(entry.group, byId)) continue;
    amount += toGold(entry.count ?? 0, entry.key);
  }
  return round2(amount);
}

/**
 * Whether a starting-equipment entry is always granted: every ancestor group up to the root is an AND group.
 * @param {string} groupId Parent group id of the entry.
 * @param {Map<string, object>} byId Entry lookup by `_id`.
 * @returns {boolean} False if any ancestor is an OR choice or the chain is broken.
 */
function isAlwaysGranted(groupId, byId) {
  let current = groupId;
  while (current) {
    const parent = byId.get(current);
    if (!parent || parent.type === 'OR') return false;
    current = parent.group;
  }
  return true;
}

/**
 * Decode `shop.cart.<uuid>` draft entries into cart lines.
 * @param {object} draft Equipment-tab draft.
 * @returns {Array<{uuid:string, qty:number, name:string, img:?string, type:string, costGp:number}>} Cart lines in name order.
 */
function parseCart(draft) {
  const out = [];
  for (const [key, rawQty] of Object.entries(draft)) {
    if (!key.startsWith('shop.cart.')) continue;
    const uuid = key.slice('shop.cart.'.length);
    const qty = Number(rawQty) || 0;
    if (qty <= 0) continue;
    const item = state.cache.get(uuid);
    if (!item) continue;
    out.push({ uuid, qty, name: item.name, img: item.img, type: item.type, costGp: item.costGp });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/**
 * Build the flat shop item list + bucket-based filter strip.
 * @param {number} remaining Gold remaining for affordability marking.
 * @param {Set<string>} inCart UUIDs currently in the cart.
 * @returns {{items:Array, filters:Array<{bucket:string,label:string,count:number}>}} Flat shop body.
 */
function buildShopItems(remaining, inCart) {
  const items = [];
  const counts = new Map();
  for (const list of state.byCategory.values()) {
    for (const it of list) {
      const bucket = bucketForItem(it);
      counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
      items.push({
        ...it,
        bucket,
        typeLabel: bucketLabel(bucket),
        affordable: it.costGp <= remaining + 0.0001,
        priceLabel: priceLabel(it),
        costTier: costTier(it.costGp),
        inCart: inCart.has(it.uuid)
      });
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  const filters = [...counts.keys()].map((bucket) => ({ bucket, label: bucketLabel(bucket), count: counts.get(bucket) })).sort((a, b) => a.label.localeCompare(b.label));
  return { items, filters };
}

/**
 * Format a shop item's price for display ("12 gp", "5 sp", "—" when free/unset).
 * @param {ShopItem} item Cached entry.
 * @returns {string} Localized price label.
 */
function priceLabel(item) {
  if (!item.priceValue) return _loc('HEROMANCER.App.Equipment.Shop.Free');
  return `${item.priceValue} ${item.priceDenom}`;
}

/**
 * Bucket a gp cost into a currency tier for tile foot coloring.
 * @param {number} gp Cost in gold pieces.
 * @returns {?string} `gold` (>=1 gp), `silver` (>=1 sp), `copper` (>0), or null when free.
 */
function costTier(gp) {
  if (!Number.isFinite(gp) || gp <= 0) return null;
  if (gp >= 1) return 'gold';
  if (gp >= 0.1) return 'silver';
  return 'copper';
}

/**
 * Normalize a CB index entry into a shop record.
 * @param {object} entry Index entry.
 * @returns {?ShopItem} Normalized record, or null when type is unsupported.
 */
function normalizeEntry(entry) {
  const sys = entry.system ?? {};
  const priceValue = Number(sys.price?.value) || 0;
  const priceDenom = sys.price?.denomination || 'gp';
  return {
    uuid: entry.uuid,
    name: entry.name,
    img: entry.img ?? null,
    type: entry.type,
    category: entry.type,
    costGp: round2(toGold(priceValue, priceDenom)),
    priceValue,
    priceDenom,
    armor: sys.armor ?? null,
    damage: sys.damage ?? null,
    weight: sys.weight ?? null,
    typeValue: sys.type?.value ?? null,
    subtype: sys.type?.subtype ?? null,
    baseItem: sys.type?.baseItem ?? null
  };
}

/**
 * Round to two decimal places (price math floats produce noisy tails).
 * @param {number} n Value.
 * @returns {number} Rounded value.
 */
function round2(n) {
  return Math.round(n * 100) / 100;
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
 * True when an index entry is a natural weapon (no baseItem or `natural` type).
 * @param {object} entry Index entry.
 * @returns {boolean} True when filtered out.
 */
function isNaturalWeapon(entry) {
  if (entry.type !== 'weapon') return false;
  const t = entry.system?.type;
  return t?.value === 'natural' || !t?.baseItem;
}
