import VagabondItemBase from './base-item.mjs';

export default class VagabondGear extends VagabondItemBase {
  static LOCALIZATION_PREFIXES = [
    'VAGABOND.Item.base',
    'VAGABOND.Item.Gear',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    // Quantity (for stackable items and ammunition)
    schema.quantity = new fields.NumberField({
      ...requiredInteger,
      initial: 1,
      min: 0
    });

    // Gear type (e.g., "Alchemy & Medicine", "Adventuring Gear")
    schema.type = new fields.StringField({
      required: false,
      blank: true,
      initial: ''
    });

    // Cost in three currencies
    schema.cost = new fields.SchemaField({
      gold: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      silver: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      copper: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 })
    });

    // Slots (can be negative for items that add slots like Backpack)
    schema.slots = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 1
    });

    // Equipped status
    schema.equipped = new fields.BooleanField({
      required: true,
      initial: false
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
  }
}
