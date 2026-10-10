import { combatRollData } from './rule-rolldata.mjs';

/**
 * Rogue — Sneak Attack, Lethal Weapon, Knack (optional automation).
 *
 * Sneak Attack: "The first time you hit with a Favored attack on a Turn with a Finesse, Keen, or Ranged
 * Weapon, it deals an extra d4 damage and ignores an amount of Armor equal to this number of extra dice."
 *   - `system.sneakAttackDice`     number of extra d4s (the class's "Sneak Attack" effect — always on)
 *   - `system.sneakAttackExplode`  > 0 → those dice Explode (Lethal Weapon)
 *   - `system.sneakAttackTrigger`  the "Sneak Attack: Auto" effect (switchable; cleared by the world Class
 *                                  Automation mode). Without it nothing happens by itself — roll the dice by hand.
 * Flow: a qualifying hit (`vagabond.postD20Roll`) arms a pending Sneak Attack for that weapon; the next
 * damage roll of that weapon (`vagabond.preDamageRoll`) gets the extra dice, and the attacker remembers the
 * Armor to ignore (`flags.vagabond.sneakIgnore`) until their next weapon attack, applied when the damage
 * lands (`vagabond.calculateFinalDamage`). One Sneak Attack per Turn inside a started Combat (with no Combat
 * there are no Turns to count, so every qualifying hit counts).
 *
 * Knack: `system.critLuckBonus` extra Luck whenever you Crit (the class's "Knack" effect).
 *
 * Imported by vagabond.mjs only (hooks).
 */
export class RogueHelper {
  /** Armed Sneak Attacks waiting for their damage roll: key `${actorId}:${itemId}` → { dice, at } */
  static #pending = new Map();
  static #PENDING_MS = 10 * 60 * 1000;

  static #L(key, data = {}) {
    return game.i18n.format(`VAGABOND.SneakAttack.${key}`, data);
  }

  /** A stable id for "this Turn" of the started Combat the actor is in; null with no Combat. */
  static #turnKey(actor) {
    const combat = game.combats?.active;
    if (!combat?.started || combatRollData(actor).active !== 1) return null;
    return `${combat.id}:${combat.round}:${combat.turn}`;
  }

  /** Does this weapon attack qualify for Sneak Attack (Finesse, Keen or Ranged Weapon)? */
  static #qualifies(ctx) {
    const keen = ctx.item?.system?.properties?.includes('Keen');
    return keen || ['finesse', 'ranged'].includes(ctx.rollKey);
  }

  /** `vagabond.postD20Roll`: arm Sneak Attack on a qualifying hit; Knack's Luck on any Crit. */
  static async onRoll(ctx) {
    const actor = ctx?.actor;
    if (actor?.type !== 'character') return;

    // Knack — extra Luck on a Crit (any d20 roll)
    const luckBonus = Number(actor.system.critLuckBonus) || 0;
    if (luckBonus > 0 && ctx.isCritical && actor.isOwner) await this.#knack(actor, luckBonus);

    if (ctx.rollType !== 'weapon' || !ctx.item) return;

    // A new weapon attack ends the previous attack's Armor-ignoring
    if (actor.isOwner && actor.getFlag('vagabond', 'sneakIgnore')) await actor.unsetFlag('vagabond', 'sneakIgnore');

    const dice = Math.trunc(Number(actor.system.sneakAttackDice)) || 0;
    if (!actor.system.sneakAttackTrigger || dice <= 0 || !actor.isOwner) return;
    if (!ctx.isSuccess || ctx.favorHinder !== 'favor' || !this.#qualifies(ctx)) return;

    const turn = this.#turnKey(actor);
    if (turn && actor.getFlag('vagabond', 'sneakTurn') === turn) return;
    this.#pending.set(`${actor.id}:${ctx.item.id}`, { dice, at: Date.now() });
  }

  /** `vagabond.preDamageRoll`: the armed weapon's next damage roll gets the Sneak Attack dice. */
  static onPreDamageRoll(d) {
    const actor = d?.actor;
    if (!actor || !d.item || d.sourceType !== 'weapon' || !d.baseFormula) return;
    const key = `${actor.id}:${d.item.id}`;
    const armed = this.#pending.get(key);
    if (!armed) return;
    this.#pending.delete(key);
    if (Date.now() - armed.at > this.#PENDING_MS) return;

    const explode = Number(actor.system.sneakAttackExplode) > 0 ? 'x' : '';
    d.baseFormula = `${d.baseFormula} + ${armed.dice}d4${explode}`;
    d.sneakAttackDice = armed.dice;
    this.#spent(actor, d.item, armed.dice);
  }

  /** Remember the Turn, the Armor to ignore, and tell the table. */
  static async #spent(actor, item, dice) {
    try {
      const turn = this.#turnKey(actor);
      if (turn) await actor.setFlag('vagabond', 'sneakTurn', turn);
      await actor.setFlag('vagabond', 'sneakIgnore', { itemId: item.id, n: dice });
      const { VagabondChatCard } = await import('./chat-card.mjs');
      await VagabondChatCard.featureCard(actor, {
        title: game.i18n.localize('VAGABOND.SneakAttack.Title'),
        description: `<p>${this.#L('Spent', { name: actor.name, dice, armor: dice })}</p>`,
      });
    } catch (err) {
      console.warn('vagabond | Sneak Attack: could not record the spent attack', err);
    }
  }

  /** `vagabond.calculateFinalDamage`: give back the Armor the Sneak Attack ignores. */
  static onFinalDamage(ctx) {
    const flag = ctx?.attackerActor?.getFlag?.('vagabond', 'sneakIgnore');
    const result = ctx?.result;
    if (!flag?.n || !result || ctx.attackingWeapon?.id !== flag.itemId) return;
    const refund = Math.min(flag.n, result.armorReduction ?? 0);
    if (refund <= 0) return;
    result.final += refund;
    result.armorReduction -= refund;
    result.sneakIgnored = refund;
  }

  static async #knack(actor, bonus) {
    const cur = actor.system.currentLuck ?? 0;
    const next = cur + bonus;
    if (next <= cur) return;
    await actor.update({ 'system.currentLuck': next });
    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.featureCard(actor, {
      title: game.i18n.localize('VAGABOND.Knack.Title'),
      description: `<p>${game.i18n.format('VAGABOND.Knack.Gained', { name: actor.name, luck: next - cur })}</p>`,
    });
  }

  static registerHooks() {
    Hooks.on('vagabond.postD20Roll', (ctx) => { this.onRoll(ctx); });
    Hooks.on('vagabond.preDamageRoll', (d) => { this.onPreDamageRoll(d); });
    Hooks.on('vagabond.calculateFinalDamage', (ctx) => { this.onFinalDamage(ctx); });
  }
}
