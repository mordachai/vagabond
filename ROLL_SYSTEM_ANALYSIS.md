# Vagabond/Foundry VTT Roll System - Comprehensive Analysis

## Executive Summary

The Vagabond system's roll architecture is **semi-centralized**, with the primary roll logic concentrated in `VagabondActorSheet` but scattered across multiple handler methods. There are **three primary roll trigger patterns** (generic d20, weapon attacks, spell usage) and **two separate implementation approaches** (sheet handlers vs. item methods). This creates code duplication and inconsistency opportunities.

---

## 1. ROLL TRIGGERS - How Rolls Are Initiated

### 1.1 Template Data Attributes

#### A. Generic Ability/Skill/Save Rolls
**Files:** 
- `/home/user/vagabond/templates/actor/features.hbs` (lines 22-27, 58-64, 82-87, 107-111)

**Pattern:**
```handlebars
<label
  class='ability-label rollable'
  data-action='roll'
  data-roll='d20'
  data-label='{{localize (lookup @root.config.abilities key)}} Check'
  data-tooltip='{{localize (lookup @root.config.abilityAbbreviations key)}}'
>{{localize (lookup @root.config.abilityAbbreviations key)}}</label>
```

**Rollable Elements:**
- Ability checks (STR, DEX, CON, INT, WIS, CHA) - lines 22-27
- Saves (Fortitude, Reflex, Will, Mental) - lines 58-64
- Skills (trained/untrained) - lines 82-87
- Weapon Skills (attacks) - lines 107-111

**Data Attributes Used:**
- `data-action='roll'` - Routes to `_onRoll` handler
- `data-roll='d20'` - The roll formula
- `data-label` - Display label for chat
- `data-tooltip` - Hover text

#### B. Weapon Attack Rolls
**Files:**
- `/home/user/vagabond/templates/actor/inventory.hbs` (line 97)
- `/home/user/vagabond/templates/actor/features.hbs` (line 121)

**Pattern:**
```handlebars
<div class='clickable' data-action='rollWeapon' data-item-id='{{item._id}}'>
  {{item.name}}
</div>
```

**Data Attributes Used:**
- `data-action='rollWeapon'` - Routes to `_onRollWeapon` handler
- `data-item-id='{{item._id}}'` - Identifies which weapon to roll

#### C. Spell Usage
**Files:**
- `/home/user/vagabond/templates/actor/spells.hbs` (line 42)

**Pattern:**
```handlebars
<a class='clickable' data-action='useSpell' data-item-id='{{spell._id}}' 
   data-tooltip='Use spell'>Use spell</a>
```

**Data Attributes Used:**
- `data-action='useSpell'` - Routes to `_onUseSpell` handler
- `data-item-id='{{spell._id}}'` - Identifies which spell

#### D. Item Rolls (Gear/Spell with formula)
**Files:**
- Uses item.roll() method from VagabondItem

**Pattern:**
```handlebars
<div class='clickable' data-action='viewDoc'>{{item.name}}</div>
```

---

### 1.2 Click Handler Registration

**File:** `/home/user/vagabond/module/sheets/actor-sheet.mjs`

**Lines 19-35:** Action handlers registered in `DEFAULT_OPTIONS`:
```javascript
actions: {
  onEditImage: this._onEditImage,
  viewDoc: this._viewDoc,
  createDoc: this._createDoc,
  deleteDoc: this._deleteDoc,
  toggleEffect: this._toggleEffect,
  roll: this._onRoll,                    // Generic d20 rolls
  rollWeapon: this._onRollWeapon,        // Weapon attacks
  toggleWeaponEquipment: this._onToggleWeaponEquipment,
  toggleArmorEquipment: this._onToggleArmorEquipment,
  useSpell: this._onUseSpell,            // Spell usage
  viewAncestry: this._viewAncestry,
  viewClass: this._viewClass,
  levelUp: this._onLevelUp,
  toggleFeature: this._onToggleFeature,
  togglePerk: this._onTogglePerk,
},
```

