import { MODULE } from '../constants.mjs';
import { log } from '../utils/logger.mjs';

/** Merge `CUSTOM_FOCUS_ITEMS` into `CONFIG.DND5E.focusTypes[*].itemIds` so they flow into quartermaster focus pools. Idempotent — clears previous `hm:*` keys before re-applying. */
export function mergeCustomFocusItems() {
  const setting = game.settings.get(MODULE.ID, MODULE.SETTINGS.CUSTOM_FOCUS_ITEMS) ?? {};
  const focusTypes = CONFIG.DND5E?.focusTypes ?? {};
  for (const entry of Object.values(focusTypes)) {
    if (!entry?.itemIds) continue;
    for (const k of Object.keys(entry.itemIds)) if (k.startsWith('hm:')) delete entry.itemIds[k];
  }
  for (const [key, uuids] of Object.entries(setting)) {
    const entry = focusTypes[key];
    if (!entry) continue;
    entry.itemIds ??= {};
    for (const uuid of uuids) if (uuid) entry.itemIds[`hm:${uuid}`] = uuid;
  }
}

/**
 * Whisper a GM-only nudge when dnd5e advancement automation is disabled.
 * @returns {Promise<void>}
 */
export async function checkAdvancementAutomation() {
  if (!game.user.isGM || game.user !== game.users.activeGM) return;
  if (!game.settings.get('dnd5e', 'disableAdvancements')) return;
  try {
    const content = await foundry.applications.handlebars.renderTemplate(MODULE.TEMPLATES.CHAT.ADVANCEMENT_CONSENT, {});
    const recipients = game.users.filter((u) => u.isGM && u.active).map((u) => u.id);
    await ChatMessage.create({ content, whisper: recipients, speaker: { alias: MODULE.NAME } });
  } catch (err) {
    log(1, 'Failed to whisper advancement-consent prompt:', err);
  }
}

/** Wire delegated handler for the Enable button in the advancement-automation nudge whisper. */
export function registerAdvancementConsentListener() {
  Hooks.on('renderChatMessageHTML', (message, element) => {
    const root = element?.tagName ? element : element?.[0];
    if (!root) return;
    const enableBtn = root.querySelector('[data-hm-action="enable-advancements"]');
    if (!enableBtn) return;
    if (!game.user.isGM) {
      enableBtn.setAttribute('disabled', '');
      return;
    }
    enableBtn.addEventListener('click', async () => {
      await game.settings.set('dnd5e', 'disableAdvancements', false);
      ui.notifications.info('HEROMANCER.Integrations.Dnd5e.AdvancementsEnabled', { localize: true });
      await message.delete();
    });
  });
}
