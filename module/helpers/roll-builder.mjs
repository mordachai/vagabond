/**
 * Centralized utility for building and evaluating rolls with favor/hinder mechanics
 */
export class VagabondRollBuilder {
  /**
   * Build d20 roll formula with favor/hinder and check bonus
   * @param {VagabondActor} actor - Actor rolling
   * @param {string} favorHinder - 'favor', 'hinder', or 'none'
   * @param {string} baseFormula - Base formula (default 'd20')
   * @returns {string} Complete roll formula
   */
  static buildD20Formula(actor, favorHinder, baseFormula = 'd20') {
    let formula = baseFormula;

    // Add favor/hinder dice
    if (favorHinder === 'favor') {
      formula += ' + 1d6[favored]';
    } else if (favorHinder === 'hinder') {
      formula += ' - 1d6[hindered]';
    }

    // Add universal check bonus
    const checkBonus = actor.system.universalCheckBonus || 0;
    if (checkBonus !== 0) {
      formula += ` + ${checkBonus}`;
    }

    return formula;
  }

  /**
   * Create and evaluate a roll with custom dice appearance
   * @param {string} formula - Roll formula
   * @param {VagabondActor} actor - Actor rolling
   * @param {string} favorHinder - 'favor', 'hinder', or 'none'
   * @returns {Promise<Roll>} Evaluated roll
   */
  static async evaluateRoll(formula, actor, favorHinder) {
    const { VagabondDiceAppearance } = await import('./dice-appearance.mjs');
    const roll = new Roll(formula, actor.getRollData());
    await VagabondDiceAppearance.evaluateWithCustomColors(roll, favorHinder);
    return roll;
  }

  /**
   * Build and evaluate d20 roll in one step
   * @param {VagabondActor} actor - Actor rolling
   * @param {string} favorHinder - 'favor', 'hinder', or 'none'
   * @param {string} baseFormula - Base formula (default 'd20')
   * @returns {Promise<Roll>} Evaluated roll
   */
  static async buildAndEvaluateD20(actor, favorHinder, baseFormula = 'd20') {
    const formula = this.buildD20Formula(actor, favorHinder, baseFormula);
    return this.evaluateRoll(formula, actor, favorHinder);
  }
}
