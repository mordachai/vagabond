import VagabondActorBase from './base-actor.mjs';

export default class VagabondCharacter extends VagabondActorBase {
  static LOCALIZATION_PREFIXES = [
    ...super.LOCALIZATION_PREFIXES,
    'VAGABOND.Actor.Character',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const schema = super.defineSchema();

    schema.attributes = new fields.SchemaField({
      level: new fields.SchemaField({
        value: new fields.NumberField({ ...requiredInteger, initial: 1 }),
      }),
      xp: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      size: new fields.StringField({
        initial: '',
        choices: ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan']
      }),
      beingType: new fields.StringField({ initial: '' })
    });

    // Iterate over ability names and create a new SchemaField for each.
    // Now using Vagabond stats instead of D&D abilities
    schema.abilities = new fields.SchemaField(
      Object.keys(CONFIG.VAGABOND.abilities).reduce((obj, ability) => {
        obj[ability] = new fields.SchemaField({
          value: new fields.NumberField({
            ...requiredInteger,
            initial: 8,  // Starting value for Vagabond stats
            min: 1,
            max: 12,     // Based on the stat generation table in the rules
          }),
        });
        return obj;
      }, {})
    );

    // Saving Throws system - these are NOT skills, just calculated values
    schema.saves = new fields.SchemaField({
      reflex: new fields.SchemaField({
        // No trained field - saves are just calculated
      }),
      endure: new fields.SchemaField({
        // No trained field - saves are just calculated  
      }),
      will: new fields.SchemaField({
        // No trained field - saves are just calculated
      })
    });

    // Skills system - organized by associated stats
    schema.skills = new fields.SchemaField({
      // Reason-based skills
      arcana: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'reason', readonly: true })
      }),
      craft: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'reason', readonly: true })
      }),
      medicine: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'reason', readonly: true })
      }),
      
      // Might-based skills
      brawl: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'might', readonly: true })
      }),
      
      // Dexterity-based skills
      finesse: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'dexterity', readonly: true })
      }),
      sneak: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'dexterity', readonly: true })
      }),
      
      // Awareness-based skills
      detect: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'awareness', readonly: true })
      }),
      mysticism: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'awareness', readonly: true })
      }),
      survival: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'awareness', readonly: true })
      }),
      
      // Presence-based skills
      influence: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'presence', readonly: true })
      }),
      leadership: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'presence', readonly: true })
      }),
      performance: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'presence', readonly: true })
      })
    });

    return schema;
  }

  prepareDerivedData() {
    // Loop through ability scores and add labels
    for (const key in this.abilities) {
      // NO MODIFIER CALCULATION - Vagabond uses raw values
      // Handle ability label localization.
      this.abilities[key].label =
        game.i18n.localize(CONFIG.VAGABOND.abilities[key]) ?? key;
    }

    // Get ancestry data for display
    this._calculateAncestryData();

    // Calculate combat values
    this._calculateCombatValues();

    // Process saves - calculate difficulty based on Vagabond rules
    // Reflex = DEX + AWR, Endure = MIT + MIT, Will = RSN + PRS
    const dexValue = this.abilities.dexterity?.value || 8;
    const awrValue = this.abilities.awareness?.value || 8;
    const mitValue = this.abilities.might?.value || 8;
    const rsnValue = this.abilities.reason?.value || 8;
    const presValue = this.abilities.presence?.value || 8;

    // Calculate save difficulties (no trained bonuses for saves)
    this.saves.reflex.difficulty = 20 - (dexValue + awrValue);
    this.saves.endure.difficulty = 20 - (mitValue + mitValue); // MIT + MIT
    this.saves.will.difficulty = 20 - (rsnValue + presValue);

    // Add labels and descriptions for saves
    this.saves.reflex.label = game.i18n.localize('VAGABOND.Saves.Reflex.name') ?? 'Reflex';
    this.saves.reflex.description = game.i18n.localize('VAGABOND.Saves.Reflex.description') ?? 'Avoid area effects and attacks';
    
    this.saves.endure.label = game.i18n.localize('VAGABOND.Saves.Endure.name') ?? 'Endure';
    this.saves.endure.description = game.i18n.localize('VAGABOND.Saves.Endure.description') ?? 'Withstand poison and death';
    
    this.saves.will.label = game.i18n.localize('VAGABOND.Saves.Will.name') ?? 'Will';
    this.saves.will.description = game.i18n.localize('VAGABOND.Saves.Will.description') ?? 'Resist curses and enthrallment';

    // Process skills - calculate difficulty based on Vagabond rules
    for (const key in this.skills) {
      const skill = this.skills[key];
      const associatedStat = this.abilities[skill.stat];
      const statValue = associatedStat?.value || 8;
      
      // Vagabond difficulty calculation:
      // Difficulty = 20 - Stat (untrained)
      // Difficulty = 20 - (Stat × 2) (trained)
      skill.difficulty = 20 - (skill.trained ? statValue * 2 : statValue);
      
      // Add label for localization
      skill.label = game.i18n.localize(`VAGABOND.Skills.${key.charAt(0).toUpperCase() + key.slice(1)}`) ?? key;
    }
  }

  /**
   * Get ancestry data for display purposes
   */
  _calculateAncestryData() {
    const ancestry = this.parent?.items?.find(item => item.type === 'ancestry');
    if (ancestry) {
      this.ancestryData = {
        name: ancestry.name,
        size: ancestry.system.size,
        beingType: ancestry.system.ancestryType,
        traits: ancestry.system.traits || []
      };
    } else {
      this.ancestryData = null;
    }
  }

  /**
   * Future method for loading ancestry traits and effects
   */
  _loadAncestryTraits() {
    // TODO: Process ancestry traits and apply effects
    // Will be implemented later when we need trait effects
  }

  getRollData() {
    const data = {};

    // Copy the ability scores to the top level, so that rolls can use
    // formulas like `@might + 4` (using raw values, not modifiers).
    if (this.abilities) {
      for (let [k, v] of Object.entries(this.abilities)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }

    // Copy skills to the top level for roll formulas
    if (this.skills) {
      for (let [k, v] of Object.entries(this.skills)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }

    // Copy saves to the top level for roll formulas  
    if (this.saves) {
      for (let [k, v] of Object.entries(this.saves)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }

    data.lvl = this.attributes.level.value;

    return data;
  }

  _calculateCombatValues() {
    // Get stat values
    const mightValue = this.abilities.might?.value || 8;
    const dexValue = this.abilities.dexterity?.value || 8;
    const luckValue = this.abilities.luck?.value || 8;
    const level = this.attributes.level.value || 1;

    // Max HP = Might × Level (update the existing health.max)
    this.health.max = mightValue * level;
    
    // Current Luck = Luck stat value
    this.currentLuck = luckValue;

    // Speed based on Dexterity (from rulebook table)
    if (dexValue >= 2 && dexValue <= 3) {
      this.speed = { base: 25, crawl: 7.5, travel: 5 };
    } else if (dexValue >= 4 && dexValue <= 5) {
      this.speed = { base: 30, crawl: 9, travel: 6 };
    } else if (dexValue >= 6 && dexValue <= 7) {
      this.speed = { base: 35, crawl: 10.5, travel: 7 };
    } else if (dexValue >= 8 && dexValue <= 9) {
      this.speed = { base: 40, crawl: 12, travel: 8 };
    } else if (dexValue >= 10 && dexValue <= 11) {
      this.speed = { base: 45, crawl: 13.5, travel: 9 };
    } else if (dexValue >= 12) {
      this.speed = { base: 50, crawl: 15, travel: 10 };
    } else {
      this.speed = { base: 30, crawl: 9, travel: 6 }; // Default
    }

    // Armor starts at 0 (will come from items later)
    this.armor = 0;
  }
}
