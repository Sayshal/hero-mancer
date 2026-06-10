import { computeAsiBonus } from '../domain/advancement-chooser.mjs';
import { readAdvancementDraft } from '../domain/advancement-draft.mjs';
import { getShopItem } from '../domain/equipment-shop.mjs';
import { parseHitDie } from '../domain/hp-tab.mjs';

/** Default character icon used when no portrait/token art is set. */
export const DEFAULT_PORTRAIT = 'systems/dnd5e/icons/svg/actors/character.svg';

/** Neutral palette when no class is picked. */
export const DEFAULT_PALETTE = { primary: '#c8a878', secondary: '#5a4830' };

/**
 * Build the HUD render snapshot from the live wizard element.
 * @param {HTMLElement} wizardElement Wizard root.
 * @param {object} shared Wizard `#shared` (classDoc/effectiveLevel/identityContext/rosterDocs).
 * @param {object} [extras] Extra context cached by the wizard.
 * @param {?object} [extras.shopContext] Last-built equipment shop context.
 * @param {?object} [extras.actor] Level-up target actor.
 * @param {'creation'|'level_up'} [extras.mode] Wizard mode.
 * @returns {Promise<object>} HUD snapshot.
 */
export async function buildHudSnapshot(wizardElement, shared = {}, extras = {}) {
  if (!wizardElement) return emptySnapshot();
  const mode = extras.mode ?? 'creation';
  const actor = mode === 'level_up' ? extras.actor : null;
  const start = readStart(wizardElement);
  const identityDocs = resolveIdentityDocs(wizardElement, shared, actor);
  const classes = buildClassRoster({ mode, actor, shared });
  const primary = classes[0] ?? null;
  const totalLevel = classes.reduce((sum, c) => sum + c.level, 0);
  const subclassDoc = shared.subclassDocFromPick ?? identityDocs.subclass;
  const speciesDoc = identityDocs.species;
  const backgroundDoc = identityDocs.background;
  const effectiveLevel = Number(shared.effectiveLevel) || 1;
  const baseAbilities = readAbilities(wizardElement, actor);
  const asiBonus = actor
    ? {}
    : await computeAsiBonus({
        classDoc: primary?.classDoc,
        subclassDoc,
        speciesDoc,
        backgroundDoc,
        advancementDraft: readAdvancementDraft(wizardElement),
        effectiveLevel,
        characterLevel: effectiveLevel
      });
  const abilities = applyAsiBonus(baseAbilities, asiBonus);
  const hp = computeHp({ wizardElement, classes, conScore: abilities.con, actor });
  const ac = computeAc({ wizardElement, classDoc: primary?.classDoc, abilities });
  const currency = readCurrency(wizardElement, extras.shopContext);
  const stats = computeStats({ classDoc: primary?.classDoc, speciesDoc, abilities, effectiveLevel: totalLevel || effectiveLevel });
  const portraitImg = start.characterArt?.trim() || actor?.img || DEFAULT_PORTRAIT;
  const explicitToken = start.tokenArt?.trim();
  const tokenImg = explicitToken || (start.linkTokenArt ? portraitImg : null) || actor?.prototypeToken?.texture?.src || DEFAULT_PORTRAIT;
  return {
    name: (start.characterName || actor?.name || '').trim(),
    portraitImg,
    tokenImg,
    classImg: primary?.img ?? null,
    classes,
    classLineText: formatClassLineText(classes),
    totalLevel,
    speciesName: speciesDoc?.name ?? null,
    backgroundName: backgroundDoc?.name ?? null,
    hp,
    ac,
    currency,
    stats,
    isEmpty: !primary && !speciesDoc && !backgroundDoc
  };
}

/**
 * Compute derived secondary stats (initiative, speed, prof bonus, hit die, saves, senses).
 * @param {object} args Inputs.
 * @param {?object} args.classDoc Class doc.
 * @param {?object} args.speciesDoc Species doc.
 * @param {Object<string, number>} args.abilities Ability score map.
 * @param {number} args.effectiveLevel Character level.
 * @returns {object} Stats payload.
 */
