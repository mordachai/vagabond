import VagabondItemBase from './base-item.mjs';

export default class VagabondClass extends VagabondItemBase {
  static LOCALIZATION_PREFIXES = [
    'VAGABOND.Item.base',
    'VAGABOND.Item.Class',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredString = { required: true, nullable: false };
    const schema = super.defineSchema();

    // Is this class a spellcaster?
    schema.isSpellcaster = new fields.BooleanField({
      initial: false,
      label: 'VAGABOND.Item.Class.FIELDS.isSpellcaster.label',
      hint: 'VAGABOND.Item.Class.FIELDS.isSpellcaster.hint'
    });

    // Mana multiplier - multiplier for max mana calculation (Max Mana = Mana Multiplier × Level)
    schema.manaMultiplier = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 2,
      min: 0,
      label: 'VAGABOND.Item.Class.FIELDS.manaMultiplier.label',
      hint: 'VAGABOND.Item.Class.FIELDS.manaMultiplier.hint'
    });

    // Mana skill - which skill is used for mana calculations
    schema.manaSkill = new fields.StringField({
      initial: null,
      required: false,
      nullable: true,
      choices: {
        arcana: 'VAGABOND.Skills.Arcana',
        craft: 'VAGABOND.Skills.Craft',
        medicine: 'VAGABOND.Skills.Medicine',
        brawl: 'VAGABOND.Skills.Brawl',
        finesse: 'VAGABOND.Skills.Finesse',
        sneak: 'VAGABOND.Skills.Sneak',
        detect: 'VAGABOND.Skills.Detect',
        mysticism: 'VAGABOND.Skills.Mysticism',
        survival: 'VAGABOND.Skills.Survival',
        influence: 'VAGABOND.Skills.Influence',
        leadership: 'VAGABOND.Skills.Leadership',
        performance: 'VAGABOND.Skills.Performance'
      },
      label: 'VAGABOND.Item.Class.FIELDS.manaSkill.label',
      hint: 'VAGABOND.Item.Class.FIELDS.manaSkill.hint'
    });

    // Casting stat - which stat is used for spellcasting
    schema.castingStat = new fields.StringField({
      initial: null,
      required: false,
      nullable: true,
      choices: {
        might: 'VAGABOND.Ability.Might.long',
        dexterity: 'VAGABOND.Ability.Dexterity.long',
        reason: 'VAGABOND.Ability.Reason.long',
        awareness: 'VAGABOND.Ability.Awareness.long',
        presence: 'VAGABOND.Ability.Presence.long',
        luck: 'VAGABOND.Ability.Luck.long'
      },
      label: 'VAGABOND.Item.Class.FIELDS.castingStat.label',
      hint: 'VAGABOND.Item.Class.FIELDS.castingStat.hint'
    });

    // Level features - features gained at each level
    schema.levelFeatures = new fields.ArrayField(
      new fields.SchemaField({
        level: new fields.NumberField({
          required: true,
          initial: 1,
          min: 1,
          max: 10,
          integer: true
        }),
        name: new fields.StringField({ ...requiredString, initial: '' }),
        description: new fields.StringField({ initial: '' })
      }),
      { initial: [] }
    );

    return schema;
  }

  prepareDerivedData() {
    // Add any calculations or derived data here
    this.featureCount = this.levelFeatures.length;
  }

  /**
   * Get features for a specific level
   * @param {number} level - The level to get features for
   * @returns {Array} Array of features for that level
   */
  getFeaturesForLevel(level) {
    return this.levelFeatures.filter(f => f.level === level);
  }

  /**
   * Add a new feature to this class
   * @param {number} level - The level this feature is gained at
   * @param {string} name - The name of the feature
   * @param {string} description - The description of the feature
   */
  async addLevelFeature(level = 1, name = 'New Feature', description = '') {
    const newFeatures = [...this.levelFeatures, { level, name, description }];
    await this.parent.update({ 'system.levelFeatures': newFeatures });
  }

  /**
   * Remove a feature by index
   * @param {number} index - The index of the feature to remove
   */
  async removeLevelFeature(index) {
    if (index < 0 || index >= this.levelFeatures.length) return;
    const newFeatures = this.levelFeatures.filter((_, i) => i !== index);
    await this.parent.update({ 'system.levelFeatures': newFeatures });
  }

  /**
   * Update a specific feature
   * @param {number} index - The index of the feature to update
   * @param {object} updates - The updates to apply
   */
  async updateLevelFeature(index, updates) {
    if (index < 0 || index >= this.levelFeatures.length) return;
    const newFeatures = [...this.levelFeatures];
    newFeatures[index] = { ...newFeatures[index], ...updates };
    await this.parent.update({ 'system.levelFeatures': newFeatures });
  }
}
