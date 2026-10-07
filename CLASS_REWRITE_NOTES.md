# Class rewrite batch — Luminary → Wizard (2026-10-07)

Source: `docs/Classes_to_finish.pdf` (local, git-ignored). Rules: `docs/class-authoring-guide.md` (local). This file is the committed record. One commit per class.

Decisions that were not obvious are listed under **Doubts / course taken** for each class: revisit and change them if the table disagrees. Every class needs `npm run pack` (classes, and perks where noted) before it can be tested; each class is migrated on world load by `helpers/class-migrations.mjs` (guard setting `<class>ClassMigrated`).

Common to every class here: **Cast Max** is the book's own formula (`2 + Level` or `1 + half Level, round up`), but the engine always adds the casting Stat + half Level — so each caster has a class effect on `system.mana.castingMaxBonus` that cancels the Stat and adds the book formula (same trick as the Druid). A character whose casting Stat changes by an Active Effect stays correct, because `@stats.<key>.total` is read live.

## Luminary

Book p. 45. Theurgy (Mysticism casting, 4 × Level Mana, Cast Max 2 + Level, Life always known), Radiant Healer (Assured Healer perk + healing Spell rolls Explode on the highest face), Overheal, Ever-Cure, Revivify, Life-Giver. Training is now Influence + Mysticism (no choices).

**Doubts / course taken**
- Overheal "half your Level": the book gives no rounding → rounded **down** (`floor(@lvl / 2)`: +1 at Lv 2–3, +2 at Lv 4–5 …). Change in the Overheal effect if the table rounds up.
- Overheal is applied through `system.healingBonusDice` (the flat term `floor(@lvl / 2)` is appended to every HP-restoring roll: Spells, potions). It is not limited to Spells — the book says "When you restore HP".
- New field `system.healingExplode` (ADD `1`, `2`, `max`, `max-1`) is read only for HP-restoring **Spell** rolls (the book says "healing rolls of your Spells"). Radiant Healer adds `max`; the Assured Healer perk got an effect adding `1` (its text: "Explode on a 1"). Perk items already on characters get that effect from the migration.
- "chose" (sic) in Ever-Cure is kept verbatim from the book.
- The Radiant Healer feature keeps `perkAmount 1` with a pool of exactly Assured Healer (a guaranteed grant).

**Text-only / deferred**
- Overheal: giving the excess healing to yourself / another Being (text only — no overflow-routing hook).
- Ever-Cure: ending a Status when you restore HP (text only; remove it by hand from the Target).
- Revivify and Life-Giver (revival rules, Fatigue on revival) — text only.

**Tests to run in-world** (after `npm run pack`)
- [ ] Builder: Luminary L1 learns 4 Spells with **Life** forced, gets Assured Healer automatically, Mana 4, Cast Max 3 (any Awareness). Training = Influence + Mysticism, no skill choices.
- [ ] Level up: Mana 4 × Level, Cast Max = 2 + Level (L2 → 4 … L10 → 12), spells known 4/4/5/5/6/6/7/7/8/8.
- [ ] Heal with Life/Mend: the d6 explodes on 6 **and** on 1 (Assured Healer); a Luminary-less character with Assured Healer explodes on 1 only.
- [ ] Overheal at L2 (+1) and L4 (+2): the healing roll shows the extra flat term; potions get it too; Overheal shows **Locked** at L1.
- [ ] Effects list: Theurgy / Radiant Healer / Overheal listed under Class Features (no switch).
- [ ] Existing Luminary character (old Saving Grace class): migration converts it, marks Influence trained, adds the explode effect to its Assured Healer perk.

## Magus

Book p. 47. Arcanum (Gish perk grant, Arcana casting, 2 × Level Mana, Cast Max 1 + half Level round up), Enspell, Spell Parry (10+/9+/8+), Arcane Surge, Esoteric Flow, Sword & Sorcery. Training Arcana + Melee (no choices). Spellstriker, Esoteric Eye, Arcane Recall and Aegis Obscura are gone.

