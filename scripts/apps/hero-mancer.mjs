import { AbilityBlock } from '../components/ability-block.mjs';
import { Combobox } from '../components/combobox.mjs';
import { EquipmentDetailPanel } from '../components/equipment-detail-panel.mjs';
import { EquipmentTile } from '../components/equipment-tile.mjs';
import { MulticlassImpactPanel } from '../components/multiclass-impact-panel.mjs';
import { ProgressBar } from '../components/progress-bar.mjs';
import { buildHudSnapshot } from '../components/sidebar-hud-snapshot.mjs';
import { SidebarHud } from '../components/sidebar-hud.mjs';
import { MODULE } from '../constants.mjs';
import * as documentLoader from '../data/document-loader.mjs';
import { JournalPageEmbed } from '../data/journal-embed.mjs';
import { findRelatedJournalPage } from '../data/journal-finder.mjs';
import { buildAbilitiesContext, buildStandardArrayPool, pointBuyCost, rollAbilityFormula } from '../domain/ability-scores.mjs';
import { computeAsiBonus, isOriginalClassItem } from '../domain/advancement-chooser.mjs';
import { ADVANCEMENT_FIELD_PREFIX, advancementDraftFromFlat, readAdvancementDraft } from '../domain/advancement-draft.mjs';
import { buildAdvancementsContext, picksFromRow } from '../domain/advancements-tab.mjs';
import { approveSubmissionAfterEdit, promptRejectionReason, rejectSubmission, submitForApproval } from '../domain/approval.mjs';
import { buildBiographyContext } from '../domain/biography-tab.mjs';
import { pickArt } from '../domain/character-art.mjs';
import { createCharacter } from '../domain/character.mjs';
import * as compare from '../domain/compare.mjs';
import { buildEquipmentReview } from '../domain/equipment-review.mjs';
import { buildEquipmentContext, extractEquipmentTraitLinks } from '../domain/equipment-tab.mjs';
import { buildFeatBrowserContext, initFeatIndex } from '../domain/feat-browser.mjs';
import { buildFinalizeContext } from '../domain/finalize-tab.mjs';
import { buildHpContext, parseHitDie, readLockedRolls } from '../domain/hp-tab.mjs';
import { buildIdentityContext, lookupSelectionName, preloadIdentityDocs, rosterSlotId } from '../domain/identity-tab.mjs';
import { buildLevelUpContext } from '../domain/level-up-tab.mjs';
import { applyLevelUp } from '../domain/level-up.mjs';
import { checkMulticlassPrereq, formatPrereqChipLabel, formatPrereqLabel } from '../domain/multiclass-prereqs.mjs';
import { randomizeAll } from '../domain/randomizer.mjs';
import * as savedOptions from '../domain/saved-options.mjs';
import { buildStartContext } from '../domain/start-tab.mjs';
import { getEffectiveStartingLevel } from '../domain/subclass.mjs';
import { getPendingSubmission } from '../domain/submission-lock.mjs';
import { computeAge } from '../integrations/calendaria.mjs';
import { openTokenizer } from '../integrations/tokenizer.mjs';
import { safeEnrichHTML } from '../utils/html-text.mjs';
import { applyItemLinks } from '../utils/item-link.mjs';
import { log } from '../utils/logger.mjs';
import { generateName } from '../utils/randomizer-grammar.mjs';
import { validateWizard } from '../utils/validation.mjs';
import { applyDraft } from '../wizard/restore.mjs';
import { WizardStateMachine } from '../wizard/state-machine.mjs';
import { AdvancementAsiDialog } from './advancement-asi-dialog.mjs';
import { AdvancementFeatDialog } from './advancement-feat-dialog.mjs';
import { CompareDialog } from './compare-dialog.mjs';
import { HMDialog, HMPrompt } from './dialog.mjs';

/** @type {Array<{id: string, icon: string, i18n: string, modes: string[]}>} Wizard tab definitions in display order. */
const TAB_DEFS = [
  { id: 'start', icon: 'fa-user-pen', i18n: 'HEROMANCER.Wizard.Tabs.Start', modes: ['creation'] },
  { id: 'level-up', icon: 'fa-angles-up', i18n: 'DND5E.LevelActionIncrease', modes: ['level_up'] },
  { id: 'identity', icon: 'fa-id-card', i18n: 'HEROMANCER.Wizard.Tabs.Identity', modes: ['creation'] },
  { id: 'abilities', icon: 'fa-dice-d20', i18n: 'DND5E.Abilities', modes: ['creation'] },
  { id: 'hp', icon: 'fa-heart', i18n: 'DND5E.HitPoints', modes: ['creation', 'level_up'] },
  { id: 'equipment', icon: 'fa-toolbox', i18n: 'TYPES.Item.equipment', modes: ['creation'] },
  { id: 'biography', icon: 'fa-book-bookmark', i18n: 'DND5E.Biography', modes: ['creation'] },
  { id: 'advancements', icon: 'fa-bolt', i18n: 'HEROMANCER.Wizard.Tabs.Advancements', modes: ['creation', 'level_up'] },
  { id: 'finalize', icon: 'fa-stamp', i18n: 'HEROMANCER.Wizard.Tabs.Finalize', modes: ['creation'] }
];

/** @type {Object<string, string[]>} World-setting key (unprefixed) -> wizard tab parts to re-render. */
const SETTING_PARTS = {
  [MODULE.SETTINGS.ALLOWED_METHODS]: ['abilities'],
  [MODULE.SETTINGS.CUSTOM_ROLL_FORMULA]: ['abilities'],
  [MODULE.SETTINGS.STANDARD_ARRAY_VALUES]: ['abilities'],
  [MODULE.SETTINGS.CUSTOM_POINT_BUY_TOTAL]: ['abilities'],
  [MODULE.SETTINGS.POINT_BUY_COST_MAP]: ['abilities'],
  [MODULE.SETTINGS.ABILITY_SCORE_DEFAULT]: ['abilities'],
  [MODULE.SETTINGS.ABILITY_SCORE_MIN]: ['abilities'],
  [MODULE.SETTINGS.ABILITY_SCORE_MAX]: ['abilities'],
  [MODULE.SETTINGS.DICE_ROLLING_METHOD]: ['abilities'],
  [MODULE.SETTINGS.ALLOW_REROLLS]: ['abilities', 'hp'],
  [MODULE.SETTINGS.MAX_REROLL_ATTEMPTS]: ['abilities', 'hp'],
  [MODULE.SETTINGS.ALLOWED_HP_METHODS]: ['hp'],
  [MODULE.SETTINGS.HP_L1_MAX_DIE]: ['hp'],
  [MODULE.SETTINGS.HP_REROLL_ONES]: ['hp'],
  [MODULE.SETTINGS.ADVANCEMENT_ORDER]: ['identity'],
  [MODULE.SETTINGS.LOCK_IDENTITY_RULESET]: ['identity'],
  [MODULE.SETTINGS.MULTICLASS_THRESHOLD]: ['identity'],
  [MODULE.SETTINGS.BONUS_GOLD_FORMULA]: ['equipment'],
  [MODULE.SETTINGS.REFUND_UNCHOSEN_GOLD]: ['equipment'],
  [MODULE.SETTINGS.CUSTOM_FOCUS_ITEMS]: ['equipment'],
  [MODULE.SETTINGS.EXCLUSION_LIST]: ['identity', 'equipment'],
  [MODULE.SETTINGS.ALLOW_PLAYER_LEVEL_OVERRIDE]: ['start'],
  [MODULE.SETTINGS.ENABLE_RANDOMIZE]: ['start'],
  [MODULE.SETTINGS.ENABLE_PLAYER_CUSTOMIZATION]: ['start'],
  [MODULE.SETTINGS.ENABLE_TOKEN_CUSTOMIZATION]: ['start'],
  [MODULE.SETTINGS.ENABLE_DICE_SO_NICE]: ['start'],
  [MODULE.SETTINGS.ENFORCE_ART]: ['start'],
  [MODULE.SETTINGS.ART_PICKER_ROOT]: ['start'],
  [MODULE.SETTINGS.TOKENIZER_COMPATIBILITY]: ['start'],
  [MODULE.SETTINGS.ENFORCE_BIOGRAPHY]: ['biography'],
  [MODULE.SETTINGS.REQUIRE_APPROVAL_FOR_PLAYERS]: ['finalize'],
  [MODULE.SETTINGS.TRIM_SOURCE_PARENTHETICAL]: ['identity', 'equipment', 'advancements'],
  [MODULE.SETTINGS.KEEP_APPROVAL_ARCHIVE]: [],
  [MODULE.SETTINGS.HIDE_OTHER_CREATE_ACTOR_OPTIONS]: [],
  [MODULE.SETTINGS.PUBLISH_WEALTH_ROLLS]: [],
  [MODULE.SETTINGS.PUBLISH_CREATION_SUMMARY]: [],
  [MODULE.SETTINGS.PUBLISH_LEVEL_UP_BROADCAST]: [],
  [MODULE.SETTINGS.SHOW_WELCOME]: [],
  [MODULE.SETTINGS.LOGGING_LEVEL]: []
};

/** @type {Array<{key: string, icon: string, i18n: string}>} GM-only header settings-menu shortcut buttons. */
const SETTINGS_MENUS = [{ key: 'SETTINGS_PANEL_MENU', icon: 'fa-cog', i18n: 'HEROMANCER.Wizard.Menus.Settings' }];

/** Main character-creation wizard. */
export class HeroMancer extends HMDialog {
  static DEFAULT_OPTIONS = {
    id: `${MODULE.ID}-wizard`,
    classes: ['hm-wizard'],
    tag: 'form',
    form: {
      handler: HeroMancer.#formHandler,
      closeOnSubmit: false,
      submitOnChange: false
    },
    position: { width: 960, height: 720 },
    actions: {
      openSettingsMenu: HeroMancer.#onOpenSettingsMenu,
      openDsnConfig: HeroMancer.#onOpenDsnConfig,
      saveDraft: HeroMancer.#onSaveDraft,
      navBack: HeroMancer.#onNavBack,
      navNext: HeroMancer.#onNavNext,
      randomizeCharacterName: HeroMancer.#onRandomizeName,
      randomizeAll: HeroMancer.#onRandomizeAll,
      selectCharacterArt: HeroMancer.#onPickArt,
      selectTokenArt: HeroMancer.#onPickArt,
      tokenize: HeroMancer.#onTokenize,
      rollAllAbilities: HeroMancer.#onRollAllAbilities,
      rerollPool: HeroMancer.#onRerollPool,
      rollHp: HeroMancer.#onRollHp,
      rollWealth: HeroMancer.#onRollWealth,
      rollBonusGold: HeroMancer.#onRollBonusGold,
      rejectReview: HeroMancer.#onRejectReview,
      selectFeat: HeroMancer.#onSelectFeat,
      asiAdjust: HeroMancer.#onAsiAdjust,
      togglePin: HeroMancer.#onTogglePin,
      openCompare: HeroMancer.#onOpenCompare,
      addMulticlass: HeroMancer.#onAddMulticlass,
      removeMulticlass: HeroMancer.#onRemoveMulticlass,
      mcLevelAdjust: HeroMancer.#onMcLevelAdjust,
      scrollIdentityTop: HeroMancer.#onScrollIdentityTop,
      setActiveClassDescription: HeroMancer.#onSetActiveClassDescription,
      setActiveSubclassDescription: HeroMancer.#onSetActiveSubclassDescription,
      browseAdvancementItems: HeroMancer.#onBrowseAdvancementItems,
      choiceUndo: HeroMancer.#onChoiceUndo
    }
  };

  static PARTS = {
    header: { template: MODULE.TEMPLATES.WIZARD.HEADER },
    sidebar: { template: MODULE.TEMPLATES.WIZARD.SIDEBAR },
    start: { template: MODULE.TEMPLATES.TABS.START, scrollable: [''] },
    'level-up': { template: MODULE.TEMPLATES.TABS.LEVEL_UP, scrollable: [''] },
    identity: { template: MODULE.TEMPLATES.TABS.IDENTITY, scrollable: [''] },
    abilities: { template: MODULE.TEMPLATES.TABS.ABILITIES, scrollable: [''] },
    hp: { template: MODULE.TEMPLATES.TABS.HP, scrollable: [''] },
    equipment: { template: MODULE.TEMPLATES.TABS.EQUIPMENT, scrollable: [''] },
    biography: { template: MODULE.TEMPLATES.TABS.BIOGRAPHY, scrollable: [''] },
    advancements: { template: MODULE.TEMPLATES.TABS.ADVANCEMENTS, scrollable: [''] },
    finalize: { template: MODULE.TEMPLATES.TABS.FINALIZE, scrollable: [''] },
    'detail-panel': { template: MODULE.TEMPLATES.COMPONENTS.EQUIPMENT_DETAIL_PANEL },
    footer: { template: MODULE.TEMPLATES.WIZARD.FOOTER }
  };

  static TABS = {
    primary: { initial: 'start', tabs: TAB_DEFS.map((t) => ({ id: t.id, icon: `fas ${t.icon}` })) },
    identity: { initial: 'background', tabs: [{ id: 'background' }, { id: 'species' }, { id: 'class' }, { id: 'subclass' }] },
    equipment: { initial: 'choices', tabs: [{ id: 'choices' }, { id: 'shop' }] }
  };

  /** @type {WizardStateMachine} */
  fsm = new WizardStateMachine();

  /** @type {object} Per-render cache of shared docs/state. */
  #shared = {};

  /** @type {boolean} Defer the advancements re-render until the picker drawer closes. */
  #pendingAdvancementRerender = false;

  /** @type {boolean} Set once the user navigates an Identity sub-tab. */
  #identitySubTabChosen = false;

  /** @type {boolean} One-shot: discard per-level HP rolls on the next render. */
  #hpMethodReset = false;

  /** @type {object} Initial seed values applied on first render. */
  #seed = {};

  /** @type {?{pageId: string, payload: object}} GM-side review-mode state. */
  #reviewMode = null;

  /** @type {?object} Submitted-payload seed for rebuilding a fresh wizard. */
  #resumeSeed = null;

  /** @type {'creation'|'level_up'} Wizard mode axis. */
  #mode = 'creation';

  /** @type {?object} Target actor for level-up mode. */
  #actor = null;

  /** @type {?object} Level-up seed draft. */
  #levelUpDraft = null;

  /** @type {boolean} True once first render has populated the DOM. */
  #hasRendered = false;

  /** @type {boolean} Set on the first user-driven change after restore. */
  #dirty = false;

  /** @type {boolean} Skip the unsaved-changes prompt in `_preClose`. */
  #confirmCloseBypass = false;

  /** @type {{search:string, subtype:string, rules:string, book:string, action:string, qualify:boolean, grantsAsi:boolean, grantsSpell:boolean}} Feat-browser filter state. */
  #featBrowserFilters = { search: '', subtype: 'all', rules: 'all', book: 'all', action: 'all', qualify: false, grantsAsi: false, grantsSpell: false };

  /** @type {SidebarHud} Sidebar HUD instance. */
  #hud = new SidebarHud();

  /** @type {?object} Last-built equipment shop context. */
  #shopContext = null;

  /** @type {{sort:string, filters:Set<string>, search:string}} Persisted shop controls. */
  #shopState = { sort: 'name-asc', filters: new Set(['all']), search: '' };

  /** @type {?number} Debounce handle for HUD updates. */
  #hudTimer = null;

  /** @type {?Map<string, number>} ManualFormula pool: value->count multiset, or null. */
  #mfPool = null;

  /** @type {number} ManualFormula reroll attempts used this session. */
  #mfRerollsUsed = 0;

  /** @type {?Array<{slotId:string, uuid:string, level:number, subclassUuid:string}>} One-shot roster override for the next identity-context build. */
  #identityRosterOverride = null;

  /** @type {?object} One-shot identity draft seed applied during restore. */
  #pendingIdentityDraft = null;

  /** @type {?object} One-shot HP draft seed applied during restore. */
  #pendingHpDraft = null;

  /** @type {?object} One-shot biography draft seed applied during restore. */
  #pendingBiographyDraft = null;

  /** @type {?object} One-shot equipment draft seed applied during restore. */
  #pendingEquipmentDraft = null;

  /** @type {?object} One-shot advancement draft seed applied during restore. */
  #pendingAdvancementDraft = null;

  /** @type {Map<string, string>} Last committed value per equipment tile-group, by group name. Survives part re-renders so gold-affecting transitions are detected. */
  #eqGroupValues = new Map();

  /** @type {boolean} True once the biography editor has been rebuilt while visible. */
  #biographyEditorBuilt = false;

  /** @type {boolean} True for one render after `#identityRosterOverride` is consumed. */
  #identityRosterJustOverridden = false;

  /** @type {?string} Slot id of the class whose description is currently shown below the roster. Null defaults to the first picked slot. */
  #activeClassDescriptionSlotId = null;

  /** @type {?string} Slot id of the subclass whose description is currently shown below the subclass picker list. Null defaults to the first picked subclass. */
  #activeSubclassDescriptionSlotId = null;

  /** @type {WeakMap<HTMLElement, Promise<void>>} Per-container render chain; serializes #renderIdentityDetail. */
  #identityRenderChain = new WeakMap();

  /**
   * @param {object} [options] AppV2 options plus optional `seed` for the start-tab draft, `reviewMode` for GM review of a submitted payload, and `mode`/`actor`/`levelUpDraft` for level-up.
   */
  constructor(options = {}) {
    const merged = options.reviewMode?.pageId ? { ...options, id: `${MODULE.ID}-wizard-review-${options.reviewMode.pageId}` } : options;
    super(merged);
    if (options.seed) this.#seed = options.seed;
    if (options.reviewMode) this.#reviewMode = options.reviewMode;
    if (options.resumeSeed) this.#resumeSeed = options.resumeSeed;
    if (options.mode === 'level_up') {
      this.#mode = 'level_up';
      this.#actor = options.actor ?? null;
      this.#levelUpDraft = options.levelUpDraft ?? null;
      this.fsm = new WizardStateMachine('level_up');
    }
  }

  /** @returns {'creation'|'level_up'} Active wizard mode. */
  get mode() {
    return this.#mode;
  }

  /** @returns {?object} Target actor when in level-up mode. */
  get actor() {
    return this.#actor;
  }

  /** @inheritdoc */
  _initializeApplicationOptions(options) {
    const merged = super._initializeApplicationOptions(options);
    const saved = game.settings.get(MODULE.ID, MODULE.SETTINGS.WIZARD_POSITION);
    if (saved && Object.keys(saved).length) merged.position = { ...merged.position, ...saved };
    return merged;
  }

