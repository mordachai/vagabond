# Formula Autocomplete Guide

## Overview

Active Effect **Effect Value** fields now support autocomplete for formula variables! This makes it much easier to create scaling perks and dynamic effects.

## How to Use

1. **Open an Active Effect configuration** (on any item or actor)
2. **Add a new effect change** (click the + button)
3. **Select an Attribute Key** (what you want to modify)
4. **In the Effect Value field**, start typing `@` to see autocomplete suggestions
5. **Select a variable** from the dropdown or continue typing

## Features

### ✅ Autocomplete Dropdown
- Type `@` to trigger autocomplete suggestions
- Shows all available variables with descriptions
- Includes stats, attributes, skills, and more

### ✅ Visual Hints
- Formula hint appears when you type `@`
- Code icon appears next to value fields
- Monospace font for easier formula reading

### ✅ Built-in Documentation
- Click "Formula Support for Effect Values" in the config window
- See examples of common scaling perks
- Reference list of all available variables

## Available Variables

### Character Progression (Attributes)
```
@attributes.level.value          → Character level (1-20)
@attributes.xp                   → Experience points
@attributes.isSpellcaster        → Is spellcaster (boolean)
@attributes.manaMultiplier       → Mana multiplier from class
@attributes.castingStat          → Casting stat name (e.g., "reason")
@attributes.manaSkill            → Mana skill name (e.g., "arcana")
@attributes.size                 → Size category
@attributes.beingType            → Being type
```

### Stats (6 Core Stats)
```
@might.value                     → Base Might (0-12)
@might.total                     → Might with bonuses
@dexterity.value                 → Base Dexterity
@dexterity.total                 → Dexterity with bonuses
@awareness.value                 → Base Awareness
@awareness.total                 → Awareness with bonuses
@reason.value                    → Base Reason
@reason.total                    → Reason with bonuses
@presence.value                  → Base Presence
@presence.total                  → Presence with bonuses
@luck.value                      → Base Luck
@luck.total                      → Luck with bonuses

Alternative paths:
@stats.might.value               → Same as @might.value
@stats.might.total               → Same as @might.total
(etc. for all stats)
```

### Skills
```
@skills.arcana.trained           → Is trained in Arcana (boolean)
@skills.arcana.difficulty        → Arcana difficulty
@skills.craft.trained
@skills.medicine.trained
@skills.brawl.trained
@skills.finesse.trained
@skills.sneak.trained
@skills.detect.trained
@skills.mysticism.trained
@skills.survival.trained
@skills.influence.trained
@skills.leadership.trained
@skills.performance.trained
```

### Weapon Skills
```
@weaponSkills.melee.trained
@weaponSkills.brawl.trained
@weaponSkills.finesse.trained
@weaponSkills.ranged.trained
```

### Saves
```
@saves.reflex.difficulty
@saves.endure.difficulty
@saves.will.difficulty
```

### Shorthand
```
@lvl                             → Same as @attributes.level.value
```

### NPCs Only
```
@hd                              → Hit Dice
@threatLevel                     → Threat Level
```

### New Mana & Spell Bonuses
```
@bonuses.spellManaCostReduction  → Total mana reduction for spells
@bonuses.deliveryManaCostReduction → Mana reduction for spell deliveries
@spellDamageDieSizeBonus         → Bonus to base spell die (adds to d6)
@spellDamageDieSize              → Final spell die size (e.g. 8 for d8)
```

### Math Functions
```
floor(x)                         → Round down
ceil(x)                          → Round up
round(x)                         → Round to nearest
abs(x)                           → Absolute value
min(a, b)                        → Minimum of two values
max(a, b)                        → Maximum of two values
```

## Example Formulas

### Simple Level Scaling
```
Attribute Key: system.mana.castingMaxBonus
Effect Value: @attributes.level.value
Result: +1 per level
```

### Half Level (Rounded Down)
```
Attribute Key: system.stats.might.bonus
Effect Value: floor(@attributes.level.value / 2)
Result: +0 at L1, +1 at L2-3, +2 at L4-5, etc.
```

### Stat-Based Bonus
```
Attribute Key: system.armorBonus
Effect Value: @stats.dexterity.total
Result: Armor = Dexterity score
```

### Complex Formula
```
Attribute Key: system.health.bonus
Effect Value: (@might.value * 2) + @attributes.level.value
Result: (Might × 2) + Level
```

### Multiple Stats
```
Attribute Key: system.universalCheckBonus
Effect Value: floor((@might.total + @reason.total) / 4)
Result: (Might + Reason) / 4, rounded down
```

### Conditional Scaling
```
Attribute Key: system.bonuses.hpPerLevel
Effect Value: max(1, floor(@attributes.level.value / 3))
Result: Minimum 1, scales every 3 levels
```

