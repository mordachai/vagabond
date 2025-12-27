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

  /**
   * Build and evaluate d20 roll using pre-computed roll data
   * Used when item effects have already been applied to roll data
   * @param {Object} rollData - Pre-computed roll data (may include item effects)
   * @param {string} favorHinder - 'favor', 'hinder', or 'none'
   * @param {string} baseFormula - Base formula (default 'd20')
   * @returns {Promise<Roll>} Evaluated roll
   */
  static async buildAndEvaluateD20WithRollData(rollData, favorHinder, baseFormula = 'd20') {
    let formula = baseFormula;

    // Add favor/hinder dice
    if (favorHinder === 'favor') {
      formula += ' + 1d6[favored]';
    } else if (favorHinder === 'hinder') {
      formula += ' - 1d6[hindered]';
    }

    // Add universal check bonus from rollData
    const checkBonus = rollData.universalCheckBonus || 0;
    if (checkBonus !== 0) {
      formula += ` + ${checkBonus}`;
    }

    // Evaluate with custom dice appearance
    const { VagabondDiceAppearance } = await import('./dice-appearance.mjs');
    const roll = new Roll(formula, rollData);
    await VagabondDiceAppearance.evaluateWithCustomColors(roll, favorHinder);
    return roll;
  }

  /**
   * Calculate effective favor/hinder state from system state and keyboard modifiers
   * This is the standard cancellation logic used throughout the system
   * @param {string} systemState - Actor's system.favorHinder ('favor', 'hinder', 'none')
   * @param {boolean} shiftKey - Shift key pressed (temporary favor)
   * @param {boolean} ctrlKey - Ctrl key pressed (temporary hinder)
   * @returns {string} Effective favor/hinder state ('favor', 'hinder', 'none')
   */
  static calculateEffectiveFavorHinder(systemState, shiftKey = false, ctrlKey = false) {
    // Determine modifier intent from keyboard
    let modifierIntent = 'none';
    if (shiftKey && !ctrlKey) {
      modifierIntent = 'favor';
    } else if (ctrlKey && !shiftKey) {
      modifierIntent = 'hinder';
    } else if (shiftKey && ctrlKey) {
      // Both pressed - cancel out
      modifierIntent = 'none';
    }

    // Calculate final effective state
    if (systemState === modifierIntent) {
      // Same direction - apply it
      return systemState;
    } else if (systemState === 'none') {
      // No system state - use modifier
      return modifierIntent;
    } else if (modifierIntent === 'none') {
      // No modifier - use system state
      return systemState;
    } else {
      // Opposite directions - cancel out
      return 'none';
    }
  }

  /**
   * Apply conditional hinder to favor/hinder state
   * Used for saves where armor or attack type can force a hindered state
   * @param {string} effectiveFavorHinder - Effective state from calculateEffectiveFavorHinder
   * @param {boolean} isConditionallyHindered - Whether external conditions force hinder
   * @returns {string} Final favor/hinder state after applying conditional hinder
   */
  static applyConditionalHinder(effectiveFavorHinder, isConditionallyHindered) {
    if (!isConditionallyHindered) {
      return effectiveFavorHinder;
    }

    // Conditional hinder is present
    if (effectiveFavorHinder === 'favor') {
      // Favor + Conditional Hinder = cancel out to 'none'
      return 'none';
    } else {
      // 'none' or 'hinder' + Conditional Hinder = 'hinder'
      // (Multiple hinders don't stack, just apply once)
      return 'hinder';
    }
  }

  /**
   * Build and evaluate d20 roll with conditional hinder support
   * Used for save rolls where armor or attack type can force hindered state
   * @param {VagabondActor} actor - Actor rolling
   * @param {string} effectiveFavorHinder - Effective favor/hinder state
   * @param {boolean} isConditionallyHindered - Whether external conditions force hinder
   * @param {string} baseFormula - Base formula (default 'd20')
   * @returns {Promise<Roll>} Evaluated roll
   */
  static async buildAndEvaluateD20WithConditionalHinder(
    actor,
    effectiveFavorHinder,
    isConditionallyHindered,
    baseFormula = 'd20'
  ) {
    // Apply conditional hinder to determine final state
    const finalFavorHinder = this.applyConditionalHinder(effectiveFavorHinder, isConditionallyHindered);

    // Build and evaluate with final state
    const formula = this.buildD20Formula(actor, finalFavorHinder, baseFormula);
    return this.evaluateRoll(formula, actor, finalFavorHinder);
  }
}
