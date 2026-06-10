import { MODULE } from './constants.mjs';
import { log } from './utils/logger.mjs';

// TODO(3.2.0): remove this module and its `ready` call once all active worlds have loaded a 3.x build at least once.

/** Legacy (pre-3.0) setting keys dropped in the rewrite; their orphaned world Setting documents are deleted. */
const REMOVED_KEYS = [
  'alignments',
  'backgroundPacks',
  'chainedRolls',
  'classPacks',
  'compactButton',
  'crossSourceSubclasses',
  'customStandardArray',
  'deities',
  'elkanCompatibility',
  'enable',
  'enableAlignmentFaithInputs',
  'enableNavigationButtons',
  'eyeColors',
  'genders',
  'hairColors',
  'itemPacks',
  'mandatoryFields',
  'racePacks',
  'rollDelay',
  'skinTones',
  'statGenerationSwapMode'
];

/** Legacy identity-section ids remapped to their current equivalents. */
const LEGACY_SECTION_IDS = { race: 'species' };

/** Canonical label key per identity-section id (drives `advancementOrder` repair). */
const SECTION_LABELS = { background: 'HEROMANCER.App.TabNames.background', species: 'HEROMANCER.App.TabNames.species', class: 'HEROMANCER.App.TabNames.class' };

/**
 * Clean up settings left behind by the pre-3.0 Hero Mancer, then whisper the GMs to refresh if anything actually changed.
 * @returns {Promise<void>}
 */
export async function migrateLegacySettings() {
  if (!game.user.isGM) return;
  const changes = [await renameCustomStandardArray(), await repairAdvancementOrder(), await repairAllowedMethods(), await deleteRemovedKeys()];
  if (changes.some(Boolean)) await notifyMigration();
}

/**
 * Copy a lingering legacy `customStandardArray` value into the current `standardArrayValues` key (same CSV shape).
 * @returns {Promise<boolean>} True when a value was migrated.
 */
async function renameCustomStandardArray() {
  const doc = game.settings.storage.get('world').find((s) => s.key === `${MODULE.ID}.customStandardArray`);
  if (!doc) return false;
  let value;
  try {
    value = JSON.parse(doc.value);
  } catch {
    value = doc.value;
  }
  await game.settings.set(MODULE.ID, MODULE.SETTINGS.STANDARD_ARRAY_VALUES, value);
  log(3, 'migration: customStandardArray -> standardArrayValues');
  return true;
}

/**
 * Repair `advancementOrder` entries persisted by the legacy module: remap `race` -> `species`, restore canonical labels, drop unknown/duplicate ids.
 * @returns {Promise<boolean>} True when the stored order was rewritten.
 */
async function repairAdvancementOrder() {
  const order = game.settings.get(MODULE.ID, MODULE.SETTINGS.ADVANCEMENT_ORDER);
  if (!Array.isArray(order)) return false;
  let changed = false;
  const seen = new Set();
  const repaired = [];
  for (const entry of order) {
    const id = LEGACY_SECTION_IDS[entry.id] ?? entry.id;
    if (!SECTION_LABELS[id] || seen.has(id)) {
      changed = true;
      continue;
    }
    seen.add(id);
    if (id !== entry.id || entry.label !== SECTION_LABELS[id]) changed = true;
    repaired.push({ ...entry, id, label: SECTION_LABELS[id] });
  }
  if (!changed) return false;
  await game.settings.set(MODULE.ID, MODULE.SETTINGS.ADVANCEMENT_ORDER, repaired);
  log(3, 'migration: repaired advancementOrder');
  return true;
}

/**
 * Repair `allowedMethods` persisted by the legacy module: rename the `manual` flag to `manualFormula`.
 * @returns {Promise<boolean>} True when the flag was renamed.
 */
async function repairAllowedMethods() {
  const methods = game.settings.get(MODULE.ID, MODULE.SETTINGS.ALLOWED_METHODS);
  if (!methods || !('manual' in methods)) return false;
  const { manual, ...rest } = methods;
  await game.settings.set(MODULE.ID, MODULE.SETTINGS.ALLOWED_METHODS, { ...rest, manualFormula: rest.manualFormula ?? manual });
  log(3, 'migration: allowedMethods.manual -> manualFormula');
  return true;
}

/**
 * Delete the orphaned world Setting document for every dropped legacy key.
 * @returns {Promise<boolean>} True when at least one stale document was deleted.
 */
async function deleteRemovedKeys() {
  const storage = game.settings.storage.get('world');
  let removed = false;
  for (const key of REMOVED_KEYS) {
    const doc = storage.find((s) => s.key === `${MODULE.ID}.${key}`);
    if (!doc) continue;
    await doc.delete();
    log(3, `migration: removed stale setting ${key}`);
    removed = true;
  }
  return removed;
}

/** Whisper the GMs a one-time notice that legacy settings were migrated and a client refresh is recommended. */
async function notifyMigration() {
  const content = await foundry.applications.handlebars.renderTemplate(MODULE.TEMPLATES.CHAT.MIGRATION_NOTICE, {});
  await ChatMessage.create({ whisper: ChatMessage.getWhisperRecipients('GM').map((u) => u.id), speaker: { alias: MODULE.NAME }, content });
}