**Secondary Click Handlers:** Lines 323-407
- Additional handlers for gear items added in `_onRender()`:
  - `_onGearImageClick()` - Opens sheet
  - `_onGearNameClick()` - Calls item.roll() if available
  - `_onToggleEquipped()`
- Handlers for weapons:
  - `_onWeaponImageClick()`
  - `_onWeaponNameClick()` - Calls `_onRollWeapon()`
  - `_onWeaponContextMenu()`
- Handlers for armor:
  - `_onArmorImageClick()`
  - `_onArmorContextMenu()`

---

### 1.3 Hotbar Macros

**File:** `/home/user/vagabond/module/vagabond.mjs`

**Lines 157-176:** `rollItemMacro(itemUuid)` function
- Creates hotbar macros from dropped items
- Calls `item.roll()` on execution
- Formula comes from item system data

---

## 2. ROLL IMPLEMENTATION - Where Roll Logic Executes

### 2.1 Generic Roll Handler (d20 Checks)

**File:** `/home/user/vagabond/module/sheets/actor-sheet.mjs`

**Lines 1150-1172:** `_onRoll()` method
```javascript
static async _onRoll(event, target) {
  event.preventDefault();
  const dataset = target.dataset;

  // Handle item rolls.
  switch (dataset.rollType) {
    case 'item':
      const item = this._getEmbeddedDocument(target);
      if (item) return item.roll();
  }

  // Handle rolls that supply the formula directly.
  if (dataset.roll) {
    let label = dataset.label ? `[ability] ${dataset.label}` : '';
    let roll = new Roll(dataset.roll, this.actor.getRollData());
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: label,
      rollMode: game.settings.get('core', 'rollMode'),
    });
    return roll;
  }
}
```

**Characteristics:**
- Uses Foundry's `Roll` class with actor's roll data
- Posts directly to chat via `roll.toMessage()`
- Supports both direct formulas and item rolls
- Very simple - no difficulty checking

**What It Rolls:**
- Ability checks (d20)
- Saves (d20)
- Skill checks (d20)
- Weapon skill checks (d20)

---

### 2.2 Weapon Attack Handler

**File:** `/home/user/vagabond/module/sheets/actor-sheet.mjs`

**Lines 938-1015:** `_onRollWeapon()` method
```javascript
static async _onRollWeapon(event, target) {
  event.preventDefault();
  const itemId = target.dataset.itemId;
  const weapon = this.actor.items.get(itemId);

  if (!weapon || weapon.type !== 'weapon') {
    ui.notifications.error('Weapon not found!');
    return;
  }

  // Check if weapon is equipped
  const equipmentState = weapon.system.equipmentState || 'unequipped';
  if (equipmentState === 'unequipped') {
    ui.notifications.warn(`${weapon.name} is not equipped. Equip it first to attack.`);
    return;
  }

  // Get the weapon skill and difficulty
  const weaponSkillKey = weapon.system.weaponSkill;
  const weaponSkill = this.actor.system.weaponSkills[weaponSkillKey];
  const difficulty = weaponSkill?.difficulty || 10;

  // Roll the attack (d20)
  const attackRoll = new Roll('d20', this.actor.getRollData());
  await attackRoll.evaluate();

  // Check if the attack succeeds
  const isSuccess = attackRoll.total >= difficulty;
  const isCritical = attackRoll.total === 20;

  // Prepare the flavor text
  let flavorText = `<strong>${weapon.name}</strong> Attack<br/>`;
  flavorText += `<strong>Weapon Skill:</strong> ${weaponSkill?.label || weaponSkillKey} (Difficulty ${difficulty})<br/>`;
  flavorText += `<strong>Attack Roll:</strong> ${attackRoll.total}`;

  // If successful, roll damage
  let damageRoll = null;
  if (isSuccess) {
    flavorText += ` - <span style="color: green;">SUCCESS!</span><br/>`;

    // Roll damage using current damage (based on equipment state)
    const damageFormula = weapon.system.currentDamage;
    damageRoll = new Roll(damageFormula, this.actor.getRollData());
    await damageRoll.evaluate();

    flavorText += `<strong>Damage:</strong> ${damageRoll.total}`;

    // Add critical damage if applicable
    if (isCritical) {
      flavorText += ` <span style="color: gold;">(CRITICAL!)</span>`;
    }
  } else {
    flavorText += ` - <span style="color: red;">MISS!</span>`;
  }

  // Add weapon properties to flavor if any
  if (weapon.system.properties && weapon.system.properties.length > 0) {
    flavorText += `<br/><strong>Properties:</strong> ${weapon.system.propertiesDisplay}`;
  }

  // Send the attack roll to chat
  await attackRoll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    flavor: flavorText,
    rollMode: game.settings.get('core', 'rollMode'),
  });

  // If there was a damage roll, also send it to chat
  if (damageRoll) {
    await damageRoll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `<strong>${weapon.name}</strong> Damage`,
      rollMode: game.settings.get('core', 'rollMode'),
    });
  }

  return attackRoll;
}
```

