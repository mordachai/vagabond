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
      };

      // Add range abbreviation for weapons
      if (item.system.range) {
        itemData.item.system.rangeAbbr = EquipmentHelper.getRangeAbbreviation(item);
      }

      return itemData;
    });

    // Sort by grid position
    context.inventoryItems.sort((a, b) => a.gridPosition - b.gridPosition);

    // Calculate overload for warning message
    const maxSlots = this.actor.system.inventory?.maxSlots || 20;
    const occupiedSlots = this.actor.system.inventory?.occupiedSlots || 0;
    const overloadAmount = Math.max(0, occupiedSlots - maxSlots);
    context.isOverloaded = overloadAmount > 0;
    context.overloadAmount = overloadAmount;

    // DYNAMIC GRID SIZE - Show all items + empty slots to display all capacity numbers up to maxSlots
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

    // Calculate how many empty slots we need to show remaining capacity
    // capacityNumber is now at the next available capacity number
    // We need empty slots until capacityNumber reaches maxSlots + 1
    const remainingCapacity = maxSlots - (capacityNumber - 1);
    const emptySlotCount = Math.max(0, remainingCapacity);

    // Create empty slots to show remaining capacity
    context.emptySlots = Array.from({ length: emptySlotCount }, (_, i) => {
      const gridPosition = totalItemCount + i;
      const slotNumber = capacityNumber + i;

      return {
        index: gridPosition,
        displayNumber: slotNumber,
        unavailable: false, // All these slots are within capacity
      };
    });

    // Grid size is total items + empty slots (no rounding to rows)
    const gridSize = totalItemCount + emptySlotCount;
    const gridRows = Math.ceil(gridSize / 4); // Calculate rows for CSS, but don't force size

    context.gridSize = gridSize;
    context.gridRows = gridRows;
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
    const isAlchemical = EquipmentHelper.isAlchemical(item);
    const hasAlchemicalDamage =
      isAlchemical && item.system.damageType && item.system.damageType !== '-';
    const isArmor = EquipmentHelper.isArmor(item);
    const isGear = EquipmentHelper.isGear(item);

    // Determine if "Use" option should be shown
    let showUseOption = false;

    if (isWeapon) {
      // Weapons can only be "used" (attacked with) if equipped
      showUseOption = isEquipped;
    } else if (isArmor) {
      // Armor cannot be "used"
      showUseOption = false;
    } else if (isGear) {
      // Gear can only be "used" if it's consumable
      showUseOption = item.system.isConsumable === true;
    } else {
      // Alchemicals, relics, and other items can be used
      showUseOption = true;
    }

    // Build menu items
    const menuItems = [];

    // Use option
    if (showUseOption) {
      menuItems.push({
        label: 'Use',
        icon: 'fas fa-hand-sparkles',
        enabled: true,
        action: async () => {
          // For weapons or alchemicals with damage, use rollWeapon
          if (isWeapon || hasAlchemicalDamage) {
            const { VagabondActorSheet } = globalThis.vagabond.applications;
            await VagabondActorSheet._onRollWeapon.call(this.sheet, event, {
              dataset: { itemId },
            });
          } else {
            // For everything else, use useItem (which delegates to item.roll())
            const { VagabondActorSheet } = globalThis.vagabond.applications;
            await VagabondActorSheet._onUseItem.call(this.sheet, event, { dataset: { itemId } });
          }
        },
      });
    }

    // Send to Chat
    menuItems.push({
      label: 'Send to Chat',
      icon: 'fas fa-comment',
      enabled: true,
      action: async () => {
        await VagabondChatCard.gearUse(this.actor, item);
      },
    });

    // Equip/Unequip
    menuItems.push({
      label: isEquipped ? 'Unequip' : 'Equip',
      icon: `fas fa-${isEquipped ? 'times' : 'check'}`,
      enabled: true,
      action: async () => {
        if (isWeapon && item.system.equipmentState !== undefined) {
          const newState = isEquipped ? 'unequipped' : 'oneHand';
          await item.update({ 'system.equipmentState': newState });
        }
        // For armor, update worn state
        else if (item.type === 'armor') {
          await item.update({ 'system.worn': !isEquipped });
        }
        // For other items (gear, etc), update equipped
        else if (item.system.equipped !== undefined) {
          await item.update({ 'system.equipped': !isEquipped });
        }
      },
    });

    // Edit
    menuItems.push({
      label: 'Edit',
      icon: 'fas fa-edit',
      enabled: true,
      action: () => {
        item.sheet.render(true);
      },
    });

    // Delete
    menuItems.push({
      label: 'Delete',
      icon: 'fas fa-trash',
      enabled: true,
      action: async () => {
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: `Delete ${item.name}?` },
          content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
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
    let editLabel = 'Edit';

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
      editLabel = 'Edit Ancestry';
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
      editLabel = 'Edit Class';
    }

    // Build menu items
    const menuItems = [
      {
        label: 'Send to Chat',
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
        label: 'Delete',
        icon: 'fas fa-trash',
        enabled: true,
        action: async () => {
          const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: `Delete ${item.name}?` },
            content: `<p>Are you sure you want to delete <strong>${item.name}</strong>?</p>`,
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

    const isWeapon = EquipmentHelper.isWeapon(item);
    const isArmor = EquipmentHelper.isArmor(item);
    const isRelic = EquipmentHelper.isRelic(item);
    const isGear = EquipmentHelper.isGear(item) || EquipmentHelper.isAlchemical(item);

    // Header: Image (100x100) + Type above Name + Lore (if relic) + Close button
    let html = `
      <div class="mini-sheet-header">
        <img src="${item.img}" alt="${item.name}" class="mini-sheet-image" />
        <div class="mini-sheet-title">
          <span class="mini-sheet-type">${this._formatItemType(item)}</span>
          <h3>${item.name}</h3>
          ${isRelic && item.system.lore ? `<div class="mini-sheet-lore">${item.system.lore}</div>` : ''}
        </div>
        <button class="mini-sheet-close" type="button" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
    `;

    // Description (full width, no label)
    if (item.system.description) {
      html += `<div class="mini-sheet-description">${item.system.description}</div>`;
    }

    // Stats (two columns)
    if (isWeapon) {
      html += this._buildWeaponStats(item);
    } else if (isArmor) {
      html += this._buildArmorStats(item);
    } else if (isGear || isRelic) {
      html += this._buildGearStats(item);
    }

    // Properties with descriptions (full width at bottom)
    if (isWeapon && item.system.properties && item.system.properties.length > 0) {
      html += this._buildWeaponProperties(item);
    }

    return html;
  }

  /**
   * Build weapon stats HTML (two-column grid)
   * @param {VagabondItem} item - The weapon item
   * @returns {string} HTML
   * @private
   */
  _buildWeaponStats(item) {
    const damageType = item.system.currentDamageType || item.system.damageType || '';
    return `
      <div class="mini-sheet-stats">
        <div class="stat-row">
          <span class="stat-name">Damage</span>
          <span class="stat-value">${item.system.currentDamage || item.system.damage || '—'} ${damageType}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Range</span>
          <span class="stat-value">${item.system.rangeDisplay || item.system.range || '—'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Grip</span>
          <span class="stat-value">${item.system.gripDisplay || item.system.grip || '—'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Weapon Skill</span>
          <span class="stat-value">${item.system.weaponSkill || '—'}</span>
        </div>
        ${item.system.metal && item.system.metal !== 'common' ? `
        <div class="stat-row">
          <span class="stat-name">Metal</span>
          <span class="stat-value">${item.system.metal}</span>
        </div>
        ` : ''}
        <div class="stat-row">
          <span class="stat-name">Cost</span>
          <span class="stat-value">${item.system.costDisplay || item.system.cost || '0'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Slots</span>
          <span class="stat-value">${item.system.slots || 1}</span>
        </div>
      </div>
    `;
  }

  /**
   * Build armor stats HTML (two-column grid)
   * @param {VagabondItem} item - The armor item
   * @returns {string} HTML
   * @private
   */
  _buildArmorStats(item) {
    return `
      <div class="mini-sheet-stats">
        <div class="stat-row">
          <span class="stat-name">Armor Rating</span>
          <span class="stat-value">${item.system.finalRating || item.system.rating || '—'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Type</span>
          <span class="stat-value">${item.system.armorType || '—'}</span>
        </div>
        ${item.system.metal && item.system.metal !== 'common' ? `
        <div class="stat-row">
          <span class="stat-name">Metal</span>
          <span class="stat-value">${item.system.metal}</span>
        </div>
        ` : ''}
        <div class="stat-row">
          <span class="stat-name">Cost</span>
          <span class="stat-value">${item.system.costDisplay || item.system.cost || '0'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Slots</span>
          <span class="stat-value">${item.system.slots || 1}</span>
        </div>
      </div>
    `;
  }

  /**
   * Build gear stats HTML (two-column grid)
   * @param {VagabondItem} item - The gear item
   * @returns {string} HTML
   * @private
   */
  _buildGearStats(item) {
    return `
      <div class="mini-sheet-stats">
        ${item.system.quantity ? `
        <div class="stat-row">
          <span class="stat-name">Quantity</span>
          <span class="stat-value">${item.system.quantity}</span>
        </div>
        ` : ''}
        <div class="stat-row">
          <span class="stat-name">Cost</span>
          <span class="stat-value">${item.system.costDisplay || item.system.cost || '0'}</span>
        </div>
        <div class="stat-row">
          <span class="stat-name">Slots</span>
          <span class="stat-value">${item.system.slots || 1}</span>
        </div>
      </div>
    `;
  }

  /**
   * Build weapon properties with descriptions
   * @param {VagabondItem} item - The weapon item
   * @returns {string} HTML
   * @private
   */
  _buildWeaponProperties(item) {
    const config = CONFIG.VAGABOND;

    return `
      <div class="mini-sheet-properties">
        <div class="mini-sheet-label">Properties</div>
        <div class="property-list">
          ${item.system.properties.map(prop => {
            const descriptionKey = config.weaponPropertyHints?.[prop] || '';
            const description = descriptionKey ? game.i18n.localize(descriptionKey) : '';
            return `
              <div class="property-row">
                <span class="property-name">${prop}:</span>
                <span class="property-description">${description}</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Format item type for display
   * @param {VagabondItem} item - The item
   * @returns {string} Formatted type
   * @private
   */
  _formatItemType(item) {
    if (item.type === 'equipment') {
      return item.system.equipmentType.charAt(0).toUpperCase() + item.system.equipmentType.slice(1);
    }
    return item.type.charAt(0).toUpperCase() + item.type.slice(1);
  }

  /**
   * Setup event listeners for inventory grid cards
   * Called after render to attach click, double-click, and context menu handlers
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
    });
  }
}
