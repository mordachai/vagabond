# Vagabond — AI Item Creation Guide: Spells

Use this document to prompt an AI assistant to generate spell items for the Vagabond Foundry VTT system. Spells are cast using the character's mana pool and can be scaled by adjusting their delivery type.

---

## How to Use

Tell the AI:

> "Create a Vagabond spell named [NAME]. It is delivered as a [delivery type]. It deals [damage type] damage. Duration: [duration]. Write flavor text and mechanical description."

---

## Valid Values

| Field | Valid Options |
|-------|--------------|
| `damageType` | `acid`, `fire`, `shock`, `poison`, `cold`, `blunt`, `piercing`, `slashing`, `physical`, `necrotic`, `psychic`, `magical`, `healing`, `recover`, `recharge`, `-` |
| `duration` | Free-form string: `"Instant"`, `"Until your next turn"`, `"1 minute"`, `"Until dispelled"`, etc. |
| `damageDieSize` | Integer: `4`, `6`, `8`, `10`, `12`, `20` — or `null` to use character's base die |
| `fxSchool` | Free-form string for animation override: `"fire"`, `"cold"`, `"shock"`, `"acid"`, `"necrotic"`, `"healing"`, or `""` to auto-derive from damage type |
| `noRollRequired` | `true` = bypass casting check (always succeeds, no crits) |
| `canExplode` | `true` = damage dice can explode |
| `explodeValues` | Comma-separated trigger values: `"1"`, `"1,2"` |

### Delivery Types (set via spell sheet, not in JSON)

The delivery type is configured on the spell sheet in Foundry (not stored in the spell JSON directly). For reference:

| Key | Shape | Base Range | Description |
|-----|-------|------------|-------------|
| `touch` | Single target | Melee | Requires physical contact |
| `remote` | Single target | Any | Ranged single-target |
| `imbue` | 1 target | Contact | Enchant a weapon/item |
| `aura` | Radius | 10 ft | Centered on caster |
| `sphere` | Radius | 5 ft | Placed sphere |
| `cone` | Cone | 15 ft | Directional cone |
| `line` | Line | 30 ft | Narrow beam |
| `cube` | Cube | 5 ft | Area cube |
| `glyph` | Square | 5 ft | Placed trap/mark |

---

## Complete JSON Model

```json
{
  "name": "Searing Ray",
  "type": "spell",
  "img": "icons/magic/fire/beam-jet-stream-embers.webp",
  "system": {
    "description": "<p>You launch a crackling bolt of condensed fire at a target you can see.</p><p><strong>Scaling:</strong> For each additional mana spent, deal +1 damage die.</p><p><strong>Crit:</strong> The target catches fire (burning condition).</p>",
    "damageType": "fire",
    "duration": "Instant",
    "crit": "Target catches fire (burning condition).",
    "favorite": false,
    "canExplode": false,
    "explodeValues": "",
    "damageDieSize": null,
    "noRollRequired": false,
    "locked": false,
    "fxSchool": "fire"
  }
}
```

---

## Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Spell name |
| `img` | string | Icon path |
| `description` | HTML string | Flavor text, effect description, scaling rules |
| `damageType` | string | Type of damage or healing |
| `duration` | string | How long the effect lasts |
| `crit` | string | What happens on a critical success (leave blank if none) |
| `favorite` | boolean | Player has favorited this spell (shows in sliding panel) |
| `canExplode` | boolean | Damage dice can explode |
| `explodeValues` | string | Comma-separated explode trigger values |
| `damageDieSize` | integer or null | Override die size for this spell; null = use character default |
| `noRollRequired` | boolean | Bypasses casting check — always succeeds, no crits |
| `locked` | boolean | Read-only display mode |
| `fxSchool` | string | Sequencer animation school override; blank = auto from damage type |

---

## Heal vs. Damage vs. Utility

