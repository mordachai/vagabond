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
        initial: null,
        choices: ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'],
        required: false,
        nullable: true
      }),
      beingType: new fields.StringField({
        initial: null,
        required: false,
        nullable: true
      })
    });

    // Currency system
    schema.currency = new fields.SchemaField({
      gold: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      silver: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      copper: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 })
    });

    // Inventory system
    schema.inventory = new fields.SchemaField({
      bonusSlots: new fields.NumberField({ ...requiredInteger, initial: 0 })
    });

    // Mana system for spellcasters
    schema.mana = new fields.SchemaField({
      current: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
    });

    // Favor/Hinder system - toggle for roll modifiers
    schema.favorHinder = new fields.StringField({
      initial: 'none',
      choices: ['none', 'favor', 'hinder'],
      required: true,
      nullable: false
    });

    // Define the six core stats
    schema.stats = new fields.SchemaField(
      Object.keys(CONFIG.VAGABOND.stats).reduce((obj, stat) => {
        obj[stat] = new fields.SchemaField({
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

    // Weapon Skills system - used for attacks
    schema.weaponSkills = new fields.SchemaField({
      // Might-based weapon skills
      melee: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'might', readonly: true })
      }),
      brawl: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'might', readonly: true })
      }),

      // Dexterity-based weapon skills
      finesse: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'dexterity', readonly: true })
      }),

      // Awareness-based weapon skills
      ranged: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'awareness', readonly: true })
      })
    });

    return schema;
  }

  prepareDerivedData() {
    // Loop through stats and add labels
    for (const key in this.stats) {
      // NO MODIFIER CALCULATION - Vagabond uses raw values
      // Handle stat label localization.
      this.stats[key].label =
        game.i18n.localize(CONFIG.VAGABOND.stats[key]) ?? key;
    }

    // Get ancestry data for display
    this._calculateAncestryData();

    // Get class data for display
    this._calculateClassData();

    // Calculate combat values
    this._calculateCombatValues();

    // Calculate inventory slots
    this._calculateInventorySlots();

    // Calculate mana values for spellcasters
    this._calculateManaValues();

    // Process saves - calculate difficulty based on Vagabond rules
    // Reflex = DEX + AWR, Endure = MIT + MIT, Will = RSN + PRS
    const dexValue = this.stats.dexterity?.value || 8;
    const awrValue = this.stats.awareness?.value || 8;
    const mitValue = this.stats.might?.value || 8;
    const rsnValue = this.stats.reason?.value || 8;
    const presValue = this.stats.presence?.value || 8;

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
      const associatedStat = this.stats[skill.stat];
      const statValue = associatedStat?.value || 8;

      // Vagabond difficulty calculation:
      // Difficulty = 20 - Stat (untrained)
      // Difficulty = 20 - (Stat × 2) (trained)
      skill.difficulty = 20 - (skill.trained ? statValue * 2 : statValue);

      // Add label for localization
      skill.label = game.i18n.localize(`VAGABOND.Skills.${key.charAt(0).toUpperCase() + key.slice(1)}`) ?? key;
    }

    // Process weapon skills - calculate difficulty based on Vagabond rules (same as regular skills)
    for (const key in this.weaponSkills) {
      const weaponSkill = this.weaponSkills[key];
      const associatedStat = this.stats[weaponSkill.stat];
      const statValue = associatedStat?.value || 8;

      // Vagabond difficulty calculation:
      // Difficulty = 20 - Stat (untrained)
      // Difficulty = 20 - (Stat × 2) (trained)
      weaponSkill.difficulty = 20 - (weaponSkill.trained ? statValue * 2 : statValue);

      // Add label for localization
      weaponSkill.label = game.i18n.localize(`VAGABOND.WeaponSkills.${key.charAt(0).toUpperCase() + key.slice(1)}`) ?? key;
    }
  }

  /**
   * Get ancestry data for display purposes
   */
  _calculateAncestryData() {
    const ancestry = this.parent?.items?.find(item => item.type === 'ancestry');
    if (ancestry) {
      this.ancestryData = {
        id: ancestry.id,
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
   * Get class data for display purposes
   */
  _calculateClassData() {
    const classItem = this.parent?.items?.find(item => item.type === 'class');
    if (classItem) {
      this.classData = {
        id: classItem.id,
        name: classItem.name,
        isSpellcaster: classItem.system.isSpellcaster,
        manaMultiplier: classItem.system.manaMultiplier,
        manaSkill: classItem.system.manaSkill,
        castingStat: classItem.system.castingStat
      };
    } else {
      this.classData = null;
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

    // Copy the stats to the top level, so that rolls can use
    // formulas like `@might + 4` (using raw values, not modifiers).
    if (this.stats) {
      for (let [k, v] of Object.entries(this.stats)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }

    // Copy skills to the top level for roll formulas
    if (this.skills) {
      for (let [k, v] of Object.entries(this.skills)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }

    // Copy weapon skills to the top level for roll formulas
    if (this.weaponSkills) {
      for (let [k, v] of Object.entries(this.weaponSkills)) {
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
    const mightValue = this.stats.might?.value || 8;
    const dexValue = this.stats.dexterity?.value || 8;
    const luckValue = this.stats.luck?.value || 8;
    const level = this.attributes.level.value || 1;

    // Max HP = Might + Level (update the existing health.max)
    this.health.max = mightValue + level;
    
    // Current Luck = Luck stat value
    this.currentLuck = luckValue;

    // Speed based on Dexterity (from rulebook table)
    if (dexValue >= 2 && dexValue <= 3) {
      this.speed = { base: 25, crawl: 75, travel: 5 };
    } else if (dexValue >= 4 && dexValue <= 5) {
      this.speed = { base: 30, crawl: 90, travel: 6 };
    } else if (dexValue >= 6 && dexValue <= 7) {
      this.speed = { base: 35, crawl: 105, travel: 7 };
    } else if (dexValue >= 8 && dexValue <= 9) {
      this.speed = { base: 40, crawl: 120, travel: 8 };
    } else if (dexValue >= 10 && dexValue <= 11) {
      this.speed = { base: 45, crawl: 135, travel: 9 };
    } else if (dexValue >= 12) {
      this.speed = { base: 50, crawl: 150, travel: 10 };
    } else {
      this.speed = { base: 30, crawl: 90, travel: 6 }; // Default
    }

    // Calculate armor from equipped armor items
    let totalArmor = 0;
    if (this.parent?.items) {
      for (const item of this.parent.items) {
        if (item.type === 'armor' && item.system.equipped) {
          totalArmor += item.system.finalRating || 0;
        }
      }
    }
    this.armor = totalArmor;
  }

  _calculateInventorySlots() {
    const mightValue = this.stats.might?.value || 8;
    const bonusSlots = this.inventory.bonusSlots || 0;

    // Calculate max slots: 8 + Might + bonusSlots
    this.inventory.maxSlots = 8 + mightValue + bonusSlots;

    // Calculate occupied slots from all inventory items
    // Count weapons, armor, and gear
    let occupiedSlots = 0;
    if (this.parent?.items) {
      for (const item of this.parent.items) {
        if ((item.type === 'weapon' || item.type === 'armor' || item.type === 'gear') && item.system.slots !== undefined) {
          occupiedSlots += item.system.slots;
        }
      }
    }
    this.inventory.occupiedSlots = occupiedSlots;

    // Calculate available slots
    this.inventory.availableSlots = this.inventory.maxSlots - occupiedSlots;
  }

  _calculateManaValues() {
    const classItem = this.parent?.items?.find(item => item.type === 'class');

    if (classItem && classItem.system.isSpellcaster) {
      // Get the casting stat value
      const castingStat = classItem.system.castingStat || 'reason';
      const castingStatValue = this.stats[castingStat]?.value || 8;
      const level = this.attributes.level.value || 1;
      const manaMultiplier = classItem.system.manaMultiplier || 2;

      // Max mana = Mana Multiplier × Level
      this.mana.max = manaMultiplier * level;

      // Casting max = Casting Stat + (Half Level rounded up)
      this.mana.castingMax = castingStatValue + Math.ceil(level / 2);
    } else {
      // Not a spellcaster
      this.mana.max = 0;
      this.mana.castingMax = 0;
    }
  }
}
