import { StatusHelper } from './status-helper.mjs';
import { combatRollData } from './rule-rolldata.mjs';

const BERSERK = 'berserk';

/**
 * Barbarian Rage auto-Berserk — OPTIONAL automation, never required.
 *
 * Everything here is inert unless the actor has `system.rageTrigger` (set by the class's
 * "Rage: Auto-Berserk" Active Effect). Switch that effect off and Berserk is played fully by
 * hand with the normal status toggle. Nothing here needs a Combat: with no combat the turn-end
 * check simply never runs (the 1-minute duration + manual removal still work).
 *
 * RAW: you can go Berserk when you take damage or attack an Enemy. You stay Berserk for
 * 1 minute, or until you end your Turn without attacking an Enemy or taking damage since your
 * last Turn. Only a Berserk status THIS helper applied (`flags.vagabond.rageAuto`) is ever
 * auto-expired — a Berserk applied by hand / a potion is left alone.
 */
export class RageHelper {

  /** Does this actor have the auto-Berserk automation on? */
  static isAuto(actor) {
    return actor?.type === 'character' && actor.system?.rageTrigger === true;
  }

  /** The Berserk effect this helper applied, if any. */
  static autoEffect(actor) {
    return actor?.effects?.find(e => e.statuses?.has(BERSERK) && e.flags?.vagabond?.rageAuto) ?? null;
  }

  /**
   * Called when the actor attacks (before the attack roll, so the bonuses apply to it) or
   * takes damage. Goes Berserk if not already, and records the activity for the turn-end check.
   * @param {Actor} actor
   */
  static async onActivity(actor) {
    if (!this.isAuto(actor)) return;
    if (!actor.isOwner && !game.user.isGM) return;

    if (!actor.statuses?.has(BERSERK)) await this.#applyBerserk(actor);

    // Activity only matters for the turn-end check, which only runs inside a started combat
    if (this.autoEffect(actor) && combatRollData(actor).active
      && actor.getFlag('vagabond', 'rageActed') !== true) {
      await actor.update({ 'flags.vagabond.rageActed': true }, { render: false });
    }
  }

  /**
   * End of a combatant's Turn (core `combatTurnChange`, active GM only): Rage-applied Berserk
   * drops if the Barbarian neither attacked nor took damage since their last Turn.
   * @param {Combat} combat
   * @param {{combatantId: string}} previous
   */
  static async onTurnEnd(combat, previous) {
    if (!game.user.isActiveGM) return;
    const actor = combat.combatants.get(previous?.combatantId)?.actor;
    if (!this.isAuto(actor)) return;
    if (!this.autoEffect(actor)) return;

    if (actor.getFlag('vagabond', 'rageActed') === true) {
      await actor.update({ 'flags.vagabond.rageActed': false }, { render: false });
    } else {
      await StatusHelper.removeStatus(actor, BERSERK);
      ui.notifications.info(game.i18n.format('VAGABOND.Rage.Ended', { name: actor.name }));
    }
  }

  /** Create the Berserk status with Rage's 1-minute duration (10 Rounds inside a combat). */
  static async #applyBerserk(actor) {
    // A stale (expired, therefore suppressed) Berserk would make toggleStatusEffect a no-op
    const stale = actor.effects.filter(e => e.statuses?.has(BERSERK)).map(e => e.id);
    if (stale.length) await actor.deleteEmbeddedDocuments('ActiveEffect', stale);

    const def = CONFIG.statusEffects.find(e => e.id === BERSERK);
    const inCombat = combatRollData(actor).active;
    await actor.createEmbeddedDocuments('ActiveEffect', [{
      name: game.i18n.localize(def?.name ?? 'VAGABOND.StatusConditions.Berserk'),
      img: def?.img ?? 'icons/magic/perception/eye-ringed-glow-angry-large-red.webp',
      statuses: [BERSERK],
      // v14 tokens only draw non-temporary effects set to ALWAYS (a manual create must set it)
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      system: { changes: def?.changes ?? [] },
      duration: inCombat ? { value: 10, units: 'rounds' } : { value: 60, units: 'seconds' },
      flags: { vagabond: { rageAuto: true } }
    }]);
  }

  /**
   * One-time migration: Barbarian class items created before the book revision carry the old
   * single "Rage feature" effect and old level features. Replaces them with the compendium's
   * current set (one switchable effect per automated behavior), keeping the player's on/off
   * choice for Rage. Items without the old "Rage feature" signature (homebrew edits, already
   * migrated) are left alone. Active GM only; guarded by `barbarianClassMigrated`. If the
   * compendium hasn't been rebuilt yet (no "Rage: Auto-Berserk" effect) it aborts WITHOUT
   * setting the guard, so it retries on the next load.
   */
  static async migrateBarbarianClass() {
    if (game.user !== game.users.activeGM) return;
    if (game.settings.get('vagabond', 'barbarianClassMigrated')) return;

    const source = await game.packs.get('vagabond.classes')?.getDocument('qONUTXY8GwqSEoDw');
    if (!source?.effects.some(e => e.name === 'Rage: Auto-Berserk')) return;

    const safeItems = (doc) => { try { return Array.from(doc?.items ?? []); } catch { return []; } };
    const candidates = [
      ...game.items,
      ...game.actors.contents.flatMap(safeItems),
      ...game.scenes.contents.flatMap((s) => s.tokens.contents.filter((t) => !t.actorLink && t.actor)
        .flatMap((t) => safeItems(t.actor))),
    ];

    for (const item of candidates) {
      try {
        if (item.type !== 'class' || item.name !== 'Barbarian') continue;
        const old = item.effects.filter(e => e.name === 'Rage feature');
        if (!old.length) continue;
        const rageWasOff = old.some(e => e.disabled);

        const effects = source.effects.map(e => {
          const data = e.toObject();
          delete data._id;
          delete data._stats;
          if (data.name === 'Rage' && rageWasOff) data.disabled = true;
          return data;
        });
        const s = source.system.toObject();
        await item.update({
          'system.description': s.description,
          'system.levelFeatures': s.levelFeatures,
          'system.skillGrant': s.skillGrant,
        });
        await item.deleteEmbeddedDocuments('ActiveEffect', item.effects.map(e => e.id));
        await item.createEmbeddedDocuments('ActiveEffect', effects);
      } catch (err) {
        console.warn(`vagabond | migrateBarbarianClass: skipped ${item?.uuid ?? '(unknown)'}`, err);
      }
    }

    await game.settings.set('vagabond', 'barbarianClassMigrated', true);
  }

  /**
   * Register the hooks. Synchronous, called once at module load.
   * - preUpdateActor stashes the HP before the write so updateActor can tell damage from healing
   *   (options travel with the update to every client).
   * - updateActor: active GM only (one writer in multi-GM sessions).
   */
  static registerHooks() {
    Hooks.on('preUpdateActor', (actor, changes, options) => {
      if (foundry.utils.hasProperty(changes, 'system.health.value')) {
        options.vagabondHpBefore = actor.system.health?.value;
      }
    });

    Hooks.on('updateActor', (actor, changes, options) => {
      if (!game.user.isActiveGM || !this.isAuto(actor)) return;
      if (!foundry.utils.hasProperty(changes, 'system.health.value')) return;
      const before = options?.vagabondHpBefore;
      const now = actor.system.health?.value ?? 0;
      if (before === undefined || now >= before || now <= 0) return; // not damage, or knocked out
      this.onActivity(actor);
    });

    Hooks.on('combatTurnChange', (combat, previous) => this.onTurnEnd(combat, previous));
  }
}
