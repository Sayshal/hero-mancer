import { createGlobalNamespace } from './scripts/api.mjs';
import './scripts/apps/_module.mjs';
import { maybeShowWelcome } from './scripts/apps/welcome.mjs';
import './scripts/components/_module.mjs';
import { MODULE } from './scripts/constants.mjs';
import './scripts/data/_module.mjs';
import './scripts/domain/_module.mjs';
import { registerApprovalChat } from './scripts/domain/approval-chat.mjs';
import { registerApprovalReplay } from './scripts/domain/approval-replay.mjs';
import { bootstrapApprovalJournal, recoverPendingSubmissions, registerApprovalDocumentHooks, registerApprovalSockets } from './scripts/domain/approval.mjs';
import { computeCompatibility } from './scripts/domain/compatibility.mjs';
import { registerLevelUpBroadcast } from './scripts/domain/level-up-broadcast.mjs';
import { registerPendingBanner } from './scripts/domain/pending-banner.mjs';
import { registerRejectionHandler } from './scripts/domain/rejection-handler.mjs';
import { registerLevelUpSheetButton } from './scripts/domain/sheet-button.mjs';
import { registerSpellHandoff } from './scripts/domain/spell-handoff.mjs';
import { registerSubmissionLock } from './scripts/domain/submission-lock.mjs';
import { registerComponentPartials, registerHooks } from './scripts/hooks.mjs';
import './scripts/integrations/_module.mjs';
import { checkAdvancementAutomation, mergeCustomFocusItems, registerAdvancementConsentListener } from './scripts/integrations/dnd5e.mjs';
import './scripts/macros/_module.mjs';
import { migrateLegacySettings } from './scripts/migrations.mjs';
import { registerSettings } from './scripts/settings.mjs';
import { registerSocket } from './scripts/sockets.mjs';
import './scripts/utils/_module.mjs';
import './scripts/wizard/_module.mjs';
import './styles/apps/advancement-asi-dialog.css';
import './styles/apps/background-builder-dialog.css';
import './styles/apps/hero-mancer.css';
import './styles/apps/pending-approvals.css';
import './styles/apps/settings-panel.css';
import './styles/apps/troubleshooter.css';
import './styles/apps/welcome.css';
import './styles/components/ability-block.css';
import './styles/components/banner.css';
import './styles/components/biography-tab.css';
import './styles/components/character-summary.css';
import './styles/components/chat-card.css';
import './styles/components/combobox.css';
import './styles/components/compare-dialog.css';
import './styles/components/dialog.css';
import './styles/components/dice-appearance.css';
import './styles/components/equipment-accordion.css';
import './styles/components/equipment-detail-panel.css';
import './styles/components/equipment-shop.css';
import './styles/components/equipment-tile.css';
import './styles/components/feat-browser.css';
import './styles/components/finalize-tab.css';
import './styles/components/hp-card.css';
import './styles/components/multiclass-impact-panel.css';
import './styles/components/multiclass-roster.css';
import './styles/components/progress-bar.css';
import './styles/components/prose-mirror-chrome.css';
import './styles/components/sheet-button.css';
import './styles/components/sidebar-hud.css';
import './styles/components/wizard-splash.css';
import './styles/hero-mancer.css';

/**
 * ATLAS troubleshooter debug lines: enabled dnd5e sources, plus the open wizard's build on export opt-in.
 * @param {{mode: string}} ctx  ATLAS report context (`display`, `copy`, or `export`).
 * @returns {Promise<string[]>}
 */
async function troubleshooterDebug({ mode } = {}) {
  const L = ATLAS.diagnostics.dnd5eSourceLines();
  const wizard = foundry.applications.instances.get(`${MODULE.ID}-wizard`);
  if (mode === 'export' && wizard?.rendered) {
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: 'Hero Mancer 2', icon: 'fa-solid fa-bug' },
      content: `<p>${_loc('HEROMANCER.Settings.Troubleshooter.ExportSessionPrompt')}</p>`
    });
    if (ok) {
      L.push('', '#### HM2 Session', '');
      try {
        const session = await wizard.exportSession();
        L.push('```json', JSON.stringify(session, null, 2), '```');
      } catch (err) {
        L.push(`_session export failed: ${err.message}_`);
      }
    }
  }
  return L;
}

Hooks.once('init', () => {
  ATLAS.register('hero-mancer', { title: 'Hero Mancer 2', github: 'Sayshal/hero-mancer', theme: { scope: '.hero-mancer', default: 'heromancer' }, debug: troubleshooterDebug });
  registerSettings();
  createGlobalNamespace();
  registerComponentPartials();
  registerHooks();
});

Hooks.once('setup', () => {
  mergeCustomFocusItems();
});

Hooks.once('ready', () => {
  migrateLegacySettings();
  computeCompatibility();
  registerSocket();
  registerSpellHandoff();
  registerApprovalSockets();
  registerApprovalChat();
  registerApprovalDocumentHooks();
  registerApprovalReplay();
  registerRejectionHandler();
  registerSubmissionLock();
  bootstrapApprovalJournal().then(() => recoverPendingSubmissions());
  registerPendingBanner();
  registerLevelUpSheetButton();
  registerLevelUpBroadcast();
  registerAdvancementConsentListener();
  Hooks.callAll(MODULE.HOOKS.READY, MODULE);
  checkAdvancementAutomation();
  maybeShowWelcome();
});
