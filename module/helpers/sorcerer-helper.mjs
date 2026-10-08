import { classFeatureText } from './feature-text.mjs';
import { combatRollData } from './rule-rolldata.mjs';
import { VagabondRollBuilder } from './roll-builder.mjs';
import { CountdownDice } from '../documents/countdown-dice.mjs';

/**
 * Sorcerer — Twinned Spell (optional automation) and Overpowered (feature button).
 *
 * Twinned Spell: "If you Cast the same Spell twice on a turn, the second Cast Check is Favored."
 *   - `system.twinnedSpellTrigger`  the "Twinned Spell: Auto" effect (switchable; cleared by the world Class
 *     Automation mode, and Combat-only because it counts Turns). Without it nothing happens by itself — hold
 *     Shift on the Cast for Favor by hand.
 *   - Casts of the Turn are remembered on the actor (`flags.vagabond.twinnedSpells = { turn, spells: { id: n } }`,
 *     turn = Combat id : Round : Turn). A Cast Check of a Spell already cast once this Turn gets a Favor vote
 *     (`vagabond.preD20Roll`), exactly the second Cast. Casts with no Check (willing Targets, Glyph, Imbue) count too.
 *
 * Overpowered: the button gains the 1 Fatigue and starts the Cd4! countdown (an Exploding countdown die, see `exploding` in CountdownDice.create). What the
 * die does each Turn (regain HP and Max HP, Cast Max bonus) and the deferred death are text: roll the die from the
 * overlay at the start of your Turn and apply the result by hand.
 *
 * Imported by vagabond.mjs only.
 */
export class SorcererHelper {
  /** Casts already seen for this roll: `${actorId}:${spellId}` → timestamp (a rolled Cast fires two signals). */
  static #seen = new Map();
  /** Casts whose Check got the Twinned Spell Favor: `${actorId}:${spellId}` (tags the roll card). */
  static #favored = new Set();

