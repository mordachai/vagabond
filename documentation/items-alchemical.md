# Vagabond — AI Item Creation Guide: Alchemical Items

Use this document to prompt an AI assistant to generate alchemical items for the Vagabond Foundry VTT system. Alchemicals include potions, poisons, explosives, oils, acids, and torches.

---

## How to Use

Tell the AI:

> "Create a Vagabond alchemical item named [NAME]. It is a [type]. It deals [damage formula] [damage type] damage (if applicable). Write a short description of its effect."

---

## Valid Values

| Field | Valid Options |
|-------|--------------|
| `alchemicalType` | `acid`, `concoction`, `explosive`, `oil`, `poison`, `potion`, `torch` |
| `damageType` | `acid`, `fire`, `shock`, `poison`, `cold`, `blunt`, `piercing`, `slashing`, `physical`, `necrotic`, `psychic`, `magical`, `healing`, `recover`, `recharge`, `-` |
| `damageAmount` | Dice formula string: `"d6"`, `"2d4"`, `"d8+2"`, or `""` for no damage |
| `canExplode` | `true` if damage dice can explode |
| `explodeValues` | Comma-separated values: `"1"`, `"1,4"` |

### Alchemical Types
| Type | Description |
|------|-------------|
| `acid` | Corrosive substance, deals acid damage over time |
| `concoction` | General brewed mixture, versatile |
| `explosive` | Thrown or timed explosion, deals area fire/blunt damage |
| `oil` | Applied to surfaces or weapons, often causes burning |
| `poison` | Ingested or contact toxin, poison damage |
| `potion` | Drinkable concoction, often healing or status effect |
| `torch` | Light source, can deal fire damage if used as improvised weapon |

---

## Complete JSON Model

