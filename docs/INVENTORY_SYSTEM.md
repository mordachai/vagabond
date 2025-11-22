# Visual Inventory Grid System

## Overview
The inventory system is a visual slot-based grid (3 columns × 6 rows = 18 slots) similar to classic RPGs like Diablo or Resident Evil. Items can occupy 1-3 slots and can be rearranged via drag-and-drop.

---

## Architecture Components

### 1. **Configuration** (`module/helpers/config.mjs`)

Defines static data for the inventory system:

```javascript
// Metal type colors for weapon skill icon backgrounds
VAGABOND.metalColors = {
  'common': '#8b7355',
  'adamant': '#2d2d44',
  'coldIron': '#708090',
  'silver': '#c0c0c0',
  'mythral': '#e0e0ff',
  'orichalcum': '#daa520'
};

// Icon paths for visual elements
VAGABOND.icons = {
  weaponSkills: {
    'melee': 'systems/vagabond/assets/ui/weapon-skill-melee.webp',
    'ranged': 'systems/vagabond/assets/ui/weapon-skill-ranged.webp',
    'brawl': 'systems/vagabond/assets/ui/weapon-skill-brawl.webp',
    'finesse': 'systems/vagabond/assets/ui/weapon-skill-finesse.webp'
  },
  damageTypes: {
    'bludgeoning': 'systems/vagabond/assets/ui/bludgeoning-dmg-icn.webp',
    'piercing': 'systems/vagabond/assets/ui/piercing-dmg-icn.webp',
    'slashing': 'systems/vagabond/assets/ui/slashing-dmg-icn.webp',
    'fire': 'systems/vagabond/assets/ui/fire-dmg-icn.webp',
    // ... etc
  },
  grips: {
    'oneHanded': 'systems/vagabond/assets/ui/1h-grip-icn.webp',
    'twoHanded': 'systems/vagabond/assets/ui/2h-grip-icn.webp',
    'versatile': 'systems/vagabond/assets/ui/versatile-grip-icn.webp'
  }
};

// Range abbreviations
VAGABOND.rangeAbbreviations = {
  'close': 'C',
  'near': 'N',
  'far': 'F'
};
```

**Purpose**: Centralized configuration makes it easy to:
- Change colors across the entire system
- Update icon paths in one place
- Add new damage types, weapon skills, or metal types

---

### 2. **Data Preparation** (`module/sheets/actor-sheet.mjs`)

The actor sheet prepares inventory data for display in the template.

#### Key Method: `_prepareInventoryGrid(context, gear, weapons, armor)`

```javascript
_prepareInventoryGrid(context, gear, weapons, armor) {
  // Combine all inventory items
  const allInventoryItems = [...weapons, ...armor, ...gear];

  // Map items with visual data
  context.inventoryItems = allInventoryItems.map((item, index) => ({
    item: item,                                    // Original item object
    gridPosition: item.system.gridPosition || index, // Grid position (0-17)
    equipped: this._isItemEquipped(item),          // Is item equipped?
    metalColor: this._getMetalColor(item),         // Background color for weapon skill icon
    weaponSkillIcon: this._getWeaponSkillIcon(item), // Path to weapon skill icon
    damageTypeIcon: this._getDamageTypeIcon(item), // Path to damage type icon
  }));

  // Sort by grid position
  context.inventoryItems.sort((a, b) => a.gridPosition - b.gridPosition);

  // Calculate occupied slots
  const occupiedSlotCount = context.inventoryItems.reduce((sum, itemData) =>
    sum + (itemData.item.system.slots || 1), 0
  );

  // Calculate empty slots to fill the grid (max 18 total)
  const emptySlotCount = Math.max(0, 18 - occupiedSlotCount);
  const maxSlots = context.system.inventory.maxSlots || 17;

  // Create empty slot objects
  context.emptySlots = Array.from({ length: emptySlotCount }, (_, i) => {
    const slotIndex = occupiedSlotCount + i;
    return {
      index: slotIndex,
      displayNumber: slotIndex + 1,
      unavailable: slotIndex >= maxSlots // Slots beyond capacity are unavailable
    };
  });
}
```

#### Helper Methods:

**`_isItemEquipped(item)`**
```javascript
_isItemEquipped(item) {
  if (item.type === 'weapon') {
    return item.system.equipped === true;
  }
  if (item.type === 'armor') {
    return item.system.worn === true;
  }
  if (item.type === 'gear') {
    return item.system.equipped === true;
  }
  return false;
}
```

**`_getMetalColor(item)`**
```javascript
_getMetalColor(item) {
  if (item.type === 'weapon' && item.system.metal) {
    return VAGABOND.metalColors[item.system.metal] || VAGABOND.metalColors.common;
  }
  return null;
}
```

