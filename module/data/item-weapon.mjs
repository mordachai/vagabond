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

    // Cost in three currencies (same as gear)
    schema.cost = new fields.SchemaField({
      gold: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      silver: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      copper: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 })
    });

    // Slots (inventory space)
    schema.slots = new fields.NumberField({
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
    // Format cost as a human-readable string
    const costs = [];
    if (this.cost.gold > 0) costs.push(`${this.cost.gold}g`);
    if (this.cost.silver > 0) costs.push(`${this.cost.silver}s`);
    if (this.cost.copper > 0) costs.push(`${this.cost.copper}c`);

    this.costDisplay = costs.length > 0 ? costs.join(' ') : '-';

    // Format properties as comma-separated string for display
    this.propertiesDisplay = this.properties.length > 0
      ? this.properties.join(', ')
      : '-';

    // Determine current damage based on equipment state
    if (this.equipmentState === 'twoHands') {
      this.currentDamage = this.damageTwoHands;
    } else {
      this.currentDamage = this.damageOneHand;
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
  }
}
