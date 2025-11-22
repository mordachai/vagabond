export const VAGABOND = {};

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
  'physical': 'VAGABOND.DamageTypes.Physical',
  'necrotic': 'VAGABOND.DamageTypes.Necrotic',
  'psychic': 'VAGABOND.DamageTypes.Psychic',
  'healing': 'VAGABOND.DamageTypes.Healing'
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
  'ranged': 'VAGABOND.WeaponSkills.Ranged'
};

/**
 * Weapon range options
 * @type {Object}
 */
VAGABOND.weaponRanges = {
  'close': 'VAGABOND.Weapon.Range.Close.long',
  'near': 'VAGABOND.Weapon.Range.Near.long',
  'far': 'VAGABOND.Weapon.Range.Far.long'
};

/**
 * Weapon grip types
 * @type {Object}
 */
VAGABOND.weaponGrips = {
  '1H': 'VAGABOND.Weapon.Grip.1H',
  '2H': 'VAGABOND.Weapon.Grip.2H',
  'F': 'VAGABOND.Weapon.Grip.F',
  'V': 'VAGABOND.Weapon.Grip.V'
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
  'Brawl': 'Attacks with Brawl, can Grapple/Shove.',
  'Brutal': 'Crits deal 1 extra damage die.',
  'Cleave': 'Can deal half damage to two Targets.',
  'Entangle': 'Can Grapple.',
  'Finesse': 'Can attack with Finesse.',
  'Keen': 'Crit on Attack Checks 1 lower.',
  'Long': 'Its Range is 5 feet further.',
  'Near': 'Can only Target up to Near.',
  'Ranged': 'Attacks with Ranged. Attacking a Close Target Hinders the Check.',
  'Shield': 'Ignores Hinder from Blocking Ranged Attacks. Can Shove.',
  'Thrown': 'Can throw attack up to Near, or Far with Hinder.'
};

/**
 * Weapon grip descriptions
 * @type {Object}
 */
VAGABOND.weaponGripDescriptions = {
  '1H': 'One-Handed: Requires one hand.',
  '2H': 'Two-Handed: Requires two hands.',
  'F': 'Fist: Your hands are open while using it.',
  'V': 'Versatile: Counts as 1H, but its damage die is one size larger if 2H.'
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
  'light': 'Light: Rating 1, Might 3, 1 Slot',
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
  'common': { multiplier: 1, effect: '-' },
  'adamant': { multiplier: 50, effect: 'Occupies +1 Slot. +1 to Armor (if Armor) or Weapon damage.' },
  'coldIron': { multiplier: 20, effect: 'Situational weakness (Fae).' },
  'silver': { multiplier: 10, effect: 'Blesses weapons against the accursed.' },
  'mythral': { multiplier: 50, effect: 'Occupies 1 fewer Slot (min 1).' },
  'orichalcum': { multiplier: 50, effect: 'Armor reduces Cast damage.' }
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
 * Icon paths for inventory visual grid
 * @type {Object}
 */
VAGABOND.icons = {
  // Weapon skill icons
  weaponSkills: {
    'melee': 'assets/ui/weapon-skill-melee.webp',
    'ranged': 'assets/ui/weapon-skill-ranged.webp',
    'brawl': 'assets/ui/weapon-skill-brawl.webp',
    'finesse': 'assets/ui/weapon-skill-finesse.webp'
  },

  // Damage type icons
  damageTypes: {
    '-': 'assets/ui/none-dmg-icn.webp',
    'acid': 'assets/ui/acid-dmg-icn.webp',
    'fire': 'assets/ui/fire-dmg-icn.webp',
    'shock': 'assets/ui/shock-dmg-icn.webp',
    'poison': 'assets/ui/poison-dmg-icn.webp',
    'cold': 'assets/ui/cold-dmg-icn.webp',
    'blunt': 'assets/ui/blunt-dmg-icn.webp',
    'physical': 'assets/ui/physical-dmg-icn.webp',
    'necrotic': 'assets/ui/necrotic-dmg-icn.webp',
    'psychic': 'assets/ui/psychic-dmg-icn.webp',
    'healing': 'assets/ui/healing-dmg-icn.webp'
  },

  // Grip icons
  grips: {
    '1H': 'assets/ui/grip-1h.webp',
    '2H': 'assets/ui/grip-2h.webp',
    'F': 'assets/ui/grip-fist.webp',
    'V': 'assets/ui/grip-versatile.webp'
  }
};

/**
 * Range abbreviations for display
 * @type {Object}
 */
VAGABOND.rangeAbbreviations = {
  'close': 'C',
  'near': 'N',
  'far': 'F'
};
