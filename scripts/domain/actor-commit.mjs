/**
 * Commit a fully-applied actor clone to its live counterpart, firing dnd5e's advancement-completion hooks around the write.
 * @param {object} actor Live actor.
 * @param {object} clone Fully-applied clone (`actor.clone({}, {keepId: true})`).
 * @param {object} manager dnd5e AdvancementManager describing the same advancement run, handed to hook listeners.
 * @returns {Promise<boolean>} False when a `dnd5e.preAdvancementManagerComplete` listener vetoed the commit.
 */
export async function commitClone(actor, clone, manager) {
  const updates = clone.toObject();
  const items = updates.items ?? [];
  delete updates.items;
  const existingIds = new Set(actor.items.map((i) => i.id));
  const invalidIds = actor.items.invalidDocumentIds;
  const toCreate = [];
  const toUpdate = [];
  const seen = new Set();
  for (const item of items) {
    if (invalidIds.has(item._id)) continue;
    seen.add(item._id);
    if (existingIds.has(item._id)) toUpdate.push(item);
    else toCreate.push(item);
  }
  const toDelete = [...existingIds].filter((id) => !seen.has(id));
  if (Hooks.call('dnd5e.preAdvancementManagerComplete', manager, updates, toCreate, toUpdate, toDelete) === false) return false;
  const opts = { isAdvancement: true };
  if (toCreate.length) await actor.createEmbeddedDocuments('Item', toCreate, { keepId: true, ...opts });
  await actor.update(updates, opts);
  if (toUpdate.length) await actor.updateEmbeddedDocuments('Item', toUpdate, { diff: false, recursive: false, ...opts });
  if (toDelete.length) {
    const present = toDelete.filter((id) => actor.items.has(id));
    if (present.length) await actor.deleteEmbeddedDocuments('Item', present, opts);
  }
  Hooks.callAll('dnd5e.advancementManagerComplete', manager);
  return true;
}
