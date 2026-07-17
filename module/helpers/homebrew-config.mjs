/**
 * Default homebrew configuration.
 * Replicates current system behavior exactly — nothing changes until a GM customizes.
 */
export const VAGABOND_HOMEBREW_DEFAULTS = {

  // --- Tab 1: Stats (requires reload when changed) ---
  stats: [
    { key: 'might',     label: 'Might',     abbreviation: 'MIT' },
    { key: 'dexterity', label: 'Dexterity', abbreviation: 'DEX' },
    { key: 'awareness', label: 'Awareness', abbreviation: 'AWR' },
    { key: 'reason',    label: 'Reason',    abbreviation: 'RSN' },
    { key: 'presence',  label: 'Presence',  abbreviation: 'PRS' },
    { key: 'luck',      label: 'Luck',      abbreviation: 'LUK' },
  ],

  // --- Tab 2: Skills & Saves (requires reload when changed) ---
  skills: [
    { key: 'arcana',      label: 'Arcana',      hint: 'Application and knowledge of magic.',                                                                                  stat: 'reason',    trainedMultiplier: 2 },
    { key: 'craft',       label: 'Craft',        hint: 'Your skill to appraise and make Items.',                                                                               stat: 'reason',    trainedMultiplier: 2 },
    { key: 'medicine',    label: 'Medicine',     hint: 'Education in non-magical healing.',                                                                                    stat: 'reason',    trainedMultiplier: 2 },
    { key: 'brawl',       label: 'Brawl',        hint: 'Exerting physical force. Used for Grapples, Shoves, and attacks with Brawl Weapons.',                                 stat: 'might',     trainedMultiplier: 2, isWeaponSkill: true, showInSkillsList: true },
    { key: 'finesse',     label: 'Finesse',      hint: 'Coordination and concealing your actions. Also used for thievery, and when attacking with Finesse Weapons.',           stat: 'dexterity', trainedMultiplier: 2, isWeaponSkill: true, showInSkillsList: true },
    { key: 'melee',       label: 'Melee',        hint: 'Attacking with melee weapons.',                                                                                        stat: 'might',     trainedMultiplier: 2, isWeaponSkill: true },
    { key: 'ranged',      label: 'Ranged',       hint: 'Attacking with ranged weapons.',                                                                                       stat: 'awareness', trainedMultiplier: 2, isWeaponSkill: true },
    { key: 'sneak',       label: 'Sneak',        hint: 'Concealing your location.',                                                                                            stat: 'dexterity', trainedMultiplier: 2 },
    { key: 'detect',      label: 'Detect',       hint: 'Reflexively sensing others.',                                                                                          stat: 'awareness', trainedMultiplier: 2 },
    { key: 'mysticism',   label: 'Mysticism',    hint: 'Understanding of the supernatural.',                                                                                   stat: 'awareness', trainedMultiplier: 2 },
    { key: 'survival',    label: 'Survival',     hint: 'Tracking and a knowledge of beasts, plants, and other aspects of nature.',                                            stat: 'awareness', trainedMultiplier: 2 },
    { key: 'influence',   label: 'Influence',    hint: 'Social ability of coercion, deception, or negotiation.',                                                               stat: 'presence',  trainedMultiplier: 2 },
    { key: 'leadership',  label: 'Leadership',   hint: 'Social motivation and diplomacy.',                                                                                     stat: 'presence',  trainedMultiplier: 2 },
    { key: 'performance', label: 'Performance',  hint: 'Cultural talent and ability to inspire awe.',                                                                          stat: 'presence',  trainedMultiplier: 2 },
  ],

  saves: [
    {
      key: 'reflex',
      label: 'Reflex',
      description: "Evade physical harm, such as explosions, quick traps, slipping grasp, and dragon's breath.",
      checkDie: '1d20',
      stat1: 'dexterity',
      stat2: 'awareness',
      baseValue: 20,
    },
    {
      key: 'endure',
      label: 'Endure',
      description: 'Withstand physical harm, such as poisons, extreme heat, restraints, and petrification.',
      checkDie: '1d20',
      stat1: 'might',
      stat2: 'might',
      baseValue: 20,
    },
    {
      key: 'will',
      label: 'Will',
      description: 'Resist mental harm, such as charms, dreadful terrors, psychic enthrallment, and your resolve.',
      checkDie: '1d20',
      stat1: 'reason',
      stat2: 'presence',
      baseValue: 20,
    },
  ],

  // --- Tab 3: Dice (runtime) ---
  dice: {
    baseCheck: '1d20',
    favorBonus: '1d6[favored]',
    hinderPenalty: '1d6[hindered]',
    spellBaseDamage: 'd6',
    skillDifficultyBase: 20,
    skillFormula: '@base - @stat * @mult - @bonus',
  },

  // --- Tab 4: Leveling (XP / questions: runtime; maxLevel: requires reload) ---
  leveling: {
    maxLevel: 10,
    xpQuestions: [
      { question: 'Did you complete a Quest?',                   xp: 1 },
      { question: 'Did you Fail and allow the Fail to resolve?', xp: 1 },
      { question: 'Did you pass a Hindered Check?',              xp: 1 },
      { question: 'Did you make a discovery?',                   xp: 1 },
      { question: 'Did you loot at least 50g of treasure?',      xp: 1 },
    ],
    // XP required to reach each level (matches 'normal' pacing: 5 × next level)
    xpTable: Array.from({ length: 9 }, (_, i) => ({ level: i + 2, xp: 5 * (i + 2) })),
  },

  // --- Tab 5: Derivations (runtime) ---
  // Formulas use rollData keys: @might.total, @dexterity.total, @attributes.level.value, etc.
  // speed/crawl/travel: crawl and travel may reference @speed.base which is resolved first.
  derivations: {
    hp: '@might.total',
    inventory: '8 + @might.total',
    speed: '25 + floor(max(0, @dexterity.total - 2) / 2) * 5',
    crawl: '@speed.base * 3',
    travel: 'floor(@speed.base / 5)',
    fatiguePCMax: 5,
    fatigueNPCMax: 5,
    luckStat: 'luck',
    statsLayout: 'progression',
  },

  // --- Tab 6: Damage Types (runtime) ---
  damageTypes: [
    { key: '-',        label: 'None',     icon: 'fa-solid fa-dot' },
    { key: 'acid',     label: 'Acid',     icon: 'fa-solid fa-chart-scatter-bubble' },
    { key: 'fire',     label: 'Fire',     icon: 'fa-solid fa-fire' },
    { key: 'shock',    label: 'Shock',    icon: 'fa-solid fa-bolt' },
    { key: 'poison',   label: 'Poison',   icon: 'fa-solid fa-flask-round-poison' },
    { key: 'cold',     label: 'Cold',     icon: 'fa-solid fa-snowflake' },
    { key: 'blunt',    label: 'Blunt',    icon: 'fa-solid fa-hammer' },
    { key: 'piercing', label: 'Piercing', icon: 'fa-solid fa-arrow-archery' },
    { key: 'slashing', label: 'Slashing', icon: 'fa-regular fa-claw-marks' },
    { key: 'physical', label: 'Physical', icon: 'fa-solid fa-hand-back-fist' },
    { key: 'necrotic', label: 'Necrotic', icon: 'fa-solid fa-skull' },
    { key: 'psychic',  label: 'Psychic',  icon: 'fa-solid fa-brain' },
    { key: 'magical',  label: 'Magical',  icon: 'fa-solid fa-stars' },
    { key: 'healing',  label: 'Healing',  icon: 'fa-solid fa-heart' },
    { key: 'recover',  label: 'Recover',  icon: 'fa-solid fa-arrows-rotate' },
    { key: 'recharge', label: 'Recharge', icon: 'fa-solid fa-hourglass-half' },
  ],

  // --- Tab 7: Stat Cap & Stat Arrays (requires reload when changed) ---
  statCap: 7,

  // Stat arrays offered in the character builder (each sub-array must have one value per stat).
  // Row index + 1 = the "roll" result (row 0 → roll 1, row 11 → roll 12, etc.).
  statArrays: [
    [5, 5, 5, 4, 4, 3],
    [5, 5, 5, 5, 3, 2],
    [6, 5, 4, 4, 4, 3],
    [6, 5, 5, 4, 3, 2],
    [6, 6, 4, 3, 3, 3],
    [6, 6, 4, 4, 3, 2],
    [6, 6, 5, 3, 2, 2],
    [7, 4, 4, 4, 4, 2],
    [7, 4, 4, 4, 3, 3],
    [7, 5, 4, 3, 3, 2],
    [7, 5, 5, 2, 2, 2],
    [7, 6, 4, 2, 2, 2],
  ],

  // --- Tab 4: Magic (runtime) ---
  magic: {
    deliveryTypes: [
      { key: 'aura',   label: 'Aura',   baseCost: 2, increaseCost: 1, baseRange: 10, increment: 5  },
      { key: 'cone',   label: 'Cone',   baseCost: 2, increaseCost: 2, baseRange: 15, increment: 5  },
      { key: 'cube',   label: 'Cube',   baseCost: 1, increaseCost: 1, baseRange: 5,  increment: 5  },
      { key: 'imbue',  label: 'Imbue',  baseCost: 0, increaseCost: 2, baseRange: 1,  increment: 1  },
      { key: 'glyph',  label: 'Glyph',  baseCost: 2, increaseCost: 0, baseRange: 5,  increment: 0  },
      { key: 'line',   label: 'Line',   baseCost: 2, increaseCost: 1, baseRange: 30, increment: 10 },
      { key: 'remote', label: 'Remote', baseCost: 0, increaseCost: 1, baseRange: 1,  increment: 1  },
      { key: 'sphere', label: 'Sphere', baseCost: 2, increaseCost: 1, baseRange: 5,  increment: 5  },
      { key: 'touch',  label: 'Touch',  baseCost: 0, increaseCost: 0, baseRange: 0,  increment: 0  },
    ],
  },

  // --- Tab 8: Advanced (runtime) ---
  multipliers: {
    trained: 2,
    untrained: 1,
  },

  // --- Tab 9: Terms (runtime) ---
  // Customise the display labels used throughout the sheets.
  // Leave a field as the default string to keep the original label.
  terms: {
    inventory:    'Inventory',
    magic:        'Magic',
    mana:         'Mana',
    maxMana:      'Max Mana',
    manaPerCast:  'Mana/Cast',
    castingSkill: 'Mana Skill',
    spells:       'Spells',
    luckTerm:     'Luck',
    poolTerm:     'Pool',
    wealth:       'Wealth',
    gold:         'Gold',
    silver:       'Silver',
    copper:       'Copper',
  },
};

