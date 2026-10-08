import { relicWeaponBonus } from './weapon-rules.mjs';

/**
 * Statblock rules the book prints as ability text, automated from NPC fields (`actor-npc.mjs`):
 *
 * - `relicImmunityMin`   — "Physical from non-Relics [and Relic Weapons weaker than (+2)]": a Relic weapon
 *                          with a big enough (+N) ignores the physical Immunity. (`relicBypassesImmunity`)
 * - `hpFloor`            — Zombie / Grace: can't be reduced below 1 HP. (`applyHpFloor`, `vagabond.calculateFinalDamage` hook)
 * - `sunlightHarm`       — Nightwalker / Sunlight Hypersensitivity: Burning (d8) at the start of its Turn and
 *                          Incapacitated while it has the Sunlight status. (`onTurnStart`, `queueSunlightSync`)
 * - `regenPerTurn`       — Vampiric / Regenerate: HP regained at the start of its Turn, optionally not in Sunlight.
 *
 * Sunlight is the manual `sunlit` status (token HUD): nothing here guesses lighting. Must not statically import
 * damage-helper / chat-card (cycle) — dynamic `import()` only.
 */
export class NpcRules {
  static #sunlightTimers = new Map();

  /** One-line localized summaries of the active rules (locked sheet view). */
  static describe(actor) {
    const sy = actor?.system ?? {};
    const L = (k, d) => game.i18n.format(`VAGABOND.Actor.NPC.Rules.${k}`, d);
    const out = [];
    if (sy.relicImmunityMin !== null && sy.relicImmunityMin !== undefined) {
      out.push(`${L('RelicImmunity')}: ${sy.relicImmunityMin > 0 ? L('RelicMin', { n: sy.relicImmunityMin }) : L('RelicAny')}`);
    }
    if (sy.hpFloor && sy.hpFloor !== 'none') out.push(`${L('HpFloor')}: ${L(sy.hpFloor === 'zombie' ? 'HpFloorZombie' : 'HpFloorAlways')}`);
    if (sy.sunlightHarm && sy.sunlightHarm !== 'none') {
      out.push(`${L('SunlightHarm')}: ${L(sy.sunlightHarm === 'burn' ? 'SunlightHarmBurn' : 'SunlightHarmBurnIncapacitated')}`);
    }
    if (sy.regenPerTurn) out.push(`${L('RegenPerTurn')}: ${sy.regenPerTurn}${sy.regenStopsInSunlight ? ` (${L('RegenStopsInSunlight')})` : ''}`);
    return out;
  }

  /** Is the actor standing in Sunlight (the `sunlit` status)? */
  static isSunlit(actor) {
    return !!actor?.statuses?.has('sunlit');
  }

  /**
   * Does `weapon` ignore this actor's physical Immunity because it is a strong enough Relic?
   * @param {Actor} actor - the defender
   * @param {string} damageType - normalized (lowercase) incoming type
   * @param {Item|null} weapon
   */
  static relicBypassesImmunity(actor, damageType, weapon) {
    const min = actor?.system?.relicImmunityMin;
    if (min === null || min === undefined) return false;
    if (!CONFIG.VAGABOND.nonRelicImmuneTypes?.includes(damageType)) return false;
    const bonus = relicWeaponBonus(weapon);
    return bonus !== null && bonus >= min;
  }

  /**
   * `vagabond.calculateFinalDamage` listener: cap the damage so the defender stays at 1 HP.
   * 'zombie' lets a Crit, damage it is Weak to, or Sunlight through; 'always' never does.
   */
  static applyHpFloor({ actor, result, isCrit }) {
    const floor = actor?.system?.hpFloor;
    if (actor?.type !== 'npc' || !floor || floor === 'none' || !(result?.final > 0)) return;
    if (floor === 'zombie' && (isCrit || result.path === 'weak' || result.path === 'material' || this.isSunlit(actor))) return;
    const allowed = Math.max(0, (actor.system.health?.value ?? 0) - 1);
    if (result.final > allowed) {
      result.floorReduction = result.final - allowed;
      result.final = allowed;
    }
  }

  /** Turn-start effects for the combatant that just became active. Active GM only (caller checks). */
  static async onTurnStart(actor) {
    if (actor?.type !== 'npc') return;
    const sy = actor.system;
    const sunlit = this.isSunlit(actor);
    const { VagabondChatCard } = await import('./chat-card.mjs');

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
      const { StatusHelper } = await import('./status-helper.mjs');
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
    if (actor?.type !== 'npc' || !game.users.activeGM?.isSelf) return;
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
    const want = this.isSunlit(actor) && actor.system.sunlightHarm === 'burnIncapacitated';
    const own = actor.effects.filter((e) => e.getFlag('vagabond', 'fromSunlight'));
    if (!want) {
      const ids = own.filter((e) => actor.effects.get(e.id)).map((e) => e.id);
      if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids);
      return;
    }
    if (own.length) return;
    const { StatusHelper } = await import('./status-helper.mjs');
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