```json
{
  "name": "Fire Flask",
  "type": "equipment",
  "img": "icons/consumables/potions/potion-fire-red.webp",
  "system": {
    "description": "<p>A glass flask filled with alchemical fire. Thrown at a target to coat them in burning liquid.</p><p><strong>Effect:</strong> On a hit, the target takes d6 fire damage and must succeed a Reflex save or catch fire (burning condition).</p>",
    "equipmentType": "alchemical",
    "locked": false,
    "equipped": false,
    "quantity": 1,
    "baseCost": {
      "gold": 0,
      "silver": 30,
      "copper": 0
    },
    "requiresBound": false,
    "bound": false,
    "baseSlots": 1,
    "gridPosition": 0,
    "containerId": null,
    "metal": "none",
    "damageType": "fire",
    "damageAmount": "d6",
    "canExplode": false,
    "explodeValues": "",
    "properties": [],
    "weaponSkill": "ranged",
    "range": "near",
    "grip": "1H",
    "damageOneHand": "d6",
    "damageTypeOneHand": "fire",
    "damageTwoHands": "d6",
    "damageTypeTwoHands": "fire",
    "equipmentState": "unequipped",
    "armorType": "light",
    "immunities": [],
    "gearCategory": "",
    "isSupply": false,
    "isBeverage": false,
    "isConsumable": true,
    "linkedConsumable": "",
    "alchemicalType": "explosive",
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
| `description` | HTML string | Effect, rules text, lore |
| `equipmentType` | string | Always `"alchemical"` |
| `alchemicalType` | string | Sub-type (acid/concoction/explosive/oil/poison/potion/torch) |
| `locked` | boolean | Read-only display toggle |
| `quantity` | integer ≥ 0 | Stack count |
| `baseCost.gold/silver/copper` | integer ≥ 0 | Price |
| `baseSlots` | integer | Inventory slots |
| `damageType` | string | Damage type for attack/effect |
| `damageAmount` | string | Damage formula (blank if no damage) |
| `canExplode` | boolean | Dice can explode |
| `explodeValues` | string | Comma-separated explode trigger values |
| `weaponSkill` | string | Skill used to throw/use if it attacks |
| `range` | string | Range if used as a thrown weapon |
| `damageOneHand` | string | Damage when used as attack |
| `damageTypeOneHand` | string | Damage type when attacking |
| `isConsumable` | boolean | Almost always `true` for alchemicals |
| `linkedConsumable` | string | ID of consumed item (for linked usage) |

---

## Quick Examples

### Healing Potion
```json
{
  "name": "Healing Potion",
  "type": "equipment",
  "img": "icons/consumables/potions/potion-healing-pink.webp",
  "system": {
    "description": "<p>A bright pink liquid that tastes of honey and herbs. Drink to restore HP.</p><p><strong>Effect:</strong> Restore d6 HP when consumed.</p>",
    "equipmentType": "alchemical",
    "locked": false, "equipped": false, "quantity": 1,
    "baseCost": { "gold": 0, "silver": 25, "copper": 0 },
    "requiresBound": false, "bound": false,
    "baseSlots": 1, "gridPosition": 0, "containerId": null,
    "metal": "none",
    "damageType": "healing",
    "damageAmount": "d6",
    "canExplode": false, "explodeValues": "",
    "properties": [],
    "weaponSkill": "melee", "range": "close", "grip": "1H",
    "damageOneHand": "d6", "damageTypeOneHand": "healing",
    "damageTwoHands": "d6", "damageTypeTwoHands": "healing",
    "equipmentState": "unequipped",
    "armorType": "light", "immunities": [],
    "gearCategory": "",
    "isSupply": false, "isBeverage": true,
    "isConsumable": true, "linkedConsumable": "",
    "alchemicalType": "potion", "lore": "",
    "itemFx": { "enabled": false, "animType": "auto", "hitFile": "", "hitScale": 1.0, "hitOffsetX": 0, "hitDuration": 800, "hitSound": "", "missFile": "", "missScale": 1.0, "missDuration": 600, "missSound": "", "soundVolume": 0.6 }
  }
}
```

### Acid Vial
```json
{
  "name": "Acid Vial",
  "type": "equipment",
  "img": "icons/consumables/potions/potion-acid-green.webp",
  "system": {
    "description": "<p>A stoppered glass vial of caustic acid. Throw to splash a target.</p><p><strong>Effect:</strong> Deals d4 acid damage on hit; deals d4 acid damage again at the start of the target's next turn.</p>",
    "equipmentType": "alchemical",
    "locked": false, "equipped": false, "quantity": 1,
    "baseCost": { "gold": 0, "silver": 20, "copper": 0 },
    "requiresBound": false, "bound": false,
    "baseSlots": 1, "gridPosition": 0, "containerId": null,
    "metal": "none",
    "damageType": "acid",
    "damageAmount": "d4",
    "canExplode": false, "explodeValues": "",
    "properties": [],
    "weaponSkill": "ranged", "range": "near", "grip": "1H",
    "damageOneHand": "d4", "damageTypeOneHand": "acid",
    "damageTwoHands": "d4", "damageTypeTwoHands": "acid",
    "equipmentState": "unequipped",
    "armorType": "light", "immunities": [],
    "gearCategory": "",
    "isSupply": false, "isBeverage": false,
    "isConsumable": true, "linkedConsumable": "",
    "alchemicalType": "acid", "lore": "",
    "itemFx": { "enabled": false, "animType": "auto", "hitFile": "", "hitScale": 1.0, "hitOffsetX": 0, "hitDuration": 800, "hitSound": "", "missFile": "", "missScale": 1.0, "missDuration": 600, "missSound": "", "soundVolume": 0.6 }
  }
}
```

---

## AI Prompt Template

```
You are creating an alchemical item for the Vagabond tabletop RPG system in Foundry VTT.

Output a valid JSON object matching the structure below exactly. Only change the values I specify.

Alchemical details:
- Name: [NAME]
- Description: [EFFECT / RULES TEXT — HTML OK]
- Alchemical Type: [acid / concoction / explosive / oil / poison / potion / torch]
- Damage: [formula] [type], or "none"
- Thrown as weapon: [yes/no — if yes, specify weaponSkill (usually ranged) and range]
- Exploding dice: [yes/no; if yes, which values]
- Cost: [X gold, Y silver, Z copper]
- Slots: [integer]
- Counts as beverage: [yes / no]

Use the full JSON template from the Vagabond alchemical documentation. isConsumable should almost always be true.
```
