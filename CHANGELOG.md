# Changelog

## v6.3.1
- **Level Up: undo on close.** A gained Level is only kept once you Apply your choices. Closing the window before that asks you to **Apply and close**, **Undo Level Up and close** (restores your Level, your XP and, for a Level 0 hero, removes the new Class) or keep editing.
- **Level Up: clearer Stat increase.** The picked Stat shows its current and new value (e.g. `6 → 7`).
- **Level Up: Training from Reason picked in the Skills list.** When raising Reason earns a Training, tick an untrained Skill right in the Skills list (same checkboxes as the Character Builder). The hint shows the numbers (e.g. "Reason 6 → 7: Trainings 3 → 4") and the preview includes the new Training. Weapon Skills are listed with the other Skills, in three columns with bigger text.
- **Luck Pool has no cap.** Your Luck Stat is only the value the pool resets to when you Rest; Luck gained from Crits, Knack, Virtuoso or Shift+Click can go above it. Luck now shows as a single number (no more "3 / 5") in chat cards, the Fluke menu and the party sheet.
- **New Downtime panel.** Smaller window with the activities as a mosaic of picture tiles: click one to open its options and the book's text below. A Shift tracker at the top shows one 4-Shift clock per Day: a downtime starts at 1 Shift, add more with + (a whole Day, or longer if the GM allows), and each activity spends one. Working a Shift in the Workbench spends one too.
- **Foraging and Hunting roll a Survival Check.** Foraging: pick Rations or Materials, a pass adds d6 Rations or (d6 × 5s) Materials to your inventory, a Crit doubles it. Hunting: a pass rolls the Wild Game found (a Crit lets you choose), and the card shows the Rations (×3 for Prey) or Materials each beast gives when harvested.
- Each activity shows what you have next to its yellow action button: Materials and Value per Shift for Craft, your Survival Difficulty for Foraging and Hunting, your coins for Other Activities and Rest; the Skill list shows each Skill's Difficulty.
- **Other Activities** (carousing, networking, gathering intel…): pick a Skill and the gold invested; the Check gets +1 per 10g, and the gold is paid.
- **Breather** eats one of your Rations and can be taken once per Shift. Rest also spends a Shift of your downtime, and shows the Fatigue removed when your HP was already full.
- Fix: resting (Downtime) reset the Luck Pool to 8 when the Luck Stat total was 0; it now resets to the Luck Stat.
- Fix: clicking Apply (or Level Up) twice in a row could apply the Stat increase, Perk and Spells twice, or gain two Levels.
- Fix: "Close without XP" in the Level Up window did nothing.

## v6.3.0
- **Character Builder: Build Guides.** After choosing an Ancestry, pick **Use a Build Guide** or **Build from Scratch**; you can go back and switch at any time. Guides are the book's 40 ready-made Level 1 builds, shown as flip cards: the front has Stats, HP, Armor, Mana and Cast Max, Weapons, Armor & Trinkets, Spells, Level 1 Perks, Starting Pack and coins; the back has Perks by Level, Stats at Level 10, Spells to learn later and Training. Click any Weapon, Armor, Spell, Perk or Starting Pack for its details. Search and filter by Class; click a picked card again to drop it.
- A Build Guide fills in Class, Stats, Training, Perks, Spells and gear. Only your Ancestry's own choices (and anything the guide leaves open) are left as steps before Finish. **Customize in the Builder** opens the full builder with the guide's picks, so you can change anything.
- GMs can hide Build Guides from players (eye button on each card).
- Item details popups have bigger text, and a Starting Pack's popup lists what's inside.
- The Character Builder uses the sheet's scrollbars.
- **Throw skill for Thrown weapons.** The locked weapon sheet has a new **Throw** dropdown: throws roll with the same skill as the weapon's attacks by default, or with any weapon skill you pick (e.g. throw a Dagger with Ranged).
- Weapon Property tooltips (Cleave, Defense, Grapple, Keen, Long, Thrown, Vicious) now show the book's full text.
- No more pop-up when a throw at a Far Target is Hindered; the attack card's "Far" tag already shows it.
- Fix: in worlds whose homebrew skills were saved before attack types existed, Ranged attacks counted as melee (defense rules, Ranged-only features and macros reading the attack type). Missing attack types now come from the default skill.

