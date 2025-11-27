# Vagabond System Variables

This document lists all system variables available on Character actors in the Vagabond TTRPG system. These variables can be affected by Active Effects to implement perks, features, ancestral traits, and other modifiers.

## Table of Contents

- [Base Actor Variables](#base-actor-variables)
- [Attributes](#attributes)
- [Currency](#currency)
- [Inventory](#inventory)
- [Mana](#mana)
- [Game Mechanics](#game-mechanics)
- [Stats](#stats)
- [Saves](#saves)
- [Skills](#skills)
- [Weapon Skills](#weapon-skills)
- [Damage Mechanics](#damage-mechanics)
- [Derived/Calculated Values](#derivedcalculated-values)

---

## Base Actor Variables

These variables are inherited from the base actor class and available to all actor types.

| Variable | Type | Default | Min | Max | Description |
|----------|------|---------|-----|-----|-------------|
| `system.health.value` | Number | 10 | 0 | - | Current hit points |
| `system.health.max` | Number | 10 | - | - | Maximum hit points (calculated as Might + Level) |
| `system.power.value` | Number | 5 | 0 | - | Current power points |
| `system.power.max` | Number | 5 | - | - | Maximum power points |
| `system.fatigue` | Number | 0 | 0 | 5 | Fatigue level (0-5 skulls) |
| `system.biography` | HTML | "" | - | - | Character biography text |

---

## Attributes

Character attributes track level, experience, and physical characteristics.

| Variable | Type | Default | Min | Max | Description |
|----------|------|---------|-----|-----|-------------|
| `system.attributes.level.value` | Number | 1 | - | - | Character level |
| `system.attributes.xp` | Number | 0 | 0 | - | Experience points |
| `system.attributes.size` | String | null | - | - | Size category: tiny, small, medium, large, huge, gargantuan |
| `system.attributes.beingType` | String | null | - | - | Being type (set by ancestry) |

---

## Currency

Wealth tracking in gold, silver, and copper.

| Variable | Type | Default | Min | Max | Description |
|----------|------|---------|-----|-----|-------------|
| `system.currency.gold` | Number | 0 | 0 | - | Gold pieces |
| `system.currency.silver` | Number | 0 | 0 | - | Silver pieces |
| `system.currency.copper` | Number | 0 | 0 | - | Copper pieces |

---

## Inventory

Inventory capacity system based on Might stat.

| Variable | Type | Default | Min | Max | Description |
|----------|------|---------|-----|-----|-------------|
| `system.inventory.bonusSlots` | Number | 0 | - | - | Bonus inventory slots from perks/effects |

**Calculated values:**
- `system.inventory.maxSlots` - Calculated as: 8 + Might + bonusSlots
- `system.inventory.occupiedSlots` - Sum of slots from all equipped items
- `system.inventory.availableSlots` - maxSlots - occupiedSlots

---

## Mana

Mana system for spellcasters.

| Variable | Type | Default | Min | Max | Description |
|----------|------|---------|-----|-----|-------------|
| `system.mana.current` | Number | 0 | 0 | - | Current mana points |

**Calculated values:**
- `system.mana.max` - Calculated as: Mana Multiplier × Level (from class)
- `system.mana.castingMax` - Calculated as: Casting Stat + ⌈Level/2⌉ (max cost per spell)

---

## Game Mechanics

Special game mechanics and modifiers.

| Variable | Type | Default | Options | Description |
|----------|------|---------|---------|-------------|
| `system.favorHinder` | String | "none" | none, favor, hinder | Roll modifier state (±1d6 on next roll) |
| **`system.critNumber`** | **Number** | **20** | **1-20** | **Critical hit threshold - roll >= this number is a crit** |

### Critical Hit Threshold

The `critNumber` variable determines when a roll is considered a critical hit. By default, it's 20 (nat 20 only), but perks and features can lower this threshold:

**Examples:**
- `system.critNumber = 20` - Only natural 20s are crits (default)
- `system.critNumber = 19` - Rolls of 19-20 are crits
- `system.critNumber = 18` - Rolls of 18-20 are crits

**Active Effect Usage:**
```javascript
// Example: Perk that makes crits happen on 19-20
{
  "key": "system.critNumber",
  "mode": CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
  "value": 19
}
```

---

## Stats

The six core stats. Each stat is used for different skills and calculations.

| Variable | Type | Default | Min | Max | Description |
|----------|------|---------|-----|-----|-------------|
| `system.stats.might.value` | Number | 8 | 1 | 12 | Physical strength and endurance |
| `system.stats.dexterity.value` | Number | 8 | 1 | 12 | Agility, reflexes, and precision |
| `system.stats.awareness.value` | Number | 8 | 1 | 12 | Perception and alertness |
| `system.stats.reason.value` | Number | 8 | 1 | 12 | Intelligence and logic |
| `system.stats.presence.value` | Number | 8 | 1 | 12 | Charisma and force of personality |
| `system.stats.luck.value` | Number | 8 | 1 | 12 | Fortune and chance |

**Calculated from stats:**
- Speed (based on Dexterity)
- Armor (from equipped armor items)
- Current Luck (equals Luck stat value)

---

## Saves

Saving throws are calculated from stats. These are read-only calculated values.

| Save | Formula | Description |
|------|---------|-------------|
| Reflex | 20 - (DEX + AWR) | Avoid area effects and attacks |
| Endure | 20 - (MIT + MIT) | Withstand poison and death |
| Will | 20 - (RSN + PRS) | Resist curses and enthrallment |

**Calculated values (read-only):**
- `system.saves.reflex.difficulty`
- `system.saves.endure.difficulty`
- `system.saves.will.difficulty`

---

## Skills

General skills use the format: `system.skills.{skillName}.trained`

### Reason-based Skills
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `system.skills.arcana.trained` | Boolean | false | Knowledge of magic and the arcane |
| `system.skills.craft.trained` | Boolean | false | Creating and repairing items |
| `system.skills.medicine.trained` | Boolean | false | Healing and medical knowledge |

### Might-based Skills
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `system.skills.brawl.trained` | Boolean | false | Unarmed combat |

### Dexterity-based Skills
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `system.skills.finesse.trained` | Boolean | false | Precise and delicate work |
| `system.skills.sneak.trained` | Boolean | false | Moving silently and hiding |

### Awareness-based Skills
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `system.skills.detect.trained` | Boolean | false | Noticing hidden things |
| `system.skills.mysticism.trained` | Boolean | false | Understanding supernatural phenomena |
| `system.skills.survival.trained` | Boolean | false | Wilderness survival |

### Presence-based Skills
| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `system.skills.influence.trained` | Boolean | false | Persuasion and negotiation |
| `system.skills.leadership.trained` | Boolean | false | Inspiring and commanding others |
| `system.skills.performance.trained` | Boolean | false | Entertaining and artistic expression |

**Skill Difficulty Calculation:**
- Untrained: `20 - Stat`
- Trained: `20 - (Stat × 2)`

---

## Weapon Skills

Weapon skills for combat. Format: `system.weaponSkills.{skillName}.trained`

| Variable | Type | Default | Stat | Description |
|----------|------|---------|------|-------------|
| `system.weaponSkills.melee.trained` | Boolean | false | Might | Heavy melee weapons |
| `system.weaponSkills.brawl.trained` | Boolean | false | Might | Unarmed and natural weapons |
| `system.weaponSkills.finesse.trained` | Boolean | false | Dexterity | Light, precise weapons |
| `system.weaponSkills.ranged.trained` | Boolean | false | Awareness | Bows, crossbows, thrown weapons |

**Weapon Skill Difficulty Calculation:**
- Untrained: `20 - Stat`
- Trained: `20 - (Stat × 2)`

---

## Damage Mechanics

Damage calculation follows RAW (Rules as Written) with three core mechanics: **Armor**, **Immune**, and **Weak**.

### Damage Immunities and Weaknesses

Characters can have immunities and weaknesses to specific damage types, typically granted via items with Active Effects.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `system.immunities` | Array | [] | Damage types the character is immune to (take 0 damage) |
| `system.weaknesses` | Array | [] | Damage types the character is weak to (ignores armor/immunity, extra die) |

**Damage Types:**
- `acid`, `fire`, `shock`, `poison`, `cold` (elemental)
- `blunt`, `physical`, `piercing`, `slashing` (physical)
- `necrotic`, `psychic`, `healing`

### RAW Damage Calculation

When damage is applied to a character, the system calculates final damage in this order:

1. **Weak** - If target has weakness to damage type:
   - Ignores all armor rating
   - Ignores all immunities
   - Takes full damage (extra die handled at roll time)

2. **Immune** - If target is immune to damage type:
   - Takes 0 damage
   - Sources: `system.immunities` array + equipped armor immunities

3. **Armor** - Physical damage types only:
   - Armor rating subtracted from damage
   - Only applies to: `blunt`, `physical`, `piercing`, `slashing`
   - Formula: `finalDamage = max(0, baseDamage - armorRating)`

### Equipment Immunities

Armor Equipment items can grant immunities via their `immunities` array field. These are combined with the character's own immunities when calculating damage.

**Example:** Fire-resistant plate armor with `immunities: ['fire']` grants fire immunity when equipped.

### Active Effect Examples

#### Grant Fire Immunity
```javascript
{
  "key": "system.immunities",
  "mode": CONST.ACTIVE_EFFECT_MODES.ADD,
  "value": "fire"
}
```

#### Grant Cold Weakness
```javascript
{
  "key": "system.weaknesses",
  "mode": CONST.ACTIVE_EFFECT_MODES.ADD,
  "value": "cold"
}
```

#### Grant Multiple Immunities (via multiple effects)
```javascript
// Effect 1
{
  "key": "system.immunities",
  "mode": CONST.ACTIVE_EFFECT_MODES.ADD,
  "value": "fire"
}
// Effect 2
{
  "key": "system.immunities",
  "mode": CONST.ACTIVE_EFFECT_MODES.ADD,
  "value": "poison"
}
```

---

## Derived/Calculated Values

These values are automatically calculated and should generally NOT be modified directly via Active Effects. Modify the underlying stats instead.

| Variable | Calculation | Description |
|----------|-------------|-------------|
| `system.health.max` | Might + Level | Maximum hit points |
| `system.armor` | Sum of equipped armor | Total armor rating |
| `system.speed.base` | Based on DEX (25-50 ft) | Base movement speed |
| `system.speed.crawl` | Base × 3 | Crawling/difficult terrain speed |
| `system.speed.travel` | Base ÷ 5 | Travel speed in miles per day |
| `system.currentLuck` | Luck stat value | Current luck value |
| `system.inventory.maxSlots` | 8 + Might + bonusSlots | Maximum inventory capacity |
| `system.inventory.occupiedSlots` | Sum of item slots | Used inventory space |
| `system.inventory.availableSlots` | maxSlots - occupiedSlots | Free inventory space |
| `system.mana.max` | Multiplier × Level | Maximum mana (spellcasters only) |
| `system.mana.castingMax` | Stat + ⌈Level/2⌉ | Max cost per spell |

---

## Active Effect Examples

### Example 1: Increase Might by 2
```javascript
{
  "key": "system.stats.might.value",
  "mode": CONST.ACTIVE_EFFECT_MODES.ADD,
  "value": 2
}
```

### Example 2: Grant Training in Arcana
```javascript
{
  "key": "system.skills.arcana.trained",
  "mode": CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
  "value": true
}
```

### Example 3: Bonus Inventory Slots
```javascript
{
  "key": "system.inventory.bonusSlots",
  "mode": CONST.ACTIVE_EFFECT_MODES.ADD,
  "value": 3
}
```

### Example 4: Lower Crit Threshold (Keen Edge feature)
```javascript
{
  "key": "system.critNumber",
  "mode": CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
  "value": 19  // Now crits on 19-20
}
```

### Example 5: Add Bonus Max HP
```javascript
{
  "key": "system.health.max",
  "mode": CONST.ACTIVE_EFFECT_MODES.ADD,
  "value": 5
}
```

---

## Notes

1. **Stat Minimums/Maximums**: Stats range from 1-12 based on character creation rules
2. **Skill Training**: Skills are binary (trained/untrained) rather than ranked
3. **Calculated Values**: Many values are derived from stats and should not be directly modified
4. **Mana System**: Only available to characters with a spellcaster class
5. **Speed Thresholds**: Speed is determined by DEX value ranges (see character data model)
6. **Critical Hits**: The `critNumber` variable affects both weapon attacks and spell casting
7. **Damage Mechanics**: Immunities and weaknesses follow RAW (Armor/Immune/Weak) priority order
8. **Equipment Immunities**: Armor items can grant immunities which combine with character immunities
9. **Active Effects**: Immunities and weaknesses are typically granted by items via Active Effects
10. **No UI for Immunities/Weaknesses**: Character sheet does not display these - they're managed via effects

---

**Last Updated**: Session implementing Equipment items with immunities and RAW damage calculation (Armor/Immune/Weak)
**System Version**: Vagabond 3.0.0