**Characteristics:**
- Complex multi-step process: attack roll → determine success → damage roll
- Checks weapon equipment state before allowing roll
- Compares attack roll vs. weapon skill difficulty
- Automatically rolls damage on success
- Posts both attack and damage rolls separately
- Includes critical hit detection (20 = critical)
- Embeds weapon properties in flavor text

**Unique Logic:**
- Equipment state validation
- Difficulty-based success determination
- Automatic damage rolling on hit
- Dual chat messages (attack + damage)

---

### 2.3 Spell Usage Handler

**File:** `/home/user/vagabond/module/sheets/actor-sheet.mjs`

**Lines 1092-1140:** `_onUseSpell()` method
```javascript
static async _onUseSpell(event, target) {
  event.preventDefault();
  const itemId = target.dataset.itemId;
  const spell = this.actor.items.get(itemId);

  if (!spell || spell.type !== 'spell') {
    ui.notifications.error('Spell not found!');
    return;
  }

  // Prepare the chat message content
  let content = `<div class="spell-use">`;
  content += `<h3>${spell.name}</h3>`;

  // Add description
  if (spell.system.description) {
    content += `<p>${spell.system.description}</p>`;
  }

  // Add damage type
  if (spell.system.damageBase && spell.system.damageBase !== '-') {
    const damageLabel = game.i18n.localize(CONFIG.VAGABOND.damageTypes[spell.system.damageBase] || spell.system.damageBase);
    content += `<p><strong>Damage Type:</strong> ${damageLabel}</p>`;
  }

  // Add delivery info
  if (spell.system.delivery?.type) {
    const deliveryLabel = game.i18n.localize(CONFIG.VAGABOND.deliveryTypes[spell.system.delivery.type] || spell.system.delivery.type);
    content += `<p><strong>Delivery:</strong> ${deliveryLabel}`;
    if (spell.system.delivery.cost > 0) {
      content += ` (${spell.system.delivery.cost} Mana)`;
    }
    content += `</p>`;
  }

  // Add duration
  if (spell.system.duration) {
    content += `<p><strong>Duration:</strong> ${spell.system.duration}</p>`;
  }

  content += `</div>`;

  // Create the chat message
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
    content: content,
    type: CONST.CHAT_MESSAGE_TYPES.OTHER
  });
}
```

**Characteristics:**
- NOT a roll - just a chat message with spell information
- Posts spell details to chat (description, damage type, delivery, duration)
- No dice rolled
- Informational only

---

### 2.4 Item Roll Handler (Formula-Based)

**File:** `/home/user/vagabond/module/documents/item.mjs`

**Lines 37-70:** `roll()` method in VagabondItem class
```javascript
async roll(event) {
  const item = this;

  // Initialize chat data.
  const speaker = ChatMessage.getSpeaker({ actor: this.actor });
  const rollMode = game.settings.get('core', 'rollMode');
  const label = `[${item.type}] ${item.name}`;

  // If there's no roll data, send a chat message.
  if (!this.system.formula) {
    ChatMessage.create({
      speaker: speaker,
      rollMode: rollMode,
      flavor: label,
      content: item.system.description ?? '',
    });
  }
  // Otherwise, create a roll and send a chat message from it.
  else {
    // Retrieve roll data.
    const rollData = this.getRollData();

    // Invoke the roll and submit it to chat.
    const roll = new Roll(rollData.formula, rollData.actor);
    // If you need to store the value first, uncomment the next line.
    // const result = await roll.evaluate();
    roll.toMessage({
      speaker: speaker,
      rollMode: rollMode,
      flavor: label,
    });
    return roll;
  }
}
```

