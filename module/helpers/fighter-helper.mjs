import { classFeatureText } from './feature-text.mjs';
import { combatRollData } from './rule-rolldata.mjs';
import { RollExpiry } from './roll-expiry.mjs';

/**
 * Fighter — Momentum (optional automation + feature button).
 *
 * RAW: if you pass a Save against an Enemy's attack or reduce its damage to 0, your next attack
 * before the end of your Turn is Favored. The Favor itself is a plain actor effect
 * (`system.favorChecks` = attack, spent by `consumeOn: ['attack']`, see use-effects.mjs).
 * Two ways to get it, both manual-first:
 *   - the Momentum button on the class feature (always works, no combat needed);
 *   - automatically, but only while the actor has `system.momentumTrigger` (set by the class's
 *     "Momentum: Auto" effect — switch that off and nothing here ever fires).
 *
 * Valor, Fighting Style, Muster for Battle and Harrying need no code here: Valor is an Active
 * Effect on the class item, the rest is text / perk grants.
 */
export class FighterHelper {

  /** Does this actor have the auto-Momentum automation on? */
  static isAuto(actor) {
    return actor?.type === 'character' && actor.system?.momentumTrigger === true;
  }

  /** The Momentum effect currently on the actor, if any. */
  static momentumEffect(actor) {
    return actor?.effects?.find(e => e.flags?.vagabond?.momentum) ?? null;
  }

  /**
   * Auto trigger: the actor passed a Save against an attack, or an attack's damage was reduced to 0.
   * @param {Actor} actor
   */
  static onDefended(actor) {
    if (!this.isAuto(actor)) return;
    return this.grantMomentum(actor);
  }

  /**
   * Give the actor the Favored next attack and say so in chat. No-op if they already have it.
   * @param {Actor} actor
   * @param {{manual?: boolean}} [opts] - manual = from the button (warns when blocked)
   * @returns {Promise<boolean>} whether a new Momentum was created
   */
  static async grantMomentum(actor, { manual = false } = {}) {
    if (!actor) return false;
    if (!actor.isOwner && !game.user.isGM) {
      if (manual) ui.notifications.warn(game.i18n.localize('VAGABOND.Momentum.NotYours'));
      return false;
    }
    const existing = this.momentumEffect(actor);
    if (existing?.active) {
      if (manual) ui.notifications.warn(game.i18n.format('VAGABOND.Momentum.Already', { name: actor.name }));
      return false;
    }
    // An expired (suppressed) Momentum is stale: clear it so it can't block a new one
    if (existing && actor.effects.get(existing.id)) await existing.delete();

    const title = game.i18n.localize('VAGABOND.Momentum.Title');
    const data = {
      name: title,
      img: 'icons/svg/upgrade.svg',
      description: `<p>${game.i18n.localize('VAGABOND.Momentum.EffectText')}</p>`,
      origin: actor.uuid,
      system: { changes: [{ key: 'system.favorChecks', type: 'add', value: 'attack' }] },
      // v14 tokens only draw non-temporary effects set to ALWAYS (a manual create must set it)
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      flags: { vagabond: { momentum: true, consumeOn: ['attack'] } },
    };

    // In a tracked Combat it ends with the Fighter's own Turn. Core anchors `turnEnd` to the
    // combatant whose turn it was when the effect was created (usually the Enemy), so point it
    // at the Fighter's combatant explicitly.
    const combat = game.combats?.active;
    const own = combatRollData(actor).active ? combat.combatants.find(c => c.actor === actor) : null;
    if (own) {
      data.duration = { expiry: 'turnEnd' };
      data.start = { ...CONFIG.ActiveEffect.documentClass.getEffectStart(combat), combatant: own.id };
    }

    try {
      await actor.createEmbeddedDocuments('ActiveEffect', [data]);
    } catch (err) {
      console.error(`vagabond | Momentum: could not give ${actor.name} Momentum`, err);
      ui.notifications.error(game.i18n.format('VAGABOND.Momentum.Failed', { name: actor.name }));
      return false;
    }

    const { VagabondChatCard } = await import('./chat-card.mjs');
    const text = classFeatureText(actor, { command: 'fighter.momentum', name: 'Momentum' });
    await VagabondChatCard.featureCard(actor, {
      title,
      description: `<p>${game.i18n.format('VAGABOND.Momentum.Gained', { name: actor.name })}</p>${text}`,
    });
    return true;
  }

  /** End Momentum early (glowing button): it is spent / dropped without an attack. @param {Actor} actor */
  static async endMomentum(actor, reason) {
    const eff = this.momentumEffect(actor);
    if (!eff) return;
    if (!actor.isOwner && !game.user.isGM) {
      ui.notifications.warn(game.i18n.localize('VAGABOND.Momentum.NotYours'));
      return;
    }
    if (actor.effects.get(eff.id)) await eff.delete();
    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.featureCard(actor, {
      title: game.i18n.localize('VAGABOND.Momentum.Title'),
      description: `<p>${game.i18n.format('VAGABOND.Momentum.Ended', { name: actor.name })}${reason ? ` ${RollExpiry.reasonText(reason)}` : ''}</p>`,
    });
  }

  /** Feature button (`system:fighter.momentum`). @param {{actor: Actor}} scope */
  static async momentum({ actor }) {
    return this.grantMomentum(actor, { manual: true });
  }

  /**
   * Register the hooks. Synchronous, called once at module load.
   * `vagabond.postDamageApply` fires from every damage-application path (save, Apply Direct, the
   * deferred Apply button) with the amount that actually landed — 0 means the hit was fully
   * reduced (Armor, Immune, Shield…), which is the second Momentum trigger.
   */
  static registerHooks() {
    Hooks.on('vagabond.postDamageApply', (ctx) => {
      if (ctx?.amount === 0) this.onDefended(ctx.actor);
    });
    // Roll rule: an attack spends Momentum (consumeOn); a skill / stat / cast roll instead ends it
    RollExpiry.register('momentum', {
      applies: (actor) => this.isAuto(actor) && !!this.momentumEffect(actor)?.active,
      decide: (ctx, kind) => (kind === 'check' || kind === 'cast') ? 'end' : undefined,
      end: (actor, reason) => this.endMomentum(actor, reason),
    });
  }
}
