export const VAGABOND = {};

/**
 * Equipment types for items
 * @type {Object}
 */
VAGABOND.equipmentTypes = {
  'weapon': 'VAGABOND.EquipmentTypes.weapon',
  'armor': 'VAGABOND.EquipmentTypes.armor',
  'gear': 'VAGABOND.EquipmentTypes.gear',
  'alchemical': 'VAGABOND.EquipmentTypes.alchemical',
  'relic': 'VAGABOND.EquipmentTypes.relic',
  'container': 'VAGABOND.EquipmentTypes.container'
};

/**
 * Favor/Hinder states for rolls
 * @type {Object}
 */
VAGABOND.favorHinderStates = {
  'none': 'VAGABOND.FavorHinder.none',
  'favor': 'VAGABOND.FavorHinder.favor',
  'hinder': 'VAGABOND.FavorHinder.hinder'
};


//Default placeholder images
VAGABOND.actorTypeImages = {
  //character: "systems/vagabond/assets/default-character.svg",
  npc: "systems/vagabond/assets/ui/default-npc.svg"
};

/**
 * The set of Stats used within the Vagabond system.
 * @type {Object}
 */
VAGABOND.stats = {
  might: 'VAGABOND.Stat.Might.long',
  dexterity: 'VAGABOND.Stat.Dexterity.long',
  awareness: 'VAGABOND.Stat.Awareness.long',
  reason: 'VAGABOND.Stat.Reason.long',
  presence: 'VAGABOND.Stat.Presence.long',
  luck: 'VAGABOND.Stat.Luck.long',
};

VAGABOND.statAbbreviations = {
  might: 'VAGABOND.Stat.Might.abbr',
  dexterity: 'VAGABOND.Stat.Dexterity.abbr',
  awareness: 'VAGABOND.Stat.Awareness.abbr',
  reason: 'VAGABOND.Stat.Reason.abbr',
  presence: 'VAGABOND.Stat.Presence.abbr',
  luck: 'VAGABOND.Stat.Luck.abbr',
};

VAGABOND.skills = {
  arcana: "VAGABOND.Skills.Arcana",
  craft: "VAGABOND.Skills.Craft",
  medicine: "VAGABOND.Skills.Medicine",
  brawl: "VAGABOND.Skills.Brawl",
  finesse: "VAGABOND.Skills.Finesse",
  sneak: "VAGABOND.Skills.Sneak",
  detect: "VAGABOND.Skills.Detect",
  mysticism: "VAGABOND.Skills.Mysticism",
  survival: "VAGABOND.Skills.Survival",
  influence: "VAGABOND.Skills.Influence",
  leadership: "VAGABOND.Skills.Leadership",
  performance: "VAGABOND.Skills.Performance"
};

/**
 * Resource types for perk prerequisites
 * Used to define minimum resource requirements (e.g., "Must have 50 max mana")
 * @type {Object}
 */
VAGABOND.resourceTypes = {
  maxMana: "VAGABOND.ResourceTypes.MaxMana",
  manaPerCast: "VAGABOND.ResourceTypes.ManaPerCast",
  wealth: "VAGABOND.ResourceTypes.Wealth",
  inventorySlots: "VAGABOND.ResourceTypes.InventorySlots",
  speed: "VAGABOND.ResourceTypes.Speed",
  maxHP: "VAGABOND.ResourceTypes.MaxHP",
  currentLuck: "VAGABOND.ResourceTypes.CurrentLuck"
};

/**
 * Size categories for actors
 * @type {Object}
 */
VAGABOND.sizes = {
  'small': 'VAGABOND.Sizes.small',
  'medium': 'VAGABOND.Sizes.medium',
  'large': 'VAGABOND.Sizes.large',
  'huge': 'VAGABOND.Sizes.huge',
  'giant': 'VAGABOND.Sizes.giant',
  'colossal': 'VAGABOND.Sizes.colossal'
};

/**
 * Being types for NPCs and ancestry items
 * @type {Object}
 */
VAGABOND.beingTypes = {
  'Humanlike': 'VAGABOND.BeingTypes.Humanlike',
  'Fae': 'VAGABOND.BeingTypes.Fae',
  'Cryptid': 'VAGABOND.BeingTypes.Cryptid',
  'Artificials': 'VAGABOND.BeingTypes.Artificials',
  'Beasts': 'VAGABOND.BeingTypes.Beasts',
  'Outers': 'VAGABOND.BeingTypes.Outers',
  'Primordials': 'VAGABOND.BeingTypes.Primordials',
  'Undead': 'VAGABOND.BeingTypes.Undead'
};

/**
 * Progress Clock configurations
 * @type {Object}
 */
VAGABOND.clockSizes = {
  'S': 75,
  'M': 100,
  'L': 150
};

