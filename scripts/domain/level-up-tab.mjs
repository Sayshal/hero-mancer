import { getEntries, getFullDocument } from '../data/document-loader.mjs';
import { buildSubclassCombo } from './identity-tab.mjs';
import { buildLevelUpPreview } from './level-up-preview.mjs';
import { buildMulticlassImpact } from './multiclass-impact.mjs';
import { checkMulticlassPrereq, formatPrereqChipLabel, formatPrereqLabel } from './multiclass-prereqs.mjs';
import { getEligibleSubclasses, getSubclassThreshold } from './subclass.mjs';

/**
 * Build the level-up tab context: existing-class tiles + multiclass-eligible-class tiles grouped by source ruleset.
 * @param {object} args Build inputs.
 * @param {object} args.actor Target actor.
 * @param {{classes: Array, totalLevel: number}} args.roster Snapshot from `snapshotActorClasses`.
 * @param {?string} args.pickedUuid Currently-picked class uuid (from form draft).
 * @param {?string} [args.pickedSubclass] Currently-picked subclass uuid (from level-up combobox).
 * @returns {object} Render context.
 */
export async function buildLevelUpContext({ actor, roster, pickedUuid, pickedSubclass = null }) {
  const abilities = readActorAbilities(actor);
  const existingIdentifiers = new Set(roster.classes.map((c) => c.identifier).filter(Boolean));
  const actorRules = roster.classes.map((c) => c.sourceRules).filter(Boolean);
  const primaryRules = actorRules[0] ?? null;
  const existingTiles = roster.classes.map((c) => ({ uuid: c.uuid, name: c.name, img: c.img, level: c.level, nextLevel: c.level + 1, selected: c.uuid === pickedUuid }));
  const eligible = getEntries('class')
    .filter((entry) => {
      const id = entry.system?.identifier;
      return id && !existingIdentifiers.has(id);
    })
    .map((entry) => {
      const { passes, prereq, failed } = checkMulticlassPrereq(entry, abilities);
      const book = entry.system?.source?.book?.trim() || '';
      return {
        uuid: entry.uuid,
        name: entry.name,
        img: entry.img,
        identifier: entry.system?.identifier,
        rules: entry.system?.source?.rules ?? null,
        book,
        passes,
        prereqLabel: prereq ? formatPrereqLabel(prereq) : '',
        prereqChipLabel: passes ? '' : formatPrereqChipLabel(failed, abilities),
        selected: entry.uuid === pickedUuid
      };
    });
  const multiclassGroups = groupBySourceRules(eligible, primaryRules);
  const pickResult = pickedUuid ? await resolvePickedClass({ actor, roster, pickedUuid }) : null;
  const preview = pickResult ? buildLevelUpPreview({ actor, classDoc: pickResult.classDoc, newLevel: pickResult.newLevel, isMulticlass: pickResult.isMulticlass }) : null;
  const impact = pickResult?.isMulticlass ? buildMulticlassImpact({ actor, classDoc: pickResult.classDoc }) : null;
  const subclassPicker = pickResult ? await buildSubclassPicker({ pickResult, roster, pickedSubclass }) : null;
  return {
    actorName: actor.name,
    totalLevel: roster.totalLevel,
    pickedUuid: pickedUuid ?? '',
    existingTiles,
    multiclassGroups,
    hasMulticlassOptions: multiclassGroups.some((g) => g.tiles.length > 0),
    preview,
    impact,
    subclassPicker
  };
}

/**
 * Build the subclass-picker context when the picked class hits its subclass-grant level and the actor has no subclass for it yet.
 * @param {object} args Picker inputs.
 * @param {{classDoc:object, newLevel:number, isMulticlass:boolean}} args.pickResult Resolved class pick.
 * @param {{classes: Array}} args.roster Roster snapshot.
 * @param {?string} args.pickedSubclass Currently-picked subclass uuid.
 * @returns {Promise<?{combo:object, className:string, threshold:number}>} Picker shell, or null when not applicable.
 */
