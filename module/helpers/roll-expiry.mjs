/**
 * Roll expiry — "what does your next roll do to this effect?", decided per feature.
 *
 * Features that say they are lost on a failure or "at the end of your Turn" cannot rely on a
 * Combat tracker (a table may not run one, or never pass Turns). So every d20 roll the actor
 * makes (`vagabond.postD20Roll`, fired on the roller's own client) is shown to each registered
 * rule, which answers `'end'` (the effect ends, AFTER this roll has used it), `'keep'` or
 * nothing. Rules only run while their automation is on (`applies` checks the helper's `isAuto`,
 * so the world Class Automation mode gates them like everything else).
 *
 * Roll kinds (`RollExpiry.kind(ctx)`):
 *   attack  a weapon attack            cast   a spell cast check
 *   save    a Save                     check  any other check (skill / stat)
 * Damage and Luck rolls never reach the hook. Saves are not rolled voluntarily, so rules
 * normally ignore them.
 *
 * To add a feature: `RollExpiry.register('name', { applies(actor), decide(ctx, kind), end(actor, reason) })`
 * from its helper's `registerHooks()`. `end` should post the outcome card and must work for the
 * roller (owner) with no Combat.
 */

/** @type {Map<string, {applies: (actor: Actor) => boolean, decide: (ctx: object, kind: string) => ('end'|'keep'|undefined), end: (actor: Actor, reason: string) => *}>} */
const _rules = new Map();

export class RollExpiry {

  /**
   * @param {string} name
   * @param {object} rule
   * @param {(actor: Actor) => boolean} rule.applies  does this rule have an effect to act on right now?
   * @param {(ctx: object, kind: string) => ('end'|'keep'|undefined)} rule.decide
   * @param {(actor: Actor, reason: 'miss'|'other') => *} rule.end
   */
  static register(name, rule) {
    _rules.set(name, rule);
  }

  /** The kind of a `vagabond.postD20Roll` context. */
  static kind(ctx) {
    switch (ctx?.rollType) {
      case 'weapon':
      case 'weaponSkill': return 'attack';
      case 'spell': return 'cast';
      case 'save': return 'save';
      default: return 'check';
    }
  }

  /** Why an attack ended it: a miss, or anything that wasn't what the feature wanted. */
  static reasonFor(ctx, kind) {
    return (kind === 'attack' && ctx?.isSuccess === false) ? 'miss' : 'other';
  }

  /** Localized sentence for a reason (appended to the "ends" cards). */
  static reasonText(reason) {
    return game.i18n.localize(`VAGABOND.RollExpiry.${reason === 'miss' ? 'Miss' : 'Other'}`);
  }

  static #onRoll(ctx) {
    const actor = ctx?.actor;
    if (!actor || (!actor.isOwner && !game.user.isGM)) return;
    const kind = this.kind(ctx);
    for (const [name, rule] of _rules) {
      try {
        if (!rule.applies(actor)) continue;
        if (rule.decide(ctx, kind) !== 'end') continue;
        Promise.resolve(rule.end(actor, this.reasonFor(ctx, kind)))
          .catch(err => console.error(`vagabond | roll expiry (${name}) failed`, err));
      } catch (err) {
        console.error(`vagabond | roll expiry (${name}) failed`, err);
      }
    }
  }

  /** Register the hook. Synchronous, called once at module load. */
  static registerHooks() {
    Hooks.on('vagabond.postD20Roll', (ctx) => this.#onRoll(ctx));
  }
}
