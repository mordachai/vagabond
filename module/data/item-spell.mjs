import VagabondItemBase from './base-item.mjs';

export default class VagabondSpell extends VagabondItemBase {
  static LOCALIZATION_PREFIXES = [
    'VAGABOND.Item.base',
    'VAGABOND.Item.Spell',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredString = { required: true, nullable: false, blank: true };
    const schema = super.defineSchema();

    // Damage Type - type of damage/healing the spell provides
    // Uses centralized CONFIG.VAGABOND.damageTypes
    schema.damageType = new fields.StringField({
      ...requiredString,
      initial: '-',
      choices: CONFIG.VAGABOND?.damageTypes || {
        '-': 'None',
        'acid': 'Acid',
        'fire': 'Fire',
        'shock': 'Shock',
        'poison': 'Poison',
        'cold': 'Cold',
        'blunt': 'Blunt',
        'piercing': 'Piercing',
        'slashing': 'Slashing',
        'physical': 'Physical',
        'necrotic': 'Necrotic',
        'psychic': 'Psychic',
        'healing': 'Healing',
        'recover': 'Recover',
        'recharge': 'Recharge'
      }
    });

    // Duration - how long the spell lasts
    schema.duration = new fields.StringField({
      ...requiredString,
      initial: 'Until your next turn'
    });

    // Crit - critical success effect
    schema.crit = new fields.StringField({
      ...requiredString,
      initial: ''
    });

    // Favorite - mark spell as favorite
    schema.favorite = new fields.BooleanField({
      required: true,
      initial: false
    });

    return schema;
  }
}
