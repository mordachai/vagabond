export default class VagabondItemBase extends foundry.abstract
  .TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.description = new fields.HTMLField();

    return schema;
  }

  /**
   * Disguise (`ItemDisguise`, helpers/item-disguise.mjs) — equipment + containers only. While `active`, the item's
   * own name / img / description / lore and its effects' name / img / description ARE the disguise and `truth`
   * holds the real ones. `shown` = the disguise draft / last disguise (GM edits kept for the next time). Both are
   * `{name, img, description, lore, effects: {[effectId]: {name, img, description}}}`.
   */
  static disguiseField() {
    const fields = foundry.data.fields;
    return new fields.SchemaField({
      active: new fields.BooleanField({ initial: false }),
      // While disguised, players can't equip or use it (GM switch "Can't be equipped until identified")
      lockUse: new fields.BooleanField({ initial: false }),
      shown: new fields.ObjectField({ initial: {} }),
      truth: new fields.ObjectField({ initial: {} }),
    });
  }
}
