let DELEGATE_INSTALLED = false;

/** Install a one-time document-level capture-phase click listener */
function ensureDelegate() {
  if (DELEGATE_INSTALLED) return;
  DELEGATE_INSTALLED = true;
  document.addEventListener(
    'click',
    (event) => {
      const link = event.target.closest('[data-item-link][data-uuid]');
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      openSheetFor(link.dataset.uuid);
    },
    { capture: true }
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const link = event.target.closest('[data-item-link][data-uuid]');
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      openSheetFor(link.dataset.uuid);
    },
    { capture: true }
  );
}

/**
 * Resolve and render an item sheet by uuid, preferring sync when the item is already cached.
 * @param {string} uuid Compendium uuid.
 * @returns {Promise<void>} Resolves once the sheet render call has been issued.
 */
async function openSheetFor(uuid) {
  if (!uuid) return;
  const sync = fromUuidSync(uuid);
  if (sync?.sheet) return sync.sheet.render(true);
  const doc = await fromUuid(uuid);
  if (doc?.sheet) doc.sheet.render(true);
  else console.warn('[hero-mancer] item-link: no sheet for', uuid, doc);
}

/**
 * Apply rich item tooltip dataset to an element.
 * @param {HTMLElement} el Target element (must carry `data-uuid`).
 */
export function applyItemTooltip(el) {
  if (!el || el.dataset.itemTooltipWired === '1') return;
  const uuid = el.dataset.uuid;
  if (!uuid) return;
  el.dataset.itemTooltipWired = '1';
  if (!('tooltip' in el.dataset)) {
    el.dataset.tooltip = `<section class="loading" data-uuid="${uuid}"><i class="fas fa-spinner fa-spin-pulse"></i></section>`;
    el.dataset.tooltipClass = 'dnd5e2 dnd5e-tooltip item-tooltip themed theme-light';
    el.dataset.tooltipDirection ??= 'LEFT';
  }
}

/**
 * Bind click + keyboard handlers that open the document sheet.
 * @param {HTMLElement} el Target element (must carry `data-uuid`).
 */
export function applyItemOpen(el) {
  ensureDelegate();
  if (!el || el.dataset.itemOpenWired === '1') return;
  const uuid = el.dataset.uuid;
  if (!uuid) return;
  el.dataset.itemOpenWired = '1';
  const onActivate = (event) => {
    event.preventDefault();
    event.stopPropagation();
    openSheetFor(uuid);
  };
  el.addEventListener('click', onActivate);
  el.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') onActivate(event);
  });
}

/**
 * Apply both tooltip + click-to-open to elements marked `[data-item-link]`.
 * @param {Element} scope Container to query.
 */
export function applyItemLinks(scope) {
  if (!scope) return;
  for (const el of scope.querySelectorAll('[data-item-link][data-uuid]')) {
    applyItemTooltip(el);
    applyItemOpen(el);
  }
  for (const el of scope.querySelectorAll('[data-item-tooltip][data-uuid]')) applyItemTooltip(el);
}
