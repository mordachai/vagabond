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

