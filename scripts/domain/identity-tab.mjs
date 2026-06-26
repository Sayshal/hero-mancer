import { MODULE } from '../constants.mjs';
import * as documentLoader from '../data/document-loader.mjs';
import { shortDescription } from '../utils/html-text.mjs';
import * as compare from './compare.mjs';
import { buildIdentityTags } from './identity-tags.mjs';
import { checkMulticlassPrereq, formatPrereqChipLabel, formatPrereqLabel } from './multiclass-prereqs.mjs';
import { getEligibleSubclasses, getSubclassThreshold } from './subclass.mjs';

/** @type {Object<string, string>} */
const SECTION_TO_TYPE = { background: 'background', species: 'race', class: 'class' };

/** @type {Object<string, string>} */
const SECTION_ICONS = { background: 'fa-landmark', species: 'fa-dna', class: 'fa-chess', subclass: 'fa-chess-pawn' };

/** @returns {boolean} True when every identity compendium index is already cached. */
export function identityIndexesReady() {
  return [...Object.values(SECTION_TO_TYPE), 'subclass'].every((t) => documentLoader.getEntries(t).length > 0);
}

/**
 * Reindex identity compendia in parallel; skips cached categories.
 * @param {?Function} [onProgress] Called with `(done, total)` as each uncached category finishes.
 * @returns {Promise<void>}
 */
export async function preloadIdentityDocs(onProgress) {
  const pending = [...Object.values(SECTION_TO_TYPE), 'subclass'].filter((t) => documentLoader.getEntries(t).length === 0);
  let done = 0;
  await Promise.all(pending.map((t) => documentLoader.reindex(t).then(() => onProgress?.(++done, pending.length))));
}

/**
 * Resolve the ruleset that locks identity choices, taken from the first selected identity item carrying a 2014/2024 ruleset. Returns null when the lock setting is off or nothing constrains it yet.
 * @param {object} draft Identity draft state.
 * @returns {?string} `2014`, `2024`, or null.
 */
function identityLockRuleset(draft) {
  if (!game.settings.get(MODULE.ID, MODULE.SETTINGS.LOCK_IDENTITY_RULESET)) return null;
  const picks = [
    ['background', draft.background],
    ['race', draft.species],
    ['class', draft.classes?.[0]?.uuid]
  ];
  for (const [type, uuid] of picks) {
    if (!uuid) continue;
    const rules = documentLoader.getEntries(type).find((e) => e.uuid === uuid)?.system?.source?.rules;
    if (rules === '2014' || rules === '2024') return rules;
  }
  return null;
}

/**
 * Whether an entry is selectable under a locked ruleset; options with no ruleset stay available to all.
 * @param {object} entry Slim DocEntry.
 * @param {?string} locked Locked ruleset, or null for no lock.
 * @returns {boolean} True when allowed.
 */
function allowedByRuleset(entry, locked) {
  if (!locked) return true;
  const rules = entry.system?.source?.rules;
  return !rules || rules === locked;
}

/**
 * Build the identity-tab context: one sub-tab per advancementOrder entry plus subclass.
 * @param {object} [draft] Identity draft state.
 * @param {object} [opts] Build options.
 * @param {number} [opts.effectiveLevel] Effective character level.
 * @param {?Object<string, number>} [opts.abilityScores] Drives multiclass prereq chips.
 * @param {?string} [opts.activeClassSlotId] Selected class slot.
 * @param {?string} [opts.activeSubclassSlotId] Selected subclass slot.
 * @returns {object} Tab context.
 */
export function buildIdentityContext(draft = {}, { effectiveLevel = 1, abilityScores = null, activeClassSlotId = null, activeSubclassSlotId = null } = {}) {
  const order = [...game.settings.get(MODULE.ID, MODULE.SETTINGS.ADVANCEMENT_ORDER)].sort((a, b) => a.order - b.order);
  const roster = normalizeRoster(draft, effectiveLevel);
  const isMulticlassMode = effectiveLevel > 1 && !game.settings.get(MODULE.ID, MODULE.SETTINGS.DISABLE_MULTICLASS);
  const locked = identityLockRuleset(draft);
  const sections = order.map((entry) => {
    const base = { id: entry.id, label: _loc(entry.label), icon: `fas ${SECTION_ICONS[entry.id]}` };
    if (entry.id === 'class') {
      const classRoster = buildClassRosterContext(roster, { effectiveLevel, abilityScores, isMulticlassMode, activeClassSlotId, locked });
      const picked = roster.filter((r) => r.uuid);
      const unselected = roster.filter((r) => !r.uuid).length;
      const prereqFails = classRoster.rows.filter((r) => r.prereqChip).length;
      return { ...base, classRoster, selectedLabel: joinSelectionNames(picked.map((r) => r.uuid)), badge: unselected + prereqFails + (classRoster.balance.state === 'ok' ? 0 : 1) };
    }
    const type = SECTION_TO_TYPE[entry.id];
    const value = draft[entry.id] ?? '';
    return { ...base, combo: buildSectionCombo(entry.id, type, value, locked), selectedLabel: value ? (lookupSelectionName(value) ?? '') : '', badge: value ? 0 : 1 };
  });
  const subclassSection = buildSubclassSection(roster, activeSubclassSlotId, locked);
  if (subclassSection.subclassPickers.length) {
    const classIdx = sections.findIndex((s) => s.id === 'class');
    sections.splice(classIdx >= 0 ? classIdx + 1 : sections.length, 0, subclassSection);
  }
  return { sections };
}