  static #L(ns, key, data = {}) {
    return game.i18n.format(`VAGABOND.${ns}.${key}`, data);
  }

  /** A stable id for "this Turn" of the started Combat the actor is in; null with no Combat. */
  static #turnKey(actor) {
    const combat = game.combats?.active;
    if (!combat?.started || combatRollData(actor).active !== 1) return null;
    return `${combat.id}:${combat.round}:${combat.turn}`;
  }

  /** Does this actor have the auto-Twinned Spell effect on? */
  static isTwinned(actor) {
    return actor?.type === 'character' && actor.system?.twinnedSpellTrigger === true;
  }

  /** How many times the actor already cast this Spell on the current Turn. */
  static #castsThisTurn(actor, spellId) {
    const key = this.#turnKey(actor);
    const rec = actor.getFlag('vagabond', 'twinnedSpells');
    if (!key || rec?.turn !== key) return 0;
    return Number(rec.spells?.[spellId]) || 0;
  }

  /** `vagabond.preD20Roll`: the second Cast Check of the same Spell on a Turn is Favored. */
  static #onPreRoll(ctx) {
    const actor = ctx?.actor;
    if (ctx?.rollType !== 'spell' || !ctx.item || !this.isTwinned(actor)) return;
    if (this.#castsThisTurn(actor, ctx.item.id) !== 1) return;
    ctx.favorHinder = VagabondRollBuilder.mergeFavorHinder(ctx.favorHinder, 'favor');
    this.#favored.add(`${actor.id}:${ctx.item.id}`);
  }

  /** `vagabond.postD20Roll` (spell): tag the card, remember the Cast. */
  static #onPostRoll(ctx) {
    const actor = ctx?.actor;
    if (ctx?.rollType !== 'spell' || !ctx.item || !actor) return;
    if (this.#favored.delete(`${actor.id}:${ctx.item.id}`)) {
      ctx.extraTags?.push({ label: this.#L('Sorcerer', 'TwinnedTag'), cssClass: 'tag-range' });
    }
    this.#record(actor, ctx.item.id);
  }

  /** Remember one more Cast of `spellId` on this Turn (owner's client only; a rolled Cast signals twice). */
  static #record(actor, spellId) {
    if (!this.isTwinned(actor) || !actor.isOwner) return;
    const key = this.#turnKey(actor);
    if (!key) return;
    const seenKey = `${actor.id}:${spellId}`;
    const now = Date.now();
    if (now - (this.#seen.get(seenKey) ?? 0) < 1500) return;
    this.#seen.set(seenKey, now);

    const rec = actor.getFlag('vagabond', 'twinnedSpells');
    const spells = rec?.turn === key ? { ...rec.spells } : {};
    spells[spellId] = (Number(spells[spellId]) || 0) + 1;
    actor.setFlag('vagabond', 'twinnedSpells', { turn: key, spells })
      .catch(err => console.warn('vagabond | Twinned Spell: could not record the Cast', err));
  }

  /* -------------------------------------------- */
  /*  Overpowered                                 */
  /* -------------------------------------------- */

  /** The Overpowered countdown die of this actor, if one is running. */
  static overpoweredDie(actor) {
    return CountdownDice.getAll().find(j => {
      const f = j.flags?.vagabond?.countdownDice;
      return f?.linkedFeature === 'overpowered' && f.linkedActorUuid === actor.uuid;
    }) ?? null;
  }

  /**
   * Overpowered feature button (`system:sorcerer.overpowered`): gain 1 Fatigue and start the Cd4 countdown.
   * @param {{actor: Actor}} scope
   */
  static async overpowered({ actor }) {
    if (actor?.type !== 'character' || !actor.isOwner) {
      ui.notifications.warn(this.#L('Sorcerer', 'NotYours'));
      return;
    }
    if (this.overpoweredDie(actor)) {
      ui.notifications.warn(this.#L('Sorcerer', 'OverpoweredOn', { name: actor.name }));
      return;
    }
    const fatigue = actor.system.fatigue ?? 0;
    const max = actor.system.fatigueMax ?? 5;
    if (fatigue >= max) {
      ui.notifications.warn(this.#L('Sorcerer', 'OverpoweredMaxFatigue', { name: actor.name }));
      return;
    }

    await actor.update({ 'system.fatigue': fatigue + 1 });
    await CountdownDice.create({
      name: this.#L('Sorcerer', 'OverpoweredDie', { name: actor.name }),
      diceType: 'd4',
      exploding: true, // Cd4!
      size: 'M',
      linkedActorUuid: actor.uuid,
      linkedFeature: 'overpowered',
      ownership: Object.fromEntries([['default', 0], ...game.users.filter(u => actor.testUserPermission(u, 'OWNER')).map(u => [u.id, 3])]),
    });

    const { VagabondChatCard } = await import('./chat-card.mjs');
    const text = classFeatureText(actor, { command: 'sorcerer.overpowered', name: 'Overpowered' });
    await VagabondChatCard.featureCard(actor, {
      title: game.i18n.localize('VAGABOND.Sorcerer.OverpoweredTitle'),
      description: `<p>${this.#L('Sorcerer', 'OverpoweredStarted', { name: actor.name, fatigue: fatigue + 1 })}</p>${text}`,
    });
  }

  /** Register the hooks. Synchronous, called once at module load. */
  static registerHooks() {
    Hooks.on('vagabond.preD20Roll', (ctx) => this.#onPreRoll(ctx));
    Hooks.on('vagabond.postD20Roll', (ctx) => this.#onPostRoll(ctx));
    // Casts with no Check (willing Targets, Glyph, Imbue, Alt+Click) still count as a Cast
    Hooks.on('vagabond.actorActed', (actor, { source, itemId } = {}) => {
      if (source === 'cast' && itemId) this.#record(actor, itemId);
    });
  }
}
