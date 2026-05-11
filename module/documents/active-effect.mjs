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
 * ## Effect Keys (use "system." prefix — Foundry v13 convention)
 * - system.stats.might.bonus
 * - system.stats.dexterity.bonus
 * - system.stats.awareness.bonus
 * - system.stats.reason.bonus
 * - system.stats.presence.bonus
 * - system.stats.luck.bonus
 *
 * **IMPORTANT**: Always include the "system." prefix for all attribute keys in Foundry v13.
 * Using "stats.luck.bonus" (without "system.") will NOT work.
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
      'system.fatigue': 'Fatigue: Current Value',
      'system.fatigueBonus': 'Fatigue: Max Bonus',

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
      'system.inventory.boundsBonus': 'Inventory: Bonus Bounds',

      // ===== MANA =====
      'system.mana.current': 'Mana: Current',
      'system.mana.bonus': 'Mana: Max Bonus (Flat Add)', 
      'system.mana.castingMaxBonus': 'Mana: Casting Max Bonus (Flat Add)',

      // ===== GAME MECHANICS =====
      'system.favorHinder': 'Favor/Hinder State',
      'system.critNumber': 'Critical Hit Threshold (Global)',
      
      // -- Incoming Damage Reduction --
      'system.incomingDamageReductionPerDie': 'Incoming Damage Reduction Per Die (Berserk)',

      // -- Universal Crit Bonuses (stack on top of per-type bonuses) --
      'system.attackCritBonus': 'Crit: All Weapon Attacks (melee/ranged/brawl/finesse)',
      'system.castCritBonus': 'Crit: All Spell Casts',
      // -- Specific Crit Bonuses (Lower is better, e.g. -1 for 19-20) --
      'system.meleeCritBonus': 'Crit: Melee Threshold Bonus (-1 for 19-20)',
      'system.rangedCritBonus': 'Crit: Ranged Threshold Bonus (-1 for 19-20)',
      'system.brawlCritBonus': 'Crit: Brawl Threshold Bonus (-1 for 19-20)',
      'system.finesseCritBonus': 'Crit: Finesse Threshold Bonus (-1 for 19-20)',
      'system.reflexCritBonus': 'Crit: Reflex Save Threshold Bonus (-1 for 19-20)',
      'system.endureCritBonus': 'Crit: Endure Save Threshold Bonus (-1 for 19-20)',

      'system.bonusLuck': 'Bonus Luck',
      'system.currentLuck': 'Current Luck Pool',
      'system.studiedDice': 'Studied Dice Pool',
      'system.bonuses.hpPerLevel': 'Bonus: HP Per Level',
      'system.bonuses.spellManaCostReduction': 'Bonus: Spell Mana Cost Reduction',
      'system.bonuses.deliveryManaCostReduction': 'Bonus: Delivery Mana Cost Reduction',

      // -- Focus (Character spellcasters) --
      'system.focus.maxBonus': 'Focus: Max Bonus (ADD)',

      // -- Combat Modifiers (applied by status conditions, usable in AEs) --
      'system.incomingHealingModifier': 'Incoming Healing Modifier (number, e.g. -1 to block healing)',
      'system.incomingAttacksModifier': 'Incoming Attacks Modifier (none / favor / hinder)',
      'system.outgoingSavesModifier': 'Outgoing Saves Modifier (none / favor / hinder)',
      'system.autoFailAllRolls': 'Auto-Fail All Rolls (true/false)',
      'system.autoFailStats': 'Auto-Fail Specific Stats (ADD stat key, e.g. might)',
      'system.defenderStatusModifiers.attackersAreBlinded': 'Defender: Attackers Are Blinded (true/false)',
      'system.defenderStatusModifiers.closeAttacksAutoCrit': 'Defender: Close Attacks Auto-Crit (true/false)',

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
      
      // -- Specific Die Size Bonuses --
      'system.meleeDamageDieSizeBonus': 'Melee: Damage Die Size Bonus (+2 for d8)',
      'system.rangedDamageDieSizeBonus': 'Ranged: Damage Die Size Bonus (+2 for d8)',
      'system.brawlDamageDieSizeBonus': 'Brawl: Damage Die Size Bonus (+2 for d8)',
      'system.finesseDamageDieSizeBonus': 'Finesse: Damage Die Size Bonus (+2 for d8)',
      'system.spellDamageDieSizeBonus': 'Spell: Damage Die Size Bonus (Adds to d6)',

      // -- Weapon Property Bonuses --
      'system.cleaveTargets': 'Cleave: Extra Targets (ADD bonus, base 2)',
      'system.brutalDice': 'Brutal: Extra Crit Dice (ADD bonus, base 1)',

      // -- NEW: Speed Bonus --
      'system.speed.bonus': 'Speed: Bonus (Flat Add)',

      // ===== STATS (dynamic from homebrew config) =====
      ...Object.fromEntries(
        (CONFIG.VAGABOND.homebrew?.stats ?? []).flatMap(s => [
          [`system.stats.${s.key}.value`, `Stat: ${s.label}`],
          [`system.stats.${s.key}.bonus`, `Stat: ${s.label} Bonus`],
        ])
      ),

      // ===== SAVES (dynamic from homebrew config) =====
      ...Object.fromEntries(
        (CONFIG.VAGABOND.homebrew?.saves ?? []).map(s => [
          `system.saves.${s.key}.bonus`, `Save: ${s.label} Bonus`,
        ])
      ),

      // ===== SKILLS (dynamic from homebrew config, includes weapon skills) =====
      ...Object.fromEntries(
        (CONFIG.VAGABOND.homebrew?.skills ?? []).flatMap(s => [
          [`system.skills.${s.key}.trained`, `Skill: ${s.label} (Trained)`],
          [`system.skills.${s.key}.bonus`, `Skill: ${s.label} Bonus`],
        ])
      ),

      // ===== DAMAGE IMMUNITIES & WEAKNESSES =====
      'system.immunities': 'Damage Immunities (Array)',
      'system.weaknesses': 'Damage Weaknesses (Array)',
      'system.statusImmunities': 'Status Immunities (Array — both Character and NPC)',
      'system.statusResistances': 'Status Resistances — save with Favor (Array, Character only)',

      // ===== NPC-SPECIFIC VARIABLES =====
      'system.cr': 'NPC: Challenge Rating',
      'system.threatLevel': 'NPC: Threat Level',
      'system.hd': 'NPC: Hit Dice (HP)',
      'system.morale': 'NPC: Morale',
      'system.appearing': 'NPC: Number Appearing',
      'system.speed': 'NPC: Speed (Flat)',
      'system.speedValues.climb': 'NPC: Climb Speed',
      'system.speedValues.cling': 'NPC: Cling Speed',
      'system.speedValues.fly': 'NPC: Fly Speed',
      'system.speedValues.phase': 'NPC: Phase Speed',
      'system.speedValues.swim': 'NPC: Swim Speed',
      'system.senses': 'NPC: Senses',
      'system.armor': 'NPC: Armor Value',
      'system.armorBonus': 'Armor: Global Bonus (Flat Add)',
      'system.armorDescription': 'NPC: Armor Description',
      'system.zone': 'NPC: Combat Zone',

      // ===== ITEM / GLOBAL BONUSES =====
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

  /**
   * Override apply to fix system.speed.bonus on NPC actors.
   *
   * The 'dead' status (and any custom AE) uses system.speed.bonus, which is valid for
   * character actors (SchemaField with an ArrayField bonus). NPC actors store speed as a
   * plain NumberField at system.speed with no bonus sub-field. Foundry's setProperty
   * would replace the number with {} when traversing "speed.bonus", corrupting the field
   * and causing [object Object] to appear in the speed input.
   *
   * Fix: redirect system.speed.bonus → system.speed for NPC actors.
   */
  apply(actor, change) {
    if (actor.type === 'npc' && change.key === 'system.speed.bonus') {
      const npcChange = foundry.utils.deepClone(change);
      npcChange.key = 'system.speed';
      npcChange.mode = CONST.ACTIVE_EFFECT_MODES.OVERRIDE;
      npcChange.value = '0';
      return super.apply(actor, npcChange);
    }
    return super.apply(actor, change);
  }
}