# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vagabond is a Foundry VTT v13 game system built using ApplicationV2, DataModels, and modern JavaScript (ES modules). It's a custom TTRPG system with stats, skills, weapons, spells, equipment, NPCs, and progress clocks.

## Common Commands

### CSS/SCSS Compilation
```bash
npm install          # Install dependencies
npm run build        # Compile SCSS once
npm run watch        # Watch and recompile SCSS on changes
```

### Development Setup
```bash
npm run createSymlinks  # Create symlinks to Foundry data directory (optional)
```

## Architecture Overview

### Document Structure
- **Actors**: `character` and `npc` types
- **Items**: `equipment` (weapons/armor/gear), `spell`, `ancestry`, `class`, `perk`
- **Progress Clocks**: Custom journal-based overlay system for tracking progress
- **Countdown Dice**: Custom journal-based overlay system for countdown mechanics

### Key File Locations

**Core System Files**:
- `module/vagabond.mjs` - Main entry point, hooks, initialization, hotbar macros
- `module/helpers/config.mjs` - Global configuration (VAGABOND constant with all game data)
- `system.json` - System manifest

**Document Classes**:
- `module/documents/actor.mjs` - VagabondActor class
- `module/documents/item.mjs` - VagabondItem class with roll() method
- `module/documents/progress-clock.mjs` - Progress clock static helper
- `module/documents/countdown-dice.mjs` - Countdown dice static helper

**DataModels**:
- `module/data/actor-character.mjs` - Character data model
- `module/data/actor-npc.mjs` - NPC data model
- `module/data/base-equipment.mjs` - Base equipment schema (weapons/armor/gear inherit)
- `module/data/item-spell.mjs` - Spell data model
- `module/data/item-class.mjs`, `item-ancestry.mjs`, `item-perk.mjs` - Character customization

**Sheet Classes (ApplicationV2)**:
- `module/sheets/actor-sheet.mjs` - VagabondActorSheet (unified for both character and NPC)
- `module/sheets/item-sheet.mjs` - VagabondItemSheet

**Helpers**:
- `module/helpers/chat-card.mjs` - VagabondChatCard for unified chat message generation
- `module/helpers/chat-helper.mjs` - Chat message utilities
- `module/helpers/damage-helper.mjs` - VagabondDamageHelper for damage application
- `module/helpers/effects.mjs` - Active effect utilities

**Progress Clocks**:
- `module/applications/progress-clock-config.mjs` - Clock creation/editing dialog
- `module/ui/progress-clock-overlay.mjs` - HTML overlay rendering system
- `module/canvas/progress-clock-layer.mjs`, `progress-clock-sprite.mjs` - Canvas integration

**Countdown Dice**:
- `module/applications/countdown-dice-config.mjs` - Dice creation/editing dialog (ApplicationV2)
- `module/ui/countdown-dice-overlay.mjs` - HTML overlay rendering system
- `src/scss/components/_countdown-dice.scss` - Countdown dice styling

**Templates**:
- `templates/actor/sliding-panel.hbs` - Right-side sliding panel with stats, skills, saves, favorites
- `templates/actor/features.hbs` - Features & Perks tab (includes inventory grid with wealth and slots)
- `templates/actor/spells.hbs` - Spell list tab
- `templates/actor/effects.hbs` - Active effects tab
- `templates/actor/parts/inventory-card.hbs` - Individual inventory item cards (used in inventory grid)

## Character Sheet Architecture

### Sliding Panel System

The character sheet uses a **right-side sliding panel** design (`templates/actor/sliding-panel.hbs`) that contains all primary character information for quick reference:

**Panel Structure**:
1. **Header Section** (lines 8-150):
   - Character name input
   - Level Up button + XP field
   - Level, Ancestry, Class, Being Type, Size display
   - Character portrait with armor overlay (armor value + type)
   - HP display (current/max) overlaid on portrait
   - 3×2 stat grid: Might, Dexterity, Awareness, Reason, Presence, Luck (all rollable)
   - Fatigue bar with skull icons

2. **Speed Stats Row** (lines 153-218):
   - Favor/Hinder toggle button with die icon
   - Speed, Crawl, Travel inputs
   - Current Luck display

