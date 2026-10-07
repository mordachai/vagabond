# Changelog

## Unreleased
- **Revelator revised to the new book text.** Class description, the Class Features table (with Spells, Mana and Cast Max), Righteous, Enspell, Lay on Hands (d4 / d6 / d8), Paragon’s Aura, Divine Resolve and Holy Diver now read exactly as printed; Training is Leadership and Melee. The Level 5 Spell count is 3 (it was 0 by mistake).
  - **Righteous** grants the Gish Perk; Cast Max is 1 + half your Level (an effect cancels the casting Stat the engine adds).
  - **Lay on Hands has a button** (Level 2+): spends 1 Mana, rolls (d4 / d6 / d8 + Level) healing on yourself or a Close targeted Being, and posts a card with the Apply button; from Level 6 it also cures Blinded, Paralyzed and Sickened. **Divine Resolve** makes you immune to those three. New fields `layOnHandsDie` and `layOnHandsCures`.
  - Existing Revelator items are converted once on load. The `classes` compendium needs `npm run pack` first.
- **Pugilist revised to the new book text.** Class description, the Class Features table, Fisticuffs, Rope-a-Dope, Haymaker (10+ / 9+), Moxie (Cd4 / Cd6) and Title Holder (d6 / d8) now read exactly as printed; Training is Brawl and Influence. Check Hook, Beat Rush, Prowess and Impact are gone.
  - **Fisticuffs** grants the Dusted Knuckle Perk; **Vicious** is an effect (a Brawl Crit adds a die matching the weapon). **Moxie** gives Favor on Saves against Dazed, Frightened and Restrained.
  - **Title Holder** is an effect: Brawl weapon damage dice are at least a d6 (d8 at Level 10) and Explode on 1 or 2 (new fields `weaponDieBySkill` and `weaponLowExplodeBySkill`).
  - **Haymaker: Auto** (switchable, follows the Class Automation setting): a Brawl attack that beats the Difficulty by 10 (9 from Level 8) Dazes the Target with a chat card; the Dazed ends when your next Turn starts in a Combat, otherwise by hand.
  - Existing Pugilist items are converted once on load (Influence is marked trained, the Dusted Knuckle Perk is added). The `classes` compendium needs `npm run pack` first.
- **Merchant revised to the new book text.** Class description, the Class Features table, Gold Sink, Deep Pockets, Line Goes Up (+1 / +2 / +3 Luck), Diamond Hands (+1 / +2), Opportunist and Top Shelf now read exactly as printed; Training is Craft, Finesse and Influence and the Key Stat is Luck/Reason. Bang for Your Buck and Treasure Seeker are gone.
  - **Deep Pockets** grants the Deft Hands Perk and an effect gives 2 extra Item Slots now and every 3 Levels. The rest of the class is text (Line Goes Up needs a ruling on Luck above the maximum — see `CLASS_REWRITE_NOTES.md`).
  - Existing Merchant items are converted once on load (Finesse is marked trained). The `classes` compendium needs `npm run pack` first.
- **Magus revised to the new book text.** Class description, the Class Features table (with Spells, Mana and Cast Max), Arcanum, Enspell, Spell Parry (10+ / 9+ / 8+), Arcane Surge, Esoteric Flow and Sword & Sorcery now read exactly as printed; Training is Arcana and Melee. Spellstriker, Esoteric Eye, Arcane Recall and Aegis Obscura are gone.
  - **Arcanum:** grants the Gish Perk; Cast Max is 1 + half your Level (an effect cancels the casting Stat the engine adds). The rest of the class is text.
  - Existing Magus items are converted once on load. The `classes` compendium needs `npm run pack` first.
- **Luminary revised to the new book text.** Class description, the Class Features table (with Spells, Mana and Cast Max), Theurgy, Radiant Healer, Overheal, Ever-Cure, Revivify and Life-Giver now read exactly as printed; Training is Influence and Mysticism. Saving Grace is gone.
  - **Theurgy:** Cast Max is 2 + your Level (an effect cancels the casting Stat the engine adds); Life is the one Spell you must always know.
  - **Radiant Healer:** the healing rolls of your Spells also Explode on their highest face. New field `system.healingExplode`; the **Assured Healer** perk now has an effect that makes them Explode on a 1.
  - **Overheal** adds half your Level to every HP-restoring roll (effect); giving away the excess, Ever-Cure and Revivify stay text.
  - Existing Luminary items are converted once on load (Influence is marked trained). Compendiums `classes` and `perks` need `npm run pack` first.
