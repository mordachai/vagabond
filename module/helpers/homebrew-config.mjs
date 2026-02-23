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
  // hp: formula for HP gained per level (evaluated × level = total base HP)
  // inventory: formula for total base inventory slots
  // Both use rollData keys: @might.total, @dexterity.total, @attributes.level.value, etc.
  derivations: {
    hp: '@might.total',
    inventory: '8 + @might.total',
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
    { key: 'piercing', label: 'Piercing', icon: 'fa-solid fa-bow-arrow' },
    { key: 'slashing', label: 'Slashing', icon: 'fa-regular fa-claw-marks' },
    { key: 'physical', label: 'Physical', icon: 'fa-solid fa-hand-back-fist' },
    { key: 'necrotic', label: 'Necrotic', icon: 'fa-solid fa-skull' },
    { key: 'psychic',  label: 'Psychic',  icon: 'fa-solid fa-brain' },
    { key: 'magical',  label: 'Magical',  icon: 'fa-solid fa-stars' },
    { key: 'healing',  label: 'Healing',  icon: 'fa-solid fa-heart' },
    { key: 'recover',  label: 'Recover',  icon: 'fa-solid fa-arrows-rotate' },
    { key: 'recharge', label: 'Recharge', icon: 'fa-solid fa-hourglass-half' },
  ],

  // --- Tab 7: Stat Cap (requires reload when changed) ---
  statCap: 7,

  // --- Tab 8: Advanced (runtime) ---
  multipliers: {
    trained: 2,
    untrained: 1,
  },
};

/**
 * Apply all runtime-safe homebrew overrides to CONFIG.VAGABOND.
 * Called during init (from loadHomebrewConfig) and after the settings app saves
 * to make runtime-only changes take effect immediately without a world reload.
 * @param {object} config - Fully-merged homebrew config object
 */
export function applyRuntimeHomebrewOverrides(config) {
  CONFIG.VAGABOND.homebrew = config;

  // --- Stats (requires reload to affect schema, but always update CONFIG for runtime access) ---
  CONFIG.VAGABOND.stats = Object.fromEntries(config.stats.map(s => [s.key, s.label]));
  CONFIG.VAGABOND.statAbbreviations = Object.fromEntries(config.stats.map(s => [s.key, s.abbreviation]));

  // --- Skills & Saves (requires reload to affect schema) ---
  CONFIG.VAGABOND.skills = Object.fromEntries(config.skills.map(s => [s.key, s.label]));
  CONFIG.VAGABOND.saves  = Object.fromEntries(config.saves.map(s => [s.key, s.label]));

  // --- Damage Types (runtime, no reload needed) ---
  const dtList = config.damageTypes;
  CONFIG.VAGABOND.damageTypes = Object.fromEntries(dtList.map(dt => [dt.key, dt.label]));
  CONFIG.VAGABOND.damageTypeIcons = {
    ...Object.fromEntries(dtList.map(dt => [dt.key, dt.icon])),
    // Material weakness icons are not part of the damage types homebrew config
    coldIron: 'fa-solid fa-square-i',
    silver: 'fa-solid fa-square-s',
  };
  CONFIG.VAGABOND.allWeaknessTypes = {
    ...CONFIG.VAGABOND.damageTypes,
    ...CONFIG.VAGABOND.materialWeaknesses,
  };
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
