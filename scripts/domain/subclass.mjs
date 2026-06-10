import { MODULE } from '../constants.mjs';
import * as documentLoader from '../data/document-loader.mjs';
import { getPackTopLevelFolderName, translateSourceName } from '../data/folder-grouper.mjs';
import { shortDescription } from '../utils/html-text.mjs';

/**
 * Resolve the effective starting level for the in-progress draft.
 * @param {object} [draft] Start-tab draft (camelCase keys).
 * @returns {number} Clamped 1-20 level.
 */
export function getEffectiveStartingLevel(draft = {}) {
  const campaign = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.STARTING_LEVEL)) || 1;
  const allowOverride = game.settings.get(MODULE.ID, MODULE.SETTINGS.ALLOW_PLAYER_LEVEL_OVERRIDE);
  const editable = game.user.isGM || allowOverride;
  if (!editable) return campaign;
  const draftLevel = Number(draft.level);
  return Number.isFinite(draftLevel) && draftLevel >= 1 && draftLevel <= 20 ? draftLevel : campaign;
}

/**
 * Find the level at which a class grants its subclass.
 * @param {object} classDoc Full class Document.
 * @returns {?number} Subclass-grant level, or null when the class lacks a Subclass advancement.
 */
export function getSubclassThreshold(classDoc) {
  const adv = classDoc?.system?.advancement ?? classDoc?.advancement?.contents ?? [];
  const list = Array.isArray(adv) ? adv : (adv?.contents ?? Object.values(adv ?? {}));
  for (const a of list) {
    const type = a.type ?? a.constructor?.typeName;
    if (type === 'Subclass') return a.level ?? null;
  }
  return null;
}

/**
 * Resolve the top-level folder name (i.e. source group) for a cached doc entry.
 * @param {object} entry Cached doc entry from `documentLoader.getEntries`.
 * @returns {?string} Source-group label, or null when unresolvable.
 */
function entrySourceGroup(entry) {
  const pack = game.packs.get(entry.packId);
  if (!pack) return null;
  const top = getPackTopLevelFolderName(pack);
  return top ? translateSourceName(top) : translateSourceName(entry.packName, pack.metadata.id);
}

/**
 * List subclass entries that match a class's identifier, optionally filtered to a locked ruleset.
 * @param {object} classDoc Full class Document.
 * @param {?string} [locked] Locked ruleset (`2014`/`2024`), or null for no filter.
 * @returns {Array<{value:string,label:string,group:?string,icon:?string}>} Eligible subclass options.
 */
export function getEligibleSubclasses(classDoc, locked = null) {
  const classIdent = classDoc?.system?.identifier;
  if (!classIdent) return [];
  return documentLoader
    .getEntries('subclass')
    .filter((e) => e.system?.classIdentifier === classIdent)
    .filter((e) => !locked || !e.system?.source?.rules || e.system.source.rules === locked)
    .map((e) => ({ value: e.uuid, label: e.name, icon: e.img, description: shortDescription(e.system), group: entrySourceGroup(e) }));
}