VAGABOND.clockPositions = {
  'top-right': 'VAGABOND.ProgressClock.Position.TopRight',
  'top-left': 'VAGABOND.ProgressClock.Position.TopLeft',
  'bottom-right': 'VAGABOND.ProgressClock.Position.BottomRight',
  'bottom-left': 'VAGABOND.ProgressClock.Position.BottomLeft'
};

VAGABOND.clockSegments = [4, 6, 8, 10, 12];

/**
 * Lodging expenses for Rest downtime activity
 * Cost is in silver pieces per day
 * @type {Object}
 */
VAGABOND.lodgingExpenses = {
  'none': { label: 'No Lodging', cost: 0 },
  'horrible': { label: 'Horrible', cost: 1 },
  'poor': { label: 'Poor', cost: 2 },
  'modest': { label: 'Modest', cost: 10 },
  'comfortable': { label: 'Comfortable', cost: 20 },
  'luxury': { label: 'Luxury', cost: 40 },
  'opulent': { label: 'Opulent', cost: 100 } // 1g = 100s
};

/**
 * Saves againts damage of spells, weapons, and attacks
 * Universal list used across the entire system
 * @type {Object}
 */
VAGABOND.saves = {
  'reflex': 'VAGABOND.Saves.Reflex.name',
  'endure': 'VAGABOND.Saves.Endure.name',
  'will': 'VAGABOND.Saves.Will.name'
};

/**
 * Damage types for spells, weapons, and attacks
 * Universal list used across the entire system
 * @type {Object}
 */
VAGABOND.damageTypes = {
  '-': 'VAGABOND.DamageTypes.None',
  'acid': 'VAGABOND.DamageTypes.Acid',
  'fire': 'VAGABOND.DamageTypes.Fire',
  'shock': 'VAGABOND.DamageTypes.Shock',
  'poison': 'VAGABOND.DamageTypes.Poison',
  'cold': 'VAGABOND.DamageTypes.Cold',
  'blunt': 'VAGABOND.DamageTypes.Blunt',
  'piercing': 'VAGABOND.DamageTypes.Piercing',
  'slashing': 'VAGABOND.DamageTypes.Slashing',
  'physical': 'VAGABOND.DamageTypes.Physical',
  'necrotic': 'VAGABOND.DamageTypes.Necrotic',
  'psychic': 'VAGABOND.DamageTypes.Psychic',
  'magical': 'VAGABOND.DamageTypes.Magical',
  'healing': 'VAGABOND.DamageTypes.Healing',
  'recover': 'VAGABOND.DamageTypes.Recover',
  'recharge': 'VAGABOND.DamageTypes.Recharge'
};

/**
 * Material weaknesses - special metals that can trigger weakness
 * These are checked against weapon.system.metal during damage calculation
 * @type {Object}
 */
VAGABOND.materialWeaknesses = {
  'coldIron': 'VAGABOND.MaterialWeaknesses.ColdIron',
  'silver': 'VAGABOND.MaterialWeaknesses.Silver'
};

/**
 * All weakness types (damage types + material weaknesses combined)
 * Used in UI for weakness selection dropdowns
 * @type {Object}
 */
VAGABOND.allWeaknessTypes = {
  ...VAGABOND.damageTypes,
  ...VAGABOND.materialWeaknesses
};

/**
 * Status conditions for NPC immunities
 * @type {Object}
 */
VAGABOND.statusConditions = {
  'berserk': 'VAGABOND.StatusConditions.Berserk',
  'blinded': 'VAGABOND.StatusConditions.Blinded',
  'burning': 'VAGABOND.StatusConditions.Burning',
  'charmed': 'VAGABOND.StatusConditions.Charmed',
  'confused': 'VAGABOND.StatusConditions.Confused',
  'dazed': 'VAGABOND.StatusConditions.Dazed',
  'fatigued': 'VAGABOND.StatusConditions.Fatigued',
  'frightened': 'VAGABOND.StatusConditions.Frightened',
  'incapacitated': 'VAGABOND.StatusConditions.Incapacitated',
  'invisible': 'VAGABOND.StatusConditions.Invisible',
  'paralyzed': 'VAGABOND.StatusConditions.Paralyzed',
  'prone': 'VAGABOND.StatusConditions.Prone',
  'restrained': 'VAGABOND.StatusConditions.Restrained',
  'sickened': 'VAGABOND.StatusConditions.Sickened',
  'suffocating': 'VAGABOND.StatusConditions.Suffocating',
  'unconscious': 'VAGABOND.StatusConditions.Unconscious',
  'vulnerable': 'VAGABOND.StatusConditions.Vulnerable'
};