**`_getWeaponSkillIcon(item)`**
```javascript
_getWeaponSkillIcon(item) {
  if (item.type === 'weapon' && item.system.weaponSkill) {
    return VAGABOND.icons.weaponSkills[item.system.weaponSkill];
  }
  return null;
}
```

**`_getDamageTypeIcon(item)`**
```javascript
_getDamageTypeIcon(item) {
  if (item.type === 'weapon' && item.system.damageType) {
    return VAGABOND.icons.damageTypes[item.system.damageType];
  }
  return null;
}
```

---

### 3. **Template Structure** (`templates/actor/features.hbs`)

The inventory grid is rendered in the Features tab (lines 214-323).

#### Grid Container Structure:

```handlebars
{{! Visual Inventory Grid - 6 rows × 3 columns }}
<div class='inventory-grid-container'>
  <div class='inventory-grid' data-max-slots='{{system.inventory.maxSlots}}'>

    {{! Render inventory items }}
    {{#each inventoryItems as |itemData|}}
      <div class='inventory-card {{#if itemData.equipped}}equipped{{/if}}'
           data-item-id='{{itemData.item._id}}'
           style='grid-column: span {{itemData.item.system.slots}};'
           draggable='true'>
        <!-- Card content -->
      </div>
    {{/each}}

    {{! Render empty slots }}
    {{#each emptySlots as |slot|}}
      <div class='inventory-slot empty-slot {{#if slot.unavailable}}unavailable{{/if}}'>
        <div class='slot-number'>{{slot.displayNumber}}</div>
      </div>
    {{/each}}

  </div>
</div>
```

#### Inventory Card Structure:

Each item card contains:
1. **Header row**: Icon (weapon skill/armor/gear) + Item name
2. **Stats row**: Damage, grip, range, cost (weapons) or armor value/slots (armor/gear)

```handlebars
<div class='inventory-card-header'>
  {{! Weapon }}
  {{#if itemData.weaponSkillIcon}}
    <div class='weapon-skill-icon' style='background-color: {{itemData.metalColor}};'>
      <img src='{{itemData.weaponSkillIcon}}' alt='{{itemData.item.system.weaponSkill}}' />
    </div>
  {{/if}}

  {{! Armor }}
  {{#if (eq itemData.item.type 'armor')}}
    <div class='armor-icon'>A</div>
  {{/if}}

  {{! Gear }}
  {{#if (eq itemData.item.type 'gear')}}
    <div class='gear-icon'>G</div>
  {{/if}}

  <div class='item-name-display'>{{itemData.item.name}}</div>
</div>

<div class='inventory-card-stats'>
  {{! Weapon stats }}
  {{#if (eq itemData.item.type 'weapon')}}
    <div class='stat-group damage-group'>
      <span class='stat-label'>D:</span>
      <span class='stat-value'>{{itemData.item.system.damage}}</span>
      {{#if itemData.damageTypeIcon}}
        <img src='{{itemData.damageTypeIcon}}' class='damage-type-icon' />
      {{/if}}
    </div>
    <!-- Range, cost, etc -->
  {{/if}}

  {{! Armor/Gear stats }}
  <!-- Similar pattern -->
</div>
```

**Key Template Features:**
- `data-item-id`: Stores item ID for event handlers
- `style='grid-column: span X'`: Multi-slot items span multiple columns
- `.equipped` class: Applied to equipped items
- `.unavailable` class: Applied to empty slots beyond max capacity

---

### 4. **Styling** (`src/scss/components/_inventory-grid.scss`)

#### Grid Layout:

```scss
.inventory-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr); // 3 columns
  grid-auto-rows: 50px;                  // Fixed 50px height per row
  gap: 0;                                // No gaps between cells
  border: 1px solid $c-faint;            // Outer border
}
```

#### Borders Between Cells:

```scss
.inventory-card, .empty-slot {
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-top: none;   // Remove top border
  border-left: none;  // Remove left border
}

// First row gets top border
.inventory-card:nth-child(-n + 3),
.empty-slot:nth-child(-n + 3) {
  border-top: 1px solid rgba(0, 0, 0, 0.1);
}

// First column gets left border
.inventory-card:nth-child(3n + 1),
.empty-slot:nth-child(3n + 1) {
  border-left: 1px solid rgba(0, 0, 0, 0.1);
}
```

**Why this approach?**
- No gaps (`gap: 0`) ensures no space between slots
- Selective borders create clean grid lines
- `nth-child` selectors ensure proper borders on edges

