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