/**
 * Full status effect definitions for token HUD
 * Used when "Use Vagabond Status Conditions" setting is enabled
 * Uses Foundry's default icons as placeholders until custom artwork is provided
 * All 17 status conditions from the Vagabond rulebook (see docs/VAGABOND-STATUSES.md)
 *
 * AUTOMATED STATUS CONDITIONS:
 * Status effects with "changes" arrays automatically apply Active Effects when applied to tokens.
 * These implement the mechanical effects of the status condition using the Active Effects system.
 *
 * @type {Array}
 */
VAGABOND.statusEffectDefinitions = [
  // MANUAL TRACKING (Phase 3 - Future)
  {
    id: 'berserk',
    name: 'VAGABOND.StatusConditions.Berserk',
    icon: 'icons/svg/terror.svg',
    statuses: ['berserk'],
    description: 'Can\'t take Cast Action or Focus. Doesn\'t make Morale Checks. Can\'t be Frightened. [MANUAL TRACKING]'
  },
  {
    id: 'burning',
    name: 'VAGABOND.StatusConditions.Burning',
    icon: 'icons/svg/fire.svg',
    statuses: ['burning'],
    description: 'Takes damage at the start of its turn. Can be ended by an appropriate action. [MANUAL TRACKING]'
  },
  {
    id: 'charmed',
    name: 'VAGABOND.StatusConditions.Charmed',
    icon: 'icons/svg/heal.svg',
    statuses: ['charmed'],
    description: 'Can\'t willingly make an Attack Action targeting the one who Charmed it. [MANUAL TRACKING]'
  },
  {
    id: 'suffocating',
    name: 'VAGABOND.StatusConditions.Suffocating',
    icon: 'icons/svg/stoned.svg',
    statuses: ['suffocating'],
    description: 'After not breathing for 1 minute, each round: Heroes roll d8 (if ≥ Might, gain 1 Fatigue), Enemies gain 1 Fatigue. [MANUAL TRACKING]'
  },

  // PARTIAL AUTOMATION
  {
    id: 'dazed',
    name: 'VAGABOND.StatusConditions.Dazed',
    icon: 'icons/svg/sleep.svg',
    statuses: ['dazed'],
    description: 'Can\'t Focus or Move unless it uses an Action to do so. Speed reduced to 0. [AUTOMATED: Speed = 0. MANUAL: Action restrictions]',
    changes: [
      {
        key: 'system.speed.bonus',
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: '-999'
      }
    ]
  },
  {
    id: 'fatigued',
    name: 'VAGABOND.StatusConditions.Fatigued',
    icon: 'icons/svg/degen.svg',
    statuses: ['fatigued'],
    description: 'Each Fatigue occupies an Item Slot. At 3+ Fatigue, can\'t Rush. At 5 Fatigue, dies. [AUTOMATED: Use Fatigue tracker (skull icons) on character sheet. Slot reduction is automatic.]'
    // NOTE: Fatigued is managed via system.fatigue value, not Active Effects
  },
  {
    id: 'prone',
    name: 'VAGABOND.StatusConditions.Prone',
    icon: 'icons/svg/falling.svg',
    statuses: ['prone'],
    description: 'Speed = 0. Costs 10\' Speed to stand. Can crawl (2:1 ratio). Can\'t Rush. Vulnerable (attacks/saves Hindered, incoming attacks Favored). [AUTOMATED: Speed = 0, Vulnerable. MANUAL: Stand cost, crawl ratio]',
    changes: [
      {
        key: 'system.speed.bonus',
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: '-999'
      },
      {
        key: 'system.favorHinder',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'hinder'
      },
      {
        key: 'system.incomingAttacksModifier',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'favor'
      },
      {
        key: 'system.outgoingSavesModifier',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'favor'
      }
    ]
  },

  // FULLY AUTOMATED
  {
    id: 'frightened',
    name: 'VAGABOND.StatusConditions.Frightened',
    icon: 'icons/svg/hazard.svg',
    statuses: ['frightened'],
    description: '-2 penalty to all damage dealt. [FULLY AUTOMATED]',
    changes: [
      {
        key: 'system.universalDamageBonus',
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: '-2'
      }
    ]
  },
  {
    id: 'sickened',
    name: 'VAGABOND.StatusConditions.Sickened',
    icon: 'icons/svg/poison.svg',
    statuses: ['sickened'],
    description: '-2 penalty to any healing received. [FULLY AUTOMATED]',
    changes: [
      {
        key: 'system.incomingHealingModifier',
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: '-2'
      }
    ]
  },
  {
    id: 'confused',
    name: 'VAGABOND.StatusConditions.Confused',
    icon: 'icons/svg/daze.svg',
    statuses: ['confused'],
    description: 'Checks and Saves have Hinder. Saves against its Actions have Favor. [FULLY AUTOMATED]',
    changes: [
      {
        key: 'system.favorHinder',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'hinder'
      },
      {
        key: 'system.outgoingSavesModifier',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'favor'
      }
    ]
  },
  {
    id: 'vulnerable',
    name: 'VAGABOND.StatusConditions.Vulnerable',
    icon: 'icons/svg/downgrade.svg',
    statuses: ['vulnerable'],
    description: 'Its attacks and saves have Hinder. Attacks targeting it have Favor. Saves against its attacks have Favor. [FULLY AUTOMATED]',
    changes: [
      {
        key: 'system.favorHinder',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'hinder'
      },
      {
        key: 'system.incomingAttacksModifier',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'favor'
      },
      {
        key: 'system.outgoingSavesModifier',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'favor'
      }
    ]
  },
  {
    id: 'blinded',
    name: 'VAGABOND.StatusConditions.Blinded',
    icon: 'icons/svg/blind.svg',
    statuses: ['blinded'],
    description: 'Can\'t see. Vulnerable. [FULLY AUTOMATED]',
    changes: [
      // Same as Vulnerable
      {
        key: 'system.favorHinder',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'hinder'
      },
      {
        key: 'system.incomingAttacksModifier',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'favor'
      },
      {
        key: 'system.outgoingSavesModifier',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'favor'
      }
    ]
  },
  {
    id: 'invisible',
    name: 'VAGABOND.StatusConditions.Invisible',
    icon: 'icons/svg/invisible.svg',
    statuses: ['invisible'],
    description: 'Can\'t be seen. Attackers act as Blinded (attacks Hindered). [FULLY AUTOMATED]',
    changes: [
      {
        key: 'system.defenderStatusModifiers.attackersAreBlinded',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'true' // Note: Must be string for Active Effects
      }
    ]
  },
  {
    id: 'restrained',
    name: 'VAGABOND.StatusConditions.Restrained',
    icon: 'icons/svg/net.svg',
    statuses: ['restrained'],
    description: 'Vulnerable + Speed = 0. [FULLY AUTOMATED]',
    changes: [
      // Vulnerable + Speed = 0
      {
        key: 'system.speed.bonus',
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: '-999'
      },
      {
        key: 'system.favorHinder',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'hinder'
      },
      {
        key: 'system.incomingAttacksModifier',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'favor'
      },
      {
        key: 'system.outgoingSavesModifier',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'favor'
      }
    ]
  },
  {
    id: 'incapacitated',
    name: 'VAGABOND.StatusConditions.Incapacitated',
    icon: 'icons/svg/unconscious.svg',
    statuses: ['incapacitated'],
    description: 'Can\'t Focus, use Actions, or Move. Automatically fails Might and Dexterity checks. Vulnerable. Speed = 0. [FULLY AUTOMATED]',
    changes: [
      // Auto-fail Might/Dex
      {
        key: 'system.autoFailStats',
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 'might'
      },
      {
        key: 'system.autoFailStats',
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 'dexterity'
      },
      // Speed = 0
      {
        key: 'system.speed.bonus',
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: '-999'
      },
      // Vulnerable effects
      {
        key: 'system.favorHinder',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'hinder'
      },
      {
        key: 'system.incomingAttacksModifier',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'favor'
      },
      {
        key: 'system.outgoingSavesModifier',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'favor'
      }
    ]
  },
  {
    id: 'paralyzed',
    name: 'VAGABOND.StatusConditions.Paralyzed',
    icon: 'icons/svg/paralysis.svg',
    statuses: ['paralyzed'],
    description: 'Incapacitated + Speed = 0. [FULLY AUTOMATED]',
    changes: [
      // Same as Incapacitated (already includes Speed = 0)
      {
        key: 'system.autoFailStats',
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 'might'
      },
      {
        key: 'system.autoFailStats',
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 'dexterity'
      },
      {
        key: 'system.speed.bonus',
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: '-999'
      },
      {
        key: 'system.favorHinder',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'hinder'
      },
      {
        key: 'system.incomingAttacksModifier',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'favor'
      },
      {
        key: 'system.outgoingSavesModifier',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'favor'
      }
    ]
  },
  {
    id: 'unconscious',
    name: 'VAGABOND.StatusConditions.Unconscious',
    icon: 'icons/svg/sleep.svg',
    statuses: ['unconscious'],
    description: 'Blinded + Incapacitated + Prone. Close Attacks (range: close) always Crit. [FULLY AUTOMATED]',
    changes: [
      // All Incapacitated effects
      {
        key: 'system.autoFailStats',
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 'might'
      },
      {
        key: 'system.autoFailStats',
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: 'dexterity'
      },
      {
        key: 'system.speed.bonus',
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: '-999'
      },
      {
        key: 'system.favorHinder',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'hinder'
      },
      {
        key: 'system.incomingAttacksModifier',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'favor'
      },
      {
        key: 'system.outgoingSavesModifier',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'favor'
      },
      // Plus: Close attacks auto-crit
      {
        key: 'system.defenderStatusModifiers.closeAttacksAutoCrit',
        mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
        value: 'true' // Note: Must be string for Active Effects
      }
    ]
  }
];

