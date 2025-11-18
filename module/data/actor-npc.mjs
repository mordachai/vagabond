import VagabondActorBase from './base-actor.mjs';

export default class VagabondNPC extends VagabondActorBase {
  static LOCALIZATION_PREFIXES = [
    ...super.LOCALIZATION_PREFIXES,
    'VAGABOND.Actor.NPC',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.cr = new fields.NumberField({
      ...requiredInteger,
      initial: 1,
      min: 0,
    });

    // NPC size
    schema.size = new fields.StringField({
      initial: 'medium',
      choices: ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']
    });

    // NPC being type
    schema.beingType = new fields.StringField({
      initial: 'Humanlike',
      choices: ['Humanlike', 'Fae', 'Cryptid', 'Artificials', 'Beasts', 'Outers', 'Primordials', 'Undead']
    });

    // NPC abilities (simplified compared to characters)
    schema.abilities = new fields.SchemaField(
      Object.keys(CONFIG.VAGABOND.abilities).reduce((obj, ability) => {
        obj[ability] = new fields.SchemaField({
          value: new fields.NumberField({
            ...requiredInteger,
            initial: 8,
            min: 1,
            max: 12,
          }),
        });
        return obj;
      }, {})
    );

    return schema;
  }

  prepareDerivedData() {
    this.xp = this.cr * this.cr * 100;

    // Loop through ability scores and add labels
    for (const key in this.abilities) {
      this.abilities[key].label =
        game.i18n.localize(CONFIG.VAGABOND.abilities[key]) ?? key;
    }
  }
}
