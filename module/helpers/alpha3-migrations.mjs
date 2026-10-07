/**
 * One-time world migrations for the Core Rulebook v3 Alpha 3 review (ALPHA3_REVIEW.md §6, Phase 1).
 *
 * Same recipe as class-migrations.mjs: active GM only, guarded by a hidden world setting
 * (registered in vagabond.mjs), every document wrapped in try/catch so one bad actor never
 * blocks the rest, guard set only after the full pass.
 */

const safeEffects = (doc) => { try { return Array.from(doc?.effects ?? []); } catch { return []; } };

/** Every actor in the world: sidebar actors + unlinked token actors on every scene. */
function worldActors() {
  return [
    ...game.actors.contents,
    ...game.scenes.contents.flatMap((s) => s.tokens.contents.filter((t) => !t.actorLink && t.actor).map((t) => t.actor)),
  ];
}

/** Statuses whose rules changed in Alpha 3 (Frightened / Sickened per die, Prone, Incapacitated family). */
const ALPHA3_STATUSES = ['frightened', 'sickened', 'prone', 'incapacitated', 'paralyzed', 'unconscious'];

/**
 * Status effects already on actors are copies made when the status was toggled — they keep the
 * old changes until removed. Rewrite their `system.changes` from the current
 * `CONFIG.VAGABOND.statusEffectDefinitions` entry.
 */
export async function migrateAlpha3Statuses() {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', 'alpha3StatusesMigrated')) return;

  const defs = new Map((CONFIG.VAGABOND.statusEffectDefinitions ?? [])
    .filter((d) => ALPHA3_STATUSES.includes(d.id))
    .map((d) => [d.id, d]));

  for (const actor of worldActors()) {
    const updates = [];
    for (const effect of safeEffects(actor)) {
      try {
        // Status toggles only: exactly one status, and not an item-transferred effect
        if (effect.statuses?.size !== 1 || effect.parent !== actor) continue;
        const def = defs.get([...effect.statuses][0]);
        if (!def) continue;
        updates.push({
          _id: effect.id,
          'system.changes': (def.changes ?? []).map((c) => ({
            key: c.key, type: c.type, value: c.value, phase: 'initial', priority: null,
          })),
        });
      } catch (err) {
        console.warn(`vagabond | migrate Alpha 3 statuses: skipped ${effect?.uuid ?? '(unknown)'}`, err);
      }
    }
    if (!updates.length) continue;
    try {
      await actor.updateEmbeddedDocuments('ActiveEffect', updates);
    } catch (err) {
      console.warn(`vagabond | migrate Alpha 3 statuses: skipped ${actor?.uuid ?? '(unknown)'}`, err);
    }
  }

  await game.settings.set('vagabond', 'alpha3StatusesMigrated', true);
}
