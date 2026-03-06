# Vagabond — AI Item Creation Guide: Weapons

Use this document to prompt an AI assistant to generate weapon items for the Vagabond Foundry VTT system. Paste the full JSON block into Foundry's item import dialog or a compendium editor.

---

## How to Use

Tell the AI:

> "Create a Vagabond weapon item named [NAME]. It is a [one-handed/two-handed/versatile/fist] weapon with [close/near/far] range. It deals [damage formula] [damage type] damage. It uses the [weaponSkill] skill. Include these properties: [list]. Write a short description."

Then paste the output JSON into Foundry.

---

## Valid Values

| Field | Valid Options |
|-------|--------------|
| `weaponSkill` | `melee`, `brawl`, `finesse`, `ranged` (also any other skill/save key if homebrew) |
| `range` | `close`, `near`, `far` |
| `grip` | `1H` (one-handed), `2H` (two-handed), `F` (fist — unarmed), `V` (versatile) |
| `metal` | `none`, `common`, `adamant`, `coldIron`, `silver`, `mythral`, `orichalcum` |
| `properties` | `Brawl`, `Brutal`, `Cleave`, `Entangle`, `Finesse`, `Keen`, `Long`, `Near`, `Ranged`, `Shield`, `Thrown` |
| `damageType` (one-hand/two-hand) | `blunt`, `piercing`, `slashing`, `physical`, `fire`, `acid`, `shock`, `poison`, `cold`, `necrotic`, `psychic`, `magical`, `-` |
| `equipmentState` | `unequipped`, `oneHand`, `twoHands` |

### Metal Effects
| Metal | Cost ×| Effect |
|-------|--------|--------|
| `none` | — | No special material |
| `common` | ×1 | Standard material |
| `adamant` | ×50 | +1 damage, +1 inventory slot |
| `coldIron` | ×20 | Weakness trigger vs Fae |
| `silver` | ×10 | Blesses against the accursed |
| `mythral` | ×50 | −1 inventory slot (min 1) |
| `orichalcum` | ×50 | Armor reduces Cast damage |

### Weapon Properties
| Property | Effect |
|----------|--------|
| `Brawl` | Used unarmed / with brawl skill |
| `Brutal` | Reroll damage dice, take higher |
| `Cleave` | On kill, attack again |
| `Entangle` | Can restrain on hit |
| `Finesse` | Can use Finesse skill instead of Melee |
| `Keen` | Crits on 19–20 |
| `Long` | Extended reach |
| `Near` | Hits Near range without penalty |
| `Ranged` | Ranged attack weapon |
| `Shield` | Provides armor bonus |
| `Thrown` | Can be thrown (Near range) |

---

## Complete JSON Model

