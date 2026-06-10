/**
 * Open Foundry's FilePicker for an image and resolve with the chosen path.
 * @param {object} [opts] Picker options.
 * @param {string} [opts.current] Pre-selected path.
 * @param {string} [opts.type] FilePicker type. Default `image`.
 * @returns {Promise<?string>} Selected path, or null on cancel.
 */
export function pickArt({ current = '', type = 'image' } = {}) {
  return new Promise((resolve) => {
    new foundry.applications.apps.FilePicker.implementation({ type, current, callback: resolve }).render({ force: true });
  });
}
