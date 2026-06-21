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

> The per-weapon-skill die-size keys (`@<skillKey>DamageDieSizeBonus`) are generated dynamically from the homebrew config — any custom weapon skill gets its own automatically. `@spellDamageDieSizeBonus` is the separate spell key.

### Crit Bonuses

Negative values lower the crit threshold (e.g. `-1` = crit on 19-20). Universal bonuses stack on top of per-type bonuses.

```txt
@attackCritBonus                 → All weapon attacks (every weapon skill)
@castCritBonus                   → All spell casts
@meleeCritBonus                  → Melee only
@rangedCritBonus                 → Ranged only
@brawlCritBonus                  → Brawl only
@finesseCritBonus                → Finesse only
@reflexCritBonus                 → Reflex save
@endureCritBonus                 → Endure save
@willCritBonus                   → Will save
```

> Both the per-weapon-skill keys (`@<skillKey>CritBonus`, for any skill flagged a weapon skill) and the per-save keys (`@<saveKey>CritBonus`) are generated dynamically from the homebrew config. Defaults shown above; custom weapon skills / saves get their own key automatically. `@attackCritBonus` applies to every weapon skill; `@castCritBonus` to all casts.

### NPCs Only

```txt
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

## Active Effects

This is the full list of **Attribute Keys** an Active Effect can target. These are the keys surfaced by the autocomplete dropdown in the AE config (`VagabondActiveEffect.getAttributeChoices()`). All keys require the `system.` prefix.

Most bonus keys are `ArrayField(StringField)` — use **Add** mode and a number or `@`-formula as the value; multiple effects stack (each entry is summed). A handful are plain number/string/boolean fields where **Override**/**Upgrade** modes make more sense; those are noted.

### Core Resources

```txt
system.health.value              → Current HP
system.health.max                → Max HP (derived; bonus normally added via health.bonus)
system.health.bonus              → Flat bonus added to Max HP
system.fatigue                   → Current fatigue value
system.fatigueBonus              → Bonus to maximum fatigue
```

### Character Attributes & Spellcasting

```txt
system.attributes.level.value    → Character level
system.attributes.xp             → Experience points
system.attributes.size           → Size category (string)
system.attributes.beingType      → Being type (string)
system.attributes.isSpellcaster  → Force spellcaster on/off (boolean override)
system.attributes.manaMultiplier → Mana-per-level multiplier
system.attributes.castingStat    → Casting stat key (e.g. "reason")
system.attributes.manaSkill      → Mana skill key (e.g. "arcana")
```

### Currency & Inventory

```txt
system.currency.gold             → Gold
system.currency.silver           → Silver
system.currency.copper           → Copper
system.inventory.bonusSlots      → Extra inventory slots
system.inventory.boundsBonus     → Extra bound-item slots (base 3)
```

### Mana & Focus

```txt
system.mana.current              → Current mana
system.mana.bonus                → Flat add to Max Mana
system.mana.castingMaxBonus      → Flat add to Casting Max
system.focus.maxBonus            → Bonus to max sustained-spell focus (base 5)
```

### Stats, Saves, Skills

These are generated dynamically from the homebrew config, so the exact keys depend on the configured stats/skills/saves.

```txt
system.stats.<stat>.value        → Base stat value
system.stats.<stat>.bonus        → Bonus to stat total (clamped 0–12)
system.saves.<save>.bonus        → Bonus to that save (lowers its difficulty)
system.skills.<skill>.trained    → Trained flag (boolean)
system.skills.<skill>.bonus      → Bonus to that skill (lowers its difficulty)
```

### Luck & Misc Pools

```txt
system.currentLuck               → Current luck pool
system.bonusLuck                 → Bonus to max luck
system.studiedDice               → Studied-die pool
system.critNumber                → Global crit threshold (default 20)
system.favorHinder               → Favor/Hinder state (string: none/favor/hinder)
```

### Universal Bonus Keys

```txt
system.universalCheckBonus       → Flat bonus to every d20 roll
system.universalDifficultyBonus  → Added to all skill/save difficulties (negative = easier)
system.universalDamageBonus      → Flat bonus to all damage
system.universalDamageDice       → Extra dice on all damage (string, e.g. "1d4")
```

### Per-Type Universal Damage

```txt
system.universalWeaponDamageBonus      → Flat bonus to weapon damage
system.universalWeaponDamageDice       → Extra dice on weapon damage
system.universalSpellDamageBonus       → Flat bonus to spell damage
system.universalSpellDamageDice        → Extra dice on spell damage
system.universalAlchemicalDamageBonus  → Flat bonus to alchemical damage
system.universalAlchemicalDamageDice   → Extra dice on alchemical damage
```

### Per-Die Flat Bonuses

Added once per damage die rolled (including exploded dice), so they scale with dice count.

```txt
system.bonusPerDamageDie               → Per-die bonus on all damage
system.weaponBonusPerDamageDie         → Per-die bonus on weapon damage
system.spellBonusPerDamageDie          → Per-die bonus on spell damage
system.alchemicalBonusPerDamageDie     → Per-die bonus on alchemical damage
system.bonusPerDamageDieDoubleVsBeingTypes
        → ADD a being-type name (e.g. "Undead"); doubles the per-die bonus vs that target type
