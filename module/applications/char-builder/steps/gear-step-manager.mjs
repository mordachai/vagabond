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
            uuid: previewUuid,
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

    // Calculate inventory slots
    const inventorySlots = await this._calculateInventorySlots(state, selectedGear);

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
      inventorySlots: inventorySlots,
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

    // Get compendium filter settings
    const settings = game.settings.get('vagabond', 'characterBuilderCompendiums');

    for (const pack of game.packs) {
      // Only include Item compendiums
      if (pack.metadata.type !== 'Item') continue;

      // Filter by GM's compendium settings
      if (!settings.useAll && settings.enabled.length > 0) {
        if (!settings.enabled.includes(pack.collection)) {
          continue; // Skip this compendium - it's not enabled
        }
      } else if (!settings.useAll && settings.enabled.length === 0) {
        continue; // No compendiums enabled - skip all
      }

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
   * Calculate inventory slots (from starting pack + added gear)
   * @private
   */
  async _calculateInventorySlots(state, selectedGear) {
    // Get max inventory slots from character's actual data model
    const previewActor = await this._createPreviewActor(state);
    const maxSlots = previewActor?.system?.inventory?.maxSlots || 0;

    let slotsFromPack = 0;
    let slotsFromGear = 0;

    // Calculate slots from starting pack
    if (state.selectedStartingPack) {
      try {
        const packItem = await fromUuid(state.selectedStartingPack);
        if (packItem && packItem.system.items) {
          const packItems = packItem.system.items || [];

          for (const packItemData of packItems) {
            try {
              const item = await fromUuid(packItemData.uuid);
              if (item) {
                const qty = packItemData.quantity || 1;
                const slots = item.system.baseSlots || 0;
                slotsFromPack += slots * qty;
              }
            } catch (error) {
              console.warn(`Failed to load pack item ${packItemData.uuid}:`, error);
            }
          }
        }
      } catch (error) {
        console.warn('Failed to load starting pack for slots calculation:', error);
      }
    }

    // Calculate slots from manually added gear
    for (const uuid of selectedGear) {
      try {
        const item = await fromUuid(uuid);
        if (item) {
          const slots = item.system.baseSlots || 0;
          slotsFromGear += slots;
        }
      } catch (error) {
        console.warn(`Failed to load gear item ${uuid} for slots calculation:`, error);
      }
    }

    const totalOccupied = slotsFromPack + slotsFromGear;
    const freeSlots = maxSlots - totalOccupied;

    return {
      occupied: totalOccupied,
      max: maxSlots,
      free: freeSlots,
      fromPack: slotsFromPack,
      fromGear: slotsFromGear
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
    const state = this.getCurrentState();
    const startingPackGear = await this._getStartingPackGear(state);

    for (const uuid of selectedGear) {
      try {
        const item = await fromUuid(uuid);
        if (item) {
          const sys = item.system || {};
          const baseCost = sys.baseCost || { gold: 0, silver: 0, copper: 0 };

          // Format cost display
          let costDisplay = '';
          if (baseCost.gold > 0) costDisplay += `${baseCost.gold}g `;
          if (baseCost.silver > 0) costDisplay += `${baseCost.silver}s `;
          if (baseCost.copper > 0) costDisplay += `${baseCost.copper}c`;
          if (!costDisplay) costDisplay = '0s';

          const fromStartingPack = startingPackGear.includes(uuid);

          trayItems.push({
            uuid: uuid,
            name: item.name,
            img: item.img,
            type: item.type,
            qty: 1, // Default quantity
            slots: sys.baseSlots || 0,
            costDisplay: costDisplay.trim(),
            fromStartingPack: fromStartingPack,
            canDelete: !fromStartingPack, // Can't delete items from starting pack
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
   * Get gear UUIDs from selected starting pack
   * @private
   */
  async _getStartingPackGear(state) {
    if (!state.selectedStartingPack) return [];

    try {
      const pack = await fromUuid(state.selectedStartingPack);
      if (!pack) return [];

      const gearList = pack.system.items || [];
      return gearList.map(g => g.uuid).filter(Boolean);
    } catch (error) {
      console.warn('Failed to get starting pack gear:', error);
      return [];
    }
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
   * Create a preview actor to get calculated values
   * @private
   */
  async _createPreviewActor(state) {
    try {
      const trainedSkills = state.skills || [];
      const assignedStats = state.assignedStats || {};

      // Build skills object
      const skillsDefinition = {
        arcana: { stat: 'reason' },
        craft: { stat: 'reason' },
        medicine: { stat: 'reason' },
        brawl: { stat: 'might' },
        finesse: { stat: 'dexterity' },
        sneak: { stat: 'dexterity' },
        detect: { stat: 'awareness' },
        mysticism: { stat: 'awareness' },
        survival: { stat: 'awareness' },
        influence: { stat: 'presence' },
        leadership: { stat: 'presence' },
        performance: { stat: 'presence' }
      };

      const skills = {};
      for (const [key, def] of Object.entries(skillsDefinition)) {
        skills[key] = {
          trained: trainedSkills.includes(key),
          stat: def.stat,
          bonus: 0
        };
      }

      const weaponSkills = {
        melee: { trained: trainedSkills.includes('melee'), stat: 'might', bonus: 0 },
        brawl: { trained: trainedSkills.includes('brawl'), stat: 'might', bonus: 0 },
        finesse: { trained: trainedSkills.includes('finesse'), stat: 'dexterity', bonus: 0 },
        ranged: { trained: trainedSkills.includes('ranged'), stat: 'dexterity', bonus: 0 }
      };

      const actorData = {
        name: 'Preview Character',
        type: 'character',
        system: {
          stats: {
            might: { value: assignedStats.might || 0 },
            dexterity: { value: assignedStats.dexterity || 0 },
            awareness: { value: assignedStats.awareness || 0 },
            reason: { value: assignedStats.reason || 0 },
            presence: { value: assignedStats.presence || 0 },
            luck: { value: assignedStats.luck || 0 }
          },
          skills: skills,
          weaponSkills: weaponSkills
        },
        items: []
      };

      // Apply builder selections
      const itemUuids = [
        state.selectedAncestry,
        state.selectedClass,
        ...(state.perks || []),
        ...(state.classPerks || [])
      ].filter(uuid => uuid);

      if (itemUuids.length > 0) {
        const items = await Promise.all(itemUuids.map(uuid => fromUuid(uuid)));
        actorData.items = items.filter(i => i).map(i => i.toObject());
      }

      const previewActor = new Actor.implementation(actorData);
      previewActor.prepareData();

      return previewActor;
    } catch (error) {
      console.error('Failed to create preview actor:', error);
      return null;
    }
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