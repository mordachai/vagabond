/**
 * Effects that are spent by being used.
 *
 * An Active Effect with `flags.vagabond.consumeOn = ['attack' | 'cast' | 'save' | 'heal', …]`
 * is deleted from its actor right after the actor makes a roll of one of those kinds while the
 * effect is active (e.g. the Bard's Virtuoso benefits). Remove the flag and the effect simply
 * lasts until it expires / is switched off.
 *
 * Call sites run after the roll has been built, so the effect has already done its job.
 */

/**
 * @param {Actor} actor - the roller
 * @param {'attack'|'cast'|'save'|'heal'} kind
 */
export async function consumeUsedEffects(actor, kind) {
  if (!actor?.effects) return;
  if (!actor.isOwner && !game.user.isGM) return;
  const ids = actor.effects
    .filter(e => e.active && e.flags?.vagabond?.consumeOn?.includes(kind))
    .map(e => e.id)
    .filter(id => actor.effects.get(id));
  if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
}
