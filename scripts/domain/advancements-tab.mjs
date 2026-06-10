import { safeEnrichHTML, stripNoiseParenthetical } from '../utils/html-text.mjs';
import { buildAdvancementRows, expandNestedRows } from './advancement-chooser.mjs';
import { advancementFieldName } from './advancement-draft.mjs';

/**
 * Build the template context for the wizard's advancements tab.
 * @param {object} args Context-builder arguments.
 * @param {Array<{slotId:string, classDoc:?object, subclassDoc:?object, level:number, isPrimary:boolean}>} args.classRoster Per-class inputs
 * @param {number} args.effectiveLevel Total character level (creation) or new level (level_up).
 * @param {?Object<string, Object<number, object>>} [args.draft] Stored picks keyed by `[advancementId][level]`.
 * @param {'creation'|'level_up'} [args.mode] Render mode axis.
 * @param {?object} [args.actor] Target actor (level-up mode).
 * @param {?Object<string, number>} [args.abilityScores] Ability score map for ASI score display.
 * @param {?object} [args.speciesDoc] Full species Document; surfaces race-origin rows.
 * @param {?object} [args.backgroundDoc] Full background Document; surfaces background-origin rows.
 * @param {?number} [args.characterLevel] Character-level scope for race/background rows.
 * @param {?Object<string, string>} [args.equipmentTraitLinks] `{advId}.{level}.{slotIdx}` -> trait key, supplied by the equipment tab so matching Trait slots render locked + pre-filled.
 * @returns {object} Template context.
 */
export async function buildAdvancementsContext({
  classRoster = [],
  effectiveLevel,
  draft = {},
  mode = 'creation',
  actor = null,
  abilityScores = null,
  speciesDoc = null,
  backgroundDoc = null,
  characterLevel = null,
  equipmentTraitLinks = {}
} = {}) {
  if (!classRoster.length) return { className: null, effectiveLevel, mode, rows: [], groups: [], hasRows: false, remaining: 0 };
  const totalCharLevel = characterLevel ?? (classRoster.reduce((sum, s) => sum + (Number(s.level) || 0), 0) || effectiveLevel);
  let rows = [];
  for (let i = 0; i < classRoster.length; i++) {
    const slot = classRoster[i];
    if (!slot.classDoc) continue;
    const extras = i === 0 ? [speciesDoc && { doc: speciesDoc, origin: 'race' }, backgroundDoc && { doc: backgroundDoc, origin: 'background' }].filter(Boolean) : [];
    const slotRows = buildAdvancementRows(
      slot.classDoc,
      slot.level,
      { classDoc: slot.classDoc, subclassDoc: slot.subclassDoc, extraDocs: extras, characterLevel: totalCharLevel, draft: { advancements: draft }, isOriginalClass: slot.isPrimary !== false },
      mode
    );
    for (const row of slotRows) {
      row.classKey = slot.slotId;
      row.className = slot.classDoc.name ?? null;
      row.subclassName = slot.subclassDoc?.name ?? null;
      rows.push(row);
    }
  }
  rows = await expandNestedRows(rows, { draft, characterLevel: totalCharLevel });
  const draftPicks = collectDraftPicks(rows);
  const projected = await collectProjectedItems(rows, actor);
  const priorAsiBonus = {};
  for (const row of rows) {
    row.levelLabel = row.level > 0 ? _loc('DND5E.LevelNumber', { level: row.level }) : _loc('HEROMANCER.App.Advancements.MiscLabel');
    if (row.auto || !row.spec) {
      row.state = 'granted';
      row.displayTitle = foundry.utils.escapeHTML(row.title);
      row.tiles = buildAutoTiles(row);
      continue;
    }
    row.fieldName = advancementFieldName(row.advancementId, row.level);
    row.abilityScores = abilityScores;
    row.actor = actor;
    row.draftPicks = draftPicks;
    row.projected = projected;
    row.priorAsiBonus = priorAsiBonus;
    row.equipmentTraitLinks = equipmentTraitLinks;
    await decorateSpec(row);
    row.fieldValue = serializePick(row.spec);
    if (row.spec.kind === 'asi' && !row.spec.points) {
      row.auto = true;
      row.state = 'granted';
      row.displayTitle = foundry.utils.escapeHTML(row.title);
      row.tiles = buildPickTiles(row);
      for (const [k, v] of Object.entries(row.spec.fixed ?? {})) priorAsiBonus[k] = (priorAsiBonus[k] ?? 0) + (Number(v) || 0);
      continue;
    }
    if (specHasNoOptions(row.spec)) {
      row.auto = true;
      row.state = 'error';
      row.displayTitle = foundry.utils.escapeHTML(row.title);
      row.tiles = [advancementErrorTile(row)];
      continue;
    }
    row.requiredCount = requiredCountFor(row.spec);
    row.state = isRowDone(row.spec) ? 'done' : 'pending';
    row.error = row.state === 'pending' ? partialError(row.spec, row.requiredCount) : null;
    row.displayTitle = row.spec.kind === 'trait' && row.spec.grantedDisplay ? `${foundry.utils.escapeHTML(row.title)}: ${row.spec.grantedDisplay}` : foundry.utils.escapeHTML(row.title);
    row.tiles = buildPickTiles(row);
    const ribbonLabel =
      row.state === 'done'
        ? _loc('HEROMANCER.App.Advancements.Chip.done')
        : row.spec.kind === 'asi'
          ? _loc('HEROMANCER.App.Advancements.Chip.choose')
          : _loc('HEROMANCER.App.Advancements.Chip.choose-count', { count: row.requiredCount });
    for (const tile of row.tiles) if (tile.state === 'choice') tile.ribbonLabel = ribbonLabel;
    if (row.spec.kind === 'asi') {
      const add = (map) => {
        for (const [k, v] of Object.entries(map ?? {})) priorAsiBonus[k] = (priorAsiBonus[k] ?? 0) + (Number(v) || 0);
      };
      add(row.spec.fixed);
      if (row.spec.mode === 'asi') add(row.spec.assignments);
    }
  }
  const remaining = rows.filter((r) => r.state === 'pending').length;
  const groups = structureGroups(groupRowsByOrigin(rows, { roster: classRoster, speciesName: speciesDoc?.name ?? null, backgroundName: backgroundDoc?.name ?? null }));
  const primaryName = classRoster[0]?.classDoc?.name ?? null;
  return { className: primaryName, effectiveLevel, mode, rows, groups, hasRows: rows.length > 0, remaining };
}

