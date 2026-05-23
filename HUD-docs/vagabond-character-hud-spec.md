# Vagabond — Character HUD
## Design & Implementation Specification
### Version 2 — replaces all previous HUD designs

---

## 1. Overview

The HUD is a compact floating overlay the player can drag freely around the screen. It surfaces critical character data during play without opening the full sheet. It is **not anchored to a token** — it floats wherever the player leaves it, and its position persists per user.

The HUD is a **single fixed state** — always visible, always the same layout. Panels expand above or below it via the tab row.

---

## 2. Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ ROW 1                                                           │
│ ┌───────────┬────────────┬───────────────────────────────────┐  │
│ │           │ ♥  10      │ Leif                              │  │
│ │           │ 💀  2      ├───────────────────────────────────┤  │
│ │  PORTRAIT │ 👢 30'     │ [■] +/.0  [Hindered]             │  │
│ │  95×95px  │ 🍀  2      ├───────────────────────────────────┤  │
│ │           │            │ [·][·][·][·][·]  ← 28px slots    │  │
│ └───────────┴────────────┴───────────────────────────────────┘  │
│                                                                 │
│ ROW 2 (100% width)                                              │
│ [ TRAITS ][ SKILLS ][ SAVES ][ SPELLS ][ INVENTORY ]           │
└─────────────────────────────────────────────────────────────────┘

  Floating outside the grid (position: absolute):

  ◉  ← weapon circle 1 (54px)    ✦ 12  ← mana
   ◉ ← weapon circle 2 (54px)    [3]   ← armor value
