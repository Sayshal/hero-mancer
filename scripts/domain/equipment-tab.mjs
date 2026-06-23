import { bucketForCategoryType, bucketForLinked, bucketLabel } from './equipment-buckets.mjs';
import { goldForOrOption, isModernRules, parseStartingGold } from './equipment-gold.mjs';
import { parseStartingEquipment } from './equipment-parser.mjs';
import { buildBonusGoldContext, buildShopContext, formatCurrency, getShopItem, initShopIndex, toGold, valueOfItem } from './equipment-shop.mjs';
import { collectProficiencies, filterByProficiency, flattenProficiencies, getCategoryOptions, initLookup } from './quartermaster.mjs';

/**
 * Pluck equipment-driven advancement links from a flat equipment draft.
 * @param {object} draft Flat equipment draft (`{tag}.advLink.{advId}.{level}.{slot}` keys).
 * @returns {Object<string, string>} `{advancementId}.{level}.{slotIdx}` -> trait key (e.g. `tool:music:drum`).
 */
export function extractEquipmentTraitLinks(draft = {}) {
  const links = {};
  for (const [key, value] of Object.entries(draft)) {
    if (!value) continue;
    const m = /^(class|background)\.advLink\.([^.]+)\.(\d+)\.(\d+)$/.exec(key);
    if (!m) continue;
    links[`${m[2]}.${m[3]}.${m[4]}`] = value;
  }
  return links;
}

/**
 * Build the equipment-tab context for the selected class + background.
 * @param {object} args Builder inputs.
 * @param {?object} args.classDoc Selected class Document.
 * @param {?object} args.backgroundDoc Selected background Document.
 * @param {?object} [args.speciesDoc] Selected species Document (proficiency source).
 * @param {object} [args.draft] Saved equipment draft.
 * @returns {Promise<object>} Render-ready context.
 */
export async function buildEquipmentContext({ classDoc, backgroundDoc, speciesDoc = null, draft = {} }) {
  const sources = [];
  if (classDoc) sources.push({ tag: 'class', doc: classDoc });
  if (backgroundDoc) sources.push({ tag: 'background', doc: backgroundDoc });
  if (!sources.length) return { hasSources: false, sections: [], groups: [], shop: null };
  await initLookup();
  await initShopIndex();
  const profs = collectProficiencies(classDoc, backgroundDoc, speciesDoc);
  const sections = [];
  const groups = [];
  for (const { tag, doc } of sources) {
    const section = buildSection(tag, doc, draft);
    sections.push(section);
    if (section.useWealth) {
      section.nodes = [];
      continue;
    }
    const nodes = await parseStartingEquipment(doc);
    section.nodes = nodes;
    const noneRefunds = {};
    for (const node of nodes) await collectNoneRefunds(node, doc, noneRefunds);
    const grants = [];
    const sectionGroups = [];
    const traitLinks = buildTraitLinkMap(doc);
    for (const node of nodes) walkNode(node, tag, draft, sectionGroups, grants, profs, noneRefunds, traitLinks);
    if (grants.length) sectionGroups.push(buildGrantsGroup(grants, tag, draft));
    section.groups = sectionGroups;
    section.noneRefunds = noneRefunds;
    for (const g of sectionGroups) groups.push({ ...g, sourceTag: tag });
  }
  const shop = await buildShopContext({ draft, classDoc, backgroundDoc, sections });
  const bonusGold = await buildBonusGoldContext(draft);
  return { hasSources: true, sections, groups, shop, bonusGold };
}

/**
 * Build per-source section metadata (label, wealth info, toggle state).
 * @param {string} tag Source tag (`class`/`background`).
 * @param {object} doc Source document.
 * @param {object} draft Saved equipment draft.
 * @returns {object} Section context.
 */
