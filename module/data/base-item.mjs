import VagabondDataModel from "./base-model.mjs";

export default class VagabondItemBase extends VagabondDataModel {

  static defineSchema() {
    const fields = foundry.data.fields;
    const schema = {};

    schema.description = new fields.StringField({ required: true, blank: true });

    return schema;
  }

}