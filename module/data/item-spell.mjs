import VagabondItemBase from './base-item.mjs';
import { VagabondTextParser } from '../helpers/text-parser.mjs';

export default class VagabondSpell extends VagabondItemBase {
  static LOCALIZATION_PREFIXES = [
    'VAGABOND.Item.base',
    'VAGABOND.Item.Spell',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredString = { required: true, nullable: false, blank: true };
    const schema = super.defineSchema();

    // Damage Type - type of damage/healing the spell provides
    // Uses centralized CONFIG.VAGABOND.damageTypes
    // Damage Type - uses CONFIG.VAGABOND.damageTypes with fallback
    schema.damageType = new fields.StringField({
      ...requiredString,
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
        'magical': 'VAGABOND.DamageTypes.Magical',
        'healing': 'VAGABOND.DamageTypes.Healing',
        'recover': 'VAGABOND.DamageTypes.Recover',
        'recharge': 'VAGABOND.DamageTypes.Recharge'
      }
    });

    // Duration - how long the spell lasts
    schema.duration = new fields.StringField({
      ...requiredString,
      initial: 'Until your next turn'
    });

    // Crit - critical success effect
    schema.crit = new fields.StringField({
      ...requiredString,
      initial: ''
    });

    // Favorite - mark spell as favorite
    schema.favorite = new fields.BooleanField({
      required: true,
      initial: false
    });

    // Exploding Dice - whether damage dice can explode
    schema.canExplode = new fields.BooleanField({
      required: true,
      initial: false
    });

    // Explode Values - comma-separated numbers where dice explode (e.g., "1,4")
    schema.explodeValues = new fields.StringField({
      required: false,
      blank: true,
      initial: ''
    });

    // Damage Die Size - optional override for this specific spell (defaults to character's spellDamageDieSize)
    schema.damageDieSize = new fields.NumberField({
      required: false,
      nullable: true,
      initial: null,
      min: 4,
      max: 20,
      label: "Damage Die Size Override",
      hint: "Override damage die size for this spell (leave blank to use character default)"
    });

    // No Roll Required - bypass casting check
    schema.noRollRequired = new fields.BooleanField({
      required: true,
      initial: false,
      label: "No Roll Required",
      hint: "Bypass the casting check roll for this spell (always succeeds, no criticals)"
    });

    return schema;
  }

  /**
   * Format spell description for countdown dice triggers
   * Converts "Cdx" or "cdx" patterns to clickable spans for countdown dice creation
   * @param {string} description - The description text to format
   * @returns {string} Formatted description with clickable countdown dice triggers
   */
  formatDescription(description) {
    if (!description) return '';

    // Use centralized text parser
    return VagabondTextParser.parseCountdownDice(description);
  }
}
