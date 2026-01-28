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

      // Stat OR groups - e.g., [[{stat: "might", value: 5}, {stat: "dexterity", value: 5}]]
      statOrGroups: new fields.ArrayField(
        new fields.ArrayField(
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
          })
        ),
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

      // Trained skill OR groups - e.g., [["melee", "ranged"]] means "Melee OR Ranged"
      trainedSkillOrGroups: new fields.ArrayField(
        new fields.ArrayField(
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
          })
        ),
        { initial: [] }
      ),

      // Spell prerequisites - stores spell UUIDs to prevent misspelling
      // e.g., "Compendium.vagabond.spells.Item.xyz123"
      spells: new fields.ArrayField(
        new fields.StringField({
          initial: '',
          blank: true // Allow empty strings for new entries before selection
        }),
        { initial: [] }
      ),

      // Spell OR groups - e.g., [["uuid1", "uuid2"]] means "Fireball OR Lightning Bolt"
      spellOrGroups: new fields.ArrayField(
        new fields.ArrayField(
          new fields.StringField({
            initial: '',
            blank: true
          })
        ),
        { initial: [] }
      ),

      // Has any spell - simple boolean flag for "must know at least one spell"
      hasAnySpell: new fields.BooleanField({
        initial: false
      }),

      // Resource prerequisites - e.g., "Max Mana 20+", "Wealth 500s+"
      resources: new fields.ArrayField(
        new fields.SchemaField({
          resourceType: new fields.StringField({
            ...requiredString,
            initial: 'maxMana',
            choices: {
              maxMana: 'VAGABOND.ResourceTypes.MaxMana',
              manaPerCast: 'VAGABOND.ResourceTypes.ManaPerCast',
              wealth: 'VAGABOND.ResourceTypes.Wealth',
              inventorySlots: 'VAGABOND.ResourceTypes.InventorySlots',
              speed: 'VAGABOND.ResourceTypes.Speed',
              maxHP: 'VAGABOND.ResourceTypes.MaxHP',
              currentLuck: 'VAGABOND.ResourceTypes.CurrentLuck'
            }
          }),
          minimum: new fields.NumberField({
            required: true,
            initial: 1,
            min: 0,
            integer: true
          })
        }),
        { initial: [] }
      ),

      // Resource OR groups - e.g., [[{resourceType: "maxMana", minimum: 20}, {resourceType: "wealth", minimum: 500}]]
      resourceOrGroups: new fields.ArrayField(
        new fields.ArrayField(
          new fields.SchemaField({
            resourceType: new fields.StringField({
              ...requiredString,
              initial: 'maxMana',
              choices: {
                maxMana: 'VAGABOND.ResourceTypes.MaxMana',
                manaPerCast: 'VAGABOND.ResourceTypes.ManaPerCast',
                wealth: 'VAGABOND.ResourceTypes.Wealth',
                inventorySlots: 'VAGABOND.ResourceTypes.InventorySlots',
                speed: 'VAGABOND.ResourceTypes.Speed',
                maxHP: 'VAGABOND.ResourceTypes.MaxHP',
                currentLuck: 'VAGABOND.ResourceTypes.CurrentLuck'
              }
            }),
            minimum: new fields.NumberField({
              required: true,
              initial: 1,
              min: 0,
              integer: true
            })
          })
        ),
        { initial: [] }
      )
    });

    return schema;
  }

  prepareDerivedData() {
    // Calculate total prerequisite count for UI purposes
    this.prerequisiteCount =
      this.prerequisites.stats.length +
      this.prerequisites.statOrGroups.length +
      this.prerequisites.trainedSkills.length +
      this.prerequisites.trainedSkillOrGroups.length +
      this.prerequisites.spells.length +
      this.prerequisites.spellOrGroups.length +
      (this.prerequisites.hasAnySpell ? 1 : 0) +
      this.prerequisites.resources.length +
      this.prerequisites.resourceOrGroups.length;
  }

  /**
   * Get formatted prerequisite string for display
   * @returns {Promise<string>} Formatted prerequisites like "DEX 5+; Trained: Ranged"
   */
  async getPrerequisiteString() {
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

    // Format stat OR groups
    if (this.prerequisites.statOrGroups?.length > 0) {
      const orGroupStrings = this.prerequisites.statOrGroups.map(orGroup => {
        const statStrings = orGroup.map(s => {
          const abbr = CONFIG.VAGABOND.statAbbreviations[s.stat];
          const localizedAbbr = game.i18n.localize(abbr);
          return `${localizedAbbr} ${s.value}+`;
        });
        return `(${statStrings.join(' or ')})`;
      });
      parts.push(orGroupStrings.join('; '));
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

    // Format trained skill OR groups
    if (this.prerequisites.trainedSkillOrGroups?.length > 0) {
      const orGroupStrings = this.prerequisites.trainedSkillOrGroups.map(orGroup => {
        const skillNames = orGroup.map(skill => {
          const skillKey = skill.charAt(0).toUpperCase() + skill.slice(1);
          const skillLabel = CONFIG.VAGABOND.weaponSkills?.[skillKey] ||
                            CONFIG.VAGABOND.skills?.[skillKey] ||
                            skill;
          return game.i18n.localize(skillLabel);
        });
        return `(${skillNames.join(' or ')})`;
      });
      parts.push(`Trained: ${orGroupStrings.join('; ')}`);
    }

    // Format "has any spell" prerequisite
    if (this.prerequisites.hasAnySpell) {
      parts.push('Has Any Spell');
    }

    // Format spell prerequisites - resolve UUIDs to spell names
    if (this.prerequisites.spells.length > 0) {
      const spellNames = [];
      for (const uuid of this.prerequisites.spells) {
        if (!uuid) continue; // Skip empty strings
        try {
          const spell = await fromUuid(uuid);
          if (spell) {
            spellNames.push(spell.name);
          } else {
            spellNames.push('[Unknown Spell]');
          }
        } catch (error) {
          console.warn(`Failed to resolve spell UUID: ${uuid}`, error);
          spellNames.push('[Invalid UUID]');
        }
      }
      if (spellNames.length > 0) {
        parts.push(`Spell: ${spellNames.join(', ')}`);
      }
    }

    // Format spell OR groups
    if (this.prerequisites.spellOrGroups?.length > 0) {
      const orGroupStrings = [];
      for (const orGroup of this.prerequisites.spellOrGroups) {
        const spellNames = [];
        for (const uuid of orGroup) {
          if (!uuid) continue;
          try {
            const spell = await fromUuid(uuid);
            if (spell) {
              spellNames.push(spell.name);
            } else {
              spellNames.push('[Unknown Spell]');
            }
          } catch (error) {
            console.warn(`Failed to resolve spell UUID: ${uuid}`, error);
            spellNames.push('[Invalid UUID]');
          }
        }
        if (spellNames.length > 0) {
          orGroupStrings.push(`(${spellNames.join(' or ')})`);
        }
      }
      if (orGroupStrings.length > 0) {
        parts.push(`Spell: ${orGroupStrings.join('; ')}`);
      }
    }

    // Format resource prerequisites
    if (this.prerequisites.resources.length > 0) {
      const resourceStrings = this.prerequisites.resources.map(r => {
        const resourceLabel = CONFIG.VAGABOND.resourceTypes?.[r.resourceType] || r.resourceType;
        const localizedLabel = game.i18n.localize(resourceLabel);
        return `${localizedLabel} ${r.minimum}+`;
      });
      parts.push(resourceStrings.join('; '));
    }

    // Format resource OR groups
    if (this.prerequisites.resourceOrGroups?.length > 0) {
      const orGroupStrings = this.prerequisites.resourceOrGroups.map(orGroup => {
        const resourceStrings = orGroup.map(r => {
          const resourceLabel = CONFIG.VAGABOND.resourceTypes?.[r.resourceType] || r.resourceType;
          const localizedLabel = game.i18n.localize(resourceLabel);
          return `${localizedLabel} ${r.minimum}+`;
        });
        return `(${resourceStrings.join(' or ')})`;
      });
      parts.push(orGroupStrings.join('; '));
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
   * Add a resource prerequisite
   */
  async addResourcePrerequisite(resourceType = 'maxMana', minimum = 1) {
    const newResources = [...this.prerequisites.resources, { resourceType, minimum }];
    await this.parent.update({ 'system.prerequisites.resources': newResources });
  }

  /**
   * Remove a resource prerequisite by index
   */
  async removeResourcePrerequisite(index) {
    if (index < 0 || index >= this.prerequisites.resources.length) return;
    const newResources = this.prerequisites.resources.filter((_, i) => i !== index);
    await this.parent.update({ 'system.prerequisites.resources': newResources });
  }
}