/**
 * Combat zones for NPCs
 * @type {Object}
 */
VAGABOND.combatZones = {
  'frontline': 'VAGABOND.CombatZones.Frontline',
  'midline': 'VAGABOND.CombatZones.Midline',
  'backline': 'VAGABOND.CombatZones.Backline'
};

/**
 * Spell delivery types
 * @type {Object}
 */
VAGABOND.deliveryTypes = {
  'aura': 'VAGABOND.DeliveryTypes.Aura.label',
  'cone': 'VAGABOND.DeliveryTypes.Cone.label',
  'cube': 'VAGABOND.DeliveryTypes.Cube.label',
  'imbue': 'VAGABOND.DeliveryTypes.Imbue.label',
  'glyph': 'VAGABOND.DeliveryTypes.Glyph.label',
  'line': 'VAGABOND.DeliveryTypes.Line.label',
  'remote': 'VAGABOND.DeliveryTypes.Remote.label',
  'sphere': 'VAGABOND.DeliveryTypes.Sphere.label',
  'touch': 'VAGABOND.DeliveryTypes.Touch.label'
};

/**
 * Spell delivery type hints (increase descriptions)
 * @type {Object}
 */
VAGABOND.deliveryTypeHints = {
  'aura': 'VAGABOND.DeliveryTypes.Aura.hint',
  'cone': 'VAGABOND.DeliveryTypes.Cone.hint',
  'cube': 'VAGABOND.DeliveryTypes.Cube.hint',
  'imbue': 'VAGABOND.DeliveryTypes.Imbue.hint',
  'glyph': 'VAGABOND.DeliveryTypes.Glyph.hint',
  'line': 'VAGABOND.DeliveryTypes.Line.hint',
  'remote': 'VAGABOND.DeliveryTypes.Remote.hint',
  'sphere': 'VAGABOND.DeliveryTypes.Sphere.hint',
  'touch': 'VAGABOND.DeliveryTypes.Touch.hint'
};

