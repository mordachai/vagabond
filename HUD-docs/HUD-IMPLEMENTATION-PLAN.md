# Vagabond Character HUD — Implementation Plan

> Status: **awaiting approval**. No code written yet.
> Built against Foundry **v14**, ApplicationV2 + HandlebarsApplicationMixin, SCSS via `npm run watch`.

The HUD is a fresh, draggable, frameless floating overlay. It **reuses the system's
existing data and action handlers** — it does not redefine any roll, cast, or resource
logic. It is its own ApplicationV2 (not the actor sheet), so it owns a small `actions`
map that delegates into the same handlers the sheet uses.

---

## 1. File list

### New files
| File | Purpose |
|---|---|
| `module/applications/character-hud.mjs` | `VagabondCharacterHud` ApplicationV2 class (singleton-per-actor) |
| `templates/apps/character-hud.hbs` | Single-root template: panel + body + floats + tab bar |
| `src/scss/components/_character-hud.scss` | All HUD styles, namespaced (see §2) |

### Modified files
| File | Change |
|---|---|
| `module/vagabond.mjs` | Import `VagabondCharacterHud`; add to `globalThis.vagabond.applications`; register scene-control tool button; add `vagabond.toggleCharacterHud` hook; preload the HBS in `preloadHandlebarsTemplates()` |
| `src/scss/vagabond.scss` | `@import 'components/character-hud';` inside the `.vagabond {}` block |
| `lang/en.json` | New `VAGABOND.Hud.*` keys (tab labels, tooltips, empty-slot text) |

No new build config. CSS auto-compiles via the running `npm run watch`.

---

## 2. SCSS naming strategy — shared base + BEM modifier (NPC-HUD ready)

- **Shared root (both HUDs):** `.vbd-hud` (added alongside `vagabond` in `classes`, so it
  inherits the `.vagabond` font/scrollbar scope but stays isolated).
- **Type modifier:** `.vbd-hud--pc` (this player HUD) and future `.vbd-hud--npc`.
- **Shared children** (`vh-*`, reused by both): `.vh-body`, `.vh-grid`, `.vh-portrait`,
  `.vh-vitals`, `.vh-vital`, `.vh-name`, `.vh-controls`, `.vh-floating`, `.vh-mana`,
  `.vh-armor`, `.vh-tabs`, `.vh-tab`, `.vh-panel`, `.vh-panel-content`, `.vh-section`,
  `.vh-row`, `.vh-save`, `.vh-spell`.
- **PC-only children** (`vh-pc-*`): `.vh-pc-slots`, `.vh-pc-slot`, `.vh-pc-weapons`,
  `.vh-pc-weapon`. NPC-only would later be `.vh-npc-*`.
- SCSS shape: `.vbd-hud { /* shared shell */ } .vbd-hud--pc { /* pc layout */ }`.
- The reference `vagabond-hud.css` is consulted for dimensions/feel only; classes rewritten fresh.

### Design tokens — reuse `src/scss/utils` (no hard-coded colors/fonts)

The reference CSS's literal hex/`rgba()` are replaced with system tokens, so the HUD is
theme-aware (light/dark vars switch automatically):

- **Fonts:** `$font-title` (Germania) → char name + section headings; `$font-number`
  (Ludlow) → vital/save/mana numbers; `$font-text` (Paradigm) → trait/feature descriptions;
  `$font-primary` (Eskapade) → default UI text/tab labels.
- **Backdrop:** `$c-transparent` (theme-aware translucent) for the HUD body; `$c-inset-1`
  for the tab panel — keeps the canvas showing through as the spec requires.
- **Accents:** `$c-yellow` / `$c-dark-yellow` for gold decorative lines, active tab, filled
  slot borders; `$c-stat` for highlighted numbers.
- **Vital colors:** `$c-red` HP + hindered, `$c-damage` fatigue, `$c-green` luck + favored,
  `$c-tan` / `$c-muted` secondary text/dividers, `$c-white` / `$c-lite` primary text.
- **Scrollbar:** `@include vagabond-scrollbar` (already applied globally via `.vagabond *`).

---

## 3. ApplicationV2 class structure

```
api.HandlebarsApplicationMixin(api.ApplicationV2)
  └── VagabondCharacterHud
```

- **Frameless, positioned, draggable.**
  `DEFAULT_OPTIONS = { id: 'vbd-hud-{id}', classes: ['vagabond','vbd-hud'],
    window: { frame: false, positioned: true }, position: { width: 'auto', height: 'auto' } }`
- **Singleton per actor:** `static #instances = new Map()` keyed by actorId; `static open(actor)`
  / `static toggle(actor)` mirroring `OngoingPanel.toggle()`.
- **Constructor:** `new VagabondCharacterHud(actor, options)` → stores `this.actor`,
  instantiates `this._rollHandler = new RollHandler(this)` and
  `this._spellHandler = new SpellHandler(this)` (the HUD is the "sheet" they need —
  it exposes `.actor` and `.element`, which is all these handlers touch for our actions).