/**
 * Coerce identity draft to roster shape; falls back to a single placeholder slot.
 * @param {object} draft Identity draft state.
 * @param {number} effectiveLevel Effective character level.
 * @returns {Array<{slotId: string, uuid: string, level: number, subclassUuid: string}>} Roster rows.
 */
function normalizeRoster(draft, effectiveLevel) {
  if (Array.isArray(draft.classes) && draft.classes.length) {
    return draft.classes.map((c, idx) => ({
      slotId: c.slotId || rosterSlotId(),
      uuid: c.uuid ?? '',
      level: idx === 0 ? Number(c.level) || effectiveLevel : Number(c.level) || 0,
      subclassUuid: c.subclassUuid ?? ''
    }));
  }
  return [{ slotId: rosterSlotId(), uuid: '', level: effectiveLevel, subclassUuid: '' }];
}

/** @returns {string} Stable 4-char slot id. */
export function rosterSlotId() {
  return foundry.utils.randomID(4);
}

/**
 * Return `preferred` when it matches a picked row; else first picked slot id.
 * @param {Array<{slotId: string}>} picked Picked rows.
 * @param {?string} preferred Preferred slot id.
 * @returns {?string} Active slot id.
 */
function resolveActiveSlot(picked, preferred) {
  if (preferred && picked.some((p) => p.slotId === preferred)) return preferred;
  return picked[0]?.slotId ?? null;
}

/**
 * Class sub-tab roster context: per-row combobox, level, prereq chip, balance.
 * @param {Array<{slotId: string, uuid: string, level: number}>} roster Class roster rows.
 * @param {object} opts Build options.
 * @param {number} opts.effectiveLevel Effective character level.
 * @param {?Object<string, number>} opts.abilityScores Ability scores.
 * @param {boolean} opts.isMulticlassMode Multiclass UI active.
 * @param {?string} opts.activeClassSlotId Selected class slot.
 * @param {?string} [opts.locked] Locked ruleset filter, or null.
 * @returns {object} Roster context.
 */
function buildClassRosterContext(roster, { effectiveLevel, abilityScores, isMulticlassMode, activeClassSlotId, locked = null }) {
  const totalAssigned = roster.reduce((sum, r) => sum + (Number(r.level) || 0), 0);
  const primaryLevel = Number(roster[0]?.level) || 0;
  const secondaryHasSpare = roster.slice(1).some((r) => (Number(r.level) || 0) > 1);
  const pickedUuids = new Set(roster.map((s) => s.uuid).filter(Boolean));
  const rows = roster.map((slot, idx) => {
    const isPrimary = idx === 0;
    const combo = buildClassRosterCombo(slot, idx, pickedUuids, locked);
    const prereqChip = !isPrimary ? buildPrereqChip(slot.uuid, abilityScores) : null;
    const level = Number(slot.level) || 0;
    const canIncrement = totalAssigned < effectiveLevel || (isPrimary ? secondaryHasSpare : primaryLevel > 1);
    const canDecrement = level > 0;
    return { slotId: slot.slotId, idx, primary: isPrimary, level, uuid: slot.uuid, combo, prereqChip, removable: !isPrimary, canIncrement, canDecrement };
  });
  const remaining = effectiveLevel - totalAssigned;
  const balance = computeBalance(totalAssigned, effectiveLevel);
  const canAddMore = isMulticlassMode && (remaining > 0 || (rows.length === 1 && (rows[0]?.level ?? 0) > 1));
  const primary = rows[0];
  const pickedRows = rows.filter((r) => r.uuid);
  const activeSlotId = resolveActiveSlot(pickedRows, activeClassSlotId);
  const pills = pickedRows.map((r) => ({ slotId: r.slotId, label: lookupSelectionName(r.uuid) ?? '', active: r.slotId === activeSlotId }));
  const activeRow = pickedRows.find((r) => r.slotId === activeSlotId) ?? null;
  return {
    showSteppers: isMulticlassMode,
    rows,
    canAddMore,
    effectiveLevel,
    totalAssigned,
    remaining,
    balance,
    primary,
    pills,
    showPills: pickedRows.length > 1,
    activeSlotId,
    activeUuid: activeRow?.uuid ?? ''
  };
}

