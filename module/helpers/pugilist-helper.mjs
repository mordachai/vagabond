import { StatusHelper } from './status-helper.mjs';

/**
 * Pugilist — Haymaker (optional automation).
 *
 * A Brawl attack whose Check beats the Difficulty by `system.haymakerMargin` or more (15, then 14 at
 * Level 6 and 13 at Level 10 — the class's "Haymaker" effect; 0 when the effect is off or the world
 * Class Automation mode says manual) Dazes its Target "until your next Turn".
 *
 * Duration: the Pugilist's actor remembers who it Dazed (`flags.vagabond.haymakerTargets`, written by
 * its own owner); when the Pugilist's Turn starts in a Combat the active GM lifts those Dazed
 * statuses. With no Combat nothing counts Turns, so the Dazed is removed by hand like any other.
 *
 * Title Holder (Brawl die size + Explode on the two highest values) lives in the damage pipeline
 * (`weaponDieBySkill` / `weaponHighExplodeBySkill`); Fisticuffs, Rope-a-Dope and Moxie are text / plain effects.
 */
export class PugilistHelper {

  static #L(key, data = {}) {
    return game.i18n.format(`VAGABOND.Haymaker.${key}`, data);
  }

  /** The margin a Brawl Check must beat the Difficulty by (0 = no Haymaker right now). */
  static margin(actor) {
    return actor?.type === 'character' ? Number(actor.system?.haymakerMargin) || 0 : 0;
  }

  /** Resolve a stored `{tokenId, sceneId}` Target to its actor. */
  static #targetActor(stored) {
    return game.scenes.get(stored?.sceneId)?.tokens.get(stored?.tokenId)?.actor ?? null;
  }

  /** `vagabond.postD20Roll`: a Brawl attack landed — did it beat the Difficulty by enough? */
  static async onWeaponRoll(ctx) {
    if (ctx?.rollType !== 'weapon' || ctx.rollKey !== 'brawl' || !ctx.isSuccess) return;
    const attacker = ctx.actor;
    const margin = this.margin(attacker);
    if (margin <= 0) return;
    if ((ctx.roll?.total ?? 0) - (ctx.difficulty ?? 0) < margin) return;

    const target = this.#targetActor(ctx.targets?.[0]);
    if (!target) return;
    await this.haymaker(attacker, target);
  }

  /** Daze `target` and remember it for the end of the Pugilist's next Turn start. */
  static async haymaker(attacker, target) {
    const { VagabondChatCard } = await import('./chat-card.mjs');
    const tokenName = attacker.token?.name ?? attacker.getActiveTokens(true)[0]?.name ?? attacker.name;
    const result = await StatusHelper.applyStatus(target, { statusId: 'dazed' }, false, game.i18n.localize('VAGABOND.Haymaker.Title'),
      { skipSaveRoll: true, sourceActorName: tokenName });

    if (result.outcome === 'applied') {
      const key = target.token?.uuid ?? target.uuid;
      const list = attacker.getFlag('vagabond', 'haymakerTargets') ?? [];
      if (!list.includes(key)) await attacker.setFlag('vagabond', 'haymakerTargets', [...list, key]);
    } else if (result.outcome !== 'already_active' && result.outcome !== 'immune') {
      return;
    }

    await VagabondChatCard.featureCard(attacker, {
      title: game.i18n.localize('VAGABOND.Haymaker.Title'),
      description: `<p>${this.#L(result.outcome === 'immune' ? 'Immune' : 'Landed', { name: attacker.name, target: target.name })}</p>`,
    });
  }

  /** `combatTurnChange`: a Turn began — lift the Dazed its owner caused with Haymaker. */
  static async onTurnStart(combat, prior, current) {
    if (!game.user.isActiveGM) return;
    const actor = combat.combatants.get(current?.combatantId)?.actor;
    const list = actor?.getFlag?.('vagabond', 'haymakerTargets');
    if (!list?.length) return;

    for (const uuid of list) {
      try {
        const doc = await fromUuid(uuid);
        const targetActor = doc?.actor ?? doc;
        if (targetActor && StatusHelper.actorHasStatus(targetActor, 'dazed')) await StatusHelper.removeStatus(targetActor, 'dazed');
      } catch (err) {
        console.warn('vagabond | Haymaker: could not lift Dazed from', uuid, err);
      }
    }
    await actor.unsetFlag('vagabond', 'haymakerTargets');
  }

  static registerHooks() {
    Hooks.on('vagabond.postD20Roll', (ctx) => { this.onWeaponRoll(ctx); });
    Hooks.on('combatTurnChange', (combat, prior, current) => { this.onTurnStart(combat, prior, current); });
  }
}