function computeStats({ classDoc, speciesDoc, abilities, effectiveLevel }) {
  const dexMod = Math.floor(((abilities.dex ?? 10) - 10) / 2);
  const profBonus = dnd5e.documents.Proficiency.calculateMod(effectiveLevel);
  const initiative = dexMod;
  const speed = speciesDoc?.system?.movement?.walk ?? null;
  const speedUnits = speciesDoc?.system?.movement?.units || 'ft';
  const die = parseHitDie(classDoc);
  const saveKeys = readSavesFromAdvancement(classDoc);
  const saves = saveKeys.length ? saveKeys.map((k) => k.toUpperCase()).join(', ') : null;
  const senses = collectSenses(speciesDoc);
  const abilityKeys = Object.keys(CONFIG.DND5E?.abilities ?? {});
  const abilitiesPicked = Object.values(abilities).some((v) => v !== 10 && v !== 0);
  const abilityRows = abilitiesPicked
    ? abilityKeys.map((key) => {
        const score = Number(abilities[key]) || 10;
        const mod = Math.floor((score - 10) / 2);
        const label = CONFIG.DND5E.abilities[key]?.abbreviation ?? key.toUpperCase();
        return { key, label: String(label).toUpperCase(), score, mod: formatMod(mod) };
      })
    : null;
  return {
    initiative: classDoc || speciesDoc ? formatMod(initiative) : null,
    speed: Number.isFinite(speed) && speed > 0 ? `${speed} ${speedUnits}` : null,
    profBonus: classDoc ? formatMod(profBonus) : null,
    hitDie: die ? `d${die}` : null,
    saves,
    senses,
    abilities: abilityRows
  };
}

/**
 * Format a modifier.
 * @param {number} n Modifier.
 * @returns {string} Display string.
 */
function formatMod(n) {
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : String(n);
}

/**
 * Walk a class doc's L1 Trait advancements and pull `saves:<ability>` grants.
 * @param {?object} classDoc Class document.
 * @returns {string[]} Ability keys (lowercase).
 */
function readSavesFromAdvancement(classDoc) {
  const out = [];
  for (const adv of classDoc?.system?.advancement ?? []) {
    const type = adv.type ?? adv.constructor?.typeName;
    if (type !== 'Trait') continue;
    if ((adv.level ?? adv.levels?.[0]) !== 1) continue;
    for (const grant of adv.configuration?.grants ?? []) if (typeof grant === 'string' && grant.startsWith('saves:')) out.push(grant.slice('saves:'.length).toLowerCase());
  }
  return out;
}

/**
 * Build a "Darkvision 60 ft, Tremorsense 30 ft" style sense summary.
 * @param {?object} speciesDoc Species doc.
 * @returns {?string} Summary, or null when species has no senses.
 */
function collectSenses(speciesDoc) {
  const senses = speciesDoc?.system?.senses;
  if (!senses) return null;
  const cfg = CONFIG.DND5E?.senses ?? {};
  const ranges = senses.ranges ?? senses;
  const out = [];
  for (const [key, entry] of Object.entries(cfg)) {
    const v = Number(ranges[key]) || 0;
    if (!v) continue;
    const label = (typeof entry === 'string' ? entry : entry?.label) ?? key;
    out.push(`${label} ${v} ${senses.units || 'ft'}`);
  }
  return out.length ? out.join(', ') : null;
}

/**
 * Build a snapshot from a committed actor (post-creation chat card path).
 * @param {Actor} actor Newly-created or existing actor.
 * @returns {object} HUD snapshot, same shape as `buildHudSnapshot`.
 */
export function buildHudSnapshotFromActor(actor) {
  const identity = identityFromActor(actor);
  const classes = buildActorClassRoster(actor);
  const totalLevel = classes.reduce((sum, c) => sum + c.level, 0) || Number(actor.system?.details?.level) || 0;
  const primary = classes[0] ?? null;
  const abilities = {};
  for (const [k, v] of Object.entries(actor.system.abilities)) abilities[k] = Number(v?.value) || 10;
  const stats = computeStats({ classDoc: primary?.classDoc, speciesDoc: identity.species, abilities, effectiveLevel: totalLevel || 1 });
  const init = Number(actor.system.attributes.init?.mod);
  if (Number.isFinite(init)) stats.initiative = formatMod(init);
  const prof = Number(actor.system.attributes.prof);
  if (Number.isFinite(prof)) stats.profBonus = formatMod(prof);
  return {
    name: actor.name.trim(),
    portraitImg: actor.img || DEFAULT_PORTRAIT,
    tokenImg: actor.prototypeToken?.texture?.src || actor.img || DEFAULT_PORTRAIT,
    classImg: primary?.img ?? null,
    classes,
    classLineText: formatClassLineText(classes),
    totalLevel,
    speciesName: identity.species?.name ?? null,
    backgroundName: identity.background?.name ?? null,
    hp: readActorHp(actor),
    ac: readActorAc(actor),
    currency: readActorCurrency(actor),
    stats,
    isEmpty: false
  };
}

