/** @type {Object<string, Function>} Direct folder/pack name → display label resolver. */
const NAME_TRANSLATIONS = {
  'D&D Legacy Content': () => _loc('HEROMANCER.App.DocumentService.CommonLabels.Srd51'),
  'D&D Modern Content': () => _loc('HEROMANCER.App.DocumentService.CommonLabels.Srd52'),
  Forge: () => _loc('HEROMANCER.App.DocumentService.CommonLabels.Forge'),
  DDB: () => _loc('HEROMANCER.App.DocumentService.CommonLabels.DndbeyondImporter')
};

/** @type {RegExp} Pattern matching common homebrew compendium-name conventions. */
const HOMEBREW_RE = /[./_-]home[\s_-]?brew[./_-]/i;

/** @type {Set<string>} Translation keys that only match exactly (never via substring). */
const EXACT_ONLY = new Set(['D&D Legacy Content', 'D&D Modern Content']);

/**
 * Walk a pack's folder chain to its top-level folder name.
 * @param {object} pack Compendium pack.
 * @returns {?string} Top-level folder name, or null when the pack has no folder.
 */
export function getPackTopLevelFolderName(pack) {
  if (!pack?.folder) return null;
  if (pack.folder.depth === 1) return pack.folder.name || null;
  return pack.folder.getParentFolders().at(-1)?.name ?? null;
}

/**
 * Translate a folder or pack name into a normalized source label.
 * @param {string} name Folder name or pack metadata.label.
 * @param {?string} [packId] Pack metadata.id used for substring fallback (e.g. Forge detection).
 * @returns {string} Normalized label.
 */
export function translateSourceName(name, packId = null) {
  if (!name) return packId ?? _loc('HEROMANCER.App.DocumentService.CommonLabels.UnknownSource');
  const exact = NAME_TRANSLATIONS[name];
  if (exact) return exact();
  for (const [key, fn] of Object.entries(NAME_TRANSLATIONS)) {
    if (EXACT_ONLY.has(key)) continue;
    const matchesName = name.includes(key);
    const matchesId = key === 'Forge' && packId?.includes(key);
    if (matchesName || matchesId) return fn();
  }
  if (HOMEBREW_RE.test(name)) return _loc('HEROMANCER.App.DocumentService.CommonLabels.Homebrew');
  return name;
}

/**
 * Group entries by the normalized top-level folder name of their pack.
 * @param {Array<{packId: string, packName: string, name: string}>} entries Entries from the document loader.
 * @returns {Array<{folderName: string, docs: object[]}>} Sorted groups; docs sorted by name within each group.
 */
export function groupByTopLevelFolder(entries) {
  if (!entries?.length) return [];
  const groups = new Map();
  for (const entry of entries) {
    const pack = game.packs.get(entry.packId);
    if (!pack) continue;
    const top = getPackTopLevelFolderName(pack);
    const folderName = top ? translateSourceName(top) : translateSourceName(entry.packName, pack.metadata.id);
    let group = groups.get(folderName);
    if (!group) {
      group = { folderName, docs: [] };
      groups.set(folderName, group);
    }
    group.docs.push(entry);
  }
  for (const group of groups.values()) group.docs.sort((a, b) => a.name.localeCompare(b.name));
  return [...groups.values()].sort((a, b) => a.folderName.localeCompare(b.folderName));
}