- **`static PARTS`** = single `hud` part → `character-hud.hbs`.
- **Lifecycle methods:**
  - `_prepareContext()` — builds all render data from `this.actor` (see §5).
  - `_onRender()` — restore saved position; wire drag handle, panel toggle, accordions,
    drag-drop slots (if enabled), and register reactivity hooks via `AbortController` +
    debounced `render()`.
  - `close()` — abort listeners, clear hooks, remove from `#instances`.
- **`actions` map** (HUD-owned, delegating — no new logic):
  | action | target |
  |---|---|
  | `roll` | `this._rollHandler.roll(e,t)` (skills, saves) |
  | `rollWeapon` | `this._rollHandler.rollWeapon(e,t)` |
  | `useItem` | `this._rollHandler.useItem(e,t)` |
  | `castSpell` | `this._spellHandler.castSpell(e,t)` |
  | `toggleFavorHinder` | `VagabondActorSheet._onToggleFavorHinder.call(this,e,t)` |
  | `spendLuck` | `VagabondActorSheet._onSpendLuck.call(this,e,t)` |
  | `spendStudiedDie` | `VagabondActorSheet._onSpendStudiedDie.call(this,e,t)` |
  | `modifyCheckBonus` | `{ handler: …_onModifyCheckBonus.call, buttons:[0,2] }` |
  | `modifyMana` | `VagabondActorSheet._onModifyMana.call(this,e,t)` |
  | `openTab` | HUD-local: open/close panel, switch active tab |
  | `toggleTrait` / `toggleFeature` / `togglePerk` | HUD-local accordion toggle |
  | `useSlot` / `clearSlot` | quick-slot use/clear (only if slots enabled — see open Q2) |

  The static `VagabondActorSheet` resource methods only read/write `this.actor`, so
  `.call(this, …)` reuses them verbatim — zero duplication.

---

## 4. HBS template outline (structure only)

```
<div class="vbd-hud">                         ← single root
  <div class="vh-panel" data-state="closed">  ← tab content, ordered above/below via CSS
    <div class="vh-panel-content" data-tab="traits"> … Features / Traits / Perks accordions
    <div class="vh-panel-content" data-tab="skills">  … two-col skill rows (data-action=roll)
    <div class="vh-panel-content" data-tab="saves">   … 3 save cells (data-action=roll)
    <div class="vh-panel-content" data-tab="spells">  … spell rows (data-action=castSpell)
    <div class="vh-panel-content" data-tab="inventory"> … equipped items
  </div>
  <div class="vh-body">
    <div class="vh-grid">                       ← 95px / 52px / 1fr
      <div class="vh-portrait" [drag handle]>   <img actor.img>
      <div class="vh-vitals"> HP · Fatigue · Speed · Luck (each .vh-vital)
      <div class="vh-main">
        <div class="vh-name"> actor.name
        <div class="vh-controls"> studied-die · check-mod · favor/hinder toggle
        <div class="vh-slots"> 5 × .vh-slot  (drag-drop, optional per Q2)
      </div>
      <div class="vh-floating">                 ← position:absolute
        <div class="vh-weapons"> 2 × .vh-weapon circle
        <div class="vh-mana"> · <div class="vh-armor">
      </div>
    </div>
    <div class="vh-tabs"> 5 × button.vh-tab (data-action=openTab)
  </div>
</div>
```

---

## 5. Data flow & reactivity

`_prepareContext()` reads only already-prepared values off `this.actor.system` and
`this.actor.items` — mirroring how the sheet's `_prepareContext`/`_prepareItems` categorize:

- **Vitals/controls:** `health.value/max`, `fatigue`+`fatigueMax`, `speed.base`,
  `currentLuck`/`maxLuck`+`hasLuckPool`, `studiedDice`, `universalCheckBonus`, `favorHinder`,
  `mana.current/max/castingMax`, `armor`.
- **Skills/saves:** reuse the split — `regularSkills` (`!isWeaponSkill || showInSkillsList`)
  and `attackSkills` (`isWeaponSkill`); `system.saves`.
- **Items:** categorize `actor.items` → `weapons`, equipped gear/relics/alchemicals,
  `spells` (and favorited subset), `perks`; class `levelFeatures` (≤ level) → features,
  ancestry `traits` → traits. Same predicates the sheet uses.

**Reactivity (OngoingPanel pattern):** in `_onRender()` register hooks, each filtered to
this actor, calling a `foundry.utils.debounce(() => this.render(), 100)`:
`updateActor`, `createItem`, `updateItem`, `deleteItem`,
`createActiveEffect`, `updateActiveEffect`, `deleteActiveEffect`.
Stored in `#hookIds`, cleared in `close()`.

---

## 6. Drag-position persistence

