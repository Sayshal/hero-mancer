const FilePickerImpl = foundry.applications.apps.FilePicker.implementation;

/** FilePicker jailed to a root directory: out-of-root navigation redirects back to the root and the data source is fixed. */
class RootLockedFilePicker extends FilePickerImpl {
  /**
   * @param {object} [options] FilePicker options.
   * @param {string} [options.root] Folder to jail navigation within; empty disables the lock.
   */
  constructor(options = {}) {
    super(options);
    this.root = String(options.root ?? '').replace(/^\/+|\/+$/g, '');
    if (this.root) for (const key of Object.keys(this.sources)) if (key !== this.activeSource) delete this.sources[key];
  }

  /**
   * Whether a target path is the root itself or nested beneath it.
   * @param {string} target Candidate path.
   * @returns {boolean} True when within the locked root, or always when unlocked.
   */
  #withinRoot(target) {
    if (!this.root) return true;
    const path = String(target ?? '').replace(/^\/+|\/+$/g, '');
    return path === this.root || path.startsWith(`${this.root}/`);
  }

  /** @inheritdoc */
  async browse(target = this.target, options = {}) {
    return super.browse(this.#withinRoot(target) ? target : this.root, options);
  }

  /** @inheritdoc */
  changeTab(tab, group, options) {
    if (this.root && group === 'sources') return;
    return super.changeTab(tab, group, options);
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if (this.root && String(this.source?.target ?? '').replace(/^\/+|\/+$/g, '') === this.root) context.canGoBack = false;
    return context;
  }
}

/**
 * Open Foundry's FilePicker for an image and resolve with the chosen path.
 * @param {object} [opts] Picker options.
 * @param {string} [opts.current] Pre-selected path.
 * @param {string} [opts.type] FilePicker type. Default `image`.
 * @param {string} [opts.root] Jail navigation to this folder when set.
 * @returns {Promise<?string>} Selected path, or null on cancel.
 */
export function pickArt({ current = '', type = 'image', root = '' } = {}) {
  const PickerClass = root ? RootLockedFilePicker : FilePickerImpl;
  return new Promise((resolve) => {
    new PickerClass({ type, current: current || root, root, callback: resolve }).render({ force: true });
  });
}