/**
 * Tiles for an auto row: one tile per granted entry.
 * @param {object} row Row record.
 * @returns {Array<object>} Tile contexts.
 */
function buildAutoTiles(row) {
  const out = [];
  if (Array.isArray(row.grants) && row.grants.length) for (const g of row.grants) out.push(autoItemTile(row, g));
  return out;
}

/**
 * Tiles for a chooser row: per-kind atomization.
 * @param {object} row Row record post-decorate.
 * @returns {Array<object>} Tile contexts.
 */
function buildPickTiles(row) {
  const out = [];
  const spec = row.spec;
  if (spec.kind === 'item-choice') {
    if (spec.count > 0) out.push(itemChoiceTile(row));
    return out;
  }
  if (spec.kind === 'trait') {
    out.push(...buildTraitGrantedTiles(row));
    const lockedSlots = (spec.slots ?? []).filter((s) => s.locked);
    for (const slot of lockedSlots) out.push(traitSlotTile(row, slot));
    const lockedCount = lockedSlots.length;
    if (spec.count - lockedCount > 0) out.push(traitChoiceTile(row, lockedCount));
    return out;
  }
  if (spec.kind === 'asi') {
    if (!spec.points) {
      const tile = asiFixedTile(row);
      if (tile) out.push(tile);
      return out;
    }
    out.push(asiTile(row));
    return out;
  }
  return out;
}

/**
 * Whether a decorated chooser spec requires picks but exposes no selectable options — a misconfigured advancement (e.g. an empty or all-broken item pool). Such rows render an error tile and never block creation.
 * @param {object} spec Chooser spec post-decorate.
 * @returns {boolean} True when the row is unsatisfiable.
 */
function specHasNoOptions(spec) {
  if (spec.kind === 'item-choice') return !spec.open && spec.count > 0 && (spec.slots ?? []).every((slot) => !slot.combo.options.length);
  if (spec.kind === 'trait') return spec.count > 0 && !(spec.fullOptions ?? []).length;
  return false;
}

/**
 * Build a non-interactive error tile for an advancement that offers no valid options.
 * @param {object} row Parent row.
 * @returns {object} Tile context.
 */
function advancementErrorTile(row) {
  return {
    key: `${row.advancementId}-${row.level}-error`,
    foot: { label: foundry.utils.escapeHTML(row.title), kind: 'error' },
    state: 'error',
    label: _loc('HEROMANCER.App.Advancements.NoOptions'),
    icon: row.icon,
    isError: true
  };
}

/**
 * Build one granted-style tile combining all fixed ASI bonuses.
 * @param {object} row Parent row.
 * @returns {?object} Tile context, or null when no nonzero bonuses.
 */
function asiFixedTile(row) {
  const parts = [];
  let firstKey = null;
  for (const [key, val] of Object.entries(row.spec.fixed ?? {})) {
    const value = Number(val);
    if (!value) continue;
    firstKey ??= key;
    const label = _loc(CONFIG.DND5E.abilities[key]?.label ?? key);
    parts.push(`${label} ${value >= 0 ? '+' : ''}${value}`);
  }
  if (!parts.length) return null;
  return {
    key: `${row.advancementId}-${row.level}-asi-fixed`,
    foot: { label: _loc('HEROMANCER.App.Advancements.Ribbon.ability'), kind: 'ability' },
    state: 'granted',
    label: parts.join(', '),
    icon: row.icon,
    uuid: parts.length === 1 ? (CONFIG.DND5E.abilities[firstKey]?.reference ?? null) : null,
    selected: true
  };
}

/**
 * Build an auto-grant tile for an ItemGrant entry.
 * @param {object} row Parent row.
 * @param {{uuid:string, name:string, img:?string}} g Resolved grant entry.
 * @returns {object} Tile context.
 */
function autoItemTile(row, g) {
  const kind = g.type === 'feat' ? (g.featureValue === 'feat' ? 'feat' : 'feature') : g.type || 'feature';
  return {
    key: `${row.advancementId}-${row.level}-grant-${g.uuid}`,
    foot: { label: g.typeLabel || _loc('HEROMANCER.App.Advancements.Ribbon.feature'), kind },
    state: 'granted',
    label: stripNoiseParenthetical(g.name),
    icon: g.img,
    uuid: g.uuid,
    selected: true
  };
}

/**
 * Build an ItemChoice tile: an inline picker for a fixed pool, or a CompendiumBrowser browse trigger for an open choice.
 * @param {object} row Parent row.
 * @returns {object} Tile context.
 */
function itemChoiceTile(row) {
  const spec = row.spec;
  const allOptions = spec.pool.map(poolOption).filter(Boolean);
  const ownSelected = new Set(spec.selected ?? []);
  const externalItems = new Set([...(row.draftPicks?.itemUuids ?? [])].filter((uuid) => !ownSelected.has(uuid)));
  const pickerOptions = allOptions.filter((o) => ownSelected.has(o.value) || !externalItems.has(o.value));
  const selected = (spec.selected ?? []).filter(Boolean);
  const pickedOpts = spec.open ? selected.map((uuid) => poolOption(uuid)).filter(Boolean) : selected.map((v) => allOptions.find((o) => o.value === v)).filter(Boolean);
  const inputName = `adv-combo.${row.advancementId}.${row.level}`;
  const sampleType = pickedOpts[0] ? fromUuidSync(pickedOpts[0].value)?.type : null;
  const tile = {
    key: `${row.advancementId}-${row.level}-pick`,
    foot: { label: row.title || _loc('HEROMANCER.App.Advancements.Ribbon.pick'), kind: sampleType || 'pick' },
    state: 'choice',
    label: pickedOpts.length
      ? [...pickedOpts]
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((o) => o.label)
          .join(', ')
      : _loc('HEROMANCER.App.Advancements.ChooseCount', { count: spec.count }),
    icon: pickedOpts[0]?.icon ?? row.icon,
    uuid: pickedOpts[0]?.value ?? null,
    selected: pickedOpts.length > 0,
    isPlaceholder: !pickedOpts.length,
    inputName,
    inputValue: selected.join(',')
  };
  if (spec.open) {
    tile.browseDone = selected.length >= spec.count;
    tile.browse = JSON.stringify({
      name: inputName,
      max: spec.count,
      type: spec.restrictionType,
      category: spec.restrictionCategory,
      subtype: spec.restrictionSubtype,
      level: spec.restrictionLevel,
      list: spec.restrictionList,
      maxSpellLevel: spec.maxSpellLevel
    });
  } else {
    tile.picker = {
      name: inputName,
      label: row.title || _loc('HEROMANCER.App.Advancements.ChoosePrompt'),
      max: spec.count,
      optionsJson: JSON.stringify(pickerOptions.map((o) => ({ value: o.value, label: o.label, icon: o.icon ?? null })))
    };
  }
  return tile;
}

