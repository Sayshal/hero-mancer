/**
 * Show a fullscreen blurred splash with a progress bar while the wizard's compendium indexes build.
 * @returns {{setProgress: Function, reveal: Function}} Controller: `setProgress(done, total)` and async `reveal()`.
 */
export function showWizardSplash() {
  const overlay = document.createElement('div');
  overlay.className = 'hm-wizard-splash';
  overlay.innerHTML = Handlebars.partials.hmWizardSplash({});
  document.body.appendChild(overlay);
  const fill = overlay.querySelector('[data-splash-fill]');
  fill.classList.add('is-indeterminate');

  /**
   * Advance the progress bar, switching it from indeterminate to determinate.
   * @param {number} done Completed steps.
   * @param {number} total Total steps.
   */
  function setProgress(done, total) {
    fill.classList.remove('is-indeterminate');
    fill.style.width = `${total ? Math.round((Math.min(done, total) / total) * 100) : 100}%`;
  }

  /**
   * Fill the bar, fade the splash out, and remove it.
   * @returns {Promise<void>}
   */
  async function reveal() {
    fill.classList.remove('is-indeterminate');
    fill.style.width = '100%';
    overlay.classList.add('is-done');
    await new Promise((resolve) => {
      overlay.addEventListener('transitionend', resolve, { once: true });
      setTimeout(resolve, 400);
    });
    overlay.remove();
  }

  return { setProgress, reveal };
}