```json
{
  "name": "Iron Longsword",
  "type": "equipment",
  "img": "icons/weapons/swords/sword-longsword-steel.webp",
  "system": {
    "description": "<p>A well-balanced iron longsword, reliable in any fight.</p>",
    "equipmentType": "weapon",
    "locked": false,
    "equipped": false,
    "quantity": 1,
    "baseCost": {
      "gold": 1,
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
    "properties": ["Keen"],
    "weaponSkill": "melee",
    "range": "close",
    "grip": "V",
    "damageOneHand": "d8",
    "damageTypeOneHand": "slashing",
    "damageTwoHands": "d10",
    "damageTypeTwoHands": "slashing",
    "equipmentState": "unequipped",
    "armorType": "light",
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
| `name` | string | Display name of the weapon |
| `img` | string | Path to icon image |
| `description` | HTML string | Lore and rules text (supports HTML) |
| `equipmentType` | string | Always `"weapon"` for weapons |
| `locked` | boolean | If true, sheet shows read-only view |
| `equipped` | boolean | Whether currently equipped (set by equipmentState) |
| `quantity` | integer ≥ 0 | Number of this item |
| `baseCost.gold/silver/copper` | integer ≥ 0 | Base price before metal multiplier |
| `requiresBound` | boolean | Must be bound before use |
| `bound` | boolean | Currently bound to character |
| `baseSlots` | integer | Inventory slots used (can be negative) |
| `gridPosition` | integer ≥ 0 | Position in inventory grid |
| `containerId` | string or null | ID of parent container item |
| `metal` | string | Material type (see table above) |
| `damageType` | string | Fallback damage type (usually leave `"-"`) |
| `damageAmount` | string | Fallback damage formula (usually blank) |
| `canExplode` | boolean | Damage dice explode |
| `explodeValues` | string | Comma-separated values that trigger explode (e.g., `"1,4"`) |
| `properties` | string[] | Array of property tags |
| `weaponSkill` | string | Skill used to attack |
| `range` | string | Attack range |
| `grip` | string | Grip type |
| `damageOneHand` | string | Damage formula one-handed (e.g., `"d8"`, `"2d6+1"`) |
| `damageTypeOneHand` | string | Damage type one-handed |
| `damageTwoHands` | string | Damage formula two-handed (for Versatile weapons) |
| `damageTypeTwoHands` | string | Damage type two-handed |
| `equipmentState` | string | Current equip state |
| `isConsumable` | boolean | If true, quantity decreases on use |
| `linkedConsumable` | string | Item ID consumed when used (for linked ammo etc.) |
| `itemFx` | object | Sequencer animation config (leave defaults unless needed) |

---

## Quick Examples

### Shortbow (ranged, Near, 1H, Ranged property)
```json
{
  "name": "Shortbow",
  "type": "equipment",
  "img": "icons/weapons/bows/bow-recurve-brown.webp",
  "system": {
    "description": "<p>A lightweight bow suited for quick shots.</p>",
    "equipmentType": "weapon",
    "locked": false,
    "equipped": false,
    "quantity": 1,
    "baseCost": { "gold": 0, "silver": 15, "copper": 0 },
    "requiresBound": false, "bound": false,
    "baseSlots": 2,
    "gridPosition": 0,
    "containerId": null,
    "metal": "none",
    "damageType": "-", "damageAmount": "",
    "canExplode": false, "explodeValues": "",
    "properties": ["Ranged"],
    "weaponSkill": "ranged",
    "range": "near",
    "grip": "1H",
    "damageOneHand": "d6",
    "damageTypeOneHand": "piercing",
    "damageTwoHands": "d6",
    "damageTypeTwoHands": "piercing",
    "equipmentState": "unequipped",
    "armorType": "light", "immunities": [],
    "gearCategory": "", "isSupply": false, "isBeverage": false,
    "isConsumable": false, "linkedConsumable": "",
    "alchemicalType": "concoction", "lore": "",
    "itemFx": { "enabled": false, "animType": "auto", "hitFile": "", "hitScale": 1.0, "hitOffsetX": 0, "hitDuration": 800, "hitSound": "", "missFile": "", "missScale": 1.0, "missDuration": 600, "missSound": "", "soundVolume": 0.6 }
  }
}
```

### Dagger (Finesse, close, 1H, Keen)
```json
{
  "name": "Dagger",
  "type": "equipment",
  "img": "icons/weapons/daggers/dagger-straight-steel.webp",
  "system": {
    "description": "<p>A short blade with a razor edge — crits on 19 or 20.</p>",
    "equipmentType": "weapon",
    "locked": false, "equipped": false, "quantity": 1,
    "baseCost": { "gold": 0, "silver": 5, "copper": 0 },
    "requiresBound": false, "bound": false,
    "baseSlots": 1, "gridPosition": 0, "containerId": null,
    "metal": "none",
    "damageType": "-", "damageAmount": "",
    "canExplode": false, "explodeValues": "",
    "properties": ["Finesse", "Keen"],
    "weaponSkill": "finesse",
    "range": "close",
    "grip": "1H",
    "damageOneHand": "d6",
    "damageTypeOneHand": "piercing",
    "damageTwoHands": "d6",
    "damageTypeTwoHands": "piercing",
    "equipmentState": "unequipped",
    "armorType": "light", "immunities": [],
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
You are creating a weapon item for the Vagabond tabletop RPG system in Foundry VTT.

Output a valid JSON object matching the structure below exactly. Only change the values I specify.

Weapon details:
- Name: [NAME]
- Description: [LORE / RULES TEXT — HTML OK]
- Weapon Skill: [melee / brawl / finesse / ranged]
- Range: [close / near / far]
- Grip: [1H / 2H / F / V]
- Damage (one-hand): [formula] [damage type]
- Damage (two-hand, for Versatile only): [formula] [damage type]
- Properties: [list from: Brawl, Brutal, Cleave, Entangle, Finesse, Keen, Long, Near, Ranged, Shield, Thrown]
- Metal: [none / common / adamant / coldIron / silver / mythral / orichalcum]
- Cost: [X gold, Y silver, Z copper]
- Slots: [integer]
- Exploding dice: [yes/no; if yes, which values]

Use the full JSON template from the Vagabond weapon documentation. Set all unlisted fields to their defaults.
```
