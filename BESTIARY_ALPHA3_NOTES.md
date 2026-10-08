# Bestiary / Humanlike vs Alpha 3 — change log

Source: Core Rulebook v3 Alpha 3 PDF, printed pp. 112-114 (Humanlike) and 118-181 (Bestiary; the Undead chapter
runs onto p. 181 with the Zombies). Method: PyMuPDF text -> statblock parser -> field-by-field diff against
`packs/_source/humanlike` / `packs/_source/bestiary` -> patch. Book wins on every field it prints.

Rules followed
- **Existing `_id`s are kept.** New statblocks get fresh ids, listed below under "New".
- **Deleted statblocks are moved** (not removed) to `check_before_delete/<pack>/`.
- Only fields that differ are touched; structured action data (`causedStatuses`, damage type, macros, weapon links)
  is kept when the action text did not change its status words.
- `Bolt` stays normalised to `Remote` (earlier ruling), `×` is kept as in the book.
- Armor / Weak / Immune / Status Immunities are rewritten from the book line (`Pierce`->`piercing`, `Slash`->`slashing`,
  `Magic`->`magical`, `Fatigue`->`fatigued`, `Blindness`->`blinded`).
- Sub-types printed in parentheses on the size line (`(Wyrm)`, `(Beast)`, `(Plant)` ...) go in front of the
  description, as the pack already did for ~60 monsters (`(Shapechanger) Blood-sucking ...`).
- `npm run pack` is still needed (Foundry closed) before the world sees any of this.

---

## Part 1 — Humanlike (book pp. 112-114)

| Kind | Who | Notes |
|---|---|---|
| **New** | Brawler (`YqGxXlnHECP9NOrQ`), Druid (`oTAGPHK0470vOOqS`), Sellsword (`f1WQFsrtUeCQHlfl`) | not in the Alpha 2 pack; created from the book statblocks |
| **Deleted** | Warlord (`aD4znybU2n2ezbdF`) | was an exact duplicate of Commander, not in the book -> `check_before_delete/humanlike/` |
| Stats | Knight Morale 8 -> 10, Mage (Frost) Morale 4 -> 8, Veteran TL 2.4 -> 2.9, Cultist | |
| Actions | Acolyte: Turn Undead / Sacred Flame replaced by Ward / Holy Flame; Assassin, Spy, Veteran get the `Combo` line (Alpha 2 `Flurry` / `Multi-Attack` renamed); Jester loses Mime; Mage (Fire/Frost/Shock) spell texts ("Cd6 if failed as a 1"); Noble Rapier / Sellsword Longsword "or 2 dice if failed on a 1"; Bard Inspiring Anthem is now Favor; Apothecary Health Potion / Panacea wording | |
| Abilities | Archer / Bounty Hunter Hunter's Mark, Assassin / Spy Sneak Attack (`(1/Turn)`), Berserker Rage, Archmage Magic Ward II (Alpha 3 text) | |

Judgement calls
- **Cultist** keeps `statusImmunities` charmed + frightened: the book prints it only as the Zealot ability text, and the
  automation would be lost otherwise.
- Sellsword Armor is printed `2 [as Chain plus Shield]` — stored exactly like that.

---

## Part 2 — Artificials (book pp. 118-120) — 23 statblocks, none new, none deleted

- **Status Immunities**: Alpha 3 adds `Suffocating` to every Artificial (and Berserk/Charmed/Confused/Frightened to Gargoyle,
  Joust Guardian / Flying Sword gain Confused ...). Gargoyle loses Psychic Immune, gains Fly 30' value and `# Appearing d4`.
- **Weak: Adamant Weapons** (Golem Clay / Iron / Stone) — new material weakness key `adamant`
  (`CONFIG.VAGABOND.materialWeaknesses` + icon + lang en/pt-BR). Damage code already matches `weaknesses.includes(weapon.system.metal)`,
  so an Adamant weapon now ignores Armor/Immune on them. Golem, Bone: `Silvered Weapons` -> `silver`.