  /** @inheritdoc */
  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const allowed = new Set(['header', 'sidebar', 'footer', 'detail-panel', ...TAB_DEFS.filter((t) => t.modes.includes(this.#mode)).map((t) => t.id)]);
    for (const id of Object.keys(parts)) if (!allowed.has(id)) delete parts[id];
    return parts;
  }

  /**
   * Resolve the per-tab draft from DOM, falling back to the review/resume payload seed before first render fills inputs.
   * @param {string} key Payload field name (`startDraft`, `identityDraft`, `abilitiesDraft`, `biographyDraft`, `equipmentDraft`, `advancementDraft`).
   * @returns {?object} Seed draft, or null when no seed available / after first render.
   */
  #reviewSeed(key) {
    if (this.#hasRendered) return null;
    return this.#reviewMode?.payload?.[key] ?? this.#resumeSeed?.[key] ?? null;
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    await preloadIdentityDocs();
    const visibleTabs = TAB_DEFS.filter((t) => t.modes.includes(this.#mode));
    const defaultTab = visibleTabs[0]?.id ?? 'start';
    if (!visibleTabs.some((t) => t.id === this.tabGroups.primary)) this.tabGroups.primary = defaultTab;
    const tabState = this.tabGroups.primary ?? defaultTab;
    const activeSubTab = this.tabGroups.identity ?? 'background';
    const { classDoc, effectiveLevel, subclassDocFromPick, roster } = await this.#resolveLevelContext();
    const abilityScores = this.#resolveAbilityScores();
    const rosterDocs = this.#mode === 'creation' ? await this.#resolveRosterDocs(roster, classDoc) : null;
    const asiBonus =
      this.#mode === 'creation'
        ? await computeAsiBonus({
            classRoster: await this.#buildAdvancementsRoster(),
            speciesDoc: await this.#identityDoc('species'),
            backgroundDoc: await this.#identityDoc('background'),
            advancementDraft: this.#readAdvancementDraft(),
            characterLevel: effectiveLevel
          })
        : null;
    const identityDraft = this.#readIdentityDraft();
    if (roster) identityDraft.classes = roster;
    const identityContext =
      this.#mode === 'creation'
        ? buildIdentityContext(identityDraft, {
            effectiveLevel,
            abilityScores: this.#mergeAsi(abilityScores, asiBonus),
            activeClassSlotId: this.#activeClassDescriptionSlotId,
            activeSubclassSlotId: this.#activeSubclassDescriptionSlotId
          })
        : null;
    let resolvedSubTab = activeSubTab;
    const sectionIds = identityContext?.sections?.map((s) => s.id) ?? [];
    if (sectionIds.length && (!this.#identitySubTabChosen || !sectionIds.includes(resolvedSubTab))) {
      resolvedSubTab = sectionIds[0];
      this.tabGroups.identity = resolvedSubTab;
    }
    this.#shared = { classDoc, effectiveLevel, identityContext, activeSubTab: resolvedSubTab, subclassDocFromPick, roster, rosterDocs, abilityScores, asiBonus };
    const pendingSubmission = getPendingSubmission();
    const reviewMode = !!this.#reviewMode;
    const reviewCharacterName = this.#reviewMode?.payload?.characterName ?? this.#reviewMode?.payload?.startDraft?.characterName ?? '';
    const title = reviewMode ? _loc('HEROMANCER.Wizard.Review.Title', { name: reviewCharacterName || _loc('HEROMANCER.Approval.Unnamed') }) : _loc('HEROMANCER.Wizard.Title');
    return {
      ...context,
      title,
      requireApproval: false,
      reviewMode,
      pendingSubmission: reviewMode ? null : pendingSubmission,
      canSubmit: reviewMode || !pendingSubmission,
      canRandomize: !reviewMode && this.#mode === 'creation' && game.settings.get(MODULE.ID, MODULE.SETTINGS.ENABLE_RANDOMIZE),
      portraitImg: null,
      globalProgress: { id: `${this.id}-global-pb`, value: 0, max: 1, state: 'incomplete', variant: 'global', showPercent: true },
      isGM: game.user.isGM,
      settingsMenus: game.user.isGM ? SETTINGS_MENUS.map((m) => ({ key: m.key, icon: m.icon, label: _loc(m.i18n) })) : [],
      mode: this.#mode,
      tabs: visibleTabs.map((t) => ({
        id: t.id,
        group: 'primary',
        icon: `fas ${t.icon}`,
        label: _loc(t.i18n),
        active: t.id === tabState,
        cssClass: t.id === tabState ? 'active' : '',
        progress: { id: `${this.id}-${t.id}-pb`, value: 0, max: 1, state: 'incomplete', variant: 'tab' },
        children: []
      }))
    };
  }

  /** @inheritdoc */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    const tab = context.tabs?.find((t) => t.id === partId);
    if (tab) context.tab = tab;
    const { classDoc, effectiveLevel, identityContext, activeSubTab } = this.#shared;
    switch (partId) {
      case 'level-up': {
        const draft = this.#readLevelUpDraft();
        return Object.assign(context, await buildLevelUpContext({ actor: this.#actor, roster: this.#levelUpDraft.roster, pickedUuid: draft.pickedClass, pickedSubclass: draft.pickedSubclass }));
      }
      case 'start':
        return Object.assign(context, buildStartContext({ ...this.#seed, ...this.#readStartDraftMapped() }));
      case 'identity':
        return Object.assign(context, identityContext, { activeSubTab });
      case 'abilities':
        return Object.assign(context, buildAbilitiesContext(this.#readAbilitiesDraft(), classDoc));
      case 'hp': {
        const hpRoster = await this.#buildHpRoster({ classDoc, effectiveLevel });
        const hpDraft = this.#readHpDraft();
        if (this.#hpMethodReset) {
          if (!this.#pendingHpDraft) {
            hpDraft.rolls = {};
            hpDraft.attempts = {};
          }
          this.#hpMethodReset = false;
        }
        return Object.assign(
          context,
          buildHpContext({
            draft: hpDraft,
            roster: hpRoster,
            conScore: this.#mode === 'level_up' ? this.#actor.system.abilities.con.value : (Number(this.#readAbilitiesDraft().abilities?.con?.value) || 0) + (Number(this.#shared?.asiBonus?.con) || 0),
            mode: this.#mode,
            rerollPolicy: { allowRerolls: game.settings.get(MODULE.ID, MODULE.SETTINGS.ALLOW_REROLLS), maxRerollAttempts: game.settings.get(MODULE.ID, MODULE.SETTINGS.MAX_REROLL_ATTEMPTS) },
            l1MaxDie: game.settings.get(MODULE.ID, MODULE.SETTINGS.HP_L1_MAX_DIE)
          })
        );
      }
      case 'equipment': {
        const equipmentSubTab = this.tabGroups.equipment ?? 'choices';
        const equipmentContext = await buildEquipmentContext({
          classDoc,
          backgroundDoc: await this.#identityDoc('background'),
          speciesDoc: await this.#identityDoc('species'),
          draft: this.#readEquipmentDraft()
        });
        this.#shopContext = equipmentContext.shop ?? null;
        return Object.assign(context, equipmentContext, { equipmentSubTab });
      }
      case 'biography':
        return Object.assign(context, buildBiographyContext(this.#readBiographyDraft(), this.#readStartDraftMapped()));
      case 'advancements': {
        const advDraft = this.#readAdvancementDraft();
        const abilityScores = this.#resolveAbilityScores();
        const isCreation = this.#mode === 'creation';
        const speciesDoc = isCreation ? await this.#identityDoc('species') : (this.#actor.items.find((i) => i.type === 'race') ?? null);
        const backgroundDoc = isCreation ? await this.#identityDoc('background') : (this.#actor.items.find((i) => i.type === 'background') ?? null);
        const characterLevel = isCreation ? effectiveLevel : this.#actor.system.details.level + 1;
        const advancementRoster = await this.#buildAdvancementsRoster();
        const totalCharLevel = characterLevel ?? (advancementRoster.reduce((sum, s) => sum + (Number(s.level) || 0), 0) || effectiveLevel);
        this.#shared.totalCharLevel = totalCharLevel;
        const advancementsContext = await buildAdvancementsContext({
          classRoster: advancementRoster,
          effectiveLevel,
          draft: advDraft,
          mode: this.#mode,
          actor: this.#actor,
          abilityScores,
          speciesDoc,
          backgroundDoc,
          characterLevel,
          equipmentTraitLinks: extractEquipmentTraitLinks(this.#readEquipmentDraft())
        });
        return Object.assign(context, advancementsContext);
      }
      case 'finalize': {
        const backgroundDoc = await this.#identityDoc('background');
        const equipmentDraft = this.#readEquipmentDraft();
        const speciesDoc = await this.#identityDoc('species');
        const equipmentContext = await buildEquipmentContext({ classDoc, backgroundDoc, speciesDoc, draft: equipmentDraft });
        const equipmentReview = await buildEquipmentReview({ equipmentContext, draft: equipmentDraft });
        const finalizeAdvRoster = await this.#buildAdvancementsRoster();
        const asiBonus = await computeAsiBonus({ classRoster: finalizeAdvRoster, speciesDoc, backgroundDoc, advancementDraft: this.#readAdvancementDraft(), characterLevel: effectiveLevel });
        return Object.assign(
          context,
          buildFinalizeContext({
            start: this.#readStartDraft(),
            identity: this.#readIdentityDraft(),
            abilities: this.#readAbilitiesDraft().abilities,
            biography: this.#readBiographyDraft(),
            classRoster: finalizeAdvRoster,
            speciesDoc,
            backgroundDoc,
            effectiveLevel,
            equipmentReview,
            skipSpellHandoff: this.#readSkipSpellHandoff(),
            asiBonus
          })
        );
      }
    }
    return context;
  }

  /**
   * Snapshot the equipment-tab tile-group selections from DOM.
   * @returns {Object<string, string>} `{<tag>.<groupId>: <tileValue>}`.
   */
  #readEquipmentDraft() {
    const seed = this.#reviewSeed('equipmentDraft') ?? this.#pendingEquipmentDraft;
    if (seed) return seed;
    if (!this.element) return {};
    const out = {};
    for (const tg of this.element.querySelectorAll('[data-tab="equipment"] [data-equipment-tile-group]')) {
      const name = tg.dataset.name;
      if (!name?.startsWith('equipment.')) continue;
      out[name.slice('equipment.'.length)] = tg.dataset.value ?? '';
    }
    for (const inp of this.element.querySelectorAll('[data-tab="equipment"] input[type="hidden"][data-and-picker]')) {
      const name = inp.name;
      if (!name?.startsWith('equipment.')) continue;
      out[name.slice('equipment.'.length)] = inp.value ?? '';
    }
    for (const inp of this.element.querySelectorAll('[data-tab="equipment"] input[type="hidden"][data-eq-adv-link]')) {
      const name = inp.name;
      if (!name?.startsWith('equipment.')) continue;
      out[name.slice('equipment.'.length)] = inp.value ?? '';
    }
    for (const cb of this.element.querySelectorAll('[data-tab="equipment"] input[type="checkbox"][data-eq-wealth-toggle]')) {
      const name = cb.name;
      if (!name?.startsWith('equipment.')) continue;
      out[name.slice('equipment.'.length)] = cb.checked ? '1' : '';
    }
    for (const inp of this.element.querySelectorAll('[data-tab="equipment"] input[data-eq-wealth-rolled]')) {
      const name = inp.name;
      if (!name?.startsWith('equipment.')) continue;
      out[name.slice('equipment.'.length)] = inp.value ?? '';
    }
    const bonus = this.element.querySelector('[data-tab="equipment"] input[data-eq-bonus-rolled]');
    if (bonus?.value) out.bonusGoldRolled = bonus.value;
    for (const qty of this.element.querySelectorAll('[data-tab="equipment"] input[data-eq-cart-qty]')) {
      const name = qty.name;
      if (!name?.startsWith('equipment.')) continue;
      out[name.slice('equipment.'.length)] = qty.value ?? '';
    }
    return out;
  }

  /**
   * Snapshot the level-up tab's picker selection.
   * @returns {{pickedClass: ?string, isMulticlass: boolean, pickedSubclass: ?string}} Picked uuid + multiclass flag + picked subclass uuid when threshold-hit picker is mounted.
   */
  #readLevelUpDraft() {
    if (!this.element) return { pickedClass: null, isMulticlass: false, pickedSubclass: null };
    const checked = this.element.querySelector('[data-tab="level-up"] input[name="levelUp.pickedClass"]:checked');
    const subclassCb = this.element.querySelector('[data-tab="level-up"] [data-combobox][data-name="levelUp.pickedSubclass"]');
    const pickedSubclass = subclassCb?.dataset.value || null;
    if (!checked) return { pickedClass: null, isMulticlass: false, pickedSubclass };
    return { pickedClass: checked.value, isMulticlass: checked.dataset.multiclass === '1', pickedSubclass };
  }

  /**
   * Snapshot advancement-tab pick hidden inputs from DOM.
   * @returns {Object<string, Object<number, object>>} `{[advancementId]: {[level]: pickData}}`.
   */
  #readAdvancementDraft() {
    const seed = this.#reviewSeed('advancementDraft') ?? this.#pendingAdvancementDraft;
    if (seed) return seed;
    return readAdvancementDraft(this.element);
  }

  /**
   * Snapshot the finalize-tab skip-spell-handoff checkbox.
   * @returns {boolean} `true` when the player opted out of the Spell Book handoff.
   */
  #readSkipSpellHandoff() {
    const seed = this.#reviewSeed('skipSpellHandoff');
    if (seed !== null) return !!seed;
    return !!this.element?.querySelector('input[name="finalize.skipSpellHandoff"]')?.checked;
  }

  /**
   * Resolve `{classDoc, effectiveLevel, subclassDocFromPick, roster}` based on mode.
   * @returns {Promise<{classDoc:?object, effectiveLevel:number, subclassDocFromPick:?object, roster:?Array}>} Resolved shared context. `roster` is populated in creation mode.
   */
  async #resolveLevelContext() {
    if (this.#mode !== 'level_up') {
      const effectiveLevel = getEffectiveStartingLevel(this.#readStartDraftMapped());
      let roster = this.#identityRosterOverride;
      if (roster) {
        this.#identityRosterOverride = null;
        this.#identityRosterJustOverridden = true;
      } else roster = this.#readIdentityRoster();
      if (!roster.length) roster = [{ slotId: rosterSlotId(), uuid: '', level: effectiveLevel, subclassUuid: '' }];
      else if (effectiveLevel <= 1 && roster.length > 1) roster = [{ ...roster[0], level: effectiveLevel }];
      else if (roster[0]) roster[0].level = Math.max(0, Math.min(effectiveLevel, Number(roster[0].level) || effectiveLevel));
      const primaryUuid = roster[0]?.uuid ?? null;
      const classDoc = primaryUuid ? await documentLoader.getFullDocument(primaryUuid) : null;
      return { classDoc, effectiveLevel, subclassDocFromPick: null, roster };
    }
    const draft = this.#readLevelUpDraft();
    const pickedUuid = draft.pickedClass;
    if (!pickedUuid) return { classDoc: null, effectiveLevel: 1, subclassDocFromPick: null, roster: null };
    const draftSubclassDoc = draft.pickedSubclass ? await documentLoader.getFullDocument(draft.pickedSubclass) : null;
    const existing = this.#levelUpDraft.roster.classes.find((c) => c.uuid === pickedUuid);
    if (existing) {
      const classDoc = this.#actor.items.get(existing.id);
      const subclassDocFromPick = existing.subclassUuid ? this.#actor.items.find((i) => i.uuid === existing.subclassUuid) : draftSubclassDoc;
      return { classDoc, effectiveLevel: existing.level + 1, subclassDocFromPick, roster: null };
    }
    return { classDoc: await documentLoader.getFullDocument(pickedUuid), effectiveLevel: 1, subclassDocFromPick: draftSubclassDoc, roster: null };
  }

  /**
   * Resolve a current identity sub-tab selection to its full Document. For `class` and `subclass` returns the primary roster slot's doc.
   * @param {string} sectionId Identity sub-tab id (background|species|class|subclass).
   * @returns {Promise<?object>} Full Document, or null when nothing picked.
   */
  async #identityDoc(sectionId) {
    const seedIdentity = this.#reviewSeed('identityDraft');
    if (sectionId === 'class' || sectionId === 'subclass') {
      const seedClasses = seedIdentity?.classes;
      const seedRoster = Array.isArray(seedClasses) && seedClasses.length ? seedClasses[0] : null;
      const fromSeed = seedRoster ? (sectionId === 'class' ? seedRoster.uuid : seedRoster.subclassUuid) : null;
      const fromDom = this.element?.querySelector(`[data-tab="identity"] [data-mc-row][data-primary="true"] [data-combobox][data-name$="${sectionId === 'class' ? '.uuid' : '.subclassUuid'}"]`)
        ?.dataset.value;
      const uuid = fromSeed ?? fromDom ?? null;
      return uuid ? documentLoader.getFullDocument(uuid) : null;
    }
    const seedUuid = seedIdentity?.[sectionId];
    const uuid = seedUuid ?? this.element?.querySelector(`[data-combobox][data-name="identity.${sectionId}"]`)?.dataset.value;
    if (!uuid) return null;
    return documentLoader.getFullDocument(uuid);
  }

  /**
   * Resolve every roster slot's class Document, preserving roster order.
   * @returns {Promise<Array<{slotId:string, level:number, classDoc:?object, subclassUuid:string}>>} Per-slot resolved docs.
   */
  async #identityClassDocs() {
    const roster = this.#shared?.roster ?? this.#readIdentityRoster();
    const out = [];
    for (const slot of roster) {
      const classDoc = slot.uuid ? await documentLoader.getFullDocument(slot.uuid) : null;
      out.push({ slotId: slot.slotId, level: slot.level, classDoc, subclassUuid: slot.subclassUuid });
    }
    return out;
  }

  /**
   * Resolve every roster slot's class + subclass Documents for the HUD snapshot, reusing the pre-resolved primary `classDoc` for slot 0.
   * @param {Array<{slotId:string, uuid:string, level:number, subclassUuid:string}>} roster Roster slots in display order.
   * @param {?object} primaryClassDoc Pre-resolved primary class doc (roster[0]).
   * @returns {Promise<Array<{slotId:string, level:number, classDoc:?object, subclassDoc:?object}>>} Per-slot resolved docs.
   */
  async #resolveRosterDocs(roster, primaryClassDoc) {
    if (!roster.length) return [];
    const primaryUuid = roster[0].uuid;
    const out = [];
    for (const slot of roster) {
      let classDoc = null;
      if (slot.uuid === primaryUuid && primaryClassDoc) classDoc = primaryClassDoc;
      else if (slot.uuid) classDoc = await documentLoader.getFullDocument(slot.uuid);
      const subclassDoc = slot.subclassUuid ? await documentLoader.getFullDocument(slot.subclassUuid) : null;
      out.push({ slotId: slot.slotId, level: slot.level, classDoc, subclassDoc });
    }
    return out;
  }

  /**
   * Build the per-class roster for `buildAdvancementsContext`.
   * @returns {Promise<Array<{slotId:string, classDoc:?object, subclassDoc:?object, level:number, isPrimary:boolean}>>} Per-class roster.
   */
  async #buildAdvancementsRoster() {
    if (this.#mode === 'level_up') {
      const { classDoc, subclassDocFromPick, effectiveLevel } = await this.#resolveLevelContext();
      if (!classDoc) return [];
      return [{ slotId: 'levelup', classDoc, subclassDoc: subclassDocFromPick, level: effectiveLevel, isPrimary: isOriginalClassItem(classDoc) }];
    }
    const docs = await this.#identityClassDocs();
    const out = [];
    for (let i = 0; i < docs.length; i++) {
      const d = docs[i];
      if (!d.classDoc) continue;
      const subclassDoc = d.subclassUuid ? await documentLoader.getFullDocument(d.subclassUuid) : null;
      out.push({ slotId: d.slotId, classDoc: d.classDoc, subclassDoc, level: d.level, isPrimary: i === 0 });
    }
    return out;
  }

  /**
   * Build the per-slot roster consumed by `buildHpContext`.
   * @param {object} args Builder inputs.
   * @param {?object} args.classDoc Class doc resolved by `#resolveLevelContext` (used as the level-up slot's source).
   * @param {number} args.effectiveLevel Character level (creation) or new level (level-up).
   * @returns {Promise<Array<{slotId:string, level:number, classDoc:?object, isPrimary:boolean, startLevel:number}>>} Per-block roster.
   */
  async #buildHpRoster({ classDoc, effectiveLevel }) {
    if (this.#mode === 'level_up') {
      const roster = [];
      const actorClasses = this.#actor.items.filter((i) => i.type === 'class');
      const primary = actorClasses.find((c) => c.system?.isOriginalClass) ?? actorClasses[0] ?? null;
      const ordered = primary ? [primary, ...actorClasses.filter((c) => c !== primary)] : [...actorClasses];
      for (const cls of ordered) {
        const currentLevel = Number(cls.system?.levels) || 0;
        if (!currentLevel) continue;
        roster.push({ slotId: `actor-${cls.id}`, level: currentLevel, classDoc: cls, isPrimary: cls === primary, startLevel: 1, locked: true, lockedRolls: readLockedRolls(cls) });
      }
      if (classDoc) {
        const newSlotPrimary = !primary && !actorClasses.some((c) => c.id === classDoc.id);
        roster.push({ slotId: 'levelup', level: effectiveLevel, classDoc, isPrimary: newSlotPrimary, startLevel: effectiveLevel });
      }
      return roster;
    }
    const docs = await this.#identityClassDocs();
    return docs.map((d, idx) => ({ slotId: d.slotId, level: d.level, classDoc: d.classDoc, isPrimary: idx === 0, startLevel: 1 }));
  }

  /**
   * Snapshot start-tab form values from DOM.
   * @returns {object} Flat draft object.
   */
  #readStartDraft() {
    if (!this.element) return {};
    const out = {};
    for (const el of this.element.querySelectorAll('[data-tab="start"] input[name], [data-tab="start"] select[name]')) out[el.name] = el.type === 'checkbox' ? el.checked : el.value;
    return out;
  }

  /**
   * Snapshot start-tab values mapped to camelCase keys expected by buildStartContext.
   * @returns {object} Camel-cased draft.
   */
  #readStartDraftMapped() {
    const seed = this.#reviewSeed('startDraft');
    if (seed) {
      const submitter = this.#reviewMode?.submitterUserId;
      return submitter && !seed.player ? { ...seed, player: submitter } : seed;
    }
    const raw = this.#readStartDraft();
    const nested = foundry.utils.expandObject(raw);
    const out = {};
    for (const [k, v] of Object.entries(nested)) {
      const cc = k.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
      out[cc] = v;
    }
    return out;
  }

  /**
   * Snapshot identity-tab values from DOM as `{background, species, classes:[{slotId,uuid,level,subclassUuid}, ...]}`.
   * @returns {object} Identity draft.
   */
  #readIdentityDraft() {
    if (this.#pendingIdentityDraft) return this.#pendingIdentityDraft;
    const seed = this.#reviewSeed('identityDraft');
    if (seed) return seed;
    if (!this.element) return { classes: [] };
    const out = {};
    for (const cb of this.element.querySelectorAll('[data-tab="identity"] [data-combobox][data-name^="identity."]')) {
      const name = cb.dataset.name;
      if (name.startsWith('identity.classes.')) continue;
      const key = name.split('.')[1];
      out[key] = cb.dataset.value;
    }
    out.classes = this.#readIdentityRoster();
    return out;
  }

  /**
   * Read the multiclass roster from DOM: walks every `[data-mc-row]` in the identity tab in document order, pulling each row's class uuid + level + (cross-section) subclass uuid.
   * @returns {Array<{slotId:string, uuid:string, level:number, subclassUuid:string}>} Roster in primary-first display order.
   */
  #readIdentityRoster() {
    if (this.#pendingIdentityDraft) return Array.isArray(this.#pendingIdentityDraft.classes) ? this.#pendingIdentityDraft.classes : [];
    const seed = this.#reviewSeed('identityDraft');
    if (seed) return Array.isArray(seed.classes) ? seed.classes : [];
    if (!this.element) return [];
    const rows = [];
    for (const row of this.element.querySelectorAll('[data-tab="identity"] [data-mc-row]')) {
      const slotId = row.dataset.slotId;
      if (!slotId) continue;
      const uuid = row.querySelector('[data-combobox]')?.dataset.value ?? '';
      const level = Number(row.querySelector('[data-mc-level]')?.value) || 0;
      const subclassCb = this.element.querySelector(`[data-tab="identity"] [data-combobox][data-name="identity.classes.${slotId}.subclassUuid"]`);
      const subclassUuid = subclassCb?.dataset.value ?? '';
      rows.push({ slotId, uuid, level, subclassUuid });
    }
    return rows;
  }

  /**
   * Snapshot biography-tab form values from DOM.
   * @returns {object} Flat draft object keyed by field name (without `biography.` prefix).
   */
  #readBiographyDraft() {
    const seed = this.#reviewSeed('biographyDraft') ?? this.#pendingBiographyDraft;
    if (seed) return seed;
    if (!this.element) return {};
    const out = {};
    for (const el of this.element.querySelectorAll('[data-tab="biography"] [name^="biography."]')) {
      const key = el.name.split('.')[1];
      out[key] = el.value;
    }
    return out;
  }

  /**
   * Snapshot the HP tab's per-slot per-level roll inputs from DOM.
   * @returns {{rolls: Object<string, Object<string, string>>}} Draft consumed by `buildHpContext`, keyed by `slotId` then `level`.
   */
  #readHpDraft() {
    const seed = this.#reviewSeed('hpDraft') ?? this.#pendingHpDraft;
    if (seed) return seed;
    if (!this.element) return { rolls: {}, attempts: {} };
    const out = { rolls: {}, attempts: {}, method: this.element.querySelector('[data-hp-method]')?.value };
    for (const el of this.element.querySelectorAll('[data-tab="hp"] input[name^="hp.rolls."]')) {
      const parts = el.name.split('.');
      if (parts.length < 4) continue;
      const slotId = parts[2];
      const level = parts[3];
      if (!slotId || !level) continue;
      (out.rolls[slotId] ??= {})[level] = el.value;
    }
    for (const el of this.element.querySelectorAll('[data-tab="hp"] input[name^="hp.attempts."]')) {
      const parts = el.name.split('.');
      if (parts.length < 4) continue;
      const slotId = parts[2];
      const level = parts[3];
      if (!slotId || !level) continue;
      (out.attempts[slotId] ??= {})[level] = el.value;
    }
    return out;
  }

  /**
   * Snapshot current abilities form values from DOM so re-renders preserve user selections.
   * @returns {{method: ?string, abilities: Object<string, Object<string, string>>}} Draft shape consumed by `buildAbilitiesContext`.
   */
  #readAbilitiesDraft() {
    const seed = this.#reviewSeed('abilitiesDraft');
    if (seed) return seed;
    if (!this.element) return {};
    const method = this.element.querySelector('[data-abilities-method]')?.value;
    const abilities = {};
    for (const input of this.element.querySelectorAll('[data-ability-block] input[type="hidden"]')) {
      const name = input.name;
      if (!name?.startsWith('abilities.')) continue;
      const [, key, field] = name.split('.');
      abilities[key] ??= {};
      abilities[key][field] = input.value;
    }
    return { method, abilities };
  }

  /** @inheritdoc */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    this.bringToFront();
    if (this.fsm.can(MODULE.WIZARD.EVENTS.OPEN)) this.fsm.send(MODULE.WIZARD.EVENTS.OPEN);
    Hooks.callAll(MODULE.HOOKS.WIZARD_OPENED, { app: this, fsm: this.fsm });
    initFeatIndex();
    this.#hud.attach(this.element).then(() => this.#refreshHud());
    if (this.#reviewMode || this.#resumeSeed) this.#restoreFromReviewPayload();
    else this.#restoreDraft();
  }

  /** Push the latest snapshot to the HUD, debounced so rapid keystrokes coalesce. */
  #refreshHud() {
    if (!this.element || !this.#hasRendered) return;
    if (this.#hudTimer) clearTimeout(this.#hudTimer);
    this.#hudTimer = setTimeout(async () => {
      this.#hudTimer = null;
      try {
        const snapshot = await buildHudSnapshot(this.element, this.#shared, { shopContext: this.#shopContext, mode: this.#mode, actor: this.#actor });
        this.#hud.update(snapshot);
      } catch (err) {
        log(2, 'HUD update failed:', err);
      }
    }, 80);
  }

  /**
   * Apply the submitted payload's `rawDraft` to the freshly-rendered review or resume wizard.
   * @returns {void}
   */
  #restoreFromReviewPayload() {
    const rawDraft = this.#reviewMode?.payload?.rawDraft ?? this.#resumeSeed?.rawDraft;
    if (!rawDraft) return;
    const method = rawDraft['abilities.method'];
    if (method) {
      const select = this.element.querySelector('[data-abilities-method]');
      if (select) select.value = method;
      AbilityBlock.attachAll(this.element).forEach((b) => b.setMethod(method));
    }
    const rest = { ...rawDraft };
    delete rest['abilities.method'];
    applyDraft(rest, this.element);
    for (const blockEl of this.element.querySelectorAll('[data-ability-block]')) {
      const v = blockEl.querySelector('input[data-value-input]')?.value;
      if (v !== '' && v != null) AbilityBlock.attach(blockEl).setValue(Number(v));
    }
    for (const cb of this.element.querySelectorAll('[data-combobox]')) {
      const value = cb.querySelector('input[type="hidden"]')?.value || cb.dataset.value;
      if (value) Combobox.attach(cb).select(value);
    }
    this.#refreshValidation();
    if (Object.keys(rest).some((k) => k.startsWith('hp.'))) this.render({ parts: ['hp'] });
  }

  /**
   * Snapshot every named form element under the wizard into a flat draft map.
   * @returns {Object<string, *>} Field map keyed by element `name`.
   */
  #snapshotForm() {
    const out = {};
    for (const el of this.element.querySelectorAll('input[name], select[name], textarea[name], prose-mirror[name]')) {
      if (el.type === 'checkbox') {
        if (!Array.isArray(out[el.name])) out[el.name] = [];
        if (el.checked) out[el.name].push(el.value);
      } else if (el.type === 'radio') {
        if (el.checked) out[el.name] = el.value;
      } else {
        out[el.name] = el.value;
      }
    }
    return out;
  }

  /**
   * Unpack the identity-tab slice of a flat dotted-key draft into the nested shape `#readIdentityDraft` returns.
   * @param {Object<string, *>} flat Saved draft.
   * @returns {{background:string, species:string, classes:Array<{slotId:string,uuid:string,level:number,subclassUuid:string}>}} Nested identity draft.
   */
  static #extractIdentityDraft(flat) {
    const out = { classes: [] };
    const slots = new Map();
    for (const [key, value] of Object.entries(flat)) {
      if (!key.startsWith('identity.')) continue;
      if (key.startsWith('identity.classes.')) {
        const parts = key.split('.');
        const slotId = parts[2];
        const field = parts.slice(3).join('.');
        if (!slots.has(slotId)) slots.set(slotId, { slotId, uuid: '', level: 0, subclassUuid: '' });
        slots.get(slotId)[field] = value;
      } else {
        const field = key.slice('identity.'.length);
        out[field] = value;
      }
    }
    for (const slot of slots.values()) slot.level = Number(slot.level) || 0;
    out.classes = [...slots.values()];
    return out;
  }

  /**
   * Unpack the HP-tab slice of a flat draft into the `{rolls, attempts, method}` shape `buildHpContext` expects.
   * @param {Object<string, *>} flat Saved draft.
   * @returns {{rolls: object, attempts: object, method: ?string}} HP draft seed keyed by slotId then level.
   */
  static #extractHpDraft(flat) {
    const out = { rolls: {}, attempts: {}, method: flat['hp.method'] };
    for (const [key, value] of Object.entries(flat)) {
      const parts = key.split('.');
      if (parts.length < 4) continue;
      if (key.startsWith('hp.rolls.')) (out.rolls[parts[2]] ??= {})[parts[3]] = value;
      else if (key.startsWith('hp.attempts.')) (out.attempts[parts[2]] ??= {})[parts[3]] = value;
    }
    return out;
  }

