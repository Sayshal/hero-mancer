import { MODULE } from '../constants.mjs';
import { firstProseParagraph, stripNoiseParenthetical } from '../utils/html-text.mjs';

const CompendiumBrowser = dnd5e.applications.CompendiumBrowser;

/** @type {Set<string>} System fields pulled into the index for filtering and display. */
const INDEX_FIELDS = new Set([
  'system.properties',
  'system.classIdentifier',
  'system.identifier',
  'system.source',
  'system.primaryAbility',
  'system.hd',
  'system.spellcasting',
  'system.movement',
  'system.type',
  'system.advancement',
  'system.description.short',
  'system.description.value'
]);

/**
 * @typedef {object} DocEntry
 * @property {string} id Document _id within its pack.
 * @property {string} name Display name.
 * @property {?string} img Image path.
 * @property {string} uuid Compendium uuid.
 * @property {string} packId Pack metadata id (`scope.name`).
 * @property {string} packName Pack metadata label.
 * @property {?string} folderName Direct folder name in the pack, or null.
 * @property {?object} system Slim system data from index fields.
 */

/** @type {Map<string, DocEntry[]>} type → entries (sorted). */
const entriesByType = new Map();

/** @type {Map<string, object>} uuid → fully loaded Document. */
const documentCache = new Map();

/**
 * Map a single CompendiumBrowser index entry to a slim DocEntry.
 * @param {object} entry Index entry (CB.fetch result; carries `entry.uuid`).
 * @returns {DocEntry} Slim entry.
 */
function toEntry(entry) {
  const pack = foundry.utils.parseUuid(entry.uuid)?.collection ?? null;
  return {
    id: entry._id,
    name: entry.name,
    img: entry.img,
    uuid: entry.uuid,
    packId: pack?.metadata?.id ?? '',
    packName: pack?.metadata?.label ?? '',
    folderName: entry.folder ? (pack?.folders?.get(entry.folder)?.name ?? null) : null,
    system: entry.system ?? null
  };
}

/**
 * Detect whether an index entry is a sidekick class (filtered out for character creation).
 * @param {object} entry Index entry.
 * @returns {boolean} True when the entry is a sidekick class.
 */
function isSidekickEntry(entry) {
  if (entry.type !== 'class') return false;
  const pack = foundry.utils.parseUuid(entry.uuid)?.collection ?? null;
  const folderName = entry.folder ? pack?.folders?.get(entry.folder)?.name : null;
  if (folderName?.toLowerCase().includes('sidekick')) return true;
  return Boolean(entry.system?.properties && new Set(entry.system.properties).has('sidekick'));
}

/**
 * Reindex documents of `type` via dnd5e's CompendiumBrowser and cache the resulting entry list.
 * @param {string} type Foundry Item subtype (`race`, `class`, `background`, `subclass`, `feat`).
 * @returns {Promise<{entries: DocEntry[]}>} Cached entries.
 */
export async function reindex(type) {
  const results = await CompendiumBrowser.fetch(Item, { types: new Set([type]), indexFields: new Set(INDEX_FIELDS) });
  const exclusionList = new Set((game.settings.get(MODULE.ID, MODULE.SETTINGS.EXCLUSION_LIST) ?? {})[type] ?? []);
  const trimSource = game.settings.get(MODULE.ID, MODULE.SETTINGS.TRIM_SOURCE_PARENTHETICAL);
  const entries = [];
  for (const raw of results) {
    if (raw.type !== type) continue;
    if (isSidekickEntry(raw)) continue;
    if (exclusionList.has(raw.uuid)) continue;
    const entry = toEntry(raw);
    if (trimSource) entry.name = stripNoiseParenthetical(entry.name, { sourceBook: raw.system?.source?.book });
    entries.push(entry);
  }
  await populateEmbeddedShortDescriptions(entries);
  entries.sort((a, b) => a.name.localeCompare(b.name) || a.packName.localeCompare(b.packName));
  const promises = [];
  Hooks.callAll(MODULE.HOOKS.DOCUMENTS_READY, type, entries, promises);
  if (promises.length > 0) await Promise.all(promises);
  entries.sort((a, b) => a.name.localeCompare(b.name) || a.packName.localeCompare(b.packName));
  entriesByType.set(type, entries);
  ATLAS.log(3, `reindex(${type}): ${entries.length} entries`);
  return { entries };
}

/**
 * For each entry whose `system.description.value` ends in `@Embed[...JournalEntryPage.X...]`.
 * @param {DocEntry[]} entries Indexed entries (mutated in place).
 * @returns {Promise<void>}
 */
async function populateEmbeddedShortDescriptions(entries) {
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.system?.description?.short) return;
      const value = entry.system?.description?.value;
      if (!value) return;
      const match = value.match(/@Embed\[(Compendium\.[^\s\]]+\.JournalEntryPage\.[A-Za-z0-9_]+)/);
      if (!match) return;
      try {
        const page = await fromUuid(match[1]);
        const content = page?.text?.content;
        if (!content) return;
        const prose = firstProseParagraph(content);
        if (!prose) return;
        entry.system.description ??= {};
        entry.system.description.short = prose;
      } catch (err) {
        ATLAS.log(2, `embedded-page resolve failed for ${entry.uuid}:`, err.message);
      }
    })
  );
}

/**
 * Read the cached entry list for a type.
 * @param {string} type Foundry Item subtype.
 * @returns {DocEntry[]} Cached entries (empty array when never indexed).
 */
export function getEntries(type) {
  return entriesByType.get(type) ?? [];
}

/**
 * Lazily resolve a uuid to its full Document, caching the result.
 * @param {string} uuid Compendium uuid.
 * @returns {Promise<?object>} Document or null.
 */
export async function getFullDocument(uuid) {
  if (!uuid) return null;
  if (documentCache.has(uuid)) return documentCache.get(uuid);
  const doc = await fromUuid(uuid);
  if (doc) documentCache.set(uuid, doc);
  return doc;
}

/** Drop every cache (entries, documents). */
export function clearCaches() {
  entriesByType.clear();
  documentCache.clear();
  ATLAS.log(3, 'document-loader caches cleared');
}