/** PascalCase a homebrew key to match lang-file leaf keys (e.g. 'mysticism' -> 'Mysticism'). */
function toPascal(key) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Localize game.i18n path; returns null if the key has no translation (Foundry echoes the key back). */
function tryLocalize(path) {
  const localized = game.i18n.localize(path);
  return localized && localized !== path ? localized : null;
}

/** Canonical i18n key for each customizable term — used to localize untouched
 *  defaults and to recognize "term equals the localized default" as not-custom. */
const TERM_I18N = {
  inventory:    'VAGABOND.Actor.Tabs.Inventory',
  magic:        'VAGABOND.Actor.Tabs.Magic',
  mana:         'VAGABOND.Actor.Character.FIELDS.mana.current.label',
  maxMana:      'VAGABOND.Actor.Character.FIELDS.mana.max.label',
  manaPerCast:  'VAGABOND.Actor.Character.FIELDS.mana.castingMax.label',
  castingSkill: 'VAGABOND.UI.Labels.ManaSkill',
  spells:       'VAGABOND.Actor.Tabs.Spells',
  luckTerm:     'VAGABOND.UI.Sections.luckTerm',
  poolTerm:     'VAGABOND.UI.Sections.poolTerm',
  wealth:       'VAGABOND.UI.Sections.Wealth',
  gold:         'VAGABOND.Wealth.Gold',
  silver:       'VAGABOND.Wealth.Silver',
  copper:       'VAGABOND.Wealth.Copper',
};

