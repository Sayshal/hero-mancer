import { MODULE } from '../constants.mjs';
import * as documentLoader from '../data/document-loader.mjs';
import { aggregateProficiencies, dedupCategory } from '../data/proficiency-extractor.mjs';
import * as compare from '../domain/compare.mjs';
import { safeEnrichHTML, stripNoiseParenthetical } from '../utils/html-text.mjs';
import { applyItemLinks } from '../utils/item-link.mjs';
import { HMDialog } from './dialog.mjs';

/** @type {Object<string,string>} Category → localization key for the window title. */
const CATEGORY_TITLE = { background: 'TYPES.Item.background', species: 'TYPES.Item.race', class: 'TYPES.Item.class', subclass: 'TYPES.Item.subclass', feat: 'TYPES.Item.feat' };

/** @type {Object<string, Function>} */
const ROW_BUILDERS = { background: buildBackgroundRows, species: buildSpeciesRows, class: buildClassRows, subclass: buildSubclassRows, feat: buildFeatRows };

/** Side-by-side mechanics comparison for pinned picks. */
export class CompareDialog extends HMDialog {
  static DEFAULT_OPTIONS = {
    id: `${MODULE.ID}-compare`,
    classes: ['hm-compare'],
    window: { icon: 'fa-solid fa-scale-balanced' },
    position: { width: 'auto', height: 'auto' },
    actions: { removePin: CompareDialog.#onRemovePin }
  };

  static PARTS = {
    header: HMDialog.HEADER_PART,
    main: { template: `modules/${MODULE.ID}/templates/apps/compare-dialog/main.hbs`, scrollable: [''] }
  };

  /** @type {string} */
  #category;

  /** @param {{category: string}} options Dialog options. */
  constructor(options = {}) {
    const { category } = options;
    if (!compare.CATEGORIES.has(category)) throw new Error(`CompareDialog: unknown category '${category}'`);
    super({ ...options, id: `${MODULE.ID}-compare-${category}` });
    this.#category = category;
  }

  /** @returns {string} Active category. */
  get category() {
    return this.#category;
  }

  /** @inheritdoc */
  get title() {
    return _loc('HEROMANCER.Compare.WindowTitle', { category: _loc(CATEGORY_TITLE[this.#category]) });
  }

  /** @inheritdoc */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const columns = await this.#resolveColumns(compare.getPins(this.#category));
    const rows = await ROW_BUILDERS[this.#category](columns.map((c) => c.doc));
    return {
      ...context,
      category: this.#category,
      columns,
      rows,
      empty: columns.length === 0,
      banner: this.#category === 'feat' ? detectDuplicateEdition(columns) : null,
      gridStyle: `--hm-compare-cols: ${Math.max(1, columns.length)};`,
      emptyText: _loc('HEROMANCER.Compare.Empty')
    };
  }

  /**
   * Resolve pinned uuids into column descriptors; drops pins that no longer resolve.
   * @param {string[]} uuids Pinned uuids.
   * @returns {Promise<Array<{uuid:string,name:string,img:?string,doc:object}>>} Column descriptors.
   */
  async #resolveColumns(uuids) {
    const cols = [];
    for (const uuid of uuids) {
      try {
        const doc = await documentLoader.getFullDocument(uuid);
        if (doc) cols.push({ uuid, name: stripNoiseParenthetical(doc.name, { sourceBook: doc.system?.source?.book }), img: doc.img, doc });
        else ATLAS.log(2, `compare: pin ${uuid} no longer resolves`);
      } catch (err) {
        ATLAS.log(1, 'compare: pin resolve failed', uuid, err);
      }
    }
    return cols;
  }

  /** @inheritdoc */
  _onRender(context, options) {
    super._onRender(context, options);
    applyItemLinks(this.element);
  }

  /** @inheritdoc */
  _onClose(options) {
    super._onClose(options);
    if (compare.pinCount(this.#category) > 0) {
      compare.clearPins(this.#category);
      notifyWizardOfChange(this.#category);
    }
  }

  /**
   * Unpin a uuid from the active category; closes the dialog when no pins remain.
   * @this {CompareDialog}
   * @param {PointerEvent} _event Pointer event.
   * @param {HTMLElement} target Action target.
   */
  static #onRemovePin(_event, target) {
    const { uuid } = target.dataset;
    if (!uuid) return;
    compare.removePin(this.#category, uuid);
    notifyWizardOfChange(this.#category);
    if (compare.pinCount(this.#category) === 0) this.close();
    else this.render();
  }
}

/**
 * Re-render wizard's identity tab (advancements for feats) on pin state change.
 * @param {string} category Pin category.
 */
function notifyWizardOfChange(category) {
  const wizard = foundry.applications.instances.get(`${MODULE.ID}-wizard`);
  if (!wizard) return;
  if (category === 'feat') wizard.render({ parts: ['advancements'] });
  else wizard.refreshComboboxPinning(category);
}

/**
 * Build the background category's compare rows.
 * @param {object[]} docs Source docs.
 * @returns {Promise<Array>} Row descriptors.
 */
async function buildBackgroundRows(docs) {
  const profs = aggregateProfs(docs.map((d) => [d]));
  const asiCells = await Promise.all(docs.map(buildBackgroundAsiCell));
  const skillCells = await Promise.all(docs.map((d, i) => buildSkillCell([d], profs[i].items.skills, d)));
  const toolCells = await Promise.all(docs.map((d, i) => buildToolCell([d], profs[i].items.tools, d)));
  const featureCells = await Promise.all(docs.map((d) => enrichGrantedItems(d)));
  const langCells = docs.map((d, i) => withLanguageChoice(profs[i].joined.languages, d));
  const rows = [
    htmlRow('HEROMANCER.Compare.Field.BackgroundASI', 'fa-arrow-trend-up', asiCells),
    htmlRow('HEROMANCER.Compare.Field.FeatsGranted', 'fa-award', featureCells),
    htmlRow('DND5E.TraitSkillsPlural.other', 'fa-star', skillCells),
    htmlRow('DND5E.TraitToolProf', 'fa-screwdriver-wrench', toolCells),
    textRow('DND5E.Languages', 'fa-language', langCells)
  ];
  return rows.filter(rowHasContent);
}

/**
 * Build the species category's compare rows.
 * @param {object[]} docs Source docs.
 * @returns {Promise<Array>} Row descriptors.
 */
async function buildSpeciesRows(docs) {
  const grantedDocs = await Promise.all(docs.map(resolveGrantedDocs));
  const profs = aggregateProfs(grantedDocs);
  const partitions = await Promise.all(docs.map(partitionGrantedItems));
  const typeCells = await Promise.all(docs.map((d) => enrichCellMarkup(typeCellMarkup(d), d)));
  const sizeCells = await Promise.all(docs.map((d) => enrichCellMarkup(sizeCellMarkup(d), d)));
  const movementCells = await Promise.all(docs.map((d, i) => enrichCellMarkup(movementCellMarkup(mergeMovement(grantedDocs[i])), d)));
  const sensesCells = await Promise.all(docs.map((d, i) => enrichCellMarkup(sensesCellMarkup(mergeSenses(grantedDocs[i])), d)));
  const asiCells = await Promise.all(docs.map(buildBackgroundAsiCell));
  const skillCells = await Promise.all(docs.map((d, i) => buildSkillCell(grantedDocs[i], profs[i].items.skills, d)));
  const toolCells = await Promise.all(docs.map((d, i) => buildToolCell(grantedDocs[i], profs[i].items.tools, d)));
  const damResCells = await Promise.all(docs.map((d, i) => buildResImmCell(grantedDocs[i], d, ['dr'], 'damage', damageLabel)));
  const damImmCells = await Promise.all(docs.map((d, i) => buildResImmCell(grantedDocs[i], d, ['di'], 'damage', damageLabel)));
  const conImmCells = await Promise.all(docs.map((d, i) => buildResImmCell(grantedDocs[i], d, ['ci'], 'condition', conditionLabel)));
  const featuresCells = await Promise.all(docs.map((d, i) => enrichFeaturesCell(partitions[i].features, d)));
  const spellsCells = await Promise.all(docs.map((d, i) => enrichSpellsCell(partitions[i].spellsByLevel, d)));
  const choicesCells = await Promise.all(docs.map((d) => enrichItemChoicesCell(d)));
  const scaleCells = docs.map(formatScaleValues);
  const rows = [
    htmlRow('DND5E.Type', 'fa-paw', typeCells),
    textRow(
      'DND5E.Subtype',
      'fa-tag',
      docs.map((d) => {
        return d.system?.type?.subtype ? d.system?.type?.subtype.titleCase() : null;
      })
    ),
    htmlRow('DND5E.Size', 'fa-up-right-and-down-left-from-center', sizeCells),
    htmlRow('DND5E.MOVEMENT.Type.Speed', 'fa-person-running', movementCells),
    textRow(
      'DND5E.MOVEMENT.FIELDS.special.label',
      'fa-shoe-prints',
      docs.map((d) => d.system?.movement?.special || null)
    ),
    htmlRow('DND5E.Senses', 'fa-eye', sensesCells),
    textRow(
      'DND5E.SenseSpecial',
      'fa-eye-low-vision',
      docs.map((d) => d.system?.senses?.special || null)
    ),
    htmlRow('HEROMANCER.Compare.Field.BackgroundASI', 'fa-arrow-trend-up', asiCells),
    htmlRow('DND5E.TraitSkillsPlural.other', 'fa-star', skillCells),
    htmlRow('DND5E.TraitToolProf', 'fa-screwdriver-wrench', toolCells),
    textRow(
      'DND5E.Languages',
      'fa-language',
      docs.map((d, i) => withLanguageChoice(profs[i].joined.languages, d))
    ),
    htmlRow('DND5E.DamRes', 'fa-shield', damResCells),
    htmlRow('DND5E.DamImm', 'fa-shield-heart', damImmCells),
    htmlRow('DND5E.ConImm', 'fa-face-meh-blank', conImmCells),
    htmlRow('DND5E.Traits', 'fa-sparkles', featuresCells),
    htmlRow('HEROMANCER.Compare.Field.GrantedSpells', 'fa-wand-sparkles', spellsCells),
    htmlRow('HEROMANCER.Compare.Field.Choices', 'fa-list-check', choicesCells),
    textRow('HEROMANCER.Compare.Field.Scales', 'fa-chart-line', scaleCells)
  ];
  return rows.filter(rowHasContent);
}

/**
 * Build the class category's compare rows.
 * @param {object[]} docs Source docs.
 * @returns {Promise<Array>} Row descriptors.
 */
async function buildClassRows(docs) {
  const grantedDocs = await Promise.all(docs.map(resolveGrantedDocs));
  const profsDeep = aggregateProfs(grantedDocs);
  const partitions = await Promise.all(docs.map(partitionGrantedItems));
  const skillCells = await Promise.all(docs.map((d, i) => buildSkillCell(grantedDocs[i], profsDeep[i].items.skills, d)));
  const toolCells = await Promise.all(docs.map((d, i) => buildToolCell(grantedDocs[i], profsDeep[i].items.tools, d)));
  const damResCells = await Promise.all(docs.map((d, i) => buildResImmCell(grantedDocs[i], d, ['dr'], 'damage', damageLabel)));
  const damImmCells = await Promise.all(docs.map((d, i) => buildResImmCell(grantedDocs[i], d, ['di'], 'damage', damageLabel)));
  const conImmCells = await Promise.all(docs.map((d, i) => buildResImmCell(grantedDocs[i], d, ['ci'], 'condition', conditionLabel)));
  const spellsCells = await Promise.all(docs.map((d, i) => enrichSpellsCell(partitions[i].spellsByLevel, d)));
  const choicesCells = await Promise.all(docs.map((d) => enrichItemChoicesCell(d)));
  const langCells = docs.map((d, i) => withLanguageChoice(profsDeep[i].joined.languages, d));
  const primaryAbilityCells = await Promise.all(docs.map((d) => enrichCellMarkup(primaryAbilityCellMarkup(d), d)));
  const savesCells = await Promise.all(docs.map((d, i) => enrichCellMarkup(savesCellMarkup(profsDeep[i].items.savingThrows), d)));
  const rows = [
    textRow(
      'DND5E.HitDie',
      'fa-heart',
      docs.map((d) => d.system?.hd?.denomination?.toUpperCase() || null)
    ),
    htmlRow('HEROMANCER.Compare.Field.PrimaryAbility', 'fa-bolt', primaryAbilityCells),
    htmlRow('DND5E.ClassSaves', 'fa-dice-d20', savesCells),
    textRow(
      'DND5E.TraitArmorProf',
      'fa-shield-halved',
      profsDeep.map((p) => p.joined.armor)
    ),
    textRow(
      'DND5E.TraitWeaponProf',
      'fa-hand-fist',
      profsDeep.map((p) => p.joined.weapons)
    ),
    htmlRow('DND5E.TraitToolProf', 'fa-screwdriver-wrench', toolCells),
    htmlRow('DND5E.TraitSkillsPlural.other', 'fa-star', skillCells),
    textRow('DND5E.Languages', 'fa-language', langCells),
    htmlRow('DND5E.DamRes', 'fa-shield', damResCells),
    htmlRow('DND5E.DamImm', 'fa-shield-heart', damImmCells),
    htmlRow('DND5E.ConImm', 'fa-face-meh-blank', conImmCells),
    textRow('DND5E.Spellcasting', 'fa-wand-magic-sparkles', docs.map(formatSpellcasting)),
    textRow(
      'HEROMANCER.Compare.Field.StartingWealth',
      'fa-coins',
      docs.map((d) => d.system?.wealth || null)
    ),
    textRow('HEROMANCER.Compare.Field.ASILevels', 'fa-arrow-trend-up', docs.map(formatAsiLevels)),
    textRow('HEROMANCER.Compare.Field.SubclassLevel', 'fa-arrow-up-right-dots', docs.map(formatSubclassLevel)),
    htmlRow('HEROMANCER.Compare.Field.GrantedSpells', 'fa-wand-sparkles', spellsCells),
    htmlRow('HEROMANCER.Compare.Field.Choices', 'fa-list-check', choicesCells),
    textRow('HEROMANCER.Compare.Field.Scales', 'fa-chart-line', docs.map(formatScaleValues))
  ];
  return rows.filter(rowHasContent);
}

/**
 * Build the subclass category's compare rows.
 * @param {object[]} docs Source docs.
 * @returns {Promise<Array>} Row descriptors.
 */
async function buildSubclassRows(docs) {
  const grantedDocs = await Promise.all(docs.map(resolveGrantedDocs));
  const profsDeep = aggregateProfs(grantedDocs);
  const partitions = await Promise.all(docs.map(partitionGrantedItems));
  const skillCells = await Promise.all(docs.map((d, i) => buildSkillCell(grantedDocs[i], profsDeep[i].items.skills, d)));
  const toolCells = await Promise.all(docs.map((d, i) => buildToolCell(grantedDocs[i], profsDeep[i].items.tools, d)));
  const damResCells = await Promise.all(docs.map((d, i) => buildResImmCell(grantedDocs[i], d, ['dr'], 'damage', damageLabel)));
  const damImmCells = await Promise.all(docs.map((d, i) => buildResImmCell(grantedDocs[i], d, ['di'], 'damage', damageLabel)));
  const conImmCells = await Promise.all(docs.map((d, i) => buildResImmCell(grantedDocs[i], d, ['ci'], 'condition', conditionLabel)));
  const featuresCells = await Promise.all(docs.map((d, i) => enrichFeaturesByLevelCell(partitions[i].featuresByLevel, d)));
  const spellsCells = await Promise.all(docs.map((d, i) => enrichSpellsCell(partitions[i].spellsByLevel, d)));
  const choicesCells = await Promise.all(docs.map((d) => enrichItemChoicesCell(d)));
  const langCells = docs.map((d, i) => withLanguageChoice(profsDeep[i].joined.languages, d));
  const rows = [
    textRow(
      'HEROMANCER.Compare.Field.ParentClass',
      'fa-shield-halved',
      docs.map((d) => {
        const id = d.system?.classIdentifier;
        return id ? id.titleCase() : null;
      })
    ),
    textRow('DND5E.Spellcasting', 'fa-wand-magic-sparkles', docs.map(formatSpellcasting)),
    htmlRow('DND5E.TraitSkillsPlural.other', 'fa-star', skillCells),
    htmlRow('DND5E.TraitToolProf', 'fa-screwdriver-wrench', toolCells),
    textRow('DND5E.Languages', 'fa-language', langCells),
    htmlRow('DND5E.DamRes', 'fa-shield', damResCells),
    htmlRow('DND5E.DamImm', 'fa-shield-heart', damImmCells),
    htmlRow('DND5E.ConImm', 'fa-face-meh-blank', conImmCells),
    htmlRow('HEROMANCER.Compare.Field.FeaturesByLevel', 'fa-sparkles', featuresCells),
    htmlRow('HEROMANCER.Compare.Field.GrantedSpells', 'fa-wand-sparkles', spellsCells),
    htmlRow('HEROMANCER.Compare.Field.Choices', 'fa-list-check', choicesCells),
    textRow('HEROMANCER.Compare.Field.Scales', 'fa-chart-line', docs.map(formatScaleValues))
  ];
  return rows.filter(rowHasContent);
}

/**
 * Build the feat category's compare rows.
 * @param {object[]} docs Source docs.
 * @returns {Promise<Array>} Row descriptors.
 */
async function buildFeatRows(docs) {
  const subtypeMap = CONFIG.DND5E.featureTypes?.feat?.subtypes ?? {};
  const grantedDocs = await Promise.all(docs.map(resolveGrantedDocs));
  const profsDeep = aggregateProfs(grantedDocs);
  const partitions = await Promise.all(docs.map(partitionGrantedItems));
  const grantsAsiCells = await Promise.all(docs.map((d) => enrichCellMarkup(featGrantsAsiMarkup(d), d)));
  const actionCells = docs.map(featActionEconomy);
  const damageCells = await Promise.all(docs.map((d) => enrichCellMarkup(featDamageMarkup(d), d)));
  const skillCells = await Promise.all(docs.map((d, i) => buildSkillCell(grantedDocs[i], profsDeep[i].items.skills, d)));
  const toolCells = await Promise.all(docs.map((d, i) => buildToolCell(grantedDocs[i], profsDeep[i].items.tools, d)));
  const damResCells = await Promise.all(docs.map((d, i) => buildResImmCell(grantedDocs[i], d, ['dr'], 'damage', damageLabel)));
  const damImmCells = await Promise.all(docs.map((d, i) => buildResImmCell(grantedDocs[i], d, ['di'], 'damage', damageLabel)));
  const conImmCells = await Promise.all(docs.map((d, i) => buildResImmCell(grantedDocs[i], d, ['ci'], 'condition', conditionLabel)));
  const spellsCells = await Promise.all(docs.map((d, i) => enrichSpellsCell(partitions[i].spellsByLevel, d)));
  const choicesCells = await Promise.all(docs.map((d) => enrichItemChoicesCell(d)));
  const langCells = docs.map((d, i) => withLanguageChoice(profsDeep[i].joined.languages, d));
  const rows = [
    textRow(
      'DND5E.ITEM.Category.Label',
      'fa-tag',
      docs.map((d) => configLabel(subtypeMap[d.system?.type?.subtype], null))
    ),
    textRow('HEROMANCER.Compare.Field.EditionSource', 'fa-book', docs.map(formatEditionSource)),
    textRow(
      'HEROMANCER.Compare.Field.MinLevel',
      'fa-stairs',
      docs.map((d) => (d.system?.prerequisites?.level ? _loc('HEROMANCER.Compare.Value.LevelNPlus', { level: d.system.prerequisites.level }) : null))
    ),
    htmlRow('HEROMANCER.Compare.Field.GrantsASI', 'fa-arrow-trend-up', grantsAsiCells),
    textRow('DND5E.Action', 'fa-bolt', actionCells),
    htmlRow('DND5E.Damage', 'fa-burst', damageCells),
    htmlRow('DND5E.TraitSkillsPlural.other', 'fa-star', skillCells),
    htmlRow('DND5E.TraitToolProf', 'fa-screwdriver-wrench', toolCells),
    textRow('DND5E.Languages', 'fa-language', langCells),
    htmlRow('DND5E.DamRes', 'fa-shield', damResCells),
    htmlRow('DND5E.DamImm', 'fa-shield-heart', damImmCells),
    htmlRow('DND5E.ConImm', 'fa-face-meh-blank', conImmCells),
    htmlRow('HEROMANCER.Compare.Field.GrantedSpells', 'fa-wand-sparkles', spellsCells),
    htmlRow('HEROMANCER.Compare.Field.Choices', 'fa-list-check', choicesCells),
    textRow('HEROMANCER.Compare.Field.Scales', 'fa-chart-line', docs.map(formatScaleValues)),
    textRow(
      'DND5E.Prerequisites.FIELDS.prerequisites.repeatable.label',
      'fa-rotate-right',
      docs.map((d) => (d.system?.prerequisites?.repeatable ? _loc('COMMON.Yes') : null))
    )
  ];
  return rows.filter(rowHasContent);
}

/**
 * Combine source book and rules edition for a feat doc.
 * @param {object} doc Feat doc.
 * @returns {?string} `${book} ${rules}` or null.
 */
function formatEditionSource(doc) {
  const book = doc.system?.source?.book?.trim();
  const rules = doc.system?.source?.rules;
  const editionLabel = rules === '2014' || rules === '2024' ? _loc(`HEROMANCER.LevelUp.Source.rules-${rules}`).replace(/\s+ruleset$/i, '') : null;
  if (book && editionLabel) return `${book} (${editionLabel})`;
  return book || editionLabel || null;
}

/**
 * Format the feat's first ASI advancement: fixed grants take precedence; otherwise show allowed abilities (locked inverted).
 * @param {object} doc Feat doc.
 * @returns {?string} ASI markup or null.
 */
function featGrantsAsiMarkup(doc) {
  const asi = doc.advancement?.byType?.AbilityScoreImprovement?.[0];
  if (!asi) return null;
  const cfg = asi.configuration ?? {};
  const refLabel = (k) => `&Reference[ability=${k}]{${abilityLabel(k)}}`;
  const fixed = Object.entries(cfg.fixed ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${refLabel(k)}`);
  if (fixed.length) return fixed.join(' · ');
  const points = Number(cfg.points) || 0;
  if (!points) return null;
  const locked = new Set(cfg.locked ?? []);
  const eligible = Object.keys(CONFIG.DND5E.abilities ?? {}).filter((a) => !locked.has(a));
  if (!eligible.length) return null;
  const all = Object.keys(CONFIG.DND5E.abilities ?? {});
  const choiceLabel = eligible.length === all.length ? _loc('HEROMANCER.Compare.Value.AnyAbility') : eligible.map(refLabel).join(', ');
  return `+${points} ${choiceLabel}`;
}

/**
 * Unique activation labels across the feat's activities; empty → Passive.
 * @param {object} doc Feat doc.
 * @returns {?string} Comma-joined activation labels.
 */
function featActionEconomy(doc) {
  const types = new Set();
  for (const act of doc.system?.activities ?? []) if (act?.activation?.type) types.add(act.activation.type);
  if (!types.size) return _loc('DND5E.Passive');
  const labels = [...types].map((t) => configLabel(CONFIG.DND5E.activityActivationTypes?.[t], t.titleCase()));
  return labels.filter(Boolean).join(', ') || _loc('DND5E.Passive');
}

/**
 * Flatten every activity's damage parts as `${n}d${d} <damageType>` chips.
 * @param {object} doc Feat doc.
 * @returns {?string} Damage markup or null.
 */
function featDamageMarkup(doc) {
  const lines = [];
  for (const act of doc.system?.activities ?? []) {
    for (const part of act?.damage?.parts ?? []) {
      if (!part.number || !part.denomination) continue;
      const dice = `${part.number}d${part.denomination}`;
      const dmgType = part.types?.[0];
      lines.push(dmgType ? `${dice} &Reference[damage=${dmgType}]{${damageLabel(dmgType)}}` : dice);
    }
  }
  return lines.length ? lines.join(' · ') : null;
}

/**
 * Banner descriptor when two or more pinned feats share a name but differ in rules edition.
 * @param {Array<{doc:object}>} columns Resolved columns.
 * @returns {?{icon:string, text:string}} Banner descriptor or null.
 */
function detectDuplicateEdition(columns) {
  const byName = new Map();
  for (const col of columns) {
    const name = col.doc?.name;
    const rules = col.doc?.system?.source?.rules;
    if (!name || !rules) continue;
    if (!byName.has(name)) byName.set(name, new Set());
    byName.get(name).add(rules);
  }
  for (const editions of byName.values()) if (editions.size > 1) return { icon: 'fa-solid fa-circle-info', text: _loc('HEROMANCER.Compare.Banner.DupEdition') };
  return null;
}

/**
 * Compose a text-only row descriptor; blank cells render as em-dash.
 * @param {string} labelKey Localization key.
 * @param {string} icon FA icon class without `fa-solid` prefix.
 * @param {Array<?string>} values Per-column text.
 * @returns {object} Row descriptor.
 */
function textRow(labelKey, icon, values) {
  return { label: _loc(labelKey), icon: `fa-solid ${icon}`, cells: values.map((v) => ({ text: v && String(v).trim() ? v : '—' })) };
}

/**
 * Compose an HTML row descriptor; null cells render as em-dash.
 * @param {string} labelKey Localization key.
 * @param {string} icon FA icon class without `fa-solid` prefix.
 * @param {Array<?string>} htmls Per-column markup.
 * @returns {object} Row descriptor.
 */
function htmlRow(labelKey, icon, htmls) {
  return { label: _loc(labelKey), icon: `fa-solid ${icon}`, cells: htmls.map((h) => (h ? { html: h } : { text: '—' })) };
}

/** @type {Object<string,string>} */
const MOVEMENT_REF = { walk: 'speed', fly: 'flying', climb: 'climbing', swim: 'swimming' };

/** @type {Object<string,string>} */
const SENSE_REF = { darkvision: 'darkvision', blindsight: 'blindsight', tremorsense: 'tremorsense', truesight: 'truesight' };

/**
 * Format a merged movement object as `&Reference[]` chips with optional hover and terrain notes.
 * @param {object} mv Merged movement.
 * @returns {?string} Enricher-ready markup.
 */
function movementCellMarkup(mv) {
  if (!mv) return null;
  const u = mv.units || 'ft';
  const parts = [];
  for (const [key, cfg] of Object.entries(CONFIG.DND5E.movementTypes ?? {})) {
    if (cfg?.hidden) continue;
    const v = Number(mv[key]) || 0;
    if (!v) continue;
    const label = `${key === 'walk' ? _loc('HEROMANCER.Compare.Value.Walking') : configLabel(cfg, key)} ${v} ${u}`;
    const ref = MOVEMENT_REF[key];
    parts.push(ref ? `&Reference[${ref}]{${label}}` : label);
  }
  if (mv.hover && Number(mv.fly) > 0) parts.push(_loc('DND5E.MOVEMENT.Hover'));
  const ignored = ignoredTerrainLabel(mv);
  if (ignored) parts.push(ignored);
  return parts.length ? parts.join(', ') : null;
}

/**
 * Format a merged senses object as `&Reference[]` chips.
 * @param {object} s Merged senses.
 * @returns {?string} Enricher-ready markup.
 */
function sensesCellMarkup(s) {
  if (!s) return null;
  const u = s.units || 'ft';
  const parts = [];
  for (const [key, cfg] of Object.entries(CONFIG.DND5E.senses ?? {})) {
    const v = Number(s?.[key]) || 0;
    if (!v) continue;
    const label = `${configLabel(cfg, key)} ${v} ${u}`;
    const ref = SENSE_REF[key];
    parts.push(ref ? `&Reference[${ref}]{${label}}` : label);
  }
  return parts.length ? parts.join(', ') : null;
}

/**
 * Run a markup string through the text enricher, relative to a doc.
 * @param {?string} markup Enricher-ready markup.
 * @param {object} doc `relativeTo` source.
 * @returns {Promise<?string>} Enriched HTML or null.
 */
async function enrichCellMarkup(markup, doc) {
  if (!markup) return null;
  return safeEnrichHTML(markup, { secrets: false, relativeTo: doc });
}

/**
 * True when at least one cell carries content; filters all-em-dash rows.
 * @param {object} row Row descriptor.
 * @returns {boolean} True when any cell has content.
 */
function rowHasContent(row) {
  return row.cells.some((c) => c.html || (c.text && c.text !== '—'));
}

/**
 * Aggregate proficiencies per pin, with item arrays and joined name strings.
 * @param {object[][]} docArrays Per-pin doc lists.
 * @returns {Array<{items: object, joined: object}>} Per-pin proficiency summaries.
 */
function aggregateProfs(docArrays) {
  return docArrays.map((docs) => {
    const data = aggregateProficiencies(docs);
    const items = {};
    const joined = {};
    for (const b of ['armor', 'weapons', 'tools', 'savingThrows', 'skills', 'languages']) {
      const deduped = dedupCategory(data[b]);
      items[b] = deduped;
      joined[b] = deduped.map((i) => i.name).join(', ');
    }
    return { items, joined };
  });
}

/**
 * Tools cell combining fixed grants and choice pools.
 * @param {object[]} docs Source docs.
 * @param {Array<{name: string, key: string}>} items Fixed tool grants.
 * @param {object} relativeDoc Parent doc.
 * @returns {Promise<?string>} Cell markup or null.
 */
async function buildToolCell(docs, items, relativeDoc) {
  const tools = CONFIG.DND5E.tools ?? {};
  const toolIds = CONFIG.DND5E.toolIds ?? {};
  const resolveItemUuid = (tail) => {
    const ref = tools[tail]?.id ?? toolIds[tail] ?? null;
    return typeof ref === 'string' ? ref : ref?.id;
  };
  const grantsMarkup = items?.length
    ? items
        .map((i) => {
          const uuid = resolveItemUuid(i.key.split(':').pop());
          return uuid ? `@UUID[${uuid}]{${i.name}}` : i.name;
        })
        .join(', ')
    : null;
  const choices = traitChoicesByPrefix(docs, ['tool']);
  const choicesMarkup = choices.length
    ? choices
        .map((c) => {
          const parts = c.keys.map((k) => {
            const tail = k.split(':').pop();
            if (tail === '*') return dnd5e.documents.Trait.keyLabel(k);
            const uuid = resolveItemUuid(tail);
            return uuid ? `@UUID[${uuid}]` : dnd5e.documents.Trait.keyLabel(k);
          });
          return `${_loc('HEROMANCER.Compare.Value.ChooseN', { count: c.count })}: ${parts.join(', ')}`;
        })
        .join('; ')
    : null;
  const parts = [grantsMarkup, choicesMarkup].filter(Boolean);
  if (!parts.length) return null;
  return enrichCellMarkup(parts.join(' · '), relativeDoc);
}

/**
 * Enrich every ItemGrant uuid as `@UUID[]` links.
 * @param {object} doc Source doc.
 * @returns {Promise<?string>} Cell markup or null.
 */
async function enrichGrantedItems(doc) {
  const uuids = [];
  for (const adv of doc.advancement?.byType?.ItemGrant ?? []) for (const item of adv.configuration?.items ?? []) if (item.uuid) uuids.push(item.uuid);
  if (!uuids.length) return null;
  const markup = uuids.map((u) => `@UUID[${u}]`).join(', ');
  return safeEnrichHTML(markup, { secrets: false, relativeTo: doc });
}

/**
 * Walk ItemGrant advancements one level deep.
 * @param {object} doc Source doc.
 * @returns {Promise<object[]>} `[doc, ...grantedItems]`.
 */
async function resolveGrantedDocs(doc) {
  const out = [doc];
  for (const adv of doc.advancement?.byType?.ItemGrant ?? []) {
    for (const item of adv.configuration?.items ?? []) {
      if (!item.uuid) continue;
      const child = await fromUuid(item.uuid);
      if (child) out.push(child);
    }
  }
  return out;
}

/**
 * Walk Trait advancements on the supplied docs.
 * @param {object[]} docs Source docs.
 * @param {string[]} prefixes Grant prefixes (e.g. `['dr']`).
 * @returns {Array<{count: number, tails: string[]}>} Choice pools.
 */
function traitChoicesByPrefix(docs, prefixes) {
  const out = [];
  for (const doc of docs) {
    for (const t of doc.advancement?.byType?.Trait ?? []) {
      for (const c of t.configuration?.choices ?? []) {
        const matched = [...(c.pool ?? [])].filter((k) => typeof k === 'string' && prefixes.some((p) => k.startsWith(`${p}:`)));
        if (matched.length) out.push({ count: Number(c.count) || 1, keys: matched, tails: matched.map((k) => k.split(':').pop()) });
      }
    }
  }
  return out;
}

/**
 * Format a single Trait choice-pool entry as either a wildcard label or `&Reference[]` chip.
 * @param {string} key Pool key (e.g. `skills:*`, `skills:ins`).
 * @param {string} refType dnd5e ruleType.
 * @param {Function} labelFn Tail to label.
 * @returns {string} Enricher-ready markup.
 */
function poolEntryMarkup(key, refType, labelFn) {
  const tail = key.split(':').pop();
  if (tail === '*') return dnd5e.documents.Trait.keyLabel(key);
  return `&Reference[${refType}=${tail}]{${labelFn(tail)}}`;
}

/**
 * Skills cell: fixed grants plus choice pools.
 * @param {object[]} docs Source docs.
 * @param {Array<{name: string, key: string}>} items Fixed skill grants.
 * @param {object} relativeDoc Parent doc.
 * @returns {Promise<?string>} Cell markup or null.
 */
async function buildSkillCell(docs, items, relativeDoc) {
  const grantsMarkup = items?.length ? items.map((i) => `&Reference[skill=${i.key.split(':').pop()}]{${i.name}}`).join(', ') : null;
  const choices = traitChoicesByPrefix(docs, ['skills']);
  const choicesMarkup = choices.length
    ? choices.map((c) => `${_loc('HEROMANCER.Compare.Value.ChooseN', { count: c.count })}: ${c.keys.map((k) => poolEntryMarkup(k, 'skill', skillLabel)).join(', ')}`).join('; ')
    : null;
  const parts = [grantsMarkup, choicesMarkup].filter(Boolean);
  if (!parts.length) return null;
  return enrichCellMarkup(parts.join(' · '), relativeDoc);
}

/**
 * Damage-res/imm or condition-imm cell: fixed grants plus choice pools.
 * @param {object[]} docs Source docs.
 * @param {object} relativeDoc Parent doc.
 * @param {string[]} prefixes Grant prefixes.
 * @param {string} refType dnd5e ruleType.
 * @param {Function} labelFn Tail to label.
 * @returns {Promise<?string>} Cell markup or null.
 */
async function buildResImmCell(docs, relativeDoc, prefixes, refType, labelFn) {
  const tails = new Set();
  for (const d of docs) {
    for (const t of d.advancement?.byType?.Trait ?? []) for (const g of t.configuration?.grants ?? []) for (const p of prefixes) if (g.startsWith(`${p}:`)) tails.add(g.slice(p.length + 1));
  }
  const fixedMarkup = tails.size ? [...tails].map((k) => `&Reference[${refType}=${k}]{${labelFn(k)}}`).join(', ') : null;
  const choices = traitChoicesByPrefix(docs, prefixes);
  const choicesMarkup = choices.length
    ? choices.map((c) => `${_loc('HEROMANCER.Compare.Value.ChooseN', { count: c.count })}: ${c.keys.map((k) => poolEntryMarkup(k, refType, labelFn)).join(', ')}`).join('; ')
    : null;
  const parts = [fixedMarkup, choicesMarkup].filter(Boolean);
  if (!parts.length) return null;
  return enrichCellMarkup(parts.join(' · '), relativeDoc);
}

/**
 * Merge movement objects across docs; numeric modes take the max, hover ORs.
 * @param {object[]} docs Source docs.
 * @returns {object} Merged `system.movement`.
 */
function mergeMovement(docs) {
  const merged = { walk: 0, fly: 0, climb: 0, swim: 0, burrow: 0, hover: false, units: null, ignoredDifficultTerrain: {} };
  for (const d of docs) {
    const m = d.system?.movement;
    if (!m) continue;
    for (const key of ['walk', 'fly', 'climb', 'swim', 'burrow']) {
      const v = Number(m[key]) || 0;
      if (v > merged[key]) merged[key] = v;
    }
    if (m.hover) merged.hover = true;
    if (m.units && !merged.units) merged.units = m.units;
    if (m.ignoredDifficultTerrain) for (const [k, v] of Object.entries(m.ignoredDifficultTerrain)) if (v) merged.ignoredDifficultTerrain[k] = true;
  }
  return merged;
}

/**
 * Merge `system.senses`: ranges take max, `special` takes first non-empty.
 * @param {object[]} docs Source docs.
 * @returns {object} Merged senses.
 */
function mergeSenses(docs) {
  const merged = { darkvision: 0, blindsight: 0, tremorsense: 0, truesight: 0, units: null, special: '' };
  for (const d of docs) {
    const s = d.system?.senses;
    if (!s) continue;
    const ranges = s.ranges ?? s;
    for (const key of ['darkvision', 'blindsight', 'tremorsense', 'truesight']) {
      const v = Number(ranges?.[key]) || 0;
      if (v > merged[key]) merged[key] = v;
    }
    if (s.units && !merged.units) merged.units = s.units;
    if (s.special && !merged.special) merged.special = s.special;
  }
  return merged;
}

/**
 * Partition ItemGrant items: features (flat + by-level) and spells by-level.
 * @param {object} doc Source doc.
 * @returns {Promise<{features: string[], featuresByLevel: Map<number,string[]>, spellsByLevel: Map<number,string[]>}>} Partitioned uuids.
 */
async function partitionGrantedItems(doc) {
  const features = [];
  const featuresByLevel = new Map();
  const spellsByLevel = new Map();
  for (const adv of doc.advancement?.byType?.ItemGrant ?? []) {
    const lvl = Number(adv.level) || 0;
    for (const item of adv.configuration?.items ?? []) {
      if (!item.uuid) continue;
      const child = await fromUuid(item.uuid);
      if (child?.type === 'spell') {
        if (!spellsByLevel.has(lvl)) spellsByLevel.set(lvl, []);
        spellsByLevel.get(lvl).push(item.uuid);
      } else {
        features.push(item.uuid);
        if (!featuresByLevel.has(lvl)) featuresByLevel.set(lvl, []);
        featuresByLevel.get(lvl).push(item.uuid);
      }
    }
  }
  return { features, featuresByLevel, spellsByLevel };
}

/**
 * Enrich a list of feature-item uuids as comma-joined `@UUID[]` links.
 * @param {string[]} uuids Item uuids.
 * @param {object} relativeDoc Parent doc.
 * @returns {Promise<?string>} Cell markup or null.
 */
async function enrichFeaturesCell(uuids, relativeDoc) {
  if (!uuids.length) return null;
  return enrichCellMarkup(uuids.map((u) => `@UUID[${u}]`).join(', '), relativeDoc);
}

/**
 * Features-by-level as `<strong>Level N:</strong> @UUID[]...`. Level 0 renders as em-dash.
 * @param {Map<number,string[]>} featuresByLevel Per-level uuids.
 * @param {object} relativeDoc Parent doc.
 * @returns {Promise<?string>} Cell markup or null.
 */
async function enrichFeaturesByLevelCell(featuresByLevel, relativeDoc) {
  if (!featuresByLevel.size) return null;
  const parts = [...featuresByLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([lvl, uuids]) => `<strong>${lvl > 0 ? _loc('DND5E.LevelNumber', { level: lvl }) : '—'}:</strong> ${uuids.map((u) => `@UUID[${u}]`).join(', ')}`);
  return enrichCellMarkup(parts.join('<br>'), relativeDoc);
}

/**
 * Spells-by-level as `<strong>Level N:</strong> @UUID[]...`. Level 0 renders as "Cantrip".
 * @param {Map<number,string[]>} spellsByLevel Per-level uuids.
 * @param {object} relativeDoc Parent doc.
 * @returns {Promise<?string>} Cell markup or null.
 */
async function enrichSpellsCell(spellsByLevel, relativeDoc) {
  if (!spellsByLevel.size) return null;
  const parts = [...spellsByLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([lvl, uuids]) => `<strong>${lvl > 0 ? _loc('DND5E.LevelNumber', { level: lvl }) : _loc('DND5E.SpellCantrip')}:</strong> ${uuids.map((u) => `@UUID[${u}]`).join(', ')}`);
  return enrichCellMarkup(parts.join('<br>'), relativeDoc);
}

/**
 * ItemChoice advancements as `<strong>Title</strong> — pick N: @UUID[]...`.
 * @param {object} doc Source doc.
 * @returns {Promise<?string>} Cell markup or null.
 */
async function enrichItemChoicesCell(doc) {
  const groups = [];
  for (const adv of doc.advancement?.byType?.ItemChoice ?? []) {
    const counts = Object.values(adv.configuration?.choices ?? {}).map((c) => Number(c.count) || 0);
    const totalCount = counts.reduce((s, c) => s + c, 0);
    const pool = adv.configuration?.pool ?? [];
    if (!totalCount || !pool.length) continue;
    const items = pool.map((p) => `@UUID[${p.uuid}]`).join('<br>');
    const title = foundry.utils.escapeHTML(adv.title || _loc('DND5E.ADVANCEMENT.ItemChoice.Title'));
    groups.push(`<strong>${title}</strong> — ${_loc('HEROMANCER.Compare.Value.PickN', { count: totalCount })}:<br>${items}`);
  }
  if (!groups.length) return null;
  return enrichCellMarkup(groups.join('<br><br>'), doc);
}

/**
 * Format the `ignoredDifficultTerrain` keys as a one-line summary.
 * @param {object} merged Merged movement.
 * @returns {?string} Ignored-difficult-terrain summary.
 */
function ignoredTerrainLabel(merged) {
  const keys = Object.keys(merged.ignoredDifficultTerrain ?? {});
  if (!keys.length) return null;
  return `${_loc('HEROMANCER.Compare.Value.IgnoresDifficultTerrain')}: ${keys.join(', ')}`;
}

/**
 * Decode a CONFIG.DND5E entry: string lang key, `{label}` object, or absent.
 * @param {?(string|{label:string})} entry CONFIG entry.
 * @param {?string} fallback Fallback label.
 * @returns {?string} Localized label.
 */
function configLabel(entry, fallback) {
  const raw = typeof entry === 'string' ? entry : entry?.label;
  return typeof raw === 'string' ? _loc(raw) : fallback;
}

const damageLabel = (k) => configLabel(CONFIG.DND5E.damageTypes?.[k], k);
const conditionLabel = (k) => configLabel(CONFIG.DND5E.conditionTypes?.[k], k);
const abilityLabel = (k) => configLabel(CONFIG.DND5E.abilities?.[k], k);
const skillLabel = (k) => configLabel(CONFIG.DND5E.skills?.[k], k);

/**
 * Build the creature-type cell as a `&Reference[creatureType]` chip or custom text.
 * @param {object} doc Race doc.
 * @returns {?string} Creature-type cell markup.
 */
function typeCellMarkup(doc) {
  const t = doc.system?.type;
  if (!t?.value) return null;
  if (t.value === 'custom') return t.custom ? foundry.utils.escapeHTML(t.custom) : null;
  const cfg = CONFIG.DND5E.creatureTypes?.[t.value];
  const label = configLabel(cfg, t.custom || t.value);
  if (!cfg) return label;
  return `&Reference[creatureType=${t.value}]{${label}}`;
}

/**
 * Build the size cell from a race's Size advancement.
 * @param {object} doc Race doc.
 * @returns {?string} Size cell markup.
 */
function sizeCellMarkup(doc) {
  const sizes = [...(doc.advancement?.byType?.Size?.[0]?.configuration?.sizes ?? [])];
  if (!sizes.length) return null;
  return sizes.map((k) => `&Reference[size]{${configLabel(CONFIG.DND5E.actorSizes?.[k], k)}}`).join(', ');
}

/**
 * Primary-ability cell; appends "all required" when `pa.all` and multiple abilities.
 * @param {object} doc Class doc.
 * @returns {?string} Cell markup or null.
 */
function primaryAbilityCellMarkup(doc) {
  const pa = doc.system?.primaryAbility;
  const raw = pa?.value ?? pa;
  const keys = (raw instanceof Set ? [...raw] : Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : []).filter(Boolean);
  if (!keys.length) return null;
  const refs = keys.map((k) => `&Reference[ability=${k}]{${abilityLabel(k)}}`);
  if (pa?.all && refs.length > 1) return `${refs.join(` ${_loc('HEROMANCER.Compare.Value.And')} `)} ${_loc('HEROMANCER.Compare.Value.AllRequired')}`;
  return refs.join(', ');
}

/**
 * Format save grants as `&Reference[ability]` chips.
 * @param {Array<{name: string, key: string}>} items Save grants.
 * @returns {?string} Saves cell markup.
 */
function savesCellMarkup(items) {
  if (!items?.length) return null;
  return items.map((i) => `&Reference[ability=${i.key.split(':').pop()}]{${i.name}}`).join(', ');
}

/**
 * Format spellcasting progression with the casting ability in parentheses.
 * @param {object} doc Source doc.
 * @returns {?string} Spellcasting progression + ability.
 */
function formatSpellcasting(doc) {
  const sc = doc.system?.spellcasting;
  if (!sc?.progression || sc.progression === 'none') return null;
  const prog = configLabel(CONFIG.DND5E.spellProgression?.[sc.progression], sc.progression);
  const ability = sc.ability ? abilityLabel(sc.ability) : null;
  return ability ? `${prog} (${ability})` : prog;
}

/**
 * Extract the subclass-feature unlock level from a class advancement.
 * @param {object} doc Source doc.
 * @returns {?string} Subclass-feature unlock level.
 */
function formatSubclassLevel(doc) {
  const lvl = doc.advancement?.byType?.SubclassFeature?.[0]?.level ?? doc.advancement?.byType?.Subclass?.[0]?.level;
  return lvl ? String(lvl) : null;
}

/**
 * Format ASI advancement levels as a sorted, comma-joined list.
 * @param {object} doc Source doc.
 * @returns {?string} Sorted ASI levels, comma-joined.
 */
function formatAsiLevels(doc) {
  const levels = (doc.advancement?.byType?.AbilityScoreImprovement ?? []).map((a) => Number(a.level)).filter((n) => n > 0);
  return levels.length ? levels.sort((a, b) => a - b).join(', ') : null;
}

/**
 * Format ScaleValue advancements as `id: first -> last` lines, capped at 3.
 * @param {object} doc Source doc.
 * @returns {?string} `id: start -> end` per ScaleValue, cap 3 entries.
 */
function formatScaleValues(doc) {
  const scales = doc.advancement?.byType?.ScaleValue ?? [];
  if (!scales.length) return null;
  const lines = scales.slice(0, 3).map((sv) => {
    const id = sv.title || sv.configuration?.identifier || '?';
    const cfg = sv.configuration?.scale ?? {};
    const levels = Object.keys(cfg)
      .map(Number)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (!levels.length) return id;
    const first = scaleValueAt(cfg[levels[0]]);
    const last = scaleValueAt(cfg[levels[levels.length - 1]]);
    return first === last ? `${id}: ${first}` : `${id}: ${first} → ${last}`;
  });
  if (scales.length > 3) lines.push(_loc('HEROMANCER.Compare.Value.PlusMore', { count: scales.length - 3 }));
  return lines.join(' · ');
}

/**
 * Best-effort label across ScaleValue entry shapes (number/dice/distance/string).
 * @param {*} entry Scale entry.
 * @returns {string} Display value.
 */
function scaleValueAt(entry) {
  if (entry == null) return '?';
  if (typeof entry === 'number' || typeof entry === 'string') return String(entry);
  if (entry.value != null) return String(entry.value);
  if (entry.number != null && entry.faces != null) return `${entry.number}d${entry.faces}`;
  if (entry.n != null && entry.die != null) return `${entry.n}d${entry.die}`;
  return '?';
}

/**
 * Background ASI summary; fixed grants take precedence over points pools.
 * @param {object} doc Source doc.
 * @returns {Promise<?string>} Cell markup or null.
 */
async function buildBackgroundAsiCell(doc) {
  const asi = doc.advancement?.byType?.AbilityScoreImprovement?.[0];
  if (!asi) return null;
  const cfg = asi.configuration ?? {};
  const refLabel = (k) => `&Reference[ability=${k}]{${abilityLabel(k)}}`;
  const fixed = Object.entries(cfg.fixed ?? {})
    .filter(([, v]) => v)
    .map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${refLabel(k)}`);
  let markup;
  if (fixed.length) markup = fixed.join(' · ');
  else {
    const points = Number(cfg.points) || 0;
    if (!points) return null;
    const locked = new Set(cfg.locked ?? []);
    const eligible = Object.keys(CONFIG.DND5E.abilities ?? {}).filter((a) => !locked.has(a));
    if (!eligible.length) return null;
    markup = eligible.map(refLabel).join(', ');
  }
  return safeEnrichHTML(markup, { secrets: false, relativeTo: doc });
}

/**
 * Append `+N of choice` to language grants when Trait advancements have language pools.
 * @param {string} grantsText Existing grants string.
 * @param {object} doc Source doc.
 * @returns {?string} Cell text or null.
 */
function withLanguageChoice(grantsText, doc) {
  let choiceCount = 0;
  for (const trait of doc.advancement?.byType?.Trait ?? []) {
    for (const c of trait.configuration?.choices ?? []) {
      const isLangPool = [...(c.pool ?? [])].some((k) => typeof k === 'string' && k.startsWith('languages:'));
      if (isLangPool) choiceCount += Number(c.count) || 0;
    }
  }
  const grants = grantsText && grantsText.trim();
  const choice = choiceCount ? _loc('HEROMANCER.Compare.Value.LangChoice', { count: choiceCount }) : null;
  if (grants && choice) return `${grants} · ${choice}`;
  return grants || choice || null;
}
