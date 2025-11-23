import VagabondItemBase from './base-item.mjs';

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
      choices: ['weapon', 'armor', 'gear', 'alchemical', 'relic']
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

    // Base slots (before metal modifier if applicable, can be negative for items like Backpack)
    schema.baseSlots = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 1
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

    // Properties - universal property array (weapon properties, gear traits, etc.)
    schema.properties = new fields.ArrayField(
      new fields.StringField({
        required: true,
        blank: false
      }),
      { initial: [] }
    );

    // ===== WEAPON-SPECIFIC FIELDS =====

    // Weapon skill used to attack (melee, brawl, finesse, ranged)
    schema.weaponSkill = new fields.StringField({
      required: false,
      blank: true,
      initial: 'melee',
      choices: ['melee', 'brawl', 'finesse', 'ranged']
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

    // Damage two-handed (for versatile weapons)
    schema.damageTwoHands = new fields.StringField({
      required: false,
      blank: true,
      initial: 'd8'
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

    // Determine current damage based on equipment state
    let baseDamage;
    if (this.equipmentState === 'twoHands') {
      baseDamage = this.damageTwoHands;
    } else {
      baseDamage = this.damageOneHand;
    }

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
}