/**
 * Default delivery data by type
 * @type {Object}
 */
VAGABOND.deliveryDefaults = {
  'aura': { cost: 2 },
  'cone': { cost: 2 },
  'cube': { cost: 1 },
  'imbue': { cost: 0 },
  'glyph': { cost: 2 },
  'line': { cost: 2 },
  'remote': { cost: 0 },
  'sphere': { cost: 2 },
  'touch': { cost: 0 }
};

/**
 * Numeric mana cost per delivery increase
 * @type {Object}
 */
VAGABOND.deliveryIncreaseCost = {
  'aura': 1,
  'cone': 2,
  'cube': 1,
  'imbue': 2,
  'glyph': 0,
  'line': 1,
  'remote': 1,
  'sphere': 1,
  'touch': 0
};

/**
 * Base sizes/ranges for delivery types (in feet)
 * NOTE: These are stored in feet and can be converted to grid units later (5 feet = 1 grid)
 * @type {Object}
 */
VAGABOND.deliveryBaseRanges = {
  'aura': { value: 10, unit: 'foot', type: 'radius' },
  'cone': { value: 15, unit: 'foot', type: 'length' },
  'cube': { value: 5, unit: 'foot', type: 'cube' },
  'imbue': { value: 1, unit: 'target', type: 'count' },
  'glyph': { value: 5, unit: 'foot', type: 'square' },
  'line': { value: 30, unit: 'foot', type: 'length' },
  'remote': { value: 1, unit: 'target', type: 'count' },
  'sphere': { value: 5, unit: 'foot', type: 'radius' },
  'touch': { value: null, unit: null, type: null }
};

/**
 * Increment amounts for delivery increases (in feet or targets)
 * NOTE: Store in feet for future grid conversion (5 feet = 1 grid)
 * @type {Object}
 */
VAGABOND.deliveryIncrement = {
  'aura': 5,
  'cone': 5,
  'cube': 5,
  'imbue': 1,
  'glyph': 0,
  'line': 10,
  'remote': 1,
  'sphere': 5,
  'touch': 0
};

/**
 * Weapon skill types
 * @type {Object}
 */
VAGABOND.weaponSkills = {
'melee': 'VAGABOND.WeaponSkills.Melee',
'brawl': 'VAGABOND.WeaponSkills.Brawl',
'finesse': 'VAGABOND.WeaponSkills.Finesse',
'ranged': 'VAGABOND.WeaponSkills.Ranged',
'arcana': 'VAGABOND.Skills.Arcana',
'craft': 'VAGABOND.Skills.Craft',
'medicine': 'VAGABOND.Skills.Medicine',
'sneak': 'VAGABOND.Skills.Sneak',
'detect': 'VAGABOND.Skills.Detect',
'mysticism': 'VAGABOND.Skills.Mysticism',
'survival': 'VAGABOND.Skills.Survival',
'influence': 'VAGABOND.Skills.Influence',
'leadership': 'VAGABOND.Skills.Leadership',
'performance': 'VAGABOND.Skills.Performance',
'reflex': 'VAGABOND.Saves.Reflex.name',
'endure': 'VAGABOND.Saves.Endure.name',
'will': 'VAGABOND.Saves.Will.name',
};