/**
 * Pull the species + background items off a committed actor (single-doc each).
 * @param {Actor} actor Source actor.
 * @returns {{species:?Item, background:?Item}} Identity item map.
 */
function identityFromActor(actor) {
  const out = { species: null, background: null };
  for (const it of actor.items) {
    if (it.type === 'race' && !out.species) out.species = it;
    else if (it.type === 'background' && !out.background) out.background = it;
  }
  return out;
}

/**
 * Reorder a class-item list so the actor's `originalClass` (item id) is first.
 * @param {Array<object>} classItems Class items in iteration order.
 * @param {?string} originalId Actor's `system.details.originalClass` value.
 * @returns {Array<object>} Same array, mutated.
 */
function promoteOriginalClass(classItems, originalId) {
  if (!originalId) return classItems;
  const idx = classItems.findIndex((i) => i.id === originalId);
  if (idx > 0) classItems.unshift(...classItems.splice(idx, 1));
  return classItems;
}

/**
 * Build the class roster slot list off a committed actor; primary = `originalClass` match else iteration-first.
 * @param {Actor} actor Source actor.
 * @returns {Array<{slotId:string, name:string, level:number, subclassName:?string, img:?string, classDoc:?object, isPrimary:boolean}>} Roster slots.
 */
function buildActorClassRoster(actor) {
  const classItems = promoteOriginalClass(
    [...actor.items].filter((i) => i.type === 'class'),
    actor.system?.details?.originalClass ?? null
  );
  return classItems.map((item, idx) => ({
    slotId: item.id,
    name: item.name,
    level: Number(item.system?.levels) || 0,
    subclassName: actor.items.find((i) => i.type === 'subclass' && i.system?.classIdentifier === item.system?.identifier)?.name ?? null,
    img: item.img ?? null,
    classDoc: item,
    isPrimary: idx === 0
  }));
}

/**
 * Build the per-class roster slot list for the live HUD; delegates to creation/level-up branch.
 * @param {object} args Inputs.
 * @param {'creation'|'level_up'} args.mode Wizard mode.
 * @param {?object} args.actor Level-up target actor.
 * @param {object} args.shared Wizard `#shared` cache.
 * @returns {Array<{slotId:string, name:string, level:number, subclassName:?string, img:?string, classDoc:?object, isPrimary:boolean}>} Roster slots.
 */
function buildClassRoster({ mode, actor, shared }) {
  if (mode === 'level_up' && actor) return buildLevelUpRoster(actor, shared);
  return (shared.rosterDocs ?? [])
    .filter((d) => d.classDoc)
    .map((d, idx) => ({
      slotId: d.slotId,
      name: d.classDoc.name,
      level: Number(d.level) || 0,
      subclassName: d.subclassDoc?.name ?? null,
      img: d.classDoc.img ?? null,
      classDoc: d.classDoc,
      isPrimary: idx === 0
    }));
}

/**
 * Build the level-up HUD roster; existing classes at current level except the picked one (level + 1); multiclass picks append as level-1 slot.
 * @param {object} actor Target actor.
 * @param {object} shared Wizard `#shared` cache.
 * @returns {Array<{slotId:string, name:string, level:number, subclassName:?string, img:?string, classDoc:?object, isPrimary:boolean}>} Roster slots.
 */
