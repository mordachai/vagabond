export const VAGABOND = {};

/**
 * The set of Stats used within the Vagabond system.
 * @type {Object}
 */
VAGABOND.abilities = {
  might: 'VAGABOND.Ability.Might.long',
  dexterity: 'VAGABOND.Ability.Dexterity.long',
  awareness: 'VAGABOND.Ability.Awareness.long',
  reason: 'VAGABOND.Ability.Reason.long',
  presence: 'VAGABOND.Ability.Presence.long',
  luck: 'VAGABOND.Ability.Luck.long',
};

VAGABOND.abilityAbbreviations = {
  might: 'VAGABOND.Ability.Might.abbr',
  dexterity: 'VAGABOND.Ability.Dexterity.abbr',
  awareness: 'VAGABOND.Ability.Awareness.abbr',
  reason: 'VAGABOND.Ability.Reason.abbr',
  presence: 'VAGABOND.Ability.Presence.abbr',
  luck: 'VAGABOND.Ability.Luck.abbr',
};

/**
 * Damage types for spells and attacks
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
  'necrotic': 'VAGABOND.DamageTypes.Necrotic'
};

/**
 * Spell delivery types
 * @type {Object}
 */
VAGABOND.deliveryTypes = {
  'aura': 'VAGABOND.DeliveryTypes.Aura',
  'cone': 'VAGABOND.DeliveryTypes.Cone',
  'cube': 'VAGABOND.DeliveryTypes.Cube',
  'imbue': 'VAGABOND.DeliveryTypes.Imbue',
  'glyph': 'VAGABOND.DeliveryTypes.Glyph',
  'line': 'VAGABOND.DeliveryTypes.Line',
  'remote': 'VAGABOND.DeliveryTypes.Remote',
  'sphere': 'VAGABOND.DeliveryTypes.Sphere',
  'touch': 'VAGABOND.DeliveryTypes.Touch'
};

/**
 * Default delivery data by type
 * @type {Object}
 */
VAGABOND.deliveryDefaults = {
  'aura': { cost: 2, increase: '+1 per +5 feet to the radius' },
  'cone': { cost: 2, increase: '+2 per additional 5-feet of length' },
  'cube': { cost: 1, increase: '+1 per additional 5-foot-cube' },
  'imbue': { cost: 0, increase: '+2 per additional Target' },
  'glyph': { cost: 2, increase: '—' },
  'line': { cost: 2, increase: '+1 per 10 feet of extra length' },
  'remote': { cost: 0, increase: '+1 per additional Target' },
  'sphere': { cost: 2, increase: '+1 per +5 feet to the radius' },
  'touch': { cost: 0, increase: '—' }
};