/**
 * Font Awesome icon classes for weapon skills
 * @type {Object}
 */
VAGABOND.weaponSkillIcons = {
  'melee': 'fa-solid fa-sword',
  'ranged': 'fa-solid fa-bow-arrow',
  'brawl': 'fa-solid fa-hand-back-fist',
  'finesse': 'fa-solid fa-dagger'
};

/**
 * Weapon range options
 * @type {Object}
 */
VAGABOND.weaponRanges = {
  'close': 'VAGABOND.Weapon.Range.Close',
  'near': 'VAGABOND.Weapon.Range.Near',
  'far': 'VAGABOND.Weapon.Range.Far'
};

/**
 * Range abbreviations for display
 * @type {Object}
 */
VAGABOND.rangeAbbreviations = {
  'close': 'VAGABOND.Weapon.Range.CloseAbbr',
  'near': 'VAGABOND.Weapon.Range.NearAbbr',
  'far': 'VAGABOND.Weapon.Range.FarAbbr'
};

/**
 * Weapon grip types
 * @type {Object}
 */
VAGABOND.grip = {
  '1H': 'VAGABOND.Weapon.Grip.1H',
  '2H': 'VAGABOND.Weapon.Grip.2H',
  'F': 'VAGABOND.Weapon.Grip.F',
  'V': 'VAGABOND.Weapon.Grip.V'
};

/**
 * Weapon grip descriptions
 * @type {Object}
 */
VAGABOND.weaponGripDescriptions = {
  '1H': 'VAGABOND.Weapon.GripDescriptions.1H',
  '2H': 'VAGABOND.Weapon.GripDescriptions.2H',
  'F': 'VAGABOND.Weapon.GripDescriptions.F',
  'V': 'VAGABOND.Weapon.GripDescriptions.V'
};

/**
 * Weapon properties and their descriptions
 * @type {Object}
 */
VAGABOND.weaponProperties = {
  'Brawl': 'VAGABOND.Weapon.Property.Brawl',
  'Brutal': 'VAGABOND.Weapon.Property.Brutal',
  'Cleave': 'VAGABOND.Weapon.Property.Cleave',
  'Entangle': 'VAGABOND.Weapon.Property.Entangle',
  'Finesse': 'VAGABOND.Weapon.Property.Finesse',
  'Keen': 'VAGABOND.Weapon.Property.Keen',
  'Long': 'VAGABOND.Weapon.Property.Long',
  'Near': 'VAGABOND.Weapon.Property.Near',
  'Ranged': 'VAGABOND.Weapon.Property.Ranged',
  'Shield': 'VAGABOND.Weapon.Property.Shield',
  'Thrown': 'VAGABOND.Weapon.Property.Thrown'
};

/**
 * Weapon property hints/descriptions
 * @type {Object}
 */
VAGABOND.weaponPropertyHints = {
  'Brawl': 'VAGABOND.Weapon.PropertyHints.Brawl',
  'Brutal': 'VAGABOND.Weapon.PropertyHints.Brutal',
  'Cleave': 'VAGABOND.Weapon.PropertyHints.Cleave',
  'Entangle': 'VAGABOND.Weapon.PropertyHints.Entangle',
  'Finesse': 'VAGABOND.Weapon.PropertyHints.Finesse',
  'Keen': 'VAGABOND.Weapon.PropertyHints.Keen',
  'Long': 'VAGABOND.Weapon.PropertyHints.Long',
  'Near': 'VAGABOND.Weapon.PropertyHints.Near',
  'Ranged': 'VAGABOND.Weapon.PropertyHints.Ranged',
  'Shield': 'VAGABOND.Weapon.PropertyHints.Shield',
  'Thrown': 'VAGABOND.Weapon.PropertyHints.Thrown'
};

/**
 * Alchemical item types
 * @type {Object}
 */
VAGABOND.alchemicalTypes = {
  'acid': 'VAGABOND.Item.Alchemical.Types.Acid',
  'concoction': 'VAGABOND.Item.Alchemical.Types.Concoction',
  'explosive': 'VAGABOND.Item.Alchemical.Types.Explosive',
  'oil': 'VAGABOND.Item.Alchemical.Types.Oil',
  'poison': 'VAGABOND.Item.Alchemical.Types.Poison',
  'potion': 'VAGABOND.Item.Alchemical.Types.Potion',
  'torch': 'VAGABOND.Item.Alchemical.Types.Torch'
};

