# vagabond.active-effects — Inventory

**135 entries across 9 folders.** Generated from `packs/_source/active-effect/`. Each row shows: name, canonical-slug flag (`flags.vagabond.canonicalId` — readable lookup key), the stable 16-char Foundry `_id`, automation level (status conditions only — from VCE registry), status-icon links, mechanical `system.changes`, and the in-system description.

Modules can resolve any entry by either:
- **UUID:** `Compendium.vagabond.active-effects.ActiveEffect.<_id>` (use with `fromUuid()`)
- **Canonical slug:** `pack.find(e => e.flags?.vagabond?.canonicalId === "vulnerable")` (survives GM-duplicated packs)

---

## ⚡ Status Conditions — 21 entries

| Name | Canonical ID | Stable `_id` | Automation | Statuses | Mechanics | Description |
|---|---|---|---|---|---|---|
| Berserk | `berserk` | `berserk000lrddgz` | partial | berserk | _(no changes — see description)_ | Can't take Cast Action or Focus. Doesn't make Morale Checks. Can't be Frightened. Class-specific bonuses applied via @statuses.berserk AE formulas. |
| Blinded | `blinded` | `blinded000q40div` | fully_automated | blinded | `system.favorHinder` = hinder; `system.incomingAttacksModifier` = favor; `system.outgoingSavesModifier` = favor | Can't see. Vulnerable. |
| Burning | `burning` | `burning000w42j2y` | manual | burning | _(no changes — see description)_ | Takes damage at the start of its turn. Can be ended by an appropriate action. |
| Charmed | `charmed` | `charmed0009p1oc9` | manual | charmed | _(no changes — see description)_ | Can't willingly make an Attack Action targeting the one who Charmed it. |
| Confused | `confused` | `confused00fgtfks` | fully_automated | confused | `system.favorHinder` = hinder; `system.outgoingSavesModifier` = favor | Checks and Saves have Hinder. Saves against its Actions have Favor. |
| Dazed | `dazed` | `dazed000003m1fnx` | partial | dazed | `system.speed.bonus` + -999 | Can't Focus or Move unless it uses an Action to do so. Speed reduced to 0. |
| Dead | `dead` | `dead000000yjr6c3` | fully_automated | dead | `system.autoFailAllRolls` = true; `system.speed.bonus` + -999; `system.favorHinder` = hinder; `system.incomingAttacksModifier` = favor; `system.outgoingSavesModifier` = favor | Same as Incapacitated but automatically fails ALL rolls (stats, skills, saves, attacks). |
| Encumbered | `encumbered` | `encumberedu4bb7j` | fully_automated | encumbered | _(no changes — see description)_ | Carrying more inventory slots than max. Base speed reduced by 5 ft per slot over (homebrew, opt-in). |
| Fatigued | `fatigued` | `fatigued00o2ktke` | partial | fatigued | _(no changes — see description)_ | Each Fatigue occupies an Item Slot. At 3+ Fatigue, can't Rush. At 5 Fatigue, dies. |
| Focusing | `focusing` | `focusing00s7fu4j` | partial | focusing | _(no changes — see description)_ | Currently sustaining one or more spells through Focus. |
| Frightened | `frightened` | `frightened2yqgx1` | fully_automated | frightened | `system.universalDamageBonus` + -2 | -2 penalty to all damage dealt. |
| Grappling | `grappling` | `grappling0h4jkvd` | partial | grappling | _(no changes — see description)_ | Restraining a target. Speed halved unless target is smaller. |
| Incapacitated | `incapacitated` | `incapacitav2ufn3` | fully_automated | incapacitated | `system.autoFailStats` + might; `system.autoFailStats` + dexterity; `system.speed.bonus` + -999; `system.favorHinder` = hinder; `system.incomingAttacksModifier` = favor; `system.outgoingSavesModifier` = favor | Can't Focus, use Actions, or Move. Auto-fails Might and Dexterity checks. Vulnerable. Speed = 0. |
| Invisible | `invisible` | `invisible0aoq8ay` | fully_automated | invisible | `system.defenderStatusModifiers.attackersAreBlinded` = true | Can't be seen. Attackers act as Blinded (attacks Hindered). |
| Paralyzed | `paralyzed` | `paralyzed04ba6s1` | fully_automated | paralyzed | `system.autoFailStats` + might; `system.autoFailStats` + dexterity; `system.speed.bonus` + -999; `system.favorHinder` = hinder; `system.incomingAttacksModifier` = favor; `system.outgoingSavesModifier` = favor | Incapacitated + Speed = 0. |
| Prone | `prone` | `prone000003uvasp` | partial | prone | `system.speed.bonus` + -999; `system.incomingMeleeAttacksModifier` = favor; `system.outgoingSavesModifier` = favor | Speed = 0. Costs 10' Speed to stand. Can crawl (2:1 ratio). Can't Rush. Vulnerable. |
| Restrained | `restrained` | `restrained2brmuu` | fully_automated | restrained | `system.speed.bonus` + -999; `system.favorHinder` = hinder; `system.incomingAttacksModifier` = favor; `system.outgoingSavesModifier` = favor | Vulnerable + Speed = 0. |
| Sickened | `sickened` | `sickened005qazu3` | fully_automated | sickened | `system.incomingHealingModifier` + -2 | -2 penalty to any healing received. |
| Suffocating | `suffocating` | `suffocatinoy3py6` | manual | suffocating | _(no changes — see description)_ | After not breathing for 1 minute, each round: Heroes roll d8 (if >= Might, gain 1 Fatigue), Enemies gain 1 Fatigue. |
| Unconscious | `unconscious` | `unconsciou4wgpby` | fully_automated | unconscious | `system.autoFailStats` + might; `system.autoFailStats` + dexterity; `system.speed.bonus` + -999; `system.favorHinder` = hinder; `system.incomingAttacksModifier` = favor; `system.outgoingSavesModifier` = favor; `system.defenderStatusModifiers.closeAttacksAutoCrit` = true | Blinded + Incapacitated + Prone. Close Attacks always Crit. |
| Vulnerable | `vulnerable` | `vulnerablezv8jo5` | fully_automated | vulnerable | `system.favorHinder` = hinder; `system.incomingAttacksModifier` = favor; `system.outgoingSavesModifier` = favor | Its attacks and saves have Hinder. Attacks targeting it have Favor. Saves against its attacks have Favor. |

