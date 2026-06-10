/**
 * Localize a key with the CLDR plural category for `count`, appended as a
 * lowercase suffix (`.one`/`.two`/`.few`/`.many`/`.other`/`.zero`) to match
 * Foundry's `game.i18n.pluralRules` and dnd5e's plural key convention.
 * @param {string} key Base localization key; the plural-category suffix is appended.
 * @param {number} count Cardinal count selecting the plural form.
 * @param {object} [data] Format substitutions; `count` is always included.
 * @returns {string} Localized, formatted string.
 */
export function locP(key, count, data = {}) {
  return game.i18n.format(`${key}.${game.i18n.pluralRules.select(count)}`, { count, ...data });
}

globalThis._locP = locP;