- **Magic Ward I/II/IV** ability text -> Alpha 3 wording ("not affected by Casts ... unless the Caster's Check exceeds their difficulty by N").
- Golem, Clay TL 9.5 -> 4.4 (source typo). Joust Guardian Combo/Cannon reworded + reordered. Stone Colossus now has Combo (A) + Combo (B).
- Golem, Bone / Necrophidius / Scarecrow are `Artificial/Undead` (`Artificial (Undead)`): description now starts with `(Undead)`.
- **Dungeonheart**: Spawn d6 rows (with the `@UUID` links) kept; row 6 pointed at Warp Beast -> now Gelatinous Cube (`XJXb7O120A5ewg1N` was wrong).

Not modelled (rules gap, text only in the book)
- `Physical from non-Relics` / `Relic Weapons weaker than (+2)`: stored as plain `physical` immunity — the damage code has no Relic exception
  (only Druid Beast Mode ignores it).

---

## Part 3 — Beasts (book pp. 121-133) — 72 statblocks, none new, none deleted

- **Combo**: Alpha 2 `Maul` / `Multi-Attack` / `Pin` / `Snip-Snip` multi-attack actions are now the book's `Combo` line (`2×Claws and 1×Bite ...`):
  Ape, Ape Giant, Badger, Bear, Crayfish Giant, Mantis Giant, Sabre-tooth Tiger, Scorpion Giant. Their action order now follows the book.
- **Pack Hunter** (Cat Great, Rat, Rat Giant, Sabre-tooth Tiger, Velociraptor, Weasel Giant, Wolf, Dire, Winter) and **Aggressor** (Hippo, Behemoth):
  `feet` -> `'` wording. Same for several descriptions (Ant, Bee, Beetle Bombardier, T. Rex).
