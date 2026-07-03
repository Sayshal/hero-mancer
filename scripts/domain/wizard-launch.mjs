import { HeroMancer } from '../apps/hero-mancer.mjs';
import { showWizardSplash } from '../components/wizard-splash.mjs';
import { identityIndexesReady, preloadIdentityDocs } from './identity-tab.mjs';

/**
 * Open the wizard. When compendium indexes aren't cached yet, show a blurred progress splash while they build, then reveal the fully-rendered window.
 * @param {object} seed Initial draft seed.
 * @returns {Promise<void>}
 */
export async function launchWizard(seed) {
  if (identityIndexesReady()) {
    new HeroMancer({ seed }).render({ force: true });
    return;
  }
  const splash = showWizardSplash();
  try {
    await preloadIdentityDocs((done, total) => splash.setProgress(done, total)).catch(() => {});
    await new HeroMancer({ seed }).render({ force: true });
  } finally {
    await splash.reveal();
  }
}
