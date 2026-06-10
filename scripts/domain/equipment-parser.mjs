import { safeEnrichHTML } from '../utils/html-text.mjs';

/**
 * Normalize a source document's startingEquipment into a `kind`-discriminated tree.
 * @param {object} sourceDoc Full class or background Document.
 * @returns {Promise<object[]>} Top-level nodes in source order.
 */
export async function parseStartingEquipment(sourceDoc) {
  const entries = sourceDoc?.system?.startingEquipment;
  if (!entries?.length) return [];
  const source = { uuid: sourceDoc.uuid, type: sourceDoc.type, name: sourceDoc.name };
  const topLevel = entries.filter((e) => !e.group);
  const nodes = await Promise.all(topLevel.map((e) => buildNode(e, entries, source)));
  return nodes.filter(Boolean);
}

/**
 * Build one normalized node from a dnd5e EquipmentEntryData instance.
 * @param {object} entry The EquipmentEntryData.
 * @param {object[]} allEntries Full sibling list (used to resolve children).
 * @param {object} source Source descriptor tagged onto every node.
 * @returns {Promise<?object>} Normalized node, or null when entry is unsupported (e.g. currency).
 */
async function buildNode(entry, allEntries, source) {
  const label = await enrichLabel(entry.generateLabel());
  const common = { id: entry._id, label, source };
  if (entry.type === 'AND' || entry.type === 'OR') {
    const childEntries = allEntries.filter((e) => e.group === entry._id).sort((a, b) => a.sort - b.sort);
    const children = await Promise.all(childEntries.map((c) => buildNode(c, allEntries, source)));
    return { ...common, kind: 'group', operator: entry.type, children: children.filter(Boolean) };
  }
  if (entry.type === 'linked') {
    const linked = fromUuidSync(entry.key);
    return { ...common, kind: 'linked', uuid: entry.key, name: linked?.name ?? entry.key, img: linked?.img ?? null, count: entry.count || 1, requiresProficiency: entry.requiresProficiency };
  }
  if (entry.type === 'currency') return { ...common, kind: 'currency', key: entry.key, count: entry.count || 0 };
  const node = { ...common, categoryType: entry.type, count: entry.count || 1, requiresProficiency: entry.requiresProficiency };
  if (entry.key) return { ...node, kind: 'category', key: entry.key };
  return { ...node, kind: 'choice', keyOptions: entry.keyOptions };
}

/**
 * Run dnd5e's label HTML through Foundry's TextEditor for UUID enrichment.
 * @param {string} raw Raw label HTML from `generateLabel()`.
 * @returns {Promise<string>} Enriched HTML.
 */
function enrichLabel(raw) {
  return safeEnrichHTML(raw, { async: true });
}
