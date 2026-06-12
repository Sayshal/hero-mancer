import { MODULE } from '../constants.mjs';
import { safeEnrichHTML, stripNoiseParenthetical } from '../utils/html-text.mjs';
import * as compare from './compare.mjs';

const CompendiumBrowser = dnd5e.applications.CompendiumBrowser;

/** Index fields for filtering and prereq surfacing; activity, advancement, and description data come from the full doc in hydrateEntry. */
const INDEX_FIELDS = new Set(['system.type.value', 'system.type.subtype', 'system.prerequisites.level', 'system.prerequisites.repeatable', 'system.source']);

/** @type {{cache: Map<string, FeatEntry>, ready: boolean, promise: ?Promise<void>}} */
const state = { cache: new Map(), ready: false, promise: null };

/**
 * @typedef {object} FeatEntry Normalized feat-index row used by the feat browser.
 * @property {string} uuid Compendium uuid.
 * @property {string} name Feat name.
 * @property {?string} img Feat icon.
 * @property {string} subtype `general`/`origin`/`fightingStyle`/`epicBoon`/empty.
 * @property {string} book Source book code.
 * @property {string} rules `2014`/`2024`/`unknown`.
 * @property {?number} prereqLevel Minimum character level.
 * @property {boolean} repeatable True when repeatable.
 * @property {Set<string>} actionBuckets Combat-action buckets (`action`/`bonus`/`reaction`/`passive`).
 * @property {boolean} hasASI True when any AbilityScoreImprovement advancement exists.
 * @property {boolean} grantsSpell True when any granted/choice item is a spell, or any activity casts a spell.
 * @property {string} descriptionHtml Pre-enriched HTML.
 */

/**
 * Build the feat index from dnd5e source-configured packs; pre-enriches descriptions.
 * @param {object} [opts] Init options.
 * @param {boolean} [opts.force] Rebuild even when ready.
 * @returns {Promise<void>} Resolves when index ready.
 */
export function initFeatIndex({ force = false } = {}) {
  if (state.ready && !force) return Promise.resolve();
  if (state.promise && !force) return state.promise;
  state.promise = (async () => {
    state.cache.clear();
    const excluded = new Set((game.settings.get(MODULE.ID, MODULE.SETTINGS.EXCLUSION_LIST) ?? {}).feat ?? []);
    const results = await CompendiumBrowser.fetch(Item, { types: new Set(['feat']), indexFields: new Set(INDEX_FIELDS) });
    const jobs = [];
    for (const entry of results) {
      if (entry.system?.type?.value !== 'feat') continue;
      if (excluded.has(entry.uuid)) continue;
      const normalized = normalizeEntry(entry);
      state.cache.set(entry.uuid, normalized);
      jobs.push(hydrateEntry(entry, normalized));
    }
    await Promise.all(jobs);
    state.ready = true;
  })();
  return state.promise;
}

/** Drop the feat index so the next `initFeatIndex` call rebuilds. */
export function clearFeatIndex() {
  state.cache.clear();
  state.ready = false;
  state.promise = null;
}

/**
 * Normalize a raw compendium-index entry to a `FeatEntry`.
 * @param {object} entry Raw index entry.
 * @returns {FeatEntry} Normalized entry.
 */
function normalizeEntry(entry) {
  return {
    uuid: entry.uuid,
    name: stripNoiseParenthetical(entry.name, { sourceBook: entry.system?.source?.book }),
    img: entry.img,
    subtype: entry.system?.type?.subtype ?? '',
    book: (entry.system?.source?.book ?? '').trim(),
    rules: entry.system?.source?.rules ?? 'unknown',
    prereqLevel: entry.system?.prerequisites?.level ?? null,
    repeatable: entry.system?.prerequisites?.repeatable === true,
    actionBuckets: new Set(['passive']),
    hasASI: false,
    grantsSpell: false,
    descriptionHtml: ''
  };
}

/**
 * Load the full feat document to fill activity/advancement-derived flags and enriched description.
 * @param {object} entry Raw index entry.
 * @param {FeatEntry} normalized Cached normalized entry, mutated in place.
 * @returns {Promise<void>} Resolves when the entry is hydrated.
 */
