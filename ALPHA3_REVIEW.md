# Alpha 3 review (2026-10-07)

Everything in the system (classes, perks, ancestries, leveling, armor, weapons, alchemical items) was written from **Core Rulebook v3 Alpha 2**. This file lists what changed in **Alpha 3** (`docs/Vagabond - Core Rulebook v3 Alpha 3 [Interactive PDF].pdf`, local) and what the system must change. Page numbers are Alpha 3.

How it was found: sentence diff Alpha 2 → Alpha 3 (PyMuPDF text), then every class feature / perk / ancestry trait / spell / alchemical item / relic description in `packs/_source` checked sentence by sentence against the Alpha 3 text.

Kind: **Code** = engine or effect change · **Pack** = text / data in `packs/_source` · **New** = new feature or item to author · **Decide** = needs a ruling first.

## 1. Core rules

| # | p. | Change | Kind | Notes |
| --- | --- | --- | --- | --- |
| 1 | 24 | Hero creation is **five steps**: new step 4 "Take a Perk" — every Hero starts with a Perk | Code | char builder: generic 1-Perk grant at creation (Human Aptitude still gives a second one) |
| 2 | 2, 24 | Armor "Reduces damage taken"; **damage from Statuses ignores Armor** | OK | `dealTickDamage` already bypasses Armor — verify nothing else applies it |
| 3 | 26 | Reflex Difficulty formula now prints `+ Slots occupied by Armor` | OK | same rule as `reflexArmorPenalty` |
| 4 | 25 | **Druids Cast with Survival** (skill text moved) | Pack | check Druid `manaSkill` |
| 5 | 27 | Human trait **Knack → Aptitude** | Pack | rename trait in Human ancestry (+ pt-BR) |
| 6 | 80 | **Defense property rewritten**: on a Reflex Save you can make an Attack Check instead; on a pass, reduce the damage by each equipped Defense Weapon's damage dice | **Done** | ruling: pass = Defense dice only (no highest-die removal); Wall / Indestructible now reach the Defense roll; Protector + Patience automated (see CLAUDE.md) |
| 7 | 16 → 80 | **Dual-Wielding** moved to Weapons; the "up to 3 Slots of Equipped Weapons" limit is gone | OK | never coded |
| 8 | 81 | Weapons: **Spear grip 1H → V**; **Staff gains Cleave** | Pack | weapons pack + shop items |
| 9 | 79, 190 | Starting packs Gladiator / Sellsword: **buckler → shield**; treasure Shield table: Shield / Great Shield (no Buckler) | Pack | |
| 10 | 83 | **Backpack**: "1 (held); +3 (worn)" (was "1; 0 while worn") | Pack + Code | ruling: +3 Slots of capacity while worn |
| 11 | 86 | Materials: **Wood removed** from the table; Gold keeps the countdown / degrade text | Code | ruling: remove Wood; migrate Wood items to Iron |
| 12 | 15, 221 | Frightened: -2 to each damage die (p. 15 "each damage die it deals") | Code | ruling: **per die** (today: flat -2 on the total) |
| 13 | 209 | Gold-standard conversion table: 1 gold = 10g | — | conversion appendix only; `CurrencyHelper` unchanged |

## 2. Classes