function buildSection(tag, doc, draft) {
  const { wealth } = parseStartingGold(doc);
  const wealthAvailable = wealth.formula !== null;
  const useWealth = wealthAvailable && Boolean(draft[`${tag}.useWealth`]);
  const summary = wealthAvailable ? wealthSummary(wealth) : null;
  const rolledRaw = draft[`${tag}.wealthRolled`];
  const rolledValue = Number(rolledRaw) || 0;
  const canRoll = wealthAvailable && wealth.isFormula;
  return {
    tag,
    label: _loc('HEROMANCER.App.Equipment.section-named', { name: doc.name }),
    docName: doc.name,
    modern: isModernRules(doc),
    wealth,
    wealthAvailable,
    useWealth,
    wealthSummary: summary,
    wealthCheckboxName: `equipment.${tag}.useWealth`,
    wealthRolledName: `equipment.${tag}.wealthRolled`,
    rolledValue,
    rolledFormatted: rolledValue > 0 ? formatCurrency(rolledValue) : null,
    rolledSummary: rolledValue > 0 ? _loc('HEROMANCER.App.Equipment.WealthRolledSummary', { formula: wealth.formula, value: formatCurrency(rolledValue) }) : null,
    canRoll,
    canRollNow: canRoll && useWealth && rolledValue <= 0,
    groups: []
  };
}

/**
 * Format the wealth summary for display ("Roll 5d4 * 10 (avg 125 gp)" or "155 gp").
 * @param {object} wealth Wealth field from `parseStartingGold`.
 * @returns {string} Localized summary string.
 */
function wealthSummary(wealth) {
  const avg = Number.isFinite(wealth.average) ? Math.round(wealth.average) : '?';
  if (wealth.isFormula) return _loc('HEROMANCER.App.Equipment.WealthSummaryRoll', { formula: wealth.formula, average: avg });
  return _loc('HEROMANCER.App.Equipment.WealthSummaryFlat', { average: avg });
}

/**
 * Recursively flatten a parser node into either a grants accumulator (linked items) or a choice group.
 * @param {object} node Parser node.
 * @param {string} tag Source tag (`class`/`background`).
 * @param {object} draft Saved equipment draft.
 * @param {object[]} groups Choice-group accumulator.
 * @param {object[]} grants Linked-grant tile accumulator (one bundle per source).
 * @param {object} profs Structured proficiency record from `collectProficiencies`.
 * @param {Object<string,number>} [noneRefunds] OR-node id → gp refund value.
 * @param {?Map<string, {advancementId:string, level:number, count:number}>} [traitLinks] Optional advancement-link map from `buildTraitLinkMap`.
 */
function walkNode(node, tag, draft, groups, grants, profs, noneRefunds, traitLinks) {
  if (node.kind === 'group' && node.operator === 'AND') {
    for (const child of node.children) walkNode(child, tag, draft, groups, grants, profs, noneRefunds, traitLinks);
    return;
  }
  if (node.kind === 'group' && node.operator === 'OR') {
    groups.push(buildOrTileGroup(node, tag, draft, profs, noneRefunds?.[node.id] ?? 0, traitLinks));
    return;
  }
  if (node.kind === 'linked') {
    grants.push(linkedTile(node, profs));
    return;
  }
  if (node.kind === 'category' || node.kind === 'choice') groups.push(buildCategoryTileGroup(node, tag, draft, profs, noneRefunds?.[node.id] ?? 0, traitLinks));
}

/**
 * Scan a class/background doc's Trait advancements for pools matching `{category}:{key}:*` so the equipment picker can pre-fill the proficiency choice.
 * @param {?object} doc Source document.
 * @returns {Map<string, {advancementId:string, level:number, count:number}>} `{category:key}` -> advancement metadata.
 */
function buildTraitLinkMap(doc) {
  const map = new Map();
  const advs = doc?.system?.advancement;
  if (!advs) return map;
  const list = advs instanceof Map ? [...advs.values()] : Array.isArray(advs) ? advs : Object.values(advs);
  for (const adv of list) {
    if (adv?.type !== 'Trait') continue;
    const choices = adv.configuration?.choices ?? [];
    for (const choice of choices) {
      for (const entry of choice.pool ?? []) {
        const m = /^([a-z]+):([^:]+):\*$/.exec(entry);
        if (!m) continue;
        const matchKey = `${m[1]}:${m[2]}`;
        if (map.has(matchKey)) continue;
        map.set(matchKey, { advancementId: adv._id ?? adv.id, level: adv.level ?? 0, count: choice.count ?? 1 });
      }
    }
  }
  return map;
}