/**
 * Build auto-granted trait tiles, one per granted key so each carries its own rule reference for linking.
 * @param {object} row Parent row.
 * @returns {object[]} One tile per granted trait key.
 */
function buildTraitGrantedTiles(row) {
  const tiles = [];
  for (const g of row.spec.granted ?? []) {
    const kind = ribbonForTraitKey(g.key)?.kind ?? 'pick';
    tiles.push({
      key: `${row.advancementId}-${row.level}-trait-grant-${g.key}`,
      foot: traitGrantFoot(kind, ribbonForLevel(row.level), row.spec.mode),
      state: 'granted',
      label: g.label,
      icon: row.icon,
      uuid: traitReference(g.key),
      selected: true
    });
  }
  return tiles;
}

/** @type {Object<string,string>} dnd5e trait-key prefix → our ribbon kind. */
const TRAIT_KIND = {
  skills: 'skill',
  languages: 'language',
  saves: 'save',
  abilities: 'ability',
  tool: 'tool',
  weapon: 'weapon',
  armor: 'armor',
  ci: 'immunity',
  di: 'immunity',
  dr: 'resist',
  dv: 'vuln',
  da: 'absorb'
};

/** @type {?Set<string>} Memoized result of `proficiencyKinds()`. */
let proficiencyKindCache = null;

/**
 * Ribbon kinds whose footer reads "<X> Proficiency".
 * @returns {Set<string>} Proficiency ribbon kinds.
 */
function proficiencyKinds() {
  proficiencyKindCache ??= new Set(
    Object.entries(CONFIG.DND5E.traits ?? {})
      .filter(([, cfg]) => cfg.actorKeyPath)
      .map(([key]) => TRAIT_KIND[key])
      .filter(Boolean)
  );
  return proficiencyKindCache;
}

/**
 * Footer descriptor for a granted/chosen trait. Non-default modes read "<Trait> <Mode>" (e.g. "Weapon Mastery"); default-mode proficiency kinds read "... Proficiency".
 * @param {string} kind Trait ribbon kind.
 * @param {{label:string, kind:string}} fallback Descriptor used when the kind is unrecognized.
 * @param {string} [mode] Trait advancement mode.
 * @returns {{label:string, kind:string}} Footer descriptor.
 */
function traitGrantFoot(kind, fallback, mode = 'default') {
  if (!kind || kind === 'pick') return fallback;
  const modeCfg = mode && mode !== 'default' ? CONFIG.DND5E.traitModes[mode] : null;
  if (modeCfg) return { label: `${_loc(`HEROMANCER.App.Advancements.Ribbon.${kind}`)} ${_loc(modeCfg.label)}`, kind };
  if (proficiencyKinds().has(kind)) return { label: _loc(`HEROMANCER.App.Advancements.RibbonProf.${kind}`), kind };
  return { label: _loc(`HEROMANCER.App.Advancements.Ribbon.${kind}`), kind };
}

/**
 * Build a picker-trigger tile for a Trait slot (skill/language/etc. picker).
 * @param {object} row Parent row.
 * @param {object} slot Decorated trait slot.
 * @returns {object} Tile context.
 */
function traitSlotTile(row, slot) {
  return {
    key: `${row.advancementId}-${row.level}-trait-locked-${slot.idx}`,
    foot: traitGrantFoot(ribbonForTraitKey(slot.value)?.kind ?? 'pick', ribbonForLevel(row.level), row.spec.mode),
    state: 'granted',
    label: slot.lockedLabel,
    icon: row.icon,
    uuid: traitReference(slot.value),
    selected: true,
    inputName: slot.name,
    inputValue: slot.value
  };
}

/**
 * Build a single multi-pick tile for a Trait advancement's choices group.
 * @param {object} row Parent row.
 * @param {number} lockedCount Number of slots already filled by equipment-tab locks.
 * @returns {object} Tile context.
 */
function traitChoiceTile(row, lockedCount) {
  const spec = row.spec;
  const flatOptions = (spec.fullOptions ?? []).map((o) => ({ value: o.value, label: o.label, group: o.group ?? null, uuid: traitReference(o.value), disabled: !!o.disabled }));
  const chosen = (spec.chosen ?? []).filter((v, i) => v && !spec.slots?.[i]?.locked);
  const { keyLabel } = dnd5e.documents.Trait;
  const labels = chosen.map((k) => keyLabel(k) ?? k).sort((a, b) => a.localeCompare(b));
  const max = Math.max(0, spec.count - lockedCount);
  const inputName = `adv-trait.${row.advancementId}.${row.level}`;
  return {
    key: `${row.advancementId}-${row.level}-trait-pick`,
    foot: traitGrantFoot(ribbonForTraitKey(spec.pool?.[0] ?? chosen[0])?.kind ?? 'pick', { label: _loc('HEROMANCER.App.Advancements.Ribbon.pick'), kind: 'pick' }, spec.mode),
    state: 'choice',
    label: labels.length ? labels.join(', ') : _loc('HEROMANCER.App.Advancements.ChooseCount', { count: max }),
    icon: row.icon,
    uuid: chosen[0] ? traitReference(chosen[0]) : null,
    selected: labels.length > 0,
    isPlaceholder: !labels.length,
    inputName,
    inputValue: chosen.join(','),
    picker: {
      name: inputName,
      label: row.title || _loc('HEROMANCER.App.Advancements.ChoosePrompt'),
      max,
      optionsJson: JSON.stringify(flatOptions.filter((o) => !o.disabled).map((o) => ({ value: o.value, label: o.label, group: o.group, uuid: o.uuid })))
    }
  };
}

/**
 * Build the ASI tile: ASI/Feat mode toggle, a committed summary, and the `asiPayload` the mode dialogs read.
 * @param {object} row Parent row.
 * @returns {object} Tile context.
 */
