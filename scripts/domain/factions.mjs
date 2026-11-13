import { MODULE } from '../constants.mjs';
import { emitSocketEvent, onSocketEvent, SOCKET_EVENTS } from '../sockets.mjs';

/**
 * Registered factions the GM allows players to pick at creation, or an empty list when the picker is off.
 * @returns {Array<{value: string, label: string}>} Allowed faction options.
 */
function allowedFactionOptions() {
  if (!game.settings.get('dnd5e', 'renownScore')) return [];
  if (!(Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.MAX_STARTING_FACTIONS)) > 0)) return [];
  const allowed = new Set(game.settings.get(MODULE.ID, MODULE.SETTINGS.FACTION_ALLOWLIST));
  return dnd5e.registry.renown.factionOptions.filter((option) => allowed.has(option.value));
}

/**
 * Biography-tab faction picker context.
 * @param {string[]} [selected] Picked faction identifiers.
 * @returns {?{max: number, options: Array<{value: string, label: string, img: ?string, checked: boolean}>}} Picker context, or null when hidden.
 */
export function buildFactionContext(selected = []) {
  const options = allowedFactionOptions();
  if (!options.length) return null;
  const picked = new Set(selected);
  return {
    max: Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.MAX_STARTING_FACTIONS)),
    options: options.map((option) => ({ ...option, img: dnd5e.registry.renown.faction(option.value)?.img ?? null, checked: picked.has(option.value) }))
  };
}

/**
 * Disable unchecked faction boxes once the pick limit is reached.
 * @param {HTMLElement} root Wizard element.
 */
export function syncFactionLimit(root) {
  const group = root.querySelector('[data-faction-picker]');
  if (!group) return;
  const boxes = [...group.querySelectorAll('input[type="checkbox"]')];
  const full = boxes.filter((box) => box.checked).length >= Number(group.dataset.max);
  for (const box of boxes) box.disabled = full && !box.checked;
}

/**
 * Renown item payloads for each picked faction still allowed by the GM.
 * @param {string[]} [factions] Picked faction identifiers.
 * @returns {object[]} Item creation data.
 */
export function buildRenownItems(factions = []) {
  const allowed = new Set(allowedFactionOptions().map((option) => option.value));
  const max = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.MAX_STARTING_FACTIONS));
  const value = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.STARTING_RENOWN)) || 0;
  return factions
    .filter((identifier) => allowed.has(identifier))
    .slice(0, max)
    .map((identifier) => {
      const faction = dnd5e.registry.renown.get(identifier);
      return {
        _id: foundry.utils.randomID(),
        name: faction?.name ?? identifier,
        type: 'renown',
        img: dnd5e.registry.renown.faction(identifier)?.img,
        system: { modifiers: [{ faction: identifier, value }] }
      };
    });
}

/**
 * Add an actor to the faction actor of every renown modifier it carries, relaying to the GM when the current user cannot edit the faction.
 * @param {Actor} actor Newly-created character.
 * @returns {Promise<void>}
 */
export async function joinFactions(actor) {
  const identifiers = actor.itemTypes.renown?.flatMap((item) => item.system.modifiers.map((modifier) => modifier.faction)) ?? [];
  if (!identifiers.length) return;
  if (!identifiers.every((identifier) => dnd5e.registry.renown.faction(identifier)?.isOwner)) {
    emitSocketEvent(SOCKET_EVENTS.JOIN_FACTIONS, { actorUuid: actor.uuid, identifiers });
    return;
  }
  await addMemberships(actor, identifiers);
}

/**
 * Add an actor to each identified faction actor.
 * @param {Actor} actor Character actor.
 * @param {string[]} identifiers Faction identifiers.
 * @returns {Promise<void>}
 */
async function addMemberships(actor, identifiers) {
  for (const identifier of new Set(identifiers)) await dnd5e.registry.renown.faction(identifier)?.system.addMember(actor);
}

/** Wire the GM-side faction membership writer for characters created by players. */
export function registerFactionSocket() {
  onSocketEvent(SOCKET_EVENTS.JOIN_FACTIONS, async ({ actorUuid, identifiers }) => {
    if (!ATLAS.isPrimaryGM) return;
    const actor = await fromUuid(actorUuid);
    if (actor) await addMemberships(actor, identifiers);
  });
}