function buildLevelUpRoster(actor, shared) {
  const pickedClassDoc = shared.classDoc ?? null;
  const pickedClassId = pickedClassDoc?.id ?? null;
  const pickedSubclassDoc = shared.subclassDocFromPick ?? null;
  const newLevel = Number(shared.effectiveLevel) || 1;
  const classItems = promoteOriginalClass(
    [...actor.items].filter((i) => i.type === 'class'),
    actor.system?.details?.originalClass ?? null
  );
  const slots = classItems.map((item) => {
    const isPicked = pickedClassId && item.id === pickedClassId;
    const liveSubclass = actor.items.find((i) => i.type === 'subclass' && i.system?.classIdentifier === item.system?.identifier);
    return {
      slotId: item.id,
      name: item.name,
      level: isPicked ? newLevel : Number(item.system?.levels) || 0,
      subclassName: (isPicked && pickedSubclassDoc?.name) || liveSubclass?.name || null,
      img: item.img ?? null,
      classDoc: item,
      isPrimary: false
    };
  });
  const isExistingPick = pickedClassDoc && classItems.some((i) => i.id === pickedClassId);
  if (pickedClassDoc && !isExistingPick) {
    slots.push({
      slotId: 'levelup-new',
      name: pickedClassDoc.name,
      level: newLevel,
      subclassName: pickedSubclassDoc?.name ?? null,
      img: pickedClassDoc.img ?? null,
      classDoc: pickedClassDoc,
      isPrimary: false
    });
  }
  if (slots.length) slots[0].isPrimary = true;
  return slots;
}

/**
 * Format the class-line display text. Single class: `[subclass ]<class>`. Multiclass: `[subclass ]<primary> (<lvl>) | [subclass ]<secondary> (<lvl>) | …` with secondaries sorted alphabetically by class name.
 * @param {Array<{name:string, level:number, subclassName:?string}>} classes Roster slots.
 * @returns {?string} Formatted line, or null when empty.
 */
function formatClassLineText(classes) {
  if (!classes.length) return null;
  const primary = classes[0];
  const secondaries = classes.slice(1).sort((a, b) => a.name.localeCompare(b.name));
  if (!secondaries.length) {
    const sub = primary.subclassName ? `${primary.subclassName} ` : '';
    return `${sub}${primary.name}`;
  }
  const fmt = (c) => `${c.subclassName ? `${c.subclassName} ` : ''}${c.name} (${c.level})`;
  return [primary, ...secondaries].map(fmt).join(' | ');
}

/**
 * Read current/max HP from a committed actor.
 * @param {Actor} actor Source actor.
 * @returns {{current:number, max:number, available:boolean}} HP snapshot.
 */
function readActorHp(actor) {
  const hp = actor.system.attributes.hp;
  const current = Number(hp.value) || 0;
  const max = Number(hp.max) || 0;
  return { current, max, available: max > 0 };
}

/**
 * Read AC from a committed actor (post-prep value computed by dnd5e).
 * @param {Actor} actor Source actor.
 * @returns {{value:?number, source:string}} AC snapshot.
 */
function readActorAc(actor) {
  const v = Number(actor.system.attributes.ac?.value);
  return Number.isFinite(v) ? { value: v, source: 'actor' } : { value: null, source: 'unknown' };
}

/**
 * Read currency from a committed actor as gp-equivalent (pp×10 + gp + ep×0.5 + sp×0.1 + cp×0.01).
 * @param {Actor} actor Source actor.
 * @returns {{gp:number, formatted:string, available:boolean}} Currency snapshot.
 */
function readActorCurrency(actor) {
  const c = actor.system.currency;
  const gp = (Number(c.pp) || 0) * 10 + (Number(c.gp) || 0) + (Number(c.ep) || 0) * 0.5 + (Number(c.sp) || 0) * 0.1 + (Number(c.cp) || 0) * 0.01;
  if (gp <= 0) return { gp: 0, formatted: '', available: false };
  const rounded = Math.round(gp * 100) / 100;
  const formatted = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  return { gp: rounded, formatted, available: true };
}

/**
 * Empty snapshot for the initial render.
 * @returns {object} Snapshot with placeholders.
 */
export function emptySnapshot() {
  return {
    name: '',
    portraitImg: DEFAULT_PORTRAIT,
    tokenImg: DEFAULT_PORTRAIT,
    classImg: null,
    classes: [],
    classLineText: null,
    totalLevel: 0,
    speciesName: null,
    backgroundName: null,
    hp: { current: 0, max: 0, available: false },
    ac: { value: null, source: 'unknown' },
    currency: { gp: 0, formatted: '—' },
    stats: { initiative: null, speed: null, profBonus: null, hitDie: null, saves: null, senses: null, abilities: null },
    isEmpty: true
  };
}

