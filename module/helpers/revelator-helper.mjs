import { StatusHelper } from './status-helper.mjs';
import { FlankingHelper } from './flanking-helper.mjs';
import { VagabondDamagePipeline } from './damage-pipeline.mjs';

/**
 * Revelator — Lay on Hands (feature button).
 *
 * "You can spend 1 Mana and use your Action or skip your Move to restore (d4 + your Level) HP to
 * yourself or a Close Being." The die comes from `system.layOnHandsDie` (the class's "Lay on Hands"
 * effect: 4 / 6 / 8 at Levels 2 / 6 / 10); the Statuses Divine Resolve cures from
 * `system.layOnHandsCures`. Everything else (Paragon's Aura, Holy Diver, Enspell) is text.
 *
 * The roll goes through the damage pipeline as a healing roll (so Healing bonuses such as Virtuoso's
 * Inspiration die apply) and lands on a standard action card with the Apply button for the Target.
 * Imported only by vagabond.mjs (button handler).
 */
export class RevelatorHelper {

  static #L(key, data = {}) {
    return game.i18n.format(`VAGABOND.LayOnHands.${key}`, data);
  }

  /** A stored-target record for a token (same shape `TargetHelper.captureCurrentTargets` makes). */
  static #stored(token) {
    return {
      tokenId: token.id,
      sceneId: token.scene?.id ?? canvas.scene?.id,
      actorId: token.actor?.id,
      actorName: token.name,
      actorImg: token.document.texture.src,
    };
  }

  /**
   * The Lay on Hands button. Target = the first targeted token, else the Revelator themself.
   * @param {object} scope - macro scope { actor, targets }
   */
  static async layOnHands({ actor, targets }) {
    if (actor?.type !== 'character' || !actor.isOwner) {
      ui.notifications.warn(this.#L('NotYours'));
      return;
    }
    const die = Math.trunc(Number(actor.system.layOnHandsDie)) || 0;
    if (die < 2) {
      ui.notifications.warn(this.#L('NotAvailable'));
      return;
    }
    const mana = actor.system.mana?.current ?? 0;
    if (mana < 1) {
      ui.notifications.warn(this.#L('NoMana'));
      return;
    }

    const selfToken = actor.token?.object ?? actor.getActiveTokens(true)[0] ?? null;
    const token = (targets?.length ? targets : Array.from(game.user.targets))[0] ?? selfToken;
    if (!token?.actor) {
      ui.notifications.warn(this.#L('NoToken'));
      return;
    }
    // "yourself or a Close Being"
    if (selfToken && token !== selfToken && FlankingHelper.rangeBand(selfToken, token) !== 'close') {
      ui.notifications.warn(this.#L('NotClose', { target: token.name }));
      return;
    }

    await actor.update({ 'system.mana.current': mana - 1 });

    const level = actor.system.attributes?.level?.value ?? 1;
    const stored = [this.#stored(token)];
    const roll = await VagabondDamagePipeline.rollDamage({
      actor,
      baseFormula: `1d${die} + ${level}`,
      sourceType: 'generic',
      damageType: 'healing',
      targets: stored,
    });
    if (!roll) return;

    // Divine Resolve: the Target is cured of these Statuses
    const cured = [];
    for (const statusId of actor.system.layOnHandsCures ?? []) {
      if (!StatusHelper.actorHasStatus(token.actor, statusId)) continue;
      await StatusHelper.removeStatus(token.actor, statusId);
      cured.push(game.i18n.localize(CONFIG.VAGABOND?.statusConditions?.[statusId] ?? statusId));
    }

    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.createActionCard({
      actor,
      item: null,
      title: game.i18n.localize('VAGABOND.LayOnHands.Title'),
      subtitle: actor.name,
      rollData: { isCritical: false, isHit: false },
      damageRoll: roll,
      damageType: 'healing',
      description: `<p>${this.#L('Lays', { name: actor.name, target: token.name })}</p>`
        + (cured.length ? `<p>${this.#L('Cured', { statuses: cured.join(', ') })}</p>` : ''),
      targetsAtRollTime: stored,
    });
  }
}