## 🟢 Buffs & Bonuses — 32 entries

| Name | Canonical ID | Stable `_id` | Statuses | Mechanics | Description |
|---|---|---|---|---|---|
| + Mana Casting | `plus-mana-casting` | `perkmetamagkqjm4` | — | `system.mana.castingMaxBonus` + 1 | Metamagic perk: +1 to max mana per casting. |
| +1 Spell Damage | `plus-1-spell-damage` | `spell1speltniwyi` | — | `system.universalSpellDamageBonus` + 1 | +1 flat damage bonus to spell damage. |
| +2 Inv. Slots | `plus-2-inv-slots` | `perkpackmu4x3d0m` | — | `system.inventory.bonusSlots` + 2 | Pack Mule perk: +2 inventory slots. |
| +Mana | `plus-mana` | `perksecretb5l9zd` | — | `system.mana.bonus` + @lvl | Secret of Mana perk: bonus mana equal to character level. |
| Armor Bonus (+1) | `armor-bonus-plus-1` | `armorbonuswoqi7u` | — | `system.armorBonus` + 1 | +1 bonus to Armor value. |
| Armor Bonus (+2) | `armor-bonus-plus-2` | `armorbonuswoqi8r` | — | `system.armorBonus` + 2 | +2 bonus to Armor value. |
| Awareness +1 | `awareness-plus-1` | `awareness1t8xyp6` | — | `system.stats.awareness.bonus` + 1 | +1 bonus to Awareness. |
| Bonus Inventory | `bonus-inventory` | `gearbackpa6yoys1` | — | `system.inventory.bonusSlots` + 2 | Backpack: +2 bonus inventory slots. |
| Brawl Check Favor | `brawl-check-favor` | `brawlcheck95skjd` | — | `system.brawlCheckFavor` = true | Brawl checks have Favor. |
| Damage Bonus (+1) | `damage-bonus-plus-1` | `damagebonukqwha0` | — | `system.universalDamageBonus` + 1 | +1 flat bonus to all damage dealt. |
| Damage Bonus (+2) | `damage-bonus-plus-2` | `damagebonukqwhax` | — | `system.universalDamageBonus` + 2 | +2 flat bonus to all damage dealt. |
| Dexterity +1 | `dexterity-plus-1` | `dexterity18lkn9f` | — | `system.stats.dexterity.bonus` + 1 | +1 bonus to Dexterity. |
| Endure Save +1 | `endure-save-plus-1` | `enduresavepinhcj` | — | `system.saves.endure.bonus` + 1 | +1 bonus to Endure saves. |
| Favored (All Rolls) | `favored-all-rolls` | `favoredall313vgi` | — | `system.favorHinder` = favor | All d20 rolls have Favor (roll 2d20, take higher). |
| HP Bonus (+10) | `hp-bonus-plus-10` | `hpbonus100cg1lgh` | — | `system.health.bonus` + 10 | +10 bonus to maximum HP. |
| HP Bonus (+5) | `hp-bonus-plus-5` | `hpbonus5001gulh1` | — | `system.health.bonus` + 5 | +5 bonus to maximum HP. |
| HP Per Level (+1) | `hp-per-level-plus-1` | `hpperlevelejigzt` | — | `system.bonuses.hpPerLevel` + 1 | +1 HP per character level. |
| Hulking | `hulking` | `ancestryorixcurl` | — | `system.inventory.bonusSlots` + 2 | Orc trait: Hulking grants +2 inventory slots. |
| Luck +1 | `luck-plus-1` | `luck100000wb3fkg` | — | `system.stats.luck.bonus` + 1 | +1 bonus to Luck. |
| Max Health Increase | `max-health-increase` | `perktough1jpurac` | — | `system.bonuses.hpPerLevel` + 1 | Tough perk: +1 HP per character level. |
| Might +1 | `might-plus-1` | `might1000063s1y2` | — | `system.stats.might.bonus` + 1 | +1 bonus to Might. |
| Naturally Attuned (Elf Trait) | `naturally-attuned-elf-trait` | `ancestryel2083yo` | — | `system.attributes.isSpellcaster` = true; `system.attributes.manaMultiplier` = 1; `system.attributes.castingStat` = reason | Elf trait: Naturally Attuned grants innate spellcasting (Reason-based, 1x mana multiplier). |
| Nimble | `nimble` | `ancestryniy6sgv5` | — | `system.speed.bonus` + 5 | Halfling/Goblin trait: Nimble grants +5 feet to Speed. |
| Presence +1 | `presence-plus-1` | `presence10qsdqd2` | — | `system.stats.presence.bonus` + 1 | +1 bonus to Presence. |
| Reason +1 | `reason-plus-1` | `reason1000esxi95` | — | `system.stats.reason.bonus` + 1 | +1 bonus to Reason. |
| Reflex Save +1 | `reflex-save-plus-1` | `reflexsaveek905y` | — | `system.saves.reflex.bonus` + 1 | +1 bonus to Reflex saves. |
| Scale | `scale` | `ancestrydrolxbw3` | — | `system.armorBonus` + 1 | Draken trait: Scale grants +1 natural Armor bonus. |
| Speed Bonus (+10ft) | `speed-bonus-plus-10ft` | `speedbonusj4xp1w` | — | `system.speed.bonus` + 10 | +10ft bonus to Speed. |
| Spell Crit Range -1 | `spell-crit-range-minus-1` | `spellcritrd0yh30` | — | `system.spellCritBonus` + 1 | Spell critical hit threshold reduced by 1. |
| Spell Damage Die +1 Step | `spell-damage-die-plus-1-step` | `spelldamagd9vtgo` | — | `system.spellDamageDieSizeBonus` + 1 | Spell damage die increases by one step. |
| Tough (Dwarf Trait) | `tough-dwarf-trait` | `ancestrydw9zkob3` | — | `system.bonuses.hpPerLevel` + 1 | Dwarf trait: Tough grants +1 HP per character level. |
| Will Save +1 | `will-save-plus-1` | `willsave10ugeimg` | — | `system.saves.will.bonus` + 1 | +1 bonus to Will saves. |

