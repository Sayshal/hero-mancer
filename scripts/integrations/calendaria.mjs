import { MODULE } from '../constants.mjs';
import { emitSocketEvent, onSocketEvent, SOCKET_EVENTS } from '../sockets.mjs';

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
    ATLAS.log(2, 'createBirthdayNote failed:', err);
  }
}

/**
 * Record a character milestone as a Calendaria note under the `character-history` preset.
 * @param {object} actor Actor the milestone belongs to.
 * @param {object} milestone Milestone details.
 * @param {'created'|'levelUp'} milestone.type Milestone kind.
 * @param {string} [milestone.className] Class gained or advanced (level-ups only).
 * @param {number} [milestone.classLevel] New level in that class (level-ups only).
 * @param {boolean} [milestone.multiclass] Whether the level-up added a new class.
 * @returns {Promise<void>}
 */
export async function createHistoryNote(actor, { type, className, classLevel, multiclass = false }) {
  if (!MODULE.COMPAT?.CALENDARIA || !actor?.uuid) return;
  const originalClass = actor.items.get(actor.system?.details?.originalClass) ?? actor.items.find((i) => i.type === 'class');
  const payload = {
    type,
    uuid: actor.uuid,
    name: actor.name,
    className: className ?? originalClass?.name ?? '',
    classLevel: classLevel ?? (Number(originalClass?.system?.levels) || 0),
    characterLevel: Number(actor.system?.details?.level) || 0,
    multiclass
  };
  if (CALENDARIA.api.canManageNotes?.() === false) return emitSocketEvent(SOCKET_EVENTS.HISTORY_NOTE, payload);
  await writeHistoryNote(payload);
}

/**
 * Write the character-history note itself.
 * @param {object} milestone Milestone payload built by `createHistoryNote`.
 * @param {'created'|'levelUp'} milestone.type Milestone kind.
 * @param {string} milestone.uuid Actor uuid, stored as the note subject.
 * @param {string} milestone.name Actor name.
 * @param {string} milestone.className Class gained or advanced.
 * @param {number} milestone.classLevel New level in that class.
 * @param {number} milestone.characterLevel New total character level.
 * @param {boolean} milestone.multiclass Whether the level-up added a new class.
 * @returns {Promise<void>}
 */
async function writeHistoryNote({ type, uuid, name, className, classLevel, characterLevel, multiclass }) {
  const date = getCurrentCalendarDate();
  if (!date) return;
  const created = type === 'created';
  const contentKey = created ? 'Created' : multiclass ? 'Multiclass' : 'LevelUp';
  try {
    await CALENDARIA.api.createNote({
      name: _loc(created ? 'HEROMANCER.Calendar.CreatedName' : 'HEROMANCER.Calendar.LevelUpName', { name, level: characterLevel }),
      content: `<p>${_loc(`HEROMANCER.Calendar.${contentKey}Content`, { name, class: className, classLevel, level: characterLevel })}</p>`,
      startDate: date,
      categories: ['character-history'],
      icon: 'fas fa-user-clock',
      color: '#e599f7',
      displayStyle: 'pip',
      subjects: [uuid],
      openSheet: false
    });
  } catch (err) {
    ATLAS.log(2, 'createHistoryNote failed:', err);
  }
}

/** Wire the GM-side writer for milestones relayed by players who cannot manage notes. */
export function registerHistoryNoteSocket() {
  onSocketEvent(SOCKET_EVENTS.HISTORY_NOTE, (data) => {
    if (game.users.activeGM?.isSelf) writeHistoryNote(data);
  });
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
