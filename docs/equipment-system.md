# Equipment System - Developer Guide

## Overview

The Vagabond system uses a unified equipment data model (`VagabondEquipment`) that supports multiple equipment types: weapons, armor, gear, alchemicals, and relics. This provides a consistent schema with type-specific fields.

**Key Files:**
- `/module/data/base-equipment.mjs` - Unified equipment model
- `/module/data/item-weapon.mjs` - Legacy weapon-specific model
- `/module/data/item-armor.mjs` - Legacy armor-specific model
- `/module/data/item-gear.mjs` - Legacy gear-specific model

## Table of Contents

1. [Equipment Types](#equipment-types)
2. [Universal Fields](#universal-fields)
3. [Type-Specific Fields](#type-specific-fields)
4. [Creating Equipment](#creating-equipment)
5. [Equipment States](#equipment-states)
6. [Metal System](#metal-system)
7. [Properties System](#properties-system)
8. [Examples](#examples)

---

## Equipment Types

The `equipmentType` field determines what kind of equipment this is:

- **`weapon`** - Melee/ranged weapons (swords, bows, etc.)
- **`armor`** - Protective gear (leather, chainmail, etc.)
- **`gear`** - General equipment (rope, backpack, etc.)
- **`alchemical`** - Consumable alchemical items (potions, oils, etc.)
- **`relic`** - Magical artifacts (rings, wands, etc.)

```javascript
{
  equipmentType: 'weapon',  // or 'armor', 'gear', 'alchemical', 'relic'
}
```

---

## Universal Fields

These fields are available for **all equipment types**.

### Core Fields

#### `equipmentType` (String, required)
The type of equipment. See [Equipment Types](#equipment-types).

```javascript
equipmentType: 'weapon'
```

#### `locked` (Boolean, default: false)
When true, the item sheet displays as formatted text instead of editable inputs.

```javascript
locked: false
```

#### `equipped` (Boolean, default: false)
Whether the item is currently equipped.

```javascript
equipped: true
```

#### `quantity` (Number, default: 1)
Number of items (for stackable items).

```javascript
quantity: 3
```

### Cost System

#### `baseCost` (Object)
Base cost before metal multiplier is applied.

```javascript
baseCost: {
  gold: 50,
  silver: 0,
  copper: 0
}
```

**Derived Properties:**
- `cost` - Final cost after metal multiplier (calculated in `prepareDerivedData`)
- `costDisplay` - Human-readable string (e.g., "50g 10s")

### Slots System

#### `baseSlots` (Number, default: 1)
Base inventory slots before metal modifier. Can be negative (e.g., backpack).

```javascript
baseSlots: 2
```

**Note:** Final slot count may be modified by metal type in derived data.

### Metal System

#### `metal` (String, default: 'none')
Metal type that affects cost and properties.

**Choices:**
- `none` - No metal (for non-metal items)
- `common` - Standard metal (1x multiplier)
- `adamant` - Very hard metal (2x multiplier)
- `coldIron` - Effective vs fey (2x multiplier)
- `silver` - Effective vs undead (2x multiplier)
- `mythral` - Lightweight metal (3x multiplier)
- `orichalcum` - Legendary metal (4x multiplier)

```javascript
metal: 'adamant'
```

**Derived Properties:**
- `metalMultiplier` - Cost multiplier based on metal type
- `metalEffect` - Description of metal's special effect
- `metalDisplay` - Localized metal name

### Damage System

#### `damageType` (String, default: '-')
Type of damage or healing this equipment deals.

**Choices:**
- `-` (None)
- `acid`, `fire`, `shock`, `poison`, `cold`
- `blunt`, `physical`, `necrotic`, `psychic`
- `piercing`, `slashing` (for weapons)
- `healing`

```javascript
damageType: 'fire'
```

#### `damageAmount` (String, optional)
Damage formula (e.g., "2d6", "1d8+2").

```javascript
damageAmount: '2d6'
```

### Properties System

#### `properties` (Array<String>, default: [])
Array of property tags (weapon properties, gear traits, etc.).

```javascript
properties: ['Brutal', 'Cleave', 'Heavy']
```

---

## Type-Specific Fields

### Weapon-Specific Fields

These fields are used when `equipmentType: 'weapon'`.

#### `weaponSkill` (String, default: 'melee')
Skill used to attack with this weapon.

**Choices:** `melee`, `brawl`, `finesse`, `ranged`

```javascript
weaponSkill: 'finesse'
```

#### `range` (String, default: 'close')
Weapon range.

**Choices:** `close`, `near`, `far`

```javascript
range: 'near'
```

**Derived Properties:**
- `rangeAbbrev` - Abbreviated range (C, N, F)
- `rangeDisplay` - Full range name (Close, Near, Far)

#### `grip` (String, default: '1H')
How the weapon is held.

**Choices:**
- `1H` - One-handed only
- `2H` - Two-handed only
- `F` - Fist/unarmed
- `V` - Versatile (can be 1H or 2H)

```javascript
grip: 'V'  // Versatile
```

**Derived Property:**
- `gripDisplay` - Human-readable grip (e.g., "Versatile")

#### `damageOneHand` (String, default: 'd6')
Damage when wielded one-handed.

```javascript
damageOneHand: 'd8'
```

#### `damageTwoHands` (String, default: 'd8')
Damage when wielded two-handed (for versatile weapons).

```javascript
damageTwoHands: 'd10'
```

**Derived Property:**
- `currentDamage` - Current damage based on equipment state

#### `equipmentState` (String, default: 'unequipped')
Current equipped state for weapons.

**Choices:** `unequipped`, `oneHand`, `twoHands`

```javascript
equipmentState: 'oneHand'
```

**Important:** Only versatile (`V`) weapons can toggle between `oneHand` and `twoHands`.

---

### Armor-Specific Fields

These fields are used when `equipmentType: 'armor'`.

#### `armorType` (String, default: 'light')
Type of armor.

**Choices:** `light`, `medium`, `heavy`

```javascript
armorType: 'medium'
```

**Derived Property:**
- `armorTypeDisplay` - Localized armor type name

#### `immunities` (Array<String>, default: [])
Damage types that this armor provides immunity to.

```javascript
immunities: ['fire', 'cold']
```

#### Rating System

Armor provides a defense rating that may be modified by metal type.

**Derived Properties:**
- `rating` - Base armor rating
- `finalRating` - Rating after metal modifiers
- `ratingDisplay` - Formatted rating with bonus (e.g., "3 (+1)")

---

### Gear-Specific Fields

These fields are used when `equipmentType: 'gear'`.

#### `gearCategory` (String, optional)
Category for organization (e.g., "Adventuring Gear", "Tools").

```javascript
gearCategory: 'Adventuring Gear'
```

#### `type` (String, optional)
Specific type within the category.

```javascript
type: 'Rope'
```

---

### Alchemical-Specific Fields

These fields are used when `equipmentType: 'alchemical'`.

#### `consumable` (Boolean, default: false)
Whether this item is consumed on use.

```javascript
consumable: true
```

#### `uses` (Object)
Current and maximum uses.

```javascript
uses: {
  value: 3,
  max: 3
}
```

#### `duration` (String, optional)
Duration of the alchemical effect.

```javascript
duration: '1 hour'
```

---

### Relic-Specific Fields

These fields are used when `equipmentType: 'relic'`.

#### `requiresAttunement` (Boolean, default: false)
Whether this relic requires attunement.

```javascript
requiresAttunement: true
```

#### `charges` (Object)
Current and maximum charges.

```javascript
charges: {
  value: 5,
  max: 10
}
```

#### `magicalEffects` (String, optional)
Description of the relic's magical effects.

```javascript
magicalEffects: 'Grants resistance to fire damage'
```

---

## Creating Equipment

### Method 1: Using Actor.createEmbeddedDocuments

```javascript
// Create a new weapon
await actor.createEmbeddedDocuments('Item', [{
  name: 'Longsword',
  type: 'equipment',
  img: 'icons/weapons/swords/longsword.png',
  system: {
    equipmentType: 'weapon',
    weaponSkill: 'melee',
    range: 'close',
    grip: 'V',  // Versatile
    damageOneHand: 'd8',
    damageTwoHands: 'd10',
    damageType: 'physical',
    baseCost: { gold: 15, silver: 0, copper: 0 },
    baseSlots: 1,
    metal: 'common',
    properties: ['Versatile']
  }
}]);
```

### Method 2: Using Item.create

```javascript
// Create a standalone item
const item = await Item.create({
  name: 'Healing Potion',
  type: 'equipment',
  system: {
    equipmentType: 'alchemical',
    consumable: true,
    uses: { value: 1, max: 1 },
    damageType: 'healing',
    damageAmount: '2d6',
    baseCost: { gold: 0, silver: 50, copper: 0 },
    baseSlots: 0,
    description: 'Restores 2d6 hit points when consumed.'
  }
});
```

### Method 3: Duplicating Existing Equipment

```javascript
// Get existing item
const originalWeapon = actor.items.get(itemId);

// Create a modified copy
await actor.createEmbeddedDocuments('Item', [{
  ...originalWeapon.toObject(),
  name: 'Silver Longsword',
  system: {
    ...originalWeapon.system,
    metal: 'silver'  // Change to silver
  }
}]);
```

---

## Equipment States

### Weapon Equipment States

Weapons can be in three states:

1. **`unequipped`** - Not equipped
2. **`oneHand`** - Equipped in one hand
3. **`twoHands`** - Equipped in two hands

**Important Rules:**
- **1H weapons** can only toggle: `unequipped ↔ oneHand`
- **2H weapons** can only toggle: `unequipped ↔ twoHands`
- **V (Versatile) weapons** can cycle: `unequipped → oneHand → twoHands → unequipped`
- **F (Fist) weapons** can only toggle: `unequipped ↔ oneHand`

### Toggling Equipment State

```javascript
// For 1H/2H weapons (in inventory)
await weapon.update({
  'system.equipmentState': 'oneHand'  // or 'twoHands' for 2H weapons
});

// For versatile weapons (grip toggle in favorites)
// This is handled by actor-sheet.mjs:_onToggleWeaponGrip
const currentState = weapon.system.equipmentState;
const nextState = currentState === 'oneHand' ? 'twoHands' : 'oneHand';
await weapon.update({ 'system.equipmentState': nextState });
```

**Validation:** The `_onToggleWeaponEquipment` method in `actor-sheet.mjs` automatically validates state transitions based on grip type.

### Armor/Gear Equipment

Simple boolean toggle:

```javascript
await armor.update({
  'system.equipped': !armor.system.equipped
});
```

---

## Metal System

### Metal Properties

Each metal type has:
- **Multiplier** - Cost multiplier
- **Effect** - Special property description
- **Slot modifier** - Some metals reduce weight/slots

| Metal | Multiplier | Effect |
|-------|-----------|--------|
| none | 1x | No special effect |
| common | 1x | Standard metal |
| adamant | 2x | Extremely hard, damage +1 |
| coldIron | 2x | Effective against fey |
| silver | 2x | Effective against undead |
| mythral | 3x | Lightweight, -1 slot |
| orichalcum | 4x | Legendary, all bonuses |

### Accessing Metal Data

```javascript
// In prepareDerivedData():
const metalData = this._getMetalData();
this.metalMultiplier = metalData.multiplier;
this.metalEffect = metalData.effect;

// Final cost calculation
this.cost = {
  gold: this.baseCost.gold * this.metalMultiplier,
  silver: this.baseCost.silver * this.metalMultiplier,
  copper: this.baseCost.copper * this.metalMultiplier
};
```

---

## Properties System

### Weapon Properties

Common weapon properties include:
- **Brutal** - Bonus damage on critical hits
- **Cleave** - Hit adjacent enemy on kill
- **Entangle** - Can grapple targets
- **Heavy** - Requires STR to wield effectively
- **Light** - Bonus to initiative
- **Reach** - Extended melee range
- **Thrown** - Can be thrown
- **Versatile** - Can be used 1H or 2H

### Adding Properties

```javascript
// Set properties array
await weapon.update({
  'system.properties': ['Brutal', 'Cleave']
});

// Add a property
const props = weapon.system.properties;
await weapon.update({
  'system.properties': [...props, 'Heavy']
});

// Remove a property
const filtered = weapon.system.properties.filter(p => p !== 'Heavy');
await weapon.update({
  'system.properties': filtered
});
```

### Property Hints

Properties can have hints displayed in chat cards:

```javascript
// In chat card creation
const propertyHints = weapon.system.properties.map(prop => ({
  name: prop,
  hint: CONFIG.VAGABOND.weaponPropertiesHints[prop] || ''
}));

card.setPropertyDetails(propertyHints);
```

---

## Examples

### Example 1: Create a Versatile Longsword

```javascript
await actor.createEmbeddedDocuments('Item', [{
  name: 'Longsword',
  type: 'equipment',
  img: 'icons/weapons/swords/sword-guard-purple.webp',
  system: {
    equipmentType: 'weapon',
    locked: false,

    // Weapon stats
    weaponSkill: 'melee',
    range: 'close',
    grip: 'V',  // Versatile
    damageOneHand: 'd8',
    damageTwoHands: 'd10',
    damageType: 'physical',

    // Equipment state
    equipmentState: 'unequipped',
    equipped: false,

    // Economy
    baseCost: { gold: 15, silver: 0, copper: 0 },
    metal: 'common',
    baseSlots: 1,
    quantity: 1,

    // Properties
    properties: ['Versatile'],

    // Description
    description: 'A well-balanced sword that can be wielded with one or two hands.'
  }
}]);
```

### Example 2: Create Mythral Chainmail

```javascript
await actor.createEmbeddedDocuments('Item', [{
  name: 'Mythral Chainmail',
  type: 'equipment',
  img: 'icons/equipment/chest/breastplate-layered-steel.webp',
  system: {
    equipmentType: 'armor',
    locked: false,

    // Armor stats
    armorType: 'medium',
    rating: 3,
    immunities: [],

    // Equipment state
    equipped: false,

    // Economy (mythral multiplies base cost by 3x)
    baseCost: { gold: 50, silver: 0, copper: 0 },  // Final: 150g
    metal: 'mythral',  // Lightweight, -1 slot
    baseSlots: 2,  // Final: 1 slot
    quantity: 1,

    // Properties
    properties: ['Lightweight'],

    // Description
    description: 'Chainmail forged from mythral, as light as cloth but strong as steel.'
  }
}]);
```

### Example 3: Create an Alchemical Item

```javascript
await actor.createEmbeddedDocuments('Item', [{
  name: 'Alchemist\'s Fire',
  type: 'equipment',
  img: 'icons/consumables/potions/potion-bottle-corked-fire.webp',
  system: {
    equipmentType: 'alchemical',
    locked: false,

    // Alchemical properties
    consumable: true,
    uses: { value: 1, max: 1 },
    duration: 'Instant',

    // Damage
    damageType: 'fire',
    damageAmount: '2d6',

    // Equipment state
    equipped: false,

    // Economy
    baseCost: { gold: 0, silver: 50, copper: 0 },
    metal: 'none',
    baseSlots: 0,
    quantity: 3,  // Can stack

    // Description
    description: 'A flask of volatile chemicals that ignites on impact. Deals 2d6 fire damage.'
  }
}]);
```

### Example 4: Create a Magical Relic

```javascript
await actor.createEmbeddedDocuments('Item', [{
  name: 'Ring of Fire Resistance',
  type: 'equipment',
  img: 'icons/equipment/finger/ring-cabochon-gold-red.webp',
  system: {
    equipmentType: 'relic',
    locked: false,

    // Relic properties
    requiresAttunement: true,
    charges: { value: 0, max: 0 },  // No charges, passive effect
    magicalEffects: 'Grants resistance to fire damage while worn.',

    // Equipment state
    equipped: false,

    // Economy
    baseCost: { gold: 500, silver: 0, copper: 0 },
    metal: 'none',
    baseSlots: 0,
    quantity: 1,

    // Properties
    properties: ['Magical', 'Attunement'],

    // Description
    description: 'A golden ring set with a fiery ruby. Protects the wearer from flames.'
  }
}]);
```

### Example 5: Create a Backpack (Negative Slots)

```javascript
await actor.createEmbeddedDocuments('Item', [{
  name: 'Adventurer\'s Backpack',
  type: 'equipment',
  img: 'icons/containers/bags/pack-leather-brown-tan.webp',
  system: {
    equipmentType: 'gear',
    locked: false,

    // Gear properties
    gearCategory: 'Adventuring Gear',
    type: 'Container',

    // Equipment state
    equipped: true,  // Usually worn

    // Economy
    baseCost: { gold: 2, silver: 0, copper: 0 },
    metal: 'none',
    baseSlots: -5,  // NEGATIVE slots - increases carrying capacity!
    quantity: 1,

    // Properties
    properties: ['Container'],

    // Description
    description: 'A sturdy leather backpack. Increases carrying capacity by 5 slots.'
  }
}]);
```

### Example 6: Update Weapon Metal Type

```javascript
// Get weapon
const weapon = actor.items.get(weaponId);

// Change to adamant (doubles cost, adds +1 damage)
await weapon.update({
  'system.metal': 'adamant'
});

// The prepareDerivedData() method will automatically recalculate:
// - cost (baseCost × metalMultiplier)
// - metalEffect description
// - special damage bonuses
```

### Example 7: Toggle Versatile Weapon Grip

```javascript
// This is typically done through the UI, but can be done programmatically:
const weapon = actor.items.find(i => i.system.grip === 'V');

// Only allow if it's a versatile weapon
if (weapon.system.grip === 'V') {
  const currentState = weapon.system.equipmentState;

  // Toggle between oneHand and twoHands
  const nextState = currentState === 'oneHand' ? 'twoHands' : 'oneHand';

  await weapon.update({
    'system.equipmentState': nextState
  });

  // The currentDamage property will automatically update based on state
}
```

---

## Derived Data Properties

These properties are automatically calculated in `prepareDerivedData()`:

### All Equipment
- `cost` - Final cost object after metal multiplier
- `costDisplay` - Formatted cost string (e.g., "50g 10s")
- `slots` - Final slot count after metal modifiers
- `metalMultiplier` - Cost multiplier from metal type
- `metalEffect` - Description of metal effect
- `metalDisplay` - Localized metal name

### Weapons
- `currentDamage` - Current damage based on equipment state
- `equipped` - Boolean derived from equipment state
- `rangeAbbrev` - Abbreviated range (C/N/F)
- `rangeDisplay` - Full range name
- `gripDisplay` - Human-readable grip name
- `propertiesDisplay` - Comma-separated property list

### Armor
- `finalRating` - Rating after metal bonuses
- `ratingDisplay` - Formatted rating string
- `armorTypeDisplay` - Localized armor type name

---

## Best Practices

1. **Use `equipmentType` consistently** - Don't mix legacy weapon/armor items with new equipment items
2. **Validate grip transitions** - Use the actor-sheet methods for equipment state changes
3. **Set metal early** - Metal affects cost calculations, so set it during creation
4. **Use negative slots wisely** - Only for containers/backpacks that increase capacity
5. **Localize properties** - Use CONFIG.VAGABOND for property names and hints
6. **Enrich descriptions** - Always use TextEditor.enrichHTML() for descriptions
7. **Test derived data** - After updates, verify calculated properties are correct

---

## Related Files

- **Base Equipment Model:** `/module/data/base-equipment.mjs`
- **Legacy Weapon Model:** `/module/data/item-weapon.mjs`
- **Legacy Armor Model:** `/module/data/item-armor.mjs`
- **Legacy Gear Model:** `/module/data/item-gear.mjs`
- **Actor Sheet (equipment handlers):** `/module/sheets/actor-sheet.mjs`
- **Item Sheet:** `/module/sheets/item-sheet.mjs`
- **Templates:** `/templates/item/` and `/templates/actor/inventory.hbs`
- **Config:** `/module/config.mjs` (damage types, properties, etc.)