/** Localized default for a term (lang-file text), falling back to the hardcoded English default. */
function localizedTermDefault(key) {
  return tryLocalize(TERM_I18N[key]) ?? VAGABOND_HOMEBREW_DEFAULTS.terms[key];
}

/** A term counts as GM-customized only if it differs from BOTH the English
 *  hardcoded default and the current language's localized default. */
function isCustomTerm(terms, key) {
  const v = terms?.[key];
  return !!v && v !== VAGABOND_HOMEBREW_DEFAULTS.terms[key] && v !== localizedTermDefault(key);
}

/**
 * Mutates label/hint/description fields on homebrew arrays in place, replacing them with the
 * client's localized text whenever the field still equals its hardcoded-English default — i.e.
 * the GM never customized it. Fields the GM DID edit are left untouched (their literal text wins).
 * This lets the untouched-by-default homebrew config still respect the active language.
 */
function localizeUntouchedDefaults(config) {
  const D = VAGABOND_HOMEBREW_DEFAULTS;

  for (const s of config.stats) {
    const def = D.stats.find(d => d.key === s.key);
    if (!def) continue;
    if (s.label === def.label) s.label = tryLocalize(`VAGABOND.Stat.${toPascal(s.key)}.long`) ?? s.label;
    if (s.abbreviation === def.abbreviation) s.abbreviation = tryLocalize(`VAGABOND.Stat.${toPascal(s.key)}.abbr`) ?? s.abbreviation;
  }

  for (const s of config.skills) {
    const def = D.skills.find(d => d.key === s.key);
    if (!def) continue;
    if (s.label === def.label) s.label = tryLocalize(`VAGABOND.Skills.${toPascal(s.key)}`) ?? s.label;
    if (s.hint === def.hint) s.hint = tryLocalize(`VAGABOND.SkillsHints.${toPascal(s.key)}`) ?? s.hint;
  }

  for (const s of config.saves) {
    const def = D.saves.find(d => d.key === s.key);
    if (!def) continue;
    if (s.label === def.label) s.label = tryLocalize(`VAGABOND.Saves.${toPascal(s.key)}.name`) ?? s.label;
    if (s.description === def.description) s.description = tryLocalize(`VAGABOND.Saves.${toPascal(s.key)}.description`) ?? s.description;
  }

  for (const dt of config.damageTypes) {
    const def = D.damageTypes.find(d => d.key === dt.key);
    if (!def) continue;
    if (dt.label === def.label) {
      const pascal = dt.key === '-' ? 'None' : toPascal(dt.key);
      dt.label = tryLocalize(`VAGABOND.DamageTypes.${pascal}`) ?? dt.label;
    }
  }

  for (const dl of (config.magic?.deliveryTypes ?? [])) {
    const def = D.magic.deliveryTypes.find(d => d.key === dl.key);
    if (!def) continue;
    if (dl.label === def.label) dl.label = tryLocalize(`VAGABOND.DeliveryTypes.${toPascal(dl.key)}.label`) ?? dl.label;
  }

  // Terms (read directly from CONFIG by templates, e.g. luck-pool widget labels)
  for (const key of Object.keys(TERM_I18N)) {
    if (config.terms?.[key] === D.terms[key]) config.terms[key] = localizedTermDefault(key);
  }
}