async function hydrateEntry(entry, normalized) {
  const doc = await fromUuid(entry.uuid);
  const activities = Object.values(doc?.system?.activities ?? {});
  const rawAdvancement = doc?.system?.advancement;
  const advancement = Array.isArray(rawAdvancement) ? rawAdvancement : rawAdvancement ? Object.values(rawAdvancement) : [];
  normalized.actionBuckets = deriveActionBuckets(activities);
  normalized.hasASI = advancement.some((a) => a?.type === 'AbilityScoreImprovement');
  normalized.grantsSpell = deriveGrantsSpell(advancement, activities);
  const raw = doc?.system?.description?.value ?? '';
  if (raw) normalized.descriptionHtml = await safeEnrichHTML(raw, { secrets: false });
}

/**
 * Reduce raw activities to combat-action buckets; empty / non-combat → `passive`.
 * @param {object[]} activities Raw activity sources.
 * @returns {Set<string>} Buckets in `ACTION_BUCKETS`.
 */
function deriveActionBuckets(activities) {
  const out = new Set();
  for (const act of activities) {
    const type = act?.activation?.type;
    if (type === 'action' || type === 'bonus' || type === 'reaction') out.add(type);
    else out.add('passive');
  }
  if (!out.size) out.add('passive');
  return out;
}

/**
 * True when the feat grants or chooses a spell, or any activity casts a spell.
 * @param {object[]} advancement Raw advancement entries.
 * @param {object[]} activities Raw activity sources.
 * @returns {boolean} True when a spell hookup is present.
 */
function deriveGrantsSpell(advancement, activities) {
  for (const adv of advancement) {
    if (adv?.type === 'ItemChoice' && adv?.itemType === 'spell') return true;
    if (adv?.type === 'ItemGrant') for (const item of adv.items ?? []) if (typeof item?.uuid === 'string' && item.uuid.includes('.spells.')) return true;
  }
  return activities.some((act) => act?.type === 'cast');
}

/**
 * Build the feat-browser sub-tab context.
 * @param {object} args Context args.
 * @param {?object} [args.actor] Target actor in level-up mode.
 * @param {?object} [args.classDoc] Retained for future bias options.
 * @param {number} [args.characterLevel] Effective character level.
 * @param {?{advId:string, level:number, label:string}} [args.scope] Active ASI scope.
 * @param {?string} [args.pickedUuid] Currently picked feat uuid.
 * @param {?object} [args.filters] Persisted filter state.
 * @returns {object} Sub-tab context.
 */
