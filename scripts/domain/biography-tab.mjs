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
      traits: draft.traits ?? '',
      ideals: draft.ideals ?? '',
      bonds: draft.bonds ?? '',
      flaws: draft.flaws ?? '',
      appearance: draft.appearance ?? '',
      backstory: draft.backstory ?? ''
    }
  };
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