- **New Barbarians no longer start Berserk.** A new character starts at 10 HP and the builder then sets it to its real maximum; for a low-Might character that looked like taking damage and tripped Rage’s auto-Berserk. HP above the maximum is no longer counted as damage.
- **Effects that end "on a failure / next Turn" now also end on your next roll, with no Combat needed.** One shared rule (`roll-expiry.mjs`) looks at each d20 roll you make and ends the effects that rule says. Deadeye: a Ranged hit adds a stack; a miss, another attack or any skill / stat / cast roll resets it (Saves are ignored); the end-of-Turn reset stays as a backup inside a Combat, and Deadeye Auto now works outside a Combat too. Rage (Auto-Berserk): where no Combat counts Turns, a skill / stat / cast roll ends Berserk. Fighter Momentum (Auto): a skill / stat / cast roll ends it before you attack. A chat card says what ended and why.
- **Feature buttons show and end their effect.** Deadeye, Momentum and Hunter’s Mark buttons (sheet, HUD and HUD Belt) now glow with a running border while their effect is on; Deadeye shows its stacks on the button. Right-click an active button to end it (Momentum also ends with a plain click); a chat card says what ended. Works with no Combat and in every automation mode. Deadeye’s automatic stacking now only runs inside a started Combat you’re in, because its reset waits for the end of your Turn — outside a Combat use the button to add stacks and right-click to clear them. A switched-off Deadeye counts as none, and an expired Momentum no longer blocks a new one.
- **New world setting: Class Automation** (Automatic / Automatic only in Combat / Manual). One switch for the GM to keep every player on the same footing: in Manual every class "Auto" effect (Rage auto-Berserk, Aggressor first Round, Momentum, Deadeye, High Noon, Hunter’s Mark) is inert and the feature buttons + status toggles do everything; "Only in Combat" turns Auto on only while the character is in a started Combat. The Auto effects themselves are untouched, and the setting applies instantly.
- **Auto / manual twins no longer double-count.** Gunslinger’s Deadeye button now tells you Deadeye is automatic (and does nothing) while "Deadeye: Auto" is on, instead of adding a second stack per shot. Barbarian’s "Aggressor: First Round (manual)" now steps aside while the auto twin is on (before, both on doubled Speed in every Round) and now works in Round 1 of a tracked Combat when the auto twin is off. Existing Barbarian items are updated on load once the classes pack is rebuilt.
- **Effects made by code now carry a short description.** The Deadeye stack effect ("Crit on 18+, 2 of 3 stacks…") and Hunter’s Mark ("<Target> is your Mark…") explain themselves in the effects list.
- **Ancestries revised to the new book text.** Human, Dwarf, Elf, Halfling, Draken, Goblin and Orc descriptions and traits now read exactly as printed.
  - **Dwarf:** Sturdy is now Favor (not +1) on Saves against being Frightened or Sickened (an effect; Shoved stays text), and Tough grants the Tough Perk instead of carrying its own effect.
  - **Darksight (Dwarf, Goblin, Orc)** is an effect that adds the `darksight` sense to your character, and your token (prototype and placed linked tokens) switches to Darkvision with unlimited range. Remove the effect and the token goes back to normal vision (vision you set by hand on a character with no senses is never touched). New reusable effect field: `system.senses` (ADD a sense key from the NPC senses list).
  - **Elf:** Ascendancy is Trained in Detect plus 1 other Skill of your choice; Naturally Attuned adds the once-per-Round 1 Mana Delivery discount (text only).
  - **Halfling / Goblin:** Nimble no longer has the "if you aren’t Incapacitated" clause; Goblin’s Scavenger is an effect (Favor on saves against Sickened).
  - **Draken:** Breath Attack now reads as a two-step Action (begin, then exhale on a later Turn); Scale is +1 Armor. Draconic Resilience (half damage) stays text.
  - **Character builder:** a Skill choice group whose whole pool is already Trained (e.g. an Elf Gunslinger already Trained in Detect) no longer blocks the Class step.
  - Existing ancestry items are converted once on load; Dwarf characters get the Tough Perk. The ancestries compendium needs `npm run pack` first.
- **Perks rewritten to the new book (Perks p. 64–73).** All 108 perks now read as printed, with prerequisites re-checked against the book (stat, Training, OR-groups, Spells; a book "Spell: Any" is `hasAnySpell`).
  - **New:** Beat Rush, Bravado, Celestial Illuminator, Climber, Cross Counter, Cryptozoologist, Dusted Knuckle, Esoteric Recall, Favors the Bold, Instant Weapon, Medic, Quality Assurance, Quick Draw, Ricochet, Ritualist, Selfless, Swimmer.
  - **Removed (not in the book):** Botanical Mediciner and Combat Medic (replaced by Medic), Moonlight Sonata and Solar Flare (replaced by Celestial Illuminator), Duelist, Full Swing, Metamagic, Owl-Blasted, Padfoot, Scrapper's Delight (folded into Arcane Artisan), Smooth Talker (folded into Silver Tongued), Spin-to-Win, Tactician.
  - **Effects:** Secret of Mana is now +2 Max Mana and +1 Cast Max; Mithridatism gets its Sickened Favor and Poison per-die reduction; Gish also sets Weapon Counts as Trinket; the empty Second Wind effect is gone.
  - **Class grants follow the new perks:** Fighter (Melee/Ranged Training perks), Hunter (Survival), Witch (Mysticism) pick lists were rebuilt by the Training rule; Gunslinger's Shooting Irons grants Quick Draw; Sorcerer's Tap grants Secret of Mana instead of the removed Metamagic.
  - **New grant option "Ignore Perk Prerequisites"** (class level features and ancestry traits, Perks section of the grant). Perks taken through that grant skip all their prerequisites (or only the Stat minimums, with "Stat minimums only") in the character builder and the level-up dialog. Fighter's Fighting Style and Hunter's Survivalist use "All"; the Bard's Well-Versed and every Bard Perk pick use "Stat minimums only".
  - Perk items already on characters are copies and keep their old text; the compendium needs `npm run pack` first.
