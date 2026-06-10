import { getClassColor } from '../components/class-color.mjs';
import { buildHudSnapshotFromActor, DEFAULT_PALETTE } from '../components/sidebar-hud-snapshot.mjs';
import { MODULE } from '../constants.mjs';
import { safeEnrichHTML } from '../utils/html-text.mjs';
import { log } from '../utils/logger.mjs';

/**
 * Post a chat card mirroring the live HUD for a newly-created actor.
 * @param {Actor} actor Newly-created actor.
 * @returns {Promise<void>}
 */
export async function publishCharacterSummary(actor) {
  const mode = game.settings.get(MODULE.ID, MODULE.SETTINGS.PUBLISH_CREATION_SUMMARY);
  if (mode === 'off') return;
  try {
    const snapshot = buildHudSnapshotFromActor(actor);
    const palette = (snapshot.classImg ? await getClassColor(snapshot.classImg) : null) ?? DEFAULT_PALETTE;
    const originLine = [snapshot.backgroundName, snapshot.speciesName].filter(Boolean).join(' · ');
    const equipmentLinks = await buildEquipmentLinks(actor);
    const actorAnchorHtml = actor.toAnchor({ name: _loc('HEROMANCER.Chat.CharacterSummary.ViewSheet'), classes: ['hm-chat-summary-link'] }).outerHTML;
    const content = await foundry.applications.handlebars.renderTemplate(MODULE.TEMPLATES.CHAT.CHARACTER_SUMMARY, { snapshot, palette, originLine, equipmentLinks, actorAnchorHtml });
    const message = { content, speaker: ChatMessage.getSpeaker({ actor }), flavor: _loc('HEROMANCER.Chat.CharacterSummary.Label') };
    if (mode === 'whisper-gm') message.whisper = collectWhisperRecipients(actor);
    await ChatMessage.create(message);
  } catch (err) {
    log(1, 'publishCharacterSummary failed:', err);
  }
}

/**
 * Build a comma-separated enriched-UUID list of weapons, body armor, shields, and spell focuses on the actor.
 * @param {Actor} actor Source actor.
 * @returns {Promise<string>} Enriched HTML, or empty string when no notable gear.
 */
async function buildEquipmentLinks(actor) {
  const focusSourceIds = collectFocusSourceIds();
  const picks = [...actor.items].filter((it) => isNotableItem(it, focusSourceIds)).sort((a, b) => a.name.localeCompare(b.name));
  if (!picks.length) return '';
  const raw = picks.map((it) => `@UUID[${it.uuid}]{${it.name}}`).join(', ');
  return safeEnrichHTML(raw, { secrets: false, relativeTo: actor });
}

/**
 * Test whether an item belongs in the chat-card carry list.
 * @param {Item} item Embedded item.
 * @param {Set<string>} focusSourceIds Source-uuid set for items configured as spell focuses.
 * @returns {boolean} True when notable.
 */
function isNotableItem(item, focusSourceIds) {
  if (item.type === 'weapon') return true;
  if (item.type === 'equipment' && item.system.armor?.type) return true;
  const source = item._stats?.compendiumSource ?? item.flags?.core?.sourceId;
  return !!source && focusSourceIds.has(source);
}

/**
 * Union every source uuid configured as a spell focus across all focus types.
 * @returns {Set<string>} Source-uuid set.
 */
function collectFocusSourceIds() {
  const out = new Set();
  for (const entry of Object.values(CONFIG.DND5E?.focusTypes ?? {})) for (const uuid of Object.values(entry?.itemIds ?? {})) if (uuid) out.add(uuid);
  return out;
}

/**
 * Build whisper recipient ids for `whisper-gm` mode: every GM + every owner-level user of the actor.
 * @param {Actor} actor Source actor.
 * @returns {string[]} User ids.
 */
function collectWhisperRecipients(actor) {
  const ids = new Set();
  for (const u of game.users) if (u.isGM || actor.testUserPermission(u, 'OWNER')) ids.add(u.id);
  return Array.from(ids);
}
