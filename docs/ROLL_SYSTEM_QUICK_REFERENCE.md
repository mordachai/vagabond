# Roll System Quick Reference

## Three Roll Trigger Types

### 1. Generic d20 Rolls (Abilities, Saves, Skills, Weapon Skills)
```handlebars
<label data-action='roll' data-roll='d20' data-label='{{label}}'>
  {{text}}
</label>
```
- **Handler:** `VagabondActorSheet._onRoll()`
- **File:** `/home/user/vagabond/module/sheets/actor-sheet.mjs` (lines 1150-1172)
- **Location in UI:** Features tab (abilities, saves, skills, weapon skills)

### 2. Weapon Attack Rolls
```handlebars
<div data-action='rollWeapon' data-item-id='{{item._id}}'>
  {{item.name}}
</div>
```
- **Handler:** `VagabondActorSheet._onRollWeapon()`
- **File:** `/home/user/vagabond/module/sheets/actor-sheet.mjs` (lines 938-1015)
- **Location in UI:** Features tab (equipped weapons), Inventory tab (weapon rows)
- **Special:** Automatically rolls damage on hit, checks equipment state

### 3. Spell Usage (Non-Roll)
```handlebars
<a data-action='useSpell' data-item-id='{{spell._id}}'>
  Use spell
</a>
```
- **Handler:** `VagabondActorSheet._onUseSpell()`
- **File:** `/home/user/vagabond/module/sheets/actor-sheet.mjs` (lines 1092-1140)
- **Location in UI:** Spells tab

### 4. Item Formula Rolls (Gear Items)
- **Handler:** `VagabondItem.roll()`
- **File:** `/home/user/vagabond/module/documents/item.mjs` (lines 37-70)
- **Trigger:** Click on gear item name in Features tab → calls `_onGearNameClick()` → calls `item.roll()`

---

## Handler Route Map

```
data-action='roll'
  → DEFAULT_OPTIONS.actions.roll
  → _onRoll()
  
data-action='rollWeapon'
  → DEFAULT_OPTIONS.actions.rollWeapon
  → _onRollWeapon()
  
data-action='useSpell'
  → DEFAULT_OPTIONS.actions.useSpell
  → _onUseSpell()
```

---

## Rolling Process Details

### Basic d20 Roll (_onRoll)
1. Extract formula from `data-roll`
2. Create `Roll(formula, actor.getRollData())`
3. Post to chat with flavor from `data-label`

### Weapon Attack (_onRollWeapon)
1. Fetch weapon item by ID
2. Check equipment state (must be equipped)
3. Get weapon skill and difficulty
4. Roll attack: `Roll('d20', ...)`
5. Compare total vs difficulty → determine hit
6. If hit: Roll damage and post both rolls
7. If miss: Post only attack roll

### Item Formula Roll (item.roll)
1. Check if `item.system.formula` exists
2. If no formula: post `item.system.description`
3. If formula: create Roll and post result

---

## Code Duplication Issues

### Issue 1: Roll Creation
Duplicated in:
- `_onRoll()` line 1164
- `_onRollWeapon()` line 961
- `VagabondItem.roll()` line 60

**Fix:** Extract to `VagabondRollHelper.createRoll()`

### Issue 2: Chat Message Posting
Duplicated in:
- `_onRoll()` lines 1165-1169
- `_onRollWeapon()` lines 999-1003 (twice)
- `_onUseSpell()` lines 1135-1138
- `VagabondItem.roll()` lines 63-67

**Fix:** Extract to `VagabondChatHelper.postRoll()`

### Issue 3: Equipment Validation
Only in `_onRollWeapon()` lines 948-953

**Fix:** Move to weapon item method `validateCanAttack()`

---

## Files to Modify (Refactoring Priority)

1. **`/home/user/vagabond/module/sheets/actor-sheet.mjs`** (Primary)
   - Lines 1150-1172: `_onRoll()` - simplify
   - Lines 938-1015: `_onRollWeapon()` - extract weapon logic to item
   - Lines 1092-1140: `_onUseSpell()` - already simple

