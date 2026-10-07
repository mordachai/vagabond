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