/**
 * Alchemical type tooltips
 * @type {Object}
 */
VAGABOND.alchemicalTypeHints = {
  'acid': 'VAGABOND.Item.Alchemical.TypeHints.Acid',
  'concoction': 'VAGABOND.Item.Alchemical.TypeHints.Concoction',
  'explosive': 'VAGABOND.Item.Alchemical.TypeHints.Explosive',
  'oil': 'VAGABOND.Item.Alchemical.TypeHints.Oil',
  'poison': 'VAGABOND.Item.Alchemical.TypeHints.Poison',
  'potion': 'VAGABOND.Item.Alchemical.TypeHints.Potion',
  'torch': 'VAGABOND.Item.Alchemical.TypeHints.Torch'
};

/**
 * Armor types
 * @type {Object}
 */
VAGABOND.armorTypes = {
  'light': 'VAGABOND.Armor.Type.Light',
  'medium': 'VAGABOND.Armor.Type.Medium',
  'heavy': 'VAGABOND.Armor.Type.Heavy'
};

/**
 * Armor type descriptions
 * @type {Object}
 */
VAGABOND.armorTypeDescriptions = {
  'light': 'Light: Rating 1, Might 3, 2 Slot',
  'medium': 'Medium: Rating 2, Might 4, 2 Slots',
  'heavy': 'Heavy: Rating 3, Might 5, 3 Slots'
};

/**
 * Metal types for weapons and armor
 * @type {Object}
 */
VAGABOND.metalTypes = {
  'common': 'VAGABOND.Metal.Common',
  'adamant': 'VAGABOND.Metal.Adamant',
  'coldIron': 'VAGABOND.Metal.ColdIron',
  'silver': 'VAGABOND.Metal.Silver',
  'mythral': 'VAGABOND.Metal.Mythral',
  'orichalcum': 'VAGABOND.Metal.Orichalcum'
};

/**
 * Metal type multipliers and effects
 * @type {Object}
 */
VAGABOND.metalData = {
  'common': { multiplier: 1, effect: 'VAGABOND.MetalDescriptions.Common' },
  'adamant': { multiplier: 50, effect: 'VAGABOND.MetalDescriptions.Adamant' },
  'coldIron': { multiplier: 20, effect: 'VAGABOND.MetalDescriptions.ColdIron' },
  'silver': { multiplier: 10, effect: 'VAGABOND.MetalDescriptions.Silver' },
  'mythral': { multiplier: 50, effect: 'VAGABOND.MetalDescriptions.Mythral' },
  'orichalcum': { multiplier: 50, effect: 'VAGABOND.MetalDescriptions.Orichalcum' }
};

/**
 * Metal type colors for visual inventory
 * Used for weapon skill icon colors
 * @type {Object}
 */
VAGABOND.metalColors = {
  'common': '#8b7355',      // Brown/tan for common metal
  'adamant': '#2d2d44',     // Dark blue-grey for adamant
  'coldIron': '#708090',    // Slate grey for cold iron
  'silver': '#c0c0c0',      // Silver
  'mythral': '#e0e0ff',     // Light blue-white for mythral
  'orichalcum': '#daa520'   // Golden for orichalcum
};

/**
 * Font Awesome icon classes for damage types
 * @type {Object}
 */
VAGABOND.damageTypeIcons = {
  '-': 'fa-solid fa-dot',
  'acid': 'fa-solid fa-chart-scatter-bubble',
  'fire': 'fa-solid fa-fire',
  'shock': 'fa-solid fa-bolt',
  'poison': 'fa-solid fa-flask-round-poison',
  'cold': 'fa-solid fa-snowflake',
  'blunt': 'fa-solid fa-hammer',
  'piercing': 'fa-solid fa-bow-arrow',
  'slashing': 'fa-regular fa-claw-marks',
  'physical': 'fa-solid fa-hand-back-fist',
  'necrotic': 'fa-solid fa-skull',
  'psychic': 'fa-solid fa-brain',
  'magical': 'fa-solid fa-stars',
  'healing': 'fa-solid fa-heart',
  'recover': 'fa-solid fa-arrows-rotate',
  'recharge': 'fa-solid fa-hourglass-half',
  'coldIron': 'fa-solid fa-square-i',
  'silver': 'fa-solid fa-square-s'
};

/**
 * Fx (Effect) Icon Configuration
 * You can use either a Font Awesome icon class OR an image path
 *
 * For Font Awesome icon (default):
 *   type: 'fa'
 *   value: 'fa-solid fa-square-e'
 *
 * For custom image:
 *   type: 'img'
 *   value: 'systems/vagabond/assets/icons/fx-icon.png'
 *
 * @type {Object}
 */
VAGABOND.fxIcon = {
  type: 'txt',   // 'fa' for Font Awesome, 'img' for image
  value: 'Fx'    // FA class or image path
};

