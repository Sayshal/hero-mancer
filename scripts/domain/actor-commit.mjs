/**
 * Commit a fully-applied actor clone to its live counterpart.
 * @param {object} actor Live actor.
 * @param {object} clone Fully-applied clone (`actor.clone({}, {keepId: true})`).
 * @returns {Promise<void>}
 */
export async function commitClone(actor, clone) {
  const updates = clone.toObject();
  const items = updates.items ?? [];
  delete updates.items;
  const existingIds = new Set(actor.items.map((i) => i.id));
  const toCreate = [];
  const toUpdate = [];
  const seen = new Set();
  for (const item of items) {
    seen.add(item._id);
    if (existingIds.has(item._id)) toUpdate.push(item);
    else toCreate.push(item);
  }
  const toDelete = [...existingIds].filter((id) => !seen.has(id));
  const opts = { isAdvancement: true };
  await actor.update(updates, opts);
  if (toCreate.length) await actor.createEmbeddedDocuments('Item', toCreate, { keepId: true, ...opts });
  if (toUpdate.length) await actor.updateEmbeddedDocuments('Item', toUpdate, { diff: false, recursive: false, ...opts });
  if (toDelete.length) {
    const present = toDelete.filter((id) => actor.items.has(id));
    if (present.length) await actor.deleteEmbeddedDocuments('Item', present, opts);
  }
}
