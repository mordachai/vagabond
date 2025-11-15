import VagabondItemBase from './base-item.mjs';

export default class VagabondWeapon extends VagabondItemBase {
  static LOCALIZATION_PREFIXES = [
    'VAGABOND.Item.base',
    'VAGABOND.Item.Weapon',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    // Damage one-handed (dice notation like "d8", "d6", "d4" or flat values like "1", "2")
    schema.damageOneHand = new fields.StringField({
      required: true,
      blank: false,
      initial: 'd6'
    });

    // Damage two-handed (for Versatile weapons)
    schema.damageTwoHands = new fields.StringField({
      required: true,
      blank: false,
      initial: 'd8'
    });

    // Weapon properties (Brawl, Brutal, Cleave, Entangle, etc.)
    schema.properties = new fields.ArrayField(
      new fields.StringField({
        required: true,
        blank: false
      }),
      { initial: [] }
    );

    // Weapon skill used to attack (melee, brawl, finesse, ranged)
    schema.weaponSkill = new fields.StringField({
      required: true,
      blank: false,
      initial: 'melee',
      choices: ['melee', 'brawl', 'finesse', 'ranged']
    });

    // Range (close, near, far)
    schema.range = new fields.StringField({
      required: true,
      blank: false,
      initial: 'close',
      choices: ['close', 'near', 'far']
    });

    // Grip (1H, 2H, F, V)
    schema.grip = new fields.StringField({
      required: true,
      blank: false,
      initial: '1H',
      choices: ['1H', '2H', 'F', 'V']
    });

    // Base cost in three currencies (before metal multiplier)
    schema.baseCost = new fields.SchemaField({
      gold: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      silver: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      copper: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 })
    });

    // Metal type (affects cost multiplier and special properties)
    schema.metal = new fields.StringField({
      required: true,
      blank: false,
      initial: 'common',
      choices: ['common', 'adamant', 'coldIron', 'silver', 'mythral', 'orichalcum']
    });

    // Base slots (before metal modifier)
    schema.baseSlots = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 1,
      min: 0
    });

    // Equipment state (unequipped, oneHand, twoHands)
    schema.equipmentState = new fields.StringField({
      required: true,
      blank: false,
      initial: 'unequipped',
      choices: ['unequipped', 'oneHand', 'twoHands']
    });

    return schema;
  }

  prepareDerivedData() {
    // Get metal properties
    const metalData = this._getMetalData();
    this.metalMultiplier = metalData.multiplier;
    this.metalEffect = metalData.effect;

    // Calculate final cost with metal multiplier
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

    // Calculate final slots with metal modifier
    let finalSlots = this.baseSlots;
    if (this.metal === 'adamant') {
      finalSlots += 1; // Occupies +1 Slot
    } else if (this.metal === 'mythral') {
      finalSlots = Math.max(1, finalSlots - 1); // Occupies 1 fewer Slot (min 1)
    }
    this.slots = finalSlots;

    // Format properties as comma-separated string for display
    this.propertiesDisplay = this.properties.length > 0
      ? this.properties.join(', ')
      : '-';

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
      // Handle both dice notation (d6, d8) and flat values
      if (baseDamage.includes('d')) {
        this.currentDamage = `${baseDamage}+1`;
      } else {
        const value = parseInt(baseDamage) || 0;
        this.currentDamage = String(value + 1);
      }
    } else {
      this.currentDamage = baseDamage;
    }

    // Determine if weapon is equipped (any state other than unequipped)
    this.equipped = this.equipmentState !== 'unequipped';

    // Format range display
    const rangeMap = {
      'close': 'Close',
      'near': 'Near',
      'far': 'Far'
    };
    this.rangeDisplay = rangeMap[this.range] || this.range;

    // Format grip display
    const gripMap = {
      '1H': '1H',
      '2H': '2H',
      'F': 'Fist',
      'V': 'Versatile'
    };
    this.gripDisplay = gripMap[this.grip] || this.grip;

    // Format metal display
    const metalDisplayMap = {
      'common': 'Common',
      'adamant': 'Adamant',
      'coldIron': 'Cold Iron',
      'silver': 'Silver',
      'mythral': 'Mythral',
      'orichalcum': 'Orichalcum'
    };
    this.metalDisplay = metalDisplayMap[this.metal] || this.metal;
  }

  _getMetalData() {
    const metals = {
      'common': { multiplier: 1, effect: '-' },
      'adamant': { multiplier: 50, effect: 'Occupies +1 Slot. +1 to Armor (if Armor) or Weapon damage.' },
      'coldIron': { multiplier: 20, effect: 'Situational weakness (Fae).' },
      'silver': { multiplier: 10, effect: 'Blesses weapons against the accursed.' },
      'mythral': { multiplier: 50, effect: 'Occupies 1 fewer Slot (min 1).' },
      'orichalcum': { multiplier: 50, effect: 'Armor reduces Cast damage.' }
    };

    return metals[this.metal] || metals.common;
  }
}
