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
      bonus: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        {
          initial: [],
          label: "HP Bonus",
          hint: "Flat bonus to maximum HP. Can be a number (e.g., 1, 5) or formula (e.g., @attributes.level.value * 2)"
        }
      ),
    });
    schema.fatigue = new fields.NumberField({
      ...requiredInteger,
      initial: 0,
      min: 0,
    });
    schema.fatigueBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Fatigue Max Bonus",
        hint: "Bonus to maximum fatigue. Can be a number or formula."
      }
    );
    schema.biography = new fields.HTMLField();

    // Shared by every actor type so one Active Effect key works on characters and NPCs alike
    // (spell Trackers: Hastened / Slowed / Frozen, Blessed).
    schema.speedModifier = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Speed Modifier",
        hint: "Added to Speed (negative slows). Number or formula. Works on characters and NPCs."
      }
    );
    schema.saveBonusDice = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Save Bonus Dice",
        hint: "Dice added to every Save (e.g. 1d4 for Bless). Read by VagabondRollBuilder.saveBaseDie."
      }
    );

    // Materials every weapon this actor wields also counts as, for Weakness (ADD a key from
    // CONFIG.VAGABOND.materialWeaknesses, e.g. 'silver' — Revelator Holy Diver: wielded Weapons are Blessed).
    schema.weaponsCountAs = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Wielded Weapons Count As",
        hint: "Material keys (e.g. silver) every weapon this actor wields counts as for Weakness."
      }
    );

    return schema;
  }

  prepareBaseData() {
    // Reset derived fields that might be targets of Active Effects
    // This ensures we don't accumulate values from previous save/load cycles
    // when adding calculated values in prepareDerivedData.
    if (this.health) this.health.max = 0;
    this.speedModifier = [];
    this.saveBonusDice = [];
    this.weaponsCountAs = [];
  }
}
