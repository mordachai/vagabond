import VagabondItemBase from './base-item.mjs';
import { VagabondTextParser } from '../helpers/text-parser.mjs';

/**
 * Base Equipment class for all equippable items (weapons, armor, gear, alchemicals, relics)
 * Provides unified fields and methods for cost, slots, metal, damage, and properties
 */
export default class VagabondEquipment extends VagabondItemBase {
  static LOCALIZATION_PREFIXES = [
    'VAGABOND.Item.base',
    'VAGABOND.Item.Equipment',
  ];

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const requiredString = { required: true, nullable: false, blank: false };
    const schema = super.defineSchema();

    // Equipment Type - determines what kind of equipment this is
    schema.equipmentType = new fields.StringField({
      ...requiredString,
      initial: 'gear',
      choices: Object.keys(CONFIG.VAGABOND.equipmentTypes)
    });

    // Locked state - when true, displays as formatted text instead of inputs
    schema.locked = new fields.BooleanField({
      required: true,
      initial: false
    });

    // ===== UNIVERSAL FIELDS (ALL EQUIPMENT) =====

    // Equipped status — derived mirror of `equipmentState` at runtime (see
    // prepareDerivedData); kept in the schema and synced on every update so
    // legacy `equipped`-based reads and migrateData stay consistent
    schema.equipped = new fields.BooleanField({
      required: true,
      initial: false
    });

