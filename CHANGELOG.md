# Changelog

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
- **GM Tools compendium:** the old "Dev Tools" / "Macro Scripts" pack is now **GM Tools**, with two GM macros:
  - **Sync Items From Compendium** — after you edit compendium content, re-pulls the current version of every compendium-linked item already on actors and scene tokens so nobody is left holding a stale copy; per-instance state (quantity, equip, grid slot…) is preserved.
  - **Refresh World Data** — re-runs data preparation and re-renders every actor, item, token and open sheet without a page reload (for derived-data / homebrew-value changes).
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

