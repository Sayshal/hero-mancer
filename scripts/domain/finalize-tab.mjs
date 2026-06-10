import { buildProficiencyCategories } from '../data/proficiency-extractor.mjs';

/**
 * Format a race document's movement block into a readable string.
 * @param {?object} movement `system.movement` object.
 * @returns {string} Comma-separated speed list, or em-dash when empty.
 */
function formatMovement(movement) {
  if (!movement) return '—';
  const units = movement.units ?? 'ft';
  const parts = [];
  for (const [key, cfg] of Object.entries(CONFIG.DND5E.movementTypes ?? {})) {
    if (cfg.hidden) continue;
    const v = movement[key];
    if (!v) continue;
    let label = `${cfg.label} ${v} ${units}`;
    if (key === 'fly' && movement.hover) label += ` (${_loc('DND5E.MOVEMENT.Hover')})`;
    parts.push(label);
  }
  if (movement.special) parts.push(movement.special);
  return parts.length ? parts.join(', ') : '—';
}

/**
 * Format a race document's senses block into a readable string.
 * @param {?object} senses `system.senses` object.
 * @returns {string} Comma-separated senses list, or em-dash when empty.
 */
function formatSenses(senses) {
  if (!senses) return '—';
  const units = senses.units ?? 'ft';
  const parts = [];
  for (const [key, label] of Object.entries(CONFIG.DND5E.senses ?? {})) {
    const v = senses[key];
    if (v) parts.push(`${label} ${v} ${units}`);
  }
  if (senses.special) parts.push(senses.special);
  return parts.length ? parts.join(', ') : '—';
}

/**
 * Resolve a race document's creature-type label, preferring dnd5e's `.label` getter and falling back to `formatCreatureType`.
 * @param {?object} typeData `system.type` value.
 * @returns {string} Formatted creature type, or em-dash when unresolvable.
 */
function formatCreatureType(typeData) {
  if (!typeData) return '—';
  if (typeData.label) return typeData.label;
  if (typeData.value) return dnd5e.documents.Actor5e.formatCreatureType(typeData);
  return '—';
}

/**
 * Whether a doc's spellcasting progression contributes to the actor's spellcaster status.
 * @param {?object} doc Class or subclass document.
 * @returns {boolean} True when progression exists and is not `none`.
 */
function isProgressionSpellcaster(doc) {
  const progression = doc?.system?.spellcasting?.progression;
  return !!progression && progression !== 'none';
}

/**
 * Build the finalize-tab context from current form drafts and resolved docs.
 * @param {object} args Aggregated wizard state.
 * @param {object} [args.start] Start-tab draft (character name, art).
 * @param {object} [args.identity] Identity-tab draft (uuids per section).
 * @param {object} [args.abilities] Abilities-tab draft (per-ability values).
 * @param {object} [args.biography] Biography-tab draft.
 * @param {Array<{classDoc:?object, subclassDoc:?object, level:number, isPrimary:boolean}>} args.classRoster Per-class inputs (one slot per class).
 * @param {?object} [args.speciesDoc] Full species Document.
 * @param {?object} [args.backgroundDoc] Full background Document.
 * @param {number} [args.effectiveLevel] Resolved starting level (1-20).
 * @param {?object} [args.equipmentReview] Result of `buildEquipmentReview`.
 * @param {boolean} [args.skipSpellHandoff] Current value of the skip-spell-handoff checkbox.
 * @param {?Object<string, number>} [args.asiBonus] Total ASI bonus per ability key, accumulated across class, subclass, race, and background advancements.
 * @returns {object} Render-ready finalize-tab context.
 */
export function buildFinalizeContext({
  start = {},
  identity: _identity = {},
  abilities = {},
  biography = {},
  classRoster = [],
  speciesDoc = null,
  backgroundDoc = null,
  effectiveLevel = 1,
  equipmentReview = null,
  skipSpellHandoff = false,
  asiBonus = null
} = {}) {
  const docs = [...classRoster.flatMap((s) => [s.classDoc, s.subclassDoc]), speciesDoc, backgroundDoc].filter(Boolean);
  const proficiencies = buildProficiencyCategories(docs);
  const abilityKeys = Object.keys(CONFIG.DND5E.abilities ?? {});
  const abilityRows = abilityKeys.map((key) => {
    const cfg = CONFIG.DND5E.abilities[key];
    const baseValue = Number(abilities[key]?.value ?? 10);
    const bonus = Number(asiBonus?.[key]) || 0;
    const value = baseValue + bonus;
    return { key, label: cfg.label, abbr: cfg.abbreviation, value, baseValue, bonus, modifier: Math.floor((value - 10) / 2) };
  });
  const isSpellcaster = classRoster.some((slot) => isProgressionSpellcaster(slot.classDoc) || isProgressionSpellcaster(slot.subclassDoc));
  const raceProfile = speciesDoc
    ? {
        speed: formatMovement(speciesDoc.system?.movement),
        senses: formatSenses(speciesDoc.system?.senses),
        creatureType: formatCreatureType(speciesDoc.system?.type)
      }
    : null;
  const classes = classRoster.map((slot) => ({ name: slot.classDoc?.name ?? '—', level: slot.level, subclassName: slot.subclassDoc?.name ?? null, isPrimary: !!slot.isPrimary }));
  const totalLevel = classes.reduce((sum, c) => sum + (Number(c.level) || 0), 0) || effectiveLevel;
  return {
    effectiveLevel,
    isSpellcaster,
    skipSpellHandoff,
    basicInfo: {
      characterName: start.characterName || start['character-name'] || '',
      portraitImg: start.characterArt || start['character-art'] || null,
      speciesName: speciesDoc?.name ?? '—',
      backgroundName: backgroundDoc?.name ?? '—',
      classes,
      totalLevel,
      multiclass: classes.length > 1
    },
    raceProfile,
    abilityRows,
    proficiencies,
    equipmentReview,
    biography: {
      alignment: biography.alignment ?? '',
      faith: biography.faith ?? '',
      gender: biography.gender ?? '',
      age: biography.age ?? '',
      eyes: biography.eyes ?? '',
      hair: biography.hair ?? '',
      skin: biography.skin ?? '',
      height: biography.height ?? '',
      weight: biography.weight ?? '',
      traits: biography.traits ?? '',
      ideals: biography.ideals ?? '',
      bonds: biography.bonds ?? '',
      flaws: biography.flaws ?? '',
      appearance: biography.appearance ?? '',
      backstory: biography.backstory ?? ''
    }
  };
}
