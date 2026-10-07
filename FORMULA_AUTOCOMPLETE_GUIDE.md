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

### Barbarian — Rage, Aggressor, Murder Mode…

The Barbarian class item ships **one Active Effect per automated behavior**, so a table can switch any piece off from the effects list (and play Berserk by hand with the Berserk status). Conditions live in the formulas, not in code:

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Rage | `system.<melee/ranged/brawl/finesse>DamageDieSizeBonus` | Add | `(@statuses.berserk) ? 2 : 0` (one die size larger) |
| Rage | `system.incomingDamageReductionPerDie` | Add | `(@statuses.berserk) ? ((@armorWorn.slots <= 1) ? 1 : 0) : 0` (Light / no Armor) |
| Rage: Auto-Berserk | `system.rageTrigger` | Override | `true` (damage taken / attacking applies Berserk — switch off for manual) |
| Aggressor | `system.speed.bonus` | Add | `(@lvl >= 2) ? 5 * (1 + floor((@lvl - 2) / 4)) : 0` |
| Aggressor: First Round (auto) | `system.speed.bonus` | Add | `(@aggressorAuto > 0) ? ((@combat.round == 1) ? (<Aggressor formula>) : 0) : 0` |
| Aggressor: First Round (auto) | `system.aggressorAuto` | Override | `1` (marker: makes the manual twin a no-op so both on never double-count; the world **Class Automation** setting clears it in manual mode / out of combat) |
| Aggressor: First Round (manual) | `system.speed.bonus` | Add | `(@aggressorAuto > 0) ? 0 : <Aggressor formula>` — ships **disabled**; flip on at fight start, off after Round 1 |
| Murder Mode: Immunities (Lv 4+) | `system.statusImmunities` | Add | `charmed`, `confused`, `frightened` |
| Murder Mode: Fury (Lv 4+) | `system.bonuses.globalExplode` | Add | `(@statuses.berserk) ? 1 : 0` |
| Murder Mode: Fury | `system.bonuses.globalExplodeValues` | Override | `max` |
| Murder Mode: Fury | `system.bonusPerDamageDie` | Add | `(@statuses.berserk) ? floor(@lvl / 4) : 0` (+1 at 4, +2 at 8) |
| Bloodthirsty (Lv 6+) | `system.attackFavorVs` | Add | `wounded` (rule key from `CONFIG.VAGABOND.attackFavorRules`) |
| Rip and Tear (Lv 10+) | `system.incomingDamageReductionPerDie` | Add | `(@statuses.berserk) ? 1 : 0` (any armor; stacks with Rage) |

> **Level gates:** `flags.vagabond.minLevel` on an effect suppresses it (listed, dimmed, "Locked") until the owner reaches that Level.
> **`@armorWorn.slots|rating|might`** = the worn Armor's occupied Slots / base Armor Rating / Might requirement (0 with no armor). Slots tracks real weight, so Adamant light armor (2 Slots) stops counting as Light.
> **`@combat.round`** = current Round of a started combat the actor is in, else 0 — formulas must read as "no bonus" at 0 so play never requires a tracker. `@combat.active` is 1/0.
> **`globalExplodeValues = max`** resolves to each die's own max face at roll time. It only overrides an item's own explode faces while `globalExplode` is on.

### Alchemist — Catalyze, Eureka, Potency, Mix, Prima Materia

The Alchemist class item ships **one Active Effect per automated behavior** (all `system.craft.*` gates are formula-stack fields, evaluated > 0). Level gates use `flags.vagabond.minLevel`.

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Catalyze | `system.craft.catalyze` | Add | `1` |
| Eureka (Lv 2+) | `system.craft.eurekaMargin` | Add | `10 - floor(max(0, @lvl - 2) / 4)` (10+ / 9+ / 8+) |
| Potency (Lv 4+) | `system.alchemicalBonusPerDamageDie` | Add | `floor(@lvl / 4)` (+1 at 4, +2 at 8) |
| Potency: Explode (Lv 4+) | `system.craft.alchemicalExplode` | Add | `min(2, floor(@lvl / 4))` (face COUNT: highest, then 2 highest) |
| Mix (Lv 6+) | `system.craft.mix` | Add | `1` |
| Prima Materia (Lv 10+) | `system.craft.primaMateria` | Add | `1` |

> **Don't start a formula with `(` and end it with `)`** — the evaluator strips one outer pair, so `(a) ? 2 : ((b) ? 1 : 0)` is mangled and reads as 0. End with a non-paren token or avoid the leading paren.