async function buildSubclassPicker({ pickResult, roster, pickedSubclass }) {
  const { classDoc, newLevel, isMulticlass } = pickResult;
  const threshold = getSubclassThreshold(classDoc);
  if (!threshold || threshold > newLevel) return null;
  if (!isMulticlass) {
    const existing = roster.classes.find((c) => c.uuid === classDoc.uuid || c.id === classDoc.id);
    if (existing?.subclassUuid) return null;
  }
  const sourceDoc = await resolveClassSourceDoc(classDoc);
  const options = getEligibleSubclasses(sourceDoc);
  if (!options.length) return null;
  const combo = buildSubclassCombo(pickedSubclass ?? '', options, { id: 'level-up-subclass', name: 'levelUp.pickedSubclass' });
  return { combo, className: classDoc.name, threshold };
}

/**
 * Resolve the compendium source doc for a class — actor-embedded items lose `.pack`, so fall back to `flags.core.sourceId`.
 * @param {object} classDoc Class document (compendium or actor-embedded).
 * @returns {Promise<object>} Source-pack-aware class doc usable by `getEligibleSubclasses`.
 */
async function resolveClassSourceDoc(classDoc) {
  if (classDoc?.pack) return classDoc;
  const srcId = classDoc?.flags?.core?.sourceId ?? classDoc?._stats?.compendiumSource;
  if (!srcId) return classDoc;
  return (await fromUuid(srcId)) ?? classDoc;
}

/**
 * Resolve the picked-class doc + derive new-level + multiclass flag from the roster match.
 * @param {{actor: object, roster: object, pickedUuid: string}} args Picker state.
 * @returns {Promise<?{classDoc: object, newLevel: number, isMulticlass: boolean}>} Resolved pick, or null when class can't resolve.
 */
async function resolvePickedClass({ actor, roster, pickedUuid }) {
  const existing = roster.classes.find((c) => c.uuid === pickedUuid);
  const isMulticlass = !existing;
  const classDoc = existing ? actor.items.get(existing.id) : await getFullDocument(pickedUuid);
  if (!classDoc) return null;
  const newLevel = existing ? existing.level + 1 : 1;
  return { classDoc, newLevel, isMulticlass };
}

/**
 * Bucket eligible-class tiles by source rules, marking the actor's primary ruleset group as the same-source bucket.
 * @param {Array} tiles Decorated tile entries with `rules` field.
 * @param {?string} primaryRules Actor's primary class ruleset (`2014`/`2024`), or null when unknown.
 * @returns {Array<{rules: string, label: string, isSameSource: boolean, tiles: Array}>} Groups in display order.
 */
function groupBySourceRules(tiles, primaryRules) {
  const buckets = new Map();
  for (const tile of tiles) {
    const rules = tile.rules ?? 'unknown';
    if (!buckets.has(rules)) buckets.set(rules, []);
    buckets.get(rules).push(tile);
  }
  const groups = [...buckets.entries()].map(([rules, list]) => ({
    rules,
    label: rulesLabel(rules),
    isSameSource: primaryRules != null && rules === primaryRules,
    tiles: list.sort((a, b) => a.name.localeCompare(b.name))
  }));
  groups.sort((a, b) => Number(b.isSameSource) - Number(a.isSameSource) || a.rules.localeCompare(b.rules));
  return groups;
}

/**
 * Human-friendly label for a ruleset bucket key.
 * @param {string} rules `2014`/`2024`/`unknown`.
 * @returns {string} Localized label.
 */
function rulesLabel(rules) {
  if (rules === '2014' || rules === '2024') return _loc(`HEROMANCER.LevelUp.Source.rules-${rules}`);
  return _loc('HEROMANCER.LevelUp.Source.rules-unknown');
}

/**
 * Read the six ability scores off the actor as a plain `{key: number}` map.
 * @param {object} actor Actor.
 * @returns {Object<string, number>} Score map.
 */
function readActorAbilities(actor) {
  const out = {};
  const abilities = actor.system?.abilities ?? {};
  for (const [key, data] of Object.entries(abilities)) out[key] = Number(data?.value) || 0;
  return out;
}
