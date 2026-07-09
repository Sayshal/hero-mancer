/** @type {string[]} Fallback compound-race names when `system.type.subtype` is empty. */
const FALLBACK_SPECIES = ['elf', 'gnome', 'tiefling', 'dwarf', 'halfling'];

/** @type {Map<string, ?string>} */
const journalLookupCache = new Map();

/**
 * Heuristic species lookup by document name.
 * @param {string} raceName Doc name.
 * @returns {?string} Lower-cased base species.
 */
function fallbackSpeciesFromName(raceName) {
  if (!raceName) return null;
  const lower = raceName.toLowerCase();
  if (raceName.includes(',')) {
    const head = raceName.split(',')[0].trim().toLowerCase();
    if (FALLBACK_SPECIES.includes(head)) return head;
  }
  for (const species of FALLBACK_SPECIES) if (lower.includes(species) && raceName.includes(' ')) return species;
  return null;
}

/**
 * Walk a pack's folder chain to its top-level compendium folder id.
 * @param {object} pack Compendium pack.
 * @returns {?string} Top-level compendium folder id.
 */
function topPackFolderId(pack) {
  let f = pack?.folder;
  while (f?.folder) f = f.folder;
  return f?.id ?? null;
}

/**
 * Reorder so originating module/top-folder packs come first.
 * @param {object[]} packs Journal packs.
 * @param {?string} modulePrefix Originating module id.
 * @param {?object} sourcePack Source item pack.
 * @returns {object[]} Reordered packs.
 */
function prioritizeJournalPacks(packs, modulePrefix, sourcePack) {
  if (!modulePrefix) return [...packs];
  const exact = packs.filter((p) => p.metadata.packageName === modulePrefix);
  const pool = exact.length > 0 ? exact : packs;
  const topId = topPackFolderId(sourcePack);
  if (!topId) return pool;
  const folderMatch = pool.filter((p) => topPackFolderId(p) === topId);
  if (modulePrefix === 'dnd5e') return folderMatch;
  const folderMiss = pool.filter((p) => topPackFolderId(p) !== topId);
  return [...folderMatch, ...folderMiss];
}

/**
 * Find a JournalEntry or page matching the source doc.
 * @param {object} pack Compendium pack.
 * @param {string} normalizedItemName Lowercased item name.
 * @param {?string} baseSpecies Fallback species token.
 * @param {?string} docType Source doc type.
 * @param {?string} itemUuid Used to disambiguate name-match candidates.
 * @returns {Promise<?object>} Match descriptor or null.
 */
async function searchSingleCompendium(pack, normalizedItemName, baseSpecies, docType, itemUuid) {
  const index = await pack.getIndex({ fields: ['pages'] });
  for (const entry of index) {
    const entryName = entry.name?.toLowerCase();
    if (entryName === normalizedItemName) return { uuid: entry.uuid, kind: 'entry-name', pageCount: entry.pages?.length ?? 0 };
    if (baseSpecies && entryName === baseSpecies) return { uuid: entry.uuid, kind: 'entry-name-species', pageCount: entry.pages?.length ?? 0 };
  }
  const candidates = [];
  for (const entry of index) {
    if (!entry.pages?.length) continue;
    for (const p of entry.pages) {
      const pageName = p.name?.toLowerCase();
      if (pageName !== normalizedItemName && (!baseSpecies || pageName !== baseSpecies)) continue;
      candidates.push({ uuid: `${entry.uuid}.JournalEntryPage.${p._id}`, pageType: p.type, entryUuid: entry.uuid, parentEntry: entry.name, parentPageCount: entry.pages.length });
    }
  }
  if (!candidates.length) return null;
  const bestEmbed = await findBestEmbedMatch(candidates, itemUuid);
  if (bestEmbed) return bestEmbed;
  const typed = candidates.find((c) => c.pageType === docType);
  if (typed) return { uuid: typed.uuid, kind: 'page-typed', pageType: typed.pageType, parentEntry: typed.parentEntry, parentPageCount: typed.parentPageCount };
  const text = candidates.find((c) => c.pageType === 'text');
  if (text) return { uuid: text.uuid, kind: 'page-text', pageType: text.pageType, parentEntry: text.parentEntry, parentPageCount: text.parentPageCount };
  return null;
}

