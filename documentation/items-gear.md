# Vagabond — AI Item Creation Guide: Gear

Use this document to prompt an AI assistant to generate gear items for the Vagabond Foundry VTT system. Gear covers all general equipment: adventuring tools, containers, trade goods, rations, and anything that isn't a weapon, armor, alchemical, or relic.

---

## How to Use

Tell the AI:

> "Create a Vagabond gear item named [NAME]. It belongs to the [category] category. It costs [price] and takes [N] inventory slots. Write a short description."

---

## Valid Values

| Field | Notes |
|-------|-------|
| `gearCategory` | Free-form string — use descriptive categories like `"Adventuring Gear"`, `"Tools"`, `"Food & Drink"`, `"Trade Goods"`, `"Containers"` |
| `isSupply` | `true` if this item counts as a ration for travel/survival tracking |
| `isBeverage` | `true` if this item counts as a water/beverage for travel tracking |
| `isConsumable` | `true` if the item is consumed on use (quantity decreases by 1) |
| `baseSlots` | Can be negative (e.g., a Backpack that grants extra slots would be `baseSlots: -6`) |
| `quantity` | Stack size; useful for arrows, torches, rations |

---

## Complete JSON Model

```json
{
  "name": "Rope (50 ft.)",
  "type": "equipment",
  "img": "icons/sundries/survival/rope-coiled-tan.webp",
  "system": {
    "description": "<p>Fifty feet of sturdy hempen rope. Essential for climbing, binding, and improvising.</p>",
    "equipmentType": "gear",
    "locked": false,
    "equipped": false,
    "quantity": 1,
    "baseCost": {
      "gold": 0,
      "silver": 5,
      "copper": 0
    },
    "requiresBound": false,
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
    "gearCategory": "Adventuring Gear",
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
| `img` | string | Icon path |
| `description` | HTML string | Lore and usage notes |
| `equipmentType` | string | Always `"gear"` |
| `locked` | boolean | Read-only display toggle |
| `quantity` | integer ≥ 0 | Stack count |
| `baseCost.gold/silver/copper` | integer ≥ 0 | Price |
| `baseSlots` | integer | Inventory slots used (negative = grants slots) |
| `gearCategory` | string | Category label for grouping |
| `isSupply` | boolean | Counts as ration for supply tracking |
| `isBeverage` | boolean | Counts as water/beverage for survival |
| `isConsumable` | boolean | Quantity depletes on use |
| `linkedConsumable` | string | Item ID that gets consumed when this item is used |
| `requiresBound` | boolean | Must be bound to use |
| `bound` | boolean | Currently bound |
| `containerId` | string or null | Parent container ID |
| `gridPosition` | integer ≥ 0 | Inventory grid slot |

> **Tip:** All weapon-specific fields (`weaponSkill`, `range`, `grip`, damage fields, etc.) are present in the schema but ignored for gear items. Keep them at their defaults.

---

## Quick Examples

### Ration (supply, consumable)
```json
{
  "name": "Trail Ration",
  "type": "equipment",
  "img": "icons/consumables/food/bread-loaf-sourdough-tan.webp",
  "system": {
    "description": "<p>A day's worth of dried meat, hardtack, and nuts. Counts as one Supply.</p>",
    "equipmentType": "gear",
    "locked": false, "equipped": false, "quantity": 1,
    "baseCost": { "gold": 0, "silver": 0, "copper": 5 },
    "requiresBound": false, "bound": false,
    "baseSlots": 1, "gridPosition": 0, "containerId": null,
    "metal": "none",
    "damageType": "-", "damageAmount": "", "canExplode": false, "explodeValues": "",
    "properties": [],
    "weaponSkill": "melee", "range": "close", "grip": "1H",
    "damageOneHand": "d6", "damageTypeOneHand": "-",
    "damageTwoHands": "d8", "damageTypeTwoHands": "-",
    "equipmentState": "unequipped",
    "armorType": "light", "immunities": [],
    "gearCategory": "Food & Drink",
    "isSupply": true,
    "isBeverage": false,
    "isConsumable": true,
    "linkedConsumable": "",
    "alchemicalType": "concoction", "lore": "",
    "itemFx": { "enabled": false, "animType": "auto", "hitFile": "", "hitScale": 1.0, "hitOffsetX": 0, "hitDuration": 800, "hitSound": "", "missFile": "", "missScale": 1.0, "missDuration": 600, "missSound": "", "soundVolume": 0.6 }
  }
}
```

### Backpack (grants 6 extra inventory slots)
```json
{
  "name": "Backpack",
  "type": "equipment",
  "img": "icons/containers/bags/pack-leather-brown-tan.webp",
  "system": {
    "description": "<p>A sturdy leather pack. Grants 6 additional inventory slots.</p>",
    "equipmentType": "gear",
    "locked": false, "equipped": false, "quantity": 1,
    "baseCost": { "gold": 0, "silver": 20, "copper": 0 },
    "requiresBound": false, "bound": false,
    "baseSlots": -6, "gridPosition": 0, "containerId": null,
    "metal": "none",
    "damageType": "-", "damageAmount": "", "canExplode": false, "explodeValues": "",
    "properties": [],
    "weaponSkill": "melee", "range": "close", "grip": "1H",
    "damageOneHand": "d6", "damageTypeOneHand": "-",
    "damageTwoHands": "d8", "damageTypeTwoHands": "-",
    "equipmentState": "unequipped",
    "armorType": "light", "immunities": [],
    "gearCategory": "Containers",
    "isSupply": false, "isBeverage": false, "isConsumable": false, "linkedConsumable": "",
    "alchemicalType": "concoction", "lore": "",
    "itemFx": { "enabled": false, "animType": "auto", "hitFile": "", "hitScale": 1.0, "hitOffsetX": 0, "hitDuration": 800, "hitSound": "", "missFile": "", "missScale": 1.0, "missDuration": 600, "missSound": "", "soundVolume": 0.6 }
  }
}
```

---

## AI Prompt Template

```
You are creating a gear item for the Vagabond tabletop RPG system in Foundry VTT.

Output a valid JSON object matching the structure below exactly. Only change the values I specify.

Gear details:
- Name: [NAME]
- Description: [LORE / USE NOTES — HTML OK]
- Category: [Adventuring Gear / Tools / Food & Drink / Trade Goods / Containers / etc.]
- Cost: [X gold, Y silver, Z copper]
- Slots: [integer — use negative if item grants extra slots]
- Quantity: [default stack size]
- Is Supply (ration): [yes / no]
- Is Beverage (water): [yes / no]
- Is Consumable: [yes / no]

Use the full JSON template from the Vagabond gear documentation. Set all weapon-specific fields to their defaults.
```