### Bard — Enjoy the Silence, Virtuoso benefits

The Bard class item ships Enjoy the Silence as a class feature, plus three **untransferred** benefit templates (`flags.vagabond.virtuosoBoon`). The Virtuoso **Perform** button copies the chosen one onto each Group member (inside a started combat with `duration.expiry = roundEnd`; Lv 10 also adds the Climax change).

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Enjoy the Silence (Lv 6+) | `system.statusResistances` | Add | `berserk`, `charmed`, `confused`, `frightened` (one change each — Favor on Saves vs those Statuses) |
| Virtuoso: Inspiration | `system.healingBonusDice` | Add | `1d6` (added to HP-restoring rolls by the damage pipeline) |
| Virtuoso: Resolve | `system.favorChecks` | Add | `save` |
| Virtuoso: Valor | `system.favorChecks` | Add | `attack`, `cast` (one change each) |
| Climax (added to the copy at Bard Lv 10) | `system.bonusDiceExplode` | Add | `1` (Favor die + healing dice explode) |

> The three benefit templates carry `flags.vagabond.consumeOn` (`['heal']`, `['save']`, `['attack','cast']`) — the recipient's effect is deleted after their next roll of that kind (`helpers/use-effects.mjs`). Delete the flag to make a benefit last the whole Round instead.

> `system.favorChecks` is a general field: ADD `attack`, `cast` or `save` for an independent Favor vote on that whole category (merged net-count with every other vote). `system.bonusDiceExplode` > 0 turns the Favor die into `1d6x[favored]` and the healing bonus dice into exploding dice.

### Dancer — Footloose, Don’t Stop Me Now

The Dancer class item ships both as class features. Evasive, Captivator and Step Up's extra Action are text only (Step Up has a button that rolls the Finesse Check).

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Footloose | `system.saveRollsTwice` | Add | `reflex` (Reflex Saves roll `2d20kh`) |
| Don’t Stop Me Now (Lv 6+) | `system.statusResistances` | Add | `paralyzed`, `restrained` (one change each — Favor on Saves vs those Statuses; a grapple is Restrained) |

> `system.saveRollsTwice` is a general field: ADD any save key (`reflex`, `endure`, `will`, or a homebrew save) to roll that Save with two d20s and keep the higher. Favor / Hinder dice and flat modifiers still add on top.

### Fighter — Valor, Momentum

The Fighter class item ships both. Fighting Style (perk grants), Muster for Battle and Harrying are not automated.

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Valor (Lv 2+) | `system.attackCritBonus`, `system.reflexCritBonus`, `system.endureCritBonus` | Add | `0 - floor((@lvl + 2) / 4)` (-1 / -2 / -3 at Levels 2 / 6 / 10) |
| Momentum: Auto (switchable) | `system.momentumTrigger` | Override | `true` (passing a Save against an attack, or its damage reduced to 0, gives a Favored next attack) |

> The Momentum Favor itself is an actor effect (`system.favorChecks` = `attack`, `flags.vagabond.consumeOn: ["attack"]`) created by the feature button or the auto trigger.