**Characteristics:**
- Checks for `system.formula` field
- If no formula: posts description as chat message
- If formula exists: rolls it and posts result
- Uses item's own `getRollData()` method
- Supports both description-only and formula rolls

---

## 3. CODE ORGANIZATION ANALYSIS

### 3.1 Current Architecture Map

```
TEMPLATES (*.hbs)
  ↓ data-action attributes
  ↓
ACTOR SHEET (actor-sheet.mjs)
  ├─ DEFAULT_OPTIONS.actions (router configuration)
  │  ├─ roll → _onRoll()
  │  ├─ rollWeapon → _onRollWeapon()
  │  ├─ useSpell → _onUseSpell()
  │  └─ [other non-roll actions]
  │
  ├─ _onRender() method (lines 323-407)
  │  └─ Additional click listeners for:
  │     ├─ Gear items → _onGearNameClick() → item.roll()
  │     └─ Weapon items → _onWeaponNameClick() → _onRollWeapon()
  │
  └─ Roll Methods:
     ├─ _onRoll() (lines 1150-1172)
     ├─ _onRollWeapon() (lines 938-1015)
     └─ _onUseSpell() (lines 1092-1140)
     
ITEM SHEET (item-sheet.mjs)
  └─ Item actions (non-roll: traits, prerequisites, properties)
  
ITEM DOCUMENT (documents/item.mjs)
  └─ roll() method (lines 37-70)
     └─ Formula-based rolls

HOTBAR MACROS (vagabond.mjs)
  └─ rollItemMacro() → item.roll()
```

### 3.2 Roll Methods - Patterns and Inconsistencies

#### Pattern 1: Generic d20 Rolls (SIMPLE)
**Method:** `_onRoll()`
- Input: `data-roll` + `data-label` from template
- Process: Create Roll, post to chat
- Output: Chat message
- Lines of code: ~20

#### Pattern 2: Weapon Attacks (COMPLEX)
**Method:** `_onRollWeapon()`
- Input: weapon item ID
- Process: 
  1. Fetch weapon from actor
  2. Validate equipment state
  3. Get difficulty from weapon skill
  4. Roll attack
  5. Check success vs difficulty
  6. If hit: roll damage
  7. Post attack roll to chat
  8. Post damage roll to chat (if hit)
- Output: Two chat messages (attack + damage)
- Lines of code: ~75

#### Pattern 3: Spell Usage (NON-ROLL)
**Method:** `_onUseSpell()`
- Input: spell item ID
- Process: Build HTML content, create chat message
- Output: Chat message with spell info
- Lines of code: ~48

#### Pattern 4: Item Formula Rolls (GENERIC)
**Method:** `VagabondItem.roll()`
- Input: item.system.formula + item.system.description
- Process:
  1. Check for formula
  2. If no formula: post description
  3. If formula: create Roll, post result
- Output: Chat message (description or roll result)
- Lines of code: ~33

### 3.3 Duplication Analysis

#### Duplication #1: Basic d20 Roll
**Occurs in:**
1. `_onRoll()` - abilities, saves, skills
2. `_onRollWeapon()` - attack portion (line 961)
3. Generic template pattern

**Duplicated Logic:**
```javascript
// _onRoll (line 1164)
let roll = new Roll(dataset.roll, this.actor.getRollData());

// _onRollWeapon (line 961)
const attackRoll = new Roll('d20', this.actor.getRollData());
```

#### Duplication #2: Chat Message Creation
**Occurs in:**
1. `_onRoll()` (lines 1165-1169)
2. `_onRollWeapon()` (lines 999-1003)
3. `_onRollWeapon()` damage (lines 1007-1011)
4. `VagabondItem.roll()` (lines 63-67)
5. `_onUseSpell()` (lines 1135-1138)