## 🔴 Debuffs & Penalties — 9 entries

| Name | Canonical ID | Stable `_id` | Statuses | Mechanics | Description |
|---|---|---|---|---|---|
| Awareness -1 | `awareness-minus-1` | `awareness1t8xyr0` | — | `system.stats.awareness.bonus` + -1 | -1 penalty to Awareness. |
| Damage Penalty (-2) | `damage-penalty-minus-2` | `damagepenaxwbwfl` | — | `system.universalDamageBonus` + -2 | -2 flat penalty to all damage dealt. |
| Dexterity -1 | `dexterity-minus-1` | `dexterity18lknb9` | — | `system.stats.dexterity.bonus` + -1 | -1 penalty to Dexterity. |
| Hindered (All Rolls) | `hindered-all-rolls` | `hinderedalqkjrmm` | — | `system.favorHinder` = hinder | All d20 rolls have Hinder (roll 2d20, take lower). |
| Luck -1 | `luck-minus-1` | `luck100000wb3fma` | — | `system.stats.luck.bonus` + -1 | -1 penalty to Luck. |
| Might -1 | `might-minus-1` | `might1000063s1zw` | — | `system.stats.might.bonus` + -1 | -1 penalty to Might. |
| Presence -1 | `presence-minus-1` | `presence10qsdqew` | — | `system.stats.presence.bonus` + -1 | -1 penalty to Presence. |
| Reason -1 | `reason-minus-1` | `reason1000esxiaz` | — | `system.stats.reason.bonus` + -1 | -1 penalty to Reason. |
| Speed Penalty (-10ft) | `speed-penalty-minus-10ft` | `speedpenalhhol4c` | — | `system.speed.bonus` + -10 | -10ft penalty to Speed. |

