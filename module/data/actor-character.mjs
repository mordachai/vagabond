import VagabondActorBase from './base-actor.mjs';

export default class VagabondCharacter extends VagabondActorBase {
  static LOCALIZATION_PREFIXES = [
    ...super.LOCALIZATION_PREFIXES,
    'VAGABOND.Actor.Character',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.attributes = new fields.SchemaField({
      level: new fields.SchemaField({
        value: new fields.NumberField({ ...requiredInteger, initial: 1 }),
      }),
    });

    // Iterate over ability names and create a new SchemaField for each.
    // Now using Vagabond stats instead of D&D abilities
    schema.abilities = new fields.SchemaField(
      Object.keys(CONFIG.VAGABOND.abilities).reduce((obj, ability) => {
        obj[ability] = new fields.SchemaField({
          value: new fields.NumberField({
            ...requiredInteger,
            initial: 8,  // Starting value for Vagabond stats
            min: 1,
            max: 12,     // Based on the stat generation table in the rules
          }),
        });
        return obj;
      }, {})
    );

    // Skills system - organized by associated stats
    schema.skills = new fields.SchemaField({
      // Reason-based skills
      arcana: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'reason', readonly: true })
      }),
      craft: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'reason', readonly: true })
      }),
      medicine: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'reason', readonly: true })
      }),
      
      // Might-based skills
      brawl: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'might', readonly: true })
      }),
      
      // Dexterity-based skills
      finesse: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'dexterity', readonly: true })
      }),
      sneak: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'dexterity', readonly: true })
      }),
      
      // Awareness-based skills
      detect: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'awareness', readonly: true })
      }),
      mysticism: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'awareness', readonly: true })
      }),
      survival: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'awareness', readonly: true })
      }),
      
      // Presence-based skills
      influence: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'presence', readonly: true })
      }),
      leadership: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'presence', readonly: true })
      }),
      performance: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'presence', readonly: true })
      })
    });

    return schema;
  }

  prepareDerivedData() {
    // Loop through ability scores and add labels
    for (const key in this.abilities) {
      // NO MODIFIER CALCULATION - Vagabond uses raw values
      // Handle ability label localization.
      this.abilities[key].label =
        game.i18n.localize(CONFIG.VAGABOND.abilities[key]) ?? key;
    }

    // Process skills - calculate difficulty based on Vagabond rules
    for (const key in this.skills) {
      const skill = this.skills[key];
      const associatedStat = this.abilities[skill.stat];
      const statValue = associatedStat?.value || 8;
      
      // Vagabond difficulty calculation:
      // Difficulty = 20 - Stat (untrained)
      // Difficulty = 20 - (Stat × 2) (trained)
      skill.difficulty = 20 - (skill.trained ? statValue * 2 : statValue);
      
      // Add label for localization
      skill.label = game.i18n.localize(`VAGABOND.Skills.${key.charAt(0).toUpperCase() + key.slice(1)}`) ?? key;
    }
  }

  getRollData() {
    const data = {};

    // Copy the ability scores to the top level, so that rolls can use
    // formulas like `@might + 4` (using raw values, not modifiers).
    if (this.abilities) {
      for (let [k, v] of Object.entries(this.abilities)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }

    // Copy skills to the top level for roll formulas
    if (this.skills) {
      for (let [k, v] of Object.entries(this.skills)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }

    data.lvl = this.attributes.level.value;

    return data;
  }
}