**Duplicated Pattern:**
```javascript
// _onRoll
await roll.toMessage({
  speaker: ChatMessage.getSpeaker({ actor: this.actor }),
  flavor: label,
  rollMode: game.settings.get('core', 'rollMode'),
});

// _onRollWeapon
await attackRoll.toMessage({
  speaker: ChatMessage.getSpeaker({ actor: this.actor }),
  flavor: flavorText,
  rollMode: game.settings.get('core', 'rollMode'),
});
```

#### Duplication #3: Equipment State Validation
**Only in:** `_onRollWeapon()` (lines 948-953)
**Should be:** Extracted to item validation method

---

## 4. CURRENT ARCHITECTURE SUMMARY

### Flow Diagram

```
USER CLICK on template element
  ↓
Foundry detects data-action attribute
  ↓
Routes to VagabondActorSheet.DEFAULT_OPTIONS.actions[action]
  ↓
Handler method executes (static async method)
  ↓
Handler EITHER:
  A) Creates Roll object → Posts to chat
  B) Calls item.roll()
  C) Creates ChatMessage directly
  ↓
Result appears in chat log
```

### Key Components

1. **Sheet Action Router** - Maps data-action → handler methods
2. **Roll Handlers** - Create Roll objects and post results
3. **Item Methods** - item.roll() for formula-based rolls
4. **Chat Posting** - Multiple patterns for posting messages

### Data Flow for Weapon Attack (Most Complex)

```
<div data-action='rollWeapon' data-item-id='abc123'>
  ↓
VagabondActorSheet._onRollWeapon(event, target)
  ↓
Fetch weapon via actor.items.get(itemId)
  ↓
Validate equipment state
  ↓
Get weapon skill → Get difficulty
  ↓
new Roll('d20', rollData).evaluate()
  ↓
isSuccess = roll.total >= difficulty
  ↓
IF success:
  new Roll(damageFormula, rollData).evaluate()
  ↓
Build flavorText with results + weapon properties
  ↓
attackRoll.toMessage({speaker, flavor, rollMode})
  ↓
IF success:
  damageRoll.toMessage({speaker, flavor, rollMode})
  ↓
Messages appear in chat
```

---

## 5. IMPROVEMENT OPPORTUNITIES

### Priority 1: Unify Roll Execution

**Current Problem:**
- Roll creation scattered across 4 different methods
- Chat posting code duplicated 5+ times
- No centralized roll builder

**Recommendation:**
```javascript
// Create RollHelper or RollUtility class
class VagabondRollHelper {
  static async rollAndPost(actor, formula, label, flavor) {
    const roll = new Roll(formula, actor.getRollData());
    await roll.evaluate();
    
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: flavor || label,
      rollMode: game.settings.get('core', 'rollMode'),
    });
    
    return roll;
  }
}

// Usage in _onRoll:
static async _onRoll(event, target) {
  const { roll, label } = target.dataset;
  if (roll) {
    return VagabondRollHelper.rollAndPost(
      this.actor, 
      roll, 
      label
    );
  }
}
```

### Priority 2: Extract Weapon Roll Logic

**Current Problem:**
- `_onRollWeapon()` is 75 lines of intermingled attack/damage logic
- Equipment validation tightly coupled
- Flavor text building mixed with roll logic