2. **`/home/user/vagabond/module/documents/item.mjs`** (Secondary)
   - Lines 37-70: `roll()` - add weapon/spell handling

3. **Create: `/home/user/vagabond/module/helpers/roll-helper.mjs`** (New)
   - `VagabondRollHelper.createRoll()`
   - `VagabondRollHelper.postRoll()`

4. **Create: `/home/user/vagabond/module/helpers/chat-helper.mjs`** (New)
   - `VagabondChatHelper.postRoll()`
   - `VagabondChatHelper.postMessage()`

---

## Template Locations (Rollable Elements)

| File | Rollables | Lines | Type |
|------|-----------|-------|------|
| `/home/user/vagabond/templates/actor/features.hbs` | Abilities (6) | 22-27 | d20 |
| | Saves (4) | 58-64 | d20 |
| | Skills | 82-87 | d20 |
| | Weapon Skills | 107-111 | d20 |
| | Equipped Weapons | 121 | weapon |
| `/home/user/vagabond/templates/actor/inventory.hbs` | Weapons | 97 | weapon |
| `/home/user/vagabond/templates/actor/spells.hbs` | Spells | 42 | spell |

---

## Key Data Attributes Reference

### For Generic Rolls
- `data-action='roll'` - Routes to _onRoll
- `data-roll='d20'` - Formula to roll
- `data-label='...'` - Label for chat message
- `data-tooltip='...'` - Hover text

### For Weapon Rolls
- `data-action='rollWeapon'` - Routes to _onRollWeapon
- `data-item-id='...'` - Weapon item UUID

### For Spell Rolls
- `data-action='useSpell'` - Routes to _onUseSpell
- `data-item-id='...'` - Spell item UUID

---

## Common Patterns to Know

### Getting Item From Actor
```javascript
const weapon = this.actor.items.get(target.dataset.itemId);
```

### Creating a Roll
```javascript
const roll = new Roll('d20', this.actor.getRollData());
await roll.evaluate();
```

### Posting to Chat
```javascript
await roll.toMessage({
  speaker: ChatMessage.getSpeaker({ actor: this.actor }),
  flavor: 'Attack Roll',
  rollMode: game.settings.get('core', 'rollMode'),
});
```

### Checking Equipment State
```javascript
const state = weapon.system.equipmentState; // 'unequipped', 'oneHand', 'twoHands'
if (state === 'unequipped') {
  ui.notifications.warn('Not equipped!');
  return;
}
```

---

## Testing Checklist

- [ ] Click ability label in Features tab → posts d20 roll to chat
- [ ] Click save label in Features tab → posts d20 roll to chat  
- [ ] Click skill in Features tab → posts d20 roll to chat
- [ ] Click weapon skill in Features tab → posts d20 roll to chat
- [ ] Click equipped weapon in Features tab → posts attack roll to chat
- [ ] Click unequipped weapon → shows warning
- [ ] Weapon attacks that hit → also post damage roll
- [ ] Weapon attacks that miss → only post attack roll
- [ ] Natural 20 attack → marked as CRITICAL
- [ ] Click weapon name in Inventory tab → posts attack roll
- [ ] Click spell use button → posts spell info to chat (no roll)
- [ ] Gear with formula → rolls formula when clicked
- [ ] Gear without formula → posts description when clicked

---

## Quick Links

- Full Analysis: `/home/user/vagabond/ROLL_SYSTEM_ANALYSIS.md`
- Actor Sheet: `/home/user/vagabond/module/sheets/actor-sheet.mjs`
- Item Class: `/home/user/vagabond/module/documents/item.mjs`
- Features Template: `/home/user/vagabond/templates/actor/features.hbs`
- Inventory Template: `/home/user/vagabond/templates/actor/inventory.hbs`

