import VagabondItemBase from './base-item.mjs';

/**
 * Data model for Starter Pack items
 * Starter packs contain a collection of items and wealth values that can be dropped on a character
 */
export default class VagabondStarterPack extends VagabondItemBase {
  static LOCALIZATION_PREFIXES = [
    'VAGABOND.Item.base',
    'VAGABOND.Item.StarterPack',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    // Array of item UUIDs that are part of this pack
    schema.items = new fields.ArrayField(
      new fields.SchemaField({
        uuid: new fields.StringField({
          required: true,
          blank: false,
          label: 'VAGABOND.Item.StarterPack.ItemUUID'
        }),
        quantity: new fields.NumberField({
          required: true,
          initial: 1,
          min: 1,
          integer: true,
          label: 'VAGABOND.Item.StarterPack.Quantity'
        })
      }),
      {
        initial: [],
        label: 'VAGABOND.Item.StarterPack.Items'
      }
    );

    // Currency values provided by this pack
    schema.currency = new fields.SchemaField({
      gold: new fields.NumberField({
        required: true,
        initial: 0,
        min: 0,
        integer: true,
        label: 'VAGABOND.Currency.Gold.long'
      }),
      silver: new fields.NumberField({
        required: true,
        initial: 0,
        min: 0,
        integer: true,
        label: 'VAGABOND.Currency.Silver.long'
      }),
      copper: new fields.NumberField({
        required: true,
        initial: 0,
        min: 0,
        integer: true,
        label: 'VAGABOND.Currency.Copper.long'
      })
    });

    return schema;
  }

  prepareDerivedData() {
    // Calculate display values
    this.itemCount = this.items.length;
    this.totalQuantity = this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  /**
   * Get formatted currency string for display (e.g., "7g 15s")
   * @returns {string} Formatted currency string
   */
  getCurrencyString() {
    const parts = [];
    if (this.currency.gold > 0) parts.push(`${this.currency.gold}g`);
    if (this.currency.silver > 0) parts.push(`${this.currency.silver}s`);
    if (this.currency.copper > 0) parts.push(`${this.currency.copper}c`);
    return parts.join(' ') || '0c';
  }

  /**
   * Add an item to this pack
   * @param {string} uuid - The UUID of the item to add
   * @param {number} quantity - The quantity to add
   */
  async addItem(uuid, quantity = 1) {
    // Check if item already exists in pack
    const existingIndex = this.items.findIndex(item => item.uuid === uuid);

    if (existingIndex >= 0) {
      // Update quantity
      const newItems = [...this.items];
      newItems[existingIndex].quantity += quantity;
      await this.parent.update({ 'system.items': newItems });
    } else {
      // Add new item
      const newItems = [...this.items, { uuid, quantity }];
      await this.parent.update({ 'system.items': newItems });
    }
  }

  /**
   * Remove an item from this pack by index
   * @param {number} index - The index of the item to remove
   */
  async removeItem(index) {
    if (index < 0 || index >= this.items.length) return;
    const newItems = this.items.filter((_, i) => i !== index);
    await this.parent.update({ 'system.items': newItems });
  }

  /**
   * Set the quantity of an item in the pack
   * @param {number} index - The index of the item
   * @param {number} quantity - The new quantity
   */
  async setItemQuantity(index, quantity) {
    if (index < 0 || index >= this.items.length) return;
    const newItems = [...this.items];
    newItems[index].quantity = Math.max(1, quantity);
    await this.parent.update({ 'system.items': newItems });
  }
}