## Common Scaling Perks

### Secret of Mana
*Grants +Level to Casting Max*
- **Attribute Key:** `system.mana.castingMaxBonus`
- **Change Mode:** Add
- **Effect Value:** `@attributes.level.value`
- **Result:** Casting Max increases by 1 per level

### Tough
*Grants +1 HP per Level*
- **Attribute Key:** `system.bonuses.hpPerLevel`
- **Change Mode:** Add
- **Effect Value:** `1`
- **Result:** Grants +Level HP total

### Battle Hardened
*Grants +Level/2 to Max HP*
- **Attribute Key:** `system.health.bonus`
- **Change Mode:** Add
- **Effect Value:** `floor(@attributes.level.value / 2)`
- **Result:** Flat HP bonus that scales

### Arcane Armor
*Armor = Reason*
- **Attribute Key:** `system.armorBonus`
- **Change Mode:** Add
- **Effect Value:** `@stats.reason.total`
- **Result:** Armor bonus equal to Reason

### Savage Attacker
*Damage = Might*
- **Attribute Key:** `system.universalWeaponDamageBonus`
- **Change Mode:** Add
- **Effect Value:** `@stats.might.total`
- **Result:** All weapon attacks gain +Might damage

### Spell Savant
*Spell Damage = Level/3*
- **Attribute Key:** `system.universalSpellDamageBonus`
- **Change Mode:** Add
- **Effect Value:** `floor(@attributes.level.value / 3)`
- **Result:** Spell damage scales with level

### Efficient Delivery
*Spell Deliveries cost 1 less mana*
- **Attribute Key:** `system.bonuses.deliveryManaCostReduction`
- **Change Mode:** Add
- **Effect Value:** `1`
- **Result:** Reduces base delivery cost (e.g., Cone becomes 0, Remote becomes 1)

### Master Spellcaster
*All spells cost 1 less mana*
- **Attribute Key:** `system.bonuses.spellManaCostReduction`
- **Change Mode:** Add
- **Effect Value:** `(@lvl >= 5) ? 1 : 0`
- **Result:** Grants 1 mana reduction starting at Level 5

### Empowered Magic
*Spells deal d8 damage instead of d6*
- **Attribute Key:** `system.spellDamageDieSizeBonus`
- **Change Mode:** Add
- **Effect Value:** `2`
- **Result:** Increases base d6 to d8 (6 + 2 = 8)

### Spell-Slinger (Sorcery Feature)
*At Level 2+, crits on 19+ and deals d8 damage*
- **Effect 1 (Crit):**
  - **Attribute Key:** `system.spellCritBonus`
  - **Value:** `(@lvl >= 2) ? -1 : 0`
- **Effect 2 (Damage):**
  - **Attribute Key:** `system.spellDamageDieSizeBonus`
  - **Value:** `(@lvl >= 2) ? 2 : 0`
- **Result:** Feature automatically activates once the character reaches Level 2.

### Giant's Belt
*Inventory Slots = +Level/2*
- **Attribute Key:** `system.inventory.bonusSlots`
- **Change Mode:** Add
- **Effect Value:** `floor(@attributes.level.value / 2)`
- **Result:** Gain slots as you level

## Tips

1. **Start with simple formulas** - Test with `@attributes.level.value` first
2. **Use .total for stats** - `.total` includes bonuses, `.value` is base only
3. **Test thoroughly** - Open character sheet and verify calculations
4. **Use floor() for whole numbers** - Prevents decimal bonuses
5. **Check console for errors** - Invalid formulas log warnings but don't crash
6. **Formulas evaluate on sheet open** - Changes take effect immediately

## Backward Compatibility

- ✅ Existing numeric effects (e.g., "5", "10") work unchanged
- ✅ Empty values default to 0
- ✅ Invalid formulas default to 0 with console warning
- ✅ No migration needed

## Technical Notes

- Formulas are evaluated in `prepareDerivedData()`
- Uses Foundry's `Roll.replaceFormulaData()` and `Roll.safeEval()`
- Formula evaluation happens after stat totals are calculated
- All 56 bonus fields support formulas (stats, saves, skills, damage, etc.)

## Files Modified

1. `module/applications/active-effect-config.mjs` - Autocomplete logic
2. `src/scss/components/_effects.scss` - Styling
3. `templates/effects/active-effect-config-fields.hbs` - Help documentation
4. `module/data/actor-character.mjs` - Formula evaluation
5. `module/data/actor-npc.mjs` - Formula evaluation
6. `module/documents/active-effect.mjs` - Documentation

---

**Ready to use!** Open any Active Effect and try typing `@` in the Effect Value field.