## v6.2.0
- **Alchemist Alchemy lab.** New **Alchemy** tab on the character sheet and Alchemy panel on the HUD, with three stations: **Catalyze** (your known formulae as cards, Craft for 5s of Materials), **Mix** (Level 6: two slots, combined effect preview, Mix) and **Library** (every Alchemical Item: search, sort, Learn, Prima Materia, Craft as Project). No popups: the Catalyze and Mix feature buttons open the lab at that station, and the in-Combat Use Action limit asks for a second click instead of a dialog. The Workbench Alchemy tab and the Catalyze / Mix dialogs are gone.
- The sheet's Magic tab and the HUD's Spells tab only show for characters who have a Spell.
- **Level Up: Alchemy tab.** Alchemists choose their new formulae when they level up (Levels 4, 7 and 10, or any picks still open), within the formula value cap.
- **Character Builder: Alchemy step** for Alchemists, between Spells and Perks: choose your 4 starting formulae (50s or less, values shown in the list). Other classes don't see the step.
- **Character Builder: Stats step overhauled.** Stats and Training on one screen: pick or roll an array, place Stats in hexagon slots, then check Skills to train them (every Level 1 Training source in one panel, paid automatically). Character Traits, Saves and Skill values update live; click a Stat to see what it affects.
- Numbers now use the title font.
- Character Builder: fixed Training (Class, Elf Ascendancy's Detect) shown together in one locked "Trained" card; the panel counts the Training left to assign.
- Character Builder: characters with no Spells to choose can still browse the Spells tab, with a clear "no spells to choose" message.
- Character Builder: clearer Perks/Spells counters and perk grant list.

## v6.1.0
- Catalyze panel redesigned.
- **Alchemist Mix has its own feature button.** A compact panel: drag two Alchemical Items into the slots, see the combined effect, Mix. The Workbench Mix tab is gone. Two doses of one stack can now be mixed. Mix and Catalyze share the Use Action count per Turn (1, or 2 with Deft Hands).
- **Shorter Features list.** Scaling features (Eureka, Valor, Lay on Hands…) show only your current version on the sheet and HUD, with Level badges.
- **Hunter's Mark adds a Marked status** to the target (like the Witch's Hexed), removed when the Mark is dropped or moved.
- **Spell Trackers** for buff Spells: Blessed (d4 on Saves), Exalted (+1 per damage die), Warded (+1 Armor), Guided (attacks and Casts at it Favored), Hastened / Slowed (Tempo, 5' per die), Frozen (Speed -10'), Shrunk (damage dice one size smaller). A successful Cast of Bless, Exalt, Ward, Guide, Tempo, Freeze or Shrink shows a button that puts it on the Targets; it comes off when the caster stops Focusing on that Spell. Also toggleable from the token HUD. Shrink no longer changes the Being's size (that also cut NPC HP); track size by hand.
- **Token HUD status menu split in two:** the book's 17 Statuses, then Trackers (Focusing, Flanked, Hexed, Marked, spell Trackers…). New option in Settings → Statuses & Tokens: *Vagabond Statuses only* hides the Trackers from the menu.
- **Active Effects compendium cleaned up.** New *Trackers* folder with every Tracker as a ready status effect (Exalted now actually adds +1 to Will Saves vs Frightened). Die-size effects now step a full size (d6 → d8, was d7). Class and perk copies match Alpha 3 (Sneak Attack, Lethal Weapon, Fisticuffs, Deep Pockets, Secret of Mana, Sculpt Spell, Spell-Slinger); Ace - Keen works only with its weapon. Removed effects that did nothing (Burning I–III, Lifesteal, Manasteal, Brawl Check Favor, Evasive, Encumbered, + Mana Casting) and the Adamant / Mythral ones (Materials apply automatically).
- **Revelator Holy Diver (Level 10) is automated:** permanently Blessed (d4 on Saves, wielded Weapons count as Silvered) and Exalted (+1 per damage die, doubled vs Hellspawn / Undead; +1 on Will Saves vs Frightened), as two effects you can switch off. Existing Revelators get them on first load.
- Rogue's Level 2 feature is now labelled "Evasive (10’)" and Gunslinger's "Bad Medicine (+1 die)".
- Fix: right-clicking a class feature on the sheet could open the wrong feature (Edit / To Chat).
- Fix: the Workbench's Known Formulas showed the Alchemy craft cost as 50c; it now shows the book's 5s.

