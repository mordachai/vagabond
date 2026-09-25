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

    // Shared notes — visible and editable by all party Owners, readable by Observers
    schema.sharedNotes = new fields.HTMLField({ initial: '', nullable: true });

    // Party descriptor and travel speeds (shown in sheet header)
    schema.type   = new fields.StringField({ initial: '', label: 'Party Type' });
    schema.speed  = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.crawl  = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });
    schema.travel = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    // Party treasury — shared funds (shop split payments, member transfers)
    schema.currency = new fields.SchemaField({
      gold: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      silver: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      copper: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
    });

    return schema;
  }
}
