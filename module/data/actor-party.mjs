import VagabondActorBase from './base-actor.mjs';

export default class VagabondParty extends VagabondActorBase {
  static LOCALIZATION_PREFIXES = [
    ...super.LOCALIZATION_PREFIXES,
    'VAGABOND.Actor.Party',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    // Array of Actor UUIDs belonging to this party
    schema.members = new fields.ArrayField(
      new fields.StringField({ required: true, blank: false }),
      { initial: [], label: 'Party Members' }
    );

    // Vehicle stats
    schema.vehicle = new fields.SchemaField({
      type: new fields.StringField({ initial: '', label: 'Vehicle Type' }),
      speed: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0, label: 'Speed' }),
      crawl: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0, label: 'Crawl Speed' }),
      travel: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0, label: 'Travel Speed' }),
    });

    return schema;
  }
}
