import VagabondActorBase from './base-actor.mjs';

export default class VagabondConstruct extends VagabondActorBase {
  static LOCALIZATION_PREFIXES = [
    ...super.LOCALIZATION_PREFIXES,
    'VAGABOND.Actor.Construct',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    // Construct type label (e.g. "Galleon", "Mech", "Fortress")
    schema.type = new fields.StringField({ initial: '', label: 'Construct Type' });

    // Kind (CONFIG.VAGABOND.constructKinds): mount / vehicle / vessel / structure
    schema.kind = new fields.StringField({ initial: 'vehicle', blank: false, label: 'Kind' });

    // Movement speeds
    schema.speed = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0, label: 'Speed' });
    schema.crawl = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0, label: 'Crawl Speed' });
    schema.travel = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0, label: 'Travel Speed' });

    return schema;
  }
}