### Damage Spell
- Set `damageType` to a damage type (`fire`, `cold`, etc.)
- Write the number of dice in the description (e.g., "deals 2 damage dice")
- The actual die size comes from the character's spellDamageDieSize stat
- Use `damageDieSize` only to override for this specific spell

### Healing Spell
- Set `damageType` to `"healing"` (restores HP) or `"recover"` (restores other resource)
- `noRollRequired: true` is common for utility healing spells

### Utility / No Damage Spell
- Set `damageType` to `"-"`
- Describe the effect fully in `description`
- Consider `noRollRequired: true` for automatic effects

---

## Quick Examples

### Frost Bolt (damage, instant)
```json
{
  "name": "Frost Bolt",
  "type": "spell",
  "img": "icons/magic/water/ice-bolt-blue.webp",
  "system": {
    "description": "<p>A shard of magical ice launched at a single target.</p><p><strong>Hit:</strong> Deal 1 damage die cold damage.</p><p><strong>Scaling:</strong> Spend 1 more mana to deal +1 damage die.</p>",
    "damageType": "cold",
    "duration": "Instant",
    "crit": "Target is Slowed (Speed halved) until end of their next turn.",
    "favorite": false,
    "canExplode": false,
    "explodeValues": "",
    "damageDieSize": null,
    "noRollRequired": false,
    "locked": false,
    "fxSchool": "cold"
  }
}
```

### Mending Touch (healing, no roll)
```json
{
  "name": "Mending Touch",
  "type": "spell",
  "img": "icons/magic/life/heart-cross-green.webp",
  "system": {
    "description": "<p>You lay a hand on a willing creature and channel healing energy through it.</p><p><strong>Effect:</strong> The target regains 1 damage die worth of HP.</p><p><strong>Scaling:</strong> Spend 1 additional mana to restore +1 damage die.</p>",
    "damageType": "healing",
    "duration": "Instant",
    "crit": "",
    "favorite": false,
    "canExplode": false,
    "explodeValues": "",
    "damageDieSize": null,
    "noRollRequired": true,
    "locked": false,
    "fxSchool": "healing"
  }
}
```

### Veil of Shadows (utility, sustained)
```json
{
  "name": "Veil of Shadows",
  "type": "spell",
  "img": "icons/magic/perception/eye-shadow-single-purple.webp",
  "system": {
    "description": "<p>You draw shadows around yourself, becoming difficult to see.</p><p><strong>Effect:</strong> You gain the Invisible condition until the start of your next turn.</p><p><strong>Focus:</strong> Pay 1 mana at the start of each of your turns to sustain the effect.</p>",
    "damageType": "-",
    "duration": "Until your next turn (Focus to extend)",
    "crit": "Duration extends to 1 minute without further Focus cost.",
    "favorite": false,
    "canExplode": false,
    "explodeValues": "",
    "damageDieSize": null,
    "noRollRequired": false,
    "locked": false,
    "fxSchool": ""
  }
}
```

---

## AI Prompt Template

```
You are creating a spell item for the Vagabond tabletop RPG system in Foundry VTT.

Output a valid JSON object matching the structure below exactly. Only change the values I specify.

Spell details:
- Name: [NAME]
- Description: [FLAVOR TEXT + MECHANICAL EFFECT + SCALING RULES — HTML OK]
- Damage Type: [acid / fire / shock / poison / cold / blunt / piercing / slashing / physical / necrotic / psychic / magical / healing / recover / recharge / - (none)]
- Duration: [Instant / Until your next turn / 1 minute / Until dispelled / etc.]
- Crit Effect: [What happens on critical success, or blank]
- No Roll Required: [yes / no]
- Die Size Override: [number (4–20) or "none" to use character default]
- Exploding Dice: [yes/no; if yes, which values]
- FX School: [fire / cold / shock / acid / necrotic / healing / blank for auto]

Use the full JSON template from the Vagabond spell documentation.
Note: Delivery type (touch, remote, sphere, cone, etc.) is configured in Foundry's spell sheet — do not put it in the JSON.
```