**Recommendation:**
```javascript
// In VagabondItem class
async rollAttack(actor) {
  // Validation
  if (this.type !== 'weapon') throw new Error('Not a weapon');
  if (!this.isEquipped) throw new Error('Not equipped');
  
  const weaponSkill = actor.system.weaponSkills[this.system.weaponSkill];
  const difficulty = weaponSkill?.difficulty || 10;
  
  // Roll
  const attackRoll = new Roll('d20', actor.getRollData());
  await attackRoll.evaluate();
  
  return {
    roll: attackRoll,
    difficulty: difficulty,
    isHit: attackRoll.total >= difficulty,
    isCritical: attackRoll.total === 20,
    skill: weaponSkill,
  };
}

async rollDamage(actor) {
  if (this.type !== 'weapon') throw new Error('Not a weapon');
  
  const roll = new Roll(this.system.currentDamage, actor.getRollData());
  await roll.evaluate();
  return roll;
}

// In sheet
static async _onRollWeapon(event, target) {
  const weapon = this.actor.items.get(target.dataset.itemId);
  
  try {
    const attackResult = await weapon.rollAttack(this.actor);
    
    // Post attack roll
    const flavor = weapon._buildAttackFlavor(attackResult);
    await attackResult.roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: flavor,
      rollMode: game.settings.get('core', 'rollMode'),
    });
    
    // Roll and post damage if hit
    if (attackResult.isHit) {
      const damageRoll = await weapon.rollDamage(this.actor);
      await damageRoll.toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: `<strong>${weapon.name}</strong> Damage`,
        rollMode: game.settings.get('core', 'rollMode'),
      });
    }
  } catch (error) {
    ui.notifications.error(error.message);
  }
}
```

### Priority 3: Standardize Item Roll Pattern

**Current Problem:**
- Some items use item.roll() (via formula field)
- Some items bypass it (weapons, spells)
- No consistent pattern

**Recommendation:**
```javascript
// In VagabondItem class
async roll(actor = null) {
  actor = actor || this.actor;
  
  switch (this.type) {
    case 'weapon':
      return actor?.sheet ? 
        // Should trigger via sheet instead
        null 
        : this.rollAttack(actor);
    
    case 'spell':
      return this.postSpellInfo(actor);
    
    case 'gear':
      if (this.system.formula) {
        return this.rollFormula(actor);
      }
      return this.postDescription(actor);
    
    default:
      if (this.system.formula) {
        return this.rollFormula(actor);
      }
      return this.postDescription(actor);
  }
}

private async rollFormula(actor) {
  // Existing formula logic
}

private async postDescription(actor) {
  // Existing description logic
}

private async postSpellInfo(actor) {
  // Existing spell logic
}
```

### Priority 4: Centralize Equipment Validation

**Current Problem:**
- Equipment state checked only in `_onRollWeapon()`
- Other weapon operations don't validate
- No centralized getter for weapon state

**Recommendation:**
```javascript
// In weapon data model
get isEquipped() {
  return this.system.equipmentState !== 'unequipped';
}

get equipmentStateLabel() {
  const states = {
    'unequipped': 'Unequipped',
    'oneHand': 'One-Handed',
    'twoHands': 'Two-Handed',
  };
  return states[this.system.equipmentState] || 'Unknown';
}

// In VagabondItem or weapon-specific method
validateCanAttack() {
  if (this.type !== 'weapon') {
    throw new Error('Not a weapon');
  }
  if (!this.isEquipped) {
    throw new Error(`${this.name} is ${this.equipmentStateLabel}. Equip it first to attack.`);
  }
  return true;
}
```

### Priority 5: Create Roll Data Builder

**Current Problem:**
- Each roll passes actor.getRollData() directly
- No transformation or enhancement
- Difficulty hardcoded in individual handlers

**Recommendation:**
```javascript
// In VagabondActor class
getRollDataForSkill(skillKey) {
  const skill = this.system.skills[skillKey];
  return {
    ...this.getRollData(),
    difficulty: skill?.difficulty || 10,
    skill: skill,
  };
}

getRollDataForWeaponSkill(weaponSkillKey) {
  const skill = this.system.weaponSkills[weaponSkillKey];
  return {
    ...this.getRollData(),
    difficulty: skill?.difficulty || 10,
    skill: skill,
  };
}

// Usage
static async _onRoll(event, target) {
  const { roll, skillKey } = target.dataset;
  const rollData = skillKey ? 
    this.actor.getRollDataForSkill(skillKey)
    : this.actor.getRollData();
  
  const rollObj = new Roll(roll, rollData);
  // ... rest of logic
}
```

---

## 6. SPECIFIC FILE LOCATIONS & LINE NUMBERS

