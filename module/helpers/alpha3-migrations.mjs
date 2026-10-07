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

const safeItems = (doc) => { try { return Array.from(doc?.items ?? []); } catch { return []; } };

/** Every item in the world: sidebar items, actor items, unlinked token actor items. */
function worldItems() {
  return [...game.items.contents, ...worldActors().flatMap(safeItems)];
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

const BACKPACK_DESC = '<p>1 Slot while held. Worn, it occupies no Slot and adds +3 Slots to your Inventory. You can only benefit from one at a time.</p>';

/**
 * Backpack (p. 83): "1 (held); +3 (worn)". Old copies were 0 Slots with an always-on +2 Inventory
 * effect. Old signature: gear named Backpack whose "Bonus Inventory" effect adds 2 (edited copies are
 * left alone). New: 1 Slot carried, no Slot + when-equipped +3 worn. The first one on each actor is
 * put on (worn) so the character keeps the capacity it had.
 */
export async function migrateAlpha3Backpacks() {
  if (game.user !== game.users.activeGM) return;
  if (game.settings.get('vagabond', 'alpha3BackpackMigrated')) return;

  const wornOn = new Set();
  for (const item of worldItems()) {
    try {
      if (item.type !== 'equipment' || item.system.equipmentType !== 'gear' || item.name !== 'Backpack') continue;
      const effect = item.effects.find(e => e.name === 'Bonus Inventory'
        && e.system.changes?.some(c => c.key === 'system.inventory.bonusSlots' && Number(c.value) === 2));
      if (!effect) continue;

      const actor = item.parent;
      const putOn = actor && !wornOn.has(actor.uuid) && item.system.equipmentState === 'unequipped';
      if (actor && (putOn || item.system.equipmentState !== 'unequipped')) wornOn.add(actor.uuid);

      await item.update({
        'system.baseSlots': 1,
        'system.noSlotsWhenWorn': true,
        'system.handsRequired': 0,
        'system.description': BACKPACK_DESC,
        ...(putOn ? { 'system.equipmentState': 'worn', 'flags.vagabond.equippedAt': Date.now() } : {}),
      });
      await effect.update({
        'system.changes': effect.system.changes.map(c => (c.key === 'system.inventory.bonusSlots' ? { ...c, value: 3 } : c)),
        'flags.vagabond.applicationMode': 'when-equipped',
        description: '<p>Backpack: +3 Inventory Slots while worn.</p>',
      });
    } catch (err) {
      console.warn(`vagabond | migrate Alpha 3 Backpack: skipped ${item?.uuid ?? '(unknown)'}`, err);
    }
  }

  await game.settings.set('vagabond', 'alpha3BackpackMigrated', true);
}
