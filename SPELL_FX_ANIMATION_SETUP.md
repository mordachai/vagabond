# Spell FX Animation Setup Guide

How to configure Sequencer animations for Vagabond spells using JB2A assets.

**Prerequisites:** Sequencer module installed and enabled, JB2A (free or Patreon) installed and enabled.

---

## Quick Orientation

When a spell is cast, Vagabond plays up to two animations per school:

1. **Cast Animation** — plays briefly on the caster token the moment the spell is cast
2. **Area Animation** — plays at the delivery location after the cast (e.g. a sphere at the target, a cone from the caster, a beam to the target)

Both are configured per **FX school** (fire, cold, shock, etc.). Each spell can either inherit its school automatically from its damage type, or have a school set explicitly on the spell's item sheet.

---

## Opening the Panel

**Game Settings → System Settings → Spell FX Animations (Configure Animations)**

The panel is GM-only. It looks like this:

![Configure Animations Panel](docs/Configure%20Animations%20Panel.png)

- **Left column:** school selector — click a school to switch to it
- **Right column:** three sections for the active school — Cast Animation, Sound, and Area Animations table

---

## Finding JB2A File Paths

Every file field has a browse button (film icon for video, music icon for audio). Click it to open the FilePicker.

**JB2A folder structure:**

| Version | Root path |
|---------|-----------|
| Free (JB2A_DnD5e) | `modules/JB2A_DnD5e/Library/` |
| Patreon (jb2a_patreon) | `modules/jb2a_patreon/Library/` |

Inside `Library/` the folders are organized by spell level and by `Generic/`. The `Generic/` subfolder is the most useful — it contains reusable effects not tied to a specific spell:

```
Generic/
  Explosion/
  Fireball/
  Ice_and_Snow/
  Lightning_Strike/
  Healing/
  Poison/
  Darkness/
  Magic_Signs/
  Auras/
  Cone_Attack/
  Energy_Beam/
  Smoke_and_Fog/
  Projectiles/
  Template_Circle/
  Template_Cone/
  Template_Line/
  ...
```

**Tip:** Use the FilePicker's search / folder browsing to find the right webm file, then copy the path it shows. JB2A files typically end in a color variant and a frame number, e.g. `Fireball_01_Regular_Orange_400x400.webm`.

---

## Field Reference

### Cast Animation

| Field | What it does | Guidance |
|-------|-------------|----------|
| **File** | Path to a `.webm` played on the caster token | Pick something that looks like "casting energy" — a glow, charge-up, or surge. Leave blank to skip. |
| **Scale** | Multiplier for the animation's display size | `1.0` = native pixel size. A 400×400px animation on a standard 100px grid token needs about `0.25` to fit the token. `1.5` works for large glows. |
| **Duration (ms)** | How long the cast animation plays before the area animation starts | `600` is a good default. The area animation starts 200ms before this finishes (overlap for smoothness). |

### Sound

| Field | What it does | Guidance |
|-------|-------------|----------|
| **Cast Sound** | Audio file (`.ogg`, `.mp3`, `.wav`) played at cast moment | Optional. JB2A Patreon includes matched sounds in `Audio/` subfolders. |
| **Impact Sound** | Audio played at the delivery location | Not currently wired into the sequencer logic — reserved for future use. |
| **Volume** | Playback volume 0–1 | `0.6` is a reasonable default. |

> **Note:** Sounds are not yet implemented in the sequencer playback code. The fields are stored and will be used once sound support is added.

### Area Animations

One row per delivery type. Each row has:

| Field | What it does | Guidance |
|-------|-------------|----------|
| **File** | Path to the area `.webm` | Leave blank to skip that delivery type. |
| **Native Px** | The pixel width/height of the source animation at 1.0 scale | Check the filename — JB2A often puts dimensions in the name (e.g. `_400x400`, `_800x800`). Use whichever dimension is largest. |
| **Scale Mode** | How the animation is sized relative to the spell's distance/area | See table below. |
| **Duration (ms)** | How long the area animation plays | Match approximately to the animation's natural loop length. |

**Scale Mode explained:**

| Mode | When to use | How it scales |
|------|------------|---------------|
| **Radius** | Sphere, Aura — `distFt` is a radius | display size = `distFt × 2 × pxPerFt ÷ nativePx` (full diameter) |
| **Length** | Cone, Line — `distFt` is a length | display size = `distFt × pxPerFt ÷ nativePx` |
| **Diameter** | Cube — `distFt` is a side length | display size = `distFt × pxPerFt ÷ nativePx` |
| **Fixed** | Touch, Imbue, Remote, Glyph — small local effects | always plays at scale `1.0` regardless of spell distance |

**Practical rule of thumb:** If the animation is a circle or explosion that should grow with the spell's area, use **Radius**. If it's a directed beam or cone, use **Length**. If it's a small on-token effect, use **Fixed**.

---

## Recommended JB2A Animations by School

These are starting points. Browse the FilePicker to find color variants and alternatives that suit your table's aesthetic. All paths assume JB2A Patreon (`jb2a_patreon`); replace with `JB2A_DnD5e` for the free version.

### Fire

| Slot | Suggested path fragment | Notes |
|------|------------------------|-------|
| Cast | `Generic/Fireball/Fireball_01_Regular_Orange_400x400.webm` | Charge-up burst |
| Sphere | `Generic/Fireball/Fireball_01_Regular_Orange_400x400.webm` | Explosion at target centroid |
| Cone | `Generic/Cone_Attack/ConeAttack_*.webm` | Directed fire cone from caster |
| Line | `Generic/Energy_Beam/EnergyBeam_*.webm` | Beam stretched to first target |
| Aura | `Generic/Auras/Aura_*.webm` | Ring around caster, radius mode |
| Touch | `Generic/Fireball/Fireball_01_Regular_Orange_400x400.webm` | Small fixed-size impact per target |

