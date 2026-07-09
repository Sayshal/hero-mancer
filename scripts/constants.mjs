/** @enum {string} Flag keys (user + actor). */
const FLAGS = {
  WIZARD_DRAFT: 'wizardDraft',
  LAST_SEEN_VERSION: 'lastSeenVersion',
  LAST_REJECTION: 'lastRejection',
  LEVEL_UP_READY: 'levelUpReady',
  PENDING_SUBMISSION: 'pendingSubmission',
  SKIP_SPELL_HANDOFF: 'skipSpellHandoff',
  SUBMITTED_PAYLOAD: 'submittedPayload'
};

/** @enum {string} Settings registration keys */
const SETTINGS = {
  ABILITY_SCORE_DEFAULT: 'abilityScoreDefault',
  ABILITY_SCORE_MAX: 'abilityScoreMax',
  ABILITY_SCORE_MIN: 'abilityScoreMin',
  CUSTOM_BG_ABILITY_CHOICES: 'customBgAbilityChoices',
  CUSTOM_BG_ABILITY_POINTS: 'customBgAbilityPoints',
  CUSTOM_BG_ABILITY_CAP: 'customBgAbilityCap',
  CUSTOM_BG_SKILL_COUNT: 'customBgSkillCount',
  CUSTOM_BG_TOOL_COUNT: 'customBgToolCount',
  CUSTOM_BG_FEAT_COUNT: 'customBgFeatCount',
  CUSTOM_BG_BUDGET: 'customBgBudget',
  DISABLE_CUSTOM_BACKGROUND: 'disableCustomBackground',
  ADVANCEMENT_ORDER: 'advancementOrder',
  ALLOW_PLAYER_LEVEL_OVERRIDE: 'allowPlayerLevelOverride',
  ALLOWED_METHODS: 'allowedMethods',
  ART_PICKER_ROOT: 'artPickerRoot',
  ALLOW_REROLLS: 'allowRerolls',
  MAX_REROLL_ATTEMPTS: 'maxRerollAttempts',
  LOCK_IDENTITY_RULESET: 'lockIdentityRuleset',
  CUSTOM_FOCUS_ITEMS: 'customFocusItems',
  CUSTOM_POINT_BUY_TOTAL: 'customPointBuyTotal',
  CUSTOM_ROLL_FORMULA: 'customRollFormula',
  DICE_ROLLING_MENU: 'diceRollingMenu',
  DICE_ROLLING_METHOD: 'diceRollingMethod',
  DISABLE_MULTICLASS: 'disableMulticlass',
  ENABLE_DICE_SO_NICE: 'enableDiceSoNice',
  ENABLE_PLAYER_CUSTOMIZATION: 'enablePlayerCustomization',
  ENABLE_RANDOMIZE: 'enableRandomize',
  ENABLE_TOKEN_CUSTOMIZATION: 'enableTokenCustomization',
  ENFORCE_ART: 'enforceArt',
  ENFORCE_BIOGRAPHY: 'enforceBiography',
  BONUS_GOLD_FORMULA: 'bonusGoldFormula',
  EXCLUSION_LIST: 'exclusionList',
  SHOP_INCLUDE_MAGIC_ITEMS: 'shopIncludeMagicItems',
  SHOP_MAX_MAGIC_RARITY: 'shopMaxMagicRarity',
  HIDE_OTHER_CREATE_ACTOR_OPTIONS: 'hideOtherCreateActorOptionsForPlayers',
  ALLOWED_HP_METHODS: 'allowedHpMethods',
  HP_L1_MAX_DIE: 'hpL1MaxDie',
  HP_REROLL_ONES: 'hpRerollOnes',
  KEEP_APPROVAL_ARCHIVE: 'keepApprovalArchive',
  MULTICLASS_THRESHOLD: 'multiclassThreshold',
  PENDING_APPROVALS_MENU: 'pendingApprovalsMenu',
  POINT_BUY_COST_MAP: 'pointBuyCostMap',
  PUBLISH_CREATION_SUMMARY: 'publishCreationSummary',
  PUBLISH_HP_ROLLS: 'publishHpRolls',
  PUBLISH_LEVEL_UP_BROADCAST: 'publishLevelUpBroadcast',
  PUBLISH_WEALTH_ROLLS: 'publishWealthRolls',
  REFUND_UNCHOSEN_GOLD: 'refundUnchosenEquipmentGold',
  REQUIRE_APPROVAL_FOR_PLAYERS: 'requireApprovalForPlayers',
  SETTINGS_PANEL_MENU: 'settingsPanelMenu',
  STANDARD_ARRAY_VALUES: 'standardArrayValues',
  STARTING_LEVEL: 'startingLevel',
  TOKENIZER_COMPATIBILITY: 'tokenizerCompatibility',
  TRIM_SOURCE_PARENTHETICAL: 'trimSourceParenthetical',
  TROUBLESHOOTING_MENU: 'troubleshootingMenu',
  DISABLE_WELCOME_POPUP: 'disableWelcomePopup',
  SHOW_WELCOME: 'showWelcome',
  WIZARD_POSITION: 'wizardPosition'
};

