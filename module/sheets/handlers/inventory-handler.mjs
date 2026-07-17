import * as ItemSections from '../../helpers/item-sections.mjs';
import { activateHandItem } from '../../helpers/hand-item-activation.mjs';

/**
 * Handler for inventory-related functionality in the character sheet.
 * Manages inventory grid preparation, item enrichment, context menus, and mini-sheets.
 */
export class InventoryHandler {
  /**
   * @param {VagabondActorSheet} sheet - The parent actor sheet
   */
  constructor(sheet) {
    this.sheet = sheet;
    this.actor = sheet.actor;
    this._currentContextMenu = null;
    this._currentMiniSheet = null;
    this._dragState = null;
  }

  // ===========================
  // Grid Preparation
  // ===========================

  /**
   * Prepare inventory grid with all items and empty slots
   * @param {Object} context - The render context
   * @param {Array} gear - Gear items
   * @param {Array} weapons - Weapon items
   * @param {Array} armor - Armor items
   * @param {Array} containers - Container items
   */
  prepareInventoryGrid(context, gear, weapons, armor, containers) {
    // Import equipment helper
    const { EquipmentHelper } = globalThis.vagabond.utils;

    // Combine all inventory items (exclude items inside containers)
    const allInventoryItems = [...weapons, ...armor, ...gear, ...containers].filter(
      (item) => !item.system.containerId
    );

    // Prepare item data for inventory cards
    context.inventoryItems = allInventoryItems.map((item, index) => {
      const itemData = {
        item: item,
        gridPosition: item.system.gridPosition ?? index,
        equipped: EquipmentHelper.isEquipped(item),
        metalColor: EquipmentHelper.getMetalColor(item),
        weaponSkillIcon: EquipmentHelper.getWeaponSkillIcon(item),
        damageTypeIcon: EquipmentHelper.getDamageTypeIcon(item),
        isSlotZero: (item.system.slots || item.system.baseSlots || 0) === 0,
        totalSlots: item.system.slots || item.system.baseSlots || 0,
        requiresBound: item.system.requiresBound || false,
        bound: item.system.bound || false,
      };

      // Add range abbreviation for weapons
      if (item.system.range) {
        itemData.item.system.rangeAbbr = EquipmentHelper.getRangeAbbreviation(item);
      }

      return itemData;
    });

    // Sort by grid position
    context.inventoryItems.sort((a, b) => a.gridPosition - b.gridPosition);

    // Get inventory slot data (with fatigue integration)
    const baseMaxSlots = this.actor.system.inventory?.baseMaxSlots || 20;
    const maxSlots = this.actor.system.inventory?.maxSlots || 20; // Effective max (after fatigue)
    const occupiedSlots = this.actor.system.inventory?.occupiedSlots || 0;
    const currentFatigue = this.actor.system.inventory?.fatigueSlots || 0; // Current fatigue value (0-5)

    // Calculate overload for warning message
    const overloadAmount = Math.max(0, occupiedSlots - maxSlots);
    context.isOverloaded = overloadAmount > 0;
    context.overloadAmount = overloadAmount;

    // DYNAMIC GRID SIZE - Show all items + empty slots to display all capacity numbers up to baseMaxSlots
    const totalItemCount = context.inventoryItems.length;

    // NEW NUMBERING LOGIC:
    // Numbers represent "capacity slots" - each item consumes slots equal to its size
    // A 3-slot item consumes capacity numbers 1, 2, 3 (shows "1" on card)
    // A 2-slot item consumes capacity numbers 4, 5 (shows "4" on card)
    let capacityNumber = 1; // Sequential capacity slot number (1, 2, 3...)

    // Assign numbers to items (skip slot-0 items)
    context.inventoryItems.forEach((itemData) => {
      if (!itemData.isSlotZero) {
        itemData.displayNumber = capacityNumber; // Show starting number
        capacityNumber += itemData.totalSlots; // Increment by slot size!
      } else {
        itemData.displayNumber = null; // Slot-0 items have no number
      }
    });

    // Calculate how many empty slots we need to show full base capacity (including fatigue slots)
    // capacityNumber is now at the next available capacity number
    // We need empty slots until capacityNumber reaches baseMaxSlots + 1
    const remainingCapacity = baseMaxSlots - (capacityNumber - 1);
    const emptySlotCount = Math.max(0, remainingCapacity);

    // Create empty slots to show full base capacity (mark fatigue-occupied slots)
    // Fatigue occupies the LAST N slots (where N = currentFatigue)
    context.emptySlots = Array.from({ length: emptySlotCount }, (_, i) => {
      const gridPosition = totalItemCount + i;
      const slotNumber = capacityNumber + i;

      // Check if this slot is fatigue-occupied (beyond effective maxSlots)
      const isFatigueOccupied = slotNumber > maxSlots;

      return {
        index: gridPosition,
        displayNumber: slotNumber,
        unavailable: isFatigueOccupied, // Mark fatigue slots as unavailable
        fatigueOccupied: isFatigueOccupied, // Flag for red skull overlay
      };
    });

    // Grid size is total items + empty slots (no rounding to rows)
    const gridSize = totalItemCount + emptySlotCount;
    const gridRows = Math.ceil(gridSize / 4); // Calculate rows for CSS, but don't force size

    context.gridSize = gridSize;
    context.gridRows = gridRows;

    // Bound system data for header counter
    context.currentBounds = this.actor.system.inventory?.currentBounds || 0;
    context.maxBounds = this.actor.system.inventory?.maxBounds || 3;

    // Build bounds pips array for template rendering
    context.boundsPips = Array.from({ length: context.maxBounds }, (_, i) => ({
      filled: i < context.currentBounds,
    }));
  }