```

---

## 3. Grid Structure

### Row 1 — `display: grid; grid-template-columns: 95px 52px 1fr`

**Col 1 — Portrait**
- Fixed 95×95px
- Image: `actor.img` or `token.texture.src` (confirm)
- No interaction defined

**Col 2 — Vitals** (4 rows stacked)
- HP — FA icon + value
- Fatigue — FA icon + value
- Speed — FA icon + value
- Luck Pool — FA icon + value
- All clickable (roll or action — confirm per vital in system source)
- Icons: FA Pro — confirm exact classes from system DOM. Do not assume.

**Col 3 — Main** (`display: grid; grid-template-rows: auto auto 1fr`)
- Row A: Character name (`1.8rem`)
- Row B: Study Die square + Check Mod + Hindered/Favored toggle
- Row C: 5× spell/item quick slots (28×28px each)

### Row 2 — Tab bar (`display: flex`, 100% width)
- 5 equal-width buttons: Traits, Skills, Saves, Spells, Inventory
- Clicking opens a panel above or below the HUD depending on screen space
- Clicking the active tab closes the panel

---

## 4. Floating Elements

These three elements sit **outside the grid flow** with `position: absolute` relative to the HUD container. They are not inside any grid cell.

| Element | Size | Content |
|---|---|---|
| Weapon circle 1 | 54px diameter | Item portrait (`item.img`), click = roll attack |
| Weapon circle 2 | 54px diameter | Item portrait (`item.img`), click = roll attack |
| Mana badge | — | `✦ {value}` display only |
| Armor badge | 24×24px | Armor value, display only |

The two weapon circles overlap slightly (second offset down and right from first).

Positions are approximate — the Claude Code implementation should anchor them naturally to the right edge of the HUD. The player does not drag individual floats; the whole HUD is dragged as one unit.

---

## 5. Tab Panels

Each tab opens one panel. The panel renders above or below the HUD body depending on available screen space — detect via JS at render time.

### Traits panel
Three sections in a two-column layout:
- **Features** (left column)
- **Traits** (right column, top)
- **Perks** (right column, below Traits)

Each section has a decorative heading (horizontal line + serif title). Each item is an accordion: click the name to expand/collapse the description. Right-click on any item opens a context menu (edit/delete — reuse existing system context menu pattern).

Visual style: semi-transparent dark background, gold/amber decorative lines. The Foundry canvas background shows through. Inspired by the system's existing styling — see reference files.

### Skills panel
Two-column grid of all skills + attack skills. Each row click = roll that skill immediately (no dialog).

### Saves panel
Three cells: Reflex, Endure, Will. Each shows icon + value + label. Click = roll that save immediately.

### Spells panel
List of all spells. Each row: spell portrait + name + damage + mana cost. Click = cast (direct roll, no dialog). Exception: if the Spell Cast Dialog is implemented, clicking the spell portrait opens it; clicking the name row is a direct cast.

### Inventory panel
Two-column grid of equipped/carried items. Each row: item name + quantity or die size.

---

## 6. Quick Slots

### Spell/Item slots (5×, 28×28px)
- Stored in actor flags or a dedicated system field — confirm where the character sheet persists hotbar assignments
- Accept Foundry DragDrop — wire `_onDrop` to assign an item to a slot
- Click = use the item (cast spell, use consumable, etc.) — confirm action via system source
- Right-click = context menu with "Clear slot" option
- Empty slot shows FA `fa-plus` icon
- Filled slot shows `item.img`, with mana cost badge if applicable

### Weapon slots (2×, 54px circles)
- Same persistence and DragDrop pattern as spell/item slots
- Click = roll attack with that weapon — confirm roll method in system source
- Empty slot shows FA `fa-plus` icon
- Filled slot shows `item.img`

---

## 7. Controls

### Study Die
- Small square (22px), displays die value
- Click = roll study die — confirm action in system source

### Check Mod
- Displays `+/.{value}` format
- Display only (value comes from actor data — confirm field)

### Hindered/Favored toggle
- 3 states: Normal → Hindered → Favored → Normal
- The system already implements this toggle on the character sheet
- Find the existing `data-action` and reuse it — do not reimplement

### Vitals (HP, Fatigue, Speed, Luck)
- HP: click may trigger a recovery roll — confirm in system source
- Others: confirm if clickable or display-only per system

---

## 8. Font Scale

| Size | Usage |
|---|---|
| `0.85rem` | Secondary values: mana, study die, armor, slot costs, panel detail text |
| `1.00rem` | Default: tab labels, panel row names, trait names |
| `1.20rem` | Highlighted: vital values (HP, Fatigue, Speed, Luck), save values |
| `1.80rem` | Character name |

---

## 9. FA Icons

All Font Awesome **Pro** (already loaded by Foundry).

| Element | Notes |
|---|---|
| HP | Confirm from system DOM |
| Fatigue | Confirm from system DOM |
| Speed | Confirm from system DOM |
| Luck | Confirm from system DOM |
| Reflex save | Confirm from system DOM |
| Endure save | Confirm from system DOM |
| Will save | Confirm from system DOM |
| Empty slot | `fa-plus` |
| Trait accordion chevron | `fa-chevron-down` |
| Tab active indicator | none — CSS only |

> All icon classes must be verified against the system's existing HBS templates. Do not assume or invent FA class names.

---

## 10. Styling Approach

The module already uses **SCSS compiled via `npm run watch`**. The HUD styles must be written in SCSS following the existing module conventions.

**The reference files (`vagabond-hud.hbs` and `vagabond-hud.css`) provided with this spec are for study and inspiration only.** Claude Code must:
- Read them to understand structure, dimensions, and design intent
- Write its own SCSS from scratch following the module's existing patterns
- Use the module's established class naming convention to avoid conflicts with the Vagabond system and other Foundry modules
- Not copy the reference CSS directly

The HUD background is semi-transparent so the Foundry canvas shows through. No opaque backgrounds.

---

## 11. Reference Files

Two reference files accompany this spec:

- `vagabond-hud.hbs` — reference HBS showing structure, `data-action` annotation points, and Handlebars binding examples
- `vagabond-hud.css` — reference CSS showing dimensions, grid, font scale, and element sizing

**These are starting points for understanding, not files to copy.** The actual implementation files are created fresh by Claude Code inside the module's existing structure.

---

## 12. Data Fields

> All paths are assumptions based on the mockup and character sheet DOM. Every path must be verified against the Vagabond system source before use.

| Display | Assumed path |
|---|---|
| Portrait | `actor.img` or `token.texture.src` |
| Name | `actor.name` |
| HP | `actor.system.health.value` |
| Fatigue | `actor.system.fatigue.value` |
| Speed | `actor.system.speed` |
| Luck Pool | `actor.system.luck.pool` |
| Study Die | `actor.system.studyDie` |
| Check Mod | `actor.system.checkMod` |
| Hindered state | `actor.system.hindered` |
| Reflex | `actor.system.saves.reflex` |
| Endure | `actor.system.saves.endure` |
| Will | `actor.system.saves.will` |
| Mana | `actor.system.mana.value` |
| Armor | `actor.system.armor.value` |
| Skills | `actor.system.skills` |
| Items (spells) | `actor.items` filtered by type |
| Items (equipped) | `actor.items` filtered by equipped |
| Slot assignments | actor flags — confirm key |
| Weapon slot assignments | actor flags — confirm key |

---

## 13. Prompt for Claude Code (VSCode)

Paste this as the first message in a new Claude Code session with the module repository open. Attach both reference files.

---

*End of spec document — version 2.*
