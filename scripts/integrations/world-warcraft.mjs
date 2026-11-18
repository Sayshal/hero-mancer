const MODULE_ID = 'dnd-world-warcraft';

/** @type {WeakMap<Item, Map<string, Item>>} Customized clones per source document, keyed by hero class or badge. */
const cloneCache = new WeakMap();

/**
 * World of Warcraft module config when the module is active.
 * @returns {?object} Config namespace exposing `heroClasses` and `classIcons`.
 */
function wowConfig() {
  const mod = game.modules.get(MODULE_ID);
  return mod?.active ? mod.config : null;
}

/**
 * Hero-class variant definition for a class identifier.
 * @param {string} classIdentifier Base class identifier.
 * @param {string} heroClassId Hero-class identifier.
 * @returns {?object} Hero-class entry, or null when unknown.
 */
export function getHeroClass(classIdentifier, heroClassId) {
  if (!heroClassId) return null;
  return wowConfig()?.heroClasses?.[classIdentifier]?.find((c) => c.identifier === heroClassId) ?? null;
}

/**
 * Select context for a class row's hero-class variant, or null when the class has none.
 * @param {object} classEntry Class index entry.
 * @param {string} slotId Roster slot id.
 * @param {string} selected Selected hero-class identifier.
 * @returns {?{name: string, options: Array<{value: string, label: string, selected: boolean}>}} Select context.
 */
export function buildHeroClassSelect(classEntry, slotId, selected) {
  const heroClasses = wowConfig()?.heroClasses?.[classEntry.system.identifier];
  if (!heroClasses?.length) return null;
  const options = [{ value: '', label: classEntry.name, selected: !selected }, ...heroClasses.map((c) => ({ value: c.identifier, label: _loc(c.name), selected: c.identifier === selected }))];
  return { name: `identity.classes.${slotId}.heroClass`, options };
}

/**
 * Return the cached customized clone of a document, building it on first request.
 * @param {Item} doc Source document.
 * @param {string} key Customization key.
 * @param {function(Item): void} customize Mutates the fresh clone.
 * @returns {Item} Customized clone.
 */
function cachedClone(doc, key, customize) {
  if (!cloneCache.has(doc)) cloneCache.set(doc, new Map());
  const clones = cloneCache.get(doc);
  if (!clones.has(key)) {
    const clone = doc.clone({}, { keepId: true });
    customize(clone);
    clones.set(key, clone);
  }
  return clones.get(key);
}

/**
 * Swap Item Grant entries on a document's advancements by level and granted-item identifier.
 * @param {Item} item Class or subclass clone to mutate.
 * @param {Object<number, Object<string, string>>} replacements Level-keyed identifier-to-uuid swaps.
 */
function replaceFeatures(item, replacements) {
  for (const [level, swaps] of Object.entries(replacements)) {
    const advancement = item.advancement.byLevel[level]?.find((a) => a.type === 'ItemGrant');
    if (!advancement) continue;
    const items = advancement.toObject().configuration.items;
    for (const [identifier, uuid] of Object.entries(swaps)) {
      const entry = items.find((i) => fromUuidSync(i.uuid)?.system?.identifier === identifier);
      if (entry) entry.uuid = uuid;
    }
    advancement.updateSource({ 'configuration.items': items });
  }
}

/**
 * Apply WoW class customization to a class document: hero-class rename, art, fixed subclass and feature swaps, or the standard class badge.
 * @param {?Item} classDoc Class document.
 * @param {?string} heroClassId Selected hero-class identifier.
 * @returns {?Item} Customized clone, or the original document when WoW leaves it unchanged.
 */
export function applyHeroClass(classDoc, heroClassId) {
  const config = wowConfig();
  if (!config || !classDoc) return classDoc;
  const identifier = classDoc.system.identifier;
  const heroClass = getHeroClass(identifier, heroClassId);
  if (heroClass) {
    return cachedClone(classDoc, heroClass.identifier, (clone) => {
      if (heroClass.subclass) clone.advancement.byType.Subclass?.[0]?.updateSource({ 'configuration.suggested': { fixed: true, uuid: heroClass.subclass } });
      if (heroClass.replacedClassFeatures) replaceFeatures(clone, heroClass.replacedClassFeatures);
      clone.updateSource({ name: _loc(heroClass.name), img: heroClass.img, [`flags.${MODULE_ID}.heroClass`]: heroClass.identifier });
    });
  }
  const badge = game.settings.get(MODULE_ID, 'customizeClasses') ? config.classIcons?.[identifier] : null;
  if (!badge) return classDoc;
  return cachedClone(classDoc, badge, (clone) => clone.updateSource({ img: badge }));
}

/**
 * Apply the hero class's subclass feature swaps to a subclass document, reading the hero class from the customized class.
 * @param {?Item} subclassDoc Subclass document.
 * @param {?Item} classDoc Class document returned by `applyHeroClass`.
 * @returns {?Item} Customized clone, or the original document when no swaps apply.
 */
export function applyHeroSubclass(subclassDoc, classDoc) {
  const heroClassId = classDoc?.flags[MODULE_ID]?.heroClass;
  const replacements = getHeroClass(classDoc?.system.identifier, heroClassId)?.replacedSubclassFeatures;
  if (!subclassDoc || !replacements) return subclassDoc;
  return cachedClone(subclassDoc, heroClassId, (clone) => replaceFeatures(clone, replacements));
}