/**
 * Sum base ability score + ASI bonus per key.
 * @param {Object<string, number>} base Base ability map.
 * @param {Object<string, number>} bonus ASI bonus map (may be empty).
 * @returns {Object<string, number>} Combined map.
 */
function applyAsiBonus(base, bonus) {
  const out = { ...base };
  for (const [k, v] of Object.entries(bonus ?? {})) if (k in out) out[k] = (Number(out[k]) || 0) + (Number(v) || 0);
  return out;
}

/**
 * Resolve identity docs synchronously via fromUuidSync. Species + background are read from the live combobox values; class + subclass use the wizard's resolved primary doc when available.
 * @param {HTMLElement} root Wizard element.
 * @param {object} shared Wizard shared cache.
 * @param {?object} actor Level-up actor.
 * @returns {{class:?object, subclass:?object, species:?object, background:?object}} Identity doc map.
 */
function resolveIdentityDocs(root, shared, actor) {
  if (actor) {
    const identity = identityFromActor(actor);
    return { class: null, subclass: null, species: identity.species, background: identity.background };
  }
  const grab = (section) => {
    const cb = root.querySelector(`[data-combobox][data-name="identity.${section}"]`);
    const uuid = cb?.dataset.value;
    if (!uuid) return null;
    return fromUuidSync(uuid);
  };
  const primarySlotId = shared.roster?.[0]?.slotId;
  const primarySubclassUuid = primarySlotId ? root.querySelector(`[data-combobox][data-name="identity.classes.${primarySlotId}.subclassUuid"]`)?.dataset.value : null;
  const subclassDoc = shared.subclassDocFromPick ?? (primarySubclassUuid ? fromUuidSync(primarySubclassUuid) : null) ?? grab('subclass');
  return { class: shared.classDoc ?? grab('class'), subclass: subclassDoc, species: grab('species'), background: grab('background') };
}

/**
 * Read start-tab inputs from DOM.
 * @param {HTMLElement} root Wizard element.
 * @returns {object} Flat start values.
 */
function readStart(root) {
  const out = { characterName: '', characterArt: '', tokenArt: '', linkTokenArt: false };
  const nameInput = root.querySelector('[data-tab="start"] input[name="character-name"]');
  if (nameInput) out.characterName = nameInput.value;
  const art = root.querySelector('[data-tab="start"] input[name="character-art"]');
  if (art) out.characterArt = art.value;
  const tokenArt = root.querySelector('[data-tab="start"] input[name="token-art"]');
  if (tokenArt) out.tokenArt = tokenArt.value;
  const link = root.querySelector('[data-tab="start"] input[name="link-token-art"]');
  if (link) out.linkTokenArt = link.checked;
  return out;
}

/**
 * Read ability scores from abilities-tab hidden inputs (or actor in level-up).
 * @param {HTMLElement} root Wizard element.
 * @param {?object} actor Level-up actor.
 * @returns {Object<string, number>} Score map.
 */
function readAbilities(root, actor) {
  if (actor) {
    const out = {};
    for (const [k, v] of Object.entries(actor.system?.abilities ?? {})) out[k] = Number(v?.value) || 10;
    return out;
  }
  const out = {};
  for (const input of root.querySelectorAll('[data-ability-block] input[type="hidden"]')) {
    const name = input.name;
    if (!name?.startsWith('abilities.')) continue;
    const [, key, field] = name.split('.');
    if (field !== 'value') continue;
    out[key] = Number(input.value) || 10;
  }
  return out;
}

/**
 * Compute current/max HP. Level-up reads the live actor; creation reads the HP tab's rendered total so the HUD always matches the tab.
 * @param {object} args Inputs.
 * @param {HTMLElement} args.wizardElement Wizard root.
 * @param {?object} args.actor Level-up actor (null in creation).
 * @returns {{current:number, max:number, available:boolean}} HP snapshot.
 */
function computeHp({ wizardElement, actor }) {
  const total = Number(wizardElement?.querySelector('[data-hp-total] strong')?.textContent) || 0;
  if (actor) {
    const max = total > 0 ? total : Number(actor.system?.attributes?.hp?.max) || 0;
    return { current: Number(actor.system?.attributes?.hp?.value) || 0, max, available: max > 0 };
  }
  return { current: total, max: total, available: total > 0 };
}

