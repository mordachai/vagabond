# Vagabond — AI Item Creation Guide: Armor

Use this document to prompt an AI assistant to generate armor items for the Vagabond Foundry VTT system.

---

## How to Use

Tell the AI:

> "Create a Vagabond armor item named [NAME]. It is [light/medium/heavy] armor made of [metal]. It costs [price]. Write a short description."

---

## Valid Values

| Field | Valid Options |
|-------|--------------|
| `armorType` | `light` (Rating 1, Might 3 req, 2 slots), `medium` (Rating 2, Might 4 req, 2 slots), `heavy` (Rating 3, Might 5 req, 3 slots) |
| `metal` | `none`, `common`, `adamant`, `coldIron`, `silver`, `mythral`, `orichalcum` |
| `immunities` | Array of damage type strings: `acid`, `fire`, `shock`, `poison`, `cold`, `blunt`, `piercing`, `slashing`, `physical`, `necrotic`, `psychic`, `magical` |

### Armor Stats by Type
| Type | Rating | Might Req | Base Slots |
|------|--------|-----------|------------|
| `light` | 1 | 3 | 2 |
| `medium` | 2 | 4 | 2 |
| `heavy` | 3 | 5 | 3 |

### Metal Effects on Armor
| Metal | Cost × | Effect |
|-------|--------|--------|
| `none` | — | No material |
| `common` | ×1 | Standard |
| `adamant` | ×50 | +1 Armor Rating, +1 slot |
| `coldIron` | ×20 | Weakness trigger vs Fae |
| `silver` | ×10 | Blesses against the accursed |
| `mythral` | ×50 | −1 slot (min 1) |
| `orichalcum` | ×50 | Reduces Cast damage received |

---

## Complete JSON Model

```json
{
  "name": "Chainmail",
  "type": "equipment",
  "img": "icons/equipment/chest/breastplate-banded-steel.webp",
  "system": {
    "description": "<p>Interlocking iron rings providing solid protection for the careful warrior.</p>",
    "equipmentType": "armor",
    "locked": false,
    "equipped": false,
    "quantity": 1,
    "baseCost": {
      "gold": 5,
      "silver": 0,
      "copper": 0
    },
    "requiresBound": false,
    "bound": false,
    "baseSlots": 2,
    "gridPosition": 0,
    "containerId": null,
    "metal": "common",
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
    "armorType": "medium",
    "immunities": [],
    "gearCategory": "",
    "isSupply": false,
    "isBeverage": false,
    "isConsumable": false,
    "linkedConsumable": "",
    "alchemicalType": "concoction",
    "lore": "",
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
| `img` | string | Icon image path |
| `description` | HTML string | Lore and rules text |
| `equipmentType` | string | Always `"armor"` |
| `locked` | boolean | Read-only display mode |
| `equipped` | boolean | Whether currently worn |
| `quantity` | integer ≥ 0 | Stack count |
| `baseCost.gold/silver/copper` | integer ≥ 0 | Price before metal multiplier |
| `baseSlots` | integer | Inventory slots (auto-adjusted by metal) |
| `metal` | string | Material type |
| `armorType` | string | `light`, `medium`, or `heavy` |
| `immunities` | string[] | Damage types this armor grants immunity to |
| `requiresBound` | boolean | Must bind before use |
| `bound` | boolean | Currently bound |

> **Note:** The system automatically calculates `rating` (1/2/3) and `might` requirement (3/4/5) from `armorType`. Do not set these — they are derived values.

---

## Quick Examples

### Light Leather Armor
```json
{
  "name": "Leather Armor",
  "type": "equipment",
  "img": "icons/equipment/chest/vest-leather-reinforced-brown.webp",
  "system": {
    "description": "<p>Supple leather stitched into a protective vest. Light enough to let you move freely.</p>",
    "equipmentType": "armor",
    "locked": false, "equipped": false, "quantity": 1,
    "baseCost": { "gold": 1, "silver": 0, "copper": 0 },
    "requiresBound": false, "bound": false,
    "baseSlots": 2, "gridPosition": 0, "containerId": null,
    "metal": "none",
    "damageType": "-", "damageAmount": "", "canExplode": false, "explodeValues": "",
    "properties": [],
    "weaponSkill": "melee", "range": "close", "grip": "1H",
    "damageOneHand": "d6", "damageTypeOneHand": "-",
    "damageTwoHands": "d8", "damageTypeTwoHands": "-",
    "equipmentState": "unequipped",
    "armorType": "light",
    "immunities": [],
    "gearCategory": "", "isSupply": false, "isBeverage": false,
    "isConsumable": false, "linkedConsumable": "",
    "alchemicalType": "concoction", "lore": "",
    "itemFx": { "enabled": false, "animType": "auto", "hitFile": "", "hitScale": 1.0, "hitOffsetX": 0, "hitDuration": 800, "hitSound": "", "missFile": "", "missScale": 1.0, "missDuration": 600, "missSound": "", "soundVolume": 0.6 }
  }
}
```

### Mythral Plate (Heavy, −1 slot)
```json
{
  "name": "Mythral Plate",
  "type": "equipment",
  "img": "icons/equipment/chest/breastplate-layered-silver.webp",
  "system": {
    "description": "<p>Ancient mythral plate that weighs almost nothing despite its strength.</p>",
    "equipmentType": "armor",
    "locked": false, "equipped": false, "quantity": 1,
    "baseCost": { "gold": 50, "silver": 0, "copper": 0 },
    "requiresBound": false, "bound": false,
    "baseSlots": 3, "gridPosition": 0, "containerId": null,
    "metal": "mythral",
    "damageType": "-", "damageAmount": "", "canExplode": false, "explodeValues": "",
    "properties": [],
    "weaponSkill": "melee", "range": "close", "grip": "1H",
    "damageOneHand": "d6", "damageTypeOneHand": "-",
    "damageTwoHands": "d8", "damageTypeTwoHands": "-",
    "equipmentState": "unequipped",
    "armorType": "heavy",
    "immunities": [],
    "gearCategory": "", "isSupply": false, "isBeverage": false,
    "isConsumable": false, "linkedConsumable": "",
    "alchemicalType": "concoction", "lore": "",
    "itemFx": { "enabled": false, "animType": "auto", "hitFile": "", "hitScale": 1.0, "hitOffsetX": 0, "hitDuration": 800, "hitSound": "", "missFile": "", "missScale": 1.0, "missDuration": 600, "missSound": "", "soundVolume": 0.6 }
  }
}
```

---

## AI Prompt Template

```
You are creating an armor item for the Vagabond tabletop RPG system in Foundry VTT.

Output a valid JSON object matching the structure below exactly. Only change the values I specify.

Armor details:
- Name: [NAME]
- Description: [LORE / RULES TEXT — HTML OK]
- Armor Type: [light / medium / heavy]
- Metal: [none / common / adamant / coldIron / silver / mythral / orichalcum]
- Cost: [X gold, Y silver, Z copper]
- Immunities: [list of damage types this armor resists, or empty]
- Requires Binding: [yes / no]

Use the full JSON template from the Vagabond armor documentation. Set all weapon-specific fields to their defaults (they are ignored for armor items).
```
