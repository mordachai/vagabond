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
        choices: Object.keys(CONFIG.VAGABOND.sizes),
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
      bonusSlots: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        {
          initial: [],
          label: "Bonus Slots",
          hint: "Can be a number (e.g., 1, 5) or formula (e.g., @attributes.level.value)"
        }
      ),
      boundsBonus: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        {
          initial: [],
          label: "Bonus Bounds",
          hint: "Can be a number (e.g., 1, 5) or formula (e.g., @attributes.level.value)"
        }
      )
    });

    // Focus system — tracks sustained spell concentration (spellcasters only)
    schema.focus = new fields.SchemaField({
      spellIds: new fields.ArrayField(
        new fields.StringField(),
        { initial: [] }
      ),
      maxBonus: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        {
          initial: [],
          label: 'Focus Max Bonus',
          hint: 'Can be a number (e.g., 1) or formula (e.g., @attributes.level.value)'
        }
      ),
      // Derived values — written back in prepareDerivedData()
      max: new fields.NumberField({ ...requiredInteger, initial: 5, min: 0 }),
      current: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
    });

    // Mana system for spellcasters
    schema.mana = new fields.SchemaField({
      current: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      // NEW: Bonus field for Active Effects to add flat mana
      bonus: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        {
          initial: [],
          label: "Mana Bonus",
          hint: "Can be a number (e.g., 1, 5) or formula (e.g., @attributes.level.value)"
        }
      ),
      // Defined here so they appear in token structure, calculated in derived
      max: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      castingMax: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      castingMaxBonus: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        {
          initial: [],
          label: "Casting Max Bonus",
          hint: "Can be a number (e.g., 1, 5) or formula (e.g., @attributes.level.value)"
        }
      ),
    });

    // Speed system - with explicit bonus field for Active Effects
    schema.speed = new fields.SchemaField({
      bonus: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        {
          initial: [],
          label: "Speed Bonus",
          hint: "Can be a number (e.g., 1, 5) or formula (e.g., @attributes.level.value)"
        }
      ),
    });

    // Luck pool - tracks current luck separate from the Luck stat
    schema.currentLuck = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    // Bonus luck from active effects
    schema.bonusLuck = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Bonus Luck",
        hint: "Can be a number (e.g., 1, 5) or formula (e.g., @attributes.level.value)"
      }
    );

    // Studied Die - tracks number of dice available to player
    schema.studiedDice = new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 });

    // Armor Bonus from Active Effects
    schema.armorBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Armor Bonus",
        hint: "Can be a number (e.g., 1, 5) or formula (e.g., @attributes.level.value)"
      }
    );

    // Universal Bonuses - apply to all rolls/damage
    schema.universalCheckBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Universal Check Bonus",
        hint: "Can be a number (e.g., 1, 5) or formula (e.g., @attributes.level.value)"
      }
    );

    // Manual check bonus - player-controlled value (Favor/Hinder clicks), separate from Active Effects
    schema.manualCheckBonus = new fields.NumberField({
      required: true, nullable: false, integer: true,
      initial: 0,
      label: "Manual Check Bonus",
      hint: "Player-set bonus to all d20 rolls. Resets after each roll."
    });

    schema.universalDamageBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Universal Damage Bonus",
        hint: "Can be a number (e.g., 1, 5) or formula (e.g., @attributes.level.value)"
      }
    );

    schema.universalDamageDice = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Universal Damage Dice"
      }
    );

    // Separated Universal Damage Bonuses by Type
    schema.universalWeaponDamageBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Universal Weapon Damage Bonus",
        hint: "Can be a number (e.g., 1, 5) or formula (e.g., @attributes.level.value)"
      }
    );

    schema.universalWeaponDamageDice = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Universal Weapon Damage Dice"
      }
    );

    schema.universalSpellDamageBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Universal Spell Damage Bonus",
        hint: "Can be a number (e.g., 1, 5) or formula (e.g., @attributes.level.value)"
      }
    );

    schema.universalSpellDamageDice = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Universal Spell Damage Dice"
      }
    );

    schema.universalAlchemicalDamageBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Universal Alchemical Damage Bonus",
        hint: "Can be a number (e.g., 1, 5) or formula (e.g., @attributes.level.value)"
      }
    );

    schema.universalAlchemicalDamageDice = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Universal Alchemical Damage Dice"
      }
    );

    // --- Specific Damage Die Size Bonuses ---
    schema.meleeDamageDieSizeBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Melee Damage Die Size Bonus" }
    );
    schema.rangedDamageDieSizeBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Ranged Damage Die Size Bonus" }
    );
    schema.brawlDamageDieSizeBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Brawl Damage Die Size Bonus" }
    );
    schema.finesseDamageDieSizeBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Finesse Damage Die Size Bonus" }
    );

    // Spell Damage Die Size Bonus - allows increasing spell damage from d6 to d8/d10/d12
    schema.spellDamageDieSizeBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Spell Damage Die Size Bonus",
        hint: "Increases the base d6 die size. +2 for d8, +4 for d10, etc."
      }
    );

    // Spell Damage Die Size - derived value
    schema.spellDamageDieSize = new fields.NumberField({
      ...requiredInteger,
      initial: 6,
      min: 4,
      max: 20
    });

    // --- Specific Critical Hit Threshold Bonuses ---
    // These REDUCE the critNumber (e.g. -1 means crit on 19)
    schema.spellCritBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Spell Crit Bonus" }
    );
    schema.meleeCritBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Melee Crit Bonus" }
    );
    schema.rangedCritBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Ranged Crit Bonus" }
    );
    schema.brawlCritBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Brawl Crit Bonus" }
    );
    schema.finesseCritBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Finesse Crit Bonus" }
    );

    // ---------------------

    // Bonuses container for various character bonuses
    schema.bonuses = new fields.SchemaField({
      hpPerLevel: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        {
          initial: [],
          label: "HP per Level Bonus",
          hint: "Bonus HP granted per character level. Can be a number (e.g., 1) or formula (e.g., floor(@attributes.level.value / 2))"
        }
      ),
      spellManaCostReduction: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        {
          initial: [],
          label: "Spell Mana Cost Reduction",
          hint: "Reduces the total mana cost of spells. Can be a number or formula."
        }
      ),
      deliveryManaCostReduction: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        {
          initial: [],
          label: "Delivery Mana Cost Reduction",
          hint: "Reduces the delivery portion of spell mana cost. Can be a number or formula."
        }
      )
    });

    // Favor/Hinder system - toggle for roll modifiers
    schema.favorHinder = new fields.StringField({
      initial: 'none',
      choices: Object.keys(CONFIG.VAGABOND.favorHinderStates),
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
            max: CONFIG.VAGABOND.homebrew?.statCap ?? 7,
          }),
          // Bonus field for Active Effects to modify stats
          bonus: new fields.ArrayField(
            new fields.StringField({ blank: true }),
            {
              initial: [],
              label: "Stat Bonus",
              hint: "Can be a number (e.g., 1, 5) or formula (e.g., floor(@attributes.level.value / 2))"
            }
          ),
        });
        return obj;
      }, {})
    );

    // Saving Throws system (dynamically defined from homebrew config)
    schema.saves = new fields.SchemaField(
      (CONFIG.VAGABOND.homebrew?.saves ?? []).reduce((obj, save) => {
        obj[save.key] = new fields.SchemaField({
          bonus: new fields.ArrayField(
            new fields.StringField({ blank: true }),
            { initial: [] }
          ),
        });
        return obj;
      }, {})
    );

    // Skills system (dynamically defined from homebrew config)
    schema.skills = new fields.SchemaField(
      (CONFIG.VAGABOND.homebrew?.skills ?? []).reduce((obj, skill) => {
        obj[skill.key] = new fields.SchemaField({
          trained: new fields.BooleanField({ initial: false }),
          bonus: new fields.ArrayField(
            new fields.StringField({ blank: true }),
            { initial: [] }
          ),
        });
        return obj;
      }, {})
    );

    // Damage immunities and weaknesses
    schema.immunities = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [] }
    );

    schema.weaknesses = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [] }
    );

    // ==========================================
    // STATUS CONDITION AUTOMATION FIELDS
    // ==========================================

    // Bidirectional Status Modifiers (Phase 2)
    // These fields enable status effects to modify both the actor and targets

    // Incoming healing modifier (e.g., Sickened: -2 to healing received)
    schema.incomingHealingModifier = new fields.NumberField({
      ...requiredInteger,
      initial: 0,
      label: "Incoming Healing Modifier"
    });

    // Incoming attacks modifier (e.g., Vulnerable: attackers have Favor)
    schema.incomingAttacksModifier = new fields.StringField({
      initial: 'none',
      choices: ['none', 'favor', 'hinder'],
      label: "Incoming Attacks Modifier"
    });

    // Outgoing saves modifier (e.g., Confused: enemy saves have Favor)
    schema.outgoingSavesModifier = new fields.StringField({
      initial: 'none',
      choices: ['none', 'favor', 'hinder'],
      label: "Outgoing Saves Modifier"
    });

    // Auto-fail stats (e.g., Incapacitated: auto-fail Might and Dexterity)
    schema.autoFailStats = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [], label: "Auto-Fail Stats" }
    );

    // Auto-fail all rolls (e.g., Dead: automatically fails all checks, saves, and attacks)
    schema.autoFailAllRolls = new fields.BooleanField({
      initial: false,
      label: "Auto-Fail All Rolls"
    });

    // Defender status modifiers (affects attackers targeting this actor)
    schema.defenderStatusModifiers = new fields.SchemaField({
      // Invisible: attackers are treated as Blinded
      attackersAreBlinded: new fields.BooleanField({ initial: false }),
      // Unconscious: close attacks auto-crit
      closeAttacksAutoCrit: new fields.BooleanField({ initial: false })
    });

    // Status-specific data (for conditions that need extra context)
    schema.statusEffectData = new fields.SchemaField({
      // Charmed: UUID of the charmer
      charmed: new fields.SchemaField({
        charmerUuid: new fields.StringField({ initial: '', blank: true })
      }),
      // Burning: ongoing damage formula
      burning: new fields.SchemaField({
        damageFormula: new fields.StringField({ initial: '1d6', blank: true }),
        damageType: new fields.StringField({ initial: 'fire' })
      }),
      // Suffocating: track start round
      suffocating: new fields.SchemaField({
        startRound: new fields.NumberField({ ...requiredInteger, initial: 0 })
      })
    });

    return schema;
  }

  /** * V13 Best Practice: prepareBaseData is where we load defaults from Items (Class/Ancestry).
   * This happens BEFORE Active Effects are applied.
   */
  prepareBaseData() {
    super.prepareBaseData();

    // Reset all bonus values before Active Effects apply
    this._resetBonuses();

    // Apply Class Data
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
   * Resets all bonus values to empty arrays before active effects apply
   * @private
   */
  _resetBonuses() {
    // --- 1. Reset Flat Mechanics ---
    this.inventory.bonusSlots = []; // MUST reset - Active Effects will add to this
    this.inventory.boundsBonus = [];
    this.mana.bonus = [];
    this.mana.castingMaxBonus = [];
    this.focus.maxBonus = [];
    this.speed.bonus = [];
    this.armorBonus = [];
    this.bonusLuck = [];
    this.health.bonus = [];
    this.fatigueBonus = [];
    this.bonuses.hpPerLevel = [];
    this.bonuses.spellManaCostReduction = [];
    this.bonuses.deliveryManaCostReduction = [];

    // --- 2. Reset Universal Bonuses (from Active Effects) ---
    this.universalCheckBonus = [];
    this.universalDamageBonus = [];
    this.universalWeaponDamageBonus = [];
    this.universalSpellDamageBonus = [];
    this.universalAlchemicalDamageBonus = [];

    // Reset dice bonuses (these are arrays)
    this.universalDamageDice = [];
    this.universalWeaponDamageDice = [];
    this.universalSpellDamageDice = [];
    this.universalAlchemicalDamageDice = [];

    // Reset specific die size bonuses
    this.meleeDamageDieSizeBonus = [];
    this.rangedDamageDieSizeBonus = [];
    this.brawlDamageDieSizeBonus = [];
    this.finesseDamageDieSizeBonus = [];

    // Reset spell damage die size bonus (evaluated in derived data)
    this.spellDamageDieSizeBonus = [];

    // Reset specific crit bonuses
    this.spellCritBonus = [];
    this.meleeCritBonus = [];
    this.rangedCritBonus = [];
    this.brawlCritBonus = [];
    this.finesseCritBonus = [];

    // --- 3. Loop: Reset All Stat & Save Bonuses ---
    for (let s of Object.values(this.stats)) { s.bonus = []; }
    for (let s of Object.values(this.saves)) { s.bonus = []; }

    // --- 4. Loop: Reset All Skill Bonuses ---
    for (let s of Object.values(this.skills)) { s.bonus = []; }

    // 5. Reset Defaults
    this.attributes.isSpellcaster = false;
    this.attributes.manaMultiplier = 0;

    // --- 6. Reset Status Condition Fields ---
    this.incomingHealingModifier = 0;
    this.incomingAttacksModifier = 'none';
    this.outgoingSavesModifier = 'none';
    this.autoFailStats = [];
    this.autoFailAllRolls = false;
    this.defenderStatusModifiers.attackersAreBlinded = false;
    this.defenderStatusModifiers.closeAttacksAutoCrit = false;
    // Don't reset statusEffectData - it contains persistent state like charmerUuid
  }

  /**
   * Evaluate a formula field that can contain either a simple number, a Roll formula, or an array of formulas.
   * @param {string|number|Array<string>} formula - The formula(s) to evaluate (e.g., "1", "@attributes.level.value", or ["1", "@attributes.level.value"])
   * @param {object} rollData - The roll data context (from getRollData())
   * @returns {number} The evaluated result (sum of all formulas), or 0 if invalid
   * @private
   */
  _evaluateFormulaField(formula, rollData) {
    // Handle empty/null/undefined
    if (!formula) return 0;

    // If it's an array, evaluate each formula and sum the results
    if (Array.isArray(formula)) {
      let total = 0;
      for (const f of formula) {
        total += this._evaluateSingleFormula(f, rollData);
      }
      return total;
    }

    // Single formula (backward compatibility with old StringField data)
    return this._evaluateSingleFormula(formula, rollData);
  }

  /**
   * Evaluate a single formula string or number.
   * @param {string|number} formula - The formula to evaluate (e.g., "1", "@attributes.level.value")
   * @param {object} rollData - The roll data context (from getRollData())
   * @returns {number} The evaluated result, or 0 if invalid
   * @private
   */
  _evaluateSingleFormula(formula, rollData) {
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
        console.warn(`Vagabond | Formula evaluation returned invalid result: ${formulaStr} → ${replaced} → ${result}`);
        return 0;
      }

      return Number(result);
    } catch (err) {
      console.warn(`Vagabond | Invalid formula in bonus field: "${formulaStr}"`, err);
      return 0;
    }
  }

  /**
   * Evaluate all NON-STAT bonus fields (everything except stat bonuses).
   * Stat bonuses are handled inline in prepareDerivedData to avoid StringField coercion issues.
   * @param {object} rollData - The roll data context
   * @private
   */
  _evaluateNonStatBonusFields(rollData) {
    // Top-level bonuses
    this.bonusLuck = this._evaluateFormulaField(this.bonusLuck, rollData);
    this.armorBonus = this._evaluateFormulaField(this.armorBonus, rollData);
    // Combine Active Effect check bonus + player-controlled manual bonus
    this.universalCheckBonus = this._evaluateFormulaField(this.universalCheckBonus, rollData) + (this.manualCheckBonus || 0);
    this.universalDamageBonus = this._evaluateFormulaField(this.universalDamageBonus, rollData);
    this.universalWeaponDamageBonus = this._evaluateFormulaField(this.universalWeaponDamageBonus, rollData);
    this.universalSpellDamageBonus = this._evaluateFormulaField(this.universalSpellDamageBonus, rollData);
    this.universalAlchemicalDamageBonus = this._evaluateFormulaField(this.universalAlchemicalDamageBonus, rollData);

    // Evaluate dice bonuses (join arrays into formula strings)
    this.universalDamageDice = this.universalDamageDice.filter(d => !!d).join(' + ');
    this.universalWeaponDamageDice = this.universalWeaponDamageDice.filter(d => !!d).join(' + ');
    this.universalSpellDamageDice = this.universalSpellDamageDice.filter(d => !!d).join(' + ');
    this.universalAlchemicalDamageDice = this.universalAlchemicalDamageDice.filter(d => !!d).join(' + ');

    // Mana bonuses
    this.mana.bonus = this._evaluateFormulaField(this.mana.bonus, rollData);
    this.mana.castingMaxBonus = this._evaluateFormulaField(this.mana.castingMaxBonus, rollData);

    // Other bonuses
    this.speed.bonus = this._evaluateFormulaField(this.speed.bonus, rollData);
    this.health.bonus = this._evaluateFormulaField(this.health.bonus, rollData);
    this.fatigueBonus = this._evaluateFormulaField(this.fatigueBonus, rollData);
    this.inventory.bonusSlots = this._evaluateFormulaField(this.inventory.bonusSlots, rollData);
    this.inventory.boundsBonus = this._evaluateFormulaField(this.inventory.boundsBonus, rollData);
    this.bonuses.hpPerLevel = this._evaluateFormulaField(this.bonuses.hpPerLevel, rollData);
    this.bonuses.spellManaCostReduction = this._evaluateFormulaField(this.bonuses.spellManaCostReduction, rollData);
    this.bonuses.deliveryManaCostReduction = this._evaluateFormulaField(this.bonuses.deliveryManaCostReduction, rollData);
    
    // Evaluate specific die size bonuses
    this.meleeDamageDieSizeBonus = this._evaluateFormulaField(this.meleeDamageDieSizeBonus, rollData);
    this.rangedDamageDieSizeBonus = this._evaluateFormulaField(this.rangedDamageDieSizeBonus, rollData);
    this.brawlDamageDieSizeBonus = this._evaluateFormulaField(this.brawlDamageDieSizeBonus, rollData);
    this.finesseDamageDieSizeBonus = this._evaluateFormulaField(this.finesseDamageDieSizeBonus, rollData);
    this.spellDamageDieSizeBonus = this._evaluateFormulaField(this.spellDamageDieSizeBonus, rollData);

    // Evaluate specific crit bonuses
    this.spellCritBonus = this._evaluateFormulaField(this.spellCritBonus, rollData);
    this.meleeCritBonus = this._evaluateFormulaField(this.meleeCritBonus, rollData);
    this.rangedCritBonus = this._evaluateFormulaField(this.rangedCritBonus, rollData);
    this.brawlCritBonus = this._evaluateFormulaField(this.brawlCritBonus, rollData);
    this.finesseCritBonus = this._evaluateFormulaField(this.finesseCritBonus, rollData);

    // NOTE: Stat bonuses, Save bonuses, Skill bonuses, and Weapon Skill bonuses
    // are NOT evaluated here - they're done inline in prepareDerivedData
    // to avoid StringField coercion issues (StringFields convert numbers back to strings)
  }

