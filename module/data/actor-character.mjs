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
      // Explicit fields for Spellcasting so Active Effects can target them
      isSpellcaster: new fields.BooleanField({ initial: false }),
      manaMultiplier: new fields.NumberField({ ...requiredInteger, initial: 0 }),
      castingStat: new fields.StringField({ initial: 'reason' }),
      manaSkill: new fields.StringField({ initial: null, nullable: true }),
    });

    // Character details - tracks builder state
    schema.details = new fields.SchemaField({
      constructed: new fields.BooleanField({ initial: false }),
      builderDismissed: new fields.BooleanField({ initial: false })
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
      castingMaxBonus: new fields.NumberField({ ...requiredInteger, initial: 0 }),
    });

    // Speed system - with explicit bonus field for Active Effects
    schema.speed = new fields.SchemaField({
      bonus: new fields.NumberField({ ...requiredInteger, initial: 0 }),
    });

    // Luck pool - tracks current luck separate from the Luck stat
    schema.currentLuck = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    // Bonus luck from active effects
    schema.bonusLuck = new fields.NumberField({ ...requiredInteger, initial: 0 });

    // Studied Die - tracks number of dice available to player
    schema.studiedDice = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    // Armor Bonus from Active Effects
    schema.armorBonus = new fields.NumberField({ ...requiredInteger, initial: 0 });

    // Universal Bonuses - apply to all rolls/damage
    schema.universalCheckBonus = new fields.NumberField({
      ...requiredInteger,
      initial: 0,
      label: "Universal Check Bonus"
    });

    schema.universalDamageBonus = new fields.NumberField({
      ...requiredInteger,
      initial: 0,
      label: "Universal Damage Bonus"
    });

    schema.universalDamageDice = new fields.StringField({
      initial: '',
      blank: true,
      label: "Universal Damage Dice"
    });

    // Separated Universal Damage Bonuses by Type
    schema.universalWeaponDamageBonus = new fields.NumberField({
      ...requiredInteger,
      initial: 0,
      label: "Universal Weapon Damage Bonus"
    });

    schema.universalWeaponDamageDice = new fields.StringField({
      initial: '',
      blank: true,
      label: "Universal Weapon Damage Dice"
    });

    schema.universalSpellDamageBonus = new fields.NumberField({
      ...requiredInteger,
      initial: 0,
      label: "Universal Spell Damage Bonus"
    });

    schema.universalSpellDamageDice = new fields.StringField({
      initial: '',
      blank: true,
      label: "Universal Spell Damage Dice"
    });

    schema.universalAlchemicalDamageBonus = new fields.NumberField({
      ...requiredInteger,
      initial: 0,
      label: "Universal Alchemical Damage Bonus"
    });

    schema.universalAlchemicalDamageDice = new fields.StringField({
      initial: '',
      blank: true,
      label: "Universal Alchemical Damage Dice"
    });

    // Spell Damage Die Size - allows changing spell damage from d6 to d8/d10/d12
    schema.spellDamageDieSize = new fields.NumberField({
      ...requiredInteger,
      initial: 6,
      min: 4,
      max: 20,
      label: "Spell Damage Die Size",
      hint: "Base die size for spell damage (e.g., 6 for d6, 8 for d8)"
    });
    // ---------------------

    // Bonuses container for various character bonuses
    schema.bonuses = new fields.SchemaField({
      hpPerLevel: new fields.NumberField({
        ...requiredInteger,
        initial: 0,
        label: "HP per Level Bonus",
        hint: "Bonus HP granted per character level (e.g., Tough perk adds +1)"
      })
    });

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

    // Define the six core stats (NO INITIAL VALUE - empty by default)
    schema.stats = new fields.SchemaField(
      Object.keys(CONFIG.VAGABOND.stats).reduce((obj, stat) => {
        obj[stat] = new fields.SchemaField({
          value: new fields.NumberField({
            required: false,
            nullable: true,
            integer: true,
            initial: null,  // No initial value - field is empty
            min: 0,
            max: 12,
          }),
          // Bonus field for Active Effects to modify stats
          bonus: new fields.NumberField({
            ...requiredInteger,
            initial: 0,
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
  // --- 1. Reset Flat Mechanics ---
    this.inventory.bonusSlots = 0;
    this.mana.bonus = 0;
    this.mana.castingMaxBonus = 0;
    this.speed.bonus = 0;
    this.armorBonus = 0;
    this.bonusLuck = 0;
    this.health.bonus = 0;
    this.bonuses.hpPerLevel = 0;

    // --- 2. Reset Universal Bonuses (from Active Effects) ---
    // NOTE: universalCheckBonus is NOT reset here - it's player-controlled and only resets after rolls
    this.universalDamageBonus = 0;
    this.universalWeaponDamageBonus = 0;
    this.universalSpellDamageBonus = 0;
    this.universalAlchemicalDamageBonus = 0;

    // --- 3. Loop: Reset All Stat & Save Bonuses ---
    for (let s of Object.values(this.stats)) { s.bonus = 0; }
    for (let s of Object.values(this.saves)) { s.bonus = 0; }

    // --- 4. Loop: Reset All Skill Bonuses ---
    for (let s of Object.values(this.skills)) { s.bonus = 0; }
    for (let s of Object.values(this.weaponSkills)) { s.bonus = 0; }

    // 5. Reset Defaults (Your existing code)
    this.attributes.isSpellcaster = false;
    this.attributes.manaMultiplier = 0;

    // 6. Apply Class Data
    const classItem = this.parent.items.find(item => item.type === 'class');
    if (classItem) {
      if (classItem.system.isSpellcaster) {
        this.attributes.isSpellcaster = true;
      }

      this.attributes.manaMultiplier = classItem.system.manaMultiplier ?? 0;

      if (classItem.system.castingStat) {
        this.attributes.castingStat = classItem.system.castingStat;
      }

      // CHANGED: Only set default from class if the User hasn't selected one yet.
      if (classItem.system.manaSkill && !this.attributes.manaSkill) {
        this.attributes.manaSkill = classItem.system.manaSkill;
      }
    }
  }

/**
   * V13 Best Practice: prepareDerivedData is for calculations.
   * This happens AFTER Active Effects.
   */
  prepareDerivedData() {
    // Calculate total stat values (value + bonus) for each stat
    // This happens AFTER Active Effects, so bonuses are already applied
    for (const [key, stat] of Object.entries(this.stats)) {
      const value = stat.value || 0;
      const bonus = stat.bonus || 0;
      stat.total = value + bonus;
      // Ensure total doesn't exceed 12 (max stat value)
      stat.total = Math.min(stat.total, 12);
      // Ensure total doesn't go below 0
      stat.total = Math.max(stat.total, 0);
    }

    // CRITICAL FIX: Active Effects pass string values, so we need to convert
    // isSpellcaster to a proper boolean if it's a truthy string like "1"
    if (typeof this.attributes.isSpellcaster === 'string') {
      this.attributes.isSpellcaster = this.attributes.isSpellcaster === 'true' ||
                                      this.attributes.isSpellcaster === '1' ||
                                      this.attributes.isSpellcaster === 'yes';
    } else if (typeof this.attributes.isSpellcaster === 'number') {
      this.attributes.isSpellcaster = this.attributes.isSpellcaster > 0;
    }
    // Ensure it's always a boolean
    this.attributes.isSpellcaster = Boolean(this.attributes.isSpellcaster);

    // ------------------------------------------------------------------
    // Calculate Max HP
    // Formula: (Might × Level) + (hpPerLevel Bonus × Level) + Flat HP Bonus
    // Base HP = Might × Level
    // Tough Perk adds +1 hpPerLevel per stack, giving +Level HP per stack
    // Flat bonus (system.health.bonus) adds a fixed amount regardless of level
    // We do this BEFORE other combat values in case they depend on Max HP
    // ------------------------------------------------------------------
    const mightTotal = this.stats.might?.total || 0;
    const levelValue = this.attributes.level?.value || 0;
    const hpPerLevelBonus = this.bonuses.hpPerLevel || 0;
    const flatHpBonus = this.health.bonus || 0;

    // Calculate base derived Max HP
    const baseMaxHP = (mightTotal * levelValue) + (hpPerLevelBonus * levelValue) + flatHpBonus;
    
    // Add to existing value (which includes Active Effects modifications)
    this.health.max = (this.health.max || 0) + baseMaxHP;


    // ------------------------------------------------------------------
    // 1. Calculate derived values that depend on Embedded Items/Effects
    // ------------------------------------------------------------------
    this._calculateManaValues();
    
    // NOTE: Check your _calculateCombatValues function!
    // If it currently calculates health.max, you should remove that line
    // from inside the helper function so it doesn't overwrite the work we just did above.
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
    // Use total stat values (which include bonuses from Active Effects)
    const dexTotal = this.stats.dexterity?.total || 0;
    const awrTotal = this.stats.awareness?.total || 0;
    const mitTotal = this.stats.might?.total || 0;
    const rsnTotal = this.stats.reason?.total || 0;
    const presTotal = this.stats.presence?.total || 0;

    const reflexBonus = this.saves.reflex?.bonus || 0;
    const endureBonus = this.saves.endure?.bonus || 0;
    const willBonus = this.saves.will?.bonus || 0;

    this.saves.reflex.difficulty = 20 - (dexTotal + awrTotal) - reflexBonus;
    this.saves.endure.difficulty = 20 - (mitTotal + mitTotal) - endureBonus;
    this.saves.will.difficulty = 20 - (rsnTotal + presTotal) - willBonus;

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
        manaSkill: this.attributes.manaSkill, 
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
      data.skills = {};
      for (let [k, v] of Object.entries(this.skills)) {
        data.skills[k] = foundry.utils.deepClone(v);
        // Ensure stat field is included (it's readonly so might not clone)
        if (v.stat) data.skills[k].stat = v.stat;
      }
    }
    if (this.weaponSkills) {
      data.weaponSkills = {};
      for (let [k, v] of Object.entries(this.weaponSkills)) {
        data.weaponSkills[k] = foundry.utils.deepClone(v);
        // Ensure stat field is included (it's readonly so might not clone)
        if (v.stat) data.weaponSkills[k].stat = v.stat;
      }
    }
    if (this.saves) {
      data.saves = {};
      for (let [k, v] of Object.entries(this.saves)) {
        data.saves[k] = foundry.utils.deepClone(v);
        // Ensure stat field is included (it's readonly so might not clone)
        if (v.stat) data.saves[k].stat = v.stat;
      }
    }
    data.lvl = this.attributes.level.value;

    // Add universal bonuses for formula usage
    data.universalCheckBonus = this.universalCheckBonus || 0;
    data.universalDamageBonus = this.universalDamageBonus || 0;
    data.universalDamageDice = this.universalDamageDice || '';

    return data;
  }

  _calculateCombatValues() {
    const mightTotal = this.stats.might?.total || 0;
    const dexTotal = this.stats.dexterity?.total || 0;
    const luckTotal = this.stats.luck?.total || 0;
    const level = this.attributes.level.value || 1;

    // Luck Calculation - use total Luck stat plus bonusLuck
    const bonusLuck = this.bonusLuck || 0;
    this.maxLuck = luckTotal + bonusLuck;

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
    // We iterate to find the matching tier for current Dex (use total which includes bonus)
    let speedTier = CONFIG.VAGABOND.speedTable[0]; // Default fallback
    const dexKeys = Object.keys(CONFIG.VAGABOND.speedTable).map(Number).sort((a, b) => a - b);

    for (const key of dexKeys) {
      if (dexTotal >= key) {
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
    this.armor = totalArmor + (this.armorBonus || 0);
  }

  _calculateInventorySlots() {
    // Might + 8 + Bonus (use total Might which includes bonuses)
    const mightTotal = this.stats.might?.total || 0;
    const bonusSlots = this.inventory.bonusSlots || 0;

    this.inventory.maxSlots = 8 + mightTotal + bonusSlots;

    let occupiedSlots = 0;
    let occupiedSlotsWithZero = 0;

    if (this.parent?.items) {
      for (const item of this.parent.items) {
        const isInventoryItem = (item.type === 'equipment') ||
                               (item.type === 'weapon') ||
                               (item.type === 'armor') ||
                               (item.type === 'gear');

        if (isInventoryItem) {
          // Skip items inside containers
          if (item.system.containerId) continue;

          const itemSlots = item.system.slots || 0;

          // Add to occupied (excludes slot-0 items)
          if (itemSlots > 0) {
            occupiedSlots += itemSlots;
          }

          // Track all items for grid display (each item instance counts as 1)
          occupiedSlotsWithZero += 1;
        }
      }
    }

    this.inventory.occupiedSlots = occupiedSlots; // Only counts non-zero slot items
    this.inventory.totalItems = occupiedSlotsWithZero; // All items for grid sizing
    this.inventory.availableSlots = this.inventory.maxSlots - occupiedSlots;
  }

  _calculateManaValues() {
    // 1. Check isSpellcaster
    if (this.attributes.isSpellcaster) {

      const castingStat = this.attributes.castingStat || 'reason';
      const castingStatTotal = this.stats[castingStat]?.total || 0;
      const level = this.attributes.level?.value || 1;

      // Multiplier & Max Mana Logic
      const multiplier = this.attributes.manaMultiplier || 0;
      const manaBonus = this.mana.bonus || 0;
      this.mana.max = (multiplier * level) + manaBonus;

      // 2. Calculate Casting Max
      // Formula: (Stat + Level/2) + Bonus
      // Use total stat which includes bonuses from Active Effects
      const baseCastingMax = castingStatTotal + Math.ceil(level / 2);
      const castingMaxBonus = this.mana.castingMaxBonus || 0; // Read the new bonus

      this.mana.castingMax = baseCastingMax + castingMaxBonus;

    } else {
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