/**
 * Map an OR-group parser node to a radio tile-group context.
 * @param {object} orNode Parser OR-group node.
 * @param {string} tag Source tag.
 * @param {object} draft Saved equipment draft.
 * @param {object} profs Structured proficiency record.
 * @param {number} refund Gp refund value for the None tile.
 * @param {?Map<string, {advancementId:string, level:number, count:number}>} [traitLinks] Optional advancement-link map from `buildTraitLinkMap`.
 * @returns {object} Tile-template context.
 */
function buildOrTileGroup(orNode, tag, draft, profs, refund, traitLinks) {
  const name = `equipment.${tag}.${orNode.id}`;
  const stored = draft[`${tag}.${orNode.id}`];
  const concreteTiles = orNode.children.map((child) => tileForChild(child, tag, orNode.id, draft, profs, traitLinks)).filter(Boolean);
  const noneTile = noneTileSpec(orNode.id, refund);
  const baseTiles = [noneTile, ...concreteTiles];
  const value = stored || concreteTiles[0]?.value || '';
  const tiles = baseTiles.map((t) => ({ ...t, selected: t.value === value }));
  return { id: `hm-eq-${tag}-${orNode.id}`, name, value, label: stripHtml(orNode.label), mode: 'radio', required: true, tiles };
}

/**
 * Build a one-tile group for a top-level `category`/`choice` node. Pre-selected so the detail-panel trigger is immediately visible.
 * @param {object} node Parser category/choice node.
 * @param {string} tag Source tag.
 * @param {object} draft Saved equipment draft.
 * @param {object} profs Structured proficiency record.
 * @param {number} refund Gp refund value for the None tile.
 * @param {?Map<string, {advancementId:string, level:number, count:number}>} [traitLinks] Optional advancement-link map from `buildTraitLinkMap`.
 * @returns {object} Tile-template context.
 */
function buildCategoryTileGroup(node, tag, draft, profs, refund, traitLinks) {
  const name = `equipment.${tag}.${node.id}`;
  const tileValue = `${node.kind}:${node.id}`;
  const stored = draft[`${tag}.${node.id}`];
  const value = stored ?? tileValue;
  const concreteTile = { ...tileForChild(node, tag, node.id, draft, profs, traitLinks), selected: value === tileValue };
  const noneTile = { ...noneTileSpec(node.id, refund), selected: value === `none:${node.id}` };
  return { id: `hm-eq-${tag}-${node.id}`, name, value, label: stripHtml(node.label), mode: 'radio', required: true, tiles: [noneTile, concreteTile] };
}

/**
 * Build the per-source "grants" multi-select tile group. Restores the saved selection when present, else pre-checks every linked grant.
 * @param {object[]} tiles Linked-grant tile specs.
 * @param {string} tag Source tag.
 * @param {object} draft Saved equipment draft.
 * @returns {object} Tile-template context (`mode:'check'`).
 */
function buildGrantsGroup(tiles, tag, draft) {
  const name = `equipment.${tag}.grants`;
  const stored = draft[`${tag}.grants`];
  const selectedSet = stored === undefined ? null : new Set(String(stored).split(',').filter(Boolean));
  const marked = tiles.map((t) => ({ ...t, selected: !t.disabled && (selectedSet ? selectedSet.has(t.value) : true) }));
  const value = marked
    .filter((t) => t.selected)
    .map((t) => t.value)
    .join(',');
  return { id: `hm-eq-${tag}-grants`, name, value, label: _loc(`HEROMANCER.App.Equipment.granted-${tag}`), mode: 'check', required: false, tiles: marked };
}

/**
 * Wrap an AND-bundle's per-category pickers into a single multi-section payload so the side-drawer can render them all with section headers + per-section selection state.
 * @param {object[]} pickers Per-slot picker specs from `buildPickerSpecs`.
 * @param {string} fallbackLabel Tile label fallback (used when no picks made yet).
 * @returns {{sectionsJson:string, sectionInputs:object[], aggregateLabel:string, aggregateIcon:?string, total:number, filled:number}} Multi-section payload.
 */