function asiTile(row) {
  const baseScores = {};
  for (const key of Object.keys(CONFIG.DND5E.abilities)) baseScores[key] = (Number(row.abilityScores?.[key]) || 0) + (Number(row.priorAsiBonus?.[key]) || 0);
  const spec = row.spec;
  const hasAssignments = spec.mode === 'asi' && Object.values(spec.assignments ?? {}).some((v) => Number(v) > 0);
  const hasFeat = spec.mode === 'feat' && spec.feat;
  const committed = hasAssignments || hasFeat;
  let summary = '';
  let icon = row.icon;
  if (hasAssignments) {
    const parts = [];
    for (const [key, value] of Object.entries(spec.assignments ?? {})) {
      const n = Number(value);
      if (!n) continue;
      const label = _loc(CONFIG.DND5E.abilities[key]?.label ?? key);
      parts.push(`${label} ${n >= 0 ? '+' : ''}${n}`);
    }
    summary = parts.join(', ');
  } else if (hasFeat) {
    summary = spec.featOption?.name ?? '';
    if (spec.featOption?.img) icon = spec.featOption.img;
  }
  return {
    key: `${row.advancementId}-${row.level}-asi`,
    foot: {
      label: row.source
        ? `${_loc('HEROMANCER.App.Advancements.ASIFootOnlyLabel')} - ${row.source}`
        : _loc(spec.allowFeat ? 'HEROMANCER.App.Advancements.ASIFootLabel' : 'HEROMANCER.App.Advancements.ASIFootOnlyLabel'),
      kind: 'asi'
    },
    state: 'choice',
    label: summary,
    icon,
    selected: committed,
    isAsiTile: true,
    asiCommitted: committed,
    allowFeat: spec.allowFeat,
    asiMode: spec.mode,
    featUuid: hasFeat ? spec.feat : null,
    asiPayload: JSON.stringify({
      spec: {
        assignments: spec.assignments ?? {},
        fixed: spec.fixed ?? {},
        locked: Array.from(spec.locked ?? []),
        points: spec.points ?? 0,
        cap: spec.cap ?? 2,
        mode: spec.mode,
        feat: spec.feat ?? null
      },
      baseScores
    })
  };
}

/**
 * Classify a trait key into a ribbon label + CSS kind. Returns null when the prefix isn't recognized.
 * @param {?string} key Trait key (e.g. `skills:ins`, `languages:fre`).
 * @returns {?{label:string, kind:string}} Ribbon descriptor.
 */
function ribbonForTraitKey(key) {
  if (!key) return null;
  const kind = TRAIT_KIND[key.split(':')[0]];
  if (!kind) return null;
  return { label: _loc(`HEROMANCER.App.Advancements.Ribbon.${kind}`), kind };
}

/**
 * Ribbon fallback for level-based classification.
 * @param {number} level Advancement level.
 * @returns {{label:string, kind:string}} Ribbon descriptor.
 */
function ribbonForLevel(level) {
  if (level > 0) return { label: _loc('DND5E.LevelNumber', { level }), kind: 'level' };
  return { label: _loc('HEROMANCER.App.Advancements.MiscLabel'), kind: 'misc' };
}

/**
 * Resolve a trait key to its CONFIG rule reference UUID.
 * @param {string} key Trait key (e.g. `skills:ins`).
 * @returns {?string} Reference UUID or null.
 */
function traitReference(key) {
  if (!key) return null;
  const [trait, sub] = key.split(':');
  if (trait === 'skills') return CONFIG.DND5E.skills?.[sub]?.reference ?? null;
  if (trait === 'abilities' || trait === 'saves') return CONFIG.DND5E.abilities?.[sub]?.reference ?? null;
  return null;
}

/**
 * Bucket rows into per-origin fieldset groups. Race + background each get one group; class+subclass rows split per-roster-slot when multiclass.
 * @param {Array<object>} rows Built advancement rows (each carries `origin` and `classKey`).
 * @param {{roster: Array<object>, speciesName: ?string, backgroundName: ?string}} ctx Per-origin display names + roster.
 * @returns {Array<{id: string, legend: string, rows: Array<object>}>} Non-empty groups in display order.
 */
function groupRowsByOrigin(rows, { roster, speciesName, backgroundName }) {
  const buckets = { race: [], background: [] };
  const classBuckets = new Map();
  for (const slot of roster) classBuckets.set(slot.slotId, { slot, rows: [] });
  for (const row of rows) {
    if (row.origin === 'race' || row.origin === 'background') buckets[row.origin].push(row);
    else if (row.classKey && classBuckets.has(row.classKey)) classBuckets.get(row.classKey).rows.push(row);
  }
  const typeLabel = (key) => _loc(CONFIG.Item.typeLabels[key]);
  const groups = [];
  if (buckets.background.length) groups.push({ id: 'background', legend: backgroundName ?? typeLabel('background'), rows: sortRowsByLevel(buckets.background) });
  if (buckets.race.length) groups.push({ id: 'race', legend: speciesName ?? typeLabel('race'), rows: sortRowsByLevel(buckets.race) });
  const isMulticlass = classBuckets.size > 1;
  for (const [slotId, bucket] of classBuckets) {
    if (!bucket.rows.length) continue;
    const className = bucket.slot.classDoc?.name ?? typeLabel('class');
    const legend = isMulticlass ? _loc('HEROMANCER.App.Advancements.ClassLegend', { className, level: bucket.slot.level }) : className;
    groups.push({ id: `class-${slotId}`, legend, rows: sortRowsByLevel(bucket.rows) });
  }
  return groups;
}

/**
 * Stable-sort rows by level ascending, preserving original order within a level.
 * @param {Array<object>} rows Rows from a single origin bucket.
 * @returns {Array<object>} Sorted rows.
 */
function sortRowsByLevel(rows) {
  return rows
    .map((row, idx) => ({ row, idx }))
    .sort((a, b) => (Number(a.row.displayLevel ?? a.row.level) || 0) - (Number(b.row.displayLevel ?? b.row.level) || 0) || a.idx - b.idx)
    .map((entry) => entry.row);
}

/** @type {Object<string,string>} Granted-tile foot kind → display bucket key. */
const GRANTED_BUCKET = {
  language: 'language',
  skill: 'skill',
  tool: 'tool',
  weapon: 'weapon-armor',
  armor: 'weapon-armor',
  save: 'save',
  feat: 'feat',
  feature: 'feature',
  spell: 'spell'
};

