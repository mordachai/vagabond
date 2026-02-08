/**
 * Extend the base Combatant document to support activations.
 * @extends {Combatant}
 */
export class VagabondCombatant extends Combatant {
  /** @override */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);

    // Initialize activations flags if missing
    const useActivationPoints = game.settings.get('vagabond', 'useActivationPoints');

    // If activation points are disabled, default to 1
    // If enabled, use the configured default
    const max = useActivationPoints
      ? (game.settings.get('vagabond', 'defaultActivationPoints') || 2)
      : 1;

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

  /**
   * Get the initiative roll formula for this combatant
   * Player characters and NPCs use different custom formulas from settings
   * @override
   * @param {string} formula - The default formula
   * @returns {Roll}
   */
  getInitiativeRoll(formula) {
    // NPCs use their own formula
    if (this.actor?.type === 'npc') {
      const npcFormula = game.settings.get('vagabond', 'npcInitiativeFormula');
      return new Roll(npcFormula || '3d6 + ceil(@speed / 10)', this.actor?.getRollData() || {});
    }

    // Player characters use the PC formula from settings
    const customFormula = game.settings.get('vagabond', 'initiativeFormula');
    return new Roll(customFormula || formula, this.actor?.getRollData() || {});
  }
}