/** @enum {string} Public hook names in the heroMancer namespace */
const HOOKS = {
  READY: 'heroMancer.Ready',
  DOCUMENTS_READY: 'heroMancer.documentsReady',
  OPEN_REQUESTED: 'heroMancer.openRequested',
  WIZARD_OPENED: 'heroMancer.WizardOpened',
  PRE_CREATE: 'heroMancer.PreCreate',
  CREATED: 'heroMancer.Created',
  APPROVAL_SUBMITTED: 'heroMancer.ApprovalSubmitted',
  APPROVAL_APPROVED: 'heroMancer.ApprovalApproved',
  APPROVAL_REJECTED: 'heroMancer.ApprovalRejected',
  LEVEL_UP_STARTED: 'heroMancer.LevelUpStarted',
  LEVEL_UP_COMPLETED: 'heroMancer.LevelUpCompleted',
  EQUIPMENT_UI_RENDERED: 'heroMancer.EquipmentUIRendered'
};

/** @type {string} */
const TEMPLATE_ROOT = 'modules/hero-mancer/templates';

/** @type {object} Handlebars template paths grouped by area */
const TEMPLATES = {
  WIZARD: {
    HEADER: `${TEMPLATE_ROOT}/apps/hero-mancer/header.hbs`,
    SIDEBAR: `${TEMPLATE_ROOT}/apps/hero-mancer/sidebar.hbs`,
    FOOTER: `${TEMPLATE_ROOT}/apps/hero-mancer/footer.hbs`
  },
  DIALOGS: {
    HEADER: `${TEMPLATE_ROOT}/apps/dialog-header.hbs`,
    PROMPT: `${TEMPLATE_ROOT}/apps/dialog-prompt.hbs`,
    ASI: `${TEMPLATE_ROOT}/apps/advancement-asi-dialog.hbs`,
    FEAT: `${TEMPLATE_ROOT}/apps/advancement-feat-dialog.hbs`,
    BACKGROUND_BUILDER: `${TEMPLATE_ROOT}/apps/background-builder-dialog.hbs`,
    BACKGROUND_BUILDER_FOOTER: `${TEMPLATE_ROOT}/apps/background-builder-footer.hbs`,
    REJECT_REASON: `${TEMPLATE_ROOT}/apps/reject-reason-dialog.hbs`,
    REJECTION_NOTICE: `${TEMPLATE_ROOT}/apps/rejection-notice-dialog.hbs`,
    LEVEL_UP_GRANT_LIST: `${TEMPLATE_ROOT}/apps/level-up-grant-list.hbs`
  },
  TABS: {
    IDENTITY: `${TEMPLATE_ROOT}/apps/hero-mancer/tabs/identity.hbs`,
    START: `${TEMPLATE_ROOT}/apps/hero-mancer/tabs/start.hbs`,
    ABILITIES: `${TEMPLATE_ROOT}/apps/hero-mancer/tabs/abilities.hbs`,
    HP: `${TEMPLATE_ROOT}/apps/hero-mancer/tabs/hp.hbs`,
    LEVEL_UP: `${TEMPLATE_ROOT}/apps/hero-mancer/tabs/level-up.hbs`,
    EQUIPMENT: `${TEMPLATE_ROOT}/apps/hero-mancer/tabs/equipment.hbs`,
    BIOGRAPHY: `${TEMPLATE_ROOT}/apps/hero-mancer/tabs/biography.hbs`,
    ADVANCEMENTS: `${TEMPLATE_ROOT}/apps/hero-mancer/tabs/advancements.hbs`,
    QUARTERMASTER: `${TEMPLATE_ROOT}/apps/hero-mancer/tabs/quartermaster.hbs`,
    FINALIZE: `${TEMPLATE_ROOT}/apps/hero-mancer/tabs/finalize.hbs`
  },
  COMPONENTS: {
    COMBOBOX: `${TEMPLATE_ROOT}/components/combobox.hbs`,
    COMBOBOX_OPTION: `${TEMPLATE_ROOT}/components/combobox-option.hbs`,
    PROGRESS_BAR: `${TEMPLATE_ROOT}/components/progress-bar.hbs`,
    EQUIPMENT_ACCORDION: `${TEMPLATE_ROOT}/components/equipment-accordion.hbs`,
    EQUIPMENT_TILE: `${TEMPLATE_ROOT}/components/equipment-tile.hbs`,
    EQUIPMENT_DETAIL_PANEL: `${TEMPLATE_ROOT}/components/equipment-detail-panel.hbs`,
    EQUIPMENT_DETAIL_LIST: `${TEMPLATE_ROOT}/components/equipment-detail-list.hbs`,
    EQUIPMENT_BUNDLE_TOOLTIP: `${TEMPLATE_ROOT}/components/equipment-bundle-tooltip.hbs`,
    EQUIPMENT_SHOP: `${TEMPLATE_ROOT}/components/equipment-shop.hbs`,
    FEAT_BROWSER: `${TEMPLATE_ROOT}/components/feat-browser.hbs`,
    FEAT_TILE: `${TEMPLATE_ROOT}/components/feat-tile.hbs`,
    ABILITY_BLOCK: `${TEMPLATE_ROOT}/components/ability-block.hbs`,
    MULTICLASS_IMPACT_PANEL: `${TEMPLATE_ROOT}/components/multiclass-impact-panel.hbs`,
    BANNER: `${TEMPLATE_ROOT}/components/banner.hbs`,
    VALIDATION_INCOMPLETE: `${TEMPLATE_ROOT}/components/validation-incomplete.hbs`,
    WIZARD_SPLASH: `${TEMPLATE_ROOT}/components/wizard-splash.hbs`,
    CREATE_ACTOR_LAUNCH_OPTION: `${TEMPLATE_ROOT}/components/create-actor-launch-option.hbs`,
    JOURNAL_EMBED_STATUS: `${TEMPLATE_ROOT}/components/journal-embed-status.hbs`,
    JOURNAL_PAGE_FALLBACK: `${TEMPLATE_ROOT}/components/journal-page-fallback.hbs`
  },
  REVIEW: {
    EQUIPMENT: `${TEMPLATE_ROOT}/review/equipment.hbs`
  },
  APPROVALS: {
    LIST: `${TEMPLATE_ROOT}/apps/pending-approvals/list.hbs`,
    PAGE_BODY: `${TEMPLATE_ROOT}/apps/pending-approvals/page-body.hbs`
  },
  MENUS: {
    SETTINGS_PANEL: {
      NAV: `${TEMPLATE_ROOT}/apps/settings-panel/nav.hbs`,
      FIELD: `${TEMPLATE_ROOT}/apps/settings-panel/_field.hbs`,
      FOCUS_ROW: `${TEMPLATE_ROOT}/apps/settings-panel/_focus-row.hbs`,
      COST_ROW: `${TEMPLATE_ROOT}/apps/settings-panel/_cost-row.hbs`,
      ABILITIES: `${TEMPLATE_ROOT}/apps/settings-panel/abilities.hbs`,
      WIZARD_FLOW: `${TEMPLATE_ROOT}/apps/settings-panel/wizard-flow.hbs`,
      ENFORCEMENT: `${TEMPLATE_ROOT}/apps/settings-panel/enforcement.hbs`,
      PLAYER_EXPERIENCE: `${TEMPLATE_ROOT}/apps/settings-panel/player-experience.hbs`,
      ADVANCED: `${TEMPLATE_ROOT}/apps/settings-panel/advanced.hbs`,
      EXCLUSIONS: `${TEMPLATE_ROOT}/apps/settings-panel/exclusions.hbs`,
      FOOTER: `${TEMPLATE_ROOT}/apps/settings-panel/footer.hbs`
    },
    TROUBLESHOOTER: `${TEMPLATE_ROOT}/apps/troubleshooter/main.hbs`,
    WELCOME: `${TEMPLATE_ROOT}/apps/welcome/main.hbs`
  },
  CHAT: {
    ADVANCEMENT_CONSENT: `${TEMPLATE_ROOT}/chat/advancement-consent.hbs`,
    APPROVAL_EVENT: `${TEMPLATE_ROOT}/chat/approval-event.hbs`,
    CHARACTER_SUMMARY: `${TEMPLATE_ROOT}/chat/character-summary.hbs`,
    MIGRATION_NOTICE: `${TEMPLATE_ROOT}/chat/migration-notice.hbs`
  }
};