/** @type {string[]} Granted-bucket render order. */
const GRANTED_BUCKET_ORDER = ['language', 'skill', 'tool', 'weapon-armor', 'save', 'feat', 'feature', 'spell', 'other'];

/**
 * Restructure origin groups into scannable Granted lists + interactive Choose rows. Class groups split into per-level blocks; race/background stay single-block.
 * @param {Array<{id:string, legend:string, rows:Array<object>}>} groups Origin groups from `groupRowsByOrigin`.
 * @returns {Array<{id:string, legend:string, blocks:Array<object>}>} Structured groups.
 */
function structureGroups(groups) {
  return groups.map((group) => {
    if (!group.id.startsWith('class-')) return { id: group.id, legend: group.legend, blocks: [buildBlock(group.rows, null)] };
    const byLevel = new Map();
    for (const row of group.rows) {
      const level = Number(row.displayLevel ?? row.level) || 0;
      if (!byLevel.has(level)) byLevel.set(level, []);
      byLevel.get(level).push(row);
    }
    const blocks = [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([level, levelRows]) => buildBlock(levelRows, level));
    return { id: group.id, legend: group.legend, blocks };
  });
}

/**
 * Build one block: a read-only Granted list (display grants, bucketed) plus the interactive Choose rows. Display-only granted tiles move to the list; choice tiles and input-bearing tiles stay in their row so the chooser wiring is intact.
 * @param {Array<object>} rows Rows in this block.
 * @param {?number} level Block level for class blocks; null for race/background.
 * @returns {{level:?number, levelLabel:?string, granted:Array<object>, choiceRows:Array<object>, hasContent:boolean}} Block.
 */
function buildBlock(rows, level) {
  const grantedTiles = [];
  const choiceRows = [];
  for (const row of rows) {
    const visibleTiles = [];
    for (const tile of row.tiles ?? []) {
      if (tile.state === 'granted' && !tile.inputName) grantedTiles.push(tile);
      else visibleTiles.push(tile);
    }
    if (visibleTiles.length) choiceRows.push({ ...row, visibleTiles });
  }
  const granted = buildGrantedList(grantedTiles);
  return { level, levelLabel: level !== null ? (rows[0]?.levelLabel ?? null) : null, granted, choiceRows, hasContent: granted.length > 0 || choiceRows.length > 0 };
}

/**
 * Bucket display-granted tiles into ordered, labeled groups for the read-only list.
 * @param {Array<object>} tiles Display-only granted tiles.
 * @returns {Array<{key:string, label:string, items:Array<{label:string, uuid:?string}>}>} Non-empty buckets in order.
 */
function buildGrantedList(tiles) {
  const buckets = new Map();
  for (const tile of tiles) {
    const key = GRANTED_BUCKET[tile.foot?.kind] ?? 'other';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ label: tile.label, uuid: tile.uuid ?? null });
  }
  const out = [];
  for (const key of GRANTED_BUCKET_ORDER) {
    const items = buckets.get(key);
    if (items?.length) out.push({ key, label: _loc(`HEROMANCER.App.Advancements.GrantedBucket.${key}`), items: items.sort((a, b) => a.label.localeCompare(b.label)) });
  }
  return out;
}

/**
 * Required-pick count for a chooser spec, stamped on the row for validation.
 * @param {object} spec Chooser spec.
 * @returns {number} Expected pick count.
 */
function requiredCountFor(spec) {
  switch (spec.kind) {
    case 'item-choice':
      return spec.count;
    case 'trait':
      return spec.count;
    case 'asi':
      return spec.mode === 'feat' ? 1 : spec.points;
    default:
      return 0;
  }
}

/**
 * Detect a partially-completed pick — user started but didn't finish (1 of N slots, half the points, etc.).
 * @param {object} spec Chooser spec post-decorate.
 * @param {number} required Required pick count.
 * @returns {?{filled:number, required:number, label:string, tooltip:string}} Error descriptor, or null when untouched/complete.
 */
function partialError(spec, required) {
  const filled = filledCount(spec);
  if (!filled || filled >= required) return null;
  return { filled, required, label: _loc('HEROMANCER.App.Advancements.Chip.partial', { filled, required }), tooltip: _loc('HEROMANCER.App.Advancements.Chip.partial-tooltip') };
}

/**
 * Count picks made for a chooser spec, regardless of completeness.
 * @param {object} spec Chooser spec post-decorate.
 * @returns {number} Picks made (slots filled / boxes checked / points spent / 0|1 for subclass).
 */
function filledCount(spec) {
  switch (spec.kind) {
    case 'item-choice':
      return spec.selected.filter(Boolean).length;
    case 'trait':
      return spec.chosen.length;
    case 'asi':
      if (spec.mode !== 'asi') return 0;
      return Object.values(spec.assignments).reduce((s, v) => s + (Number(v) || 0), 0);
    default:
      return 0;
  }
}

/**
 * Whether a chooser spec's current state satisfies the advancement.
 * @param {object} spec Chooser spec post-decorate.
 * @returns {boolean} True when no further picks needed.
 */
function isRowDone(spec) {
  switch (spec.kind) {
    case 'item-choice':
      return spec.selected.length === spec.count && spec.selected.every(Boolean);
    case 'trait':
      return spec.chosen.length === spec.count;
    case 'asi':
      if (spec.mode === 'asi') return spec.remaining === 0;
      if (spec.mode === 'feat') return Boolean(spec.feat);
      return false;
    default:
      return false;
  }
}

/**
 * Drop ItemChoice pool entries failing a level, required-item, or non-repeatable prerequisite, evaluated against the projected post-apply item set. Unresolved entries are kept.
 * @param {object} row Row record with `spec.kind === 'item-choice'`.
 * @returns {Promise<void>}
 */