function buildMultiSectionPicker(pickers, fallbackLabel) {
  const sections = pickers.map((p) => ({
    name: p.name,
    label: p.label,
    max: 1,
    options: p.options.map((o) => ({ value: o.value, label: o.label, icon: o.icon, traitKey: o.traitKey })),
    current: p.value || ''
  }));
  const filledLabels = [];
  let firstIcon = null;
  for (const sec of sections) {
    if (!sec.current) continue;
    const opt = sec.options.find((o) => o.value === sec.current);
    if (opt) {
      filledLabels.push(opt.label);
      if (!firstIcon && opt.icon) firstIcon = opt.icon;
    }
  }
  return {
    sectionsJson: JSON.stringify(sections),
    sectionInputs: sections.map((s) => ({ name: s.name, value: s.current })),
    aggregateLabel: filledLabels.length ? filledLabels.join(', ') : fallbackLabel,
    aggregateIcon: firstIcon,
    total: sections.length,
    filled: filledLabels.length
  };
}

/**
 * Build a tile spec for one child node (used inside OR groups + category placeholders).
 * @param {object} child Parser node.
 * @param {string} tag Source tag.
 * @param {string} ownerId Owning OR-group (or top-level node) id.
 * @param {object} draft Saved equipment draft.
 * @param {object} profs Structured proficiency record.
 * @param {?Map<string, {advancementId:string, level:number, count:number}>} [traitLinks] Optional advancement-link map from `buildTraitLinkMap`.
 * @returns {?object} EquipmentTileSpec, or null when the kind is unsupported.
 */
function tileForChild(child, tag, ownerId, draft, profs, traitLinks) {
  if (child.kind === 'linked') return linkedTile(child, profs);
  if (child.kind === 'group' && child.operator === 'AND') {
    const contents = child.children
      .filter((g) => g.kind === 'linked')
      .map(contentRow)
      .filter(Boolean);
    const pickers = child.children.filter((g) => g.kind === 'category' || g.kind === 'choice').flatMap((grand) => buildPickerSpecs(grand, tag, ownerId, draft, profs, traitLinks));
    const label = shortBundleLabel(contents, pickers);
    const totalItems = contents.reduce((n, c) => n + (c.qty ?? 1), 0) + pickers.length;
    const multiSection = pickers.length ? buildMultiSectionPicker(pickers, label) : null;
    return {
      value: `and:${child.id}`,
      label: multiSection?.aggregateLabel ?? label,
      type: 'pack',
      typeLabel: bucketLabel('pack'),
      contents,
      multiSection,
      isPicker: !!multiSection,
      isPlaceholder: multiSection ? !multiSection.filled : false,
      foot: { icon: 'fa-box-archive', text: _locP('HEROMANCER.Components.EquipmentTile.BundleCount', totalItems) },
      tooltipHtml: bundleTooltipHtml(contents, pickers)
    };
  }
  if (child.kind === 'category' || child.kind === 'choice') {
    const label = stripHtml(child.label).titleCase();
    const type = bucketForCategoryType(child.categoryType);
    if (child.count > 1) {
      const slots = buildPickerSpecs(child, tag, ownerId, draft, profs, traitLinks);
      const multiSection = buildMultiSectionPicker(slots, label);
      return {
        value: `${child.kind}:${child.id}`,
        label: multiSection.aggregateLabel,
        type,
        typeLabel: bucketLabel(type),
        icon: multiSection.aggregateIcon ?? null,
        uuid: null,
        multiSection,
        isPicker: true,
        isPlaceholder: !multiSection.filled,
        foot: { icon: null, text: `${label} (×${child.count})` }
      };
    }
    const [p] = buildPickerSpecs(child, tag, ownerId, draft, profs, traitLinks);
    return {
      value: `${child.kind}:${child.id}`,
      label: p.selectedLabel ?? _loc('HEROMANCER.App.Equipment.DetailChoosePrompt'),
      type,
      typeLabel: bucketLabel(type),
      icon: p.selectedIcon ?? null,
      uuid: p.value || null,
      picker: p,
      isPicker: true,
      isPlaceholder: !p.value,
      foot: { icon: null, text: label }
    };
  }
  if (child.kind === 'currency') return currencyTile(child);
  return null;
}

