/**
 * Auto-applies the Flying status (Foundry's FLY special status — see the remap in
 * vagabond.mjs init) to NPCs with a Fly speed type that either can only fly (base
 * Speed 0) or are flagged `system.flyingByDefault` (birds, insects…). Other fliers stay
 * manual — they may be grounded.
 *
 * Reads the *source* speed so status effects that zero Speed (Prone, Restrained…)
 * never make a grounded walker look like a flyer.
 *
 * Removal is symmetric but only for statuses this helper applied
 * (`flags.vagabond.autoFlying`), so a manually set Flying is never taken away.
 */
export class NpcFlying {
  /** @param {Actor} actor */
  static shouldFly(actor) {
    const src = actor?._source?.system;
    return actor?.type === 'npc'
      && (src?.speedTypes ?? []).includes('fly')
      && ((src?.speed ?? 0) === 0 || !!src?.flyingByDefault);
  }

  /**
   * Make the actor's Flying status match the rule. Call from one GM client only.
   * @param {Actor} actor
   */
  static async sync(actor) {
    if (actor?.type !== 'npc') return;
    const statusId = CONFIG.specialStatusEffects.FLY;
    if (!CONFIG.statusEffects.some((e) => e.id === statusId)) return;

    const want = this.shouldFly(actor);
    const has = actor.statuses.has(statusId);
    const auto = actor.getFlag('vagabond', 'autoFlying');

    if (want && !has) {
      await actor.toggleStatusEffect(statusId, { active: true });
      await actor.setFlag('vagabond', 'autoFlying', true);
    } else if (!want && has && auto) {
      await actor.toggleStatusEffect(statusId, { active: false });
      await actor.unsetFlag('vagabond', 'autoFlying');
    }
  }

  /** One-time sweep: world NPCs plus the NPC tokens on the current scene. */
  static sweep() {
    for (const actor of game.actors) this.sync(actor);
    for (const token of canvas.scene?.tokens ?? []) {
      if (!token.actorLink && token.actor) this.sync(token.actor);
    }
  }
}
