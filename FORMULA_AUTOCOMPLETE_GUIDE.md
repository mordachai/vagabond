# Formula Autocomplete Guide

## Overview

Active Effect **Effect Value** fields support autocomplete for formula variables. This makes it easy to create scaling perks and dynamic effects.

## How to Use

1. **Open an Active Effect configuration** (on any item or actor)
2. **Add a new effect change** (click the + button)
3. **Select an Attribute Key** (what you want to modify)
4. **In the Effect Value field**, start typing `@` to see autocomplete suggestions
5. **Select a variable** from the dropdown or continue typing

---

## Available Variables

### Character Progression

```txt
@attributes.level.value          → Character level (1-20)
@lvl                             → Shorthand for @attributes.level.value
@attributes.xp                   → Experience points
@attributes.isSpellcaster        → Is spellcaster (boolean)
@attributes.manaMultiplier       → Mana multiplier from class
@attributes.castingStat          → Casting stat name (e.g., "reason")
@attributes.manaSkill            → Mana skill name (e.g., "arcana")
@attributes.size                 → Size category
@attributes.beingType            → Being type
```

### Stats (6 Core Stats)

```txt
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

Alternative paths (same values):
@stats.might.value / @stats.might.total
@stats.dexterity.value / @stats.dexterity.total
(etc. for all stats)
```

### Skills

```txt
@skills.arcana.trained           → Is trained in Arcana (boolean)
@skills.arcana.difficulty        → Arcana difficulty
@skills.craft.trained
@skills.medicine.trained
@skills.brawl.trained
@skills.finesse.trained
@skills.melee.trained
@skills.ranged.trained
@skills.sneak.trained
@skills.detect.trained
@skills.mysticism.trained
@skills.survival.trained
@skills.influence.trained
@skills.leadership.trained
@skills.performance.trained
```

### Saves

```txt
@saves.reflex.difficulty
@saves.endure.difficulty
@saves.will.difficulty
```

### Status Conditions

All active status conditions are exposed as `@statuses.<id>` — returns `1` if active, `0` (or missing) if not.

```txt
@statuses.berserk
@statuses.blinded
@statuses.burning
@statuses.frightened
@statuses.prone
@statuses.dazed
(any other status ID)
```

Use these in AE formulas on class items to apply bonuses only while a status is active:
`(@statuses.berserk) ? 2 : 0`

### Universal Bonuses

```txt
@universalCheckBonus             → Universal bonus to all checks
@universalDamageBonus            → Universal bonus to all damage
@universalDamageDice             → Universal extra damage dice (string, e.g. "1d4")
```

### Mana Bonuses

```txt
@bonuses.spellManaCostReduction       → Total mana reduction for spells
@bonuses.deliveryManaCostReduction    → Mana reduction for spell deliveries
```

### Damage Die Size Bonuses

```txt
@spellDamageDieSizeBonus         → Bonus added to base spell die size (e.g. +2 → d6 becomes d8)
@meleeDamageDieSizeBonus
@rangedDamageDieSizeBonus
@brawlDamageDieSizeBonus
@finesseDamageDieSizeBonus
```

### Crit Bonuses

Negative values lower the crit threshold (e.g. `-1` = crit on 19-20). Universal bonuses stack on top of per-type bonuses.

```txt
@attackCritBonus                 → All weapon attacks (melee/ranged/brawl/finesse)
@castCritBonus                   → All spell casts
@meleeCritBonus                  → Melee only
@rangedCritBonus                 → Ranged only
@brawlCritBonus                  → Brawl only
@finesseCritBonus                → Finesse only
@reflexCritBonus                 → Reflex save
@endureCritBonus                 → Endure save
```

### NPCs Only

```txt
@cr                              → Challenge Rating
@hd                              → Hit Dice
@threatLevel                     → Threat Level
```

### Math Functions

```txt
floor(x)                         → Round down
ceil(x)                          → Round up
round(x)                         → Round to nearest
abs(x)                           → Absolute value
min(a, b)                        → Minimum of two values
max(a, b)                        → Maximum of two values
(condition) ? valueA : valueB    → Ternary / conditional
```

---

## Example Formulas

### Simple Level Scaling

```txt
Attribute Key: system.mana.castingMaxBonus
Effect Value:  @lvl
Result: +1 per level
```

### Half Level (Rounded Down)

```txt
Attribute Key: system.stats.might.bonus
Effect Value:  floor(@lvl / 2)
Result: +0 at L1, +1 at L2-3, +2 at L4-5, etc.
```

### Stat-Based Bonus

```txt
Attribute Key: system.armorBonus
Effect Value:  @stats.dexterity.total
Result: Armor bonus equal to Dexterity score
```

### Conditional (Activates at a Level Threshold)

```txt
Effect Value:  (@lvl >= 4) ? -1 : 0
Result: Gives -1 only when the character is level 4 or higher
```

---

## Common Scaling Perks

### Tough

Grants +1 HP per Level.

- **Attribute Key:** `system.bonuses.hpPerLevel`
- **Change Mode:** Add
- **Effect Value:** `1`

### Battle Hardened

Grants +Level/2 flat HP.

- **Attribute Key:** `system.health.bonus`
- **Change Mode:** Add
- **Effect Value:** `floor(@lvl / 2)`

### Arcane Armor

Armor bonus equals Reason.

- **Attribute Key:** `system.armorBonus`
- **Change Mode:** Add
- **Effect Value:** `@stats.reason.total`

### Savage Attacker

All weapon attacks deal +Might damage.

- **Attribute Key:** `system.universalWeaponDamageBonus`
- **Change Mode:** Add
- **Effect Value:** `@stats.might.total`

### Spell Savant

Spell damage scales with level.

