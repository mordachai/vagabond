/**
 * Context Component
 * 
 * Handles context preparation for rendering the character builder UI.
 * Optimizes context generation through caching and change detection.
 */

export class ContextComponent {
  constructor(configSystem, dataService) {
    this.configSystem = configSystem;
    this.dataService = dataService;
    
    // Context caching
    this.contextCache = new Map();
    this.lastContextHash = null;
    
    // Change detection for selective updates
    this.contextTrackedPaths = [
      'currentStep',
      'selectedAncestry',
      'selectedClass',
      'assignedStats',
      'skills',
      'perks',
      'classPerks',
      'spells',
      'selectedStartingPack',
      'gear'
    ];
  }

  /**
   * Prepare base context (full generation)
   * @param {object} state - Current builder state
   * @param {object} options - Context options
   * @returns {Promise<object>} Base context
   */
  async prepareBaseContext(state, options = {}) {
    return {
      currentStep: state.currentStep,
      selectedAncestry: state.selectedAncestry,
      selectedClass: state.selectedClass,
      assignedStats: state.assignedStats || {},
      skills: state.skills || [],
      perks: state.perks || [],
      classPerks: state.classPerks || [],
      spells: state.spells || [],
      selectedStartingPack: state.selectedStartingPack,
      gear: state.gear || [],
      previewUuid: state.previewUuid,
      selectedArrayId: state.selectedArrayId,
      unassignedValues: state.unassignedValues || [],
      selectedValue: state.selectedValue,
      lastClassForPerks: state.lastClassForPerks,
      // Additional context
      options: options
    };
  }

  /**
   * Prepare base context with incremental updates
   * @param {object} state - Current builder state
   * @param {object} previousState - Previous builder state for comparison
   * @param {object} options - Context options
   * @returns {Promise<object>} Base context
   */
  async prepareBaseContextIncremental(state, previousState = null, options = {}) {
    try {
      // If no previous state, generate full context
      if (!previousState) {
        return await this.prepareBaseContext(state, options);
      }

      // Check which sections need updates
      const sectionsToUpdate = this._detectContextChanges(state, previousState);
      
      if (sectionsToUpdate.length === 0) {
        // No changes, return cached context
        const contextHash = this._calculateContextHash(state, options);
        if (this.contextCache.has(contextHash)) {
          return this.contextCache.get(contextHash);
        }
      }

      // Get cached context or create new one
      const previousHash = this._calculateContextHash(previousState, options);
      let context = this.contextCache.get(previousHash) || await this._generateBaseContext(previousState, options);

      // Update only changed sections
      for (const section of sectionsToUpdate) {
        switch (section) {
          case 'builderData':
            context.builderData = this._prepareBuilderData(state);
            break;
          case 'steps':
            context.steps = await this._prepareStepsContext(state);
            break;
          case 'stepData':
            context.stepData = await this._prepareCurrentStepData(state);
            break;
          case 'forms':
            context.forms = await this._prepareFormsContext(state);
            break;
          case 'ui':
            context.ui = this._prepareUIContext(state, options);
            break;
          case 'validation':
            context.validation = await this._prepareValidationContext(state);
            break;
        }
      }

      // Update basic properties that always change
      context.currentStep = state.currentStep;

      // Cache the updated context
      const newContextHash = this._calculateContextHash(state, options);
      this.contextCache.set(newContextHash, context);
      this.lastContextHash = newContextHash;

      return context;
      
    } catch (error) {
      console.error('Failed to prepare incremental context:', error);
      return this._getFallbackContext(state);
    }
  }

  /**
   * Detect which context sections need updates
   * @param {object} state - Current state
   * @param {object} previousState - Previous state
   * @returns {array} Array of section names that need updates
   */
  _detectContextChanges(state, previousState) {
    const sectionsToUpdate = [];

    // Check if current step changed
    if (state.currentStep !== previousState.currentStep) {
      sectionsToUpdate.push('steps', 'stepData', 'ui', 'validation');
    }

    // Check if builder data changed
    const builderDataChanged = this._hasBuilderDataChanged(state, previousState);
    if (builderDataChanged) {
      sectionsToUpdate.push('builderData', 'stepData', 'validation');
    }

    // Check if forms data changed
    if (state.characterName !== previousState.characterName ||
        state.notes !== previousState.notes) {
      sectionsToUpdate.push('forms');
    }

    return [...new Set(sectionsToUpdate)]; // Remove duplicates
  }

