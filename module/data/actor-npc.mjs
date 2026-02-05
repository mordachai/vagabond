import VagabondActorBase from './base-actor.mjs';
import { VagabondTextParser } from '../helpers/text-parser.mjs';

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
      choices: Object.keys(CONFIG.VAGABOND.sizes)
    });

    // NPC being type
    schema.beingType = new fields.StringField({
      initial: 'Humanlike',
      choices: Object.keys(CONFIG.VAGABOND.beingTypes)
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

    // Speed values for each movement type (stores specific speeds for Fly, Climb, etc.)
    schema.speedValues = new fields.SchemaField({
      climb: new fields.NumberField({
        required: false,
        nullable: false,
        integer: true,
        initial: 0,
        min: 0
      }),
      cling: new fields.NumberField({
        required: false,
        nullable: false,
        integer: true,
        initial: 0,
        min: 0
      }),
      fly: new fields.NumberField({
        required: false,
        nullable: false,
        integer: true,
        initial: 0,
        min: 0
      }),
      phase: new fields.NumberField({
        required: false,
        nullable: false,
        integer: true,
        initial: 0,
        min: 0
      }),
      swim: new fields.NumberField({
        required: false,
        nullable: false,
        integer: true,
        initial: 0,
        min: 0
      })
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

    // Universal Damage Bonuses (NPCs don't get check bonus since they don't roll)
    schema.universalDamageBonus = new fields.StringField({
      initial: '',
      blank: true,
      label: "Universal Damage Bonus",
      hint: "Can be a number (e.g., 1, 5) or formula (e.g., @cr)"
    });

    schema.universalDamageDice = new fields.StringField({
      initial: '',
      blank: true
    });

    // Separated Universal Damage Bonuses by Type (same as character)
    schema.universalWeaponDamageBonus = new fields.StringField({
      initial: '',
      blank: true,
      label: "Universal Weapon Damage Bonus",
      hint: "Can be a number (e.g., 1, 5) or formula (e.g., @cr)"
    });

    schema.universalWeaponDamageDice = new fields.StringField({
      initial: '',
      blank: true
    });

    schema.universalSpellDamageBonus = new fields.StringField({
      initial: '',
      blank: true,
      label: "Universal Spell Damage Bonus",
      hint: "Can be a number (e.g., 1, 5) or formula (e.g., @cr)"
    });

    schema.universalSpellDamageDice = new fields.StringField({
      initial: '',
      blank: true
    });

    schema.universalAlchemicalDamageBonus = new fields.StringField({
      initial: '',
      blank: true,
      label: "Universal Alchemical Damage Bonus",
      hint: "Can be a number (e.g., 1, 5) or formula (e.g., @cr)"
    });

    schema.universalAlchemicalDamageDice = new fields.StringField({
      initial: '',
      blank: true
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
        note: new fields.StringField({
          required: false,
          nullable: false,
          initial: '',
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
          nullable: false,
          initial: '-',
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
        attackType: new fields.StringField({
          required: false,
          nullable: true,
          initial: 'melee',
          choices: ['melee', 'ranged', 'castClose', 'castRanged']
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

  /**
   * Evaluate a formula field that can contain either a simple number or a Roll formula.
   * @param {string|number} formula - The formula to evaluate (e.g., "1", "@cr")
   * @param {object} rollData - The roll data context (from getRollData())
   * @returns {number} The evaluated result, or 0 if invalid
   * @private
   */
  _evaluateFormulaField(formula, rollData) {
    // Handle empty/null/undefined
    if (!formula) return 0;

    // Convert to string if it's a number
    const formulaStr = String(formula).trim();
    if (formulaStr === '') return 0;

    try {
      // Replace @variables with their values from rollData
      const replaced = Roll.replaceFormulaData(formulaStr, rollData);

      // Safely evaluate the expression
      const result = Roll.safeEval(replaced);

      // Handle NaN or invalid results
      if (result === null || result === undefined || isNaN(result)) {
        console.warn(`Vagabond | NPC Formula evaluation returned invalid result: ${formulaStr} → ${replaced} → ${result}`);
        return 0;
      }

      return Number(result);
    } catch (err) {
      console.warn(`Vagabond | NPC Invalid formula in bonus field: "${formulaStr}"`, err);
      return 0;
    }
  }

  /**
   * Evaluate all formula bonus fields for NPCs.
   * @param {object} rollData - The roll data context
   * @private
   */
  _evaluateAllBonusFields(rollData) {
    // Universal damage bonuses
    this.universalDamageBonus = this._evaluateFormulaField(this.universalDamageBonus, rollData);
    this.universalWeaponDamageBonus = this._evaluateFormulaField(this.universalWeaponDamageBonus, rollData);
    this.universalSpellDamageBonus = this._evaluateFormulaField(this.universalSpellDamageBonus, rollData);
    this.universalAlchemicalDamageBonus = this._evaluateFormulaField(this.universalAlchemicalDamageBonus, rollData);

    // Health bonus from base actor
    if (this.health) {
      this.health.bonus = this._evaluateFormulaField(this.health.bonus, rollData);
    }
  }

  prepareDerivedData() {
    // Evaluate formula bonus fields first
    // NPCs have simpler roll data (CR, stats, etc.)
    const rollData = {
      cr: this.cr || 0,
      hd: this.hd || 0,
      threatLevel: this.threatLevel || 0
    };

    this._evaluateAllBonusFields(rollData);

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
    const baseMaxHP = isSmall ? this.hd : Math.floor(this.hd * 4.5);
    
    // Add to existing value (which includes Active Effects modifications)
    this.health.max = (this.health.max || 0) + baseMaxHP;

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

    // Format Speed Display with specific movement type values
    // Example: "30' (Fly: 90', Swim, Climb: 15')" - types always show, values only if > 0
    if (this.locked && this.speedTypes && this.speedTypes.length > 0) {
      const speedParts = [];

      // Collect all movement types - show name always, value only if > 0
      for (const type of this.speedTypes) {
        const speedValue = this.speedValues?.[type] || 0;
        const label = game.i18n.localize(CONFIG.VAGABOND.speedTypes[type]);

        if (speedValue > 0) {
          // Custom speed value: "Fly: 90'"
          speedParts.push(`${label}: ${speedValue}'`);
        } else {
          // No custom value, just show the type name: "Fly"
          speedParts.push(label);
        }
      }

      // Format: "30' (Fly: 90', Swim, Climb: 15')"
      if (speedParts.length > 0) {
        this.speedFormatted = `${this.speed}' (${speedParts.join(', ')})`;
      } else {
        this.speedFormatted = `${this.speed}'`;
      }
    } else {
      this.speedFormatted = `${this.speed}'`;
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

    // Use centralized text parser for both countdown dice and regular dice
    return VagabondTextParser.parseAll(description);
  }

  /**
   * Format extra info field for dice rolls and countdown dice
   * Same logic as formatAbilityDescription
   */
  formatExtraInfo(extraInfo) {
    if (!extraInfo) return '';

    // Use centralized text parser for both countdown dice and regular dice
    return VagabondTextParser.parseAll(extraInfo);
  }
}
