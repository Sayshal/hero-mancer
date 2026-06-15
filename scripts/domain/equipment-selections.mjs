/**
 * Collect picked uuids + quantities for one source section (class/background) by walking its parsed nodes against the draft.
 * @param {object} section Section context from `buildEquipmentContext` (carries `nodes` + `groups` + `useWealth`).
 * @param {object} draft Equipment-tab draft (flat keys).
 * @returns {Array<{uuid:string, quantity:number}>} Pick list (raw, not aggregated).
 */
export function collectSectionPicks(section, draft = {}) {
  const out = [];
  if (!section || section.useWealth) return out;
  for (const node of section.nodes ?? []) walkChoice(node, section.tag, draft, out);
  pushGrants(section, draft, out);
  return out;
}

/**
 * Collect shop-cart picks from the equipment context.
 * @param {?object} shop Shop context from `buildShopContext`.
 * @returns {Array<{uuid:string, quantity:number}>} Cart picks.
 */
export function collectShopPicks(shop) {
  if (!shop?.cart?.length) return [];
  return shop.cart.map((line) => ({ uuid: line.uuid, quantity: Number(line.qty) || 1, stack: true }));
}

/**
 * Walk a parser node, collecting picked uuids from OR / category / choice selections (linked-grant items handled by grants group).
 * @param {object} node Parser node.
 * @param {string} tag Source tag.
 * @param {object} draft Equipment-tab draft.
 * @param {object[]} out Pick accumulator.
 */
function walkChoice(node, tag, draft, out) {
  if (node.kind === 'group' && node.operator === 'AND') {
    for (const child of node.children) walkChoice(child, tag, draft, out);
    return;
  }
  if (node.kind === 'group' && node.operator === 'OR') {
    const sel = draft[`${tag}.${node.id}`];
    const value = sel || defaultOrValue(node);
    if (!value) return;
    if (value.startsWith('none:') || value.startsWith('currency:')) return;
    if (value.startsWith('and:')) {
      const child = node.children.find((c) => c.kind === 'group' && c.id === value.slice(4));
      if (child) collectFromAnd(child, node.id, tag, draft, out);
      return;
    }
    if (value.startsWith('category:') || value.startsWith('choice:')) {
      const childId = value.slice(value.indexOf(':') + 1);
      const child = node.children.find((c) => (c.kind === 'category' || c.kind === 'choice') && c.id === childId);
      if (child) pushPickedSlots(child, tag, node.id, draft, out);
      return;
    }
    const linked = node.children.find((c) => c.kind === 'linked' && c.uuid === value);
    if (linked) out.push({ uuid: linked.uuid, quantity: linked.count || 1 });
    return;
  }
  if (node.kind === 'category' || node.kind === 'choice') {
    const sel = draft[`${tag}.${node.id}`];
    if (sel?.startsWith('none:')) return;
    pushPickedSlots(node, tag, node.id, draft, out);
  }
}

/**
 * Resolve the default OR-group value when the draft is empty (mirrors `buildOrTileGroup`: first concrete tile).
 * @param {object} orNode Parser OR-group node.
 * @returns {?string} Default tile value or null.
 */
function defaultOrValue(orNode) {
  const first = orNode.children?.[0];
  if (!first) return null;
  if (first.kind === 'linked') return first.uuid;
  if (first.kind === 'group' && first.operator === 'AND') return `and:${first.id}`;
  if (first.kind === 'category' || first.kind === 'choice') return `${first.kind}:${first.id}`;
  if (first.kind === 'currency') return `currency:${first.id}`;
  return null;
}

/**
 * Collect every linked / picker resolution from an AND bundle selected inside an OR group.
 * @param {object} andNode Parser AND node.
 * @param {string} ownerId OR-group id (picker key prefix).
 * @param {string} tag Source tag.
 * @param {object} draft Equipment-tab draft.
 * @param {object[]} out Pick accumulator.
 */
function collectFromAnd(andNode, ownerId, tag, draft, out) {
  for (const child of andNode.children) {
    if (child.kind === 'linked') out.push({ uuid: child.uuid, quantity: child.count || 1 });
    else if (child.kind === 'category' || child.kind === 'choice') pushPickedSlots(child, tag, ownerId, draft, out);
  }
}

/**
 * Read one pick per slot from draft for a `category`/`choice` node.
 * @param {object} node Parser node.
 * @param {string} tag Source tag.
 * @param {string} ownerId Owning OR-group (or top-level node) id.
 * @param {object} draft Equipment-tab draft.
 * @param {object[]} out Pick accumulator.
 */
function pushPickedSlots(node, tag, ownerId, draft, out) {
  const slots = node.count > 1 ? node.count : 1;
  for (let i = 0; i < slots; i++) {
    const slotKey = slots > 1 ? `${node.id}.${i}` : node.id;
    const uuid = draft[`${tag}.${ownerId}.pick.${slotKey}`];
    if (uuid) out.push({ uuid, quantity: 1 });
  }
}

/**
 * Add selected entries from the section's grants checkbox group.
 * @param {object} section Section context.
 * @param {object} draft Equipment-tab draft.
 * @param {object[]} out Pick accumulator.
 */
function pushGrants(section, draft, out) {
  const group = section.groups?.find((g) => /\.grants$/.test(g.name));
  if (!group) return;
  const stored = draft[`${section.tag}.grants`];
  const selected = new Set(typeof stored === 'string' ? stored.split(',').filter(Boolean) : group.tiles.map((t) => t.value));
  for (const tile of group.tiles ?? []) {
    if (!selected.has(tile.value)) continue;
    out.push({ uuid: tile.uuid ?? tile.value, quantity: tile.count && tile.count > 1 ? tile.count : 1 });
  }
}