  /**
   * Check if builder data has changed
   * @param {object} state - Current state
   * @param {object} previousState - Previous state
   * @returns {boolean} True if builder data changed
   */
  _hasBuilderDataChanged(state, previousState) {
    const relevantPaths = [
      'selectedAncestry',
      'selectedClass',
      'assignedStats',
      'skills',
      'perks',
      'classPerks',
      'spells',
      'selectedStartingPack',
      'gear'
    ];

    for (const path of relevantPaths) {
      const currentValue = this._getNestedValue(state, path);
      const previousValue = this._getNestedValue(previousState, path);
      
      if (JSON.stringify(currentValue) !== JSON.stringify(previousValue)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate base context
   * @param {object} state - Current builder state
   * @param {object} options - Context options
   * @returns {Promise<object>} Generated context
   */
  async _generateBaseContext(state, options) {
    const context = {
      // Basic state information
      currentStep: state.currentStep,
      builderData: this._prepareBuilderData(state),
      
      // Step information
      steps: await this._prepareStepsContext(state),
      
      // Current step data
      stepData: await this._prepareCurrentStepData(state),
      
      // Form data
      forms: await this._prepareFormsContext(state),
      
      // UI state
      ui: this._prepareUIContext(state, options),
      
      // Configuration data
      config: this._prepareConfigContext(),
      
      // Validation state
      validation: await this._prepareValidationContext(state)
    };

    return context;
  }

  /**
   * Prepare builder data for context
   * @param {object} state - Current builder state
   * @returns {object} Builder data context
   */
  _prepareBuilderData(state) {
    return {
      ancestry: state.selectedAncestry,
      class: state.selectedClass,
      stats: state.assignedStats || {},
      skills: state.skills || [],
      perks: state.perks || [],
      classPerks: state.classPerks || [],
      spells: state.spells || [],
      startingPack: state.selectedStartingPack,
      gear: state.gear || [],
      previewUuid: state.previewUuid,
      selectedArrayId: state.selectedArrayId,
      unassignedValues: state.unassignedValues || [],
      selectedValue: state.selectedValue,
      lastClassForPerks: state.lastClassForPerks
    };
  }

  /**
   * Prepare steps context
   * @param {object} state - Current builder state
   * @returns {Promise<object>} Steps context
   */
  async _prepareStepsContext(state) {
    // Get step order and configurations
    let stepOrder = [];
    let allStepConfigs = {};

    try {
      stepOrder = this.configSystem.getStepOrder();
      allStepConfigs = this.configSystem.getAllStepConfigs();
    } catch (error) {
      // Configuration not loaded yet, use defaults
      stepOrder = ['ancestry', 'class', 'stats', 'perks', 'spells', 'starting-packs', 'gear'];
      allStepConfigs = {};
    }

    // Build step list with metadata
    const stepsConfig = stepOrder.map(stepName => ({
      name: stepName,
      displayName: allStepConfigs[stepName]?.displayName || stepName,
      ...(allStepConfigs[stepName] || {})
    }));

    const currentStepIndex = stepOrder.indexOf(state.currentStep);

    return {
      all: stepsConfig.map((step, index) => ({
        ...step,
        index,
        isCurrent: step.name === state.currentStep,
        isCompleted: this._isStepCompleted(step.name, state),
        isAccessible: this._isStepAccessible(step.name, state, index),
        isPrevious: index < currentStepIndex,
        isNext: index > currentStepIndex
      })),
      current: stepsConfig[currentStepIndex] || null,
      currentIndex: currentStepIndex,
      total: stepsConfig.length,
      hasNext: currentStepIndex < stepsConfig.length - 1,
      hasPrevious: currentStepIndex > 0,
      nextStep: currentStepIndex < stepsConfig.length - 1 ? stepsConfig[currentStepIndex + 1] : null,
      previousStep: currentStepIndex > 0 ? stepsConfig[currentStepIndex - 1] : null
    };
  }

  /**
   * Prepare current step data
   * @param {object} state - Current builder state
   * @returns {Promise<object>} Current step data
   */
  async _prepareCurrentStepData(state) {
    const stepData = {
      name: state.currentStep,
      options: [],
      selectedItems: [],
      availableItems: [],
      budget: null,
      validation: { isValid: true, errors: [] }
    };

    try {
      // Load step-specific data based on current step
      switch (state.currentStep) {
        case 'ancestry':
          stepData.options = await this._loadAncestryOptions(state);
          stepData.selectedItems = state.selectedAncestry ? [state.selectedAncestry] : [];
          break;
          
        case 'class':
          stepData.options = await this._loadClassOptions(state);
          stepData.selectedItems = state.selectedClass ? [state.selectedClass] : [];
          break;
          
        case 'stats':
          stepData.options = this._prepareStatArrayOptions(state);
          stepData.selectedItems = Object.values(state.assignedStats || {});
          stepData.budget = this._calculateStatBudget(state);
          break;
          
        case 'perks':
          stepData.options = await this._loadPerkOptions(state);
          stepData.selectedItems = [...(state.perks || []), ...(state.classPerks || [])];
          stepData.budget = this._calculatePerkBudget(state);
          break;
          
        case 'spells':
          stepData.options = await this._loadSpellOptions(state);
          stepData.selectedItems = state.spells || [];
          stepData.budget = this._calculateSpellBudget(state);
          break;
          
        case 'starting-packs':
          stepData.options = await this._loadStartingPackOptions(state);
          stepData.selectedItems = state.selectedStartingPack ? [state.selectedStartingPack] : [];
          break;
          
        case 'gear':
          stepData.options = await this._loadGearOptions(state);
          stepData.selectedItems = state.gear || [];
          stepData.budget = this._calculateGearBudget(state);
          break;
      }
    } catch (error) {
      console.error(`Failed to prepare step data for ${state.currentStep}:`, error);
      stepData.validation.isValid = false;
      stepData.validation.errors.push(`Failed to load ${state.currentStep} data`);
    }

    return stepData;
  }

  /**
   * Load ancestry options
   * @param {object} state - Current builder state
   * @returns {Promise<array>} Ancestry options
   */
  async _loadAncestryOptions(state) {
    await this.dataService.ensureDataLoaded(['ancestries']);
    const ancestries = this.dataService.getAllItems('ancestries');
    
    return ancestries.map(ancestry => ({
      ...ancestry,
      selected: state.selectedAncestry === ancestry.id,
      previewing: state.previewUuid === ancestry.id
    }));
  }

  /**
   * Load class options
   * @param {object} state - Current builder state
   * @returns {Promise<array>} Class options
   */
  async _loadClassOptions(state) {
    await this.dataService.ensureDataLoaded(['classes']);
    const classes = this.dataService.getAllItems('classes');
    
    return classes.map(characterClass => ({
      ...characterClass,
      selected: state.selectedClass === characterClass.id,
      previewing: state.previewUuid === characterClass.id
    }));
  }

  /**
   * Prepare stat array options
   * @param {object} state - Current builder state
   * @returns {array} Stat array options
   */
  _prepareStatArrayOptions(state) {
    const statArrays = this.configSystem.getStatArrays();
    
    return Object.entries(statArrays).map(([id, values]) => ({
      id,
      values,
      selected: state.selectedArrayId === id,
      total: values.reduce((sum, val) => sum + val, 0)
    }));
  }

  /**
   * Load perk options
   * @param {object} state - Current builder state
   * @returns {Promise<array>} Perk options
   */
  async _loadPerkOptions(state) {
    await this.dataService.ensureDataLoaded(['perks']);
    const perks = this.dataService.getAllItems('perks');
    
    return perks.map(perk => ({
      ...perk,
      selected: (state.perks || []).includes(perk.id) || (state.classPerks || []).includes(perk.id),
      previewing: state.previewUuid === perk.id,
      isClassPerk: (state.classPerks || []).includes(perk.id),
      meetsPrerequisites: this._checkPerkPrerequisites(perk, state)
    }));
  }

  /**
   * Load spell options
   * @param {object} state - Current builder state
   * @returns {Promise<array>} Spell options
   */
  async _loadSpellOptions(state) {
    // Check if character can cast spells
    if (!state.selectedClass) return [];
    
    await this.dataService.ensureDataLoaded(['classes', 'spells']);
    const characterClass = this.dataService.getClass(state.selectedClass);
    
    if (!characterClass || !characterClass.spellcasting) return [];
    
    const spells = this.dataService.getAllItems('spells');
    
    return spells
      .filter(spell => this._isSpellAvailable(spell, characterClass))
      .map(spell => ({
        ...spell,
        selected: (state.spells || []).includes(spell.id),
        previewing: state.previewUuid === spell.id
      }));
  }

  /**
   * Load starting pack options
   * @param {object} state - Current builder state
   * @returns {Promise<array>} Starting pack options
   */
  async _loadStartingPackOptions(state) {
    await this.dataService.ensureDataLoaded(['startingPacks']);
    const startingPacks = this.dataService.getAllItems('startingPacks');
    
    return startingPacks
      .filter(pack => this._isStartingPackAvailable(pack, state))
      .map(pack => ({
        ...pack,
        selected: state.selectedStartingPack === pack.id,
        previewing: state.previewUuid === pack.id
      }));
  }

  /**
   * Load gear options
   * @param {object} state - Current builder state
   * @returns {Promise<array>} Gear options
   */
  async _loadGearOptions(state) {
    await this.dataService.ensureDataLoaded(['gear']);
    const gear = this.dataService.getAllItems('gear');
    
    return gear.map(item => ({
      ...item,
      selected: (state.gear || []).includes(item.id),
      previewing: state.previewUuid === item.id,
      canAfford: this._canAffordGear(item, state)
    }));
  }

  /**
   * Prepare forms context
   * @param {object} state - Current builder state
   * @returns {Promise<object>} Forms context
   */
  async _prepareFormsContext(state) {
    return {
      characterName: {
        value: state.characterName || '',
        placeholder: 'Enter character name',
        required: false
      },
      notes: {
        value: state.notes || '',
        placeholder: 'Character notes...',
        required: false
      }
    };
  }

  /**
   * Prepare UI context
   * @param {object} state - Current builder state
   * @param {object} options - Context options
   * @returns {object} UI context
   */
  _prepareUIContext(state, options) {
    return {
      theme: options.theme || 'default',
      showPreview: options.showPreview !== false,
      showSidebar: options.showSidebar !== false,
      compactMode: options.compactMode || false,
      debugMode: options.debugMode || false,
      animations: options.animations !== false,
      currentStep: state.currentStep,
      isValid: this._validateCurrentState(state),
      canProceed: this._canProceedToNext(state),
      hasChanges: this._hasUnsavedChanges(state),
      isLoading: false
    };
  }

  /**
   * Prepare configuration context
   * @returns {object} Configuration context
   */
  _prepareConfigContext() {
    let steps = [];
    let statArrays = {};
    let validationRules = {};
    let uiSettings = {};

    try {
      const stepOrder = this.configSystem.getStepOrder();
      const allStepConfigs = this.configSystem.getAllStepConfigs();
      steps = stepOrder.map(stepName => ({
        name: stepName,
        ...(allStepConfigs[stepName] || {})
      }));
      statArrays = this.configSystem.getStatArrays();
      validationRules = this.configSystem.getValidationRules();
      uiSettings = this.configSystem.getUIConfig();
    } catch (error) {
      // Configuration not loaded yet, return empty defaults
      console.debug('Configuration not loaded, using empty defaults');
    }

    return {
      steps,
      statArrays,
      validationRules,
      uiSettings
    };
  }

  /**
   * Prepare validation context
   * @param {object} state - Current builder state
   * @returns {Promise<object>} Validation context
   */
  async _prepareValidationContext(state) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      stepValidation: {}
    };

    // Validate each step
    const steps = ['ancestry', 'class', 'stats', 'perks', 'spells', 'starting-packs', 'gear'];
    
    for (const step of steps) {
      const stepValidation = await this._validateStep(step, state);
      validation.stepValidation[step] = stepValidation;
      
      if (!stepValidation.isValid) {
        validation.isValid = false;
        validation.errors.push(...stepValidation.errors);
      }
      
      validation.warnings.push(...stepValidation.warnings);
    }

    return validation;
  }

  /**
   * Calculate context hash for change detection
   * @param {object} state - Current builder state
   * @param {object} options - Context options
   * @returns {string} Context hash
   */
  _calculateContextHash(state, options) {
    const relevantData = { options };
    
    for (const path of this.contextTrackedPaths) {
      const value = this._getNestedValue(state, path);
      if (value !== undefined) {
        relevantData[path] = value;
      }
    }
    
    return JSON.stringify(relevantData);
  }

  /**
   * Get nested value from object using dot notation
   * @param {object} obj - Object to search
   * @param {string} path - Dot notation path
   * @returns {any} Value at path
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  /**
   * Check if step is completed
   * @param {string} stepName - Step name
   * @param {object} state - Current builder state
   * @returns {boolean} True if step is completed
   */
  _isStepCompleted(stepName, state) {
    switch (stepName) {
      case 'ancestry':
        return !!state.selectedAncestry;
      case 'class':
        return !!state.selectedClass;
      case 'stats':
        return Object.keys(state.assignedStats || {}).length === 6;
      case 'perks':
        return true; // Perks are optional
      case 'spells':
        return true; // Spells are optional or class-dependent
      case 'starting-packs':
        return !!state.selectedStartingPack;
      case 'gear':
        return true; // Additional gear is optional
      default:
        return false;
    }
  }

  /**
   * Check if step is accessible
   * @param {string} stepName - Step name
   * @param {object} state - Current builder state
   * @param {number} stepIndex - Step index
   * @returns {boolean} True if step is accessible
   */
  _isStepAccessible(stepName, state, stepIndex) {
    // Basic prerequisite checking
    switch (stepName) {
      case 'ancestry':
        return true;
      case 'class':
        return !!state.selectedAncestry;
      case 'stats':
        return !!state.selectedClass;
      case 'perks':
        return !!state.selectedClass;
      case 'spells':
        return !!state.selectedClass;
      case 'starting-packs':
        return !!state.selectedClass;
      case 'gear':
        // Gear is accessible after class selection (both starting-packs and gear are optional)
        return !!state.selectedClass;
      default:
        return stepIndex === 0; // First step is always accessible
    }
  }

  /**
   * Validate current state
   * @param {object} state - Current builder state
   * @returns {boolean} True if state is valid
   */
  _validateCurrentState(state) {
    return state && state.currentStep;
  }

  /**
   * Check if can proceed to next step
   * @param {object} state - Current builder state
   * @returns {boolean} True if can proceed
   */
  _canProceedToNext(state) {
    return this._isStepCompleted(state.currentStep, state);
  }

  /**
   * Check if there are unsaved changes
   * @param {object} state - Current builder state
   * @returns {boolean} True if there are unsaved changes
   */
  _hasUnsavedChanges(state) {
    // This would typically compare against a saved state
    // For now, return false as we don't have persistence
    return false;
  }

  /**
   * Validate a specific step
   * @param {string} stepName - Step name
   * @param {object} state - Current builder state
   * @returns {Promise<object>} Step validation result
   */
  async _validateStep(stepName, state) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Add step-specific validation logic here
    // This is a simplified version
    
    return validation;
  }

