/**
 * Gear Step Manager - Handles gear selection logic
 */
import { BaseStepManager } from './base-step-manager.mjs';

export class GearStepManager extends BaseStepManager {
  constructor(stateManager, dataService, configSystem) {
    super(stateManager, dataService, configSystem);
    
    // Define action handlers for gear step
    this.actionHandlers = {
      'selectOption': this._onSelectOption.bind(this),
      'addToTray': this._onAddToTray.bind(this),
      'removeFromTray': this._onRemoveFromTray.bind(this),
      'clearTray': this._onClearTray.bind(this)
    };

    // Note: toggleCategory is handled by the main builder, not here
    
    // Required data for gear step
    this.requiredData = ['gear'];
  }

  /**
   * Step name identifier
   */
  get stepName() {
    return 'gear';
  }

  /**
   * Get state paths managed by this step
   * @protected
   */
  _getStatePaths() {
    return ['gear', 'previewUuid'];
  }

  /**
   * Prepare gear-specific context data
   * @protected
   */
  async _prepareStepSpecificContext(state, openCategories) {
    const availableGear = await this._loadGearOptions(openCategories);
    const selectedGear = state.gear || [];
    const previewUuid = state.previewUuid;

    // Calculate budget from starting pack or use default
    const budget = await this._calculateBudget(state);

    // Get preview item details
    let previewItem = null;
    if (previewUuid) {
      try {
        const item = await fromUuid(previewUuid);
        if (item) {
          // Enrich the description for display
          const enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(item.system.description || '', {
            async: true,
            secrets: false,
            relativeTo: item
          });

          previewItem = {
            ...item.toObject(),
            enrichedDescription: enrichedDescription,
            displayStats: this._prepareGearDisplayStats(item)
          };
        }
      } catch (error) {
        console.warn('Failed to load preview gear:', error);
      }
    }

    // Prepare tray data
    const trayData = await this._prepareTrayData(selectedGear);

    return {
      availableOptions: availableGear,
      options: availableGear, // Sidebar expects 'options'
      selectedGear: selectedGear,
      selectedItem: previewItem,
      previewItem: previewItem,
      hasSelection: selectedGear.length > 0,
      showTray: true,
      trayData: trayData,
      isGearStep: true,
      budget: budget,
      instruction: (selectedGear.length === 0 && !previewUuid) ?
        game.i18n.localize('VAGABOND.CharBuilder.Instructions.Gear') : null
    };
  }

  /**
   * Load available gear options organized by compendium
   * @private
   */
  async _loadGearOptions(openCategories = new Set()) {
    const state = this.getCurrentState();
    const selectedGear = state.gear || [];
    const previewUuid = state.previewUuid;

    // Find all compendiums that contain equipment items
    const equipmentCompendiums = [];

    for (const pack of game.packs) {
      // Only include Item compendiums
      if (pack.metadata.type !== 'Item') continue;

      // Check if this compendium contains equipment items
      const index = await pack.getIndex({ fields: ["type", "system.equipmentType"] });
      const hasEquipment = index.some(i => i.type === 'equipment');

      if (hasEquipment) {
        equipmentCompendiums.push(pack);
      }
    }

    // Load items from each compendium and organize as folders
    const results = [];

    for (const pack of equipmentCompendiums) {
      const index = await pack.getIndex({
        fields: ["img", "type", "system.baseCost", "system.baseSlots", "system.equipmentType"]
      });

      // Filter to only equipment items
      const equipmentItems = index.filter(i => i.type === 'equipment');

      if (equipmentItems.length === 0) continue;

      // Sort items alphabetically
      const sortedItems = [...equipmentItems].sort((a, b) => a.name.localeCompare(b.name));

      // Create a folder/group for this compendium
      results.push({
        label: pack.metadata.label, // Compendium name as folder name
        id: pack.metadata.name,
        isOpen: openCategories.has(pack.metadata.name),
        items: sortedItems.map(i => ({
          ...i,
          selected: selectedGear.includes(i.uuid),
          previewing: i.uuid === previewUuid
        }))
      });
    }

    return results;
  }

  /**
   * Calculate budget based on starting pack or default
   * @private
   */
  async _calculateBudget(state) {
    let budgetInSilver = 300; // Default 300 silver (3 gold)

    // Check if a starting pack is selected
    if (state.selectedStartingPack) {
      try {
        const packItem = await fromUuid(state.selectedStartingPack);
        if (packItem && packItem.system.currency) {
          const curr = packItem.system.currency;
          // Convert to silver: 1 gold = 100 silver, 1 copper = 0.1 silver
          budgetInSilver = (curr.gold || 0) * 100 + (curr.silver || 0) + (curr.copper || 0) / 10;
        }
      } catch (error) {
        console.warn('Failed to load starting pack for budget calculation:', error);
      }
    }

    // Calculate current spending
    const selectedGear = state.gear || [];
    let currentSpending = 0;

    for (const uuid of selectedGear) {
      try {
        const item = await fromUuid(uuid);
        if (item) {
          currentSpending += this._calculateItemCost(item);
        }
      } catch (error) {
        console.warn(`Failed to load gear item ${uuid} for cost calculation:`, error);
      }
    }

    return {
      total: budgetInSilver,
      spent: currentSpending,
      remaining: budgetInSilver - currentSpending,
      isOver: (budgetInSilver - currentSpending) < 0
    };
  }