- **Attribute Key:** `system.universalSpellDamageBonus`
- **Change Mode:** Add
- **Effect Value:** `floor(@lvl / 3)`

### Empowered Magic

Spells deal d8 instead of d6.

- **Attribute Key:** `system.spellDamageDieSizeBonus`
- **Change Mode:** Add
- **Effect Value:** `2`
- **Note:** Base die is 6, +2 = 8 → d8

### Spell-Slinger

Crits on spells on 19+ starting at Level 2.

- **Attribute Key:** `system.castCritBonus`
- **Change Mode:** Add
- **Effect Value:** `(@lvl >= 2) ? -1 : 0`

### Fighter — Valor

Crit threshold for all attacks and defensive saves reduces at levels 1, 4, and 8.

Add **3 changes** per affected key — all with Change Mode **Add**. Apply to each of:
`system.attackCritBonus`, `system.castCritBonus`, `system.reflexCritBonus`, `system.endureCritBonus`.

| # | Effect Value | When it activates |
|---|---|---|
| 1 | `-1` | Level 1+ (always, since it's on the class item) |
| 2 | `(@lvl >= 4) ? -1 : 0` | Level 4+ |
| 3 | `(@lvl >= 8) ? -1 : 0` | Level 8+ |

Result: −1 at L1, −2 at L4, −3 at L8.

### Barbarian — Berserk Bonuses

While Berserk with Light or No Armor: attack dice one size larger, dice explode on max, +1 flat per die rolled, reduce incoming damage by 1 per die.

These AEs live on the **Barbarian class item** (permanent mode). They use `@statuses.berserk` so they only activate while the character has the Berserk status — non-Barbarians never get these bonuses even if they also go Berserk.

| Attribute Key | Mode | Effect Value | Result |
| --- | --- | --- | --- |
| `system.meleeDamageDieSizeBonus` | Add | `(@statuses.berserk) ? 2 : 0` | Melee die one size larger (d6→d8) |
| `system.brawlDamageDieSizeBonus` | Add | `(@statuses.berserk) ? 2 : 0` | Brawl die one size larger |
| `system.finesseDamageDieSizeBonus` | Add | `(@statuses.berserk) ? 2 : 0` | Finesse die one size larger |
| `system.bonuses.globalExplode` | Add | `(@statuses.berserk) ? 1 : 0` | Enables exploding dice on all attacks |
| `system.bonuses.globalExplodeValues` | Override | `max` | Dice explode on their max face (d6 on 6, d8 on 8, etc.) |
| `system.bonusPerDamageDie` | Add | `(@statuses.berserk) ? 1 : 0` | +1 flat damage per die rolled (including explosions) |
| `system.incomingDamageReductionPerDie` | Add | `(@statuses.berserk) ? 1 : 0` | −1 per incoming die (light/no armor enforced in code) |

> **`globalExplodeValues = max`** is a special keyword — it resolves to the die's own max face at roll time, so it works correctly regardless of weapon die size.
> The Override on `globalExplodeValues` is permanent but harmless — it has no effect while `globalExplode` is 0.

### Exalted — Bonus Per Damage Die (with Doubling vs Specific Being Types)

Grants a flat bonus per damage die rolled. When attacking Undead (or other configured types), the bonus is doubled.

| Attribute Key | Mode | Effect Value | Result |
| --- | --- | --- | --- |
| `system.bonusPerDamageDie` | Add | `1` | +1 per die on all damage rolls |
| `system.bonusPerDamageDieDoubleVsBeingTypes` | Add | `Undead` | Doubles the per-die bonus vs Undead targets |
| `system.bonusPerDamageDieDoubleVsBeingTypes` | Add | `Hellspawn` | Also doubles vs Hellspawn (add one entry per type) |

> Each `bonusPerDamageDieDoubleVsBeingTypes` entry is an exact being type name (must match config). Add multiple entries with separate ADD changes — one type per line.
> Doubling is checked against the **target's** being type when the attack is made.

### Save vs Status Bonus

Grants a bonus to saves against specific conditions. Each entry is a string in the format `statusId:saveKey:value`.

| Attribute Key | Mode | Effect Value | Result |
| --- | --- | --- | --- |
| `system.saveVsStatusBonuses` | Add | `frightened:will:2` | +2 to Will saves to resist/end Frightened |
| `system.saveVsStatusBonuses` | Add | `poisoned:any:1` | +1 to all saves vs Poisoned |
| `system.saveVsStatusBonuses` | Add | `frightened:any:@lvl` | +Level to all saves vs Frightened |

> **Format:** `statusId:saveKey:value`
>
> - `statusId` — any status ID (e.g. `frightened`, `poisoned`, `burning`, `dazed`)
> - `saveKey` — `will`, `reflex`, `endure`, or `any` (matches all save types)
> - `value` — a number or a formula using `@` variables (e.g. `@lvl`, `floor(@lvl / 2)`)
>
> Add multiple entries with separate ADD changes. Each entry is evaluated independently at roll time.

---

## Tips

1. **Use `.total` for stats** — `.total` includes bonuses, `.value` is base only
2. **Use `floor()` for whole numbers** — prevents decimal bonuses
3. **Negative values lower crit thresholds** — e.g. `-1` means crit on 19-20
4. **Check console for errors** — invalid formulas log warnings and default to 0
5. **Formulas re-evaluate on every render** — changes take effect immediately

## Technical Notes

- Formulas are evaluated in `prepareDerivedData()` after stat totals are calculated
- Uses Foundry's `Roll.replaceFormulaData()` and `Roll.safeEval()`
- All bonus `ArrayField(StringField)` fields support formulas
- Dice notation (`1d8`) is skipped in synchronous bonus fields — use `universalDamageDice` fields for dice
- All AE attribute keys require the `system.` prefix (Foundry v13)