  /**
   * Check perk prerequisites
   * @param {object} perk - Perk data
   * @param {object} state - Current builder state
   * @returns {boolean} True if prerequisites are met
   */
  _checkPerkPrerequisites(perk, state) {
    // Simplified prerequisite checking
    if (!perk.prerequisites || perk.prerequisites.length === 0) {
      return true;
    }
    
    // This would need more sophisticated logic
    return true;
  }

  /**
   * Check if spell is available for the character's class
   * @param {object} spell - Spell data
   * @param {object} characterClass - Character class data
   * @returns {boolean} True if spell is available
   */
  _isSpellAvailable(spell, characterClass) {
    // Simplified availability check
    if (!spell.classes || spell.classes.length === 0) {
      return true; // Available to all classes
    }
    
    return spell.classes.includes(characterClass.name.toLowerCase());
  }

  /**
   * Check if starting pack is available for the character
   * @param {object} pack - Starting pack data
   * @param {object} state - Current builder state
   * @returns {boolean} True if pack is available
   */
  _isStartingPackAvailable(pack, state) {
    // Simplified availability check
    if (!pack.class) {
      return true; // Available to all classes
    }
    
    if (!state.selectedClass) {
      return false;
    }
    
    return pack.class === state.selectedClass;
  }

  /**
   * Check if character can afford gear item
   * @param {object} item - Gear item
   * @param {object} state - Current builder state
   * @returns {boolean} True if can afford
   */
  _canAffordGear(item, state) {
    // Simplified affordability check
    const budget = this._calculateGearBudget(state);
    const itemCost = item.cost || 0;
    
    return budget.remaining >= itemCost;
  }

