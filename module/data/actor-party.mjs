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
    // Where the automatic speeds come from: the slowest member, or the party's container (wagon, mount…)
    schema.speedSource = new fields.StringField({ required: true, initial: 'party', choices: ['party', 'container'] });

    // Travel (book Exploration): the Group uses its Navigator's Travel Speed (member uuid, '' = none
    // picked → slowest member); the Pace multiplies the miles per Shift; Hazardous Lands halve them.
    schema.navigator = new fields.StringField({ required: true, blank: true, initial: '' });
    schema.pace = new fields.StringField({ required: true, initial: 'normal', choices: ['slow', 'normal', 'fast'] });
    schema.hazardous = new fields.BooleanField({ required: true, initial: false });
    // Shifts Travelled since the last Rest (book: Travel Clocks are 4-segment Shift Clocks;
    // two Shifts per Rest, each further one gives 1 Fatigue). The GM resets it after a Rest.
    schema.travelShifts = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    // Shifts the GM grants the party for its next downtime (pushed to every Character by the sheet's Downtime button)
    schema.shifts = new fields.NumberField({ ...requiredInteger, initial: 1, min: 1 });

    // Party treasury — shared funds (shop split payments, member transfers)
    schema.currency = new fields.SchemaField({
      gold: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      silver: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      copper: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
    });

    return schema;
  }
}
