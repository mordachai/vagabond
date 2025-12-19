import VagabondItemBase from './base-item.mjs';

/**
 * Container item data model (bags, backpacks, pouches, etc.)
 * Containers hold other items and have capacity limits
 */
export default class VagabondContainerData extends VagabondItemBase {
  static LOCALIZATION_PREFIXES = [
    'VAGABOND.Item.base',
    'VAGABOND.Item.Container',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    // How many inventory slots this container occupies
    schema.slots = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 1,
      min: 0
    });

    // How many items this container can hold
    schema.capacity = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 10,
      min: 1
    });

    // Grid position for inventory display (0-indexed)
    schema.gridPosition = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
      min: 0
    });

    // Lock state for viewing/editing
    schema.locked = new fields.BooleanField({
      required: true,
      initial: false
    });

    // Array of items stored in this container
    // Store the full item data, not just UUID references
    schema.items = new fields.ArrayField(
      new fields.ObjectField({
        required: true
      }),
      {
        initial: []
      }
    );

    // Base cost in three currencies
    schema.baseCost = new fields.SchemaField({
      gold: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      silver: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      copper: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 })
    });

    return schema;
  }

  prepareDerivedData() {
    // Format cost as a human-readable string
    const costs = [];
    if (this.baseCost.gold > 0) costs.push(`${this.baseCost.gold}g`);
    if (this.baseCost.silver > 0) costs.push(`${this.baseCost.silver}s`);
    if (this.baseCost.copper > 0) costs.push(`${this.baseCost.copper}c`);
    this.costDisplay = costs.length > 0 ? costs.join(' ') : '-';

    // Calculate current slots used (0-slot items don't count toward capacity)
    this.currentCapacity = this.items.reduce((total, item) => {
      const itemSlots = item.system?.baseSlots || 0;
      return total + (itemSlots > 0 ? itemSlots : 0);
    }, 0);
  }

  /**
   * Check if this container can hold more items based on slot capacity
   * Note: This checks if we're at max capacity, but 0-slot items can always be added
   * @returns {boolean}
   */
  get canAddItem() {
    return this.currentCapacity < this.capacity;
  }

  /**
   * Check if this container is empty
   * @returns {boolean}
   */
  get isEmpty() {
    return this.items.length === 0;
  }
}