- **Gunslinger revised to the new book text.** Class description, the Class Features table, Deadeye, Shooting Irons, Bad Medicine (+1 / +2 / +3 dice at Levels 2 / 6 / 10), Grit (3) / (2), Devastator and High Noon now read exactly as printed; training is Detect and Ranged. Quick Draw / Skeet Shooter are gone.
  - **Deadeye is an effect on your character** ("Deadeye (n)", up to 3 stacks = Crit on 19 / 18 / 17 with Ranged attacks). The Deadeye button on the feature adds a stack by hand; delete the effect to reset. The **Deadeye: Auto** effect (switchable) builds a stack on every Ranged attack (shown as a tag on the attack card) and, inside a Combat, resets it at the end of your Turn unless you hit a Ranged attack since the start of your last Turn.
  - **Grit has a button** (Lv 4): a chat card with one button per Status you have among Blinded, Burning, Confused, Dazed and Frightened; picking one removes it and raises Deadeye by 3 (2 at Level 8).
  - **High Noon has a button** (Lv 10) that sets Deadeye to 17; the **High Noon: Auto** effect (switchable) does it when your attack drops a non-allied target to 0 HP.
  - **Bad Medicine** and **Devastator** are Active Effects: a Crit with a Ranged Check adds the extra damage dice (matching the weapon's die) and lets the damage dice Explode.
  - Shooting Irons grants the Quick Draw Perk (now in the Perks compendium), and the Gunslinger migration adds that Perk to existing Gunslinger characters. The Off-Turn Ranged attack stays with the table.
  - New reusable effect fields: `system.deadeyeTrigger`, `system.highNoonTrigger`, `system.deadeyeGrit`, `system.critExtraDiceBySkill` (ADD `<skill>: <formula>`), `system.critExplodeSkills` (ADD a weapon skill key).
  - Existing Gunslinger class items are converted once on load.
- **Hunter revised to the new book text.** Class description, the Class Features table, Hunter’s Mark, Survivalist, Rover (5’ / 10’ / 15’), Lethal Precision (+1 / +2 damage), Killer Instinct and Apex Predator now read exactly as printed; training is Melee, Ranged and Survival. Overwatch, Quarry and the three-d20 Lethal Precision are gone.
  - **Hunter’s Mark has a Mark Target button**: your first Target becomes your Mark (an effect "Hunter’s Mark: <name>" on your character; delete it to drop the Mark). The **Hunter’s Mark: Auto** effect (switchable) marks the Target of your attack when you have no Mark.
  - **Mark rules** (Active Effect on the class): against your Mark, a weapon with only Keen gains Vicious and one with only Vicious gains Keen, and a Bonus (Favor die…) that pushes the result into your Crit range makes it a Crit. Rolling two d20s to track and the Survivalist Favor stay text.
  - **Lethal Precision** (Lv 4): damage that lands on your Mark from you or an Ally of yours makes it take 1 extra damage (2 at Level 8). Inside a started Combat you are in, only on your own Turn; with no Combat it always applies.
  - **Apex Predator** (Lv 10): your Mark is Weak to your attacks (ignores Armor and Immune, plus the extra die).
  - **Rover** is an Active Effect: Speed +5’ (+10’ at Level 6, +15’ at Level 10). Climb, Swim, Difficult Terrain and Killer Instinct's senses stay text.
  - Survivalist grants one Perk from the Survival-Trained Perks (ignoring other prerequisites).
  - New reusable effect fields: `system.huntersMarkTrigger`, `system.markRules` (ADD `keenVicious`, `critByBonus` or `weak`), `system.markDamageBonus`.
  - Existing Hunter class items are converted once on load.
- **Fighter revised to the new book text.** Class description, the Class Features table, Fighting Style (4th and 8th Level), Momentum, Valor (-1 / -2 / -3 to Crit at Levels 2 / 6 / 10), Muster for Battle and Harrying now read exactly as printed; training is Melee and Ranged. Fighting Style grants two Perks with the Melee or Ranged Training Prerequisite at Level 1 and one more at 4 and 8.
  - **Valor** is an Active Effect under Class Features: your Attack Checks and Reflex / Endure Saves Crit on a lower roll (-1, then -2, then -3).
  - **Momentum has a button** (character sheet Features list, or pinned to the HUD Belt): your next attack is Favored. It is spent by your next attack and, inside a Combat, ends with your own Turn. The **Momentum: Auto** effect (switchable) gives it by itself when you pass a Save against an attack or its damage is reduced to 0; switch it off to claim it by hand.
  - Muster for Battle and Harrying are text-only.
  - New reusable effect field: `system.momentumTrigger`.
  - Existing Fighter class items are converted once on load.
- **Druid revised to the new book text.** Class description, the Class Features table (now with Spells, Mana and Cast Max), Primal Mystic, Feral Shift, Savagery, Tempest Within, Beast Mode and Force of Nature now read exactly as printed; training is Mysticism and Survival. Innervate and Ancient Growth are gone.
  - **Primal Mystic**: the Druid now casts with Survival, Max Mana is 2 × Level and Cast Max is 1 + half your Level (round up) — no Awareness added. Spells known are 2 at Level 1 and one more every 3 Levels.
  - **Tempest Within** is an Active Effect: Cold, Fire and Shock damage you take is reduced per damage die (1 at Level 4, 2 at Level 8).
  - **Polymorph runs through the Metamorph module** (optional): the Polymorph spell's cast card has a Polymorph button that opens Metamorph's Beast picker (Beasts with HD no higher than your Level plus Savagery) and swaps the token. Without Metamorph it stays text.
  - **Savagery** (Active Effects): attacks made in a Beast form (a Metamorph copy) deal the Druid's Savagery bonus (+1 at Level 2, +2 at 6, +3 at 10) as extra damage, and the same bonus raises the Level used for Polymorph's HD limit.
  - **Beast Mode** (Active Effects, Lv 6): Beast-form attacks ignore the target's Immune to physical damage (physical, blunt, piercing, slashing — Relics are not modeled), and a sole-Target self Polymorph's card notes it is continual (no Focus).
  - **Force of Nature has a button** (Lv 10): at 0 HP, once per Shift (a Rest renews it), pick a Beast and morph into it; your HP is set to its Statblock HP. Feral Shift's extra Beast Action stays text.
  - New reusable effect fields: `system.beastDamageBonus`, `system.polymorphLevelBonus`, `system.beastIgnoreImmune`, `system.polymorphContinual`. The Polymorph spell on existing characters gets the button on load.
  - New reusable effect field: `system.incomingDamageReductionPerDieByType` (ADD `cold,fire,shock: <formula>`).
  - Existing Druid class items are converted once on load; characters still using Mysticism as their Mana Skill are moved to Survival, and Mysticism and Survival are marked trained.
- **Dancer revised to the new book text.** Class description, the Class Features table, Step Up, Footloose, Evasive at Levels 2 / 6 / 10 (10’ / 15’ / 20’), Captivator at 4 / 8 (Cd4 / Cd6), Don’t Stop Me Now and Double Time now read exactly as printed; training is Finesse and Performance. Fleet of Foot, Choreographer and Flash of Beauty are gone; Footloose grants the Fallaway Reverse Perk.
  - **Step Up has a button** (character sheet Features list, or pinned to the HUD Belt): rolls the Finesse Check and posts a chat card with the book text on a pass (plus Double Time from Level 10). Handing out the extra Action stays with the table.
  - **Footloose** is an Active Effect under Class Features: your Reflex Saves roll two d20s and keep the higher (works for chat-card saves, sheet saves and saves against Statuses; a Crit is read from the kept die).
  - **Don’t Stop Me Now** (Lv 6) is an Active Effect: Favor on Saves against Paralyzed and Restrained (which covers being grappled). Difficult Terrain and being moved stay text. Evasive and Captivator are text-only.
  - New reusable effect field: `system.saveRollsTwice` (ADD a save key to roll that Save with two d20s, keep the higher).
  - Existing Dancer class items are converted once on load.
- **Action buttons on features, traits and perks.** Any class feature, ancestry trait or perk can now define an action button in its item sheet (Action Button section: label, Font Awesome icon, macro UUID or embedded script, Allow Players). It shows on the character sheet's Features / Traits / Perks lists; right-click it to **Add to Belt** and it appears in the HUD Belt (click runs it, right-click: Run / Remove from Belt). Runs through the item-macro scope (`actor`, `item`, `token`, `targets`, `speaker`).
- **Effects can be spent on use.** An Active Effect flagged `consumeOn` (`attack`, `cast`, `save`, `heal`) is removed from its actor right after a roll of that kind.
- **Bard revised to the new book text.** Class description, Overtuned at Levels 2 / 6 / 10 (21+ / 20+ / 19+), Audacity at 4 / 8 (Cd4 / Cd6), Enjoy the Silence, Climax and Well-Versed now read exactly as printed; training is Finesse, Influence and Performance. Song of Rest, Starstruck, Bravado and Starstruck Enhancement are gone.
  - **Virtuoso is playable.** The Virtuoso feature has a **Perform** button (character sheet Features list, or pinned to the HUD Belt). It posts a chat card with Inspiration / Resolve / Valor buttons; picking one rolls Performance and, on a pass, applies the benefit to your Group (the Party sheet's members, else you plus your Targets). Inspiration = +1d6 on HP-restoring rolls; Resolve = Favor on Saves; Valor = Favor on Attack and Cast Checks. Performing again replaces your previous benefit.
  - **Benefits are spent when used:** each one is removed from the recipient after their next roll of that kind (healing roll / Save / Attack or Cast). Manual-first: it is an ordinary effect with an on/off switch; inside a started combat it also ends at the end of that Round, with no combat it lasts until used or switched off.
  - **Climax (Lv 10)** makes the Favor die and the healing d6 of the benefit you grant explode. **Overtuned** gives you 1 Luck when the Favor die from your Virtuoso lifts a d20 from below the threshold to at-or-above it.
  - **Enjoy the Silence** is an Active Effect under Class Features (Lv 6): Favor on Saves against Berserk, Charmed, Confused and Frightened. Audacity is text-only.
  - New reusable effect fields: `system.favorChecks` (Favor on all attack / cast / save checks), `system.healingBonusDice`, `system.bonusDiceExplode`.
  - Removed the dead Bravado and Climax library effects (they pointed at fields nothing read).
  - Existing Bard class items are converted once on load.
- **Effects list: Class Features category.** Class-feature effects (Catalyze, Potency, Rage…) are listed in their own "Class Features" section without an on/off switch and no longer clutter the HUD effect menu. Helper effects meant to be flipped by hand (Rage: Auto-Berserk, Aggressor first-Round twins) stay in Active / Inactive and the HUD.
- **Alchemist revised to the new book text.** Class description, Eureka at Levels 2 / 6 / 10 (10+ / 9+ / 8+), Potency at 4 / 8 and every other feature now read exactly as printed; training is Arcana, Craft and Medicine.
  - **Every automated piece is its own Active Effect** under Class Features: Catalyze, Eureka, Potency (+1 per die, +2 at 8), Potency: Explode, Mix and Prima Materia. Each Level-gated one shows its **Lv N** badge until you reach it.
  - Fix: Potency's Explode never applied — its formula was mangled by the outer-parenthesis cleanup, so Alchemical dice only exploded if the item itself said so.
  - Existing Alchemist class items are converted once on load (a disabled effect stays disabled).
- **Barbarian revised to the new book text.** Rage (Berserk: bigger attack dice; −1 damage per die in Light or no Armor), Wrath, Aggressor (+5' Speed at 2, +5' every 4 Levels, doubled in the first Round), Murder Mode (immune to Charmed / Confused / Frightened; Berserk dice Explode with a +1/+2 bonus), Bloodthirsty (Favor vs targets missing HP) and Rip and Tear. Fearmonger and Mindless Rancor are gone; training is now Melee and Survival.
  - **Every automated piece is its own Active Effect** — Berserk, Aggressor's first-Round doubling and the rest all work by hand. New **Rage: Auto-Berserk** effect (off = manual Berserk): attacking or taking damage applies Berserk for 1 minute, and it ends if you finish a Turn without attacking or taking damage. **Aggressor: First Round (manual)** ships disabled for tables without the combat tracker.
  - **Armor weight is read in Slots** (`@armorWorn.slots`): Adamant / Orichalcum light armor no longer counts as Light for Rage; Mythral medium armor does. New formula values `@armorWorn.slots|rating|might` and `@combat.round` (0 outside combat); effects can be level-gated (`minLevel`), and Active Effects can grant situational attack Favor (`system.attackFavorVs`).
  - Fix: Rage's exploding dice never actually exploded on weapons without their own explode setting. A global explode value no longer overrides an item's own faces while global explode is off.
  - Effects tied to a class Level show a **Lv N** badge in the effects list (yellow while still locked).
  - Existing Barbarian class items are converted once on load (your Rage on/off choice is kept). The 7 unused Barbarian library effects are removed and the library Rage effect is now conditional on Berserk.
- **Exploding damage shows `!`** (e.g. `2d6!`) everywhere damage is displayed, when the dice can explode for that character (item setting, global explode effect or Alchemist Potency). Display only.
- **Trade up:** new icon beside the coins (sheet and HUD) exchanges copper → silver → gold into the largest coins.
- **HUD:** edit the character name and coin amounts in place; Wealth label is now a coin icon.
- **Thrown attack animations:** throws now fly a projectile to the target (auto-recognised, e.g. the JB2A dagger throw); a thrown miss lands wide. New optional **Throw** animation slot on Thrown weapons and thrown alchemicals. Also applies to Roll Damage button, Luck rerolls and Force Crit.
- **Item FX section:** matches the sheet theme; each slot has a Preview button (the inline mini-player is gone). Ranged clips picked in the FX picker keep choosing the file by distance to the target; the preview shows each file's range.
- **Automated Animations:** the duplicate-animation warning now has a GM "Turn it off" button for its auto-recognition and hides once it's off.
- **Weapon Properties dropdown:** closes on outside click; cleaner checkboxes and selected-row highlight.

## v5.44.0
- **Compact damage card.** Damage dice and modifiers fold away under the total — click the number to open them. Defense now sits inside the damage section as **weapon-art shields** (one shield per weapon; with two Defense weapons a "Both" shield on top and one per weapon below). Saves share one row, sized to your configured saves; the info button uses a plain info icon.
- **Attacks against NPCs only offer Apply Direct** — no save buttons and no Defense shields on cards aimed only at NPCs (saves and Defense are a player-side choice).
- **NPC actions with auto-rolled damage are one card** (name, description, targets, damage, saves) instead of two.
- **Roll Damage With Check OFF — fixes:**
  - The damage card now shows the targets from the attack (target images, flanked bonus, NPC-only handling).
  - **Cleave** steps the damage die down one size per extra target on the Roll Damage button and Luck rerolls too (it only worked with auto-roll before).
  - Spell damage uses one die-size rule everywhere: a spell's own die override now also gets the Spell Damage Die Size Bonus, and the homebrew base die is honored.
  - Spells that hit but deal no damage no longer get a stray "Roll Damage" (1d6) button.
- **Crit Luck toggle on the attack card.** On a crit with a stat bonus, the "(Crit)" tag after the skill (now with a shimmering star) is the Luck / benefit toggle, same as the damage card's Crit badge. Click it to keep the Luck instead of the bonus; Roll Damage reads it and then locks it. The damage card shows no second toggle, and no "Crit!" badge when you kept the Luck.
- **Keen and Vicious are now Active Effects on the weapon.** Both are "On Use Only" effects (Keen: crit on 19; Vicious: an extra crit die matching the weapon's die), visible and editable in the weapon's Effects tab and shipped on every compendium weapon and shop item. Existing worlds are converted once on load. New Active Effect key `system.critBonusDice` (value like `1d6`, or `matchDie`). The per-weapon "Crit Range Mod" field is gone — use an effect instead.
- **On-use effect switches are real:** the switch on an "On use" effect (Keen, Vicious…) now enables / disables it for that weapon's rolls; it is locked only while the weapon is unequipped. Applies to the sheet, the effect menu and the HUD.
- **Currency uses the book's Silver Standard: 1g = 100s, 1s = 100c** (it was 1s = 10c). Stored copper-based values (crafting Materials, Projects and relic power values, shop price overrides, Value-per-Shift) are rescaled once on load. Wallets and coin counts are untouched. Costs, lodging, char builder budgets and the Wealth readout all use one shared conversion now.
- Compendium: shop stock and Materials (1g) updated to match; the old Refresh World Data GM macro is removed from the GM Tools pack.
- Internal: removed a dead copy of the old character builder.

## v5.43.4
- **Defense weapons: new Defense row.** The "Shield" button on damage cards is now **Defense** and sits in its own row under Reflex, shown only when a target holds a Defense weapon in hand. One Defense weapon = one full-width **Defense** button; two = **Both | Weapon 1 | Weapon 2**. Still no roll to hit: the weapon's damage is subtracted from the incoming damage before Armor. "Both" adds the two weapons' damage together. New world setting **Defend With Both Defense Weapons** (on by default); turn it off to defend with one weapon at a time.
- **NPC senses rework:** senses are a list of the six book senses plus a free-text note, in their own section of the NPC sheet (old text senses convert automatically). Senses also set the token's vision/detection modes (Darkvision, See Invisibility, Feel Tremor, wall-respecting Blindsight / Echolocation; no range = unlimited). New **Flying** status, applied automatically to fly-only and "flies by default" NPCs. 184 bestiary NPCs converted. The locked NPC sheet hides empty senses/resistances sections.
- **NPC sheet:** reorder actions and abilities in edit mode with a drag handle or up/down chevrons (open accordions, unsaved typing and weapon links follow the entry). Locked Resistances panel reads as one wrapping line with larger values. Fix: unsaved edits and linked-weapon data could be lost when saving.
- **Item sheets:** edits (especially descriptions) no longer appear to revert until you lock/unlock or reopen; scroll position and open sections are kept, and the page no longer jumps while editing.
- **HUD:** the whole body of the Character and NPC HUD is a drag handle; framed panel with a yellow border; dark background and blur on by default; NPC armor sits first in the info strip, and long translated tab labels no longer cram.
- **Character builder:** stat arrays replaced by the new 8-row table; Randomize rolls 1d8 over the array count.
- Requires Foundry **v14** (minimum raised from 13).

## v5.43.3
- **Shops: Open / Closed replaces "Show to Players".** A shop now has an open-for-business switch (store window and shop sheet button, the **Open / Close Stores** scene tool, a lock button on the shop's token HUD, or the new **Create Toggle Macro** on the sheet). Opening pops the store on every player's screen; closing shuts their windows. A closed shop refuses trades and won't open for players, and shows a padlock on its token. The shop's open state is the only access gate, so you no longer hand out Observer ownership per player. Macro API: `game.vagabond.shop.openShop / closeShop / toggleOpen / isOpen / setAllOpen`.
- **Shop tokens** are always neutral, linked and show their name to everyone (existing shops and tokens are fixed on load). Shops can't join combat and are removed from encounters.
- Stocking from a folder or compendium no longer pops an info notice on success (only warnings); the tagline field on the shop sheet is now multi-line.
- Release pipeline: new tags publish to foundryvtt.com automatically.

## v5.43.2
- **Spell casting (RAW):** the default Trinket rule is now **Open Hands or Trinket** — you can cast with empty hands, or while holding a Trinket (the other hand may hold anything). The other modes (Equipped / Trinket in Hand / Hands Free) are unchanged; set the strictness in the existing Trinket Casting Requirement setting.
- Fix (Foundry v14): Combat tracker context menu entries (Add / Remove Activation, Undo Use), the Luck Reroll (Fluke) and Force Critical chat entries, and the Reroll lookup used the old menu format and no longer showed up or worked.

## v5.43.1
- **Throwing alchemicals:** they now throw with **Melee, Finesse or Craft** (the best is picked automatically, or choose "Throw with X" — the Mix card says the same). Thrown weapons roll your preferred skill instead of always Ranged; every throw is a ranged attack for Far / Hinder purposes, and Luck rerolls keep it a throw.
- **Shops:** the store sidebar nests categories under Weapons, Gear, Relics and Alchemical; each tab can be collapsed (remembered per user) and clicking a tab lists all of its categories. Duplicate detection now compares the item's source, so same-named items from different compendiums are both kept.
- **Party sheet:** hover Rations, Beverages and (GM only) total Wealth for a per-member breakdown.
- pt-BR: large batch of missing translations.

## v5.43.0
- **Crafting (new): the Workbench.** Open it from the Downtime window (Craft Item), the character sheet or the Character HUD portrait menu. Turn it on/off and set the rules in the new **Crafting & Relics** settings menu (General / Alchemy / Relics / Mana Crystals tabs).
  - **Craft tab:** catalog of craftable equipment from the enabled compendiums (search, categories), a detail panel with Value, Materials, estimated Shifts and Slots, and **Ongoing Projects**. "Add to Projects", then **Work a Shift**: spread your Shift Value Limit over your Projects (typed amounts like `30s` or `1g 5s`, ±1 buttons or **Auto-fill**). The Workbench warns before you work a Shift that is over your limit or short on Materials. A Project sits in your inventory until it's finished; abandoning it loses the Materials spent.
  - **Materials** work as one pool: a single **Materials (1g)** item, spent as the Project progresses (X% worked = X% of the half-value Materials). Leftovers stay as partial bundles; the Materials item's price follows what's left in it.
  - **Scrap tab:** break an item down for Materials worth half its value (doesn't use your Shift budget).
  - **GM custom recipes:** drop a world item from the Items sidebar into the catalog to add it for everyone (shown with a "GM" badge).
  - **GM approval (optional):** crafting requests post an Approve / Deny chat card for the GM.
- **Alchemist (RAW update):** class pack rewritten to the current rules page — "Big Bang" removed, Training is Arcana / Craft / Medicine, formula picks and a formula value cap come from the class levels.
  - **Alchemy tab:** learn formulas (up to your picks and value cap) and Craft known formulas for 5s of Materials (Catalyze). Optional Alchemy Tools requirement (off / warn / block).
  - **Prima Materia:** button in the Alchemy tab — spend a Studied die to create any Alchemical Item worth 10g or less, with no Materials.
  - **Eureka:** fires on Craft checks, including attacks rolled with Craft.
  - **Potency:** +N damage per die on alchemicals the Alchemist uses; dice explode on the highest face (L4) or two highest faces (L8).
  - **Mix tab:** drag two of your Alchemical Items (with a charge left) into the slots and spend a Studied die to make a **Mixture**. Both payloads happen together: same damage type = damage added up; different types = the second type rolls as its own card on the same targets (only on a hit when thrown); on-hit statuses combine. A Mixture goes inert at the start of your next Turn in combat (out of combat: next action or never, a setting). Inert Mixtures are deleted or kept greyed out with an "Inert" badge (setting) and can't be used.
  - Mix and Prima Materia never need GM approval (the Studied die is the cost).
- **Throwing alchemicals:** Alchemical Items that deal damage (not potions) now attack as a throw, rolled with **Ranged or Craft** (the better one is picked automatically, or choose "Throw with X"). Far = Hinder, one target, each throw spends a charge hit or miss. "Use (no attack roll)" keeps the old auto-hit card.
- **Relics:** relic powers of the same family replace each other instead of stacking; Bound relics only work when bound to their wielder (setting, shows an "Unbound" badge on the effect); relic value includes its powers. Relic Forge projects and a GM **Combine** ritual (merge two relics of the same Type) are available through the API.
- **Mana Crystals (variant, off by default):** crystal sockets on weapons and armor, sized by host and Bonus.
- Fix: statuses from a consumable used up by the attack (last charge, a Mixture) were lost when the target rolled their Save or the damage was applied — they now apply.
- Fix: shop Remove Duplicates / stocking no longer merges renamed copies of one compendium entry (e.g. two "Scroll, Spell" for different spells).
- Compendium: Alembic, Alchemical Item - Complex and a second Herbalism Tools (Alchemy & Medicine) added; Materials (50s) removed (starting packs now give Materials (1g)); "Caestus / Gauntlet" renamed.

## v5.42.1
- **Shops: remove duplicates.** Configure Shop → Stock → **Remove Duplicates** merges items stocked more than once (same source, or same name, type and material — e.g. the same item from two compendiums). One copy stays; limited stock quantities add up. Dropping items, folders or compendiums now skips these duplicates too.
- **Shops: players can read item sheets.** Double-clicking a ware opens its full item sheet (locked, read-only) for every player who can open the store — no more plain-text popup.
- "Group Cart" renamed **Party Cart**.

## v5.42.0
- **Shops (new):** a new **Shop** actor type — merchants players buy from and sell to. On by default (world setting "Enable Shops"); GMs open one from the new **Open Shop** scene tool or the actor.
  - **Store window:** banner with the shop art, name, tagline and merchant (portrait, title, description); categories sidebar (All Wares, Armor, Weapons, Gear, Alchemical, Relics — Gear split by category, Alchemical by type); item cards showing slots, damage / armor rating, stock, a description excerpt and the price (hover for the price breakdown; double-click opens the item). Search across all wares, sort (shop order, name, price, slots) and a card / list view toggle.
  - **Carts:** **Personal Cart** pays from the character and puts items in their inventory; **Group Cart** pays from the party treasury and puts items on the party. Add with the cart button or drag cards onto the cart. Shows money and inventory Slots before/after; the whole cart is bought in one go, with one chat receipt.
  - **Selling:** drop an item from your character or party on the sell zone; the money goes to whoever owned it. The merchant pays the shop's Buy Price %.
  - **GM setup (Configure Shop):** merchant, tagline, pricing sliders (Markup, Buy Price, Sale Discount, Presence discount), limited purse, unlimited stock. Stock the shop by dropping items, item folders or **whole compendiums** on the sheet or the store — items land in their categories (folder names become Gear categories). "Show to Players" opens the store on chosen players' screens; a GM-only attitude picker sets each buyer's standing (changes prices).
  - All purchases and sales are checked and processed by the active GM. Receipts in chat follow the "Shop Receipts in Chat" setting (public / private / off). Macro API: `game.vagabond.shop` (open, show, buy, buyCart, sell, partyTransfer, price) and `game.vagabond.currency`.
- **Party treasury:** parties now hold their own coins (used by the Group Cart and shop sales).
- **FX preview:** the film icon on locked weapon/alchemical/relic sheets (and the new Anim row on spells) opens a preview of the item's Hit / Miss (or the spell school's Cast + area) animations, with prev/next variants and the configured sound played together. The Spell FX config preview plays the row's sound too.
- **Token names follow actor renames:** renaming an actor also renames its prototype token and placed linked tokens that still had the old name.
- Item sheets opened read-only (e.g. a shop item a player is viewing) always show the locked view, without the lock toggle.
- Compendium: Light/Medium/Heavy Armor default material set to none.

## v5.41.0
- **Armor values are explicit:** each armor now has its own Armor Rating, Might requirement, Slots and Reflex Penalty (no more Light/Medium/Heavy type). Existing armor converts automatically.
- **One set of armor:** equipping armor takes off any other worn armor; only that one counts.
- **Might requirement:** wearing armor above your Might applies Restrained automatically, removed when fixed.
- **Materials (Smithy table):** new Bronze, Gold, Iron, Steel and Wood ("Common" becomes Iron). Orichalcum +1 Slot and weapon die one size up; Mythral weapon die one size down; Wood halves the price. Slot changes also move armor's Reflex penalty.
- **Weapon sheet:** locked view shows final damage (after material) with damage-type icons, only the damage rows the grip uses, and properties as a full-width footer. Edit view shows the final damage beside each input.
- **Weapon skill:** multi-skill weapons start on the character's best skill (lowest difficulty) when received; change it from a dropdown in the locked sheet.
- Prices from materials now show in the largest coins (70g, not 50g 2000s).
- Compendium: Light Armor is 1 Slot; Maul image; Rapier/Shortsword two-hand damage.

## v5.40.0
- **Active Effects list overhaul:** character, NPC, construct and party sheets now show effects as an Active / Inactive list. Each row has the effect icon, name, origin pill, duration chip, a small on/off switch, send-to-chat and a ⋮ menu (right-click a row opens the same menu). "+" in each section header adds an effect.
- **Effect descriptions:** click an effect's name to expand its description below the row. Effects on items (perks, traits, relics, weapons…) now use their item's icon and description when they have none of their own, in the list, the accordion and the chat card. New effects created on an item are pre-filled from it.
- **Item effects can be disabled, not deleted:** effects granted by an item, weapon, ancestry or class can be switched off from the sheet, but only removed from their item (Delete is greyed out with a hint). Effects that are not applying (unequipped item, on-use, expired) stay listed, dimmed with a badge. Status conditions show fully; switching one off removes it along with its countdown die.
- **HUD: effect switches:** the Character and NPC HUD portrait menus end with an "Active Effects:" list with a small switch per effect.
- **Active Effect config window:** key column no longer overflows (truncates with a tooltip), wider window, cleaner inputs.
- **Foundry v14 Active Effect compatibility:** effect changes are now read from the v14 `system.changes` shape (`type` instead of the old numeric `mode`), so on-use item effects apply again. Perk-choice effects are created in the v14 shape. "When equipped" / "on use" rules are handled through v14 effect suppression instead of hiding effects, and `@` references in effect values are left for the system to resolve after stats are calculated.
- Fix: countdown/status removal from the Ongoing panel now also clears the linked status correctly.

## v5.39.0
- **HUD hand circles: drag to rearrange.** Drag one held item onto the other hand circle to swap them; with a single 1H item held, drag it onto the empty circle to park it in that hand. The move is remembered until the item is re-equipped.
- **HUD hand circles:** removed the R / L letter labels (the empty-hand tooltips still say Right / Left Hand).
- **HUD drop-to-add:** drop an Item, container item or Folder onto the Character HUD to add it to the actor, same as dropping on the sheet. The HUD highlights while a drag is over it.
- **HUD Spells & Inventory tabs:** the favorite star and the equipped check are now clickable toggles (favorite ⇄ unfavorite, equip ⇄ unequip, hand limit still enforced), dimmed when off.
- **Spell context menu unified:** the HUD (Spells rows, belt slots) and the sheet's favorited-spells panel now share one menu: Cast, Open, Send to Chat, Favorite / Unfavorite. Right-clicking a spell row on the HUD Spells tab opens it too.

## v5.38.3
- Fix: `@statuses.<id>` bonus formulas (e.g. Barbarian Rage's `(@statuses.berserk) ? 2 : 0`) logged an "Invalid formula" console warning on every data prep while the status was inactive. Value was always correct — this was console noise only. Thanks to @DimitroffVodka for the report and diagnosis (#67).

## v5.38.2
- **HUD Belt row is now a live mirror**, same principle as the hand circles: always shows favorited spells + worn ('Belt') equipment (oldest first), base 5 slots growing up to 7; beyond that it's HUD-display-only overflow (the sheet's Belt stays uncapped).
- **Belt drag-to-reorder**: both the Character HUD's Belt row and the sheet's Equipped > Belt list support drag-to-reorder, sharing the same `flags.vagabond.beltOrder` so reordering in either place updates both.
- Sheet's Equipped > Belt list is now one freely reorderable list instead of fixed category blocks.
- Fix: Hands/Belt zone dividers in the Equipped panel — title now renders as vertical text on the left with the separator line running the full height of that zone's rows.
- Fix: ancestry trait description box had washed-out, low-contrast text/background in both light and dark themes.
- Fix: Breath Attack item FX hit scale was 3, corrected to 1.
- Weapons pack cleanup: match rulebook table, remove duplicates and variants.

## v5.37.0 — Print Wave 3 Alpha 2

- **Flanking:** automatic flanked/flanking detection — a foe with two or more enemies Close (and no more than one size larger) is marked Flanked (Vulnerable, +2 damage), attackers marked Flanking; multi-cell tokens handled, updates on movement and per attack.
- **Weapon properties overhaul:** properties reviewed and expanded, with far more of them now resolved automatically during attack and damage rolls instead of by hand. Keen and Vicious moved onto the weapon-property effects registry, plus a per-weapon "Crit Range Mod" field on the weapon sheet. Relic renames: "Ace - Entangle" → "Ace - Grapple", "Ace - Brutal" → "Ace - Vicious".
- **Defense property — block with a Shield:** when an attack calls for a Save, the chat card now offers a button to defend with an equipped Shield instead of rolling the Save.
- **Equipped-weapon cap:** you can now keep up to 3 Slots' worth of weapons equipped at once (RAW), counted by weapon Slot size and tracked independently of the two-hand pool.
- **Fix — inventory Slot accounting:** a stack of Slot 0 items (e.g. ×10) now counts as 1 Slot total instead of 0.
- **GM Tools compendium:** the old "Dev Tools" / "Macro Scripts" pack is now **GM Tools**, with a GM macro:
  - **Sync Items From Compendium** — after you edit compendium content, re-pulls the current version of every compendium-linked item already on actors and scene tokens so nobody is left holding a stale copy; per-instance state (quantity, equip, grid slot…) is preserved.
- Internal: damage roll pipeline refactor — all weapon/spell/alchemical/NPC damage now flows through one path.

## v5.35.0
- **Combat Carousel on/off setting:** new "Enable Combat Carousel" toggle in Encounter Settings (default on) — turn it off to use only the sidebar Combat Tracker.
- **Combat Carousel: targeting & selection:** left-click a card to pan/select the token (configurable), Alt+Click to target it (Shift+Alt to add multiple), plus a dedicated target marker on each card.
- **Combat Carousel: card back:** now also tracks Mana and Luck (in addition to HP/Fatigue), click/right-click to adjust.
- **Combat Carousel: auto-hide & dim-when-idle:** the carousel can tuck off the top of the screen or fade when idle, revealing on hover — table default (GM) plus a per-player override.
- **Sidebar Combat Tracker:** drag-to-reorder combatants within a faction and drag-to-reorder faction groups themselves — same interaction the Combat Carousel already had.
- Fix: Next/Previous Turn now follows the faction-grouped order actually shown on screen instead of raw initiative order, so turn order stays correct after a drag reorder.
- Fix: Character/NPC HUD window position is now saved once per user instead of per-actor, so it doesn't reset when switching between tokens.

## v5.34.0
-Added Combat Carousel like tracker for encounters

## v5.33.0
- Translation fixes for pt-br language
- Spell settings: Mana spending on failed Cast: Full, Half or None

## v5.32.1
- Fixes for lights item use not working for players

## v5.32.0
- **Multi-Use Consumables:** alchemicals and other consumables can now have Max Uses (charges/doses) instead of just Quantity — a 3-charge potion or an oil that coats up to 5 ammo. Pips UI to track/spend charges on item sheet, inventory grid, and HUD.
- **HUD tooltips:** new hover-tooltip system for the Character HUD with left/right-click hints.
- Fix: applying a coating (Oil/Poison) to a weapon now correctly consumes a charge from the source item.

## v5.31.3
- Added 80 Trinket items to Gear compendium
- Fixes on several translation inconsistencies
- Removed stale duplicate of Tempo Spell after division in two (Tempo + / Tempo -)

## v5.30.3
- Fix: hardcoded currency abbreviations 
- Fix: hardcoded chat card titles 
- Removed the unused "Creation Notes" compendium pack.

## v5.30.2
- **Bestiary/Humanlike privacy:** players can no longer view the Bestiary or Humanlike compendiums.
- **Fix: Light source clock options:** removed duration 1 Shift option from torches and candles. Laterns have it.
- **Fix: Equipped item panel:** clicking on items in equipped section of character sheet uses the items

## v5.30.1
- **Fixes:** some terms were hardcoded on sheets, chat and menus.

## v5.30.0
- **Brazilian Portuguese Translation:** full `pt-BR` localization added, selectable in Foundry's Language setting.

## v5.29.0
- **Hand limits (unified):** equipped weapons and hand-occupying items (torches, wands) now share one 2-hand pool; a Two-Handed weapon or 2H-gripped Versatile weapon fills both hands and prevents equipping anything else.
- **Trinket gate:** casting requires an equipped trinket, or a weapon if you have the Gish Perk.

## v5.28.0
- **Glyph delivery:** place a glyph on the map that triggers whenever you want.

## v5.24.0
- **Imbue delivery:** cast a spell onto a weapon, using the attack roll as the check.

## v5.23.0
- **Light Sources:** torches, candles, and lanterns apply real token light when used, with a burn-down timer (real time like Shadowdark, hourly, or per Shift) shown as a Progress Clock.

## v5.11.0
- **NPC HUD:** floating HUD for NPCs — action/ability chips, detail panel, follow-select.

## v5.10.0
- **Character HUD:** small always-available HUD mirroring the char sheet — item quick-slots, weapon circles, multiple ways to open (token select, scene controls, sheet header, portrait right-click).

## v5.8.0
- **Casting HUD (Spell Cast Dialog):** new casting dialog to help players understand mana flow and consumption.

## v5.7.0
- **Class Features automation:** Barbarian Rage and Fighter Valor automated via Active Effects.

## v5.0.0
- **Automations:** weapon property automation (Brutal, Entangle, Cleave).
- **On-Hit Effects:** items, spells, and NPC actions can apply statuses and generate Countdown Dice; the dice deal damage when rolled.
- **Crit evaluation toggle:** on a Crit, choose to keep the Luck point or deal more damage (click the Crit badge).
- **Ongoing Status Panel** for tracking active statuses/countdown dice.

## v4.2.0
- **Item FX — Per-Item Animations:** weapons, alchemicals, and relics get their own Sequencer animations configured on the item sheet (melee/ranged, hit/miss files and sounds), auto-derived for weapons from weapon skill.
- **Focused Spells:** Focus track in the Spells panel; Mana icon in Combat highlights focused spells.

## v4.0.0
- **Sequencer Animations Panel:** GM-configurable spell FX paths.

## v3.8.0
- **Full Homebrew:** GM panel to edit stats, skills, saves, dice, magic, leveling, derivations, damage types, and terms; export/import homebrew configs.

## v3.7.0
- **Party Sheet:** dashboard of party data, positionable compact mode.
- **Vehicles:** party sheet doubles as a vehicle sheet — multi-part vehicles with per-part HP/Armor/Damage, crew rolls, and Cargo container slots.

## v3.5.0
- **Level Up menu:** click the XP label on the character sheet to open the level-up flow.

## v3.4.0
- **Character Sheet themes:** Light and Dark theme styles, toggled via Core > Configure Interface > Applications.

## v3.0.0
- **Combat Encounters:** per-faction separation (Heroes, NPCs, Neutrals, Secrets via Token Disposition), with custom initiative or "popcorn initiative" ordering.

## v2.8.3
- **Character Builder:** guided builder with full-random or per-step randomization.

## v2.7.0
- **Weapon grip validation:** early hand/grip checks for equipping weapons (precursor to the unified hand-limit system in v5.29.0).
- **NPC Action Recharge:** actions with a Recharge field mark spent/roll-to-recharge with an hourglass icon.

## v1.2.0
- **Downtime Manager:** automated Resting (lodging cost → HP/Mana/Luck), Hunting & Foraging loot tables, and Crafting & Studying progress tracking.

## v1.0.0
- **Progress Clocks, Trackers & Countdown Dice:** canvas-native clocks (4/6/8/10/12 segments), positive/negative trackers, and countdown dice.
- Core **Mana Calculator** / freeform spellcasting (Delivery methods, Damage Dice, Range extensions, auto mana-cost calculation, click-to-template targeting) present since the earliest tagged releases.