/**
 * Speed Calculation Table
 * Keys represent the MINIMUM Dexterity required for that tier.
 * Logic will use the highest key that is <= the actor's Dexterity.
 * @type {Object}
 */
VAGABOND.speedTable = {
  0: { base: 25, crawl: 75,  travel: 5 }, // Default / Dex 0-1
  2: { base: 25, crawl: 75,  travel: 5 }, // Dex 2-3
  4: { base: 30, crawl: 90,  travel: 6 }, // Dex 4-5
  6: { base: 35, crawl: 105, travel: 7 }  // Dex 6+ (Caps here if higher entries are removed)
};



/**
 * Speed Types (Movement modes)
 * @type {Object}
 */
VAGABOND.speedTypes = {
  'climb': 'VAGABOND.SpeedTypes.Climb',
  'cling': 'VAGABOND.SpeedTypes.Cling',
  'fly': 'VAGABOND.SpeedTypes.Fly',
  'phase': 'VAGABOND.SpeedTypes.Phase',
  'swim': 'VAGABOND.SpeedTypes.Swim'
};

/**
 * Speed Type Hints (Tooltips)
 * @type {Object}
 */
VAGABOND.speedTypeHints = {
  'climb': 'VAGABOND.SpeedTypes.Hints.Climb',
  'cling': 'VAGABOND.SpeedTypes.Hints.Cling',
  'fly': 'VAGABOND.SpeedTypes.Hints.Fly',
  'phase': 'VAGABOND.SpeedTypes.Hints.Phase',
  'swim': 'VAGABOND.SpeedTypes.Hints.Swim'
};

/**
 * Countdown dice types
 * @type {Array}
 */
VAGABOND.countdownDiceTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'];

/**
 * Countdown dice sizes
 * @type {Object}
 */
VAGABOND.countdownDiceSizes = {
  'S': 50,
  'M': 75,
  'L': 100
};

/**
 * Attack types for weapons, spells, and NPC actions
 * Used to determine save modifiers (Hinder conditions)
 * @type {Object}
 */
VAGABOND.attackTypes = {
  'melee': {
    label: 'VAGABOND.AttackTypes.Melee',
    saveModifier: 'none'  // For future: 'none', 'hinder', 'favor', '+2', '-1d6', etc.
  },
  'ranged': {
    label: 'VAGABOND.AttackTypes.Ranged',
    saveModifier: 'hinderBlock'  // Hinders Block (Endure) saves
  },
  'cast': {
    label: 'VAGABOND.AttackTypes.Cast',
    saveModifier: 'hinderBlock'  // Treated as ranged for saves
  }
};

/**
 * Active Effect Application Modes
 * Controls when an effect should be applied to the actor
 * @type {Object}
 */
VAGABOND.effectApplicationModes = {
  'permanent': {
    label: 'VAGABOND.Effect.ApplicationMode.Permanent',
    hint: 'VAGABOND.Effect.ApplicationMode.PermanentHint',
    icon: 'fa-solid fa-infinity'
  },
  'when-equipped': {
    label: 'VAGABOND.Effect.ApplicationMode.WhenEquipped',
    hint: 'VAGABOND.Effect.ApplicationMode.WhenEquippedHint',
    icon: 'fa-solid fa-hand-fist'
  },
  'on-use': {
    label: 'VAGABOND.Effect.ApplicationMode.OnUse',
    hint: 'VAGABOND.Effect.ApplicationMode.OnUseHint',
    icon: 'fa-solid fa-sparkles'
  }
};

/**
 * Default application modes by item type
 * Provides smart defaults when creating effects on different item types
 * @type {Object}
 */
VAGABOND.defaultApplicationModes = {
  'perk': 'permanent',
  'ancestry': 'permanent',
  'class': 'permanent',
  'weapon': 'on-use',
  'equipment': 'when-equipped',
  'spell': 'on-use'
};

/**
 * Spell delivery types mapped to attack types
 * Determines if spell is melee or ranged for save Hinder purposes
 * Touch and Glyph spells are melee (do NOT hinder Block saves)
 * All other spells are ranged (DO hinder Block saves)
 * @type {Object}
 */
VAGABOND.spellDeliveryAttackTypes = {
  'touch': 'melee',    // Touch spells are melee
  'glyph': 'melee',    // Glyph spells are melee
  'aura': 'ranged',    // All others are ranged
  'cone': 'ranged',
  'cube': 'ranged',
  'imbue': 'ranged',
  'line': 'ranged',
  'remote': 'ranged',
  'sphere': 'ranged'
};

VAGABOND.favHindMarker = {
  'none': 'systems/vagabond/assets/ui/dice/neutral-mark.webp',
  'favored': 'systems/vagabond/assets/ui/dice/favor-mark.webp',
  'hindered': 'systems/vagabond/assets/ui/dice/hinder-mark.webp'
}
