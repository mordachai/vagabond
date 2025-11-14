import VagabondItemBase from './base-item.mjs';

export default class VagabondClass extends VagabondItemBase {
  static LOCALIZATION_PREFIXES = [
    'VAGABOND.Item.base',
    'VAGABOND.Item.Class',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = super.defineSchema();

    // Is this class a spellcaster?
    schema.isSpellcaster = new fields.BooleanField({
      initial: false,
      label: 'VAGABOND.Item.Class.FIELDS.isSpellcaster.label',
      hint: 'VAGABOND.Item.Class.FIELDS.isSpellcaster.hint'
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

    return schema;
  }

  prepareDerivedData() {
    // Add any calculations or derived data here
  }
}
