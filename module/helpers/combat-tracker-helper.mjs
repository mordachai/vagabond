/**
 * Shared faction/turn-preparation logic for the sidebar Combat Tracker and the
 * Combat Carousel overlay. Both consumers must agree on faction bucketing,
 * per-turn resource data, and hidden-combatant filtering — this is the single
 * place that logic lives.
 */

export const DEFAULT_FACTION_ORDER = ['friendly', 'neutral', 'hostile', 'secret'];

export class CombatTrackerHelper {
  /**
   * Read faction labels/colors from world settings.
   * @returns {Record<string, {label: string, color: string}>}
   */
  static getFactionMeta() {
    return {
      friendly: {
        label: game.settings.get('vagabond', 'factionFriendly') || 'VAGABOND.Combat.Factions.Friendly',
        color: game.settings.get('vagabond', 'factionFriendlyColor') || '#7fbf7f'
      },
      neutral: {
        label: game.settings.get('vagabond', 'factionNeutral') || 'VAGABOND.Combat.Factions.Neutral',
        color: game.settings.get('vagabond', 'factionNeutralColor') || '#dfdf7f'
      },
      hostile: {
        label: game.settings.get('vagabond', 'factionHostile') || 'VAGABOND.Combat.Factions.Hostile',
        color: game.settings.get('vagabond', 'factionHostileColor') || '#df7f7f'
      },
      secret: {
        label: game.settings.get('vagabond', 'factionSecret') || 'VAGABOND.Combat.Factions.Secret',
        color: game.settings.get('vagabond', 'factionSecretColor') || '#bf7fdf'
      }
    };
  }

  /**
   * Faction key for a combatant, derived from its token disposition.
   * @param {Combatant} combatant
   * @returns {'friendly'|'neutral'|'hostile'|'secret'}
   */
  static factionKeyForCombatant(combatant) {
    const disposition = combatant.token?.disposition;
    if (disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) return 'friendly';
    if (disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) return 'hostile';
    if (disposition === CONST.TOKEN_DISPOSITIONS.SECRET) return 'secret';
    return 'neutral';
  }

  /**
   * The GM-configured (or default) display order of faction groups for a combat.
   * Purely cosmetic grouping order — does not affect initiative/turn order.
   * @param {Combat} combat
   * @returns {string[]}
   */
  static getFactionOrder(combat) {
    const stored = combat?.getFlag('vagabond', 'carouselFactionOrder');
    if (Array.isArray(stored) && stored.length) {
      // Guard against a stale/corrupt flag missing a key — append any missing defaults.
      const missing = DEFAULT_FACTION_ORDER.filter(k => !stored.includes(k));
      return [...stored, ...missing];
    }
    return [...DEFAULT_FACTION_ORDER];
  }

  /**
   * Persist a new faction display order on the combat (GM only).
   * @param {Combat} combat
   * @param {string[]} order
   */
  static async setFactionOrder(combat, order) {
    if (!game.user.isGM) return;
    return combat.setFlag('vagabond', 'carouselFactionOrder', order);
  }

  /**
   * Portrait to display for a combatant's card: actor portrait for PCs, token
   * texture for NPCs.
   * @param {Combatant} combatant
   * @returns {string}
   */
  static getPortrait(combatant) {
    const actor = combatant.actor;
    if (actor?.type === 'character') return actor.img || combatant.img;
    return combatant.token?.texture?.src || combatant.img;
  }