/**
 * Pick best candidate by scanning page content for `@Embed` signals.
 * @param {Array<object>} candidates Match candidates.
 * @param {?string} itemUuid Source item uuid.
 * @returns {Promise<?object>} Best match or null.
 */
async function findBestEmbedMatch(candidates, itemUuid) {
  const entryDocs = new Map();
  for (const c of candidates) {
    if (entryDocs.has(c.entryUuid)) continue;
    const entryDoc = await fromUuid(c.entryUuid);
    if (entryDoc?.pages?.size) entryDocs.set(c.entryUuid, entryDoc);
  }
  if (itemUuid) {
    for (const entryDoc of entryDocs.values()) {
      for (const p of entryDoc.pages.contents) {
        const content = p.text?.content ?? '';
        if (content.includes(`@Embed[${itemUuid}`)) return { uuid: p.uuid, kind: 'page-embed-match', pageType: p.type, parentEntry: entryDoc.name, parentPageCount: entryDoc.pages.size };
      }
    }
  }
  if (candidates.length > 1) {
    const candidateUuids = new Set(candidates.map((c) => c.uuid));
    for (const c of candidates) {
      const entryDoc = entryDocs.get(c.entryUuid);
      if (!entryDoc) continue;
      const page = entryDoc.pages.get(foundry.utils.parseUuid(c.uuid).id);
      const content = page?.text?.content ?? '';
      for (const otherUuid of candidateUuids) {
        if (otherUuid === c.uuid) continue;
        if (content.includes(`@Embed[${otherUuid}`)) return { uuid: c.uuid, kind: 'page-wraps-sibling', pageType: c.pageType, parentEntry: c.parentEntry, parentPageCount: c.parentPageCount };
      }
    }
  }
  return null;
}

/**
 * Search prioritized journal packs; returns first match.
 * @param {object[]} packs Journal packs.
 * @param {string} itemName Item name.
 * @param {?string} itemUuid Source item uuid.
 * @param {?string} baseSpecies Fallback species token.
 * @param {?object} sourcePack Source item pack.
 * @param {?string} docType Source doc type.
 * @returns {Promise<?string>} Matched page uuid or null.
 */
async function searchCompendiumsForPage(packs, itemName, itemUuid, baseSpecies, sourcePack, docType) {
  if (!packs?.length || !itemName) return null;
  const normalized = itemName.toLowerCase();
  const modulePrefix = foundry.utils.parseUuid(itemUuid)?.collection?.metadata?.packageName ?? null;
  const prioritized = prioritizeJournalPacks(packs, modulePrefix, sourcePack);
  ATLAS.log(3, `[journal-finder] searching "${itemName}" — source=${sourcePack?.metadata.name}, candidates=[${prioritized.map((p) => p.metadata.name).join(', ')}]`);
  for (const pack of prioritized) {
    const match = await searchSingleCompendium(pack, normalized, baseSpecies, docType, itemUuid);
    if (!match) continue;
    ATLAS.log(3, `[journal-finder] matched "${itemName}" → ${match.uuid} (kind=${match.kind}, pack=${pack.metadata.name})`);
    return match.uuid;
  }
  ATLAS.log(3, `[journal-finder] no match for "${itemName}" in [${prioritized.map((p) => p.metadata.name).join(', ')}]`);
  return null;
}

/**
 * Find a journal page describing a given document.
 * @param {object} doc Source doc.
 * @returns {Promise<?string>} JournalEntry or JournalEntryPage uuid.
 */
export async function findRelatedJournalPage(doc) {
  if (!doc?.type || !doc.name) return null;
  if (journalLookupCache.has(doc.uuid)) return journalLookupCache.get(doc.uuid);
  const journalPacks = game.packs.filter((p) => p.metadata.type === 'JournalEntry');
  const subtype = doc.system?.type?.subtype?.toLowerCase() || null;
  const baseSpecies = subtype ?? fallbackSpeciesFromName(doc.name);
  const sourcePack = doc.pack ? game.packs.get(doc.pack) : null;
  const result = await searchCompendiumsForPage(journalPacks, doc.name, doc.uuid, baseSpecies, sourcePack, doc.type);
  journalLookupCache.set(doc.uuid, result);
  return result;
}
