/**
 * Vagabond Character Builder - Refactored Core Logic
 * Implementation for Foundry VTT v13+ using ApplicationV2 with modular step managers.
 */
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

import { VagabondUIHelper } from '../../../helpers/ui-helper.mjs';
import { ConfigurationSystem } from '../config/configuration-system.mjs';
import { CharacterBuilderStateManager } from '../state/state-manager.mjs';
import { ValidationEngine } from '../state/validation-engine.mjs';
import { CharacterBuilderDataService } from '../services/data-service.mjs';
import { CharacterBuilderUIComponents } from '../ui/ui-components.mjs';

// Import all step managers
import {
  AncestryStepManager,
  ClassStepManager,
  StatsStepManager,
  SpellsStepManager,
  PerksStepManager,
  StartingPacksStepManager,
  GearStepManager
} from '../steps/index.mjs';

export class VagabondCharBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    
    // Initialize configuration system
    this.configSystem = new ConfigurationSystem();
    this._configLoaded = false;
    this._configLoadPromise = null;

    // Initialize data services
    this.dataService = new CharacterBuilderDataService();

    // Initialize state management with validation engine
    this.validationEngine = new ValidationEngine(this.configSystem);
    this.stateManager = new CharacterBuilderStateManager(this.configSystem);
    this.stateManager.validationEngine = this.validationEngine;

    // Initialize UI components
    this.uiComponents = new CharacterBuilderUIComponents(this.configSystem, this.dataService);

    // Step managers will be initialized after configuration loads
    this.stepManagers = null;

    // Set initial step
    this.stateManager.updateState('currentStep', 'ancestry', { skipValidation: true });
    
    // Legacy properties for backward compatibility
    this.openCategories = new Set();
    this.indices = {};
    this.compendiumTypeCache = {}; // Cache which compendiums contain which types
    this.showAllPerks = false; // Toggle for showing all perks regardless of prerequisites

    // Initialize with fallback values, will be replaced by config
    this.statArrays = {
      1: [5, 5, 5, 4, 4, 3], 2: [5, 5, 5, 5, 3, 2], 3: [6, 5, 4, 4, 4, 3],
      4: [6, 5, 5, 4, 3, 2], 5: [6, 6, 4, 3, 3, 3], 6: [6, 6, 4, 4, 3, 2],
      7: [6, 6, 5, 3, 2, 2], 8: [7, 4, 4, 4, 4, 2], 9: [7, 4, 4, 4, 3, 3],
      10: [7, 5, 4, 3, 3, 2], 11: [7, 5, 5, 2, 2, 2], 12: [7, 6, 4, 2, 2, 2]
    };

    // Start loading configuration immediately
    this._configLoadPromise = this._loadConfiguration();
  }

  /**
   * Ensure configuration is loaded and step managers are initialized
   * @private
   */
  async _ensureInitialized() {
    // Wait for configuration to load
    if (!this._configLoaded) {
      await this._configLoadPromise;
    }

    // Initialize step managers if not already done
    if (!this.stepManagers) {
      this.stepManagers = this._initializeStepManagers();
    }
  }

  /**
   * Initialize step managers
   * @private
   */
  _initializeStepManagers() {
    const managers = {
      'ancestry': new AncestryStepManager(this.stateManager, this.dataService, this.configSystem),
      'class': new ClassStepManager(this.stateManager, this.dataService, this.configSystem),
      'stats': new StatsStepManager(this.stateManager, this.dataService, this.configSystem),
      'spells': new SpellsStepManager(this.stateManager, this.dataService, this.configSystem),
      'perks': new PerksStepManager(this.stateManager, this.dataService, this.configSystem),
      'starting-packs': new StartingPacksStepManager(this.stateManager, this.dataService, this.configSystem),
      'gear': new GearStepManager(this.stateManager, this.dataService, this.configSystem)
    };

    // Set up render callback for step managers
    Object.values(managers).forEach(manager => {
      manager.render = () => this.render();
    });

    return managers;
  }

  /**
   * Get current step manager
   * @returns {Promise<BaseStepManager>} Current step manager
   */
  async getCurrentStepManager() {
    await this._ensureInitialized();
    const currentStep = this.stateManager.getCurrentState().currentStep;
    return this.stepManagers[currentStep];
  }

  /**
   * Get current step from state manager
   */
  get currentStep() {
    return this.stateManager.getCurrentState().currentStep;
  }

  /**
   * Set current step through state manager
   */
  set currentStep(value) {
    this.stateManager.updateState('currentStep', value);
  }

  /**
   * Get builder data from state manager
   */
  get builderData() {
    const state = this.stateManager.getCurrentState();
    
    // Map state to legacy builderData format for backward compatibility
    return {
      ancestry: state.selectedAncestry,
      class: state.selectedClass,
      stats: state.assignedStats,
      skills: state.skills,
      perks: state.perks,
      classPerks: state.classPerks || [],
      spells: state.spells,
      startingPack: state.selectedStartingPack,
      gear: state.gear,
      previewUuid: state.previewUuid,
      selectedArrayId: state.selectedArrayId,
      unassignedValues: state.unassignedValues,
      selectedValue: state.selectedValue,
      lastClassForPerks: state.lastClassForPerks
    };
  }

  /**
   * Set builder data through state manager
   */
  set builderData(value) {
    // Map legacy builderData format to state manager format
    const updates = {
      'selectedAncestry': value.ancestry,
      'selectedClass': value.class,
      'assignedStats': value.stats,
      'skills': value.skills,
      'perks': value.perks,
      'classPerks': value.classPerks || [],
      'spells': value.spells,
      'selectedStartingPack': value.startingPack,
      'gear': value.gear,
      'previewUuid': value.previewUuid,
      'selectedArrayId': value.selectedArrayId,
      'unassignedValues': value.unassignedValues,
      'selectedValue': value.selectedValue,
      'lastClassForPerks': value.lastClassForPerks
    };
    
    this.stateManager.updateMultiple(updates, { skipValidation: true });
  }

  /**
   * Load configuration system
   * @private
   */
  async _loadConfiguration() {
    try {
      await this.configSystem.loadConfigurations();
      
      // Update stat arrays from configuration
      const statsConfig = this.configSystem.getStatsConfig();
      if (statsConfig && statsConfig.arrays) {
        this.statArrays = statsConfig.arrays;
      }
      
      this._configLoaded = true;
      console.log('Character Builder configuration loaded successfully');
    } catch (error) {
      console.warn('Failed to load character builder configuration, using fallback values:', error);
      this._configLoaded = false; // Will use hardcoded fallbacks

      // Notify user about configuration loading failure
      ui.notifications.warn(
        'Character Builder: Configuration files could not be loaded. Using default values. Some features may not work as expected.',
        { permanent: false }
      );
    }
  }

  /**
   * Get step order from configuration or fallback
   * @returns {Array<string>} Step order
   */
  get stepsOrder() {
    if (this._configLoaded) {
      return this.configSystem.getStepOrder();
    }
    return VagabondCharBuilder.STEPS_ORDER;
  }

  /**
   * Get window options from configuration or fallback
   * @returns {Object} Window options
   */
  get windowOptions() {
    if (this._configLoaded) {
      const uiConfig = this.configSystem.getUIConfig('layout');
      if (uiConfig && uiConfig.window) {
        return {
          width: uiConfig.window.defaultSize?.width || 1100,
          height: uiConfig.window.defaultSize?.height || 850
        };
      }
    }
    return { width: 1100, height: 850 };
  }

  /**
   * Check if step is complete using step manager
   * @param {string} stepName - Name of step to check
   * @returns {boolean} True if step is complete
   */
  _isStepComplete(stepName) {
    // If step managers aren't initialized yet, use fallback logic
    if (!this.stepManagers) {
      console.log(`[CharBuilder _isStepComplete] Step managers not initialized for ${stepName}, using fallback`);
      // Use fallback logic below
    } else {
      const stepManager = this.stepManagers[stepName];
      if (stepManager) {
        const result = stepManager.isComplete();
        console.log(`[CharBuilder _isStepComplete] ${stepName}: ${result ? '✓ COMPLETE' : '✗ INCOMPLETE'} (from step manager)`);
        return result;
      } else {
        console.log(`[CharBuilder _isStepComplete] No step manager found for ${stepName}, using fallback`);
      }
    }

    // Fallback to original logic if step manager not found
    const completionMap = {
      ancestry: () => !!this.builderData.ancestry,
      class: () => {
        // Check if class is selected AND skills are assigned
        const state = this.stateManager?.getCurrentState();
        if (!state) return !!this.builderData.class;

        const classSelected = !!state.selectedClass;
        const skillGrant = state.skillGrant;

        if (!classSelected) return false;
        if (!skillGrant || !skillGrant.choices) return true; // No skill choices required

        const currentSkills = state.skills || [];
        const guaranteed = skillGrant.guaranteed || [];

        // Validate each choice pool
        for (const choice of skillGrant.choices) {
          const pool = choice.pool.length ? choice.pool : Object.keys(CONFIG.VAGABOND?.skills || {});
          const selectedFromPool = currentSkills.filter(skill =>
            pool.includes(skill) && !guaranteed.includes(skill)
          ).length;

          if (selectedFromPool < choice.count) {
            return false; // Not enough skills from this pool
          }
        }
        return true;
      },
      stats: () => {
        return !!this.builderData.selectedArrayId &&
               Object.values(this.builderData.stats).every(v => v !== null);
      },
      spells: () => true, // Optional step
      perks: () => true, // Optional step
      'starting-packs': () => true, // Optional step
      gear: () => true // Optional step
    };

    const checkFunction = completionMap[stepName];
    const result = checkFunction ? checkFunction() : false;
    console.log(`[CharBuilder _isStepComplete] ${stepName}: ${result ? '✓ COMPLETE' : '✗ INCOMPLETE'} (from fallback)`);
    return result;
  }

  /**
   * Check if all mandatory steps are complete
   * @returns {boolean} True if all mandatory steps are complete
   */
  _areMandatoryStepsComplete() {
    // Check the actual state data directly to avoid step manager issues
    const state = this.stateManager.getCurrentState();

    const ancestryComplete = !!state.selectedAncestry;
    const classComplete = !!state.selectedClass;
    const statsComplete = state.assignedStats && Object.keys(state.assignedStats).length === 6;

    console.log('CharBuilder Finish Validation:', {
      ancestryComplete,
      classComplete,
      statsComplete,
      ancestry: state.selectedAncestry,
      class: state.selectedClass,
      stats: state.assignedStats
    });

    return ancestryComplete && classComplete && statsComplete;
  }

  // Navigation order for steps (fallback)
  static STEPS_ORDER = ['ancestry', 'class', 'stats', 'spells', 'perks', 'starting-packs', 'gear'];

  static DEFAULT_OPTIONS = {
    id: "vagabond-char-builder",
    tag: "form",
    window: { title: "VAGABOND.CharBuilder.Title", resizable: true, icon: "fas fa-scroll" },
    position: { width: 1100, height: 850 },
    // Use new action delegation system
    actions: {
      goToStep: VagabondCharBuilder.prototype._onGoToStep,
      next: VagabondCharBuilder.prototype._onNext,
      prev: VagabondCharBuilder.prototype._onPrev,
      // Delegate all other actions to step managers
      selectOption: VagabondCharBuilder.prototype._delegateToStepManager,
      toggleCategory: VagabondCharBuilder.prototype._onToggleCategory,
      randomize: VagabondCharBuilder.prototype._delegateToStepManager,
      randomizeFullCharacter: VagabondCharBuilder.prototype._onRandomizeFullCharacter,
      pickValue: VagabondCharBuilder.prototype._delegateToStepManager,
      assignStat: VagabondCharBuilder.prototype._delegateToStepManager,
      toggleSkill: VagabondCharBuilder.prototype._delegateToStepManager,
      resetStats: VagabondCharBuilder.prototype._delegateToStepManager,
      addToTray: VagabondCharBuilder.prototype._delegateToStepManager,
      removeFromTray: VagabondCharBuilder.prototype._delegateToStepManager,
      clearTray: VagabondCharBuilder.prototype._delegateToStepManager,
      removeStartingPack: VagabondCharBuilder.prototype._delegateToStepManager,
      finish: VagabondCharBuilder.prototype._onFinish,
      dismissBuilder: VagabondCharBuilder.prototype._onDismissBuilder,
      toggleShowAllPerks: VagabondCharBuilder.prototype._delegateToStepManager
    }
  };

  static PARTS = {
    form: {
      template: "systems/vagabond/templates/apps/char-builder.hbs",
      scrollable: [".directory-list", ".selection-preview", ".reference-column"]
    }
  };

  /** @override */
  _onRender(context, options) {
    const html = this.element;

    // Search input filter
    const searchInput = html.querySelector('.search-input');
    const searchClear = html.querySelector('.search-clear');

    if (searchInput) {
      searchInput.addEventListener('input', (ev) => {
        this._onFilterList(ev, ev.target);
        // Show/hide clear button based on input
        if (searchClear) {
          searchClear.style.display = ev.target.value ? 'flex' : 'none';
        }
      });
    }

    if (searchClear) {
      searchClear.style.display = 'none'; // Hidden by default
      searchClear.addEventListener('click', (ev) => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.dispatchEvent(new Event('input')); // Trigger filter update
          searchInput.focus();
        }
      });
    }

    // Note: Directory items use data-action="selectOption" for click handling
    // This is handled by the action delegation system in DEFAULT_OPTIONS.actions

    // 1. Draggable Chips Initialization (for stats step)
    const chips = html.querySelectorAll('.value-chip');
    chips.forEach(chip => {
        chip.setAttribute('draggable', 'true');

        // Prevent default behavior on mousedown to allow dragging of buttons

        chip.addEventListener('dragstart', (ev) => {
            const target = ev.currentTarget;
            console.log('[CharBuilder] Drag started:', { index: target.dataset.index, value: target.dataset.value });

            const transfer = {
                index: target.dataset.index,
                value: target.dataset.value
            };

            ev.dataTransfer.setData("text/plain", JSON.stringify(transfer));
            ev.dataTransfer.effectAllowed = "move";
            target.classList.add('dragging');
        });

        chip.addEventListener('dragend', (ev) => {
            console.log('[CharBuilder] Drag ended');
            ev.currentTarget.classList.remove('dragging');
        });
    });

    // 2. Drop Zones (Stat Slots) Initialization
    const slots = html.querySelectorAll('.stat-slot');

    slots.forEach(slot => {
        slot.addEventListener('dragover', (ev) => {
            ev.preventDefault(); // Necessary to allow dropping
            ev.dataTransfer.dropEffect = "move";
        });

        slot.addEventListener('dragenter', (ev) => {
            console.log('[CharBuilder] Drag entered slot:', ev.currentTarget.dataset.stat);
            ev.currentTarget.classList.add('drag-over');
        });
        slot.addEventListener('dragleave', (ev) => {
            console.log('[CharBuilder] Drag left slot:', ev.currentTarget.dataset.stat);
            ev.currentTarget.classList.remove('drag-over');
        });

        slot.addEventListener('drop', async (ev) => {
            ev.preventDefault();
            ev.currentTarget.classList.remove('drag-over');
            console.log('[CharBuilder] Drop event on slot:', ev.currentTarget.dataset.stat);

            try {
                const rawData = ev.dataTransfer.getData("text/plain");
                if (!rawData) {
                    console.warn("Vagabond | No data found in drop event.");
                    return;
                }

                const data = JSON.parse(rawData);
                const statKey = ev.currentTarget.dataset.stat;
                console.log('[CharBuilder] Dropping value:', data, 'on stat:', statKey);

                // Ensure step managers are initialized
                await this._ensureInitialized();

                // Delegate to stats step manager
                const statsManager = this.stepManagers['stats'];
                if (statsManager) {
                  console.log('[CharBuilder] Calling _assignStatValue');
                  statsManager._assignStatValue(statKey, parseInt(data.value), parseInt(data.index));
                  // Re-render to show the updated state
                  this.render();
                } else {
                  console.error('[CharBuilder] Stats manager not found!');
                }
            } catch (err) {
                console.error("Vagabond | Drag drop failed with error:", err);
            }
        });
    });

    // 3. Tray drag-drop for perks/spells/gear
    if (['perks', 'spells', 'gear'].includes(this.currentStep)) {
      // Make selection list items draggable
      const selectableItems = html.querySelectorAll('.directory-item[data-uuid]');
      selectableItems.forEach(item => {
        item.setAttribute('draggable', 'true');

        item.addEventListener('dragstart', (ev) => {
          const uuid = ev.currentTarget.dataset.uuid;
          ev.dataTransfer.setData('text/plain', JSON.stringify({ uuid, type: 'item' }));
          ev.dataTransfer.effectAllowed = 'copy';
          ev.currentTarget.classList.add('dragging');
        });

        item.addEventListener('dragend', (ev) => {
          ev.currentTarget.classList.remove('dragging');
        });
      });
      
      // Make tray grid a drop zone
      const trayGrid = html.querySelector('.tray-items-grid');
      if (trayGrid) {
        trayGrid.addEventListener('dragover', (ev) => {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = 'copy';
          trayGrid.classList.add('drag-over');
        });

        trayGrid.addEventListener('dragleave', (ev) => {
          if (ev.currentTarget === ev.target) {
            trayGrid.classList.remove('drag-over');
          }
        });
        
        trayGrid.addEventListener('drop', async (ev) => {
          ev.preventDefault();
          trayGrid.classList.remove('drag-over');

          try {
            const data = JSON.parse(ev.dataTransfer.getData('text/plain'));
            if (data.type === 'item' && data.uuid) {
              // Trigger add to tray through step manager
              await this._ensureInitialized();
              const currentStepManager = await this.getCurrentStepManager();
              if (currentStepManager) {
                await currentStepManager.handleAction('addToTray', {}, { dataset: { uuid: data.uuid } });
                this.render();
              }
            }
          } catch (err) {
            console.error("Vagabond | Drag drop failed:", err);
          }
        });
      }
    }
  }

  /**
   * Filter list based on search input
   * @private
   */
  _onFilterList(event, target) {
    const query = target.value.toLowerCase().trim();
    const html = this.element;
    const items = html.querySelectorAll('.directory-item');

    items.forEach(item => {
      const name = item.querySelector('.item-name')?.textContent?.toLowerCase() || '';
      const description = item.querySelector('.item-description')?.textContent?.toLowerCase() || '';
      const searchText = `${name} ${description}`;

      if (!query || searchText.includes(query)) {
        item.classList.remove('hidden');
      } else {
        item.classList.add('hidden');
      }
    });

    // Update category headers visibility
    const categories = html.querySelectorAll('.category-header');
    categories.forEach(category => {
      const categoryItems = category.parentElement.querySelectorAll('.directory-item');
      const visibleItems = Array.from(categoryItems).filter(item => !item.classList.contains('hidden'));

      if (visibleItems.length === 0) {
        category.classList.add('hidden');
      } else {
        category.classList.remove('hidden');
      }
    });
  }

  /** @override */
  async _prepareContext(options) {
    // Ensure configuration and step managers are initialized
    await this._ensureInitialized();

    // Use UI components to prepare context with step manager integration
    const state = this.stateManager.getCurrentState();
    const currentStepManager = await this.getCurrentStepManager();

    if (!currentStepManager) {
      console.error(`No step manager found for step: ${state.currentStep}`);
      return {};
    }

    // Activate the current step manager
    await currentStepManager.activate();

    // Use UI components to prepare the full context
    try {
      // Pass openCategories for gear step accordion
      const contextOptions = {
        ...options,
        openCategories: this.openCategories
      };
      const context = await this.uiComponents.prepareContext(state, currentStepManager, contextOptions);
      return context;
    } catch (error) {
      console.error('CharBuilder: Error in uiComponents.prepareContext:', error);
      throw error;
    }
  }

  /**
   * Delegate action to current step manager
   * @private
   */
  async _delegateToStepManager(event, target) {
    await this._ensureInitialized();

    const action = target.dataset.action;
    const currentStepManager = await this.getCurrentStepManager();

    if (!currentStepManager) {
      console.error(`No step manager found for current step: ${this.currentStep}`);
      return;
    }

    try {
      await currentStepManager.handleAction(action, event, target);
      this.render();
    } catch (error) {
      console.error(`Error handling action '${action}' in step '${this.currentStep}':`, error);
      ui.notifications.error(`Failed to handle ${action} action`);
    }
  }

  // Navigation action handlers (keep these in core builder)
  
  _onNext(event, target) {
    // Check if current step is complete before advancing
    if (!this._isStepComplete(this.currentStep)) {
      ui.notifications.warn("Complete the current step before advancing.");
      return;
    }

    const stepOrder = this.stepsOrder; // Use configuration-aware getter
    const idx = stepOrder.indexOf(this.currentStep);
    if (idx < stepOrder.length - 1) {
      this.stateManager.updateMultiple({
        'currentStep': stepOrder[idx + 1],
        'previewUuid': null
      });
      this.render();
    }
  }

  _onPrev(event, target) {
    const stepOrder = this.stepsOrder; // Use configuration-aware getter
    const idx = stepOrder.indexOf(this.currentStep);
    if (idx > 0) {
      this.stateManager.updateMultiple({
        'currentStep': stepOrder[idx - 1],
        'previewUuid': null
      });
      this.render();
    }
  }

  _onGoToStep(event, target) {
    const requestedStep = target.dataset.step;
    const steps = this._getStepsContext();
    const targetStep = steps.find(s => s.key === requestedStep);
    
    if (!targetStep) {
      ui.notifications.error("Invalid step requested.");
      return;
    }
    
    if (targetStep.disabled) {
      ui.notifications.warn("Complete previous steps before accessing this step.");
      return;
    }
    
    this.stateManager.updateMultiple({
      'currentStep': requestedStep,
      'previewUuid': null
    });
    this.render();
  }

  _onToggleCategory(event, target) {
    event.preventDefault(); // Prevent default details/summary behavior
    const id = target.dataset.category;

    // Find the details element (parent of the summary)
    const detailsElement = target.closest('details');
    if (!detailsElement) return;

    // Toggle the state
    if (this.openCategories.has(id)) {
      this.openCategories.delete(id);
      detailsElement.removeAttribute('open');
    } else {
      this.openCategories.add(id);
      detailsElement.setAttribute('open', '');
    }
  }

  async _onRandomizeFullCharacter() {
    // Ensure step managers are initialized
    await this._ensureInitialized();

    // Use step managers for full character randomization
    const stepOrder = ['ancestry', 'class', 'stats', 'spells', 'starting-packs'];

    for (const stepName of stepOrder) {
      const stepManager = this.stepManagers[stepName];
      if (stepManager) {
        try {
          if (stepName === 'stats') {
            // Auto-assign stats for full randomization
            await stepManager.randomize(true);
          } else {
            await stepManager.randomize();
          }
        } catch (error) {
          console.warn(`Failed to randomize ${stepName}:`, error);
        }
      }
    }

    // ui.notifications.info("Full character randomized!");
    this.render();
  }

  async _onFinish() {
    // Validate mandatory steps are complete
    if (!this._areMandatoryStepsComplete()) {
      ui.notifications.error("You must complete Ancestry, Class, and Stats before finishing character creation.");
      return;
    }

    // Use existing finish logic but with state manager data
    const state = this.stateManager.getCurrentState();
    
    // Create the final actor data
    const actorData = this.actor.toObject();
    actorData.effects = [];
    if (actorData.system.inventory) actorData.system.inventory.bonusSlots = 0;
    
    // Apply stats
    if (actorData.system.stats) {
      for (const key of Object.keys(actorData.system.stats)) {
        if (actorData.system.stats[key]) {
          actorData.system.stats[key].bonus = 0;
          actorData.system.stats[key].mod = 0;
        }
      }
    }

    // Apply builder stats
    for (const [key, val] of Object.entries(state.assignedStats || {})) {
      if (val !== null && actorData.system.stats[key]) {
        actorData.system.stats[key].value = val;
      }
    }

    // Apply skills
    const skillsToTrain = [...(state.skills || [])];
    const classItemObj = state.selectedClass ? await fromUuid(state.selectedClass) : null;
    if (classItemObj) {
      const guaranteed = classItemObj.system.skillGrant?.guaranteed || [];
      for (const s of guaranteed) {
        if (!skillsToTrain.includes(s)) skillsToTrain.push(s);
      }
    }

    // Train skills
    for (const skill of skillsToTrain) {
      if (actorData.system.skills[skill]) {
        actorData.system.skills[skill].trained = true;
      }
    }

    // Add items
    const allPerks = [...new Set([...(state.classPerks || []), ...(state.perks || [])])];
    const itemUuids = [
      state.selectedAncestry,
      state.selectedClass,
      state.selectedStartingPack,
      ...allPerks,
      ...(state.spells || []),
      ...(state.gear || [])
    ].filter(uuid => uuid);

    const validItems = [];
    for (const uuid of itemUuids) {
      try {
        const item = await fromUuid(uuid);
        if (item) validItems.push(item);
      } catch (error) {
        console.warn(`Failed to load item ${uuid}:`, error);
      }
    }

    if (validItems.length > 0) {
      const itemObjects = validItems.map(item => item.toObject());
      const singletonTypes = ['ancestry', 'class'];
      const typesBeingAdded = new Set(itemObjects.map(i => i.type));

      actorData.items = actorData.items.filter(existingItem => {
        return !singletonTypes.includes(existingItem.type) || !typesBeingAdded.has(existingItem.type);
      });

      actorData.items.push(...itemObjects);
    }

    // Mark character as constructed (hides builder button)
    actorData.system.details.constructed = true;

    // Update the actor
    await this.actor.update(actorData);

    // ui.notifications.info("Character creation completed!");
    this.close();
  }

  async _onDismissBuilder() {
    // Confirm dismissal
    const confirmed = await Dialog.confirm({
      title: "Dismiss Character Builder",
      content: "<p>Are you sure you want to dismiss the character builder? Any unsaved progress will be lost.</p>",
      yes: () => true,
      no: () => false,
      defaultYes: false
    });

    if (confirmed) {
      // Mark builder as dismissed (hides builder button)
      await this.actor.update({
        'system.details.builderDismissed': true
      });

      this.close();
    }
  }

  /**
   * Get steps context for navigation
   * @private
   */
  _getStepsContext() {
    const stepOrder = this.stepsOrder;
    const currentStep = this.currentStep;

    return stepOrder.map((stepKey, i) => {
      let disabled = false;
      if (i > 0) {
        // Can't access step 2+ without completing step 1 (ancestry)
        if (!this._isStepComplete('ancestry')) disabled = true;
        // Can't access step 3+ without completing step 2 (class with skill selection)
        else if (i >= 2 && !this._isStepComplete('class')) disabled = true;
        // Can't access step 4+ without completing step 3 (stats)
        else if (i >= 3 && !this._isStepComplete('stats')) disabled = true;
        // Can't access step 5+ without completing step 4 (perks - mandatory)
        else if (i >= 4 && !this._isStepComplete('perks')) disabled = true;
        // Spells and beyond: allow access (spells optional, gear optional)
      }

      // Special handling for step names
      let stepName;
      if (stepKey === 'starting-packs') {
        stepName = game.i18n.localize('TYPES.Item.starterPack');
      } else {
        stepName = game.i18n.localize(`VAGABOND.CharBuilder.Steps.${stepKey.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('')}`);
      }

      return {
        key: stepKey,
        name: stepName,
        active: stepKey === currentStep,
        complete: this._isStepComplete(stepKey),
        disabled: disabled
      };
    });
  }
}