| Class | p. | Change | Kind |
| --- | --- | --- | --- |
| Alchemist | 33 | Eureka **15+ / 14+ / 13+** (was 10+ / 9+ / 8+); table prints Potency **(+1) / (+2)** | Pack + check Eureka margin field |
| Barbarian | 35 | Table adds **Aggressor (15')** at 10th (text already "every 4 Levels") | Pack (feature entry) + check Speed formula |
| Druid | 41 | Table: Savagery **(+1)** at 2nd (text unchanged). Primal Mystic: check spell count text | Pack |
| Fighter | 43 | Fighting Style: **one Perk** with **Brawl, Finesse, Melee or Ranged** prerequisite (was two, Melee/Ranged) | Pack (grant pool + amount) |
| Gunslinger | 45 | Grit: **remove 3 Deadeye stacks** (was increase Deadeye by 3); reduced by 1 every 4 Levels | Pack + effect check |
| Luminary | 49 | Overheal **once per Action**; excess **once per Turn**. Ever-Cure "chose" → **choose** | Pack (Overheal effect: check per-Action) |
| Magus | 51 | Spell Parry **15+ / 14+ / 13+** | Pack |
| Merchant | 53 | **Gold Sink** rewritten (Luck only if value > 1g); **Diamond Hands** rewritten (swap a held Relic's Power, ≤ 250g ×5 every 4 Levels); **Top Shelf → Midas Touch** (Relic Bonus / Rank +1 while Equipped) | Pack + New |
| Pugilist | 55 | Fisticuffs: **Vicious only** (Defense removed), "when a damage die resolves". Rope-a-Dope: "if you **don't take damage** from a Close Enemy's attack". Haymaker **15+ / 14+ / 13+ at 2 / 6 / 10**, until your next Turn. Moxie **4th / 8th** (Cd6 at 8th). Title Holder: explode on **two highest values** (was 1–2) | Pack + Code (Haymaker formula, Title Holder explode) |
| Rogue | 59 | Table: **Knack (1 Luck) / (2 Luck)**. Sneak Attack dice = **Level ÷ 3, round up** (same numbers, new text) | Pack |
| Sorcerer | 61 | Quickening: "this Casting has a **Cast Max of 0**, +1 every 4 Levels". **New: Twinned Spell (6th)** — 2nd Cast of the same Spell in a Turn is Favored. **New: Overpowered (10th)** — gain 1 Fatigue for Cd4 HP / Max HP / Cast Max | Pack + New |
| Vanguard | 63 | Table: Wall **(1 size) / (2 sizes) / (3 sizes)** | Pack (names) |
| Witch | 65 | **New: Soul Link (6th)**, **Misery Business (10th)** — both need the Hex target | New |
| Wizard | 67 | **New: Extracurricular (6th)** (Studied die adds another known Spell's effect), **Archwizard (10th)** (Cast unknown Spells, no upcast) | New |
| all | 194–203 | **Appendix C Build Guides** rewritten: 2–3 builds per class (stats, training, pack, perks by level) | ruling: **remake the build guides** in the system |

## 3. Perks

| Perk | Change | Kind |
| --- | --- | --- |
| **Fluid Motion** | **New** — DEX 7; walk on liquids and walls during your Move | New |
| Animal Companion | prereq **Leadership & Survival** | Pack |
| Bully | Being used as a **2H Grip d4 Brawl Weapon with Defense** (was Greatshield) | Pack |
| Diplomat, Extrovert, Heavy Arms, Mage Slayer, Mesmer | threshold **10 → 15** | Pack |
| Dusted Knuckle | Brawl dice "can Explode" (was on a 1) | Pack + effect |
| Esoteric Recall | header FEATURE → PERK (book typo fix) | — |
| Marksmanship, Master Chef, Medic, Medium | reworded (Medic: "for a Shift"; Medium: "The GM will answer") | Pack |
| Patience | **Done** with Defense: if you **end your Turn** with a Brawl / Finesse / Melee Weapon you didn't attack or Cast with, it has **Defense** | Pack |
| Peerless Athlete | **skip your Move to Jump** (was Rush and Jump with one Action) | Pack |
| Perfect Parry | if you **don't take damage** from an attack, deflect it (was Reflex by 10+) | Pack |
| Protector | **Done** with Defense: a Close Ally failing a Reflex Save can use **your Defense property** | Pack |
| Quick Draw | first attack can be **Ranged or Thrown** | Pack |
| Sage | sentence "Studied dice … count as granting the Ally Favor" **removed** | Pack |
| Salbenist | coated Weapon stays coated even if it leaves your hand | Pack |
| Selfless | **Near** Ally; the damage "can't be reduced" (any reduction, not just Armor) | Pack |
| Skirmisher | Armor Reflex penalty **reduced by 1** + 5' Speed; **can take up to 3 times** (verify which perk carries the "3 times" line) | Pack + effect |
| Transvection | item gains 30' Fly; ends if used again | Pack |
| Unfailing Guidance | Allies ignore Hinder on Saves **caused by the Target of your Guide Spell** | Pack |
| Sharpshooter | prerequisite now **AWR 7** (was 4+) — verify | Pack |
| Light-footed DEX 4+ perk(s) | prereq adds **Trained: Sneak** — verify which | Pack |
| Cardistry, Mounted Combatant, Scout, Strategist | small text drift found by the check (may predate Alpha 3) | Pack |

## 4. Items, spells, relics

| Item | Change | Kind |
| --- | --- | --- |
| **Oil, Vicious → Oil, Bloodletter** | renamed; damage "can Explode **on a 1**" | Pack |
| Oil, Crone's Ire | Explode **on a 1** if the Target can Cast | Pack |
| Relic power **Vicious → Visceral**; Ace **Thrown → High Velocity** | renamed (Sunder, Undertow reference them) | Pack |
| Relic **Protection +1/+2/+3** | value ×10 (10000g / 100000g / 1000000g) | Pack |
| Spell **Kinesis** | shoot the Target **to a point**; if the point is a Being or Object both take the damage | Pack |
| Spell **Ward** | upcast: when the Target takes damage, Cast Check to reduce it by **1d6 per upcast Mana** | Pack |
| Spell Apoplex | damage base "-" (was Fire) | Pack |
| Bestiary | p.123 immunity lists, p.131 Elephant loses Aquatic, p.152 Cryptid (Beast), p.160 curse text, p.180 Undead, p.181 HP 2 → 1 | Pack |

## 5. Older drift (not Alpha 3, found by the full text check)

The **spells** pack (Adhere, Animate, Beast, Gas, Life, Tempo, Terraform, Ward, …), several **alchemical items** (Speed / Control / Clairvoyance potions, flavor text the book doesn't have) and many **relics** (scrolls, Spell Book, Philosopher's Stone, Phoenix Down) do not match the book text even for Alpha 2. They were never part of the book rewrite. Ruling: **fix in this review** (book text wins).

## 6. Order of work

1. ~~Rulings~~ settled 2026-10-07 (see rows). Defense property done first.
2. Pack text + data fixes (classes, perks, items) — one commit per area; class migrations re-run via new guard settings.
3. Code: creation Perk step, Defense property, Pugilist formulas, Title Holder explode, Gunslinger Grit.
4. New features: Sorcerer Twinned Spell / Overpowered, Witch Soul Link / Misery Business, Wizard Extracurricular / Archwizard, Merchant Midas Touch, Fluid Motion perk, Bloodletter.
5. `npm run pack`, then the in-world tests in `CLASS_REWRITE_NOTES.md` plus the ones added here.