## v6.0.0
**Core Rulebook v3 Alpha 3 update.** Classes, ancestries, perks, statuses, gear, spells and the bestiary now follow the book. Existing worlds are converted once on first load by the GM: items already on characters are updated and your effect on/off choices are kept.

### Settings
- **One Settings Hub.** Foundry's Vagabond settings tab now has a single **Open Vagabond Settings** button. Every setting lives in 8 subjects (Rules, Magic, Combat & Encounters, Statuses & Tokens, Visual FX, Interface, Economy, Content & Homebrew), with search, GM / You badges, per-player overrides of GM defaults and save-on-change. Saved values carry over. The old Spell, Encounter, Status Effects and HUD Display dialogs are gone.
- **New world setting: Class Automation** (Automatic / Only in Combat / Manual). Manual turns off every class "Auto" effect; feature buttons and status toggles do the work.

### Classes
- **All 18 classes rewritten to the book**: description, Class Features table, Training and every feature's text as printed.
- **Manual-first automation.** Each automated behavior is its own Active Effect, listed in a new **Class Features** section of the effects list with a **Lv N** badge until you reach it. Switch any of them off to play it by hand. Nothing requires a Combat.
- **Feature buttons** on the sheet's Features list (pin them to the HUD Belt): Alchemist Catalyze, Bard Perform, Dancer Step Up, Druid Force of Nature, Fighter Momentum, Gunslinger Deadeye / Grit / High Noon, Hunter Mark Target, Revelator Lay on Hands, Sorcerer Overpowered, Witch Hex, Wizard Extracurricular / Archwizard. Active buttons glow; right-click one to end its effect.
- **Highlights:**
  - **Alchemist:** Catalyze crafts a known formula (1 per Turn in Combat, 2 with Deft Hands); Eureka, Potency (its Explode now works), Prima Materia (10g cap).
  - **Barbarian:** Rage auto-Berserk (attacking or taking damage applies it; a Turn without either ends it); "Light Armor" is read from the armor's Slots.
  - **Bard:** Virtuoso grants Inspiration, Resolve or Valor to your Group, spent when used; Climax, Overtuned, Enjoy the Silence.
  - **Dancer:** Footloose rolls Reflex Saves twice, keeps the higher; Don't Stop Me Now.
  - **Druid:** casts with Survival; Polymorph opens a Beast picker through the optional Metamorph module; Savagery, Beast Mode, Tempest Within.
  - **Fighter:** Fighting Style perk, Valor crit range, Momentum.
  - **Gunslinger:** Deadeye stacks (auto or by hand), Grit removes stacks, Bad Medicine and Devastator crit dice, High Noon.
  - **Hunter:** Hunter's Mark, Lethal Precision, Apex Predator (Mark is Weak to you), Rover.
  - **Luminary:** healing Spells Explode; Overheal.
  - **Merchant:** Deep Pockets Item Slots; Midas Touch boosts equipped Bonus relics.
  - **Pugilist:** Title Holder Brawl dice, Haymaker auto-Daze, Moxie.
  - **Revelator / Magus:** Righteous and Arcanum grant Gish; Lay on Hands heals and cures.
  - **Rogue:** Sneak Attack (auto, ignores Armor), Knack grants Luck on a Crit.
  - **Sorcerer:** Twinned Spell, Overpowered, Spell-Slinger.
  - **Vanguard:** Wall and Indestructible grow your Defense weapon dice.
  - **Witch:** Hex with a new **Hexed** status, Soul Link, Misery Business, Widdershins.
  - **Wizard:** Sculpt Spell discounts the whole Cast; Manifold Mind raises Focus.
  - Spellcasters' Cast Max follows each class table.