  /**
   * Enrich a base turn object (must already have at least `id`) with the
   * resource/effects/activation data shared by both tracker UIs.
   * @param {Combatant} combatant
   * @param {object} turn
   * @returns {object} The same `turn` object, mutated.
   */
  static enrichTurnData(combatant, turn) {
    const actor = combatant.actor;
    if (actor) {
      turn.hp = {
        value: actor.system.health?.value || 0,
        max: actor.system.health?.max || 0
      };
      turn.hpPercent = turn.hp.max > 0 ? Math.round((turn.hp.value / turn.hp.max) * 100) : 0;

      turn.fatigue = {
        value: actor.system.fatigue || 0,
        max: actor.system.fatigueMax || 0
      };
      turn.fatiguePercent = turn.fatigue.max > 0 ? Math.round((turn.fatigue.value / turn.fatigue.max) * 100) : 0;

      if (actor.system.mana) {
        turn.mana = { current: actor.system.mana.current || 0, max: actor.system.mana.max || 0 };
        turn.isFocusing = (actor.system.focus?.current ?? 0) > 0;
      }

      // Same rule core uses to decide token/tracker icon visibility (see core
      // CombatTracker#_prepareTurnContext / Token#_drawEffects): ALWAYS effects
      // show regardless of duration; CONDITIONAL ones only while temporary.
      // `isTemporary` alone (the old filter here) misses permanent-until-removed
      // statuses (duration: {}), which is most manually-toggled conditions.
      const SHOW_ICON = CONST.ACTIVE_EFFECT_SHOW_ICON;
      turn.effects = actor.effects
        .filter(e => !e.disabled && !e.isSuppressed
          && (e.showIcon === SHOW_ICON.ALWAYS || (e.showIcon === SHOW_ICON.CONDITIONAL && e.isTemporary)))
        .map(e => ({ id: e.id, name: e.name, icon: e.img || 'icons/svg/aura.svg' }));
    }

    const activations = combatant.getFlag('vagabond', 'activations') || { value: 0, max: 1 };
    turn.activations = activations;
    turn.isSpent = activations.value <= 0;
    turn.factionClass = this.factionKeyForCombatant(combatant);

    return turn;
  }

  /**
   * Bucket a flat list of enriched turns into ordered faction groups.
   * @param {string[]} order - Faction key order (see {@link getFactionOrder}).
   * @param {object[]} turns - Turns already run through {@link enrichTurnData}.
   * @returns {Record<string, {label: string, color: string, css: string, turns: object[]}>}
   */
  static bucketByFaction(order, turns) {
    const meta = this.getFactionMeta();
    const factions = {};
    for (const key of order) {
      factions[key] = { ...meta[key], turns: [], css: key };
    }
    for (const turn of turns) {
      const key = factions[turn.factionClass] ? turn.factionClass : 'neutral';
      turn.factionColor = factions[key].color;
      factions[key].turns.push(turn);
    }
    return factions;
  }

  /**
   * Build the complete faction-grouped turn structure for a combat, filtering
   * out combatants the current user cannot see (matches core `Combatant#visible`:
   * GM/owner or not `hidden`).
   * @param {Combat} combat
   * @param {object} [options]
   * @param {object[]} [options.baseTurns] - Pre-built turn base objects (id/name/img/
   *   initiative/hidden/active/defeated/...) to enrich, e.g. from core's own
   *   `_prepareTurnContext`. If omitted, built directly from `combat.turns`.
   * @returns {Record<string, object>} Faction buckets, see {@link bucketByFaction}.
   */
  static buildFactionTurns(combat, { baseTurns } = {}) {
    const order = this.getFactionOrder(combat);
    const empty = this.bucketByFaction(order, []);
    if (!combat) return empty;

    const turns = [];
    if (baseTurns) {
      for (const turn of baseTurns) {
        const combatant = combat.combatants.get(turn.id);
        if (!combatant || !combatant.visible) continue;
        turns.push(this.enrichTurnData(combatant, turn));
      }
    } else {
      for (const [index, combatant] of combat.turns.entries()) {
        if (!combatant.visible) continue;
        const turn = {
          id: combatant.id,
          name: combatant.name,
          img: this.getPortrait(combatant),
          initiative: combatant.initiative,
          hidden: combatant.hidden,
          isDefeated: combatant.isDefeated,
          active: index === combat.turn
        };
        turns.push(this.enrichTurnData(combatant, turn));
      }
    }

    return this.bucketByFaction(order, turns);
  }

