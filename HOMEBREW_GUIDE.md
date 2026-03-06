# Vagabond Homebrew System — Complete Guide

The Homebrew Settings app lets a GM customize almost every mechanical constant in the Vagabond system — stats, skills, saves, dice, leveling, derivations, damage types, and more — without editing any code. All settings are stored as a single JSON world setting (`homebrewConfig`) and loaded at init before DataModels register.

---

## Opening the App

**Game Settings → System Settings → Configure Homebrew**

GM-only. Opens a resizable dialog with a left sidebar of tabs and a save/reset footer.

---

## Change Types

| Type | Effect |
|------|--------|
| **Runtime** | Takes effect immediately after saving. No world reload needed. |
| **Requires Reload** | Affects DataModel schemas. Must reload the world for changes to apply. |

Tabs that require a reload show a reload badge in the sidebar. The active tab shows a reload notice if applicable.

---

## Tab 1 — Stats

**Requires reload.**

Defines the core stat list. Each row: `key | label | abbreviation`.

- **Key** — Internal identifier used in formulas, Active Effects, and compendium data (e.g., `might`). Changing or removing a key does NOT update existing documents — characters, classes, and perks that reference the old key will silently retain stale values.
- **Label** — Display name shown on sheets.
- **Abbreviation** — 3-letter short form shown in tight UI spaces (e.g., `MIT`).

**Defaults:** might, dexterity, awareness, reason, presence, luck

> **Warning:** Renaming stat keys is a breaking change. Only rename keys before content is created, or be prepared to manually correct all affected documents.

---

## Tab 2 — Skills & Saves

**Requires reload.**

### Skills

Each row: `key | label | stat (dropdown) | trained multiplier | Weapon Skill flag | Show in skills list flag | hint (subrow)`

- **Stat** — Which stat this skill scales from. The stat dropdown is populated from Tab 1.
- **Trained Multiplier** — How much the stat counts when trained. Default: 2. Can be fractional (0.5 steps).
- **WS** — Marks this as a Weapon Skill (appears in attack dropdowns on weapons).
- **SK** — Whether this skill appears in the regular skills list on the character sheet (weapon-only skills can be hidden from the general list).
- **Hint** — Tooltip text shown in the UI.

### Saves

Each row: `key | label | stat 1 | stat 2 | base value | check die | description (subrow)`

Save difficulty formula: `base − stat1.total − stat2.total − bonus`

- **Base Value** — Starting number for the save difficulty (each save has its own base, independent of the skill difficulty base from Tab 3).
- **Check Die** — Optional per-save die override (e.g., saves could roll `2d6` while skills roll `1d20`). Leave blank to use the global base check die from Tab 3.

**Default saves:**
- Reflex: DEX + AWR, base 20
- Endure: MIG + MIG, base 20
- Will: RSN + PRS, base 20

---

## Tab 3 — Dice

**Runtime.**

### Check Dice

| Field | Default | Description |
|-------|---------|-------------|
| Base Check | `1d20` | Die used for skill checks, attacks, and saves. |
| Favor Bonus | `1d6[favored]` | Extra die added when a roll has Favor. |
| Hinder Penalty | `1d6[hindered]` | Die subtracted when a roll is Hindered. |

### Skill Difficulty

| Field | Default | Description |
|-------|---------|-------------|
| Difficulty Base | `20` | The `@base` variable in the formula. Starting value before subtracting stat contribution and bonus. |
| Difficulty Formula | `@base - @stat * @mult - @bonus` | Full formula evaluated per skill. See variables below. |

#### Formula Variables

| Variable | Value |
|----------|-------|
| `@base` | The Difficulty Base number configured above |
| `@stat` | The skill's associated stat total for this actor |
| `@mult` | Trained or untrained multiplier (configured in Tab 9 — Advanced) |
| `@bonus` | Evaluated sum of any Active Effect bonuses on the skill |

Supported math functions: `floor()`, `ceil()`, `round()`, `max()`, `min()`, `abs()`

**Formula examples:**

