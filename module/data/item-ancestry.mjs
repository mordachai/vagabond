import VagabondItemBase from './base-item.mjs';

export default class VagabondAncestry extends VagabondItemBase {
  static LOCALIZATION_PREFIXES = [
    'VAGABOND.Item.base',
    'VAGABOND.Item.Ancestry',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredString = { required: true, nullable: false };
    const schema = super.defineSchema();

    // Ancestry size - affects character size when equipped
    schema.size = new fields.StringField({
      initial: 'medium',
      choices: ['small', 'medium', 'large', 'huge', 'giant', 'colossal']
    });

    // Ancestry type (like "Humanlike", "Cryptid", etc.)
    schema.ancestryType = new fields.StringField({
      initial: 'Humanlike',
      choices: ['Humanlike', 'Fae', 'Cryptid', 'Artificials', 'Beasts', 'Outers', 'Primordials', 'Undead']
    });

    // Traits array - editable list of ancestry traits
    schema.traits = new fields.ArrayField(
      new fields.SchemaField({
        name: new fields.StringField({ ...requiredString, initial: '' }),
        description: new fields.StringField({ initial: '' })
      }),
      { initial: [] }
    );

    return schema;
  }

  prepareDerivedData() {
    // Add any calculations or derived data here
    this.traitCount = this.traits.length;
  }

  // REMOVED getTraitSummary() method that was creating comma-separated strings

  /**
   * Add a new trait to this ancestry
   */
  async addTrait(name = 'New Trait', description = '') {
    const newTraits = [...this.traits, { name, description }];
    await this.parent.update({ 'system.traits': newTraits });
  }

  /**
   * Remove a trait by index
   */
  async removeTrait(index) {
    if (index < 0 || index >= this.traits.length) return;
    const newTraits = this.traits.filter((_, i) => i !== index);
    await this.parent.update({ 'system.traits': newTraits });
  }

  /**
   * Update a specific trait
   */
  async updateTrait(index, updates) {
    if (index < 0 || index >= this.traits.length) return;
    const newTraits = [...this.traits];
    newTraits[index] = { ...newTraits[index], ...updates };
    await this.parent.update({ 'system.traits': newTraits });
  }
}
