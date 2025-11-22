# Chat Cards System - Developer Guide

## Overview

The Vagabond system uses a unified chat card builder (`VagabondChatCard`) for creating rich, consistent chat messages. This class provides a fluent API for building cards for weapon attacks, spell casting, NPC actions, and more.

**Location:** `/module/helpers/chat-card.mjs`

## Table of Contents

1. [Basic Usage](#basic-usage)
2. [Fluent API Methods](#fluent-api-methods)
3. [Static Helper Methods](#static-helper-methods)
4. [Card Types](#card-types)
5. [Examples](#examples)

---

## Basic Usage

### Creating a Simple Chat Card

```javascript
import { VagabondChatCard } from './helpers/chat-card.mjs';

// Create a new card
const card = new VagabondChatCard()
  .setType('generic')
  .setTitle('Test Card')
  .setSubtitle('This is a test')
  .setDescription('<p>Some description text</p>');

// Send to chat
await card.send();
```

### Creating a Card with Rolls

```javascript
const roll = await new Roll('1d20+5').evaluate();

const card = new VagabondChatCard()
  .setType('skill-roll')
  .setActor(actor)
  .setTitle('Stealth Check')
  .addRoll(roll, 12)  // Roll object and difficulty
  .setOutcome('SUCCESS', false);

await card.send();
```

---

## Fluent API Methods

All methods return `this` to allow method chaining.

### Card Setup

#### `setType(type)`
Set the card type. Available types:
- `'generic'` - Generic card
- `'stat-roll'` - Stat check roll
- `'save-roll'` - Saving throw
- `'skill-roll'` - Skill check
- `'weapon-attack'` - Weapon attack
- `'spell-cast'` - Spell casting
- `'npc-action'` - NPC action
- `'npc-ability'` - NPC ability
- `'item-use'` - Item usage

```javascript
card.setType('weapon-attack');
```

#### `setActor(actor)`
Set the actor for this card. Automatically sets icon to actor's image if not already set.

```javascript
card.setActor(actor);
```

#### `setItem(item)`
Set the item for this card. Automatically sets icon to item's image if not already set.

```javascript
card.setItem(weapon);
```

### Display Properties

#### `setTitle(title)`
Set the card title (main heading).

```javascript
card.setTitle('Longsword Attack');
```

#### `setSubtitle(subtitle)`
Set the card subtitle (below title, typically actor name).

```javascript
card.setSubtitle('Grimbold the Brave');
```

#### `setIcon(icon)`
Set the card icon (path to image).

```javascript
card.setIcon('systems/vagabond/icons/weapon.svg');
```

#### `setDescription(description)`
Set the card description (enriched HTML).

**Important:** Description should be pre-enriched using `foundry.applications.ux.TextEditor.enrichHTML()`.

```javascript
const enriched = await foundry.applications.ux.TextEditor.enrichHTML(
  item.system.description,
  { async: true, secrets: actor.isOwner, relativeTo: item }
);
card.setDescription(enriched);
```

### Roll Data

#### `addRoll(roll, difficulty = null)`
Add a roll result to the card.

**Parameters:**
- `roll` - The Foundry Roll object
- `difficulty` - Optional difficulty number for success/fail checks

```javascript
const roll = await new Roll('1d20+3').evaluate();
card.addRoll(roll, 12);
```

#### `setOutcome(outcome, isCritical = false)`
Set the outcome of a roll.

**Parameters:**
- `outcome` - Outcome text: `'SUCCESS'`, `'FAIL'`, `'HIT'`, `'MISS'`, `'CRITICAL'`
- `isCritical` - Whether this is a critical result

```javascript
card.setOutcome('HIT', false);
card.setOutcome('CRITICAL', true);  // Critical hit
```

### Damage

#### `addDamage(damageRoll, damageType = 'Physical', isCritical = false)`
Add damage information to the card.

**Parameters:**
- `damageRoll` - Roll object or number
- `damageType` - Type of damage (uses `CONFIG.VAGABOND.damageTypes`)
- `isCritical` - Whether this is critical damage

```javascript
const damageRoll = await new Roll('2d6+3').evaluate();
card.addDamage(damageRoll, 'fire', false);

// Or with a static number
card.addDamage(10, 'physical', false);
```

**Available Damage Types:**
- `-` (None)
- `acid`, `fire`, `shock`, `poison`, `cold`
- `blunt`, `physical`, `necrotic`, `psychic`
- `healing`

### Metadata

#### `addMetadata(label, value)`
Add a metadata item (displayed as "Label: Value").

```javascript
card.addMetadata('Range', 'Close');
card.addMetadata('Duration', '1 hour');
```

### Footer Elements

#### `addTag(tag)`
Add a single footer tag.

```javascript
card.addTag('Brutal');
```

#### `addTags(tags)`
Add multiple footer tags.

```javascript
card.addTags(['Brutal', 'Cleave', 'Heavy']);
```

#### `addFooterAction(actionHtml)`
Add a footer action button (HTML string).

```javascript
card.addFooterAction(`
  <button class="vagabond-damage-button" data-damage="2d6" data-type="fire">
    <i class="fas fa-dice"></i> Roll Damage
  </button>
`);
```

### Property Details (Expandable Accordion)

#### `setPropertyDetails(properties)`
Set expandable property details (for weapon properties with hints).

**Parameters:**
- `properties` - Array of `{name, hint}` objects

```javascript
card.setPropertyDetails([
  { name: 'Brutal', hint: 'On a critical hit, roll damage twice' },
  { name: 'Cleave', hint: 'Hit an adjacent enemy on kill' }
]);
```

---

## Static Helper Methods

### `VagabondChatCard.isRollCritical(roll, actor)`
Check if a d20 roll is critical based on actor's crit number.

**Parameters:**
- `roll` - The Roll object
- `actor` - The actor (uses `actor.system.critNumber`)

**Returns:** `boolean`

```javascript
const roll = await new Roll('1d20+5').evaluate();
const isCritical = VagabondChatCard.isRollCritical(roll, actor);
```

### `VagabondChatCard.formatRollWithDice(roll)`
Format a roll result with die images.

**Parameters:**
- `roll` - The Roll object

**Returns:** HTML string with die results

```javascript
const roll = await new Roll('2d6+3').evaluate();
const formatted = VagabondChatCard.formatRollWithDice(roll);
// Returns: '<span class="roll-die">4</span> <span class="roll-die">5</span> <span class="roll-modifier">+3</span>'
```

### `VagabondChatCard.weaponAttack(actor, weapon, attackResult, damageRoll = null)`
Create and send a weapon attack card.

**Parameters:**
- `actor` - The actor performing the attack
- `weapon` - The weapon item
- `attackResult` - Object with `{ roll, difficulty, outcome, isCritical }`
- `damageRoll` - Optional damage roll if attack hit

**Returns:** `Promise<ChatMessage>`

```javascript
const attackRoll = await new Roll('1d20+5').evaluate();
const damageRoll = await new Roll('1d8+3').evaluate();

await VagabondChatCard.weaponAttack(
  actor,
  weapon,
  {
    roll: attackRoll,
    difficulty: 12,
    outcome: 'HIT',
    isCritical: false
  },
  damageRoll
);
```

### `VagabondChatCard.spellCast(actor, spell, spellCastResult, damageRoll = null)`
Create and send a spell cast card.

**Parameters:**
- `actor` - The actor casting the spell
- `spell` - The spell item
- `spellCastResult` - Object with `{ roll, difficulty, outcome, isCritical, spellState }`
- `damageRoll` - Optional damage roll if spell succeeded

**Returns:** `Promise<ChatMessage>`

```javascript
await VagabondChatCard.spellCast(
  actor,
  spell,
  {
    roll: castRoll,
    difficulty: 12,
    outcome: 'SUCCESS',
    isCritical: false,
    spellState: spell.system  // Include spell state for damage calculation
  },
  damageRoll
);
```

### `VagabondChatCard.npcAction(actor, action, actionIndex)`
Create and send an NPC action card.

**Parameters:**
- `actor` - The NPC actor
- `action` - The action object
- `actionIndex` - Index of the action in the actions array

**Returns:** `Promise<ChatMessage>`

```javascript
await VagabondChatCard.npcAction(actor, action, 0);
```

### `VagabondChatCard.npcAbility(actor, ability)`
Create and send an NPC ability card.

**Parameters:**
- `actor` - The NPC actor
- `ability` - The ability object

**Returns:** `Promise<ChatMessage>`

```javascript
await VagabondChatCard.npcAbility(actor, ability);
```

---

## Card Types

### Generic Card
Basic card with title, description, and optional metadata.

```javascript
new VagabondChatCard()
  .setType('generic')
  .setTitle('Item Used')
  .setDescription('<p>You use the healing potion</p>')
  .addMetadata('Effect', 'Restore 2d6 HP');
```

### Stat/Skill Roll Card
Card for ability checks and skill rolls.

```javascript
new VagabondChatCard()
  .setType('skill-roll')
  .setActor(actor)
  .setTitle('Stealth Check')
  .addRoll(roll, difficulty)
  .setOutcome('SUCCESS', false);
```

### Weapon Attack Card
Card for weapon attacks with damage.

```javascript
// Use the static helper method
await VagabondChatCard.weaponAttack(actor, weapon, attackResult, damageRoll);

// Or manually
new VagabondChatCard()
  .setType('weapon-attack')
  .setActor(actor)
  .setItem(weapon)
  .setTitle(weapon.name)
  .addRoll(attackRoll, targetArmor)
  .setOutcome('HIT', isCritical)
  .addDamage(damageRoll, weapon.system.damageType, isCritical)
  .addMetadata('Range', weapon.system.rangeDisplay)
  .setPropertyDetails(weaponProperties);
```

### Spell Cast Card
Card for spell casting with effects.

```javascript
// Use the static helper method
await VagabondChatCard.spellCast(actor, spell, spellCastResult, damageRoll);

// Or manually
new VagabondChatCard()
  .setType('spell-cast')
  .setActor(actor)
  .setItem(spell)
  .setTitle(spell.name)
  .addRoll(castRoll, difficulty)
  .setOutcome('SUCCESS', isCritical)
  .addDamage(damageRoll, damageType, isCritical)
  .setDescription(enrichedDescription);
```

### NPC Action Card
Card for NPC actions (attacks, special abilities with recharge).

```javascript
await VagabondChatCard.npcAction(actor, action, actionIndex);
```

### NPC Ability Card
Card for NPC passive abilities and traits.

```javascript
await VagabondChatCard.npcAbility(actor, ability);
```

---

## Examples

### Example 1: Simple Weapon Attack

```javascript
// Player attacks with longsword
const attackRoll = await new Roll('1d20+5').evaluate();
const targetArmor = 14;
const hit = attackRoll.total >= targetArmor;
const isCritical = VagabondChatCard.isRollCritical(attackRoll, actor);

let damageRoll = null;
if (hit) {
  damageRoll = await new Roll('1d8+3').evaluate();
}

await VagabondChatCard.weaponAttack(
  actor,
  weapon,
  {
    roll: attackRoll,
    difficulty: targetArmor,
    outcome: hit ? 'HIT' : 'MISS',
    isCritical: isCritical
  },
  damageRoll
);
```

### Example 2: Spell with Custom Description

```javascript
const spell = actor.items.get(spellId);
const castRoll = await new Roll('1d20+4').evaluate();
const difficulty = 12;
const success = castRoll.total >= difficulty;

// Enrich the spell description
const enrichedDesc = await foundry.applications.ux.TextEditor.enrichHTML(
  spell.system.description,
  { async: true, secrets: actor.isOwner, relativeTo: spell }
);

const card = new VagabondChatCard()
  .setType('spell-cast')
  .setActor(actor)
  .setItem(spell)
  .setTitle(spell.name)
  .addRoll(castRoll, difficulty)
  .setOutcome(success ? 'SUCCESS' : 'FAIL', false)
  .setDescription(enrichedDesc)
  .addMetadata('Tier', spell.system.tier)
  .addMetadata('Duration', spell.system.duration);

if (success && spell.system.damage) {
  const damageRoll = await new Roll(spell.system.damage).evaluate();
  card.addDamage(damageRoll, spell.system.damageType, false);
}

await card.send();
```

### Example 3: Custom Card with Footer Actions

```javascript
const card = new VagabondChatCard()
  .setType('item-use')
  .setActor(actor)
  .setTitle('Alchemist\'s Fire')
  .setDescription('<p>A flask of volatile chemicals that ignites on impact.</p>')
  .addMetadata('Range', 'Near')
  .addMetadata('Effect', 'Ignite target')
  .addFooterAction(`
    <button class="vagabond-damage-button"
            data-damage="2d6"
            data-type="fire"
            data-item-id="${item.id}">
      <i class="fas fa-fire"></i> Roll Fire Damage
    </button>
  `);

await card.send();
```

### Example 4: NPC Action with Revealed Damage

```javascript
// NPC performs an action
const action = actor.system.actions[0];

// This creates a card with a GM-only button to reveal damage
await VagabondChatCard.npcAction(actor, action, 0);

// When GM clicks the button, damage is revealed to players
// (handled automatically by the damage-helper.mjs)
```

---

## Best Practices

1. **Always enrich HTML** - Use `foundry.applications.ux.TextEditor.enrichHTML()` before setting descriptions
2. **Use static helpers** - For common card types (weapons, spells, NPC actions), use the static helper methods
3. **Chain methods** - Take advantage of the fluent API for cleaner code
4. **Localize damage types** - Use `CONFIG.VAGABOND.damageTypes` for consistency
5. **Check for criticals** - Use `VagabondChatCard.isRollCritical()` instead of manual checks
6. **Validate rolls** - Always await roll evaluation before passing to card methods

---

## Template Location

The chat card template is located at:
`/templates/chat/chat-card.hbs`

This template is rendered using `foundry.applications.handlebars.renderTemplate()` (V13+).

---

## Related Files

- **Chat Card Builder:** `/module/helpers/chat-card.mjs`
- **Damage Helper:** `/module/helpers/damage-helper.mjs`
- **Chat Hook:** `/module/vagabond.mjs` (renderChatMessageHTML hook)
- **Template:** `/templates/chat/chat-card.hbs`
- **Styles:** `/src/scss/components/_chat-card.scss`