## ⚔️ Weapon Enhancements — 7 entries

| Name | Canonical ID | Stable `_id` | Statuses | Mechanics | Description |
|---|---|---|---|---|---|
| +1 Weapon Damage | `plus-1-weapon-damage` | `weapon1weax0qg4u` | — | `system.universalWeaponDamageBonus` + 1 | +1 flat damage bonus to weapon attacks. |
| +1d4 Weapon Damage | `plus-1d4-weapon-damage` | `weapon1d4wvxc77q` | — | `system.universalWeaponDamageDice` + 1d4 | +1d4 bonus dice to weapon damage. |
| Keen Property | `keen-property` | `weaponkeeny2xotg` | — | `system.critNumber` = 19 | Keen property: critical hits on 19 or 20. |
| Melee Crit Range -1 | `melee-crit-range-minus-1` | `weaponmele0qxffy` | — | `system.meleeCritBonus` + 1 | Melee weapon critical hit threshold reduced by 1 (e.g. 20 -&gt; 19). |
| Melee Damage Die +1 Step | `melee-damage-die-plus-1-step` | `weaponmele82cn8a` | — | `system.meleeDamageDieSizeBonus` + 1 | Melee weapon damage die increases by one step (d4 -&gt; d6 -&gt; d8 -&gt; d10 -&gt; d12). |
| Ranged Crit Range -1 | `ranged-crit-range-minus-1` | `weaponrangqizh1z` | — | `system.rangedCritBonus` + 1 | Ranged weapon critical hit threshold reduced by 1. |
| Ranged Damage Die +1 Step | `ranged-damage-die-plus-1-step` | `weaponranga9j9pf` | — | `system.rangedDamageDieSizeBonus` + 1 | Ranged weapon damage die increases by one step. |

## 💎 Material Bonuses — 3 entries

| Name | Canonical ID | Stable `_id` | Statuses | Mechanics | Description |
|---|---|---|---|---|---|
| Adamant Armor | `adamant-armor` | `materialadfh6ufq` | — | `system.armorBonus` + 1 | Adamant armor: +1 Armor. Occupies 1 extra slot. Cost x50. |
| Adamant Weapon | `adamant-weapon` | `materialadt2hkyn` | — | `system.universalWeaponDamageBonus` + 1 | Adamant weapon: +1 damage. Occupies 1 extra slot. Cost x50. |
| Mythral | `mythral` | `materialmyz5m7fz` | — | `system.inventory.bonusSlots` + 1 | Mythral: occupies 1 fewer slot (minimum 1). Cost x50. |

## ✨ Relic Powers — 40 entries

