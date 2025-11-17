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

    // Damage Base - type of damage the spell deals
    schema.damageBase = new fields.StringField({
      ...requiredString,
      initial: '-',
      choices: {
        '-': 'None',
        'acid': 'Acid',
        'fire': 'Fire',
        'shock': 'Shock',
        'poison': 'Poison',
        'cold': 'Cold',
        'blunt': 'Blunt',
        'physical': 'Physical',
        'necrotic': 'Necrotic'
      }
    });

    // Delivery - how the spell is delivered
    schema.delivery = new fields.SchemaField({
      type: new fields.StringField({
        required: true,
        nullable: false,
        initial: 'touch',
        blank: false,
        choices: {
          'aura': 'Aura',
          'cone': 'Cone',
          'cube': 'Cube',
          'imbue': 'Imbue',
          'glyph': 'Glyph',
          'line': 'Line',
          'remote': 'Remote',
          'sphere': 'Sphere',
          'touch': 'Touch'
        }
      }),
      cost: new fields.NumberField({
        required: true,
        nullable: false,
        integer: true,
        initial: 0,
        min: 0
      }),
      increase: new fields.StringField({
        required: false,
        nullable: false,
        initial: '',
        blank: true
      })
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
