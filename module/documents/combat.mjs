import { CombatTrackerHelper } from '../helpers/combat-tracker-helper.mjs';

/**
 * Extend the base Combat document to implement Popcorn Initiative.
 * @extends {Combat}
 */
export class VagabondCombat extends Combat {
  constructor(...args) {
    super(...args);
  }

  /** @override */
  async startCombat() {
    await this.resetAll();
    await super.startCombat();
    return this.update({ turn: null });
  }

  /** @override */
  async nextRound() {
    await this.resetAll();
    const advanceTime = CONFIG.time.roundTime;
    return this.update({ round: this.round + 1, turn: null }, { advanceTime });
  }

  /** @override */
  async previousRound() {
    await this.resetAll();
    const advanceTime = -1 * CONFIG.time.roundTime;
    return this.update({ round: Math.max(0, this.round - 1), turn: null }, { advanceTime });
  }

  /**
   * Reset all combatants to their max activations.
   */
  async resetAll() {
    const updates = this.combatants.map(c => {
      const max = c.getFlag('vagabond', 'activations.max') ?? 1;
      return {
        _id: c.id,
        'flags.vagabond.activations.value': max
      };
    });
    return this.updateEmbeddedDocuments('Combatant', updates);
  }

  /**
   * Activate a specific combatant.
   * Sets them as the active turn without consuming an activation yet.
   * @param {string} combatantId
   */
  async activateCombatant(combatantId) {
    if (!this.active) {
        ui.notifications.warn("Combat must be started before activating combatants.");
        return;
    }

    const combatant = this.combatants.get(combatantId);
    if (!combatant) return;

    const value = combatant.getFlag('vagabond', 'activations.value') ?? 0;

    if (value <= 0) {
      ui.notifications.warn(game.i18n.localize("VAGABOND.Combat.NoActivationsLeft"));
      return;
    }

    // Set as active turn (don't decrement yet - that happens when they end their turn)
    const turnIndex = this.turns.findIndex(c => c.id === combatantId);
    return this.update({ turn: turnIndex });
  }

  /**
   * Deactivate the current combatant (End Turn).
   * This is when we consume the activation.
   */
  async deactivateCombatant(combatantId) {
    const turnIndex = this.turns.findIndex(c => c.id === combatantId);
    if (turnIndex !== this.turn) return;

    const combatant = this.combatants.get(combatantId);
    if (combatant) {
      // Consume the activation when ending the turn
      const value = combatant.getFlag('vagabond', 'activations.value') ?? 0;
      if (value > 0) {
        await combatant.setFlag('vagabond', 'activations.value', value - 1);
      }
    }

    // Unset the turn so no one is "active"
    return this.update({ turn: null });
  }

  /**
   * Advance to the next turn.
   * - Ends the current turn (consuming activation)
   * - If current combatant has activations left, activate them again
   * - Otherwise, find next combatant with activations available
   * @override
   */
  async nextTurn() {
    // If no active turn, find first combatant with activations
    if (this.turn === null || this.turn === undefined) {
      const nextCombatant = this._findNextAvailableCombatant();
      if (!nextCombatant) {
        ui.notifications.warn(game.i18n.localize("VAGABOND.Combat.NoActivationsRemaining"));
        return;
      }
      return this.activateCombatant(nextCombatant.id);
    }

    // Get current combatant and consume their activation
    const currentCombatant = this.turns[this.turn];
    if (!currentCombatant) return;

    // Consume the current activation
    const currentActivations = currentCombatant.getFlag('vagabond', 'activations.value') ?? 0;

    if (currentActivations > 0) {
      await currentCombatant.setFlag('vagabond', 'activations.value', currentActivations - 1);
    }

    // Check if current combatant still has activations after consuming one
    const remainingActivations = currentActivations - 1;
    if (remainingActivations > 0) {
      return this.activateCombatant(currentCombatant.id);
    }

    // Otherwise, find next combatant with activations
    const nextCombatant = this._findNextAvailableCombatant(currentCombatant.id);
    if (!nextCombatant) {
      ui.notifications.warn(game.i18n.localize("VAGABOND.Combat.NoActivationsRemaining"));
      return this.update({ turn: null });
    }

    return this.activateCombatant(nextCombatant.id);
  }

  /**
   * Go back to the previous turn.
   * - Restores the current combatant's activation (they haven't used it yet since we're active)
   * - Finds previous combatant and increments their activation
   * - Sets previous combatant as active
   * @override
   */
  async previousTurn() {
    // If no active turn, find last combatant that was spent
    if (this.turn === null || this.turn === undefined) {
      const prevCombatant = this._findPreviousSpentCombatant();
      if (!prevCombatant) {
        ui.notifications.warn(game.i18n.localize("VAGABOND.Combat.NoPreviousTurn"));
        return;
      }
      // Increment their activation (give back the one they used)
      const currentValue = prevCombatant.getFlag('vagabond', 'activations.value') ?? 0;
      const maxValue = prevCombatant.getFlag('vagabond', 'activations.max') ?? 1;
      const newValue = Math.min(currentValue + 1, maxValue);
      await prevCombatant.setFlag('vagabond', 'activations.value', newValue);

      // Set as active turn
      const turnIndex = this.turns.findIndex(c => c.id === prevCombatant.id);
      return this.update({ turn: turnIndex });
    }

    // Current combatant is active but hasn't consumed their activation yet
    // We don't need to restore anything for them

    // Find previous combatant
    const currentCombatant = this.turns[this.turn];
    const prevCombatant = currentCombatant ? this._findPreviousCombatant(currentCombatant.id) : null;
    if (!prevCombatant) {
      return this.update({ turn: null });
    }

    // Increment previous combatant's activation (give back the one they used)
    const prevValue = prevCombatant.getFlag('vagabond', 'activations.value') ?? 0;
    const prevMax = prevCombatant.getFlag('vagabond', 'activations.max') ?? 1;
    const prevNewValue = Math.min(prevValue + 1, prevMax);
    await prevCombatant.setFlag('vagabond', 'activations.value', prevNewValue);

    // Set as active turn
    const turnIndex = this.turns.findIndex(c => c.id === prevCombatant.id);
    return this.update({ turn: turnIndex });
  }

