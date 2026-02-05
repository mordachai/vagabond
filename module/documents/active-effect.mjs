/**
 * Custom ActiveEffect document for the Vagabond system.
 * Provides attribute key autocomplete in the Active Effect configuration.
 *
 * ============================================================================
 * FORMULA SUPPORT FOR BONUS FIELDS
 * ============================================================================
 *
 * ## Overview
 * All bonus fields now support BOTH simple numeric values AND dynamic formulas.
 * This enables perks and effects that scale with character progression.
 *
 * ## Effect Value Format
 * Bonus fields accept:
 * - **Simple numbers**: "1", "5", "-2" (parsed as numbers)
 * - **Formulas**: "@attributes.level.value", "@stats.might.value * 2"
 * - **Complex**: "floor(@attributes.level.value / 2)", "@stats.might.total + 5"
 *
 * ## Available Formula Variables
 * Use @ prefix to reference actor data:
 * - **@attributes.level.value** - Character level
 * - **@stats.[stat].value** - Base stat values (might, dexterity, etc.)
 * - **@stats.[stat].total** - Stat totals (after bonuses)
 * - **@cr** - NPC Challenge Rating (NPCs only)
 * - Any other field in getRollData()
 *
 * ## Supported Math Functions
 * - floor(), ceil(), round(), abs(), min(), max()
 * - Standard operators: +, -, *, /, %
 *
 * ## Example: Scaling Perks
 *
 * **"Secret of Mana" (Casting Max = Casting Max + Level):**
 * - Attribute Key: mana.castingMaxBonus
 * - Change Mode: Add (2)
 * - Effect Value: @attributes.level.value
 * - Result: Level 1 = +1, Level 5 = +5, Level 10 = +10
 *
 * **"Tough" (HP = HP + Level):**
 * - Attribute Key: bonuses.hpPerLevel
 * - Change Mode: Add (2)
 * - Effect Value: 1
 * - Result: Grants +1 HP per level (multiplied by level in HP formula)
 *
 * **"Scaling Might" (Might = Might + Level/2):**
 * - Attribute Key: stats.might.bonus
 * - Change Mode: Add (2)
 * - Effect Value: floor(@attributes.level.value / 2)
 * - Result: Level 1 = +0, Level 2-3 = +1, Level 4-5 = +2, etc.
 *
 * **"Stat-Based Armor" (Armor = Armor + Dexterity):**
 * - Attribute Key: armorBonus
 * - Change Mode: Add (2)
 * - Effect Value: @stats.dexterity.total
 * - Result: Armor increases with Dexterity score
 *
 * ## Backward Compatibility
 * - Existing numeric Active Effects work unchanged
 * - Simple numbers like "1" or "5" are evaluated as numbers
 * - Invalid formulas default to 0 with console warning
 *
 * ============================================================================
 * STAT BONUS SYSTEM
 * ============================================================================
 *
 * ## Overview
 * All six core stats (Might, Dexterity, Awareness, Reason, Presence, Luck) can
 * be modified through Active Effects using bonus fields.
 *
 * ## Stat Fields
 * Each stat has three values:
 * - **value**: Base stat value (0-12)
 * - **bonus**: Bonus from Active Effects (can be formula or number)
 * - **total**: Calculated value (value + bonus, clamped to 0-12)
 *
 * ## Effect Keys (DataModel Format - NO "system." prefix!)
 * - stats.might.bonus
 * - stats.dexterity.bonus
 * - stats.awareness.bonus
 * - stats.reason.bonus
 * - stats.presence.bonus
 * - stats.luck.bonus
 *
 * **IMPORTANT**: Do NOT include "system." prefix! Foundry v13 DataModels handle this automatically.
 * Using "system.stats.luck.bonus" will NOT work - use "stats.luck.bonus" instead.
 *
 * ## What Stats Affect
 * Stat bonuses affect ALL derived calculations:
 * - **Might**: Max HP, Inventory Slots, Endure Save
 * - **Dexterity**: Speed, Reflex Save
 * - **Awareness**: Reflex Save
 * - **Reason**: Will Save, Casting Max (if spellcaster)
 * - **Presence**: Will Save
 * - **Luck**: Max Luck pool
 *
 * ## Usage Example
 * "Belt of Giant Strength" (+2 Might):
 * - Attribute Key: stats.might.bonus
 * - Change Mode: Add (2)
 * - Effect Value: 2
 * - Result: Increases Might total by +2, which increases HP and inventory slots
 *
 * ============================================================================
 * DAMAGE BONUS SYSTEM GUIDE
 * ============================================================================
 *
 * ## Universal Damage Bonuses (Legacy)
 * These apply to ALL damage rolls (weapons, spells, alchemicals):
 * - system.universalDamageBonus (flat number, e.g., +2)
 * - system.universalDamageDice (dice formula, e.g., "1d4")
 *
 * ## Separated Universal Damage Bonuses (New)
 * These apply ONLY to specific item types:
 *
 * **Weapon Damage:**
 * - system.universalWeaponDamageBonus (flat, e.g., +2)
 * - system.universalWeaponDamageDice (dice, e.g., "1d4")
 *
 * **Spell Damage:**
 * - system.universalSpellDamageBonus (flat, e.g., +3)
 * - system.universalSpellDamageDice (dice, e.g., "1d6")
 *
 * **Alchemical Damage:**
 * - system.universalAlchemicalDamageBonus (flat, e.g., +1)
 * - system.universalAlchemicalDamageDice (dice, e.g., "1d4")
 *
 * ## Stacking Behavior
 * - Separated bonuses stack WITH legacy universal bonuses
 * - Example: Weapon attack with +2 universal AND +3 weapon = total +5
 * - Order: Base Damage → Type-Specific Bonus → Universal Bonus
 *
 * ============================================================================
 * SPELL DAMAGE DIE SIZE SYSTEM
 * ============================================================================
 *
 * ## Character-Level Control
 * - system.spellDamageDieSize (default: 6)
 * - Changes ALL spell damage dice (e.g., from d6 to d8/d10/d12)
 * - Modifiable via Active Effects for perks/buffs
 *
 * ## Spell-Level Override
 * - Individual spells can override with their own damageDieSize field
 * - Priority: Spell Override → Actor Default → 6
 *
 * ## Usage Examples
 *
 * **Example 1: "Weapon Master" Perk**
 * - Attribute Key: universalWeaponDamageBonus
 * - Change Mode: Add (2)
 * - Effect Value: 2
 * - Result: All weapon attacks deal +2 damage (spells unaffected)
 *
 * **Example 2: "Empowered Magic" Perk**
 * - Attribute Key: spellDamageDieSize
 * - Change Mode: Upgrade (4) or Override (5)
 * - Effect Value: 8
 * - Result: All spell damage uses d8 instead of d6
 *   - Before: Fireball 3d6 fire
 *   - After: Fireball 3d8 fire
 *
 * **Example 3: "Alchemical Expertise" Perk**
 * - Attribute Key: universalAlchemicalDamageDice
 * - Change Mode: Add (2)
 * - Effect Value: "1d4"
 * - Result: All alchemical items deal +1d4 damage
 *
 * **Example 4: Combined Bonuses**
 * Character has:
 * - system.universalDamageBonus = +2 (applies to all)
 * - system.universalSpellDamageBonus = +3 (applies to spells only)
 *
 * Spell damage formula: 3d6 → 3d6 + 3 + 2 = 3d6 + 5
 * Weapon damage formula: 2d8 → 2d8 + 2 (only universal applies)
 *
 * ============================================================================
 * BACKWARD COMPATIBILITY
 * ============================================================================
 * - Legacy universalDamageBonus/universalDamageDice still work
 * - Both legacy and separated bonuses apply cumulatively
 * - Existing characters/effects will continue to function normally
 *
 * ============================================================================
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
      'system.health.bonus': 'Health: Flat HP Bonus (Applied to Max)',
      'system.power.value': 'Power: Current',
      'system.power.max': 'Power: Max',
      'system.fatigue': 'Fatigue (0-5)',

      // ===== CHARACTER ATTRIBUTES =====
      'system.attributes.level.value': 'Level',
      'system.attributes.xp': 'Experience Points',
      'system.attributes.size': 'Size Category',
      'system.attributes.beingType': 'Being Type',
      
      // -- NEW: Spellcasting --
      'system.attributes.isSpellcaster': 'Spellcasting: Is Spellcaster (Override)',
      'system.attributes.manaMultiplier': 'Spellcasting: Mana Multiplier',
      'system.attributes.castingStat': 'Spellcasting: Casting Stat (reason, might, etc.)',
      'system.attributes.manaSkill': 'Spellcasting: Mana Skill (arcana, mysticism, etc.)',

      // ===== CURRENCY =====
      'system.currency.gold': 'Currency: Gold',
      'system.currency.silver': 'Currency: Silver',
      'system.currency.copper': 'Currency: Copper',

      // ===== INVENTORY =====
      'system.inventory.bonusSlots': 'Inventory: Bonus Slots',

      // ===== MANA =====
      'system.mana.current': 'Mana: Current',
      'system.mana.bonus': 'Mana: Max Bonus (Flat Add)', 
      'system.mana.castingMaxBonus': 'Mana: Casting Max Bonus (Flat Add)',

      // ===== GAME MECHANICS =====
      'system.favorHinder': 'Favor/Hinder State',
      'system.critNumber': 'Critical Hit Threshold',
      'system.bonusLuck': 'Bonus Luck',
      'system.currentLuck': 'Current Luck Pool',
      'system.studiedDice': 'Studied Dice Pool',
      'system.bonuses.hpPerLevel': 'Bonus: HP Per Level',

      // -- Universal Bonuses --
      'system.universalCheckBonus': 'Universal: All d20 Rolls (Check Bonus)',
      'system.universalDamageBonus': 'Universal: All Damage Rolls (Flat Bonus)',
      'system.universalDamageDice': 'Universal: All Damage Rolls (Dice Bonus)',

      // -- Separated Universal Damage Bonuses --
      'system.universalWeaponDamageBonus': 'Universal: Weapon Damage (Flat Bonus)',
      'system.universalWeaponDamageDice': 'Universal: Weapon Damage (Dice Bonus)',
      'system.universalSpellDamageBonus': 'Universal: Spell Damage (Flat Bonus)',
      'system.universalSpellDamageDice': 'Universal: Spell Damage (Dice Bonus)',
      'system.universalAlchemicalDamageBonus': 'Universal: Alchemical Damage (Flat Bonus)',
      'system.universalAlchemicalDamageDice': 'Universal: Alchemical Damage (Dice Bonus)',
      'system.spellDamageDieSize': 'Spell: Damage Die Size (e.g., 6 for d6, 8 for d8)',

      // -- NEW: Speed Bonus --
      'system.speed.bonus': 'Speed: Bonus (Flat Add)',

      // ===== STATS =====
      'system.stats.might.value': 'Stat: Might',
      'system.stats.might.bonus': 'Stat: Might Bonus',
      'system.stats.dexterity.value': 'Stat: Dexterity',
      'system.stats.dexterity.bonus': 'Stat: Dexterity Bonus',
      'system.stats.awareness.value': 'Stat: Awareness',
      'system.stats.awareness.bonus': 'Stat: Awareness Bonus',
      'system.stats.reason.value': 'Stat: Reason',
      'system.stats.reason.bonus': 'Stat: Reason Bonus',
      'system.stats.presence.value': 'Stat: Presence',
      'system.stats.presence.bonus': 'Stat: Presence Bonus',
      'system.stats.luck.value': 'Stat: Luck',
      'system.stats.luck.bonus': 'Stat: Luck Bonus',

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
      'system.threatLevel': 'NPC: Threat Level',
      'system.hd': 'NPC: Hit Dice (HP)',
      'system.morale': 'NPC: Morale',
      'system.appearing': 'NPC: Number Appearing',
      'system.speed': 'NPC: Speed (Flat)',
      'system.senses': 'NPC: Senses',
      'system.armor': 'NPC: Armor Value',
      'system.armorBonus': 'Armor: Global Bonus (Flat Add)',
      'system.armorDescription': 'NPC: Armor Description',
      'system.locked': 'NPC: Locked Mode',
      'system.statusImmunities': 'NPC: Status Immunities (Array)',
      'system.zone': 'NPC: Combat Zone',

      // ===== DERIVED VALUES (Generally not recommended to modify directly) =====
      // These are included for advanced use cases
      // 'system.armor': 'Armor (Calculated)', // Duplicate
      'system.speed.base': 'Speed: Base (Calculated)',
      'system.speed.crawl': 'Speed: Crawl (Calculated)',
      'system.speed.travel': 'Speed: Travel (Calculated)',
      'system.maxLuck': 'Max Luck (Calculated)',
      'system.inventory.maxSlots': 'Inventory: Max Slots (Calculated)',
      'system.mana.max': 'Mana: Max Total (Class + Bonus)',
      'system.mana.castingMax': 'Mana: Casting Max (Calculated)',
      
      // ===== ITEM / GLOBAL BONUSES  =====
      'system.canExplode': 'Item: Can Explode (Direct)',
      'system.explodeValues': 'Item: Explode Values (Direct)',
      'system.bonuses.globalExplode': 'Global: Enable Exploding Dice (All Items)',
      'system.bonuses.globalExplodeValues': 'Global: Explode Values Override (All Items)',
      
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