/**
 * Apply all runtime-safe homebrew overrides to CONFIG.VAGABOND.
 * Called during init (from loadHomebrewConfig) and again on i18nInit (after translations are
 * loaded, so untouched defaults can be localized) and after the settings app saves.
 * @param {object} config - Fully-merged homebrew config object
 */
export function applyRuntimeHomebrewOverrides(config) {
  localizeUntouchedDefaults(config);
  CONFIG.VAGABOND.homebrew = config;

  // --- Stats (requires reload to affect schema, but always update CONFIG for runtime access) ---
  CONFIG.VAGABOND.stats = Object.fromEntries(config.stats.map(s => [s.key, s.label]));
  CONFIG.VAGABOND.statAbbreviations = Object.fromEntries(config.stats.map(s => [s.key, s.abbreviation]));

  // --- Skills & Saves (requires reload to affect schema) ---
  CONFIG.VAGABOND.skills = Object.fromEntries(config.skills.map(s => [s.key, s.label]));
  CONFIG.VAGABOND.saves  = Object.fromEntries(config.saves.map(s => [s.key, s.label]));

  // --- Weapon Skills dropdown = all skills + all saves (runtime, no reload needed) ---
  CONFIG.VAGABOND.weaponSkills = {
    ...CONFIG.VAGABOND.skills,
    ...CONFIG.VAGABOND.saves,
  };

  // --- Damage Types (runtime, no reload needed) ---
  const dtList = config.damageTypes;
  CONFIG.VAGABOND.damageTypes = Object.fromEntries(dtList.map(dt => [dt.key, dt.label]));
  CONFIG.VAGABOND.damageTypeIcons = {
    ...Object.fromEntries(dtList.map(dt => [dt.key, dt.icon])),
    // Material weakness icons are not part of the damage types homebrew config —
    // single source lives in config.mjs (VAGABOND.materialWeaknessIcons).
    ...CONFIG.VAGABOND.materialWeaknessIcons,
  };
  CONFIG.VAGABOND.allWeaknessTypes = {
    ...CONFIG.VAGABOND.damageTypes,
    ...CONFIG.VAGABOND.materialWeaknesses,
  };

  // --- Magic: Delivery Types (runtime) ---
  if (config.magic?.deliveryTypes?.length) {
    // Preserve geometry metadata (unit/type) from static defaults — not user-configurable
    const DELIVERY_META = {
      aura:   { unit: 'foot',   type: 'radius' },
      cone:   { unit: 'foot',   type: 'length' },
      cube:   { unit: 'foot',   type: 'cube'   },
      imbue:  { unit: 'target', type: 'count'  },
      glyph:  { unit: 'foot',   type: 'square' },
      line:   { unit: 'foot',   type: 'length' },
      remote: { unit: 'target', type: 'count'  },
      sphere: { unit: 'foot',   type: 'radius' },
      touch:  { unit: null,     type: null      },
    };
    const dt = config.magic.deliveryTypes;
    CONFIG.VAGABOND.deliveryTypes        = Object.fromEntries(dt.map(d => [d.key, d.label]));
    CONFIG.VAGABOND.deliveryDefaults     = Object.fromEntries(dt.map(d => [d.key, { cost: d.baseCost }]));
    CONFIG.VAGABOND.deliveryIncreaseCost = Object.fromEntries(dt.map(d => [d.key, d.increaseCost]));
    CONFIG.VAGABOND.deliveryBaseRanges   = Object.fromEntries(dt.map(d => {
      const meta = DELIVERY_META[d.key] ?? { unit: 'foot', type: 'radius' };
      return [d.key, { value: d.baseRange || null, ...meta }];
    }));
    CONFIG.VAGABOND.deliveryIncrement    = Object.fromEntries(dt.map(d => [d.key, d.increment]));
  }
}