3. **Skills & Saves Section** (lines 220-279):
   - **Left Column**: Skills list with trained checkboxes (circle = untrained, T = trained) and difficulty values (all rollable)
   - **Right Column**: Saves (horizontal row) and Weapon Skills/Attacks (vertical list)

4. **Favorites Section** (lines 313-476):
   - Equipped weapons (rollable, show damage + damage type + range + grip)
   - Equipped gear/alchemicals/relics (rollable if has damage, otherwise posts to chat)
   - Equipped armor (display only, shows armor value)
   - Favorited spells with inline damage/delivery configuration

**Key Features**:
- All stats, skills, saves, and weapon skills are **rollable** via `data-action='roll'`
- Skills/weapon skills use checkboxes for trained state (visual: empty circle vs. T icon)
- Panel toggles open/closed via click zone on the right edge
- Versatile weapons show toggleable grip icons (1H ↔ 2H) in favorites

**Panel State**:
- Controlled by `isPanelOpen` boolean in context
- CSS classes: `.panel-open` or `.panel-closed`
- Click zone (`.panel-click-zone`) triggers `data-action='togglePanel'`

### Visual Inventory Grid System

Located in the **Features tab** (`templates/actor/features.hbs`), this is a **slot-based visual grid** (3 columns × 6 rows = 18 total slots) similar to classic RPG inventories.

**Key Features**:
- **Wealth Section**: Gold/Silver/Copper currency inputs
- **Slots Display**: Shows occupied/max slots with overload warning
- **Visual Grid**: 3×6 grid displaying all weapons, armor, and gear items
- **Item Cards**: Each card shows icon, name, stats (damage/armor/quantity), and equipped state

**Architecture** (see `docs/INVENTORY_SYSTEM.md` for full details):
- `_prepareInventoryGrid()` method in `actor-sheet.mjs` prepares the inventory data
- Items are enriched with visual data (metal colors, weapon skill icons, damage type icons)
- Sorted by `gridPosition` field
- Empty slots calculated to fill grid to 18 total

**Current Limitations**:
- Drag-and-drop rearrangement is NOT YET IMPLEMENTED
- Context menus and tooltips are NOT YET IMPLEMENTED
- Items display but cannot be repositioned via UI

### Roll System Architecture

The roll system is semi-centralized in `VagabondActorSheet`:

