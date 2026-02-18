/**
 * Ancestry Step Manager - Handles ancestry selection logic
 */
import { BaseStepManager } from './base-step-manager.mjs';

export class AncestryStepManager extends BaseStepManager {
  constructor(stateManager, dataService, configSystem) {
    super(stateManager, dataService, configSystem);
    
    // Define action handlers for ancestry step
    this.actionHandlers = {
      'selectOption': this._onSelectOption.bind(this),
      'addToTray': this._onAddToTray.bind(this),
      'randomize': this._onRandomize.bind(this)
    };
    
    // Required data for ancestry step
    this.requiredData = ['ancestries'];
  }

  /**
   * Step name identifier
   */
  get stepName() {
    return 'ancestry';
  }

  /**
   * Get state paths managed by this step
   * @protected
   */
  _getStatePaths() {
    return ['selectedAncestry', 'previewUuid'];
  }

  /**
   * Prepare ancestry-specific context data
   * @protected
   */
  async _prepareStepSpecificContext(state) {
    const availableAncestries = await this._loadAncestryOptions();
    const selectedAncestry = state.selectedAncestry;
    const previewUuid = state.previewUuid;


    // Mark items as selected/previewing for template
    const markedOptions = availableAncestries.map(ancestry => ({
      ...ancestry,
      selected: ancestry.uuid === selectedAncestry,
      previewing: ancestry.uuid === previewUuid
    }));
    
    // Get selected item details if available
    let selectedItem = null;
    if (selectedAncestry) {
      try {
        const item = await fromUuid(selectedAncestry);
        if (item) {
          // Enrich the description for display
          const enrichedDescription = await foundry.applications.ux.TextEditor.enrichHTML(item.system.description || '', {
            async: true,
            secrets: false,
            relativeTo: item
          });

          selectedItem = {
            ...item.toObject(),
            traits: item.system.traits || [],
            size: item.system.size || 'medium',
            ancestryType: item.system.ancestryType || 'Humanlike',
            enrichedDescription: enrichedDescription
          };
        }
      } catch (error) {
        console.warn('Failed to load selected ancestry:', error);
      }
    }

    // Get preview item details if different from selected
    let previewItem = null;

    if (previewUuid && previewUuid !== selectedAncestry) {
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
            traits: item.system.traits || [],
            size: item.system.size || 'medium',
            ancestryType: item.system.ancestryType || 'Humanlike',
            enrichedDescription: enrichedDescription
          };
        }
      } catch (error) {
        console.warn('Failed to load preview ancestry:', error);
      }
    } else {
    }

    const context = {
      availableOptions: markedOptions,
      selectedItem: selectedItem,
      previewItem: previewItem,
      hasSelection: !!selectedAncestry,
      showRandomButton: true,
      showFullRandomButton: true,
      useTripleColumn: !!(selectedItem || previewItem), // Show reference column when item is selected/previewed
      instruction: (!selectedAncestry && !previewUuid) ?
        game.i18n.localize('VAGABOND.CharBuilder.Instructions.Ancestry') : null
    };

    return context;
  }

  /**
   * Load available ancestry options
   * @private
   */
  async _loadAncestryOptions() {
    await this.dataService.ensureDataLoaded(['ancestries']);
    
    const ancestries = this.dataService.getFilteredItems('ancestries', {});
    
    // Sort ancestries alphabetically
    const sortedAncestries = ancestries.sort((a, b) => a.name.localeCompare(b.name));
    
    return sortedAncestries.map(ancestry => ({
      ...ancestry,
      uuid: ancestry.uuid,
      name: ancestry.name,
      img: ancestry.img,
      type: 'ancestry',
      selected: false // Will be set during context preparation
    }));
  }

  /**
   * Handle ancestry selection (direct selection, no tray)
   * @private
   */
  async _onSelectOption(event, target) {
    const uuid = target.dataset.uuid;

    if (!uuid) {
      console.warn('No uuid found on target');
      return;
    }

    try {
      // Validate the ancestry exists
      const item = await fromUuid(uuid);
      if (!item || item.type !== 'ancestry') {
        ui.notifications.error('Invalid ancestry selection');
        return;
      }

      // For ancestry, directly select (no preview/tray system)
      // Reset user-selected perks since ancestry affects perk grants
      const prevAncestry = this.getCurrentState().selectedAncestry;
      if (prevAncestry && prevAncestry !== uuid) {
        this.updateState('perks', [], { skipValidation: true });
      }
      this.updateState('selectedAncestry', uuid, { skipValidation: true });
      this.updateState('previewUuid', uuid, { skipValidation: true });

      if (this.render) {
        this.render();
      }
    } catch (error) {
      console.error('Failed to select ancestry:', error);
      ui.notifications.error('Failed to select ancestry');
    }
  }

  /**
   * Handle adding ancestry to tray (confirming selection)
   * @private
   */
  async _onAddToTray(event, target) {
    const uuid = target.dataset.uuid;
    if (!uuid) return;

    try {
      // Validate the ancestry exists
      const item = await fromUuid(uuid);
      if (!item || item.type !== 'ancestry') {
        ui.notifications.error('Invalid ancestry selection');
        return;
      }

      // Update state with selected ancestry
      this.updateState('selectedAncestry', uuid);
      this.updateState('previewUuid', uuid);
      
      
    } catch (error) {
      console.error('Failed to select ancestry:', error);
      ui.notifications.error('Failed to select ancestry');
    }
  }

  /**
   * Handle ancestry randomization
   * @private
   */
  async _onRandomize(event, target) {
    await this.randomize();
  }

  /**
   * Randomize ancestry selection
   */
  async randomize() {
    const options = await this._loadAncestryOptions();
    if (options.length === 0) {
      ui.notifications.warn('No ancestries available for randomization');
      return;
    }

    const randomConfig = this.configSystem.getRandomizationConfig('ancestry');
    let selectedAncestry;

    if (randomConfig && randomConfig.method === 'weighted_random') {
      selectedAncestry = this._selectWeightedRandom(options, randomConfig);
    } else {
      // Fallback to equal distribution
      const randomIndex = Math.floor(Math.random() * options.length);
      selectedAncestry = options[randomIndex];
    }

    if (selectedAncestry) {
      this.updateState('selectedAncestry', selectedAncestry.uuid);
      this.updateState('previewUuid', selectedAncestry.uuid);
      
    }
  }

  /**
   * Select ancestry using weighted randomization
   * @private
   */
  _selectWeightedRandom(options, config) {
    // For now, implement equal weighting as specified in config
    // This can be extended to support actual weighted distribution
    if (config.weights === 'equal') {
      const randomIndex = Math.floor(Math.random() * options.length);
      return options[randomIndex];
    }

    // Future: implement actual weighted selection based on config
    // For now, fallback to equal distribution
    const randomIndex = Math.floor(Math.random() * options.length);
    return options[randomIndex];
  }

  /**
   * Reset ancestry step
   * @protected
   */
  _onReset() {
    // Clear any step-specific caches or state
  }

  /**
   * Step-specific activation logic
   * @protected
   */
  async _onActivate() {
    // Ensure ancestry data is loaded and ready
    await this.dataService.ensureDataLoaded(['ancestries']);
  }
}