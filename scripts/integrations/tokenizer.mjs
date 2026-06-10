/**
 * Open Tokenizer 2's actor-less editor and resolve the uploaded art plus prototype-token patch.
 * @param {object} opts Editor options.
 * @param {string} opts.name Drives the save filename.
 * @param {string} [opts.sourceImage] Portrait path to pre-load into the editor.
 * @returns {Promise<?object>} `{tokenPath, avatarPath, prototypeToken, layerStack}` on save, or null on cancel.
 */
export async function openTokenizer({ name, sourceImage } = {}) {
  const api = game.modules.get('tokenizer-2')?.api;
  if (!api?.openEditorStandalone) return null;
  return api.openEditorStandalone({
    name: name || _loc('HEROMANCER.Character.DefaultName'),
    type: 'pc',
    sourceImage: sourceImage || undefined,
    disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY,
    hasPlayerOwner: true,
    userId: game.user.id
  });
}
