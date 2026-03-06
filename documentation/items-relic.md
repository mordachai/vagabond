# Vagabond — AI Item Creation Guide: Relics

Use this document to prompt an AI assistant to generate relic items for the Vagabond Foundry VTT system. Relics are powerful, magical artifacts — unique items with special lore, often requiring binding before use.

---

## What Makes Relics Different

- **No metal multiplier** — relics ignore the metal type for cost and slot calculations
- **Have lore text** — a dedicated `lore` field for historical/mystical background
- **Often require binding** — `requiresBound: true` means the character must bind it before use
- **May have Active Effects** — relics frequently have attached Active Effects for their magical properties
- **No armor stats** — relics don't use `armorType` or `immunities` (ignored)

---

## Complete JSON Model

```json
{
  "name": "Amulet of the Wandering Star",
  "type": "equipment",
  "img": "icons/equipment/neck/amulet-gem-blue-star.webp",
  "system": {
    "description": "<p>A silver amulet set with a gem that glows faintly blue under starlight. When bound, it grants the wearer uncanny awareness of their surroundings.</p><p><strong>Bound Effect:</strong> +1 to Awareness checks. Once per day, the wearer may reroll a failed Detect check.</p>",
    "equipmentType": "relic",
    "locked": false,
    "equipped": false,
    "quantity": 1,
    "baseCost": {
      "gold": 20,
      "silver": 0,
      "copper": 0
    },
    "requiresBound": true,
    "bound": false,
    "baseSlots": 1,
    "gridPosition": 0,
    "containerId": null,
    "metal": "none",
    "damageType": "-",
    "damageAmount": "",
    "canExplode": false,
    "explodeValues": "",
    "properties": [],
    "weaponSkill": "melee",
    "range": "close",
    "grip": "1H",
    "damageOneHand": "d6",
    "damageTypeOneHand": "-",
    "damageTwoHands": "d8",
    "damageTypeTwoHands": "-",
    "equipmentState": "unequipped",
    "armorType": "light",
    "immunities": [],
    "gearCategory": "",
    "isSupply": false,
    "isBeverage": false,
    "isConsumable": false,
    "linkedConsumable": "",
    "alchemicalType": "concoction",
    "lore": "Forged by a blind astrologer who could see the future in starlight, this amulet was passed down through three generations of wanderers before being lost in the Ashwood Collapse.",
    "itemFx": {
      "enabled": false,
      "animType": "auto",
      "hitFile": "",
      "hitScale": 1.0,
      "hitOffsetX": 0,
      "hitDuration": 800,
      "hitSound": "",
      "missFile": "",
      "missScale": 1.0,
      "missDuration": 600,
      "missSound": "",
      "soundVolume": 0.6
    }
  }
}
```

---

## Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Display name |
| `img` | string | Icon path |
| `description` | HTML string | Effect, rules text (what the item does when equipped/used) |
| `lore` | string | Historical/mystical background (plain text or HTML) |
| `equipmentType` | string | Always `"relic"` |
| `locked` | boolean | Read-only display toggle |
| `quantity` | integer ≥ 0 | Usually 1 for unique relics |
| `baseCost.gold/silver/copper` | integer ≥ 0 | Value in currency |
| `baseSlots` | integer | Inventory slots used (metal modifier does NOT apply to relics) |
| `requiresBound` | boolean | Must bind before the effect activates |
| `bound` | boolean | Currently bound to a character |
| `damageType` | string | If the relic deals damage, set here |
| `damageAmount` | string | Damage formula if used as a weapon |
| `metal` | string | Cosmetic only for relics — set to `"none"` typically |
| `isConsumable` | boolean | True if single-use |

---

## Active Effects for Relics

Relics frequently use Active Effects for their mechanical bonuses. These are attached to the item in Foundry as separate `effects` entries, not in `system`. When importing JSON into Foundry, you can add Active Effects afterward through the sheet.

**Common relic Active Effect patterns:**
- `system.stats.awareness.bonus` ADD `1` → +1 to Awareness
- `system.bonuses.hpPerLevel` ADD `2` → +2 HP per level
- `system.critNumber` OVERRIDE `19` → Crits on 19–20
- `system.skills.detect.trained` OVERRIDE `true` → Always trained in Detect

**Application mode for relics:** Use `whenEquipped` (effect only applies while the relic is in an equipped state) or `permanent` (always on once bound).

