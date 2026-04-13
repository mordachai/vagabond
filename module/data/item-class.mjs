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
      label: 'VAGABOND.Item.Class.FIELDS.manaSkill.label',
      hint: 'VAGABOND.Item.Class.FIELDS.manaSkill.hint'
    });

    // Casting stat - which stat is used for spellcasting
    schema.castingStat = new fields.StringField({
      initial: null,
      required: false,
      nullable: true,
      label: 'VAGABOND.Item.Class.FIELDS.castingStat.label',
      hint: 'VAGABOND.Item.Class.FIELDS.castingStat.hint'
    });

    // Key stats - the primary stats for this class (can be multiple)
    schema.keyStats = new fields.ArrayField(
      new fields.StringField(),
      {
        initial: [],
        label: 'VAGABOND.Item.Class.FIELDS.keyStats.label',
        hint: 'VAGABOND.Item.Class.FIELDS.keyStats.hint'
      }
    );

    // Skill Grant System
    schema.skillGrant = new fields.SchemaField({
      // Fixed skills the class always provides (e.g., Alchemist -> Craft)
      guaranteed: new fields.ArrayField(new fields.StringField(), { initial: [] }),

      // Dynamic choices (e.g., Magus -> Choose 3 from a restricted list)
      choices: new fields.ArrayField(
        new fields.SchemaField({
          count: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
          pool: new fields.ArrayField(new fields.StringField(), { initial: [] }),
          label: new fields.StringField({ initial: '' })
        }),
        { initial: [] }
      )
    });

    // Level features - features gained at each level
    schema.levelFeatures = new fields.ArrayField(
      new fields.SchemaField({
        level: new fields.NumberField({
          required: true,
          initial: 1,
          min: 1,
          max: CONFIG.VAGABOND.homebrew?.leveling?.maxLevel ?? 10,
          integer: true
        }),
        name: new fields.StringField({ ...requiredString, initial: '' }),
        description: new fields.StringField({ initial: '' }),

        // Stat bonus points - each point gives +1 to any stat <7 (player's choice)
        statBonusPoints: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 10 }),

        // Extra training - grants additional skill training choices
        extraTraining: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 10 }),

        // Required spells - spells that this feature grants (array of UUIDs)
        requiredSpells: new fields.ArrayField(
          new fields.StringField({ initial: '', blank: true }),
          { initial: [] }
        ),

        // Allowed perks - limits perk selection to these (array of UUIDs, empty = all allowed)
        allowedPerks: new fields.ArrayField(
          new fields.StringField({ initial: '', blank: true }),
          { initial: [] }
        ),

        // Perk amount - number of perks granted by this feature
        perkAmount: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 10 }),

        // Spell amount - number of spells player can choose from the requiredSpells pool
        spellAmount: new fields.NumberField({ initial: 0, integer: true, min: 0, max: 10 }),

        // Skill choice groups - restricted skill training choices (same as ancestry traits)
        skillChoices: new fields.ArrayField(
          new fields.SchemaField({
            count: new fields.NumberField({ initial: 1, integer: true, min: 1 }),
            pool: new fields.ArrayField(new fields.StringField(), { initial: [] }),
            label: new fields.StringField({ initial: '' })
          }),
          { initial: [] }
        ),
      }),
      { initial: [] }
    );

    // Suggested starting packs - UUIDs of starter packs recommended for this class
    schema.suggestedStartingPacks = new fields.ArrayField(
      new fields.StringField({ initial: '', blank: true }),
      {
        initial: [],
        label: 'VAGABOND.Item.Class.FIELDS.suggestedStartingPacks.label',
        hint: 'VAGABOND.Item.Class.FIELDS.suggestedStartingPacks.hint'
      }
    );

    // Spells gained per level - separate from features
    schema.levelSpells = new fields.ArrayField(
      new fields.SchemaField({
        level: new fields.NumberField({
          required: true,
          initial: 1,
          min: 1,
          max: CONFIG.VAGABOND.homebrew?.leveling?.maxLevel ?? 10,
          integer: true
        }),
        spells: new fields.NumberField({
          required: true,
          initial: 0,
          min: 0,
          integer: true
        })
      }),
      { initial: [] }
    );

    return schema;
  }

  static migrateData(source) {
    for (const key of ['levelFeatures', 'levelSpells']) {
      if (source[key] == null) continue;
      if (!Array.isArray(source[key])) source[key] = Object.values(source[key]);
      source[key] = source[key].filter(f => f != null);
    }
    return super.migrateData(source);
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
