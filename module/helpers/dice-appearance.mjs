/**
 * Helper class for customizing dice appearance with Dice So Nice
 * Applies colorset tags to favor/hinder dice that players can configure in their Dice So Nice settings
 */
export class VagabondDiceAppearance {
  /**
   * Evaluate and roll with favor/hinder dice customization
   * @param {Roll} roll - The unevaluated roll
   * @param {string} favorHinder - 'favor', 'hinder', or 'none'
   * @param {object} messageOptions - Options for ChatMessage.create()
   * @returns {Promise<Roll>} The evaluated roll
   */
  static async evaluateWithCustomColors(roll, favorHinder, messageOptions = {}) {
    // If Dice So Nice is active and we have favor/hinder, customize the dice appearance BEFORE evaluating
    if (game.dice3d && favorHinder !== 'none') {
      // Tag the favor/hinder d6 dice with custom colorset
      let foundD6 = false;

      for (const term of roll.terms) {
        if (term instanceof foundry.dice.terms.DiceTerm && term.faces === 6 && !foundD6) {
          // This is the favor/hinder die - set the colorset directly
          term.options.colorset = favorHinder === 'favor' ? 'vagabond_favor' : 'vagabond_hinder';
          foundD6 = true;
        }
      }
    }

    await roll.evaluate();
    return roll;
  }

  /**
   * Register custom colorsets with Dice So Nice
   * Called during system initialization (ready hook)
   */
  static registerColorsets() {
    if (!game.dice3d) {
      console.log('Vagabond | Dice So Nice not available, skipping colorset registration');
      return;
    }

    try {
      // Register favor colorset (green)
      game.dice3d.addColorset({
        name: 'vagabond_favor',
        description: 'VAGABOND.DiceSoNice.Favor',
        category: 'VAGABOND.DiceSoNice.Category',
        foreground: '#ffffff',
        background: '#22c55e',
        outline: '#16a34a',
        texture: 'none',
        edge: '#16a34a'
      }, 'default');

      // Register hinder colorset (red)
      game.dice3d.addColorset({
        name: 'vagabond_hinder',
        description: 'VAGABOND.DiceSoNice.Hinder',
        category: 'VAGABOND.DiceSoNice.Category',
        foreground: '#ffffff',
        background: '#ef4444',
        outline: '#dc2626',
        texture: 'none',
        edge: '#dc2626'
      }, 'default');

      console.log('Vagabond | Registered Dice So Nice colorsets for favor/hinder');
    } catch (error) {
      console.error('Vagabond | Failed to register Dice So Nice colorsets:', error);
    }
  }
}
