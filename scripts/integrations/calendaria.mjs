import { MODULE } from '../constants.mjs';
import { log } from '../utils/logger.mjs';

/**
 * Create a Calendaria note for a character's birthday under Calendaria's built-in `birthday` preset.
 * @param {object} actor Newly created actor (used for name).
 * @param {{year:number, month:number, day:number}} birthday Birthday date in public (1-indexed) format.
 * @returns {Promise<void>}
 */
export async function createBirthdayNote(actor, birthday) {
  if (!MODULE.COMPAT?.CALENDARIA || !birthday?.year || !birthday?.month || !birthday?.day) return;
  if (CALENDARIA.api.canManageNotes?.() === false) return;
  try {
    await CALENDARIA.api.createNote({
      name: _loc('HEROMANCER.App.Start.Birthday.NoteName', { name: actor.name }),
      startDate: { year: birthday.year, month: birthday.month, day: birthday.day },
      conditionTree: yearlyConditionTree(birthday.month, birthday.day),
      categories: ['birthday'],
      icon: 'fas fa-cake-candles',
      color: '#ff6b6b',
      openSheet: false
    });
  } catch (err) {
    log(2, 'createBirthdayNote failed:', err);
  }
}

/**
 * Build a Calendaria condition tree that recurs every year.
 * @param {number} month Birth month (public 1-indexed).
 * @param {number} day Birth day (public 1-indexed).
 * @returns {object} Yearly-recurrence condition tree.
 */
function yearlyConditionTree(month, day) {
  return {
    type: 'group',
    mode: 'and',
    children: [
      { type: 'condition', field: 'month', op: '==', value: month },
      { type: 'condition', field: 'day', op: '==', value: day }
    ]
  };
}

/**
 * Build the birthday-picker context for the Start tab. Returns null when Calendaria isn't active.
 * @param {?{year:number, month:number, day:number}} value Saved birthday from the draft.
 * @returns {?{months:object[], days:object[], yearValue:number, monthValue:number, dayValue:number, agePreview:string, defaultYear:number}} Render-ready context for the birthday form-group.
 */
export function buildBirthdayContext(value) {
  if (!MODULE.COMPAT?.CALENDARIA) return null;
  const calendar = CALENDARIA.api.getActiveCalendar();
  if (!calendar) return null;
  const current = CALENDARIA.api.getCurrentDateTime();
  const defaultYear = (current?.year ?? 0) - 25;
  const yearValue = Number(value?.year) || defaultYear;
  const monthValue = Number(value?.month) || 1;
  const dayValue = Number(value?.day) || 1;
  const months = calendar.monthsArray.map((m, i) => ({ value: i + 1, label: game.i18n.localize(m.name), selected: i + 1 === monthValue }));
  const monthIdx = Math.max(0, Math.min(calendar.monthsArray.length - 1, monthValue - 1));
  const yearZero = calendar.years?.yearZero ?? 0;
  const daysInMonth = calendar.getDaysInMonth?.(monthIdx, yearValue - yearZero) ?? 30;
  const days = Array.from({ length: daysInMonth }, (_, i) => ({ value: i + 1, selected: i + 1 === dayValue }));
  const agePreview = current?.year ? _loc('HEROMANCER.App.Start.Birthday.Age', { age: computeAge(current, yearValue, monthValue, dayValue) }) : '';
  return { months, days, yearValue, monthValue, dayValue, defaultYear, agePreview };
}

/**
 * Compute whole-years age from the current Calendaria date and a birth date, subtracting a year when the birthday has not yet occurred this year.
 * @param {?{year:number, month:number, day:number}} current Current calendar date (public 1-indexed).
 * @param {number} birthYear Birth year (public format).
 * @param {number} birthMonth Birth month (public 1-indexed); defaults to 1.
 * @param {number} birthDay Birth day (public 1-indexed); defaults to 1.
 * @returns {number} Age in whole years (>= 0).
 */
export function computeAge(current, birthYear, birthMonth = 1, birthDay = 1) {
  if (!current?.year || !Number.isFinite(birthYear)) return 0;
  let age = current.year - birthYear;
  if (current.month < birthMonth || (current.month === birthMonth && current.day < birthDay)) age -= 1;
  return Math.max(0, age);
}

/**
 * Get the current Calendaria date (public 1-indexed format), or null when Calendaria is inactive.
 * @returns {?{year:number, month:number, day:number}} Current date.
 */
export function getCurrentCalendarDate() {
  if (!MODULE.COMPAT?.CALENDARIA) return null;
  const current = CALENDARIA.api.getCurrentDateTime();
  return current?.year ? { year: current.year, month: current.month, day: current.day } : null;
}