```

### Damage Die Size Bonus Keys

Increase the die size of damage (each +2 steps up one die, d6→d8→d10…).

```txt
system.meleeDamageDieSizeBonus
system.rangedDamageDieSizeBonus
system.brawlDamageDieSizeBonus
system.finesseDamageDieSizeBonus
system.spellDamageDieSizeBonus         → Adds to the base spell die (config default d6)
```

> The per-weapon-skill keys (`system.<skillKey>DamageDieSizeBonus`) are generated dynamically from the homebrew config — custom weapon skills get their own automatically.

### Crit Threshold Bonus Keys

Negative values lower the threshold (e.g. `-1` = crit on 19–20). Universal keys stack on top of per-type keys.

```txt
system.attackCritBonus           → All weapon attacks
system.castCritBonus             → All spell casts
system.meleeCritBonus            → Melee only
system.rangedCritBonus           → Ranged only
system.brawlCritBonus            → Brawl only
system.finesseCritBonus          → Finesse only
system.reflexCritBonus           → Reflex save crit
system.endureCritBonus           → Endure save crit
system.willCritBonus             → Will save crit
```

> Per-weapon-skill keys (`system.<skillKey>CritBonus`) and per-save keys (`system.<saveKey>CritBonus`) are both generated dynamically from the homebrew config — custom weapon skills and saves get their own automatically.

### Weapon Property Bonuses

```txt
system.cleaveTargets             → Extra Cleave targets beyond the base 2
system.brutalDice                → Extra Brutal crit dice beyond the base 1
system.incomingDamageReductionPerDie → Reduce incoming damage by N per incoming die (Berserk)
```

### Armor & Speed

```txt
system.armorBonus                → Flat bonus to armor value (character)
system.speed.bonus               → Flat bonus to speed (character)
```

### Mana Cost Reductions

```txt
system.bonuses.hpPerLevel              → Bonus HP granted per level (× level)
system.bonuses.spellManaCostReduction  → Reduce total spell mana cost
system.bonuses.deliveryManaCostReduction → Reduce the delivery portion of spell mana cost
```

### Exploding Dice (Global)

```txt
system.bonuses.globalExplode         → Enable exploding dice on all rolls (Add > 0 = on)
system.bonuses.globalExplodeValues   → Override which faces explode (Override; "max" = die's top face)
```

### Save vs Status Bonus Key

```txt
system.saveVsStatusBonuses
        → ADD an entry "statusId:saveKey:value" (saveKey may be "any"; value supports @-formulas)
```

### Damage & Status Resistances

These are string arrays — use **Add** mode and supply the relevant ID as the value.

```txt
system.immunities                → Add a damage-type ID for immunity
system.weaknesses                → Add a damage-type ID for weakness
system.statusImmunities          → Add a status ID for immunity (character + NPC)
system.statusResistances         → Add a status ID; save vs it is rolled with Favor (character only)
```

### Status-Automation Modifiers

Normally driven by status conditions, but targetable directly by AEs.

```txt
system.incomingHealingModifier               → Flat modifier to healing received (e.g. -1 blocks)
system.incomingAttacksModifier               → none/favor/hinder for attacks against this actor
system.outgoingSavesModifier                 → none/favor/hinder applied to enemy saves vs this actor
system.autoFailAllRolls                      → Auto-fail every roll (boolean)
system.autoFailStats                         → ADD a stat key whose rolls auto-fail
system.defenderStatusModifiers.attackersAreBlinded   → Attackers treated as Blinded (boolean)
system.defenderStatusModifiers.closeAttacksAutoCrit  → Close attacks auto-crit (boolean)
```

### NPC-Only Keys

```txt
system.threatLevel               → Threat Level
system.hd                        → Hit Dice (drives Max HP)
system.morale                    → Morale
system.appearing                 → Number appearing
system.speed                     → Speed (flat NumberField; NPCs)
system.speedValues.climb         → Climb speed
system.speedValues.cling         → Cling speed
system.speedValues.fly           → Fly speed
system.speedValues.phase         → Phase speed
system.speedValues.swim          → Swim speed
system.senses                    → Senses (string)
system.armor                     → Armor value
system.armorBonus                → Global flat armor bonus
system.armorDescription          → Armor description (string)
system.zone                      → Combat zone (frontline/midline/backline)
```

### Item / Global Bonuses

```txt
system.canExplode                → Item can explode (direct, on item)
system.explodeValues             → Item explode values (direct, on item)
system.bonuses.globalExplode     → Enable exploding dice on all items
system.bonuses.globalExplodeValues → Explode-values override for all items
```

### Derived — Do Not Target

Active Effects apply **between** `prepareBaseData()` and `prepareDerivedData()`. The keys below are recomputed (overwritten) in `prepareDerivedData()`, so an AE pointed at them is silently discarded. Target the matching **bonus input** instead — that is what the derivation reads.

This is why you add to `system.health.bonus`, never `system.health.max`.

| Derived key (don't target) | Why | Use instead |
| --- | --- | --- |
| `system.health.max` | derived = base × level + bonus | `system.health.bonus` |
| `system.mana.max` | recomputed = multiplier × level + bonus | `system.mana.bonus` |
| `system.mana.castingMax` | recomputed | `system.mana.castingMaxBonus` |
| `system.focus.max` / `system.focus.current` | recomputed (`5 + bonus` / sustained count) | `system.focus.maxBonus` |
| `system.speed.base` / `.raw` / `.crawl` / `.travel` | speed object reassigned each prep | `system.speed.bonus` |
| `system.spellDamageDieSize` | recomputed = base die + bonus | `system.spellDamageDieSizeBonus` |
| `system.stats.<stat>.total` | derived = value + bonus | `system.stats.<stat>.bonus` |
| `system.saves.<save>.difficulty` | derived from stats + bonus | `system.saves.<save>.bonus` / `system.universalDifficultyBonus` |
| `system.skills.<skill>.difficulty` | derived from stat + training + bonus | `system.skills.<skill>.bonus` |
| `system.inventory.maxSlots` / `availableSlots` / `occupiedSlots` | derived | `system.inventory.bonusSlots` |
| `system.inventory.maxBounds` | derived = 3 + bonus | `system.inventory.boundsBonus` |
| `system.fatigueMax` | derived = config + bonus | `system.fatigueBonus` |
| `system.maxLuck` | derived from luck stat | `system.bonusLuck` |
| `system.armor` (character) | derived = equipped armor + bonus | `system.armorBonus` |
| `system.cleaveMaxTargets` / `system.brutalMaxDice` | derived = base + bonus | `system.cleaveTargets` / `system.brutalDice` |
| `system.attributes.xpRequired` / `xpProgress` / `canLevelUp` | derived display values | — (not editable) |
| `system.xp` (NPC) | derived = CR² × 100 | — |
| `system.threatLevelFormatted` (NPC) | derived display string | `system.threatLevel` |

> **Caution — current-resource keys.** `system.health.value`, `system.mana.current`, `system.fatigue`, `system.currentLuck` are *stored* (not derived), so an AE can target them — but doing so pins the live value and fights manual changes. Only do this for effects that intentionally lock a resource.

<!-- -->

> **Reading derived values from a module/macro (general rule).** Every derived value in the table above is available two ways on a *prepared* actor:
>
> 1. **Direct read** — `actor.system.<field>` (e.g. `actor.system.speed.base`, `actor.system.health.max`, `actor.system.armor`).
> 2. **Formula access** — `@<field>` inside any bonus `ArrayField`, AE value, or `Roll` (e.g. `@speed.base`, `@health.max`, `@armor`). They ride along because `getRollData()` spreads the whole `system` object.
>
> Speed is **not** special — character speed is the object `{ base, raw, bonus, crawl, travel }` (`base` = formula + AE bonus, `raw` = formula only, `bonus` = AE bonus only); NPC speed is a plain number. All of these exist **only after `prepareDerivedData()`**. `actor.system._source.*` holds the stored (pre-derivation) values — use the live document (`token.actor`, `game.actors.get(id)`), never `_source`.
>
> **Timing caveat:** bonus formulas are themselves evaluated *during* `prepareDerivedData()`. A bonus formula that references a value derived *later* in the same prep pass (e.g. a stat bonus referencing `@armor`) sees a stale/zero value. Cross-references between derived values are only reliable from code/Rolls that run *after* prep completes.
>
> **Stable module API.** Prefer `game.vagabond.api.readActor(ref)` over reaching into `system.*` directly. `ref` may be an `Actor`, `Token`/`TokenDocument`, actor uuid, or actor id. It returns a freshly-built, normalized, mutate-safe snapshot — `{ id, uuid, name, type, level, health:{value,max}, fatigue:{value,max}, armor, speed:{base,…}, statuses:[…], mana?, focus?, luck?, stats?, saves?, skills? }` — and insulates your module from internal-layout changes between system versions (e.g. it normalizes the character-object vs NPC-number speed difference for you). Returns `null` if the actor can't be resolved.

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