  /**
   * Prepare gear display stats
   * @private
   */
  _prepareGearDisplayStats(item) {
    const sys = item.system || {};
    const eqType = sys.equipmentType;
    
    const displayStats = {
      type: item.type,
      subType: sys.equipmentType || "",
      slots: sys.baseSlots || 0,
      cost: sys.cost || 0,
      rarity: sys.rarity || "common"
    };

    // Equipment-specific stats
    if (eqType === 'weapon') {
      displayStats.weaponSkill = sys.weaponSkill || null;
      displayStats.range = sys.range || null;
      displayStats.grip = sys.grip || null;
      displayStats.damage1h = sys.damageOneHand || null;
      displayStats.damage2h = sys.damageTwoHands || null;
      displayStats.damageType = sys.damageType || "-";
    } else if (eqType === 'armor') {
      displayStats.armorValue = sys.armorValue || 0;
      displayStats.armorType = sys.armorType || null;
    } else if (eqType === 'shield') {
      displayStats.shieldValue = sys.shieldValue || 0;
    }

    return displayStats;
  }

  /**
   * Prepare tray data for selected gear
   * @private
   */
  async _prepareTrayData(selectedGear) {
    const trayItems = [];

    for (const uuid of selectedGear) {
      try {
        const item = await fromUuid(uuid);
        if (item) {
          trayItems.push({
            uuid: uuid,
            name: item.name,
            img: item.img,
            type: item.type,
            displayStats: this._prepareGearDisplayStats(item)
          });
        }
      } catch (error) {
        console.warn(`Failed to load gear ${uuid}:`, error);
      }
    }

    return {
      gear: trayItems,
      isEmpty: trayItems.length === 0
    };
  }

  /**
   * Handle gear selection (preview)
   * @private
   */
  async _onSelectOption(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    // Set preview
    this.updateState('previewUuid', uuid);
  }

  /**
   * Handle adding gear to tray
   * @private
   */
  async _onAddToTray(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    const state = this.getCurrentState();
    const currentGear = state.gear || [];

    // Check if already selected
    if (currentGear.includes(uuid)) {
      ui.notifications.warn('Gear already selected');
      return;
    }

    try {
      // Validate the gear exists
      const item = await fromUuid(uuid);
      if (!item) {
        ui.notifications.error('Invalid gear selection');
        return;
      }

      // Calculate item cost and update total
      const itemCost = this._calculateItemCost(item);
      const currentCost = state.gearCostSpent || 0;
      const newCost = currentCost + itemCost;

      // Add to selected gear
      const newGear = [...currentGear, uuid];
      this.updateState('gear', newGear);
      this.updateState('gearCostSpent', newCost);
      this.updateState('previewUuid', uuid);


    } catch (error) {
      console.error('Failed to add gear:', error);
      ui.notifications.error('Failed to add gear');
    }
  }

  /**
   * Handle removing gear from tray
   * @private
   */
  async _onRemoveFromTray(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    const state = this.getCurrentState();
    const currentGear = state.gear || [];

    if (!currentGear.includes(uuid)) {
      ui.notifications.warn('Gear not in selection');
      return;
    }

    try {
      const item = await fromUuid(uuid);

      // Calculate item cost and update total
      const itemCost = this._calculateItemCost(item);
      const currentCost = state.gearCostSpent || 0;
      const newCost = Math.max(0, currentCost - itemCost); // Ensure non-negative

      const newGear = currentGear.filter(gearUuid => gearUuid !== uuid);

      this.updateState('gear', newGear);
      this.updateState('gearCostSpent', newCost);

      // Clear preview if removing the previewed item
      if (state.previewUuid === uuid) {
        this.updateState('previewUuid', null);
      }


    } catch (error) {
      console.error('Failed to remove gear:', error);
      ui.notifications.error('Failed to remove gear');
    }
  }

  /**
   * Handle clearing all gear from tray
   * @private
   */
  async _onClearTray(event, target) {
    const state = this.getCurrentState();
    const currentGear = state.gear || [];

    if (currentGear.length === 0) {
      return;
    }

    this.updateState('gear', []);
    this.updateState('gearCostSpent', 0);
    this.updateState('previewUuid', null);

  }

  /**
   * Calculate the cost of an item in silver
   * @param {Object} item - The gear item
   * @returns {number} Cost in silver
   * @private
   */
  _calculateItemCost(item) {
    if (!item || !item.system) {
      return 0;
    }

    // Try to get cost from various possible fields
    let cost = item.system.cost || item.system.baseCost;

    if (!cost) {
      // Try currency object as fallback
      cost = item.system.currency;
    }

    if (!cost) {
      return 0;
    }

    // Handle cost object with gold/silver/copper
    if (typeof cost === 'object') {
      // Convert to silver (base currency)
      // 1 gold = 100 silver, 1 silver = 1, 1 copper = 0.1 silver
      const goldInSilver = (cost.gold || 0) * 100;
      const silverValue = (cost.silver || 0);
      const copperInSilver = (cost.copper || 0) * 0.1;
      return goldInSilver + silverValue + copperInSilver;
    } else if (typeof cost === 'number') {
      // Direct value in copper - convert to silver
      // Assuming the number represents copper value
      return cost / 10;
    }

    return 0;
  }

  /**
   * Check if step is complete (optional step)
   */
  isComplete() {
    // Gear step is always considered complete (optional)
    return true;
  }

  /**
   * Reset gear step
   * @protected
   */
  _onReset() {
    this.updateState('gear', [], { skipValidation: true });
    this.updateState('gearCostSpent', 0, { skipValidation: true });
    console.log('Gear step reset');
  }

  /**
   * Step-specific activation logic
   * @protected
   */
  async _onActivate() {
    // Ensure gear data is loaded and ready
    await this.dataService.ensureDataLoaded(['gear']);
  }
}