/**
   * V13 Best Practice: prepareDerivedData is for calculations.
   * This happens AFTER Active Effects.
   */
  prepareDerivedData() {
    // Get roll data for formula evaluation (need base stat values)
    // Build minimal roll data for initial stat calculations
    const initialRollData = this.getRollData();

    // Calculate stat totals with evaluated bonuses
    // NOTE: We evaluate formulas inline instead of storing back to StringFields
    // because StringFields coerce numbers back to strings
    for (const [key, stat] of Object.entries(this.stats)) {
      const value = stat.value || 0;
      // Evaluate the bonus field (handles both simple numbers and formulas)
      const evaluatedBonus = this._evaluateFormulaField(stat.bonus, initialRollData);
      stat.total = value + evaluatedBonus;
      // Ensure total doesn't exceed 12 (max stat value)
      stat.total = Math.min(stat.total, 12);
      // Ensure total doesn't go below 0
      stat.total = Math.max(stat.total, 0);
    }

    // Now evaluate all OTHER bonus fields (non-stat bonuses)
    const rollData = this.getRollData();
    this._evaluateNonStatBonusFields(rollData);

    // Calculate fatigueMax from homebrew config + bonus
    this.fatigueMax = (CONFIG.VAGABOND?.homebrew?.derivations?.fatiguePCMax ?? 5) + (this.fatigueBonus || 0);
    // Clamp current fatigue to fatigueMax
    if (this.fatigue > this.fatigueMax) this.fatigue = this.fatigueMax;

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

    // Calculate final spell damage die size (base from homebrew config, e.g. 'd6' → 6)
    const spellBaseDieStr = CONFIG.VAGABOND?.homebrew?.dice?.spellBaseDamage ?? 'd6';
    const spellBaseDieNum = parseInt(spellBaseDieStr.replace(/\D/g, '')) || 6;
    this.spellDamageDieSize = spellBaseDieNum + (this.spellDamageDieSizeBonus || 0);

    // ------------------------------------------------------------------
    // Calculate Max HP
    // Formula: (hpPerLevelBase × Level) + (hpPerLevel Bonus × Level) + Flat HP Bonus
    // hpPerLevelBase comes from the configurable derivation formula (default: @might.total)
    // Tough Perk adds +1 hpPerLevel per stack, giving +Level HP per stack
    // Flat bonus (system.health.bonus) adds a fixed amount regardless of level
    // We do this BEFORE other combat values in case they depend on Max HP
    // ------------------------------------------------------------------
    const levelValue = this.attributes.level?.value || 1; // Ensure minimum level 1
    const hpFormula = CONFIG.VAGABOND?.homebrew?.derivations?.hp ?? '@might.total';
    const hpPerLevelBase = this._evaluateSingleFormula(hpFormula, rollData);
    // Evaluate HP bonuses inline (StringFields coerce numbers back to strings)
    const hpPerLevelBonus = this._evaluateFormulaField(this.bonuses.hpPerLevel, rollData);
    const flatHpBonus = this._evaluateFormulaField(this.health.bonus, rollData);

    // Calculate base derived Max HP with active effects integration
    const baseMaxHP = (hpPerLevelBase * levelValue) + (hpPerLevelBonus * levelValue) + flatHpBonus;
    
    // Add to existing value (which includes Active Effects modifications)
    // Ensure minimum HP of 1 regardless of negative modifiers
    this.health.max = Math.max(1, (this.health.max || 0) + baseMaxHP);


    // ------------------------------------------------------------------
    // 1. Calculate derived values that depend on Embedded Items/Effects
    // ------------------------------------------------------------------
    this._calculateManaValues(rollData);

    // NOTE: Check your _calculateCombatValues function!
    // If it currently calculates health.max, you should remove that line
    // from inside the helper function so it doesn't overwrite the work we just did above.
    this._calculateCombatValues(rollData);

    this._calculateInventorySlots(rollData);
    this._calculateBounds(rollData);

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

    // Process Saves (dynamically from homebrew config)
    for (const saveDef of (CONFIG.VAGABOND.homebrew?.saves ?? [])) {
      const save = this.saves[saveDef.key];
      if (!save) continue;
      const bonus = this._evaluateFormulaField(save.bonus, rollData);
      const stat1Total = this.stats[saveDef.stat1]?.total || 0;
      const stat2Total = this.stats[saveDef.stat2]?.total || 0;
      save.difficulty = saveDef.baseValue - stat1Total - stat2Total - bonus;
      save.label = saveDef.label;
      save.description = saveDef.description;
      const abbr1 = game.i18n.localize(CONFIG.VAGABOND.statAbbreviations[saveDef.stat1] ?? '') || saveDef.stat1.toUpperCase().slice(0, 3);
      const abbr2 = game.i18n.localize(CONFIG.VAGABOND.statAbbreviations[saveDef.stat2] ?? '') || saveDef.stat2.toUpperCase().slice(0, 3);
      save.statAbbr = `${abbr1}+${abbr2}`;
    }

    // Process Skills (includes all weapon skills; stat association comes from homebrew config)
    const trainedMult         = CONFIG.VAGABOND?.homebrew?.multipliers?.trained         ?? 2;
    const untrainedMult       = CONFIG.VAGABOND?.homebrew?.multipliers?.untrained       ?? 1;
    const skillDifficultyBase = CONFIG.VAGABOND?.homebrew?.dice?.skillDifficultyBase    ?? 20;
    const skillFormula        = CONFIG.VAGABOND?.homebrew?.dice?.skillFormula           ?? '@base - @stat * @mult - @bonus';
    for (const key in this.skills) {
      const skill = this.skills[key];
      const configSkill = CONFIG.VAGABOND?.homebrew?.skills?.find(s => s.key === key);
      // Stat association lives in config, not in schema (stat field removed from schema)
      skill.stat = configSkill?.stat ?? '';
      const statValue = this.stats[skill.stat]?.total || 0;
      const skillBonus = this._evaluateFormulaField(skill.bonus, rollData);

      const mult = skill.trained ? trainedMult : untrainedMult;
      const resolved = skillFormula
        .replace(/@base/g, skillDifficultyBase)
        .replace(/@stat/g, statValue)
        .replace(/@mult/g, mult)
        .replace(/@bonus/g, skillBonus);
      skill.difficulty = Roll.safeEval(resolved);
      skill.label = configSkill?.label ?? key;
      skill.isWeaponSkill    = configSkill?.isWeaponSkill    ?? false;
      skill.showInSkillsList = configSkill?.showInSkillsList ?? false;
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

  /**
   * Migrate legacy system.weaponSkills data into system.skills.
   * Called automatically by Foundry before the DataModel is constructed.
   * @param {object} data - The raw source data
   * @returns {object} The (potentially mutated) source data
   */
  static migrateData(data) {
    if (data.weaponSkills) {
      data.skills ??= {};
      // melee/ranged only ever lived in weaponSkills — migrate them to skills
      for (const key of ['melee', 'ranged']) {
        if (data.weaponSkills[key] && !data.skills[key]) {
          data.skills[key] = foundry.utils.deepClone(data.weaponSkills[key]);
        }
      }
      // brawl/finesse were duplicated — only copy trained if the skills entry is missing it
      for (const key of ['brawl', 'finesse']) {
        if (data.weaponSkills[key]?.trained && !data.skills[key]?.trained) {
          data.skills[key] ??= {};
          data.skills[key].trained = data.weaponSkills[key].trained;
        }
      }
    }
    return super.migrateData(data);
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
    if (this.saves) {
      data.saves = {};
      for (let [k, v] of Object.entries(this.saves)) {
        data.saves[k] = foundry.utils.deepClone(v);
        // Ensure stat field is included (it's readonly so might not clone)
        if (v.stat) data.saves[k].stat = v.stat;
      }
    }
    data.lvl = this.attributes.level.value;

    // Add attributes for formula usage (enables @attributes.level.value, etc.)
    if (this.attributes) {
      data.attributes = foundry.utils.deepClone(this.attributes);
    }

    // Add universal bonuses for formula usage
    data.universalCheckBonus = this.universalCheckBonus || 0;
    data.universalDamageBonus = this.universalDamageBonus || 0;
    data.universalDamageDice = this.universalDamageDice || '';

    // Add specific bonuses for formula usage
    data.meleeDamageDieSizeBonus = this.meleeDamageDieSizeBonus || 0;
    data.rangedDamageDieSizeBonus = this.rangedDamageDieSizeBonus || 0;
    data.brawlDamageDieSizeBonus = this.brawlDamageDieSizeBonus || 0;
    data.finesseDamageDieSizeBonus = this.finesseDamageDieSizeBonus || 0;
    data.spellDamageDieSizeBonus = this.spellDamageDieSizeBonus || 0;

    data.meleeCritBonus = this.meleeCritBonus || 0;
    data.rangedCritBonus = this.rangedCritBonus || 0;
    data.brawlCritBonus = this.brawlCritBonus || 0;
    data.finesseCritBonus = this.finesseCritBonus || 0;
    data.spellCritBonus = this.spellCritBonus || 0;

    return data;
  }

  _calculateCombatValues(rollData) {
    const mightTotal = this.stats.might?.total || 0;
    const dexTotal = this.stats.dexterity?.total || 0;
    const level = this.attributes.level.value || 1;

    // Luck Pool — driven by configurable stat; 'none' disables the pool entirely
    const luckStatKey = CONFIG.VAGABOND?.homebrew?.derivations?.luckStat ?? 'luck';
    const hasLuckPool = luckStatKey && luckStatKey !== 'none';
    this.hasLuckPool = hasLuckPool;
    this.maxLuck = hasLuckPool ? (this.stats[luckStatKey]?.total || 0) : 0;

    if (this.currentLuck === undefined || this.currentLuck === null) {
      this.currentLuck = this.maxLuck;
    }
    if (this.currentLuck > this.maxLuck) {
      this.currentLuck = this.maxLuck;
    }

    // Speed Calculation
    // 1. Get speed bonus from Active Effects (stored in system.speed.bonus)
    const speedBonus = this._evaluateFormulaField(this.speed.bonus, rollData);

    // 2. Evaluate base speed from homebrew derivation formula
    const speedFormula = CONFIG.VAGABOND?.homebrew?.derivations?.speed
      ?? '25 + floor(max(0, @dexterity.total - 2) / 2) * 5';
    const baseSpeed = Math.max(0, this._evaluateSingleFormula(speedFormula, rollData) + speedBonus);

    // 3. Evaluate crawl/travel formulas — @speed.base is available via augmented rollData
    const speedRollData = { ...rollData, speed: { base: baseSpeed } };
    const crawlFormula  = CONFIG.VAGABOND?.homebrew?.derivations?.crawl  ?? '@speed.base * 3';
    const travelFormula = CONFIG.VAGABOND?.homebrew?.derivations?.travel ?? 'floor(@speed.base / 5)';

    this.speed = {
      base:   baseSpeed,
      crawl:  Math.max(0, this._evaluateSingleFormula(crawlFormula,  speedRollData)),
      travel: Math.max(0, this._evaluateSingleFormula(travelFormula, speedRollData)),
      bonus:  speedBonus,
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
    // Evaluate armor bonus inline (StringFields coerce numbers back to strings)
    const armorBonus = this._evaluateFormulaField(this.armorBonus, rollData);
    this.armor = totalArmor + armorBonus;
  }

  _calculateInventorySlots(rollData) {
    // Base slots come from the configurable derivation formula (default: 8 + @might.total)
    const invFormula = CONFIG.VAGABOND?.homebrew?.derivations?.inventory ?? '8 + @might.total';
    const invBase = this._evaluateSingleFormula(invFormula, rollData);
    // Evaluate inventory bonus slots inline (StringFields coerce numbers back to strings)
    const bonusSlots = this._evaluateFormulaField(this.inventory.bonusSlots, rollData);
    const baseMaxSlots = invBase + bonusSlots;

    // Get current fatigue (0-5)
    const currentFatigue = this.fatigue || 0;

    // Calculate effective max slots (fatigue reduces available slots)
    this.inventory.baseMaxSlots = baseMaxSlots; // Store for display: e.g., "16 - 2 Fatigue"
    this.inventory.fatigueSlots = currentFatigue; // Store fatigue count
    this.inventory.maxSlots = Math.max(0, baseMaxSlots - currentFatigue); // Effective max

    let occupiedSlots = 0;
    let occupiedSlotsWithZero = 0;

    if (this.parent?.items) {
      for (const item of this.parent.items) {
        const isInventoryItem = (item.type === 'equipment') ||
                               (item.type === 'weapon') ||
                               (item.type === 'armor') ||
                               (item.type === 'gear') ||
                               (item.type === 'container');

        if (isInventoryItem) {
          // Skip items inside containers
          if (item.system.containerId) continue;

          // Get slots from appropriate field (containers use 'slots', equipment uses 'baseSlots' or 'slots')
          const itemSlots = item.system.slots || item.system.baseSlots || 0;

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
    this.inventory.availableSlots = this.inventory.maxSlots - occupiedSlots; // Available = Effective max - occupied
  }

  _calculateBounds(rollData) {
    const boundsBonus = this._evaluateFormulaField(this.inventory.boundsBonus, rollData);
    this.inventory.maxBounds = 3 + boundsBonus;

    let currentBounds = 0;
    if (this.parent?.items) {
      for (const item of this.parent.items) {
        if (item.type === 'equipment' && item.system.bound === true) {
          currentBounds++;
        }
      }
    }
    this.inventory.currentBounds = currentBounds;
  }

  _calculateManaValues(rollData) {
    // 1. Check isSpellcaster
    if (this.attributes.isSpellcaster) {

      const castingStat = this.attributes.castingStat || 'reason';
      const castingStatTotal = this.stats[castingStat]?.total || 0;
      const level = this.attributes.level?.value || 1;

      // Multiplier & Max Mana Logic
      const multiplier = this.attributes.manaMultiplier || 0;
      // Evaluate mana bonus inline (StringFields coerce numbers back to strings)
      const manaBonus = this._evaluateFormulaField(this.mana.bonus, rollData);
      this.mana.max = (multiplier * level) + manaBonus;

      // 2. Calculate Casting Max
      // Formula: (Stat + Level/2) + Bonus
      // Use total stat which includes bonuses from Active Effects
      const baseCastingMax = castingStatTotal + Math.ceil(level / 2);
      // Evaluate casting max bonus inline (StringFields coerce numbers back to strings)
      const castingMaxBonus = this._evaluateFormulaField(this.mana.castingMaxBonus, rollData);

      this.mana.castingMax = baseCastingMax + castingMaxBonus;

    } else {
      this.mana.max = 0;
      this.mana.castingMax = 0;
    }

    // Focus system — always derived regardless of spellcaster status
    const focusBonus = this._evaluateFormulaField(this.focus.maxBonus, rollData);
    this.focus.max = 5 + focusBonus;
    this.focus.current = (this.focus.spellIds || []).length;
  }

  _calculateXPRequirements() {
    const currentLevel = this.attributes.level.value || 1;
    const nextLevel = currentLevel + 1;
    const currentXP = this.attributes.xp || 0;

    // Read XP table from homebrew config; fall back to default 'normal' pacing formula
    const xpTable = CONFIG.VAGABOND?.homebrew?.leveling?.xpTable ?? [];
    const entry = xpTable.find(t => t.level === nextLevel);
    const xpRequired = entry ? (entry.xp || 0) : 5 * nextLevel;

    this.attributes.xpRequired = xpRequired;
    this.attributes.xpProgress = currentXP;
    this.attributes.canLevelUp = currentXP >= xpRequired;
  }
}