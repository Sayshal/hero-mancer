/** @type {string} Prefix shared by every advancement-pick hidden input's `name`. */
export const ADVANCEMENT_FIELD_PREFIX = 'advancements.';

/** @type {string} Separator joining the parent item's source uuid, the advancement id, and the granting advancement id. Never occurs in any part. */
export const ADVANCEMENT_KEY_SEPARATOR = '|';

/**
 * Compose the draft key identifying one advancement.
 * @param {?string} sourceUuid Parent item's uuid, or null when unresolvable (legacy shape).
 * @param {string} advancementId Advancement id from `Advancement#id`.
 * @param {?string} [originId] Id of the advancement that granted the parent item, separating repeat grants of the same item.
 * @returns {string} Composite draft key.
 */
export function advancementKey(sourceUuid, advancementId, originId = null) {
  if (!sourceUuid) return advancementId;
  const key = `${sourceUuid}${ADVANCEMENT_KEY_SEPARATOR}${advancementId}`;
  return originId ? `${key}${ADVANCEMENT_KEY_SEPARATOR}${originId}` : key;
}

/**
 * Split a draft key back into its parts.
 * @param {string} key Draft key from `advancementKey`.
 * @returns {{sourceUuid:?string, advancementId:string, originId:?string}} Parts; `sourceUuid` null for legacy keys.
 */
export function splitAdvancementKey(key) {
  const [sourceUuid, advancementId, originId = null] = (key ?? '').split(ADVANCEMENT_KEY_SEPARATOR);
  if (advancementId === undefined || !sourceUuid) return { sourceUuid: null, advancementId: key ?? '', originId: null };
  return { sourceUuid, advancementId, originId };
}

/**
 * Whether an embedded item was granted by the advancement with the given id.
 * @param {object} item Embedded item.
 * @param {?string} originId Granting advancement id from `splitAdvancementKey`.
 * @returns {boolean} True when no origin is required or the item's `advancementOrigin` names it.
 */
export function grantedByAdvancement(item, originId) {
  return !originId || !!item.flags?.dnd5e?.advancementOrigin?.endsWith(`.${originId}`);
}

/**
 * Compose the hidden-input `name` used to persist a single advancement pick.
 * @param {string} key Draft key from `advancementKey`.
 * @param {number} level Class level being applied.
 * @returns {string} Form-field name.
 */
export function advancementFieldName(key, level) {
  return `${ADVANCEMENT_FIELD_PREFIX}${key}.${level}`;
}

/**
 * Parse a hidden-input name back into its draft key + level.
 * @param {string} name Form-field name produced by `advancementFieldName`.
 * @returns {?{key:string, level:number}} Parts, or null when name doesn't match.
 */
export function parseAdvancementFieldName(name) {
  if (!name?.startsWith(ADVANCEMENT_FIELD_PREFIX)) return null;
  const rest = name.slice(ADVANCEMENT_FIELD_PREFIX.length);
  const dot = rest.lastIndexOf('.');
  if (dot < 1) return null;
  const key = rest.slice(0, dot);
  const level = Number(rest.slice(dot + 1));
  if (!key || !Number.isFinite(level)) return null;
  return { key, level };
}

/**
 * Snapshot every advancement-pick hidden input under `scope` into a nested map.
 * @param {?Element} scope DOM scope (typically the wizard element).
 * @returns {Object<string, Object<number, object>>} `{[draftKey]: {[level]: pickData}}`.
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
    (out[parsed.key] ??= {})[parsed.level] = data;
  }
  return out;
}

/**
 * Parse a flat saved-draft map into the nested advancement-pick shape, mirroring `readAdvancementDraft` for non-DOM sources (draft restore).
 * @param {Object<string, *>} flat Flat draft keyed by hidden-input `name`.
 * @returns {Object<string, Object<number, object>>} `{[draftKey]: {[level]: pickData}}`.
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
    (out[parsed.key] ??= {})[parsed.level] = data;
  }
  return out;
}
