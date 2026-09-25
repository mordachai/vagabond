/**
 * Shop actor — a vendor the party can buy from and sell to.
 *
 * The actor's own `img` is the shop sign / token; the shopkeeper has separate
 * identity fields. Stock = the shop's embedded Items (count = `system.quantity`),
 * with per-item GM controls in `flags.vagabond.shop`
 * (`priceOverride`, `hidden`, `blockBuy`, `blockSell`, `onSale`, `featured`, `unlimited`, `materials[]`).
 *
 * Deliberately NOT built on VagabondActorBase — a shop has no HP / fatigue.
 * See docs/shop-plan.md.
 */
export default class VagabondShop extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ['VAGABOND.Actor.Shop'];

  /** Relationship levels, index = level + 2 (level range -2..2). */
  static RELATION_KEYS = Object.freeze(['hostile', 'unfriendly', 'neutral', 'friendly', 'allied']);

  static defineSchema() {
    const fields = foundry.data.fields;
    const requiredInteger = { required: true, nullable: false, integer: true };
    const pct = (initial, min = -100, max = 1000) =>
      new fields.NumberField({ required: true, nullable: false, initial, min, max });
    const schema = {};

    // Tagline under the shop name in the store banner
    schema.subtitle = new fields.StringField({ initial: '' });

    schema.shopkeeper = new fields.SchemaField({
      name: new fields.StringField({ initial: '' }),
      title: new fields.StringField({ initial: '' }),
      img: new fields.FilePathField({ categories: ['IMAGE'], initial: null, nullable: true }),
      description: new fields.HTMLField({ initial: '' }),
    });

    schema.pricing = new fields.SchemaField({
      // % added to every item's base cost when buying from this shop
      markup: pct(0, -100),
      // Fraction of an item's value the shop pays when buying from players.
      // No RAW rule — GM-set per shop; 0.5 is only the initial value.
      buyRatio: new fields.NumberField({ required: true, nullable: false, initial: 0.5, min: 0, max: 10 }),
      // % off for items flagged onSale
      saleDiscount: pct(20, 0, 100),
      // Optional: % off per point of the buyer's Presence (stat key is homebrew-dynamic, no `choices:`)
      presenceEnabled: new fields.BooleanField({ initial: false }),
      presenceStat: new fields.StringField({ initial: 'presence' }),
      presencePctPerPoint: pct(2, 0, 100),
    });

    // equipmentType values the shop will buy from players (empty = everything)
    schema.buysCategories = new fields.ArrayField(new fields.StringField({ blank: false }), { initial: [] });

    // Items sold to the shop go back into its stock
    schema.resell = new fields.BooleanField({ initial: true });

    // Per-character relationship level: { [actorId]: -2..2 }
    schema.relationships = new fields.TypedObjectField(
      new fields.NumberField({ ...requiredInteger, initial: 0, min: -2, max: 2 })
    );

    // Price % adjustment per relationship level (positive = more expensive for the buyer)
    schema.relationLevels = new fields.SchemaField({
      hostile: pct(50),
      unfriendly: pct(20),
      neutral: pct(0),
      friendly: pct(-10),
      allied: pct(-20),
    });

    schema.haggle = new fields.SchemaField({
      mode: new fields.StringField({ initial: 'off', choices: ['off', 'roll', 'gm', 'both'] }),
      // No `choices:` — skills are homebrew-dynamic; the UI enforces valid keys
      skill: new fields.StringField({ initial: 'influence' }),
      difficultyMod: new fields.NumberField({ ...requiredInteger, initial: 0 }),
      successPct: pct(10, 0, 100),
      critPct: pct(20, 0, 100),
      lockoutOnFail: new fields.BooleanField({ initial: true }),
    });

    schema.stock = new fields.SchemaField({
      // Stock items without their own `unlimited` flag never run out
      unlimitedByDefault: new fields.BooleanField({ initial: false }),
      // Compendium collection ids sold in full, unlimited
      catalogPacks: new fields.ArrayField(new fields.StringField({ blank: false }), { initial: [] }),
      // RollTable uuid used by Restock
      restockTable: new fields.StringField({ initial: '', blank: true }),
    });

    // Optional shop purse. Off = infinite funds (the shop can always pay).
    schema.usePurse = new fields.BooleanField({ initial: false });
    schema.currency = new fields.SchemaField({
      gold: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      silver: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
      copper: new fields.NumberField({ ...requiredInteger, initial: 0, min: 0 }),
    });

    return schema;
  }

  /**
   * Relationship level (-2..2) of a character with this shop.
   * @param {Actor|string|null} actorOrId
   * @returns {number}
   */
  relationshipOf(actorOrId) {
    const id = typeof actorOrId === 'string' ? actorOrId : actorOrId?.id;
    return id ? (this.relationships?.[id] ?? 0) : 0;
  }

  /**
   * Price % adjustment for a relationship level.
   * @param {number} level  -2..2
   * @returns {number}
   */
  relationPct(level) {
    const key = this.constructor.RELATION_KEYS[Math.max(-2, Math.min(2, level)) + 2];
    return this.relationLevels?.[key] ?? 0;
  }
}