### VagabondActorSheet (actor-sheet.mjs)

| Feature | Lines | Type |
|---------|-------|------|
| Action Router Config | 19-35 | Configuration |
| Generic Roll Handler | 1150-1172 | Method |
| Weapon Attack Handler | 938-1015 | Method |
| Spell Usage Handler | 1092-1140 | Method |
| Render Setup (click listeners) | 323-407 | Method |
| Weapon Equipment Toggle | 1026-1056 | Method |
| Armor Equipment Toggle | 1067-1082 | Method |
| Gear Item Handlers | 653-687 | Methods (3) |
| Weapon Item Handlers | 773-813 | Methods (3) |
| Armor Item Handlers | 818-857 | Methods (2) |

### VagabondItem (documents/item.mjs)

| Feature | Lines | Type |
|---------|-------|------|
| Item Roll Handler | 37-70 | Method |
| Roll Data Builder | 19-30 | Method |

### VagabondItemSheet (item-sheet.mjs)

| Feature | Lines | Type |
|---------|-------|------|
| Weapon Property Toggle | 592-611 | Method |
| Weapon Property Remove | 621-632 | Method |

### Templates

| Template | Rollables | Lines |
|----------|-----------|-------|
| features.hbs | Abilities (6), Saves (4), Skills (all), Weapon Skills (all), Equipped Weapons | 22-135 |
| inventory.hbs | Weapons (attack) | 97 |
| spells.hbs | Spells (use) | 42 |

### Hotbar/Macros (vagabond.mjs)

| Feature | Lines | Type |
|---------|-------|------|
| Roll Item Macro | 157-176 | Function |
| Macro Creation | 123-150 | Function |

---

## 7. RECOMMENDATIONS SUMMARY

### Immediate Actions (Quick Wins)
1. **Extract Chat Helper** - Create `VagabondChatHelper.postRoll()` to eliminate 5 duplications
2. **Create Roll Constants** - Document all `data-action` values and their handlers
3. **Add JSDoc Comments** - Document roll parameter requirements for each handler

### Short-term Refactoring (1-2 Sprints)
1. **Unify Item Rolls** - Move weapon attack logic into item.roll() method
2. **Centralize Equipment Logic** - Create weapon validation methods
3. **Extract Flavor Builders** - Separate flavor text generation from roll logic
4. **Create Roll Helpers** - VagabondRollHelper class for common patterns

### Long-term Architecture (Future)
1. **Roll System Abstraction** - Create RollHandler base class with subtypes
2. **Event-Driven** - Emit roll events that can be hooked/modified
3. **Plugin Architecture** - Allow items to define custom roll behavior
4. **Unified API** - Single entry point for all roll types

---

## 8. TESTING RECOMMENDATIONS

### Unit Tests Needed
1. Equipment validation for weapons
2. Damage roll triggering on successful attack
3. Critical hit detection
4. Difficulty comparison logic

### Integration Tests Needed
1. Click handler routing (data-action → method)
2. Chat message posting
3. Item roll with/without formula
4. Spell usage formatting

### Manual Testing Checklist
- [ ] All ability checks post d20 rolls
- [ ] Saves display correct difficulty
- [ ] Skills toggle trained state
- [ ] Weapon attacks check equipment state
- [ ] Weapon attacks roll damage on hit
- [ ] Weapons not equipped show warning
- [ ] Spells post correct format
- [ ] Hotbar macros call item.roll()
- [ ] Gear items with formula roll correctly
- [ ] Gear items without formula post description

---

## 9. CODE STATISTICS

**Roll-Related Code:**
- Total roll handler lines: ~150-200
- Duplicated code: ~50-70 lines
- Methods directly involved in rolls: 7
- Templates with rollable elements: 3
- Data attributes used: 3 main types

**Complexity Assessment:**
- Weapon roll: HIGH complexity (nested logic, multiple rolls)
- Generic roll: LOW complexity (single roll, direct post)
- Spell usage: LOW complexity (no roll, static content)
- Item formula: MEDIUM complexity (conditional logic)