**Doubts / course taken**
- "one of which must always have a damage base" cannot be expressed as a required Spell (the old class forced Ward) → no required Spell; the rule is text only and the player chooses.
- Spell Parry has one feature entry per level named with its threshold, as in the book table ((10+), (9+), (8+)); the text is the same on every entry.
- Only Cast Max is an effect. The rest needs Imbue / Block hooks that do not exist (see deferred) and stays text, per manual-first.

**Text-only / deferred**
- Enspell (continual Imbue, change the Spell by skipping a Move) — the Imbue flow has no "continual" mode for a class.
- Spell Parry (redirect a Cast you saved against by 10+ / 9+ / 8+) — no hook on the save result to retarget the Cast.
- Arcane Surge (1 / 2 Mana discount on Imbued deliveries) — `bonuses.deliveryManaCostReduction` is global, not Imbue-scoped, so it was not used.
- Esoteric Flow (attack uses the Imbued Spell’s damage base; permanent Blink) and Sword & Sorcery (Attack + Cast in one Turn) — text only.

**Tests to run in-world** (after `npm run pack`)
- [ ] Builder: Magus learns 2 Spells (+1 at L4, L7, L10), Mana 2 × Level, Cast Max 2 / 2 / 3 / 3 / 4 / 4 / 5 / 5 / 6 / 6 for L1–10; Gish granted automatically; Training Arcana + Melee.
- [ ] Spell Parry / Arcane Surge entries show the right name per level in the level-up dialog and on the sheet.
- [ ] Existing Magus (old Spellstriker class) migrates (Spellstriker feature gone, Arcanum effect present).

## Merchant

Book p. 49. Gold Sink, Deep Pockets (Deft Hands perk grant + 2 Item Slots now and every 3 Levels), Line Goes Up (+1/+2/+3 Luck), Diamond Hands (+1/+2), Opportunist, Top Shelf. Training Craft, Finesse, Influence (no choices); Key Stat Luck/Reason. Bang for Your Buck and Treasure Seeker are gone.

**Doubts / course taken**
- Deep Pockets Slots read as 2 at Levels 1–3, 4 at 4–6, 6 at 7–9, 8 at 10 ("now and every 3 Levels hereafter"): `2 + 2 * floor((@lvl - 1) / 3)`.
- Line Goes Up is **text only**: Rest already refills Luck to its maximum (`downtime-app.mjs`) and the Luck pool is clamped to that maximum, so "1 extra Luck when you Rest" has no room to land and the Breather Luck gain has no hook. Needs a ruling (allow Luck above max? raise max?) before it can be an effect. Rogue Knack has the same extra-Luck-on-Rest wording.
- Playing Merchant: the book line reads "a low-defense and damage character" in the PDF image — transcribed as seen, check the wording.
- Key Stat is now Luck/Reason (old data: Reason, Presence).

**Text-only / deferred**
- Gold Sink (swap valuables in a container for an Item of equal or lesser value, 1 Luck) and Top Shelf (pull a Relic, +1 Luck per 250g) — container swap flow does not exist.
- Line Goes Up (Luck on Breather / Craft / Travel / Rest) — see doubt above.
- Diamond Hands (Items count as Relics with a +1 / +2 Bonus Relic Power while Equipped) — needs a relic-power layer on non-relic items.
- Opportunist (Use Action after another Being acts) — text only.

**Tests to run in-world** (after `npm run pack`)
- [ ] Builder: Merchant is Trained in Craft, Finesse and Influence with no extra Skill choices; Deft Hands granted automatically.
- [ ] Inventory: +2 Item Slots at Level 1 (on top of the Deft Hands perk), 4 at Level 4, 6 at Level 7, 8 at Level 10.
- [ ] Existing Merchant (old Bang for Your Buck class) migrates; Finesse is marked trained; the old "Deep Pockets (Feature)" effect is replaced by "Deep Pockets".

## Pugilist

Book p. 51. Fisticuffs (Dusted Knuckle perk grant + Vicious on Brawl crits), Rope-a-Dope, Haymaker (10+ / 9+), Moxie (Cd4 / Cd6), Title Holder (d6 / d8). Training Brawl + Influence (no choices). Check Hook is no longer granted; Beat Rush, Prowess and Impact are gone.

