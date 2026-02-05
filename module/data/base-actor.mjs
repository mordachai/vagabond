export default class VagabondActorBase extends foundry.abstract
  .TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VAGABOND.Actor.base"];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = {};

    schema.health = new fields.SchemaField({
      value: new fields.NumberField({
        ...requiredInteger,
        initial: 10,
        min: 0,
      }),
      max: new fields.NumberField({ ...requiredInteger, initial: 10 }),
      bonus: new fields.StringField({
        initial: '',
        blank: true,
        label: "HP Bonus",
        hint: "Flat bonus to maximum HP. Can be a number (e.g., 1, 5) or formula (e.g., @attributes.level.value * 2)"
      }),
    });
    schema.power = new fields.SchemaField({
      value: new fields.NumberField({ ...requiredInteger, initial: 5, min: 0 }),
      max: new fields.NumberField({ ...requiredInteger, initial: 5 }),
    });
    schema.fatigue = new fields.NumberField({
      ...requiredInteger,
      initial: 0,
      min: 0,
      max: 5,
    });
    schema.biography = new fields.HTMLField();

    return schema;
  }

  prepareBaseData() {
    // Reset derived fields that might be targets of Active Effects
    // This ensures we don't accumulate values from previous save/load cycles
    // when adding calculated values in prepareDerivedData.
    if (this.health) this.health.max = 0;
  }
}
