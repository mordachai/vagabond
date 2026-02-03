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
      choices: Object.keys(CONFIG.VAGABOND.sizes)
    });

    // Ancestry type (like "Humanlike", "Cryptid", etc.)
    schema.ancestryType = new fields.StringField({
      initial: 'Humanlike',
      choices: Object.keys(CONFIG.VAGABOND.beingTypes)
    });

    // Traits array - editable list of ancestry traits
    schema.traits = new fields.ArrayField(
      new fields.SchemaField({
        name: new fields.StringField({ ...requiredString, initial: '' }),
        description: new fields.StringField({ initial: '' }),

        // Stat bonus points - each point gives +1 to any stat <7 (player's choice)
        statBonusPoints: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 10 }),

        // Extra training - grants additional skill training choices
        extraTraining: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 10 }),

        // Required spells - spells that this trait grants (array of UUIDs)
        requiredSpells: new fields.ArrayField(
          new fields.StringField({ initial: '', blank: true }),
          { initial: [] }
        ),

        // Allowed perks - limits perk selection to these (array of UUIDs, empty = all allowed)
        allowedPerks: new fields.ArrayField(
          new fields.StringField({ initial: '', blank: true }),
          { initial: [] }
        ),

        // Perk amount - number of perks granted by this trait
        perkAmount: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 10 }),
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