---

## Quick Examples

### Ring of Iron Skin (passive defense)
```json
{
  "name": "Ring of Iron Skin",
  "type": "equipment",
  "img": "icons/equipment/finger/ring-band-engraved-gold.webp",
  "system": {
    "description": "<p>A plain iron ring that somehow shrugs off blows that should leave bruises.</p><p><strong>Bound Effect:</strong> +1 Armor Rating (Active Effect — always on).</p>",
    "equipmentType": "relic",
    "locked": false, "equipped": false, "quantity": 1,
    "baseCost": { "gold": 15, "silver": 0, "copper": 0 },
    "requiresBound": true, "bound": false,
    "baseSlots": 1, "gridPosition": 0, "containerId": null,
    "metal": "none",
    "damageType": "-", "damageAmount": "", "canExplode": false, "explodeValues": "",
    "properties": [],
    "weaponSkill": "melee", "range": "close", "grip": "1H",
    "damageOneHand": "d6", "damageTypeOneHand": "-",
    "damageTwoHands": "d8", "damageTypeTwoHands": "-",
    "equipmentState": "unequipped",
    "armorType": "light", "immunities": [],
    "gearCategory": "", "isSupply": false, "isBeverage": false,
    "isConsumable": false, "linkedConsumable": "",
    "alchemicalType": "concoction",
    "lore": "Cast from iron pulled from the heart of a defeated golem. The smith who made it never felt pain again after the forging.",
    "itemFx": { "enabled": false, "animType": "auto", "hitFile": "", "hitScale": 1.0, "hitOffsetX": 0, "hitDuration": 800, "hitSound": "", "missFile": "", "missScale": 1.0, "missDuration": 600, "missSound": "", "soundVolume": 0.6 }
  }
}
```

### Consuming Gem (single-use, healing)
```json
{
  "name": "Lifegem",
  "type": "equipment",
  "img": "icons/commodities/gems/gem-faceted-red-large.webp",
  "system": {
    "description": "<p>A deep red gem that pulses like a heartbeat. Crush it to release stored life energy.</p><p><strong>On Use:</strong> Restore 3d6 HP. The gem is destroyed.</p>",
    "equipmentType": "relic",
    "locked": false, "equipped": false, "quantity": 1,
    "baseCost": { "gold": 30, "silver": 0, "copper": 0 },
    "requiresBound": false, "bound": false,
    "baseSlots": 1, "gridPosition": 0, "containerId": null,
    "metal": "none",
    "damageType": "healing", "damageAmount": "3d6", "canExplode": false, "explodeValues": "",
    "properties": [],
    "weaponSkill": "melee", "range": "close", "grip": "1H",
    "damageOneHand": "3d6", "damageTypeOneHand": "healing",
    "damageTwoHands": "3d6", "damageTypeTwoHands": "healing",
    "equipmentState": "unequipped",
    "armorType": "light", "immunities": [],
    "gearCategory": "", "isSupply": false, "isBeverage": false,
    "isConsumable": true, "linkedConsumable": "",
    "alchemicalType": "concoction",
    "lore": "Lifegems grow in ancient ruins where heroes fell in battle. They absorb the lingering vitality of the dead and hold it until needed.",
    "itemFx": { "enabled": false, "animType": "auto", "hitFile": "", "hitScale": 1.0, "hitOffsetX": 0, "hitDuration": 800, "hitSound": "", "missFile": "", "missScale": 1.0, "missDuration": 600, "missSound": "", "soundVolume": 0.6 }
  }
}
```

---

## AI Prompt Template

```
You are creating a relic item for the Vagabond tabletop RPG system in Foundry VTT.

Relics are magical artifacts with lore, special effects, and often require binding.

Output a valid JSON object matching the structure below exactly. Only change the values I specify.

Relic details:
- Name: [NAME]
- Description (rules/effect): [WHAT IT DOES — HTML OK]
- Lore (backstory): [HISTORY / FLAVOR TEXT — plain text]
- Requires Binding: [yes / no]
- Cost: [X gold, Y silver, Z copper]
- Slots: [integer]
- Single-use (consumable): [yes / no]
- Deals damage: [yes/no — if yes: formula and type]
- Active Effects (describe the mechanical bonus, to be added manually in Foundry)

Use the full JSON template from the Vagabond relic documentation. Set equipmentType to "relic".
```
