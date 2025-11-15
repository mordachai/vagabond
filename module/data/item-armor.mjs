import VagabondItemBase from './base-item.mjs';

export default class VagabondArmor extends VagabondItemBase {
  static LOCALIZATION_PREFIXES = [
    'VAGABOND.Item.base',
    'VAGABOND.Item.Armor',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    // Armor type (light, medium, heavy)
    schema.armorType = new fields.StringField({
      required: true,
      blank: false,
      initial: 'light',
      choices: ['light', 'medium', 'heavy']
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

    // Equipment state (unequipped, equipped)
    schema.equipped = new fields.BooleanField({
      required: true,
      initial: false
    });

    return schema;
  }

  prepareDerivedData() {
    // Determine rating based on armor type
    const ratingMap = {
      'light': 1,
      'medium': 2,
      'heavy': 3
    };
    this.rating = ratingMap[this.armorType] || 1;

    // Determine might based on armor type
    const mightMap = {
      'light': 3,
      'medium': 4,
      'heavy': 5
    };
    this.might = mightMap[this.armorType] || 3;

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

    // Calculate base slots (1 for light, 2 for medium, 3 for heavy)
    let baseSlots = this.rating;

    // Apply metal slot modifiers
    if (this.metal === 'adamant') {
      baseSlots += 1; // Occupies +1 Slot
    } else if (this.metal === 'mythral') {
      baseSlots = Math.max(1, baseSlots - 1); // Occupies 1 fewer Slot (min 1)
    }

    this.slots = baseSlots;

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
