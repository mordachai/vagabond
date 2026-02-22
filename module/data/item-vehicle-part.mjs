import VagabondItemBase from './base-item.mjs';

export default class VagabondVehiclePart extends VagabondItemBase {
  static LOCALIZATION_PREFIXES = [
    'VAGABOND.Item.VehiclePart',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    // Part HP
    schema.health = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 10, min: 0, label: 'HP' }),
      max: new fields.NumberField({ ...requiredInteger, initial: 10, label: 'Max HP' }),
    });

    // Armor value (damage reduction)
    schema.armor = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0, label: 'Armor' });

    // Crew members: each entry stores the actor UUID and the weapon skill they use.
    schema.crew = new fields.ArrayField(
      new fields.SchemaField({
        uuid:  new fields.StringField({ required: true, blank: false }),
        skill: new fields.StringField({ initial: 'melee', blank: false }),
      }),
      { initial: [], label: 'Crew' }
    );

    // Flat modifier added to crew attack rolls
    schema.attackModifier = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
      label: 'Attack Modifier'
    });

    // Damage formula (e.g. "2d6", "1d8+3")
    schema.damageFormula = new fields.StringField({ initial: '1d6', blank: false, label: 'Damage Formula' });

    // Damage type key from CONFIG.VAGABOND.damageTypes
    schema.damageType = new fields.StringField({ initial: 'physical', label: 'Damage Type' });

    return schema;
  }

  /**
   * Migrate old crew data: plain UUID strings → {uuid, skill} objects.
   * This handles data saved before the schema was changed to SchemaField.
   */
  static migrateData(data) {
    if (Array.isArray(data.crew)) {
      data.crew = data.crew.map(entry => {
        if (typeof entry === 'string') return { uuid: entry, skill: 'melee' };
        return entry;
      });
    }
    return super.migrateData(data);
  }
}
