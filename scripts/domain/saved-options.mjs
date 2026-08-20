import { MODULE } from '../constants.mjs';
import { advancementList } from './advancement-chooser.mjs';
import { advancementDraftFromFlat, advancementFieldName, advancementKey } from './advancement-draft.mjs';

const FLAG = MODULE.FLAGS.WIZARD_DRAFT;

/** @type {RegExp} Advancement-pick draft key saved before picks were keyed by their parent item's source uuid. */
const LEGACY_PICK_KEY = /^advancements\.([^.|]+)\.(\d+)$/;

/** @type {RegExp} Equipment trait-link draft key saved before picks were keyed by their parent item's source uuid. */
const LEGACY_LINK_KEY = /^(equipment\.(?:class|background)\.advLink\.)([^.|]+)(\.\d+\.\d+)$/;

/** @type {RegExp} Flat-draft key holding one of the identity tab's selected document uuids. */
const IDENTITY_UUID_KEY = /^identity\.(?:background|species|classes\.[^.]+\.(?:uuid|subclassUuid))$/;

/** @type {number} Grant-recursion cap, mirroring the chooser's nested-row depth limit. */
const NESTED_SOURCE_DEPTH = 3;

/**
 * Persist a draft to the active user's flag.
 * @param {Object<string, *>} draft Field map to store.
 * @returns {Promise<*>} Foundry's `setFlag` result, or null if no draft was passed.
 */
export async function save(draft) {
  if (!draft) return null;
  ATLAS.log(3, `saved-options.save: ${Object.keys(draft).length} field(s)`);
  return game.user.setFlag(MODULE.ID, FLAG, { json: JSON.stringify(draft) });
}

/**
 * Read the active user's draft, re-keying any pre-composite advancement keys it still carries.
 * @returns {Promise<?Object<string, *>>} Stored draft, or null when unset.
 */
export async function load() {
  const stored = game.user.getFlag(MODULE.ID, FLAG);
  if (!stored?.json) return null;
  const draft = JSON.parse(stored.json);
  ATLAS.log(3, `saved-options.load: ${draft ? Object.keys(draft).length : 0} field(s)`);
  if (!draft) return null;
  const rekeyed = await rekeyAdvancementDraft(draft);
  if (!rekeyed) return draft;
  await save(rekeyed);
  return rekeyed;
}

/**
 * Remove the active user's draft.
 * @param {string} [reason] Caller context tag included in the verbose log.
 * @returns {Promise<*>} Foundry's `unsetFlag` result.
 */
export async function clear(reason) {
  ATLAS.log(3, reason ? `saved-options.clear (${reason})` : 'saved-options.clear');
  return game.user.unsetFlag(MODULE.ID, FLAG);
}

/**
 * Rewrite a stored draft's id-only advancement keys into the composite `{sourceUuid}|{advId}` shape.
 * @param {Object<string, *>} draft Flat draft read from the flag.
 * @returns {Promise<?Object<string, *>>} Rewritten draft, or null when nothing needed re-keying.
 */
async function rekeyAdvancementDraft(draft) {
  if (!Object.keys(draft).some((key) => LEGACY_PICK_KEY.test(key) || LEGACY_LINK_KEY.test(key))) return null;
  const sources = await advancementSourceUuids(draft);
  const out = {};
  let changed = false;
  for (const [name, value] of Object.entries(draft)) {
    const rekeyed = rekeyDraftField(name, sources);
    if (rekeyed !== name) changed = true;
    out[rekeyed] = value;
  }
  if (!changed) return null;
  ATLAS.log(3, 'saved-options.load: re-keyed pre-composite advancement draft keys');
  return out;
}

/**
 * Map every advancement id reachable from the draft's selected documents onto the uuid of the item carrying it, descending into granted items so nested picks resolve too.
 * @param {Object<string, *>} draft Flat draft read from the flag.
 * @returns {Promise<Object<string, string>>} Advancement id -> source uuid.
 */
async function advancementSourceUuids(draft) {
  const picks = advancementDraftFromFlat(draft);
  const out = {};
  const visited = new Set();
  for (const [key, value] of Object.entries(draft)) {
    if (value && typeof value === 'string' && IDENTITY_UUID_KEY.test(key)) await collectSourceUuids(value, picks, out, visited, 0);
  }
  return out;
}

/**
 * Record every advancement one document carries, then recurse into the items its grant/choice advancements hand the player.
 * @param {string} uuid Document uuid to walk.
 * @param {Object<string, Object<number, object>>} picks Draft picks keyed by their pre-composite advancement id.
 * @param {Object<string, string>} out Advancement id -> source uuid accumulator.
 * @param {Set<string>} visited Uuids already walked.
 * @param {number} depth Current recursion depth.
 * @returns {Promise<void>} Resolves once the branch has been walked.
 */
async function collectSourceUuids(uuid, picks, out, visited, depth) {
  if (!uuid || visited.has(uuid)) return;
  visited.add(uuid);
  const doc = await fromUuid(uuid);
  for (const adv of advancementList(doc)) {
    const id = adv?.id ?? adv?._id;
    if (!id) continue;
    if (!(id in out)) out[id] = adv.item?.uuid ?? uuid;
    if (depth >= NESTED_SOURCE_DEPTH) continue;
    for (const granted of grantedItemUuids(adv, picks[id])) await collectSourceUuids(granted, picks, out, visited, depth + 1);
  }
}

/**
 * Uuids of the items an advancement hands the player, read from its configuration for grants and from the stored pick for choices.
 * @param {object} adv Advancement instance.
 * @param {?Object<number, object>} byLevel This advancement's draft picks keyed by level.
 * @returns {string[]} Granted/selected item uuids.
 */
function grantedItemUuids(adv, byLevel) {
  const type = adv.type ?? adv.constructor?.typeName;
  if (type === 'ItemGrant') return (adv.configuration?.items ?? []).map((it) => it.uuid).filter(Boolean);
  const out = [];
  for (const pick of Object.values(byLevel ?? {})) {
    if (type === 'ItemChoice') out.push(...Object.values(pick?.added ?? {}));
    else if (type === 'AbilityScoreImprovement' && pick?.type === 'feat') out.push(pick.feat);
  }
  return out.filter(Boolean);
}

/**
 * Re-key one flat-draft field name, leaving names that are already composite or whose advancement can't be resolved untouched.
 * @param {string} name Flat-draft field name.
 * @param {Object<string, string>} sources Advancement id -> source uuid.
 * @returns {string} Field name in the current key shape.
 */
function rekeyDraftField(name, sources) {
  const pick = LEGACY_PICK_KEY.exec(name);
  if (pick) return sources[pick[1]] ? advancementFieldName(advancementKey(sources[pick[1]], pick[1]), Number(pick[2])) : name;
  const link = LEGACY_LINK_KEY.exec(name);
  if (!link) return name;
  return sources[link[2]] ? `${link[1]}${advancementKey(sources[link[2]], link[2])}${link[3]}` : name;
}
