import VagabondItemBase from './base-item.mjs';
import { VagabondTextParser } from '../helpers/text-parser.mjs';

/**
 * Base Equipment class for all equippable items (weapons, armor, gear, alchemicals, relics)
 * Provides unified fields and methods for cost, slots, metal, damage, and properties
 */
export default class VagabondEquipment extends VagabondItemBase {
  static LOCALIZATION_PREFIXES = [
    'VAGABOND.Item.base',
    'VAGABOND.Item.Equipment',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const requiredString = { required: true, nullable: false, blank: false };
    const schema = super.defineSchema();

    // Equipment Type - determines what kind of equipment this is
    schema.equipmentType = new fields.StringField({
      ...requiredString,
      initial: 'gear',
      choices: Object.keys(CONFIG.VAGABOND.equipmentTypes)
    });

    // Locked state - when true, displays as formatted text instead of inputs
    schema.locked = new fields.BooleanField({
      required: true,
      initial: false
    });

    // ===== UNIVERSAL FIELDS (ALL EQUIPMENT) =====

    // Equipped status
    schema.equipped = new fields.BooleanField({
      required: true,
      initial: false
    });

    // Quantity (for stackable items)
    schema.quantity = new fields.NumberField({
      ...requiredInteger,
      initial: 1,
      min: 0
    });

    // Base cost in three currencies (before metal multiplier if applicable)
    schema.baseCost = new fields.SchemaField({
      gold: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      silver: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      copper: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 })
    });

    // Bound system - marks items that require binding before use
    schema.requiresBound = new fields.BooleanField({
      required: true,
      initial: false
    });

    // Current bound state - whether this item is bound to a character
    schema.bound = new fields.BooleanField({
      required: true,
      initial: false
    });

    // Base slots (before metal modifier if applicable, can be negative for items like Backpack)
    schema.baseSlots = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 1
    });

    // Grid position for inventory display (0-indexed)
    schema.gridPosition = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
      min: 0
    });

    // Parent container ID (if this item is inside a container)
    schema.containerId = new fields.StringField({
      required: false,
      blank: true,
      initial: null,
      nullable: true
    });

    // Metal type (affects cost multiplier and special properties for weapons/armor)
    schema.metal = new fields.StringField({
      required: true,
      blank: false,
      initial: 'none',
      choices: ['none', 'common', 'adamant', 'coldIron', 'silver', 'mythral', 'orichalcum']
    });

    // Damage Type - universal damage/healing type
    schema.damageType = new fields.StringField({
      required: true,
      nullable: false,
      blank: false,
      initial: '-',
      choices: CONFIG.VAGABOND?.damageTypes || {
        '-': 'None',
        'acid': 'Acid',
        'fire': 'Fire',
        'shock': 'Shock',
        'poison': 'Poison',
        'cold': 'Cold',
        'blunt': 'Blunt',
        'piercing': 'Piercing', 
        'slashing': 'Slashing',
        'physical': 'Physical',
        'necrotic': 'Necrotic',
        'psychic': 'Psychic',
        'healing': 'Healing',
        'recover': 'Recover',
        'recharge': 'Recharge'
      }
    });

    // Damage Amount - damage formula (e.g., "2d6", "1d8+2", "d10")
    schema.damageAmount = new fields.StringField({
      required: false,
      blank: true,
      initial: ''
    });

    // Exploding Dice - whether damage dice can explode
    schema.canExplode = new fields.BooleanField({
      required: true,
      initial: false
    });

    // Explode Values - comma-separated numbers where dice explode (e.g., "1,4")
    schema.explodeValues = new fields.StringField({
      required: false,
      blank: true,
      initial: ''
    });

    // Properties - universal property array (weapon properties, gear traits, etc.)
    schema.properties = new fields.ArrayField(
      new fields.StringField({
        required: true,
        blank: false
      }),
      { initial: [] }
    );

    // ===== WEAPON-SPECIFIC FIELDS =====

    // Weapon skill used to attack (weapon skills, skills, or saves)
    schema.weaponSkill = new fields.StringField({
      required: false,
      blank: true,
      initial: 'melee',
      choices: CONFIG.VAGABOND?.weaponSkills || {
        'melee': 'Melee',
        'brawl': 'Brawl',
        'finesse': 'Finesse',
        'ranged': 'Ranged',
        'arcana': 'Arcana',
        'craft': 'Craft',
        'medicine': 'Medicine',
        'sneak': 'Sneak',
        'detect': 'Detect',
        'mysticism': 'Mysticism',
        'survival': 'Survival',
        'influence': 'Influence',
        'leadership': 'Leadership',
        'performance': 'Performance',
        'reflex': 'Reflex',
        'endure': 'Endure',
        'will': 'Will'
      }
    });

    // Range (close, near, far)
    schema.range = new fields.StringField({
      required: false,
      blank: true,
      initial: 'close',
      choices: ['close', 'near', 'far']
    });

    // Grip (1H, 2H, F, V)
    schema.grip = new fields.StringField({
      required: false,
      blank: true,
      initial: '1H',
      choices: ['1H', '2H', 'F', 'V']
    });

    // Damage one-handed (for weapons)
    schema.damageOneHand = new fields.StringField({
      required: false,
      blank: true,
      initial: 'd6'
    });

    // Damage type one-handed
    schema.damageTypeOneHand = new fields.StringField({
      required: false,
      blank: true,
      initial: '-',
      choices: CONFIG.VAGABOND?.damageTypes || {
        '-': 'None',
        'acid': 'Acid',
        'fire': 'Fire',
        'shock': 'Shock',
        'poison': 'Poison',
        'cold': 'Cold',
        'blunt': 'Blunt',
        'piercing': 'Piercing',
        'slashing': 'Slashing',
        'physical': 'Physical',
        'necrotic': 'Necrotic',
        'psychic': 'Psychic',
        'healing': 'Healing',
        'recover': 'Recover',
        'recharge': 'Recharge'
      }
    });

    // Damage two-handed (for versatile weapons)
    schema.damageTwoHands = new fields.StringField({
      required: false,
      blank: true,
      initial: 'd8'
    });

    // Damage type two-handed
    schema.damageTypeTwoHands = new fields.StringField({
      required: false,
      blank: true,
      initial: '-',
      choices: CONFIG.VAGABOND?.damageTypes || {
        '-': 'None',
        'acid': 'Acid',
        'fire': 'Fire',
        'shock': 'Shock',
        'poison': 'Poison',
        'cold': 'Cold',
        'blunt': 'Blunt',
        'piercing': 'Piercing',
        'slashing': 'Slashing',
        'physical': 'Physical',
        'necrotic': 'Necrotic',
        'psychic': 'Psychic',
        'healing': 'Healing',
        'recover': 'Recover',
        'recharge': 'Recharge'
      }
    });

    // Equipment state for weapons (unequipped, oneHand, twoHands)
    schema.equipmentState = new fields.StringField({
      required: false,
      blank: true,
      initial: 'unequipped',
      choices: ['unequipped', 'oneHand', 'twoHands']
    });

    // ===== ARMOR-SPECIFIC FIELDS =====

    // Armor type (light, medium, heavy)
    schema.armorType = new fields.StringField({
      required: false,
      blank: true,
      initial: 'light',
      choices: ['light', 'medium', 'heavy']
    });

    // Damage immunities (armor provides immunity to these damage types)
    schema.immunities = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [] }
    );

    // ===== GEAR-SPECIFIC FIELDS =====

    // Gear category (e.g., "Alchemy & Medicine", "Adventuring Gear")
    schema.gearCategory = new fields.StringField({
      required: false,
      blank: true,
      initial: ''
    });

    // ===== CONSUMABLE FIELDS =====

    // Consumable - whether this item is consumable (reduces quantity on use)
    schema.isConsumable = new fields.BooleanField({
      required: true,
      initial: false
    });

    // Linked Consumable - item ID of consumable that gets consumed when this item is used
    schema.linkedConsumable = new fields.StringField({
      required: false,
      blank: true,
      initial: ''
    });

    // ===== ALCHEMICAL-SPECIFIC FIELDS =====

    // Alchemical type
    schema.alchemicalType = new fields.StringField({
      required: false,
      blank: true,
      initial: 'concoction',
      choices: ['acid', 'concoction', 'explosive', 'oil', 'poison', 'potion', 'torch']
    });

    // ===== RELIC-SPECIFIC FIELDS =====

    // Lore - historical/mystical background
    schema.lore = new fields.StringField({
      required: false,
      blank: true,
      initial: ''
    });

    return schema;
  }

  prepareDerivedData() {
    // Relics don't use metal - skip metal calculations
    const isRelic = this.equipmentType === 'relic';

    // Get metal properties (skip for relics)
    if (!isRelic) {
      const metalData = this._getMetalData();
      this.metalMultiplier = metalData.multiplier;
      this.metalEffect = metalData.effect;
    } else {
      this.metalMultiplier = 1;
      this.metalEffect = '-';
    }

    // Calculate final cost (with metal multiplier for non-relics)
    this.cost = {
      gold: this.baseCost.gold * this.metalMultiplier,
      silver: this.baseCost.silver * this.metalMultiplier,
      copper: this.baseCost.copper * this.metalMultiplier
    };

    // Format cost as a human-readable string
    const costs = [];
    if (this.cost.gold > 0) costs.push(`${this.cost.gold}g`);
    if (this.cost.silver > 0) costs.push(`${this.cost.silver}s`);
    if (this.cost.copper > 0) costs.push(`${this.cost.copper}c`);
    this.costDisplay = costs.length > 0 ? costs.join(' ') : '-';

    // Calculate final slots (with metal modifier for non-relics)
    let finalSlots = this.baseSlots;
    if (!isRelic) {
      if (this.metal === 'adamant') {
        finalSlots += 1; // Occupies +1 Slot
      } else if (this.metal === 'mythral') {
        finalSlots = Math.max(1, finalSlots - 1); // Occupies 1 fewer Slot (min 1)
      }
    }
    this.slots = finalSlots;

    // Format properties as comma-separated string for display
    this.propertiesDisplay = this.properties.length > 0
      ? this.properties.join(', ')
      : '-';

    // Type-specific derived data
    if (this.equipmentType === 'weapon') {
      this._prepareWeaponData();
    } else if (this.equipmentType === 'armor') {
      this._prepareArmorData();
    }

    // Format metal display
    const metalDisplayMap = {
      'none': '-',
      'common': 'Common',
      'adamant': 'Adamant',
      'coldIron': 'Cold Iron',
      'silver': 'Silver',
      'mythral': 'Mythral',
      'orichalcum': 'Orichalcum'
    };
    this.metalDisplay = metalDisplayMap[this.metal] || this.metal;
  }

  _prepareWeaponData() {
    // Determine if weapon is equipped (any state other than unequipped)
    this.equipped = this.equipmentState !== 'unequipped';

    // Determine current damage and damage type based on equipment state
    let baseDamage;
    let baseDamageType;
    if (this.equipmentState === 'twoHands') {
      baseDamage = this.damageTwoHands;
      baseDamageType = this.damageTypeTwoHands;
    } else {
      baseDamage = this.damageOneHand;
      baseDamageType = this.damageTypeOneHand;
    }

    // Set current damage type
    this.currentDamageType = baseDamageType || '-';

    // Apply adamant bonus (+1 to damage)
    if (this.metal === 'adamant') {
      // Parse the damage formula and add +1
      if (baseDamage && baseDamage.includes('d')) {
        this.currentDamage = `${baseDamage}+1`;
      } else {
        const value = parseInt(baseDamage) || 0;
        this.currentDamage = String(value + 1);
      }
    } else {
      this.currentDamage = baseDamage;
    }

    // Format range display with abbreviations and full names
    const rangeAbbrMap = {
      'close': 'C',
      'near': 'N',
      'far': 'F'
    };
    const rangeFullMap = {
      'close': 'Close',
      'near': 'Near',
      'far': 'Far'
    };
    this.rangeAbbrev = rangeAbbrMap[this.range] || this.range;
    this.rangeDisplay = rangeFullMap[this.range] || this.range;

    // Format grip display
    const gripMap = {
      '1H': '1H',
      '2H': '2H',
      'F': 'Fist',
      'V': 'Versatile'
    };
    this.gripDisplay = gripMap[this.grip] || this.grip;
  }

  _prepareArmorData() {
    // Determine rating based on armor type
    const ratingMap = {
      'light': 1,
      'medium': 2,
      'heavy': 3
    };
    this.rating = ratingMap[this.armorType] || 1;

    // Determine might requirement based on armor type
    const mightMap = {
      'light': 3,
      'medium': 4,
      'heavy': 5
    };
    this.might = mightMap[this.armorType] || 3;

    // Calculate final armor rating with metal bonus
    this.finalRating = this.rating;
    if (this.metal === 'adamant') {
      this.finalRating += 1; // +1 to Armor
    }

    // Format armor type display
    const typeMap = {
      'light': 'Light',
      'medium': 'Medium',
      'heavy': 'Heavy'
    };
    this.armorTypeDisplay = typeMap[this.armorType] || this.armorType;
  }

  _getMetalData() {
    const metals = {
      'none': { multiplier: 1, effect: '-' },
      'common': { multiplier: 1, effect: '-' },
      'adamant': { multiplier: 50, effect: 'Occupies +1 Slot. +1 to Armor (if Armor) or Weapon damage.' },
      'coldIron': { multiplier: 20, effect: 'Situational weakness (Fae).' },
      'silver': { multiplier: 10, effect: 'Blesses weapons against the accursed.' },
      'mythral': { multiplier: 50, effect: 'Occupies 1 fewer Slot (min 1).' },
      'orichalcum': { multiplier: 50, effect: 'Armor reduces Cast damage.' }
    };

    return metals[this.metal] || metals.none;
  }

  /**
   * Format equipment description for countdown dice triggers
   * Converts "Cdx" or "cdx" patterns to clickable spans for countdown dice creation
   * @param {string} description - The description text to format
   * @returns {string} Formatted description with clickable countdown dice triggers
   */
  formatDescription(description) {
    if (!description) return '';

    // Use centralized text parser
    return VagabondTextParser.parseCountdownDice(description);
  }
}