/**
 * Build a tile spec for a `currency` OR-option ("Take N gp" branch on backgrounds + some 2024 classes).
 * @param {object} node Parser `currency` node.
 * @returns {object} EquipmentTileSpec.
 */
function currencyTile(node) {
  const label = stripHtml(node.label) || `${node.count} ${node.key}`;
  const icon = CONFIG.DND5E?.currencies?.[node.key]?.icon ?? CONFIG.DND5E?.currencies?.gp?.icon ?? null;
  return {
    value: `currency:${node.id}`,
    label,
    type: 'currency',
    typeLabel: bucketLabel('currency'),
    icon,
    isCurrency: true,
    count: null,
    foot: { icon: 'fa-coins', text: `${node.count} ${node.key}` }
  };
}

/**
 * Build picker specs for a `category`/`choice` node — one entry per slot (a `count` > 1 node expands to N independent slots).
 * @param {object} node Parser category/choice node.
 * @param {string} tag Source tag.
 * @param {string} ownerId OR-group (or top-level node) id that contains this picker.
 * @param {object} draft Saved equipment draft.
 * @param {object} profs Structured proficiency record.
 * @param {?Map<string, {advancementId:string, level:number, count:number}>} [traitLinks] Optional advancement-link map from `buildTraitLinkMap`.
 * @returns {object[]} One picker spec per slot.
 */
function buildPickerSpecs(node, tag, ownerId, draft, profs, traitLinks) {
  const pool = poolForNode(node);
  const link = traitLinks?.get(`${node.categoryType}:${node.key}`) ?? null;
  const filtered = node.requiresProficiency === false ? pool : filterByProficiency(pool, node.categoryType, profs);
  const options = filtered.map((o) => ({ value: o.uuid, label: o.name, icon: o.img ?? null, traitKey: link && o.baseItem ? `${node.categoryType}:${node.key}:${o.baseItem}` : null }));
  const optionsJson = JSON.stringify(options);
  const cleanLabel = stripCountPrefix(stripHtml(node.label)).titleCase();
  const slots = node.count > 1 ? node.count : 1;
  const out = [];
  for (let i = 0; i < slots; i++) {
    const slotKey = slots > 1 ? `${node.id}.${i}` : node.id;
    const name = `equipment.${tag}.${ownerId}.pick.${slotKey}`;
    const value = draft[`${tag}.${ownerId}.pick.${slotKey}`] ?? '';
    const selected = value ? (options.find((o) => o.value === value) ?? null) : null;
    const linkSlotIdx = link ? i % link.count : null;
    const linkName = link ? `equipment.${tag}.advLink.${link.advancementId}.${link.level}.${linkSlotIdx}` : null;
    const linkValue = link ? (draft[`${tag}.advLink.${link.advancementId}.${link.level}.${linkSlotIdx}`] ?? selected?.traitKey ?? '') : '';
    out.push({
      name,
      value,
      label: cleanLabel,
      categoryType: node.categoryType,
      slotIndex: slots > 1 ? i + 1 : null,
      slotTotal: slots > 1 ? slots : null,
      options,
      optionsJson,
      selectedLabel: selected?.label ?? null,
      selectedIcon: selected?.icon ?? null,
      linkName,
      linkValue
    });
  }
  return out;
}

/**
 * Drop a leading "N×" / "Nx " count prefix from a dnd5e-generated category label.
 * @param {string} label Raw label.
 * @returns {string} Label without leading count.
 */
function stripCountPrefix(label) {
  return label.replace(/^\s*\d+\s*[x×]\s*/i, '').trim();
}

/**
 * Resolve the raw item pool for a `category` or `choice` node before proficiency filtering.
 * @param {object} node Parser node.
 * @returns {Array<{uuid:string,name:string,img:?string}>} Unfiltered options.
 */
