/** @type {string} Prefix shared by every advancement-pick hidden input's `name`. */
export const ADVANCEMENT_FIELD_PREFIX = 'advancements.';

/**
 * Compose the hidden-input `name` used to persist a single advancement pick.
 * @param {string} advancementId Advancement id from `Advancement#id`.
 * @param {number} level Class level being applied.
 * @returns {string} Form-field name.
 */
export function advancementFieldName(advancementId, level) {
  return `${ADVANCEMENT_FIELD_PREFIX}${advancementId}.${level}`;
}

/**
 * Parse a hidden-input name back into its advancement id + level.
 * @param {string} name Form-field name produced by `advancementFieldName`.
 * @returns {?{advancementId:string, level:number}} Parts, or null when name doesn't match.
 */
export function parseAdvancementFieldName(name) {
  if (!name?.startsWith(ADVANCEMENT_FIELD_PREFIX)) return null;
  const rest = name.slice(ADVANCEMENT_FIELD_PREFIX.length);
  const dot = rest.lastIndexOf('.');
  if (dot < 1) return null;
  const advancementId = rest.slice(0, dot);
  const level = Number(rest.slice(dot + 1));
  if (!advancementId || !Number.isFinite(level)) return null;
  return { advancementId, level };
}

/**
 * Snapshot every advancement-pick hidden input under `scope` into a nested map.
 * @param {?Element} scope DOM scope (typically the wizard element).
 * @returns {Object<string, Object<number, object>>} `{[advancementId]: {[level]: pickData}}`.
 */
export function readAdvancementDraft(scope) {
  const out = {};
  if (!scope) return out;
  for (const el of scope.querySelectorAll(`input[type="hidden"][name^="${ADVANCEMENT_FIELD_PREFIX}"]`)) {
    const parsed = parseAdvancementFieldName(el.name);
    if (!parsed) continue;
    const raw = el.value;
    if (!raw) continue;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    (out[parsed.advancementId] ??= {})[parsed.level] = data;
  }
  return out;
}

/**
 * Parse a flat saved-draft map into the nested advancement-pick shape, mirroring `readAdvancementDraft` for non-DOM sources (draft restore).
 * @param {Object<string, *>} flat Flat draft keyed by hidden-input `name`.
 * @returns {Object<string, Object<number, object>>} `{[advancementId]: {[level]: pickData}}`.
 */
export function advancementDraftFromFlat(flat) {
  const out = {};
  for (const [name, raw] of Object.entries(flat || {})) {
    const parsed = parseAdvancementFieldName(name);
    if (!parsed || !raw) continue;
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    (out[parsed.advancementId] ??= {})[parsed.level] = data;
  }
  return out;
}
