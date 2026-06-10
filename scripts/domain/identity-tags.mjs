/**
 * Build display chips and extra search keywords for an identity selector option.
 * @param {object} entry Slim DocEntry from the document loader.
 * @param {string} type Foundry item subtype: `background`, `race`, `class`, or `subclass`.
 * @returns {{tags: string[], keywords: string[]}} Display chips and search-only synonyms.
 */
export function buildIdentityTags(entry, type) {
  const tags = [];
  const keywords = [];
  const book = entry.system?.source?.book || game.packs.get(entry.packId)?.metadata?.flags?.dnd5e?.sourceBook || '';
  if (book) {
    tags.push(book);
    const full = CONFIG.DND5E.sourceBooks?.[book];
    if (full) keywords.push(_loc(full));
  }
  const rules = entry.system?.source?.rules;
  if (rules) tags.push(rules);
  if (type === 'class') classTags(entry, tags, keywords);
  else if (type === 'race') speciesTags(entry, tags);
  else if (type === 'background') skillTags(entry, tags);
  return { tags, keywords };
}

/**
 * Append hit-die, primary-ability, and caster chips for a class; the full ability names go to keywords.
 * @param {object} entry Slim DocEntry.
 * @param {string[]} tags Display chips to append to.
 * @param {string[]} keywords Search synonyms to append to.
 */
function classTags(entry, tags, keywords) {
  const hd = entry.system?.hd?.denomination;
  if (hd) tags.push(hd);
  const abilities = [...(entry.system?.primaryAbility?.value ?? [])];
  if (abilities.length) {
    tags.push(abilities.map((a) => _loc(CONFIG.DND5E.abilities[a]?.abbreviation ?? a).toUpperCase()).join('/'));
    for (const a of abilities) keywords.push(_loc(CONFIG.DND5E.abilities[a]?.label ?? a));
  }
  const progression = entry.system?.spellcasting?.progression;
  if (progression && progression !== 'none') tags.push(game.i18n.has(`HEROMANCER.App.Identity.Caster.${progression}`) ? _loc(`HEROMANCER.App.Identity.Caster.${progression}`) : progression);
}

/**
 * Normalize an item's advancement field to an array.
 * @param {object} entry Slim DocEntry.
 * @returns {object[]} Advancement entries.
 */
function advancementArray(entry) {
  const raw = entry.system?.advancement;
  return Array.isArray(raw) ? raw : raw ? Object.values(raw) : [];
}

/**
 * Append size, speed, and creature-type chips for a species.
 * @param {object} entry Slim DocEntry.
 * @param {string[]} tags Display chips to append to.
 */
function speciesTags(entry, tags) {
  const sizes = [...(advancementArray(entry).find((a) => a.type === 'Size')?.configuration?.sizes ?? [])];
  if (sizes.length) tags.push(sizes.map((s) => _loc(CONFIG.DND5E.actorSizes[s]?.label ?? s)).join('/'));
  const walk = entry.system?.movement?.walk;
  if (walk) tags.push(`${walk} ${entry.system.movement.units || 'ft'}`);
  const creatureType = entry.system?.type?.value;
  if (creatureType) tags.push(_loc(CONFIG.DND5E.creatureTypes[creatureType]?.label ?? creatureType));
}

/**
 * Append granted-skill chips for a background.
 * @param {object} entry Slim DocEntry.
 * @param {string[]} tags Display chips to append to.
 */
function skillTags(entry, tags) {
  const skills = new Set();
  for (const advancement of advancementArray(entry)) {
    if (advancement.type !== 'Trait') continue;
    for (const grant of advancement.configuration?.grants ?? []) if (grant.startsWith('skills:')) skills.add(grant.slice(7));
  }
  for (const key of skills) tags.push(_loc(CONFIG.DND5E.skills[key]?.label ?? key));
}
