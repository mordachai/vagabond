import VagabondActorBase from './base-actor.mjs';

export default class VagabondNPC extends VagabondActorBase {
  static LOCALIZATION_PREFIXES = [
    ...super.LOCALIZATION_PREFIXES,
    'VAGABOND.Actor.NPC',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.cr = new fields.NumberField({
      ...requiredInteger,
      initial: 1,
      min: 0,
    });

    // NPC size
    schema.size = new fields.StringField({
      initial: 'medium',
      choices: ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']
    });

    // NPC being type
    schema.beingType = new fields.StringField({
      initial: 'Humanlike',
      choices: ['Humanlike', 'Fae', 'Cryptid', 'Artificials', 'Beasts', 'Outers', 'Primordials', 'Undead']
    });

    // NPC stats (simplified compared to characters)
    schema.stats = new fields.SchemaField(
      Object.keys(CONFIG.VAGABOND.stats).reduce((obj, stat) => {
        obj[stat] = new fields.SchemaField({
          value: new fields.NumberField({
            ...requiredInteger,
            initial: 8,
            min: 1,
            max: 12,
          }),
        });
        return obj;
      }, {})
    );

    // NPC-specific fields
    schema.hd = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 1,
      min: 0,
    });

    schema.morale = new fields.NumberField({
      required: false,
      nullable: true,
      integer: true,
      initial: null,
      min: 0,
      max: 12,
    });

    schema.appearing = new fields.StringField({
      required: false,
      nullable: false,
      initial: '',
    });

    schema.speed = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 30,
      min: 0,
    });

    schema.senses = new fields.StringField({
      required: false,
      nullable: false,
      initial: '',
    });

    // Locked/unlocked mode toggle
    schema.locked = new fields.BooleanField({
      required: true,
      initial: false,
    });

    // Track last HD/size to detect changes for HP recalculation
    schema._lastHD = new fields.NumberField({
      required: false,
      nullable: true,
      initial: null,
    });

    schema._lastSize = new fields.StringField({
      required: false,
      nullable: true,
      initial: null,
    });

    return schema;
  }

  prepareDerivedData() {
    this.xp = this.cr * this.cr * 100;

    // Loop through stats and add labels
    for (const key in this.stats) {
      this.stats[key].label =
        game.i18n.localize(CONFIG.VAGABOND.stats[key]) ?? key;
    }

    // Calculate HP based on HD and size
    // If size is small/tiny: HD * 1, otherwise: HD * 4.5 (rounded down)
    const isSmall = this.size === 'tiny' || this.size === 'small';
    this.calculatedMaxHP = isSmall ? this.hd : Math.floor(this.hd * 4.5);

    // Auto-update HP when HD or size changes
    const hdChanged = this._lastHD !== null && this._lastHD !== this.hd;
    const sizeChanged = this._lastSize !== null && this._lastSize !== this.size;

    if (this._lastHD === null || hdChanged || sizeChanged) {
      // First time, or HD/size changed - recalculate HP
      this.health.max = this.calculatedMaxHP;
    }

    // Store current values for next comparison (will be persisted on next update)
    if (this.parent && (hdChanged || sizeChanged || this._lastHD === null)) {
      // We need to update the stored values, but we can't do it here directly
      // The parent actor will handle this in an update hook
      this._needsTrackingUpdate = true;
    }

    // Format appearing for display in locked mode
    if (this.locked && this.appearing) {
      this.appearingFormatted = this.formatAppearing(this.appearing);
    } else {
      this.appearingFormatted = this.appearing;
    }
  }

  /**
   * Format appearing field for dice rolls
   * Converts "d6" to "[[/r d6]]", "2d8" to "[[/r 2d8]]", etc.
   */
  formatAppearing(appearing) {
    if (!appearing) return '';

    // Check if it's already a roll link
    if (appearing.includes('[[/r')) return appearing;

    // Check if it matches dice notation (e.g., "d6", "2d8", "3d10")
    const dicePattern = /^(\d*)d(\d+)$/i;
    if (dicePattern.test(appearing.trim())) {
      return `[[/r ${appearing.trim()}]]`;
    }

    // If it's just a number, return as-is
    return appearing;
  }
}
