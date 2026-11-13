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
 * Find a class's Subclass advancement, from either a full Document or a raw index entry.
 * @param {object} classDoc Full class Document or index entry.
 * @returns {?object} Subclass advancement (instance or source data), or null.
 */
function findSubclassAdvancement(classDoc) {
  const adv = classDoc?.system?.advancement ?? classDoc?.advancement?.contents ?? [];
  const list = Array.isArray(adv) ? adv : (adv?.contents ?? Object.values(adv ?? {}));
  return list.find((a) => (a.type ?? a.constructor?.typeName) === 'Subclass') ?? null;
}

/**
 * Find the level at which a class grants its subclass.
 * @param {object} classDoc Full class Document.
 * @returns {?number} Subclass-grant level, or null when the class lacks a Subclass advancement.
 */
export function getSubclassThreshold(classDoc) {
  return findSubclassAdvancement(classDoc)?.level ?? null;
}

/**
 * Read the subclass a class's Subclass advancement suggests.
 * @param {object} classDoc Full class Document or index entry.
 * @returns {?{uuid: string, fixed: boolean}} Suggested subclass, or null when none is configured.
 */
export function getSuggestedSubclass(classDoc) {
  const suggested = findSubclassAdvancement(classDoc)?.configuration?.suggested;
  return suggested?.uuid ? { uuid: suggested.uuid, fixed: !!suggested.fixed } : null;
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
 * List subclass entries that match a class's identifier, or only the suggested subclass when the class fixes it.
 * @param {object} classDoc Full class Document.
 * @returns {Array<{value:string,label:string,group:?string,icon:?string}>} Eligible subclass options.
 */
export function getEligibleSubclasses(classDoc) {
  const classIdent = classDoc?.system?.identifier;
  if (!classIdent) return [];
  const toOption = (e) => ({ value: e.uuid, label: e.name, icon: e.img, description: shortDescription(e.system), group: entrySourceGroup(e) });
  const entries = documentLoader.getEntries('subclass');
  const suggested = getSuggestedSubclass(classDoc);
  if (suggested?.fixed) {
    const entry = entries.find((e) => e.uuid === suggested.uuid);
    if (entry) return [toOption(entry)];
    const index = fromUuidSync(suggested.uuid);
    return index ? [{ value: suggested.uuid, label: index.name, icon: index.img, description: '', group: null }] : [];
  }
  return entries.filter((e) => e.system?.classIdentifier === classIdent).map(toOption);
}