/** @type {object} Static asset paths */
const ASSETS = {};

/** @type {object} Public-facing URLs surfaced in welcome dialog, settings menus, etc. */
const LINKS = {
  PATREON: 'https://www.patreon.com/3deathsaves',
  KOFI: 'https://ko-fi.com/sayshal',
  DISCORD: 'https://discord.gg/PzzUwU9gdz',
  GITHUB: 'https://github.com/Sayshal/hero-mancer',
  BUGS: 'https://github.com/Sayshal/hero-mancer/issues'
};

/** @type {object} Approval-flow document names */
const APPROVAL = {
  PENDING_JOURNAL_NAME: 'Hero Mancer 2 Pending Approvals',
  ARCHIVE_JOURNAL_NAME: 'Hero Mancer 2 Approval Archive'
};

/** @type {object} Wizard FSM state and event ids */
const WIZARD = {
  STATES: {
    IDLE: 'idle',
    EDITING: 'editing',
    VALIDATING: 'validating',
    SUBMITTING: 'submitting',
    SUBMITTED_PENDING_APPROVAL: 'submitted_pending_approval',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    CREATING: 'creating',
    RUNNING_ADVANCEMENTS: 'running_advancements',
    DONE: 'done',
    ERROR: 'error'
  },
  EVENTS: {
    OPEN: 'open',
    TAB_CHANGE: 'tab_change',
    SAVE_DRAFT: 'save_draft',
    SUBMIT: 'submit',
    APPROVAL_RECEIVED: 'approval_received',
    REJECTION_RECEIVED: 'rejection_received',
    CANCEL: 'cancel',
    ERROR: 'error',
    COMPLETE: 'complete'
  }
};

/** @type {object} Module identification and nested enums */
export const MODULE = {
  ID: 'hero-mancer',
  NAME: 'Hero Mancer 2',
  CUSTOM_BACKGROUND_VALUE: '__hm-custom-background__',
  FLAGS,
  SETTINGS,
  HOOKS,
  TEMPLATES,
  ASSETS,
  LINKS,
  APPROVAL,
  WIZARD
};
