import { computeAge, getCurrentCalendarDate } from '../integrations/calendaria.mjs';

/**
 * Build the biography-tab context.
 * @param {object} [draft] Saved draft values for the biography tab.
 * @param {object} [startDraft] Camel-cased Start-tab draft.
 * @returns {object} Render-ready biography-tab context.
 */
export function buildBiographyContext(draft = {}, startDraft = {}) {
  return {
    value: {
      alignment: draft.alignment ?? '',
      faith: draft.faith ?? '',
      gender: draft.gender ?? '',
      eyes: draft.eyes ?? '',
      hair: draft.hair ?? '',
      skin: draft.skin ?? '',
      age: draft.age || deriveAgeFromBirthday(startDraft?.birthday),
      height: draft.height ?? '',
      weight: draft.weight ?? '',
      trait: draft.trait ?? '',
      ideal: draft.ideal ?? '',
      bond: draft.bond ?? '',
      flaw: draft.flaw ?? '',
      appearance: draft.appearance ?? '',
      backstory: draft.backstory ?? ''
    }
  };
}

/**
 * @type {Object<string, string>} Pre-3.1.1 plural personality draft keys mapped onto their current singular names.
 * @since 3.1.0
 * @until 3.3.0
 */
const LEGACY_PERSONALITY_KEYS = { traits: 'trait', ideals: 'ideal', bonds: 'bond', flaws: 'flaw' };

/**
 * Rename pre-3.1.1 plural personality keys on a persisted biography draft, leaving current-shape drafts untouched.
 * @param {object} [draft] Biography draft from a stored payload (approval queue, resume seed, submitted-payload flag).
 * @returns {object} Draft using the current singular key names.
 */
export function migrateBiographyDraft(draft = {}) {
  const legacy = Object.entries(LEGACY_PERSONALITY_KEYS).filter(([plural]) => draft[plural] !== undefined);
  if (!legacy.length) return draft;
  const out = { ...draft };
  for (const [plural, singular] of legacy) {
    if (out[singular] === undefined || out[singular] === '') out[singular] = out[plural];
    delete out[plural];
  }
  return out;
}

/**
 * Compute whole-years age from the Calendaria current date and the saved birth date, matching the Start-tab picker's boundary-aware result.
 * @param {?{year:number, month:number, day:number}} birthday Birthday draft slice.
 * @returns {string} Age as a string, or empty when unavailable.
 */
function deriveAgeFromBirthday(birthday) {
  const current = getCurrentCalendarDate();
  const birthYear = Number(birthday?.year);
  if (!current || !Number.isFinite(birthYear)) return '';
  return String(computeAge(current, birthYear, Number(birthday?.month) || 1, Number(birthday?.day) || 1));
}