| Name | Canonical ID | Stable `_id` | Statuses | Mechanics | Description |
|---|---|---|---|---|---|
| +1 Attack Dmg | `plus-1-attack-dmg` | `bonusweapo6cqbi7` | — | `system.universalWeaponDamageBonus` + 1 | Enchanted weapon: +1 damage to weapon attacks. |
| +1 Spell Dmg | `plus-1-spell-dmg` | `bonustrinkkh7jue` | — | `system.universalSpellDamageBonus` + 1 | Enchanted trinket: +1 spell damage. |
| +10 Speed | `plus-10-speed` | `movementswb9lsdx` | — | `system.speed.bonus` + 10 | Enchanted swiftness: +10 feet to Speed. |
| +15 Speed | `plus-15-speed` | `movementsww5lvby` | — | `system.speed.bonus` + 15 | Enchanted swiftness: +15 feet to Speed. |
| +2 Attack Dmg | `plus-2-attack-dmg` | `bonusweapo6cqbi8` | — | `system.universalWeaponDamageBonus` + 2 | Enchanted weapon: +2 damage to weapon attacks. |
| +2 Spell Dmg | `plus-2-spell-dmg` | `bonustrinkkh7juf` | — | `system.universalSpellDamageBonus` + 2 | Enchanted trinket: +2 spell damage. |
| +3 Attack Dmg | `plus-3-attack-dmg` | `bonusweapo6cqbi9` | — | `system.universalWeaponDamageBonus` + 3 | Enchanted weapon: +3 damage to weapon attacks. |
| +3 Spell Dmg | `plus-3-spell-dmg` | `bonustrinkkh7jug` | — | `system.universalSpellDamageBonus` + 3 | Enchanted trinket: +3 spell damage. |
| +5 Speed | `plus-5-speed` | `movementswj8rqcs` | — | `system.speed.bonus` + 5 | Enchanted swiftness: +5 feet to Speed. |
| +d4 Dmg | `plus-d4-dmg` | `strikestri6hur3z` | — | `system.universalWeaponDamageDice` + 1d4 | Enchanted strike: +1d4 bonus weapon damage die. |
| +d6 Dmg | `plus-d6-dmg` | `strikestrigs1t60` | — | `system.universalWeaponDamageDice` + 1d6 | Enchanted strike: +1d6 bonus weapon damage die. |
| +d8 Dmg | `plus-d8-dmg` | `strikestri0yyf5d` | — | `system.universalWeaponDamageDice` + 1d8 | Enchanted strike: +1d8 bonus weapon damage die. |
| Ace - Keen | `ace-keen` | `acekeen00021tmn2` | — | `system.meleeCritBonus` + 2; `system.rangedCritBonus` + 2 | Ace property: critical hit threshold reduced by 2 instead of 1 (e.g. 20 → 18). |
| Armor +1 | `armor-plus-1` | `bonusarmor9leeqe` | — | `system.armorBonus` + 1 | Enchanted armor: +1 Armor bonus. |
| Armor +2 | `armor-plus-2` | `bonusarmor9leeqf` | — | `system.armorBonus` + 2 | Enchanted armor: +2 Armor bonus. |
| Armor +3 | `armor-plus-3` | `bonusarmor9leeqg` | — | `system.armorBonus` + 3 | Enchanted armor: +3 Armor bonus. |
| Burning I | `burning-i` | `utilitybursekcf8` | — | `system.onHitBurningDice` = d4 | On hit: target gains Burning with a Cd4 countdown die. Automated — applies Burning status and creates countdown die on damage dealt. |
| Burning II | `burning-ii` | `utilityburtgdsq5` | — | `system.onHitBurningDice` = d6 | On hit: target gains Burning with a Cd6 countdown die. Automated — applies Burning status and creates countdown die on damage dealt. |
| Burning III | `burning-iii` | `utilityburt39ora` | — | `system.onHitBurningDice` = d8 | On hit: target gains Burning with a Cd8 countdown die. Automated — applies Burning status and creates countdown die on damage dealt. |
| Displacement | `displacement` | `movementdirs3i1i` | — | `system.defenderStatusModifiers.attackersAreBlinded` = true | Sight-based attacks against the wearer are made as if the attacker is Blinded (attacks Hindered). |
| Holding I | `holding-i` | `utilityholeieyfo` | — | `system.inventory.bonusSlots` + 2 | Enchanted holding: grants +2 bonus Item Slots. |
| Holding II | `holding-ii` | `utilityholgp18kd` | — | `system.inventory.bonusSlots` + 4 | Enchanted holding: grants +4 bonus Item Slots. |
| Holding III | `holding-iii` | `utilityholy7fjba` | — | `system.inventory.bonusSlots` + 6 | Enchanted holding: grants +6 bonus Item Slots. |
| Invisibility I | `invisibility-i` | `utilityinvenm5bi` | invisible | `system.defenderStatusModifiers.attackersAreBlinded` = true | Skip Move to become Invisible until after taking an Action. |
| Invisibility II | `invisibility-ii` | `utilityinvlgmjqv` | invisible | `system.defenderStatusModifiers.attackersAreBlinded` = true | Wearer is permanently Invisible while equipped. |
| Lifesteal I | `lifesteal-i` | `utilityliffhuo14` | — | `system.onKillHealDice` + 1d8 | On kill: wielder heals for 1d8 HP. Automated — heals attacker when target reaches 0 HP. |
| Lifesteal II | `lifesteal-ii` | `utilityliftnirn5` | — | `system.onKillHealDice` + 2d8 | On kill: wielder heals for 2d8 HP. Automated — heals attacker when target reaches 0 HP. |
| Lifesteal III | `lifesteal-iii` | `utilitylifzmtp0a` | — | `system.onKillHealDice` + 3d8 | On kill: wielder heals for 3d8 HP. Automated — heals attacker when target reaches 0 HP. |
| Manasteal I | `manasteal-i` | `utilityman4uo2xx` | — | `system.onKillManaDice` + 1d4 | On kill: bound wielder restores 1d4 Mana. Automated — restores mana when target reaches 0 HP. |
| Manasteal II | `manasteal-ii` | `utilitymani1ul72` | — | `system.onKillManaDice` + 2d4 | On kill: bound wielder restores 2d4 Mana. Automated — restores mana when target reaches 0 HP. |
| Manasteal III | `manasteal-iii` | `utilitymanrg4zpz` | — | `system.onKillManaDice` + 3d4 | On kill: bound wielder restores 3d4 Mana. Automated — restores mana when target reaches 0 HP. |
| Protection +1 | `protection-plus-1` | `bonusprote9r4p3w` | — | `system.saves.reflex.bonus` + 1; `system.saves.endure.bonus` + 1; `system.saves.will.bonus` + 1 | Enchanted protection: +1 to all saves (Reflex, Endure, Will). |
| Protection +2 | `protection-plus-2` | `bonusprote9r4p3x` | — | `system.saves.reflex.bonus` + 2; `system.saves.endure.bonus` + 2; `system.saves.will.bonus` + 2 | Enchanted protection: +2 to all saves (Reflex, Endure, Will). |
| Protection +3 | `protection-plus-3` | `bonusprote9r4p3y` | — | `system.saves.reflex.bonus` + 3; `system.saves.endure.bonus` + 3; `system.saves.will.bonus` + 3 | Enchanted protection: +3 to all saves (Reflex, Endure, Will). |
| Vulnerability -1 | `vulnerability-minus-1` | `cursedvuln6wo5kw` | — | `system.armorBonus` + -1 | Cursed armor: -1 Armor. |
| Vulnerability -2 | `vulnerability-minus-2` | `cursedvuln6wo5kx` | — | `system.armorBonus` + -2 | Cursed armor: -2 Armor. |
| Vulnerability -3 | `vulnerability-minus-3` | `cursedvuln6wo5ky` | — | `system.armorBonus` + -3 | Cursed armor: -3 Armor. |
| Weakness -1 | `weakness-minus-1` | `cursedweakl0ei5z` | — | `system.universalWeaponDamageBonus` + -1 | Cursed weapon: -1 weapon damage. |
| Weakness -2 | `weakness-minus-2` | `cursedweakl0ei60` | — | `system.universalWeaponDamageBonus` + -2 | Cursed weapon: -2 weapon damage. |
| Weakness -3 | `weakness-minus-3` | `cursedweakl0ei61` | — | `system.universalWeaponDamageBonus` + -3 | Cursed weapon: -3 weapon damage. |

