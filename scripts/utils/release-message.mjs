import { MODULE } from '../constants.mjs';

/**
 * Whisper the release announcement to the active user once per version.
 * @returns {Promise<void>}
 */
export async function checkReleaseMessage() {
  const version = game.modules.get(MODULE.ID)?.version;
  if (!version) return;
  const lastSeen = game.user.getFlag(MODULE.ID, MODULE.FLAGS.LAST_SEEN_VERSION);
  if (lastSeen === version) return;
  const repoUrl = `https://github.com/Sayshal/hero-mancer/releases/tag/release-${version}`;
  const content = await foundry.applications.handlebars.renderTemplate(MODULE.TEMPLATES.CHAT.RELEASE_MESSAGE, { version, repoUrl, patreonUrl: MODULE.LINKS.PATREON });
  await ChatMessage.create({ content, whisper: [game.user.id], speaker: { alias: MODULE.NAME } });
  await game.user.setFlag(MODULE.ID, MODULE.FLAGS.LAST_SEEN_VERSION, version);
}
