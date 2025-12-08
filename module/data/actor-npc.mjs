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

    //TL - Threat Level
    schema.threatLevel = new fields.NumberField({
      required: true,
      nullable: false,
      initial: 0,
      min: 0,
      // Note: integer: true is intentionally omitted to allow decimals
    });

    // NPC size
    schema.size = new fields.StringField({
      initial: 'medium',
      choices: ['small', 'medium', 'large', 'huge', 'giant', 'colossal']
    });

    // NPC being type
    schema.beingType = new fields.StringField({
      initial: 'Humanlike',
      choices: ['Humanlike', 'Fae', 'Cryptid', 'Artificials', 'Beasts', 'Outers', 'Primordials', 'Undead']
    });

    // Speed types
    schema.speedTypes = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [] }
    );

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

    // Armor value and description
    schema.armor = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
      min: 0,
    });

    schema.armorDescription = new fields.StringField({
      required: false,
      nullable: false,
      initial: '',
    });

    // Locked/unlocked mode toggle
    schema.locked = new fields.BooleanField({
      required: true,
      initial: false,
    });

    // Damage immunities and weaknesses
    schema.immunities = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [] }
    );

    schema.weaknesses = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [] }
    );

    // Status immunities
    schema.statusImmunities = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [] }
    );

    // Combat zone
    schema.zone = new fields.StringField({
      required: false,
      nullable: true,
      initial: null,
      choices: ['frontline', 'midline', 'backline']
    });

    // Description
    schema.description = new fields.StringField({
      required: false,
      nullable: false,
      initial: '',
    });

    // Actions
    schema.actions = new fields.ArrayField(
      new fields.SchemaField({
        name: new fields.StringField({
          required: false,
          nullable: false,
          initial: '',
        }),
        description: new fields.StringField({
          required: false,
          nullable: false,
          initial: '',
        }),
        type: new fields.StringField({
          required: false,
          nullable: true,
          initial: null,
          choices: ['Melee', 'Ranged', 'Cast']
        }),
        range: new fields.StringField({
          required: false,
          nullable: true,
          initial: null,
        }),
        note: new fields.StringField({
          required: false,
          nullable: false,
          initial: '',
        }),
        saves: new fields.StringField({
          required: false,
          nullable: true,
          initial: null,
          choices: ['reflex', 'endure', 'will']
        }),
        recharge: new fields.StringField({
          required: false,
          nullable: false,
          initial: '',
        }),
        flatDamage: new fields.StringField({
          required: false,
          nullable: false,
          initial: '',
        }),
        rollDamage: new fields.StringField({
          required: false,
          nullable: false,
          initial: '',
        }),
        damageType: new fields.StringField({
          required: false,
          nullable: true,
          initial: null,
          choices: CONFIG.VAGABOND?.damageTypes || {
            '-': 'VAGABOND.DamageTypes.None',
            'acid': 'VAGABOND.DamageTypes.Acid',
            'fire': 'VAGABOND.DamageTypes.Fire',
            'shock': 'VAGABOND.DamageTypes.Shock',
            'poison': 'VAGABOND.DamageTypes.Poison',
            'cold': 'VAGABOND.DamageTypes.Cold',
            'blunt': 'VAGABOND.DamageTypes.Blunt',
            'piercing': 'VAGABOND.DamageTypes.Piercing',
            'slashing': 'VAGABOND.DamageTypes.Slashing',
            'physical': 'VAGABOND.DamageTypes.Physical',
            'necrotic': 'VAGABOND.DamageTypes.Necrotic',
            'psychic': 'VAGABOND.DamageTypes.Psychic',
            'healing': 'VAGABOND.DamageTypes.Healing'
          }
        }),
        extraInfo: new fields.StringField({
          required: false,
          nullable: false,
          initial: '',
        }),
      }),
      { required: true, initial: [] }
    );

    // Abilities
    schema.abilities = new fields.ArrayField(
      new fields.SchemaField({
        name: new fields.StringField({
          required: false,
          nullable: false,
          initial: '',
        }),
        description: new fields.StringField({
          required: false,
          nullable: false,
          initial: '',
        }),
      }),
      { required: true, initial: [] }
    );

    return schema;
  }

  prepareDerivedData() {
    this.xp = this.cr * this.cr * 100;

    // --- Format Threat Level to 2 decimal places (e.g., 1.60) ---
    this.threatLevelFormatted = (this.threatLevel || 0).toFixed(2);

    // Loop through stats and add labels
    for (const key in this.stats) {
      this.stats[key].label =
        game.i18n.localize(CONFIG.VAGABOND.stats[key]) ?? key;
    }

    // Calculate HP max based on HD and size
    // If size is small: HD * 1, otherwise: HD * 4.5 (rounded down)
    const isSmall = this.size === 'small';
    this.health.max = isSmall ? this.hd : Math.floor(this.hd * 4.5);

    // Format appearing for display in locked mode
    if (this.locked && this.appearing) {
      this.appearingFormatted = this.formatAppearing(this.appearing);
    } else {
      this.appearingFormatted = this.appearing;
    }

    // Format actions for display in locked mode
    if (this.locked && this.actions) {
      this.actions.forEach((action, index) => {
        action.rechargeFormatted = this.formatRecharge(action.recharge);
        action.rollDamageFormatted = this.formatRollDamage(action.rollDamage);
        action.extraInfoFormatted = this.formatExtraInfo(action.extraInfo);
      });
    }

    // Format abilities for display in locked mode
    if (this.locked && this.abilities) {
      this.abilities.forEach((ability, index) => {
        ability.descriptionFormatted = this.formatAbilityDescription(ability.description);
      });
    }

    // Prepare Speed Types for Locked Display (Label + Hint)
    if (this.speedTypes && this.speedTypes.length > 0) {
      this.speedTypesDisplay = this.speedTypes.map(key => {
        return {
          label: game.i18n.localize(CONFIG.VAGABOND.speedTypes[key]),
          hint: game.i18n.localize(CONFIG.VAGABOND.speedTypeHints[key])
        };
      });
    } else {
      this.speedTypesDisplay = [];
    }
  
  }

  /**
   * Format appearing field for dice rolls
   * Converts "d6" to "[[/r d6]]", "2d8" to "[[/r 2d8]]", etc.
   * DOES NOT convert "Cdx" patterns - those are for countdown dice
   */
  formatAppearing(appearing) {
    if (!appearing) return '';

    // Check if it's already a roll link
    if (appearing.includes('[[/r')) return appearing;

    // Check for countdown dice pattern first - don't convert these
    const countdownPattern = /^Cd(\d+)$/i;
    if (countdownPattern.test(appearing.trim())) {
      return appearing; // Return as-is, don't convert to roll
    }

    // Check if it matches dice notation (e.g., "d6", "2d8", "3d10")
    const dicePattern = /^(\d*)d(\d+)$/i;
    if (dicePattern.test(appearing.trim())) {
      return `[[/r ${appearing.trim()}]]`;
    }

    // If it's just a number, return as-is
    return appearing;
  }

  /**
   * Format recharge field for dice rolls or countdown dice triggers
   * Converts "Cd6" to clickable span for countdown dice creation
   * Converts "C2d6" to "[[/r 2d6]]" for roll links
   * If no 'C' prefix, just returns the value as-is (plain number)
   */
  formatRecharge(recharge) {
    if (!recharge) return '';

    // Check if it's already a roll link
    if (recharge.includes('[[/r')) return recharge;

    // Check for countdown dice pattern: Cd4, Cd6, Cd8, Cd10, Cd12, Cd20
    // This matches single dice only (no quantity prefix)
    const countdownPattern = /^Cd(\d+)$/i;
    const countdownMatch = recharge.trim().match(countdownPattern);

    if (countdownMatch) {
      const diceSize = countdownMatch[1];
      // Wrap in a clickable span with data-action for ApplicationV2 action routing
      return `<span class="countdown-dice-trigger" data-action="createCountdownFromRecharge" data-dice-type="d${diceSize}">${recharge}</span>`;
    }

    // Check if it matches dice notation with C prefix and quantity (e.g., "C2d8")
    // This won't match the countdown pattern above since it has no quantity
    const dicePattern = /^C(\d+)d(\d+)$/i;
    const rollMatch = recharge.trim().match(dicePattern);
    if (rollMatch) {
      const quantity = rollMatch[1];
      const diceSize = rollMatch[2];
      const diceFormula = `${quantity}d${diceSize}`;
      return `[[/r ${diceFormula}]]`;
    }

    // If it's just a number or other text, return as-is
    return recharge;
  }

  /**
   * Format roll damage for inline rolls
   * Converts dice formulas like "2d8", "2d8+2", "d6+4" to roll links "[[/r 2d8+2]]"
   * DOES NOT convert "Cdx" patterns - those are for countdown dice
   */
  formatRollDamage(rollDamage) {
    if (!rollDamage) return '';

    // Check if it's already a roll link
    if (rollDamage.includes('[[/r')) return rollDamage;

    // Check for countdown dice pattern first - don't convert these
    const countdownPattern = /^Cd(\d+)$/i;
    if (countdownPattern.test(rollDamage.trim())) {
      return rollDamage; // Return as-is, don't convert to roll
    }

    // Check if it contains dice notation (e.g., "2d8", "d6+2", "3d10+5")
    const dicePattern = /\d*d\d+/i;
    if (dicePattern.test(rollDamage.trim())) {
      return `[[/r ${rollDamage.trim()}]]`;
    }

    // If it's not dice notation, return as-is
    return rollDamage;
  }

  /**
   * Format ability description for dice rolls and countdown dice
   * Converts dice notation like "d4", "d6", "2d8" to roll links "[[/r d4]]"
   * Converts "Cdx" or "cdx" patterns to clickable spans for countdown dice creation
   * Handles multiple dice in the same string
   */
  formatAbilityDescription(description) {
    if (!description) return '';

    // First, replace countdown dice patterns with clickable spans
    // Matches: Cd4, Cd6, cd8, CD10, etc. (case-insensitive)
    // Use data-dice-size instead of data-dice-type to avoid enrichment issues
    const countdownPattern = /C(d\d+)/gi;
    let formattedDescription = description.replace(countdownPattern, (match, diceNotation) => {
      // Extract just the number (4, 6, 8, etc.) to avoid "dX" being treated as a roll
      const diceSize = diceNotation.match(/\d+/)[0];
      // match is the full match "Cd6", "CD4", etc.
      return `<span class="countdown-dice-trigger" data-action="createCountdownFromRecharge" data-dice-size="${diceSize}">${match}</span>`;
    });

    // Then replace remaining dice notation with roll links
    // Matches patterns like: d4, d6, d8, d10, d12, d20, 2d6, 3d8, etc.
    // Uses negative lookbehind to exclude patterns preceded by 'C' or 'c'
    const dicePattern = /(?<![Cc])(\d*)d(\d+)/gi;
    formattedDescription = formattedDescription.replace(dicePattern, (match) => {
      // Skip if this is inside a span tag (already processed as countdown dice)
      if (match.includes('span')) return match;
      return `[[/r ${match}]]`;
    });

    return formattedDescription;
  }

  /**
   * Format extra info field for dice rolls and countdown dice
   * Same logic as formatAbilityDescription
   */
  formatExtraInfo(extraInfo) {
    if (!extraInfo) return '';

    // First, replace countdown dice patterns with clickable spans
    // Use data-dice-size instead of data-dice-type to avoid enrichment issues
    const countdownPattern = /C(d\d+)/gi;
    let formattedExtraInfo = extraInfo.replace(countdownPattern, (match, diceNotation) => {
      // Extract just the number (4, 6, 8, etc.) to avoid "dX" being treated as a roll
      const diceSize = diceNotation.match(/\d+/)[0];
      return `<span class="countdown-dice-trigger" data-action="createCountdownFromRecharge" data-dice-size="${diceSize}">${match}</span>`;
    });

    // Then replace remaining dice notation with roll links
    const dicePattern = /(?<![Cc])(\d*)d(\d+)/gi;
    formattedExtraInfo = formattedExtraInfo.replace(dicePattern, (match) => {
      if (match.includes('span')) return match;
      return `[[/r ${match}]]`;
    });

    return formattedExtraInfo;
  }
}
