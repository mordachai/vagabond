# Vagabond — AI Item Creation Guide: Armor

Use this document to prompt an AI assistant to generate armor items for the Vagabond Foundry VTT system.

---

## How to Use

Tell the AI:

> "Create a Vagabond armor item named [NAME]. It has Armor Rating [N], Might requirement [N], occupies [N] Slots, made of [metal]. It costs [price]. Write a short description."

---

## Valid Values

| Field | Valid Options |
|-------|--------------|
| `armorRating` | integer ≥ 0 — Armor granted while worn (before metal) |
| `mightRequirement` | integer ≥ 0 — wearer is Restrained while Might is below it |
| `reflexPenalty` | integer ≥ 0 — penalty to Reflex Saves while worn (RAW: equal to Slots) |
| `metal` | `none`, `adamant`, `bronze`, `coldIron`, `gold`, `iron`, `silver`, `mythral`, `orichalcum`, `steel`, `wood` |
| `immunities` | Array of damage type strings: `acid`, `fire`, `shock`, `poison`, `cold`, `blunt`, `piercing`, `slashing`, `physical`, `necrotic`, `psychic`, `magical` |

### Reference Values (RAW Worn Armor table)
| Armor | `armorRating` | `mightRequirement` | `baseSlots` | `reflexPenalty` | Value |
|------|--------|-----------|------------|---------|-------|
| Light | 1 | 2 | 1 | 1 | 50s |
| Medium | 2 | 4 | 2 | 2 | 1g |
| Heavy | 3 | 6 | 3 | 3 | 2g |

There is no armor "type" field — every value is explicit per item. Only one set of worn Armor counts; equipping armor unequips any other worn armor.

### Material Effects on Armor (`metal` field)
Rules live in `CONFIG.VAGABOND.metalData`.

| Material | Cost × | Effect |
|-------|--------|--------|
| `none` | — | No material |
| `adamant` | ×50 | +1 Slot, +1 Armor Rating |
| `bronze` | — | — |
| `coldIron` | ×20 | Fae are Weak to its damage |
| `gold` | ×100 | Degrades: Armor −1 after taking damage, breaks at 0 (hidden feature, off) |
| `iron` | — | — (replaces legacy `common`) |
| `silver` | ×10 | Hellspawn, Lycanthropes, Undead are Weak to its damage |
| `mythral` | ×50 | −1 Slot (min 1) |
| `orichalcum` | ×50 | +1 Slot |
| `steel` | — | — |
| `wood` | ÷2 | Degrades like Gold (hidden feature, off) |

Slot changes also shift the Reflex penalty (`finalReflexPenalty`).

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
    "metal": "iron",
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
    "armorRating": 2,
    "mightRequirement": 4,
    "reflexPenalty": 2,
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
| `armorRating` | integer | Armor Rating (Adamant adds +1 → derived `finalRating`) |
| `mightRequirement` | integer | Might needed to avoid Restrained while worn |
| `reflexPenalty` | integer | Reflex Save penalty; metal slot modifiers apply on top → derived `finalReflexPenalty` |
| `immunities` | string[] | Damage types this armor grants immunity to |
| `requiresBound` | boolean | Must bind before use |
| `bound` | boolean | Currently bound |

> **Note:** `finalRating`, `slots` and `finalReflexPenalty` are derived (base value + metal modifier). `rating` / `might` are read-only aliases of `armorRating` / `mightRequirement`. Legacy items with `armorType` are migrated on load.

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
    "baseSlots": 1, "gridPosition": 0, "containerId": null,
    "metal": "none",
    "damageType": "-", "damageAmount": "", "canExplode": false, "explodeValues": "",
    "properties": [],
    "weaponSkill": "melee", "range": "close", "grip": "1H",
    "damageOneHand": "d6", "damageTypeOneHand": "-",
    "damageTwoHands": "d8", "damageTypeTwoHands": "-",
    "equipmentState": "unequipped",
    "armorRating": 1, "mightRequirement": 2, "reflexPenalty": 1,
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
    "armorRating": 3, "mightRequirement": 6, "reflexPenalty": 3,
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
- Armor Rating: [N]
- Might Requirement: [N]
- Slots: [N] (Reflex Penalty defaults to the same number)
- Material: [none / adamant / bronze / coldIron / gold / iron / silver / mythral / orichalcum / steel / wood]
- Cost: [X gold, Y silver, Z copper]
- Immunities: [list of damage types this armor resists, or empty]
- Requires Binding: [yes / no]

Use the full JSON template from the Vagabond armor documentation. Set all weapon-specific fields to their defaults (they are ignored for armor items).
```
