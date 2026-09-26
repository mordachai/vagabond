import { craftingConfig } from './config.mjs';
import { VagabondChatCard } from '../chat-card.mjs';
import { VagabondDamageHelper } from '../damage-helper.mjs';
import { VagabondDamagePipeline } from '../damage-pipeline.mjs';

/**
 * Mix (Alchemist L6, RAW §1; docs/crafting-plan.md §4.10). A Mix item is an
 * `equipment` item flagged `flags.vagabond.mix = { ingredients: [itemData, itemData],
 * expiresAt: {combatId, round, turn} | null, inert: false }`. Own art, consumed on
 * Use (deferred — see docs/crafting-plan.md Phase 5 as-built: creation + full
 * expiry lifecycle are built; automatic dual-payload resolution on Use is not).
 */
export class MixHelper {
  static ART = 'icons/consumables/potions/flask-corked-green.webp';

  /**
   * Create a Mix item on `actor` from two already-snapshotted ingredient
   * item-data blobs (the caller is responsible for consuming their charges
   * first — see `MixMode.execute`). Sets `expiresAt` from the actor's CURRENT
   * combat turn if one is active; otherwise leaves it null (out-of-combat expiry
   * is watched separately via `vagabond.actorActed`, see `mixExpiryOutOfCombat`).
   * @param {Actor} actor
   * @param {object} ingredientA
   * @param {object} ingredientB
   * @returns {Promise<Item>}
   */
  static async create(actor, ingredientA, ingredientB) {
    const combat = game.combat;
    const combatant = combat?.combatants?.find(c => c.actor?.uuid === actor.uuid);
    const expiresAt = (combat?.started && combatant)
      ? { combatId: combat.id, round: combat.round, turn: combat.turn }
      : null;

    const payload = this.combinePayloads(ingredientA, ingredientB);
    const [created] = await actor.createEmbeddedDocuments('Item', [{
      name: game.i18n.format('VAGABOND.Craft.Mix.ItemName', { a: ingredientA.name, b: ingredientB.name }),
      type: 'equipment',
      img: this.ART,
      system: {
        equipmentType: 'alchemical',
        alchemicalType: payload.alchemicalType,
        quantity: 1,
        isConsumable: true,
        damageAmount: payload.damageAmount,
        damageType: payload.damageType,
        causedStatuses: payload.causedStatuses,
        critCausedStatuses: payload.critCausedStatuses,
        description: payload.description,
      },
      flags: {
        vagabond: {
          mix: {
            ingredients: [ingredientA, ingredientB],
            companionIndex: payload.companionIndex,
            expiresAt,
            inert: false,
            watchOutOfCombat: !expiresAt && craftingConfig().alchemy.mixExpiryOutOfCombat === 'nextAction',
          },
        },
      },
    }]);
    return created;
  }

  /**
   * An owned Alchemical Item usable as a Mix ingredient: has a charge left, isn't
   * itself a Mix, and isn't a light source (its payload is the Ignite macro, which
   * a Mix can't carry).
   */
  static isMixableItem(item) {
    if (!item || item.type !== 'equipment' || item.system.equipmentType !== 'alchemical') return false;
    if (item.flags?.vagabond?.mix) return false;
    if (game.vagabond?.lightSource?.isLightItem?.(item)) return false;
    return CONFIG.Item.documentClass._chargesRemaining(item) > 0;
  }

  /** i18n key: how long a Mix made by `actor` right now would last. */
  static expiryKeyFor(actor) {
    const combat = game.combat;
    const inCombat = combat?.started && combat.combatants.some(c => c.actor?.uuid === actor?.uuid);
    if (inCombat) return 'VAGABOND.Craft.Mix.Expiry.NextTurn';
    return craftingConfig().alchemy.mixExpiryOutOfCombat === 'nextAction'
      ? 'VAGABOND.Craft.Mix.Expiry.NextAction'
      : 'VAGABOND.Craft.Mix.Expiry.UntilUsed';
  }

  /** i18n key: the current state of an existing Mix item. */
  static statusKeyOf(item) {
    const mix = item?.flags?.vagabond?.mix;
    if (!mix) return '';
    if (mix.inert) return 'VAGABOND.Craft.Mix.Expiry.Inert';
    if (mix.expiresAt) return 'VAGABOND.Craft.Mix.Expiry.NextTurn';
    if (mix.watchOutOfCombat) return 'VAGABOND.Craft.Mix.Expiry.NextAction';
    return 'VAGABOND.Craft.Mix.Expiry.UntilUsed';
  }

  /** `{amount, type}` of an item's (or item-data's) damage, or null when it deals none. */
  static damageOf(data) {
    const type = data?.system?.damageType;
    const amount = String(data?.system?.damageAmount ?? '').trim();
    return (type && type !== '-' && amount) ? { amount, type } : null;
  }

