/**
 * UI Helper - Centralized utility for UI elements and formatting
 */
export class VagabondUIHelper {
  /**
   * Generate a formatted tooltip string: "Name: Description"
   * @param {string} label - The name/label of the attribute
   * @param {string} description - The descriptive text
   * @returns {string} Formatted tooltip string
   */
  static getTooltip(label, description) {
    return `${label}: ${description}`;
  }

  /**
   * Get tooltip for a specific system attribute
   * @param {string} type - 'skill', 'weaponSkill', 'save', or 'derived'
   * @param {string} key - The attribute key (e.g., 'arcana', 'reflex', 'hp')
   * @param {Object} actor - (Optional) The actor to get data from
   * @returns {string} Formatted tooltip
   */
  static getAttributeTooltip(type, key, actor = null) {
    let label = '';
    let description = '';

    switch (type) {
      case 'skill':
        label = game.i18n.localize(`VAGABOND.Skills.${key.charAt(0).toUpperCase() + key.slice(1)}`);
        description = game.i18n.localize(`VAGABOND.SkillsHints.${key.charAt(0).toUpperCase() + key.slice(1)}`);
        break;

      case 'weaponSkill':
        label = game.i18n.localize(`VAGABOND.WeaponSkills.${key.charAt(0).toUpperCase() + key.slice(1)}`);
        description = game.i18n.localize(`VAGABOND.WeaponSkillsHints.${key.charAt(0).toUpperCase() + key.slice(1)}`);
        break;

      case 'save':
        label = game.i18n.localize(`VAGABOND.Saves.${key.charAt(0).toUpperCase() + key.slice(1)}.name`);
        description = game.i18n.localize(`VAGABOND.Saves.${key.charAt(0).toUpperCase() + key.slice(1)}.description`);
        break;

      case 'derived':
        if (key === 'hp') {
          label = 'HP';
          description = "Maximum Health. Determined by (Might × Level) + Bonuses.";
        } else if (key === 'luck') {
          label = 'Luck Pool';
          description = "Used to favor rolls or avoid harm. Recharges on a Rest.";
        } else if (key === 'inventory') {
          label = 'Inventory';
          description = "Carrying capacity. 8 + Might slots.";
        } else if (key === 'speed') {
          label = 'Speed';
          description = "Distance you can move in one action. Based on Dexterity.";
        } else if (key === 'manaMax') {
          label = game.i18n.localize("VAGABOND.Actor.Character.FIELDS.mana.max.label");
          description = "Maximum Mana energy available for spells.";
        } else if (key === 'manaCast') {
          label = game.i18n.localize("VAGABOND.Actor.Character.FIELDS.mana.castingMax.label");
          description = "Maximum Mana you can spend on a single spell cast.";
        }
        break;
    }

    return this.getTooltip(label, description);
  }
}