export function buildFeatBrowserContext({ actor = null, classDoc = null, characterLevel = 1, scope = null, pickedUuid = null, filters = null } = {}) {
  void classDoc;
  const subtypeMap = CONFIG.DND5E.featureTypes?.feat?.subtypes ?? {};
  const activeSubtype = filters?.subtype ?? 'all';
  const activeRules = filters?.rules ?? 'all';
  const activeBook = filters?.book ?? 'all';
  const activeAction = filters?.action ?? 'all';
  const feats = [];
  const rulesSet = new Set();
  const bookSet = new Set();
  const subtypeSet = new Set();
  const actionSet = new Set();
  for (const entry of state.cache.values()) {
    const qualifies = qualifiesForFeat(entry, { actor, characterLevel });
    const levelGated = (entry.prereqLevel ?? 0) > characterLevel;
    const subtypeLabel = entry.subtype && subtypeMap[entry.subtype] ? _loc(subtypeMap[entry.subtype]) : '';
    const isPinned = compare.hasPin('feat', entry.uuid);
    feats.push({
      ...entry,
      actionBucketsStr: [...entry.actionBuckets].join(' '),
      subtypeLabel,
      prereqLabel: formatPrereqLabel(entry),
      prereqLevelWarning: levelGated ? _loc('HEROMANCER.App.Advancements.FeatBrowser.PrereqLevelWarning', { level: entry.prereqLevel }) : null,
      qualifies,
      levelGated,
      isPicked: pickedUuid && entry.uuid === pickedUuid,
      isPinned,
      pinTooltip: _loc(isPinned ? 'HEROMANCER.Compare.Unpin' : 'HEROMANCER.Compare.Pin'),
      grantsSpellTooltip: entry.grantsSpell ? _loc('HEROMANCER.App.Advancements.FeatBrowser.GrantsSpellTooltip') : null,
      bookTooltip: entry.book ? bookLabel(entry.book) : null
    });
    if (entry.rules) rulesSet.add(entry.rules);
    if (entry.book) bookSet.add(entry.book);
    if (entry.subtype) subtypeSet.add(entry.subtype);
    for (const bucket of entry.actionBuckets) actionSet.add(bucket);
  }
  feats.sort((a, b) => a.name.localeCompare(b.name));
  const pinCount = compare.pinCount('feat');
  const subtypes = Object.entries(subtypeMap)
    .filter(([value]) => subtypeSet.has(value))
    .map(([value, label]) => ({ value, label: _loc(label).replace(/\s+feat$/i, ''), active: activeSubtype === value }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const rulesOptions = [...rulesSet].sort().map((rules) => ({ value: rules, label: rulesLabel(rules).replace(/\s+ruleset$/i, ''), selected: activeRules === rules }));
  const bookOptions = [...bookSet].sort().map((book) => ({ value: book, label: book, tooltip: bookLabel(book), selected: activeBook === book }));
  const actionOptions = ['action', 'bonus', 'reaction', 'passive']
    .filter((bucket) => actionSet.has(bucket))
    .map((bucket) => ({ value: bucket, label: _loc(`HEROMANCER.App.Advancements.FeatBrowser.action-${bucket}`), selected: activeAction === bucket }));
  return {
    hasFeats: feats.length > 0,
    scope,
    pickedUuid: pickedUuid ?? null,
    supportsQualifying: !!actor,
    subtypes,
    rulesOptions,
    bookOptions,
    actionOptions,
    feats,
    filters: filters ?? { search: '', subtype: 'all', rules: 'all', book: 'all', action: 'all', qualify: false, grantsAsi: false, grantsSpell: false },
    allFilterActive: activeSubtype === 'all',
    allRulesActive: activeRules === 'all',
    allBookActive: activeBook === 'all',
    allActionActive: activeAction === 'all',
    compare: { pinCount, canCompare: pinCount >= 2, compareLabel: _loc('HEROMANCER.Compare.Open', { count: pinCount }) }
  };
}

/**
 * Indexed-fields only (level + repeatable); item prereqs skipped — dnd5e enforces at apply time.
 * @param {FeatEntry} entry Feat entry.
 * @param {{actor:?object, characterLevel:number}} ctx Qualification context.
 * @returns {boolean} True when qualifies.
 */
function qualifiesForFeat(entry, { actor, characterLevel }) {
  const level = entry.prereqLevel ?? 0;
  if (level > characterLevel) return false;
  if (!actor) return true;
  if (!entry.repeatable && actor.sourcedItems?.get(entry.uuid)?.size) return false;
  return true;
}

/**
 * Format a feat's prereq line combining level and repeatable flags.
 * @param {FeatEntry} entry Feat entry.
 * @returns {?string} Prereq summary line.
 */
function formatPrereqLabel(entry) {
  const parts = [];
  if (entry.prereqLevel) parts.push(_loc('DND5E.LevelNumber', { level: entry.prereqLevel }));
  if (entry.repeatable) parts.push(_loc('HEROMANCER.App.Advancements.FeatBrowser.PrereqRepeatable'));
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Localize a rules-edition code into a display label.
 * @param {string} rules `2014`/`2024`/`unknown`.
 * @returns {string} Localized label.
 */
function rulesLabel(rules) {
  if (rules === '2014' || rules === '2024') return _loc(`HEROMANCER.LevelUp.Source.rules-${rules}`);
  return _loc('HEROMANCER.LevelUp.Source.rules-unknown');
}

/**
 * Expand a source-book code to its full title via dnd5e's registry; falls back to the code.
 * @param {string} book Source book code.
 * @returns {string} Full title or the code.
 */
function bookLabel(book) {
  return CONFIG.DND5E.sourceBooks?.[book] ?? book;
}