```
@base - @stat * @mult - @bonus          ← default (roll-over, stat reduces difficulty)
10 + @stat * @mult + @bonus             ← ascending target number (stat raises it)
max(1, @base - @stat * @mult - @bonus)  ← clamp minimum difficulty to 1
@base - floor(@stat * @mult * 1.5)      ← steeper trained bonus
```

### Spell Damage *(in Tab 4 — Magic)*

The base damage die for spells (`d6` by default) lives in the Magic tab but is part of the `dice` config group.

### Check Probability

A live bell-curve visualizer showing the distribution of possible roll results for the configured base die. Updates when dice formulas change.

---

## Tab 4 — Magic

**Runtime.**

### Spell Damage

- **Base Damage Die** — Default spell damage die (e.g., `d6`, `d8`). Actor bonuses stack on top.

### Delivery Types

Configures the geometry and cost of each spell delivery system.

| Column | Description |
|--------|-------------|
| Key | Internal identifier (e.g., `cone`). Do not change keys on existing content. |
| Label | Display name. |
| Base Cost | Mana spent to cast at minimum size. |
| Range | Starting area in feet (or number of targets for Imbue/Remote). |
| Increment | Step size per size increase. |
| +Cost | Extra mana per size increase. |

Geometry metadata (unit type: foot/target, shape: radius/length/cube/etc.) is fixed per key and not user-configurable.

---

## Tab 5 — Leveling

**XP table and questionnaire: Runtime. Max Level: Requires reload.**

### General

- **Max Level** — Maximum level characters can reach. Requires reload. Default: 10.

### XP Per Level Table

Explicit per-level XP requirements. Edit values directly. The table always covers levels 2 through Max Level.

### XP Questionnaire

Questions asked at end-of-session to award XP. Each question has:
- **Text** — The question displayed to players.
- **XP** — How much XP is awarded if the player answers yes.

Questions can be added, removed, and reordered.

---

## Tab 6 — Derivations

**Runtime.**

Formula strings evaluated in `prepareDerivedData()` using actor roll data.

### Available roll data keys

```
@might.total          @dexterity.total      @awareness.total
@reason.total         @presence.total       @luck.total
@attributes.level.value
@speed.base           (available in crawl/travel formulas only)
```

| Field | Default | Notes |
|-------|---------|-------|
| Max Health | `@might.total` | Result × level = base max HP |
| Inventory Slots | `8 + @might.total` | Total base slots |
| Speed | `25 + floor(max(0, @dexterity.total - 2) / 2) * 5` | Movement in feet |
| Crawl Speed | `@speed.base * 3` | Can reference `@speed.base` |
| Travel Speed | `floor(@speed.base / 5)` | Can reference `@speed.base` |
| PC Max Fatigue | `5` | Max fatigue for player characters |
| NPC Max Fatigue | `5` | Max fatigue for NPCs |

### Stats Display

Controls how the stat grid is laid out on the character sheet:
- **Progression** — Top row is offset/indented, forming a cascade visual.
- **Centered** — Both rows evenly centered, no offset.

### Luck Pool

- **Luck Pool Stat** — Which stat determines the Luck pool size. Setting to *None* hides the pool entirely from the character sheet.
- **First Word / Second Word** — The two-part label shown on the pool widget (e.g., "Luck Pool", "Fate Points", "Fortune Tokens").

---

## Tab 7 — Damage Types

**Runtime.**

Add, remove, or rename damage types. Each row: `key | label | FA icon class`

- **Key** — Internal identifier used on items and chat cards. Do not change keys on existing content.
- **Label** — Display name.
- **FA Icon Class** — Font Awesome Free icon class (e.g., `fa-solid fa-fire`). A preview icon is shown live.

Material weakness types (Cold Iron, Silver) are separate from damage types and are not configurable here.

---

## Tab 8 — Stat Cap

**Requires reload.**

### Stat Cap

Maximum stat value reachable through level-up increases. Default: 7.

**Why 7:** The default skill difficulty formula is `20 − (stat × 2)`. At stat 7 (trained): `20 − 14 = 6`. On a d20 roll-over, difficulty 6 means a 75% success rate — a meaningful but beatable challenge. At stat 9: difficulty 2 (95% chance) — essentially trivial. The cap is intentional game design.