async function filterItemChoicePool(row) {
  const spec = row.spec;
  if (!spec.pool?.length) return;
  const { identifiers, owned } = row.projected ?? { identifiers: new Set(), owned: new Set() };
  const docs = await Promise.all(spec.pool.map((uuid) => fromUuid(uuid)));
  const indexByUuid = new Map(spec.pool.map((uuid, i) => [uuid, i]));
  const meets = (i) => {
    const pre = docs[i]?.system?.prerequisites;
    if (!pre) return true;
    if (Number.isFinite(Number(pre.level)) && Number(pre.level) > row.level) return false;
    return !(pre.items?.size && ![...pre.items].some((id) => identifiers.has(leafIdentifier(id))));
  };
  const kept = new Set((spec.selected ?? []).filter((uuid) => !indexByUuid.has(uuid) || meets(indexByUuid.get(uuid))));
  spec.selected = [...kept];
  spec.pool = spec.pool.filter((uuid, i) => {
    if (kept.has(uuid)) return true;
    if (!meets(i)) return false;
    const pre = docs[i]?.system?.prerequisites;
    return !(pre && !pre.repeatable && owned.has(uuid));
  });
}

/**
 * Identifiers the character has or will gain (actor items + advancement grants/picks), plus owned uuids for the repeatable check.
 * @param {Array<object>} rows Built advancement rows.
 * @param {?object} actor Level-up actor, or null at creation.
 * @returns {Promise<{identifiers: Set<string>, owned: Set<string>}>} Projected sets.
 */
async function collectProjectedItems(rows, actor) {
  const uuids = new Set();
  for (const row of rows) {
    if (row.type === 'ItemGrant') for (const g of row.grants ?? []) if (g.uuid) uuids.add(g.uuid);
    if (row.spec?.kind === 'item-choice') for (const u of row.spec.selected ?? []) if (u) uuids.add(u);
  }
  const identifiers = new Set();
  const owned = new Set(uuids);
  for (const item of actor?.items ?? []) {
    if (item.identifier) identifiers.add(item.identifier);
    const src = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
    if (src) owned.add(src);
  }
  for (const doc of await Promise.all([...uuids].map((u) => fromUuid(u)))) if (doc?.identifier) identifiers.add(doc.identifier);
  return { identifiers, owned };
}

/**
 * Strip an optional `type:` prefix from a dnd5e identifier.
 * @param {string} id Identifier, optionally `type:leaf`.
 * @returns {string} Leaf identifier.
 */
function leafIdentifier(id) {
  return typeof id === 'string' && id.includes(':') ? id.slice(id.lastIndexOf(':') + 1) : id;
}

/**
 * Dispatch to the per-kind decorator that augments `row.spec` with template-ready view data.
 * @param {object} row Row record from `buildAdvancementRows`.
 * @returns {Promise<void>}
 */
async function decorateSpec(row) {
  switch (row.spec.kind) {
    case 'item-choice':
      await filterItemChoicePool(row);
      row.spec.slots = buildItemChoiceSlots(row);
      break;
    case 'trait':
      await decorateTraitSpec(row);
      break;
    case 'asi':
      decorateAsiSpec(row);
      break;
  }
}

/**
 * Build per-slot combobox contexts for an ItemChoice row, filtering each slot's pool against sibling picks when uniqueness is required.
 * @param {object} row Row record from `buildAdvancementRows` with `spec.kind === 'item-choice'`.
 * @returns {Array<{idx:number, combo:object}>} One slot per `spec.count`.
 */
function buildItemChoiceSlots(row) {
  const spec = row.spec;
  const allOptions = spec.pool.map(poolOption).filter(Boolean);
  const ownSelected = new Set(spec.selected ?? []);
  const externalItems = new Set([...(row.draftPicks?.itemUuids ?? [])].filter((uuid) => !ownSelected.has(uuid)));
  const slots = [];
  const count = Math.max(0, spec.count);
  for (let i = 0; i < count; i++) {
    const selected = spec.selected[i] ?? '';
    const exclude = new Set([...externalItems, ...spec.selected.filter((v, j) => v && j !== i)]);
    const options = allOptions.filter((o) => o.value === selected || !exclude.has(o.value));
    slots.push({
      idx: i,
      displayIdx: i + 1,
      combo: {
        id: `adv-item-${row.advancementId}-${row.level}-${i}`,
        name: `adv-combo.${row.advancementId}.${row.level}.${i}`,
        value: selected,
        placeholder: _loc('HEROMANCER.App.Advancements.ItemChoicePlaceholder'),
        searchable: true,
        options
      }
    });
  }
  return slots;
}

/**
 * Map guaranteed trait grants to the canonical full keys present in the expanded pool.
 * @param {Set<string>} grants Raw grant keys.
 * @param {Set<string>} poolKeys Full leaf keys from the expanded choice pool.
 * @returns {Set<string>} Grant keys normalized to pool keys (raw key kept when nothing matches).
 */
function expandGrantsToPoolKeys(grants, poolKeys) {
  const out = new Set();
  for (const grant of grants) {
    if (poolKeys.has(grant)) {
      out.add(grant);
      continue;
    }
    const grantParts = grant.split(':');
    const trait = grantParts[0];
    const leaf = grantParts[grantParts.length - 1];
    let matched = false;
    for (const key of poolKeys) {
      const keyParts = key.split(':');
      if (keyParts[0] === trait && keyParts[keyParts.length - 1] === leaf) {
        out.add(key);
        matched = true;
      }
    }
    if (!matched) out.add(grant);
  }
  return out;
}

/**
 * Decorate a Trait spec with per-slot grouped dropdowns.
 * @param {object} row Row record with `spec.kind === 'trait'`.
 * @returns {Promise<void>}
 */