  /**
   * Combatants in the same faction-grouped visual order the Combat Carousel
   * and sidebar Combat Tracker render (see CombatTrackerHelper), rather than
   * the raw initiative-sorted `this.turns`. Turn advancement must follow what
   * the GM/players actually see on screen: faction groups in their configured
   * display order, cards within each group in initiative order.
   * @returns {Combatant[]}
   * @private
   */
  _getVisualOrder() {
    const order = CombatTrackerHelper.getFactionOrder(this);
    const buckets = Object.fromEntries(order.map(k => [k, []]));
    for (const combatant of this.turns) {
      const key = CombatTrackerHelper.factionKeyForCombatant(combatant);
      (buckets[key] ?? buckets.neutral).push(combatant);
    }
    return order.flatMap(k => buckets[k]);
  }

  /**
   * Find the next combatant with activations available, walking the visual
   * (faction-grouped) turn order.
   * @param {string|null} afterCombatantId - Combatant id to search after; null to start from the beginning.
   * @returns {Combatant|null}
   * @private
   */
  _findNextAvailableCombatant(afterCombatantId = null) {
    const order = this._getVisualOrder();
    if (!order.length) return null;
    const startPos = afterCombatantId ? order.findIndex(c => c.id === afterCombatantId) : -1;

    for (let i = 1; i <= order.length; i++) {
      const combatant = order[(startPos + i) % order.length];
      const activations = combatant.getFlag('vagabond', 'activations.value') ?? 0;
      if (activations > 0 && !combatant.defeated) {
        return combatant;
      }
    }

    return null;
  }

  /**
   * Find the previous combatant, walking backwards through the visual
   * (faction-grouped) turn order.
   * @param {string} beforeCombatantId - Combatant id to search before.
   * @returns {Combatant|null}
   * @private
   */
  _findPreviousCombatant(beforeCombatantId) {
    const order = this._getVisualOrder();
    const startPos = order.findIndex(c => c.id === beforeCombatantId);
    if (startPos === -1) return null;

    for (let i = 1; i <= order.length; i++) {
      const combatant = order[(((startPos - i) % order.length) + order.length) % order.length];
      if (!combatant.defeated) {
        return combatant;
      }
    }

    return null;
  }

  /**
   * Find the last combatant that was spent (for starting previousTurn when no active turn),
   * walking the visual (faction-grouped) turn order.
   * @returns {Combatant|null}
   * @private
   */
  _findPreviousSpentCombatant() {
    const order = this._getVisualOrder();
    for (let i = order.length - 1; i >= 0; i--) {
      const combatant = order[i];
      if (combatant.defeated) continue;

      const current = combatant.getFlag('vagabond', 'activations.value') ?? 0;
      const max = combatant.getFlag('vagabond', 'activations.max') ?? 1;

      if (current < max) {
        return combatant;
      }
    }

    return null;
  }

  /**
   * GM Tool: Add/Remove Max Activations
   */
  async addMaxActivation(combatantId, delta) {
    const combatant = this.combatants.get(combatantId);
    if (!combatant) return;

    const current = combatant.getFlag('vagabond', 'activations') || { value: 0, max: 1 };
    const newMax = Math.max(1, current.max + delta);
    const newValue = Math.max(0, current.value + delta); // Also adjust current if increasing max

    return combatant.setFlag('vagabond', 'activations', {
      max: newMax,
      value: newValue
    });
  }

  /**
   * GM Tool: Add/Remove Current Activation
   */
  async addCurrentActivation(combatantId, delta) {
    const combatant = this.combatants.get(combatantId);
    if (!combatant) return;

    const current = combatant.getFlag('vagabond', 'activations.value') ?? 0;
    const max = combatant.getFlag('vagabond', 'activations.max') ?? 1;
    const newValue = Math.clamp(current + delta, 0, max);

    return combatant.setFlag('vagabond', 'activations.value', newValue);
  }

  /** @override */
  _sortCombatants(a, b) {
    // Check if we're using initiative rolls
    const hideInitiative = game.settings.get('vagabond', 'hideInitiativeRoll');

    // Get initiative values (handling null/undefined)
    const ia = typeof a.initiative === 'number' ? a.initiative : null;
    const ib = typeof b.initiative === 'number' ? b.initiative : null;

    if (!hideInitiative) {
      // STANDARD MODE (Rolled Initiative)
      // Sort by initiative (DESCENDING - Highest First)
      if (ia !== null && ib !== null) {
        return ib - ia;
      }
      // If only one has initiative, it goes first
      if (ia !== null) return -1;
      if (ib !== null) return 1;
    } else {
      // MANUAL MODE (Popcorn/Hidden Initiative)
      // Sort by initiative (ASCENDING - Smallest First) if manually set
      if (ia !== null && ib !== null) {
        return ia - ib;
      }
      // If only one has initiative, it goes first
      if (ia !== null) return -1;
      if (ib !== null) return 1;
    }

    // Fallback to disposition and name sorting
    const da = a.token?.disposition ?? -2;
    const db = b.token?.disposition ?? -2;
    if (da !== db) return db - da;
    return (a.name || "").localeCompare(b.name || "");
  }
}