> If you change the difficulty formula (Tab 3), you may want to adjust the stat cap accordingly to maintain meaningful difficulty scaling.

### Character Builder Stat Arrays

Each row is one stat array offered in the character builder. Values are assigned to stats left-to-right in the order defined in Tab 1. The row index is also the result of a 1d12 random roll (row 1 = roll 1, etc.).

Add rows to offer more array options. Remove rows to restrict choices. All values should respect the configured Stat Cap.

---

## Tab 9 — Advanced

**Runtime.**

### Skill Multipliers

Controls the `@mult` variable used in the Skill Difficulty formula (Tab 3).

| Field | Default | Description |
|-------|---------|-------------|
| Trained | `2` | Multiplier when skill is trained |
| Untrained | `1` | Multiplier when skill is untrained |

The full formula is: `@base − (@stat × @mult) − @bonus`

At defaults with stat 5 trained: `20 − (5 × 2) − 0 = 10`
At defaults with stat 5 untrained: `20 − (5 × 1) − 0 = 15`

---

## Tab 10 — Terms

**Runtime.**

Rename display labels throughout the sheets without changing any keys or formulas. Leave a field blank to keep the original label.

| Group | Fields |
|-------|--------|
| General | Inventory (tab and section) |
| Spellcasting | Magic (tab), Spells (tab), Mana, Max Mana, Mana/Cast, Casting Skill |
| Luck Pool | First Word, Second Word (also in Tab 6 Derivations) |
| Currency | Wealth (section), Gold, Silver, Copper |

**Examples:**
- Rename "Magic" → "Arcane" to change the tab name system-wide.
- Rename "Luck" + "Pool" → "Fate" + "Points" for the luck widget.
- Rename "Gold" → "Credits" for a sci-fi campaign.

---

## Tab 11 — Library

**Runtime.**

Save, switch, share, and import named homebrew configurations.

### How It Works

The Library stores individual JSON files in `assets/vagabond/homebrew/` inside your Foundry data folder. Each entry is one file. The currently active entry is tracked by ID in the world setting.

### Saving a Configuration

1. Make your changes across any tabs.
2. Go to the Library tab.
3. Click **Save Current Config to Library…**
4. Enter a name and confirm.

### Activating an Entry

Click the play button next to any library entry to load and apply it immediately. The active entry is marked with a checkmark. If you've made changes since activating, it shows a **modified** badge.

### Updating an Entry

If you've modified a configuration since activating it, the play button is replaced with a **save** (floppy disk) button. Click it to write your current changes back to that library entry.

### Export / Import

- **Export** — Downloads the selected library entry as a `.json` file.
- **Import** — Opens a file picker to load a `.json` file exported from another world. The imported config is merged into the current session for review before saving.

### Deleting an Entry

Click the trash icon. The file is marked as deleted (tombstone `{ deleted: true }`) rather than physically removed, so it won't reappear after a re-scan.

---

## Footer Actions

| Button | Action |
|--------|--------|
| Reset Tab | Resets only the currently visible tab to factory defaults. |
| Save | Saves all tabs and applies runtime changes immediately. |
| Save & Close | Saves and closes the dialog. |
| Cancel | Closes without saving. |

If any tab has broken settings (e.g., a skill references a stat key that no longer exists), a warning banner appears and affected tabs show an error badge in the sidebar.

---

## Migration Policy

**There is no auto-migration.** If you rename or remove a stat/skill/save key:
- Existing actor documents that reference the old key will silently retain stale values.
- Classes, perks, and ancestry items that reference the old key will need manual correction.
- Active Effects using the old key will stop functioning.

**Best practice:** Set up your homebrew configuration before creating world content, or treat key changes as a hard reset for affected documents.

---

## Developer Reference

### Key Files

