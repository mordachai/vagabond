/**
 * Feature rules: the damage pipeline, damage-helper, chat-card and status-helper ask class and Spell
 * features through these points instead of importing them (a feature imports the core, never the
 * reverse). Dependency-free. A feature registers in its `registerHooks()`:
 *   FeatureRules.on('weakTo', (attacker, target) => HunterHelper.isMarkWeak(attacker, target));
 *
 * Points (who answers):
 *   npcDamageBonus(actor)                          sum   flat bonus on an NPC action's damage (Druid Beast form)
 *   weakTo(attacker, target)                       any   the target is Weak to this attacker (Hunter Mark, Witch Hex)
 *   ignoresImmune(attacker, damageType)            any   the attacker ignores the target's Immune (Druid Beast Mode)
 *   damageBonusVs(attacker, target, source)        sum   flat damage before Armor (Witch Widdershins)
 *   damageReduction(damageMessageId, defenderUuid) list  {amount, title} taken off before Armor (Ward upcast)
 *   damageCardRows(targets, amount, damageType)    list  HTML rows under a damage card's Save buttons (Ward)
 *   checkRolled(actor, roll, kind)                 run   after a Save rolled from a chat button (Bard Overtuned)
 *   defended(actor)                                run   passed a Save / Defense Check vs an attack (Fighter Momentum)
 *   npcActionCheck(actor, target, attackType)      first {check?, tag?} for an NPC action (Raise command Check)
 *   weaponHitSection(weapon, attackResult, targets) first card section HTML after a weapon attack (Imbue)
 */
const points = new Map();

const handlers = (point) => points.get(point) ?? [];

export const FeatureRules = {
  /** Answer `point` with `fn`. */
  on(point, fn) {
    if (!points.has(point)) points.set(point, []);
    points.get(point).push(fn);
  },

  /** Does any answer say yes? */
  any(point, ...args) {
    return handlers(point).some(fn => fn(...args));
  },

  /** Sum of the numeric answers. */
  sum(point, ...args) {
    return handlers(point).reduce((n, fn) => n + (Number(fn(...args)) || 0), 0);
  },

  /** Every non-empty answer, in registration order. */
  list(point, ...args) {
    return handlers(point).map(fn => fn(...args)).filter(r => r !== null && r !== undefined && r !== '');
  },

  /** Await every answer in order. */
  async run(point, ...args) {
    for (const fn of handlers(point)) await fn(...args);
  },

  /** The first non-null answer, each awaited in order (later ones do not run). */
  async first(point, ...args) {
    for (const fn of handlers(point)) {
      const r = await fn(...args);
      if (r !== null && r !== undefined) return r;
    }
    return null;
  },
};
