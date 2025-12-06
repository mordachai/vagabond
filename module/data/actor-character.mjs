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
      }),
      // NEW: Explicit fields for Spellcasting so Active Effects can target them
      isSpellcaster: new fields.BooleanField({ initial: false }),
      manaMultiplier: new fields.NumberField({ ...requiredInteger, initial: 0 }),
      castingStat: new fields.StringField({ initial: 'reason' }),
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
      // NEW: Bonus field for Active Effects to add flat mana
      bonus: new fields.NumberField({ ...requiredInteger, initial: 0 }), 
      // Defined here so they appear in token structure, calculated in derived
      max: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      castingMax: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
    });

    // Speed system - with explicit bonus field for Active Effects
    schema.speed = new fields.SchemaField({
      bonus: new fields.NumberField({ ...requiredInteger, initial: 0 }),
    });

    // Luck pool - tracks current luck separate from the Luck stat
    schema.currentLuck = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

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

    // Define the six core stats (DEFAULTS TO 0)
    schema.stats = new fields.SchemaField(
      Object.keys(CONFIG.VAGABOND.stats).reduce((obj, stat) => {
        obj[stat] = new fields.SchemaField({
          value: new fields.NumberField({
            ...requiredInteger,
            initial: 0,  // Default 0
            min: 0,
            max: 12,     
          }),
        });
        return obj;
      }, {})
    );

    // Saving Throws system
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

    // Skills system
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

    // Weapon Skills system
    schema.weaponSkills = new fields.SchemaField({
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
      finesse: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'dexterity', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      }),
      ranged: new fields.SchemaField({
        trained: new fields.BooleanField({ initial: false }),
        stat: new fields.StringField({ initial: 'awareness', readonly: true }),
        bonus: new fields.NumberField({ ...requiredInteger, initial: 0 })
      })
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

    return schema;
  }

  /** * V13 Best Practice: prepareBaseData is where we load defaults from Items (Class/Ancestry).
   * This happens BEFORE Active Effects are applied.
   */
  prepareBaseData() {
    super.prepareBaseData();

    // 1. Reset Defaults (Crucial so removing a class removes the values)
    this.attributes.isSpellcaster = false;
    this.attributes.manaMultiplier = 0;
    // Note: We don't reset castingStat string default unless we want to force 'reason'
    // this.attributes.castingStat = 'reason'; 

    // 2. Apply Class Data
    const classItem = this.parent.items.find(item => item.type === 'class');
    if (classItem) {
      if (classItem.system.isSpellcaster) {
        this.attributes.isSpellcaster = true;
      }
      
      // Load multiplier (use nullish coalescing in case it's 0)
      this.attributes.manaMultiplier = classItem.system.manaMultiplier ?? 0;
      
      if (classItem.system.castingStat) {
        this.attributes.castingStat = classItem.system.castingStat;
      }
    }
  }

  /**
   * V13 Best Practice: prepareDerivedData is for calculations.
   * This happens AFTER Active Effects.
   */
  prepareDerivedData() {
    // ------------------------------------------------------------------
    // 1. Calculate derived values that depend on Embedded Items/Effects
    // ------------------------------------------------------------------
    this._calculateManaValues();
    this._calculateCombatValues();
    this._calculateInventorySlots();

    // ------------------------------------------------------------------
    // 2. Prepare Display Data (Labels, Difficulty, etc.)
    // ------------------------------------------------------------------

    // Loop through stats and add labels
    for (const key in this.stats) {
      this.stats[key].label =
        game.i18n.localize(CONFIG.VAGABOND.stats[key]) ?? key;
    }

    this._calculateAncestryData();
    // this._calculateClassData(); // Simplified: We just grab ID/Name now.
    this._prepareClassDisplayData();
    this._calculateXPRequirements();

    // Process Saves
    // Falls back to 0 (default) if undefined
    const dexValue = this.stats.dexterity?.value || 0;
    const awrValue = this.stats.awareness?.value || 0;
    const mitValue = this.stats.might?.value || 0;
    const rsnValue = this.stats.reason?.value || 0;
    const presValue = this.stats.presence?.value || 0;

    const reflexBonus = this.saves.reflex?.bonus || 0;
    const endureBonus = this.saves.endure?.bonus || 0;
    const willBonus = this.saves.will?.bonus || 0;

    this.saves.reflex.difficulty = 20 - (dexValue + awrValue) - reflexBonus;
    this.saves.endure.difficulty = 20 - (mitValue + mitValue) - endureBonus;
    this.saves.will.difficulty = 20 - (rsnValue + presValue) - willBonus;

    this.saves.reflex.label = game.i18n.localize('VAGABOND.Saves.Reflex.name') ?? 'Reflex';
    this.saves.reflex.description = game.i18n.localize('VAGABOND.Saves.Reflex.description') ?? 'Avoid area effects and attacks';
    
    this.saves.endure.label = game.i18n.localize('VAGABOND.Saves.Endure.name') ?? 'Endure';
    this.saves.endure.description = game.i18n.localize('VAGABOND.Saves.Endure.description') ?? 'Withstand poison and death';
    
    this.saves.will.label = game.i18n.localize('VAGABOND.Saves.Will.name') ?? 'Will';
    this.saves.will.description = game.i18n.localize('VAGABOND.Saves.Will.description') ?? 'Resist curses and enthrallment';

    // Process Skills
    for (const key in this.skills) {
      const skill = this.skills[key];
      const associatedStat = this.stats[skill.stat];
      const statValue = associatedStat?.value || 0;
      const skillBonus = skill.bonus || 0;

      skill.difficulty = 20 - (skill.trained ? statValue * 2 : statValue) - skillBonus;
      skill.label = game.i18n.localize(`VAGABOND.Skills.${key.charAt(0).toUpperCase() + key.slice(1)}`) ?? key;
    }

    // Process Weapon Skills
    for (const key in this.weaponSkills) {
      const weaponSkill = this.weaponSkills[key];
      const associatedStat = this.stats[weaponSkill.stat];
      const statValue = associatedStat?.value || 0;
      const weaponSkillBonus = weaponSkill.bonus || 0;

      weaponSkill.difficulty = 20 - (weaponSkill.trained ? statValue * 2 : statValue) - weaponSkillBonus;
      weaponSkill.label = game.i18n.localize(`VAGABOND.WeaponSkills.${key.charAt(0).toUpperCase() + key.slice(1)}`) ?? key;
    }
  }

  _calculateAncestryData() {
    const ancestry = this.parent?.items?.find(item => item.type === 'ancestry');
    if (ancestry) {
      this.ancestryData = {
        id: ancestry.id,
        name: ancestry.name,
        size: this.attributes.size || ancestry.system.size,
        beingType: this.attributes.beingType || ancestry.system.ancestryType,
        traits: ancestry.system.traits || []
      };
    } else {
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
   * Only gathers metadata for display.
   * Real stats are handled in prepareBaseData.
   */
  _prepareClassDisplayData() {
    const classItem = this.parent?.items?.find(item => item.type === 'class');
    if (classItem) {
      this.classData = {
        id: classItem.id,
        name: classItem.name,
        // We read from 'this' because it might have been modified by AE, 
        // unlike reading from classItem.system
        isSpellcaster: this.attributes.isSpellcaster,
        manaMultiplier: this.attributes.manaMultiplier,
        manaSkill: classItem.system.manaSkill, 
        castingStat: this.attributes.castingStat
      };
    } else {
      this.classData = null;
    }
  }

  _loadAncestryTraits() {
    // Future implementation
  }

  getRollData() {
    const data = {};
    if (this.stats) {
      for (let [k, v] of Object.entries(this.stats)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }
    if (this.skills) {
      for (let [k, v] of Object.entries(this.skills)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }
    if (this.weaponSkills) {
      for (let [k, v] of Object.entries(this.weaponSkills)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }
    if (this.saves) {
      for (let [k, v] of Object.entries(this.saves)) {
        data[k] = foundry.utils.deepClone(v);
      }
    }
    data.lvl = this.attributes.level.value;
    return data;
  }

  _calculateCombatValues() {
    const mightValue = this.stats.might?.value || 0;
    const dexValue = this.stats.dexterity?.value || 0;
    const luckValue = this.stats.luck?.value || 0;
    const level = this.attributes.level.value || 1;

    // HP Calculation
    this.health.max = mightValue * level;

    // Luck Calculation
    const bonusLuck = this.bonusLuck || 0;
    this.maxLuck = luckValue + bonusLuck;

    if (this.currentLuck === undefined || this.currentLuck === null) {
      this.currentLuck = this.maxLuck;
    }
    if (this.currentLuck > this.maxLuck) {
      this.currentLuck = this.maxLuck;
    }

    // Speed Calculation
    // 1. Get speed bonus from Active Effects (stored in system.speed.bonus)
    const speedBonus = this.speed.bonus || 0;
    
    // 2. Lookup base speed values from config table
    // We iterate to find the matching tier for current Dex
    let speedTier = CONFIG.VAGABOND.speedTable[0]; // Default fallback
    const dexKeys = Object.keys(CONFIG.VAGABOND.speedTable).map(Number).sort((a, b) => a - b);
    
    for (const key of dexKeys) {
      if (dexValue >= key) {
        speedTier = CONFIG.VAGABOND.speedTable[key];
      }
    }

    // 3. Apply bonus and set final values
    // Note: We only add bonus to base speed unless otherwise specified
    this.speed = {
      base: speedTier.base + speedBonus,
      crawl: speedTier.crawl, 
      travel: speedTier.travel,
      bonus: speedBonus // Preserve the bonus value
    };

    // Armor Calculation
    let totalArmor = 0;
    if (this.parent?.items) {
      for (const item of this.parent.items) {
        const isArmor = (item.type === 'armor') ||
                       (item.type === 'equipment' && item.system.equipmentType === 'armor');
        if (isArmor && item.system.equipped) {
          totalArmor += item.system.finalRating || 0;
        }
      }
    }
    this.armor = totalArmor;
  }

  _calculateInventorySlots() {
    // Might + 8 + Bonus
    const mightValue = this.stats.might?.value || 0; 
    const bonusSlots = this.inventory.bonusSlots || 0;

    this.inventory.maxSlots = 8 + mightValue + bonusSlots;

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
    this.inventory.availableSlots = this.inventory.maxSlots - occupiedSlots;
  }

  _calculateManaValues() {
    // Note: 'this' IS the system data in TypeDataModel

    // 1. Check isSpellcaster 
    // This value is now determined in prepareBaseData (from Class)
    // AND modified by Active Effects before we get here.
    if (this.attributes.isSpellcaster) {
    
      // Retrieve stats
      const castingStat = this.attributes.castingStat || 'reason';
      const castingStatValue = this.stats[castingStat]?.value || 0;
      const level = this.attributes.level?.value || 1;
      
      // Multiplier (Base from Class + AE modifications)
      const multiplier = this.attributes.manaMultiplier || 0;

      // Bonus (Purely from AEs)
      const bonus = this.mana.bonus || 0;

      // 2. Calculate Max Mana
      // Formula: (Class Base * Level) + (Active Effect Flat Bonuses)
      this.mana.max = (multiplier * level) + bonus;

      // 3. Calculate Casting Max
      this.mana.castingMax = castingStatValue + Math.ceil(level / 2);

    } else {
      // Not a spellcaster
      this.mana.max = 0;
      this.mana.castingMax = 0;
    }
  }

  _calculateXPRequirements() {
    const currentLevel = this.attributes.level.value || 1;
    const nextLevel = currentLevel + 1;
    const currentXP = this.attributes.xp || 0;

    const pacing = game.settings?.get('vagabond', 'levelPacing') || 'normal';

    let xpRequired;
    switch (pacing) {
      case 'quick':
        xpRequired = 5;
        break;
      case 'normal':
        xpRequired = 5 * nextLevel;
        break;
      case 'epic':
        xpRequired = 7 * nextLevel;
        break;
      case 'saga':
        xpRequired = 10 * nextLevel;
        break;
      default:
        xpRequired = 5 * nextLevel;
    }

    this.attributes.xpRequired = xpRequired;
    this.attributes.xpProgress = currentXP;
    this.attributes.canLevelUp = currentXP >= xpRequired;
  }
}