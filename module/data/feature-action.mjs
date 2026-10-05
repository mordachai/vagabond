/**
 * Schema for the optional action button on a class feature, ancestry trait or perk
 * (see helpers/feature-action.mjs). Same shape as an item macro slot plus an icon.
 * @returns {foundry.data.fields.SchemaField}
 */
export function featureActionSchema() {
  const fields = foundry.data.fields;
  return new fields.SchemaField({
    enabled: new fields.BooleanField({ initial: false }),
    label:   new fields.StringField({ blank: true, initial: '' }),
    // Font Awesome name, e.g. "music" or "fa-music" (blank = bolt)
    icon:    new fields.StringField({ blank: true, initial: '' }),
    // A Macro document UUID (preferred) or an inline script
    uuid:    new fields.StringField({ blank: true, initial: '' }),
    command: new fields.StringField({ blank: true, initial: '' }),
    // Non-GM clicks relay to the GM client (see item-macro.mjs)
    runAsGM: new fields.BooleanField({ initial: false }),
  });
}
