import { isCopyOf } from './source-id.mjs';
import { StatusHelper } from './status-helper.mjs';
import { combatRollData } from './rule-rolldata.mjs';
import { RollExpiry } from './roll-expiry.mjs';

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
   * End Rage's Berserk (roll rule). Only a Berserk this helper applied.
   * @param {Actor} actor
   */
  static async endBerserk(actor) {
    if (!this.autoEffect(actor)) return;
    await StatusHelper.removeStatus(actor, BERSERK);
    const { VagabondChatCard } = await import('./chat-card.mjs');
    await VagabondChatCard.featureCard(actor, {
      title: game.i18n.localize('VAGABOND.StatusConditions.Berserk'),
      description: `<p>${game.i18n.format('VAGABOND.Rage.EndedRoll', { name: actor.name })}</p>`,
    });
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
        if (item.type !== 'class' || !isCopyOf(item, 'qONUTXY8GwqSEoDw', 'Barbarian')) continue;
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
   * Idempotent sweep: Barbarian class items migrated before the "switchable" flag existed have
   * their hand-switch helper effects (auto/manual twins) filed as plain class features, which
   * have no switch. Flags those three by name. Active GM only; touches only unflagged ones.
   */
  static async flagSwitchableEffects() {
    if (game.user !== game.users.activeGM) return;
    const names = new Set(['Rage: Auto-Berserk', 'Aggressor: First Round (auto)', 'Aggressor: First Round (manual)']);
    const safeItems = (doc) => { try { return Array.from(doc?.items ?? []); } catch { return []; } };
    const candidates = [
      ...game.items,
      ...game.actors.contents.flatMap(safeItems),
      ...game.scenes.contents.flatMap((sc) => sc.tokens.contents.filter((t) => !t.actorLink && t.actor)
        .flatMap((t) => safeItems(t.actor))),
    ];
    for (const item of candidates) {
      if (item.type !== 'class' || !isCopyOf(item, 'qONUTXY8GwqSEoDw', 'Barbarian')) continue;
      const updates = item.effects
        .filter((e) => names.has(e.name) && !e.flags?.vagabond?.switchable)
        .map((e) => ({ _id: e.id, 'flags.vagabond.switchable': true }));
      if (!updates.length) continue;
      try { await item.updateEmbeddedDocuments('ActiveEffect', updates); }
      catch (err) { console.warn(`vagabond | flagSwitchableEffects: skipped ${item.uuid}`, err); }
    }
  }

  /**
   * Idempotent sweep: Barbarian class items migrated before `system.aggressorAuto` existed have
   * the old Aggressor First Round twins: both on doubled Speed permanently, and the world automation mode could not reach them.
   * Copies the two twins' changes + description from the compendium (once it is rebuilt) onto
   * items whose manual twin lacks the marker. The player's on/off choice is left alone.
   */
  static async syncAggressorTwins() {
    if (game.user !== game.users.activeGM) return;
    const source = await game.packs.get('vagabond.classes')?.getDocument('qONUTXY8GwqSEoDw');
    const names = ['Aggressor: First Round (auto)', 'Aggressor: First Round (manual)'];
    const fresh = names.map(n => source?.effects.find(e => e.name === n));
    if (fresh.some(e => !e) || !fresh.every(e => e.system.changes.some(c => /@aggressorAuto/.test(String(c.value))))) return;

    const safeItems = (doc) => { try { return Array.from(doc?.items ?? []); } catch { return []; } };
    const candidates = [
      ...game.items,
      ...game.actors.contents.flatMap(safeItems),
      ...game.scenes.contents.flatMap((sc) => sc.tokens.contents.filter((t) => !t.actorLink && t.actor)
        .flatMap((t) => safeItems(t.actor))),
    ];
    for (const item of candidates) {
      if (item.type !== 'class' || !isCopyOf(item, 'qONUTXY8GwqSEoDw', 'Barbarian')) continue;
      const auto = item.effects.find(e => e.name === names[0]);
      if (!auto || auto.system.changes.some(c => /@aggressorAuto/.test(String(c.value)))) continue;
      const updates = [];
      for (const src of fresh) {
        const eff = item.effects.find(e => e.name === src.name);
        if (eff) updates.push({ _id: eff.id, 'system.changes': src.toObject().system.changes, description: src.description });
      }
      try { await item.updateEmbeddedDocuments('ActiveEffect', updates); }
      catch (err) { console.warn(`vagabond | syncAggressorTwins: skipped ${item.uuid}`, err); }
    }
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
      // HP above the maximum was never real HP (a new character starts at 10 until the builder
      // sets it to the max): lowering it to the max is not damage
      if (before > (actor.system.health?.max ?? Infinity)) return;
      this.onActivity(actor);
    });

    Hooks.on('combatTurnChange', (combat, previous) => this.onTurnEnd(combat, previous));

    // Roll rule, only where no started Combat counts Turns: Berserk lasts while you attack or
    // roll Saves (damage means Saves); a skill / stat / cast roll means you stopped fighting.
    RollExpiry.register('rage', {
      applies: (actor) => this.isAuto(actor) && !!this.autoEffect(actor) && !combatRollData(actor).active,
      decide: (ctx, kind) => (kind === 'check' || kind === 'cast') ? 'end' : undefined,
      end: (actor) => this.endBerserk(actor),
    });
  }
}