  /**
   * Calculate stat budget
   * @param {object} state - Current builder state
   * @returns {object} Stat budget
   */
  _calculateStatBudget(state) {
    const total = 27; // Point buy total
    const spent = Object.values(state.assignedStats || {}).reduce((sum, val) => sum + val - 8, 0);
    
    return {
      total,
      spent,
      remaining: total - spent
    };
  }

  /**
   * Calculate perk budget
   * @param {object} state - Current builder state
   * @returns {object} Perk budget
   */
  _calculatePerkBudget(state) {
    // This would be calculated based on class and level
    const total = 2; // Example: 2 perk points at level 1
    const spent = (state.perks || []).length; // Assuming 1 point per perk
    
    return {
      total,
      spent,
      remaining: total - spent
    };
  }

  /**
   * Calculate spell budget
   * @param {object} state - Current builder state
   * @returns {object} Spell budget
   */
  _calculateSpellBudget(state) {
    // This would be calculated based on class spellcasting
    const total = 4; // Example: 4 spells known at level 1
    const spent = (state.spells || []).length;
    
    return {
      total,
      spent,
      remaining: total - spent
    };
  }

  /**
   * Calculate gear budget
   * @param {object} state - Current builder state
   * @returns {object} Gear budget
   */
  _calculateGearBudget(state) {
    const total = 300; // Example: 300 gold pieces
    const spent = 0; // Would calculate from selected gear
    
    return {
      total,
      spent,
      remaining: total - spent
    };
  }

  /**
   * Get fallback context in case of errors
   * @param {object} state - Current builder state
   * @returns {object} Fallback context
   */
  _getFallbackContext(state) {
    return {
      error: true,
      currentStep: state?.currentStep || 'ancestry',
      builderData: {},
      steps: { all: [], current: null, total: 0 },
      stepData: { name: state?.currentStep || 'ancestry', options: [] },
      forms: {},
      ui: { isValid: false, canProceed: false },
      config: {},
      validation: { isValid: false, errors: ['Context generation failed'] }
    };
  }

  /**
   * Clear context cache
   */
  clearCache() {
    this.contextCache.clear();
    this.lastContextHash = null;
  }

  /**
   * Get context component statistics
   * @returns {object} Component statistics
   */
  getStats() {
    return {
      cacheSize: this.contextCache.size,
      lastContextHash: this.lastContextHash,
      trackedPaths: this.contextTrackedPaths.length
    };
  }
}