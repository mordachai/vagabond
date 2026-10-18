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

    // Dice Scaling - lets the cast dice control work on damage-less spells.
    // The dice are a deterministic "count" resource (each die costs mana like
    // extra damage dice), exposed to macros as scope.spellDamageDice — no damage
    // is rolled. Additive: does NOT affect spells that have a real damage type.
    schema.usesDiceScaling = new fields.BooleanField({
      required: true,
      initial: false,
      label: "Uses Dice Scaling",
      hint: "Allow the cast dice control on a damage-less spell (damage type '-'). Dice become a counted resource for macros (scope.spellDamageDice); each die past the first costs 1 mana. No damage is rolled."
    });

    // No Free Die - every damage/healing die costs 1 Mana, including the first
    // (Life: "heal Target(s) for d6 HP per Mana spent"). Default rules give
    // the first die for free.
    schema.noFreeDie = new fields.BooleanField({
      required: true,
      initial: false,
      label: "No Free Die",
      hint: "Every die costs 1 Mana, including the first."
    });

    // Target picker (SpellTargetPicker): the Cast dialog lists what the Spell may Target and the caster picks.
    // targetBeings: Beings inside the area (area deliveries; beside the Objects for Remote / Touch).
    // targetObjects: equipped weapons of those Beings (or the targets / the caster) → hit macro scope.targetObjects.
    schema.targetBeings = new fields.BooleanField({ required: true, initial: false });
    schema.targetObjects = new fields.BooleanField({ required: true, initial: false });

    // Focus on Cast: the Cast dialog opens with Focus on (Spells kept up by Focusing, e.g. Polymorph).
    schema.focusOnCast = new fields.BooleanField({ required: true, initial: false });
    // Crit: no Focus — a Crit makes the duration continual / 1 Minute without Focus ("Crit: Duration is
    // continual."), so a critical Cast takes no Focus and ends none.
    schema.critNoFocus = new fields.BooleanField({ required: true, initial: false });
    // Focus Mana (FocusUpkeep): "You must spend 1 Mana per Target to Focus on this Spell" (Ward), "1 Mana on
    // your Turns" (Polymorph), "1 Mana each Turn … after the Casting" (Beast). mana = per Round (start of the
    // caster's Turn in a started Combat); perTarget = × Targets; onCast = also paid by a Focused Cast.
    schema.focusUpkeep = new fields.SchemaField({
      mana: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      perTarget: new fields.BooleanField({ required: true, initial: false }),
      onCast: new fields.BooleanField({ required: true, initial: false }),
    });
    // Ward upcast (WardHelper): when a Being this Spell's Cast affects takes damage from an attack or Cast, the
    // caster can upcast for a Cast Check; a pass reduces the incoming damage by 1d6 per Mana (before Armor).
    schema.wardUpcast = new fields.BooleanField({ required: true, initial: false });
    // Conjure (ConjureHelper, hit macro `system:spell.conjure`): the Cast calls forth Beings (Beast) or Items
    // (Forge) picked in the Conjure picker; they last while the Cast does (Focus, else the caster's next Turn).
    // beings: `beingType` ('' = any) with a cumulative HD within the `budget` formula (caster roll data).
    // items: one per Target Being / per 5' cube of the area, Slots <= maxSlots, cost <= maxCost, and with
    // `forgeableOnly` only Items whose "Can be Forged" switch is on (`system.forgeable`). No `choices:` — Being types are homebrew-driven.
    schema.conjure = new fields.SchemaField({
      kind: new fields.StringField({ required: true, blank: true, initial: '' }),
      beingType: new fields.StringField({ required: true, blank: true, initial: '' }),
      budget: new fields.StringField({ required: true, blank: true, initial: '' }),
      maxSlots: new fields.NumberField({ required: true, nullable: false, min: 0, initial: 1 }),
      maxCost: new fields.SchemaField({
        gold: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        silver: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
        copper: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
      }),
      forgeableOnly: new fields.BooleanField({ required: true, initial: false }),
    });
    // Spell Surface (SpellSurface, hit macro `system:spell.surface`): the Cast leaves its area on the map as a Region
    // (Goop, Erupt, Sprout, Adhere, Terraform, Fog, Gas) lasting while the Cast does. `around` = Close spaces added
    // around each Target; `difficult` = Difficult Terrain (2' per 1' + Vulnerable inside); damage formulas on entering /
    // at Turn end; `whileIn` = status id while inside (no `choices:` — statuses are homebrew-driven); `obscure` = sight
    // Hinder (Fog); `clip` / `tint` = looping Sequencer clip (template art when it can't play).
    schema.surface = new fields.SchemaField({
      enabled: new fields.BooleanField({ required: true, initial: false }),
      around: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, max: 3, initial: 0 }),
      difficult: new fields.BooleanField({ required: true, initial: false }),
      enterDamage: new fields.StringField({ required: true, blank: true, initial: '' }),
      turnEndDamage: new fields.StringField({ required: true, blank: true, initial: '' }),
      whileIn: new fields.StringField({ required: true, blank: true, initial: '' }),
      obscure: new fields.BooleanField({ required: true, initial: false }),
      clip: new fields.StringField({ required: true, blank: true, initial: '' }),
      tint: new fields.StringField({ required: true, blank: true, initial: '' }),
    });

    // Optional label shown on the dice node when using dice scaling (e.g. "Speed").
    schema.diceScaleLabel = new fields.StringField({
      required: false,
      blank: true,
      initial: '',
      label: "Dice Scaling Label",
      hint: "Label for the dice node when Uses Dice Scaling is on (defaults to 'Dice')."
    });

    // Locked - toggle between read-only and editable views
    schema.locked = new fields.BooleanField({
      required: true,
      initial: false
    });

    // FX School - explicit Sequencer animation school override
    // Empty string = auto-derive from damage type
    schema.fxSchool = new fields.StringField({
      required: false,
      blank: true,
      initial: "",
      label: "VAGABOND.Spell.FxSchool.Label",
    });

    // Status effects this spell can inflict on hit
    schema.causedStatuses = new fields.ArrayField(
      new fields.SchemaField({
        statusId:           new fields.StringField({ required: false, blank: true, initial: '' }),
        requiresDamage:     new fields.BooleanField({ required: true, initial: true }),
        saveType:           new fields.StringField({ required: false, blank: true, initial: 'any' }),
        duration:           new fields.StringField({ required: false, blank: true, initial: '' }),
        tickDamageEnabled:  new fields.BooleanField({ required: true, initial: false }),
        damageOnTick:       new fields.StringField({ required: false, blank: true, initial: '' }),
        damageType:         new fields.StringField({ required: false, blank: true, initial: '-' }),
        // TODO: fatigueOnTick — see base-equipment.mjs causedStatuses for full re-enable checklist.
        // fatigueOnTick: new fields.NumberField({ required: false, integer: true, min: 0, initial: 0, nullable: false }),
      }),
      { required: true, initial: [] }
    );

    // Status effects this spell inflicts only on a critical hit
    schema.critCausedStatuses = new fields.ArrayField(
      new fields.SchemaField({
        statusId:           new fields.StringField({ required: false, blank: true, initial: '' }),
        requiresDamage:     new fields.BooleanField({ required: true, initial: true }),
        saveType:           new fields.StringField({ required: false, blank: true, initial: 'any' }),
        duration:           new fields.StringField({ required: false, blank: true, initial: '' }),
        tickDamageEnabled:  new fields.BooleanField({ required: true, initial: false }),
        damageOnTick:       new fields.StringField({ required: false, blank: true, initial: '' }),
        damageType:         new fields.StringField({ required: false, blank: true, initial: '-' }),
        // TODO: fatigueOnTick — see base-equipment.mjs causedStatuses for full re-enable checklist.
        // fatigueOnTick: new fields.NumberField({ required: false, integer: true, min: 0, initial: 0, nullable: false }),
      }),
      { required: true, initial: [] }
    );

    // ===== EXECUTABLE MACROS =====
    // `macro` (simple — always shown) and `hitMacro` (shown only on a successful
    // cast card). Each references a Macro by UUID (preferred) or an inline script.
    const macroSchema = () => new fields.SchemaField({
      enabled:  new fields.BooleanField({ initial: false }),
      uuid:     new fields.StringField({ blank: true, initial: '' }),
      command:  new fields.StringField({ blank: true, initial: '' }),
      label:    new fields.StringField({ blank: true, initial: '' }),
      runAsGM:  new fields.BooleanField({ initial: false }),
      // hitMacro only: presses itself when the Cast's target animation lands (MacroAutoRun)
      autoRun:  new fields.BooleanField({ initial: true }),
    });
    schema.macro = macroSchema();
    schema.hitMacro = macroSchema();

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

  /**
   * Does a Cast of this Spell start with its Effect (FX) on? Always without a damage type (the Effect IS the
   * Cast); a Spell that leaves its area on the map (Surface) too — it does nothing without the Effect, and
   * players forget to switch it on.
   */
  get effectByDefault() {
    return (this.damageType ?? '-') === '-' || !!this.surface?.enabled;
  }
}