| File | Purpose |
|------|---------|
| `module/helpers/homebrew-config.mjs` | `VAGABOND_HOMEBREW_DEFAULTS`, `loadHomebrewConfig()`, `applyRuntimeHomebrewOverrides()`, `applyTermOverrides()` |
| `module/applications/homebrew-settings-app.mjs` | ApplicationV2 dialog — all tab logic, actions, serialization |
| `templates/apps/homebrew-settings.hbs` | Full dialog template (11 tabs) |
| `src/scss/apps/_homebrew-settings.scss` | Homebrew dialog styles |

### Config Shape

```js
CONFIG.VAGABOND.homebrew = {
  stats:      [{ key, label, abbreviation }],
  skills:     [{ key, label, hint, stat, trainedMultiplier, isWeaponSkill, showInSkillsList }],
  saves:      [{ key, label, description, checkDie, stat1, stat2, baseValue }],
  dice: {
    baseCheck,           // '1d20'
    favorBonus,          // '1d6[favored]'
    hinderPenalty,       // '1d6[hindered]'
    spellBaseDamage,     // 'd6'
    skillDifficultyBase, // 20
    skillFormula,        // '@base - @stat * @mult - @bonus'
  },
  leveling: {
    maxLevel,            // 10
    xpTable:    [{ level, xp }],
    xpQuestions:[{ question, xp }],
  },
  derivations: {
    hp, inventory, speed, crawl, travel,
    fatiguePCMax, fatigueNPCMax,
    luckStat, statsLayout,
  },
  damageTypes: [{ key, label, icon }],
  statCap,               // 7
  statArrays:  [[...values]],
  magic: {
    deliveryTypes: [{ key, label, baseCost, increaseCost, baseRange, increment }],
  },
  multipliers: { trained, untrained },
  terms:       { inventory, magic, mana, maxMana, manaPerCast, castingSkill, spells, luckTerm, poolTerm, wealth, gold, silver, copper },
};
```

### Load Sequence

```
init hook
  └── loadHomebrewConfig()           reads world setting, merges with defaults
        └── applyRuntimeHomebrewOverrides()   writes to CONFIG.VAGABOND.*
  └── registerDataModels()           schemas now see homebrew config
  └── registerGameSettings()

i18nInit hook
  └── applyTermOverrides()           patches game.i18n.translations
```

`applyRuntimeHomebrewOverrides()` is also called after every save so runtime changes take effect without reload.

### Skill Difficulty Calculation

In `module/data/actor-character.mjs` `prepareDerivedData()`:

```js
const trainedMult         = CONFIG.VAGABOND?.homebrew?.multipliers?.trained         ?? 2;
const untrainedMult       = CONFIG.VAGABOND?.homebrew?.multipliers?.untrained       ?? 1;
const skillDifficultyBase = CONFIG.VAGABOND?.homebrew?.dice?.skillDifficultyBase    ?? 20;
const skillFormula        = CONFIG.VAGABOND?.homebrew?.dice?.skillFormula           ?? '@base - @stat * @mult - @bonus';

// Per skill:
const mult     = skill.trained ? trainedMult : untrainedMult;
const resolved = skillFormula
  .replace(/@base/g,  skillDifficultyBase)
  .replace(/@stat/g,  statValue)
  .replace(/@mult/g,  mult)
  .replace(/@bonus/g, skillBonus);
skill.difficulty = Roll.safeEval(resolved);
```

The same pattern is used in the fallback path in `module/applications/perk-choice-dialog.mjs`.

### Adding a New Configurable Field

1. Add the field with its default to `VAGABOND_HOMEBREW_DEFAULTS` in `homebrew-config.mjs`.
2. If it needs a `CONFIG.VAGABOND.*` entry, add it to `applyRuntimeHomebrewOverrides()`.
3. If it's a term, add it to `applyTermOverrides()`.
4. Add the input to the appropriate tab in `homebrew-settings.hbs` using `data-field="path.to.field"`.
5. Read it at use-time via `CONFIG.VAGABOND?.homebrew?.path?.to?.field ?? defaultValue`.

The `data-field` attribute is picked up automatically by the form serialization in `HomebrewSettingsApp.#onSubmit` via `foundry.utils.expandObject(formData.object)`.
