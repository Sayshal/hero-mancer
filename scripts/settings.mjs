import { PendingApprovals } from './apps/pending-approvals.mjs';
import { SettingsPanel } from './apps/settings-panel.mjs';
import { Troubleshooter } from './apps/troubleshooter.mjs';
import { MODULE } from './constants.mjs';
import { clearCaches } from './data/document-loader.mjs';
import { clearShopIndex } from './domain/equipment-shop.mjs';
import { mergeCustomFocusItems } from './integrations/dnd5e.mjs';

const { ArrayField, BooleanField, NumberField, ObjectField, StringField } = foundry.data.fields;

/** onChange handler for exclusion list settings: drops cached indexes so next wizard render rebuilds with the new exclusion. */
function onExclusionListChange() {
  clearCaches();
  clearShopIndex();
}

/** Register all module game settings. Submenus are registered by their own apps. */
export function registerSettings() {
  const r = game.settings.register.bind(game.settings);

  r(MODULE.ID, MODULE.SETTINGS.LOGGING_LEVEL, {
    name: 'HEROMANCER.Settings.Logger.Name',
    hint: 'HEROMANCER.Settings.Logger.Hint',
    scope: 'client',
    config: true,
    type: new StringField({
      initial: '2',
      blank: false,
      choices: {
        0: 'HEROMANCER.Settings.Logger.Choices.Off',
        1: 'HEROMANCER.Settings.Logger.Choices.Errors',
        2: 'HEROMANCER.Settings.Logger.Choices.Warnings',
        3: 'HEROMANCER.Settings.Logger.Choices.Verbose'
      }
    }),
    onChange: (value) => {
      MODULE.LOG_LEVEL = parseInt(value);
    }
  });

  game.settings.registerMenu(MODULE.ID, MODULE.SETTINGS.SETTINGS_PANEL_MENU, {
    name: 'HEROMANCER.Settings.SettingsPanel.Menu.Name',
    hint: 'HEROMANCER.Settings.SettingsPanel.Menu.Hint',
    label: 'HEROMANCER.Settings.SettingsPanel.Menu.Label',
    icon: 'fa-solid fa-cog',
    type: SettingsPanel,
    restricted: true
  });

  r(MODULE.ID, MODULE.SETTINGS.PUBLISH_WEALTH_ROLLS, {
    name: 'HEROMANCER.Settings.PublishWealthRolls.Name',
    hint: 'HEROMANCER.Settings.PublishWealthRolls.Hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: true })
  });

  r(MODULE.ID, MODULE.SETTINGS.PUBLISH_CREATION_SUMMARY, {
    name: 'HEROMANCER.Settings.PublishCreationSummary.Name',
    hint: 'HEROMANCER.Settings.PublishCreationSummary.Hint',
    scope: 'world',
    config: false,
    type: new StringField({
      initial: 'public',
      blank: false,
      choices: {
        public: 'DND5E.Public',
        'whisper-gm': 'HEROMANCER.Settings.PublishCreationSummary.Choices.WhisperGM',
        off: 'HEROMANCER.Settings.PublishCreationSummary.Choices.Off'
      }
    })
  });

  r(MODULE.ID, MODULE.SETTINGS.PUBLISH_LEVEL_UP_BROADCAST, {
    name: 'HEROMANCER.Settings.PublishLevelUpBroadcast.Name',
    hint: 'HEROMANCER.Settings.PublishLevelUpBroadcast.Hint',
    scope: 'world',
    config: false,
    type: new StringField({
      initial: 'public',
      blank: false,
      choices: {
        public: 'DND5E.Public',
        'whisper-owners': 'HEROMANCER.Settings.PublishLevelUpBroadcast.Choices.WhisperOwners',
        off: 'HEROMANCER.Settings.PublishLevelUpBroadcast.Choices.Off'
      }
    })
  });

  r(MODULE.ID, MODULE.SETTINGS.MULTICLASS_THRESHOLD, {
    name: 'HEROMANCER.Settings.MulticlassThreshold.Name',
    hint: 'HEROMANCER.Settings.MulticlassThreshold.Hint',
    scope: 'world',
    config: false,
    type: new NumberField({ initial: 13, min: 0, max: 30, integer: true })
  });

  r(MODULE.ID, MODULE.SETTINGS.LOCK_IDENTITY_RULESET, {
    name: 'HEROMANCER.Settings.LockIdentityRuleset.Name',
    hint: 'HEROMANCER.Settings.LockIdentityRuleset.Hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: false })
  });

  r(MODULE.ID, MODULE.SETTINGS.HIDE_OTHER_CREATE_ACTOR_OPTIONS, {
    name: 'HEROMANCER.Settings.HideOtherCreateActorOptions.Name',
    hint: 'HEROMANCER.Settings.HideOtherCreateActorOptions.Hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: false })
  });

  r(MODULE.ID, MODULE.SETTINGS.TRIM_SOURCE_PARENTHETICAL, {
    name: 'HEROMANCER.Settings.TrimSourceParenthetical.Name',
    hint: 'HEROMANCER.Settings.TrimSourceParenthetical.Hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: true }),
    onChange: () => clearCaches()
  });

  r(MODULE.ID, MODULE.SETTINGS.DICE_ROLLING_METHOD, {
    scope: 'client',
    config: false,
    type: new StringField({ initial: 'standardArray' })
  });

  r(MODULE.ID, MODULE.SETTINGS.WIZARD_POSITION, {
    scope: 'client',
    config: false,
    type: new ObjectField({ initial: {} })
  });

  r(MODULE.ID, MODULE.SETTINGS.SHOW_WELCOME, {
    name: 'HEROMANCER.Settings.ShowWelcome.Name',
    hint: 'HEROMANCER.Settings.ShowWelcome.Hint',
    scope: 'client',
    config: true,
    type: new BooleanField({ initial: true })
  });

  r(MODULE.ID, MODULE.SETTINGS.EXCLUSION_LIST, {
    scope: 'world',
    config: false,
    type: new ObjectField({ initial: {} }),
    onChange: onExclusionListChange
  });

  r(MODULE.ID, MODULE.SETTINGS.CUSTOM_FOCUS_ITEMS, {
    name: 'HEROMANCER.Settings.CustomFocusItems.Name',
    hint: 'HEROMANCER.Settings.CustomFocusItems.Hint',
    scope: 'world',
    config: false,
    type: new ObjectField({ initial: {} }),
    onChange: () => {
      mergeCustomFocusItems();
      clearShopIndex();
    }
  });

  r(MODULE.ID, MODULE.SETTINGS.REFUND_UNCHOSEN_GOLD, {
    name: 'HEROMANCER.Settings.RefundUnchosenGold.Name',
    hint: 'HEROMANCER.Settings.RefundUnchosenGold.Hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: true })
  });

  r(MODULE.ID, MODULE.SETTINGS.BONUS_GOLD_FORMULA, {
    name: 'HEROMANCER.Settings.BonusGoldFormula.Name',
    hint: 'HEROMANCER.Settings.BonusGoldFormula.Hint',
    scope: 'world',
    config: false,
    type: new StringField({ initial: '', blank: true })
  });

  r(MODULE.ID, MODULE.SETTINGS.REQUIRE_APPROVAL_FOR_PLAYERS, {
    name: 'HEROMANCER.Settings.RequireApprovalForPlayers.Name',
    hint: 'HEROMANCER.Settings.RequireApprovalForPlayers.Hint',
    scope: 'world',
    config: true,
    type: new BooleanField({ initial: true })
  });

  r(MODULE.ID, MODULE.SETTINGS.KEEP_APPROVAL_ARCHIVE, {
    name: 'HEROMANCER.Settings.KeepApprovalArchive.Name',
    hint: 'HEROMANCER.Settings.KeepApprovalArchive.Hint',
    scope: 'world',
    config: true,
    type: new BooleanField({ initial: false })
  });

  game.settings.registerMenu(MODULE.ID, MODULE.SETTINGS.PENDING_APPROVALS_MENU, {
    name: 'HEROMANCER.Settings.PendingApprovalsMenu.Name',
    hint: 'HEROMANCER.Settings.PendingApprovalsMenu.Hint',
    label: 'HEROMANCER.Settings.PendingApprovalsMenu.Label',
    icon: 'fa-solid fa-clipboard-check',
    type: PendingApprovals,
    restricted: true
  });

  game.settings.registerMenu(MODULE.ID, MODULE.SETTINGS.TROUBLESHOOTING_MENU, {
    name: 'HEROMANCER.Settings.Troubleshooter.Menu.Name',
    hint: 'HEROMANCER.Settings.Troubleshooter.Menu.Hint',
    label: 'HEROMANCER.Settings.Troubleshooter.Menu.Label',
    icon: 'fa-solid fa-bug',
    type: Troubleshooter,
    restricted: false
  });

  r(MODULE.ID, MODULE.SETTINGS.ART_PICKER_ROOT, {
    name: 'HEROMANCER.Settings.ArtPickerRoot.Name',
    hint: 'HEROMANCER.Settings.ArtPickerRoot.Hint',
    scope: 'world',
    config: false,
    restricted: true,
    filePicker: 'folder',
    type: new StringField({ initial: '/' })
  });

  r(MODULE.ID, MODULE.SETTINGS.ENABLE_PLAYER_CUSTOMIZATION, {
    name: 'HEROMANCER.Settings.PlayerCustomization.Name',
    hint: 'HEROMANCER.Settings.PlayerCustomization.Hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: false })
  });

  r(MODULE.ID, MODULE.SETTINGS.ENABLE_TOKEN_CUSTOMIZATION, {
    name: 'HEROMANCER.Settings.TokenCustomization.Name',
    hint: 'HEROMANCER.Settings.TokenCustomization.Hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: false })
  });

  r(MODULE.ID, MODULE.SETTINGS.ENABLE_RANDOMIZE, {
    name: 'HEROMANCER.Settings.Randomize.Name',
    hint: 'HEROMANCER.Settings.Randomize.Hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: true })
  });

  r(MODULE.ID, MODULE.SETTINGS.ADVANCEMENT_ORDER, {
    name: 'HEROMANCER.Settings.AdvancementOrder.Name',
    hint: 'HEROMANCER.Settings.AdvancementOrder.Hint',
    scope: 'world',
    config: false,
    type: new ArrayField(new ObjectField()),
    default: [
      { id: 'background', label: 'HEROMANCER.App.TabNames.background', order: 10, sortable: true },
      { id: 'species', label: 'HEROMANCER.App.TabNames.species', order: 20, sortable: true },
      { id: 'class', label: 'HEROMANCER.App.TabNames.class', order: 30, sortable: true }
    ]
  });

  r(MODULE.ID, MODULE.SETTINGS.ALLOWED_METHODS, {
    scope: 'world',
    config: false,
    type: new ObjectField({ initial: { standardArray: true, pointBuy: true, manualFormula: true } })
  });

  r(MODULE.ID, MODULE.SETTINGS.CUSTOM_ROLL_FORMULA, {
    name: 'HEROMANCER.Settings.CustomRollFormula.Name',
    hint: 'HEROMANCER.Settings.CustomRollFormula.Hint',
    scope: 'world',
    config: false,
    restricted: true,
    type: new StringField({ initial: '4d6kh3' })
  });

  r(MODULE.ID, MODULE.SETTINGS.CUSTOM_POINT_BUY_TOTAL, {
    name: 'HEROMANCER.Settings.CustomPointBuyTotal.Name',
    hint: 'HEROMANCER.Settings.CustomPointBuyTotal.Hint',
    scope: 'world',
    config: false,
    type: new NumberField({ initial: 27, min: 0, integer: true })
  });

  r(MODULE.ID, MODULE.SETTINGS.POINT_BUY_COST_MAP, {
    name: 'HEROMANCER.Settings.PointBuyCostMap.Name',
    hint: 'HEROMANCER.Settings.PointBuyCostMap.Hint',
    scope: 'world',
    config: false,
    type: new ObjectField({ initial: {} })
  });

  r(MODULE.ID, MODULE.SETTINGS.ALLOW_REROLLS, {
    name: 'HEROMANCER.Settings.AllowRerolls.Name',
    hint: 'HEROMANCER.Settings.AllowRerolls.Hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: true })
  });

  r(MODULE.ID, MODULE.SETTINGS.MAX_REROLL_ATTEMPTS, {
    name: 'HEROMANCER.Settings.MaxRerollAttempts.Name',
    hint: 'HEROMANCER.Settings.MaxRerollAttempts.Hint',
    scope: 'world',
    config: false,
    type: new NumberField({ initial: 2, min: 0, max: 99, step: 1, integer: true })
  });

  r(MODULE.ID, MODULE.SETTINGS.STANDARD_ARRAY_VALUES, {
    name: 'HEROMANCER.Settings.StandardArrayValues.Name',
    hint: 'HEROMANCER.Settings.StandardArrayValues.Hint',
    scope: 'world',
    config: false,
    restricted: true,
    type: new StringField({ initial: '15,14,13,12,10,8' })
  });

  r(MODULE.ID, MODULE.SETTINGS.ABILITY_SCORE_DEFAULT, {
    name: 'HEROMANCER.Settings.AbilityScores.Default.Name',
    hint: 'HEROMANCER.Settings.AbilityScores.Default.Hint',
    scope: 'world',
    config: false,
    type: new NumberField({ initial: 8, min: 3, max: 20, step: 1, integer: true })
  });

  r(MODULE.ID, MODULE.SETTINGS.ABILITY_SCORE_MIN, {
    name: 'HEROMANCER.Settings.AbilityScores.Min.Name',
    hint: 'HEROMANCER.Settings.AbilityScores.Min.Hint',
    scope: 'world',
    config: false,
    type: new NumberField({ initial: 8, min: 3, max: 18, step: 1, integer: true })
  });

  r(MODULE.ID, MODULE.SETTINGS.ABILITY_SCORE_MAX, {
    name: 'DND5E.AbilityScoreMax',
    hint: 'HEROMANCER.Settings.AbilityScores.Max.Hint',
    scope: 'world',
    config: false,
    type: new NumberField({ initial: 15, min: 10, max: 20, step: 1, integer: true })
  });

  r(MODULE.ID, MODULE.SETTINGS.STARTING_LEVEL, {
    name: 'HEROMANCER.Settings.StartingLevel.Name',
    hint: 'HEROMANCER.Settings.StartingLevel.Hint',
    scope: 'world',
    config: false,
    type: new NumberField({ initial: 1, min: 1, max: 20, step: 1, integer: true })
  });

  r(MODULE.ID, MODULE.SETTINGS.ALLOW_PLAYER_LEVEL_OVERRIDE, {
    name: 'HEROMANCER.Settings.AllowPlayerLevelOverride.Name',
    hint: 'HEROMANCER.Settings.AllowPlayerLevelOverride.Hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: false })
  });

  r(MODULE.ID, MODULE.SETTINGS.ALLOWED_HP_METHODS, {
    scope: 'world',
    config: false,
    type: new ObjectField({ initial: { average: true, max: true, manual: true } })
  });

  r(MODULE.ID, MODULE.SETTINGS.HP_REROLL_ONES, {
    name: 'HEROMANCER.Settings.HPRerollOnes.Name',
    hint: 'HEROMANCER.Settings.HPRerollOnes.Hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: false })
  });

  r(MODULE.ID, MODULE.SETTINGS.HP_L1_MAX_DIE, {
    name: 'HEROMANCER.Settings.HPL1MaxDie.Name',
    hint: 'HEROMANCER.Settings.HPL1MaxDie.Hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: true })
  });

  r(MODULE.ID, MODULE.SETTINGS.ENFORCE_BIOGRAPHY, {
    name: 'HEROMANCER.Settings.EnforceBiography.Name',
    hint: 'HEROMANCER.Settings.EnforceBiography.Hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: false })
  });

  r(MODULE.ID, MODULE.SETTINGS.ENFORCE_ART, {
    name: 'HEROMANCER.Settings.EnforceArt.Name',
    hint: 'HEROMANCER.Settings.EnforceArt.Hint',
    scope: 'world',
    config: false,
    type: new BooleanField({ initial: false })
  });

  if (game.modules.get('tokenizer-2')?.active) {
    r(MODULE.ID, MODULE.SETTINGS.TOKENIZER_COMPATIBILITY, {
      name: 'HEROMANCER.Settings.Tokenizer.Name',
      hint: 'HEROMANCER.Settings.Tokenizer.Hint',
      scope: 'world',
      config: false,
      type: new BooleanField({ initial: true })
    });
  }

  if (game.modules.get('dice-so-nice')?.active) {
    r(MODULE.ID, MODULE.SETTINGS.ENABLE_DICE_SO_NICE, {
      name: 'HEROMANCER.Settings.Dicesonice.Name',
      hint: 'HEROMANCER.Settings.Dicesonice.Hint',
      scope: 'client',
      config: false,
      type: new BooleanField({ initial: true })
    });
  }
}
