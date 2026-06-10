/**
 * Strip trailing parentheticals that are noise.
 * @param {?string} name Display name.
 * @param {object} [options] Options.
 * @param {?string} [options.sourceBook] The entry's own `system.source.book` code, treated as strippable.
 * @returns {string} Trimmed name, or the original when nothing matched.
 */
export function stripNoiseParenthetical(name, { sourceBook } = {}) {
  if (!name) return name;
  const noise = /^(?:legacy|recharges?|free rules|basic rules|choose\b.*|srd(?:\s*[\d.]+)?|20\d{2}(?:\s*(?:ruleset|rules|edition))?|\d+(?:st|nd|rd|th)?[\s-]*level|level[\s-]*\d+)$/i;
  const tokens = new Set();
  for (const [key, value] of Object.entries(CONFIG?.DND5E?.sourceBooks ?? {})) {
    tokens.add(key.toLowerCase());
    tokens.add(String(value).toLowerCase());
  }
  if (sourceBook) tokens.add(String(sourceBook).toLowerCase());
  let result = String(name);
  let prev;
  do {
    prev = result;
    const match = result.match(/^(.*\S)\s*\(([^()]+)\)\s*$/);
    if (!match) break;
    const inner = match[2].trim();
    if (noise.test(inner) || tokens.has(inner.toLowerCase())) result = match[1].trimEnd();
  } while (result !== prev);
  return result.trim() || String(name);
}

/**
 * Strip HTML tags from a string. Foundry's `cleanHTML` sanitizes, `escapeHTML` escapes — neither returns plain text.
 * @param {?string} raw Source string (may contain tags).
 * @returns {string} Tag-free text.
 */
export function stripHtml(raw) {
  return String(raw ?? '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

/**
 * Enrich HTML, falling back to the given markup when enrichment throws (e.g. a translation module rejecting compendium priming).
 * @param {string} raw Raw HTML/markup to enrich.
 * @param {object} [options] Options forwarded to `TextEditor.enrichHTML`.
 * @param {string} [fallback] Value returned when enrichment fails; defaults to `raw`.
 * @returns {Promise<string>} Enriched HTML, or the fallback on failure.
 */
export async function safeEnrichHTML(raw, options, fallback = raw) {
  try {
    return await foundry.applications.ux.TextEditor.implementation.enrichHTML(raw, options);
  } catch {
    return fallback;
  }
}

/**
 * Pick a short, plain-text summary from a doc's `system.description` for combobox tooltips.
 * @param {object} system Slim system data from an indexed document.
 * @returns {string} Plain-text summary, or empty string when none available.
 */
export function shortDescription(system) {
  const value = system?.description?.value;
  const raw = system?.description?.short || firstProseParagraph(value) || '';
  if (!raw) return '';
  const stripped = raw
    .replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.length > 240 ? `${stripped.slice(0, 237).trimEnd()}…` : stripped;
}

/**
 * Walk `<p>...</p>` blocks in source HTML and return the first one that reads as prose.
 * @param {?string} html Source HTML.
 * @returns {string} First usable paragraph (still HTML), or empty string when none.
 */
export function firstProseParagraph(html) {
  if (!html) return '';
  const paragraphs = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi);
  if (!paragraphs) return html;
  let firstNonRef = '';
  for (const block of paragraphs) {
    const inner = block
      .replace(/^<p[^>]*>/i, '')
      .replace(/<\/p>$/i, '')
      .trim();
    const refOnly = inner
      .replace(/@(?:Embed|UUID)\[[^\]]+\](?:\{[^}]+\})?/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (!refOnly) continue;
    firstNonRef ||= inner;
    if (/^<strong>[^<]*:\s*<\/strong>/i.test(inner)) continue;
    return inner;
  }
  return firstNonRef;
}
