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
        choices: ['small', 'medium', 'large', 'huge', 'giant', 'colossal'],
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

    // Luck pool - tracks current luck separate from the Luck stat
    // Initial value will be set in prepareDerivedData if not already set
    schema.currentLuck = new fields.NumberField({ ...requiredInteger, initial: 8, min: 0 });

    // Bonus luck from active effects
    schema.bonusLuck = new fields.NumberField({ ...requiredInteger, initial: 0 });

    // Favor/Hinder system - toggle for roll modifiers
    schema.favorHinder = new fields.StringField({
      initial: 'none',
      choices: ['none', 'favor', 'hinder'],
      required: true,
      nullable: false
    });

    // Critical hit threshold - normally 20, but can be modified by perks/features
    schema.critNumber = new fields.NumberField({
      ...requiredInteger,
      initial: 20,
      min: 1,
      max: 20
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

    // Saving Throws system - calculated from stats with optional bonuses
    schema.saves = new fields.SchemaField({
      reflex: new fields.SchemaField({
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),
      endure: new fields.SchemaField({
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),
      will: new fields.SchemaField({
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      })
    });

    // Skills system - organized by associated stats with bonuses
    schema.skills = new fields.SchemaField({
      // Reason-based skills
      arcana: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'reason', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),
      craft: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'reason', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),
      medicine: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'reason', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),

      // Might-based skills
      brawl: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'might', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),

      // Dexterity-based skills
      finesse: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'dexterity', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),
      sneak: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'dexterity', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),

      // Awareness-based skills
      detect: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'awareness', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),
      mysticism: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'awareness', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),
      survival: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'awareness', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),

      // Presence-based skills
      influence: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'presence', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),
      leadership: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'presence', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),
      performance: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'presence', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      })
    });

    // Weapon Skills system - used for attacks with bonuses
    schema.weaponSkills = new fields.SchemaField({
      // Might-based weapon skills
      melee: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'might', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),
      brawl: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'might', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),

      // Dexterity-based weapon skills
      finesse: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'dexterity', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),

      // Awareness-based weapon skills
      ranged: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'awareness', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      })
    });

    // Damage immunities and weaknesses (typically set via items/active effects)
    schema.immunities = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [] }
    );

    schema.weaknesses = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [] }
    );

    return schema;
  }

  prepareBaseData() {
    // FIXED: DO NOT calculate values here that depend on Items.
    // Base data is prepared BEFORE embedded documents (Items/Effects).
    // Accessing item.system.finalRating here would return undefined or stale data.
  }

  prepareDerivedData() {
    // -------------------------------------------------------------
    // MOVED FROM PREPAREBASEDATA
    // These methods aggregate data from Embedded Documents (Items).
    // They MUST be called here, after items have prepared their own derived data.
    // -------------------------------------------------------------

    // Mana values for spellcasters (Depends on Class Item)
    this._calculateManaValues();

    // Combat values (Armor, etc.) (Depends on Equipment Items)
    this._calculateCombatValues();

    // Inventory slots (Depends on Equipment/Weapon/Armor Items)
    this._calculateInventorySlots();

    // -------------------------------------------------------------
    // EXISTING DERIVED LOGIC
    // -------------------------------------------------------------

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

    // Calculate XP requirements for next level
    this._calculateXPRequirements();

    // Process saves - calculate difficulty based on Vagabond rules
    // Reflex = DEX + AWR, Endure = MIT + MIT, Will = RSN + PRS
    const dexValue = this.stats.dexterity?.value || 8;
    const awrValue = this.stats.awareness?.value || 8;
    const mitValue = this.stats.might?.value || 8;
    const rsnValue = this.stats.reason?.value || 8;
    const presValue = this.stats.presence?.value || 8;

    // Calculate save difficulties including bonuses
    // Lower difficulty = better save (bonuses subtract from difficulty)
    const reflexBonus = this.saves.reflex?.bonus || 0;
    const endureBonus = this.saves.endure?.bonus || 0;
    const willBonus = this.saves.will?.bonus || 0;

    this.saves.reflex.difficulty = 20 - (dexValue + awrValue) - reflexBonus;
    this.saves.endure.difficulty = 20 - (mitValue + mitValue) - endureBonus; // MIT + MIT
    this.saves.will.difficulty = 20 - (rsnValue + presValue) - willBonus;

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
      const skillBonus = skill.bonus || 0;

      // Vagabond difficulty calculation:
      // Difficulty = 20 - Stat (untrained)
      // Difficulty = 20 - (Stat × 2) (trained)
      // Bonuses further reduce difficulty (lower = better)
      skill.difficulty = 20 - (skill.trained ? statValue * 2 : statValue) - skillBonus;

      // Add label for localization
      skill.label = game.i18n.localize(`VAGABOND.Skills.${key.charAt(0).toUpperCase() + key.slice(1)}`) ?? key;
    }

    // Process weapon skills - calculate difficulty based on Vagabond rules (same as regular skills)
    for (const key in this.weaponSkills) {
      const weaponSkill = this.weaponSkills[key];
      const associatedStat = this.stats[weaponSkill.stat];
      const statValue = associatedStat?.value || 8;
      const weaponSkillBonus = weaponSkill.bonus || 0;

      // Vagabond difficulty calculation:
      // Difficulty = 20 - Stat (untrained)
      // Difficulty = 20 - (Stat × 2) (trained)
      // Bonuses further reduce difficulty (lower = better)
      weaponSkill.difficulty = 20 - (weaponSkill.trained ? statValue * 2 : statValue) - weaponSkillBonus;

      // Add label for localization
      weaponSkill.label = game.i18n.localize(`VAGABOND.WeaponSkills.${key.charAt(0).toUpperCase() + key.slice(1)}`) ?? key;
    }
  }

  /**
   * Get ancestry data for display purposes
   * Uses override values from attributes if set, otherwise uses ancestry values
   */
  _calculateAncestryData() {
    const ancestry = this.parent?.items?.find(item => item.type === 'ancestry');
    if (ancestry) {
      this.ancestryData = {
        id: ancestry.id,
        name: ancestry.name,
        size: this.attributes.size || ancestry.system.size,  // Use override if set
        beingType: this.attributes.beingType || ancestry.system.ancestryType,  // Use override if set
        traits: ancestry.system.traits || []
      };
    } else {
      // No ancestry - use overrides or defaults
      this.ancestryData = {
        id: null,
        name: null,
        size: this.attributes.size || 'medium',
        beingType: this.attributes.beingType || 'Humanlike',
        traits: []
      };
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
    const mightValue = this.stats.might?.value || 0;
    const dexValue = this.stats.dexterity?.value || 0;
    const luckValue = this.stats.luck?.value || 0;
    const level = this.attributes.level.value || 1;

    // Max HP = Might + Level (update the existing health.max)
    this.health.max = mightValue * level;

    // Max Luck pool = Luck stat value + bonusLuck from active effects
    const bonusLuck = this.bonusLuck || 0;
    this.maxLuck = luckValue + bonusLuck;

    // Initialize currentLuck to maxLuck if not set (for new actors)
    // This handles the case where an actor is first created or when luck stat changes
    if (this.currentLuck === undefined || this.currentLuck === null) {
      // Can't update here directly, will be handled on first save
      this.currentLuck = this.maxLuck;
    }

    // Cap currentLuck to maxLuck if it somehow exceeds it
    if (this.currentLuck > this.maxLuck) {
      this.currentLuck = this.maxLuck;
    }

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
        // Support both equipment items with equipmentType='armor' and legacy armor items
        const isArmor = (item.type === 'armor') ||
                       (item.type === 'equipment' && item.system.equipmentType === 'armor');
        if (isArmor && item.system.equipped) {
          // finalRating is a DERIVED property of the Equipment Item.
          // It is only available after embedded documents preparation.
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
    // Count equipment items and legacy weapon/armor/gear items
    let occupiedSlots = 0;
    if (this.parent?.items) {
      for (const item of this.parent.items) {
        const isInventoryItem = (item.type === 'equipment') ||
                               (item.type === 'weapon') ||
                               (item.type === 'armor') ||
                               (item.type === 'gear');
        if (isInventoryItem && item.system.slots !== undefined) {
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

  /**
   * Calculate XP requirements for leveling up based on level pacing setting
   * @private
   */
  _calculateXPRequirements() {
    const currentLevel = this.attributes.level.value || 1;
    const nextLevel = currentLevel + 1;
    const currentXP = this.attributes.xp || 0;

    // Get level pacing setting from game settings
    const pacing = game.settings?.get('vagabond', 'levelPacing') || 'normal';

    // Calculate XP required for next level based on pacing
    let xpRequired;
    switch (pacing) {
      case 'quick':
        xpRequired = 5; // 5 XP per level
        break;
      case 'normal':
        xpRequired = 5 * nextLevel; // 5 × next level
        break;
      case 'epic':
        xpRequired = 7 * nextLevel; // 7 × next level
        break;
      case 'saga':
        xpRequired = 10 * nextLevel; // 10 × next level
        break;
      default:
        xpRequired = 5 * nextLevel; // Default to normal
    }

    // Store XP data for easy access in templates
    this.attributes.xpRequired = xpRequired;
    this.attributes.xpProgress = currentXP;
    this.attributes.canLevelUp = currentXP >= xpRequired;
  }
}