# Alpha 3 review (2026-10-07)

## ▶ Resume here (updated 2026-10-08)

1. **Phase 1 tested and signed off** (user, 2026-10-08) — bugs found in testing are fixed (Luck reroll of consumed items, Sickened/Frightened chat annotations, Incapacitated auto-fail on every Skill/Save built on Might/Dexterity, Acid Basic Burning = acid). Checklist kept below for regression only.
2. **Phase 2 — Classes** (below), then Phases 3 → 6.
3. Later sessions: bestiary / humanlike statblocks, full gear audit.

Rulings in force: book is source of truth (no old-flow switches); lowercase "attack" covers Casts; Vulnerable hampers all its Checks / Saves; Backpack "one at a time" left to the table.

Everything in the system (classes, perks, ancestries, leveling, armor, weapons, alchemical items) was written from **Core Rulebook v3 Alpha 2**. This file lists what changed in **Alpha 3** (`docs/Vagabond - Core Rulebook v3 Alpha 3 [Interactive PDF].pdf`, local) and what the system must change. Page numbers are Alpha 3.

How it was found: sentence diff Alpha 2 → Alpha 3 (PyMuPDF text), then every class feature / perk / ancestry trait / spell / alchemical item / relic description in `packs/_source` checked sentence by sentence against the Alpha 3 text.

Kind: **Code** = engine or effect change · **Pack** = text / data in `packs/_source` · **New** = new feature or item to author · **Decide** = needs a ruling first.

## 1. Core rules

| # | p. | Change | Kind | Notes |
| --- | --- | --- | --- | --- |
| 1 | 24 | Hero creation is **five steps**: new step 4 "Take a Perk" — every Hero starts with a Perk | Code | char builder: generic 1-Perk grant at creation (Human Aptitude still gives a second one) |
| 2 | 2, 24 | Armor "Reduces damage taken"; **damage from Statuses ignores Armor** | OK | `dealTickDamage` already bypasses Armor — verify nothing else applies it |
| 3 | 26 | Reflex Difficulty formula now prints `+ Slots occupied by Armor` | OK | same rule as `reflexArmorPenalty` |
| 4 | 25 | **Druids Cast with Survival** (skill text moved) | OK | Druid `manaSkill` is already `survival` |
| 5 | 27 | Human trait **Knack → Aptitude** | Pack | rename trait in Human ancestry (+ pt-BR) |
| 6 | 80 | **Defense property rewritten**: on a Reflex Save you can make an Attack Check instead; on a pass, reduce the damage by each equipped Defense Weapon's damage dice | **Done** | ruling: pass = Defense dice only (no highest-die removal); Wall / Indestructible now reach the Defense roll; Protector + Patience automated (see CLAUDE.md) |
| 7 | 16 → 80 | **Dual-Wielding** moved to Weapons; the "up to 3 Slots of Equipped Weapons" limit **stays** (p. 20, p. 76) | OK | already coded (`EquipmentHelper.weaponSlotCap`) |
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
| Situational Awareness | prerequisite **AWR 7** (was 4+) | Pack |
| Treads Lightly | prereq adds **Trained: Sneak** | Pack |
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

## 5b. Structured data check (numbers, not text) — 2026-10-07