  /**
   * Reorder `draggedId` to sit immediately before/after `targetId`, within the
   * same faction group, WITHOUT disturbing the global interleave with other
   * factions: the faction's members keep the same set of global turn-order
   * slots, only the new relative order among themselves changes.
   *
   * This system defaults to popcorn/manual initiative (`hideInitiativeRoll`
   * defaults true), so most combatants' `initiative` is commonly `null` —
   * transplanting old values between faction-mates (the previous approach)
   * is a no-op when those values are all null/tied. Instead, fresh distinct
   * values are interpolated between whichever combatants (any faction) sit
   * just outside this faction's occupied slot span, in the sort direction
   * the world is currently using.
   *
   * Shared by the Combat Carousel and the sidebar Combat Tracker drag UIs.
   * @param {Combat} combat
   * @param {string} factionKey
   * @param {string} draggedId
   * @param {string} targetId
   * @param {boolean} [insertAfter=false]
   */
  static async reorderWithinFaction(combat, factionKey, draggedId, targetId, insertAfter = false) {
    if (!combat) return;
    if (!game.user.isGM && factionKey !== 'friendly') return;

    const factionIds = this.buildFactionTurns(combat)[factionKey]?.turns.map(t => t.id) ?? [];
    if (!factionIds.includes(draggedId) || !factionIds.includes(targetId)) return;

    const newOrder = factionIds.filter(id => id !== draggedId);
    let targetIndex = newOrder.indexOf(targetId);
    if (insertAfter) targetIndex += 1;
    newOrder.splice(targetIndex, 0, draggedId);

    const allTurns = combat.turns; // already sorted in current display order
    const slotIndices = allTurns
      .map((c, i) => ({ id: c.id, i }))
      .filter(t => factionIds.includes(t.id))
      .map(t => t.i);

    const before = allTurns[slotIndices[0] - 1];
    const after = allTurns[slotIndices[slotIndices.length - 1] + 1];

    const n = newOrder.length;
    // Ascending (popcorn/manual, lowest goes first) vs descending (rolled, highest first).
    const dir = game.settings.get('vagabond', 'hideInitiativeRoll') ? 1 : -1;

    let lo = Number.isFinite(before?.initiative) ? before.initiative : null;
    let hi = Number.isFinite(after?.initiative) ? after.initiative : null;

    if (lo === null && hi === null) {
      // No usable neighbor on either side (values null, or this faction spans
      // the whole combat) — synthesize a safe range so results are still
      // distinct and correctly ordered.
      lo = dir === 1 ? 0 : n + 1;
      hi = dir === 1 ? n + 1 : 0;
    } else if (lo === null) {
      lo = hi - dir * (n + 1);
    } else if (hi === null) {
      hi = lo + dir * (n + 1);
    }

    const step = (hi - lo) / (n + 1);
    const updates = newOrder.map((id, i) => ({ _id: id, initiative: lo + step * (i + 1) }));

    if (game.user.isGM) return combat.updateEmbeddedDocuments('Combatant', updates);

    // Players reordering their own faction rarely own every combatant in it —
    // relay the write through the GM client.
    const { emitSocket } = await import('./socket-helper.mjs');
    emitSocket('reorderCombatants', { combatId: combat.id, updates });
  }

  /**
   * Reorder the faction display-group order itself (GM only). Shared by the
   * Combat Carousel and the sidebar Combat Tracker drag UIs.
   * @param {Combat} combat
   * @param {string} draggedKey
   * @param {string} targetKey
   */
  static async reorderFactionGroups(combat, draggedKey, targetKey) {
    if (!combat || !game.user.isGM) return;
    const order = this.getFactionOrder(combat);
    const newOrder = order.filter(k => k !== draggedKey);
    const targetIndex = newOrder.indexOf(targetKey);
    newOrder.splice(targetIndex, 0, draggedKey);
    return this.setFactionOrder(combat, newOrder);
  }
}