Scale: `1.5` for cast. Native Px: `400` for the Fireball animation.

### Cold

| Slot | Suggested path fragment | Notes |
|------|------------------------|-------|
| Cast | `Generic/Ice_and_Snow/IceAndSnow_*_Blue_*.webm` | Ice crystal burst |
| Sphere | `Generic/Ice_and_Snow/IceAndSnow_*_Blue_*.webm` | |
| Cone | `Generic/Cone_Attack/ConeAttack_*_Blue_*.webm` | |
| Line | `Generic/Energy_Beam/EnergyBeam_*_Blue_*.webm` | |

### Shock

| Slot | Suggested path fragment | Notes |
|------|------------------------|-------|
| Cast | `Generic/Lightning_Strike/LightningStrike_*_Blue_*.webm` | |
| Sphere | `Generic/Explosion/Explosion_*_Blue_*.webm` | |
| Line | `Generic/Energy_Beam/EnergyBeam_*_Blue_*.webm` | Beam stretched to target |

### Healing

| Slot | Suggested path fragment | Notes |
|------|------------------------|-------|
| Cast | `Generic/Healing/HealingAbility_*_Green_*.webm` | |
| Touch | `Generic/Healing/HealingAbility_*_Green_*.webm` | Fixed size, plays on each target |
| Imbue | `Generic/Auras/Aura_*_Green_*.webm` | Buff glow on target |
| Sphere | `Generic/Circles_of_Power/CirclesOfPower_*_Green_*.webm` | |

### Necrotic / Shadow

| Slot | Suggested path fragment | Notes |
|------|------------------------|-------|
| Cast | `Generic/Darkness/Darkness_*.webm` | |
| Sphere | `Generic/Explosion/Explosion_*_Dark_*.webm` | |
| Touch | `Generic/Magic_Signs/MagicSign_*_Dark_*.webm` | |

### Arcane (default fallback)

Since `arcane` is used when no school matches, pick versatile neutral-colored effects:

| Slot | Suggested path fragment |
|------|------------------------|
| Cast | `Generic/Magic_Signs/MagicSign_*_Blue_*.webm` |
| Sphere | `Generic/Circles_of_Power/CirclesOfPower_*_Blue_*.webm` |
| Touch | `Generic/Magic_Signs/MagicSign_*_Blue_*.webm` |

---

## Step-by-Step: Configuring Your First School

1. Open **Game Settings → System Settings → Configure Animations**
2. Click **Fire** in the left school nav
3. In **Cast Animation → File**, click the film icon browse button
4. In the FilePicker, navigate to `modules/jb2a_patreon/Library/Generic/Fireball/`
5. Select a `.webm` file (e.g. `Fireball_01_Regular_Orange_400x400.webm`)
6. Set **Scale** to `0.5` (the 400px animation at half scale fits a medium token)
7. Set **Duration** to `600`
8. In the **Area Animations** table, find the **Sphere** row
9. Click its film icon, pick the same Fireball webm
10. Set **Native Px** to `400`, **Scale Mode** to `Radius`, **Duration** to `1200`
11. Click **Save** — you'll see a "Spell FX configuration saved." notification
12. Cast a fire spell targeting a token — the cast animation plays on the caster, then the sphere plays at the targets

---

## Tips

**Start with just one school and one delivery type.** Get the scale looking right before filling in every row. Cast a test spell repeatedly and adjust Scale and Native Px until the explosion size matches the spell's area.

**`nativePx` is the key to correct sizing.** If a fireball at 10ft radius looks tiny, increase nativePx (makes the denominator larger → smaller scale). If it looks huge, decrease nativePx. The filename usually tells you: `_400x400` means 400.

**Scale Mode Fixed for everything on-token.** Touch, Imbue, and Remote all play directly on a token. Fixed means the animation always plays at its native size (scaled to 1.0), which is usually correct. Don't try to scale these by distance.

**Leave File blank to skip.** If you don't have a good animation for Cone or Line yet, leave the file blank — no animation plays and nothing breaks.

**Reset to Defaults** clears the world setting entirely and falls back to the empty defaults in `sequencer-config.mjs`. Use this if something goes wrong.

**Check which module ID your JB2A uses.** Open the FilePicker browse from any field and look at the top-level module folder name. It is either `JB2A_DnD5e` (free) or `jb2a_patreon` (Patreon). The paths are otherwise identical.

**Per-spell school override.** Individual spells can override their school on the spell item sheet → Details tab → "FX School" dropdown. Set it to "Auto" to derive from damage type, or pick a specific school to force a particular set of animations regardless of the damage type.

---

## Troubleshooting

**No animation plays at all**
- Check that Sequencer is enabled in Manage Modules
- Check that the client setting "Spell Visual Effects (Sequencer)" is ON (Game Settings → System Settings)
- Open the browser console (F12) and look for errors from Vagabond or Sequencer

**Animation plays but is the wrong size**
- Adjust **Native Px** to match the actual pixel dimensions of the webm file
- For radius/length modes, check that **Scale Mode** matches the delivery geometry

**Cast animation plays but area animation doesn't**
- Make sure the **File** field in the matching Area Animations row is not empty
- Check that the delivery type the spell is using matches the row (e.g. if the spell uses "sphere", the Sphere row needs a file)

**FilePicker shows no JB2A files**
- Confirm JB2A is enabled in Manage Modules for this world
- Try browsing to `modules/` manually to confirm the folder exists