async function decorateTraitSpec(row) {
  const spec = row.spec;
  const { keyLabel, mixedChoices } = dnd5e.documents.Trait;
  const grantedSet = new Set(spec.granted);
  const chosenList = [...spec.chosen];
  const lockedSlots = new Set();
  const links = row.equipmentTraitLinks ?? {};
  spec.count = Math.max(0, spec.count);
  for (let i = 0; i < spec.count; i++) {
    const linkVal = links[`${row.advancementId}.${row.level}.${i}`];
    if (linkVal) {
      chosenList[i] = linkVal;
      lockedSlots.add(i);
    }
  }
  spec.lockedSlots = lockedSlots;
  spec.granted = [...grantedSet].map((k) => ({ key: k, label: keyLabel(k) ?? k }));
  spec.fieldName = `adv-trait.${row.advancementId}.${row.level}`;
  const poolSet = new Set(spec.pool);
  const baseChoices = poolSet.size ? await mixedChoices(poolSet) : null;
  let excludeKeys = grantedSet;
  if (baseChoices) {
    excludeKeys = expandGrantsToPoolKeys(grantedSet, baseChoices.asSet());
    const ownKeys = new Set([...excludeKeys, ...chosenList].filter(Boolean));
    const byMode = row.draftPicks?.traitByMode ?? {};
    const sameModeExternal = new Set([...(byMode[spec.mode] ?? [])].filter((k) => !ownKeys.has(k)));
    const draftProficient = new Set([...(byMode.default ?? [])].filter((k) => !ownKeys.has(k)));
    if (sameModeExternal.size) baseChoices.exclude(sameModeExternal);
    if (row.actor) await restrictByActorProficiency(baseChoices, spec.mode, row.actor, draftProficient);
  }
  const slots = [];
  for (let i = 0; i < spec.count; i++) {
    let value = chosenList[i] ?? '';
    let locked = lockedSlots.has(i);
    const siblingPicks = new Set(chosenList.filter((v, j) => v && j !== i));
    let opts = baseChoices?.clone() ?? null;
    if (opts) opts.exclude(new Set([...excludeKeys, ...siblingPicks]));
    const flatOptions = opts ? opts.asOptions() : [];
    if (!locked && flatOptions.length === 1) {
      value = flatOptions[0].value;
      chosenList[i] = value;
      locked = true;
      lockedSlots.add(i);
    }
    for (const o of flatOptions) o.selected = o.value === value;
    slots.push({
      idx: i,
      displayIdx: i + 1,
      value,
      name: `adv-trait.${row.advancementId}.${row.level}.${i}`,
      groups: groupAsOptions(flatOptions),
      locked,
      lockedLabel: locked ? (keyLabel(value) ?? value) : null
    });
  }
  spec.slots = slots;
  spec.chosen = chosenList;
  spec.remaining = Math.max(0, spec.count - chosenList.filter(Boolean).length);
  if (baseChoices) {
    const fullPool = baseChoices.clone();
    fullPool.exclude(new Set([...excludeKeys]));
    spec.fullOptions = fullPool.asOptions();
  } else {
    spec.fullOptions = [];
  }
  if (spec.granted.length) {
    const enriched = await Promise.all(spec.granted.map((g) => enrichTraitKeyLabel(g.key, g.label)));
    spec.grantedDisplay = joinOxford(enriched);
  }
}

/**
 * Build a content-link anchor for a trait key when CONFIG has a rule reference.
 * @param {string} key Trait key.
 * @param {string} label Display label.
 * @returns {Promise<string>} Enriched HTML (single anchor) or escaped plain label.
 */
async function enrichTraitKeyLabel(key, label) {
  const [trait, sub] = key.split(':');
  let ref = null;
  if (trait === 'skills') ref = CONFIG.DND5E.skills?.[sub]?.reference;
  else if (trait === 'abilities' || trait === 'saves') ref = CONFIG.DND5E.abilities?.[sub]?.reference;
  if (!ref) return foundry.utils.escapeHTML(label);
  return safeEnrichHTML(`@UUID[${ref}]{${label}}`, undefined, foundry.utils.escapeHTML(label));
}

/**
 * Restrict a Trait `SelectChoices` tree to keys the actor qualifies for under the advancement mode.
 * @param {object} choices SelectChoices instance to mutate in place.
 * @param {string} mode Trait advancement mode.
 * @param {object} actor Target actor.
 * @param {?Set<string>} [draftProficient] Trait keys granted/chosen by sibling Trait rows in the current draft, treated as proficient even before submit applies them.
 * @returns {Promise<void>}
 */
async function restrictByActorProficiency(choices, mode, actor, draftProficient = null) {
  const { actorValues } = dnd5e.documents.Trait;
  const keys = [...choices.asSet()];
  const valuesByTrait = new Map();
  const eligible = new Set();
  for (const key of keys) {
    const trait = key.split(':')[0];
    if (!valuesByTrait.has(trait)) valuesByTrait.set(trait, await actorValues(actor, trait));
    const actorValue = valuesByTrait.get(trait)[key] ?? 0;
    const draftValue = draftProficient?.has(key) ? 1 : 0;
    const value = Math.max(actorValue, draftValue);
    if (mode === 'expertise' && value === 1) eligible.add(key);
    else if (mode === 'upgrade' && value < 2) eligible.add(key);
    else if (mode === 'mastery') {
      const category = key.split(':').slice(0, -1).join(':');
      const categoryProficient = (valuesByTrait.get(trait)[category] ?? 0) >= 1;
      if (actorValue !== 2 && (value === 1 || categoryProficient)) eligible.add(key);
    } else if (mode === 'forcedExpertise' && value === 1) eligible.add(key);
    else if (mode === 'default' && value === 0) eligible.add(key);
  }
  choices.filter(eligible);
}

/**
 * Collect every pick across the advancement context so sibling choices can dedupe: trait keys grouped by mode (a weapon can't be mastered twice; a proficiency can't be taken twice), and chosen ItemChoice uuids (a feat/fighting style can't be picked twice).
 * @param {Array<{spec:?object}>} rows Built advancement rows.
 * @returns {{traitByMode: Object<string, Set<string>>, itemUuids: Set<string>}} Picks indexed for dedup.
 */
function collectDraftPicks(rows) {
  const traitByMode = {};
  const itemUuids = new Set();
  for (const row of rows) {
    if (row.spec?.kind === 'trait') {
      const set = (traitByMode[row.spec.mode ?? 'default'] ??= new Set());
      for (const key of row.spec.granted ?? []) if (key) set.add(key);
      for (const key of row.spec.chosen ?? []) if (key) set.add(key);
    } else if (row.spec?.kind === 'item-choice') {
      for (const uuid of row.spec.selected ?? []) if (uuid) itemUuids.add(uuid);
    }
  }
  return { traitByMode, itemUuids };
}

/**
 * Join a list with Oxford-comma rules: `A`, `A & B`, `A, B, & C`.
 * @param {string[]} items Display strings.
 * @returns {string} Joined string.
 */