**Doubts / course taken**
- "damace" (sic) in Fisticuffs is written "damage".
- Fisticuffs gives Equipped Brawl Weapons the Defense and Vicious properties. Vicious is an effect on the character (`critExtraDiceBySkill` brawl: 1 = one extra die matching the weapon on a Brawl Crit); a Brawl weapon that already carries Vicious would add a second die (none of the pack Brawl weapons — Caestus, Katar, Unarmed — has it). Defense has no mechanic in the system, so it stays text.
- Haymaker: the Dazed is applied with no Save and is lifted when the Pugilist’s next Turn starts **in a Combat** (the Pugilist actor remembers its Targets in `flags.vagabond.haymakerTargets`; the active GM lifts them). With no Combat nothing counts Turns, so it is removed by hand. The automatic part is the switchable effect "Haymaker: Auto" and obeys the world Class Automation setting; the formula is `10 - floor((@lvl - 2) / 6)` (9+ at Level 8, 8+ at Level 14).
- Only the first Target of an attack can be Dazed (a Brawl attack has one Target).
- Moxie Favor: the book lists Grappled and Restrained; Grappled applies Restrained here, so the effect resists Dazed, Frightened and Restrained. The Cd4 / Cd6 "0 HP doesn’t kill you" countdown is text.
- Title Holder "You use a d6 for the damage dice": implemented as "at least a d6" (a weapon with a bigger die keeps it; never lowers). New fields `weaponDieBySkill` / `weaponLowExplodeBySkill` (typed "skill: value" like `critExtraDiceBySkill`). The d6 applies to the **damage roll** only: the number printed on the weapon / HUD still shows the weapon’s own die.

**Text-only / deferred**
- Fisticuffs second paragraph (after rolling Brawl damage dice: raise later Brawl dice one size, or Grapple / Shove) and Rope-a-Dope (free attack / 5’ Move after Defense reduces damage to 0) — text only.
- Moxie’s 0-HP countdown — text only (a countdown die can be created by hand).

**Tests to run in-world** (after `npm run pack`)
- [ ] Builder: Pugilist Trained in Brawl and Influence without skill choices; Dusted Knuckle granted automatically.
- [ ] Brawl attack Crit: one extra weapon die appears (Fisticuffs) even if the Luck benefit toggle is claimed.
- [ ] Level 2+: a Brawl hit that beats Difficulty by 10 (9 at Level 8) Dazes the Target and posts a "Haymaker" card; Target already Dazed / immune → card says so; the Dazed is lifted when the Pugilist’s Turn starts in a Combat; switching "Haymaker: Auto" off, or the world Class Automation = Manual, stops it.
- [ ] Level 4+: Favor on Saves against Dazed, Frightened and Restrained (status resistance shows in the effect).
- [ ] Level 6: Brawl damage roll uses d6 (d8 at Level 10), a d4 Unarmed rolls d6, and the dice Explode on 1 or 2; the roll card shows the explosion.
- [ ] Existing Pugilist (old Impact class) migrates: Influence trained, Dusted Knuckle added, Haymaker / Moxie / Title Holder effects present.

## Revelator

Book p. 53. Righteous (Gish perk grant, Leadership casting, 2 × Level Mana, Cast Max 1 + half Level), Enspell, Lay on Hands (d4 / d6 / d8), Paragon’s Aura, Divine Resolve, Holy Diver. Training Leadership + Melee (no choices). Old data had 0 Spells at Level 5 (typo) — the book’s 3 is used.