/**
 * Combobox context for a class roster row.
 * @param {{slotId: string, uuid: string}} slot Roster slot.
 * @param {number} idx Row index.
 * @param {Set<string>} [pickedUuids] Already-picked uuids.
 * @param {?string} [locked] Locked ruleset filter, or null.
 * @returns {object} Combobox context.
 */
function buildClassRosterCombo(slot, idx, pickedUuids = new Set(), locked = null) {
  const entries = (documentLoader.getEntries('class') ?? []).filter((d) => d.uuid === slot.uuid || allowedByRuleset(d, locked));
  const options = entries.map((d) => ({
    value: d.uuid,
    label: d.name,
    icon: d.img,
    description: shortDescription(d.system),
    disabled: pickedUuids.has(d.uuid) && d.uuid !== slot.uuid,
    ...buildIdentityTags(d, 'class')
  }));
  decoratePinnedOptions(options, 'class');
  return {
    id: `identity-class-${slot.slotId}-${idx}`,
    name: `identity.classes.${slot.slotId}.uuid`,
    value: slot.uuid,
    placeholder: _loc('HEROMANCER.App.Identity.PickPlaceholder'),
    searchable: true,
    options,
    pinning: buildPinningContext('class')
  };
}

/**
 * Prereq chip for a secondary class row failing the multiclass threshold.
 * @param {string} uuid Class uuid.
 * @param {?Object<string, number>} abilityScores Ability scores.
 * @returns {?{label: string, tooltip: string}} Chip or null when passing.
 */
function buildPrereqChip(uuid, abilityScores) {
  if (!uuid || !abilityScores) return null;
  const entry = documentLoader.getEntries('class').find((e) => e.uuid === uuid);
  if (!entry) return null;
  const result = checkMulticlassPrereq(entry, abilityScores);
  if (result.passes || !result.prereq) return null;
  return { label: formatPrereqChipLabel(result.failed, abilityScores), tooltip: formatPrereqLabel(result.prereq) };
}

/**
 * Compare assigned-vs-effective levels and produce a balance state with label.
 * @param {number} total Total assigned levels.
 * @param {number} effectiveLevel Effective character level.
 * @returns {{state: 'ok'|'short'|'over', label: string}} Balance state and label.
 */
function computeBalance(total, effectiveLevel) {
  if (total === effectiveLevel) return { state: 'ok', label: _loc('HEROMANCER.App.Identity.Multiclass.BalanceOk', { total, max: effectiveLevel }) };
  if (total < effectiveLevel) return { state: 'short', label: _loc('HEROMANCER.App.Identity.Multiclass.BalanceShort', { total, max: effectiveLevel, missing: effectiveLevel - total }) };
  return { state: 'over', label: _loc('HEROMANCER.App.Identity.Multiclass.BalanceOver', { total, max: effectiveLevel, over: total - effectiveLevel }) };
}

/**
 * Subclass sub-tab section: one combobox per qualifying class row.
 * @param {Array<{slotId: string, uuid: string, level: number, subclassUuid: string}>} roster Class roster.
 * @param {?string} [activeSubclassSlotId] Selected subclass slot.
 * @param {?string} [locked] Locked ruleset filter, or null.
 * @returns {object} Sub-tab context.
 */
function buildSubclassSection(roster, activeSubclassSlotId = null, locked = null) {
  const pickers = [];
  for (const slot of roster) {
    if (!slot.uuid) continue;
    const classEntry = documentLoader.getEntries('class').find((e) => e.uuid === slot.uuid);
    if (!classEntry) continue;
    const threshold = getSubclassThreshold(classEntry);
    if (!threshold || threshold > slot.level) continue;
    const options = getEligibleSubclasses(classEntry, locked);
    if (!options.length) continue;
    pickers.push({
      slotId: slot.slotId,
      className: classEntry.name,
      threshold,
      subclassUuid: slot.subclassUuid ?? '',
      combo: buildSubclassCombo(slot.subclassUuid ?? '', options, { id: `identity-subclass-${slot.slotId}`, name: `identity.classes.${slot.slotId}.subclassUuid` })
    });
  }
  const pickedSubclasses = pickers.filter((p) => p.subclassUuid);
  const activeSlotId = resolveActiveSlot(pickedSubclasses, activeSubclassSlotId);
  const pills = pickedSubclasses.map((p) => ({ slotId: p.slotId, label: lookupSelectionName(p.subclassUuid) ?? p.className, active: p.slotId === activeSlotId }));
  const activeRow = pickedSubclasses.find((p) => p.slotId === activeSlotId) ?? null;
  return {
    id: 'subclass',
    label: _loc('TYPES.Item.subclass'),
    icon: `fas ${SECTION_ICONS.subclass}`,
    subclassPickers: pickers,
    showPills: pickedSubclasses.length > 1,
    pills,
    activeSlotId,
    selectedLabel: joinSelectionNames(pickedSubclasses.map((p) => p.subclassUuid)),
    badge: pickers.length - pickedSubclasses.length,
    activeUuid: activeRow?.subclassUuid ?? ''
  };
}