/**
 * Compute AC via lean own-calc (base 10 + Dex, plus armor/shield from cart, plus barb/monk unarmored defense).
 * @param {object} args Inputs.
 * @param {HTMLElement} args.wizardElement Wizard root.
 * @param {?object} args.classDoc Class doc.
 * @param {Object<string, number>} args.abilities Ability score map.
 * @returns {{value:?number, source:string}} AC snapshot.
 */
function computeAc({ wizardElement, classDoc, abilities }) {
  const dexMod = Math.floor(((abilities.dex ?? 10) - 10) / 2);
  const conMod = Math.floor(((abilities.con ?? 10) - 10) / 2);
  const wisMod = Math.floor(((abilities.wis ?? 10) - 10) / 2);
  const { body, shield } = scanCartForArmor(wizardElement);
  const classId = classDoc?.system?.identifier;
  const abilitiesPicked = Object.values(abilities).some((v) => v !== 10 && v !== 0);
  if (!classDoc && !body && !shield && !abilitiesPicked) return { value: null, source: 'unknown' };
  if (body) {
    const dexCap = Number.isFinite(body.dex) ? body.dex : Infinity;
    const dexContrib = Math.min(dexMod, dexCap);
    return { value: body.value + dexContrib + (shield ? 2 : 0), source: 'armor' };
  }
  if (classId === 'barbarian') return { value: 10 + dexMod + conMod + (shield ? 2 : 0), source: 'unarmored-barb' };
  if (classId === 'monk' && !shield) return { value: 10 + dexMod + wisMod, source: 'unarmored-monk' };
  return { value: 10 + dexMod + (shield ? 2 : 0), source: 'unarmored' };
}

/**
 * Walk the shop cart hidden inputs + grant tile selections, return any armor + shield picked.
 * @param {HTMLElement} root Wizard root.
 * @returns {{body: ?{value:number, dex:?number}, shield: boolean}} Armor picks.
 */
function scanCartForArmor(root) {
  const uuids = new Set();
  for (const input of root.querySelectorAll('input[name^="equipment.shop.cart."]')) {
    const v = Number(input.value);
    if (v > 0) uuids.add(input.name.slice('equipment.shop.cart.'.length));
  }
  for (const tg of root.querySelectorAll('[data-equipment-tile-group]')) {
    const v = tg.dataset.value;
    if (!v) continue;
    for (const piece of v.split(',')) if (piece && !piece.includes(':')) uuids.add(piece);
  }
  for (const inp of root.querySelectorAll('[data-tab="equipment"] input[type="hidden"][data-and-picker]')) {
    const v = inp.value;
    if (v && !v.includes(':')) uuids.add(v);
  }
  const bodyTypes = new Set(Object.keys(CONFIG.DND5E?.armorTypes ?? {}).filter((t) => t !== 'shield' && t !== 'natural'));
  let body = null;
  let shield = false;
  for (const uuid of uuids) {
    let doc = getShopItem(uuid);
    if (!doc) {
      try {
        doc = fromUuidSync(uuid);
      } catch {
        doc = null;
      }
    }
    if (!doc) continue;
    const armor = doc.system?.armor;
    if (!armor) continue;
    if (armor.type === 'shield') {
      shield = true;
      continue;
    }
    if (bodyTypes.has(armor.type)) {
      const value = Number(armor.value) || 0;
      if (!body || value > body.value) body = { value, dex: armor.dex ?? null };
    }
  }
  return { body, shield };
}

/**
 * Read currency from the cached shop context.
 * @param {HTMLElement} _root Wizard root (unused; kept for signature parity).
 * @param {?object} shopContext Last-built shop context.
 * @returns {{gp:number, formatted:string, available:boolean}} Currency snapshot.
 */
function readCurrency(_root, shopContext) {
  if (shopContext && (shopContext.pool?.total > 0 || (shopContext.cart?.length ?? 0) > 0)) {
    const gp = Math.max(0, Math.round((Number(shopContext.remaining) || 0) * 100) / 100);
    const display = Number.isInteger(gp) ? String(gp) : gp.toFixed(2);
    return { gp, formatted: display, available: true };
  }
  return { gp: 0, formatted: '', available: false };
}
