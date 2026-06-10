/** @typedef {{name: string, source: string, key: string}} GrantEntry */

/**
 * @typedef {object} ProficiencyData Aggregated proficiency buckets keyed by category.
 * @property {Set<GrantEntry>} armor Armor proficiencies.
 * @property {Set<GrantEntry>} weapons Weapon proficiencies.
 * @property {Set<GrantEntry>} tools Tool proficiencies.
 * @property {Set<GrantEntry>} savingThrows Saving-throw proficiencies.
 * @property {Set<GrantEntry>} skills Skill proficiencies.
 * @property {Set<GrantEntry>} languages Known languages.
 */

/** @type {Object<string, string>} */
const PREFIX_TO_BUCKET = { saves: 'savingThrows', skills: 'skills', languages: 'languages', armor: 'armor', weapon: 'weapons', tool: 'tools' };

/** @type {Array<{bucket: string, labelKey: string, icon: string}>} */
const CATEGORY_META = [
  { bucket: 'armor', labelKey: 'DND5E.TraitArmorProf', icon: 'fa-solid fa-shield-halved' },
  { bucket: 'weapons', labelKey: 'DND5E.TraitWeaponProf', icon: 'fa-solid fa-hand-fist' },
  { bucket: 'tools', labelKey: 'DND5E.TraitToolProf', icon: 'fa-solid fa-screwdriver-wrench' },
  { bucket: 'savingThrows', labelKey: 'DND5E.ClassSaves', icon: 'fa-solid fa-dice-d20' },
  { bucket: 'skills', labelKey: 'DND5E.Skills', icon: 'fa-solid fa-star' },
  { bucket: 'languages', labelKey: 'DND5E.Languages', icon: 'fa-solid fa-language' }
];

/** @returns {ProficiencyData} Empty buckets. */
function makeProficiencyData() {
  return { armor: new Set(), weapons: new Set(), tools: new Set(), savingThrows: new Set(), skills: new Set(), languages: new Set() };
}

/**
 * Categorize a single Trait grant into the matching proficiency bucket.
 * @param {string} grant e.g. `"saves:dex"`, `"tool:art:calligrapher"`.
 * @param {string} source Source doc name.
 * @param {ProficiencyData} data Accumulator.
 */
function categorizeGrant(grant, source, data) {
  const bucket = PREFIX_TO_BUCKET[grant.split(':')[0]];
  if (!bucket) return;
  const name = dnd5e.documents.Trait.keyLabel(grant);
  if (!name || name === grant) return;
  data[bucket].add({ name, source, key: grant });
}

/**
 * Walk doc's Trait advancements, categorizing every grant.
 * @param {object} doc Source doc.
 * @param {ProficiencyData} data Accumulator.
 */
function extractFromDoc(doc, data) {
  if (!doc) return;
  const traits = doc.advancement?.byType?.Trait;
  if (!traits) return;
  for (const trait of traits) for (const grant of trait.configuration?.grants ?? []) categorizeGrant(grant, doc.name, data);
}

/**
 * Aggregate proficiency grants across multiple docs into merged buckets.
 * @param {object[]} docs Source docs.
 * @returns {ProficiencyData} Merged buckets.
 */
export function aggregateProficiencies(docs) {
  const data = makeProficiencyData();
  for (const doc of docs) extractFromDoc(doc, data);
  return data;
}

/**
 * Dedup category by name, joining sources for tooltip.
 * @param {Set<GrantEntry>} set Category bucket.
 * @returns {Array<{name: string, key: string, tooltip: string}>} Deduped rows.
 */
export function dedupCategory(set) {
  const map = new Map();
  for (const { name, source, key } of set) {
    if (!map.has(name)) map.set(name, { sources: new Set(), key });
    map.get(name).sources.add(source);
  }
  return [...map.entries()].map(([name, { sources, key }]) => ({ name, key, tooltip: [...sources].join(', ') }));
}

/**
 * Template-ready category list; skips empty categories.
 * @param {object[]} docs Source docs.
 * @returns {Array<{label: string, icon: string, items: object[]}>} Render-ready categories.
 */
export function buildProficiencyCategories(docs) {
  const data = aggregateProficiencies(docs);
  const out = [];
  for (const meta of CATEGORY_META) {
    const set = data[meta.bucket];
    if (set.size === 0) continue;
    out.push({ label: _loc(meta.labelKey), icon: meta.icon, items: dedupCategory(set) });
  }
  return out;
}