/**
 * Subclass combobox context as a flat alphabetical list with source chips.
 * @param {string} [selected] Selected uuid.
 * @param {Array<object>} [options] Subclass options.
 * @param {object} [overrides] DOM identifier overrides.
 * @param {string} [overrides.id] Combobox id.
 * @param {string} [overrides.name] Form field name.
 * @returns {object} Combobox context.
 */
export function buildSubclassCombo(selected = '', options = [], { id = 'identity-subclass', name = 'identity.subclass' } = {}) {
  const byUuid = new Map(documentLoader.getEntries('subclass').map((e) => [e.uuid, e]));
  const flat = options
    .map((o) => ({ ...o, ...(byUuid.has(o.value) ? buildIdentityTags(byUuid.get(o.value), 'subclass') : { tags: [], keywords: [] }) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  decoratePinnedOptions(flat, 'subclass');
  return { id, name, value: selected, placeholder: _loc('HEROMANCER.App.Identity.SubclassPlaceholder'), searchable: true, options: flat, pinning: buildPinningContext('subclass') };
}

/**
 * Look up an identity doc's name across cached entry types.
 * @param {string} uuid Compendium uuid.
 * @returns {?string} Cached document name.
 */
export function lookupSelectionName(uuid) {
  if (!uuid) return null;
  const types = [...Object.values(SECTION_TO_TYPE), 'subclass'];
  for (const t of types) {
    const entries = documentLoader.getEntries(t);
    const found = entries.find((e) => e.uuid === uuid);
    if (found) return found.name;
  }
  return null;
}

/**
 * Join the resolved names of several selections into a ` / `-separated label.
 * @param {string[]} uuids Selection uuids.
 * @returns {string} Joined names, skipping unresolved uuids.
 */
function joinSelectionNames(uuids) {
  return uuids
    .map((uuid) => lookupSelectionName(uuid))
    .filter(Boolean)
    .join(' / ');
}

/**
 * Build the single-pick combobox context for a non-class identity sub-tab.
 * @param {string} sectionId Identity sub-tab id.
 * @param {string} type Foundry Item subtype.
 * @param {string} selected Selected uuid.
 * @param {?string} [locked] Locked ruleset filter, or null.
 * @returns {object} Combobox context.
 */
function buildSectionCombo(sectionId, type, selected, locked = null) {
  const entries = (documentLoader.getEntries(type) ?? []).filter((d) => d.uuid === selected || allowedByRuleset(d, locked));
  const options = entries.map((d) => ({ value: d.uuid, label: d.name, icon: d.img, description: shortDescription(d.system), ...buildIdentityTags(d, type) }));
  decoratePinnedOptions(options, sectionId);
  if (type === 'background' && !game.settings.get(MODULE.ID, MODULE.SETTINGS.DISABLE_CUSTOM_BACKGROUND))
    options.unshift({
      value: MODULE.CUSTOM_BACKGROUND_VALUE,
      label: _loc('HEROMANCER.App.Identity.CustomBackground.Option'),
      iconClass: 'fa-solid fa-wand-magic-sparkles',
      description: _loc('HEROMANCER.App.Identity.CustomBackground.OptionHint'),
      noPin: true
    });
  return {
    id: `identity-${sectionId}`,
    name: `identity.${sectionId}`,
    value: selected,
    placeholder: _loc('HEROMANCER.App.Identity.PickPlaceholder'),
    searchable: true,
    options,
    pinning: buildPinningContext(sectionId)
  };
}

/**
 * Build the combobox pinning sub-context for a category.
 * @param {string} category Pin category.
 * @returns {?object} Combobox pinning context.
 */
function buildPinningContext(category) {
  if (!compare.CATEGORIES.has(category)) return null;
  const count = compare.pinCount(category);
  return {
    enabled: true,
    category,
    count,
    canCompare: count >= 2,
    compareLabel: _loc('HEROMANCER.Compare.Open', { count }),
    pinTooltip: _loc('HEROMANCER.Compare.Pin'),
    unpinTooltip: _loc('HEROMANCER.Compare.Unpin')
  };
}

/**
 * Stamp each option with a `pinned` boolean from compare-store membership.
 * @param {Array<object>} options Flat combobox options.
 * @param {string} category Pin category.
 */
function decoratePinnedOptions(options, category) {
  if (!compare.CATEGORIES.has(category)) return;
  const pinned = new Set(compare.getPins(category));
  for (const opt of options) opt.pinned = pinned.has(opt.value);
}