**Doubts / course taken**
- "one of which must always have a damage base" is text only (no required Spell), same as Magus.
- Lay on Hands is a **feature button** (`system:revelator.layOnHands`, one per entry; it appears from Level 2): spends 1 Mana, rolls `1d{4|6|8} + Level` as a healing roll through the damage pipeline (so Healing bonuses like Virtuoso’s Inspiration die apply) and posts an action card with the Apply button for the Target. The Target is the first targeted token, else yourself; a targeted token must be Close (≤ 5 ft) or the button warns and does nothing. "Use your Action or skip your Move" is not enforced.
- The die is the effect "Lay on Hands" (`system.layOnHandsDie` = `4 + 2 * floor((@lvl - 2) / 4)`); the feature button does nothing without it (switch it off = no Lay on Hands).
- Divine Resolve is two effects: "Divine Resolve" (`statusImmunities` blinded, paralyzed, sickened — Level 6) and "Divine Resolve: Lay on Hands" (`layOnHandsCures`, the same three Statuses cured on the Target of the button).
- Paragon’s Aura wording kept verbatim: "You have a 2 Mana discount on the Aura Delivery" then the Imbue discount that grows with the (1 Mana) / (2 Mana) entries.

**Text-only / deferred**
- Enspell (continual Imbue) and Paragon’s Aura (Aura Delivery discount + once-per-Round Imbue discount) — no Imbue-scoped discount hook; text only (same gap as Magus Arcane Surge).
- Holy Diver (permanent Bless and Exalt on you and your Weapons) — text only.
- Range check for Lay on Hands uses the token distance (≤ 5 ft = Close); no line-of-sight / reach rules.

**Tests to run in-world** (after `npm run pack`)
- [ ] Builder: Revelator learns 2 Spells (+1 at L4, L7, L10 — 3 at Level 5 now), Mana 2 × Level, Cast Max 1 + half Level round up using Presence; Gish granted; Training Leadership + Melee, no skill choices.
- [ ] Level 2: the Lay on Hands button shows on the feature; click with a Close ally targeted → 1 Mana spent, card with `d4 + Level` healing and Apply button; with nothing targeted heals yourself; with a Far ally warns; with 0 Mana warns.
- [ ] Level 6: Lay on Hands rolls a d6 and cures Blinded / Paralyzed / Sickened on the Target (card lists them); Revelator can’t be Blinded / Paralyzed / Sickened (status immunity).
- [ ] Level 10: d8; an actor with Virtuoso Inspiration gets the extra d6 on the heal.
- [ ] Existing Revelator (old class) migrates; Leadership + Melee stay trained.

## Rogue

Book p. 55. Sneak Attack (extra d4s + Armor ignored), Infiltrator (Resourceful perk grant), Evasive (+5’ every 4 Levels), Knack, Lethal Weapon, Waylay. Training Ranged, Finesse, Sneak (no choices). Unflinching Luck is gone.

**Doubts / course taken**
- **Knack vs Unflinching Luck:** the book’s Class Features table still prints "Unflinching Luck (d20)" at 4th and "(d12)" at 8th, but the feature card at those Levels is **Knack** (Luck on Breather / Crit / Rest). The table is kept verbatim in the class description, the level features are named **Knack** (their text is the card’s). If the table is right and the card is wrong, rename them and swap the text.
- **Evasive names:** entries are "Evasive" (2nd), "Evasive (15’)" (6th), "Evasive (20’)" (10th) as in the table; same card text on each.
- **Sneak Attack automation** (effect "Sneak Attack: Auto", switchable, obeys the world Class Automation setting): the first hit with a **Favored** attack (the roll’s net Favor) using a Finesse-skill, Ranged-skill or Keen weapon arms the next damage roll of that weapon with the extra d4s (Explode "x" from Level 6 via "Lethal Weapon") and posts a "Sneak Attack" card. The Armor it ignores is given back when that damage is applied (the Rogue’s flag `sneakIgnore` lives until their next weapon attack). **Once per Turn** only inside a started Combat (key = Combat id : Round : Turn); with no Combat there are no Turns to count, so every qualifying hit counts. Without the Auto effect nothing is automatic — roll the d4s by hand.
- A damage roll made through Luck / reroll flows loses the Sneak dice (they are consumed by the first roll of that weapon).
- **Knack** is only partly automated: the extra Luck **on a Crit** is an effect ("Knack", Level 4+, `critLuckBonus`; any d20 Crit). Luck on a Breather / Craft and the extra Luck on Rest are text: Rest already refills Luck to its maximum and the pool is clamped to that maximum (same gap as Merchant Line Goes Up).
- Qualifying weapons are decided by the **attack skill** (Finesse or Ranged) or the Keen property — "Finesse Weapon" is not a weapon property in the system.

