import VagabondActorBase from './base-actor.mjs';
import { EquipmentHelper } from '../helpers/equipment-helper.mjs';
import { armorWornRollData, combatRollData } from '../helpers/rule-rolldata.mjs';
import { AutomationMode } from '../helpers/automation-mode.mjs';
import { xpRequiredForLevel } from '../helpers/homebrew-config.mjs';

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
      ),
      weaponSlotsBonus: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        {
          initial: [],
          label: "Bonus Equipped Weapon Slots",
          hint: "Can be a number (e.g., 1) or formula (e.g., @attributes.level.value)"
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

    // Reduction of the worn Armor's Reflex penalty (Skirmisher: -1 per copy)
    schema.reflexPenaltyReduction = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Armor Reflex Penalty Reduction",
        hint: "Number or formula subtracted from the worn Armor's Reflex penalty (never below 0)"
      }
    );

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

    // Universal Difficulty Bonus - AE-driven modifier to all skill/save difficulty thresholds
    // Negative = easier (difficulty decreases), Positive = harder (difficulty increases)
    schema.universalDifficultyBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Universal Difficulty Bonus",
        hint: "Added to all skill and save difficulty thresholds. Negative = easier rolls, positive = harder."
      }
    );

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

    // Per-die doubling: being types whose presence among targets doubles bonusPerDamageDie
    schema.bonusPerDamageDieDoubleVsBeingTypes = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Per-Die Bonus: Double vs Being Types", hint: "Each entry is a being type (e.g. Undead, Hellspawn). If any target matches, the per-die bonus is doubled." }
    );

    // Save vs status bonuses — format: 'statusId:saveKey:value', saveKey can be 'any'
    // Example: 'frightened:will:1' adds +1 to Will saves against Frightened
    schema.saveVsStatusBonuses = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Save vs Status Bonuses", hint: "Format: 'statusId:saveKey:value'. Use 'any' as saveKey to apply to all saves vs that status. Value supports formulas." }
    );

    // Per-die penalties (Alpha 3 statuses): Frightened = -2 to each damage die it deals,
    // Sickened = -2 to each healing die it receives. Positive numbers; a die never drops below 0.
    schema.damageDiePenalty = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Damage Die Penalty", hint: "Penalty to each damage die this actor deals (Frightened: 2). Formula-capable." }
    );
    schema.healingDiePenalty = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Healing Die Penalty", hint: "Penalty to each healing die this actor receives (Sickened: 2). Formula-capable." }
    );

    // Per-die flat bonuses (applied after rolling, scales with dice count including explosions)
    schema.bonusPerDamageDie = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Bonus Per Damage Die (All)", hint: "Flat bonus added per damage die rolled (including explosions). Formula-capable." }
    );
    schema.weaponBonusPerDamageDie = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Bonus Per Damage Die (Weapon)", hint: "Flat bonus per weapon damage die (including explosions). Formula-capable." }
    );
    schema.spellBonusPerDamageDie = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Bonus Per Damage Die (Spell)", hint: "Flat bonus per spell damage die (including explosions). Formula-capable." }
    );
    schema.alchemicalBonusPerDamageDie = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Bonus Per Damage Die (Alchemical)", hint: "Flat bonus per alchemical damage die (including explosions). Formula-capable." }
    );

    // --- Specific Damage Die Size Bonuses ---
    // Per-weapon-skill damage die size bonuses (dynamic from homebrew skills flagged
    // isWeaponSkill; defaults: melee, ranged, brawl, finesse). Generates
    // <skillKey>DamageDieSizeBonus. Read by weapon damage rolls via the item's weaponSkill.
    for (const skill of (CONFIG.VAGABOND.homebrew?.skills ?? []).filter(s => s.isWeaponSkill)) {
      schema[`${skill.key}DamageDieSizeBonus`] = new fields.ArrayField(
        new fields.StringField({ blank: true }),
        { initial: [], label: `${skill.label} Damage Die Size Bonus` }
      );
    }

    // Spell Damage Die Size Bonus - allows increasing spell damage from d6 to d8/d10/d12
    schema.spellDamageDieSizeBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      {
        initial: [],
        label: "Spell Damage Die Size Bonus",
        hint: "Increases the base d6 die size. +2 for d8, +4 for d10, etc."
      }
    );

    // NOTE: Cleave's extra-target count is no longer a formula/perk-extensible field —
    // it's derived purely from the weapon's own die size (see VAGABOND.weaponDieSteps).
    // Vicious (RAW) is a flat +1 crit die — no formula/AE-scaling field (was 'brutalDice').

    // Spell Damage Die Size - derived value
    schema.spellDamageDieSize = new fields.NumberField({
      ...requiredInteger,
      initial: 6,
      min: 4,
      max: 20
    });

    // --- Specific Critical Hit Threshold Bonuses ---
    // These REDUCE the critNumber (e.g. -1 means crit on 19).
    // Per-weapon-skill crit bonuses (dynamic from homebrew skills flagged isWeaponSkill;
    // defaults: melee, ranged, brawl, finesse). Generates <skillKey>CritBonus.
    for (const skill of (CONFIG.VAGABOND.homebrew?.skills ?? []).filter(s => s.isWeaponSkill)) {
      schema[`${skill.key}CritBonus`] = new fields.ArrayField(
        new fields.StringField({ blank: true }),
        { initial: [], label: `${skill.label} Crit Bonus` }
      );
    }
    // Per-save crit threshold bonuses (dynamic from homebrew saves config).
    // Generates <saveKey>CritBonus for each configured save (e.g. reflexCritBonus,
    // endureCritBonus, willCritBonus).
    for (const save of (CONFIG.VAGABOND.homebrew?.saves ?? [])) {
      schema[`${save.key}CritBonus`] = new fields.ArrayField(
        new fields.StringField({ blank: true }),
        { initial: [], label: `${save.label} Save Crit Bonus` }
      );
    }
    schema.attackCritBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Attack Crit Bonus (All Weapon Types)" }
    );
    schema.castCritBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Cast Crit Bonus (Spells)" }
    );
    schema.incomingDamageReductionPerDie = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Incoming Damage Reduction Per Die" }
    );

    // Situational attack Favor — AE ADDs a rule key from CONFIG.VAGABOND.attackFavorRules
    // (e.g. 'wounded' = Bloodthirsty). See VagabondRollBuilder.attackFavorVote.
    schema.attackFavorVs = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [], label: "Attack Favor Rules" }
    );

    // Unconditional Favor on whole categories of checks — AE ADDs 'attack' | 'cast' | 'save'.
    // One independent Favor vote per category at the roll sites (VagabondRollBuilder.checkFavorVote).
    schema.favorChecks = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [], label: "Favor On Checks" }
    );

    // Saves that roll two d20s and keep the higher — AE ADDs a save key ('reflex').
    // Read by VagabondRollBuilder.saveBaseDie at every save roll site.
    schema.saveRollsTwice = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [], label: "Saves Rolled Twice (keep higher)" }
    );

    // Favor dice and healing bonus dice roll as exploding dice while this evaluates > 0.
    schema.bonusDiceExplode = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Bonus Dice Explode" }
    );

    // Extra dice added to HP-restoring rolls (healing spells / potions), e.g. '1d6'.
    schema.healingBonusDice = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Healing Bonus Dice" }
    );

    // Faces that also Explode on the HP-restoring rolls of your Spells — AE ADDs '1', '2' or 'max' / 'max-1'
    // (Assured Healer: 1, Luminary Radiant Healer: max). Read by VagabondDamagePipeline.healingExplodeValues.
    schema.healingExplode = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Healing Spell Rolls Explode" }
    );

    // Faces that also Explode on the damage rolls of your Spells — AE ADDs '1', '2' or 'max' / 'max-1'
    // (Vehement Magic: 1). Real damage types only: restorative and '-' rolls never explode from this.
    // Read by VagabondDamagePipeline.spellDamageExplodeValues.
    schema.spellDamageExplode = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Spell Damage Rolls Explode" }
    );

    // Barbarian Rage auto-trigger: when true (AE-set — switch that effect off to play
    // Berserk by hand), taking damage or attacking applies Berserk. See rage-helper.mjs.
    schema.rageTrigger = new fields.BooleanField({
      required: true,
      initial: false,
      label: "Auto-Berserk (Rage)"
    });

    // Barbarian Aggressor: set to 1 by the "First Round (auto)" effect so its manual twin
    // ("First Round (manual)") steps aside instead of doubling the bonus again.
    schema.aggressorAuto = new fields.NumberField({
      required: true,
      integer: true,
      min: 0,
      initial: 0,
      label: "Aggressor Auto (First Round)"
    });

    // Fighter Momentum auto-trigger: when true (AE-set — switch that effect off to claim
    // Momentum by hand), passing a Save against an attack or having its damage reduced to 0
    // gives a Favored next attack. See fighter-helper.mjs.
    schema.momentumTrigger = new fields.BooleanField({
      required: true,
      initial: false,
      label: "Auto-Momentum (Fighter)"
    });

    // Druid (Metamorph forms, see druid-helper.mjs): Savagery adds flat damage to attacks made
    // as a Beast and to the Level used for Polymorph; Beast Mode ignores non-Relic Immune on
    // those attacks and makes a sole-Target self Polymorph continual.
    schema.beastDamageBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Beast Form Damage Bonus (Savagery)" }
    );
    schema.polymorphLevelBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Polymorph Level Bonus (Savagery)" }
    );
    schema.beastIgnoreImmune = new fields.BooleanField({
      required: true,
      initial: false,
      label: "Beast Attacks Ignore Non-Relic Immune (Beast Mode)"
    });
    schema.polymorphContinual = new fields.BooleanField({
      required: true,
      initial: false,
      label: "Self Polymorph Is Continual (Beast Mode)"
    });

    // Gunslinger (see gunslinger-helper.mjs). Deadeye itself is an actor-owned effect that feeds
    // `rangedCritBonus`; these are the class's AE-driven switches/numbers.
    //   deadeyeTrigger / highNoonTrigger — optional automation (switch the AE off to play by hand)
    //   deadeyeGrit        — Deadeye stacks Grit adds (formula)
    //   critExtraDiceBySkill — "<skill>[,<skill>…]: <formula>" extra dice of damage on a Crit with
    //                          that skill (Bad Medicine); derived into { skill: count }
    //   critExplodeSkills  — skill keys whose Crit damage dice Explode (Devastator)
    schema.deadeyeTrigger = new fields.BooleanField({
      required: true,
      initial: false,
      label: "Auto-Deadeye (Gunslinger)"
    });
    schema.highNoonTrigger = new fields.BooleanField({
      required: true,
      initial: false,
      label: "Auto-High Noon (Gunslinger)"
    });
    schema.deadeyeGrit = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Deadeye Stacks Gained By Grit" }
    );
    schema.critExtraDiceBySkill = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Extra Crit Damage Dice (by skill)" }
    );
    // Weapon rules scoped to the skill the attack was rolled with (Pugilist Title Holder), "<skill>: <formula>":
    //   weaponDieBySkill        — damage dice of that skill's weapons use at least this die size (6 = d6)
    //   weaponHighExplodeBySkill — those dice Explode on their N highest faces (2 = the two highest values)
    schema.weaponDieBySkill = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Weapon Die Size (by skill)" }
    );
    schema.weaponHighExplodeBySkill = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Weapon Dice Explode On Highest Faces (by skill)" }
    );
    // Pugilist Haymaker: a Brawl attack that beats the Difficulty by this much (formula, 0 = off) Dazes the Target.
    // Cleared by the world Class Automation mode (TRIGGER_FIELDS).
    schema.haymakerMargin = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Haymaker Margin (Pugilist)" }
    );
    // Revelator Lay on Hands: die size (formula, 0 = no Lay on Hands) and the Statuses it also cures (Divine Resolve)
    schema.layOnHandsDie = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Lay on Hands Die (Revelator)" }
    );
    schema.layOnHandsCures = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Lay on Hands Also Cures (Statuses)" }
    );
    // Rogue: Sneak Attack dice (number of d4s, formula), Lethal Weapon (> 0 = they Explode), the auto trigger
    // ("Sneak Attack: Auto", cleared by the Class Automation mode) and Knack (extra Luck on a Crit).
    schema.sneakAttackDice = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Sneak Attack Dice (Rogue)" }
    );
    schema.sneakAttackExplode = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Sneak Attack Dice Explode (Rogue)" }
    );
    schema.sneakAttackTrigger = new fields.BooleanField({
      required: true,
      initial: false,
      label: "Auto-Sneak Attack (Rogue)"
    });
    schema.critLuckBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Extra Luck On Crit (Rogue Knack)" }
    );
    // Vanguard, Defense Weapons only: damage dice grow this many sizes (Wall) and each die gets this flat
    // bonus (Indestructible) — both formulas, read by the damage pipeline for weapons with the Defense property.
    schema.defenseWeaponDieStep = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Defense Weapon Die Sizes Larger (Vanguard)" }
    );
    schema.defenseWeaponBonusPerDie = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Defense Weapon Bonus Per Damage Die (Vanguard)" }
    );
    schema.critExplodeSkills = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [], label: "Crit Damage Dice Explode (skills)" }
    );

    // Hunter (see hunter-helper.mjs). The Mark itself is an actor-owned effect.
    //   huntersMarkTrigger — attacking a Target with no Mark makes it the Mark (optional automation)
    //   markRules          — rules that apply against the Mark: 'keenVicious' (weapons gain the
    //                        Keen/Vicious they lack), 'critByBonus' (a Bonus can push the result
    //                        into the Crit range), 'weak' (the Mark is Weak to your attacks)
    //   markDamageBonus    — extra damage the Mark takes when you / an Ally damage it (formula)
    schema.huntersMarkTrigger = new fields.BooleanField({
      required: true,
      initial: false,
      label: "Auto-Mark on Attack (Hunter)"
    });
    schema.markRules = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [], label: "Hunter's Mark Rules" }
    );
    schema.markDamageBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Extra Damage To The Mark" }
    );

    // Witch (see witch-helper.mjs). The Hex itself is an actor-owned effect.
    //   hexRules — rules that apply against the hexed Target: 'soulLink' (damage you deal to an Enemy
    //              within Far of the Hex also hurts it), 'weak' (Misery Business: it is Weak to your damage)
    //   hexDamageBonus — Widdershins: extra damage from your Spells against the hexed Target (formula)
    schema.hexDamageBonus = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Extra Spell Damage To The Hexed Target" }
    );
    schema.hexRules = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [], label: "Witch Hex Rules" }
    );

    // Merchant Midas Touch: Relic Bonuses / Ranks you have Equipped are raised by this much (formula).
    // See _applyRelicBoost - it works on active effects flagged `flags.vagabond.relicBoost`.
    schema.relicBoost = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Relic Bonus / Rank Boost" }
    );

    // Sorcerer Twinned Spell (see sorcerer-helper.mjs): casting the same Spell again on a Turn Favors the
    // second Cast Check. Cleared by the world Class Automation mode (TRIGGER_FIELDS), Turn-counting so
    // Combat-only (COMBAT_ONLY_FIELDS).
    schema.twinnedSpellTrigger = new fields.BooleanField({
      required: true,
      initial: false,
      label: "Auto-Twinned Spell (Sorcerer)"
    });

    // Luminary Overheal (see damage-helper handleApplyRestorative): healing that exceeds the Target's Max HP is
    // reported on the apply card so it can be given to yourself or a Being you can see. Display only.
    schema.overhealExcess = new fields.BooleanField({
      required: true,
      initial: false,
      label: "Overheal: report excess healing (Luminary)"
    });

    // Incoming damage reduction per damage die, limited to damage types. Each entry is
    // "<type>[,<type>…]: <formula>" (e.g. Druid Tempest Within: "cold,fire,shock: floor(@lvl / 4)").
    // Derived into { type: amount } in prepareDerivedData; read by _computeFinalDamage.
    schema.incomingDamageReductionPerDieByType = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { initial: [], label: "Incoming Damage Reduction Per Die (by damage type)" }
    );

    // ---------------------

    // Crafting bonuses (Alchemist class features Eureka / Potency). The per-die
    // damage bonus and explode grant for Potency reuse the existing generic
    // `alchemicalBonusPerDamageDie` bucket / this alchemicalExplode flag — both are
    // read from the USING actor (not the crafter), matching RAW. See
    // docs/crafting-plan.md §4.9.
    schema.craft = new fields.SchemaField({
      eurekaMargin: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        {
          initial: [],
          label: "Eureka Margin",
          hint: "Craft check margin (roll total minus difficulty) needed to gain a Studied Die. 0 = feature absent."
        }
      ),
      alchemicalExplode: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        { initial: [], label: "Alchemical Items Explode (Potency)", hint: "Number of highest die faces that Explode on Alchemical Items (1 = highest, 2 = two highest). 0 = none." }
      ),
      // Known Alchemical Item formulas (Item uuids) — a real stored choice, not a
      // bonus-stacking field; never reset in prepareBaseData. Picked via the
      // Alchemy lab Library (sheet tab / HUD panel), gated by AlchemyHelper.formulaPicksRemaining.
      formulas: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        { initial: [], label: "Known Alchemy Formulas" }
      ),
      // Alchemist class-feature gates. Formula-stack ArrayFields (evaluated >0 →
      // boolean), NOT plain BooleanFields: unlike a perk's weaponAsTrinket (which
      // is either held or not), these live on a single always-embedded class item
      // and must gate by CURRENT LEVEL (Catalyze L1, Mix L6, Prima Materia L10) — a
      // conditional ternary formula only resolves through _evaluateFormulaField,
      // which plain BooleanField overrides never go through. Same pattern as
      // eurekaMargin/alchemicalExplode above.
      catalyze: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        { initial: [], label: "Catalyze (Craft Alchemical Items with the Use Action)" }
      ),
      primaMateria: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        { initial: [], label: "Prima Materia (Craft without Materials)" }
      ),
      mix: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        { initial: [], label: "Mix (Combine two Alchemical Items)" }
      ),
    });

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
      ),
      globalExplode: new fields.ArrayField(
        new fields.StringField({ blank: true }),
        { initial: [], label: "Global Explode (Enable Exploding Dice)" }
      ),
      globalExplodeValues: new fields.StringField({
        initial: '',
        label: "Global Explode Values",
        hint: "Comma-separated die values that trigger explosions (e.g. '6' or '8,6'). Only used when globalExplode is active."
      })
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

    // Status condition immunities — managed via Active Effects (ADD mode appends to array)
    schema.statusImmunities = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [] }
    );

    // Status condition resistances — save rolled with Favor when resisting these statuses
    // Managed via Active Effects (ADD mode appends to array)
    schema.statusResistances = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [] }
    );

    // Senses (keys of CONFIG.VAGABOND.senses, e.g. 'darksight') — managed via Active Effects
    // (ADD appends a key). Mapped onto the character's tokens by NpcSenses.syncCharacterTokens.
    schema.senses = new fields.ArrayField(
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

    // Vulnerable (book p. 11, ruling: "attack" covers Casts, and it is in a bad spot overall):
    // its own Checks and Saves have Hinder through `favorHinder` (same status effect); this flag
    // gives attacks / Casts targeting it and Saves against its attacks / Casts Favor.
    schema.vulnerable = new fields.BooleanField({
      initial: false,
      label: "Vulnerable (attacks / Casts at it and Saves vs its attacks / Casts Favored)"
    });

    // Prone (Alpha 3 p. 11): Vulnerable only for Melee attacks and Reflex Saves — its Melee
    // attacks and Reflex Saves have Hinder; Melee attacks targeting it and Saves against its
    // Melee attacks have Favor.
    schema.meleeReflexVulnerable = new fields.BooleanField({
      initial: false,
      label: "Vulnerable (Melee attacks and Reflex Saves only)"
    });

    // Moves by crawling (Prone: 2' of Speed per 1' of movement) — Speed is halved
    schema.speedHalved = new fields.BooleanField({
      initial: false,
      label: "Speed Halved (crawling)"
    });

    // Gish support: equipped weapons satisfy the trinket casting requirement
    // (set via Active Effect, e.g. by the Gish perk)
    schema.weaponAsTrinket = new fields.BooleanField({
      initial: false,
      label: "Weapon Counts as Trinket"
    });

    // Protector perk: may use their Defense property for a Close ally who fails a Reflex Save
    // (Protect button on the failed result card — DefenseHelper). Set via Active Effect.
    schema.protectorDefense = new fields.BooleanField({
      initial: false,
      label: "Protector: Defense for Close Allies"
    });

    // Patience perk: an unused Brawl / Finesse / Melee weapon has the Defense property until
    // the next Turn (DefenseHelper). Set via Active Effect.
    schema.patienceDefense = new fields.BooleanField({
      initial: false,
      label: "Patience: Unused Weapons Gain Defense"
    });

    // Homebrew: ignore the hand part of the trinket casting mode (e.g. a
    // Wizard who casts with a sword in hand) — only an equipped Trinket needed
    schema.castWithHandsFull = new fields.BooleanField({
      initial: false,
      label: "Cast With Hands Full"
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
    this.inventory.weaponSlotsBonus = [];
    this.mana.bonus = [];
    this.mana.castingMaxBonus = [];
    this.focus.maxBonus = [];
    this.speed.bonus = [];
    this.armorBonus = [];
    this.reflexPenaltyReduction = [];
    this.bonusLuck = [];
    this.health.bonus = [];
    this.fatigueBonus = [];
    this.bonuses.hpPerLevel = [];
    this.bonuses.spellManaCostReduction = [];
    this.bonuses.deliveryManaCostReduction = [];

    // --- 2. Reset Universal Bonuses (from Active Effects) ---
    this.universalCheckBonus = [];
    this.universalDifficultyBonus = [];
    this.universalDamageBonus = [];
    this.universalWeaponDamageBonus = [];
    this.universalSpellDamageBonus = [];
    this.universalAlchemicalDamageBonus = [];

    // Reset dice bonuses (these are arrays)
    this.universalDamageDice = [];
    this.universalWeaponDamageDice = [];
    this.universalSpellDamageDice = [];
    this.universalAlchemicalDamageDice = [];

    // Reset per-die doubling and save-vs-status bonuses (raw string arrays — parsed at roll time)
    this.bonusPerDamageDieDoubleVsBeingTypes = [];
    this.saveVsStatusBonuses = [];

    // Reset per-die bonuses / penalties
    this.damageDiePenalty = [];
    this.healingDiePenalty = [];
    this.bonusPerDamageDie = [];
    this.weaponBonusPerDamageDie = [];
    this.spellBonusPerDamageDie = [];
    this.alchemicalBonusPerDamageDie = [];

    // Reset crafting bonuses (Eureka / Potency / Catalyze / Mix / Prima Materia).
    // craft.formulas is a persisted player choice, never reset here.
    this.craft.eurekaMargin = [];
    this.craft.alchemicalExplode = [];
    this.craft.catalyze = [];
    this.craft.primaMateria = [];
    this.craft.mix = [];

    // Reset specific die size bonuses (per-weapon-skill, dynamic)
    for (const skill of (CONFIG.VAGABOND.homebrew?.skills ?? []).filter(s => s.isWeaponSkill)) {
      this[`${skill.key}DamageDieSizeBonus`] = [];
    }

    // Reset spell damage die size bonus (evaluated in derived data)
    this.spellDamageDieSizeBonus = [];

    // Reset specific crit bonuses (per-weapon-skill + per-save, both dynamic)
    for (const skill of (CONFIG.VAGABOND.homebrew?.skills ?? []).filter(s => s.isWeaponSkill)) {
      this[`${skill.key}CritBonus`] = [];
    }
    for (const save of (CONFIG.VAGABOND.homebrew?.saves ?? [])) {
      this[`${save.key}CritBonus`] = [];
    }
    this.attackCritBonus = [];
    this.castCritBonus = [];
    this.incomingDamageReductionPerDie = [];
    this.incomingDamageReductionPerDieByType = [];
    this.beastDamageBonus = [];
    this.polymorphLevelBonus = [];
    this.deadeyeGrit = [];
    this.critExtraDiceBySkill = [];
    this.critExplodeSkills = [];
    this.defenseWeaponDieStep = [];
    this.defenseWeaponBonusPerDie = [];
    this.sneakAttackDice = [];
    this.sneakAttackExplode = [];
    this.sneakAttackTrigger = false;
    this.critLuckBonus = [];
    this.layOnHandsDie = [];
    this.layOnHandsCures = [];
    this.weaponDieBySkill = [];
    this.weaponHighExplodeBySkill = [];
    this.haymakerMargin = [];
    this.markRules = [];
    this.markDamageBonus = [];
    this.hexRules = [];
    this.hexDamageBonus = [];
    this.relicBoost = [];
    this.bonuses.globalExplode = [];

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
    this.vulnerable = false;
    this.meleeReflexVulnerable = false;
    this.speedHalved = false;
    this.weaponAsTrinket = false;
    this.protectorDefense = false;
    this.patienceDefense = false;
    this.castWithHandsFull = false;
    this.attackFavorVs = [];
    this.favorChecks = [];
    this.saveRollsTwice = [];
    this.bonusDiceExplode = [];
    this.healingBonusDice = [];
    this.healingExplode = [];
    this.spellDamageExplode = [];
    this.rageTrigger = false;
    this.aggressorAuto = 0;
    this.momentumTrigger = false;
    this.deadeyeTrigger = false;
    this.highNoonTrigger = false;
    this.huntersMarkTrigger = false;
    this.twinnedSpellTrigger = false;
    this.overhealExcess = false;
    this.beastIgnoreImmune = false;
    this.polymorphContinual = false;
    this.defenderStatusModifiers.attackersAreBlinded = false;
    this.defenderStatusModifiers.closeAttacksAutoCrit = false;
    // Don't reset statusEffectData - it contains persistent state like charmerUuid
  }

  /**
   * Turn "<type>[,<type>…]: <formula>" entries into { type: amount } (repeats sum, or keep the largest
   * with combine 'max' — "at least" rules such as Title Holder / Dusted Knuckle). The split is on
   * the FIRST colon, so the formula may itself use a ternary.
   * @param {string[]} entries
   * @param {object} rollData
   * @param {'sum'|'max'} [combine='sum']
   * @returns {Object<string, number>}
   * @private
   */
  _evaluateTypedReductions(entries, rollData, combine = 'sum') {
    const out = {};
    for (const entry of Array.isArray(entries) ? entries : []) {
      const text = String(entry ?? '');
      const i = text.indexOf(':');
      if (i < 0) continue;
      const amount = this._evaluateSingleFormula(text.slice(i + 1), rollData);
      if (!amount) continue;
      for (const type of text.slice(0, i).split(',').map(t => t.trim().toLowerCase()).filter(Boolean)) {
        out[type] = combine === 'max' ? Math.max(out[type] ?? 0, amount) : (out[type] ?? 0) + amount;
      }
    }
    return out;
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
      // Strip outer parentheses that Foundry sometimes wraps around formulas
      const cleaned = formulaStr.replace(/^\((.+)\)$/, '$1');

      // Replace @variables with their values from rollData
      const replaced = Roll.replaceFormulaData(cleaned, rollData, { missing: 0 });

      // If the result is pure dice notation (e.g. "1d8") safeEval cannot handle it.
      // Dice expressions are invalid for synchronous derived-value bonus fields — skip silently.
      if (/^\d*d\d+$/.test(replaced.trim())) return 0;

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
   * Merchant Midas Touch: every ACTIVE effect flagged `flags.vagabond.relicBoost` (its number = what ONE boost adds:
   * 1 for a Bonus, 5 for a +5 Speed Rank) gets `step * system.relicBoost` added to each of its positive numeric `add`
   * changes. Only Equipped relics apply (when-equipped suppression), and penalties (Cursed) are never flagged.
   * @param {object} rollData
   * @private
   */
  _applyRelicBoost(rollData) {
    const boost = this._evaluateFormulaField(this.relicBoost, rollData);
    this.relicBoost = boost;
    if (boost <= 0 || typeof this.parent?.allApplicableEffects !== 'function') return;
    for (const effect of this.parent.allApplicableEffects()) {
      const step = Number(effect.flags?.vagabond?.relicBoost) || 0;
      if (!step || !effect.active) continue;
      for (const change of effect.system?.changes ?? []) {
        if (change.type !== 'add' || !(Number(change.value) > 0)) continue;
        const field = foundry.utils.getProperty(this.parent, change.key);
        if (Array.isArray(field)) field.push(String(step * boost));
      }
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
    this.universalDifficultyBonus = this._evaluateFormulaField(this.universalDifficultyBonus, rollData);
    this.universalDamageBonus = this._evaluateFormulaField(this.universalDamageBonus, rollData);
    this.universalWeaponDamageBonus = this._evaluateFormulaField(this.universalWeaponDamageBonus, rollData);
    this.universalSpellDamageBonus = this._evaluateFormulaField(this.universalSpellDamageBonus, rollData);
    this.universalAlchemicalDamageBonus = this._evaluateFormulaField(this.universalAlchemicalDamageBonus, rollData);

    this.bonusPerDamageDie = this._evaluateFormulaField(this.bonusPerDamageDie, rollData);
    this.damageDiePenalty = Math.max(0, this._evaluateFormulaField(this.damageDiePenalty, rollData));
    this.healingDiePenalty = Math.max(0, this._evaluateFormulaField(this.healingDiePenalty, rollData));
    this.weaponBonusPerDamageDie = this._evaluateFormulaField(this.weaponBonusPerDamageDie, rollData);
    this.spellBonusPerDamageDie = this._evaluateFormulaField(this.spellBonusPerDamageDie, rollData);
    this.alchemicalBonusPerDamageDie = this._evaluateFormulaField(this.alchemicalBonusPerDamageDie, rollData);

    this.craft.eurekaMargin = this._evaluateFormulaField(this.craft.eurekaMargin, rollData);
    this.craft.alchemicalExplode = Math.max(0, this._evaluateFormulaField(this.craft.alchemicalExplode, rollData));
    this.craft.catalyze = this._evaluateFormulaField(this.craft.catalyze, rollData) > 0;
    this.craft.primaMateria = this._evaluateFormulaField(this.craft.primaMateria, rollData) > 0;
    this.craft.mix = this._evaluateFormulaField(this.craft.mix, rollData) > 0;

    // Evaluate dice bonuses (join arrays into formula strings)
    this.universalDamageDice = this.universalDamageDice.filter(d => !!d).join(' + ');
    this.universalWeaponDamageDice = this.universalWeaponDamageDice.filter(d => !!d).join(' + ');
    this.universalSpellDamageDice = this.universalSpellDamageDice.filter(d => !!d).join(' + ');
    this.universalAlchemicalDamageDice = this.universalAlchemicalDamageDice.filter(d => !!d).join(' + ');
    this.healingBonusDice = this.healingBonusDice.filter(d => !!d).join(' + ');
    this.healingExplode = this.healingExplode.filter(d => !!d);
    this.spellDamageExplode = this.spellDamageExplode.filter(d => !!d);
    this.bonusDiceExplode = this._evaluateFormulaField(this.bonusDiceExplode, rollData) > 0;

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
    this.bonuses.globalExplode = this._evaluateFormulaField(this.bonuses.globalExplode, rollData) > 0;
    
    // Evaluate specific die size bonuses
    for (const skill of (CONFIG.VAGABOND.homebrew?.skills ?? []).filter(s => s.isWeaponSkill)) {
      const k = `${skill.key}DamageDieSizeBonus`;
      this[k] = this._evaluateFormulaField(this[k], rollData);
    }
    this.spellDamageDieSizeBonus = this._evaluateFormulaField(this.spellDamageDieSizeBonus, rollData);

    // Evaluate specific crit bonuses (per-weapon-skill + per-save, both dynamic)
    for (const skill of (CONFIG.VAGABOND.homebrew?.skills ?? []).filter(s => s.isWeaponSkill)) {
      const k = `${skill.key}CritBonus`;
      this[k] = this._evaluateFormulaField(this[k], rollData);
    }
    for (const save of (CONFIG.VAGABOND.homebrew?.saves ?? [])) {
      const k = `${save.key}CritBonus`;
      this[k] = this._evaluateFormulaField(this[k], rollData);
    }
    this.attackCritBonus = this._evaluateFormulaField(this.attackCritBonus, rollData);
    this.castCritBonus = this._evaluateFormulaField(this.castCritBonus, rollData);
    this.incomingDamageReductionPerDie = this._evaluateFormulaField(this.incomingDamageReductionPerDie, rollData);
    this.incomingDamageReductionPerDieByType = this._evaluateTypedReductions(this.incomingDamageReductionPerDieByType, rollData);
    this.beastDamageBonus = this._evaluateFormulaField(this.beastDamageBonus, rollData);
    this.polymorphLevelBonus = this._evaluateFormulaField(this.polymorphLevelBonus, rollData);
    this.deadeyeGrit = this._evaluateFormulaField(this.deadeyeGrit, rollData);
    this.critExtraDiceBySkill = this._evaluateTypedReductions(this.critExtraDiceBySkill, rollData);
    this.weaponDieBySkill = this._evaluateTypedReductions(this.weaponDieBySkill, rollData, 'max');
    this.weaponHighExplodeBySkill = this._evaluateTypedReductions(this.weaponHighExplodeBySkill, rollData, 'max');
    this.haymakerMargin = this._evaluateFormulaField(this.haymakerMargin, rollData);
    this.layOnHandsDie = this._evaluateFormulaField(this.layOnHandsDie, rollData);
    this.sneakAttackDice = this._evaluateFormulaField(this.sneakAttackDice, rollData);
    this.defenseWeaponDieStep = this._evaluateFormulaField(this.defenseWeaponDieStep, rollData);
    this.defenseWeaponBonusPerDie = this._evaluateFormulaField(this.defenseWeaponBonusPerDie, rollData);
    this.sneakAttackExplode = this._evaluateFormulaField(this.sneakAttackExplode, rollData);
    this.critLuckBonus = this._evaluateFormulaField(this.critLuckBonus, rollData);
    this.layOnHandsCures = this.layOnHandsCures.filter(s => !!s);
    this.markDamageBonus = this._evaluateFormulaField(this.markDamageBonus, rollData);
    this.hexDamageBonus = this._evaluateFormulaField(this.hexDamageBonus, rollData);

    // NOTE: Stat bonuses, Save bonuses, Skill bonuses, and Weapon Skill bonuses
    // are NOT evaluated here - they're done inline in prepareDerivedData
    // to avoid StringField coercion issues (StringFields convert numbers back to strings)
  }

/**
   * V13 Best Practice: prepareDerivedData is for calculations.
   * This happens AFTER Active Effects.
   */
  prepareDerivedData() {
    // World "class automation" mode: in manual (or out-of-combat for 'combat') the AE-set Auto
    // triggers are cleared before any formula reads them.
    AutomationMode.apply(this, this.parent);

    // Get roll data for formula evaluation (need base stat values)
    // Build minimal roll data for initial stat calculations
    const initialRollData = this.getRollData();

    // Relic Bonus / Rank boost (Merchant Midas Touch) must land before any bonus field is summed
    this._applyRelicBoost(initialRollData);

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
      save.difficulty = saveDef.baseValue - stat1Total - stat2Total - bonus + (this.universalDifficultyBonus || 0);
      // Alpha 3 p. 26: Reflex Difficulty = 20 - DEX - AWR + Slots occupied by worn Armor
      // (`reflexArmorPenalty`, set in _calculateCombatValues). Lives in the Difficulty —
      // never subtract it from the roll as well.
      if (saveDef.key === 'reflex') save.difficulty += (this.reflexArmorPenalty || 0);
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
      skill.difficulty = Roll.safeEval(resolved) - (this.universalDifficultyBonus || 0);
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
      data.stats = {};
      for (let [k, v] of Object.entries(this.stats)) {
        data[k] = foundry.utils.deepClone(v);
        data.stats[k] = data[k]; // also available as @stats.might.total etc.
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

    // Expose active status conditions so formulas can reference them
    // e.g. (@statuses.berserk) ? 2 : 0. Needed here (not just the actor-level
    // override) because prepareDerivedData() evaluates bonus formulas via the
    // DataModel's getRollData() directly. The actor override re-injects this so
    // NPCs and external callers get it too.
    data.statuses = {};
    if (this.parent?.statuses) {
      for (const statusId of this.parent.statuses) {
        data.statuses[statusId] = 1;
      }
    }

    // Rule-condition slices for AE formulas: @armorWorn.slots (armor weight) and
    // @combat.round (0 when no combat — formulas must stay valid without a tracker).
    data.armorWorn = armorWornRollData(this.parent);
    data.combat = combatRollData(this.parent);

    // Add attributes for formula usage (enables @attributes.level.value, etc.)
    if (this.attributes) {
      data.attributes = foundry.utils.deepClone(this.attributes);
    }

    // Add universal bonuses for formula usage
    data.universalCheckBonus = this.universalCheckBonus || 0;
    data.universalDifficultyBonus = this.universalDifficultyBonus || 0;
    data.universalDamageBonus = this.universalDamageBonus || 0;
    data.universalDamageDice = this.universalDamageDice || '';

    // Add specific bonuses for formula usage
    for (const skill of (CONFIG.VAGABOND.homebrew?.skills ?? []).filter(s => s.isWeaponSkill)) {
      data[`${skill.key}DamageDieSizeBonus`] = this[`${skill.key}DamageDieSizeBonus`] || 0;
    }
    data.spellDamageDieSizeBonus = this.spellDamageDieSizeBonus || 0;

    // Per-weapon-skill + per-save crit bonuses (both dynamic, expose as @<key>CritBonus)
    for (const skill of (CONFIG.VAGABOND.homebrew?.skills ?? []).filter(s => s.isWeaponSkill)) {
      data[`${skill.key}CritBonus`] = this[`${skill.key}CritBonus`] || 0;
    }
    for (const save of (CONFIG.VAGABOND.homebrew?.saves ?? [])) {
      data[`${save.key}CritBonus`] = this[`${save.key}CritBonus`] || 0;
    }
    data.attackCritBonus = this.attackCritBonus || 0;
    data.castCritBonus = this.castCritBonus || 0;
    data.incomingDamageReductionPerDie = this.incomingDamageReductionPerDie || 0;

    return data;
  }

  _calculateCombatValues(rollData) {
    const mightTotal = this.stats.might?.total || 0;
    const dexTotal = this.stats.dexterity?.total || 0;
    const level = this.attributes.level.value || 1;

    // Luck Pool — driven by configurable stat; 'none' disables the pool entirely.
    // system.bonusLuck (AE-driven, e.g. a Perk) adds to the pool WITHOUT touching the Luck stat.
    // RAW: maxLuck is only the value the pool resets to on Rest — NOT a cap. Gains (Crit, Knack,
    // Virtuoso, manual +1) may push currentLuck above it.
    const luckStatKey = CONFIG.VAGABOND?.homebrew?.derivations?.luckStat ?? 'luck';
    const hasLuckPool = luckStatKey && luckStatKey !== 'none';
    this.hasLuckPool = hasLuckPool;
    this.maxLuck = hasLuckPool
      ? Math.max(0, (this.stats[luckStatKey]?.total || 0) + (this.bonusLuck || 0))
      : 0;

    if (this.currentLuck === undefined || this.currentLuck === null) {
      this.currentLuck = this.maxLuck;
    }

    // Speed Calculation
    // 1. Get speed bonus from Active Effects (stored in system.speed.bonus)
    const speedBonus = this._evaluateFormulaField(this.speed.bonus, rollData)
      + this._evaluateFormulaField(this.speedModifier, rollData);

    // 2. Evaluate base speed from homebrew derivation formula
    const speedFormula = CONFIG.VAGABOND?.homebrew?.derivations?.speed
      ?? '25 + floor(max(0, @dexterity.total - 2) / 2) * 5';
    const rawSpeed  = Math.max(0, this._evaluateSingleFormula(speedFormula, rollData));
    const baseSpeed = Math.max(0, rawSpeed + speedBonus);

    // 3. Evaluate crawl/travel formulas — @speed.base is available via augmented rollData
    const speedRollData = { ...rollData, speed: { base: baseSpeed } };
    const crawlFormula  = CONFIG.VAGABOND?.homebrew?.derivations?.crawl  ?? '@speed.base * 3';
    const travelFormula = CONFIG.VAGABOND?.homebrew?.derivations?.travel ?? 'floor(@speed.base / 5)';

    this.speed = {
      // Crawling (Prone) halves the Speed you move with; Crawl / Travel paces keep the full value
      base:   this.speedHalved ? Math.floor(baseSpeed / 2) : baseSpeed,
      raw:    rawSpeed,
      crawl:  Math.max(0, this._evaluateSingleFormula(crawlFormula,  speedRollData)),
      travel: Math.max(0, this._evaluateSingleFormula(travelFormula, speedRollData)),
      bonus:  speedBonus,
    };

    // Armor Calculation — only one set of worn Armor counts (RAW)
    const wornArmor = EquipmentHelper.getWornArmor(this.parent);
    // Evaluate armor bonus inline (StringFields coerce numbers back to strings)
    const armorBonus = this._evaluateFormulaField(this.armorBonus, rollData);
    this.armor = (wornArmor?.system.finalRating ?? 0) + armorBonus;
    // Item's explicit Reflex penalty (already shifted by metal slot modifiers —
    // see base-equipment.mjs `finalReflexPenalty`).
    const reflexReduction = this._evaluateFormulaField(this.reflexPenaltyReduction, rollData);
    this.reflexArmorPenalty = Math.max(0, (wornArmor?.system.finalReflexPenalty ?? 0) - reflexReduction);
    // RAW: Might below the worn Armor's score → Restrained. Applied as a status
    // by EquipmentHelper.syncArmorRestrained (GM-side hooks in vagabond.mjs).
    this.armorMightDeficit = wornArmor
      ? Math.max(0, (wornArmor.system.mightRequirement ?? 0) - mightTotal)
      : 0;
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

    const inventoryItems = this.parent?.items
      ? this.parent.items.filter((item) =>
          item.type === 'equipment' ||
          item.type === 'weapon' ||
          item.type === 'armor' ||
          item.type === 'gear' ||
          item.type === 'container')
      : [];

    // Top-level only — items nested in a container count against the container.
    const topLevel = inventoryItems.filter((i) => !i.system.containerId);

    // occupiedSlotsFor() sums non-zero item costs + the pooled zero-Slot cost
    // (RAW: each complete group of 10 zero-Slot items = 1 Slot, remainder free).
    const occupiedSlots = EquipmentHelper.occupiedSlotsFor(topLevel);

    this.inventory.occupiedSlots = occupiedSlots;
    this.inventory.zeroSlotBundleCost = EquipmentHelper.pooledZeroSlotCost(topLevel); // computed, not rendered
    this.inventory.totalItems = topLevel.length; // All items for grid sizing
    this.inventory.availableSlots = this.inventory.maxSlots - occupiedSlots; // Available = Effective max - occupied

    // RAW: you can wield up to maxEquippedWeaponSlots Slots of Equipped Weapons.
    this.inventory.equippedWeaponSlots = this.parent
      ? EquipmentHelper.equippedWeaponSlots(this.parent)
      : 0;
    // Active Effects can raise it via inventory.weaponSlotsBonus (e.g. giants).
    const weaponSlotsBonus = this._evaluateFormulaField(this.inventory.weaponSlotsBonus, rollData);
    this.inventory.maxEquippedWeaponSlots = (CONFIG.VAGABOND?.maxEquippedWeaponSlots || 3) + weaponSlotsBonus;
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
    // Level 0 is valid (RAW: no Class yet) — next Level is 1, not 2
    const currentLevel = Math.max(0, this.attributes.level.value ?? 1);
    const nextLevel = currentLevel + 1;
    const currentXP = this.attributes.xp || 0;

    // Active pace preset (or custom XP table) from homebrew leveling config
    const xpRequired = xpRequiredForLevel(nextLevel);

    this.attributes.xpRequired = xpRequired;
    this.attributes.xpProgress = currentXP;
    this.attributes.canLevelUp = currentXP >= xpRequired;
  }
}