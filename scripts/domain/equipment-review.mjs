import { aggregateByUuid } from './character.mjs';
import { collectSectionPicks, collectShopPicks } from './equipment-selections.mjs';
import { formatCurrency } from './equipment-shop.mjs';

/**
 * Build the finalize-tab equipment review summary from equipment-tab context + current draft.
 * @param {object} args Builder inputs.
 * @param {?object} [args.equipmentContext] Result of `buildEquipmentContext`.
 * @param {object} [args.draft] Equipment-tab draft (flat keys).
 * @returns {Promise<object>} Review-ready summary.
 */
export async function buildEquipmentReview({ equipmentContext = null, draft = {} } = {}) {
  const items = [];
  for (const section of equipmentContext?.sections ?? []) {
    const source = section.label.replace(/\s+equipment$/i, '');
    await collectGroupItems(items, source, section.useWealth ? [] : collectSectionPicks(section, draft));
  }
  await collectGroupItems(items, _loc('HEROMANCER.App.Finalize.Review.SectionShop'), collectShopPicks(equipmentContext?.shop));
  items.sort((a, b) => a.name.localeCompare(b.name));
  const goldGp = goldRemaining(equipmentContext?.shop);
  return { hasReview: items.length > 0 || goldGp > 0, items, goldGp, goldFormatted: goldGp > 0 ? formatCurrency(goldGp) : null };
}

/**
 * Resolve a pick list into review rows tagged with their source, appended to `out`.
 * @param {object[]} out Accumulator of resolved rows.
 * @param {string} source Localized source label (shown as the tile footer).
 * @param {Array<{uuid:string, quantity:number}>} picks Raw picks.
 * @returns {Promise<void>}
 */
async function collectGroupItems(out, source, picks) {
  for (const pick of aggregateByUuid(picks)) out.push(await resolveItem(pick, source));
}

/**
 * Resolve a pick to a render-ready row. The tile is a `data-item-link` opening the item sheet (where
 * container contents are shown), so contents aren't expanded inline.
 * @param {{uuid:string, quantity:number}} pick Aggregated pick.
 * @param {string} source Localized source label.
 * @returns {Promise<object>} Review row.
 */
async function resolveItem(pick, source) {
  const doc = fromUuidSync(pick.uuid) ?? (await fromUuid(pick.uuid));
  return { uuid: pick.uuid, name: doc?.name ?? pick.uuid, img: doc?.img ?? null, qty: pick.quantity, source };
}

/**
 * Total gold = unspent purchasing pool (wealth toggles + picked currency + refunds, less shop spending).
 * @param {?object} shop Shop context from `buildShopContext`.
 * @returns {number} Gold gp (clamped to >= 0).
 */
function goldRemaining(shop) {
  const remaining = Number(shop?.remaining);
  return Number.isFinite(remaining) && remaining > 0 ? remaining : 0;
}