| Area | Result |
| --- | --- |
| Saves (Endure MIT×2, Reflex DEX+AWR + Armor Slots, Will RSN+PRS), Check Difficulty `20 − Stat (×2 Trained)`, stat arrays, HP, Inventory Slots `8 + MIT`, Speed table, Crawl `3 × Speed`, Travel | **match** (`homebrew-config.mjs` defaults) |
| Reflex Armor penalty | same math; code subtracts it from the roll, Alpha 3 prints it inside the Difficulty — optional display change (sheet Reflex Difficulty + Armor Slots) |
| **Bonus Trainings from Reason** (Level 1: half RSN round up; later RSN increases add one) | **missing** in the builder and level-up — pre-existing gap (same text in Alpha 2) |
| **3 Slots of Equipped Weapons** | **missing** (see #7) |
| Weapons (42): type/skills, properties, range, grip, value, Slots, damage | match except Spear (grip V) and Staff (Cleave) — Alpha 3 changes |
| Armor table (Light/Medium/Heavy rating, value, Slots, Might) | match |
| Alchemical item values (84) | match (Oil, Vicious → Bloodletter rename only) |
| Gear (427): 225 matched by name | mismatches: Backpack (Alpha 3), **Cauldron 0 → 2 Slots**, **Needle, Sack 1 → 0 Slots**, Bucket (book prints 5c and 5s in two tables). The other ~200 use different names (sub-items "Jar - Clay", trinket tables) — **manual pass needed** |
| Class tables (Spells known, Mana, Training, casting skill) | match all 18 classes |
| Perk prerequisites (108) | match except the Alpha 3 changes (Animal Companion, Situational Awareness, Treads Lightly) |
| Statuses (`config.mjs`) vs p. 11 | **Frightened** −2 per damage die (code: −2 total); **Sickened** −2 per healing die (code: −2 total); **Prone** = crawl at half Speed + Vulnerable only for Melee attacks and Reflex Saves (code: Speed 0 + full Vulnerable); Incapacitated must also fail Reflex Saves — check |
| Not yet checked | bestiary / humanlike statblocks (only the Alpha 3 text diffs are known), starting pack contents and prices, relic values, stores, trinket tables, spell numbers beyond the text check |

## 6. Work plan (next sessions)

Status 2026-10-07: rulings settled, Defense property done (`61c1973`). **Phase 1 coded** (`a015d98`→`295a98b`, untested); Phases 2–6 open. Each phase = its own session; one commit per numbered item group; every pack change ships with a guarded migration for existing worlds (see `helpers/class-migrations.mjs` pattern). Update pt-BR (`lang/pt-BR.json`) for every new / changed string.

### Phase 1 — Core rules (engine)
- [x] **1.1 Reflex Difficulty includes Armor** — `saves.reflex.difficulty` += worn Armor Slots (`reflexArmorPenalty`) in `actor-character.mjs`; drop the `- N[Armor Penalty]` term from `_rollSave` and roll-handler (no double count); sheet / HUD / save card show the dynamic number. Defense Attack Check stays penalty-free.
- [x] **1.2 Frightened** −2 **per damage die** (status AE → per-die field, e.g. `bonusPerDamageDie`); **Sickened** −2 **per healing die received** (needs an incoming per-die healing modifier).
- [x] **1.3 Prone** — crawl (half Speed) instead of Speed 0; Vulnerable only for Melee attacks and Reflex Saves (new defender modifier scoped by attack type / save).
- [x] **1.4 Incapacitated** auto-fails Reflex Saves (verify `autoFailStats` covers saves).
- [x] **1.5 Bonus Trainings from Reason** — builder Level 1: extra Trainings = ceil(RSN / 2); level-up: raising RSN past a threshold grants one more Training.
- [x] **1.6 3 Slots of Equipped Weapons** — enforce in `EquipmentHelper.equipWithHandLimit` + `sanitizeHandLimit` (bump oldest weapon), warn on equip.
- [x] **1.7 Creation Perk step** — every Hero takes one Perk at creation (builder Perks step adds a free generic Perk; Human Aptitude still adds its own).
- [x] **1.8 Remove Wood** material — drop `metalData.wood`; migrate Wood items to Iron (guard setting).
- [x] **1.9 Backpack** — 1 Slot held, +3 Slots of capacity while worn (container / slot math + pack item).
- [x] **1.10 Defense follow-up** — migration adding the Patience / Protector effects to perk items already on actors.

**Phase 1 — what was built (for testing):**
- 1.1 `saves.reflex.difficulty` += `reflexArmorPenalty`; roll-handler / `_rollSave` no longer subtract it (status Saves now also see Armor, they didn't before).
- 1.2 New actor fields `damageDiePenalty` (Frightened 2, pipeline step 10b, harmful damage only, each die floors at 0, chat badge) and `healingDiePenalty` (Sickened 2, healing button carries `data-die-values`). NPC flat damage: −2 × dice in the action's roll formula (`flatDamageAfterDiePenalty`).
- 1.3 New fields `speedHalved` + `meleeReflexVulnerable` (Prone). Votes: its Melee attacks Hinder, Melee attacks at it Favor (`Item#rollAttack`), Saves vs its Melee attacks Favor (`_attackerSaveVote`), its Reflex Saves + Defense Check vs attacks Hinder (`defenseRules`).
- 1.4 `autoFailStats` += `reflex` (Incapacitated / Paralyzed / Unconscious); `VagabondRollBuilder.autoFails()` now honored by chat-card Saves, Defense Check and status Saves (Dead too).
- 1.5 Builder Stats step: Reason picker (`skillSelections.reason`, `reasonTrainingCount`). Level-up Stats tab: Training pick when +1 Reason makes an even total odd.
- 1.6 Was already coded (`weaponSlotCap`, bump in `equipWithHandLimit` / `sanitizeHandLimit`) — no change.
- 1.7 Unrestricted "Hero Creation" Perk grant in the builder Perks step (always on — book is the source of truth).
- 1.8 Wood removed; `migrateData` wood → iron (no world migration needed).
- 1.9 New `noSlotsWhenWorn` field; Backpack 1 Slot carried / 0 Slots + when-equipped +3 worn. "Only benefit from one at a time" is left to the table (ruling).
- Migrations (`helpers/alpha3-migrations.mjs`, guards `alpha3StatusesMigrated` / `alpha3BackpackMigrated` / `alpha3DefensePerksMigrated`): status AEs on actors rewritten; old Backpacks updated (first one per actor put on); Patience / Protector perks get text + effect (waits for `npm run pack`). Backpack / Defense-perk matching uses the compendium source id (English name and Backpack icon as fallbacks), so translated copies migrate too.
- Vulnerable (ruling: lowercase "attack" covers Casts; a Vulnerable Being is hampered overall): Vulnerable / Flanked / Blinded / Restrained / Incapacitated / Paralyzed / Unconscious / Dead = blanket `favorHinder: hinder` (its Checks and Saves) + new `vulnerable` flag: attacks and Cast Checks targeting it Favor, Saves vs its attacks / Casts Favor. Target votes for weapon attacks and Cast Checks share `VagabondRollBuilder.targetingVotes` (Cast Checks read target statuses now). Flanked +2 applies to Casts too.
- Invisible ("those that can't see it act as Blinded"): attacks / Casts at it Hinder, its attacks / Casts Favor, Saves vs its attacks Hinder, its Saves vs attacks Favor (`unseenDefender` rule). Prone's Melee rules include Touch Casts. NPCs gained `defenderStatusModifiers` so Invisible / Unconscious work on them.

### Phase 2 — Classes (pack text + effects + migrations)
- [ ] Alchemist: Eureka 15+ / 14+ / 13+ (margin field + names), Potency table names (+1) / (+2).
- [ ] Barbarian: Aggressor (15') entry at 10th.
- [ ] Druid: Savagery (+1) name at 2nd.
- [ ] Fighter: Fighting Style = **one** Perk, pool Brawl / Finesse / Melee / Ranged prerequisite.
- [ ] Gunslinger: Grit = remove 3 Deadeye stacks (text + `deadeyeGrit` effect / helper).
- [ ] Luminary: Overheal once per Action, excess once per Turn; Ever-Cure "choose".
- [ ] Magus: Spell Parry 15+ / 14+ / 13+.
- [ ] Merchant: Gold Sink, Diamond Hands rewritten; Top Shelf → Midas Touch.
- [ ] Pugilist: Fisticuffs Vicious only; Rope-a-Dope; Haymaker 15+/14+/13+ at 2/6/10 (`haymakerMargin` formula, "until your next Turn"); Moxie 4th / 8th; Title Holder explodes on the **two highest** faces (pipeline: new high-explode by skill, drop low-explode).
- [ ] Rogue: table Knack (1 Luck) / (2 Luck); Sneak Attack text (Level ÷ 3 round up).
- [ ] Sorcerer: Quickening = Cast Max 0 (+1 / 4 Levels).
- [ ] Vanguard: Wall entries (1 size) / (2 sizes) / (3 sizes).
- [ ] Human: trait Knack → **Aptitude** (ancestry migration).

### Phase 3 — New class features
- [ ] Sorcerer **Twinned Spell** (6th: 2nd Cast of the same Spell in a Turn Favored) and **Overpowered** (10th: 1 Fatigue → Cd4 HP / Max HP / Cast Max countdown).
- [ ] Witch **Hex target tracking** (prerequisite), then **Soul Link** (6th) and **Misery Business** (10th: hexed Target Weak to your damage).
- [ ] Wizard **Extracurricular** (6th: Studied die adds another known Spell's effect) and **Archwizard** (10th: Cast unknown Spells, no upcast).
- [ ] Merchant **Midas Touch** (Relic Bonus / Rank +1 while Equipped) and **Diamond Hands** (swap a held Relic's Power ≤ 250g × 5 per 4 Levels) — text first if the relic layer is missing.

### Phase 4 — Perks, items, spells, relics (pack text + data)
- [ ] Perks §3 (20+ text / prerequisite changes) + **new perk Fluid Motion**; effects for Dusted Knuckle (explode), Skirmisher (Reflex penalty −1, +5' Speed, take 3×).
- [ ] Weapons: Spear grip V (+ `damageTwoHands`), Staff Cleave; shop copies too.
- [ ] Starting packs: Gladiator / Sellsword buckler → shield; treasure Shield table.
- [ ] Gear: Cauldron 2 Slots, Needle / Sack 0 Slots, Bucket value (book conflict — pick one).
- [ ] Alchemical: Oil, Vicious → **Oil, Bloodletter** (explode on a 1); Crone's Ire explode on a 1.
- [ ] Relics: Vicious → **Visceral**, Ace Thrown → **High Velocity** (Sunder, Undertow text), Protection ×10 values.
- [ ] Spells: Kinesis, Ward upcast, Apoplex damage base + the older drift in §5 (Adhere, Animate, Beast, Gas, Life, Tempo, Terraform, …).
- [ ] Alchemical / relic older drift in §5 (flavor text the book lacks, Speed / Control potions, scrolls, Spell Book, Philosopher's Stone, Phoenix Down).

### Phase 5 — Build Guides (Appendix C, pp. 194–203)
- [ ] Data model for 2–3 builds per class (stats array by level, Trainings, Starting Pack, Weapon / Armor, Spells, Perks by level) — likely `system.buildGuides` on the class item.
- [ ] Builder: pick a build guide → pre-fill stats / Trainings / pack / Perks (always overridable).
- [ ] Author all builds from the book.

### Phase 6 — Test
- [ ] `npm run pack`; reload as GM; migrations run once.
- [ ] Defense: shield buttons, pass / fail / crit, Wall & Indestructible on the Defense roll, Protector refund + Apply, Patience in and out of Combat, setting off = chosen weapon only.
- [ ] `CLASS_REWRITE_NOTES.md` checklists + every Phase 1–5 item.

### Later sessions (out of this review)
- Bestiary + humanlike statblocks against Alpha 3.
- Full gear audit (~200 items whose names differ from the book tables).
- Starting pack contents / prices, stores, trinket tables, relic values.
