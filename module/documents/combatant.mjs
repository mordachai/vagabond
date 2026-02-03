/**
 * Extend the base Combatant document to support activations.
 * @extends {Combatant}
 */
export class VagabondCombatant extends Combatant {
  /** @override */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    // Initialize activations flags if missing
    let max = 1;
    if (this.actor?.type === 'npc') {
      const rank = this.actor.system.rank;
      if (rank === 'elite') max = 2;
      else if (rank === 'boss') max = 3;
    }

    // Always initialize with max activations
    // The Combat.resetAll() method will handle resetting on round changes
    this.updateSource({
      'flags.vagabond.activations': {
        value: max,
        max: max
      }
    });
  }

  /**
   * Get the current activation state
   * @type {{value: number, max: number}}
   */
  get activations() {
    return this.getFlag('vagabond', 'activations') || { value: 0, max: 1 };
  }

  /**
   * Check if the combatant is spent (no activations left)
   * @type {boolean}
   */
  get isSpent() {
    return this.activations.value <= 0;
  }
}