function joinOxford(items) {
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} & ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, & ${items[items.length - 1]}`;
}

/**
 * Group SelectChoices `asOptions()` output by `group` label so the template can emit `<optgroup>` wrappers.
 * @param {Array<{value:string, label:string, group:?string, disabled:boolean, selected:boolean}>} options Flat option list.
 * @returns {Array<{label:string, options:Array<{value:string, label:string, disabled:boolean, selected:boolean}>}>} Grouped options.
 */
function groupAsOptions(options) {
  const map = new Map();
  for (const o of options) {
    const key = o.group ?? '';
    if (!map.has(key)) map.set(key, { label: key, options: [] });
    map.get(key).options.push({ value: o.value, label: o.label, disabled: !!o.disabled, selected: !!o.selected });
  }
  return [...map.values()];
}

/**
 * Decorate an ASI spec with per-ability input rows + running total. Resolves the picked feat document for display when mode is `feat`.
 * @param {object} row Row record with `spec.kind === 'asi'`.
 * @returns {void}
 */
function decorateAsiSpec(row) {
  const spec = row.spec;
  const locked = new Set(spec.locked);
  const abilityCap = 20;
  const abilityScores = row.abilityScores ?? {};
  const priorAsiBonus = row.priorAsiBonus ?? {};
  let used = 0;
  for (const v of Object.values(spec.assignments)) used += Number(v) || 0;
  const remaining = Math.max(0, spec.points - used);
  spec.abilityInputs = Object.entries(CONFIG.DND5E.abilities).map(([key, cfg]) => {
    const fixedVal = Number(spec.fixed[key]) || 0;
    const assignedVal = Number(spec.assignments[key]) || 0;
    const baseScore = (Number(abilityScores[key]) || 0) + (Number(priorAsiBonus[key]) || 0);
    const finalScore = baseScore + fixedVal + assignedVal;
    const finalMod = Math.floor((finalScore - 10) / 2);
    const isDisabled = locked.has(key) || fixedVal > 0;
    return {
      key,
      label: cfg.label,
      value: assignedVal,
      fixed: fixedVal,
      cap: spec.cap,
      baseScore,
      finalScore,
      finalModLabel: formatMod(finalMod),
      disabled: isDisabled,
      canIncrement: !isDisabled && assignedVal < spec.cap && remaining > 0 && finalScore < abilityCap,
      canDecrement: !isDisabled && assignedVal > 0
    };
  });
  spec.remaining = remaining;
  spec.modeFieldName = `adv-asi-mode.${row.advancementId}.${row.level}`;
  spec.assignFieldPrefix = `adv-asi-assign.${row.advancementId}.${row.level}`;
  spec.featFieldName = `adv-asi-feat.${row.advancementId}.${row.level}`;
  spec.featOption = resolveFeatOption(spec.feat);
}

/**
 * Format a numeric ability modifier with explicit sign for display alongside the score.
 * @param {number} mod Computed modifier.
 * @returns {string} Sign-prefixed label like `+3` or `-1`.
 */
function formatMod(mod) {
  if (mod > 0) return `+${mod}`;
  if (mod < 0) return `${mod}`;
  return '+0';
}

/**
 * Resolve a feat uuid to a display option (name + img). Returns null when nothing picked or uuid won't resolve.
 * @param {?string} uuid Feat uuid.
 * @returns {?{uuid:string, name:string, img:?string}} Display option.
 */
function resolveFeatOption(uuid) {
  if (!uuid) return null;
  const doc = fromUuidSync(uuid);
  if (!doc) return null;
  return { uuid, name: stripNoiseParenthetical(doc.name, { sourceBook: doc.system?.source?.book }), img: doc.img ?? null };
}

/**
 * Resolve a single ItemChoice pool entry to a combobox option.
 * @param {?string|object} entry Pool entry: uuid string or `{uuid}` record.
 * @returns {?{value:string,label:string,icon:?string}} Option, or null when the doc can't resolve.
 */
function poolOption(entry) {
  const uuid = typeof entry === 'string' ? entry : entry?.uuid;
  if (!uuid) return null;
  const doc = fromUuidSync(uuid);
  if (!doc) return null;
  return { value: uuid, label: doc.name ? stripNoiseParenthetical(doc.name, { sourceBook: doc.system?.source?.book }) : uuid, icon: doc.img ?? null };
}

/**
 * Stamp a transient error on an advancement row (e.g. `Advancement#apply` threw at submit time).
 * @param {HTMLElement} root Wizard root.
 * @param {string} advancementId Advancement id.
 * @param {number} level Pick level.
 * @param {string} reason Localized reason text.
 * @returns {void}
 */
export function markAdvancementRowError(root, advancementId, level, reason) {
  const row = root.querySelector(`[data-advancement-row][data-advancement-id="${advancementId}"][data-level="${level}"]`);
  if (!row) return;
  row.dataset.error = 'apply';
  row.setAttribute('data-error-reason', reason);
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  ui.notifications.error('HEROMANCER.App.Advancements.ApplyFailed', { localize: true, permanent: true, format: { title: row.querySelector('.hm-advancement-title')?.textContent ?? '', reason } });
}

/**
 * Read the current pick from an advancement row.
 * @param {Element} row Row container.
 * @param {string} kind Spec kind (`item-choice` / `trait` / `asi`).
 * @returns {?object} Pick payload, or null when nothing selected.
 */
export function picksFromRow(row, kind) {
  const body = row;
  switch (kind) {
    case 'item-choice': {
      const added = [];
      for (const i of body.querySelectorAll('input[type="hidden"][name^="adv-combo."]')) {
        if (!i.value) continue;
        for (const v of i.value.split(',')) if (v) added.push(v);
      }
      return added.length ? { added } : null;
    }
    case 'trait': {
      const chosen = [];
      for (const el of body.querySelectorAll('input[type="hidden"][name^="adv-trait."]')) {
        if (!el.value) continue;
        for (const v of el.value.split(',')) if (v) chosen.push(v);
      }
      return chosen.length ? { chosen } : null;
    }
    case 'asi':
      return null;
    default:
      return null;
  }
}

/**
 * Serialize a chooser spec's existing selection into the JSON payload that backs the row's hidden input.
 * @param {object} spec Chooser spec from the registry.
 * @returns {string} JSON string, or empty when nothing picked.
 */
function serializePick(spec) {
  switch (spec.kind) {
    case 'asi':
      return spec.mode ? JSON.stringify({ type: spec.mode, assignments: spec.assignments, feat: spec.feat }) : '';
    case 'item-choice':
      return spec.selected?.length ? JSON.stringify({ added: spec.selected }) : '';
    case 'trait':
      return spec.chosen?.length ? JSON.stringify({ chosen: spec.chosen }) : '';
    default:
      return '';
  }
}