function poolForNode(node) {
  if (node.kind === 'category') return getCategoryOptions(node.categoryType, node.key);
  const merged = (node.keyOptions ?? []).flatMap((k) => getCategoryOptions(node.categoryType, k));
  const seen = new Set();
  const dedup = [];
  for (const o of merged) {
    if (seen.has(o.uuid)) continue;
    seen.add(o.uuid);
    dedup.push(o);
  }
  return dedup.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Build the standard linked-item tile spec.
 * @param {object} node Parser `linked` node.
 * @param {object} profs Structured proficiency record (drives the `requiresProficiency` gate).
 * @returns {object} EquipmentTileSpec.
 */
function linkedTile(node, profs) {
  const type = bucketForLinked(node.uuid);
  const conditional = node.requiresProficiency === true;
  const proficient = conditional ? linkedItemProficient(node.uuid, profs) : true;
  const disabled = conditional && !proficient;
  return {
    value: node.uuid,
    uuid: node.uuid,
    label: node.name ?? stripHtml(node.label),
    icon: node.img,
    type,
    typeLabel: bucketLabel(type),
    count: node.count > 1 ? node.count : null,
    disabled,
    foot: disabled ? { icon: 'fa-ban', text: _loc('HEROMANCER.Components.EquipmentTile.RequiresProficiency') } : linkedTileFoot(node.uuid, type)
  };
}

/**
 * Check whether the character meets the proficiency requirement for a specific linked item.
 * @param {string} uuid Item uuid.
 * @param {{granted:Set<string>, choices:Array}|Set<string>} profs Proficiency record.
 * @returns {boolean} True when proficient (or unknown item / no profs).
 */
function linkedItemProficient(uuid, profs) {
  const item = getShopItem(uuid);
  if (!item) return true;
  const flat = profs instanceof Set ? profs : flattenProficiencies(profs);
  if (!flat.size) return true;
  const cfg = CONFIG.DND5E ?? {};
  if (item.type === 'weapon') {
    const group = cfg.weaponProficienciesMap?.[item.typeValue];
    if (group && flat.has(`weapon:${group}`)) return true;
    if (item.baseItem) {
      if (group && flat.has(`weapon:${group}:${item.baseItem}`)) return true;
      if (flat.has(`weapon:${item.baseItem}`)) return true;
    }
    return false;
  }
  if (item.type === 'equipment' && ['light', 'medium', 'heavy', 'shield'].includes(item.typeValue)) {
    const group = cfg.armorProficienciesMap?.[item.typeValue];
    if (group === true) return true;
    if (group && flat.has(`armor:${group}`)) return true;
    if (item.baseItem) {
      if (group && flat.has(`armor:${group}:${item.baseItem}`)) return true;
      if (flat.has(`armor:${item.baseItem}`)) return true;
    }
    return false;
  }
  if (item.type === 'tool') {
    if (flat.has(`tool:${item.typeValue}`)) return true;
    if (item.baseItem) {
      if (flat.has(`tool:${item.typeValue}:${item.baseItem}`)) return true;
      if (flat.has(`tool:${item.baseItem}`)) return true;
    }
    return false;
  }
  return true;
}

/**
 * Derive footer info for a linked tile from the shop cache (armor AC, weapon damage, container weight).
 * @param {string} uuid Item uuid.
 * @param {string} bucket Tile bucket (weapon/armor/pack/tool/other).
 * @returns {{icon: ?string, text: string}} Footer spec.
 */
function linkedTileFoot(uuid, bucket) {
  const item = getShopItem(uuid);
  if (!item) return { icon: null, text: bucketLabel(bucket) };
  if (item.type === 'weapon') {
    const dmg = weaponDamageText(item.damage);
    if (dmg) return { icon: 'fa-burst', text: dmg };
  }
  if (item.type === 'equipment' && ['light', 'medium', 'heavy', 'shield'].includes(item.typeValue)) {
    const txt = armorText(item.armor, item.typeValue);
    if (txt) return { icon: 'fa-shield-halved', text: txt };
  }
  if (item.type === 'container' && item.weight) {
    const txt = weightText(item.weight);
    if (txt) return { icon: 'fa-weight-hanging', text: txt };
  }
  const cfgLabel = configTypeLabel(item);
  if (cfgLabel) return { icon: null, text: cfgLabel };
  return { icon: null, text: bucketLabel(bucket) };
}

/**
 * Read the CONFIG.DND5E label for an item's `system.type.value` (clothing, trinket, art tool, etc.).
 * @param {object} item Cached shop item.
 * @returns {?string} Localized type label, or null.
 */
function configTypeLabel(item) {
  const cfg = CONFIG.DND5E;
  if (!cfg) return null;
  const map = { equipment: cfg.equipmentTypes, tool: cfg.toolTypes, consumable: cfg.consumableTypes, weapon: cfg.weaponTypes, loot: cfg.lootTypes };
  const bag = map[item.type];
  if (!bag) return null;
  const entry = item.typeValue ? bag[item.typeValue] : null;
  const label = typeof entry === 'string' ? entry : entry?.label;
  if (label) return _loc(label);
  if (item.type === 'loot') return _loc('TYPES.Item.loot');
  if (item.type === 'consumable') return _loc('TYPES.Item.consumable');
  return null;
}

/**
 * Format a weapon's base damage as `1d8 slashing` (dnd5e 4.x schema with 2014 fallback).
 * @param {object} damage `system.damage` object.
 * @returns {?string} Formatted damage line, or null.
 */
function weaponDamageText(damage) {
  if (!damage) return null;
  const base = damage.base;
  if (base?.number && base?.denomination) {
    const types = base.types instanceof Set ? [...base.types] : (base.types ?? []);
    const typeKey = types[0];
    const typeLabel = typeKey ? (CONFIG.DND5E?.damageTypes?.[typeKey]?.label ?? typeKey) : '';
    return typeLabel ? `${base.number}d${base.denomination} ${typeLabel.toLowerCase()}` : `${base.number}d${base.denomination}`;
  }
  const part = damage.parts?.[0];
  if (Array.isArray(part) && part[0]) {
    const typeLabel = part[1] ? (CONFIG.DND5E?.damageTypes?.[part[1]]?.label ?? part[1]) : '';
    return typeLabel ? `${part[0]} ${typeLabel.toLowerCase()}` : part[0];
  }
  return null;
}

/**
 * Format an armor entry — shield as `+N AC`, light/medium/heavy as `N (+Dex…) AC`.
 * @param {object} armor `system.armor` object.
 * @param {string} typeValue `system.type.value` (light/medium/heavy/shield).
 * @returns {?string} Formatted AC line, or null.
 */
function armorText(armor, typeValue) {
  const ac = Number(armor?.value) || 0;
  if (typeValue === 'shield') return ac > 0 ? `+${ac} AC` : '+2 AC';
  if (!ac) return null;
  if (typeValue === 'light') return `${ac} + Dex AC`;
  if (typeValue === 'medium') {
    const cap = Number.isFinite(Number(armor.dex)) ? Number(armor.dex) : 2;
    return `${ac} + Dex (max ${cap}) AC`;
  }
  if (typeValue === 'heavy') return `${ac} AC`;
  return null;
}

/**
 * Format a weight entry as `N lb`.
 * @param {object} weight `system.weight` object.
 * @returns {?string} Formatted weight, or null.
 */
function weightText(weight) {
  const v = Number(weight.value);
  if (!Number.isFinite(v) || v <= 0) return null;
  return `${v} ${weight.units || 'lb'}`;
}

/**
 * Build a content row for an AND-inside-OR tile.
 * @param {object} grand Grandchild parser node.
 * @returns {?object} Content row spec, or null when unsupported.
 */
function contentRow(grand) {
  if (grand.kind === 'linked') return { label: grand.name ?? stripHtml(grand.label), icon: grand.img, qty: grand.count > 1 ? grand.count : null, uuid: grand.uuid };
  return null;
}

/**
 * Compose a short bundle label as "Item, Item, Item, and more…" from the AND-group's contents + pickers.
 * @param {object[]} contents Linked content rows.
 * @param {object[]} pickers Picker specs (used for any unresolved categories in the bundle).
 * @param {number} [max] How many items to surface before collapsing.
 * @param {number} [charLimit] Maximum length (in chars) of the final label before tightening the slice.
 * @returns {string} Display label.
 */
function shortBundleLabel(contents, pickers, max = 5, charLimit = 70) {
  const items = [...contents.map((c) => (c.qty ? `${c.qty}× ${c.label}` : c.label)), ...pickers.map((p) => p.label)];
  if (!items.length) return '';
  const andMore = `, ${_loc('HEROMANCER.Components.EquipmentTile.BundleAndMore')}`;
  for (let n = Math.min(max, items.length); n >= 1; n--) {
    const text = items.slice(0, n).join(', ');
    const full = n < items.length ? text + andMore : text;
    if (full.length <= charLimit) return full;
  }
  return items[0] + andMore;
}

/**
 * Render an AND-bundle's contents + outstanding picks as a tooltip HTML string.
 * @param {object[]} contents Linked content rows.
 * @param {object[]} pickers AND-inside-OR picker slots.
 * @returns {string} HTML markup for `data-tooltip`.
 */
function bundleTooltipHtml(contents, pickers) {
  return Handlebars.partials.hmEquipmentBundleTooltip({ contents, pickers }).trim();
}

/**
 * Strip HTML tags from an enriched label string for use as plain tile text.
 * @param {string} raw Enriched HTML.
 * @returns {string} Plain-text label.
 */
function stripHtml(raw) {
  return String(raw ?? '')
    .replace(/<[^>]*>/g, '')
    .trim();
}

/**
 * Walk a parser tree, collecting `{orId: refundGp}` entries for every OR node and every top-level `category`/`choice` node.
 * @param {object} node Parser node.
 * @param {object} doc Source document (for currency grant lookups).
 * @param {Object<string,number>} out Mutable accumulator.
 * @returns {Promise<void>}
 */
async function collectNoneRefunds(node, doc, out) {
  if (node.kind === 'group' && node.operator === 'AND') {
    for (const child of node.children) await collectNoneRefunds(child, doc, out);
    return;
  }
  if (node.kind === 'group' && node.operator === 'OR') {
    const first = node.children[0];
    if (first) out[node.id] = await valueOfOrChild(first, doc);
    return;
  }
  if (node.kind === 'category' || node.kind === 'choice') out[node.id] = await valueOfOrChild(node, doc);
}

/**
 * Compute the gp value of a single OR-child node (linked, AND bundle, currency, category, or choice).
 * @param {object} child Parser child node.
 * @param {object} doc Source document.
 * @returns {Promise<number>} Gp value.
 */
async function valueOfOrChild(child, doc) {
  if (child.kind === 'linked') {
    const v = await valueOfItem(child.uuid);
    return v * (child.count || 1);
  }
  if (child.kind === 'group' && child.operator === 'AND') {
    let sum = 0;
    for (const g of child.children) sum += await valueOfOrChild(g, doc);
    const grant = goldForOrOption(child.id, doc);
    if (grant) sum += toGold(grant.count ?? 0, grant.key);
    return sum;
  }
  if (child.kind === 'currency') return toGold(child.count ?? 0, child.key);
  if (child.kind === 'category' || child.kind === 'choice') {
    const pool = poolForNode(child);
    let maxGp = 0;
    for (const opt of pool) {
      const cost = getShopItem(opt.uuid)?.costGp ?? (await valueOfItem(opt.uuid));
      if (cost > maxGp) maxGp = cost;
    }
    return maxGp * (child.count || 1);
  }
  return 0;
}

/**
 * Build the "None" tile spec for an OR / category / choice group. Shows the gp refund value as a cost chip.
 * @param {string} ownerId Parser-node id (OR / category / choice).
 * @param {number} refund Gp refund value.
 * @returns {object} EquipmentTileSpec.
 */
function noneTileSpec(ownerId, refund) {
  const cost = refund > 0 ? `+${formatCurrency(refund)}` : null;
  return {
    value: `none:${ownerId}`,
    label: _loc('HEROMANCER.App.Equipment.OrNoneLabel'),
    type: 'none',
    typeLabel: bucketLabel('none'),
    icon: null,
    cost,
    foot: { icon: 'fa-coins', text: cost ?? `+0 ${_loc('DND5E.CurrencyAbbrGP')}` }
  };
}
