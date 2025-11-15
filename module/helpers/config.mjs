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
  'close': 'VAGABOND.Weapon.Range.Close',
  'near': 'VAGABOND.Weapon.Range.Near',
  'far': 'VAGABOND.Weapon.Range.Far'
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