- **"Ends on a failure / next Turn" effects also end on your next roll**, with no Combat needed (Deadeye, Rage, Momentum). A chat card says what ended.
- **Exploding countdown dice:** `Cd4!` in a description creates a die that rolls `1d4!`.
- Fix: new Barbarians no longer start Berserk.

### Ancestries, perks and character creation
- **Ancestries** rewritten to the book. Darksight gives your token Darkvision; Dwarf Tough grants the Tough perk.
- **Perks** rewritten to the book text and prerequisites. New: Beat Rush, Bravado, Celestial Illuminator, Climber, Cross Counter, Cryptozoologist, Dusted Knuckle, Esoteric Recall, Favors the Bold, Fluid Motion, Instant Weapon, Medic, Quality Assurance, Quick Draw, Ricochet, Ritualist, Selfless, Swimmer. Perks not in the book are removed or folded into others.
- **Grants can ignore perk prerequisites** (all, or only Stat minimums).
- **Character Builder:** one free Perk at creation; bonus Trainings from Reason; the Class art becomes the portrait and token when they are still the placeholder.
- **Level Up dialog redesigned:** award XP first, then Stat / Perk / Spell tabs once the Level is gained; a summary of what the next Level gives; extra Training when Reason crosses a threshold.
- **Build Guides compendium:** 40 ready-to-play Level 1 characters, one per book build, with a Guide tab on Level Up panel.
- Sheet: perks show where they came from (Level / Ancestry / Class); Stat boxes show the total and edit the base.

### Combat and statuses
- **Defense property:** make an Attack Check with the Defense weapon instead of the Reflex Save; a pass subtracts every equipped Defense weapon's dice. Protector and Patience perks are automated.
- **Reflex Difficulty** includes your worn Armor's penalty.
- **Frightened / Sickened:** -2 to each damage / healing die.
- **Prone:** half Speed; Vulnerable only to Melee attacks and on Reflex Saves.
- **Incapacitated** and its family auto-fail every Might and Dexterity Skill and Save, including chat-card Saves and the Defense Check.
- **Vulnerable** is Hindered on its own Checks and Saves; attacks and Casts at it are Favored. Invisible works both ways, Cast Checks now read target statuses and Flanked +2 applies to Casts.
- Exploding damage shows `!` (e.g. `2d6!`).
- Effects can be spent on use (after an attack, Cast, Save or heal).
- Fix: Luck reroll and Force Crit work on items consumed by the attack (thrown alchemical, last dagger).

### NPCs and bestiary
- **Every statblock aligned with the book**: HP matches the HD line; Silver / Cold Iron weakness by type.
- **Statblock rules automated** (NPC sheet, Special Rules): Relic weapons bypass Immune, Weak to axes, Sunlight harm (new manual **Sunlit** status), Zombie / always HP floor, Regenerate.

### Gear, inventory and crafting
- Gear, weapons, alchemicals, trinkets, relics, spells and starting packs aligned with the book. Cart and Wagon are Construct actors.
- **Backpack:** 1 Slot consumed when held, +3 Slots when worn.
- **0-Slot items stack** (10 = 1 Slot) and split automatically; empty items fade. Rations (1 day) are now Ration 1d.
- **Drag and drop** feature buttons, items and spells onto the Equipped column or the HUD Belt. The "Belt" section is now **Worn**; backpacks and containers are hidden from it.
- **Action buttons** on any feature, trait or perk (macro or script), pinnable to the HUD Belt.
- **Workbench:** owned quantity, shortfall messages, Materials need / have.
- **Coins:** Trade Up button exchanges coins into the largest denominations.
- **Animations:** thrown attacks fly a projectile (new Throw slot); Item FX slots get a Preview button; Automated Animations warning has a "Turn it off" button.

### For effect and macro authors
- Renamed: `weaponLowExplodeBySkill` → `weaponHighExplodeBySkill`; Spell-Slinger now uses `castCritBonus` (`spellCritBonus` is not read).
- New formula values `@armorWorn.slots|rating|might` and `@combat.round` / `@combat.active` (0 outside Combat). Effects can be Level-gated (`minLevel` flag).

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