  /**
   * Unpack the biography-tab slice of a flat draft into the field map `buildBiographyContext` expects.
   * @param {Object<string, *>} flat Saved draft.
   * @returns {Object<string, *>} Biography fields keyed without the `biography.` prefix.
   */
  static #extractBiographyDraft(flat) {
    const out = {};
    for (const [key, value] of Object.entries(flat)) if (key.startsWith('biography.')) out[key.slice('biography.'.length)] = value;
    return out;
  }

  /**
   * Unpack the equipment-tab slice of a flat draft into the prefix-stripped map `buildEquipmentContext` expects. Checkbox values snapshot as arrays; collapse them to a single truthy/empty token.
   * @param {Object<string, *>} flat Saved draft.
   * @returns {Object<string, *>} Equipment fields keyed without the `equipment.` prefix.
   */
  static #extractEquipmentDraft(flat) {
    const out = {};
    for (const [key, value] of Object.entries(flat)) {
      if (!key.startsWith('equipment.')) continue;
      out[key.slice('equipment.'.length)] = Array.isArray(value) ? (value.length ? value[value.length - 1] : '') : value;
    }
    return out;
  }

  /** Load a saved draft (if any) and apply it to the live form. */
  async #restoreDraft() {
    const draft = await savedOptions.load();
    if (!draft) return;
    if (Array.isArray(draft.__mfPool)) this.#mfPool = new Map(draft.__mfPool.map(([k, n]) => [String(k), Number(n)]));
    if (Number.isFinite(Number(draft.__mfRerollsUsed))) this.#mfRerollsUsed = Number(draft.__mfRerollsUsed);
    const method = draft['abilities.method'];
    if (method) {
      const select = this.element.querySelector('[data-abilities-method]');
      if (select) select.value = method;
      AbilityBlock.attachAll(this.element).forEach((b) => b.setMethod(method));
    }
    const rest = { ...draft };
    delete rest['abilities.method'];
    delete rest.__mfPool;
    delete rest.__mfRerollsUsed;
    for (const key of Object.keys(rest)) if (key.startsWith('identity.')) delete rest[key];
    const applied = applyDraft(rest, this.element);
    const identitySeed = HeroMancer.#extractIdentityDraft(draft);
    const hasIdentity = identitySeed.background || identitySeed.species || identitySeed.classes.length > 0;
    if (hasIdentity) {
      this.#pendingIdentityDraft = identitySeed;
      await this.render({ parts: ['identity'] });
      this.#pendingIdentityDraft = null;
    }
    for (const blockEl of this.element.querySelectorAll('[data-ability-block]')) {
      const v = blockEl.querySelector('input[data-value-input]')?.value;
      if (v !== '' && v != null) AbilityBlock.attach(blockEl).setValue(Number(v));
    }
    for (const cb of this.element.querySelectorAll('[data-combobox]')) {
      const value = cb.querySelector('input[type="hidden"]')?.value || cb.dataset.value;
      if (value) {
        cb.dataset.value = value;
        Combobox.attach(cb).select(value);
      }
    }
    this.#refreshValidation();
    const partsToRender = [];
    if (method) partsToRender.push('abilities');
    if (Object.keys(rest).some((k) => k.startsWith('hp.'))) {
      this.#pendingHpDraft = HeroMancer.#extractHpDraft(draft);
      partsToRender.push('hp');
    }
    if (Object.keys(rest).some((k) => k.startsWith('biography.'))) {
      this.#pendingBiographyDraft = HeroMancer.#extractBiographyDraft(draft);
      partsToRender.push('biography');
    }
    if (Object.keys(rest).some((k) => k.startsWith('equipment.'))) {
      this.#pendingEquipmentDraft = HeroMancer.#extractEquipmentDraft(draft);
      partsToRender.push('equipment');
    }
    if (Object.keys(rest).some((k) => k.startsWith(ADVANCEMENT_FIELD_PREFIX))) {
      this.#pendingAdvancementDraft = advancementDraftFromFlat(draft);
      partsToRender.push('advancements');
    }
    if (partsToRender.length) await this.render({ parts: partsToRender });
    this.#pendingHpDraft = null;
    this.#pendingBiographyDraft = null;
    this.#pendingEquipmentDraft = null;
    this.#pendingAdvancementDraft = null;
    if (applied) {
      ui.notifications.info('HEROMANCER.Wizard.Draft.Restored', { localize: true });
      this.#dirty = true;
    }
  }

  /** @inheritdoc */
  async _preClose(options) {
    if (this.fsm.can(MODULE.WIZARD.EVENTS.CANCEL)) this.fsm.send(MODULE.WIZARD.EVENTS.CANCEL);
    return super._preClose(options);
  }

  /** @inheritdoc */
  _onClose(options) {
    if (this.#hudTimer) clearTimeout(this.#hudTimer);
    this.#hudTimer = null;
    this.#hud.destroy();
    return super._onClose(options);
  }

  /** @inheritdoc */
  async close(options = {}) {
    if (!this.#confirmCloseBypass && this.#dirty && this.#mode === 'creation' && !this.#reviewMode) {
      const choice = await HMPrompt.wait({
        window: { title: 'HEROMANCER.Wizard.CloseConfirm.Title' },
        body: _loc('HEROMANCER.Wizard.CloseConfirm.Content'),
        modal: true,
        close: () => 'cancel',
        buttons: [
          { action: 'save', label: 'HEROMANCER.Wizard.CloseConfirm.SaveDraft', icon: 'fa-solid fa-floppy-disk', default: true },
          { action: 'discard', label: 'HEROMANCER.Wizard.CloseConfirm.Discard', icon: 'fa-solid fa-trash' },
          { action: 'cancel', label: 'COMMON.Cancel', icon: 'fa-solid fa-xmark' }
        ]
      });
      if (choice === 'cancel') return this;
      if (choice === 'save') {
        try {
          const draft = this.#snapshotForm();
          if (this.#mfPool) draft.__mfPool = [...this.#mfPool.entries()];
          draft.__mfRerollsUsed = this.#mfRerollsUsed ?? 0;
          await savedOptions.save(draft);
          ui.notifications.info('HEROMANCER.Wizard.Draft.Saved', { localize: true });
        } catch (err) {
          log(1, 'close-save failed:', err);
          ui.notifications.error('HEROMANCER.Wizard.Draft.SaveFailed', { localize: true });
          return this;
        }
      } else if (choice === 'discard') {
        await savedOptions.clear('close-discard');
      }
      this.#confirmCloseBypass = true;
    }
    return super.close(options);
  }

  /** @inheritdoc */
  changeTab(tab, group, options) {
    super.changeTab(tab, group, options);
    if (group === 'identity') this.#identitySubTabChosen = true;
    if (group === 'primary') {
      if (this.fsm.can(MODULE.WIZARD.EVENTS.TAB_CHANGE)) this.fsm.send(MODULE.WIZARD.EVENTS.TAB_CHANGE, { tab });
      if (tab === 'finalize') this.render({ parts: ['finalize'] });
      else if (tab === 'advancements') this.render({ parts: ['advancements'] });
      else if (tab === 'biography' && !this.#biographyEditorBuilt) {
        this.#biographyEditorBuilt = true;
        this.render({ parts: ['biography'] });
      }
    }
    if (group === 'primary' || group === 'identity') this.#syncFooterNav();
  }

  /**
   * Re-render only the tab parts a changed world setting affects.
   * @param {string} fullKey Namespaced setting key (`hero-mancer.<key>`).
   */
  rerenderForSetting(fullKey) {
    const key = fullKey.slice(`${MODULE.ID}.`.length);
    const validTabs = TAB_DEFS.filter((t) => t.modes.includes(this.#mode)).map((t) => t.id);
    const requested = key in SETTING_PARTS ? SETTING_PARTS[key] : validTabs;
    const parts = requested.filter((p) => validTabs.includes(p));
    if (parts.length) this.render({ parts });
  }

  /**
   * Rebuild the feat index, then re-render every tab with the reindexed pools after a dnd5e source-config change, then drop identity picks whose option vanished so dependents follow.
   * @returns {Promise<void>}
   */
  async refreshForSourceChange() {
    const validTabs = TAB_DEFS.filter((t) => t.modes.includes(this.#mode)).map((t) => t.id);
    initFeatIndex();
    await this.render({ parts: validTabs });
    for (const combo of this.element.querySelectorAll('[data-tab="identity"] [data-combobox]')) {
      if (combo.dataset.value && !combo.querySelector('.hm-combobox-option[data-selected]')) Combobox.attach(combo).clear();
    }
  }

  /**
   * Flattened wizard step list: primary tabs in order, with the Identity tab expanded into its sub-tabs.
   * @returns {Array<{group: string, tab: string}>} Ordered steps.
   */
  #navSteps() {
    const steps = [];
    for (const btn of this.element.querySelectorAll('.hm-wizard-nav-btn[data-tab]')) {
      if (btn.dataset.tab === 'identity') {
        for (const sub of this.element.querySelectorAll('.hm-tab-subtab-btn[data-group="identity"][data-tab]')) steps.push({ group: 'identity', tab: sub.dataset.tab });
      } else {
        steps.push({ group: 'primary', tab: btn.dataset.tab });
      }
    }
    return steps;
  }

  /** @returns {{group: string, tab: string}} The current step (Identity resolves to its active sub-tab). */
  #currentStep() {
    const primary = this.tabGroups.primary;
    return primary === 'identity' ? { group: 'identity', tab: this.tabGroups.identity } : { group: 'primary', tab: primary };
  }

  /**
   * Move forward or backward through the flattened step list.
   * @param {number} delta Step offset (`-1` back, `1` next).
   */
  #navStep(delta) {
    const steps = this.#navSteps();
    const current = this.#currentStep();
    const target = steps[steps.findIndex((s) => s.group === current.group && s.tab === current.tab) + delta];
    if (!target) return;
    if (target.group === 'identity' && this.tabGroups.primary !== 'identity') this.changeTab('identity', 'primary');
    this.changeTab(target.tab, target.group);
  }

  /** Toggle the footer Back disabled state and swap Next/Create for the first/last step. */
  #syncFooterNav() {
    const steps = this.#navSteps();
    if (!steps.length) return;
    const current = this.#currentStep();
    const idx = steps.findIndex((s) => s.group === current.group && s.tab === current.tab);
    const back = this.element.querySelector('[data-nav-back]');
    const next = this.element.querySelector('[data-nav-next]');
    const create = this.element.querySelector('[data-nav-create]');
    if (back) back.disabled = idx <= 0;
    if (next) next.hidden = idx === steps.length - 1;
    if (create) create.hidden = idx !== steps.length - 1;
  }

  /** @this {HeroMancer} */
  static #onNavBack() {
    this.#navStep(-1);
  }

  /** @this {HeroMancer} */
  static #onNavNext() {
    this.#navStep(1);
  }

  /** @inheritdoc */
  _preSyncPartState(partId, newElement, priorElement, state) {
    super._preSyncPartState(partId, newElement, priorElement, state);
    state.values = {};
    state.checked = {};
    state.combos = {};
    state.tiles = {};
    state.accordions = {};
    if (partId === 'identity' && this.#identityRosterJustOverridden) state.skipIdentityClassRoster = true;
    for (const el of priorElement.querySelectorAll('input[name], select[name], textarea[name]')) {
      if (el.name.startsWith('hp.')) continue;
      if (el.type === 'checkbox' || el.type === 'radio') state.checked[`${el.name}::${el.value}`] = el.checked;
      else state.values[el.name] = el.value;
    }
    for (const cb of priorElement.querySelectorAll('[data-combobox]')) if (cb.dataset.name) state.combos[cb.dataset.name] = cb.dataset.value ?? '';
    for (const tg of priorElement.querySelectorAll('[data-equipment-tile-group]')) if (tg.dataset.name) state.tiles[tg.dataset.name] = tg.dataset.value ?? '';
    for (const ac of priorElement.querySelectorAll('[data-equipment-accordion]')) if (ac.id) state.accordions[ac.id] = ac.classList.contains('is-open');
  }

  /** @inheritdoc */
  _syncPartState(partId, newElement, priorElement, state) {
    super._syncPartState(partId, newElement, priorElement, state);
    const skipRoster = state.skipIdentityClassRoster === true;
    for (const [name, value] of Object.entries(state.values ?? {})) {
      if (skipRoster && name.startsWith('identity.classes.')) continue;
      const el = newElement.querySelector(`[name="${CSS.escape(name)}"]`);
      if (el && el.value !== value) el.value = value;
    }
    for (const [k, v] of Object.entries(state.checked ?? {})) {
      const [name, value] = k.split('::');
      const el = newElement.querySelector(`[name="${CSS.escape(name)}"][value="${CSS.escape(value)}"]`);
      if (el) el.checked = v;
    }
    for (const [name, value] of Object.entries(state.combos ?? {})) {
      if (!value) continue;
      if (skipRoster && name.startsWith('identity.classes.')) continue;
      const cb = newElement.querySelector(`[data-combobox][data-name="${CSS.escape(name)}"]`);
      if (!cb) continue;
      cb.dataset.value = value;
      cb.querySelectorAll('[data-selected]').forEach((o) => o.removeAttribute('data-selected'));
      const opt = cb.querySelector(`[role="option"][data-value="${CSS.escape(value)}"]`);
      if (opt) {
        opt.setAttribute('data-selected', '');
        opt.setAttribute('aria-selected', 'true');
      }
      const hidden = cb.querySelector('input[type="hidden"]');
      if (hidden) hidden.value = value;
    }
    for (const [name, value] of Object.entries(state.tiles ?? {})) {
      const tg = newElement.querySelector(`[data-equipment-tile-group][data-name="${CSS.escape(name)}"]`);
      if (!tg) continue;
      const isCheck = tg.dataset.mode === 'check';
      if (!isCheck && !value) continue;
      const tileValues = new Set([...tg.querySelectorAll('[data-equipment-tile]')].map((t) => t.dataset.value));
      const storedValues = value ? value.split(',').filter(Boolean) : [];
      const isSubset = storedValues.length && storedValues.every((v) => tileValues.has(v));
      if (storedValues.length && !isSubset) continue;
      tg.dataset.value = value;
      const selected = isCheck ? new Set(storedValues) : null;
      tg.querySelectorAll('[data-equipment-tile]').forEach((t) => {
        const sel = isCheck ? selected.has(t.dataset.value) : t.dataset.value === value;
        t.toggleAttribute('data-selected', sel);
        t.setAttribute(isCheck ? 'aria-pressed' : 'aria-checked', sel ? 'true' : 'false');
        t.tabIndex = sel ? 0 : -1;
      });
      const hidden = tg.querySelector('input[type="hidden"]');
      if (hidden) hidden.value = value;
    }
    for (const [id, open] of Object.entries(state.accordions ?? {})) {
      const ac = newElement.querySelector(`[data-equipment-accordion]#${CSS.escape(id)}`);
      if (!ac) continue;
      ac.classList.toggle('is-open', open);
      ac.hidden = !open;
    }
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    this.#hasRendered = true;
    this.#identityRosterJustOverridden = false;
    this.element.classList.toggle('is-locked', !!context.pendingSubmission);
    this.element.classList.toggle('is-review', !!context.reviewMode);
    Combobox.attachAll(this.element);
    EquipmentTile.attachAll(this.element);
    this.#seedEquipmentGroupValues();
    EquipmentDetailPanel.attachAll(this.element);
    MulticlassImpactPanel.attachAll(this.element);
    this.#wireDirtyTracker();
    ProgressBar.attachAll(this.element);
    this.#wireLinkTokenArtToggle();
    this.#wireRingEnabledToggle();
    this.#wireLevelField();
    this.#wireBirthday();
    this.#wireBiographyAge();
    this.#wireIdentitySections();
    this.#wireIdentityScrollFab();
    this.#wireEquipmentWealthToggles();
    this.#wireEquipmentShop();
    this.#wireEquipmentGrants();
    this.#wireAdvancementChoosers();
    this.#wireAdvancementAsiMode();
    this.#wireLevelUpPicker();
    applyItemLinks(this.element);
    this.#wireAbilities();
    this.#wireValidation();
    this.#wireHpMethod();
    this.#refreshMulticlassPrereqChips();
    this.#refreshValidation();
    this.#refreshHud();
    this.#syncFooterNav();
  }

  /** Wire the in-wizard HP-method selector to re-render the HP tab with the chosen method. */
  #wireHpMethod() {
    const select = this.element.querySelector('[data-hp-method]');
    if (!select || select.dataset.hpMethodWired) return;
    select.dataset.hpMethodWired = '1';
    select.addEventListener('change', () => {
      this.#hpMethodReset = true;
      this.render({ parts: ['hp'] });
    });
  }

  /** Re-render the level-up + dependent tabs when the class picker selection changes so preview, advancements, hp, and finalize refresh for the new pick. */
  #wireLevelUpPicker() {
    if (this.#mode !== 'level_up' || this.element.dataset.lvlUpPickerWired === '1') return;
    this.element.dataset.lvlUpPickerWired = '1';
    this.element.addEventListener('change', (event) => {
      const name = event.target?.name;
      if (name === 'levelUp.pickedClass') {
        this.#clearLevelUpSubclassDom();
        this.render({ parts: ['level-up', 'advancements', 'hp'] });
      } else if (name === 'levelUp.pickedSubclass') this.render({ parts: ['advancements'] });
    });
  }

  /** Clear the level-up subclass combobox DOM state so a class-pick change doesn't carry the prior class's subclass selection through re-render state preservation. */
  #clearLevelUpSubclassDom() {
    const cb = this.element.querySelector('[data-tab="level-up"] [data-combobox][data-name="levelUp.pickedSubclass"]');
    if (!cb) return;
    cb.dataset.value = '';
    const hidden = cb.querySelector('input[type="hidden"]');
    if (hidden) hidden.value = '';
  }

  /** Delegated listener: open the ASI or Feat dialog when an ASI tile's mode button is clicked; reset on undo. */
  #wireAdvancementAsiMode() {
    if (this.element.dataset.advAsiModeWired === '1') return;
    this.element.dataset.advAsiModeWired = '1';
    this.element.addEventListener('click', (ev) => {
      const modeBtn = ev.target.closest?.('[data-asi-mode-btn]');
      if (modeBtn && this.element.contains(modeBtn)) {
        ev.preventDefault();
        const row = modeBtn.closest('[data-advancement-row]');
        if (!row) return;
        const mode = modeBtn.dataset.asiModeBtn;
        if (mode === 'asi') this.#openAsiDialog(row);
        else if (mode === 'feat') this.#openFeatDialog(row);
        return;
      }
      const undoBtn = ev.target.closest?.('[data-asi-undo]');
      if (undoBtn && this.element.contains(undoBtn)) {
        ev.preventDefault();
        const row = undoBtn.closest('[data-advancement-row]');
        const hidden = row?.querySelector('input[data-advancement-hidden]');
        if (!hidden) return;
        hidden.value = '';
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
        this.render({ parts: ['advancements', 'hp'] });
        this.#refreshHud();
      }
    });
  }

  /**
   * Spawn the ASI stepper dialog for an advancement row. Spec data + base scores are read from the tile's JSON dataset.
   * @param {HTMLElement} row Row container.
   */
  #openAsiDialog(row) {
    const tile = row.querySelector('.hm-advancement-tile-asi');
    const hidden = row.querySelector('input[data-advancement-hidden]');
    if (!tile || !hidden) return;
    let payload;
    try {
      payload = JSON.parse(tile.dataset.asiPayload ?? '{}');
    } catch {
      payload = {};
    }
    const dialog = new AdvancementAsiDialog({
      spec: payload.spec ?? {},
      baseScores: payload.baseScores ?? {},
      hiddenInput: hidden,
      onCommit: () => {
        this.render({ parts: ['advancements', 'hp'] });
        this.#refreshHud();
      }
    });
    dialog.render({ force: true });
  }

  /**
   * Spawn the Feat browser dialog for an advancement row. Builds the feat-browser context on-demand for this row so the dialog opens even when the row's mode hasn't yet been switched to `feat`.
   * @param {HTMLElement} row Row container.
   */
  #openFeatDialog(row) {
    const hidden = row.querySelector('input[data-advancement-hidden]');
    if (!hidden) return;
    let pickedUuid = null;
    try {
      pickedUuid = JSON.parse(hidden.value || '{}').feat ?? null;
    } catch {}
    const advId = row.dataset.advancementId;
    const level = Number(row.dataset.level) || 0;
    const totalCharLevel = this.#shared?.totalCharLevel ?? 1;
    const dialog = new AdvancementFeatDialog({
      buildContext: () => buildFeatBrowserContext({ actor: this.#actor, characterLevel: totalCharLevel, scope: { advId, level, label: '' }, pickedUuid, filters: this.#featBrowserFilters }),
      filters: this.#featBrowserFilters,
      hiddenInput: hidden,
      onCommit: () => {
        this.render({ parts: ['advancements', 'hp'] });
        this.#refreshHud();
      }
    });
    const rect = this.element.getBoundingClientRect();
    dialog.render({ force: true, position: { left: rect.left, top: rect.top, width: rect.width, height: rect.height } });
  }

  /** Bridge per-kind chooser inputs on the advancements tab into the row's JSON-payload hidden input. Delegated so partial re-renders don't drop the binding. */
  #wireAdvancementChoosers() {
    if (this.element.dataset.advChoosersWired === '1') return;
    this.element.dataset.advChoosersWired = '1';
    this.element.addEventListener('change', (ev) => {
      const t = ev.target;
      if (!t || t.matches?.('[data-advancement-hidden]')) return;
      const row = t.closest?.('[data-tab="advancements"] [data-advancement-row]');
      if (!row) return;
      const body = row.querySelector('[data-advancement-body]');
      const hidden = body?.querySelector('input[data-advancement-hidden]');
      if (!body || !hidden) return;
      if (body.dataset.kind !== 'asi') {
        const payload = picksFromRow(row, body.dataset.kind);
        hidden.value = payload ? JSON.stringify(payload) : '';
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const drawerOpen = this.element.querySelector('[data-equipment-detail-panel].is-open');
      if (drawerOpen) {
        this.#pendingAdvancementRerender = true;
        return;
      }
      if (['ItemChoice', 'Trait', 'AbilityScoreImprovement'].includes(row.dataset.type)) this.render({ parts: ['advancements'] });
    });
    this.element.addEventListener('hm-drawer-close', () => {
      if (!this.#pendingAdvancementRerender) return;
      this.#pendingAdvancementRerender = false;
      this.render({ parts: ['advancements'] });
    });
  }

  /** Re-render the equipment tab whenever a per-section wealth toggle flips. */
  #wireEquipmentWealthToggles() {
    const toggles = this.element.querySelectorAll('[data-tab="equipment"] input[type="checkbox"][data-eq-wealth-toggle]');
    for (const cb of toggles) cb.addEventListener('change', () => this.render({ parts: ['equipment'] }));
  }

  /** Record each equipment tile-group's committed value so a later change can detect a gold-affecting transition across part re-renders. */
  #seedEquipmentGroupValues() {
    for (const group of this.element.querySelectorAll('[data-tab="equipment"] [data-equipment-tile-group][data-name]')) {
      this.#eqGroupValues.set(group.dataset.name, group.dataset.value ?? '');
    }
  }

  /** Re-render the equipment tab whenever a change affects the shop gold pool. */
  #wireEquipmentGrants() {
    if (this.element.dataset.grantsWired === '1') return;
    this.element.dataset.grantsWired = '1';
    this.element.addEventListener('change', (event) => {
      const t = event.target;
      if (!t?.name?.startsWith('equipment.')) return;
      if (!t.closest('[data-tab="equipment"]')) return;
      if (t.name.endsWith('.grants')) return this.render({ parts: ['equipment'] });
      const group = t.parentElement?.matches?.('[data-equipment-tile-group]') ? t.parentElement : null;
      if (!group) return;
      const newVal = t.value ?? '';
      const oldVal = this.#eqGroupValues.get(t.name) ?? '';
      this.#eqGroupValues.set(t.name, newVal);
      const affectsGold = (v) => v.startsWith('none:') || v.startsWith('currency:') || v.startsWith('and:');
      if (affectsGold(newVal) || affectsGold(oldVal)) this.render({ parts: ['equipment'] });
    });
  }

  /** Wire shop tile clicks (toggle cart), cart X button, filter/sort chips, and search input. */
  #wireEquipmentShop() {
    const shop = this.element.querySelector('[data-tab="equipment"] [data-eq-shop]');
    if (!shop || shop.dataset.shopWired === '1') return;
    shop.dataset.shopWired = '1';
    shop.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-eq-cart-remove]');
      if (remove) return this.#mutateCart(remove.dataset.uuid, 0);
      const tile = event.target.closest('[data-eq-shop-tile]');
      if (tile && !event.target.closest('[data-item-link]') && !event.target.closest('[data-eq-cart-qty-select]')) {
        if (tile.getAttribute('aria-disabled') === 'true') return;
        const inCart = tile.hasAttribute('data-selected');
        return this.#mutateCart(tile.dataset.uuid, inCart ? 0 : 1);
      }
      const filterChip = event.target.closest('[data-eq-shop-filter]');
      if (filterChip) {
        this.#toggleShopFilter(filterChip.dataset.eqShopFilter);
        this.#syncShopFilterChips(shop);
        this.#applyShopFilters(shop);
        return;
      }
      const sortChip = event.target.closest('[data-eq-shop-sort]');
      if (sortChip) {
        this.#shopState.sort = sortChip.dataset.eqShopSort;
        for (const c of shop.querySelectorAll('[data-eq-shop-sort]')) c.classList.toggle('is-active', c === sortChip);
        this.#applyShopSort(shop);
        shop.querySelector('[data-eq-shop-sort-menu]')?.removeAttribute('open');
      }
    });
    shop.addEventListener('change', (event) => {
      const select = event.target.closest('[data-eq-cart-qty-select]');
      if (!select) return;
      this.#mutateCart(select.dataset.uuid, Number(select.value) || 0);
    });
    shop.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const tile = event.target.closest('[data-eq-shop-tile]');
      if (!tile || tile.getAttribute('aria-disabled') === 'true') return;
      event.preventDefault();
      const inCart = tile.hasAttribute('data-selected');
      this.#mutateCart(tile.dataset.uuid, inCart ? 0 : 1);
    });
    shop.addEventListener('input', (event) => {
      if (!event.target.matches('[data-eq-shop-search]')) return;
      this.#shopState.search = event.target.value;
      this.#applyShopFilters(shop);
    });
    this.#wireShopPopoverDismiss();
    this.#restoreShopState(shop);
  }

  /**
   * Re-apply persisted search / filter / sort state to a freshly rendered shop element.
   * @param {HTMLElement} shop Shop scope element.
   */
  #restoreShopState(shop) {
    const search = shop.querySelector('[data-eq-shop-search]');
    if (search) search.value = this.#shopState.search;
    this.#syncShopFilterChips(shop);
    for (const c of shop.querySelectorAll('[data-eq-shop-sort]')) c.classList.toggle('is-active', c.dataset.eqShopSort === this.#shopState.sort);
    this.#applyShopFilters(shop);
    this.#applyShopSort(shop);
  }

  /**
   * Toggle a bucket in the active filter set. "all" clears specific buckets; specific buckets clear "all"; falling back to "all" when the set empties.
   * @param {string} bucket Filter chip key ("all" or a bucket).
   */
  #toggleShopFilter(bucket) {
    const filters = this.#shopState.filters;
    if (bucket === 'all') {
      filters.clear();
      filters.add('all');
      return;
    }
    filters.delete('all');
    if (filters.has(bucket)) filters.delete(bucket);
    else filters.add(bucket);
    if (filters.size === 0) filters.add('all');
  }

  /**
   * Mirror `#shopState.filters` to the chip `is-active` classes and the filter-trigger count badge.
   * @param {HTMLElement} shop Shop scope element.
   */
  #syncShopFilterChips(shop) {
    for (const c of shop.querySelectorAll('[data-eq-shop-filter]')) c.classList.toggle('is-active', this.#shopState.filters.has(c.dataset.eqShopFilter));
    const trigger = shop.querySelector('[data-eq-shop-filter-menu] .hm-eq-shop-popover-trigger');
    if (!trigger) return;
    const specific = [...this.#shopState.filters].filter((f) => f !== 'all').length;
    if (specific > 0) trigger.dataset.count = String(specific);
    else delete trigger.dataset.count;
  }

  /** Attach the outside-click closer for shop popovers exactly once per wizard lifetime. Re-renders replace the shop element but `this.element` persists, so the dataset flag survives. */
  #wireShopPopoverDismiss() {
    if (this.element.dataset.shopPopoverWired === '1') return;
    this.element.dataset.shopPopoverWired = '1';
    document.addEventListener('click', (event) => {
      if (!this.element?.isConnected) return;
      const menus = this.element.querySelectorAll('[data-eq-shop-filter-menu][open], [data-eq-shop-sort-menu][open]');
      if (!menus.length) return;
      const inside = event.target.closest('[data-eq-shop-filter-menu], [data-eq-shop-sort-menu]');
      for (const menu of menus) {
        if (menu === inside) continue;
        menu.removeAttribute('open');
      }
    });
  }

  /**
   * Filter shop tiles in-place by the active filter set (multi-select; "all" matches everything) + search query (no re-render).
   * @param {HTMLElement} shop Shop scope element.
   */
  #applyShopFilters(shop) {
    const { filters, search } = this.#shopState;
    const allActive = filters.has('all');
    const query = search.trim().toLowerCase();
    for (const tile of shop.querySelectorAll('[data-eq-shop-tile]')) {
      const bucketMatch = allActive || filters.has(tile.dataset.bucket);
      const nameMatch = !query || tile.dataset.name.toLowerCase().includes(query);
      tile.hidden = !(bucketMatch && nameMatch);
    }
  }

  /**
   * Reorder shop tiles in-place by the active sort chip (name-asc / name-desc / cost-asc / cost-desc / bucket).
   * @param {HTMLElement} shop Shop scope element.
   */
  #applyShopSort(shop) {
    const grid = shop.querySelector('.hm-eq-shop-grid');
    if (!grid) return;
    const mode = shop.querySelector('[data-eq-shop-sort].is-active')?.dataset.eqShopSort ?? 'name-asc';
    const tiles = Array.from(grid.querySelectorAll('[data-eq-shop-tile]'));
    const byName = (a, b) => a.dataset.name.localeCompare(b.dataset.name);
    const byCost = (a, b) => Number(a.dataset.costGp || 0) - Number(b.dataset.costGp || 0);
    const cmp =
      {
        'name-asc': byName,
        'name-desc': (a, b) => byName(b, a),
        'cost-asc': (a, b) => byCost(a, b) || byName(a, b),
        'cost-desc': (a, b) => byCost(b, a) || byName(a, b),
        bucket: (a, b) => a.dataset.bucket.localeCompare(b.dataset.bucket) || byName(a, b)
      }[mode] ?? byName;
    tiles.sort(cmp);
    for (const tile of tiles) grid.appendChild(tile);
  }

  /**
   * Set the cart quantity for a uuid (writing directly into the live hidden input) and re-render the equipment part so totals refresh.
   * @param {string} uuid Cart line uuid.
   * @param {number} qty New quantity (0 removes the line).
   */
  #mutateCart(uuid, qty) {
    if (!uuid) return;
    const name = `equipment.shop.cart.${uuid}`;
    let input = this.element.querySelector(`[data-tab="equipment"] input[name="${CSS.escape(name)}"]`);
    if (!input) {
      input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.dataset.eqCartQty = '';
      input.dataset.uuid = uuid;
      this.element.querySelector('[data-tab="equipment"] [data-eq-shop]')?.appendChild(input);
    }
    input.value = qty > 0 ? String(qty) : '';
    this.render({ parts: ['equipment'] });
  }

  /** Wire form-change listener to update validation UI. */
  #wireValidation() {
    if (this.element.dataset.validationWired === '1') return;
    this.element.dataset.validationWired = '1';
    this.element.addEventListener('change', () => {
      this.#refreshValidation();
      this.#refreshHud();
    });
    this.element.addEventListener('input', () => {
      this.#refreshValidation();
      this.#refreshHud();
    });
  }

  /** Recompute validation, push state to per-tab progress bars + footer submit button. */
  #refreshValidation() {
    const result = validateWizard(this.element, this.#mode, this.#effectiveAbilityScores());
    let filledSum = 0;
    let totalWeight = 0;
    for (const [tabId, tabResult] of Object.entries(result.tabs)) {
      const bar = this.element.querySelector(`#${this.id}-${tabId}-pb`);
      if (bar) {
        if (tabResult.hideBar) bar.hidden = true;
        else {
          bar.hidden = false;
          ProgressBar.attach(bar).set(tabResult.progress, tabResult.valid ? 'complete' : 'incomplete');
        }
      }
      if (!tabResult.hideBar) {
        const weight = tabResult.weight ?? 0;
        filledSum += tabResult.progress * weight;
        totalWeight += weight;
      }
      const advRemaining = tabId === 'advancements' ? (tabResult.remaining ?? 0) : tabResult.missing.length;
      this.#syncTabBadge(tabId, advRemaining, tabResult.missing);
    }
    const globalBar = this.element.querySelector(`#${this.id}-global-pb`);
    if (globalBar) ProgressBar.attach(globalBar).set(totalWeight ? filledSum / totalWeight : 0, result.valid ? 'complete' : 'incomplete');
    const submit = this.element.querySelector('button[type="submit"]');
    if (submit) {
      const locked = !!getPendingSubmission();
      submit.disabled = locked;
      const tooltip = locked
        ? _loc('HEROMANCER.Approval.SubmissionLock.Tooltip')
        : result.valid
          ? ''
          : `${_loc('HEROMANCER.App.Validation.Missing')}: ${result.missing.map((k) => _loc(k)).join(', ')}`;
      submit.toggleAttribute('data-tooltip', !!tooltip);
      if (tooltip) submit.setAttribute('aria-label', tooltip);
      else submit.removeAttribute('aria-label');
    }
  }

  /**
   * Update a sidebar tab badge with a count + tooltip listing the missing-field lang keys.
   * @param {string} tabId Tab id.
   * @param {number} count Pip count.
   * @param {string[]} [missing] Missing-field lang keys to surface in the badge tooltip.
   */
  #syncTabBadge(tabId, count, missing = []) {
    const badge = this.element.querySelector(`[data-tab-badge="${tabId}"]`);
    if (!badge) return;
    badge.textContent = String(count);
    badge.hidden = count === 0;
    if (count > 0 && missing.length) badge.setAttribute('aria-label', `${_loc('HEROMANCER.App.Validation.Missing')}: ${missing.map((k) => _loc(k)).join(', ')}`);
    else badge.setAttribute('aria-label', _loc('HEROMANCER.Wizard.Nav.BadgeTooltip'));
  }

  /** Refresh the secondary-class prereq chips in place from live ability scores. Avoids a full identity re-render when only scores changed. */
  #refreshMulticlassPrereqChips() {
    const rows = this.element.querySelectorAll('[data-tab="identity"] [data-mc-row]');
    if (rows.length <= 1) return;
    const abilityScores = this.#effectiveAbilityScores();
    const classEntries = documentLoader.getEntries('class');
    let unselected = 0;
    let totalLevels = 0;
    for (const row of rows) {
      const uuid = row.querySelector('[data-combobox]')?.dataset?.value ?? '';
      if (!uuid) unselected++;
      totalLevels += Number(row.querySelector('[data-mc-level]')?.value) || 0;
      if (row.dataset.primary === 'true') continue;
      const entry = uuid ? classEntries.find((e) => e.uuid === uuid) : null;
      const result = entry ? checkMulticlassPrereq(entry, abilityScores) : { passes: true };
      let chip = row.querySelector('.hm-mc-row-prereq');
      if (result.passes || !result.prereq) {
        chip?.remove();
        continue;
      }
      const label = formatPrereqChipLabel(result.failed, abilityScores);
      const tooltip = formatPrereqLabel(result.prereq);
      if (chip) {
        chip.dataset.tooltip = tooltip;
        const span = chip.querySelector('span');
        if (span) span.textContent = label;
      } else {
        chip = document.createElement('div');
        chip.className = 'hm-mc-row-prereq is-fail';
        chip.setAttribute('role', 'status');
        chip.dataset.tooltip = tooltip;
        chip.innerHTML = `<i class="fas fa-triangle-exclamation" aria-hidden="true"></i><span>${foundry.utils.escapeHTML(label)}</span>`;
        row.appendChild(chip);
      }
    }
    const prereqFails = this.element.querySelectorAll('[data-tab="identity"] [data-mc-row] .hm-mc-row-prereq').length;
    this.#setIdentitySubtabBadge('class', unselected + prereqFails + (totalLevels === (this.#shared.effectiveLevel ?? 1) ? 0 : 1));
  }

  /**
   * Set an identity sub-tab's missing-pick badge count in place.
   * @param {string} sectionId Identity sub-tab id.
   * @param {number} count Badge count; 0 hides the badge.
   */
  #setIdentitySubtabBadge(sectionId, count) {
    const badge = this.element.querySelector(`.hm-tab-subtab-btn[data-tab="${sectionId}"] [data-tab-badge]`);
    if (!badge) return;
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  /**
   * Rebuild manualFormula-pool combobox options with live used/total badges.
   * @param {AbilityBlock[]} blocks Attached ability blocks.
   */
  #refreshMfPoolOptions(blocks) {
    if (!this.#mfPool) return;
    const used = new Map();
    for (const b of blocks) {
      if (b.method !== 'manualFormula' || !b.poolMode) continue;
      const v = b.root.querySelector('[data-mode="manualFormula"] [data-combobox]')?.dataset?.value;
      if (v) used.set(v, (used.get(v) ?? 0) + 1);
    }
    const sorted = [...this.#mfPool.entries()].sort((a, b) => Number(b[0]) - Number(a[0]));
    for (const b of blocks) {
      if (b.method !== 'manualFormula' || !b.poolMode) continue;
      const combo = b.root.querySelector('[data-mode="manualFormula"] [data-combobox]');
      if (!combo) continue;
      const opts = sorted.map(([v, n]) => {
        const opt = { value: v, label: v };
        if (n > 1) opt.badge = `${used.get(v) ?? 0}/${n}`;
        return opt;
      });
      Combobox.attach(combo).setOptions(opts);
    }
  }

  /**
   * Render the manualFormula pool strip (one chip per rolled value; taken chips dimmed/struck) from the current `#mfPool` and live combobox values.
   * @param {AbilityBlock[]} blocks Attached ability blocks.
   */
  #refreshMfPoolDisplay(blocks) {
    const list = this.element.querySelector('[data-pool-list]');
    if (!list) return;
    if (!this.#mfPool) {
      list.hidden = true;
      list.replaceChildren();
      return;
    }
    list.hidden = false;
    const used = new Map();
    for (const b of blocks) {
      if (b.method !== 'manualFormula' || !b.poolMode) continue;
      const v = b.root.querySelector('[data-mode="manualFormula"] [data-combobox]')?.dataset?.value;
      if (v) used.set(v, (used.get(v) ?? 0) + 1);
    }
    const chips = [];
    const sorted = [...this.#mfPool.entries()].sort((a, b) => Number(b[0]) - Number(a[0]));
    for (const [v, n] of sorted) {
      const takenCount = Math.min(used.get(v) ?? 0, n);
      const li = document.createElement('li');
      li.className = 'hm-abilities-pool-chip';
      if (takenCount >= n) li.classList.add('is-taken');
      else if (takenCount > 0) li.classList.add('is-partial');
      const valueEl = document.createElement('span');
      valueEl.className = 'hm-abilities-pool-chip-value';
      valueEl.textContent = v;
      li.append(valueEl);
      if (n > 1) {
        const badge = document.createElement('span');
        badge.className = 'hm-abilities-pool-chip-count';
        badge.textContent = `${takenCount}/${n}`;
        li.append(badge);
      }
      chips.push(li);
    }
    list.replaceChildren(...chips);
  }

  /** Attach ability blocks and wire method selector + tracker + standard-array swap + manualFormula pool. */
  #wireAbilities() {
    const blocks = AbilityBlock.attachAll(this.element);
    const saPool = buildStandardArrayPool(blocks.length);
    const prev = new Map(blocks.map((b) => [b.ability, b.valueInput?.value || '']));
    let swapping = false;
    if (this.#mfPool) blocks.forEach((b) => b.method === 'manualFormula' && b.setPoolMode(true));
    const saCombo = (b) => b.modes.standardArray?.querySelector('[data-combobox]');
    const mfCombo = (b) => b.root.querySelector('[data-mode="manualFormula"] [data-combobox]');
    const tallyUsed = (selector, methodCheck) => {
      const used = new Map();
      for (const b of blocks) {
        if (!methodCheck(b)) continue;
        const v = selector(b)?.dataset?.value;
        if (v) used.set(v, (used.get(v) ?? 0) + 1);
      }
      return used;
    };
    const refreshSaPoolDisplay = () => {
      const list = this.element.querySelector('[data-sa-pool-list]');
      if (!list) return;
      const used = tallyUsed(saCombo, (b) => b.method === 'standardArray');
      const sorted = [...saPool.entries()].sort((a, b) => Number(b[0]) - Number(a[0]));
      const chips = sorted.map(([v, n]) => {
        const takenCount = Math.min(used.get(v) ?? 0, n);
        const li = document.createElement('li');
        li.className = 'hm-abilities-pool-chip';
        if (takenCount >= n) li.classList.add('is-taken');
        else if (takenCount > 0) li.classList.add('is-partial');
        const valueEl = document.createElement('span');
        valueEl.className = 'hm-abilities-pool-chip-value';
        valueEl.textContent = v;
        li.append(valueEl);
        if (n > 1) {
          const badge = document.createElement('span');
          badge.className = 'hm-abilities-pool-chip-count';
          badge.textContent = `${takenCount}/${n}`;
          li.append(badge);
        }
        return li;
      });
      list.replaceChildren(...chips);
    };
    const refreshSaOptions = () => {
      const used = tallyUsed(saCombo, (b) => b.method === 'standardArray');
      for (const b of blocks) {
        if (b.method !== 'standardArray') continue;
        const combo = saCombo(b);
        if (!combo) continue;
        const own = combo.dataset.value;
        const opts = [...saPool.entries()].map(([v, n]) => {
          const opt = { value: v, label: v };
          const remaining = n - (used.get(v) ?? 0);
          const ownsThis = own === v;
          if (n > 1) opt.badge = `${used.get(v) ?? 0}/${n}`;
          opt.used = remaining <= 0 && !ownsThis;
          return opt;
        });
        Combobox.attach(combo).setOptions(opts);
      }
    };
    const handlePoolSwap = (ability, value, comboSelector, methodCheck, poolMap) => {
      const used = tallyUsed(comboSelector, methodCheck);
      const key = String(value);
      if ((used.get(key) ?? 0) <= (poolMap.get(key) ?? 0)) return;
      for (const other of blocks) {
        if (other.ability === ability) continue;
        if (!methodCheck(other)) continue;
        const combo = comboSelector(other);
        if (combo?.dataset.value !== key) continue;
        const oldRaw = prev.get(ability);
        const oldStr = oldRaw == null ? '' : String(oldRaw);
        const oldInPool = oldStr !== '' && poolMap.has(oldStr);
        const cb = Combobox.attach(combo);
        swapping = true;
        try {
          if (oldInPool) cb.select(oldStr);
          else cb.clear();
        } finally {
          swapping = false;
        }
        prev.set(other.ability, oldInPool ? oldStr : '');
        break;
      }
    };
    const onChange = ({ ability, method, value }) => {
      if (!swapping) {
        if (method === 'standardArray') {
          handlePoolSwap(ability, value, saCombo, (b) => b.method === 'standardArray', saPool);
          refreshSaOptions();
          refreshSaPoolDisplay();
        } else if (method === 'manualFormula') {
          const block = blocks.find((b) => b.ability === ability);
          if (block?.poolMode && this.#mfPool) {
            handlePoolSwap(ability, value, mfCombo, (b) => b.method === 'manualFormula' && b.poolMode, this.#mfPool);
            this.#refreshMfPoolOptions(blocks);
            this.#refreshMfPoolDisplay(blocks);
          }
        }
      }
      prev.set(ability, value == null || value === '' ? '' : String(value));
      this.#refreshPointBuyTracker(blocks);
      if (ability === 'con') this.render({ parts: ['hp'] });
      this.#refreshMulticlassPrereqChips();
    };
    blocks.forEach((b) => (b.opts.onChange = onChange));
    const methodSelect = this.element.querySelector('[data-abilities-method]');
    methodSelect?.addEventListener('change', () => {
      const target = methodSelect.value;
      const dflt = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.ABILITY_SCORE_DEFAULT) ?? 10);
      blocks.forEach((b) => {
        for (const combo of b.root.querySelectorAll('[data-combobox]')) Combobox.attach(combo).clear();
        const fInput = b.root.querySelector('[data-formula]');
        if (fInput) fInput.value = '';
        b.setPoolMode(false);
        if (target === 'pointBuy') b.setValue(dflt);
        else b.clear();
      });
      prev.clear();
      blocks.forEach((b) => prev.set(b.ability, b.valueInput?.value || ''));
      this.#mfPool = null;
      this.#mfRerollsUsed = 0;
      blocks.forEach((b) => b.setMethod(target));
      this.render({ parts: ['abilities'] });
    });
    refreshSaOptions();
    refreshSaPoolDisplay();
    this.#refreshMfPoolOptions(blocks);
    this.#refreshMfRerollButton();
    this.#refreshMfPoolDisplay(blocks);
    this.#refreshPointBuyTracker(blocks);
  }

  /**
   * Recompute point-buy remaining + per-block cost, and gate +/- buttons at MIN/MAX or budget exhaustion.
   * @param {AbilityBlock[]} blocks Attached ability-block instances.
   */
  #refreshPointBuyTracker(blocks) {
    const tracker = this.element.querySelector('[data-pb-tracker]');
    if (!tracker) return;
    const remaining = tracker.querySelector('[data-pb-remaining]');
    const total = Number(tracker.querySelector('strong + span')?.textContent.replace('/', '').trim() || 27);
    const min = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.ABILITY_SCORE_MIN) ?? 8);
    const used = blocks.reduce((sum, b) => sum + (b.method === 'pointBuy' ? pointBuyCost(b.value, min) : 0), 0);
    const remainingPoints = total - used;
    if (remaining) remaining.textContent = String(remainingPoints);
    const t = total > 0 ? Math.max(0, Math.min(1, remainingPoints / total)) : 0;
    tracker.style.setProperty('--hero-mancer-pb-hue', String(Math.round(t * 120)));
    tracker.style.setProperty('--hero-mancer-pb-fill', `${Math.round(t * 100)}%`);
    blocks.forEach((b) => {
      b.setCost(pointBuyCost(b.value, min));
      if (b.method !== 'pointBuy') return;
      const plus = b.root.querySelector('[data-pb-step="1"]');
      const minus = b.root.querySelector('[data-pb-step="-1"]');
      if (plus) {
        const nextCost = pointBuyCost(b.value + 1, min) - pointBuyCost(b.value, min);
        plus.disabled = b.value >= b.max || remainingPoints < nextCost;
      }
      if (minus) minus.disabled = b.value <= b.min;
    });
  }

  /** Wire each identity sub-tab. */
  #wireIdentitySections() {
    for (const sectionId of ['background', 'species']) {
      const section = this.element.querySelector(`[data-identity-section="${sectionId}"]`);
      if (!section) continue;
      const hidden = section.querySelector('input[type="hidden"]');
      if (!hidden) continue;
      if (!hidden.dataset.identityWired) {
        hidden.dataset.identityWired = '1';
        hidden.addEventListener('change', () => {
          this.#renderIdentityDetail(sectionId, hidden.value);
          this.#syncIdentitySubtab(sectionId, hidden.value);
          if (sectionId === 'background') requestAnimationFrame(() => this.render({ parts: ['equipment'] }));
        });
      }
      if (hidden.value) {
        const dc = section.querySelector('[data-description]');
        if (dc && dc.children.length === 0) this.#renderIdentityDetail(sectionId, hidden.value);
      }
    }
    const classSection = this.element.querySelector('[data-identity-section="class"]');
    if (classSection && !classSection.dataset.identityWired) {
      classSection.dataset.identityWired = '1';
      classSection.addEventListener('change', (event) => {
        const t = event.target;
        if (!t?.name) return;
        const row = t.closest?.('[data-mc-row]');
        if (!row) return;
        const isPrimary = row.dataset.primary === 'true';
        if (t.matches?.('input[type="hidden"][name^="identity.classes."][name$=".uuid"]')) {
          if (isPrimary) {
            this.render({ parts: ['identity'] });
            requestAnimationFrame(() => this.render({ parts: ['abilities', 'hp', 'equipment', 'advancements'] }));
          } else {
            this.render({ parts: ['identity'] });
            requestAnimationFrame(() => this.render({ parts: ['hp', 'advancements'] }));
          }
        } else if (t.matches?.('input[data-mc-level]')) {
          this.render({ parts: ['identity'] });
          requestAnimationFrame(() => this.render({ parts: ['hp', 'advancements'] }));
        }
      });
    }
    if (classSection) {
      const descEmbed = classSection.querySelector('.hm-identity-description[data-description="class"]');
      const activeUuid = descEmbed?.dataset.uuid;
      if (activeUuid && descEmbed.children.length === 0) this.#renderIdentityDetail('class', activeUuid);
    }
    const subclassSection = this.element.querySelector('[data-identity-section="subclass"]');
    if (subclassSection && !subclassSection.dataset.identityWired) {
      subclassSection.dataset.identityWired = '1';
      subclassSection.addEventListener('change', (event) => {
        const t = event.target;
        if (!t?.matches?.('input[type="hidden"][name^="identity.classes."][name$=".subclassUuid"]')) return;
        const row = t.closest?.('[data-mc-subclass-row]');
        const slotId = row?.dataset.slotId;
        if (slotId && t.value) this.#activeSubclassDescriptionSlotId = slotId;
        else if (slotId && !t.value && this.#activeSubclassDescriptionSlotId === slotId) this.#activeSubclassDescriptionSlotId = null;
        this.render({ parts: ['identity'] });
        requestAnimationFrame(() => this.render({ parts: ['advancements'] }));
      });
    }
    if (subclassSection) {
      const descEmbed = subclassSection.querySelector('.hm-identity-description[data-description="subclass"]');
      const activeUuid = descEmbed?.dataset.uuid;
      if (activeUuid && descEmbed.children.length === 0) this.#renderIdentityDetail('subclass', activeUuid);
    }
  }

  /**
   * Update an identity sub-tab's label (to the picked item name) and missing-pick badge in place.
   * @param {string} sectionId Identity sub-tab id.
   * @param {string} uuid Selected compendium uuid, or empty when cleared.
   */
  #syncIdentitySubtab(sectionId, uuid) {
    const label = this.element.querySelector(`.hm-tab-subtab-btn[data-tab="${sectionId}"] [data-subtab-label]`);
    if (label) label.textContent = (uuid ? lookupSelectionName(uuid) : '') || label.dataset.defaultLabel;
    this.#setIdentitySubtabBadge(sectionId, uuid ? 0 : 1);
  }

  /**
   * Render the journal embed for an identity sub-tab.
   * @param {string} sectionId Identity sub-tab id.
   * @param {string} uuid Compendium uuid.
   * @returns {Promise<void>} Resolves when rendered.
   */
  async #renderIdentityDetail(sectionId, uuid) {
    const section = this.element.querySelector(`[data-identity-section="${sectionId}"]`);
    if (!section) return;
    const descContainer = section.querySelector('[data-description]');
    if (!descContainer) return;
    const token = (Number(descContainer.dataset.renderToken) || 0) + 1;
    descContainer.dataset.renderToken = String(token);
    const isCurrent = () => descContainer.dataset.renderToken === String(token);
    const prev = this.#identityRenderChain.get(descContainer) ?? Promise.resolve();
    const task = prev.then(async () => {
      if (!isCurrent()) return;
      if (!uuid) {
        descContainer.innerHTML = '';
        descContainer.dataset.uuid = '';
        return;
      }
      if (descContainer.dataset.uuid === uuid && descContainer.children.length > 0) return;
      descContainer.dataset.uuid = uuid;
      const doc = await documentLoader.getFullDocument(uuid);
      if (!isCurrent() || !doc) return;
      const pageUuid = await findRelatedJournalPage(doc);
      if (!isCurrent()) return;
      if (pageUuid) {
        const embed = new JournalPageEmbed(descContainer);
        await embed.render(pageUuid, { itemName: doc.name, docType: doc.type });
        return;
      }
      if (doc.type === 'subclass') {
        const synthPage = new JournalEntryPage({ name: doc.name, type: 'subclass', system: { item: doc.uuid } });
        const rendered = await new JournalPageEmbed(descContainer).renderSyntheticPage(synthPage);
        if (!isCurrent()) return;
        if (rendered) return;
      }
      const raw = doc.system?.description?.value ?? '';
      if (raw.trim()) {
        const enriched = await safeEnrichHTML(raw, { secrets: false, relativeTo: doc });
        if (!isCurrent()) return;
        descContainer.innerHTML = `<div class="hm-identity-no-journal content-embed">${enriched}</div>`;
      } else {
        descContainer.innerHTML = '';
      }
    });
    this.#identityRenderChain.set(
      descContainer,
      task.catch(() => {})
    );
    return task;
  }

  /** Re-render identity + abilities when the starting level changes so the subclass picker (gated by class threshold ≤ effective level) appears/disappears. */
  #wireLevelField() {
    const input = this.element.querySelector('#character-level');
    if (!input || input.readOnly) return;
    let last = input.value;
    input.addEventListener('change', () => {
      if (input.value === last) return;
      const newLevel = Math.max(1, Math.min(20, Number(input.value) || 1));
      last = input.value;
      const roster = this.#readIdentityRoster();
      if (roster.length) {
        const assigned = roster.reduce((sum, r) => sum + (Number(r.level) || 0), 0);
        const diff = newLevel - assigned;
        if (diff !== 0) roster[0].level = Math.max(0, (Number(roster[0].level) || 0) + diff);
        if (newLevel <= 1 && roster.length > 1) this.#identityRosterOverride = [{ ...roster[0], level: newLevel }];
        else this.#identityRosterOverride = roster;
      }
      this.render({ parts: ['identity'] });
      requestAnimationFrame(() => this.render({ parts: ['abilities', 'hp', 'advancements'] }));
    });
  }

  /** Wire the Calendaria birthday picker: rebuild day options when month or year changes, refresh the age preview when any birthday field changes. */
  #wireBirthday() {
    const row = this.element.querySelector('[data-birthday-row]');
    if (!row || row.dataset.birthdayWired) return;
    row.dataset.birthdayWired = '1';
    if (!MODULE.COMPAT?.CALENDARIA) return;
    const monthSelect = row.querySelector('[data-birthday-month]');
    const daySelect = row.querySelector('[data-birthday-day]');
    const yearInput = row.querySelector('[data-birthday-year]');
    const ageEl = row.querySelector('[data-birthday-age]');
    if (!monthSelect || !daySelect || !yearInput) return;
    const calendar = CALENDARIA.api.getActiveCalendar();
    if (!calendar) return;
    const yearZero = calendar.years?.yearZero ?? 0;
    const rebuildDays = () => {
      const monthIdx = Math.max(0, Math.min(calendar.monthsArray.length - 1, Number(monthSelect.value) - 1));
      const year = Number(yearInput.value) - yearZero;
      const days = calendar.getDaysInMonth?.(monthIdx, year) ?? 30;
      const prev = Math.min(Number(daySelect.value) || 1, days);
      daySelect.innerHTML = Array.from({ length: days }, (_, i) => `<option value="${i + 1}"${i + 1 === prev ? ' selected' : ''}>${i + 1}</option>`).join('');
    };
    const refreshAge = () => {
      const current = CALENDARIA.api.getCurrentDateTime();
      const age = computeAge(current, Number(yearInput.value) || 0, Number(monthSelect.value) || 1, Number(daySelect.value) || 1);
      if (ageEl) ageEl.textContent = _loc('HEROMANCER.App.Start.Birthday.Age', { age });
      const bioAge = this.element.querySelector('#bio-age');
      if (bioAge) bioAge.value = String(age);
    };
    monthSelect.addEventListener('change', () => {
      rebuildDays();
      refreshAge();
    });
    daySelect.addEventListener('change', refreshAge);
    yearInput.addEventListener('change', () => {
      rebuildDays();
      refreshAge();
    });
  }

  /** Reverse-link the Biography age input back to the birthday year: typing an age sets the birth year (DOB -> age is handled in #wireBirthday). */
  #wireBiographyAge() {
    if (!MODULE.COMPAT?.CALENDARIA) return;
    const ageInput = this.element.querySelector('#bio-age');
    const yearInput = this.element.querySelector('[data-birthday-year]');
    if (!ageInput || !yearInput || ageInput.dataset.bioAgeWired) return;
    const currentYear = CALENDARIA.api.getCurrentDateTime()?.year;
    if (!Number.isFinite(currentYear)) return;
    ageInput.dataset.bioAgeWired = '1';
    ageInput.addEventListener('change', () => {
      const age = Number(ageInput.value);
      if (!Number.isFinite(age)) return;
      const targetYear = currentYear - Math.max(0, age);
      if (Number(yearInput.value) === targetYear) return;
      yearInput.value = String(targetYear);
      yearInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  /** Wire the identity-tab back-to-top FAB visibility to the scroll position of the active sub-tab description. */
  #wireIdentityScrollFab() {
    const fab = this.element.querySelector('.hm-identity-fab');
    if (!fab) return;
    const sync = () => {
      const active = this.element.querySelector('.hm-identity-section.active .hm-identity-description');
      fab.hidden = !active || active.scrollTop < 200;
    };
    sync();
    for (const description of this.element.querySelectorAll('.hm-tab-identity .hm-identity-description')) {
      if (description.dataset.scrollFabWired) continue;
      description.dataset.scrollFabWired = '1';
      description.addEventListener('scroll', sync, { passive: true });
    }
  }

  /** When link-token-art is checked, disable the token-art input/button without mutating its stored value. */
  #wireLinkTokenArtToggle() {
    const checkbox = this.element.querySelector('#link-token-art');
    const tokenInput = this.element.querySelector('#token-art-path');
    const tokenButton = this.element.querySelector('button[data-action="selectTokenArt"]');
    if (!checkbox || !tokenInput || !tokenButton) return;
    const canPickArt = game.user.hasPermission('FILES_BROWSE');
    const sync = () => {
      tokenInput.disabled = checkbox.checked || !canPickArt;
      tokenButton.disabled = checkbox.checked || !canPickArt;
    };
    checkbox.addEventListener('change', sync);
    sync();
  }

  /** Disable the ring + background color pickers while the token ring is off, without mutating their stored values. */
  #wireRingEnabledToggle() {
    const checkbox = this.element.querySelector('#ring-enabled');
    const pickers = ['#ring-color', '#background-color'].map((sel) => this.element.querySelector(sel)).filter(Boolean);
    if (!checkbox || !pickers.length) return;
    const sync = () => pickers.forEach((picker) => (picker.disabled = !checkbox.checked));
    checkbox.addEventListener('change', sync);
    sync();
  }

  /** @inheritdoc */
  _persistPosition() {
    const { left, top, width, height } = this.position;
    game.settings.set(MODULE.ID, MODULE.SETTINGS.WIZARD_POSITION, { left, top, width, height });
  }

  /**
   * Open one of the registered settings menus.
   * @this {HeroMancer}
   * @param {PointerEvent} _event Click event.
   * @param {HTMLElement} target Action element with `data-menu` key.
   */
  static #onOpenSettingsMenu(_event, target) {
    const key = target.dataset.menu;
    if (!SETTINGS_MENUS.some((m) => m.key === key)) return;
    const settingKey = MODULE.SETTINGS[key];
    const menu = game.settings.menus.get(`${MODULE.ID}.${settingKey}`);
    if (!menu?.type) return;
    const windowId = this.window.windowId;
    new menu.type().render({ force: true, ...(windowId && { window: { windowId } }) });
  }

  /**
   * Open Dice So Nice's main config menu. On close, snapshot the player's current DSN appearance into the Start-tab hidden input so the per-character flag stamps correctly at commit time.
   * @this {HeroMancer}
   */
  static #onOpenDsnConfig() {
    const menu = game.settings.menus.get('dice-so-nice.dice-so-nice');
    if (!menu?.type) return;
    const windowId = this.window.windowId;
    const hmRef = this;
    const hookId = Hooks.on('closeApplicationV2', (app) => {
      if (app?.constructor?.name !== 'DiceConfig') return;
      Hooks.off('closeApplicationV2', hookId);
      if (!hmRef.rendered) return;
      const appearance = game.user.getFlag('dice-so-nice', 'appearance');
      const input = hmRef.element?.querySelector('[data-dice-appearance]');
      if (input) input.value = appearance ? JSON.stringify(appearance) : '';
      hmRef.render({ parts: ['start'] });
    });
    new menu.type().render({ force: true, ...(windowId && { window: { windowId } }) });
  }

  /**
   * Snapshot the form and persist it to the user's draft flag.
   * @this {HeroMancer}
   */
  static async #onSaveDraft() {
    const draft = this.#snapshotForm();
    if (this.#mfPool) draft.__mfPool = [...this.#mfPool.entries()];
    draft.__mfRerollsUsed = this.#mfRerollsUsed ?? 0;
    try {
      await savedOptions.save(draft);
      if (this.fsm.can(MODULE.WIZARD.EVENTS.SAVE_DRAFT)) this.fsm.send(MODULE.WIZARD.EVENTS.SAVE_DRAFT);
      this.#dirty = false;
      ui.notifications.info('HEROMANCER.Wizard.Draft.Saved', { localize: true });
    } catch (err) {
      log(1, 'saveDraft failed:', err);
      ui.notifications.error('HEROMANCER.Wizard.Draft.SaveFailed', { localize: true });
    }
  }

  /**
   * Roll one hit die for the clicked HP card and persist the result in the card's hidden input.
   * @this {HeroMancer}
   * @param {PointerEvent} _event Click event.
   * @param {HTMLElement} target Roll button.
   */
  static async #onRollHp(_event, target) {
    const level = target.dataset.level;
    const slotId = target.dataset.slotId;
    const card = target.closest('[data-hp-card]');
    if (!card || !level || !slotId) return;
    let classDoc = null;
    if (this.#mode === 'level_up') {
      if (slotId === 'levelup') ({ classDoc } = await this.#resolveLevelContext());
      else classDoc = this.#actor.items.find((i) => i.type === 'class' && `actor-${i.id}` === slotId) ?? null;
    } else {
      const docs = await this.#identityClassDocs();
      classDoc = docs.find((d) => d.slotId === slotId)?.classDoc ?? null;
    }
    const die = parseHitDie(classDoc);
    if (!die) return;
    const valueInput = card.querySelector('[data-hp-card-value]');
    const attemptsInput = card.querySelector('[data-hp-card-attempts]');
    const prior = Number(valueInput?.value);
    const allowRerolls = game.settings.get(MODULE.ID, MODULE.SETTINGS.ALLOW_REROLLS);
    const maxAttempts = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.MAX_REROLL_ATTEMPTS)) || 0;
    const attempts = Number(attemptsInput?.value) || 0;
    if (Number.isFinite(prior) && prior > 0) {
      if (!allowRerolls) return;
      if (maxAttempts > 0 && attempts >= maxAttempts) return;
      const confirmed = await HMPrompt.confirm({
        window: { title: 'HEROMANCER.App.HP.reroll-title' },
        content: `<p>${_loc('HEROMANCER.App.HP.reroll-prompt', { level, value: prior })}</p>`,
        modal: true
      });
      if (!confirmed) return;
    }
    const rerollOnes = game.settings.get(MODULE.ID, MODULE.SETTINGS.HP_REROLL_ONES);
    const formula = rerollOnes ? `1d${die}rr1` : `1d${die}`;
    const roll = await new Roll(formula).evaluate();
    if (valueInput) valueInput.value = String(roll.total);
    if (attemptsInput) attemptsInput.value = String(attempts + (Number.isFinite(prior) && prior > 0 ? 1 : 0));
    this.render({ parts: ['hp'] });
    this.#refreshHud();
  }

  /**
   * Roll a section's starting wealth formula, store the gp result in the hidden input, and re-render the equipment part. Publishes to chat when `publishWealthRolls` is enabled.
   * @this {HeroMancer}
   * @param {PointerEvent} _event Click event.
   * @param {HTMLElement} target Roll button (carries `data-tag` + `data-formula`).
   */
  static async #onRollWealth(_event, target) {
    const tag = target.dataset.tag;
    const formula = target.dataset.formula;
    if (!tag || !formula) return;
    const hidden = this.element.querySelector(`input[name="equipment.${tag}.wealthRolled"]`);
    if (!hidden) return;
    const roll = await new Roll(formula).evaluate();
    hidden.value = String(roll.total);
    if (game.settings.get(MODULE.ID, MODULE.SETTINGS.PUBLISH_WEALTH_ROLLS)) {
      const flavor = _loc('HEROMANCER.App.Equipment.WealthRollFlavor', { source: _loc(`HEROMANCER.App.Equipment.section-${tag}`) });
      await roll.toMessage({ flavor, speaker: ChatMessage.getSpeaker({ user: game.user }) });
    }
    this.render({ parts: ['equipment'] });
  }

  /**
   * Roll the GM-configured bonus-gold formula, persist the result in the equipment draft, and re-render the equipment part so the new pool total reflects the bonus.
   * @this {HeroMancer}
   * @param {PointerEvent} _event Click event.
   * @param {HTMLElement} target Roll button (carries `data-formula`).
   */
  static async #onRollBonusGold(_event, target) {
    const formula = target.dataset.formula;
    if (!formula) return;
    const hidden = this.element.querySelector('input[name="equipment.bonusGoldRolled"]');
    if (!hidden) return;
    const roll = await new Roll(formula).evaluate();
    hidden.value = String(roll.total);
    if (game.settings.get(MODULE.ID, MODULE.SETTINGS.PUBLISH_WEALTH_ROLLS)) {
      const flavor = _loc('HEROMANCER.App.Equipment.BonusGoldName');
      await roll.toMessage({ flavor, speaker: ChatMessage.getSpeaker({ user: game.user }) });
    }
    this.render({ parts: ['equipment'] });
  }

  /**
   * Roll N values for the manualFormula blocks, flip them into pool mode, and surface the rolled pool as a strip + combobox source.
   * @this {HeroMancer}
   */
  static async #onRollAllAbilities() {
    const blocks = AbilityBlock.attachAll(this.element);
    const mfBlocks = blocks.filter((b) => b.method === 'manualFormula');
    if (!mfBlocks.length) return;
    this.#mfPool = new Map();
    this.#mfRerollsUsed = 0;
    mfBlocks.forEach((b) => {
      b.setPoolMode(true);
      const combo = b.root.querySelector('[data-mode="manualFormula"] [data-combobox]');
      if (combo) Combobox.attach(combo).clear();
    });
    this.#refreshMfPoolDisplay(blocks);
    for (const block of mfBlocks) {
      const formula = block.root.querySelector('[data-mode="manualFormula"]')?.dataset.defaultFormula;
      if (!formula) continue;
      const result = await rollAbilityFormula(formula);
      const key = String(result);
      this.#mfPool.set(key, (this.#mfPool.get(key) ?? 0) + 1);
      this.#refreshMfPoolDisplay(blocks);
    }
    this.#refreshMfPoolOptions(blocks);
    this.#refreshMfRerollButton();
  }

  /**
   * Prompt the user to pick a pool value to reroll. Only unassigned pool instances are offered. Decrements the reroll counter on success and resyncs the pool UI.
   * @this {HeroMancer}
   */
  static async #onRerollPool() {
    if (!this.#mfPool) return;
    if (!game.settings.get(MODULE.ID, MODULE.SETTINGS.ALLOW_REROLLS)) return;
    const max = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.MAX_REROLL_ATTEMPTS)) || 0;
    if (max > 0 && this.#mfRerollsUsed >= max) {
      ui.notifications.warn('HEROMANCER.App.Abilities.RerollExhausted', { localize: true });
      return;
    }
    const blocks = AbilityBlock.attachAll(this.element);
    const mfBlocks = blocks.filter((b) => b.method === 'manualFormula' && b.poolMode);
    const used = new Map();
    for (const b of mfBlocks) {
      const v = b.valueInput?.value;
      if (v) used.set(v, (used.get(v) ?? 0) + 1);
    }
    const available = [...this.#mfPool.entries()]
      .map(([v, n]) => [v, n - (used.get(v) ?? 0)])
      .filter(([, free]) => free > 0)
      .sort((a, b) => Number(b[0]) - Number(a[0]));
    if (!available.length) {
      ui.notifications.warn('HEROMANCER.App.Abilities.RerollNoUnassigned', { localize: true });
      return;
    }
    const buttons = available.map(([v, free]) => ({ action: `v${v}`, label: free > 1 ? `${v} ×${free}` : String(v), default: false }));
    const choice = await HMPrompt.wait({ classes: ['hm-reroll-dialog'], window: { title: 'HEROMANCER.App.Abilities.RerollPromptTitle' }, content: '', buttons, modal: true });
    if (!choice) return;
    const formula = mfBlocks[0]?.root.querySelector('[data-mode="manualFormula"]')?.dataset.defaultFormula;
    if (!formula) return;
    const oldKey = String(choice).replace(/^v/, '');
    const oldCount = this.#mfPool.get(oldKey) ?? 0;
    if (oldCount <= 1) this.#mfPool.delete(oldKey);
    else this.#mfPool.set(oldKey, oldCount - 1);
    const result = await rollAbilityFormula(formula);
    const newKey = String(result);
    this.#mfPool.set(newKey, (this.#mfPool.get(newKey) ?? 0) + 1);
    this.#mfRerollsUsed += 1;
    this.#refreshMfPoolOptions(blocks);
    this.#refreshMfPoolDisplay(blocks);
    this.#refreshMfRerollButton();
  }

  /** Toggle visibility/enabled state of the global Reroll button + update remaining count. */
  #refreshMfRerollButton() {
    const btn = this.element.querySelector('[data-reroll-pool]');
    if (!btn) return;
    const allow = game.settings.get(MODULE.ID, MODULE.SETTINGS.ALLOW_REROLLS);
    if (!this.#mfPool || !allow) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    const max = Number(game.settings.get(MODULE.ID, MODULE.SETTINGS.MAX_REROLL_ATTEMPTS)) || 0;
    const counter = btn.querySelector('[data-reroll-remaining]');
    if (max <= 0) {
      btn.disabled = false;
      if (counter) {
        counter.textContent = '';
        counter.hidden = true;
      }
      return;
    }
    const remaining = Math.max(0, max - this.#mfRerollsUsed);
    btn.disabled = remaining <= 0;
    if (counter) {
      counter.textContent = `${remaining}/${max}`;
      counter.hidden = false;
    }
  }

  /**
   * Generate a random name from the picked style + culture.
   * @this {HeroMancer}
   */
  static #onRandomizeName() {
    const style = this.element.querySelector('#random-name-style')?.value || 'all';
    const culture = this.element.querySelector('#random-name-culture')?.value || 'all';
    const name = generateName({ culture, style });
    if (!name) return;
    const input = this.element.querySelector('#character-name');
    if (!input) return;
    const trimmed = input.value.trim();
    const firstSpace = trimmed.indexOf(' ');
    const firstPart = firstSpace === -1 ? trimmed : trimmed.slice(0, firstSpace);
    const restPart = firstSpace === -1 ? '' : trimmed.slice(firstSpace + 1);
    input.value = style === 'family' ? (firstPart ? `${firstPart} ${name}` : name) : restPart ? `${name} ${restPart}` : name;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Fill the whole character with random selections (identity, abilities, advancements, equipment, biography).
   * @this {HeroMancer}
   */
  static async #onRandomizeAll() {
    const proceed = await HMPrompt.confirm({ window: { title: 'HEROMANCER.App.Randomize.ConfirmTitle' }, body: _loc('HEROMANCER.App.Randomize.ConfirmBody'), modal: true });
    if (!proceed) return;
    await randomizeAll(this);
  }

  /**
   * Open the FilePicker and write the chosen path into the input adjacent to the action button.
   * @this {HeroMancer}
   * @param {PointerEvent} _event Click event.
   * @param {HTMLElement} target Button element with `data-action`.
   */
  static async #onPickArt(_event, target) {
    const input = target.parentElement?.querySelector('input[type="text"]');
    if (!input) return;
    const root = game.user.isGM ? '' : game.settings.get(MODULE.ID, MODULE.SETTINGS.ART_PICKER_ROOT) || '';
    const path = await pickArt({ current: input.value, root });
    if (path != null) {
      input.value = path;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      this.element.querySelectorAll('[data-tokenizer-prototype], [data-tokenizer-layers]').forEach((i) => (i.value = ''));
    }
  }

  /**
   * Open Tokenizer 2's actor-less editor and capture its avatar/token paths plus prototype patch into the Start-tab fields.
   * @this {HeroMancer}
   */
  static async #onTokenize() {
    const root = this.element;
    const characterArt = root.querySelector('#character-art-path');
    const result = await openTokenizer({ name: root.querySelector('#character-name')?.value?.trim(), sourceImage: characterArt?.value?.trim() });
    if (!result) return;
    const write = (input, value) => {
      if (!input || !value) return;
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    write(characterArt, result.avatarPath);
    const link = root.querySelector('#link-token-art');
    if (result.tokenPath && link?.checked) {
      link.checked = false;
      link.dispatchEvent(new Event('change', { bubbles: true }));
    }
    write(root.querySelector('#token-art-path'), result.tokenPath);
    const proto = root.querySelector('[data-tokenizer-prototype]');
    if (proto) proto.value = result.prototypeToken ? JSON.stringify(result.prototypeToken) : '';
    const layers = root.querySelector('[data-tokenizer-layers]');
    if (layers) layers.value = result.layerStack ? JSON.stringify(result.layerStack) : '';
  }

  /**
   * Confirm submission when mandatory fields are incomplete: list every problem and warn that advancements may apply incorrectly.
   * @param {object} validation Aggregated `validateWizard` result; `missing` holds the incomplete-field lang keys.
   * @returns {Promise<boolean>} True when the user chooses to create anyway.
   */
  async #confirmIncompleteSubmit(validation) {
    const choice = await HMPrompt.wait({
      window: { title: 'HEROMANCER.App.Validation.ConfirmIncomplete.Title' },
      template: MODULE.TEMPLATES.COMPONENTS.VALIDATION_INCOMPLETE,
      context: { missing: [...new Set(validation.missing)] },
      modal: true,
      close: () => 'cancel',
      buttons: [
        { action: 'cancel', label: 'HEROMANCER.App.Validation.ConfirmIncomplete.Cancel', icon: 'fa-solid fa-xmark', default: true },
        { action: 'proceed', label: 'HEROMANCER.App.Validation.ConfirmIncomplete.Confirm', icon: 'fa-solid fa-triangle-exclamation' }
      ]
    });
    return choice === 'proceed';
  }

  /**
   * Form handler. Routes to direct creation (GM-self or GM-on-behalf) or to the approval queue (player + setting on).
   * @this {HeroMancer}
   * @param {SubmitEvent} _event Submit event.
   * @param {HTMLFormElement} _form Form element.
   * @param {object} _formData Collected form data.
   */
  static async #formHandler(_event, _form, _formData) {
    const validation = validateWizard(this.element, this.#mode, this.#effectiveAbilityScores());
    if (!validation.valid && !(await this.#confirmIncompleteSubmit(validation))) return;
    if (this.fsm.can(MODULE.WIZARD.EVENTS.SUBMIT)) this.fsm.send(MODULE.WIZARD.EVENTS.SUBMIT);
    try {
      if (this.#mode === 'level_up') {
        const { pickedClass, isMulticlass, pickedSubclass } = this.#readLevelUpDraft();
        if (!pickedClass) {
          if (this.fsm.can(MODULE.WIZARD.EVENTS.ERROR)) this.fsm.send(MODULE.WIZARD.EVENTS.ERROR);
          return;
        }
        const result = await applyLevelUp({
          actor: this.#actor,
          pickedUuid: pickedClass,
          isMulticlass,
          pickedSubclass,
          hpDraft: this.#readHpDraft(),
          advancementDraft: this.#readAdvancementDraft(),
          wizardElement: this.element
        });
        if (!result) {
          if (this.fsm.can(MODULE.WIZARD.EVENTS.ERROR)) this.fsm.send(MODULE.WIZARD.EVENTS.ERROR);
          ui.notifications.error('HEROMANCER.LevelUp.Failed', { localize: true });
          return;
        }
        this.#advanceToLevelUpDone();
        ui.notifications.info('HEROMANCER.LevelUp.Applied', { localize: true, format: { name: this.#actor.name, level: this.#actor.system?.details?.level ?? result.newLevel } });
        await this.close();
        return;
      }
      const payload = await this.#snapshotPayload();
      if (this.#reviewMode) {
        const originalPayload = this.#reviewMode.payload;
        const submitterUserId = this.#reviewMode.submitterUserId;
        if (submitterUserId && !payload.startDraft?.player) {
          payload.startDraft = { ...(payload.startDraft ?? {}), player: submitterUserId };
        }
        const actor = await createCharacter({ payload, wizardElement: this.element, originalPayload });
        if (!actor) {
          if (this.fsm.can(MODULE.WIZARD.EVENTS.ERROR)) this.fsm.send(MODULE.WIZARD.EVENTS.ERROR);
          return;
        }
        await approveSubmissionAfterEdit(this.#reviewMode.pageId, actor.name, actor.uuid);
        ui.notifications.info('HEROMANCER.Approval.Review.ApprovedToast', { localize: true });
        await this.close();
        return;
      }
      const useApproval = !game.user.isGM && game.settings.get(MODULE.ID, MODULE.SETTINGS.REQUIRE_APPROVAL_FOR_PLAYERS);
      if (useApproval) {
        await submitForApproval(payload);
        this.#advanceToPending();
        ui.notifications.info('HEROMANCER.Approval.SubmittedToast', { localize: true });
        this.#confirmCloseBypass = true;
        await this.close();
        return;
      }
      const actor = await createCharacter({ payload, wizardElement: this.element });
      if (!actor) {
        if (this.fsm.can(MODULE.WIZARD.EVENTS.ERROR)) this.fsm.send(MODULE.WIZARD.EVENTS.ERROR);
        return;
      }
      this.#advanceToCreated();
      await savedOptions.clear('submit');
      ui.notifications.info('HEROMANCER.App.Character.Created', { localize: true, format: { name: actor.name } });
      this.#confirmCloseBypass = true;
      await this.close();
    } catch (err) {
      log(1, 'submit failed:', err);
      if (this.fsm.can(MODULE.WIZARD.EVENTS.ERROR)) this.fsm.send(MODULE.WIZARD.EVENTS.ERROR);
    }
  }

  /**
   * Commit a feat pick: write the uuid into the scope row's ASI hidden input, dispatch change so the chooser bridge encodes the payload + re-renders.
   * @this {HeroMancer}
   * @param {PointerEvent} _event Click event.
   * @param {HTMLElement} target Action element carrying `data-uuid` + `data-adv-id` + `data-level`.
   */
  static #onSelectFeat(_event, target) {
    const uuid = target.dataset.uuid;
    const advId = target.dataset.advId;
    const level = target.dataset.level;
    if (!uuid || !advId || !level) return;
    const row = this.element.querySelector(`[data-advancement-row][data-advancement-id="${CSS.escape(advId)}"][data-level="${CSS.escape(level)}"]`);
    const input = row?.querySelector('input[data-adv-asi-feat]');
    if (!input) return;
    input.value = input.value === uuid ? '' : uuid;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Resolve a `{abilityKey: score}` map for the ASI renderer. Pulls from the live actor in level-up mode, or the abilities-tab draft during creation.
   * @returns {Object<string, number>} Score map keyed by ability.
   */
  #resolveAbilityScores() {
    if (this.#mode === 'level_up') {
      const out = {};
      for (const [key, data] of Object.entries(this.#actor?.system?.abilities ?? {})) out[key] = Number(data?.value) || 0;
      return out;
    }
    const draft = this.#readAbilitiesDraft();
    const out = {};
    for (const [key, data] of Object.entries(draft.abilities ?? {})) out[key] = Number(data?.value) || 0;
    return out;
  }

  /**
   * Add ASI advancement bonuses onto a base ability-score map.
   * @param {Object<string, number>} scores Base scores.
   * @param {?Object<string, number>} bonus ASI totals per ability (null in level-up).
   * @returns {Object<string, number>} Combined scores.
   */
  #mergeAsi(scores, bonus) {
    if (!bonus) return scores;
    const out = { ...scores };
    for (const [key, value] of Object.entries(bonus)) out[key] = (out[key] ?? 0) + (Number(value) || 0);
    return out;
  }

  /** @returns {Object<string, number>} Live base scores plus the render's cached ASI bonuses, for multiclass-prereq checks. */
  #effectiveAbilityScores() {
    return this.#mergeAsi(this.#resolveAbilityScores(), this.#shared.asiBonus);
  }

  /**
   * Step an ASI assignment by ±1 from a − / + button click. Mutates the hidden input + dispatches change so the chooser bridge re-encodes the payload and re-renders.
   * @this {HeroMancer}
   * @param {PointerEvent} _event Click event.
   * @param {HTMLElement} target Action element carrying `data-key` + `data-delta`.
   */
  static #onAsiAdjust(_event, target) {
    if (target.disabled) return;
    const key = target.dataset.key;
    const delta = Number(target.dataset.delta);
    if (!key || !Number.isFinite(delta)) return;
    const input = target.closest('.hm-advancement-asi-ability')?.querySelector('input[data-adv-asi-ability]');
    if (!input) return;
    const next = Math.max(0, (Number(input.value) || 0) + delta);
    input.value = String(next);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** Flip `#dirty` true on the first user-driven change event. Wired once per wizard element; resets to false after `#restoreDraft` and `#onSaveDraft`. */
  #wireDirtyTracker() {
    if (this.element.dataset.dirtyTrackerWired === '1') return;
    this.element.dataset.dirtyTrackerWired = '1';
    this.element.addEventListener('change', () => {
      this.#dirty = true;
    });
  }

  /**
   * Reject the player's submission from review-mode wizard. Opens reject dialog, calls domain helper, closes wizard.
   * @this {HeroMancer}
   * @returns {Promise<void>}
   */
  static async #onRejectReview() {
    if (!this.#reviewMode) return;
    const reason = await promptRejectionReason();
    if (reason === null) return;
    await rejectSubmission(this.#reviewMode.pageId, reason);
    ui.notifications.info('HEROMANCER.Approval.Review.RejectedToast', { localize: true });
    await this.close();
  }

  /**
   * Snapshot every wizard tab into a serializable payload for direct creation or socket-replay through the approval queue.
   * @returns {Promise<object>} Submission payload.
   */
  async #snapshotPayload() {
    const startDraft = this.#readStartDraftMapped();
    const identityDraft = this.#readIdentityDraft();
    const abilitiesDraft = this.#readAbilitiesDraft();
    const biographyDraft = this.#readBiographyDraft();
    const equipmentDraft = this.#readEquipmentDraft();
    const advancementDraft = this.#readAdvancementDraft();
    const skipSpellHandoff = this.#readSkipSpellHandoff();
    const hpDraft = this.#readHpDraft();
    const rawDraft = this.#snapshotForm();
    const characterName = startDraft?.characterName?.trim() || '';
    let equipmentReview = null;
    const primaryClassUuid = identityDraft.classes?.[0]?.uuid ?? null;
    if (primaryClassUuid || identityDraft.background) {
      const classDoc = primaryClassUuid ? await fromUuid(primaryClassUuid) : null;
      const backgroundDoc = identityDraft.background ? await fromUuid(identityDraft.background) : null;
      const speciesDoc = identityDraft.species ? await fromUuid(identityDraft.species) : null;
      const equipmentContext = await buildEquipmentContext({ classDoc, backgroundDoc, speciesDoc, draft: equipmentDraft });
      equipmentReview = await buildEquipmentReview({ equipmentContext, draft: equipmentDraft });
    }
    return { characterName, startDraft, identityDraft, abilitiesDraft, biographyDraft, equipmentDraft, advancementDraft, hpDraft, skipSpellHandoff, equipmentReview, rawDraft };
  }

  /** Drive the FSM through validation/submission/creation states for the no-approval direct-create path. */
  #advanceToCreated() {
    const fsm = this.fsm;
    const E = MODULE.WIZARD.EVENTS;
    const chain = [E.COMPLETE, E.APPROVAL_RECEIVED, E.COMPLETE, E.COMPLETE, E.COMPLETE];
    for (const ev of chain) if (fsm.can(ev)) fsm.send(ev);
  }

  /** Drive the FSM into `submitted_pending_approval` for the player-submission path. */
  #advanceToPending() {
    const fsm = this.fsm;
    const E = MODULE.WIZARD.EVENTS;
    const chain = [E.COMPLETE, E.COMPLETE];
    for (const ev of chain) if (fsm.can(ev)) fsm.send(ev);
  }

  /** Drive the level-up FSM through `VALIDATING -> RUNNING_ADVANCEMENTS -> DONE`. */
  #advanceToLevelUpDone() {
    const fsm = this.fsm;
    const E = MODULE.WIZARD.EVENTS;
    const chain = [E.COMPLETE, E.COMPLETE];
    for (const ev of chain) if (fsm.can(ev)) fsm.send(ev);
  }

  /**
   * Toggle a compare pin; feat-browser re-renders, comboboxes mutate in place to keep dropdown open.
   * @this {HeroMancer}
   * @param {PointerEvent} _event Pointer event.
   * @param {HTMLElement} target Action target.
   */
  static #onTogglePin(_event, target) {
    const category = target.dataset.category;
    const uuid = target.dataset.uuid;
    if (!category || !uuid) return;
    const outcome = compare.togglePin(category, uuid);
    if (outcome === 'invalid') return;
    if (category === 'feat') this.render({ parts: ['advancements'] });
    else this.refreshComboboxPinning(category);
    const dialog = foundry.applications.instances.get(`${MODULE.ID}-compare-${category}`);
    if (dialog) dialog.render();
  }

  /**
   * Mutate combobox option list + compare button in place; avoids tearing down open dropdowns.
   * @param {string} category Pin category.
   */
  refreshComboboxPinning(category) {
    const cb = this.element?.querySelector(`[data-combobox][data-pinning="${CSS.escape(category)}"]`);
    if (!cb) return;
    const pinned = new Set(compare.getPins(category));
    const count = pinned.size;
    const compareBtn = cb.querySelector('[data-action="openCompare"][data-category]');
    if (compareBtn) {
      compareBtn.disabled = count < 2;
      const label = _loc('HEROMANCER.Compare.Open', { count });
      compareBtn.setAttribute('aria-label', label);
      const span = compareBtn.querySelector('span');
      if (span) span.textContent = label;
    }
    for (const opt of cb.querySelectorAll('[role="option"]')) {
      const isPinned = pinned.has(opt.dataset.value);
      opt.classList.toggle('is-pinned', isPinned);
      const pinBtn = opt.querySelector('[data-pin-toggle]');
      if (!pinBtn) continue;
      pinBtn.classList.toggle('is-pinned', isPinned);
      const icon = pinBtn.querySelector('i');
      if (icon) icon.className = 'fa-solid fa-scale-balanced';
      pinBtn.setAttribute('aria-label', _loc(isPinned ? 'HEROMANCER.Compare.Unpin' : 'HEROMANCER.Compare.Pin'));
    }
  }

  /**
   * Open compare dialog singleton; inherits wizard's detached window when applicable.
   * @this {HeroMancer}
   * @param {PointerEvent} _event Pointer event.
   * @param {HTMLElement} target Action target.
   */
  static #onOpenCompare(_event, target) {
    const category = target.dataset.category;
    if (!compare.CATEGORIES.has(category)) return;
    if (compare.pinCount(category) < 2) {
      ui.notifications.info('HEROMANCER.Compare.NeedTwo', { localize: true });
      return;
    }
    Combobox.closeAll(this.element);
    const id = `${MODULE.ID}-compare-${category}`;
    const existing = foundry.applications.instances.get(id);
    if (existing) {
      existing.render();
      existing.bringToFront();
      return;
    }
    const windowId = this.window.windowId;
    new CompareDialog({ category }).render({ force: true, ...(windowId && { window: { windowId } }) });
  }

  /**
   * Open the dnd5e CompendiumBrowser for an open-pool ItemChoice.
   * @this {HeroMancer}
   * @param {PointerEvent} _event Pointer event.
   * @param {HTMLElement} target Tile button carrying `data-browse`.
   * @returns {Promise<void>}
   */
  static async #onBrowseAdvancementItems(_event, target) {
    const cfg = JSON.parse(target.dataset.browse || '{}');
    const input = target.querySelector(`input[name="${CSS.escape(cfg.name)}"]`);
    if (!input) return;
    const current = input.value.split(',').filter(Boolean);
    if (cfg.max && current.length >= cfg.max) {
      ui.notifications.warn('HEROMANCER.App.Advancements.BrowseMax', { localize: true });
      return;
    }
    const filters = { locked: { additional: {}, documentClass: 'Item', types: new Set([cfg.type]) } };
    switch (cfg.type) {
      case 'spell':
        if (cfg.level !== '') filters.locked.additional.level = cfg.level === 'available' ? { max: cfg.maxSpellLevel } : { min: Number(cfg.level), max: Number(cfg.level) };
        if (cfg.list?.length) filters.locked.additional.spelllist = cfg.list.reduce((obj, list) => ({ ...obj, [list]: 1 }), {});
        break;
      case 'feat':
        if (cfg.category) filters.locked.additional.category = { [cfg.category]: 1 };
        if (cfg.subtype) filters.locked.additional.subtype = { [cfg.subtype]: 1 };
        filters.locked.arbitrary = [{ k: 'system.prerequisites.level', o: 'lte', v: cfg.featureLevel || getEffectiveStartingLevel(this.#readStartDraftMapped()) }];
        break;
    }
    const result = await dnd5e.applications.CompendiumBrowser.select({ filters, selection: { min: 1, max: cfg.max - current.length } });
    if (!result?.size) return;
    const merged = [...new Set([...current, ...result])].slice(0, cfg.max);
    input.value = merged.join(',');
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Clear an open-browse choice selection so it can be re-picked.
   * @param {PointerEvent} _event Pointer event.
   * @param {HTMLElement} target Undo button carrying `data-action="choiceUndo"`.
   */
  static #onChoiceUndo(_event, target) {
    const input = target.closest('.hm-advancement-tile')?.querySelector('input[type="hidden"]');
    if (!input) return;
    input.value = '';
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Append empty multiclass row; draws a level from primary when budget is exhausted.
   * @this {HeroMancer}
   */
  static #onAddMulticlass() {
    const effectiveLevel = getEffectiveStartingLevel(this.#readStartDraftMapped());
    if (effectiveLevel <= 1) return;
    const roster = this.#readIdentityRoster();
    if (!roster.length) return;
    const assigned = roster.reduce((sum, r) => sum + (Number(r.level) || 0), 0);
    const remaining = effectiveLevel - assigned;
    let newLevel = 1;
    if (remaining <= 0) {
      if ((roster[0].level || 0) <= 0) newLevel = 0;
      else roster[0].level = roster[0].level - 1;
    } else {
      newLevel = 1;
    }
    roster.push({ slotId: rosterSlotId(), uuid: '', level: newLevel, subclassUuid: '' });
    this.#identityRosterOverride = roster;
    this.render({ parts: ['identity'] });
    requestAnimationFrame(() => this.render({ parts: ['hp', 'advancements'] }));
  }

  /**
   * Adjust a multiclass row's level by ±1.
   * @this {HeroMancer}
   * @param {PointerEvent} _event Pointer event.
   * @param {HTMLElement} target Action target.
   */
  static #onMcLevelAdjust(_event, target) {
    const slotId = target.dataset.slotId;
    const delta = Number(target.dataset.delta) || 0;
    if (!slotId || !delta) return;
    const roster = this.#readIdentityRoster();
    const idx = roster.findIndex((r) => r.slotId === slotId);
    if (idx < 0) return;
    const isPrimary = idx === 0;
    const effectiveLevel = getEffectiveStartingLevel(this.#readStartDraftMapped());
    const totalAssigned = roster.reduce((sum, r) => sum + (Number(r.level) || 0), 0);
    const currentLevel = Number(roster[idx].level) || 0;
    if (delta > 0) {
      if (totalAssigned < effectiveLevel) {
        roster[idx].level = currentLevel + 1;
      } else if (!isPrimary && (Number(roster[0].level) || 0) > 1) {
        roster[0].level = (Number(roster[0].level) || 0) - 1;
        roster[idx].level = currentLevel + 1;
      } else if (isPrimary) {
        let donorIdx = -1;
        let donorLevel = 1;
        for (let i = 1; i < roster.length; i++) {
          const lvl = Number(roster[i].level) || 0;
          if (lvl > donorLevel) {
            donorLevel = lvl;
            donorIdx = i;
          }
        }
        if (donorIdx < 0) return;
        roster[donorIdx].level = (Number(roster[donorIdx].level) || 0) - 1;
        roster[idx].level = currentLevel + 1;
      } else return;
    } else {
      if (currentLevel <= 0) return;
      roster[idx].level = currentLevel - 1;
    }
    this.#identityRosterOverride = roster;
    this.render({ parts: ['identity'] });
    requestAnimationFrame(() => this.render({ parts: ['hp', 'advancements'] }));
  }

  /**
   * Scroll the identity part to the top when the back-to-top FAB is clicked.
   * @this {HeroMancer}
   */
  static #onScrollIdentityTop() {
    this.element.querySelector('.hm-identity-section.active .hm-identity-description')?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Remove secondary multiclass row; returns level allocation to primary.
   * @this {HeroMancer}
   * @param {PointerEvent} _event Pointer event.
   * @param {HTMLElement} target Action target.
   */
  static #onRemoveMulticlass(_event, target) {
    const slotId = target.dataset.slotId;
    if (!slotId) return;
    const roster = this.#readIdentityRoster();
    const idx = roster.findIndex((r) => r.slotId === slotId);
    if (idx <= 0) return;
    const [removed] = roster.splice(idx, 1);
    if (roster[0]) roster[0].level = (Number(roster[0].level) || 0) + (Number(removed.level) || 0);
    if (this.#activeClassDescriptionSlotId === slotId) this.#activeClassDescriptionSlotId = null;
    if (this.#activeSubclassDescriptionSlotId === slotId) this.#activeSubclassDescriptionSlotId = null;
    this.#identityRosterOverride = roster;
    this.render({ parts: ['identity'] });
    requestAnimationFrame(() => this.render({ parts: ['hp', 'advancements'] }));
  }

  /**
   * Switch class-description embed to a different roster slot.
   * @this {HeroMancer}
   * @param {PointerEvent} _event Pointer event.
   * @param {HTMLElement} target Action target.
   */
  static #onSetActiveClassDescription(_event, target) {
    const slotId = target.dataset.slotId;
    if (!slotId || slotId === this.#activeClassDescriptionSlotId) return;
    this.#activeClassDescriptionSlotId = slotId;
    const pillStrip = this.element.querySelector('[data-mc-desc-pills]');
    if (pillStrip) {
      for (const pill of pillStrip.querySelectorAll('.hm-mc-desc-pill')) {
        const isActive = pill.dataset.slotId === slotId;
        pill.classList.toggle('is-active', isActive);
        pill.setAttribute('aria-selected', isActive ? 'true' : 'false');
      }
    }
    const row = this.element.querySelector(`[data-mc-row][data-slot-id="${slotId}"]`);
    const uuid = row?.querySelector('input[type="hidden"][name^="identity.classes."][name$=".uuid"]')?.value ?? '';
    const descEmbed = this.element.querySelector('[data-identity-section="class"] .hm-identity-description[data-description="class"]');
    if (descEmbed) descEmbed.dataset.activeSlotId = slotId;
    if (uuid) this.#renderIdentityDetail('class', uuid);
    else if (descEmbed) descEmbed.innerHTML = '';
  }

  /**
   * Switch subclass-description embed to a different roster slot.
   * @this {HeroMancer}
   * @param {PointerEvent} _event Pointer event.
   * @param {HTMLElement} target Action target.
   */
  static #onSetActiveSubclassDescription(_event, target) {
    const slotId = target.dataset.slotId;
    if (!slotId || slotId === this.#activeSubclassDescriptionSlotId) return;
    this.#activeSubclassDescriptionSlotId = slotId;
    const subclassSection = this.element.querySelector('[data-identity-section="subclass"]');
    if (!subclassSection) return;
    const pillStrip = subclassSection.querySelector('[data-mc-desc-pills]');
    if (pillStrip) {
      for (const pill of pillStrip.querySelectorAll('.hm-mc-desc-pill')) {
        const isActive = pill.dataset.slotId === slotId;
        pill.classList.toggle('is-active', isActive);
        pill.setAttribute('aria-selected', isActive ? 'true' : 'false');
      }
    }
    const row = subclassSection.querySelector(`[data-mc-subclass-row][data-slot-id="${slotId}"]`);
    const uuid = row?.querySelector('input[type="hidden"][name^="identity.classes."][name$=".subclassUuid"]')?.value ?? '';
    const descEmbed = subclassSection.querySelector('.hm-identity-description[data-description="subclass"]');
    if (descEmbed) descEmbed.dataset.activeSlotId = slotId;
    if (uuid) this.#renderIdentityDetail('subclass', uuid);
    else if (descEmbed) descEmbed.innerHTML = '';
  }
}