- Electric Eel loses the `Aquatic` ability (Alpha 3 p. 131 note); Octopus Giant gets Swim 30'; Frog/Toad Bite and Cobra Venom Spit reworded
  (Cobra's text really starts with `0 and, if failed by 5 or more, Blinded` in the book — kept literally).
- **Dog**: the book prints one `Dog [Small/Medium]` statblock (TL 0.2/0.5, HD 1/1, Speed 30'/40', Morale 3/7, Bite 1/2). The pack keeps the two
  documents (`Dog, Small`, `Dog, Medium`); both already match those numbers, so they are unchanged.
- **Kept on purpose**: Chicken (`Fly 1` stands in for Flutter) and Giant Draco Lizard (`Fly 70` stands in for "70' with Glide") — the book
  has no Fly speed for them, but the engine has no Glide/Flutter, so their Fly speed type was left alone.
- Slug Giant: `Blunt from non-Relics` -> plain `blunt` immunity (Relic exception not modelled, see Part 2).
- The old `Animated Armor` copy in the Beasts folder (id `IWiL8vs9JwuriDcX`, mentioned in the translation notes) is no longer in the pack source;
  the book only has Animated Armor under Artificials.

---

## Part 4 — Cryptids (book pp. 134-150) — 98 + 1 new, none deleted

The book merges several families into one statblock with a "Type" table. The pack keeps one document per variant (ids unchanged);
each variant is the base statblock + its table row.

| Family | Documents | What changed |
|---|---|---|
| Dragon (Ancient / Elder / Young / Hatchling) x Red / Blue / Green / White / Black | 20 | Breath Attack rebuilt from the table row (shape, damage, effect, Cd) — text now "Begins this Attack, which occurs on its next Turn. Effect: ..."; Magic Ward III/IV wording; speed stored as `fly` + `speedValues.fly` (was `"fly 80"` in `speedTypes`); `(Wyrm)` tag |
| Giant (Cyclops / Hill / Stone) | 3 | already matched (Stone Armor `3 [as (+1) Chain]`, Cyclops `One-Eyed`) |
| Goblin (Archer / Mage / Warrior) | 3 | Warrior's `Dagger` + `Dagger (Thrown)` merged into one `Dagger [Melee Attack, Thrown]` |
| Kobold (Alchemist / Warrior) | 2 | Pack Instincts wording, `(Wyrm)` tag |
| **Kobold, Normal** | **NEW** `y4VoKYmnXJcnPgLJ` | the book's Kobold "Normal" row (Sling + Dagger) had no document; created from the base Kobold statblock |

Other changes
- Speed types written as `"swim 40"` / `"fly 30"` strings (Dobar-Chú, Froghemoth, Gremlin, Griffon, Harpy, Hippogriff, Kraken, Sea Serpent, Amphiptere, Chimera, Cockatrice, Darkmantle)
  are now proper `speedTypes` keys + `speedValues`.
- **Combo**: Dragon Turtle, Manticore (Combo 1 / 2), Roc, Sea Lion, Snallygaster, Tarrasque, Wyvern, Aurumvorax, Froghemoth reordered/renamed to the book's `Combo`.
- Basilisk `Glare` -> `Gaze` (+ Bite text); Pseudodragon HD 2 -> 1 (1 HP), Morale 7, Magic Ward I ability name restored (was blank);
  Tarrasque Magic Ward VI -> **X**, Suffocating immunity; Werewolf / Wererat / Werewolf Dire: new `Effectively Immune` ability; the Alpha 2 **Fire weakness is gone** and they are Weak to Silver (Lycanthrope rule below).
- `(Beast)` / `(Wyrm)` / `(Fae)` / `(All)` size-line tags now prefix the description (Agropelter, Almiraj, Owl Bear, Sea Lion, Froghemoth, Flail Snail, Hydra, Drake,
  Dragon Turtle, Amphiptere, Basilisk, Cockatrice, Chimera, Gremlin ...). Darkmantle / Kraken keep their old flavor text (the book prints none).
- Rot Grub description rewritten as in the book; `feet` -> `'` wording (Achaierai, Aurumvorax, Froghemoth, Hippogriff, Mimic ...).
- Gremlin is `Small Cryptid/Fae`: stays a Cryptid, `(Fae)` tag in the description.

### Cross-cutting rule found in Part 5 — type-wide Silver / Cold Iron weakness (book p. 82, Materials table)

> Cold Iron: *Fae are Weak to its damage.* — Silver: *Hellspawn, Lycanthropes, and Undead are Weak to its damage.*

Alpha 3 statblocks therefore stopped printing `Weak: Silvered Weapons` / `Cold Iron`. Instead of dropping the data, the converter now
adds `coldIron` to every Fae (incl. `Cryptid/Fae`) and `silver` to every Undead (incl. `Artificial (Undead)`), Hellspawn and
Lycanthrope (Werewolf, Werewolf Dire, Wererat) on top of the printed `Weak:` line. Pieces of Parts 2/4 touched by this:
Necrophidius, Scarecrow (+Silver), Gremlin (+Cold Iron), Werewolf / Werewolf Dire / Wererat (+Silver).

---

## Part 5 — Fae (book pp. 151-153) — 15 statblocks, none new, none deleted

- Cold Iron weakness stays on every Fae (type rule above); Hag, Sea gets it too (was missing).
- Beisht Kione Dhoo `Multi-Attack` -> `Combo`; Hag, Grove / Unicorn Combo text; Unicorn Telepathy qualifier dropped (book: plain `Allsight, Telepathy`), Heal / Teleport wording.
- Brollachan gains Restrained immunity, Will o' Wisp gains Restrained + Suffocating immunities.
- Pixie: `fly 60` string -> `fly` + 60 value; abilities Major Invisibility (Focus) and Pixie Dust added; Satyr: Panpipes added.
  The book prints `It casn't use Sleep, Charm, or Fear` — typo fixed to *can't*.
- Pixie / Satyr had an **unnamed** Magic Ward ability: now named `Magic Ward I` with the Alpha 3 text.
- Nymph's Kiss: "can only breathe water" (no longer "immediately suffocating"); Mermaid Immortal of the Sea: "in contact with a body of water".

---

## Part 6 — Outers (book pp. 154-166) — 31 statblocks, none new, none deleted

- **Renamed**: `Zotz, Demon` -> `Zotz Demon` (book name; same `_id`).
- **Hellspawn** now carry Silver weakness (type rule above): Chort, Dethbat, Hellhound (its odd `physical` weakness is gone), Imp, Nightmare, Oni, Pit Fiend, Stolas Demon, Viper Tree, Viskyd, Zotz Demon.
  `Hellspawn` stays a being type (`beingType`), so it is no longer repeated as a `(Hellspawn)` description tag.
- **d6 / d8 tables** (Angel *Dominator*, Ogler *Eyebeam*, Sphinx Archon *Reality Warp*, Lich later): the `1 - ...` row actions (with their `@UUID` links / statuses) are kept; each row is updated from the book row
  (Ogler Kinesis now *Endure*, Angel Burning Slash wording). The Ogler *Mind of Madness* / *Antimagical Cone II* abilities follow the book (an unnamed third ability was dropped).
- **Stat fixes**: Imp HD 2 -> 1; Stolas Demon Huge -> **Giant**; Sphinx Archon stored HP `10` -> `108`; Viper Tree zone typo (`Front`).
- **Immunities**: Alpha 3 adds Suffocating (Byakhee, Otyugh, Phoenix, Angel/Couatl `Blindness` -> blinded ...), Restrained (Phoenix); Sphinx `Physical from non-Relics` (a stray string) -> real `physical`.
- **Pit Fiend**: Regenerate II -> **III**, `Supreme Hellspawn` ability removed, Wall of Fire is now just `Burning (2d6)` (no 7 (2d6) damage).
- **Otyugh**: `Tentacle (Restraining)` merged into `Tentacle` (4 (d8) + Restrained; if already Restrained: slam 7 (2d6) + Endure or Dazed). Dazed is *not* auto-applied (only conditional).
- Telepathy qualifier `(Far)` dropped from Ogler / Otyugh (book prints plain Telepathy). Pixie-style unnamed Magic Ward abilities named (Imp, Thulhan...).
- `speedTypes` strings `"fly 180"` etc. (Byakhee, Cloaker, Couatl, Dethbat, Floating Eye, Phoenix, Pit Fiend, Demon Ray) -> `fly` / `swim` + `speedValues`.

Not modelled
- Treant / Viper Tree `Weak: damage from axes` (no weapon-family weakness exists); Angel `Divine Armor`, Fall from Grace, Grace are text only.

---

## Part 7 — Primordials (book pp. 167-176) — 35 statblocks, none new, none deleted

- **Status Immunities**: Alpha 3 adds `Fatigue` to all slimes/oozes/Goo/Cube/Pudding/Jelly, and `Restrained` + `Suffocating` to the Elementals (Air/Fire/Water),
  Invisible Stalker, Vortex, Yellow Mould; `Suffocating` to Air Bubble, Cube and Earth Elementals.
- Air Bubble Speed `20` -> `0' (Fly 20')`; Efreeti Speed 80 -> `30' (Fly 80')`.
- Ectoplasmic Ooze is `(Slime, Undead)`: gets the Silver weakness (type rule).
- Treant: Weak is now `Fire, Poison; Damage from axes` — the Alpha 2 `slashing` stand-in is gone (no axe weakness exists, see Not modelled).
- Magmot: invalid `burrow` speed type removed (the `Tunneler` ability already says it).
- Focus is now a note tag (`... | Focus`) on Efreeti Wall of Fire / Invisibility and Treant Animate Trees instead of a trailing `(Focus)` in the text.
- Book typo `Prmordial` (Hydrangean size line) recognised as Primordial; `Sufffocating` -> suffocating.

---

## Part 8 — Undead (book pp. 177-181; the Zombies are on p. 181) — 22 statblocks, none new, none deleted

- **Suffocating** added to every Undead's Status Immunities (and Restrained to Banshee, Ghost, Shadow, Wraith, Skeleton family ...).
- Silver weakness is no longer printed (type rule above) — the pack already had it everywhere except Crawling Claw and Death Knight, which now get it.
  Explicit `Weak:` lines stay (Skeleton `Blunt`, Mummy `Fire`, Zombie Drowner `Shock` ...).
- Lich: `Immune` now `Poison; Physical from non-Relics` (was Poison only), Fly 60'; Vampire Fly 30'. Lich Dominator rows kept, wording updated.
- Mummy gains `Doom Magnet` and `Zombie`; its unnamed Magic Ward is named. Mummy Lord / Vampire / Wight / ... Magic Ward text (Alpha 3).
- Crawling Claw HD 2 -> **1** (1 HP). Church Grim loses its `(Beast)` tag. Ghost keeps the spelling `Possession` (the book prints "Posession").
- Book typo `Spd:` on the Mummy Lord statblock read as Speed (30').
- Zombie, Zombie Boomer, Zombie Drowner, Zombie Dragon are on p. 181, just outside the page range you gave; included because the Undead chapter continues there.

Not modelled
- Vampire / Lich / Wight / Wraith / Ghost / Banshee `Nightwalker` and Sunlight rules, Zombie "can't be reduced below 1 HP", Soul Jar, Vampiric — text only.
