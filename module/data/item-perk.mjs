import VagabondItemBase from './base-item.mjs';

export default class VagabondPerk extends VagabondItemBase {
  static LOCALIZATION_PREFIXES = [
    'VAGABOND.Item.base',
    'VAGABOND.Item.Perk',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredString = { required: true, nullable: false };
    const schema = super.defineSchema();

    // Prerequisites - complex structure supporting multiple types
    schema.prerequisites = new fields.SchemaField({
      // Stat prerequisites - e.g., "DEX 5+"
      stats: new fields.ArrayField(
        new fields.SchemaField({
          stat: new fields.StringField({
            ...requiredString,
            initial: 'might',
            choices: ['might', 'dexterity', 'awareness', 'reason', 'presence', 'luck']
          }),
          value: new fields.NumberField({
            required: true,
            initial: 1,
            min: 1,
            max: 10,
            integer: true
          })
        }),
        { initial: [] }
      ),

      // Trained skill prerequisites - e.g., "Trained: Ranged"
      trainedSkills: new fields.ArrayField(
        new fields.StringField({
          required: true,
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
            performance: 'VAGABOND.Skills.Performance',
            // Weapon skills (from WeaponSkills)
            melee: 'VAGABOND.WeaponSkills.Melee',
            ranged: 'VAGABOND.WeaponSkills.Ranged'
          }
        }),
        { initial: [] }
      ),

      // Spell prerequisites - e.g., "Spell: Fireball"
      spells: new fields.ArrayField(
        new fields.StringField({ initial: '' }),
        { initial: [] }
      ),

      // Other prerequisites - free-form text
      other: new fields.ArrayField(
        new fields.StringField({ initial: '' }),
        { initial: [] }
      )
    });

    return schema;
  }

  prepareDerivedData() {
    // Calculate total prerequisite count for UI purposes
    this.prerequisiteCount =
      this.prerequisites.stats.length +
      this.prerequisites.trainedSkills.length +
      this.prerequisites.spells.length +
      this.prerequisites.other.length;
  }

  /**
   * Get formatted prerequisite string for display
   * @returns {string} Formatted prerequisites like "DEX 5+; Trained: Ranged"
   */
  getPrerequisiteString() {
    const parts = [];

    // Format stat prerequisites
    if (this.prerequisites.stats.length > 0) {
      const statStrings = this.prerequisites.stats.map(s => {
        const abbr = CONFIG.VAGABOND.statAbbreviations[s.stat];
        const localizedAbbr = game.i18n.localize(abbr);
        return `${localizedAbbr} ${s.value}+`;
      });
      parts.push(statStrings.join('; '));
    }

    // Format trained skill prerequisites
    if (this.prerequisites.trainedSkills.length > 0) {
      const skillNames = this.prerequisites.trainedSkills.map(skill => {
        const skillKey = skill.charAt(0).toUpperCase() + skill.slice(1);
        // Try WeaponSkills first, then Skills
        const skillLabel = CONFIG.VAGABOND.weaponSkills?.[skillKey] ||
                          CONFIG.VAGABOND.skills?.[skillKey] ||
                          skill;
        return game.i18n.localize(skillLabel);
      });
      parts.push(`Trained: ${skillNames.join(', ')}`);
    }

    // Format spell prerequisites
    if (this.prerequisites.spells.length > 0) {
      parts.push(`Spell: ${this.prerequisites.spells.join(', ')}`);
    }

    // Format other prerequisites
    if (this.prerequisites.other.length > 0) {
      parts.push(this.prerequisites.other.join(', '));
    }

    return parts.join('; ');
  }

  /**
   * Add a stat prerequisite
   */
  async addStatPrerequisite(stat = 'might', value = 1) {
    const newStats = [...this.prerequisites.stats, { stat, value }];
    await this.parent.update({ 'system.prerequisites.stats': newStats });
  }

  /**
   * Remove a stat prerequisite by index
   */
  async removeStatPrerequisite(index) {
    if (index < 0 || index >= this.prerequisites.stats.length) return;
    const newStats = this.prerequisites.stats.filter((_, i) => i !== index);
    await this.parent.update({ 'system.prerequisites.stats': newStats });
  }

  /**
   * Add a trained skill prerequisite
   */
  async addTrainedSkillPrerequisite(skill = 'arcana') {
    const newSkills = [...this.prerequisites.trainedSkills, skill];
    await this.parent.update({ 'system.prerequisites.trainedSkills': newSkills });
  }

  /**
   * Remove a trained skill prerequisite by index
   */
  async removeTrainedSkillPrerequisite(index) {
    if (index < 0 || index >= this.prerequisites.trainedSkills.length) return;
    const newSkills = this.prerequisites.trainedSkills.filter((_, i) => i !== index);
    await this.parent.update({ 'system.prerequisites.trainedSkills': newSkills });
  }

  /**
   * Add a spell prerequisite
   */
  async addSpellPrerequisite(spellName = '') {
    const newSpells = [...this.prerequisites.spells, spellName];
    await this.parent.update({ 'system.prerequisites.spells': newSpells });
  }

  /**
   * Remove a spell prerequisite by index
   */
  async removeSpellPrerequisite(index) {
    if (index < 0 || index >= this.prerequisites.spells.length) return;
    const newSpells = this.prerequisites.spells.filter((_, i) => i !== index);
    await this.parent.update({ 'system.prerequisites.spells': newSpells });
  }

  /**
   * Add an other prerequisite
   */
  async addOtherPrerequisite(text = '') {
    const newOther = [...this.prerequisites.other, text];
    await this.parent.update({ 'system.prerequisites.other': newOther });
  }

  /**
   * Remove an other prerequisite by index
   */
  async removeOtherPrerequisite(index) {
    if (index < 0 || index >= this.prerequisites.other.length) return;
    const newOther = this.prerequisites.other.filter((_, i) => i !== index);
    await this.parent.update({ 'system.prerequisites.other': newOther });
  }
}
