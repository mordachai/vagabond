import { VagabondChatCard } from './chat-card.mjs';
import { StatusHelper } from './status-helper.mjs';
import { NpcRules } from './npc-rules.mjs';
import { isActiveGM } from './gm-relay.mjs';

/**
 * NPC statblock rules that act at the start of a Turn or on the Sunlight status (`NpcRules` holds the pure lookups):
 * Regenerate / Vampiric HP, Sunlight Burning (d8) and the Nightwalker Incapacitated effect.
 */
export class NpcTurnRules {
  static #sunlightTimers = new Map();

  /** Turn-start effects for the combatant that just became active. Active GM only (caller checks). */
  static async onTurnStart(actor) {
    if (actor?.type !== 'npc') return;
    const sy = actor.system;
    const sunlit = NpcRules.isSunlit(actor);

    if (sy.regenPerTurn && !(sy.regenStopsInSunlight && sunlit)) {
      const max = sy.health?.max ?? 0;
      const hp = sy.health?.value ?? 0;
      if (hp > 0 && hp < max) {
        const roll = new Roll(String(sy.regenPerTurn));
        await roll.evaluate();
        const healed = Math.min(max - hp, Math.max(0, roll.total));
        if (healed > 0) {
          await actor.update({ 'system.health.value': hp + healed });
          await VagabondChatCard.applyResult(actor, {
            type: 'heal', finalAmount: healed, previousValue: hp, newValue: hp + healed,
            sourceName: game.i18n.localize('VAGABOND.Actor.NPC.Rules.Regenerate'),
          });
        }
      }
    }

    if (sunlit && sy.sunlightHarm && sy.sunlightHarm !== 'none') {
      const tick = await StatusHelper.dealTickDamage(actor, '1d8', 'fire', 'burning');
      if (tick?.finalDamage > 0) {
        const hp = actor.system.health?.value ?? 0;
        const newHp = Math.max(0, hp - tick.finalDamage);
        await actor.update({ 'system.health.value': newHp });
        await VagabondChatCard.applyResult(actor, {
          type: 'damage', rawAmount: tick.rawDamage, finalAmount: tick.finalDamage, damageType: 'fire',
          previousValue: hp, newValue: newHp,
          sourceName: game.i18n.localize('VAGABOND.Actor.NPC.Rules.SunlightBurn'),
        });
      }
    }
  }

  /** Debounced, active-GM-only entry point for syncSunlight. Safe to call from any hook on every client. */
  static queueSunlightSync(actor) {
    if (actor?.type !== 'npc' || !isActiveGM()) return;
    const key = actor.uuid;
    clearTimeout(this.#sunlightTimers.get(key));
    this.#sunlightTimers.set(key, setTimeout(() => {
      this.#sunlightTimers.delete(key);
      this.syncSunlight(actor).catch((err) => console.warn('Vagabond | Sunlight sync failed:', err));
    }, 150));
  }

  /**
   * Nightwalker: keeps exactly one Incapacitated effect flagged `flags.vagabond.fromSunlight` while the actor
   * has the Sunlight status and `sunlightHarm === 'burnIncapacitated'`. Only ever touches its own flagged effect,
   * so a manual Incapacitated is never removed.
   */
  static async syncSunlight(actor) {
    if (actor?.type !== 'npc') return;
    const want = NpcRules.isSunlit(actor) && actor.system.sunlightHarm === 'burnIncapacitated';
    const own = actor.effects.filter((e) => e.getFlag('vagabond', 'fromSunlight'));
    if (!want) {
      const ids = own.filter((e) => actor.effects.get(e.id)).map((e) => e.id);
      if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
      return;
    }
    if (own.length) return;
    if (StatusHelper.isStatusImmune(actor, 'incapacitated')) return;
    const def = CONFIG.statusEffects.find((e) => e.id === 'incapacitated');
    const label = game.i18n.localize(def?.name ?? 'VAGABOND.StatusConditions.Incapacitated');
    await actor.createEmbeddedDocuments('ActiveEffect', [{
      name: `${label} (${game.i18n.localize('VAGABOND.StatusConditions.Sunlit')})`,
      img: def?.img ?? 'icons/svg/daze.svg',
      statuses: ['incapacitated'],
      showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.ALWAYS,
      system: { changes: def?.changes ?? [] },
      flags: { vagabond: { fromSunlight: true } },
    }]);
  }
}