#### Multi-slot Items:

```scss
.inventory-card[style*='span 2'] {
  // 2-slot item styling
}

.inventory-card[style*='span 3'] {
  // 3-slot item styling (full row)
}
```

Items use CSS Grid's `grid-column: span X` to occupy multiple slots.

#### Equipped Items:

```scss
.inventory-card.equipped {
  // Currently just has the class, visual styling to be added
  // Will use internal box-shadow to avoid size changes
}
```

#### Unavailable Slots:

```scss
.empty-slot.unavailable {
  background: rgba(0, 0, 0, 0.2); // Darker background
  .slot-number {
    color: rgba(255, 255, 255, 0.3); // Faded number
  }
}
```

---

### 5. **Event Handling** (`module/sheets/actor-sheet.mjs`)

#### Event Listener Setup:

The `_attachInventoryGridListeners()` method attaches all interactive behaviors:

```javascript
_attachInventoryGridListeners() {
  const inventoryCards = this.element.querySelectorAll('.inventory-card');

  inventoryCards.forEach(card => {
    const itemId = card.dataset.itemId;

    // Double-click: Open item sheet
    card.addEventListener('dblclick', (event) => {
      event.preventDefault();
      const item = this.actor.items.get(itemId);
      if (item) item.sheet.render(true);
    });

    // Right-click: Show context menu
    card.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this._showInventoryContextMenu(event, itemId, card);
    });

    // Hover 2+ seconds: Show tooltip
    let hoverTimeout;
    card.addEventListener('mouseenter', (event) => {
      hoverTimeout = setTimeout(() => {
        this._showInventoryTooltip(event, itemId, card);
      }, 2000);
    });

    card.addEventListener('mouseleave', () => {
      clearTimeout(hoverTimeout);
      this._hideInventoryTooltip();
    });

    // Drag-and-drop
    card.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', itemId);
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
  });

  // Drop handlers for rearranging
  this._attachInventoryDropHandlers();
}
```

#### Context Menu:

```javascript
_showInventoryContextMenu(event, itemId, card) {
  // Remove any existing menu
  this._hideInventoryContextMenu();

  const menu = document.createElement('div');
  menu.className = 'inventory-context-menu';
  menu.style.position = 'fixed';
  menu.style.left = `${event.clientX}px`;
  menu.style.top = `${event.clientY}px`;
  menu.style.zIndex = '10000';

  menu.innerHTML = `
    <div class='context-menu-item' data-action='equip'>Equip/Unequip</div>
    <div class='context-menu-item' data-action='edit'>Edit</div>
    <div class='context-menu-item' data-action='delete'>Delete</div>
  `;

  // Attach click handlers
  menu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      const action = e.target.dataset.action;
      const item = this.actor.items.get(itemId);

      if (action === 'equip') {
        // Toggle equipped state
        if (item.type === 'weapon') {
          await item.update({'system.equipped': !item.system.equipped});
        } else if (item.type === 'armor') {
          await item.update({'system.worn': !item.system.worn});
        } else if (item.type === 'gear') {
          await item.update({'system.equipped': !item.system.equipped});
        }
      } else if (action === 'edit') {
        item.sheet.render(true);
      } else if (action === 'delete') {
        await item.delete();
      }

      this._hideInventoryContextMenu();
    });
  });

  document.body.appendChild(menu);
  this._currentContextMenu = menu;

  // Close on click outside
  setTimeout(() => {
    document.addEventListener('click', () => this._hideInventoryContextMenu(), { once: true });
  }, 100);
}
```

**Key Points:**
- Uses `fixed` positioning with `clientX/Y` (not `pageX/Y`)
- High `z-index: 10000` to appear above Foundry UI
- Handles different item types (weapon/armor/gear) for equip toggle
- Auto-closes on outside click

#### Drag-and-Drop Item Swapping:

```javascript
_attachInventoryDropHandlers() {
  const inventoryCards = this.element.querySelectorAll('.inventory-card');

  inventoryCards.forEach(card => {
    card.addEventListener('dragover', (event) => {
      event.preventDefault();
      card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', async (event) => {
      event.preventDefault();
      card.classList.remove('drag-over');

      const draggedItemId = event.dataTransfer.getData('text/plain');
      const targetItemId = card.dataset.itemId;

      if (draggedItemId === targetItemId) return;

      // Get both items
      const draggedItem = this.actor.items.get(draggedItemId);
      const targetItem = this.actor.items.get(targetItemId);

      // Swap grid positions
      const draggedPos = draggedItem.system.gridPosition || 0;
      const targetPos = targetItem.system.gridPosition || 0;

      await draggedItem.update({'system.gridPosition': targetPos});
      await targetItem.update({'system.gridPosition': draggedPos});
    });
  });
}
```