**Text-only / deferred**
- Evasive (free 10’ / 15’ / 20’ Move after another Being acts), Waylay (spend 1 Luck: immediate Action after a kill or Evasive) and Infiltrator’s Favor on ambush / traps — text only.
- Knack: Luck on Breather / Craft / Travel and the extra Luck on Rest — needs a ruling on Luck above the maximum (see Merchant).

**Tests to run in-world** (after `npm run pack`)
- [ ] Builder: Rogue Trained in Ranged, Finesse and Sneak without skill choices; Resourceful granted automatically.
- [ ] Level 1 with "Sneak Attack: Auto": a Favored hit with a Ranged / Finesse / Keen weapon → damage roll includes +1d4 (a "Sneak Attack" card appears); second Favored hit in the same Turn (in a started Combat) gets nothing; next Turn gets it again; a non-Favored hit or a Melee-only weapon gets nothing.
- [ ] Armor: the Sneak Attack damage applied to a target with Armor 2 ignores 1 Armor at Level 1 (2 at Level 4); a normal attack afterwards does not.
- [ ] Level 4+: 2d4 (Level 7: 3d4, Level 10: 4d4). Level 6+: the sneak dice Explode (roll `Nd4x` shows exploded dice).
- [ ] Level 4+: a natural Crit gives +1 Luck (card "Knack"), capped at max Luck.
- [ ] World Class Automation = Manual (or switching "Sneak Attack: Auto" off): no automatic dice; effects stay listed.
- [ ] Existing Rogue (old Unflinching Luck class) migrates; Sneak Attack / Knack effects present.

## Sorcerer

Book p. 57. Glamour (Influence casting, 4 × Level Mana, Cast Max 2 + Level), Tap (Vehement Magic perk grant), Quickening (0 / 1 / 2 Mana), Spell-Slinger (-1 / -2). Training Arcana + Influence (no choices); Key Stat Presence, Might. Arcane Anomaly, Spell Twinning and Overpowered are gone.

**Doubts / course taken**
- The old class’s Spell-Slinger effects wrote `system.spellCritBonus`, a field nothing reads (dead) — the real field is `castCritBonus`, used now.
- Spell-Slinger "one size larger": `spellDamageDieSizeBonus` +2 (d6 → d8, the engine adds die faces), from Level 4. The Crit part is `castCritBonus` = −1 at Levels 4–7, −2 at 8–11 (…, −3 at 12). The book also lowers the Crit roll for **Saves against Casts** — the system has no "save against a Cast" Crit field (only per-save ones), so that part is text.
- Tap grants **Vehement Magic** (the book), not Secret of Mana (the old class, a guess). Spending HP as Mana (and cutting Max HP until Rest) is text: pay it by hand (lower Max HP via the sheet).
- Quickening (skip your Move to Cast; upcast Mana limit 0 / 1 / 2) is text only.

**Text-only / deferred**
- Tap: HP → Mana conversion and the Max HP reduction until Rest — a "Tap" button (chat-card choice) is the natural follow-up.
- Spell-Slinger Crit on Saves against Casts, and Quickening — text only.

**Tests to run in-world** (after `npm run pack`)
- [ ] Builder: Sorcerer learns 4 Spells (+1 every 2 Levels), Mana 4 × Level, Cast Max 2 + Level (3 at Level 1, 12 at Level 10); Vehement Magic granted; Training Arcana + Influence, no skill choices.
- [ ] Level 4: Spell damage die is d8 (was d6) in the cast dialog and the damage roll; Crit on Cast Checks at 19+; Level 8: Crit at 18+.
- [ ] Spell-Slinger effects show Locked below Level 4.
- [ ] Existing Sorcerer (old Spell Twinning class) migrates; Arcana trained; Vehement Magic added; the broken `spellCritBonus` effects are gone.