    // Hands needed to hold/use this item while equipped. Non-weapons only —
    // weapons derive hand usage from `grip` and ignore this field.
    schema.handsRequired = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
      choices: [0, 1, 2]
    });

    // Trinket — satisfies the spellcasting trinket requirement while equipped
    schema.isTrinket = new fields.BooleanField({
      required: true,
      initial: false
    });

    // Quantity (for stackable items)
    schema.quantity = new fields.NumberField({
      ...requiredInteger,
      initial: 1,
      min: 0
    });

    // Base cost in three currencies (before metal multiplier if applicable)
    schema.baseCost = new fields.SchemaField({
      gold: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      silver: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      copper: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 })
    });

    // Bound system - marks items that require binding before use
    schema.requiresBound = new fields.BooleanField({
      required: true,
      initial: false
    });

    // Current bound state - whether this item is bound to a character
    schema.bound = new fields.BooleanField({
      required: true,
      initial: false
    });

    // Base slots (before metal modifier if applicable, can be negative for items like Backpack)
    schema.baseSlots = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 1
    });

    // Grid position for inventory display (0-indexed)
    schema.gridPosition = new fields.NumberField({
      required: true,
      nullable: false,
      integer: true,
      initial: 0,
      min: 0
    });

    // Parent container ID (if this item is inside a container)
    schema.containerId = new fields.StringField({
      required: false,
      blank: true,
      initial: null,
      nullable: true
    });

    // Material (field keeps its legacy `metal` name). Affects cost multiplier
    // and special properties — rules live in CONFIG.VAGABOND.metalData.
    schema.metal = new fields.StringField({
      required: true,
      blank: false,
      initial: 'none',
      choices: ['none', 'adamant', 'bronze', 'coldIron', 'gold', 'iron', 'silver',
        'mythral', 'orichalcum', 'steel', 'wood']
    });

    // Damage Type - universal damage/healing type
    schema.damageType = new fields.StringField({
      required: true,
      nullable: false,
      blank: false,
      initial: '-',
    });

    // Damage Amount - damage formula (e.g., "2d6", "1d8+2", "d10")
    schema.damageAmount = new fields.StringField({
      required: false,
      blank: true,
      initial: ''
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

    // Properties - universal property array (weapon properties, gear traits, etc.)
    schema.properties = new fields.ArrayField(
      new fields.StringField({
        required: true,
        blank: false
      }),
      { initial: [] }
    );

    // ===== WEAPON-SPECIFIC FIELDS =====

    // Weapon skill used to attack (any skill or save — fully homebrew-configurable)
    schema.weaponSkill = new fields.StringField({
      required: false,
      blank: true,
      initial: 'melee',
    });

    // Other skills this weapon can also attack with (e.g. Dagger: Melee, also
    // Finesse). The owner's pick lives in flags.vagabond.preferredSkill so it
    // stays separate from the item's authored options.
    // initial MUST be a factory: Foundry returns a literal `initial` by reference
    // and ArrayField._updateCommit mutates arrays in place, so a shared `[]`
    // leaks one weapon's skills into every weapon without a stored value.
    schema.altSkills = new fields.ArrayField(
      new fields.StringField({ required: true, blank: false }),
      { initial: () => [] }
    );

    // Range (close, near, far)
    schema.range = new fields.StringField({
      required: false,
      blank: true,
      initial: 'close',
      choices: ['close', 'near', 'far']
    });

    // Grip (1H, 2H, V, 0). '0' = Zero Grip: uses no hands (breath attacks,
    // floating weapons) — equips as 'worn' and has a single damage value.
    schema.grip = new fields.StringField({
      required: false,
      blank: true,
      initial: '1H',
      choices: ['1H', '2H', 'V', '0']
    });

    // Damage one-handed (for weapons)
    schema.damageOneHand = new fields.StringField({
      required: false,
      blank: true,
      initial: 'd6'
    });

    // Damage type one-handed
    schema.damageTypeOneHand = new fields.StringField({
      required: false,
      blank: true,
      initial: '-',
    });

    // Damage two-handed (for versatile weapons)
    schema.damageTwoHands = new fields.StringField({
      required: false,
      blank: true,
      initial: 'd8'
    });

    // Damage type two-handed
    schema.damageTypeTwoHands = new fields.StringField({
      required: false,
      blank: true,
      initial: '-',
    });

    // Equipment state — single stored equip truth for ALL equipment.
    // Weapons: unequipped/oneHand/twoHands (from grip). Non-weapons:
    // unequipped, 'worn' (equipped, no hands) or oneHand/twoHands per
    // `handsRequired`.
    schema.equipmentState = new fields.StringField({
      required: false,
      blank: true,
      initial: 'unequipped',
      choices: ['unequipped', 'oneHand', 'twoHands', 'worn']
    });

    // ===== ARMOR-SPECIFIC FIELDS =====

    // Armor Rating granted while worn (before metal bonus — Adamant +1)
    schema.armorRating = new fields.NumberField({
      required: true, nullable: false, integer: true, min: 0, initial: 1
    });

    // Might score required to wear it without being Restrained
    schema.mightRequirement = new fields.NumberField({
      required: true, nullable: false, integer: true, min: 0, initial: 2
    });

    // Penalty to Reflex Saves while worn (RAW: equal to the Slots occupied).
    // Metal slot modifiers (Adamant +1, Mythral -1) apply on top, like slots.
    schema.reflexPenalty = new fields.NumberField({
      required: true, nullable: false, integer: true, min: 0, initial: 1
    });

    // Rating lost to damage — only counts for degrading materials (Gold/Wood).
    // Prepared for a future breakage/repair feature: nothing writes it yet
    // (EquipmentHelper.damageArmor / repairItem, gated by materialDegradation).
    schema.armorDamage = new fields.NumberField({
      required: true, nullable: false, integer: true, min: 0, initial: 0
    });

    // Weapon damage-die sizes lost as a countdown die — only counts for
    // degrading materials (Gold/Wood). Prepared, like armorDamage.
    schema.dieDamage = new fields.NumberField({
      required: true, nullable: false, integer: true, min: 0, initial: 0
    });

    // Damage immunities (armor provides immunity to these damage types)
    schema.immunities = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [] }
    );

    // ===== GEAR-SPECIFIC FIELDS =====

    // Gear category (e.g., "Alchemy & Medicine", "Adventuring Gear")
    schema.gearCategory = new fields.StringField({
      required: false,
      blank: true,
      initial: ''
    });

    // ===== SUPPLY FIELDS =====

    // Marks this item as a ration — counted toward the party supply total
    schema.isSupply = new fields.BooleanField({ required: true, initial: false });

    // Marks this item as a beverage/water — counted toward the party beverage total
    schema.isBeverage = new fields.BooleanField({ required: true, initial: false });

    // ===== CONSUMABLE FIELDS =====

    // Consumable - whether this item is consumable (reduces quantity on use)
    schema.isConsumable = new fields.BooleanField({
      required: true,
      initial: false
    });

    // Linked Consumable - item ID of consumable that gets consumed when this item is used
    schema.linkedConsumable = new fields.StringField({
      required: false,
      blank: true,
      initial: ''
    });

    // Multi-use tracking (e.g. a potion with 3 doses, a whetstone with 5 uses).
    // max === 0 means "not multi-use" — consumption falls back to quantity
    // (legacy single-use-per-stack behavior). See VagabondItem._chargesRemaining /
    // _consumeCharge in module/documents/item.mjs.
    schema.uses = new fields.SchemaField({
      max:   new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      value: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
    });

    // ===== ALCHEMICAL-SPECIFIC FIELDS =====

    // Alchemical type
    schema.alchemicalType = new fields.StringField({
      required: false,
      blank: true,
      initial: 'concoction',
      choices: ['acid', 'concoction', 'explosive', 'oil', 'poison', 'potion', 'torch']
    });

    // ===== RELIC-SPECIFIC FIELDS =====

    // Lore - historical/mystical background
    schema.lore = new fields.StringField({
      required: false,
      blank: true,
      initial: ''
    });

    // ===== ON-HIT STATUS EFFECTS =====

    // Status effects inflicted on EVERY hit while this item is equipped (passive — fires regardless of which weapon/spell is used)
    schema.passiveCausedStatuses = new fields.ArrayField(
      new fields.SchemaField({
        statusId:           new fields.StringField({ required: false, blank: true, initial: '' }),
        requiresDamage:     new fields.BooleanField({ required: true, initial: true }),
        saveType:           new fields.StringField({ required: false, blank: true, initial: 'any' }),
        duration:           new fields.StringField({ required: false, blank: true, initial: '' }),
        tickDamageEnabled:  new fields.BooleanField({ required: true, initial: false }),
        damageOnTick:       new fields.StringField({ required: false, blank: true, initial: '' }),
        damageType:         new fields.StringField({ required: false, blank: true, initial: '-' }),
      }),
      { required: true, initial: [] }
    );

    // Status effects this item can inflict on hit (weapons, relics, alchemical, spells)
    schema.causedStatuses = new fields.ArrayField(
      new fields.SchemaField({
        statusId:           new fields.StringField({ required: false, blank: true, initial: '' }),
        requiresDamage:     new fields.BooleanField({ required: true, initial: true }),
        saveType:           new fields.StringField({ required: false, blank: true, initial: 'any' }),
        duration:           new fields.StringField({ required: false, blank: true, initial: '' }),
        tickDamageEnabled:  new fields.BooleanField({ required: true, initial: false }),
        damageOnTick:       new fields.StringField({ required: false, blank: true, initial: '' }),
        damageType:         new fields.StringField({ required: false, blank: true, initial: '-' }),
        // TODO: fatigueOnTick — flat fatigue added per tick alongside HP damage.
        // Uncomment to re-enable. Also restore in: critCausedStatuses below, coating.causedStatuses below,
        // item-spell.mjs, actor-npc.mjs, npc-action-handler.mjs, item-sheet.mjs push objects,
        // countdown-dice.mjs flags, status-helper._createStatusCountdown, countdown-dice-overlay._onRollDice,
        // templates (equipment-details, spell-details, npc-content), lang/en.json "FatigueOnTick".
        // fatigueOnTick: new fields.NumberField({ required: false, integer: true, min: 0, initial: 0, nullable: false }),
      }),
      { required: true, initial: [] }
    );

    // Status effects inflicted only on a critical hit
    schema.critCausedStatuses = new fields.ArrayField(
      new fields.SchemaField({
        statusId:           new fields.StringField({ required: false, blank: true, initial: '' }),
        requiresDamage:     new fields.BooleanField({ required: true, initial: true }),
        saveType:           new fields.StringField({ required: false, blank: true, initial: 'any' }),
        duration:           new fields.StringField({ required: false, blank: true, initial: '' }),
        tickDamageEnabled:  new fields.BooleanField({ required: true, initial: false }),
        damageOnTick:       new fields.StringField({ required: false, blank: true, initial: '' }),
        damageType:         new fields.StringField({ required: false, blank: true, initial: '-' }),
        // TODO: fatigueOnTick — see causedStatuses above for full re-enable checklist.
        // fatigueOnTick: new fields.NumberField({ required: false, integer: true, min: 0, initial: 0, nullable: false }),
      }),
      { required: true, initial: [] }
    );

    // Bespoke crit-threshold adjustment for THIS weapon's own attack roll.
    // ArrayField(StringField) — an AE with ADD mode appends a value/formula and
    // VagabondRollBuilder.calculateCritThreshold sums the array against roll
    // data. Negative = crits more easily (e.g. "-1" → crit on 19). For a
    // REUSABLE behaviour prefer a weapon property in
    // CONFIG.VAGABOND.weaponPropertyEffects; this field is the one-off escape
    // hatch (a single weird weapon, no shared property).
    schema.critThresholdMod = new fields.ArrayField(
      new fields.StringField({ blank: true }),
      { required: true, initial: [], label: 'VAGABOND.Item.Weapon.FIELDS.critThresholdMod.label' }
    );

    // Status immunities granted by this armor (armor only — UI gated by equipmentType)
    schema.blockedStatuses = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [] }
    );

    // Status resistances granted by this armor — save rolled with Favor (armor only)
    schema.resistedStatuses = new fields.ArrayField(
      new fields.StringField({ required: true }),
      { required: true, initial: [] }
    );

    // Temporary weapon coating applied from an alchemical item (weapon only — UI gated)
    schema.coating = new fields.SchemaField({
      sourceName:     new fields.StringField({ required: false, blank: true, initial: '' }),
      charges:        new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      causedStatuses: new fields.ArrayField(
        new fields.SchemaField({
          statusId:           new fields.StringField({ required: false, blank: true, initial: '' }),
          requiresDamage:     new fields.BooleanField({ required: true, initial: true }),
          saveType:           new fields.StringField({ required: false, blank: true, initial: 'any' }),
          duration:           new fields.StringField({ required: false, blank: true, initial: '' }),
          tickDamageEnabled:  new fields.BooleanField({ required: true, initial: false }),
          damageOnTick:       new fields.StringField({ required: false, blank: true, initial: '' }),
          damageType:         new fields.StringField({ required: false, blank: true, initial: '-' }),
          // TODO: fatigueOnTick — see causedStatuses above for full re-enable checklist.
          // fatigueOnTick: new fields.NumberField({ required: false, integer: true, min: 0, initial: 0, nullable: false }),
        }),
        { required: true, initial: [] }
      ),
    });

    // Imbue delivery payload: spell attached at cast time, delivered on this weapon's next hit (weapon only — UI gated)
    schema.imbuedSpell = new fields.SchemaField({
      active:             new fields.BooleanField({ required: true, initial: false }),
      sourceActorUuid:    new fields.StringField({ required: false, blank: true, initial: '' }),
      sourceActorName:    new fields.StringField({ required: false, blank: true, initial: '' }),
      spellUuid:          new fields.StringField({ required: false, blank: true, initial: '' }),
      spellName:          new fields.StringField({ required: false, blank: true, initial: '' }),
      spellImg:           new fields.StringField({ required: false, blank: true, initial: '' }),
      damageTypeKey:      new fields.StringField({ required: false, blank: true, initial: '' }),
      dieSize:            new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      damageDice:         new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      deferredMana:       new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 }),
      // true when cast while imbueUpfrontMana was off — Damage/Effect mana AND
      // the dice/effect choice itself defer to delivery-on-hit (see imbue-helper.mjs)
      deferredPayment:    new fields.BooleanField({ required: true, initial: false }),
      manaSkillKey:       new fields.StringField({ required: false, blank: true, initial: '' }),
    });

    // ===== SEQUENCER FX FIELDS =====

    // Per-item animation config (requires Sequencer module)
    schema.itemFx = new fields.SchemaField({
      enabled:        new fields.BooleanField({ initial: false }),
      // 'auto' = derive from weaponSkill (weapons only); 'ranged' = beam; 'melee' = impact
      animType:       new fields.StringField({ initial: 'auto' }),
      hitFile:        new fields.StringField({ initial: '' }),
      hitScale:       new fields.NumberField({ initial: 1.0, min: 0.1 }),
      hitOffsetX:     new fields.NumberField({ initial: 0, integer: true }),
      hitDuration:    new fields.NumberField({ initial: 800, min: 100, integer: true }),
      hitSound:       new fields.StringField({ initial: '' }),
      missFile:       new fields.StringField({ initial: '' }),
      missScale:      new fields.NumberField({ initial: 1.0, min: 0.1 }),
      missDuration:   new fields.NumberField({ initial: 600, min: 100, integer: true }),
      missSound:      new fields.StringField({ initial: '' }),
      soundVolume:    new fields.NumberField({ initial: 0.6, min: 0, max: 1 }),
    });

    // ===== EXECUTABLE MACROS =====
    // Two slots: `macro` (simple — button always shows on the card) and
    // `hitMacro` (button only shows on a hit/success card). Each can reference
    // a Macro document by UUID (preferred) or hold an inline script `command`.
    const macroSchema = () => new fields.SchemaField({
      enabled:  new fields.BooleanField({ initial: false }),
      uuid:     new fields.StringField({ blank: true, initial: '' }),
      command:  new fields.StringField({ blank: true, initial: '' }),
      label:    new fields.StringField({ blank: true, initial: '' }),
      // When true, a non-GM clicking the button relays execution to the GM
      // client (via the system socket) so it runs with GM permissions.
      runAsGM:  new fields.BooleanField({ initial: false }),
    });
    schema.macro = macroSchema();
    schema.hitMacro = macroSchema();

    return schema;
  }

  /**
   * Strip null/undefined elements from every ArrayField before validation.
   * Corrupt compendium/world data can leave a hole in one of these arrays
   * (e.g. causedStatuses), which makes Foundry's cleanData throw
   * "must be constructed with a DataModel or Object" on any item.update()
   * (notably the lock-toggle submit). Mirrors item-class.mjs's migrateData.
   * @param {object} source
   * @returns {object}
   */
  static migrateData(source) {
    const arrayKeys = [
      'properties', 'immunities',
      'passiveCausedStatuses', 'causedStatuses', 'critCausedStatuses',
      'blockedStatuses', 'resistedStatuses',
    ];
    for (const key of arrayKeys) {
      if (source[key] == null) continue;
      if (!Array.isArray(source[key])) source[key] = Object.values(source[key]);
      source[key] = source[key].filter(e => e != null);
    }
    // Weapon-property taxonomy overhaul (new rules version):
    //  - 'Brutal'  → 'Vicious'  (flat +1 crit die, RAW)
    //  - 'Entangle' → 'Grapple' (chat-card Grapple button keys off this string)
    //  - Brawl / Finesse / Brawn / Ranged / Near are Weapon TYPES now
    //    (source.weaponSkill), never properties — drop them from the array.
    // Runs on every DataModel construction, so world / compendium-instantiated
    // / token-embedded items all self-heal on load.
    if (Array.isArray(source.properties)) {
      const DEAD = new Set(['brawl', 'finesse', 'brawn', 'ranged', 'near']);
      const RENAME = { brutal: 'Vicious', entangle: 'Grapple' };
      source.properties = source.properties
        .map(p => {
          const k = String(p).trim();
          return RENAME[k.toLowerCase()] ?? k;
        })
        .filter(p => p && !DEAD.has(p.toLowerCase()))
        .filter((p, i, arr) => arr.indexOf(p) === i);
    }
    // Fist grip was removed in the new rules version — Fist weapons are now 1H.
    if (source.grip === 'F') source.grip = '1H';
    // Materials table replaced the generic "Common" metal — it maps to Iron.
    if (source.metal === 'common') source.metal = 'iron';
    // Armor values used to be derived from the removed `armorType` field.
    // Fill each explicit field independently (a user may have persisted only
    // some of them) from the legacy type's RAW table.
    if (source.armorType) {
      const LEGACY = { light: [1, 2], medium: [2, 4], heavy: [3, 6] }[source.armorType] ?? [1, 2];
      source.armorRating ??= LEGACY[0];
      source.mightRequirement ??= LEGACY[1];
      source.reflexPenalty ??= Math.max(0, source.baseSlots ?? 1);
    }
    // Nested: coating.causedStatuses
    const coating = source.coating;
    if (coating?.causedStatuses != null) {
      if (!Array.isArray(coating.causedStatuses)) coating.causedStatuses = Object.values(coating.causedStatuses);
      coating.causedStatuses = coating.causedStatuses.filter(e => e != null);
    }
    // Equip unification: non-weapons historically stored equip state in the
    // `equipped` boolean; `equipmentState` is now the single source of truth.
    // (VagabondItem._preUpdate keeps source `equipped` in lockstep afterwards,
    // so this only fires once per legacy item.)
    if (source.equipmentType && source.equipmentType !== 'weapon'
        && source.equipped === true
        && (!source.equipmentState || source.equipmentState === 'unequipped')) {
      source.equipmentState = 'worn'; // legacy items predate handsRequired (always 0)
    }
    return super.migrateData(source);
  }

  prepareDerivedData() {
    // Universal derived equip mirror — equipmentState is the stored truth
    this.equipped = this.equipmentState !== 'unequipped';
    // Template-visible mirror of EquipmentHelper.isThrowable (Thrown weapons)
    this.isThrowable = this.equipmentType === 'weapon' && (this.properties ?? []).includes('Thrown');

    // Relics don't use metal - skip metal calculations
    const isRelic = this.equipmentType === 'relic';

    // Get metal properties (skip for relics)
    if (!isRelic) {
      const metalData = this._getMetalData();
      this.metalMultiplier = metalData.multiplier;
      this.metalEffect = metalData.effect;
    } else {
      this.metalMultiplier = 1;
      this.metalEffect = '-';
    }

    // Calculate final cost (with metal multiplier for non-relics)
    this.cost = this.constructor._applyCostMultiplier(this.baseCost, this.metalMultiplier);

    // Format cost as a human-readable string
    const costs = [];
    if (this.cost.gold > 0) costs.push(`${this.cost.gold}${game.i18n.localize('VAGABOND.Currency.Gold.abbr')}`);
    if (this.cost.silver > 0) costs.push(`${this.cost.silver}${game.i18n.localize('VAGABOND.Currency.Silver.abbr')}`);
    if (this.cost.copper > 0) costs.push(`${this.cost.copper}${game.i18n.localize('VAGABOND.Currency.Copper.abbr')}`);
    this.costDisplay = costs.length > 0 ? costs.join(' ') : '-';

    // Calculate final slots (with material modifier for non-relics). A
    // reduction never takes an item below 1 Slot (or below its own base if 0/negative).
    let finalSlots = this.baseSlots;
    const slotDelta = isRelic ? 0 : (this._materialRules().slotDelta ?? 0);
    if (slotDelta > 0) finalSlots += slotDelta;
    else if (slotDelta < 0) finalSlots = Math.max(Math.min(1, finalSlots), finalSlots + slotDelta);
    this.slots = finalSlots;
    // Net slot change from metal — armor's Reflex penalty follows it (RAW ties
    // the penalty to Slots occupied)
    this.metalSlotDelta = finalSlots - this.baseSlots;

    // Format properties as comma-separated string for display
    this.propertiesDisplay = this.properties.length > 0
      ? this.properties.map(prop => {
          const configKeys = Object.keys(CONFIG.VAGABOND?.weaponProperties ?? {});
          const realKey = configKeys.find(k => k.toLowerCase() === prop.toLowerCase()) || prop;
          return game.i18n.localize(CONFIG.VAGABOND?.weaponProperties?.[realKey] ?? `VAGABOND.Weapon.Property.${realKey}`);
        }).join(', ')
      : '-';

    // Type-specific derived data
    if (this.equipmentType === 'weapon') {
      this._prepareWeaponData();
    } else if (this.equipmentType === 'armor') {
      this._prepareArmorData();
    }

    // Format metal display
    this.metalDisplay = this.metal === 'none'
      ? '-'
      : (game.i18n.localize(CONFIG.VAGABOND?.metalTypes?.[this.metal]) || this.metal);
  }

  _prepareWeaponData() {
    // Determine current damage and damage type based on equipment state
    let baseDamage;
    let baseDamageType;
    if (this.equipmentState === 'twoHands') {
      baseDamage = this.damageTwoHands;
      baseDamageType = this.damageTypeTwoHands;
    } else {
      baseDamage = this.damageOneHand;
      baseDamageType = this.damageTypeOneHand;
    }

    // Set current damage type
    this.currentDamageType = baseDamageType || '-';

    // Material-adjusted damage (die size shift, countdown loss, flat bonus)
    this.currentDamage = this.materialDamageFormula(baseDamage);
    // Per-grip finals for sheet display (independent of current equip state)
    this.finalDamageOneHand = this.materialDamageFormula(this.damageOneHand);
    this.finalDamageTwoHands = this.materialDamageFormula(this.damageTwoHands);

    // Countdown die exhausted: stepped down past the smallest die
    const rules = this._materialRules();
    this.degrades = !!rules.degrades;
    const ladder = CONFIG.VAGABOND?.weaponDieSteps ?? [4, 6, 8, 10, 12];
    const baseDie = Number(String(baseDamage ?? '').match(/d(\d+)/i)?.[1]);
    const baseIdx = ladder.indexOf(baseDie);
    const dieLost = this.degrades ? (this.dieDamage ?? 0) : 0;
    this.broken = dieLost > 0 && baseIdx >= 0
      && Math.min(ladder.length - 1, Math.max(0, baseIdx + (rules.weaponDieStep ?? 0))) - dieLost < 0;

    // Format range display with abbreviations and full names
    this.rangeAbbrev = game.i18n.localize(CONFIG.VAGABOND?.rangeAbbreviations?.[this.range]) || this.range;
    this.rangeDisplay = game.i18n.localize(CONFIG.VAGABOND?.weaponRanges?.[this.range]) || this.range;

    // Format grip display
    this.gripDisplay = game.i18n.localize(CONFIG.VAGABOND?.grip?.[this.grip]) || this.grip;
  }

  _prepareArmorData() {
    // Final armor rating with material bonus (Adamant +1), minus Rating lost to
    // damage (degrading materials; hidden feature — armorDamage stays 0 unless used)
    const rules = this._materialRules();
    this.degrades = !!rules.degrades;
    const ratingBeforeDamage = this.armorRating + (rules.armorBonus ?? 0);
    // Stored loss only applies to degrading materials (switching Gold → Iron
    // shows full Rating; switching back restores the stored loss)
    const ratingLost = this.degrades ? (this.armorDamage ?? 0) : 0;
    this.finalRating = Math.max(0, ratingBeforeDamage - ratingLost);
    // "breaking at 0" — only once damage actually brought it there
    this.broken = ratingLost > 0 && ratingBeforeDamage > 0 && this.finalRating === 0;
    this.finalReflexPenalty = Math.max(0, this.reflexPenalty + (this.metalSlotDelta ?? 0));

    // Read-only back-compat aliases (chat cards, module API callers)
    this.rating = this.armorRating;
    this.might = this.mightRequirement;
  }

  /**
   * Apply this item's material to a weapon damage formula: die size shift
   * (Mythral −1 / Orichalcum +1), countdown sizes lost (`dieDamage`), then the
   * flat bonus (Adamant +1). "-" (no damage, e.g. Net) and empty stay as-is.
   * @param {string} formula
   * @returns {string}
   */
  materialDamageFormula(formula) {
    if (!formula || formula.trim() === '-') return formula;
    const rules = this._materialRules();
    const dieLost = rules.degrades ? (this.dieDamage ?? 0) : 0;
    const steps = (rules.weaponDieStep ?? 0) - dieLost;
    let out = steps ? this.constructor.shiftDieSize(formula, steps) : formula;
    const bonus = rules.weaponDamageBonus ?? 0;
    if (bonus) out = out.includes('d') ? `${out}+${bonus}` : String((parseInt(out) || 0) + bonus);
    return out;
  }

  /**
   * Shift every die term along CONFIG.VAGABOND.weaponDieSteps, clamped to the
   * ladder ends (d4…d12). Dice not on the ladder (d20, d3) are left alone.
   * @param {string} formula
   * @param {number} steps - positive = larger die
   */
  static shiftDieSize(formula, steps) {
    const ladder = CONFIG.VAGABOND?.weaponDieSteps ?? [4, 6, 8, 10, 12];
    return formula.replace(/(\d*)d(\d+)/gi, (m, n, faces) => {
      const i = ladder.indexOf(Number(faces));
      if (i < 0) return m;
      return `${n}d${ladder[Math.min(ladder.length - 1, Math.max(0, i + steps))]}`;
    });
  }

  /** Material rules entry from CONFIG.VAGABOND.metalData ({} when unknown). */
  _materialRules() {
    return CONFIG.VAGABOND?.metalData?.[this.metal] ?? {};
  }

  _getMetalData() {
    const rules = this._materialRules();
    const effect = rules.effect ? (game.i18n.localize(rules.effect) || '-') : '-';
    return { multiplier: rules.multiplier ?? 1, effect };
  }

  /**
   * Apply a material cost multiplier. ×1 keeps the authored split; any other
   * multiplier converts through copper (1g = 100s, 1s = 10c) and re-splits into
   * the largest coins, rounding down to whole copper (1g 40s ×50 → 70g, not
   * 50g 2000s; Wood ÷2: 1g → 50s).
   * @param {{gold:number, silver:number, copper:number}} base
   * @param {number} multiplier
   */
  static _applyCostMultiplier(base, multiplier) {
    if (multiplier === 1) return { gold: base.gold, silver: base.silver, copper: base.copper };
    let copper = Math.floor(((base.gold * 100 + base.silver) * 10 + base.copper) * multiplier);
    const gold = Math.floor(copper / 1000); copper -= gold * 1000;
    const silver = Math.floor(copper / 10); copper -= silver * 10;
    return { gold, silver, copper };
  }

  /**
   * Format equipment description for countdown dice triggers
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
