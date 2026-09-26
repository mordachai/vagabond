import { craftingConfig } from './config.mjs';
import { VagabondChatCard } from '../chat-card.mjs';

/**
 * Mix (Alchemist L6, RAW §1; docs/crafting-plan.md §4.10). A Mix item is an
 * `equipment` item flagged `flags.vagabond.mix = { ingredients: [itemData, itemData],
 * expiresAt: {combatId, round, turn} | null, inert: false }`. Own art, consumed on
 * Use (deferred — see docs/crafting-plan.md Phase 5 as-built: creation + full
 * expiry lifecycle are built; automatic dual-payload resolution on Use is not).
 */
export class MixHelper {
  static ART = 'icons/consumables/potions/bottle-round-corked-glowing-green.webp';

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

    const [created] = await actor.createEmbeddedDocuments('Item', [{
      name: game.i18n.format('VAGABOND.Craft.Mix.ItemName', { a: ingredientA.name, b: ingredientB.name }),
      type: 'equipment',
      img: this.ART,
      system: {
        equipmentType: 'alchemical',
        quantity: 1,
        description: game.i18n.format('VAGABOND.Craft.Mix.ItemDescription', { a: ingredientA.name, b: ingredientB.name }),
      },
      flags: {
        vagabond: {
          mix: {
            ingredients: [ingredientA, ingredientB],
            expiresAt,
            inert: false,
            watchOutOfCombat: !expiresAt && craftingConfig().alchemy.mixExpiryOutOfCombat === 'nextAction',
          },
        },
      },
    }]);
    return created;
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