## 📘 Class Features — 23 entries

| Name | Canonical ID | Stable `_id` | Statuses | Mechanics | Description |
|---|---|---|---|---|---|
| Aggressor | `aggressor` | `barbarianabi165q` | — | `system.hasAggressor` = true | Additional Barbarian aggression mechanics. |
| Bloodthirsty | `bloodthirsty` | `barbarianbddfz6w` | — | `system.hasBloodthirsty` = true | Heal on kill while Raging. |
| Bravado | `bravado` | `bardbravadgy500n` | — | `system.hasBravado` = true | Will Saves can't be Hindered while not Incapacitated. Ignore effects that rely on hearing. |
| Climax | `climax` | `bardclimax5xztqu` | — | `system.hasClimax` = true | Favor and bonus dice you grant can Explode. |
| Deep Pockets (Feature) | `deep-pockets-feature` | `merchantde17e6rb` | — | `system.inventory.bonusSlots` + 1 | Merchant feature: +1 inventory slot. |
| Evasive | `evasive` | `rogueevasiwfcaqc` | — | `system.hasEvasive` = true | No Hinder on Dodge saves from Heavy Armor. On success, remove TWO highest dice instead of one. |
| Exalted | `exalted` | `CeoreuhLLhpCECDp` | — | `system.bonusPerDamageDie` + 1; `system.bonusPerDamageDieDoubleVsBeingTypes` + Hellspawn; `system.bonusPerDamageDieDoubleVsBeingTypes` + Undead; `saveVsStatusBonuses` + frightened:will:1 | — |
| Fearmonger | `fearmonger` | `barbarianfit5dnr` | — | `system.hasFearmonger` = true | Barbarian fear mechanics. |
| Fisticuffs | `fisticuffs` | `fisticuffs6babjv` | — | `system.fisticuffs` = true | Unarmed strikes deal lethal damage and scale with class. |
| Lethal Weapon | `lethal-weapon` | `rogueletha39as91` | — | `system.hasLethalWeapon` = true | Sneak Attack always applies (ignores once-per-round limit). |
| lv10 - Sculpt Spell | `lv10-sculpt-spell` | `wizardscul47is1r` | — | `system.bonuses.deliveryManaCostReduction` + (@lvl >= 10) ? 1 : 0 | Wizard Lv10: additional -1 delivery mana cost. |
| lv10 - Spell-Slinger | `lv10-spell-slinger` | `sorcererspjms77d` | — | `system.spellCritBonus` + (@lvl >= 10) ? -1 : 0 | Sorcerer Lv10: additional -1 spell crit threshold. |
| lv2 - Sculpt Spell | `lv2-sculpt-spell` | `wizardsculnsyncg` | — | `system.bonuses.deliveryManaCostReduction` + (@attributes.level.value >= 2) ? 1 : 0 | Wizard Lv2: -1 delivery mana cost. |
| lv2 - Spell-Slinger | `lv2-spell-slinger` | `sorcerersppyd0tm` | — | `system.spellCritBonus` + (@lvl >= 2) ? -1 : 0; `system.spellDamageDieSizeBonus` + (@lvl >= 2) ? 2 : 0 | Sorcerer Lv2: -1 spell crit threshold and +2 spell damage die size steps. |
| Mindless Rancor | `mindless-rancor` | `barbarianme03nl1` | — | `system.hasMindlessRancor` = true | While Raging: immune to mental effects. |
| Rage | `rage` | `hOzkzY3GeZjFGvty` | — | `system.meleeDamageDieSizeBonus` + 2; `system.brawlDamageDieSizeBonus` + 2; `system.bonuses.globalExplode` = 1; `system.bonuses.globalExplodeValues` = max; `system.bonusPerDamageDie` + 1; `system.incomingDamageReductionPerDie` + 1 | — |
| Rage Damage Reduction | `rage-damage-reduction` | `barbarianra36my7` | — | `system.rageDamageReduction` = 1 | While Raging, reduce each incoming damage die by 1. |
| Rage Damage Reduction (Improved) | `rage-damage-reduction-improved` | `barbarianraqhg0g` | — | `system.rageDamageReduction` = 2 | While Raging, reduce each incoming damage die by 2. |
| Rip and Tear | `rip-and-tear` | `barbarianr8tc7cb` | — | `system.hasRipAndTear` = true | While Raging: +1 damage per damage die dealt. |
| Sneak Attack (1d4) | `sneak-attack-1d4` | `roguesneakgwndyd` | — | `system.sneakAttackDice` = 1 | Deal +1d4 damage on Favored weapon attacks. |
| Sneak Attack (2d4) | `sneak-attack-2d4` | `roguesneakgwo5om` | — | `system.sneakAttackDice` = 2 | Deal +2d4 damage on Favored weapon attacks. |
| Sneak Attack (3d4) | `sneak-attack-3d4` | `roguesneakgwoxev` | — | `system.sneakAttackDice` = 3 | Deal +3d4 damage on Favored weapon attacks. |
| Spellcaster | `spellcaster` | `perkmagicaxabmm0` | — | `system.attributes.isSpellcaster` = true; `system.attributes.manaMultiplier` = 2 | Magical Secret perk: grants spellcasting ability with 2x mana multiplier. Requires choosing a casting stat. |