  /**
   * Merge two ingredient snapshots into ONE alchemical payload ("both occur
   * simultaneously when used"), so the Mix runs through the ordinary alchemical
   * Use / Throw / Potency / save / status paths untouched:
   * - same damage type (or only one deals damage) → formulas joined, one type;
   * - different types → the Mix carries the harmful one (A when both harm) and the
   *   other becomes the companion payload (`companionIndex`), posted as its own
   *   damage card by `postCompanion` on the same targets;
   * - on-hit / crit statuses → union by statusId (first ingredient wins a clash).
   * @returns {{damageAmount, damageType, causedStatuses, critCausedStatuses, description, alchemicalType, companionIndex: number|null}}
   */
  static combinePayloads(a, b) {
    const dmgA = this.damageOf(a);
    const dmgB = this.damageOf(b);
    let damage = dmgA ?? dmgB;
    let companionIndex = null;
    if (dmgA && dmgB) {
      if (dmgA.type === dmgB.type) {
        damage = { amount: `${dmgA.amount} + ${dmgB.amount}`, type: dmgA.type };
      } else {
        const restorative = (d) => VagabondDamageHelper.isRestorativeDamageType(d.type);
        const primaryIsB = restorative(dmgA) && !restorative(dmgB);
        damage = primaryIsB ? dmgB : dmgA;
        companionIndex = primaryIsB ? 0 : 1;
      }
    }

    const union = (key) => {
      const out = [];
      for (const entry of [...(a.system?.[key] ?? []), ...(b.system?.[key] ?? [])]) {
        if (!out.some(e => e.statusId === entry.statusId)) out.push(foundry.utils.deepClone(entry));
      }
      return out;
    };

    const section = (data) => `<h4>${foundry.utils.escapeHTML(data.name)}</h4>${data.system?.description ?? ''}`;
    // Throwing wins over drinking: an explosive/acid ingredient makes the whole Mix a missile.
    const types = [a.system?.alchemicalType, b.system?.alchemicalType];
    const alchemicalType = types.find(t => ['explosive', 'acid', 'oil', 'poison'].includes(t)) ?? types[0] ?? 'concoction';

    return {
      damageAmount: damage?.amount ?? '',
      damageType: damage?.type ?? '-',
      causedStatuses: union('causedStatuses'),
      critCausedStatuses: union('critCausedStatuses'),
      description: `${section(a)}${section(b)}`,
      alchemicalType,
      companionIndex,
    };
  }

  /**
   * A Mix whose ingredients deal DIFFERENT damage types carries one of them itself;
   * the other (`companionIndex`) resolves here as its own damage card on the same
   * targets — called by the Use path, and by the throw path on a hit only. Built
   * from the ingredient snapshot as an unsaved item with a fresh id (so card
   * buttons never resolve to a live stack of that ingredient) and NO statuses —
   * those already ride on the Mix's own card as a union.
   * @param {Actor} actor
   * @param {Item} mixItem
   * @param {object[]} targets  targets captured at use time
   * @param {{attackType?: string}} [opts]  card attackType for a harmful payload
   * @returns {Promise<ChatMessage|null>}
   */
  static async postCompanion(actor, mixItem, targets = [], { attackType = 'melee' } = {}) {
    const mix = mixItem?.flags?.vagabond?.mix;
    const index = mix?.companionIndex;
    if (index === null || index === undefined || !mix.ingredients?.[index]) return null;
    const data = foundry.utils.deepClone(mix.ingredients[index]);
    const damage = this.damageOf(data);
    if (!damage) return null;

    data._id = foundry.utils.randomID();
    data.system.causedStatuses = [];
    data.system.critCausedStatuses = [];
    data.system.isConsumable = true;
    const ingredient = new CONFIG.Item.documentClass(data, { parent: actor });

    const roll = await VagabondDamagePipeline.rollDamage({
      actor,
      item: ingredient,
      baseFormula: damage.amount,
      sourceType: 'alchemical',
      damageType: damage.type,
      targets,
    });
    const restorative = VagabondDamageHelper.isRestorativeDamageType(damage.type);
    return VagabondChatCard.createActionCard({
      actor,
      item: ingredient,
      title: game.i18n.format('VAGABOND.Craft.Mix.CompanionTitle', { name: data.name }),
      subtitle: actor.name,
      damageRoll: roll,
      damageType: damage.type,
      attackType: restorative ? 'none' : attackType,
      hasDefenses: !restorative,
      targetsAtRollTime: targets,
    });
  }

  /** Every live (non-inert) Mix item on `actor`. */
  static liveMixItems(actor) {
    return (actor?.items ?? []).filter(i => i.flags?.vagabond?.mix && !i.flags.vagabond.mix.inert);
  }

  /**
   * Called from the `updateCombat` hook (GM-gated) whenever the active combatant
   * changes: expires any of that actor's Mix items created during an earlier
   * turn of the SAME combat ("goes inert at the start of your next Turn").
   */
  static async expireForTurnStart(actor, combat) {
    for (const item of this.liveMixItems(actor)) {
      const exp = item.flags.vagabond.mix.expiresAt;
      if (!exp || exp.combatId !== combat.id) continue;
      const isLaterTurn = combat.round > exp.round || (combat.round === exp.round && combat.turn > exp.turn);
      if (isLaterTurn) await this.expire(item);
    }
  }

  /**
   * Called from the `vagabond.actorActed` listener: expires any of `actor`'s
   * out-of-combat, `nextAction`-watching Mix items — except the one whose OWN
   * use produced this very action (`excludeItemId`).
   */
  static async expireOnNextAction(actor, excludeItemId) {
    for (const item of this.liveMixItems(actor)) {
      if (item.id === excludeItemId) continue;
      if (!item.flags.vagabond.mix.watchOutOfCombat) continue;
      await this.expire(item);
    }
  }

  /** Delete or mark inert, per `mixInertBehavior`. */
  static async expire(item) {
    const behavior = craftingConfig().alchemy.mixInertBehavior;
    const [a, b] = item.flags.vagabond.mix.ingredients;
    if (behavior === 'delete') {
      const actor = item.actor;
      const name = item.name;
      await item.delete();
      if (actor) {
        const card = new VagabondChatCard()
          .setType('generic')
          .setActor(actor)
          .setTitle(game.i18n.localize('VAGABOND.Craft.Mix.WentInertTitle'))
          .setSubtitle(actor.name)
          .setDescription(`<p>${game.i18n.format('VAGABOND.Craft.Mix.WentInert', {
            name: `<strong>${foundry.utils.escapeHTML(name)}</strong>`,
          })}</p>`);
        await card.send();
      }
    } else {
      await item.update({ 'flags.vagabond.mix.inert': true });
    }
  }
}