/**
 * Patch game.i18n.translations with any custom terms from homebrew config.
 * Must be called AFTER i18n is loaded (i18nInit hook or later).
 * Safe to call multiple times — only overrides keys whose term is non-empty.
 * @param {object} config - Fully-merged homebrew config object
 */
export function applyTermOverrides(config) {
  const terms = config?.terms;
  if (!terms || !game?.i18n?.translations) return;

  // isCustomTerm(): a term equal to the English hardcoded default OR the current
  // language's localized default was never customized by the GM — skip it so the
  // lang-file text isn't clobbered (and compound strings don't mix languages).

  // Traverse nested translations and set a value by dot-path.
  const set = (path, value) => {
    const parts = path.split('.');
    let cur = game.i18n.translations;
    for (let i = 0; i < parts.length - 1; i++) {
      cur = cur?.[parts[i]];
      if (!cur) return;
    }
    cur[parts[parts.length - 1]] = value;
  };

  if (isCustomTerm(terms, 'inventory')) {
    set('VAGABOND.Actor.Tabs.Inventory',          terms.inventory);
    set('VAGABOND.UI.Sections.Inventory',         terms.inventory);
    set('VAGABOND.ResourceTypes.InventorySlots',  `${terms.inventory} Slots`);
    set('VAGABOND.Actor.Party.Card.Slots',        `${terms.inventory} Slots`);
  }
  if (isCustomTerm(terms, 'magic')) {
    set('VAGABOND.Actor.Tabs.Magic',    terms.magic);
    set('VAGABOND.UI.Sections.Magic',   terms.magic);
  }
  if (isCustomTerm(terms, 'mana')) {
    set('VAGABOND.Actor.Character.FIELDS.mana.current.label', terms.mana);
    set('VAGABOND.Actor.Party.Card.Mana',                     terms.mana);
  }
  if (isCustomTerm(terms, 'maxMana')) {
    set('VAGABOND.Actor.Character.FIELDS.mana.max.label', terms.maxMana);
    set('VAGABOND.ResourceTypes.MaxMana',                 terms.maxMana);
  }
  if (isCustomTerm(terms, 'manaPerCast')) {
    set('VAGABOND.Actor.Character.FIELDS.mana.castingMax.label', terms.manaPerCast);
    set('VAGABOND.ResourceTypes.ManaPerCast',                    terms.manaPerCast);
    set('VAGABOND.Actor.Party.Card.ManaCast',                    terms.manaPerCast);
  }
  if (isCustomTerm(terms, 'castingSkill')) {
    set('VAGABOND.UI.Labels.ManaSkill',                           terms.castingSkill);
    set('VAGABOND.Actor.Character.FIELDS.manaSkill.label',        `${terms.castingSkill}:`);
  }
  if (isCustomTerm(terms, 'spells')) {
    set('VAGABOND.Actor.Tabs.Spells',         terms.spells);
    set('VAGABOND.UI.Sections.Spells',        terms.spells);
    set('VAGABOND.Actor.Party.Card.Spells',   terms.spells);
  }
  if (isCustomTerm(terms, 'wealth')) {
    set('VAGABOND.UI.Sections.Wealth',              terms.wealth);
    set('VAGABOND.ResourceTypes.Wealth',            `${terms.wealth} (in silver)`);
    set('VAGABOND.Actor.Party.Card.Wealth',         terms.wealth);
    set('VAGABOND.Actor.Party.Card.TotalWealth',    `Party Total ${terms.wealth}`);
  }
  if (isCustomTerm(terms, 'gold')) {
    set('VAGABOND.Wealth.Gold',          terms.gold);
    set('VAGABOND.Currency.Gold.long',   terms.gold);
  }
  if (isCustomTerm(terms, 'silver')) {
    set('VAGABOND.Wealth.Silver',          terms.silver);
    set('VAGABOND.Currency.Silver.long',   terms.silver);
  }
  if (isCustomTerm(terms, 'copper')) {
    set('VAGABOND.Wealth.Copper',          terms.copper);
    set('VAGABOND.Currency.Copper.long',   terms.copper);
  }
  const luckCustom = isCustomTerm(terms, 'luckTerm');
  const poolCustom = isCustomTerm(terms, 'poolTerm');
  if (luckCustom || poolCustom) {
    const luckTerm = luckCustom ? terms.luckTerm : localizedTermDefault('luckTerm');
    const poolTerm = poolCustom ? terms.poolTerm : localizedTermDefault('poolTerm');
    set('VAGABOND.UI.Sections.luckTerm',    luckTerm);
    set('VAGABOND.UI.Sections.poolTerm',    poolTerm);
    set('VAGABOND.UI.Sections.LuckPool',    `${luckTerm} ${poolTerm}`);
    set('VAGABOND.UI.Sections.CurrentLuck', `${luckTerm} ${poolTerm}`);
    set('VAGABOND.ResourceTypes.CurrentLuck', `${luckTerm} ${poolTerm}`);
    set('VAGABOND.Hints.LuckPool',          `Total ${luckTerm} points. Spend to gain Favor, reroll dice, or use Plot Armor.`);
    set('VAGABOND.Actor.Character.UI.LuckPool', `${luckTerm} ${poolTerm}`);
  }
}

/**
 * Load homebrew config from the world setting and store at CONFIG.VAGABOND.homebrew.
 * Must be called during the init hook, after CONFIG.VAGABOND is set and before DataModels register.
 */
export function loadHomebrewConfig() {
  let saved;
  try {
    saved = game.settings.get('vagabond', 'homebrewConfig');
  } catch (e) {
    saved = {};
  }

  // Deep-merge saved config on top of defaults so new keys introduced by updates get defaults
  const config = foundry.utils.mergeObject(
    foundry.utils.deepClone(VAGABOND_HOMEBREW_DEFAULTS),
    saved ?? {},
    { inplace: false, recursive: true }
  );

  applyRuntimeHomebrewOverrides(config);
}