- Frameless app → custom drag. A drag handle (portrait + name strip) gets a `pointerdown`
  listener (via the render `AbortController` signal). On `pointermove` call
  `this.setPosition({ left, top })`; on `pointerup` persist.
- Persist **per user**: `game.user.setFlag('vagabond', 'hudPosition', { top, left })`
  (debounced). On `_onRender()`, read the flag and `setPosition()` to restore.
- Panel above/below: at panel-open time, measure HUD `getBoundingClientRect()` vs
  `window.innerHeight`; add `.vh-panel--above` (CSS `order:-1`) or `.vh-panel--below`.

---

## 7. Exact system API surface reused (from source)

- `RollHandler.roll(event, target)` — reads `target.dataset.{roll,type,key,difficulty,label}`,
  uses `this.actor`. (`module/sheets/handlers/roll-handler.mjs:27`)
- `RollHandler.rollWeapon(event, target)` — `data-item-id`; `this.actor.items.get`. (:163)
- `RollHandler.useItem(event, target)` — `data-item-id` → `item.roll()`. (:378)
- `SpellHandler.castSpell(event, target)` — `data-spell-id`; honors `useSpellCastDialog`
  setting, opens `SpellCastDialog` or direct-casts. (`spell-handler.mjs:419`)
- `VagabondActorSheet._onToggleFavorHinder / _onSpendLuck / _onSpendStudiedDie /
  _onModifyCheckBonus / _onModifyMana` — `actor-sheet.mjs:1418/1470/1499/1528/1550`,
  all `this.actor`-only.

---

## 8. Foundry v14 hooks/APIs used

- `getSceneControlButtons` — add a `vagabond` group tool button (existing pattern,
  `vagabond.mjs:1126`).
- `ApplicationV2` frameless + `setPosition()` for placement; `HandlebarsApplicationMixin`.
- Reactivity hooks listed in §5 (all standard document CRUD hooks).
- `game.user.setFlag/getFlag('vagabond','hudPosition')` for per-user persistence.

---

## 9. Decisions (resolved)

1. **Target actor:** `game.user.character` if assigned, else the controlled token's actor.
   `static resolveActor()` does this; `toggle()`/scene button use it. Explicit-actor opens
   (sheet button, macro) pass the actor directly.
2. **Quick slots:** new drag-drop slots, **per-user**, keyed by actor:
   `game.user.flags.vagabond.hudSlots[actorId] = { items: [id×5], weapons: [id×2] }`.
   Slots accept drops from anywhere (incl. the open character sheet) via DragDrop `_onDrop`
   (payload `{type:'Item', uuid}`; only items belonging to this actor are accepted, else a
   warn). Left-click filled slot = use (cast/attack/use by item type); right-click = clear.
3. **Open methods (all of):**
   - **Token Controls button** — add a tool into the native `controls.tokens.tools` group
     (not the separate Vagabond group), toggling via `vagabond.toggleCharacterHud` hook.
   - **Macro / API** — `globalThis.vagabond.applications.VagabondCharacterHud` +
     `Hooks.callAll('vagabond.toggleCharacterHud')`.
   - **Sheet header "Become the HUD" button** — on the character sheet; closes the sheet
     and opens the HUD for that actor.
   - **Double-click HUD portrait** — opens the actor sheet **without** closing the HUD, so
     items can be dragged sheet → HUD slots.
4. **CSS:** shared base `.vbd-hud` + modifier `.vbd-hud--pc` (see §2). NPC HUD later reuses
   the base with `.vbd-hud--npc`.

---

## 10. To-do list (post-approval)

- [ ] Create `VagabondCharacterHud` class skeleton (DEFAULT_OPTIONS, PARTS, singleton toggle).
- [ ] Implement `_prepareContext` reusing sheet data shapes.
- [ ] Write `character-hud.hbs` (single root, all panels + body + floats + tabs).
- [ ] Wire `actions` map delegating to RollHandler/SpellHandler/sheet static methods.
- [ ] Implement panel open/close + above/below placement + accordion toggles.
- [ ] Implement custom drag + per-user position persistence.
- [ ] Implement reactivity hooks (filtered, debounced) + AbortController cleanup.
- [ ] Implement per-user drag-drop quick slots (`_onDrop`, use/clear, flag persistence).
- [ ] Double-click portrait → open sheet (keep HUD open).
- [ ] Write `_character-hud.scss` (`.vbd-hud` + `.vbd-hud--pc`); add `@import` to `vagabond.scss`.
- [ ] Register class + `globalThis.vagabond.applications`; Token-Controls tool button +
      `vagabond.toggleCharacterHud` hook in `vagabond.mjs`; preload HBS.
- [ ] Add character-sheet header "Become the HUD" button (closes sheet, opens HUD).
- [ ] Add `lang/en.json` keys.
- [ ] Manual test: rolls, casts, resource clicks, drag persistence, reactivity, panels.
```
