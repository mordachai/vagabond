/**
 * Starting Packs Step Manager - Handles starting pack selection logic
 */
import { BaseStepManager } from './base-step-manager.mjs';

export class StartingPacksStepManager extends BaseStepManager {
  constructor(stateManager, dataService, configSystem) {
    super(stateManager, dataService, configSystem);
    
    // Define action handlers for starting packs step
    this.actionHandlers = {
      'selectOption': this._onSelectOption.bind(this),
      'addToTray': this._onAddToTray.bind(this),
      'removeStartingPack': this._onRemoveStartingPack.bind(this),
      'randomize': this._onRandomize.bind(this)
    };
    
    // Required data for starting packs step
    this.requiredData = ['startingPacks'];
  }

  /**
   * Step name identifier
   */
  get stepName() {
    return 'starting-packs';
  }

  /**
   * Get state paths managed by this step
   * @protected
   */
  _getStatePaths() {
    return ['selectedStartingPack', 'previewUuid'];
  }

  /**
   * Prepare starting packs-specific context data
   * @protected
   */
  async _prepareStepSpecificContext(state) {
    const availablePacks = await this._loadStartingPackOptions();
    const selectedPack = state.selectedStartingPack;
    const previewUuid = state.previewUuid;
    
    // Get selected item details if available
    let selectedItem = null;
    if (selectedPack) {
      try {
        const item = await fromUuid(selectedPack);
        if (item) {
          // Enrich the description for display
          const enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(item.system.description || '', {
            async: true,
            secrets: false,
            relativeTo: item
          });

          selectedItem = {
            ...item.toObject(),
            enrichedDescription: enrichedDescription,
            items: item.system.items || []
          };
        }
      } catch (error) {
        console.warn('Failed to load selected starting pack:', error);
      }
    }

    // Get preview item details if different from selected
    let previewItem = null;
    if (previewUuid && previewUuid !== selectedPack) {
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
            items: item.system.items || []
          };
        }
      } catch (error) {
        console.error('Failed to load preview starting pack:', error);
      }
    } else {
    }

    // Get starting pack items for display (prefer preview over selected for display)
    const packToShow = previewUuid || selectedPack;
    const startingPackItems = await this._getStartingPackItems(packToShow);

    const context = {
      availableOptions: availablePacks,
      selectedItem: selectedItem,
      previewItem: previewItem,
      startingPackItems: startingPackItems,
      hasSelection: !!selectedPack,
      showTray: false, // Starting packs don't use Add to Tray button
      showRandomButton: true,
      instruction: (!selectedPack && !previewUuid) ?
        game.i18n.localize('TYPES.Item.starterPack') : null
    };

    return context;
  }

  /**
   * Load available starting pack options
   * @private
   */
  async _loadStartingPackOptions() {
    await this.dataService.ensureDataLoaded(['startingPacks']);
    
    const packs = this.dataService.getFilteredItems('startingPacks', {});
    
    // Sort packs alphabetically
    const sortedPacks = packs.sort((a, b) => a.name.localeCompare(b.name));
    
    return sortedPacks.map(pack => ({
      ...pack,
      uuid: pack.uuid,
      name: pack.name,
      img: pack.img,
      type: 'starterPack',
      selected: false // Will be set during context preparation
    }));
  }

  /**
   * Get starting pack items with details
   * @private
   */
  async _getStartingPackItems(packUuid) {
    if (!packUuid) return null;

    try {
      const packItem = await fromUuid(packUuid);
      if (!packItem) return null;

      const packItems = packItem.system.items || [];
      const itemDetails = [];

      for (const packItemData of packItems) {
        try {
          const item = await fromUuid(packItemData.uuid);
          if (item) {
            const qty = packItemData.quantity || 1;
            const slots = item.system.baseSlots || 0;

            // Get cost - handle both direct cost and currency object formats
            let cost = 0;
            if (typeof item.system.cost === 'number') {
              cost = item.system.cost;
            } else if (item.system.cost && typeof item.system.cost === 'object') {
              // Handle currency object format {gold: X, silver: Y, copper: Z}
              const costObj = item.system.cost;
              cost = (costObj.gold || 0) * 100 + (costObj.silver || 0) * 10 + (costObj.copper || 0);
            } else if (item.system.currency) {
              // Alternative currency format
              const curr = item.system.currency;
              cost = (curr.gold || 0) * 100 + (curr.silver || 0) * 10 + (curr.copper || 0);
            }

            // Format cost display
            const gold = Math.floor(cost / 100);
            const silver = Math.floor((cost % 100) / 10);
            const copper = cost % 10;
            let costDisplay = '';
            if (gold > 0) costDisplay += `${gold}g `;
            if (silver > 0) costDisplay += `${silver}s `;
            if (copper > 0) costDisplay += `${copper}c`;
            if (!costDisplay) costDisplay = '0c';

            itemDetails.push({
              uuid: packItemData.uuid,
              name: item.name,
              img: item.img,
              type: item.type,
              qty: qty,
              slots: slots,
              costDisplay: costDisplay.trim(),
              description: item.system.description || ''
            });
          }
        } catch (error) {
          console.warn(`Failed to load pack item ${packItemData.uuid}:`, error);
          // Add placeholder for missing item
          itemDetails.push({
            uuid: packItemData.uuid,
            name: 'Unknown Item',
            img: 'icons/svg/mystery-man.svg',
            type: 'unknown',
            qty: packItemData.quantity || 1,
            slots: 0,
            costDisplay: '0c',
            description: 'Item could not be loaded'
          });
        }
      }

      // Calculate starting budget from currency object
      const curr = packItem.system.currency || {};
      const startingSilver = (curr.gold || 0) * 100 + (curr.silver || 0) + (curr.copper || 0) / 10;

      return {
        packName: packItem.name,
        startingSilver: startingSilver,
        items: itemDetails,
        totalItems: itemDetails.reduce((sum, item) => sum + item.qty, 0)
      };
    } catch (error) {
      console.error('Failed to get starting pack items:', error);
      return null;
    }
  }

  /**
   * Handle starting pack selection - directly selects the pack
   * @private
   */
  async _onSelectOption(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    try {
      // Validate the starting pack exists
      const item = await fromUuid(uuid);
      if (!item || item.type !== 'starterPack') {
        ui.notifications.error('Invalid starting pack selection');
        return;
      }

      // Directly select the pack (no "Add to Tray" needed)
      this.updateState('selectedStartingPack', uuid);
      this.updateState('previewUuid', uuid);

      ui.notifications.info(`Selected starting pack: ${item.name}`);
    } catch (error) {
      console.error('Failed to select starting pack:', error);
      ui.notifications.error('Failed to select starting pack');
    }
  }

  /**
   * Handle adding starting pack to tray (confirming selection)
   * @private
   */
  async _onAddToTray(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    try {
      // Validate the starting pack exists
      const item = await fromUuid(uuid);
      if (!item || item.type !== 'starterPack') {
        ui.notifications.error('Invalid starting pack selection');
        return;
      }

      // Update state with selected starting pack
      this.updateState('selectedStartingPack', uuid);
      this.updateState('previewUuid', uuid);
      
      
    } catch (error) {
      console.error('Failed to select starting pack:', error);
      ui.notifications.error('Failed to select starting pack');
    }
  }

  /**
   * Handle removing starting pack
   * @private
   */
  async _onRemoveStartingPack(event, target) {
    const state = this.getCurrentState();

    if (!state.selectedStartingPack) {
      console.warn('No starting pack selected to remove');
      ui.notifications.warn('No starting pack selected');
      return;
    }

    try {
      console.log('Removing starting pack:', state.selectedStartingPack);

      // Clear both selected pack and preview
      this.updateState('selectedStartingPack', null);
      this.updateState('previewUuid', null);

      ui.notifications.info('Starting pack removed');

      // Trigger re-render through parent (delegator will call this.render())
      return true; // Signal successful removal
    } catch (error) {
      console.error('Failed to remove starting pack:', error);
      ui.notifications.error('Failed to remove starting pack');
      throw error; // Re-throw so delegator knows there was an error
    }
  }

  /**
   * Handle starting pack randomization
   * @private
   */
  async _onRandomize(event, target) {
    await this.randomize();
  }

  /**
   * Randomize starting pack selection
   */
  async randomize() {
    const options = await this._loadStartingPackOptions();
    if (options.length === 0) {
      ui.notifications.warn('No starting packs available for randomization');
      return;
    }

    const randomConfig = this.configSystem.getRandomizationConfig('starting-packs');
    let selectedPack;

    if (randomConfig && randomConfig.method === 'class_appropriate') {
      selectedPack = await this._selectClassAppropriatePack(options, randomConfig);
    } else {
      // Fallback to equal distribution
      const randomIndex = Math.floor(Math.random() * options.length);
      selectedPack = options[randomIndex];
    }

    if (selectedPack) {
      this.updateState('selectedStartingPack', selectedPack.uuid);
      this.updateState('previewUuid', selectedPack.uuid);
      
    }
  }

  /**
   * Select class-appropriate starting pack
   * @private
   */
  async _selectClassAppropriatePack(options, config) {
    const state = this.getCurrentState();
    
    if (!state.selectedClass) {
      // No class selected, use equal distribution
      const randomIndex = Math.floor(Math.random() * options.length);
      return options[randomIndex];
    }

    try {
      const classItem = await fromUuid(state.selectedClass);
      if (!classItem) {
        const randomIndex = Math.floor(Math.random() * options.length);
        return options[randomIndex];
      }

      const className = classItem.name.toLowerCase();
      const classWeights = config.classWeights?.[className];

      if (classWeights) {
        // Use weighted selection based on class
        const weightedPool = [];
        
        for (const pack of options) {
          const packName = pack.name.toLowerCase().replace(/\s+/g, '-');
          const weight = classWeights[packName] || 0.1; // Default low weight
          const count = Math.round(weight * 100); // Convert to integer weight
          
          for (let i = 0; i < count; i++) {
            weightedPool.push(pack);
          }
        }

        if (weightedPool.length > 0) {
          const randomIndex = Math.floor(Math.random() * weightedPool.length);
          return weightedPool[randomIndex];
        }
      }

      // Fallback to equal distribution
      const randomIndex = Math.floor(Math.random() * options.length);
      return options[randomIndex];
    } catch (error) {
      console.error('Failed to select class-appropriate pack:', error);
      const randomIndex = Math.floor(Math.random() * options.length);
      return options[randomIndex];
    }
  }

  /**
   * Check if step is complete (optional step)
   */
  isComplete() {
    // Starting packs step is always considered complete (optional)
    return true;
  }

  /**
   * Reset starting packs step
   * @protected
   */
  _onReset() {
    this.updateState('selectedStartingPack', null, { skipValidation: true });
    console.log('Starting packs step reset');
  }

  /**
   * Step-specific activation logic
   * @protected
   */
  async _onActivate() {
    // Ensure starting pack data is loaded and ready
    await this.dataService.ensureDataLoaded(['startingPacks']);
  }
}