**How it works:**
1. User drags an item card (`dragstart` stores item ID)
2. User drops on another item card (`drop` retrieves item ID)
3. Items swap their `gridPosition` values
4. Re-render updates the visual order

---

## Data Flow

### 1. **Actor Data → Template Data**

```
Actor.items (Foundry collection)
  ↓
_prepareContext() (actor-sheet.mjs)
  ↓
_prepareInventoryGrid() (actor-sheet.mjs)
  ↓
context.inventoryItems (array of enriched item data)
  ↓
Template (features.hbs)
  ↓
Rendered HTML
```

### 2. **User Interaction → Data Update**

```
User clicks/drags
  ↓
Event listener (actor-sheet.mjs)
  ↓
item.update() (Foundry API)
  ↓
Actor re-renders automatically
  ↓
_prepareContext() runs again
  ↓
Updated display
```

---

## Item Data Structure

### Weapon
```javascript
{
  type: 'weapon',
  system: {
    slots: 1-3,              // Grid slots occupied
    gridPosition: 0-17,      // Position in grid
    equipped: true/false,    // Is equipped?
    weaponSkill: 'melee',    // Weapon skill type
    metal: 'common',         // Metal type
    damage: '1d8',           // Damage dice
    damageType: 'slashing',  // Damage type
    grip: 'oneHanded',       // Grip type
    range: 'close',          // Range category
    cost: 100                // Cost in coins
  }
}
```

### Armor
```javascript
{
  type: 'armor',
  system: {
    slots: 1-3,
    gridPosition: 0-17,
    worn: true/false,        // Is worn? (armor uses 'worn' instead of 'equipped')
    armorValue: 3            // Armor rating
  }
}
```

### Gear
```javascript
{
  type: 'gear',
  system: {
    slots: 1-3,
    gridPosition: 0-17,
    equipped: true/false
  }
}
```

---

## Key Concepts for Replication

### To create a similar system for spells:

1. **Configuration** (`config.mjs`)
   - Define spell school colors
   - Define spell type icons
   - Define spell range abbreviations

2. **Data Preparation** (`actor-sheet.mjs`)
   - Create `_prepareSpellGrid()` method
   - Map spell data with visual enrichment
   - Calculate empty slots based on spell slots available

3. **Template** (e.g., `spells.hbs`)
   - Create grid container
   - Loop through prepared spell data
   - Add empty slots to fill grid
   - Use `data-spell-id` for event handling

4. **Styling** (`_spell-grid.scss`)
   - Copy inventory grid structure
   - Adjust colors/icons for spell theme
   - Consider different layout (e.g., 4×5 for spell slots)

5. **Event Handling** (`actor-sheet.mjs`)
   - `_attachSpellGridListeners()`
   - Double-click: Open spell sheet
   - Right-click: Prepare/unprepare spell
   - Drag: Rearrange prepared spells

---

## Slot Capacity System

**Maximum Slots Calculation:**
```
Max Slots = 8 + Might stat + bonus
```

Example: Character with Might 5 and +4 bonus = 17 max slots

**Visual Indication:**
- Slots 1-17: Available (normal background)
- Slot 18: Unavailable (darker background, faded number)

**Overload Warning:**
If occupied slots exceed max slots, show warning message above grid.

---

## Technical Notes

### Why `gridPosition` instead of array order?
- Allows persistent positioning even when items are added/removed
- Enables drag-and-drop rearrangement
- Supports future features like "lock position"

### Why `equipped` class instead of data attribute?
- CSS can directly target `.equipped` for styling
- No need for attribute selectors like `[data-equipped="true"]`
- Cleaner and more performant

### Why inline `style='grid-column: span X'`?
- Grid spanning is dynamic per item
- SCSS can't know item size at compile time
- Inline styles are the cleanest approach for dynamic CSS Grid

### Why `fixed` positioning for menus?
- Foundry VTT's UI uses complex layering
- `absolute` positioning can be clipped by parent containers
- `fixed` + high z-index ensures menus appear on top

---

## Future Enhancements

- **Auto-arrange button**: Sort items by size/type to minimize gaps
- **Favorites section**: Show equipped items in separate section (below Attack, above Spells)
- **Grip toggle**: For versatile weapons in favorites section
- **Equipped glow**: Internal box-shadow for equipped items in grid
- **Tooltip styling**: Enhanced tooltip with item description and properties
- **Drag from Foundry**: Support dragging items from Foundry sidebar into grid
- **Grid position optimization**: Automatically fill gaps when items are removed