**Roll Handlers** (in `actor-sheet.mjs`):
- `_onRoll()` - Generic d20 rolls for abilities, saves, skills
- `_onRollWeapon()` - Weapon attacks with success/failure, auto-damage on hit
- `_onUseSpell()` - Spell usage (posts spell info, doesn't roll)

**Roll Flow**:
1. Template elements have `data-action` attributes (e.g., `data-action="roll"`)
2. Action router in `DEFAULT_OPTIONS.actions` maps actions to handler methods
3. Handlers create `Roll` objects, evaluate, and post to chat via `roll.toMessage()`
4. Weapon attacks check difficulty, roll damage on success, post multiple chat messages

**Item Rolls**:
- Items can define `system.formula` for direct dice rolls
- `VagabondItem.roll()` method handles formula-based or description-based chat posts
- Hotbar macros call `item.roll()` directly

**Chat Cards**:
- `VagabondChatCard` class generates unified chat cards for items/spells/weapons
- Includes damage buttons, apply damage buttons, and metadata accordions
- Chat message hooks in `vagabond.mjs` attach click handlers for damage application

### Game Configuration (CONFIG.VAGABOND)

All game data is defined in `module/helpers/config.mjs`:
- `stats` - Core stats (might, dexterity, awareness, reason, presence, luck)
- `damageTypes` - Universal damage type list (acid, fire, shock, poison, cold, blunt, physical, necrotic, psychic, healing, recover, recharge)
- `weaponSkills` - Weapon skill categories (melee, brawl, finesse, ranged)
- `weaponProperties` - Weapon property tags (Brutal, Cleave, Keen, etc.)
- `armorTypes` - Armor categories (light, medium, heavy)
- `metalTypes` - Metal variants with multipliers and effects
- `metalColors` - Hex color codes for each metal type (used in weapon skill icon backgrounds)
- `icons` - Paths to all system icons (weaponSkills, damageTypes, grips)
- `rangeAbbreviations` - Single-letter range codes (C, N, F)
- `deliveryTypes` - Spell delivery systems (aura, cone, cube, imbue, glyph, line, remote, sphere, touch)
- `statusConditions` - NPC immunities
- `clockSizes`, `clockSegments` - Progress clock configuration

### Important Patterns

**ApplicationV2 Pattern**:
- Use `DEFAULT_OPTIONS` for configuration (actions, classes, window settings)
- Use `PARTS` for rendering sub-templates
- Register actions in `DEFAULT_OPTIONS.actions` object
- Use `_prepareContext()` to build render data (replaces `getData()`)

**DataModel Pattern**:
- Define schema in `defineSchema()` static method
- Use `foundry.data.fields.*` for field definitions
- Call `super.defineSchema()` for inheritance
- Computed properties via getters (e.g., `get currentDamage()`)

**Item Rolls**:
- Always check for `item.roll()` method first
- Weapons use dedicated `_onRollWeapon()` handler (not item.roll)
- Formulas use actor's roll data: `this.actor.getRollData()`

**Chat Card System**:
- Use `VagabondChatCard.createChatCard()` for consistent formatting
- Pass item/actor, damage formula, and metadata
- Chat hooks attach damage button functionality

**Progress Clocks**:
- Stored as JournalEntry documents with flags
- HTML overlay renders above canvas (not on canvas layer)
- Scene-independent, can be positioned per-scene
- Use hooks for create/update/delete synchronization

**Countdown Dice**:
- Stored as JournalEntry documents with `flags.vagabond.countdownDice`
- HTML overlay system (z-index 100) positioned middle-right by default
- Owner-only visibility (creator sees their dice, GM can delete via journals)
- Dice progression: d20 → d12 → d10 → d8 → d6 → d4 → end (shrinks on rolling 1)
- Integrates with Dice So Nice via `rolls: [roll]` in ChatMessage.create()
- Per-scene position persistence with sidebar collision detection
- Interaction: click image to roll, double-click for context menu, drag to move
- Context menu: Fade, Configure, Delete options (unified with progress clocks)
- Chat cards display: dice image, name, roll result, current state, status message
- Uses MutationObserver to watch sidebar expand/collapse and reposition dice
- Automatic vertical stacking with dynamic spacing based on dice size

## Development Notes

### SCSS Structure
- Source: `src/scss/vagabond.scss`
- Output: `css/vagabond.css`
- Variables, mixins, and partials are organized in SCSS

### Hot Reload
System has hot reload enabled for CSS, HTML, HBS, and JSON files (see `system.json` flags).

### ApplicationV2 Migration
The system uses ApplicationV2 (Foundry v12+). Key differences from v1:
- No `getData()` - use `_prepareContext()`
- No `activateListeners()` - register actions in `DEFAULT_OPTIONS.actions`
- Use `this.element` instead of `html` in render hooks
- Use `_onRender()` for post-render setup

### Roll System Details
See `docs/ROLL_SYSTEM_ANALYSIS.md` for comprehensive roll system documentation including:
- All roll trigger patterns
- Handler method details
- Duplication analysis
- Improvement recommendations

### Equipment States
Weapons/armor have equipment states:
- Weapons: `unequipped`, `oneHand`, `twoHands`
- Armor: `unequipped`, `equipped`
- Check state before allowing attacks

### Difficulty System
- Skills and weapon skills have `difficulty` values
- Attack success: roll total >= difficulty
- Critical hits: natural 20

## Global Objects

The system exposes a global `vagabond` object:
```javascript
globalThis.vagabond = {
  documents: { VagabondActor, VagabondItem, ProgressClock, CountdownDice },
  applications: { VagabondActorSheet, VagabondItemSheet, ProgressClockConfig, ProgressClockDeleteDialog, CountdownDiceConfig },
  ui: { ProgressClockOverlay, clockOverlay, CountdownDiceOverlay, diceOverlay },
  utils: { rollItemMacro, VagabondChatCard },
  models: { /* all DataModel classes */ }
}
```

## Testing

No automated test suite currently exists. Manual testing checklist available in `docs/ROLL_SYSTEM_ANALYSIS.md`.