  // ===========================
  // Context Menus
  // ===========================

  /**
   * Show context menu for inventory item
   * @param {Event} event - The contextmenu event
   * @param {string} itemId - The item ID
   */
  async showInventoryContextMenu(event, itemId) {
    event.preventDefault();
    event.stopPropagation();

    // Remove any existing context menu
    this.hideInventoryContextMenu();

    const item = this.actor.items.get(itemId);
    if (!item) {
      console.log('Item not found for context menu:', itemId);
      return;
    }

    // Import helpers
    const { EquipmentHelper } = globalThis.vagabond.utils;
    const { ContextMenuHelper } = globalThis.vagabond.utils;
    const { VagabondChatCard } = globalThis.vagabond.utils;

    const isEquipped = EquipmentHelper.isEquipped(item);
    const isWeapon = EquipmentHelper.isWeapon(item);
    const isArmor = EquipmentHelper.isArmor(item);
    const isGear = EquipmentHelper.isGear(item);

    // Determine if "Use" option should be shown
    let showUseOption = false;

    if (isWeapon) {
      // Use auto-equips if needed, so it's always available
      showUseOption = true;
    } else if (isArmor) {
      // Armor cannot be "used"
      showUseOption = false;
    } else if (isGear) {
      // Gear can be "used" if it's consumable, or if it occupies hands
      // (e.g. a torch — Use auto-equips it, so it must be reachable even
      // before the item is ever equipped)
      showUseOption = item.system.isConsumable === true || (item.system.handsRequired ?? 0) > 0;
    } else {
      // Alchemicals, relics, and other items can be used
      showUseOption = true;
    }

    // Build menu items
    const menuItems = [];

    // Use option
    if (showUseOption) {
      menuItems.push({
        label: game.i18n.localize('VAGABOND.ContextMenu.Use'),
        icon: 'fas fa-hand-sparkles',
        enabled: true,
        action: async () => {
          // Equips the item first if it occupies hands and isn't already
          // equipped (weapons, torches, etc.), then performs its action.
          await activateHandItem({ actor: this.actor, item, event, rollHandler: this.sheet.rollHandler });
        },
      });
    }

    // Send to Chat
    menuItems.push({
      label: game.i18n.localize('VAGABOND.ContextMenu.SendToChat'),
      icon: 'fas fa-comment',
      enabled: true,
      action: async () => {
        await VagabondChatCard.gearUse(this.actor, item);
      },
    });

    // Equip/Unequip
    menuItems.push({
      label: game.i18n.localize(isEquipped ? 'VAGABOND.ContextMenu.Unequip' : 'VAGABOND.ContextMenu.Equip'),
      icon: `fas fa-${isEquipped ? 'times' : 'check'}`,
      enabled: true,
      action: async () => {
        const newState = isEquipped ? 'unequipped' : EquipmentHelper.defaultEquipState(item);
        await EquipmentHelper.equipWithHandLimit(this.actor, item.id, newState);
      },
    });

    // Bound / Unbind (only for items that require binding)
    if (item.system.requiresBound) {
      const isBound = item.system.bound === true;
      menuItems.push({
        label: game.i18n.localize(isBound ? 'VAGABOND.ContextMenu.Unbind' : 'VAGABOND.ContextMenu.Bind'),
        icon: 'fa-solid fa-diamond',
        enabled: true,
        action: async () => {
          // If trying to bind, check the actor's bounds limit
          if (!isBound) {
            const currentBounds = this.actor.system.inventory?.currentBounds ?? 0;
            const maxBounds = this.actor.system.inventory?.maxBounds ?? 3;
            if (currentBounds >= maxBounds) {
              ui.notifications.warn(game.i18n.format('VAGABOND.UI.Labels.BoundsLimitReached', {
                name: item.name,
                current: currentBounds,
                max: maxBounds,
              }));
              return;
            }
          }
          await item.update({ 'system.bound': !isBound });
        },
      });
    }

    // Edit
    menuItems.push({
      label: game.i18n.localize('VAGABOND.ContextMenu.Edit'),
      icon: 'fas fa-edit',
      enabled: true,
      action: () => {
        item.sheet.render(true);
      },
    });

    // Delete
    menuItems.push({
      label: game.i18n.localize('VAGABOND.ContextMenu.Delete'),
      icon: 'fas fa-trash',
      enabled: true,
      action: async () => {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.format('VAGABOND.ContextMenu.DeleteItemTitle', { name: item.name }) },
          content: game.i18n.format('VAGABOND.ContextMenu.DeleteItemContent', { name: item.name }),
          rejectClose: false,
          modal: true,
        });
        if (confirmed) {
          await item.delete();
        }
      },
    });

    // Create context menu
    this._currentContextMenu = ContextMenuHelper.create({
      position: { x: event.clientX, y: event.clientY },
      items: menuItems,
      onClose: () => {
        this._currentContextMenu = null;
      },
      className: 'inventory-context-menu',
    });
  }

  /**
   * Show context menu for features, traits, and perks
   * @param {Event} event - The contextmenu event
   * @param {string|object} itemIdOrData - For perks: item ID string. For traits/features: object with {type, index}
   * @param {string} [itemType] - 'perk' (only used when itemIdOrData is a string)
   */
  async showFeatureContextMenu(event, itemIdOrData, itemType) {
    event.preventDefault();
    event.stopPropagation();

    this.hideInventoryContextMenu();

    const { ContextMenuHelper } = globalThis.vagabond.utils;
    const { VagabondChatCard } = globalThis.vagabond.utils;

    let item = null;
    let sourceItem = null;
    let featureData = null;
    let canDelete = false;
    let editLabel = game.i18n.localize('VAGABOND.ContextMenu.Edit');

    // Handle perks (real items)
    if (typeof itemIdOrData === 'string') {
      item = this.actor.items.get(itemIdOrData);
      if (!item) {
        console.log('Perk not found:', itemIdOrData);
        return;
      }
      canDelete = true;
    }
    // Handle traits (from ancestry)
    else if (itemIdOrData.type === 'trait') {
      sourceItem = this.actor.items.find((i) => i.type === 'ancestry');
      if (!sourceItem || !sourceItem.system.traits) {
        console.log('Ancestry or traits not found');
        return;
      }
      featureData = sourceItem.system.traits[itemIdOrData.index];
      if (!featureData) {
        console.log('Trait not found at index:', itemIdOrData.index);
        return;
      }
      editLabel = game.i18n.localize('VAGABOND.ContextMenu.EditAncestry');
    }
    // Handle features (from class)
    else if (itemIdOrData.type === 'feature') {
      sourceItem = this.actor.items.find((i) => i.type === 'class');
      if (!sourceItem || !sourceItem.system.levelFeatures) {
        console.log('Class or features not found');
        return;
      }
      featureData = sourceItem.system.levelFeatures[itemIdOrData.index];
      if (!featureData) {
        console.log('Feature not found at index:', itemIdOrData.index);
        return;
      }
      editLabel = game.i18n.localize('VAGABOND.ContextMenu.EditClass');
    }

    // Build menu items
    const menuItems = [
      {
        label: game.i18n.localize('VAGABOND.ContextMenu.SendToChat'),
        icon: 'fas fa-comment',
        enabled: true,
        action: async () => {
          if (item) {
            // Perk
            await VagabondChatCard.itemUse(this.actor, item);
          } else if (featureData) {
            // Trait or Feature
            await VagabondChatCard.featureDataUse(
              this.actor,
              featureData,
              sourceItem,
              itemIdOrData.type
            );
          }
        },
      },
      {
        label: editLabel,
        icon: 'fas fa-edit',
        enabled: true,
        action: () => {
          if (item) {
            item.sheet.render(true);
          } else if (sourceItem) {
            sourceItem.sheet.render(true);
          }
        },
      },
    ];

    // Add delete option for perks only
    if (canDelete) {
      menuItems.push({
        label: game.i18n.localize('VAGABOND.ContextMenu.Delete'),
        icon: 'fas fa-trash',
        enabled: true,
        action: async () => {
          const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: game.i18n.format('VAGABOND.ContextMenu.DeleteItemTitle', { name: item.name }) },
            content: game.i18n.format('VAGABOND.ContextMenu.DeleteItemContent', { name: item.name }),
            rejectClose: false,
            modal: true,
          });
          if (confirmed) {
            await item.delete();
          }
        },
      });
    }

    // Create context menu
    this._currentContextMenu = ContextMenuHelper.create({
      position: { x: event.clientX, y: event.clientY },
      items: menuItems,
      onClose: () => {
        this._currentContextMenu = null;
      },
      className: 'inventory-context-menu',
    });
  }

  /**
   * Hide context menu
   */
  hideInventoryContextMenu() {
    if (this._currentContextMenu) {
      const { ContextMenuHelper } = globalThis.vagabond.utils;
      ContextMenuHelper.close(this._currentContextMenu);
      this._currentContextMenu = null;
    }
  }

  // ===========================
  // Mini Sheets
  // ===========================

  /**
   * Show mini-sheet popup for inventory item
   * @param {Event} event - The click event
   * @param {string} itemId - The item ID
   */
  showInventoryMiniSheet(event, itemId) {
    const item = this.actor.items.get(itemId);
    if (!item) return;

    // Remove any existing mini-sheet
    this.hideInventoryMiniSheet();

    const miniSheet = document.createElement('div');
    miniSheet.className = 'inventory-mini-sheet';
    miniSheet.style.position = 'fixed';
    miniSheet.style.zIndex = '10000';

    // Position near the click
    const x = Math.min(event.clientX + 10, window.innerWidth - 360);
    const y = Math.min(event.clientY + 10, window.innerHeight - 400);
    miniSheet.style.left = `${x}px`;
    miniSheet.style.top = `${y}px`;

    // Build content based on item type
    const content = this._buildMiniSheetContent(item);
    miniSheet.innerHTML = content;

    document.body.appendChild(miniSheet);
    this._currentMiniSheet = miniSheet;

    // Add close button handler
    const closeButton = miniSheet.querySelector('.mini-sheet-close');
    if (closeButton) {
      closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        this.hideInventoryMiniSheet();
      });
    }

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', this.hideInventoryMiniSheet.bind(this), { once: true });
    }, 10);

    // Prevent the click from immediately closing it
    event.stopPropagation();
  }

  /**
   * Hide mini-sheet
   */
  hideInventoryMiniSheet() {
    if (this._currentMiniSheet) {
      this._currentMiniSheet.remove();
      this._currentMiniSheet = null;
    }
  }

  /**
   * Build HTML content for mini-sheet based on item type
   * @param {VagabondItem} item - The item
   * @returns {string} HTML content
   * @private
   */
  _buildMiniSheetContent(item) {
    const { EquipmentHelper } = globalThis.vagabond.utils;

    const isSpell = item.type === 'spell';
    const isRelic = EquipmentHelper.isRelic(item);

    // Header: Image (100x100) + Type above Name + Lore (if relic) + Close button.
    // Header chrome stays here; the body sections are shared (item-sections.mjs).
    let html = `
      <div class="mini-sheet-header">
        <img src="${item.img}" alt="${item.name}" class="mini-sheet-image" />
        <div class="mini-sheet-title">
          <span class="mini-sheet-type">${ItemSections.formatItemType(item)}</span>
          <h3>${item.name}</h3>
          ${isRelic && item.system.lore ? `<div class="mini-sheet-lore">${item.system.lore}</div>` : ''}
          ${isSpell ? ItemSections.buildSpellDamageBase(item) : ''}
        </div>
        <button class="mini-sheet-close" type="button" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;

    // Description + stat grid + weapon properties (shared with HUD accordion)
    html += ItemSections.buildItemDetailSections(item);

    return html;
  }

  /**
   * Setup event listeners for inventory grid cards
   * Called after render to attach click, double-click, context menu, and drag-to-reorder handlers
   */
  setupListeners() {
    const inventoryCards = this.sheet.element.querySelectorAll('.inventory-card');

    inventoryCards.forEach(card => {
      const itemId = card.dataset.itemId;

      // Single-click: Show mini-sheet
      card.addEventListener('click', (event) => {
        event.preventDefault();
        this.showInventoryMiniSheet(event, itemId);
      });

      // Double-click: Open item sheet
      card.addEventListener('dblclick', (event) => {
        event.preventDefault();
        const item = this.actor.items.get(itemId);
        if (item) item.sheet.render(true);
      });

      // Right-click: Show context menu
      card.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        this.showInventoryContextMenu(event, itemId);
      });

      // Drag-to-reorder: dragstart/dragend on the card directly.
      // Foundry's DragDrop calls stopPropagation() on .draggable elements,
      // so grid-level delegation never sees dragstart — bind directly instead.
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';

        this._dragState = {
          active: true,
          draggedItemId: itemId,
          draggedCard: card,
          originalNextSibling: card.nextSibling,
          gridEl: card.closest('.inventory-grid'),
        };

        requestAnimationFrame(() => {
          if (this._dragState?.active) card.classList.add('reorder-dragging');
        });
      });

      card.addEventListener('dragend', () => {
        if (!this._dragState?.active) return; // drop already cleaned up

        // Cancelled drag: restore original position
        const { draggedCard, originalNextSibling, gridEl } = this._dragState;
        draggedCard?.classList.remove('reorder-dragging');
        if (draggedCard && gridEl) {
          gridEl.insertBefore(draggedCard, originalNextSibling ?? null);
        }
        this._dragState = null;
      });
    });

    // dragover + drop on the grid (confirmed to fire via event bubbling)
    const inventoryGrid = this.sheet.element.querySelector('.inventory-grid');
    this.setupDragToReorder(inventoryGrid);
  }

  // ===========================
  // Drag-to-Reorder
  // ===========================

  /**
   * Setup drag-to-reorder within the inventory grid.
   * Moving the dragged card in the DOM during dragover lets the CSS Grid reflow
   * in real-time, giving a live preview of where the item will land.
   * @param {HTMLElement} gridEl - The .inventory-grid element
   */
  setupDragToReorder(gridEl) {
    if (!gridEl) return;
    this._cleanupDrag();

    gridEl.addEventListener('dragover', (e) => {
      if (!this._dragState?.active) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';

      const { draggedCard } = this._dragState;
      const insertBefore = this._getInsertionPoint(e.clientX, e.clientY, gridEl, draggedCard);

      if (insertBefore) {
        if (draggedCard.nextSibling !== insertBefore) {
          gridEl.insertBefore(draggedCard, insertBefore);
        }
      } else {
        // Move to end of items (before empty slots if any)
        const firstEmpty = gridEl.querySelector('.inventory-slot.empty-slot');
        if (firstEmpty && draggedCard.nextSibling !== firstEmpty) {
          gridEl.insertBefore(draggedCard, firstEmpty);
        } else if (!firstEmpty && gridEl.lastChild !== draggedCard) {
          gridEl.appendChild(draggedCard);
        }
      }
    });

    gridEl.addEventListener('drop', async (e) => {
      if (!this._dragState?.active) return;

      e.preventDefault();
      e.stopPropagation();

      const { draggedCard } = this._dragState;
      this._dragState = null;
      draggedCard?.classList.remove('reorder-dragging');

      const orderedIds = [...gridEl.querySelectorAll('.inventory-card')]
        .map(c => c.dataset.itemId)
        .filter(Boolean);

      if (orderedIds.length > 0) {
        const updates = orderedIds.map((id, i) => ({ _id: id, 'system.gridPosition': i }));
        try {
          await this.actor.updateEmbeddedDocuments('Item', updates);
        } catch (err) {
          console.error('Vagabond | Failed to save inventory order:', err);
        }
      }
    });
  }

  /**
   * Find the element in the grid to insert the dragged card before.
   * Iterates cards in DOM order (= visual order) and returns the first one
   * whose bounding rect is entirely below the cursor, or whose left half
   * contains the cursor.
   * @param {number} cursorX
   * @param {number} cursorY
   * @param {HTMLElement} gridEl
   * @param {HTMLElement} draggedCard
   * @returns {HTMLElement|null} Insert before this element; null = insert at end
   * @private
   */
  _getInsertionPoint(cursorX, cursorY, gridEl, draggedCard) {
    const candidates = [...gridEl.querySelectorAll('.inventory-card')].filter(c => c !== draggedCard);

    for (const card of candidates) {
      const rect = card.getBoundingClientRect();

      // Cursor is above this card's row → insert before it
      if (cursorY < rect.top) return card;

      // Cursor is on this card's row, in the left half → insert before it
      if (cursorY <= rect.bottom && cursorX < rect.left + rect.width / 2) return card;
    }

    return null; // Insert at the end
  }

  /**
   * Remove drag visual state without persisting anything
   * @private
   */
  _cleanupDrag() {
    if (!this._dragState) return;
    this._dragState.draggedCard?.classList.remove('reorder-dragging');
    this._dragState = null;
  }
}
