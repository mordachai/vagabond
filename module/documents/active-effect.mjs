/**
 * Custom ActiveEffect document for the Vagabond system.
 * Provides attribute key autocomplete in the Active Effect configuration.
 */
export class VagabondActiveEffect extends ActiveEffect {

  /**
   * Provide attribute key choices for the Active Effect configuration form.
   * This populates the "Attribute Key" dropdown with all available system variables.
   * @returns {object} Object mapping attribute paths to their labels
   */
  static getAttributeChoices() {
    const choices = {
      // ===== BASE ACTOR VARIABLES =====
      'system.health.value': 'Health: Current HP',
      'system.health.max': 'Health: Max HP',
      'system.power.value': 'Power: Current',
      'system.power.max': 'Power: Max',
      'system.fatigue': 'Fatigue (0-5)',

      // ===== CHARACTER ATTRIBUTES =====
      'system.attributes.level.value': 'Level',
      'system.attributes.xp': 'Experience Points',
      'system.attributes.size': 'Size Category',
      'system.attributes.beingType': 'Being Type',

      // ===== CURRENCY =====
      'system.currency.gold': 'Currency: Gold',
      'system.currency.silver': 'Currency: Silver',
      'system.currency.copper': 'Currency: Copper',

      // ===== INVENTORY =====
      'system.inventory.bonusSlots': 'Inventory: Bonus Slots',

      // ===== MANA =====
      'system.mana.current': 'Mana: Current',

      // ===== GAME MECHANICS =====
      'system.favorHinder': 'Favor/Hinder State',
      'system.critNumber': 'Critical Hit Threshold',
      'system.bonusLuck': 'Bonus Luck',
      'system.currentLuck': 'Current Luck Pool',

      // ===== STATS =====
      'system.stats.might.value': 'Stat: Might',
      'system.stats.dexterity.value': 'Stat: Dexterity',
      'system.stats.awareness.value': 'Stat: Awareness',
      'system.stats.reason.value': 'Stat: Reason',
      'system.stats.presence.value': 'Stat: Presence',
      'system.stats.luck.value': 'Stat: Luck',

      // ===== SAVES =====
      'system.saves.reflex.bonus': 'Save: Reflex Bonus',
      'system.saves.endure.bonus': 'Save: Endure Bonus',
      'system.saves.will.bonus': 'Save: Will Bonus',

      // ===== SKILLS =====
      'system.skills.arcana.trained': 'Skill: Arcana (Trained)',
      'system.skills.arcana.bonus': 'Skill: Arcana Bonus',
      'system.skills.craft.trained': 'Skill: Craft (Trained)',
      'system.skills.craft.bonus': 'Skill: Craft Bonus',
      'system.skills.medicine.trained': 'Skill: Medicine (Trained)',
      'system.skills.medicine.bonus': 'Skill: Medicine Bonus',
      'system.skills.brawl.trained': 'Skill: Brawl (Trained)',
      'system.skills.brawl.bonus': 'Skill: Brawl Bonus',
      'system.skills.finesse.trained': 'Skill: Finesse (Trained)',
      'system.skills.finesse.bonus': 'Skill: Finesse Bonus',
      'system.skills.sneak.trained': 'Skill: Sneak (Trained)',
      'system.skills.sneak.bonus': 'Skill: Sneak Bonus',
      'system.skills.detect.trained': 'Skill: Detect (Trained)',
      'system.skills.detect.bonus': 'Skill: Detect Bonus',
      'system.skills.mysticism.trained': 'Skill: Mysticism (Trained)',
      'system.skills.mysticism.bonus': 'Skill: Mysticism Bonus',
      'system.skills.survival.trained': 'Skill: Survival (Trained)',
      'system.skills.survival.bonus': 'Skill: Survival Bonus',
      'system.skills.influence.trained': 'Skill: Influence (Trained)',
      'system.skills.influence.bonus': 'Skill: Influence Bonus',
      'system.skills.leadership.trained': 'Skill: Leadership (Trained)',
      'system.skills.leadership.bonus': 'Skill: Leadership Bonus',
      'system.skills.performance.trained': 'Skill: Performance (Trained)',
      'system.skills.performance.bonus': 'Skill: Performance Bonus',

      // ===== WEAPON SKILLS =====
      'system.weaponSkills.melee.trained': 'Weapon Skill: Melee (Trained)',
      'system.weaponSkills.melee.bonus': 'Weapon Skill: Melee Bonus',
      'system.weaponSkills.brawl.trained': 'Weapon Skill: Brawl (Trained)',
      'system.weaponSkills.brawl.bonus': 'Weapon Skill: Brawl Bonus',
      'system.weaponSkills.finesse.trained': 'Weapon Skill: Finesse (Trained)',
      'system.weaponSkills.finesse.bonus': 'Weapon Skill: Finesse Bonus',
      'system.weaponSkills.ranged.trained': 'Weapon Skill: Ranged (Trained)',
      'system.weaponSkills.ranged.bonus': 'Weapon Skill: Ranged Bonus',

      // ===== DAMAGE IMMUNITIES & WEAKNESSES =====
      'system.immunities': 'Damage Immunities (Array)',
      'system.weaknesses': 'Damage Weaknesses (Array)',

      // ===== NPC-SPECIFIC VARIABLES =====
      'system.cr': 'NPC: Challenge Rating',
      'system.hd': 'NPC: Hit Dice',
      'system.morale': 'NPC: Morale',
      'system.appearing': 'NPC: Number Appearing',
      'system.speed': 'NPC: Speed',
      'system.senses': 'NPC: Senses',
      'system.armor': 'NPC: Armor Value',
      'system.armorDescription': 'NPC: Armor Description',
      'system.locked': 'NPC: Locked Mode',
      'system.statusImmunities': 'NPC: Status Immunities (Array)',
      'system.zone': 'NPC: Combat Zone',

      // ===== DERIVED VALUES (Generally not recommended to modify directly) =====
      // These are included for advanced use cases
      'system.armor': 'Armor (Calculated)',
      'system.speed.base': 'Speed: Base',
      'system.speed.crawl': 'Speed: Crawl',
      'system.speed.travel': 'Speed: Travel',
      'system.maxLuck': 'Max Luck (Calculated)',
      'system.inventory.maxSlots': 'Inventory: Max Slots (Calculated)',
      'system.mana.max': 'Mana: Max (Calculated)',
      'system.mana.castingMax': 'Mana: Casting Max (Calculated)',
    };

    return choices;
  }

  /**
   * Augment the ActiveEffect configuration sheet with attribute choices
   * This is called by Foundry when preparing the configuration form
   */
  static onManageActiveEffect(event, owner) {
    event.preventDefault();
    const button = event.currentTarget;
    const li = button.closest('.effect');
    const effect = li?.dataset.effectId ? owner.effects.get(li.dataset.effectId) : null;

    switch (button.dataset.action) {
      case 'create':
        return owner.createEmbeddedDocuments('ActiveEffect', [{
          name: game.i18n.localize('VAGABOND.Effect.New'),
          icon: 'icons/svg/aura.svg',
          origin: owner.uuid,
          'duration.rounds': li?.dataset.effectType === 'temporary' ? 1 : undefined,
          disabled: li?.dataset.effectType === 'inactive'
        }]);
      case 'edit':
        return effect.sheet.render(true);
      case 'delete':
        return effect.delete();
      case 'toggle':
        return effect.update({ disabled: !effect.disabled });
    }
  }
}
