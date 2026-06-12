let itemsBrowserClass;

/**
 * Lazily build a CompendiumBrowser subclass that renders only the Items tab.
 * @returns {Function} The cached Items-only browser class.
 */
function getItemsBrowser() {
  if (itemsBrowserClass) return itemsBrowserClass;
  itemsBrowserClass = class extends dnd5e.applications.CompendiumBrowser {
    /** @inheritdoc */
    async _prepareTabsContext(context, options) {
      const tabsContext = await super._prepareTabsContext(context, options);
      tabsContext.tabs = tabsContext.tabs.filter((tab) => tab.tab === 'physical');
      return tabsContext;
    }

    /** @inheritdoc */
    async _prepareHeaderContext(context, options) {
      const headerContext = await super._prepareHeaderContext(context, options);
      headerContext.showModeToggle = false;
      return headerContext;
    }
  };
  return itemsBrowserClass;
}

/**
 * Open dnd5e's CompendiumBrowser pre-checked with `preselected` and resolve the chosen uuid Set on close.
 * @param {object} opts Options.
 * @param {Set<string>} [opts.types] Item subtypes to lock the browser to (ignored when itemsTab is set).
 * @param {?object} [opts.additional] Additional locked filters (e.g. `{ category: { feat: 1 } }`) merged into `filters.locked`.
 * @param {string[]} [opts.preselected] Uuids to pre-check.
 * @param {number} [opts.min] Minimum selection size.
 * @param {number} [opts.max] Maximum selection size. A truthy min or max is required for the browser to show checkboxes.
 * @param {boolean} [opts.itemsTab] Open on the Items tab alone (physical subtypes filterable) instead of locking to `types`.
 * @returns {Promise<?Set<string>>} The current selection on close, or null when the browser exposes none.
 */
export function pickFromBrowser({ types, additional = null, preselected = [], min = 0, max, itemsTab = false }) {
  const CompendiumBrowser = itemsTab ? getItemsBrowser() : dnd5e.applications.CompendiumBrowser;
  const options = { selection: { min, max } };
  if (itemsTab) options.tab = 'physical';
  else options.filters = { locked: { types, ...(additional && { additional }) } };
  return new Promise((resolve) => {
    const browser = new CompendiumBrowser(options);
    for (const uuid of preselected) browser.selected.add(uuid);
    browser.addEventListener('close', () => resolve(browser.selected ?? null), { once: true });
    browser.render({ force: true });
  });
}