### Druid — Primal Mystic, Tempest Within, Savagery, Beast Mode

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Primal Mystic | `system.mana.castingMaxBonus` | Add | `1 - @stats.awareness.total` (Cast Max is 1 + half Level; the engine adds the casting stat, so it is cancelled) |
| Tempest Within (Lv 4+) | `system.incomingDamageReductionPerDieByType` | Add | `cold,fire,shock: floor(@lvl / 4)` |
| Savagery: Damage (Lv 2+) | `system.beastDamageBonus` | Add | `1 + floor((@lvl - 2) / 4)` (flat damage on attacks made in a Metamorph Beast form) |
| Savagery: Polymorph Level (Lv 2+) | `system.polymorphLevelBonus` | Add | `1 + floor((@lvl - 2) / 4)` (added to Level for the Polymorph button's HD limit) |
| Beast Mode: Ignore Immune (Lv 6+) | `system.beastIgnoreImmune` | Override | `true` (Beast-form attacks ignore Immune to `CONFIG.VAGABOND.nonRelicImmuneTypes`) |
| Beast Mode: Continual (Lv 6+) | `system.polymorphContinual` | Override | `true` (self Polymorph card notes it is continual) |

> `system.incomingDamageReductionPerDieByType` is a general field: each entry is `<type>[,<type>…]: <formula>` and reduces incoming damage of those types per damage die, on top of `system.incomingDamageReductionPerDie`.

> The Beast-form fields only matter for actors that are Metamorph copies (`flags.metamorph.temp.mainActorId`): the attacker's copy reads these values from its main (Druid) actor. Force of Nature and the Polymorph spell button need the Metamorph module.

### Gunslinger — Deadeye, Bad Medicine, Devastator, Grit, High Noon

Deadeye itself is an actor effect created by the feature button / auto trigger (`system.rangedCritBonus` add `-<stacks>`, flag `flags.vagabond.deadeye`). Shooting Irons is text-only.

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Deadeye: Auto (switchable) | `system.deadeyeTrigger` | Override | `true` (each Ranged attack adds a stack; resets at the end of your Turn in a Combat without a Ranged hit) |
| Bad Medicine (Lv 2+) | `system.critExtraDiceBySkill` | Add | `ranged: 1 + floor((@lvl - 2) / 4)` (extra dice matching the weapon's die on a Ranged Crit: 1 / 2 / 3) |
| Devastator (Lv 6+) | `system.critExplodeSkills` | Add | `ranged` (Crit damage dice Explode on their highest face) |
| Grit (Lv 4+) | `system.deadeyeGrit` | Add | `4 - floor(@lvl / 4)` (stacks the Grit button adds: 3 at Level 4, 2 at Level 8; the button clamps at 0) |
| High Noon: Auto (Lv 10, switchable) | `system.highNoonTrigger` | Override | `true` (dropping a non-allied target to 0 HP sets Deadeye to 17) |

> `system.critExtraDiceBySkill` is a general field: each entry is `<skill>[,<skill>…]: <formula>` = that many extra dice (matching the first die of the damage formula) on a Crit made with that weapon skill. `system.critExplodeSkills` ADDs weapon skill keys whose Crit damage dice Explode.

### Hunter — Hunter’s Mark, Rover, Lethal Precision, Apex Predator

The Mark itself is an actor effect (`flags.vagabond.huntersMark`) created by the Mark Target button / auto trigger.

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Hunter’s Mark | `system.markRules` | Add | `keenVicious`, `critByBonus` (one change each — Keen / Vicious gained against the Mark; a Bonus can push the result into the Crit range) |
| Hunter’s Mark: Auto (switchable) | `system.huntersMarkTrigger` | Override | `true` (attacking with no Mark marks the Target) |
| Rover (Lv 2+) | `system.speed.bonus` | Add | `5 * (1 + floor((@lvl - 2) / 4))` (+5’ / +10’ / +15’) |
| Lethal Precision (Lv 4+) | `system.markDamageBonus` | Add | `floor(@lvl / 4)` (extra damage the Mark takes from you / an Ally on your Turn) |
| Apex Predator (Lv 10) | `system.markRules` | Add | `weak` (the Mark is Weak to your attacks) |

### Luminary — Theurgy, Radiant Healer, Overheal

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Theurgy | `system.mana.castingMaxBonus` | Add | `2 + floor(@lvl / 2) - @stats.awareness.total` (Cast Max is 2 + Level; the engine adds Stat + half Level, so both are cancelled) |
| Radiant Healer | `system.healingExplode` | Add | `max` (HP-restoring Spell rolls also Explode on their highest face; ADD `1`, `2`, `max`, `max-1` — Assured Healer adds `1`) |
| Overheal (Lv 2+) | `system.healingBonusDice` | Add | `floor(@lvl / 2)` (flat term appended to HP-restoring rolls) |

### Magus — Arcanum

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Arcanum | `system.mana.castingMaxBonus` | Add | `1 - @stats.reason.total` (Cast Max is 1 + half Level, round up; the engine adds Reason, so it is cancelled) |

### Merchant — Deep Pockets

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Deep Pockets | `system.inventory.bonusSlots` | Add | `2 + 2 * floor((@lvl - 1) / 3)` (2 Item Slots now and every 3 Levels hereafter) |

### Pugilist — Fisticuffs, Haymaker, Moxie, Title Holder

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Fisticuffs | `system.critExtraDiceBySkill` | Add | `brawl: 1` (Vicious: a Brawl Crit adds one die matching the weapon) |
| Haymaker: Auto (Lv 2+, switchable) | `system.haymakerMargin` | Add | `10 - floor((@lvl - 2) / 6)` (a Brawl attack beating the Difficulty by this much Dazes the Target; cleared by the Class Automation setting) |
| Moxie (Lv 4+) | `system.statusResistances` | Add | `dazed`, `frightened`, `restrained` (one change each) |
| Title Holder: Die (Lv 6+) | `system.weaponDieBySkill` | Add | `brawl: 6 + 2 * floor(@lvl / 10)` (damage dice of that skill’s weapons are at least this size) |
| Title Holder: Explode (Lv 6+) | `system.weaponLowExplodeBySkill` | Add | `brawl: 2` (those dice also Explode on 1 up to this face) |

### Revelator — Righteous, Lay on Hands, Divine Resolve

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Righteous | `system.mana.castingMaxBonus` | Add | `1 - @stats.presence.total` (Cast Max is 1 + half Level, round up; the engine adds Presence, so it is cancelled) |
| Lay on Hands (Lv 2+) | `system.layOnHandsDie` | Add | `4 + 2 * floor((@lvl - 2) / 4)` (die size read by the Lay on Hands button: d4 / d6 / d8) |
| Divine Resolve (Lv 6+) | `system.statusImmunities` | Add | `blinded`, `paralyzed`, `sickened` (one change each) |
| Divine Resolve: Lay on Hands (Lv 6+) | `system.layOnHandsCures` | Add | `blinded`, `paralyzed`, `sickened` (Statuses the button cures on its Target) |

### Rogue — Sneak Attack, Lethal Weapon, Knack

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Sneak Attack | `system.sneakAttackDice` | Add | `1 + floor((@lvl - 1) / 3)` (number of extra d4s) |
| Sneak Attack: Auto (switchable) | `system.sneakAttackTrigger` | Override | `true` (first Favored hit per Turn with a Finesse / Keen / Ranged Weapon adds the dice and ignores that much Armor; cleared by the Class Automation setting) |
| Lethal Weapon (Lv 6+) | `system.sneakAttackExplode` | Add | `1` (the Sneak Attack dice Explode) |
| Knack (Lv 4+) | `system.critLuckBonus` | Add | `1` (extra Luck whenever you Crit) |

### Sorcerer — Glamour, Spell-Slinger

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Glamour | `system.mana.castingMaxBonus` | Add | `2 + floor(@lvl / 2) - @stats.presence.total` (Cast Max is 2 + Level; the engine adds Presence + half Level, so both are cancelled) |
| Spell-Slinger: Die (Lv 4+) | `system.spellDamageDieSizeBonus` | Add | `2` (d6 → d8) |
| Spell-Slinger: Crit (Lv 4+) | `system.castCritBonus` | Add | `0 - 1 - floor((@lvl - 4) / 4)` (Crit range on Cast Checks: −1 at 4, −2 at 8) |

### Vanguard — Wall, Indestructible

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Wall (Lv 2+) | `system.defenseWeaponDieStep` | Add | `1 + floor((@lvl - 2) / 4)` (Defense-property weapons roll their damage dice this many sizes larger) |
| Indestructible (Lv 4+) | `system.defenseWeaponBonusPerDie` | Add | `@statuses.incapacitated ? 0 : (@armorWorn.slots > 0) ? 1 + floor((@lvl - 4) / 4) : 0` (flat bonus to each damage die of Defense-property weapons) |

### Witch — Occultist

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Occultist | `system.mana.castingMaxBonus` | Add | `2 + floor(@lvl / 2) - @stats.awareness.total` (Cast Max is 2 + Level; the engine adds Awareness + half Level, so both are cancelled) |

### Wizard — Spellcaster, Manifold Mind, Sculpt Spell

| Effect | Key | Mode | Value |
| --- | --- | --- | --- |
| Spellcaster | `system.mana.castingMaxBonus` | Add | `2 + floor(@lvl / 2) - @stats.reason.total` (Cast Max is 2 + Level; the engine adds Reason + half Level, so both are cancelled) |
| Manifold Mind (Lv 2+) | `system.focus.maxBonus` | Add | `1 + floor((@lvl - 2) / 4)` (Spells you can Focus on at once: 5 + this) |
| Sculpt Spell (Lv 4+) | `system.bonuses.deliveryUpcastCostReduction` | Add | `1 + floor((@lvl - 4) / 4)` (Mana off the Delivery upcasting cost, never below 0) |

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
system.incomingDamageReductionPerDie → Reduce incoming damage by N per incoming die (formula; conditions like Berserk / armor Slots live in the formula)
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
| `system.cleaveMaxTargets` | derived = base + bonus | `system.cleaveTargets` |
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
